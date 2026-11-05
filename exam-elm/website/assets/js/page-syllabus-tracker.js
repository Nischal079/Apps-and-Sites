/**
 * StudyPilot · Syllabus tracker page controller.
 * Runs the shared site bootstrap, then wires topic tracking,
 * confidence/pace views, and IndexedDB persistence.
 */
import "/assets/js/site.js";

import { esc, toast, todayLocal, toISODate } from "/assets/js/ui.js";
import { openStorage } from "/assets/js/storage.js";
import {
  CONF, CONF_LABEL, TRACKER_KV_KEY, TRACKER_VERSION,
  validateSubjectName, validateExamDate, validateTopicName,
  newSubject, newTopic,
  subjectCoverage, overallCoverage, paceFor,
  weakestTopics, weakestReason,
  setConfidence, moveTopic, removeTopic,
} from "/assets/js/tracker.js";

/* ============================================================
 * Syllabus Tracker · UI WIRING ONLY.
 * All math lives in /assets/js/tracker.js (pure, unit-tested).
 * This file builds DOM, reads inputs, validates in plain
 * language, persists one document in the kv store, and renders.
 * ============================================================ */

/* Shared site bootstrap (theme, brand, mobile menu, theme icon, service worker)
   now runs via /assets/js/site.js (side-effect import at the top of this module). */

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);

function showError(msg) {
  const e = $("pageError");
  if (!msg) { e.hidden = true; e.textContent = ""; return; }
  e.textContent = msg;
  e.hidden = false;
  e.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- state + persistence ---------- */
let storage = null;
let doc = { version: TRACKER_VERSION, subjects: [] };

async function load() {
  try {
    storage = await openStorage();
    if (storage.degraded) $("degradedNote").hidden = false;
    const rec = await storage.get("kv", TRACKER_KV_KEY);
    if (rec && rec.value && Array.isArray(rec.value.subjects)) {
      doc = { version: TRACKER_VERSION, subjects: rec.value.subjects };
    }
  } catch (e) {
    showError("Couldn't open local storage: " + (e && e.message ? e.message : "unknown error") + ". Your tracker won't be saved.");
  }
  render();
}

async function save() {
  if (!storage) return;
  try {
    await storage.put("kv", { key: TRACKER_KV_KEY, value: doc });
  } catch (e) {
    showError("Couldn't save: " + (e && e.message ? e.message : "storage error") + ". Your latest changes may be lost · export anything important.");
  }
}

function findSubject(id) {
  return doc.subjects.find((s) => s.id === id) || null;
}

/* ---------- rendering ---------- */

function paceBadge(pace) {
  const map = {
    "behind": ["bad", "Behind pace"],
    "on-track": ["ok", "On track"],
    "done": ["ok", "Complete"],
    "today": ["warn", "Exam today"],
    "past": ["bad", "Exam passed"],
    "no-date": ["info", "No exam date"],
    "too-early": ["info", "Just started"],
  };
  const [kind, label] = map[pace.status] || ["info", pace.status];
  return '<span class="badge ' + kind + '">' + esc(label) + "</span>";
}

function topicRowHTML(sid, t, idx, total) {
  const label = CONF_LABEL[t.confidence] || t.confidence;
  return '<li class="topic-row" data-topic-id="' + esc(t.id) + '">' +
    '<span class="t-name' + (t.confidence === CONF.DONE ? " done" : "") + '">' + esc(t.name) + "</span>" +
    '<button type="button" class="conf-btn" data-action="cycle" data-conf="' + esc(t.confidence) + '" aria-label="Confidence for ' + esc(t.name) + ': ' + esc(label) + '. Activate to change.">' + esc(label) + "</button>" +
    '<button type="button" class="mini-btn" data-action="up" aria-label="Move ' + esc(t.name) + ' up"' + (idx === 0 ? " disabled" : "") + ">&uarr;</button>" +
    '<button type="button" class="mini-btn" data-action="down" aria-label="Move ' + esc(t.name) + ' down"' + (idx === total - 1 ? " disabled" : "") + ">&darr;</button>" +
    '<button type="button" class="mini-btn danger" data-action="del-topic" aria-label="Delete topic ' + esc(t.name) + '">&times;</button>' +
    "</li>";
}

function subjectCardHTML(s, todayISO) {
  const cov = subjectCoverage(s);
  const pace = paceFor(s, todayISO);
  const pct = cov.percent === null ? 0 : cov.percent;
  const pctLabel = cov.percent === null ? "n/a" : cov.percent + "%";
  let html = '<section class="card" data-subject-id="' + esc(s.id) + '" aria-label="Subject: ' + esc(s.name) + '">';
  html += '<div class="subject-head"><h3>' + esc(s.name) + "</h3>" + paceBadge(pace) +
    '<button type="button" class="btn btn-ghost btn-sm danger" data-action="del-subject">Delete subject</button></div>';
  html += '<div class="kv-line"><span class="muted">Coverage</span><span><strong>' + esc(pctLabel) + "</strong>" +
    (cov.total ? ' <span class="muted">(' + cov.done + " confident, " + cov.wip + " in progress, " + cov.total + " total)</span>" : "") + "</span></div>";
  html += '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Coverage for ' + esc(s.name) + '"><span style="width:' + pct + '%"></span></div>';
  html += '<p class="muted" style="margin-top:0.5rem">' + esc(pace.message) + "</p>";
  html += '<div class="inline-form" style="margin-top:0.6rem"><div class="field"><label for="date-' + esc(s.id) + '">Exam date</label>' +
    '<input type="date" id="date-' + esc(s.id) + '" class="subj-date" min="2000-01-01" max="2100-12-31" value="' + esc(s.examDate || "") + '" /></div></div>';
  html += '<ul class="topic-list">';
  s.topics.forEach((t, i) => { html += topicRowHTML(s.id, t, i, s.topics.length); });
  html += "</ul>";
  html += '<div class="inline-form" style="margin-top:0.7rem"><div class="field"><label for="addt-' + esc(s.id) + '">Add a topic or chapter</label>' +
    '<input type="text" id="addt-' + esc(s.id) + '" class="topic-input" maxlength="120" placeholder="e.g. Thermodynamics" autocomplete="off" /></div>' +
    '<div class="field"><button type="button" class="btn btn-ghost" data-action="add-topic">Add topic</button></div></div>';
  html += "</section>";
  return html;
}

function render() {
  const todayISO = toISODate(todayLocal());

  /* overall */
  const oc = overallCoverage(doc.subjects);
  if (oc.total === 0) {
    $("overallBody").innerHTML = '<p class="muted">Add a subject below to start tracking.</p>';
  } else {
    $("overallBody").innerHTML =
      '<div class="kv-line"><span class="muted">Overall coverage</span><span><strong>' + oc.percent + "%</strong></span></div>" +
      '<div class="progress lg" role="progressbar" aria-valuenow="' + oc.percent + '" aria-valuemin="0" aria-valuemax="100" aria-label="Overall syllabus coverage"><span style="width:' + oc.percent + '%"></span></div>' +
      '<p class="muted">' + oc.done + " topics confident, " + oc.wip + " in progress, across " + doc.subjects.length +
      (doc.subjects.length === 1 ? " subject." : " subjects.") + " In-progress topics count half.</p>";
  }

  /* weakest */
  const weak = weakestTopics(doc.subjects, todayISO, 5);
  if (!weak.length) {
    $("weakestBody").innerHTML = '<p class="muted">Nothing to rank yet.</p>';
  } else {
    $("weakestBody").innerHTML = '<ol class="topic-list">' + weak.map((w) =>
      '<li class="topic-row"><span class="t-name"><strong>' + esc(w.topicName) + '</strong> <span class="muted">· ' + esc(w.subjectName) + "</span></span>" +
      '<span class="badge">' + esc(weakestReason(w)) + "</span></li>"
    ).join("") + "</ol>";
  }

  /* subjects */
  $("emptyCard").hidden = doc.subjects.length > 0;
  $("subjectsWrap").innerHTML = doc.subjects.map((s) => subjectCardHTML(s, todayISO)).join("");
}

/* ---------- actions ---------- */

$("addSubjectBtn").addEventListener("click", async () => {
  showError(null);
  const err = $("subjError");
  err.hidden = true; err.textContent = "";
  try {
    const name = validateSubjectName($("subjName").value);
    const date = validateExamDate($("subjDate").value);
    const s = newSubject(name, date, toISODate(todayLocal()));
    doc.subjects.push(s);
    await save();
    $("subjName").value = "";
    $("subjDate").value = "";
    render();
    toast("Subject added.");
  } catch (e) {
    err.textContent = e && e.message ? e.message : "Couldn't add the subject.";
    err.hidden = false;
  }
});
$("subjName").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("addSubjectBtn").click(); } });

const CONF_ORDER = [CONF.NONE, CONF.WIP, CONF.DONE];

$("subjectsWrap").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  const card = e.target.closest("[data-subject-id]");
  if (!card) return;
  const s = findSubject(card.dataset.subjectId);
  if (!s) return;
  const action = btn ? btn.dataset.action : null;
  showError(null);
  try {
    if (action === "cycle") {
      const row = e.target.closest("[data-topic-id]");
      const t = s.topics.find((x) => x.id === row.dataset.topicId);
      const next = CONF_ORDER[(CONF_ORDER.indexOf(t.confidence) + 1) % CONF_ORDER.length];
      setConfidence(s, t.id, next);
      await save(); render();
    } else if (action === "up" || action === "down") {
      const row = e.target.closest("[data-topic-id]");
      if (moveTopic(s, row.dataset.topicId, action === "up" ? -1 : 1)) { await save(); render(); }
    } else if (action === "del-topic") {
      const row = e.target.closest("[data-topic-id]");
      removeTopic(s, row.dataset.topicId);
      await save(); render();
      toast("Topic deleted.");
    } else if (action === "add-topic") {
      const input = card.querySelector(".topic-input");
      const t = newTopic(validateTopicName(input.value));
      s.topics.push(t);
      await save(); render();
      const again = document.querySelector('[data-subject-id="' + CSS.escape(s.id) + '"] .topic-input');
      if (again) again.focus();
    } else if (action === "del-subject") {
      if (!window.confirm('Delete "' + s.name + '" and all its topics? This cannot be undone.')) return;
      doc.subjects = doc.subjects.filter((x) => x.id !== s.id);
      await save(); render();
      toast("Subject deleted.");
    }
  } catch (err) {
    showError(err && err.message ? err.message : "Something went wrong.");
  }
});

$("subjectsWrap").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList && e.target.classList.contains("topic-input")) {
    e.preventDefault();
    const card = e.target.closest("[data-subject-id]");
    const btn = card && card.querySelector('[data-action="add-topic"]');
    if (btn) btn.click();
  }
});

$("subjectsWrap").addEventListener("change", async (e) => {
  if (!e.target.classList || !e.target.classList.contains("subj-date")) return;
  const card = e.target.closest("[data-subject-id]");
  const s = card && findSubject(card.dataset.subjectId);
  if (!s) return;
  showError(null);
  try {
    s.examDate = validateExamDate(e.target.value);
    await save(); render();
    toast("Exam date updated.");
  } catch (err) {
    showError(err && err.message ? err.message : "Invalid date.");
    e.target.value = s.examDate || "";
  }
});

/* ---------- boot ---------- */
load();
