/**
 * StudyPilot · AI Chat page controller (BYOK).
 *
 * Wires: provider management, key handling (memory-first), encrypted
 * opt-in storage, streaming chat with cancel/regenerate/copy/save-as-note,
 * cost estimates, and disclosures.
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
import { SUGGESTION_CHIPS, sessionTitle, filterSessions, groupSessions, modelForProviderChange, missingKeyMessage } from "./ai/chatui.js";

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
  // Provider id whose card shows the inline "encrypt & store" offer after a
  // key was just kept in memory (RC-1). Session-only; cleared on dismiss or
  // once the keys are encrypted.
  encOfferFor: null,
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
  renderEncPanel();
  await refreshConversations();
  wireComposer();
  wireAddForm();
  wireEncButtons();
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
    if (e.key === "Escape" && !$("settingsPanel").hidden) {
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
  const c = state.providers.get($("chatProvider").value) || configs[0];
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
  const list = $("providerList");
  const configs = state.providers.list();
  if (!configs.length) {
    list.innerHTML = '<div class="empty"><p>No providers yet. Add one below to get started.</p></div>';
    return;
  }
  list.innerHTML = "";
  for (const c of configs) {
    const b = builtinById(c.builtinId) || {};
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "0.9rem";
    const keyState = state.providers.hasKey(c.id)
      ? '<span class="badge ok">Key in memory</span>'
      : '<span class="badge">No key set</span>';
    // Persisted last-test line (RC-2): survives re-renders, so a verified
    // provider stays visibly verified. Empty when never tested.
    const testLine = formatTestResult(c.lastTest || null);
    const testLineHtml =
      `<p class="hint" data-role="test-result" aria-live="polite"` +
      (c.lastTest && c.lastTest.ok ? ` style="color: var(--ok, #15803d)"` : "") +
      `>${esc(testLine)}</p>`;
    // Inline encrypted-storage offer (RC-1): shown after a key was just kept
    // in memory, only while that key is still in memory and no encrypted
    // storage is set up yet (the setup form is hidden once it exists, so
    // the shortcut would have nowhere to scroll to).
    const encOfferHtml =
      state.encOfferFor === c.id && state.providers.hasKey(c.id) && !state.providers.encryptedAtRest
        ? `<p class="hint">Key kept in memory for this tab only.</p>` +
          `<div class="btn-row">` +
          `<button type="button" class="btn btn-sm" data-act="enc-offer" data-id="${esc(c.id)}">Encrypt &amp; store on this device</button>` +
          `<button type="button" class="btn btn-sm btn-ghost" data-act="enc-dismiss" data-id="${esc(c.id)}">Dismiss</button>` +
          `</div>`
        : "";
    card.innerHTML =
      `<div class="list-item-title">${esc(c.name)} ${c.isDefault ? '<span class="badge">default</span>' : ""} ${keyState}</div>` +
      `<div class="list-item-meta">${esc(b.label || c.type)} · <code>${esc(c.baseUrl)}</code></div>` +
      (c.defaultModel ? `<div class="list-item-meta">Default model: <code>${esc(c.defaultModel)}</code></div>` : "") +
      (c.modelsCache && c.modelsCache.length
        ? `<div class="list-item-meta">${c.modelsCache.length} models discovered</div>`
        : "") +
      `<p class="hint">${esc(b.corsNote || "")}</p>` +
      `<div class="field" style="max-width: 420px;">
         <label for="key-${esc(c.id)}">API key</label>
         <input type="password" id="key-${esc(c.id)}" autocomplete="off" placeholder="Paste key · kept in memory only" />
         <p class="hint">Stored in this tab's memory. Never written to disk unless you opt into encrypted storage below.</p>
       </div>` +
      `<div class="btn-row">
         <button type="button" class="btn btn-sm" data-act="keep-key" data-id="${esc(c.id)}">Keep key in memory</button>
         <button type="button" class="btn btn-sm btn-ghost" data-act="forget-key" data-id="${esc(c.id)}">Forget key</button>
         <button type="button" class="btn btn-sm" data-act="test" data-id="${esc(c.id)}">Test connection</button>
         <button type="button" class="btn btn-sm btn-ghost" data-act="discover" data-id="${esc(c.id)}">Discover models</button>
         <button type="button" class="btn btn-sm btn-ghost" data-act="default" data-id="${esc(c.id)}">Set default</button>
         <button type="button" class="btn btn-sm btn-ghost" data-act="edit" data-id="${esc(c.id)}">Edit</button>
         <button type="button" class="btn btn-sm btn-ghost" data-act="remove" data-id="${esc(c.id)}">Remove</button>
       </div>` +
      encOfferHtml +
      testLineHtml +
      `<div data-role="edit-form" hidden></div>`;
    list.appendChild(card);
  }
  list.onclick = onProviderAction;
}

async function onProviderAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const act = btn.getAttribute("data-act");
  const card = btn.closest(".card");
  const resultEl = card.querySelector('[data-role="test-result"]');
  const say = (msg, ok) => {
    resultEl.textContent = msg;
    resultEl.style.color = ok ? "var(--ok, #15803d)" : "";
  };

  try {
    if (act === "keep-key") {
      const input = $("key-" + CSS.escape(id));
      state.providers.setKey(id, input.value);
      input.value = "";
      state.encOfferFor = id; // offer encrypted storage inline (RC-1)
      toast("Key kept in memory for this tab.");
      renderProviders();
      renderChatSelectors();
    } else if (act === "enc-offer") {
      // Shortcut only: scroll to the passphrase field in the encrypted
      // storage panel and focus it. The encrypt flow itself is unchanged.
      const pass = $("encPassNew");
      if (pass) {
        pass.scrollIntoView({ block: "center" });
        pass.focus();
      }
    } else if (act === "enc-dismiss") {
      state.encOfferFor = null;
      renderProviders();
    } else if (act === "forget-key") {
      state.providers.forgetKey(id);
      toast("Key forgotten.");
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
      $("pvName").value = "";
      $("pvModel").value = "";
      toast(`Provider "${c.name}" added. Now set its API key above.`);
      renderProviders();
      renderChatSelectors();
      updateChatAvailability();
    } catch (err) {
      toast(friendly(err));
    }
  });
}

/* ================== encrypted key storage UI ================== */

function renderEncPanel() {
  const has = state.providers.encryptedAtRest;
  $("encStatus").textContent = has
    ? "Encrypted keys are stored on this device. Unlock them into memory to chat."
    : "No encrypted keys stored. Keys you enter above live in memory only.";
  $("encSetup").hidden = has;
  $("encUnlock").hidden = !has;
}

function wireEncButtons() {
  $("encStoreBtn").addEventListener("click", async () => {
    const p1 = $("encPassNew").value;
    const p2 = $("encPassConfirm").value;
    try {
      if (!p1 || p1.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
      if (p1 !== p2) throw new Error("Passphrases do not match.");
      await state.providers.persistEncrypted(p1);
      $("encPassNew").value = "";
      $("encPassConfirm").value = "";
      state.encOfferFor = null; // keys are stored now · the inline offer is moot
      toast("Keys encrypted and stored on this device.");
      renderEncPanel();
      renderProviders();
    } catch (err) {
      toast(friendly(err));
    }
  });
  $("encUnlockBtn").addEventListener("click", async () => {
    try {
      const n = await state.providers.unlock($("encPassUnlock").value);
      $("encPassUnlock").value = "";
      toast(`Unlocked ${n.length} key${n.length === 1 ? "" : "s"} into memory.`);
      renderProviders();
    } catch (err) {
      toast(friendly(err));
    }
  });
  $("encLockBtn").addEventListener("click", () => {
    state.providers.forgetAllKeys();
    toast("In-memory keys forgotten. Encrypted copy remains on device.");
    renderProviders();
  });
  $("encWipeBtn").addEventListener("click", async () => {
    if (!confirm("Delete the encrypted keys from this device? You will need to re-enter them.")) return;
    await state.providers.wipeEncrypted();
    toast("Encrypted keys deleted.");
    renderEncPanel();
    renderProviders();
  });
}

/* ============================ chat UI ============================ */

function updateChatAvailability() {
  const has = state.providers.list().length > 0;
  $("chatNeedsProvider").hidden = has;
  $("chatLayout").hidden = !has;
}

function renderChatSelectors() {
  const sel = $("chatProvider");
  const configs = state.providers.list();
  sel.innerHTML = "";
  for (const c of configs) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name + (state.providers.hasKey(c.id) ? "" : " (no key)");
    if (c.isDefault) o.selected = true;
    sel.appendChild(o);
  }
  // First render only: restore the provider + model used last time, so the
  // user doesn't re-pick them on every visit. Later re-renders (adding a
  // provider, setting a new default) keep the current selection instead.
  let saved = null;
  if (!lastUsedApplied) {
    lastUsedApplied = true;
    saved = loadLastUsed();
    if (saved && saved.providerId) {
      if (state.providers.get(saved.providerId)) sel.value = saved.providerId;
      else clearLastUsed(); // stale provider · fall back to the default
    }
  }
  syncModelDatalist();
  if (saved && saved.model) {
    $("chatModel").value = saved.model;
    updateCostLine();
  }
  updateActiveModelLine();
}

function syncModelDatalist() {
  const c = state.providers.get($("chatProvider").value);
  const dl = $("modelDatalist");
  dl.innerHTML = "";
  const models = (c && c.modelsCache) || [];
  for (const m of models.slice(0, 200)) {
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
    line.textContent = `Cost unknown for "${model}" · check your provider's pricing page. Nothing is sent until you press Send.`;
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
  });
  $("chatModel").addEventListener("input", () => {
    updateCostLine();
    updateActiveModelLine();
    saveLastUsed($("chatProvider").value, $("chatModel").value.trim());
  });
  $("promptInput").addEventListener("input", updateCostLine);
  $("maxTokens").addEventListener("input", updateCostLine);
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
    $("chatProvider").value = rec.providerId;
    // RC-4: reset to the conversation provider's default before applying
    // the conversation's own saved model (if any) below.
    const next = state.providers.get(rec.providerId);
    $("chatModel").value = modelForProviderChange($("chatModel").value, next ? next.defaultModel : "");
    syncModelDatalist();
  }
  if (rec.model) $("chatModel").value = rec.model;
  if (rec.maxTokens) $("maxTokens").value = rec.maxTokens;
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
    // RC-1: if this provider was verified or was last used, the key was
    // most likely lost on a page reload (memory-only) — say so explicitly.
    const lastUsed = loadLastUsed();
    toast(
      missingKeyMessage({
        hadVerified: !!(config.lastTest && config.lastTest.ok),
        wasLastUsed: !!(lastUsed && lastUsed.providerId === providerId),
      })
    );
    openSettings();
    return;
  }
  const model = $("chatModel").value.trim();
  if (!model) {
    toast("Enter a model ID (or discover models in Settings).");
    return;
  }
  saveLastUsed(providerId, model);
  const maxTokens = Math.max(1, Math.min(128000, Number($("maxTokens").value) || 1024));

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
  let firstToken = true;
  try {
    const { text: finalText } = await streamChat({
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
    });
    text = finalText;
    if (!text) body.innerHTML = '<p class="hint">The provider returned an empty reply.</p>';
    state.conv.messages.push({ role: "assistant", content: text, ts: Date.now() });
  } catch (err) {
    const msg = friendly(err);
    body.innerHTML = "";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Couldn't complete: " + msg;
    body.appendChild(p);
    // Keep the failed attempt out of history so Regenerate stays clean.
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
