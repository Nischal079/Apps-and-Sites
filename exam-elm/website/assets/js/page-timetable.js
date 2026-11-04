/**
 * StudyPilot — Timetable generator page controller.
 * Runs the shared site bootstrap, then wires the plan builder form,
 * subject rows, ICS export, save/load, and #plan= share links.
 */
import "/assets/js/site.js";

/* Theme/brand init now runs in /assets/js/site.js (see import above). */
import { esc, fmtTime, parseDateInput, toISODate, todayLocal, onDayChange, toast } from "/assets/js/ui.js";
import { generateTimetable, exportICS, encodeShare, decodeShare, shareAllowed } from "/assets/js/timetable.js";
import { openStorage } from "/assets/js/storage.js";
import { BRAND } from "/assets/js/config.js";

const $ = (id) => document.getElementById(id);
const rowsEl = $("subjectRows");
const emptyEl = $("subjectEmpty");
const formError = $("formError");
const result = $("result");
const resultBody = $("resultBody");
const planActions = $("planActions");
const saveCard = $("saveCard");
const saveError = $("saveError");

let currentInput = null;
let currentPlan = null;
let storage = null;

/* ---------- subject rows ---------- */

function refreshEmptyState() {
  emptyEl.hidden = rowsEl.children.length > 0;
}

function addSubjectRow(data = {}) {
  const row = document.createElement("div");
  row.className = "card";
  row.style.cssText = "margin-bottom:0.8rem; padding:1rem;";
  const uid = "sr" + Math.random().toString(36).slice(2, 8);
  row.innerHTML =
    '<div class="grid grid-2">' +
    '<div class="field"><label for="' + uid + '-n">Subject</label>' +
    '<input type="text" class="s-name" id="' + uid + '-n" placeholder="e.g. Physics" maxlength="60" value="' + esc(data.name || "") + '" /></div>' +
    '<div class="field"><label for="' + uid + '-p">Priority</label>' +
    '<select class="s-priority" id="' + uid + '-p">' +
    '<option value="3"' + (data.priority === 3 ? " selected" : "") + '>3 — most important</option>' +
    '<option value="2"' + (data.priority !== 1 && data.priority !== 3 ? " selected" : "") + '>2 — normal</option>' +
    '<option value="1"' + (data.priority === 1 ? " selected" : "") + '>1 — lower</option>' +
    '</select></div>' +
    '<div class="field"><label for="' + uid + '-e">Exam date (optional)</label>' +
    '<input type="date" class="s-exam" id="' + uid + '-e" value="' + esc(data.examDate || "") + '" /></div>' +
    '<div class="field" style="align-self:end;"><button class="btn btn-ghost btn-sm s-remove" type="button">Remove</button></div>' +
    "</div>";
  row.querySelector(".s-remove").addEventListener("click", () => {
    row.remove();
    refreshEmptyState();
  });
  rowsEl.appendChild(row);
  refreshEmptyState();
}

$("addSubject").addEventListener("click", () => addSubjectRow());

/* ---------- read form → input ---------- */

function readInput() {
  const subjects = [];
  const exams = [];
  rowsEl.querySelectorAll(".card").forEach((row, i) => {
    const name = row.querySelector(".s-name").value.trim();
    if (!name) return;
    const id = "sub-" + (i + 1);
    subjects.push({ id, name, priority: Number(row.querySelector(".s-priority").value) || 2 });
    const examDate = row.querySelector(".s-exam").value;
    if (examDate) exams.push({ id: "exam-" + (i + 1), subjectId: id, name: name + " exam", date: examDate });
  });

  const startVal = $("startDate").value;
  const startDate = startVal || toISODate(todayLocal());

  const dailyHours = Number($("dailyHours").value);
  const dayStartRaw = $("dayStart").value; // "HH:MM"
  let dayStartMin = 960;
  const tm = /^(\d{1,2}):(\d{2})$/.exec(dayStartRaw || "");
  if (tm) dayStartMin = Number(tm[1]) * 60 + Number(tm[2]);

  const restDays = [...document.querySelectorAll("#restDays input:checked")]
    .map((c) => Number(c.value));

  return {
    subjects,
    exams,
    startDate,
    dailyMinutes: isFinite(dailyHours) ? dailyHours * 60 : NaN,
    sessionMin: Number($("sessionLen").value),
    breakMin: Number($("breakMin").value),
    dayStartMin,
    restDays,
  };
}

function showFormError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}
function clearFormError() {
  formError.textContent = "";
  formError.hidden = true;
}

/* ---------- render plan ---------- */

function prettyDate(iso) {
  const d = parseDateInput(iso);
  if (!d) return iso;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function renderPlan(plan, input) {
  const { stats, days } = plan;
  const totalHours = Math.round((stats.totalStudyMinutes / 60) * 10) / 10;
  let html = "<h2 style='margin-top:0;'>Your study plan</h2>";
  html +=
    "<p class='muted'>" +
    esc(String(days.length)) + " days · " +
    esc(String(stats.totalSessions)) + " sessions · " +
    esc(String(totalHours)) + " hours planned</p>";
  html += "<ul style='margin:0 0 1.2rem; padding-left:1.2rem;'>";
  for (const [name, mins] of Object.entries(stats.perSubject)) {
    html += "<li>" + esc(name) + ": " + esc(String(Math.round(mins))) + " min</li>";
  }
  html += "</ul>";

  for (const day of days) {
    html += '<article class="plan-day"><h3>' + esc(prettyDate(day.date));
    if (day.sessions.length) html += ' <span class="muted">· ' + esc(String(day.totalMinutes)) + " min</span>";
    html += "</h3>";
    if (day.rest) {
      html += '<ul class="plan-list"><li><span class="muted">Rest day — no sessions scheduled.</span></li></ul>';
    } else if (!day.sessions.length) {
      html += '<ul class="plan-list"><li><span class="muted">Nothing fits today — try more daily hours or shorter sessions.</span></li></ul>';
    } else {
      html += '<ul class="plan-list">';
      for (const s of day.sessions) {
        const tag = s.type === "review" ? '<span class="tag review">REVIEW</span>' : '<span class="tag">STUDY</span>';
        html += "<li>" + tag +
          '<span class="tm">' + esc(fmtTime(s.startMin)) + " – " + esc(fmtTime(s.endMin)) + "</span>" +
          "<span>" + esc(s.subject) + "</span></li>";
      }
      html += "</ul>";
    }
    html += "</article>";
  }
  resultBody.innerHTML = html;
  result.hidden = false;
  planActions.hidden = false;
  saveCard.hidden = false;
  refreshSavedList();
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- generate ---------- */

$("generate").addEventListener("click", () => {
  clearFormError();
  let input;
  try {
    input = readInput();
    const plan = generateTimetable(input);
    currentInput = input;
    currentPlan = plan;
    renderPlan(plan, input);
  } catch (e) {
    showFormError(e && e.message ? e.message : "Something went wrong while building your plan.");
  }
});

/* ---------- storage: save / load / delete ---------- */

async function getStorage() {
  if (!storage) storage = await openStorage();
  if (storage.degraded) toast("Browser storage is limited right now — your plan may not persist between visits.");
  return storage;
}

function showSaveError(msg) {
  saveError.textContent = msg;
  saveError.hidden = false;
}
function clearSaveError() {
  saveError.textContent = "";
  saveError.hidden = true;
}

async function refreshSavedList() {
  const sel = $("savedPlans");
  try {
    const st = await getStorage();
    const rows = await st.list("timetables", { reverse: true, limit: 50 });
    sel.innerHTML = '<option value="">— choose a saved plan —</option>';
    for (const r of rows) {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name + " (" + (r.createdAt || "").slice(0, 10) + ")";
      sel.appendChild(opt);
    }
  } catch (e) {
    showSaveError("Couldn't read your saved plans: " + (e && e.message ? e.message : "storage unavailable"));
  }
}

$("saveBtn").addEventListener("click", async () => {
  clearSaveError();
  if (!currentPlan || !currentInput) {
    showSaveError("Generate a timetable first, then save it.");
    return;
  }
  const name = $("planName").value.trim() || ("Timetable " + toISODate(todayLocal()));
  try {
    const st = await getStorage();
    await st.put("timetables", {
      id: st.newId("tt"),
      name,
      createdAt: new Date().toISOString(),
      input: currentInput,
      plan: currentPlan,
    });
    toast("Plan saved to this browser.");
    await refreshSavedList();
  } catch (e) {
    showSaveError("Couldn't save the plan: " + (e && e.message ? e.message : "storage unavailable"));
  }
});

function fillForm(input) {
  rowsEl.innerHTML = "";
  const examsBySubject = {};
  for (const e of input.exams || []) {
    if (e.subjectId) examsBySubject[e.subjectId] = e.date;
  }
  for (const s of input.subjects || []) {
    addSubjectRow({ name: s.name, priority: s.priority, examDate: examsBySubject[s.id] || "" });
  }
  refreshEmptyState();
  $("startDate").value = input.startDate || "";
  $("dailyHours").value = isFinite(input.dailyMinutes) ? String(input.dailyMinutes / 60) : "";
  $("sessionLen").value = String(input.sessionMin || 50);
  $("breakMin").value = input.breakMin == null ? "" : String(input.breakMin);
  const dm = Number(input.dayStartMin);
  $("dayStart").value = isFinite(dm) ? String(Math.floor(dm / 60)).padStart(2, "0") + ":" + String(dm % 60).padStart(2, "0") : "";
  document.querySelectorAll("#restDays input").forEach((c) => {
    c.checked = (input.restDays || []).includes(Number(c.value));
  });
}

$("loadBtn").addEventListener("click", async () => {
  clearSaveError();
  const id = $("savedPlans").value;
  if (!id) {
    showSaveError("Pick a saved plan from the list first.");
    return;
  }
  try {
    const st = await getStorage();
    const rec = await st.get("timetables", id);
    if (!rec) {
      showSaveError("That plan is no longer saved.");
      await refreshSavedList();
      return;
    }
    fillForm(rec.input);
    currentInput = rec.input;
    currentPlan = generateTimetable(rec.input); // regenerate from the saved input
    renderPlan(currentPlan, currentInput);
    toast("Plan loaded.");
  } catch (e) {
    showSaveError(e && e.message ? e.message : "Couldn't load the plan.");
  }
});

$("deleteBtn").addEventListener("click", async () => {
  clearSaveError();
  const id = $("savedPlans").value;
  if (!id) {
    showSaveError("Pick a saved plan from the list first.");
    return;
  }
  try {
    const st = await getStorage();
    await st.del("timetables", id);
    toast("Saved plan deleted.");
    await refreshSavedList();
  } catch (e) {
    showSaveError("Couldn't delete the plan: " + (e && e.message ? e.message : "storage unavailable"));
  }
});

/* ---------- print / ics / share ---------- */

$("printBtn").addEventListener("click", () => window.print());

$("icsBtn").addEventListener("click", () => {
  if (!currentPlan) return;
  const ics = exportICS(currentPlan, { calendarName: "Study Timetable", brandName: BRAND.name });
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "study-timetable.ics";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
  toast("Calendar file downloaded.");
});

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    ta.remove();
  }
}

$("shareBtn").addEventListener("click", async () => {
  clearFormError();
  if (!currentInput) {
    showFormError("Generate a timetable first, then share it.");
    return;
  }
  let code;
  try {
    code = encodeShare(currentInput);
  } catch (e) {
    showFormError("Couldn't build a share link: " + (e && e.message ? e.message : "unknown error"));
    return;
  }
  if (!shareAllowed(code)) {
    showFormError("Link too long — download instead (Export .ics, or save it to this browser).");
    return;
  }
  const url = location.origin + location.pathname + "#plan=" + code;
  try {
    await copyText(url);
    toast("Share link copied to your clipboard.");
  } catch (e) {
    showFormError("Couldn't copy the link automatically — your plan is still shown above.");
  }
});

/* ---------- init ---------- */

function init() {
  $("startDate").value = toISODate(todayLocal());
  addSubjectRow();
  addSubjectRow();

  // Day-rollover: keep the default start date honest when the tab sits open
  // overnight; nudge the user to re-plan rather than silently rewriting it.
  onDayChange((today) => {
    $("startDate").value = today;
    if (currentInput) {
      toast("Day rolled over — press Generate again to re-plan from today.");
    }
  });

  // Open a shared plan from the URL hash, if present.
  if (location.hash.startsWith("#plan=")) {
    const code = location.hash.slice("#plan=".length);
    try {
      const input = decodeShare(decodeURIComponent(code));
      fillForm(input);
      currentInput = input;
      currentPlan = generateTimetable(input);
      renderPlan(currentPlan, input);
      history.replaceState(null, "", location.pathname);
    } catch (e) {
      showFormError(e && e.message ? e.message : "That share link couldn't be opened.");
    }
  }
}

init();
