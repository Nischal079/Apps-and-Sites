/**
 * StudyPilot — region configuration loader.
 *
 * Regions are DATA, not code: each education system is a JSON file under
 * config/regions/ validated against _schema.json. The grade calculator and
 * other tools consume these configs generically — adding a country means
 * adding one JSON file, never changing tool code.
 *
 * v1 ships `_default` (universal percentage fallback). Full regional configs
 * (US/UK/India/NEB/Singapore) land with the grade calculator build, authored
 * ONLY from files/regional-grading.md (verified formulas). See the schema for
 * required fields and the traps each region must honor.
 */
export const DEFAULT_REGION = "_default";

// Static registry for v1 — avoids a directory listing on static hosting.
const REGISTRY = [
  "_default",
  "us",
  "uk",
  "in-cbse",
  "in-icse",
  "in-vtu",
  "in-mumbai",
  "np-neb",
  "sg-nus-ntu",
];

const cache = new Map();

// Required top-level fields every region config must declare (mirrors _schema.json).
const REQUIRED = [
  "id",
  "name",
  "version",
  "effective_from",
  "scale_type",
  "max_points",
  "algorithm",
  "rounding",
  "credit",
  "grade_tokens",
  "input",
  "date_format",
  "week_start",
  "sources",
];

export function validateRegion(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Region config is not an object.");
  for (const f of REQUIRED) {
    if (obj[f] === undefined || obj[f] === null) {
      throw new Error(`Region config "${obj.id || "?"}": missing required field "${f}".`);
    }
  }
  if (!["gpa_4", "gpa_5", "gpa_10", "percentage", "classification_bands"].includes(obj.scale_type)) {
    throw new Error(`Region config "${obj.id}": unknown scale_type "${obj.scale_type}".`);
  }
  if (!["weighted_mean", "weighted_mean_with_bands", "best_of_n"].includes(obj.algorithm)) {
    throw new Error(`Region config "${obj.id}": unknown algorithm "${obj.algorithm}".`);
  }
  if (!obj.rounding || !["half_up", "truncate", "ceiling"].includes(obj.rounding.mode)) {
    throw new Error(`Region config "${obj.id}": rounding.mode must be half_up, truncate or ceiling.`);
  }
  return true;
}

export async function loadRegion(id) {
  const key = id || DEFAULT_REGION;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(`/config/regions/${key}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Region "${key}" not found (HTTP ${res.status}).`);
  const obj = await res.json();
  validateRegion(obj);
  cache.set(key, obj);
  return obj;
}

export function listRegions() {
  return REGISTRY.slice();
}

/** Locale (e.g. "en-US") -> default region id. Ambiguous -> _default. */
export function regionForLocale(locale) {
  const l = (locale || "").toLowerCase();
  if (l === "en-us") return "us";
  if (l === "en-gb") return "uk";
  if (l === "en-np" || l === "ne") return "np-neb";
  if (l === "en-sg") return "sg-nus-ntu";
  // en-IN spans CBSE/ICSE/state boards — too ambiguous to guess.
  return DEFAULT_REGION;
}
