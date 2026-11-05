/**
 * StudyPilot · AI Chat page controller (BYOK).
 *
 * Wires: provider management, key handling (auto-persisted encrypted in
 * this browser — passphrase asked once, with the key), streaming chat
 * with cancel/regenerate/copy/save-as-note, cost estimates, and disclosures.
 *
 * Security: model output is rendered ONLY through renderMarkdown() (which
 * escapes first). User/provider strings go through esc() or textContent.
 * Keys never touch the DOM except inside password inputs, never logged.
 */
import { BRAND } from "./config.js";
import { esc, initTheme, injectBrand, toast } from "./ui.js";
import { openStorage } from "./storage.js";
import { renderMarkdown } from "./markdown.js";
import { AIError } from "./ai/adapters.js";
import { ProviderStore, BUILTINS, builtinById, formatTestResult } from "./ai/providers.js";
import { loadLastUsed, saveLastUsed, clearLastUsed } from "./ai/lastused.js";
import { streamChat } from "./ai/chat.js";
import { estimateCost, formatUsd } from "./ai/costs.js";
import { SUGGESTION_CHIPS, sessionTitle, filterSessions, groupSessions, modelForProviderChange, missingKeyMessage, modelsForProvider, usableProviders, validateMaxTokens, accordionToggle, nextAddForm, providerReadiness, modelSuggestions, chatModelListScope } from "./ai/chatui.js";

const $ = (id) => document.getElementById(id);

/* First-render restore of the last-used provider/model (see renderChatSelectors). */
let lastUsedApplied = false;

const state = {
  storage: null,
  providers: null,
  convId: null,
  conv: null,
  streaming: false,
  aborter: null,
  editingProvider: null,
  searchQuery: "",
  // Step 3 Settings redesign (all session-only, never persisted):
  // id of the one expanded provider row (accordion — null when all are
  // collapsed), which "+" add-form is open (null | "provider" | "model"),
  // whether the "+" menu is open, which provider's inline model-edit row
  // is being renamed ({ providerId, modelId } | null), which provider's
  // inline add-model form is open (provider id | null), the discovered
  // models shown in the Add Model form, and what the Chat Model guidance
  // button should do ("add-provider" | "add-model" | "add-key" | null).
  expandedProviderId: null,
  addForm: null,
  addMenuOpen: false,
  editingModel: null,
  addingModelFor: null,
  addModelDiscovered: [],
  chatGuidanceAction: null,
};

const SYSTEM_PROMPT =
  "You are a helpful study assistant inside " +
  BRAND.name +
  ", a free student productivity toolkit. Explain clearly, show your working, and keep answers focused on studying and learning.";

/* ============================== init ============================== */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  initTheme();
  injectBrand();
  wireShell();
  state.storage = await openStorage();
  state.providers = new ProviderStore(state.storage);
  await state.providers.load();
  renderBuiltinSelect();
  renderProviders();
  await refreshConversations();
  wireComposer();
  wireAddForm();
  wireAddMenu();
  $("gotoSettingsBtn").addEventListener("click", openSettings);
  updateChatAvailability();
  renderMessages(); // greeting empty state when no conversation is selected
  // Deep links into Settings: the AI Tools page links to /ai-chat/#providers
  // ("Manage providers & keys"). The old Providers tab is gone, so open the
  // settings slide-over instead of landing on the page with it closed.
  if (location.hash === "#providers" || location.hash === "#settings") {
    openSettings();
  }
}

/* ======================= app shell: sidebar + settings ======================= */

function openSettings() {
  $("settingsPanel").hidden = false;
  $("settingsBackdrop").hidden = false;
  $("closeSettingsBtn").focus();
}

function closeSettings() {
  $("settingsPanel").hidden = true;
  $("settingsBackdrop").hidden = true;
  $("settingsBtn").focus();
}

function openSidebar() {
  $("sidebar").classList.add("open");
  $("sidebarBackdrop").hidden = false;
  $("sidebarBtn").setAttribute("aria-expanded", "true");
  $("sidebarBtn").setAttribute("aria-label", "Close conversation list");
}

function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebarBackdrop").hidden = true;
  $("sidebarBtn").setAttribute("aria-expanded", "false");
  $("sidebarBtn").setAttribute("aria-label", "Open conversation list");
}

function wireShell() {
  $("settingsBtn").addEventListener("click", openSettings);
  $("closeSettingsBtn").addEventListener("click", closeSettings);
  $("settingsBackdrop").addEventListener("click", closeSettings);
  $("activeModelLine").addEventListener("click", openSettings);
  $("sidebarBtn").addEventListener("click", () => {
    if ($("sidebar").classList.contains("open")) closeSidebar();
    else openSidebar();
  });
  $("sidebarBackdrop").addEventListener("click", closeSidebar);
  $("convSearch").addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    refreshConversations();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.addMenuOpen) {
      // Close the "+" menu first; a second Escape closes Settings.
      e.preventDefault();
      closeAddMenu();
    } else if (e.key === "Escape" && !$("settingsPanel").hidden) {
      e.preventDefault();
      closeSettings();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        $("convSearch").focus();
      }
    }
  });
}

/** Small "provider · model" line under the composer; opens Settings. */
function updateActiveModelLine() {
  const el = $("activeModelLine");
  const configs = state.providers ? state.providers.list() : [];
  if (!configs.length) {
    el.textContent = "No provider yet · open Settings to add one";
    return;
  }
  const usable = usableProviders(configs);
  const c = state.providers.get($("chatProvider").value) || usable[0] || configs[0];
  const model = $("chatModel").value.trim();
  el.textContent = model ? `${c.name} · ${model}` : `${c.name} · choose a model in Settings`;
}

/* ======================= providers & keys UI ======================= */

function corsBadge(cors) {
  if (cors === "supported") return '<span class="badge ok">Direct browser access: yes</span>';
  if (cors === "blocked") return '<span class="badge warn">Direct browser access: blocked</span>';
  return '<span class="badge">Direct browser access: unverified</span>';
}

function renderProviders() {
  syncPassphraseFields();
  const list = $("providerList");
  const configs = state.providers.list();
  if (!configs.length) {
    list.innerHTML = '<div class="empty"><p>No providers yet. Use the + button above to add one.</p></div>';
    return;
  }
  list.innerHTML = "";
  for (const c of configs) {
    const b = builtinById(c.builtinId) || {};
    const expanded = state.expandedProviderId === c.id;
    const card = document.createElement("div");
    card.className = "card provider-row";
    card.dataset.providerId = c.id;
    const keyState = state.providers.hasKey(c.id)
      ? '<span class="badge ok">Key saved</span>'
      : '<span class="badge">No key set</span>';
    // Compact status for the collapsed row: verified / failed / untested.
    const shortTest = !c.lastTest
      ? ""
      : c.lastTest.ok
        ? '<span class="provider-test ok">Connected</span>'
        : '<span class="provider-test bad">Test failed</span>';
    const initial = (c.name.trim()[0] || "?").toUpperCase();
    // Persisted last-test line (RC-2): survives re-renders, so a verified
    // provider stays visibly verified. Empty when never tested.
    const testLine = formatTestResult(c.lastTest || null);
    const testLineHtml =
      `<p class="hint" data-role="test-result" aria-live="polite"` +
      (c.lastTest && c.lastTest.ok ? ` style="color: var(--ok, #15803d)"` : "") +
      `>${esc(testLine)}</p>`;
    // Key area: the passphrase field shows ONLY while no device key exists
    // yet (keyStoreState "needs-passphrase") — it is asked once, together
    // with the key, and never again on this browser. Once a device key
    // exists ("ready") the hint says so; when encrypted storage is
    // unavailable the honest note replaces the passphrase field.
    const keyStoreState = state.providers.keyStoreState;
    const passFieldHtml =
      keyStoreState === "needs-passphrase"
        ? `<div class="field" style="max-width: 420px;">
             <label for="pass-${esc(c.id)}">Encryption passphrase</label>
             <input type="password" id="pass-${esc(c.id)}" autocomplete="new-password" placeholder="At least 8 characters" />
             <p class="hint">Asked once. Your key is encrypted with this passphrase and stored on this device. You will not be asked again on this browser.</p>
           </div>`
        : "";
    const keyHintHtml =
      keyStoreState === "unavailable"
        ? `<p class="hint">${esc(state.providers.keyStoreNote)}</p>`
        : `<p class="hint">Stored encrypted in this browser.</p>`;

    card.innerHTML =
      `<button type="button" class="provider-row-head" data-act="toggle" data-id="${esc(c.id)}" aria-expanded="${expanded}" aria-controls="prov-body-${esc(c.id)}">` +
      `<span class="provider-icon" aria-hidden="true">${esc(initial)}</span>` +
      `<span class="provider-row-name">${esc(c.name)}${c.isDefault ? ' <span class="badge">default</span>' : ""}</span>` +
      `${keyState}${shortTest}` +
      `<span class="provider-chevron" aria-hidden="true">${expanded ? "▴" : "▾"}</span>` +
      `</button>` +
      `<div class="provider-row-body" id="prov-body-${esc(c.id)}" ${expanded ? "" : "hidden"}>` +
      `<div class="list-item-meta">${esc(b.label || c.type)} · <code>${esc(c.baseUrl)}</code></div>` +
      `<p class="hint">${esc(b.corsNote || "")}</p>` +
      `<div class="field" style="max-width: 420px;">
         <label for="key-${esc(c.id)}">API key</label>
         <input type="password" id="key-${esc(c.id)}" autocomplete="off" placeholder="Paste key" />
         ${keyHintHtml}
       </div>` +
      passFieldHtml +
      `<div class="btn-row left">
         <button type="button" class="btn btn-sm" data-act="keep-key" data-id="${esc(c.id)}">Save key</button>
         <button type="button" class="btn btn-sm btn-ghost" data-act="forget-key" data-id="${esc(c.id)}">Forget key</button>
       </div>` +
      `<div class="btn-row left">
         <button type="button" class="btn btn-sm" data-act="test" data-id="${esc(c.id)}">Test connection</button>
         <button type="button" class="btn btn-sm btn-ghost" data-act="discover" data-id="${esc(c.id)}">Discover models</button>
         <button type="button" class="btn btn-sm btn-ghost" data-act="default" data-id="${esc(c.id)}">Set default</button>
         <button type="button" class="btn btn-sm btn-ghost" data-act="edit" data-id="${esc(c.id)}">Edit</button>
         <button type="button" class="btn btn-sm btn-ghost" data-act="remove" data-id="${esc(c.id)}">Remove</button>
       </div>` +
      testLineHtml +
      `<div data-role="edit-form" hidden></div>` +
      `</div>`;
    list.appendChild(card);
  }
  list.onclick = onProviderAction;
  renderChatModelList();
}

/**
 * The Models list lives in the Chat Model section (below Providers),
 * scoped to the provider currently selected in Chat Model — never inside
 * a provider's expanded config. Same rows and actions as before (set
 * selected / edit / remove / add model, discovered count); the model
 * search + scrolling input above it is untouched. Re-rendered whenever
 * the provider selection or the provider data changes.
 */
function renderChatModelList() {
  const wrap = $("chatModelListWrap");
  if (!wrap) return;
  const c = chatModelListScope(state.providers.list(), $("chatProvider").value);
  if (!c) {
    wrap.innerHTML = "";
    return;
  }
  const models = modelsForProvider(c);
  const modelRows = models.length
    ? models
        .map((m) => {
          const selected = c.defaultModel === m;
          if (
            state.editingModel &&
            state.editingModel.providerId === c.id &&
            state.editingModel.modelId === m
          ) {
            return (
              `<div class="model-row editing">` +
              `<input type="text" data-role="model-edit-input" maxlength="120" value="${esc(m)}" aria-label="Edit model ID" />` +
              `<button type="button" class="btn btn-sm btn-primary" data-act="model-edit-save" data-id="${esc(c.id)}" data-model="${esc(m)}">Save</button>` +
              `<button type="button" class="btn btn-sm btn-ghost" data-act="model-edit-cancel" data-id="${esc(c.id)}">Cancel</button>` +
              `</div>`
            );
          }
          return (
            `<div class="model-row">` +
            `<code class="model-id">${esc(m)}</code>` +
            (selected ? '<span class="badge ok">selected</span>' : "") +
            `<span class="model-actions">` +
            (selected
              ? ""
              : `<button type="button" class="btn btn-sm btn-ghost" data-act="model-select" data-id="${esc(c.id)}" data-model="${esc(m)}">Set selected</button>`) +
            `<button type="button" class="btn btn-sm btn-ghost" data-act="model-edit" data-id="${esc(c.id)}" data-model="${esc(m)}">Edit</button>` +
            `<button type="button" class="btn btn-sm btn-ghost" data-act="model-remove" data-id="${esc(c.id)}" data-model="${esc(m)}">Remove</button>` +
            `</span></div>`
          );
        })
        .join("")
    : '<p class="hint">No models yet · add one below, or discover them from the provider.</p>';
  const inlineAddHtml =
    state.addingModelFor === c.id
      ? `<div class="field" style="margin-top: 0.6rem;">` +
        `<label for="inline-model-${esc(c.id)}">Model ID</label>` +
        `<input type="text" id="inline-model-${esc(c.id)}" data-role="model-add-input" maxlength="120" autocomplete="off" placeholder="e.g. gpt-4o" />` +
        `<div class="btn-row left" style="margin-top: 0.5rem;">` +
        `<button type="button" class="btn btn-sm btn-primary" data-act="model-add-save" data-id="${esc(c.id)}">Add model</button>` +
        `<button type="button" class="btn btn-sm btn-ghost" data-act="model-add-cancel" data-id="${esc(c.id)}">Cancel</button>` +
        `</div></div>`
      : `<div class="btn-row left"><button type="button" class="btn btn-sm" data-act="model-add-show" data-id="${esc(c.id)}">Add model</button></div>`;
  wrap.innerHTML =
    `<h4 class="provider-subhead">Models</h4>` +
    `<div class="model-list">${modelRows}</div>` +
    inlineAddHtml +
    (c.modelsCache && c.modelsCache.length
      ? `<div class="list-item-meta">${c.modelsCache.length} models discovered</div>`
      : "");
  wrap.onclick = onProviderAction;
}

/** Expand one provider's row in Settings (collapsing the others) and
 *  scroll it into view; optionally focus its key input. */
function openProviderConfig(id, { focusKey = false } = {}) {
  if (!state.providers.get(id)) return;
  state.expandedProviderId = id;
  renderProviders();
  const card = $("providerList").querySelector(`[data-provider-id="${CSS.escape(id)}"]`);
  if (card) card.scrollIntoView({ block: "nearest" });
  if (focusKey) {
    const input = $("key-" + CSS.escape(id));
    if (input) input.focus();
  }
}

async function onProviderAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const act = btn.getAttribute("data-act");
  const card = btn.closest(".card");
  const resultEl = card ? card.querySelector('[data-role="test-result"]') : null;
  const say = (msg, ok) => {
    if (!resultEl) return;
    resultEl.textContent = msg;
    resultEl.style.color = ok ? "var(--ok, #15803d)" : "";
  };

  // Accordion toggle: expanding one row collapses the others (session
  // state only). Restore focus to the rebuilt row head for keyboard users.
  if (act === "toggle") {
    state.expandedProviderId = accordionToggle(state.expandedProviderId, id);
    renderProviders();
    const head = $("providerList").querySelector(
      `[data-provider-id="${CSS.escape(id)}"] [data-act="toggle"]`
    );
    if (head) head.focus();
    return;
  }

  try {
    if (act === "keep-key") {
      const input = $("key-" + CSS.escape(id));
      const passInput = $("pass-" + CSS.escape(id));
      await state.providers.setKey(id, input.value, passInput ? passInput.value : undefined);
      input.value = "";
      if (passInput) passInput.value = "";
      toast(
        state.providers.keyStoreState === "ready"
          ? "Key saved (encrypted in this browser)."
          : "Key kept in memory for this tab only."
      );
      renderProviders();
      renderChatSelectors();
    } else if (act === "forget-key") {
      await state.providers.forgetKey(id);
      toast("Key forgotten and deleted from this browser.");
      renderProviders();
      renderChatSelectors();
    } else if (act === "model-select") {
      await state.providers.update(id, { defaultModel: btn.getAttribute("data-model") });
      toast("Selected model updated.");
      renderProviders();
      renderChatSelectors();
    } else if (act === "model-edit") {
      state.editingModel = { providerId: id, modelId: btn.getAttribute("data-model") };
      renderProviders();
      // The render rebuilt the DOM, so query the fresh tree, not the
      // detached card.
      const input = document.querySelector('[data-role="model-edit-input"]');
      if (input) {
        input.focus();
        input.select();
      }
    } else if (act === "model-edit-save") {
      const input = document.querySelector('[data-role="model-edit-input"]');
      await state.providers.editModel(id, btn.getAttribute("data-model"), input ? input.value : "");
      state.editingModel = null;
      toast("Model renamed.");
      renderProviders();
      renderChatSelectors();
    } else if (act === "model-edit-cancel") {
      state.editingModel = null;
      renderProviders();
    } else if (act === "model-remove") {
      // Removing a model never deletes the provider or its key (store
      // guarantee); it only drops that ID from the provider's list.
      await state.providers.removeModel(id, btn.getAttribute("data-model"));
      toast("Model removed.");
      renderProviders();
      renderChatSelectors();
    } else if (act === "model-add-show") {
      state.addingModelFor = id;
      renderProviders();
      const input = document.querySelector('[data-role="model-add-input"]');
      if (input) input.focus();
    } else if (act === "model-add-save") {
      const input = document.querySelector('[data-role="model-add-input"]');
      await state.providers.addModel(id, input ? input.value : "");
      state.addingModelFor = null;
      toast("Model added.");
      renderProviders();
      renderChatSelectors();
    } else if (act === "model-add-cancel") {
      state.addingModelFor = null;
      renderProviders();
    } else if (act === "test") {
      btn.disabled = true;
      say("Testing connection…", true);
      // RC-2: say() is interim only. The result is persisted as
      // config.lastTest by the store; the re-render shows it, so it
      // survives (success and failure alike).
      // RC-3: validate the model the user actually intends to chat with.
      try {
        await state.providers.testConnection(id, undefined, $("chatModel").value.trim() || undefined);
      } catch (err) {
        // Failure is persisted as lastTest by the store; the re-render
        // below shows it. Never rely on the transient say() for results.
      }
      renderProviders();
      renderChatSelectors();
    } else if (act === "discover") {
      btn.disabled = true;
      say("Discovering models…", true);
      try {
        await state.providers.discoverModels(id);
      } catch (err) {
        // Same as test: the outcome is persisted as lastTest; re-render shows it.
      }
      renderProviders();
      renderChatSelectors();
    } else if (act === "default") {
      await state.providers.setDefault(id);
      toast("Default provider set.");
      renderProviders();
      renderChatSelectors();
    } else if (act === "edit") {
      renderEditForm(card, id);
    } else if (act === "remove") {
      const c = state.providers.get(id);
      if (confirm(`Remove provider "${c.name}"? Its key will be forgotten too.`)) {
        await state.providers.remove(id);
        if (state.expandedProviderId === id) state.expandedProviderId = null;
        toast("Provider removed.");
        renderProviders();
        renderChatSelectors();
        updateChatAvailability();
      }
    }
  } catch (err) {
    say(friendly(err), false);
  } finally {
    btn.disabled = false;
  }
}

function renderEditForm(card, id) {
  const c = state.providers.get(id);
  const host = card.querySelector('[data-role="edit-form"]');
  host.hidden = false;
  host.innerHTML =
    `<div class="field"><label>Display name</label><input type="text" data-f="name" maxlength="60" value="${esc(c.name)}" /></div>` +
    `<div class="field"><label>Base URL</label><input type="url" data-f="baseUrl" value="${esc(c.baseUrl)}" /></div>` +
    `<div class="field"><label>Default model ID</label><input type="text" data-f="defaultModel" maxlength="120" value="${esc(c.defaultModel || "")}" /></div>` +
    `<div class="btn-row"><button type="button" class="btn btn-sm btn-primary" data-save>Edit</button>
     <button type="button" class="btn btn-sm btn-ghost" data-cancel>Cancel</button></div>`;
  host.querySelector("[data-save]").textContent = "Save";
  host.querySelector("[data-save]").addEventListener("click", async () => {
    try {
      await state.providers.update(id, {
        name: host.querySelector('[data-f="name"]').value,
        baseUrl: host.querySelector('[data-f="baseUrl"]').value,
        defaultModel: host.querySelector('[data-f="defaultModel"]').value,
      });
      toast("Provider updated.");
      renderProviders();
      renderChatSelectors();
    } catch (err) {
      toast(friendly(err));
    }
  });
  host.querySelector("[data-cancel]").addEventListener("click", () => {
    host.hidden = true;
    host.innerHTML = "";
  });
}

function renderBuiltinSelect() {
  const sel = $("pvBuiltin");
  sel.innerHTML = "";
  for (const b of BUILTINS) {
    const o = document.createElement("option");
    o.value = b.id;
    o.textContent = b.label;
    sel.appendChild(o);
  }
  const sync = () => {
    const b = builtinById(sel.value);
    $("pvBaseUrl").value = b.defaultBaseUrl;
    // RC-7: a custom domain is refused by this page's browser security
    // policy before any request is sent — say so plainly instead of the
    // generic CORS note.
    $("pvCorsNote").textContent =
      b.id === "custom"
        ? "Custom domains are blocked by this page's browser security policy (it allows only the five built-in provider domains) · a custom domain will be refused before any request is sent. Use a built-in provider instead."
        : "Direct browser access: " + b.cors + ". " + b.corsNote;
    $("pvKeyHelp").textContent = b.keyHelp;
    if (! $("pvName").value) $("pvName").placeholder = "e.g. My " + b.label + " key";
  };
  sel.addEventListener("change", sync);
  sync();
}

function wireAddForm() {
  $("addProviderForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const c = await state.providers.add({
        name: $("pvName").value,
        builtinId: $("pvBuiltin").value,
        baseUrl: $("pvBaseUrl").value,
        defaultModel: $("pvModel").value,
      });
      // A key entered in the creation form is saved with the provider
      // (auto-persisted encrypted; the passphrase is asked once, in the
      // same form, when no device key exists yet).
      const key = $("pvKey").value.trim();
      if (key) {
        await state.providers.setKey(c.id, key, $("pvPassphrase").value || undefined);
      }
      $("pvName").value = "";
      $("pvModel").value = "";
      $("pvKey").value = "";
      $("pvPassphrase").value = "";
      hideAddForms();
      toast(
        key
          ? state.providers.keyStoreState === "ready"
            ? `Provider "${c.name}" added. Key saved encrypted in this browser.`
            : `Provider "${c.name}" added. Key kept in memory for this tab only.`
          : `Provider "${c.name}" added. Now set its API key above.`
      );
      // New providers join the compact list COLLAPSED (expandedProviderId
      // is left untouched).
      renderProviders();
      renderChatSelectors();
      updateChatAvailability();
    } catch (err) {
      toast(friendly(err));
    }
  });
  $("addProviderCancelBtn").addEventListener("click", hideAddForms);
  $("addModelCancelBtn").addEventListener("click", hideAddForms);

  $("addModelForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const providerId = $("amProvider").value;
    try {
      await state.providers.addModel(providerId, $("amModel").value);
      $("amModel").value = "";
      state.addModelDiscovered = [];
      renderAmDiscovered();
      hideAddForms();
      // Afterwards the provider's section is expanded so the new model
      // is visible.
      openProviderConfig(providerId);
      renderChatSelectors();
      toast("Model added.");
    } catch (err) {
      toast(friendly(err));
    }
  });
  $("amDiscoverBtn").addEventListener("click", async () => {
    const providerId = $("amProvider").value;
    const btn = $("amDiscoverBtn");
    btn.disabled = true;
    btn.textContent = "Discovering…";
    try {
      const { models } = await state.providers.discoverModels(providerId);
      state.addModelDiscovered = models || [];
      renderAmDiscovered();
      if (!state.addModelDiscovered.length) toast("No models discovered for this provider.");
    } catch (err) {
      toast(friendly(err));
    } finally {
      btn.disabled = false;
      btn.textContent = "Discover models";
    }
  });
  $("amDiscovered").addEventListener("click", (e) => {
    const pick = e.target.closest("[data-pick-model]");
    if (!pick) return;
    $("amModel").value = pick.getAttribute("data-pick-model");
    $("amModel").focus();
  });
}

/** Discovered models for the Add Model form, as pick buttons (only those
 *  not already in the provider's list). Clicking one fills the input. */
function renderAmDiscovered() {
  const box = $("amDiscovered");
  box.innerHTML = "";
  const c = state.providers.get($("amProvider").value);
  if (!c) return;
  const known = new Set(modelsForProvider(c));
  const fresh = state.addModelDiscovered.filter((m) => !known.has(m));
  if (state.addModelDiscovered.length && !fresh.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "All discovered models are already in this provider's list.";
    box.appendChild(p);
    return;
  }
  for (const m of fresh.slice(0, 50)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-sm btn-ghost";
    b.textContent = m;
    b.setAttribute("data-pick-model", m);
    box.appendChild(b);
  }
}

function populateAmProviders() {
  const sel = $("amProvider");
  const prev = sel.value;
  sel.innerHTML = "";
  for (const c of state.providers.list()) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    sel.appendChild(o);
  }
  if (prev && state.providers.get(prev)) sel.value = prev;
}

/* ================== "+" menu: Add Provider / Add Model ================== */

function wireAddMenu() {
  const btn = $("addMenuBtn");
  const menu = $("addMenu");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.addMenuOpen) closeAddMenu();
    else {
      state.addMenuOpen = true;
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
    }
  });
  $("addProviderMenuItem").addEventListener("click", () => {
    closeAddMenu();
    showAddForm("provider");
  });
  $("addModelMenuItem").addEventListener("click", () => {
    closeAddMenu();
    showAddForm("model");
  });
  // Clicking anywhere outside the menu closes it (the button's own click
  // is stopPropagation'd above, so it never reaches here).
  document.addEventListener("click", (e) => {
    if (state.addMenuOpen && !menu.contains(e.target)) closeAddMenu();
  });
}

function closeAddMenu() {
  state.addMenuOpen = false;
  $("addMenu").hidden = true;
  $("addMenuBtn").setAttribute("aria-expanded", "false");
}

/** Show one add-form (the other stays hidden); both forms are hidden by
 *  default. Focuses the form's first field. */
function showAddForm(form) {
  if (form === "model" && !state.providers.list().length) {
    // No provider exists yet — adding a model has no target.
    toast("Add a provider first.");
    form = "provider";
  }
  state.addForm = nextAddForm(state.addForm, form);
  const show = state.addForm;
  $("addProviderCard").hidden = show !== "provider";
  $("addModelCard").hidden = show !== "model";
  if (show === "provider") {
    $("addProviderCard").scrollIntoView({ block: "nearest" });
    $("pvName").focus();
  } else if (show === "model") {
    populateAmProviders();
    state.addModelDiscovered = [];
    renderAmDiscovered();
    $("addModelCard").scrollIntoView({ block: "nearest" });
    $("amModel").focus();
  }
}

function hideAddForms() {
  state.addForm = null;
  $("addProviderCard").hidden = true;
  $("addModelCard").hidden = true;
}

/* ================== encrypted key storage UI ================== */

/**
 * Show/hide the Add Provider form's passphrase field (and its hint) by
 * the store's keyStoreState — the same gate as the per-provider rows.
 * Called from renderProviders (so it re-runs after every setKey/forget)
 * and once at init. When the state is "ready" or "unavailable" the field
 * stays hidden; the pvKey hint carries the state-appropriate text.
 */
function syncPassphraseFields() {
  if (!state.providers) return;
  const st = state.providers.keyStoreState;
  const field = $("pvPassphraseField");
  if (field) field.hidden = st !== "needs-passphrase";
  const hint = $("pvKeyHint");
  if (hint) {
    hint.textContent =
      st === "unavailable"
        ? state.providers.keyStoreNote
        : "Stored encrypted in this browser.";
  }
}

/* ============================ chat UI ============================ */

function updateChatAvailability() {
  const has = state.providers.list().length > 0;
  $("chatNeedsProvider").hidden = has;
  $("chatLayout").hidden = !has;
}

function renderChatSelectors() {
  const sel = $("chatProvider");
  // Step 3: only providers with at least one configured model can be
  // chatted with. Key status is deliberately NOT a filter — a provider
  // with models but no key is still listed, and the guidance line below
  // tells the user to add its key.
  const usable = usableProviders(state.providers.list());
  const prev = sel.value;
  sel.innerHTML = "";
  for (const c of usable) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name + (state.providers.hasKey(c.id) ? "" : " (no key)");
    if (c.isDefault) o.selected = true;
    sel.appendChild(o);
  }
  // Keep the current selection when it is still usable; otherwise fall
  // back to the default (or first usable) provider.
  if (prev && usable.some((c) => c.id === prev)) sel.value = prev;
  // First render only: restore the provider + model used last time, so the
  // user doesn't re-pick them on every visit. Later re-renders (adding a
  // provider, setting a new default) keep the current selection instead.
  let saved = null;
  if (!lastUsedApplied) {
    lastUsedApplied = true;
    saved = loadLastUsed();
    if (saved && saved.providerId) {
      if (usable.some((c) => c.id === saved.providerId)) sel.value = saved.providerId;
      else clearLastUsed(); // stale or model-less provider · fall back
    }
  }
  syncModelDatalist();
  if (saved && saved.model) {
    $("chatModel").value = saved.model;
    updateCostLine();
  }
  updateChatGuidance();
  updateActiveModelLine();
  renderChatModelList();
}

function syncModelDatalist() {
  const c = state.providers.get($("chatProvider").value);
  const dl = $("modelDatalist");
  dl.innerHTML = "";
  // User-managed models first, then the discovered cache (union, deduped).
  for (const m of modelSuggestions(c)) {
    const o = document.createElement("option");
    o.value = m;
    dl.appendChild(o);
  }
  // NOTE (RC-4): this must NOT touch the model value. The reset happens only
  // on a provider change (wireComposer / selectConversation); resetting here
  // would wipe a user's typed model on every unrelated re-render.
  updateCostLine();
  updateActiveModelLine();
}

/**
 * Guidance under the Chat Model section: when the chosen provider has no
 * valid key or no configured model, say so plainly and offer a shortcut
 * button that opens that provider's expanded config (or the Add Provider
 * form when nothing usable exists). Hidden when everything is ready.
 */
function updateChatGuidance() {
  const line = $("chatModelGuidance");
  const actions = $("chatModelGuidanceActions");
  const btn = $("chatModelFixBtn");
  const configs = state.providers.list();
  const c = state.providers.get($("chatProvider").value) || null;
  const readiness = providerReadiness(c, c ? state.providers.hasKey(c.id) : false);
  if (readiness.kind === "ready") {
    line.hidden = true;
    actions.hidden = true;
    state.chatGuidanceAction = null;
    return;
  }
  line.hidden = false;
  actions.hidden = false;
  if (readiness.kind === "none") {
    line.textContent = configs.length
      ? "None of your providers has a model yet. Add a model to one of them to start chatting."
      : "No provider configured yet. Add a provider with a model to start chatting.";
    btn.textContent = configs.length ? "Add a model" : "Add a provider";
    state.chatGuidanceAction = configs.length ? "add-model" : "add-provider";
  } else if (readiness.kind === "no-model") {
    line.textContent = `Provider "${c.name}" has no models yet. Add a model to it to start chatting.`;
    btn.textContent = "Add a model";
    state.chatGuidanceAction = "add-model";
  } else {
    // no-key
    line.textContent = `No API key is set for "${c.name}". Add its key to start chatting.`;
    btn.textContent = "Add a key";
    state.chatGuidanceAction = "add-key";
  }
}

/** The guidance button's shortcut: opens the relevant Settings spot. */
function onChatGuidanceFix() {
  const action = state.chatGuidanceAction;
  const c = state.providers.get($("chatProvider").value);
  if (action === "add-key" && c) {
    openProviderConfig(c.id, { focusKey: true });
  } else if (action === "add-model") {
    if (c) {
      // Preselect this provider in the Add Model form, then expand it
      // afterwards via the form's own submit flow.
      showAddForm("model");
      $("amProvider").value = c.id;
      $("amModel").focus();
    } else {
      showAddForm("model");
    }
  } else {
    showAddForm("provider");
  }
}

function updateCostLine() {
  const model = $("chatModel").value.trim();
  const prompt = $("promptInput").value;
  const maxTokens = Number($("maxTokens").value) || 0;
  const line = $("costLine");
  if (!model) {
    line.textContent = "";
    return;
  }
  const est = estimateCost(model, prompt, maxTokens);
  if (!est.known) {
    line.textContent = "Nothing is sent until you press Send.";
  } else if (est.free) {
    line.textContent = `Free model · estimated cost $0. Nothing is sent until you press Send.`;
  } else {
    line.textContent =
      `Estimated max cost ≈ ${formatUsd(est.estCostUsd)} (${est.promptTokens.toLocaleString()} prompt tokens est. + up to ${est.maxOutputTokens.toLocaleString()} output tokens) for ${est.label}. Prices are estimates · verify with your provider. Nothing is sent until you press Send.`;
  }
}

function wireComposer() {
  $("chatProvider").addEventListener("change", () => {
    // RC-4: provider CHANGE resets the model to the new provider's default
    // first — never carry a model across providers. Save after the reset so
    // the persisted pair is consistent.
    const next = state.providers.get($("chatProvider").value);
    $("chatModel").value = modelForProviderChange($("chatModel").value, next ? next.defaultModel : "");
    syncModelDatalist();
    saveLastUsed($("chatProvider").value, $("chatModel").value.trim());
    updateChatGuidance();
  });
  $("chatModel").addEventListener("input", () => {
    updateCostLine();
    updateActiveModelLine();
    saveLastUsed($("chatProvider").value, $("chatModel").value.trim());
  });
  $("promptInput").addEventListener("input", updateCostLine);
  $("maxTokens").addEventListener("input", updateCostLine);
  // Clamp the token limit to 1..128000 when the user commits a value
  // (validateMaxTokens); the live input handler above only re-prices.
  $("maxTokens").addEventListener("change", () => {
    const { value } = validateMaxTokens($("maxTokens").value);
    $("maxTokens").value = String(value);
    updateCostLine();
  });
  $("chatModelFixBtn").addEventListener("click", onChatGuidanceFix);
  $("sendBtn").addEventListener("click", sendPrompt);
  $("stopBtn").addEventListener("click", () => {
    if (state.aborter) state.aborter.abort();
  });
  $("promptInput").addEventListener("keydown", (e) => {
    // Enter sends · Shift+Enter adds a new line (the default).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });
  $("newConvBtn").addEventListener("click", newConversation);
  $("messages").addEventListener("click", onMessageAction);
  $("messages").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-chip]");
    if (!chip) return;
    $("promptInput").value = chip.getAttribute("data-chip");
    updateCostLine();
    sendPrompt();
  });
}

async function refreshConversations() {
  const rows = await state.storage.list("conversations", { reverse: true });
  const box = $("convList");
  box.innerHTML = "";
  const visible = filterSessions(rows.slice(0, 50), state.searchQuery);
  if (!visible.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = state.searchQuery ? "No chats match your search." : "No chats yet.";
    box.appendChild(p);
  }
  for (const group of groupSessions(visible)) {
    const section = document.createElement("div");
    section.className = "conv-group";
    const head = document.createElement("h3");
    head.className = "conv-group-head";
    head.textContent = group.label;
    section.appendChild(head);
    for (const r of group.items) {
      const row = document.createElement("div");
      row.className = "conv-item" + (r.id === state.convId ? " active" : "");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "conv-item-title";
      b.textContent = sessionTitle(r);
      b.setAttribute("data-conv", r.id);
      if (r.id === state.convId) b.setAttribute("aria-current", "true");
      const del = document.createElement("button");
      del.type = "button";
      del.className = "conv-item-del";
      del.textContent = "×";
      del.setAttribute("data-del-conv", r.id);
      del.setAttribute("aria-label", "Delete conversation " + sessionTitle(r));
      row.append(b, del);
      section.appendChild(row);
    }
    box.appendChild(section);
  }
  box.onclick = async (e) => {
    const open = e.target.closest("[data-conv]");
    const del = e.target.closest("[data-del-conv]");
    if (del) {
      e.stopPropagation();
      if (confirm("Delete this conversation? This cannot be undone.")) {
        await state.storage.del("conversations", del.getAttribute("data-del-conv"));
        if (state.convId === del.getAttribute("data-del-conv")) {
          state.convId = null;
          state.conv = null;
        }
        await refreshConversations();
        renderMessages();
      }
      return;
    }
    if (open) {
      await selectConversation(open.getAttribute("data-conv"));
      closeSidebar(); // drawer only matters on mobile; harmless on desktop
    }
  };
  renderChatSelectors();
}

async function newConversation() {
  const rec = await state.storage.put("conversations", {
    id: state.storage.newId("conv"),
    title: "New chat",
    providerId: null,
    model: "",
    maxTokens: 1024,
    messages: [],
    createdAt: new Date().toISOString(),
  });
  state.convId = rec.id;
  state.conv = rec;
  await refreshConversations();
  renderMessages();
  $("promptInput").focus();
}

async function selectConversation(id) {
  const rec = await state.storage.get("conversations", id);
  if (!rec) return;
  state.convId = id;
  state.conv = rec;
  await refreshConversations();
  renderMessages();
  if (rec.providerId && state.providers.get(rec.providerId)) {
    // Only switch the selector when the conversation's provider is still
    // usable (listed in the Chat Model select); otherwise keep the current
    // provider and its model.
    if (usableProviders(state.providers.list()).some((c) => c.id === rec.providerId)) {
      $("chatProvider").value = rec.providerId;
      // RC-4: reset to the conversation provider's default before applying
      // the conversation's own saved model (if any) below.
      const next = state.providers.get(rec.providerId);
      $("chatModel").value = modelForProviderChange($("chatModel").value, next ? next.defaultModel : "");
      syncModelDatalist();
      updateChatGuidance();
    }
  }
  if (rec.model) $("chatModel").value = rec.model;
  if (rec.maxTokens) $("maxTokens").value = String(validateMaxTokens(rec.maxTokens).value);
}

function renderEmptyState(box) {
  const wrap = document.createElement("div");
  wrap.className = "chat-greeting";
  const h = document.createElement("h1");
  h.textContent = "Hi, how can I help you study?";
  wrap.appendChild(h);
  const chips = document.createElement("div");
  chips.className = "chip-row";
  for (const prompt of SUGGESTION_CHIPS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = prompt;
    b.setAttribute("data-chip", prompt);
    chips.appendChild(b);
  }
  wrap.appendChild(chips);
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = "Your prompts go directly to your chosen provider · nothing passes through our servers. ";
  const more = document.createElement("button");
  more.type = "button";
  more.className = "link-btn";
  more.textContent = "Full disclosures in Settings";
  more.addEventListener("click", openSettings);
  note.appendChild(more);
  wrap.appendChild(note);
  box.appendChild(wrap);
}

function renderMessages() {
  const box = $("messages");
  box.innerHTML = "";
  const msgs = (state.conv && state.conv.messages) || [];
  if (!msgs.filter((m) => m.role !== "system").length) {
    renderEmptyState(box);
    return;
  }
  msgs.forEach((m, i) => {
    if (m.role === "system") return;
    const wrap = document.createElement("div");
    wrap.className = "msg msg-" + m.role;
    if (m.role === "user") {
      const p = document.createElement("div");
      p.className = "msg-body";
      p.textContent = m.content;
      wrap.appendChild(p);
    } else {
      const body = document.createElement("div");
      body.className = "msg-body";
      body.innerHTML = renderMarkdown(m.content); // safe: escaped before formatting
      wrap.appendChild(body);
      const actions = document.createElement("div");
      actions.className = "btn-row msg-actions";
      const isLast = i === msgs.length - 1;
      actions.innerHTML =
        `<button type="button" class="btn btn-sm btn-ghost" data-mact="copy" data-i="${i}">Copy</button>` +
        (isLast ? `<button type="button" class="btn btn-sm btn-ghost" data-mact="regen" data-i="${i}">Regenerate</button>` : "") +
        `<button type="button" class="btn btn-sm btn-ghost" data-mact="save-note" data-i="${i}">Save as note</button>`;
      wrap.appendChild(actions);
    }
    box.appendChild(wrap);
  });
  box.scrollTop = box.scrollHeight;
}

async function onMessageAction(e) {
  const btn = e.target.closest("[data-mact]");
  if (!btn || !state.conv) return;
  const i = Number(btn.getAttribute("data-i"));
  const msg = state.conv.messages[i];
  if (!msg) return;
  const act = btn.getAttribute("data-mact");
  if (act === "copy") {
    try {
      await navigator.clipboard.writeText(msg.content);
      toast("Copied.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = msg.content;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast("Copied.");
      } catch {
        toast("Copy failed · select the text manually.");
      }
      ta.remove();
    }
  } else if (act === "regen") {
    // Drop this assistant reply and re-run from the last user message.
    state.conv.messages = state.conv.messages.slice(0, i);
    await persistConv();
    renderMessages();
    // RC-6: a missing key must surface, not reject unhandled.
    try {
      await runCompletion();
    } catch (err) {
      toast(friendly(err));
    }
  } else if (act === "save-note") {
    try {
      const title = "AI answer · " + new Date().toLocaleString();
      await state.storage.put("notes", {
        id: state.storage.newId("note"),
        title,
        body: msg.content,
        folderId: null,
        createdAt: new Date().toISOString(),
      });
      toast("Saved to My Study Space notes.");
    } catch (err) {
      toast("Couldn't save the note: " + friendly(err));
    }
  }
}

async function persistConv() {
  if (!state.conv) return;
  state.conv.updatedAt = new Date().toISOString();
  await state.storage.put("conversations", state.conv);
}

function setStreaming(on) {
  state.streaming = on;
  $("sendBtn").disabled = on;
  $("stopBtn").hidden = !on;
  $("promptInput").disabled = on;
}

async function sendPrompt() {
  if (state.streaming) return;
  const prompt = $("promptInput").value.trim();
  if (!prompt) {
    toast("Type a question first.");
    return;
  }
  const providerId = $("chatProvider").value;
  const config = state.providers.get(providerId);
  if (!config) {
    toast("Choose a provider first.");
    return;
  }
  let key;
  try {
    key = state.providers.getKey(providerId);
  } catch (err) {
    // Keys auto-persist encrypted, so a missing key simply means none was
    // ever entered for this provider — point at Settings.
    toast(missingKeyMessage());
    openSettings();
    return;
  }
  const model = $("chatModel").value.trim();
  if (!model) {
    toast("Enter a model ID (or discover models in Settings).");
    return;
  }
  saveLastUsed(providerId, model);
  const { value: maxTokens } = validateMaxTokens($("maxTokens").value);
  $("maxTokens").value = String(maxTokens);

  if (!state.conv) await newConversation();
  const msgs = state.conv.messages;
  if (!msgs.some((m) => m.role === "system")) msgs.push({ role: "system", content: SYSTEM_PROMPT, ts: Date.now() });
  msgs.push({ role: "user", content: prompt, ts: Date.now() });
  if (state.conv.title === "New chat") state.conv.title = prompt.slice(0, 40);
  state.conv.providerId = providerId;
  state.conv.model = model;
  state.conv.maxTokens = maxTokens;
  $("promptInput").value = "";
  updateCostLine();
  await persistConv();
  renderMessages();
  await runCompletion(config, key, model, maxTokens);
}

async function runCompletion(config, key, model, maxTokens) {
  // Assistant placeholder FIRST, so a failure resolving the key/config
  // still has somewhere to report (RC-6: the old code threw before the
  // try block, leaving Regenerate to fail silently).
  const box = $("messages");
  const wrap = document.createElement("div");
  wrap.className = "msg msg-assistant";
  const body = document.createElement("div");
  body.className = "msg-body";
  body.innerHTML = '<p class="hint">Thinking…</p>';
  wrap.appendChild(body);
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;

  let withKey;
  let adapter;
  try {
    config = config || state.providers.get(state.conv.providerId);
    withKey = { ...config, apiKey: key || state.providers.getKey(config.id) };
    model = model || state.conv.model;
    maxTokens = maxTokens || state.conv.maxTokens || 1024;
    adapter = state.providers.adapterForConfig(config);
  } catch (err) {
    // Same inline shape as the stream-error path below; return without
    // throwing so callers (Send, Regenerate) never see an unhandled
    // rejection for a missing key.
    body.innerHTML = "";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Couldn't complete: " + friendly(err);
    body.appendChild(p);
    return;
  }

  setStreaming(true);
  state.aborter = new AbortController();
  let text = "";
  let reasoning = "";
  let firstToken = true;
  try {
    const { text: finalText, reasoning: finalReasoning } = await streamChat({
      adapter,
      config: withKey,
      messages: state.conv.messages.map((m) => ({ role: m.role, content: m.content })),
      model,
      maxTokens,
      signal: state.aborter.signal,
      onToken: (t) => {
        if (firstToken) {
          body.innerHTML = "";
          firstToken = false;
        }
        text += t;
        body.innerHTML = renderMarkdown(text);
        box.scrollTop = box.scrollHeight;
      },
      onReasoning: (_t, full) => {
        // Reasoning models think before they answer: show the thinking
        // live, so the chat never looks stalled while the model works.
        reasoning = full;
        if (firstToken) {
          body.innerHTML = '<p class="hint">Thinking…</p>' + renderMarkdown(full);
          box.scrollTop = box.scrollHeight;
        }
      },
    });
    text = finalText;
    reasoning = finalReasoning || reasoning;
    if (!text) {
      // No answer arrived, even after the non-streaming fallback: never
      // leave a silent empty bubble. The message is saved to history so
      // the finally re-render keeps it visible — a DOM-only hint would
      // be wiped by renderMessages() and look exactly like a stall.
      // The model's thinking is kept (when there is any) so the user can
      // read what it was doing.
      const note = "The model returned no response — try another model.";
      const content = reasoning ? reasoning + "\n\n" + note : note;
      body.innerHTML = renderMarkdown(content);
      state.conv.messages.push({ role: "assistant", content, ts: Date.now() });
    } else {
      state.conv.messages.push({ role: "assistant", content: text, ts: Date.now() });
    }
  } catch (err) {
    const msg = friendly(err);
    const content = "Couldn't complete: " + msg;
    body.innerHTML = "";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = content;
    body.appendChild(p);
    // Save the failure to history too, for the same reason as above:
    // the finally re-render wipes DOM-only content, so an unsaved error
    // would vanish and look exactly like a silent stall. Regenerate
    // still works — it drops this message and re-runs.
    state.conv.messages.push({ role: "assistant", content, ts: Date.now() });
  } finally {
    setStreaming(false);
    state.aborter = null;
    await persistConv();
    renderMessages();
    await refreshConversations();
  }
}

function friendly(err) {
  if (err instanceof AIError) return err.message;
  return (err && err.message) || String(err);
}
