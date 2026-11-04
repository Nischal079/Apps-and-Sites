/**
 * StudyPilot — grade calculation engine.
 *
 * PURE, DOM-free ES module: no browser APIs, no imports. Node tests import
 * this directly. All regional math is DATA-driven (config/regions/*.json);
 * this module implements the generic operations. Never hard-code a regional
 * formula here — resolve parameters from the active region config first.
 *
 * Rounding lives in the config ({mode, decimals}) because GPA math lives or
 * dies on rounding. Every config ships test vectors pinning its behavior.
 */

/**
 * Round a value per a rounding spec {mode: 'half_up'|'truncate'|'ceiling', decimals}.
 * 'ceiling' ignores decimals (rounds UP to next integer — MU engineering).
 */
export function roundValue(value, rounding) {
  const mode = (rounding && rounding.mode) || "half_up";
  const decimals = (rounding && Number.isInteger(rounding.decimals)) ? rounding.decimals : 2;
  if (!Number.isFinite(value)) throw new Error("roundValue: non-finite value");
  if (mode === "ceiling") return Math.ceil(value - 1e-9);
  const f = Math.pow(10, decimals);
  if (mode === "truncate") {
    return (value >= 0 ? Math.floor(value * f) : Math.ceil(value * f)) / f;
  }
  // half_up (default)
  return Math.round(value * f + Number.EPSILON) / f;
}

/** Grade token -> points via a grade map. Returns null when the token is unknown. */
export function gradePointsFor(token, gradeMap) {
  if (!token || !gradeMap) return null;
  const key = String(token).trim().toUpperCase();
  // Grade maps use canonical upper-case keys ("A+", "B-"); try exact then upper.
  if (Object.prototype.hasOwnProperty.call(gradeMap, token)) return gradeMap[token];
  if (Object.prototype.hasOwnProperty.call(gradeMap, key)) return gradeMap[key];
  return null;
}

/**
 * Apply a retake policy to a course list. Groups by name (case-insensitive).
 * 'replace' keeps only the latest attempt per course; 'average' keeps all.
 * Courses: [{name, credits, grade?, points?, excluded?}]
 */
export function applyRetakeMode(courses, mode) {
  if (mode !== "replace") return courses.slice();
  const seen = new Set();
  const out = [];
  for (let i = courses.length - 1; i >= 0; i--) {
    const c = courses[i];
    const k = String(c.name || "").trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.unshift(c);
  }
  return out;
}

/**
 * Weighted GPA = Σ(points × credits) / Σ(credits).
 * - courses: [{name, credits, grade?, points?, excluded?}]
 * - grade: token looked up in gradeMap; points: used directly (weighted courses).
 * - excluded courses (S/U, W, ...) and zero-credit courses are skipped in the
 *   denominator but reported.
 * - throws a plain-language Error naming the offending course on bad input.
 */
export function computeGPA(courses, gradeMap, rounding) {
  if (!Array.isArray(courses) || courses.length === 0) {
    throw new Error("Add at least one course to calculate a GPA.");
  }
  let num = 0;
  let den = 0;
  let counted = 0;
  let excludedCount = 0;
  for (const c of courses) {
    if (c.excluded) {
      excludedCount++;
      continue;
    }
    const credits = Number(c.credits);
    if (!Number.isFinite(credits) || credits < 0) {
      throw new Error(`"${c.name || "Unnamed course"}": credits must be 0 or more.`);
    }
    if (credits === 0) continue; // zero-credit: no weight, not an error
    let points = null;
    if (c.points !== undefined && c.points !== null && c.points !== "") {
      points = Number(c.points);
      if (!Number.isFinite(points) || points < 0) {
        throw new Error(`"${c.name || "Unnamed course"}": grade points must be 0 or more.`);
      }
    } else {
      points = gradePointsFor(c.grade, gradeMap);
      if (points === null) {
        throw new Error(
          `"${c.name || "Unnamed course"}": grade "${c.grade}" is not on this region's scale.`
        );
      }
    }
    num += points * credits;
    den += credits;
    counted++;
  }
  if (den === 0) {
    throw new Error("No credit-bearing courses to average — add credits or un-exclude a course.");
  }
  return {
    gpa: roundValue(num / den, rounding),
    raw: num / den,
    totalCredits: den,
    counted,
    excludedCount,
  };
}

/**
 * "What do I need on the final?"  needed = (target − (1−w) × current) / w.
 * All inputs are percentages (0–100); finalWeightPct is the final's weight (0–100, exclusive).
 * Returns {needed} rounded to 2dp, or {impossible: true, maxPossible} when even
 * 100% on the final cannot reach the target, or {needed: 0, alreadyMet: true}.
 */
export function requiredFinal(currentPct, finalWeightPct, targetPct) {
  const cur = Number(currentPct);
  const w = Number(finalWeightPct) / 100;
  const tgt = Number(targetPct);
  if (![cur, w, tgt].every(Number.isFinite)) throw new Error("Enter numbers for current %, final weight % and target %.");
  if (cur < 0 || cur > 100) throw new Error("Current % must be between 0 and 100.");
  if (tgt < 0 || tgt > 100) throw new Error("Target % must be between 0 and 100.");
  if (!(w > 0 && w < 1)) throw new Error("Final weight % must be between 0 and 100 (exclusive).");
  const needed = (tgt - (1 - w) * cur) / w;
  if (needed > 100) {
    return { impossible: true, maxPossible: roundValue((1 - w) * cur + w * 100, { mode: "half_up", decimals: 2 }) };
  }
  if (needed <= 0) return { needed: 0, alreadyMet: true };
  return { needed: roundValue(needed, { mode: "half_up", decimals: 2 }) };
}

/** Linear conversion: a*x + b (VTU schemes resolve to this form). */
export function convertLinear(x, a, b) {
  const v = Number(x);
  if (!Number.isFinite(v)) throw new Error("Enter a number to convert.");
  return Number(a) * v + Number(b);
}

/**
 * Piecewise conversion (MU engineering). pieces: [{lt, a, b}] — first piece
 * with x < lt wins; the last piece should have lt: Infinity.
 */
export function convertPiecewise(x, pieces) {
  const v = Number(x);
  if (!Number.isFinite(v)) throw new Error("Enter a number to convert.");
  for (const p of pieces) {
    if (v < p.lt) return p.a * v + p.b;
  }
  throw new Error("No conversion piece matched — check the input range.");
}

/** CBSE legacy (pre-2018 CCE) indicative conversion. Gate the UI call on the legacy checkbox. */
export function cbseLegacyToPct(cgpa) {
  const v = Number(cgpa);
  if (!Number.isFinite(v) || v < 0 || v > 10) throw new Error("CGPA must be between 0 and 10.");
  return v * 9.5;
}

/**
 * GPA → percentage estimate. There is NO official formula for several systems
 * (notably NEB) — callers MUST label the result "estimate".
 */
export function estimateGpaToPct(gpa) {
  const v = Number(gpa);
  if (!Number.isFinite(v) || v < 0) throw new Error("Enter a GPA of 0 or more.");
  return v * 25;
}

/**
 * Band lookup: first band with min <= value <= max wins.
 * Used for UK degree classification and NEB %-to-letter bands.
 */
export function bandFor(value, bands) {
  const v = Number(value);
  if (!Number.isFinite(v)) throw new Error("Enter a number for band lookup.");
  for (const b of bands || []) {
    if (v >= b.min && v <= b.max) return b;
  }
  return null;
}

/**
 * UK-style weighted mark: per-year mark = Σ(module mark × credits)/Σ(credits),
 * overall = Σ(year mark × weight). years: [{mark, credits}], weights: [w1, w2, ...].
 */
export function weightedYearMark(years, weights) {
  if (!Array.isArray(years) || !Array.isArray(weights) || years.length !== weights.length) {
    throw new Error("Years and weightings must line up.");
  }
  let overall = 0;
  for (let i = 0; i < years.length; i++) {
    const { mark, credits } = years[i];
    const m = Number(mark);
    const c = Number(credits);
    if (!Number.isFinite(m) || m < 0 || m > 100) throw new Error(`Year ${i + 1}: mark must be 0–100.`);
    if (!Number.isFinite(c) || c < 0) throw new Error(`Year ${i + 1}: credits must be 0 or more.`);
    void c; // credits documented per year; weighting is by year per UKSCQA models
    overall += m * Number(weights[i]);
  }
  return roundValue(overall, { mode: "half_up", decimals: 2 });
}

/**
 * Best-of-N selection with forced inclusions (ICSE/ISC English rule).
 * marks: [{name, pct}], n: how many count, forcedNames: always included.
 * Returns {selected, dropped, aggregate} where aggregate = mean of selected.
 */
export function applyBestOfN(marks, n, forcedNames) {
  if (!Array.isArray(marks) || marks.length === 0) throw new Error("Add at least one subject mark.");
  const forced = new Set((forcedNames || []).map((s) => String(s).trim().toLowerCase()));
  for (const m of marks) {
    const p = Number(m.pct);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      throw new Error(`"${m.name || "Unnamed subject"}": mark must be between 0 and 100.`);
    }
  }
  const forcedMarks = marks.filter((m) => forced.has(String(m.name).trim().toLowerCase()));
  const rest = marks
    .filter((m) => !forced.has(String(m.name).trim().toLowerCase()))
    .sort((a, b) => Number(b.pct) - Number(a.pct));
  const need = Math.max(0, n - forcedMarks.length);
  const selected = forcedMarks.concat(rest.slice(0, need));
  const selectedSet = new Set(selected);
  const dropped = marks.filter((m) => !selectedSet.has(m));
  const aggregate =
    selected.length === 0 ? 0 : selected.reduce((s, m) => s + Number(m.pct), 0) / selected.length;
  return {
    selected,
    dropped,
    aggregate: roundValue(aggregate, { mode: "half_up", decimals: 2 }),
  };
}
