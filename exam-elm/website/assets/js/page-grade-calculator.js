/**
 * StudyPilot · Grade calculator page controller.
 * Runs the shared site bootstrap, then wires region selection,
 * assessment rows, and the pure grade engine from assets/js/grade.js.
 */
import "/assets/js/site.js";

import { esc, toast } from "/assets/js/ui.js";
import { listRegions, loadRegion, regionForLocale } from "/assets/js/regions.js";
import {
  roundValue, gradePointsFor, applyRetakeMode, computeGPA, requiredFinal,
  convertLinear, convertPiecewise, cbseLegacyToPct, estimateGpaToPct,
  bandFor, weightedYearMark, applyBestOfN
} from "/assets/js/grade.js";

/* ============================================================
 * Grade Calculator · UI WIRING ONLY.
 * Every number comes from /assets/js/grade.js (the engine) fed by
 * config/regions/*.json. This file builds DOM, reads inputs,
 * validates in plain language, and renders results. No math here
 * beyond passing engine outputs through.
 * ============================================================ */

/* Shared site bootstrap (theme, brand, mobile menu, theme icon, service worker)
   now runs via /assets/js/site.js (side-effect import at the top of this module). */

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const DRAFT_KEY = "sp:grade:draft";
const regionCache = new Map();
const state = { regionId: null, cfg: null, preset: null, scheme: null, yearWeights: null };
let rowUid = 0;

async function getRegion(id) {
  if (!regionCache.has(id)) regionCache.set(id, await loadRegion(id));
  return regionCache.get(id);
}

function setError(msg) {
  const e = $("formError");
  if (!msg) { e.hidden = true; e.textContent = ""; return; }
  e.textContent = msg;
  e.hidden = false;
}

/** Parse a number input with a plain-language error. */
function numValue(el, label, min, max) {
  const v = Number(el.value);
  if (!Number.isFinite(v)) throw new Error(label + ": enter a number.");
  if (min !== undefined && v < min) throw new Error(label + ": must be " + min + " or more.");
  if (max !== undefined && v > max) throw new Error(label + ": must be " + max + " or less.");
  return v;
}

function sourcesHTML(sources) {
  if (!sources || !sources.length) return "";
  let h = '<p class="muted"><strong>Sources</strong></p><ul class="gc-sources">';
  for (const s of sources) {
    h += '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + "</a></li>";
  }
  return h + "</ul>";
}

function trapsHTML(cfg) {
  let h = "";
  if (cfg.traps && cfg.traps.length) {
    h += '<ul class="gc-meta-list">';
    for (const t of cfg.traps) h += "<li>⚠ " + esc(t) + "</li>";
    h += "</ul>";
  }
  if (cfg.unverified && cfg.unverified.length) {
    h += '<p class="muted"><strong>Not yet verified against a primary source:</strong></p><ul class="gc-meta-list">';
    for (const u of cfg.unverified) h += '<li><span class="badge">UNVERIFIED</span> ' + esc(u) + "</li>";
    h += "</ul>";
  }
  return h;
}

function renderRegionMeta(cfg) {
  let html = '<p class="muted">' + esc(cfg.notes) + "</p>" + trapsHTML(cfg);
  $("regionMeta").innerHTML = html;
}

/* ---------- result card ---------- */
function renderResult(cfg, r) {
  let html = '<p class="eyebrow">Result</p>';
  html += "<h2>" + esc(r.title) + "</h2>";
  html += '<p class="gc-big">' + esc(r.big) + "</p>";
  if (r.sub) html += '<p class="muted">' + esc(r.sub) + "</p>";
  if (r.badges && r.badges.length) {
    html += '<div class="gc-badges">';
    for (const b of r.badges) {
      html += '<span class="badge' + (b.kind ? " " + esc(b.kind) : "") + '">' + esc(b.text) + "</span>";
    }
    html += "</div>";
  }
  if (r.lines && r.lines.length) {
    html += "<div>";
    for (const l of r.lines) {
      html += '<div class="gc-kv"><span class="muted">' + esc(l[0]) + "</span><span><strong>" + esc(l[1]) + "</strong></span></div>";
    }
    html += "</div>";
  }
  if (r.extraHTML) html += r.extraHTML; // built with esc() at the call site
  html += '<div class="gc-formula"><p><strong>Formula used</strong></p><p>' + esc(r.formula) + "</p>";
  if (r.formulaNote) html += '<p class="muted">' + esc(r.formulaNote) + "</p>";
  html += "</div>";
  if (r.notes && r.notes.length) {
    html += '<ul class="gc-meta-list">';
    for (const n of r.notes) html += "<li>" + esc(n) + "</li>";
    html += "</ul>";
  }
  html += sourcesHTML(r.sources || cfg.sources);
  $("resultBody").innerHTML = html;
  $("result").hidden = false;
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- course row builders ---------- */
function tokenOptions(tokens, gradeMap, selected) {
  const sorted = (tokens || []).slice().sort((a, b) => ((gradeMap[b] ?? -1) - (gradeMap[a] ?? -1)));
  return sorted.map((t) =>
    '<option value="' + esc(t) + '"' + (t === selected ? " selected" : "") + ">" +
    esc(t) + (gradeMap[t] != null ? " · " + esc(String(gradeMap[t])) : "") + "</option>"
  ).join("");
}

/** Grade row: name, credits, grade select (or custom points), excluded checkbox. */
function addGradeRow(data = {}, opts = {}) {
  const uid = "gr" + (++rowUid);
  const row = document.createElement("div");
  row.className = "card";
  row.dataset.rowtype = "grade";
  const typeSel = opts.showType
    ? '<div class="field"><label for="' + uid + '-t">Course type</label>' +
      '<select class="c-type" id="' + uid + '-t">' +
      '<option value="std"' + (data.bumpType !== "honors" && data.bumpType !== "apib" ? " selected" : "") + ">Standard</option>" +
      '<option value="honors"' + (data.bumpType === "honors" ? " selected" : "") + ">Honors</option>" +
      '<option value="apib"' + (data.bumpType === "apib" ? " selected" : "") + ">AP / IB</option>" +
      "</select></div>"
    : "";
  row.innerHTML =
    '<div class="gc-rowgrid ' + (opts.showType ? "cols-4" : "cols-3") + '">' +
    '<div class="field"><label for="' + uid + '-n">Course name</label>' +
    '<input type="text" class="c-name" id="' + uid + '-n" maxlength="80" placeholder="e.g. Physics" value="' + esc(data.name || "") + '" /></div>' +
    '<div class="field"><label for="' + uid + '-c">' + esc(opts.creditLabel || "Credits") + "</label>" +
    '<input type="number" class="c-credits" id="' + uid + '-c" min="0" step="0.5" inputmode="decimal" value="' + esc(data.credits ?? "") + '" /></div>' +
    '<div class="field"><label for="' + uid + '-g">Grade</label>' +
    '<select class="c-grade" id="' + uid + '-g">' + tokenOptions(opts.tokens, opts.gradeMap, data.grade) +
    '<option value="__points"' + (data.grade === "__points" ? " selected" : "") + ">Custom points…</option></select>" +
    '<input type="number" class="c-points" min="0" step="0.01" inputmode="decimal" placeholder="Points" aria-label="Custom grade points" value="' + esc(data.points ?? "") + '"' + (data.grade === "__points" ? "" : " hidden") + " /></div>" +
    typeSel +
    "</div>" +
    '<div class="btn-row left gc-rowfoot">' +
    '<label class="checkline"><input type="checkbox" class="c-excluded"' + (data.excluded ? " checked" : "") + " />" +
    "<span>" + esc(opts.excludeLabel || "Excluded (not counted)") + "</span></label>" +
    '<button type="button" class="btn btn-ghost btn-sm c-remove">Remove</button>' +
    "</div>";
  const gsel = row.querySelector(".c-grade");
  const pin = row.querySelector(".c-points");
  gsel.addEventListener("change", () => { pin.hidden = gsel.value !== "__points"; });
  row.querySelector(".c-remove").addEventListener("click", () => { row.remove(); saveDraft(); });
  $("courseRows").appendChild(row);
  return row;
}

/** Mark row: name + percentage mark (+ optional credits). */
function addMarkRow(data = {}, opts = {}) {
  const uid = "mr" + (++rowUid);
  const row = document.createElement("div");
  row.className = "card";
  row.dataset.rowtype = "mark";
  const credField = opts.showCredits
    ? '<div class="field"><label for="' + uid + '-c">' + esc(opts.creditLabel || "Credits") + "</label>" +
      '<input type="number" class="c-credits" id="' + uid + '-c" min="0" step="0.5" inputmode="decimal" value="' + esc(data.credits ?? "") + '" /></div>'
    : "";
  row.innerHTML =
    '<div class="gc-rowgrid ' + (opts.showCredits ? "cols-3" : "cols-2") + '">' +
    '<div class="field"><label for="' + uid + '-n">' + esc(opts.nameLabel || "Subject name") + "</label>" +
    '<input type="text" class="c-name" id="' + uid + '-n" maxlength="80" placeholder="' + esc(opts.namePlaceholder || "e.g. English") + '" value="' + esc(data.name || "") + '" /></div>' +
    '<div class="field"><label for="' + uid + '-m">' + esc(opts.markLabel || "Mark (%)") + "</label>" +
    '<input type="number" class="c-mark" id="' + uid + '-m" min="0" max="100" step="0.5" inputmode="decimal" value="' + esc(data.mark ?? "") + '" /></div>' +
    credField +
    "</div>" +
    '<div class="btn-row left gc-rowfoot">' +
    '<button type="button" class="btn btn-ghost btn-sm c-remove">Remove</button>' +
    "</div>";
  row.querySelector(".c-remove").addEventListener("click", () => { row.remove(); saveDraft(); });
  $("courseRows").appendChild(row);
  return row;
}

/** UK year row: mark + credits for one weighted year. */
function addYearRow(index, weight, data = {}) {
  const uid = "yr" + (++rowUid);
  const row = document.createElement("div");
  row.className = "card";
  row.dataset.rowtype = "year";
  const wLabel = weight === 0 ? "not counted in the weighting" : "weight " + Math.round(weight * 100) + "%";
  row.innerHTML =
    '<div class="gc-rowgrid cols-3">' +
    '<div class="field"><span id="' + uid + '-l"><strong>Year ' + (index + 1) + "</strong></span>" +
    '<p class="hint gc-tight">' + esc(wLabel) + "</p></div>" +
    '<div class="field"><label for="' + uid + '-m">Average mark (%)</label>' +
    '<input type="number" class="c-mark" id="' + uid + '-m" min="0" max="100" step="0.5" inputmode="decimal" aria-labelledby="' + uid + '-l" value="' + esc(data.mark ?? "") + '" /></div>' +
    '<div class="field"><label for="' + uid + '-c">Credits</label>' +
    '<input type="number" class="c-credits" id="' + uid + '-c" min="0" step="1" inputmode="numeric" value="' + esc(data.credits ?? "120") + '" />' +
    '<p class="hint">Recorded for your records; weighting is by year.</p></div>' +
    "</div>";
  $("courseRows").appendChild(row);
  return row;
}

/* ---------- row readers (plain-language validation) ---------- */
function readGradeRows() {
  const rows = [...document.querySelectorAll('#courseRows [data-rowtype="grade"]')];
  if (!rows.length) throw new Error("Add at least one course first.");
  return rows.map((row, i) => {
    const name = row.querySelector(".c-name").value.trim();
    if (!name) throw new Error("Course " + (i + 1) + ': give it a name, e.g. "Physics".');
    const credits = Number(row.querySelector(".c-credits").value);
    if (!Number.isFinite(credits) || credits < 0) throw new Error('"' + name + '": credits must be 0 or more.');
    const gradeVal = row.querySelector(".c-grade").value;
    const typeEl = row.querySelector(".c-type");
    const excluded = row.querySelector(".c-excluded").checked;
    if (gradeVal === "__points") {
      const points = Number(row.querySelector(".c-points").value);
      if (!Number.isFinite(points) || points < 0) throw new Error('"' + name + '": custom points must be 0 or more.');
      return { name, credits, points, excluded, bumpType: typeEl ? typeEl.value : "std" };
    }
    return { name, credits, grade: gradeVal, excluded, bumpType: typeEl ? typeEl.value : "std" };
  });
}

function readMarkRows() {
  const rows = [...document.querySelectorAll('#courseRows [data-rowtype="mark"]')];
  if (!rows.length) throw new Error("Add at least one subject first.");
  return rows.map((row, i) => {
    const name = row.querySelector(".c-name").value.trim();
    if (!name) throw new Error("Subject " + (i + 1) + ': give it a name, e.g. "English".');
    const mark = Number(row.querySelector(".c-mark").value);
    if (!Number.isFinite(mark) || mark < 0 || mark > 100) throw new Error('"' + name + '": mark must be between 0 and 100.');
    const credEl = row.querySelector(".c-credits");
    let credits = 1; // blank weight = 1
    if (credEl) {
      const raw = credEl.value.trim();
      credits = raw === "" ? 1 : Number(raw);
      if (!Number.isFinite(credits) || credits < 0) throw new Error('"' + name + '": credits must be 0 or more.');
    }
    return { name, pct: mark, mark, credits };
  });
}

function readYearRows() {
  const rows = [...document.querySelectorAll('#courseRows [data-rowtype="year"]')];
  if (!rows.length) throw new Error("Add your year marks first.");
  return rows.map((row, i) => {
    const mark = Number(row.querySelector(".c-mark").value);
    if (!Number.isFinite(mark) || mark < 0 || mark > 100) throw new Error("Year " + (i + 1) + ": mark must be between 0 and 100.");
    const credits = Number(row.querySelector(".c-credits").value);
    if (!Number.isFinite(credits) || credits < 0) throw new Error("Year " + (i + 1) + ": credits must be 0 or more.");
    return { mark, credits };
  });
}

/** Re-render every grade select's options (e.g. after a preset/scheme change), keeping valid picks. */
function refreshGradeOptions(tokens, gradeMap) {
  document.querySelectorAll('#courseRows [data-rowtype="grade"] .c-grade').forEach((sel) => {
    const cur = sel.value;
    const keepCustom = cur === "__points";
    sel.innerHTML = tokenOptions(tokens, gradeMap, keepCustom ? "__points" : (tokens.includes(cur) ? cur : undefined)) +
      '<option value="__points"' + (keepCustom ? " selected" : "") + ">Custom points…</option>";
    sel.closest(".field").querySelector(".c-points").hidden = !keepCustom;
  });
}

/* ============================================================
 * Per-region control renderers.
 * Each builds config-driven controls into #regionControls and
 * manages the shared #courseRows area. CALCULATE[id] (next chunk)
 * reads them back and calls the engine.
 * ============================================================ */

function presetOptions(presets, selectedId) {
  return presets.map((p) =>
    '<option value="' + esc(p.id) + '"' + (p.id === selectedId ? " selected" : "") + ">" + esc(p.label) + "</option>"
  ).join("");
}

function gradeTokensOf(gradeMap) { return Object.keys(gradeMap || {}); }

/** (Re)seed grade rows for GPA regions, preserving existing data when asked. */
function seedGradeRows(tokens, gradeMap, opts, keepData) {
  const wrap = $("courseRows");
  let data = [];
  if (keepData) {
    data = [...wrap.querySelectorAll('[data-rowtype="grade"]')].map((row) => ({
      name: row.querySelector(".c-name").value,
      credits: row.querySelector(".c-credits").value,
      grade: row.querySelector(".c-grade").value,
      points: row.querySelector(".c-points").value,
      excluded: row.querySelector(".c-excluded").checked,
      bumpType: row.querySelector(".c-type") ? row.querySelector(".c-type").value : "std",
    }));
  }
  wrap.innerHTML = "";
  rowUid = 0;
  const seeds = data.length ? data : [{}, {}];
  for (const d of seeds) addGradeRow(d, { tokens, gradeMap, ...opts });
}

const RENDER = {
  /* ---------- US ---------- */
  "us"(cfg, init) {
    const presets = cfg.presets;
    state.preset = presets.find((p) => p.id === (init && init.preset)) || presets.find((p) => p.is_default) || presets[0];
    $("regionControls").innerHTML =
      '<div class="grid grid-2">' +
      '<div class="field"><label for="us-preset">Grading scale preset</label>' +
      '<select id="us-preset">' + presetOptions(presets, state.preset.id) + "</select>" +
      '<p class="hint" id="us-preset-note">' + esc(state.preset.note || "") + "</p></div>" +
      '<div class="field"><label for="us-retake">Retake policy</label>' +
      '<select id="us-retake">' +
      '<option value="replace"' + ((init && init.retake) === "average" ? "" : " selected") + ">Replace · keep only the latest attempt</option>" +
      '<option value="average"' + ((init && init.retake) === "average" ? " selected" : "") + ">Average · include every attempt</option></select>" +
      '<p class="hint">' + esc(cfg.retake_note) + "</p></div>" +
      '<div class="field"><label for="us-honors">Honors bump</label>' +
      '<input type="number" id="us-honors" min="0" step="0.1" inputmode="decimal" value="' + esc((init && init.honorsBump) ?? cfg.weighted_bumps.honors) + '" />' +
      '<p class="hint">Added to Honors courses graded C or above.</p></div>' +
      '<div class="field"><label for="us-ap">AP / IB bump</label>' +
      '<input type="number" id="us-ap" min="0" step="0.1" inputmode="decimal" value="' + esc((init && init.apBump) ?? cfg.weighted_bumps.ap_ib) + '" />' +
      '<p class="hint">' + esc(cfg.weighted_note) + "</p></div>" +
      "</div>" +
      '<p><span class="badge warn">No single official US scale</span> <span class="muted">Pick the preset your school actually uses · check your transcript key.</span></p>';
    $("courseRowsWrap").hidden = false;
    $("coursesTitle").textContent = "Your courses";
    $("addCourse").onclick = () => addGradeRow({}, { tokens: gradeTokensOf(state.preset.grade_map), gradeMap: state.preset.grade_map, showType: true, excludeLabel: "Excluded (S/U, W, I…)" });
    $("us-preset").addEventListener("change", (e) => {
      state.preset = presets.find((p) => p.id === e.target.value) || presets[0];
      $("us-preset-note").textContent = state.preset.note || "";
      seedGradeRows(gradeTokensOf(state.preset.grade_map), state.preset.grade_map, { showType: true, excludeLabel: "Excluded (S/U, W, I…)" }, true);
      saveDraft();
    });
    seedGradeRows(gradeTokensOf(state.preset.grade_map), state.preset.grade_map, { showType: true, excludeLabel: "Excluded (S/U, W, I…)" }, false);
  },

  /* ---------- UK ---------- */
  "uk"(cfg, init) {
    const wps = cfg.year_weightings;
    state.yearWeights = wps.find((w) => w.id === (init && init.yearWeights)) || wps[0];
    let html =
      '<div class="grid grid-2">' +
      '<div class="field"><label for="uk-weights">Year weighting</label>' +
      '<select id="uk-weights">' + wps.map((w) => '<option value="' + esc(w.id) + '"' + (w.id === state.yearWeights.id ? " selected" : "") + ">" + esc(w.label) + "</option>").join("") + "</select>" +
      '<p class="hint" id="uk-weights-note">' + esc(state.yearWeights.note || "") + "</p></div>" +
      '<div class="field"><label class="checkline"><input type="checkbox" id="uk-borderline"' + ((init && init.borderline) ? " checked" : "") + " />" +
      "<span><strong>Borderline consideration.</strong> Tick if your mark lands just below a boundary.</span></label>" +
      '<p class="hint">' + esc(cfg.borderline.note) + "</p></div>" +
      "</div>" +
      '<details class="gc-details"><summary>GCSE 9–1 grade order (reference · no GPA math)</summary>' +
      "<p><strong>" + esc(cfg.grade_orders.gcse.order.join(" › ")) + "</strong></p>" +
      '<p class="muted">' + esc(cfg.grade_orders.gcse.note) + "</p>" +
      '<p class="muted">' + esc(cfg.grade_orders.gcse.anchor_points) + "</p></details>" +
      '<details class="gc-details"><summary>A-level grade order (reference · no GPA math)</summary>' +
      "<p><strong>" + esc(cfg.grade_orders.alevel.order.join(" › ")) + "</strong></p>" +
      '<p class="muted">' + esc(cfg.grade_orders.alevel.note) + "</p></details>";
    $("regionControls").innerHTML = html;
    $("courseRowsWrap").hidden = false;
    $("coursesTitle").textContent = "Your year marks";
    $("addCourse").style.display = "none";
    const buildYears = (yearsInit) => {
      $("courseRows").innerHTML = "";
      rowUid = 0;
      state.yearWeights.weights.forEach((w, i) => addYearRow(i, w, (yearsInit && yearsInit[i]) || {}));
    };
    buildYears(init && init.ukYears);
    $("uk-weights").addEventListener("change", (e) => {
      state.yearWeights = wps.find((w) => w.id === e.target.value) || wps[0];
      $("uk-weights-note").textContent = state.yearWeights.note || "";
      buildYears();
      saveDraft();
    });
  },

  /* ---------- VTU ---------- */
  "in-vtu"(cfg, init) {
    state.scheme = cfg.schemes.find((s) => s.id === (init && init.scheme)) || null;
    $("regionControls").innerHTML =
      '<div class="field"><label for="vtu-scheme">Your scheme / batch <span class="badge warn">required</span></label>' +
      '<select id="vtu-scheme">' +
      '<option value="">Choose your scheme</option>' +
      cfg.schemes.map((s) => '<option value="' + esc(s.id) + '"' + (state.scheme && state.scheme.id === s.id ? " selected" : "") + ">" + esc(s.label) + "</option>").join("") +
      "</select>" +
      '<p class="hint" id="vtu-scheme-note">' + (state.scheme ? esc(state.scheme.formula + ". " + state.scheme.source_note) : "The 2021+ and 2015–2018 formulas differ by 7.5 percentage points · pick the wrong one and your result is wrong.") + "</p></div>";
    $("coursesTitle").textContent = "Your courses";
    const showRows = () => {
      const has = !!state.scheme;
      $("courseRowsWrap").hidden = !has;
      if (has && !$("courseRows").children.length) {
        seedGradeRows(gradeTokensOf(state.scheme.grade_map), state.scheme.grade_map, { excludeLabel: "Excluded (not counted)" }, false);
      } else if (has) {
        refreshGradeOptions(gradeTokensOf(state.scheme.grade_map), state.scheme.grade_map);
      }
    };
    showRows();
    $("addCourse").style.display = "";
    $("addCourse").onclick = () => addGradeRow({}, { tokens: gradeTokensOf(state.scheme.grade_map), gradeMap: state.scheme.grade_map, excludeLabel: "Excluded (not counted)" });
    $("vtu-scheme").addEventListener("change", (e) => {
      state.scheme = cfg.schemes.find((s) => s.id === e.target.value) || null;
      $("vtu-scheme-note").textContent = state.scheme ? state.scheme.formula + ". " + state.scheme.source_note : "";
      if (!state.scheme) { $("courseRows").innerHTML = ""; }
      showRows();
      saveDraft();
    });
  },

  /* ---------- Mumbai University ---------- */
  "in-mumbai"(cfg, init) {
    const f = cfg.formulas[0];
    $("regionControls").innerHTML =
      '<div class="grid grid-2">' +
      '<div class="field"><label for="mu-faculty">Faculty</label>' +
      '<select id="mu-faculty"><option value="' + esc(f.id) + '">' + esc(f.faculty) + "</option></select>" +
      '<p class="hint">Only Engineering (Faculty of Technology) is covered · no verified formula exists for other faculties. See the methodology page.</p></div>' +
      '<div class="field"><label for="mu-cgpi">Your CGPI (0–10)</label>' +
      '<input type="number" id="mu-cgpi" min="0" max="10" step="0.01" inputmode="decimal" value="' + esc((init && init.cgpi) ?? "") + '" />' +
      '<p class="hint">From your transcript (cumulative grade point index).</p></div>' +
      "</div>" +
      '<div class="gc-formula"><p><strong>Published formula</strong></p>' +
      "<p>" + f.pieces.map((p) => esc(p.formula + "  (" + p.when + ")")).join("<br />") + "</p>" +
      '<p class="muted">' + esc(f.rounding) + ". " + esc(f.source_note) + "</p></div>";
    $("courseRowsWrap").hidden = true;
    $("addCourse").style.display = "none";
  },

  /* ---------- CBSE ---------- */
  "in-cbse"(cfg, init) {
    $("regionControls").innerHTML =
      '<div class="gc-formula"><p><strong>⚠ This conversion is historical only.</strong></p>' +
      '<p class="muted">' + esc(cfg.notes) + "</p></div>" +
      '<div class="grid grid-2">' +
      '<div class="field"><label for="cbse-cgpa">Your CGPA (0–10)</label>' +
      '<input type="number" id="cbse-cgpa" min="0" max="10" step="0.01" inputmode="decimal" value="' + esc((init && init.cgpa) ?? "") + '" />' +
      '<p class="hint">Only pre-2018 CCE marksheets carry a CGPA.</p></div>' +
      '<div class="field"><label class="checkline"><input type="checkbox" id="cbse-gate"' + ((init && init.gate) ? " checked" : "") + " />" +
      "<span><strong>" + esc(cfg.legacy_conversion.gate) + "</strong></span></label>" +
      '<p class="hint">' + esc(cfg.legacy_conversion.note) + "</p></div>" +
      "</div>";
    $("courseRowsWrap").hidden = true;
    $("addCourse").style.display = "none";
  },

  /* ---------- ICSE / ISC ---------- */
  "in-icse"(cfg, init) {
    const presets = cfg.presets;
    state.preset = presets.find((p) => p.id === (init && init.preset)) || presets[0];
    $("regionControls").innerHTML =
      '<div class="field"><label for="icse-preset">Board / class</label>' +
      '<select id="icse-preset">' + presetOptions(presets, state.preset.id) + "</select>" +
      '<p class="hint" id="icse-preset-note">' + esc(state.preset.note) + "</p></div>" +
      '<p class="muted">Name your English subject exactly <strong>English</strong> · it is always included. The lowest other subject(s) are dropped automatically.</p>';
    $("courseRowsWrap").hidden = false;
    $("coursesTitle").textContent = "Your subjects";
    $("addCourse").style.display = "";
    $("addCourse").onclick = () => addMarkRow({}, {});
    $("icse-preset").addEventListener("change", (e) => {
      state.preset = presets.find((p) => p.id === e.target.value) || presets[0];
      $("icse-preset-note").textContent = state.preset.note || "";
      saveDraft();
    });
    $("courseRows").innerHTML = "";
    rowUid = 0;
    addMarkRow({ name: "English" }, {});
    for (let i = 0; i < 4; i++) addMarkRow({}, {});
  },

  /* ---------- NEB ---------- */
  "np-neb"(cfg, init) {
    $("regionControls").innerHTML =
      '<div class="field"><label class="checkline"><input type="checkbox" id="neb-estimate"' + ((init && init.showEstimate) ? " checked" : "") + " />" +
      "<span>Also show an estimated percentage alongside the GPA.</span></label>" +
      '<p class="hint"><span class="badge warn">ESTIMATE</span> ' + esc(cfg.percentage_estimate.label) + " (" + esc(cfg.percentage_estimate.formula) + ").</p></div>" +
      '<div class="gc-formula"><p><strong>Pass rules (per subject, both must hold)</strong></p>' +
      '<p class="muted">' + esc(cfg.pass_rules.note) + " Theory ≥ " + esc(String(cfg.pass_rules.theory_min_pct)) + "% and internal/practical ≥ " + esc(String(cfg.pass_rules.internal_min_pct)) + "%.</p>" +
      '<p class="muted">' + esc(cfg.ng_rules.note) + "</p></div>";
    $("courseRowsWrap").hidden = false;
    $("coursesTitle").textContent = "Your courses";
    $("addCourse").style.display = "";
    $("addCourse").onclick = () => addGradeRow({}, { tokens: cfg.grade_tokens, gradeMap: cfg.grade_map, creditLabel: cfg.credit.label, excludeLabel: "Excluded (not counted)" });
    seedGradeRows(cfg.grade_tokens, cfg.grade_map, { creditLabel: cfg.credit.label, excludeLabel: "Excluded (not counted)" }, false);
  },

  /* ---------- NUS / NTU ---------- */
  "sg-nus-ntu"(cfg, init) {
    const presets = cfg.presets;
    state.preset = presets.find((p) => p.id === (init && init.preset)) || presets[0];
    const notesFor = (p) => [p.su_note, p.fgo_note, p.retake_note, p.honours_note].filter(Boolean);
    const renderNotes = () => {
      $("sg-preset-notes").innerHTML = notesFor(state.preset).map((n) => '<p class="muted">' + esc(n) + "</p>").join("");
    };
    $("regionControls").innerHTML =
      '<div class="field"><label for="sg-preset">University / scheme</label>' +
      '<select id="sg-preset">' + presetOptions(presets, state.preset.id) + "</select></div>" +
      '<div id="sg-preset-notes"></div>' +
      '<p class="muted">F grades count as 0 in the GPA. Tick “excluded” only for S/U, FGO P/NR, W and similar non-graded entries · never for an F.</p>';
    renderNotes();
    $("courseRowsWrap").hidden = false;
    $("coursesTitle").textContent = "Your courses";
    $("addCourse").style.display = "";
    $("addCourse").onclick = () => addGradeRow({}, { tokens: cfg.grade_tokens, gradeMap: cfg.grade_map, creditLabel: cfg.credit.label, excludeLabel: "Excluded (S/U, P/NR, W…)" });
    $("sg-preset").addEventListener("change", (e) => {
      state.preset = presets.find((p) => p.id === e.target.value) || presets[0];
      renderNotes();
      saveDraft();
    });
    seedGradeRows(cfg.grade_tokens, cfg.grade_map, { creditLabel: cfg.credit.label, excludeLabel: "Excluded (S/U, P/NR, W…)" }, false);
  },

  /* ---------- default fallback ---------- */
  "_default"(cfg) {
    $("regionControls").innerHTML =
      '<p class="muted">Plain weighted percentage average. <span class="badge">UNVERIFIED</span> ' + esc(cfg.unverified[0] || "") + "</p>";
    $("courseRowsWrap").hidden = false;
    $("coursesTitle").textContent = "Your subjects";
    $("addCourse").style.display = "";
    $("addCourse").onclick = () => addMarkRow({}, { showCredits: true });
    $("courseRows").innerHTML = "";
    rowUid = 0;
    addMarkRow({}, { showCredits: true });
    addMarkRow({}, { showCredits: true });
  },
};

/* ============================================================
 * Per-region calculators · read controls, call the engine,
 * render results. Wiring only.
 * ============================================================ */

function fmt(n) { return String(n); }

const CALCULATE = {
  "us"(cfg) {
    const preset = state.preset;
    const honorsBump = numValue($("us-honors"), "Honors bump", 0);
    const apBump = numValue($("us-ap"), "AP / IB bump", 0);
    const retake = $("us-retake").value === "average" ? "average" : "replace";
    const rows = readGradeRows();
    let usedBump = false;
    const courses = rows.map((c) => {
      const base = c.points != null ? c.points : gradePointsFor(c.grade, preset.grade_map);
      if (base == null) return { name: c.name, credits: c.credits, grade: c.grade, excluded: c.excluded };
      let bump = c.bumpType === "honors" ? honorsBump : c.bumpType === "apib" ? apBump : 0;
      if (bump && base >= 2.0) { usedBump = true; return { name: c.name, credits: c.credits, points: base + bump, excluded: c.excluded }; }
      return { name: c.name, credits: c.credits, points: base, excluded: c.excluded };
    });
    const res = computeGPA(applyRetakeMode(courses, retake), preset.grade_map, cfg.rounding);
    const badges = [{ text: "No single official US scale · verify against your school's transcript key", kind: "warn" }];
    if (usedBump) badges.push({ text: "Weighted bumps are district conventions, not national policy", kind: "warn" });
    renderResult(cfg, {
      title: "Your GPA",
      big: fmt(res.gpa),
      sub: "on the " + preset.label,
      badges,
      lines: [
        ["Credits counted", fmt(res.totalCredits)],
        ["Courses counted", fmt(res.counted)],
        ["Excluded (not in GPA)", fmt(res.excludedCount)],
        ["Retake policy", retake === "replace" ? "Replace (latest attempt)" : "Average (all attempts)"],
      ],
      formula: "GPA = Σ(grade points × credits) ÷ Σ(credits), using the “" + preset.label + "” mapping." +
        (usedBump ? " Honors +" + honorsBump + " / AP-IB +" + apBump + " bumps applied to courses graded C or above." : ""),
      formulaNote: "Excluded courses (S/U, W, I…) and zero-credit courses are skipped in the average but reported above.",
    });
  },

  "uk"(cfg) {
    const years = readYearRows();
    const wp = state.yearWeights;
    const mark = weightedYearMark(years, wp.weights);
    const band = bandFor(mark, cfg.percentage_bands);
    const notes = [];
    if ($("uk-borderline").checked && band) {
      const higher = cfg.percentage_bands.filter((b) => b.min > mark).sort((a, b) => a.min - b.min)[0];
      if (higher && mark >= higher.min - cfg.borderline.zone_pp) {
        notes.push("Borderline zone: " + mark + "% is within " + cfg.borderline.zone_pp + "pp of " + higher.label +
          " · your university may consider you for the higher classification. Check their borderline rules; some round, some don't.");
      } else {
        notes.push("Borderline box ticked, but " + mark + "% is not within the " + cfg.borderline.zone_pp + "pp zone of consideration below the next boundary.");
      }
    }
    notes.push("GCSE and A-level grades are reference only · they can't be converted to a GPA; boundaries are set per exam series after marking.");
    renderResult(cfg, {
      title: "Your weighted mark",
      big: fmt(mark) + "%",
      sub: band ? band.label : "No classification band matched",
      lines: years.map((y, i) => ["Year " + (i + 1) + " mark", fmt(y.mark) + "%  ·  weight " + Math.round(wp.weights[i] * 100) + "%"]),
      formula: "Weighted mark = Σ(year mark × year weight), using the “" + wp.label + "” weighting. Year credits are recorded for reference; UKSCQA models weight by year, not by credit.",
      notes,
    });
  },

  "in-vtu"(cfg) {
    const scheme = state.scheme;
    if (!scheme) throw new Error("Choose your VTU scheme first · the 2021+ and 2015–2018 formulas differ by 7.5 percentage points.");
    const rows = readGradeRows();
    const res = computeGPA(rows, scheme.grade_map, cfg.rounding);
    // Engine params come from the scheme's machine-readable conversion (config data, not code).
    const params = scheme.linear;
    if (!params || !Number.isFinite(params.a) || !Number.isFinite(params.b)) throw new Error('The "' + scheme.label + '" conversion isn\'t supported in this version yet.');
    const pct = roundValue(convertLinear(res.gpa, params.a, params.b), cfg.rounding);
    const band = bandFor(res.gpa, cfg.percentage_bands);
    renderResult(cfg, {
      title: "Your percentage (VTU)",
      big: fmt(pct) + "%",
      sub: "from a CGPA of " + fmt(res.gpa),
      lines: [
        ["CGPA", fmt(res.gpa)],
        ["Scheme", scheme.label],
        ["Class", band ? band.label + (band.note ? " · " + band.note : "") : "n/a"],
        ["Credits counted", fmt(res.totalCredits)],
      ],
      formula: scheme.formula + " → " + params.a + " × " + fmt(res.gpa) + (params.b < 0 ? " − " + Math.abs(params.b) : " + " + params.b) + " = " + fmt(pct) + "%.",
      formulaNote: scheme.source_note,
    });
  },

  "in-mumbai"(cfg) {
    const f = cfg.formulas[0];
    const cgpi = numValue($("mu-cgpi"), "CGPI", 0, 10);
    // Engine pieces come from the config's machine-readable formula (data, not code); lt:null = no upper bound.
    const raw = convertPiecewise(cgpi, f.pieces.map((p) => ({ lt: p.lt === null ? Infinity : p.lt, a: p.a, b: p.b })));
    const pct = roundValue(raw, cfg.rounding); // ceiling → next integer
    const piece = cgpi < 7 ? f.pieces[0].formula : f.pieces[1].formula;
    renderResult(cfg, {
      title: "Your percentage (Mumbai University)",
      big: fmt(pct) + "%",
      sub: f.faculty,
      badges: [{ text: "Only Engineering (Faculty of Technology) is covered", kind: "warn" }],
      lines: [["CGPI entered", fmt(cgpi)]],
      formula: piece + " = " + fmt(Math.round(raw * 100) / 100) + ", rounded UP to the next integer = " + fmt(pct) + "%.",
      formulaNote: f.source_note + " The commonly quoted “(CGPA − 0.75) × 10” is VTU's old formula, misattributed to MU · never use it here.",
    });
  },

  "in-cbse"(cfg) {
    if (!$("cbse-gate").checked) {
      throw new Error("This ×9.5 conversion is for pre-2018 CCE marksheets only · it must not be applied to current marksheets. " +
        "If your marksheet shows subject marks (not a CGPA), nothing needs converting: use the General percentage calculator instead. " +
        "Tick the box only if yours is genuinely a pre-2018 CCE marksheet.");
    }
    const cgpa = numValue($("cbse-cgpa"), "CGPA", 0, 10);
    const pct = cbseLegacyToPct(cgpa);
    renderResult(cfg, {
      title: "Your indicative percentage (CBSE, legacy CCE)",
      big: fmt(Math.round(pct * 100) / 100) + "%",
      sub: "from a CGPA of " + fmt(cgpa),
      badges: [{ text: "INDICATIVE · 10 CGPA = 95%, not 100%", kind: "warn" }],
      formula: cfg.legacy_conversion.formula + " → " + fmt(cgpa) + " × 9.5 = " + fmt(Math.round(pct * 100) / 100) + "%.",
      formulaNote: cfg.legacy_conversion.note,
    });
  },

  "in-icse"(cfg) {
    const preset = state.preset;
    const marks = readMarkRows().map((m) => ({ name: m.name, pct: m.pct }));
    const r = applyBestOfN(marks, preset.best_of, preset.forced);
    const isIsc = preset.id === "isc";
    const band = isIsc ? bandFor(r.aggregate, cfg.percentage_bands) : null;
    let extraHTML = '<div class="grid grid-2"><div><p><strong>Counted (' + r.selected.length + ")</strong></p><ul class=\"gc-meta-list\">" +
      r.selected.map((m) => "<li>" + esc(m.name) + " · " + esc(String(m.pct)) + "%</li>").join("") + "</ul></div>" +
      "<div><p><strong>Dropped (" + r.dropped.length + ")</strong></p>";
    extraHTML += r.dropped.length
      ? '<ul class="gc-meta-list">' + r.dropped.map((m) => "<li>" + esc(m.name) + " · " + esc(String(m.pct)) + "%</li>").join("") + "</ul>"
      : '<p class="muted">None · every subject counted.</p>';
    extraHTML += "</div></div>";
    renderResult(cfg, {
      title: preset.id === "icse" ? "Your ICSE percentage" : "Your ISC aggregate",
      big: fmt(r.aggregate) + "%",
      sub: band ? band.label : preset.label,
      extraHTML,
      formula: preset.note,
      formulaNote: isIsc
        ? "Pass is 35% per subject (lowered from 40% for ISC from the 2024 exams); 40% on older pages is outdated."
        : "Pass is 33% per subject (written and internal separately). Divisions shown on this page apply to ISC.",
    });
  },

  "np-neb"(cfg) {
    const rows = readGradeRows();
    const res = computeGPA(rows, cfg.grade_map, cfg.rounding);
    const lines = [
      ["Credits counted", fmt(res.totalCredits)],
      ["Courses counted", fmt(res.counted)],
      ["Excluded (not in GPA)", fmt(res.excludedCount)],
    ];
    const badges = [];
    let sub = "credit-hour weighted";
    if ($("neb-estimate").checked) {
      const pct = roundValue(estimateGpaToPct(res.gpa), cfg.rounding);
      lines.push(["Estimated percentage", "~" + fmt(pct) + "%"]);
      badges.push({ text: "ESTIMATE · no official NEB GPA→percentage formula exists", kind: "warn" });
      sub += " · ~" + fmt(pct) + "% estimate";
    }
    renderResult(cfg, {
      title: "Your GPA (NEB)",
      big: fmt(res.gpa),
      sub,
      badges,
      lines,
      formula: "GPA = Σ(credit hours × grade point) ÷ Σ(credit hours), using the CDC Letter Grading Directive 2078 (4th amendment 2081) grade points.",
      notes: [cfg.pass_rules.note + " Theory ≥ " + cfg.pass_rules.theory_min_pct + "% and internal/practical ≥ " + cfg.pass_rules.internal_min_pct + "% per subject.", cfg.ng_rules.note],
    });
  },

  "sg-nus-ntu"(cfg) {
    const preset = state.preset;
    const rows = readGradeRows();
    const res = computeGPA(rows, cfg.grade_map, cfg.rounding);
    const band = bandFor(res.gpa, cfg.honours_bands);
    const notes = [preset.su_note, preset.fgo_note, preset.retake_note, preset.honours_note].filter(Boolean);
    notes.push("Neither university publishes percentage bands for letter grades · don't use Wikipedia's bands.");
    renderResult(cfg, {
      title: "Your GPA (" + preset.label + ")",
      big: fmt(res.gpa),
      sub: band ? band.label : "Below the Pass band",
      badges: [{ text: "F grades count as 0 · only S/U, FGO P/NR, W and similar are excludable", kind: "" }],
      lines: [
        ["Units counted", fmt(res.totalCredits)],
        ["Courses counted", fmt(res.counted)],
        ["Excluded (not in GPA)", fmt(res.excludedCount)],
        ["Honours band", band ? band.label + " (" + band.min.toFixed(2) + "–" + band.max.toFixed(2) + ")" : "n/a"],
        ["Graduation minimum", fmt(cfg.graduation_minimum)],
      ],
      formula: preset.formula + ".",
      notes,
    });
  },

  "_default"(cfg) {
    const marks = readMarkRows();
    const courses = marks.map((m) => ({ name: m.name, credits: m.credits, points: m.pct }));
    const res = computeGPA(courses, cfg.grade_map, cfg.rounding);
    renderResult(cfg, {
      title: "Your weighted average",
      big: fmt(res.gpa) + "%",
      badges: [{ text: "General fallback · pick your education system above for exact grading math", kind: "warn" }],
      lines: [
        ["Subjects counted", fmt(res.counted)],
        ["Total weight", fmt(res.totalCredits)],
      ],
      formula: "Weighted average = Σ(mark × credits) ÷ Σ(credits).",
    });
  },
};

function onCalculate() {
  setError(null);
  try {
    CALCULATE[state.regionId](state.cfg);
    saveDraft();
    toast("Calculated · draft saved on this device.");
  } catch (e) {
    setError(e && e.message ? e.message : "Something went wrong while calculating.");
    $("result").hidden = true;
  }
}

/* ============================================================
 * "What do I need on the final?" · region-aware target picker.
 * ============================================================ */
function finalBands(cfg) {
  if (!cfg) return null;
  if (cfg.id === "uk" || cfg.id === "in-icse" || cfg.id === "np-neb") return cfg.percentage_bands;
  return null;
}

function refreshFinalTargets() {
  const bands = finalBands(state.cfg);
  const wrap = $("finalGradeWrap");
  const sel = $("finalGrade");
  if (!bands) { wrap.hidden = true; return; }
  wrap.hidden = false;
  sel.innerHTML = '<option value="">Pick a target grade</option>' +
    bands.map((b) => '<option value="' + esc(String(b.min)) + '">' + esc(b.label) + " (≥ " + esc(String(b.min)) + "%)</option>").join("");
  sel.onchange = () => { if (sel.value !== "") $("targetPct").value = sel.value; };
}

function onFinal() {
  const fe = $("finalError");
  fe.hidden = true; fe.textContent = "";
  try {
    const cur = numValue($("curPct"), "Current %", 0, 100);
    const w = numValue($("finalWeight"), "Final weight %", 0, 100);
    if (!(w > 0 && w < 100)) throw new Error("Final weight % must be between 0 and 100 (exclusive).");
    const tgt = numValue($("targetPct"), "Target %", 0, 100);
    const r = requiredFinal(cur, w, tgt);
    const bands = finalBands(state.cfg);
    let html;
    if (r.impossible) {
      const bl = bands ? bandFor(r.maxPossible, bands) : null;
      html = '<p class="gc-big">Not possible</p>' +
        "<p>Even 100% on the final can't reach " + esc(String(tgt)) + "%. " +
        "The highest you can finish with is <strong>" + esc(String(r.maxPossible)) + "%</strong>" +
        (bl ? " (" + esc(bl.label) + ")" : "") + ".</p>";
    } else if (r.alreadyMet) {
      html = '<p class="gc-big">Already secured</p>' +
        "<p>You've already locked in " + esc(String(tgt)) + "% · even 0% on the final keeps you there. Aim higher?</p>";
    } else {
      html = '<p class="gc-big">' + esc(String(r.needed)) + "%</p>" +
        '<p class="muted">needed on the final</p>' +
        "<p>You need <strong>" + esc(String(r.needed)) + "%</strong> on the final (worth " + esc(String(w)) + "%) " +
        "to finish with " + esc(String(tgt)) + "%.</p>";
    }
    html += '<div class="gc-formula"><p><strong>Formula used</strong></p>' +
      "<p>Needed = (target − (1 − w) × current) ÷ w, where w is the final's weight as a fraction.</p></div>";
    $("finalResult").innerHTML = html;
    $("finalResult").hidden = false;
  } catch (e) {
    fe.textContent = e && e.message ? e.message : "Couldn't calculate.";
    fe.hidden = false;
    $("finalResult").hidden = true;
  }
}

/* ============================================================
 * Draft persistence (localStorage sp:grade:draft).
 * ============================================================ */
function readControlsState() {
  const c = {};
  ["us-preset", "us-retake", "us-honors", "us-ap", "uk-weights", "vtu-scheme", "mu-cgpi", "cbse-cgpa", "icse-preset", "sg-preset"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) c[id] = el.value;
  });
  ["uk-borderline", "cbse-gate", "neb-estimate"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) c[id] = el.checked;
  });
  const yrows = [...document.querySelectorAll('#courseRows [data-rowtype="year"]')];
  if (yrows.length) c.ukYears = yrows.map((r) => ({ mark: r.querySelector(".c-mark").value, credits: r.querySelector(".c-credits").value }));
  return c;
}

function readRowsState() {
  const out = [];
  document.querySelectorAll("#courseRows [data-rowtype]").forEach((row) => {
    const t = row.dataset.rowtype;
    if (t === "grade") {
      out.push({ type: "grade", name: row.querySelector(".c-name").value, credits: row.querySelector(".c-credits").value, grade: row.querySelector(".c-grade").value, points: row.querySelector(".c-points").value, excluded: row.querySelector(".c-excluded").checked, bumpType: row.querySelector(".c-type") ? row.querySelector(".c-type").value : "std" });
    } else if (t === "mark") {
      out.push({ type: "mark", name: row.querySelector(".c-name").value, mark: row.querySelector(".c-mark").value, credits: row.querySelector(".c-credits") ? row.querySelector(".c-credits").value : "" });
    }
  });
  return out;
}

function collectDraft() {
  return {
    v: 1,
    region: state.regionId,
    controls: readControlsState(),
    rows: readRowsState(),
    final: { cur: $("curPct").value, weight: $("finalWeight").value, target: $("targetPct").value },
  };
}

function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft())); } catch (e) { /* private mode */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 1 && d.region ? d : null;
  } catch (e) { return null; }
}

function applyDraftRows(rows) {
  $("courseRows").innerHTML = "";
  rowUid = 0;
  const cfg = state.cfg;
  for (const r of rows || []) {
    if (r.type === "grade") {
      let tokens = cfg.grade_tokens, gmap = cfg.grade_map, extra = {};
      if (state.regionId === "us" && state.preset) { tokens = gradeTokensOf(state.preset.grade_map); gmap = state.preset.grade_map; extra = { showType: true, excludeLabel: "Excluded (S/U, W, I…)" }; }
      else if (state.regionId === "in-vtu" && state.scheme) { tokens = gradeTokensOf(state.scheme.grade_map); gmap = state.scheme.grade_map; extra = { excludeLabel: "Excluded (not counted)" }; }
      else if (state.regionId === "np-neb") extra = { creditLabel: cfg.credit.label, excludeLabel: "Excluded (not counted)" };
      else if (state.regionId === "sg-nus-ntu") extra = { creditLabel: cfg.credit.label, excludeLabel: "Excluded (S/U, P/NR, W…)" };
      addGradeRow({ name: r.name, credits: r.credits, grade: r.grade, points: r.points, excluded: r.excluded, bumpType: r.bumpType }, { tokens, gradeMap: gmap, ...extra });
    } else if (r.type === "mark") {
      const showCredits = state.regionId === "_default";
      addMarkRow({ name: r.name, mark: r.mark, credits: r.credits }, { showCredits });
    }
  }
  if (!$("courseRows").children.length) {
    if (state.regionId === "in-icse") { addMarkRow({ name: "English" }, {}); addMarkRow({}, {}); }
  }
}

/* ============================================================
 * Region selection + init.
 * ============================================================ */
/** Translate persisted control values into the init shape each renderer expects. */
function toInit(id, c) {
  c = c || {};
  switch (id) {
    case "us": return { preset: c["us-preset"], retake: c["us-retake"], honorsBump: c["us-honors"], apBump: c["us-ap"] };
    case "uk": return { yearWeights: c["uk-weights"], borderline: c["uk-borderline"], ukYears: c.ukYears };
    case "in-vtu": return { scheme: c["vtu-scheme"] };
    case "in-mumbai": return { cgpi: c["mu-cgpi"] };
    case "in-cbse": return { cgpa: c["cbse-cgpa"], gate: c["cbse-gate"] };
    case "in-icse": return { preset: c["icse-preset"] };
    case "np-neb": return { showEstimate: c["neb-estimate"] };
    case "sg-nus-ntu": return { preset: c["sg-preset"] };
    default: return {};
  }
}

async function selectRegion(id, draft) {
  const cfg = await getRegion(id);
  state.regionId = id;
  state.cfg = cfg;
  state.preset = null;
  state.scheme = null;
  state.yearWeights = null;
  $("regionHint").textContent = cfg.name;
  renderRegionMeta(cfg);
  $("toolTitle").textContent = cfg.name + " calculator";
  $("result").hidden = true;
  setError(null);
  $("courseRows").innerHTML = "";
  rowUid = 0;
  const controls = draft && draft.region === id ? draft.controls || {} : {};
  $("addCourse").style.display = "";
  RENDER[id](cfg, toInit(id, controls));
  refreshFinalTargets();
  if (draft && draft.region === id && draft.rows && draft.rows.length) {
    // UK year rows and VTU scheme-gated rows are rebuilt by the renderer; re-apply values.
    if (id === "uk" && controls.ukYears) {
      const yrows = [...document.querySelectorAll('#courseRows [data-rowtype="year"]')];
      controls.ukYears.forEach((y, i) => {
        if (yrows[i]) {
          yrows[i].querySelector(".c-mark").value = y.mark || "";
          yrows[i].querySelector(".c-credits").value = y.credits || "";
        }
      });
    } else if (id !== "in-vtu" || state.scheme) {
      applyDraftRows(draft.rows);
    }
    if (draft.final) {
      $("curPct").value = draft.final.cur || "";
      $("finalWeight").value = draft.final.weight || "";
      $("targetPct").value = draft.final.target || "";
    }
  }
  $("toolCard").hidden = false;
}

async function init() {
  const sel = $("regionSelect");
  try {
    const ids = listRegions();
    const regs = await Promise.all(ids.map((id) => getRegion(id)));
    sel.innerHTML = "";
    for (const r of regs) {
      const o = document.createElement("option");
      o.value = r.id;
      o.textContent = r.name;
      sel.appendChild(o);
    }
    sel.disabled = false;
  } catch (e) {
    sel.innerHTML = '<option value="">Couldn\'t load regions</option>';
    setError("Couldn't load the region configs: " + (e && e.message ? e.message : "network error") + ". Check your connection and reload.");
    return;
  }
  const draft = loadDraft();
  const ids = listRegions();
  let initial = regionForLocale(navigator.language || "");
  if (!ids.includes(initial)) initial = "_default";
  if (draft && ids.includes(draft.region)) initial = draft.region;
  sel.value = initial;
  sel.addEventListener("change", () => { selectRegion(sel.value, null); });
  $("calculate").addEventListener("click", onCalculate);
  $("calcFinal").addEventListener("click", onFinal);
  $("clearRows").addEventListener("click", () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    selectRegion(state.regionId, null);
    toast("Cleared.");
  });
  await selectRegion(initial, draft);
}

init();

