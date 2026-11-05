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
 * Message for a send that fails because no key is in memory. When the
 * provider was previously verified (its last connection test succeeded)
 * or was the last-used provider, the key was most likely lost on a page
 * reload (keys live in memory only unless encrypted storage is enabled),
 * so say that explicitly. Otherwise use the generic no-key message.
 * Pure; never includes key material (it only takes booleans).
 */
export function missingKeyMessage({ hadVerified = false, wasLastUsed = false } = {}) {
  if (hadVerified || wasLastUsed) {
    return "Your key was kept in memory only and was lost when the page reloaded · re-enter it in Settings, or enable encrypted storage.";
  }
  return "No API key is set for this provider. Enter the key (kept in memory only) or unlock encrypted storage.";
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
