/**
 * ExamElm · dashboard page controller.
 *
 * Read-only control center: aggregates what the user already has in
 * browser storage (tracker subjects, countdown exams, saved timetables,
 * notes, files) into stats, upcoming exams, syllabus progress, and recent
 * items. Nothing here writes data; every card links to the tool that owns
 * it. Graceful when storage is empty or degraded.
 */
import "/assets/js/site.js";
import { esc, todayLocal, toISODate } from "/assets/js/ui.js";
import { openStorage } from "/assets/js/storage.js";
import { TRACKER_KV_KEY, subjectCoverage, overallCoverage } from "/assets/js/tracker.js";
import { COUNTDOWN_KV_KEY, daysUntil, bucketLabel, sortExams } from "/assets/js/countdown.js";

const $ = (id) => document.getElementById(id);

function fmtDate(iso) {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function renderUpcoming(exams, todayISO) {
  const host = $("upcomingList");
  const upcoming = sortExams(exams)
    .map((e) => {
      try {
        return { ...e, days: daysUntil(e.date, todayISO) };
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.days >= 0)
    .slice(0, 5);
  if (!upcoming.length) {
    host.innerHTML =
      '<div class="empty"><p>No upcoming exams.</p><p class="hint">Add one in the Exam Countdown tool.</p></div>';
    return;
  }
  host.innerHTML = upcoming
    .map(
      (e) =>
        `<div class="list-item"><span class="list-item-title">${esc(e.name)}</span>` +
        `<span class="list-item-meta">${esc(fmtDate(e.date))} &middot; ${esc(bucketLabel(e.days))}</span></div>`
    )
    .join("");
}

function renderSyllabus(subjects) {
  const host = $("syllabusList");
  if (!subjects.length) {
    host.innerHTML =
      '<div class="empty"><p>No subjects tracked yet.</p><p class="hint">Add one in the Syllabus Tracker.</p></div>';
    return;
  }
  host.innerHTML = subjects
    .slice(0, 5)
    .map((s) => {
      const c = subjectCoverage(s);
      const pct = c.percent === null ? "No topics yet" : `${c.percent}% covered`;
      const bar =
        c.percent === null
          ? ""
          : `<div class="progress" style="margin-top:0.4rem"><span style="width:${c.percent}%"></span></div>`;
      return (
        `<div class="list-item"><span class="list-item-title">${esc(s.name)}</span>` +
        `<span class="list-item-meta">${c.done} confident &middot; ${c.wip} in progress &middot; ${c.total} topics &middot; ${pct}</span>${bar}</div>`
      );
    })
    .join("");
}

function renderRecentPlans(plans) {
  const host = $("recentPlans");
  if (!plans.length) {
    host.innerHTML =
      '<div class="empty"><p>No saved timetables yet.</p><p class="hint">Generate one, then save it from the Timetable tool.</p></div>';
    return;
  }
  host.innerHTML = plans
    .map(
      (p) =>
        `<a class="list-item" href="/tools/timetable/" style="text-decoration:none"><span class="list-item-title">${esc(p.name || "Untitled plan")}</span>` +
        `<span class="list-item-meta">Saved ${esc(new Date(p.createdAt).toLocaleDateString())}</span></a>`
    )
    .join("");
}

function renderRecentNotes(notes) {
  const host = $("recentNotes");
  if (!notes.length) {
    host.innerHTML =
      '<div class="empty"><p>No notes yet.</p><p class="hint">Write your first note in My Study Space.</p></div>';
    return;
  }
  host.innerHTML = notes
    .map(
      (n) =>
        `<a class="list-item" href="/study-space/" style="text-decoration:none"><span class="list-item-title">${esc(n.title || "Untitled note")}</span>` +
        `<span class="list-item-meta">Updated ${esc(new Date(n.updatedAt).toLocaleDateString())}</span></a>`
    )
    .join("");
}

async function main() {
  const storage = await openStorage();
  if (storage.degraded) $("degradedBanner").hidden = false;

  const trackerRec = await storage.get("kv", TRACKER_KV_KEY);
  const subjects = (trackerRec && trackerRec.value && trackerRec.value.subjects) || [];
  const cdRec = await storage.get("kv", COUNTDOWN_KV_KEY);
  const exams = (cdRec && cdRec.value && cdRec.value.exams) || [];
  const allPlans = await storage.list("timetables", { reverse: true });
  const plans = allPlans.slice(0, 5);
  const allNotes = await storage.list("notes", { reverse: true });
  const notes = allNotes.slice(0, 5);
  const allFiles = await storage.list("files", { reverse: true });

  const todayISO = toISODate(todayLocal());
  const coverage = overallCoverage(subjects);

  /* Stats */
  $("statTimetables").textContent = String(allPlans.length);
  $("statTimetablesSub").textContent = plans.length
    ? `Latest: ${plans[0].name || "Untitled plan"}`
    : "Generate one to get started";
  $("statCoverage").textContent = coverage.percent === null ? "n/a" : `${coverage.percent}%`;
  $("statCoverageSub").textContent =
    coverage.total === 0
      ? "No topics tracked yet"
      : `${coverage.done} confident of ${coverage.total} topics`;
  const next = sortExams(exams)
    .map((e) => {
      try {
        return { ...e, days: daysUntil(e.date, todayISO) };
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.days >= 0)[0];
  $("statNextExam").textContent = next ? (next.days === 0 ? "Today" : `In ${next.days}d`) : "n/a";
  $("statNextExamSub").textContent = next ? next.name : "No upcoming exams";
  $("statNotes").textContent = String(allNotes.length + allFiles.length);
  $("statNotesSub").textContent = `${allNotes.length} notes · ${allFiles.length} files`;

  /* Sections */
  renderUpcoming(exams, todayISO);
  renderSyllabus(subjects);
  renderRecentPlans(plans);
  renderRecentNotes(notes);

  const hasAnything =
    subjects.length > 0 || exams.length > 0 || allPlans.length > 0 || allNotes.length > 0 || allFiles.length > 0;
  $("emptyState").hidden = hasAnything;
}

main().catch((e) => {
  $("upcomingList").innerHTML = `<div class="empty"><p>Couldn't load the dashboard: ${esc(e.message || "storage unavailable")}.</p></div>`;
});
