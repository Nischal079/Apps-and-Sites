/**
 * StudyPilot · exam countdown planner: PURE LOGIC, no DOM.
 *
 * Data model (persisted as one document in the kv store under "countdown:v1"):
 *   { version: 1, exams: [ { id, name, date: "YYYY-MM-DD", dailyHours: number|null } ] }
 *
 * TIMEZONE CORRECTNESS (the top risk for this tool): every computation here
 * is DATE-ONLY. daysUntil(examISO, todayISO) depends only on the two calendar
 * dates · it never touches timestamps, so a student in Kathmandu (+5:45) and
 * one in New York (−5:00) see the same "days left" for the same exam date on
 * the same local calendar day. DST transitions cannot shift a count because
 * daysBetween() normalizes through Date.UTC day boundaries.
 * See methodology/exam-countdown/.
 */

import { daysBetween } from "./ui.js";
import { parseStrictDate } from "./tracker.js";

export const COUNTDOWN_KV_KEY = "countdown:v1";
export const COUNTDOWN_VERSION = 1;
export const REMINDER_WINDOW_DAYS = 7;

let uidCounter = 0;
function newId(prefix) {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------------- validation (plain-language errors) ---------------- */

export function validateExamName(name) {
  const n = String(name || "").trim();
  if (!n) throw new Error("Give the exam a name, e.g. “Physics final”.");
  if (n.length > 80) throw new Error("Exam names are limited to 80 characters · shorten it a little.");
  return n;
}

export function validateExamDate(str) {
  const s = String(str || "").trim();
  if (!s) throw new Error("Enter the exam date.");
  const d = parseStrictDate(s);
  if (!d) throw new Error("Enter a valid exam date, e.g. 2026-12-04.");
  const y = d.getFullYear();
  if (y < 2000 || y > 2100) throw new Error("That year looks wrong · enter a date between 2000 and 2100.");
  const p = (n) => String(n).padStart(2, "0");
  return `${y}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Empty => null (optional). Otherwise 0–24. */
export function validateDailyHours(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const v = Number(s);
  if (!Number.isFinite(v)) throw new Error("Daily hours: enter a number, e.g. 3.");
  if (v < 0 || v > 24) throw new Error("Daily hours must be between 0 and 24.");
  return Math.round(v * 10) / 10;
}

export function newExam(name, dateISO, dailyHours) {
  return {
    id: newId("exam"),
    name: validateExamName(name),
    date: validateExamDate(dateISO),
    dailyHours: validateDailyHours(dailyHours),
  };
}

/* ---------------- date math (date-only, TZ-safe) ---------------- */

/**
 * Whole days from todayISO to dateISO. Throws a plain-language error on
 * invalid input. Identical inputs give identical outputs in every timezone.
 */
export function daysUntil(dateISO, todayISO) {
  const exam = parseStrictDate(dateISO);
  const today = parseStrictDate(todayISO);
  if (!exam) throw new Error("daysUntil: dateISO must be a valid YYYY-MM-DD date.");
  if (!today) throw new Error("daysUntil: todayISO must be a valid YYYY-MM-DD date.");
  return daysBetween(today, exam);
}

/** Bucket for display grouping: past | today | tomorrow | week | later */
export function examBucket(daysLeft) {
  if (daysLeft < 0) return "past";
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  if (daysLeft <= REMINDER_WINDOW_DAYS) return "week";
  return "later";
}

export function bucketLabel(daysLeft) {
  if (daysLeft < 0) return daysLeft === -1 ? "Yesterday" : `${Math.abs(daysLeft)} days ago`;
  if (daysLeft === 0) return "Today";
  if (daysLeft === 1) return "Tomorrow";
  return `In ${daysLeft} days`;
}

export function sortExams(exams) {
  return (exams || []).slice().sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.name).localeCompare(b.name)
  );
}

/* ---------------- tracker linking ---------------- */

/**
 * Find the tracker subject for an exam: examId match first, then
 * case-insensitive name match (subjects created before linking).
 */
export function linkSubject(exam, subjects) {
  const list = subjects || [];
  if (exam.id) {
    const byId = list.find((s) => s.examId === exam.id);
    if (byId) return byId;
  }
  const nm = String(exam.name || "").trim().toLowerCase();
  return list.find((s) => String(s.name || "").trim().toLowerCase() === nm) || null;
}

/* ---------------- prep estimate ---------------- */

/**
 * Prep-time estimate from linked tracker data.
 * verdict: "past" | "no-data" | "done" | "today" | "plan"
 */
export function prepEstimate(exam, subjects, todayISO) {
  const daysLeft = daysUntil(exam.date, todayISO);
  if (daysLeft < 0) {
    return { daysLeft, verdict: "past", linked: false, message: "This exam has passed." };
  }
  const subject = linkSubject(exam, subjects);
  if (!subject) {
    return {
      daysLeft, verdict: "no-data", linked: false,
      message: "Track this subject's syllabus to get a daily topic target.",
    };
  }
  const topics = subject.topics || [];
  const remaining = topics.filter((t) => t.confidence !== "done").length;
  if (topics.length === 0) {
    return {
      daysLeft, verdict: "no-data", linked: true, subjectName: subject.name,
      message: "This subject has no topics yet · add them in the syllabus tracker.",
    };
  }
  if (remaining === 0) {
    return {
      daysLeft, verdict: "done", linked: true, subjectName: subject.name, remaining: 0,
      message: "Syllabus complete · use the remaining time for revision.",
    };
  }
  if (daysLeft === 0) {
    return {
      daysLeft, verdict: "today", linked: true, subjectName: subject.name, remaining,
      message: `Exam is today · ${remaining} topic${remaining === 1 ? "" : "s"} still open; focus on the weakest.`,
    };
  }
  const requiredPerDay = Math.round((remaining / daysLeft) * 10) / 10;
  let message = `About ${requiredPerDay} topic${requiredPerDay === 1 ? "" : "s"} per day to finish “${subject.name}” in time.`;
  if (exam.dailyHours != null && exam.dailyHours > 0) {
    message += ` You have ${exam.dailyHours} h/day available.`;
  }
  return { daysLeft, verdict: "plan", linked: true, subjectName: subject.name, remaining, requiredPerDay, message };
}

/* ---------------- check-on-load reminders ---------------- */

/**
 * Day-level reminders · computed on page load (and on day change).
 * NO backend scheduling: a static page cannot wake itself. Exams due within
 * the reminder window (today … +7 days) produce banner messages.
 */
export function dayReminders(exams, todayISO) {
  const out = [];
  for (const e of sortExams(exams)) {
    const daysLeft = daysUntil(e.date, todayISO);
    if (daysLeft < 0 || daysLeft > REMINDER_WINDOW_DAYS) continue;
    let message;
    if (daysLeft === 0) message = `“${e.name}” is today · good luck.`;
    else if (daysLeft === 1) message = `“${e.name}” is tomorrow.`;
    else message = `“${e.name}” is in ${daysLeft} days.`;
    out.push({ exam: e, daysLeft, message });
  }
  return out;
}
