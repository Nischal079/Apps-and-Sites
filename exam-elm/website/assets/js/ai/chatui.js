/**
 * ExamElm · AI Chat shell helpers (pure, no DOM, no network, no keys).
 *
 * Used by aichat.js for the llama.ui-style shell: sidebar session search,
 * Today/Earlier grouping, and the empty-state suggestion chips. Kept pure
 * so the logic is unit-testable in node (see tests/aichat-ui.test.js).
 * The conversation store's data model is untouched · rows are read only.
 */

/** The four empty-state suggestion chips, in display order. */
export const SUGGESTION_CHIPS = [
  "Explain photosynthesis in simple terms",
  "Quiz me on calculus basics",
  "Make a study plan for my exams",
  "Summarize my notes",
];

/**
 * Reset rule for switching providers: a model belongs to exactly one
 * provider, so the model field is always reset to the new provider's
 * default (or blank when it has none). The previous model is never
 * carried across providers. Pure; see tests/aichat-provider-fixes.test.js.
 * `prevModel` is intentionally ignored — it only documents what was there.
 */
export function modelForProviderChange(prevModel, newDefaultModel) {
  return newDefaultModel || "";
}

/**
 * Message for a send that fails because no key is set. Keys are now
 * auto-persisted encrypted in this browser, so a missing key simply means
 * none was ever entered for this provider — point at Settings. The flags
 * are accepted (callers pass what they have) and intentionally ignored.
 * Pure; never includes key material (it only takes booleans).
 */
export function missingKeyMessage({ hadVerified = false, wasLastUsed = false } = {}) {
  void hadVerified;
  void wasLastUsed;
  return "No API key is set for this provider. Add its key in Settings.";
}

/**
 * The provider's user-managed model list (Step 3 data model).
 * Returns `config.models` when it is a non-empty array, else
 * `[config.defaultModel]` when one is set, else `[]`. Never mutates the
 * config: the returned list is a fresh, exact-match deduped copy with
 * order preserved. Pure; see tests/provider-models.test.js.
 */
export function modelsForProvider(config) {
  if (!config) return [];
  if (Array.isArray(config.models) && config.models.length) {
    const out = [];
    for (const m of config.models) {
      if (typeof m !== "string" || !m) continue;
      if (!out.includes(m)) out.push(m);
    }
    return out;
  }
  const dm = typeof config.defaultModel === "string" ? config.defaultModel.trim() : "";
  return dm ? [dm] : [];
}

/**
 * Only the configs that can be chatted with: those having at least one
 * configured model (via modelsForProvider). Key status is deliberately
 * NOT a filter — a provider with models but no key is still listed, and
 * the UI shows no-key guidance for it separately. Pure.
 */
export function usableProviders(configs) {
  if (!Array.isArray(configs)) return [];
  return configs.filter((c) => modelsForProvider(c).length > 0);
}

/**
 * Clamp a max-tokens value to an integer in 1..128000; unparseable input
 * (empty, non-numeric, null/undefined) falls back to 1024.
 * Returns { value, clamped } where clamped is true whenever the returned
 * value differs from a clean parse of the input. costs.js was checked
 * first (2026-11-05): it holds prices only, no per-model token limits,
 * so the flat 1..128000 range applies to every model. Pure.
 */
export const MAX_TOKENS_MIN = 1;
export const MAX_TOKENS_MAX = 128000;
export const MAX_TOKENS_DEFAULT = 1024;

export function validateMaxTokens(value) {
  if (value === null || value === undefined || typeof value === "boolean") {
    return { value: MAX_TOKENS_DEFAULT, clamped: true };
  }
  if (typeof value === "string" && value.trim() === "") {
    return { value: MAX_TOKENS_DEFAULT, clamped: true };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return { value: MAX_TOKENS_DEFAULT, clamped: true };
  const int = Math.floor(n);
  if (int < MAX_TOKENS_MIN) return { value: MAX_TOKENS_MIN, clamped: true };
  if (int > MAX_TOKENS_MAX) return { value: MAX_TOKENS_MAX, clamped: true };
  return { value: int, clamped: int !== n };
}

/**
 * Accordion state for the Settings provider rows (Step 3 UI): exactly one
 * provider is expanded at a time, session-only. Clicking the expanded row
 * collapses it; clicking another row expands that one and collapses the
 * current one. Pure; see tests/aichat-settings-redesign.test.js.
 * `currentId` is the expanded provider id or null; `clickedId` the row
 * that was clicked (a falsy click leaves the state unchanged).
 */
export function accordionToggle(currentId, clickedId) {
  if (!clickedId) return currentId || null;
  return currentId === clickedId ? null : clickedId;
}

/**
 * Which add-form the Settings "+" menu shows (Step 3 UI). `currentForm`
 * is null | "provider" | "model"; `choice` is the menu item picked, or
 * null to close. Picking the already-open form closes it (a toggle);
 * picking the other form switches to it. Pure.
 */
export function nextAddForm(currentForm, choice) {
  if (!choice) return null;
  return currentForm === choice ? null : choice;
}

/**
 * Readiness of one provider for the Chat Model section (Step 3 UI):
 *   "none"    · no provider selected at all
 *   "no-model"· the provider has no configured model (nothing to chat with)
 *   "no-key"  · models exist but no API key is in memory
 *   "ready"   · models exist and a key is in memory
 * Key status is checked separately from the model list on purpose: the
 * Chat Model provider select already filters to usableProviders(), so a
 * provider can be listed there yet still need a key. Pure.
 */
export function providerReadiness(config, hasKey) {
  if (!config) return { kind: "none" };
  if (modelsForProvider(config).length === 0) return { kind: "no-model" };
  if (!hasKey) return { kind: "no-key" };
  return { kind: "ready" };
}

/**
 * Model suggestions for a provider's model datalist (Step 3 UI): the
 * provider's user-managed models first, then its discovered cache, exact-
 * match deduped, order preserved, capped at 200. Pure; shared by the AI
 * Chat and AI Tools pages so both lists agree.
 */
export function modelSuggestions(config) {
  if (!config) return [];
  const out = [];
  for (const m of modelsForProvider(config)) {
    if (!out.includes(m)) out.push(m);
  }
  const cache = Array.isArray(config.modelsCache) ? config.modelsCache : [];
  for (const m of cache) {
    if (typeof m !== "string" || !m) continue;
    if (!out.includes(m)) out.push(m);
  }
  return out.slice(0, 200);
}

/** Display title for a conversation row (the store leaves new chats titled). */
export function sessionTitle(row) {
  const t = row && typeof row.title === "string" ? row.title.trim() : "";
  return t || "Untitled chat";
}

/**
 * Filter conversation rows by title (case-insensitive substring).
 * An empty query returns the rows unchanged (same order, no copy needed
 * for callers that only read). Never mutates the input.
 */
export function filterSessions(rows, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => sessionTitle(r).toLowerCase().includes(q));
}

/** Local calendar date key (YYYY-MM-DD in the viewer's timezone). */
export function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Sortable date of a row: createdAt, else updatedAt, else null. */
export function sessionDate(row) {
  const raw = (row && (row.createdAt || row.updatedAt)) || null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Group rows into "Today" then "Earlier" (local calendar dates, viewer's
 * timezone). Rows already arrive newest-first and keep their order inside
 * each group. Empty groups are omitted. Rows with no usable date land in
 * "Earlier" rather than disappearing.
 */
export function groupSessions(rows, now = new Date()) {
  const todayKey = localDateKey(now);
  const today = [];
  const earlier = [];
  for (const r of rows) {
    const d = sessionDate(r);
    (d && localDateKey(d) === todayKey ? today : earlier).push(r);
  }
  const groups = [];
  if (today.length) groups.push({ label: "Today", items: today });
  if (earlier.length) groups.push({ label: "Earlier", items: earlier });
  return groups;
}
