/**
 * StudyPilot · shared UI utilities.
 * Imported by every page. No dependencies.
 */
import { BRAND } from "./config.js";

/** XSS-safe text rendering · ALWAYS use instead of innerHTML with user data. */
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------- Date helpers: DATE-ONLY arithmetic, always local ----------
 * MANDATE (arch review §2): never `new Date("2026-11-04")` · ISO date-only
 * strings parse as UTC midnight and shift the day west of UTC. Always build
 * via new Date(y, m-1, d). Countdowns/durations use integer day math, never
 * timestamp diffs, so DST transitions cannot corrupt them. */

export function parseDateInput(str) {
  // Accepts "YYYY-MM-DD" (from <input type="date">). Returns local Date or null.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || "").trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d) ? null : d;
}

export function toISODate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** User's local calendar date at call time (recompute on visibilitychange). */
export function todayLocal() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

/** Whole days from a to b (b - a), date-only. DST-safe by construction. */
export function daysBetween(a, b) {
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86400000);
}

export function fmtTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

/* ---------- Theme (light/dark) ---------- */
const THEME_KEY = "sp:theme";
export function initTheme() {
  const root = document.documentElement;
  const saved = (() => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  })();
  const apply = (t) => {
    root.dataset.theme = t;
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* private mode · theme just won't persist */
    }
  };
  apply(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) =>
    btn.addEventListener("click", () =>
      apply(root.dataset.theme === "dark" ? "light" : "dark")
    )
  );
}

/* ---------- Toast ---------- */
let toastEl = null;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 3200);
}

/* ---------- Brand injection ----------
 * Pages carry data-brand="name|tagline" placeholders; this fills them from
 * config.js so a rename touches one file. */
export function injectBrand(root = document) {
  root.querySelectorAll("[data-brand]").forEach((el) => {
    const k = el.getAttribute("data-brand");
    if (k === "name") el.textContent = BRAND.name;
    else if (k === "tagline") el.textContent = BRAND.tagline;
  });
  document.title = document.title.replace(/\{\{brand\}\}/g, BRAND.name);
  // JSON-LD placeholders get the same treatment so the brand name stays
  // centralized in config.js (a rename touches one file, not every page).
  root.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
    if (el.textContent.includes("{{brand}}")) {
      el.textContent = el.textContent.replace(/\{\{brand\}\}/g, BRAND.name);
    }
  });
}

/* ---------- Recompute-today helper ----------
 * Call on load AND visibilitychange so countdowns never go stale overnight.
 * dayRolledOver is the pure predicate (testable in node); onDayChange wires it
 * to visibilitychange/focus events. */
export function dayRolledOver(lastISO, now = new Date()) {
  return toISODate(now) !== lastISO;
}

export function onDayChange(cb) {
  let last = toISODate(todayLocal());
  const check = () => {
    const now = todayLocal();
    if (dayRolledOver(last, now)) {
      last = toISODate(now);
      cb(last);
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
  window.addEventListener("focus", check);
}
