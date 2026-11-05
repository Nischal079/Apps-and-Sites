/**
 * ExamElm · remember the last-used AI provider + model.
 *
 * Small preference, stored in localStorage (same policy as theme/region:
 * localStorage is for small preferences only). Shared by AI Chat and
 * AI Tools, so the provider and model you used last are already selected
 * when you come back, on either page.
 *
 * Shape: { providerId: string, model: string }. A stale providerId (a
 * provider that no longer exists) is ignored by callers and cleared.
 */

const KEY = "sp:ai:lastUsed";

export function loadLastUsed() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const providerId = typeof v.providerId === "string" ? v.providerId : "";
    const model = typeof v.model === "string" ? v.model : "";
    if (!providerId && !model) return null;
    return { providerId, model };
  } catch {
    return null;
  }
}

export function saveLastUsed(providerId, model) {
  try {
    const pid = String(providerId || "");
    const m = String(model || "").slice(0, 120);
    if (!pid && !m) return;
    localStorage.setItem(KEY, JSON.stringify({ providerId: pid, model: m }));
  } catch {
    /* private mode · selection just won't persist */
  }
}

export function clearLastUsed() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
