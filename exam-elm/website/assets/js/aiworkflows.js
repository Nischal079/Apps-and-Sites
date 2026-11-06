/**
 * StudyPilot · AI document workflows page controller (BYOK, Phase 7).
 *
 * Five tabs: Context Chat, Flashcards, Quiz, Study Planner, Notes Assistant.
 * All prompts are assembled locally; transmission happens ONLY through
 * streamChat() and ONLY after the user explicitly presses Send/Generate,
 * with a "what will be sent" preview and a cost estimate on screen first.
 *
 * Security: model output is rendered ONLY through renderMarkdown() (which
 * escapes first). User/provider strings go through esc() or textContent.
 * Keys never touch the DOM. No keys, endpoints, or fetch outside streamChat.
 */
import { initTheme, injectBrand, toast, todayLocal, toISODate } from "./ui.js";
import "./motion.js";
import { openStorage } from "./storage.js";
import { renderMarkdown } from "./markdown.js";
import { AIError } from "./ai/adapters.js";
import { ProviderStore } from "./ai/providers.js";
import { loadLastUsed, saveLastUsed, clearLastUsed } from "./ai/lastused.js";
import { modelForProviderChange, missingKeyMessage, modelSuggestions } from "./ai/chatui.js";
import { streamChat } from "./ai/chat.js";
import { estimateCost, estimateTokens, formatUsd } from "./ai/costs.js";
import {
  CTX,
  TOKEN_LIMITS,
  NOTE_ACTION_LABEL,
  assembleContext,
  chatContextMessages,
  flashcardPrompt,
  quizPrompt,
  plannerPrompt,
  noteActionPrompt,
  summarizeTracker,
  parseFlashcards,
  parseQuiz,
  scoreQuiz,
  validatePlannerInput,
  plannerDraftToTimetable,
  applyNoteAction,
  listDecks,
  saveDeck,
  deleteDeck,
  listAttempts,
  saveAttempt,
} from "./ai/workflows.js";
import { TRACKER_KV_KEY } from "./tracker.js";
import { encodeShare } from "./timetable.js";
import { extractDocxText } from "./docx.js";

const $ = (id) => document.getElementById(id);

/* First-render restore of the last-used provider/model (see initProviders). */
let lastUsedApplied = false;

const state = {
  storage: null,
  providers: null,
  notes: [],
  files: [],
  subjects: [],
  streaming: false,
  aborter: null,
  review: null, // flashcard review session
  quiz: null, // generated quiz session
  plan: null, // last generated plan context
  noteAction: "summarize",
  noteActOutput: "",
  noteActRecId: null,
};

/** Resolved file texts: fileId -> { text, extractable }. */
const fileTextCache = new Map();

const TABS = ["ctx", "cards", "quiz", "plan", "notes"];
const TAB_BTN = { ctx: "tabCtx", cards: "tabCards", quiz: "tabQuiz", plan: "tabPlan", notes: "tabNotes" };
const TAB_PANEL = { ctx: "panelCtx", cards: "panelCards", quiz: "panelQuiz", plan: "panelPlan", notes: "panelNotes" };

function friendly(err) {
  if (err instanceof AIError) return err.message;
  return (err && err.message) || String(err);
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function noteTitle(n) {
  const t = String((n && n.title) || "").trim();
  return t || "(untitled note)";
}

/* ============================== init ============================== */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  initTheme();
  injectBrand();
  wireMenu();
  wireTabs();
  state.storage = await openStorage();
  state.providers = new ProviderStore(state.storage);
  await state.providers.load();
  // Built-in free provider: seeded for every user, first in every list.
  await state.providers.ensureExamElmSeeded();
  initProviders();
  wireProviderBar();
  await loadMaterials();
  await initPlannerSubjects();
  await renderDecks();
  await renderAttempts();
  wireCtx();
  wireCards();
  wireQuiz();
  wirePlan();
  wireNotes();
  refreshAllCosts();
}

function wireMenu() {
  const menuBtn = $("menuBtn");
  const mobileMenu = $("mobileMenu");
  if (!menuBtn || !mobileMenu) return;
  menuBtn.addEventListener("click", () => {
    const open = mobileMenu.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  mobileMenu.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      mobileMenu.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.setAttribute("aria-label", "Open menu");
    }
  });
}

function wireTabs() {
  const list = document.querySelector('[role="tablist"]');
  for (const name of TABS) {
    $(TAB_BTN[name]).addEventListener("click", () => activateTab(name));
  }
  list.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const btns = TABS.map((t) => $(TAB_BTN[t]));
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
    activateTab(TABS[next]);
    btns[next].focus();
  });
}

function activateTab(name) {
  for (const t of TABS) {
    const on = t === name;
    const btn = $(TAB_BTN[t]);
    btn.setAttribute("aria-selected", String(on));
    btn.classList.toggle("active", on);
    btn.tabIndex = on ? 0 : -1;
    $(TAB_PANEL[t]).hidden = !on;
  }
}

/* ======================= provider bar ======================= */

function initProviders() {
  const configs = state.providers.list();
  $("provEmpty").hidden = configs.length > 0;
  $("provBar").hidden = configs.length === 0;
  const sel = $("provSelect");
  sel.innerHTML = "";
  for (const c of configs) {
    const o = document.createElement("option");
    o.value = c.id;
    // ExamElm needs no key: label it free instead of "(no key)".
    o.textContent =
      c.name +
      (!state.providers.needsKey(c) ? " (free)" : state.providers.hasKey(c.id) ? "" : " (no key)");
    if (c.isDefault) o.selected = true;
    sel.appendChild(o);
  }
  // First render only: restore the provider + model used last time (shared
  // with AI Chat, so the pair follows the user across both pages).
  let saved = null;
  if (!lastUsedApplied) {
    lastUsedApplied = true;
    saved = loadLastUsed();
    if (saved && saved.providerId) {
      if (state.providers.get(saved.providerId)) sel.value = saved.providerId;
      else clearLastUsed(); // stale provider · fall back to the default
    }
  }
  syncModelList();
  if (saved && saved.model) {
    $("provModel").value = saved.model;
    refreshAllCosts();
  }
}

function wireProviderBar() {
  $("provSelect").addEventListener("change", () => {
    // RC-4: provider CHANGE resets the model to the new provider's default
    // first — never carry a model across providers. Save after the reset so
    // the persisted pair is consistent.
    const next = state.providers.get($("provSelect").value);
    $("provModel").value = modelForProviderChange($("provModel").value, next ? next.defaultModel : "");
    syncModelList();
    saveLastUsed($("provSelect").value, $("provModel").value.trim());
  });
  $("provModel").addEventListener("input", () => {
    refreshAllCosts();
    saveLastUsed($("provSelect").value, $("provModel").value.trim());
  });
  for (const id of ["maxTokCtx", "maxTokCards", "maxTokQuiz", "maxTokPlan", "maxTokNotes"]) {
    $(id).addEventListener("input", refreshAllCosts);
  }
}

function syncModelList() {
  const c = state.providers.get($("provSelect").value);
  const dl = $("modelDatalist");
  dl.innerHTML = "";
  // Step 3: user-managed models first, then the discovered cache (union,
  // deduped) — same list the AI Chat page shows for this provider.
  for (const m of modelSuggestions(c)) {
    const o = document.createElement("option");
    o.value = m;
    dl.appendChild(o);
  }
  // NOTE (RC-4): this must NOT touch the model value. The reset happens only
  // on a provider change (wireProviderBar); resetting here would wipe a
  // user's typed model on every unrelated re-render.
  updateKeyBadge();
  refreshAllCosts();
}

function updateKeyBadge() {
  const host = $("provKeyBadge");
  host.innerHTML = "";
  const id = $("provSelect").value;
  if (!id) return;
  const b = document.createElement("span");
  const c = state.providers.get(id);
  if (c && !state.providers.needsKey(c)) {
    b.className = "badge ok";
    b.textContent = "Free · no key needed";
  } else if (state.providers.hasKey(id)) {
    b.className = "badge ok";
    b.textContent = "Key saved";
  } else {
    b.className = "badge warn";
    b.textContent = "No key set · add it in AI Chat";
  }
  host.appendChild(b);
}

/** Validate provider + key + model BEFORE any transmission. Throws friendly. */
function resolveProvider() {
  const id = $("provSelect").value;
  const config = state.providers.get(id);
  if (!config) throw new Error("Choose a provider first (add one in AI Chat).");
  // ExamElm needs no user key (the same-origin proxy carries the site's
  // key); every other provider still requires one before sending.
  const key = state.providers.needsKey(id) ? state.providers.getKey(id) : ""; // AIError with plain language when missing
  const model = $("provModel").value.trim();
  if (!model) throw new Error("Enter a model ID (or discover models in AI Chat).");
  return { config, key, model };
}

function setCost(elId, promptText, maxTokens) {
  const el = $(elId);
  if (!el) return;
  const model = $("provModel") && $("provModel").value.trim();
  if (!model) {
    el.textContent = "";
    return;
  }
  const est = estimateCost(model, promptText, maxTokens);
  el.textContent = !est.known
    ? `Nothing is sent until you press Send.`
    : est.free
      ? `Free model · estimated cost $0. Nothing is sent until you press Send.`
      : `Estimated max cost ≈ ${formatUsd(est.estCostUsd)} (estimate). Nothing is sent until you press Send.`;
}

/* ==================== shared streaming send flow ==================== */

function setBusy(sendBtn, stopBtn, on) {
  state.streaming = on;
  if (sendBtn) sendBtn.disabled = on;
  if (stopBtn) stopBtn.hidden = !on;
}

/**
 * Single shared send path. Validates provider config, streams tokens into
 * outputEl via renderMarkdown, supports cancel. Returns
 * {text, providerId, model, maxTokens} or null (error/cancel/validation).
 */
async function runStream({ messages, maxTokens, outputEl, sendBtn, stopBtn, placeholder }) {
  if (state.streaming) {
    toast("Wait for the current request to finish.");
    return null;
  }
  let prov;
  try {
    prov = resolveProvider();
  } catch (e) {
    toast(friendly(e));
    return null;
  }
  saveLastUsed(prov.config.id, prov.model);
  const maxTok = clampNum(maxTokens, 100, 8000, 1000);
  const adapter = state.providers.adapterForConfig(prov.config);
  const withKey = { ...prov.config, apiKey: prov.key };

  outputEl.hidden = false;
  outputEl.innerHTML = "";
  const ph = document.createElement("p");
  ph.className = "hint";
  ph.textContent = placeholder || "Thinking…";
  outputEl.appendChild(ph);

  setBusy(sendBtn, stopBtn, true);
  state.aborter = new AbortController();
  let text = "";
  let reasoning = "";
  let started = false;
  try {
    const res = await streamChat({
      adapter,
      config: withKey,
      messages,
      model: prov.model,
      maxTokens: maxTok,
      signal: state.aborter.signal,
      onToken: (t) => {
        if (!started) {
          outputEl.innerHTML = "";
          started = true;
        }
        text += t;
        outputEl.innerHTML = renderMarkdown(text); // safe: escaped before formatting
      },
      onReasoning: (_t, full) => {
        // Reasoning models think before they answer: show the thinking
        // live, so the output never looks stalled while the model works.
        reasoning = full;
        if (!started) {
          outputEl.innerHTML = '<p class="hint">Thinking…</p>' + renderMarkdown(full);
        }
      },
    });
    text = res.text;
    reasoning = res.reasoning || reasoning;
    if (!text) {
      // No answer arrived, even after the non-streaming fallback: say so
      // plainly instead of leaving an empty output. Keep the model's
      // thinking (when there is any) so the user can read what it did.
      const note = "The model returned no response — try another model.";
      outputEl.innerHTML = reasoning
        ? renderMarkdown(reasoning + "\n\n" + note)
        : '<p class="hint">' + note + "</p>";
    }
    return { text, providerId: prov.config.id, model: prov.model, maxTokens: maxTok };
  } catch (err) {
    outputEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "hint";
    const cancelled = err instanceof AIError && err.code === "aborted";
    // Keys auto-persist encrypted, so a missing key simply means none was
    // ever entered for this provider — point at Settings.
    let msg = friendly(err);
    if (!cancelled && err instanceof AIError && err.code === "invalid-key") {
      msg = missingKeyMessage();
    }
    p.textContent = cancelled ? "Cancelled." : "Couldn't complete: " + msg;
    outputEl.appendChild(p);
    if (!cancelled) toast(msg);
    return null;
  } finally {
    setBusy(sendBtn, stopBtn, false);
    state.aborter = null;
  }
}

function wireStop(btnId) {
  $(btnId).addEventListener("click", () => {
    if (state.aborter) state.aborter.abort();
  });
}

/* ==================== TAB 1: Context Chat ==================== */

async function loadMaterials() {
  let notes = [];
  let files = [];
  try {
    notes = await state.storage.list("notes", { reverse: true });
  } catch {
    notes = [];
  }
  try {
    files = await state.storage.list("files", { reverse: true });
  } catch {
    files = [];
  }
  state.notes = notes || [];
  state.files = files || [];
  // Resolve file texts once (cached); never silently skip a file.
  for (const f of state.files) {
    await resolveFileText(f);
  }
  renderCtxLists();
  populateNoteSelects();
}

function isTextFile(rec) {
  const mime = String(rec.mime || "");
  const name = String(rec.name || "");
  return mime.startsWith("text/") || /\.(txt|md|csv)$/i.test(name);
}

function isDocxFile(rec) {
  const mime = String(rec.mime || "");
  const name = String(rec.name || "");
  return /\.docx$/i.test(name) || mime.includes("wordprocessingml");
}

function isPdfFile(rec) {
  const mime = String(rec.mime || "");
  const name = String(rec.name || "");
  return mime === "application/pdf" || /\.pdf$/i.test(name);
}

/** Resolve a file's text once; cache it. Never throws. */
async function resolveFileText(rec) {
  if (fileTextCache.has(rec.id)) return fileTextCache.get(rec.id);
  let text = "";
  let extractable = false;
  let note = "";
  try {
    if (rec.text) {
      text = String(rec.text);
      extractable = true;
    } else if (isTextFile(rec) && rec.blob) {
      text = await rec.blob.text();
      extractable = true;
    } else if (isDocxFile(rec) && rec.blob) {
      text = await extractDocxText(await rec.blob.arrayBuffer());
      extractable = true;
    } else if (isPdfFile(rec)) {
      note = "text extraction not available";
    } else {
      note = "not a text file";
    }
  } catch {
    text = "";
    extractable = false;
    note = "text extraction not available";
  }
  const entry = { text: String(text || "").slice(0, 200000), extractable, note };
  fileTextCache.set(rec.id, entry);
  return entry;
}

function renderCtxLists() {
  // Preserve the user's current selection across re-renders.
  const checked = new Set(
    [...document.querySelectorAll('#panelCtx input[type="checkbox"]:checked')].map(
      (cb) => cb.dataset.kind + ":" + cb.dataset.id
    )
  );
  const notesBox = $("ctxNotes");
  const filesBox = $("ctxFiles");
  notesBox.innerHTML = "";
  filesBox.innerHTML = "";

  if (!state.notes.length && !state.files.length) {
    $("ctxNoMaterials").hidden = false;
  } else {
    $("ctxNoMaterials").hidden = true;
  }

  for (const n of state.notes) {
    const body = String(n.body || "");
    notesBox.appendChild(
      ctxItemRow("note", n.id, noteTitle(n), `${body.length.toLocaleString()} chars`, true, "", checked)
    );
  }
  for (const f of state.files) {
    const e = fileTextCache.get(f.id) || { text: "", extractable: false, note: "text extraction not available" };
    const meta = e.extractable
      ? `${e.text.length.toLocaleString()} chars`
      : String(f.size ? formatFileSize(f.size) : "");
    filesBox.appendChild(
      ctxItemRow("file", f.id, String(f.name || "file"), meta, e.extractable, e.extractable ? "" : e.note, checked)
    );
  }
  refreshCtxPreview();
}

function ctxItemRow(kind, id, name, meta, extractable, note, checked) {
  const label = document.createElement("label");
  label.className = "checkline";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.dataset.kind = kind;
  cb.dataset.id = id;
  cb.setAttribute("aria-label", `Include ${kind} ${name}`);
  if (!extractable) {
    cb.disabled = true;
    label.style.opacity = "0.6";
  } else if (checked && checked.has(kind + ":" + id)) {
    cb.checked = true;
  }
  const span = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = name;
  span.appendChild(strong);
  span.appendChild(document.createTextNode(" "));
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = kind;
  span.appendChild(badge);
  if (meta) {
    span.appendChild(document.createElement("br"));
    const m = document.createElement("span");
    m.className = "list-item-meta";
    m.textContent = meta;
    span.appendChild(m);
  }
  if (note) {
    span.appendChild(document.createTextNode(" "));
    const nb = document.createElement("span");
    nb.className = "badge warn";
    nb.textContent = note;
    span.appendChild(nb);
  }
  label.append(cb, span);
  return label;
}

function formatFileSize(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "";
  if (v < 1024) return v + " B";
  if (v < 1048576) return Math.round(v / 1024) + " KB";
  return (v / 1048576).toFixed(1) + " MB";
}

/** Build the selected items with resolved text (preview AND send use this). */
function selectedCtxItems() {
  const items = [];
  document.querySelectorAll('#panelCtx input[type="checkbox"]:checked').forEach((cb) => {
    const kind = cb.dataset.kind;
    const id = cb.dataset.id;
    if (kind === "note") {
      const n = state.notes.find((x) => x.id === id);
      if (n) items.push({ kind: "note", id, name: noteTitle(n), text: String(n.body || "") });
    } else {
      const f = state.files.find((x) => x.id === id);
      const e = fileTextCache.get(id);
      if (f && e && e.extractable) {
        items.push({ kind: "file", id, name: String(f.name || "file"), text: e.text });
      }
    }
  });
  return items;
}

function ctxMaxTokens() {
  return clampNum($("maxTokCtx").value, 100, 8000, TOKEN_LIMITS.chat);
}

async function refreshCtxPreview() {
  const items = selectedCtxItems();
  const assembly = assembleContext(items);
  const box = $("ctxPreview");
  box.innerHTML = "";
  if (!assembly.parts.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Select notes or files above to see exactly what will be sent.";
    box.appendChild(p);
  } else {
    const ul = document.createElement("ul");
    ul.className = "topic-list";
    for (const p of assembly.parts) {
      const li = document.createElement("li");
      li.className = "topic-row";
      const nm = document.createElement("span");
      nm.className = "t-name";
      nm.textContent = p.name;
      const meta = document.createElement("span");
      meta.className = "list-item-meta";
      meta.textContent = `${p.kind} · ${p.includedChars.toLocaleString()}/${p.chars.toLocaleString()} chars`;
      li.append(nm, meta);
      if (p.truncated) {
        const b = document.createElement("span");
        b.className = "badge warn";
        b.textContent = "truncated";
        li.appendChild(b);
      }
      ul.appendChild(li);
    }
    box.appendChild(ul);
    const total = document.createElement("p");
    total.className = "hint";
    total.textContent =
      `Total ${assembly.totalChars.toLocaleString()} chars ` +
      `(~${estimateTokens(assembly.payload).toLocaleString()} prompt tokens est.) ` +
      `across ${assembly.itemCount} item${assembly.itemCount === 1 ? "" : "s"}.`;
    box.appendChild(total);
    if (assembly.droppedCount > 0) {
      const w = document.createElement("p");
      w.className = "hint";
      w.textContent = `${assembly.droppedCount} item(s) dropped · at most ${CTX.MAX_ITEMS} items are sent per request.`;
      box.appendChild(w);
    }
    if (assembly.truncatedAny) {
      const w = document.createElement("p");
      w.className = "hint";
      w.textContent = "Some items were truncated to fit the context budget · see the rows above.";
      box.appendChild(w);
    }
  }
  const canSend = assembly.parts.length > 0 && $("ctxQuestion").value.trim().length > 0;
  $("ctxSend").disabled = !canSend;
  // Cost basis = the exact messages that will be sent.
  try {
    const messages = chatContextMessages(assembly, $("ctxQuestion").value);
    setCost("costCtx", messages.map((m) => m.content).join("\n"), ctxMaxTokens());
  } catch {
    /* preview-only; send re-validates */
  }
}

function wireCtx() {
  $("panelCtx").addEventListener("change", (e) => {
    if (e.target.matches('input[type="checkbox"]')) refreshCtxPreview();
  });
  $("ctxQuestion").addEventListener("input", refreshCtxPreview);
  $("ctxQuestion").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendCtx();
    }
  });
  $("ctxSend").addEventListener("click", sendCtx);
  wireStop("ctxStop");
}

async function sendCtx() {
  if (state.streaming) return;
  const items = selectedCtxItems();
  if (!items.length) {
    toast("Select at least one note or file first.");
    return;
  }
  const question = $("ctxQuestion").value.trim();
  if (!question) {
    toast("Type a question first.");
    return;
  }
  const assembly = assembleContext(items);
  const messages = chatContextMessages(assembly, question);
  setCost("costCtx", messages.map((m) => m.content).join("\n"), ctxMaxTokens());
  const res = await runStream({
    messages,
    maxTokens: ctxMaxTokens(),
    outputEl: $("ctxOutput"),
    sendBtn: $("ctxSend"),
    stopBtn: $("ctxStop"),
  });
  if (!res) return;
  // Save the Q/A exchange to the conversations store (same shape as AI Chat).
  try {
    await state.storage.put("conversations", {
      id: state.storage.newId("conv"),
      title: "Study materials: " + question.slice(0, 40),
      providerId: res.providerId,
      model: res.model,
      maxTokens: res.maxTokens,
      messages: [
        {
          role: "user",
          content: `QUESTION:\n${question}\n\n(Materials: ${assembly.parts.map((p) => p.name).join(", ")})`,
          ts: Date.now(),
        },
        { role: "assistant", content: res.text, ts: Date.now() },
      ],
      createdAt: new Date().toISOString(),
    });
    toast("Answer saved to conversations (see AI Chat).");
  } catch {
    toast("Answer received, but couldn't save it to conversations.");
  }
  $("ctxQuestion").value = "";
  refreshCtxPreview();
}

/* ============ shared: note selects for tabs 2, 3, 5 ============ */

function populateNoteSelects() {
  for (const id of ["cardNote", "quizNote", "noteActionNote"]) {
    const sel = $(id);
    const prev = sel.value;
    sel.innerHTML = "";
    if (!state.notes.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "No notes yet · add some in My Study Space";
      sel.appendChild(o);
    }
    for (const n of state.notes) {
      const o = document.createElement("option");
      o.value = n.id;
      o.textContent = noteTitle(n);
      sel.appendChild(o);
    }
    if (prev && state.notes.some((n) => n.id === prev)) sel.value = prev;
  }
  refreshNotesMeta();
}

function noteById(id) {
  return state.notes.find((n) => n.id === id) || null;
}

/** Resolve source text for flashcards/quiz: pasted text wins, else the picked note. */
function sourceText(pasteId, selectId) {
  const paste = $(pasteId).value.trim();
  if (paste) return { text: paste, kind: "paste", name: "Pasted text" };
  const n = noteById($(selectId).value);
  if (!n) return null;
  return { text: String(n.body || ""), kind: "note", name: noteTitle(n) };
}

/** Reload the notes cache and re-render everything that depends on notes. */
async function refreshNotesCache() {
  try {
    state.notes = (await state.storage.list("notes", { reverse: true })) || [];
  } catch {
    /* keep stale cache rather than wiping the UI */
  }
  populateNoteSelects();
  renderCtxLists();
  refreshNotesMeta();
}

/* ==================== TAB 2: Flashcards ==================== */

function cardsMaxTokens() {
  return clampNum($("maxTokCards").value, 100, 8000, TOKEN_LIMITS.flashcards);
}

function wireCards() {
  $("cardNote").addEventListener("change", refreshCardsCost);
  $("cardPaste").addEventListener("input", refreshCardsCost);
  $("cardCount").addEventListener("input", refreshCardsCost);
  $("cardGen").addEventListener("click", generateCards);
  wireStop("cardStop");
  $("cardStage").addEventListener("click", flipCard);
  $("cardStage").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      flipCard();
    }
  });
  $("btnCardFlip").addEventListener("click", flipCard);
  $("btnCardPrev").addEventListener("click", () => stepCard(-1));
  $("btnCardNext").addEventListener("click", () => stepCard(1));
  $("btnKnown").addEventListener("click", () => markCard(true));
  $("btnUnknown").addEventListener("click", () => markCard(false));
  $("btnSaveDeck").addEventListener("click", saveCurrentDeck);
  $("deckList").addEventListener("click", onDeckAction);
}

function refreshCardsCost() {
  try {
    const src = sourceText("cardPaste", "cardNote");
    const count = clampNum($("cardCount").value, 1, 50, 12);
    setCost("costCards", src ? flashcardPrompt(src.text, count) : "", cardsMaxTokens());
  } catch {
    /* preview-only */
  }
}

async function generateCards() {
  if (state.streaming) return;
  const src = sourceText("cardPaste", "cardNote");
  if (!src || !src.text.trim()) {
    toast("Pick a note or paste some text first.");
    return;
  }
  const count = clampNum($("cardCount").value, 1, 50, 12);
  const prompt = flashcardPrompt(src.text, count);
  setCost("costCards", prompt, cardsMaxTokens());
  const statusEl = $("cardsStatus");
  const res = await runStream({
    messages: [{ role: "user", content: prompt }],
    maxTokens: cardsMaxTokens(),
    outputEl: statusEl,
    sendBtn: $("cardGen"),
    stopBtn: $("cardStop"),
    placeholder: "Generating flashcards…",
  });
  if (!res) return;
  const cards = parseFlashcards(res.text);
  if (!cards.length) {
    statusEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Couldn't parse any cards from the reply · try again, or ask for a simpler format.";
    statusEl.appendChild(p);
    return;
  }
  statusEl.innerHTML = "";
  statusEl.hidden = true;
  startCardReview(
    cards,
    null,
    src.kind === "note" ? { kind: "note", name: src.name } : { kind: "paste", name: "Pasted text" }
  );
  toast(`${cards.length} cards generated · review them below.`);
}

function startCardReview(cards, deckId, source) {
  state.review = {
    deckId: deckId || null,
    source: source || null,
    cards: cards.map((c) => ({ front: c.front, back: c.back, known: !!c.known })),
    idx: 0,
    flipped: false,
  };
  if (!deckId) $("deckName").value = "";
  renderCard();
  $("cardsReview").hidden = false;
  $("cardsReview").scrollIntoView({ block: "nearest" });
}

function renderCard() {
  const r = state.review;
  if (!r || !r.cards.length) return;
  const card = r.cards[r.idx];
  $("cardCounter").textContent = `Card ${r.idx + 1} of ${r.cards.length}`;
  const stage = $("cardStage");
  stage.innerHTML = "";
  const face = document.createElement("div");
  face.className = "msg-body";
  const label = document.createElement("p");
  label.className = "hint";
  label.textContent = r.flipped ? "Answer · activate to see the question" : "Question · activate to see the answer";
  const txt = document.createElement("p");
  txt.textContent = r.flipped ? card.back : card.front;
  txt.style.fontSize = "1.1rem";
  face.append(label, txt);
  stage.appendChild(face);
  const kb = $("cardKnownBadge");
  kb.textContent = card.known ? "Known" : "Not marked yet";
  kb.className = "badge" + (card.known ? " ok" : "");
  $("btnCardPrev").disabled = r.idx === 0;
  $("btnCardNext").disabled = r.idx === r.cards.length - 1;
}

function flipCard() {
  if (!state.review) return;
  state.review.flipped = !state.review.flipped;
  renderCard();
}

function stepCard(dir) {
  const r = state.review;
  if (!r) return;
  const next = r.idx + dir;
  if (next < 0 || next >= r.cards.length) return;
  r.idx = next;
  r.flipped = false;
  renderCard();
}

function markCard(known) {
  const r = state.review;
  if (!r) return;
  r.cards[r.idx].known = known;
  renderCard();
  if (r.idx < r.cards.length - 1) stepCard(1);
  else toast(known ? "Marked known." : "Marked unknown.");
}

async function saveCurrentDeck() {
  const r = state.review;
  if (!r || !r.cards.length) {
    toast("Generate or open a deck first.");
    return;
  }
  const name = $("deckName").value.trim() || "Untitled deck";
  try {
    const saved = await saveDeck(state.storage, {
      id: r.deckId || undefined,
      name,
      cards: r.cards,
      source: r.source,
    });
    state.review.deckId = saved.id;
    $("deckName").value = saved.name;
    await renderDecks();
    toast(`Deck "${saved.name}" saved.`);
  } catch (e) {
    toast(friendly(e));
  }
}

async function renderDecks() {
  const box = $("deckList");
  box.innerHTML = "";
  let decks = [];
  try {
    decks = await listDecks(state.storage);
  } catch {
    decks = [];
  }
  if (!decks.length) {
    const d = document.createElement("div");
    d.className = "empty";
    const p = document.createElement("p");
    p.textContent = "No saved decks yet. Generate cards above, review them, and save the deck.";
    d.appendChild(p);
    box.appendChild(d);
    return;
  }
  for (const d of decks) {
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "0.8rem";
    const t = document.createElement("div");
    t.className = "list-item-title";
    t.textContent = d.name;
    const m = document.createElement("div");
    m.className = "list-item-meta";
    const known = d.cards.filter((c) => c.known).length;
    let when = "";
    try {
      when = new Date(d.updatedAt || d.createdAt).toLocaleString();
    } catch {
      when = "";
    }
    m.textContent = `${d.cards.length} cards · ${known} known` + (when ? ` · saved ${when}` : "");
    const row = document.createElement("div");
    row.className = "btn-row left";
    row.style.marginTop = "0.6rem";
    for (const [act, label] of [["open", "Open"], ["export", "Export JSON"], ["delete", "Delete"]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-sm" + (act === "delete" ? " btn-ghost danger" : act === "open" ? " btn-primary" : " btn-ghost");
      b.textContent = label;
      b.dataset.act = act;
      b.dataset.id = d.id;
      row.appendChild(b);
    }
    card.append(t, m, row);
    box.appendChild(card);
  }
}

async function onDeckAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  let decks = [];
  try {
    decks = await listDecks(state.storage);
  } catch {
    decks = [];
  }
  const deck = decks.find((d) => d.id === id);
  if (!deck) {
    toast("Deck not found.");
    return;
  }
  if (act === "open") {
    $("deckName").value = deck.name;
    startCardReview(deck.cards, deck.id, deck.source);
    activateTab("cards");
    toast(`Opened "${deck.name}".`);
  } else if (act === "export") {
    const blob = new Blob([JSON.stringify(deck, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = deck.name.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) + ".json" || "flashcards.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    toast("Deck exported as JSON.");
  } else if (act === "delete") {
    if (!confirm(`Delete the deck "${deck.name}"? This cannot be undone.`)) return;
    try {
      await deleteDeck(state.storage, id);
      if (state.review && state.review.deckId === id) {
        state.review.deckId = null;
        $("cardsReview").hidden = true;
      }
      await renderDecks();
      toast("Deck deleted.");
    } catch (err) {
      toast(friendly(err));
    }
  }
}

/* ==================== TAB 3: Quiz ==================== */

function quizMaxTokens() {
  return clampNum($("maxTokQuiz").value, 100, 8000, TOKEN_LIMITS.quiz);
}

function wireQuiz() {
  $("quizNote").addEventListener("change", refreshQuizCost);
  $("quizPaste").addEventListener("input", refreshQuizCost);
  $("quizMcq").addEventListener("input", refreshQuizCost);
  $("quizShort").addEventListener("input", refreshQuizCost);
  $("quizGen").addEventListener("click", generateQuiz);
  wireStop("quizStop");
  $("quizSubmit").addEventListener("click", submitQuiz);
  $("btnSaveAttempt").addEventListener("click", saveCurrentAttempt);
}

function refreshQuizCost() {
  try {
    const src = sourceText("quizPaste", "quizNote");
    const mcq = clampNum($("quizMcq").value, 0, 20, 5);
    const short = clampNum($("quizShort").value, 0, 10, 3);
    setCost("costQuiz", src ? quizPrompt(src.text, { mcq, short }) : "", quizMaxTokens());
  } catch {
    /* preview-only */
  }
}

async function generateQuiz() {
  if (state.streaming) return;
  const src = sourceText("quizPaste", "quizNote");
  if (!src || !src.text.trim()) {
    toast("Pick a note or paste some text first.");
    return;
  }
  const mcq = clampNum($("quizMcq").value, 0, 20, 5);
  const short = clampNum($("quizShort").value, 0, 10, 3);
  if (mcq + short < 1) {
    toast("Set at least one question (multiple-choice or short answer).");
    return;
  }
  const prompt = quizPrompt(src.text, { mcq, short });
  setCost("costQuiz", prompt, quizMaxTokens());
  const statusEl = $("quizStatus");
  const res = await runStream({
    messages: [{ role: "user", content: prompt }],
    maxTokens: quizMaxTokens(),
    outputEl: statusEl,
    sendBtn: $("quizGen"),
    stopBtn: $("quizStop"),
    placeholder: "Generating quiz…",
  });
  if (!res) return;
  const questions = parseQuiz(res.text);
  if (!questions.length) {
    statusEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Couldn't parse any questions from the reply · try again, or reduce the number of questions.";
    statusEl.appendChild(p);
    return;
  }
  statusEl.innerHTML = "";
  statusEl.hidden = true;
  state.quiz = { questions, sourceName: src.name, result: null };
  $("quizTakeTitle").textContent = `Quiz · ${src.name}`;
  $("attemptName").value = src.name.slice(0, 70) + " quiz";
  renderQuizTake();
  $("quizTakeWrap").hidden = false;
  $("quizResultsWrap").hidden = true;
  $("quizTakeWrap").scrollIntoView({ block: "nearest" });
  toast(`${questions.length} questions generated · answer them below.`);
}

function renderQuizTake() {
  const box = $("quizTake");
  box.innerHTML = "";
  state.quiz.questions.forEach((q, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.background = "var(--bg-soft)";
    const head = document.createElement("p");
    head.style.fontWeight = "700";
    head.style.marginTop = "0";
    head.textContent = `${i + 1}. ${q.question}`;
    card.appendChild(head);
    const tag = document.createElement("span");
    tag.className = "badge";
    tag.textContent = q.type === "mcq" ? "multiple choice" : "short answer";
    card.appendChild(tag);
    if (q.type === "mcq") {
      const opts = document.createElement("div");
      opts.style.display = "grid";
      opts.style.gap = "0.4rem";
      opts.style.marginTop = "0.6rem";
      q.options.forEach((opt, oi) => {
        const lab = document.createElement("label");
        lab.className = "checkline";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `qans${i}`;
        radio.value = String(oi);
        const span = document.createElement("span");
        span.textContent = `${"ABCD"[oi]}. ${opt}`;
        lab.append(radio, span);
        opts.appendChild(lab);
      });
      card.appendChild(opts);
    } else {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.id = `qshort${i}`;
      inp.placeholder = "Your answer";
      inp.style.marginTop = "0.6rem";
      inp.style.width = "100%";
      card.appendChild(inp);
    }
    box.appendChild(card);
  });
}

function submitQuiz() {
  const qz = state.quiz;
  if (!qz) return;
  const answers = {};
  qz.questions.forEach((q, i) => {
    if (q.type === "mcq") {
      const sel = document.querySelector(`input[name="qans${i}"]:checked`);
      answers[i] = sel ? Number(sel.value) : "";
    } else {
      const inp = $("qshort" + i);
      answers[i] = inp ? inp.value : "";
    }
  });
  const result = scoreQuiz(qz.questions, answers);
  qz.result = result;
  renderQuizResults(result);
  $("quizResultsWrap").hidden = false;
  $("quizResultsWrap").scrollIntoView({ block: "nearest" });
}

function renderQuizResults(result) {
  $("quizScoreLine").textContent =
    `Score: ${result.score} / ${result.scorable} scorable` +
    (result.total !== result.scorable ? ` (${result.total} questions total)` : "");
  const box = $("quizResults");
  box.innerHTML = "";
  const qs = state.quiz.questions;
  result.details.forEach((d) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.background = "var(--bg-soft)";
    const head = document.createElement("p");
    head.style.fontWeight = "700";
    head.style.marginTop = "0";
    head.textContent = `${d.index + 1}. ${qs[d.index].question}`;
    card.appendChild(head);
    const badge = document.createElement("span");
    if (!d.scorable) {
      badge.className = "badge warn";
      badge.textContent = "no answer key · not counted";
    } else {
      badge.className = "badge " + (d.correct ? "ok" : "bad");
      badge.textContent = d.correct ? "correct" : "incorrect";
    }
    card.appendChild(badge);
    const rows = [
      ["Your answer", d.givenLabel],
      ["Expected", d.expectedLabel],
    ];
    if (d.explanation) rows.push(["Why", d.explanation]);
    for (const [k, v] of rows) {
      const p = document.createElement("p");
      p.style.margin = "0.35rem 0";
      const b = document.createElement("strong");
      b.textContent = k + ": ";
      const s = document.createElement("span");
      s.textContent = v;
      p.append(b, s);
      card.appendChild(p);
    }
    box.appendChild(card);
  });
}

async function saveCurrentAttempt() {
  const qz = state.quiz;
  if (!qz || !qz.result) {
    toast("Submit the quiz first.");
    return;
  }
  const r = qz.result;
  try {
    await saveAttempt(state.storage, {
      title: $("attemptName").value.trim() || qz.sourceName + " quiz",
      score: r.score,
      total: r.total,
      scorable: r.scorable,
      details: r.details,
    });
    await renderAttempts();
    toast("Attempt saved.");
  } catch (e) {
    toast(friendly(e));
  }
}

async function renderAttempts() {
  const box = $("attemptList");
  box.innerHTML = "";
  let attempts = [];
  try {
    attempts = await listAttempts(state.storage);
  } catch {
    attempts = [];
  }
  if (!attempts.length) {
    const d = document.createElement("div");
    d.className = "empty";
    const p = document.createElement("p");
    p.textContent = "No attempts yet. Generate a quiz, take it, and save your score.";
    d.appendChild(p);
    box.appendChild(d);
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "topic-list";
  for (const a of attempts.slice(0, 50)) {
    const li = document.createElement("li");
    li.className = "topic-row";
    const nm = document.createElement("span");
    nm.className = "t-name";
    nm.textContent = a.title || "Quiz";
    const meta = document.createElement("span");
    meta.className = "list-item-meta";
    let when = "";
    try {
      when = new Date(a.createdAt).toLocaleString();
    } catch {
      when = "";
    }
    meta.textContent = `${a.score}/${a.scorable} scorable` + (when ? ` · ${when}` : "");
    li.append(nm, meta);
    ul.appendChild(li);
  }
  box.appendChild(ul);
}

/* ==================== TAB 4: Study Planner ==================== */

function planMaxTokens() {
  return clampNum($("maxTokPlan").value, 100, 8000, TOKEN_LIMITS.planner);
}

async function initPlannerSubjects() {
  let subjects = [];
  try {
    const rec = await state.storage.get("kv", TRACKER_KV_KEY);
    if (rec && rec.value && Array.isArray(rec.value.subjects)) subjects = rec.value.subjects;
  } catch {
    subjects = [];
  }
  state.subjects = subjects;
  renderPlanSubjects();
}

function renderPlanSubjects() {
  const subs = state.subjects;
  $("planNoSubjects").hidden = subs.length > 0;
  $("planForm").hidden = subs.length === 0;
  if (!subs.length) return;
  const box = $("planSubjects");
  box.innerHTML = "";
  const todayISO = toISODate(todayLocal());
  let summary = [];
  try {
    summary = summarizeTracker(subs, todayISO);
  } catch {
    summary = [];
  }
  subs.forEach((s, i) => {
    const sum = summary[i] || {};
    const row = document.createElement("div");
    row.className = "topic-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.dataset.subj = s.id;
    cb.setAttribute("aria-label", `Include ${s.name || "subject"}`);
    const mid = document.createElement("span");
    mid.className = "t-name";
    const nm = document.createElement("strong");
    nm.textContent = s.name || "Untitled subject";
    mid.appendChild(nm);
    const meta = document.createElement("span");
    meta.className = "list-item-meta";
    const cov = sum.coveragePct === null || sum.coveragePct === undefined ? "no topics yet" : `${sum.coveragePct}% covered`;
    const weak = (sum.weakestTopics || []).slice(0, 2).join(", ");
    meta.textContent =
      (s.examDate ? `Exam ${s.examDate} · ` : "No exam date · ") +
      cov +
      (weak ? ` · weakest: ${weak}` : "");
    meta.style.display = "block";
    mid.appendChild(meta);
    const prioWrap = document.createElement("label");
    prioWrap.className = "hint";
    prioWrap.textContent = "Priority ";
    const prio = document.createElement("select");
    prio.dataset.prio = s.id;
    prio.setAttribute("aria-label", `Priority for ${s.name || "subject"}`);
    for (const v of [1, 2, 3]) {
      const o = document.createElement("option");
      o.value = String(v);
      o.textContent = v === 1 ? "1 (highest)" : String(v);
      if (v === 2) o.selected = true;
      prio.appendChild(o);
    }
    prioWrap.appendChild(prio);
    row.append(cb, mid, prioWrap);
    box.appendChild(row);
  });
  refreshPlanCost();
}

function planSelection() {
  return state.subjects.filter((s) => {
    const cb = document.querySelector(`#planSubjects input[data-subj="${CSS.escape(s.id)}"]`);
    return cb && cb.checked;
  });
}

function planPriority(id) {
  const sel = document.querySelector(`#planSubjects select[data-prio="${CSS.escape(id)}"]`);
  return sel ? clampNum(sel.value, 1, 3, 2) : 2;
}

function planDailyMinutes() {
  return clampNum($("planDaily").value, 1, 960, 120);
}

function planHorizonDays() {
  return clampNum($("planHorizon").value, 1, 60, 14);
}

function wirePlan() {
  $("planSubjects").addEventListener("change", refreshPlanCost);
  $("planDaily").addEventListener("input", refreshPlanCost);
  $("planHorizon").addEventListener("input", refreshPlanCost);
  $("planGen").addEventListener("click", generatePlan);
  wireStop("planStop");
  $("btnSavePlanNote").addEventListener("click", savePlanNote);
  $("btnOpenTimetable").addEventListener("click", openPlanInTimetable);
}

function refreshPlanCost() {
  try {
    if (!state.subjects.length) return;
    const included = planSelection();
    const summary = summarizeTracker(included, toISODate(todayLocal()));
    setCost("costPlan", plannerPrompt(summary, { dailyMinutes: planDailyMinutes(), horizonDays: planHorizonDays() }), planMaxTokens());
  } catch {
    /* preview-only */
  }
}

async function generatePlan() {
  if (state.streaming) return;
  const included = planSelection();
  const dailyMinutes = planDailyMinutes();
  const horizonDays = planHorizonDays();
  const errors = validatePlannerInput({
    subjects: included.map((s) => ({ name: s.name })),
    dailyMinutes,
  });
  const errBox = $("planErrors");
  errBox.innerHTML = "";
  if (errors.length) {
    const ul = document.createElement("ul");
    for (const msg of errors) {
      const li = document.createElement("li");
      li.textContent = msg;
      ul.appendChild(li);
    }
    errBox.appendChild(ul);
    return;
  }
  const summary = summarizeTracker(included, toISODate(todayLocal()));
  const prompt = plannerPrompt(summary, { dailyMinutes, horizonDays });
  setCost("costPlan", prompt, planMaxTokens());
  const res = await runStream({
    messages: [{ role: "user", content: prompt }],
    maxTokens: planMaxTokens(),
    outputEl: $("planOut"),
    sendBtn: $("planGen"),
    stopBtn: $("planStop"),
    placeholder: "Drafting your study plan…",
  });
  if (!res) return;
  state.plan = { included, dailyMinutes, horizonDays };
  $("planDraft").value = res.text;
  $("planDraftWrap").hidden = false;
  $("planDraftWrap").scrollIntoView({ block: "nearest" });
  toast("Plan drafted · edit it freely, then save or open it in the timetable generator.");
}

async function savePlanNote() {
  const body = $("planDraft").value;
  if (!body.trim()) {
    toast("The plan draft is empty · nothing to save.");
    return;
  }
  try {
    await state.storage.put("notes", {
      id: state.storage.newId("note"),
      title: "Study plan · " + toISODate(todayLocal()),
      body,
      folderId: null,
      createdAt: new Date().toISOString(),
    });
    await refreshNotesCache();
    toast("Plan saved to My Study Space notes.");
  } catch (e) {
    toast("Couldn't save the note: " + friendly(e));
  }
}

function openPlanInTimetable() {
  const plan = state.plan;
  if (!plan) {
    toast("Generate a plan first.");
    return;
  }
  try {
    // Structured inputs · never the AI's prose.
    const draft = {
      subjects: plan.included.map((s) => ({
        name: s.name,
        priority: planPriority(s.id),
        examDate: s.examDate || null,
      })),
      exams: plan.included
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s.examDate || "")))
        .map((s) => ({
          name: `${String(s.name || "Subject").trim()} exam`,
          date: s.examDate,
          subjectName: s.name,
        })),
      dailyMinutes: plan.dailyMinutes,
      sessionMin: 50,
      startDate: toISODate(todayLocal()),
    };
    const input = plannerDraftToTimetable(draft); // throws plain-language errors
    const code = encodeShare(input);
    // The timetable tool reads #plan=<code> on load and prefills the form.
    location.href = "/tools/timetable/#plan=" + encodeURIComponent(code);
  } catch (e) {
    toast(friendly(e));
  }
}

/* ==================== TAB 5: Notes Assistant ==================== */

function notesMaxTokens() {
  return clampNum($("maxTokNotes").value, 100, 8000, TOKEN_LIMITS.notes);
}

function wireNotes() {
  $("noteActionNote").addEventListener("change", refreshNotesMeta);
  document.querySelectorAll("[data-naction]").forEach((btn) => {
    btn.addEventListener("click", () => runNoteAction(btn.dataset.naction, btn));
  });
  wireStop("noteActStop");
  $("btnReplaceNote").addEventListener("click", applyNoteReplace);
  $("btnAppendNote").addEventListener("click", applyNoteAppend);
}

function currentNoteRec() {
  return noteById($("noteActionNote").value);
}

function refreshNotesMeta() {
  const rec = currentNoteRec();
  const meta = $("noteActionMeta");
  const prev = $("noteActionPreviewText");
  if (!rec) {
    meta.textContent = "No notes yet · add some in My Study Space.";
    prev.textContent = "";
    setCost("costNotes", "", notesMaxTokens());
    return;
  }
  const body = String(rec.body || "");
  prev.textContent = body.slice(0, 500) + (body.length > 500 ? "…" : "");
  meta.textContent = `Full note will be sent: ${body.length.toLocaleString()} chars.`;
  try {
    setCost("costNotes", noteActionPrompt(state.noteAction, body), notesMaxTokens());
  } catch {
    /* preview-only */
  }
}

async function runNoteAction(action, btn) {
  if (state.streaming) return;
  const rec = currentNoteRec();
  if (!rec) {
    toast("Pick a note first.");
    return;
  }
  const text = String(rec.body || "");
  if (!text.trim()) {
    toast("This note is empty · nothing to process.");
    return;
  }
  state.noteAction = action;
  const label = NOTE_ACTION_LABEL[action] || action;
  const prompt = noteActionPrompt(action, text);
  setCost("costNotes", prompt, notesMaxTokens());
  const res = await runStream({
    messages: [{ role: "user", content: prompt }],
    maxTokens: notesMaxTokens(),
    outputEl: $("noteActOut"),
    sendBtn: btn,
    stopBtn: $("noteActStop"),
    placeholder: `${label}…`,
  });
  if (!res) return;
  const applied = applyNoteAction(text, res.text, "preview"); // NEVER mutates
  state.noteActOutput = applied.preview;
  state.noteActRecId = rec.id;
  $("noteActActions").hidden = false;
  $("noteActActions").scrollIntoView({ block: "nearest" });
  toast("Preview ready · review it, then choose Replace or Append. Nothing has changed yet.");
}

async function applyNoteReplace() {
  const rec = await state.storage.get("notes", state.noteActRecId);
  if (!rec) {
    toast("That note no longer exists.");
    return;
  }
  if (
    !confirm(
      `Replace the entire note "${noteTitle(rec)}" with the AI output?\n\nThe original text will be lost. This cannot be undone.`
    )
  ) {
    return;
  }
  const { text } = applyNoteAction(String(rec.body || ""), state.noteActOutput, "replace");
  try {
    await state.storage.put("notes", { ...rec, body: text });
    await afterNoteMutation();
    toast("Note replaced.");
  } catch (e) {
    toast("Couldn't update the note: " + friendly(e));
  }
}

async function applyNoteAppend() {
  const rec = await state.storage.get("notes", state.noteActRecId);
  if (!rec) {
    toast("That note no longer exists.");
    return;
  }
  if (
    !confirm(
      `Append the AI output to the end of the note "${noteTitle(rec)}"?\n\nThe original text will be kept.`
    )
  ) {
    return;
  }
  const { text } = applyNoteAction(String(rec.body || ""), state.noteActOutput, "append");
  try {
    await state.storage.put("notes", { ...rec, body: text });
    await afterNoteMutation();
    toast("Output appended to the note.");
  } catch (e) {
    toast("Couldn't update the note: " + friendly(e));
  }
}

async function afterNoteMutation() {
  state.noteActOutput = "";
  state.noteActRecId = null;
  $("noteActOut").innerHTML = "";
  $("noteActOut").hidden = true;
  $("noteActActions").hidden = true;
  await refreshNotesCache();
}

/* ==================== cost refresh across tabs ==================== */

function refreshAllCosts() {
  try {
    refreshCtxPreview();
  } catch {
    /* materials may not be loaded yet */
  }
  try {
    refreshCardsCost();
  } catch {}
  try {
    refreshQuizCost();
  } catch {}
  try {
    refreshPlanCost();
  } catch {}
  try {
    refreshNotesMeta();
  } catch {}
}
