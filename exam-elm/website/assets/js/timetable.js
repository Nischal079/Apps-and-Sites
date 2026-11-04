/**
 * StudyPilot — timetable generation engine.
 *
 * PURE, DOM-free ES module: no browser APIs, no imports. Node tests import
 * this directly. Date handling follows the frozen ui.js mandate:
 * date-only math via local components + Date.UTC diffs — never
 * `new Date("YYYY-MM-DD")` (UTC-shift bug) and never timestamp diffs for day
 * counts, so DST transitions cannot corrupt the plan.
 */

export const SHARE_LIMIT = 1500; // max base64url chars the UI will put in a share link

/** Pure size-guard predicate for the share flow: is this encoded payload short
 *  enough to paste into a share link? The UI refuses anything over SHARE_LIMIT
 *  and points the user at export/saved-plan instead. */
export function shareAllowed(code) {
  return typeof code === "string" && code.length > 0 && code.length <= SHARE_LIMIT;
}
export const REVIEW_MINUTES = 20;
export const REVIEW_OFFSETS = [1, 3, 7, 14];

/* ---------------- tiny date-only math (kept local so tests stay import-free) ---------------- */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseISODate(str) {
  const m = ISO_RE.exec(String(str || "").trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  // Reject overflow dates such as 2026-02-30.
  if (isNaN(d) || d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) {
    return null;
  }
  return d;
}

function toISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(d, n) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() + n);
  return c;
}

/** Whole days from a to b (b - a). DST-safe: compares UTC calendar days. */
function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

function todayLocal() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function fmtHM(mins) {
  const h = ((Math.floor(mins / 60) % 24) + 24) % 24;
  const m = ((mins % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isNum(v) {
  return typeof v === "number" && isFinite(v);
}

/* ---------------- validation ---------------- */

function normSubjects(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  list.forEach((s, i) => {
    const name = String(s && s.name != null ? s.name : "").trim();
    if (!name) return; // blank rows are ignored; at least one named subject is required
    const id = s && s.id != null && String(s.id) !== "" ? String(s.id) : `sub-${i + 1}`;
    const priority = s && s.priority != null ? Number(s.priority) : 2;
    if (![1, 2, 3].includes(priority)) {
      throw new Error(
        `Priority for "${name}" must be 1, 2 or 3. Pick 3 for your most important subject.`
      );
    }
    out.push({ id, name, priority });
  });
  if (out.length === 0) {
    throw new Error("Add at least one subject with a name before generating a timetable.");
  }
  return out;
}

function normExams(raw, startISO) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((e, i) => {
      const name = String(e && e.name != null ? e.name : "").trim() || `Exam ${i + 1}`;
      const dateRaw = e && e.date != null ? String(e.date).trim() : "";
      const d = parseISODate(dateRaw);
      if (!d) {
        throw new Error(
          `The date for exam "${name}" isn't a valid calendar date. Pick it again from the date picker.`
        );
      }
      const dateISO = toISO(d);
      if (dateISO < startISO) {
        throw new Error(
          `Exam "${name}" is on ${dateISO}, which is before your start date ${startISO}. ` +
            `Move the start date earlier or fix the exam date.`
        );
      }
      return {
        id: e && e.id != null && String(e.id) !== "" ? String(e.id) : `exam-${i + 1}`,
        name,
        date: dateISO,
        subjectId: e && e.subjectId != null && String(e.subjectId) !== "" ? String(e.subjectId) : null,
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Generate a study timetable.
 *
 * @param {object} input
 *   {subjects:[{id,name,priority 1..3}], exams:[{id,subjectId|null,name,date}],
 *    startDate:'YYYY-MM-DD' (default today), dailyMinutes, sessionMin (25/50/90),
 *    breakMin, dayStartMin (default 960 = 4:00 PM), restDays:[0..6] (default [])}
 * @returns {{days, stats}} days: [{date, sessions:[{start,end,subject,type,examDate}]}],
 *   stats: {totalSessions, totalStudyMinutes, perSubject:{name:minutes}}
 * @throws {Error} plain-language message for every invalid input.
 */
export function generateTimetable(input) {
  const inp = input && typeof input === "object" ? input : {};

  const startDate = inp.startDate ? parseISODate(inp.startDate) : todayLocal();
  if (!startDate) {
    throw new Error(
      `Your start date "${inp.startDate}" isn't a valid calendar date. Pick it again from the date picker.`
    );
  }
  const startISO = toISO(startDate);

  const dailyMinutes = Number(inp.dailyMinutes);
  if (!isNum(dailyMinutes) || dailyMinutes <= 0) {
    throw new Error("Set your daily study time to more than 0 minutes so there is time to plan.");
  }
  const sessionMin = Number(inp.sessionMin);
  if (!isNum(sessionMin) || sessionMin <= 0) {
    throw new Error("Pick a session length above 0 minutes (25, 50 or 90 minutes work well).");
  }
  const breakMin = inp.breakMin == null || inp.breakMin === "" ? 0 : Number(inp.breakMin);
  if (!isNum(breakMin) || breakMin < 0) {
    throw new Error("Break time can't be negative. Use 0 for no breaks.");
  }
  const dayStartMin = inp.dayStartMin == null || inp.dayStartMin === "" ? 960 : Number(inp.dayStartMin);
  if (!isNum(dayStartMin) || dayStartMin < 0 || dayStartMin >= 1440) {
    throw new Error("Your day start time isn't valid. Pick a time between 12:00 AM and 11:59 PM.");
  }
  const restDays = Array.isArray(inp.restDays)
    ? inp.restDays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];

  const subjects = normSubjects(inp.subjects);
  const exams = normExams(inp.exams, startISO);

  // Horizon: start date through the latest exam date (or a 2-week study block if no exams).
  const lastDate = exams.length
    ? parseISODate(exams[exams.length - 1].date)
    : addDays(startDate, 13);
  const lastISO = toISO(lastDate);
  const dayCount = daysBetween(startDate, lastDate) + 1;

  // Per-subject exam schedule, earliest first.
  const subjectExams = new Map();
  for (const s of subjects) subjectExams.set(s.id, []);
  for (const e of exams) {
    if (e.subjectId && subjectExams.has(e.subjectId)) subjectExams.get(e.subjectId).push(e);
  }

  // Exam date in force for a subject on a given day: its earliest exam on/after
  // that day. A subject with no exams studies through the whole plan.
  function examDateFor(subject, dayISO) {
    const list = subjectExams.get(subject.id) || [];
    for (const e of list) {
      if (e.date >= dayISO) return e.date;
    }
    return list.length ? null : lastISO; // all exams passed -> done; no exams -> full plan
  }

  const days = [];
  const reviewQueue = []; // {dueISO, subjectId, subjectName, examDate}
  let totalSessions = 0;
  let totalStudyMinutes = 0;
  const perSubject = {};

  for (let i = 0; i < dayCount; i++) {
    const day = addDays(startDate, i);
    const dayISO = toISO(day);
    const isRest = restDays.includes(day.getDay());
    const sessions = [];
    let usedMin = 0; // sessions + breaks so far; must never exceed dailyMinutes

    const place = (length, subjectName, type, examDate) => {
      const cost = (sessions.length > 0 ? breakMin : 0) + length;
      if (usedMin + cost > dailyMinutes) return false;
      const startMin = dayStartMin + usedMin + (sessions.length > 0 ? breakMin : 0);
      sessions.push({
        start: fmtHM(startMin),
        end: fmtHM(startMin + length),
        startMin,
        endMin: startMin + length,
        lengthMin: length,
        subject: subjectName,
        type,
        examDate,
      });
      usedMin += cost;
      totalSessions++;
      totalStudyMinutes += length;
      perSubject[subjectName] = (perSubject[subjectName] || 0) + length;
      return true;
    };

    if (!isRest) {
      // 1) Spaced-repetition reviews due today (20 min each, before new study).
      const due = reviewQueue.filter((r) => r.dueISO === dayISO);
      for (const r of due) {
        if (r.dueISO <= r.examDate) place(REVIEW_MINUTES, r.subjectName, "review", r.examDate);
      }

      // 2) New study sessions: rotate subjects by urgency weight so none starve.
      const cands = [];
      for (const s of subjects) {
        const exISO = examDateFor(s, dayISO);
        if (!exISO) continue;
        const daysLeft = daysBetween(day, parseISODate(exISO)); // >= 0
        cands.push({ ...s, examDate: exISO, weight: s.priority / Math.max(daysLeft, 0.5) });
      }
      cands.sort((a, b) => b.weight - a.weight || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

      const studiedToday = [];
      if (cands.length) {
        let idx = 0;
        for (;;) {
          const c = cands[idx % cands.length];
          const cost = (sessions.length > 0 ? breakMin : 0) + sessionMin;
          if (usedMin + cost > dailyMinutes) break; // nothing else fits either
          place(sessionMin, c.name, "study", c.examDate);
          studiedToday.push({ subjectId: c.id, subjectName: c.name, examDate: c.examDate });
          idx++;
          if (idx > 100000) break; // sanity guard
        }
      }

      // 3) Queue reviews for today's study: +1/+3/+7/+14 days, on/before the exam.
      for (const st of studiedToday) {
        for (const k of REVIEW_OFFSETS) {
          const dueISO = toISO(addDays(day, k));
          if (dueISO > st.examDate) continue;
          reviewQueue.push({
            dueISO,
            subjectId: st.subjectId,
            subjectName: st.subjectName,
            examDate: st.examDate,
          });
        }
      }
    }

    // Retire anything due up to today (placed, skipped for space, or on a rest day).
    for (let q = reviewQueue.length - 1; q >= 0; q--) {
      if (reviewQueue[q].dueISO <= dayISO) reviewQueue.splice(q, 1);
    }

    days.push({
      date: dayISO,
      rest: isRest,
      sessions,
      totalMinutes: usedMin,
    });
  }

  return {
    days,
    stats: { totalSessions, totalStudyMinutes, perSubject },
  };
}

/* ---------------- ICS export ---------------- */

function icsText(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function utcStamp(d) {
  // "YYYYMMDDTHHMMSSZ" in UTC.
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function foldLine(line) {
  if (line.length <= 75) return line;
  const chunks = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return chunks.join("\r\n");
}

/**
 * Export a generated plan as an iCalendar (.ics) string.
 * Session times are converted from the plan's local day-start minutes to UTC.
 */
export function exportICS(plan, opts = {}) {
  const calendarName = String((opts && opts.calendarName) || "Study Timetable");
  // Brand comes via opts so the engine stays import-free and testable;
  // the page controller passes BRAND.name from config.js (rename-safe).
  const brandName = String((opts && opts.brandName) || "ExamElm");
  const brandSlug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "app";
  const stamp = utcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//" + icsText(brandName) + "//Timetable Generator//EN",
    "X-WR-CALNAME:" + icsText(calendarName),
  ];
  let n = 0;
  for (const day of (plan && plan.days) || []) {
    const m = ISO_RE.exec(day.date || "");
    if (!m) continue;
    const y = +m[1];
    const mo = +m[2] - 1;
    const d = +m[3];
    for (const s of day.sessions || []) {
      const sm = /^(\d{2}):(\d{2})$/.exec(s.start || "");
      const em = /^(\d{2}):(\d{2})$/.exec(s.end || "");
      if (!sm || !em) continue;
      n++;
      const dt0 = new Date(y, mo, d, +sm[1], +sm[2]);
      const dt1 = new Date(y, mo, d, +em[1], +em[2]);
      const kind = s.type === "review" ? "Review" : "Study";
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:tt-${day.date}-${sm[1]}${sm[2]}-${n}@${brandSlug}`);
      lines.push("DTSTAMP:" + stamp);
      lines.push("DTSTART:" + utcStamp(dt0));
      lines.push("DTEND:" + utcStamp(dt1));
      lines.push("SUMMARY:" + icsText(`${kind}: ${s.subject}`));
      const desc = s.examDate ? `Exam date: ${s.examDate}` : "";
      lines.push("DESCRIPTION:" + icsText(desc));
      lines.push("END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/* ---------------- share links (base64url JSON) ---------------- */

function b64urlEncode(str) {
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return Buffer.from(str, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
    return Buffer.from(String(str), "base64url").toString("utf8");
  }
  let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function cleanShareInput(input) {
  // Only plain, serializable fields travel in a share link.
  const subjects = (Array.isArray(input.subjects) ? input.subjects : []).map((s, i) => ({
    id: s && s.id != null ? String(s.id) : `sub-${i + 1}`,
    name: String(s && s.name != null ? s.name : ""),
    priority: s && s.priority != null ? Number(s.priority) : 2,
  }));
  const exams = (Array.isArray(input.exams) ? input.exams : []).map((e, i) => ({
    id: e && e.id != null ? String(e.id) : `exam-${i + 1}`,
    subjectId: e && e.subjectId != null ? String(e.subjectId) : null,
    name: String(e && e.name != null ? e.name : ""),
    date: String(e && e.date != null ? e.date : ""),
  }));
  return {
    subjects,
    exams,
    startDate: String(input.startDate || ""),
    dailyMinutes: Number(input.dailyMinutes),
    sessionMin: Number(input.sessionMin),
    breakMin: input.breakMin == null || input.breakMin === "" ? 0 : Number(input.breakMin),
    dayStartMin: input.dayStartMin == null || input.dayStartMin === "" ? 960 : Number(input.dayStartMin),
    restDays: Array.isArray(input.restDays) ? input.restDays.map(Number).filter((n) => n >= 0 && n <= 6) : [],
  };
}

/** Encode a timetable input as a shareable base64url string. */
export function encodeShare(input) {
  const payload = { v: 1, ...cleanShareInput(input || {}) };
  return b64urlEncode(JSON.stringify(payload));
}

const SHARE_BROKEN = "This study-plan link is broken or incomplete, so it couldn't be loaded. Ask the sender to copy the link again.";

/** Decode a share string back into a timetable input. Throws plain-language on garbage. */
export function decodeShare(str) {
  let obj;
  try {
    obj = JSON.parse(b64urlDecode(str));
  } catch {
    throw new Error(SHARE_BROKEN);
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || obj.v !== 1) {
    throw new Error(SHARE_BROKEN);
  }
  try {
    const cleaned = { v: 1, ...cleanShareInput(obj) };
    // Reuse the real validation so a decoded link always regenerates.
    generateTimetable(cleaned);
    return cleaned;
  } catch (e) {
    throw new Error(SHARE_BROKEN + " (" + e.message + ")");
  }
}
