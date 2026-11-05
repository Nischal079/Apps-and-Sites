/**
 * StudyPilot · Exam countdown page controller.
 * Runs the shared site bootstrap, then wires multi-exam countdowns
 * with timezone-safe date math and tracker deep-links.
 */
import "/assets/js/site.js";

import { esc, toast, todayLocal, toISODate, onDayChange } from "/assets/js/ui.js";
import { openStorage } from "/assets/js/storage.js";
import {
  COUNTDOWN_KV_KEY, COUNTDOWN_VERSION,
  validateExamName, validateExamDate, validateDailyHours, newExam,
  daysUntil, examBucket, bucketLabel, sortExams,
  prepEstimate, dayReminders,
} from "/assets/js/countdown.js";
import { TRACKER_KV_KEY, TRACKER_VERSION, linkExam } from "/assets/js/tracker.js";

/* ============================================================
 * Exam Countdown · UI WIRING ONLY.
 * All math lives in /assets/js/countdown.js (pure, unit-tested).
 * Exam docs persist in kv ("countdown:v1"); linked tracker
 * subjects keep their examDate in sync through tracker:v1.
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
}

/* ---------- state + persistence ---------- */
let storage = null;
let examsDoc = { version: COUNTDOWN_VERSION, exams: [] };
let trackerDoc = { version: TRACKER_VERSION, subjects: [] };
let editingId = null;

async function loadDocs() {
  try {
    storage = await openStorage();
    if (storage.degraded) $("degradedNote").hidden = false;
    const c = await storage.get("kv", COUNTDOWN_KV_KEY);
    if (c && c.value && Array.isArray(c.value.exams)) {
      examsDoc = { version: COUNTDOWN_VERSION, exams: c.value.exams };
    }
    const t = await storage.get("kv", TRACKER_KV_KEY);
    if (t && t.value && Array.isArray(t.value.subjects)) {
      trackerDoc = { version: TRACKER_VERSION, subjects: t.value.subjects };
    }
  } catch (e) {
    showError("Couldn't open local storage: " + (e && e.message ? e.message : "unknown error") + ". Your exams won't be saved.");
  }
}

async function saveExams() {
  if (!storage) return;
  try {
    await storage.put("kv", { key: COUNTDOWN_KV_KEY, value: examsDoc });
  } catch (e) {
    showError("Couldn't save exams: " + (e && e.message ? e.message : "storage error") + ".");
  }
}

async function saveTracker() {
  if (!storage) return;
  try {
    await storage.put("kv", { key: TRACKER_KV_KEY, value: trackerDoc });
  } catch (e) {
    showError("Couldn't save linked subject: " + (e && e.message ? e.message : "storage error") + ".");
  }
}

/** On exam delete: keep the subject's date (still meaningful) but clear the link. */
async function unlinkSubject(examId) {
  const s = trackerDoc.subjects.find((x) => x.examId === examId);
  if (!s) return;
  s.examId = null;
  await saveTracker();
}

/* ---------- rendering ---------- */

function bucketBadge(bucket) {
  const map = {
    today: ["warn", "Today"],
    tomorrow: ["info", "Tomorrow"],
    week: ["info", "This week"],
    later: ["", "Upcoming"],
    past: ["bad", "Past"],
  };
  const [kind, label] = map[bucket] || ["", bucket];
  return '<span class="badge ' + kind + '">' + esc(label) + "</span>";
}

function examCardHTML(exam, todayISO) {
  const daysLeft = daysUntil(exam.date, todayISO);
  const bucket = examBucket(daysLeft);
  const est = prepEstimate(exam, trackerDoc.subjects, todayISO);
  const big = bucket === "today" ? "Today" : bucket === "past" ? String(Math.abs(daysLeft)) : String(daysLeft);
  const bigSub = bucket === "today" ? "good luck" : bucket === "past" ? "days ago" : "days left";
  let html = '<article class="card count-card ' + esc(bucket) + '" data-exam-id="' + esc(exam.id) + '">';
  html += "<h3>" + esc(exam.name) + "</h3>";
  html += '<p class="count-big">' + esc(big) + '</p><p class="muted">' + esc(bigSub) + " · " + esc(bucketLabel(daysLeft)) + "</p>";
  html += "<p>" + bucketBadge(bucket) + "</p>";
  html += '<div class="kv-line"><span class="muted">Date</span><span>' + esc(exam.date) + "</span></div>";
  if (exam.dailyHours != null) {
    html += '<div class="kv-line"><span class="muted">Study time</span><span>' + esc(String(exam.dailyHours)) + " h/day</span></div>";
  }
  html += '<p class="muted" style="margin-top:0.5rem">' + esc(est.message) + "</p>";
  html += '<div class="btn-row left">' +
    '<button type="button" class="btn btn-ghost btn-sm" data-action="edit">Edit</button>' +
    '<button type="button" class="btn btn-ghost btn-sm danger" data-action="del">Delete</button>' +
    "</div>";
  html += "</article>";
  return html;
}

function renderSubjectOptions(selectedId) {
  const sel = $("examSubject");
  const cur = sel.value;
  let html = '<option value="">No link</option>';
  for (const s of trackerDoc.subjects) {
    const selAttr = (selectedId || cur) === s.id ? " selected" : "";
    html += '<option value="' + esc(s.id) + '"' + selAttr + ">" + esc(s.name) +
      (s.examDate ? " (" + esc(s.examDate) + ")" : "") + "</option>";
  }
  sel.innerHTML = html;
}

function render() {
  const todayISO = toISODate(todayLocal());

  /* reminders: check-on-load, day-level only (no backend scheduling exists) */
  const reminders = dayReminders(examsDoc.exams, todayISO);
  if (reminders.length) {
    $("remindList").innerHTML = reminders.map((r) => "<li>" + esc(r.message) + "</li>").join("");
    $("remindBanner").hidden = false;
  } else {
    $("remindBanner").hidden = true;
  }

  /* cards */
  const sorted = sortExams(examsDoc.exams);
  $("emptyExams").hidden = sorted.length > 0;
  $("examsGrid").innerHTML = sorted.map((e) => examCardHTML(e, todayISO)).join("");

  renderSubjectOptions();
}

/* ---------- actions ---------- */

function resetForm() {
  $("examName").value = "";
  $("examDate").value = "";
  $("examHours").value = "";
  $("examSubject").value = "";
  $("addExamBtn").textContent = "Add exam";
  $("cancelEditBtn").hidden = true;
  editingId = null;
  const err = $("examError");
  err.hidden = true; err.textContent = "";
}

$("addExamBtn").addEventListener("click", async () => {
  showError(null);
  const err = $("examError");
  err.hidden = true; err.textContent = "";
  try {
    const name = validateExamName($("examName").value);
    const date = validateExamDate($("examDate").value);
    const hours = validateDailyHours($("examHours").value);
    const subjectId = $("examSubject").value || null;

    if (editingId) {
      const exam = examsDoc.exams.find((x) => x.id === editingId);
      if (!exam) throw new Error("That exam no longer exists · it may have been deleted.");
      const oldSubject = trackerDoc.subjects.find((x) => x.examId === exam.id);
      if (oldSubject && (!subjectId || oldSubject.id !== subjectId)) oldSubject.examId = null;
      exam.name = name; exam.date = date; exam.dailyHours = hours;
      if (subjectId) {
        const s = trackerDoc.subjects.find((x) => x.id === subjectId);
        if (s) { linkExam(s, exam.id, exam.date); }
      }
      await saveTracker();
      await saveExams();
      toast("Exam updated.");
    } else {
      const exam = newExam(name, date, hours);
      examsDoc.exams.push(exam);
      if (subjectId) {
        const s = trackerDoc.subjects.find((x) => x.id === subjectId);
        if (s) { linkExam(s, exam.id, exam.date); }
      }
      await saveTracker();
      await saveExams();
      toast("Exam added.");
    }
    resetForm();
    render();
  } catch (e) {
    err.textContent = e && e.message ? e.message : "Couldn't save the exam.";
    err.hidden = false;
  }
});

$("cancelEditBtn").addEventListener("click", resetForm);

$("examsGrid").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  const card = e.target.closest("[data-exam-id]");
  if (!btn || !card) return;
  const exam = examsDoc.exams.find((x) => x.id === card.dataset.examId);
  if (!exam) return;
  showError(null);
  try {
    if (btn.dataset.action === "del") {
      if (!window.confirm('Delete the countdown for "' + exam.name + '"? This cannot be undone.')) return;
      examsDoc.exams = examsDoc.exams.filter((x) => x.id !== exam.id);
      await unlinkSubject(exam.id);
      await saveExams();
      if (editingId === exam.id) resetForm();
      render();
      toast("Exam deleted.");
    } else if (btn.dataset.action === "edit") {
      editingId = exam.id;
      $("examName").value = exam.name;
      $("examDate").value = exam.date;
      $("examHours").value = exam.dailyHours == null ? "" : String(exam.dailyHours);
      const linked = trackerDoc.subjects.find((x) => x.examId === exam.id);
      renderSubjectOptions(linked ? linked.id : "");
      $("addExamBtn").textContent = "Save changes";
      $("cancelEditBtn").hidden = false;
      $("examName").focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (err) {
    showError(err && err.message ? err.message : "Something went wrong.");
  }
});

/* ---------- boot + day-change recompute ---------- */
async function boot() {
  await loadDocs();
  render();
}
onDayChange(() => render()); // countdowns recompute when the device crosses midnight
boot();
