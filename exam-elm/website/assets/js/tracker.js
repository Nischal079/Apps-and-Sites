/**
 * StudyPilot — syllabus coverage tracker: PURE LOGIC, no DOM.
 *
 * Data model (persisted as one document in the kv store under "tracker:v1"):
 *   { version: 1,
 *     subjects: [ { id, name, examDate: "YYYY-MM-DD"|null, examId: string|null,
 *                   createdAt: "YYYY-MM-DD", topics: [ {id, name, confidence} ] } ] }
 * Confidence: "none" | "wip" | "done" (not started / in progress / confident).
 * examId links to an exam-countdown exam of the same id; prep estimates also
 * fall back to a case-insensitive name match.
 *
 * All date math is DATE-ONLY via parseDateInput()/daysBetween() from ui.js —
 * never timestamp diffs, so DST transitions and timezone offsets cannot
 * corrupt a pace or countdown. See methodology/syllabus-tracker/.
 */

import { parseDateInput, daysBetween } from "./ui.js";

export const CONF = { NONE: "none", WIP: "wip", DONE: "done" };
export const CONF_WEIGHT = { none: 0, wip: 0.5, done: 1 };
export const CONF_LABEL = { none: "Not started", wip: "In progress", done: "Confident" };
export const TRACKER_KV_KEY = "tracker:v1";
export const TRACKER_VERSION = 1;

let uidCounter = 0;
export function newId(prefix) {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Strict YYYY-MM-DD parse: rejects rollover dates like 2026-13-40. */
export function parseStrictDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || "").trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (isNaN(d)) return null;
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
  return d;
}

export function isoOf(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------------- validation (plain-language errors) ---------------- */

export function validateSubjectName(name) {
  const n = String(name || "").trim();
  if (!n) throw new Error("Give the subject a name, e.g. “Physics”.");
  if (n.length > 80) throw new Error("Subject names are limited to 80 characters — shorten it a little.");
  return n;
}

/** Empty string => null (exam date is optional). Otherwise strict date. */
export function validateExamDate(str) {
  const s = String(str || "").trim();
  if (!s) return null;
  const d = parseStrictDate(s);
  if (!d) throw new Error("Enter a valid exam date, e.g. 2026-12-04.");
  const y = d.getFullYear();
  if (y < 2000 || y > 2100) throw new Error("That year looks wrong — enter a date between 2000 and 2100.");
  return isoOf(d);
}

export function validateTopicName(name) {
  const n = String(name || "").trim();
  if (!n) throw new Error("Give the topic a name, e.g. “Thermodynamics”.");
  if (n.length > 120) throw new Error("Topic names are limited to 120 characters — shorten it a little.");
  return n;
}

export function validateConfidence(c) {
  if (c !== CONF.NONE && c !== CONF.WIP && c !== CONF.DONE) {
    throw new Error("Unknown confidence value — this looks like corrupted data.");
  }
  return c;
}

/* ---------------- constructors ---------------- */

export function newSubject(name, examDateISO, todayISO) {
  const clean = validateSubjectName(name);
  const examDate = examDateISO ? validateExamDate(examDateISO) : null;
  const t = todayISO ? parseStrictDate(todayISO) : null;
  return {
    id: newId("sub"),
    name: clean,
    examDate,
    examId: null,
    createdAt: t ? isoOf(t) : null,
    topics: [],
  };
}

export function newTopic(name) {
  return { id: newId("top"), name: validateTopicName(name), confidence: CONF.NONE };
}

/* ---------------- coverage ---------------- */

/**
 * Coverage % = (confident + 0.5 × in-progress) ÷ total topics.
 * In-progress work moves the needle; not-started doesn't.
 * Returns { total, done, wip, percent } — percent is null when total is 0.
 */
export function subjectCoverage(subject) {
  const topics = subject.topics || [];
  const total = topics.length;
  let done = 0,
    wip = 0,
    weighted = 0;
  for (const t of topics) {
    if (t.confidence === CONF.DONE) {
      done++;
      weighted += 1;
    } else if (t.confidence === CONF.WIP) {
      wip++;
      weighted += 0.5;
    }
  }
  return {
    total,
    done,
    wip,
    percent: total === 0 ? null : Math.round((weighted / total) * 1000) / 10,
  };
}

export function overallCoverage(subjects) {
  const flat = [];
  for (const s of subjects || []) for (const t of s.topics || []) flat.push(t);
  return subjectCoverage({ topics: flat });
}

/* ---------------- pace ---------------- */

/**
 * paceFor(subject, todayISO) — plain-language schedule verdict.
 * todayISO: "YYYY-MM-DD" (the page passes the device's local date).
 *
 * status: "no-date" | "past" | "today" | "done" | "too-early" | "behind" | "on-track"
 * requiredPerDay = topics remaining (not confident) ÷ days left.
 * actualPerDay   = weighted topics finished ÷ days since tracking started.
 */
export function paceFor(subject, todayISO) {
  const today = parseStrictDate(todayISO);
  if (!today) throw new Error("paceFor: todayISO must be YYYY-MM-DD.");
  const cov = subjectCoverage(subject);
  const remaining = cov.total - cov.done; // wip topics still need finishing

  if (!subject.examDate) {
    return { status: "no-date", daysLeft: null, remaining, requiredPerDay: null, message: "Add an exam date to see your pace." };
  }
  const exam = parseStrictDate(subject.examDate);
  const daysLeft = daysBetween(today, exam);

  if (daysLeft < 0) {
    return { status: "past", daysLeft, remaining, requiredPerDay: null, message: "This exam date has passed — set the next one." };
  }
  if (remaining === 0 && cov.total > 0) {
    return { status: "done", daysLeft, remaining: 0, requiredPerDay: 0, message: "Syllabus complete — use the time for revision." };
  }
  if (daysLeft === 0) {
    return { status: "today", daysLeft: 0, remaining, requiredPerDay: remaining, message: "Exam is today — focus on your weakest topics below." };
  }

  const requiredPerDay = remaining / daysLeft;
  const created = subject.createdAt ? parseStrictDate(subject.createdAt) : null;
  const elapsed = created ? daysBetween(created, today) : 0;
  if (elapsed < 1) {
    return {
      status: "too-early", daysLeft, remaining, requiredPerDay,
      message: "You just started tracking — check back tomorrow for a pace reading.",
    };
  }
  const doneWeighted = cov.done + cov.wip * 0.5;
  const actualPerDay = doneWeighted / elapsed;
  const r1 = (n) => Math.round(n * 10) / 10;
  if (actualPerDay >= requiredPerDay) {
    return {
      status: "on-track", daysLeft, remaining, requiredPerDay: r1(requiredPerDay),
      actualPerDay: r1(actualPerDay),
      message: `On track: you need about ${r1(requiredPerDay)} topics/day and you're finishing about ${r1(actualPerDay)}/day.`,
    };
  }
  return {
    status: "behind", daysLeft, remaining, requiredPerDay: r1(requiredPerDay),
    actualPerDay: r1(actualPerDay),
    message: `Behind pace: you need about ${r1(requiredPerDay)} topics/day, but so far you've finished about ${r1(actualPerDay)}/day.`,
  };
}

/* ---------------- weakest topics ---------------- */

/**
 * Ranked by exam proximity × low confidence.
 * risk = confidenceWeight ÷ (daysLeft + 1); confidenceWeight: none=3, wip=1.5.
 * Subjects without an exam date get a small baseline weight (ranked lower);
 * past exams are excluded. Confident topics are never listed.
 */
export function weakestTopics(subjects, todayISO, limit = 5) {
  const today = parseStrictDate(todayISO);
  if (!today) throw new Error("weakestTopics: todayISO must be YYYY-MM-DD.");
  const out = [];
  for (const s of subjects || []) {
    let daysLeft = null;
    if (s.examDate) {
      const exam = parseStrictDate(s.examDate);
      if (exam) {
        daysLeft = daysBetween(today, exam);
        if (daysLeft < 0) continue; // past exam — nothing to prioritize
      }
    }
    for (const t of s.topics || []) {
      if (t.confidence === CONF.DONE) continue;
      const confW = t.confidence === CONF.WIP ? 1.5 : 3;
      const risk = daysLeft === null ? confW * 0.01 : confW / (daysLeft + 1);
      out.push({
        subjectId: s.id,
        subjectName: s.name,
        topicId: t.id,
        topicName: t.name,
        confidence: t.confidence,
        examDate: s.examDate,
        daysLeft,
        risk,
      });
    }
  }
  out.sort((a, b) => b.risk - a.risk || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || String(a.topicName).localeCompare(b.topicName));
  return out.slice(0, Math.max(0, limit || 0));
}

/** Plain-language reason line for a weakest-topic entry. */
export function weakestReason(entry) {
  const conf = CONF_LABEL[entry.confidence] || entry.confidence;
  let when;
  if (entry.daysLeft === null) when = "no exam date set";
  else if (entry.daysLeft === 0) when = "exam today";
  else if (entry.daysLeft === 1) when = "exam tomorrow";
  else when = `exam in ${entry.daysLeft} days`;
  return `${conf} · ${when}`;
}

/* ---------------- mutations ---------------- */

export function setConfidence(subject, topicId, conf) {
  validateConfidence(conf);
  const t = (subject.topics || []).find((x) => x.id === topicId);
  if (!t) throw new Error("Topic not found — it may have been deleted.");
  t.confidence = conf;
  return t;
}

export function moveTopic(subject, topicId, dir) {
  const arr = subject.topics || [];
  const i = arr.findIndex((x) => x.id === topicId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}

export function removeTopic(subject, topicId) {
  const arr = subject.topics || [];
  const i = arr.findIndex((x) => x.id === topicId);
  if (i < 0) throw new Error("Topic not found — it may have been deleted already.");
  arr.splice(i, 1);
}

/** Link a subject to a countdown exam (id) and sync its exam date. */
export function linkExam(subject, examId, examDateISO) {
  subject.examId = examId || null;
  if (examDateISO) subject.examDate = validateExamDate(examDateISO);
  return subject;
}
