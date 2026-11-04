/**
 * Grade calculator tests (pure module — no DOM, no browser).
 * Every vector below comes from files/regional-grading.md (official sources).
 * Run: node tests/run.js
 */
import {
  roundValue,
  gradePointsFor,
  applyRetakeMode,
  computeGPA,
  requiredFinal,
  convertLinear,
  convertPiecewise,
  cbseLegacyToPct,
  estimateGpaToPct,
  bandFor,
  weightedYearMark,
  applyBestOfN,
} from "../assets/js/grade.js";
import { validateRegion } from "../assets/js/regions.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HALF2 = { mode: "half_up", decimals: 2 };

/* ---------- rounding ---------- */
test("roundValue: half_up pins 3.635 -> 3.64", () => {
  assertEq(roundValue(3.635, HALF2), 3.64);
});
test("roundValue: truncate pins 3.639 -> 3.63", () => {
  assertEq(roundValue(3.639, { mode: "truncate", decimals: 2 }), 3.63);
});
test("roundValue: ceiling (MU engineering) 58.15 -> 59", () => {
  assertEq(roundValue(58.15, { mode: "ceiling", decimals: 0 }), 59);
});

/* ---------- US ---------- */
const US_TENTHS = { "A+": 4.0, A: 4.0, "A-": 3.7, "B+": 3.3, B: 3.0, "B-": 2.7, "C+": 2.3, C: 2.0, "C-": 1.7, "D+": 1.3, D: 1.0, "D-": 0.7, F: 0.0 };

test("US tenths: A(3cr)+B+(4cr)+A-(3cr) = 3.63", () => {
  const r = computeGPA(
    [
      { name: "Calc", credits: 3, grade: "A" },
      { name: "Phys", credits: 4, grade: "B+" },
      { name: "Chem", credits: 3, grade: "A-" },
    ],
    US_TENTHS,
    HALF2
  );
  assertEq(r.gpa, 3.63); // (12 + 13.2 + 11.1) / 10
  assertEq(r.totalCredits, 10);
});

test("US college-board whole-letter: A+B+C = 3.00", () => {
  const map = { A: 4.0, B: 3.0, C: 2.0, D: 1.0, F: 0.0 };
  const r = computeGPA(
    [
      { name: "a", credits: 3, grade: "A" },
      { name: "b", credits: 3, grade: "B" },
      { name: "c", credits: 3, grade: "C" },
    ],
    map,
    HALF2
  );
  assertEq(r.gpa, 3.0);
});

test("US thirds: A- = 3.67, B+ = 3.33", () => {
  assertEq(gradePointsFor("A-", { "A-": 3.67 }), 3.67);
  assertEq(gradePointsFor("B+", { "B+": 3.33 }), 3.33);
});

test("US A+ 4.33 variant", () => {
  assertEq(gradePointsFor("A+", { "A+": 4.33 }), 4.33);
});

test("US weighted: AP A counts 5.0 via direct points", () => {
  const r = computeGPA(
    [
      { name: "AP Calc", credits: 3, points: 5.0 },
      { name: "English", credits: 3, grade: "B" },
    ],
    US_TENTHS,
    HALF2
  );
  assertEq(r.gpa, 4.0); // (15 + 9) / 6
});

test("US retake replace keeps latest; average keeps both", () => {
  const courses = [
    { name: "Bio", credits: 3, grade: "F" },
    { name: "Bio", credits: 3, grade: "B" },
  ];
  const replaced = computeGPA(applyRetakeMode(courses, "replace"), US_TENTHS, HALF2);
  assertEq(replaced.gpa, 3.0);
  const averaged = computeGPA(applyRetakeMode(courses, "average"), US_TENTHS, HALF2);
  assertEq(averaged.gpa, 1.5);
});

test("US: W/excluded and zero-credit courses skipped in denominator", () => {
  const r = computeGPA(
    [
      { name: "Hist", credits: 3, grade: "A" },
      { name: "Dropped", credits: 3, grade: "W", excluded: true },
      { name: "Lab", credits: 0, grade: "A" },
    ],
    US_TENTHS,
    HALF2
  );
  assertEq(r.gpa, 4.0);
  assertEq(r.totalCredits, 3);
  assertEq(r.excludedCount, 1);
});

/* ---------- invalid inputs ---------- */
test("grade outside the region scale throws naming the course", () => {
  assertThrows(
    () => computeGPA([{ name: "Math", credits: 3, grade: "Z" }], US_TENTHS, HALF2),
    '"Math"'
  );
});
test("negative credits rejected", () => {
  assertThrows(() => computeGPA([{ name: "Math", credits: -3, grade: "A" }], US_TENTHS, HALF2), "credits");
});
test("empty course list rejected", () => {
  assertThrows(() => computeGPA([], US_TENTHS, HALF2), "at least one course");
});
test("gradePointsFor is case-insensitive", () => {
  assertEq(gradePointsFor("a-", US_TENTHS), 3.7);
});

/* ---------- VTU (scheme split — wrong scheme = ±7.5) ---------- */
test("VTU 2021+ scheme: CGPA 8.5 -> 85.0", () => {
  assertEq(convertLinear(8.5, 10, 0), 85.0);
});
test("VTU 2015-2018 scheme: CGPA 8.5 -> 77.5", () => {
  assertEq(convertLinear(8.5, 10, -7.5), 77.5);
});

/* ---------- Mumbai University (piecewise, ceiling) ---------- */
const MU_PIECES = [
  { lt: 7, a: 7.1, b: 12 },
  { lt: Infinity, a: 7.4, b: 12 },
];
test("MU engg: CGPI 6.5 -> ceil(58.15) = 59", () => {
  assertEq(roundValue(convertPiecewise(6.5, MU_PIECES), { mode: "ceiling", decimals: 0 }), 59);
});
test("MU engg: CGPI 7.0 boundary uses >= 7 piece -> 64", () => {
  assertEq(roundValue(convertPiecewise(7.0, MU_PIECES), { mode: "ceiling", decimals: 0 }), 64);
});
test("MU engg: CGPI 8.2 -> ceil(72.68) = 73", () => {
  assertEq(roundValue(convertPiecewise(8.2, MU_PIECES), { mode: "ceiling", decimals: 0 }), 73);
});

/* ---------- CBSE legacy ---------- */
test("CBSE legacy CCE: CGPA 9.0 -> 85.5 (indicative, pre-2018 only)", () => {
  assertEq(cbseLegacyToPct(9.0), 85.5);
});
test("CBSE legacy: 10 CGPA = 95%, not 100%", () => {
  assertEq(cbseLegacyToPct(10), 95);
});

/* ---------- NEB ---------- */
const NEB_MAP = { "A+": 4.0, A: 3.6, "B+": 3.2, B: 2.8, "C+": 2.4, C: 2.0, D: 1.6, NG: 0.0 };
test("NEB credit-weighted: A(4ch)+B+(3ch) = 3.43", () => {
  const r = computeGPA(
    [
      { name: "Math", credits: 4, grade: "A" },
      { name: "English", credits: 3, grade: "B+" },
    ],
    NEB_MAP,
    HALF2
  );
  assertEq(r.gpa, 3.43); // (14.4 + 9.6) / 7
});
test("NEB: NG counts as 0.0 grade points", () => {
  const r = computeGPA(
    [
      { name: "Math", credits: 4, grade: "A" },
      { name: "Failed", credits: 2, grade: "NG" },
    ],
    NEB_MAP,
    HALF2
  );
  assertEq(r.gpa, 2.4); // 14.4 / 6
});
test("NEB %->letter bands: 85 -> A, 34.9 -> NG", () => {
  const bands = [
    { min: 90, max: 100, label: "A+" },
    { min: 80, max: 89.99, label: "A" },
    { min: 35, max: 39.99, label: "D" },
    { min: 0, max: 34.99, label: "NG" },
  ];
  assertEq(bandFor(85, bands).label, "A");
  assertEq(bandFor(34.9, bands).label, "NG");
});
test("NEB GPA->% is estimate-only helper (gpa x 25)", () => {
  assertEq(estimateGpaToPct(3.6), 90);
});

/* ---------- Singapore NUS/NTU ---------- */
const SG_MAP = { "A+": 5.0, A: 5.0, "A-": 4.5, "B+": 4.0, B: 3.5, "B-": 3.0, "C+": 2.5, C: 2.0, "D+": 1.5, D: 1.0, F: 0.0 };
test("NUS: A(4u)+B+(4u), S excluded, F included at 0", () => {
  const r = computeGPA(
    [
      { name: "CS1010", credits: 4, grade: "A" },
      { name: "MA1521", credits: 4, grade: "B+" },
      { name: "CFG", credits: 2, grade: "S", excluded: true },
      { name: "Failed", credits: 4, grade: "F" },
    ],
    SG_MAP,
    HALF2
  );
  assertEq(r.gpa, 3.0); // (20 + 16 + 0) / 12
  assertEq(r.excludedCount, 1);
});
test("NUS honours bands: 4.5 -> Highest Distinction, 3.2 -> Honours", () => {
  const bands = [
    { min: 4.5, max: 5.0, label: "Highest Distinction" },
    { min: 4.0, max: 4.49, label: "Distinction" },
    { min: 3.5, max: 3.99, label: "Merit" },
    { min: 3.0, max: 3.49, label: "Honours" },
    { min: 2.0, max: 2.99, label: "Pass" },
  ];
  assertEq(bandFor(4.5, bands).label, "Highest Distinction");
  assertEq(bandFor(3.2, bands).label, "Honours");
});

/* ---------- UK ---------- */
test("UK: year weighting 0/50/50 on 68 + 72 -> 70 -> First", () => {
  const mark = weightedYearMark(
    [
      { mark: 68, credits: 120 },
      { mark: 72, credits: 120 },
    ],
    [0.5, 0.5]
  );
  assertEq(mark, 70);
  const bands = [
    { min: 70, max: 100, label: "First-class honours" },
    { min: 60, max: 69.99, label: "Upper second (2:1)" },
    { min: 50, max: 59.99, label: "Lower second (2:2)" },
    { min: 40, max: 49.99, label: "Third" },
    { min: 0, max: 39.99, label: "Fail" },
  ];
  assertEq(bandFor(mark, bands).label, "First-class honours");
  assertEq(bandFor(68, bands).label, "Upper second (2:1)");
});

/* ---------- required-final ---------- */
test("required-final: current 80, final 40%, target 85 -> 92.5", () => {
  assertEq(requiredFinal(80, 40, 85), { needed: 92.5 });
});
test("required-final impossible: current 85, final 30%, target 90 -> max 89.5", () => {
  assertEq(requiredFinal(85, 30, 90), { impossible: true, maxPossible: 89.5 });
});
test("required-final already met: current 95, final 10%, target 85", () => {
  assertEq(requiredFinal(95, 10, 85), { needed: 0, alreadyMet: true });
});
test("required-final rejects weight 0 and out-of-range inputs", () => {
  assertThrows(() => requiredFinal(80, 0, 90), "between 0 and 100 (exclusive)");
  assertThrows(() => requiredFinal(120, 40, 90), "between 0 and 100");
});

/* ---------- ICSE/ISC best-of-N ---------- */
test("ICSE best-5 with English forced: drops CS 60, aggregate 84", () => {
  const r = applyBestOfN(
    [
      { name: "English", pct: 90 },
      { name: "Math", pct: 80 },
      { name: "Science", pct: 85 },
      { name: "SST", pct: 70 },
      { name: "Hindi", pct: 95 },
      { name: "CS", pct: 60 },
    ],
    5,
    ["English"]
  );
  assertEq(r.aggregate, 84); // (90+95+85+80+70)/5
  assertEq(r.dropped.map((d) => d.name), ["CS"]);
  assertEq(r.selected.length, 5);
});
test("best-of-N rejects marks over 100", () => {
  assertThrows(() => applyBestOfN([{ name: "Math", pct: 120 }], 5, ["English"]), "between 0 and 100");
});

/* ---------- config integrity: every shipped region validates ---------- */
test("all region configs validate against the schema + carry sources", async () => {
  const ids = ["_default", "us", "uk", "in-cbse", "in-icse", "in-vtu", "in-mumbai", "np-neb", "sg-nus-ntu"];
  for (const id of ids) {
    const obj = JSON.parse(await readFile(path.join(__dirname, "..", "config", "regions", id + ".json"), "utf8"));
    validateRegion(obj);
    for (const f of ["supersedes", "traps", "unverified", "sources"]) {
      assert(f in obj, `${id} missing "${f}"`);
    }
    assert(Array.isArray(obj.sources), `${id} sources must be an array`);
    if (id !== "_default") assert(obj.sources.length > 0, `${id} ships no official sources`);
    if (id !== "_default") assert(obj.traps.length > 0, `${id} documents no traps`);
  }
});

test("US config ships 4 scale presets incl. default tenths", async () => {
  const obj = JSON.parse(await readFile(path.join(__dirname, "..", "config", "regions", "us.json"), "utf8"));
  assertEq(obj.presets.length, 4);
  assert(obj.presets.some((p) => p.is_default), "a default preset must be marked");
  assertEq(obj.presets.find((p) => p.is_default).grade_map["A-"], 3.7);
});

test("VTU config ships both schemes with distinct formulas", async () => {
  const obj = JSON.parse(await readFile(path.join(__dirname, "..", "config", "regions", "in-vtu.json"), "utf8"));
  assertEq(obj.schemes.length, 2);
  assert(obj.schemes[0].formula !== obj.schemes[1].formula, "schemes must differ");
});

test("NEB config labels GPA->% an estimate and documents the 8-band table", async () => {
  const obj = JSON.parse(await readFile(path.join(__dirname, "..", "config", "regions", "np-neb.json"), "utf8"));
  assertEq(obj.percentage_estimate.status, "estimate-only");
  assertEq(obj.percentage_bands.length, 8);
  assert(obj.unverified.some((u) => u.includes("no official formula")), "must flag the missing formula");
});

test("config machine params: VTU schemes reproduce the doc vectors", async () => {
  const obj = JSON.parse(await readFile(path.join(__dirname, "..", "config", "regions", "in-vtu.json"), "utf8"));
  const s2021 = obj.schemes.find((s) => s.id === "2021-plus");
  const sOld = obj.schemes.find((s) => s.id === "2015-2018");
  assert(s2021.linear && sOld.linear, "schemes must carry machine linear params");
  assertEq(roundValue(convertLinear(8.5, s2021.linear.a, s2021.linear.b), HALF2), 85.0);
  assertEq(roundValue(convertLinear(8.5, sOld.linear.a, sOld.linear.b), HALF2), 77.5);
});

test("config machine params: MU pieces reproduce the doc vectors", async () => {
  const obj = JSON.parse(await readFile(path.join(__dirname, "..", "config", "regions", "in-mumbai.json"), "utf8"));
  const pieces = obj.formulas[0].pieces.map((p) => ({ lt: p.lt === null ? Infinity : p.lt, a: p.a, b: p.b }));
  const ceil0 = { mode: "ceiling", decimals: 0 };
  assertEq(roundValue(convertPiecewise(6.5, pieces), ceil0), 59);
  assertEq(roundValue(convertPiecewise(7.0, pieces), ceil0), 64);
  assertEq(roundValue(convertPiecewise(8.2, pieces), ceil0), 73);
});

test("config machine params: CBSE legacy and NEB estimate linears", async () => {
  const cbse = JSON.parse(await readFile(path.join(__dirname, "..", "config", "regions", "in-cbse.json"), "utf8"));
  assertEq(convertLinear(9.0, cbse.legacy_conversion.linear.a, cbse.legacy_conversion.linear.b), 85.5);
  const neb = JSON.parse(await readFile(path.join(__dirname, "..", "config", "regions", "np-neb.json"), "utf8"));
  assertEq(convertLinear(3.6, neb.percentage_estimate.linear.a, neb.percentage_estimate.linear.b), 90);
});
