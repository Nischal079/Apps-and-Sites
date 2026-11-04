/**
 * Exam countdown tests (pure module — no DOM, no browser).
 * Includes the timezone-correctness matrix: the top risk for this tool.
 * Run: node tests/run.js
 */
import {
  validateExamName, validateExamDate, validateDailyHours, newExam,
  daysUntil, examBucket, bucketLabel, sortExams,
  linkSubject, prepEstimate, dayReminders,
  COUNTDOWN_KV_KEY, REMINDER_WINDOW_DAYS,
} from "../assets/js/countdown.js";
import { newSubject, newTopic } from "../assets/js/tracker.js";
import { openStorage } from "../assets/js/storage.js";
import { todayLocal, toISODate, daysBetween, parseDateInput } from "../assets/js/ui.js";

const T = "2026-11-04"; // fixed "today" for deterministic tests

/* ---------------- validation ---------------- */

test("countdown: input validation errors are plain-language", () => {
  assertThrows(() => validateExamName("  "), "Give the exam a name");
  assertThrows(() => validateExamName("x".repeat(81)), "80 characters");
  assertThrows(() => validateExamDate(""), "Enter the exam date");
  assertThrows(() => validateExamDate("not-a-date"), "valid exam date");
  assertThrows(() => validateExamDate("2026-02-30"), "valid exam date", "Feb 30 rejected");
  assertThrows(() => validateExamDate("2026-13-01"), "valid exam date", "month 13 rejected");
  assertThrows(() => validateExamDate("1999-12-01"), "between 2000 and 2100");
  assertThrows(() => validateExamDate("2200-01-01"), "between 2000 and 2100");
  assertThrows(() => validateDailyHours("abc"), "enter a number");
  assertThrows(() => validateDailyHours("-2"), "between 0 and 24");
  assertThrows(() => validateDailyHours("25"), "between 0 and 24");
  assertEq(validateDailyHours(""), null, "empty hours -> null (optional)");
  assertEq(validateDailyHours("3.5"), 3.5, "decimal hours kept");
  const e = newExam(" Physics final ", "2026-12-04", "3");
  assertEq(e.name, "Physics final", "name trimmed");
  assertEq(e.date, "2026-12-04", "date kept");
  assertEq(e.dailyHours, 3, "hours parsed");
});

/* ---------------- date math ---------------- */

test("countdown: daysUntil on fixed dates", () => {
  assertEq(daysUntil("2026-12-25", T), 51, "Nov 4 -> Dec 25");
  assertEq(daysUntil(T, T), 0, "same day");
  assertEq(daysUntil("2026-11-05", T), 1, "tomorrow");
  assertEq(daysUntil("2026-11-03", T), -1, "yesterday");
  assertEq(daysUntil("2027-11-04", T), 365, "one year (2027 not a leap year)");
  assertThrows(() => daysUntil("garbage", T), "valid YYYY-MM-DD");
});

test("countdown: buckets and labels", () => {
  assertEq(examBucket(-5), "past", "past");
  assertEq(examBucket(0), "today", "today");
  assertEq(examBucket(1), "tomorrow", "tomorrow");
  assertEq(examBucket(7), "week", "7 = week edge");
  assertEq(examBucket(8), "later", "8 = later");
  assertEq(bucketLabel(0), "Today", "label today");
  assertEq(bucketLabel(1), "Tomorrow", "label tomorrow");
  assertEq(bucketLabel(3), "In 3 days", "label upcoming");
  assertEq(bucketLabel(-1), "Yesterday", "label yesterday");
  assertEq(bucketLabel(-4), "4 days ago", "label past");
});

test("countdown: sortExams by date, then name", () => {
  const a = newExam("Zebra", "2026-12-01", "");
  const b = newExam("Alpha", "2026-12-01", "");
  const c = newExam("Mid", "2026-11-10", "");
  const sorted = sortExams([a, b, c]).map((e) => e.name);
  assertEq(sorted, ["Mid", "Alpha", "Zebra"], "date asc, name tiebreak");
});

/* ---------------- tracker linking + prep estimate ---------------- */

function trackedPhysics() {
  const s = newSubject("Physics", "2026-12-04", "2026-10-01");
  const specs = [["Thermo", "done"], ["Optics", "done"], ["Waves", "wip"], ["EM", "none"], ["QM", "none"]];
  for (const [n, c] of specs) {
    const t = newTopic(n);
    t.confidence = c;
    s.topics.push(t);
  }
  return s;
}

test("countdown: linkSubject prefers examId, falls back to name", () => {
  const s = trackedPhysics();
  s.examId = "exam_9";
  const byId = linkSubject({ id: "exam_9", name: "Something else" }, [s]);
  assertEq(byId.name, "Physics", "examId match wins");
  const byName = linkSubject({ id: "exam_1", name: "physics" }, [{ ...s, examId: null }]);
  assertEq(byName.name, "Physics", "case-insensitive name fallback");
  assertEq(linkSubject({ id: "x", name: "Biology" }, [s]), null, "no match -> null");
});

test("countdown: prepEstimate verdicts", () => {
  const s = trackedPhysics(); // 5 topics, 2 done -> 3 remaining; exam 2026-12-04
  // past
  let r = prepEstimate({ id: "e", name: "Physics", date: "2026-10-01", dailyHours: null }, [s], T);
  assertEq(r.verdict, "past", "past exam");
  // no tracker data at all
  r = prepEstimate({ id: "e", name: "Biology", date: "2026-12-04", dailyHours: null }, [s], T);
  assertEq(r.verdict, "no-data", "no-data");
  assert(r.message.includes("syllabus"), "points at the tracker");
  // linked, plan math: 3 remaining / 30 days = 0.1
  r = prepEstimate({ id: "e", name: "Physics", date: "2026-12-04", dailyHours: 2 }, [s], T);
  assertEq(r.verdict, "plan", "plan");
  assertEq(r.linked, true, "linked");
  assertEq(r.remaining, 3, "3 topics remaining");
  assertEq(r.requiredPerDay, 0.1, "3 / 30 days");
  assert(r.message.includes("2 h/day"), "hours echoed: " + r.message);
  // all done
  const doneSub = newSubject("Physics", "2026-12-04", "2026-10-01");
  const t = newTopic("x"); t.confidence = "done"; doneSub.topics.push(t);
  r = prepEstimate({ id: "e", name: "Physics", date: "2026-12-04", dailyHours: null }, [doneSub], T);
  assertEq(r.verdict, "done", "done");
  // exam today
  r = prepEstimate({ id: "e", name: "Physics", date: T, dailyHours: null }, [s], T);
  assertEq(r.verdict, "today", "today");
  // subject with zero topics
  const empty = newSubject("Physics", "2026-12-04", "2026-10-01");
  r = prepEstimate({ id: "e", name: "Physics", date: "2026-12-04", dailyHours: null }, [empty], T);
  assertEq(r.verdict, "no-data", "empty syllabus -> no-data");
});

test("countdown: exam moved / deleted is just recomputation", () => {
  const e = newExam("Physics", "2026-12-04", "");
  assertEq(daysUntil(e.date, T), 30, "original");
  e.date = validateExamDate("2026-12-10"); // moved later
  assertEq(daysUntil(e.date, T), 36, "moved -> recomputed");
  e.date = validateExamDate("2026-10-20"); // moved to past
  assertEq(examBucket(daysUntil(e.date, T)), "past", "past bucket after move");
});

/* ---------------- check-on-load reminders ---------------- */

test("countdown: dayReminders window 0-7, sorted, plain language", () => {
  const exams = [
    newExam("Far", "2026-12-25", ""),      // 51 days -> excluded
    newExam("Past", "2026-10-20", ""),     // past -> excluded
    newExam("Week", "2026-11-09", ""),     // 5 days
    newExam("Now", "2026-11-04", ""),      // today
    newExam("Next", "2026-11-05", ""),     // tomorrow
    newExam("Edge", "2026-11-11", ""),     // 7 days -> included
    newExam("Out", "2026-11-12", ""),      // 8 days -> excluded
  ];
  const rs = dayReminders(exams, T);
  assertEq(rs.map((r) => r.exam.name), ["Now", "Next", "Week", "Edge"], "window + sort");
  assert(rs[0].message.includes("is today"), "today message");
  assert(rs[1].message.includes("is tomorrow"), "tomorrow message");
  assert(rs[2].message.includes("in 5 days"), "count message");
  assertEq(dayReminders([], T), [], "empty exams -> empty reminders");
});

/* ---------------- timezone correctness (top risk) ---------------- */

const RealDate = Date;
const FIXED_UTC_MS = Date.UTC(2026, 10, 4, 18, 30, 0); // 2026-11-04T18:30Z
class FixedDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [FIXED_UTC_MS])); }
  static now() { return FIXED_UTC_MS; }
}
function withFixedNow(fn) {
  globalThis.Date = FixedDate;
  try { fn(); } finally { globalThis.Date = RealDate; }
}
function intlLocalToday(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(FIXED_UTC_MS));
}
const ZONES = [
  "Pacific/Midway",      // UTC-11
  "America/Los_Angeles", // UTC-8
  "America/New_York",    // UTC-5
  "UTC",
  "Europe/London",       // UTC+0
  "Asia/Kathmandu",      // UTC+5:45  <- the fractional-offset case
  "Australia/Sydney",    // UTC+11
  "Pacific/Kiritimati",  // UTC+14
];

test("countdown: todayLocal() matches the real calendar date in every zone", () => {
  withFixedNow(() => {
    const saved = process.env.TZ;
    try {
      for (const tz of ZONES) {
        process.env.TZ = tz;
        assertEq(toISODate(todayLocal()), intlLocalToday(tz), "todayLocal in " + tz);
      }
    } finally {
      if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
    }
  });
});

test("countdown: same exam date -> days-left matches each student's own calendar (no TZ corruption)", () => {
  withFixedNow(() => {
    const saved = process.env.TZ;
    try {
      for (const tz of ZONES) {
        process.env.TZ = tz;
        const localToday = intlLocalToday(tz);
        // the countdown for a fixed exam date must equal plain calendar subtraction
        const got = daysUntil("2026-12-25", localToday);
        const want = daysBetween(parseDateInput(localToday), parseDateInput("2026-12-25"));
        assertEq(got, want, `daysUntil consistent in ${tz} (local today ${localToday})`);
      }
      // Kathmandu (+5:45) sees Nov 5 while New York sees Nov 4 at the same instant —
      // each must see the count for THEIR calendar day, never a shifted one.
      process.env.TZ = "Asia/Kathmandu";
      assertEq(intlLocalToday("Asia/Kathmandu"), "2026-11-05", "KTM date at fixed instant");
      process.env.TZ = "America/New_York";
      assertEq(intlLocalToday("America/New_York"), "2026-11-04", "NY date at fixed instant");
      assertEq(daysUntil("2026-12-25", "2026-11-05"), 50, "KTM count");
      assertEq(daysUntil("2026-12-25", "2026-11-04"), 51, "NY count");
    } finally {
      if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
    }
  });
});

test("countdown: DST transitions cannot shift day counts", () => {
  const saved = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    // US spring forward: 2026-03-08 (23-hour day)
    assertEq(daysBetween(parseDateInput("2026-03-07"), parseDateInput("2026-03-09")), 2, "spring-forward week");
    assertEq(daysUntil("2026-03-09", "2026-03-07"), 2, "daysUntil across spring forward");
    // US fall back: 2026-11-01 (25-hour day)
    assertEq(daysBetween(parseDateInput("2026-10-31"), parseDateInput("2026-11-02")), 2, "fall-back week");
    assertEq(daysUntil("2026-11-02", "2026-10-31"), 2, "daysUntil across fall back");
    // EU DST end: 2026-10-25
    process.env.TZ = "Europe/London";
    assertEq(daysUntil("2026-10-26", "2026-10-24"), 2, "EU fall-back week");
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

test("countdown: date-line zones agree on calendar math", () => {
  const saved = process.env.TZ;
  try {
    withFixedNow(() => {
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14, first to see the new day
      const kiri = intlLocalToday("Pacific/Kiritimati");
      process.env.TZ = "Pacific/Midway"; // UTC-11, last to see the new day
      const midway = intlLocalToday("Pacific/Midway");
      assert(kiri !== midway, `date line split visible (${kiri} vs ${midway})`);
      for (const [tz, local] of [["Pacific/Kiritimati", kiri], ["Pacific/Midway", midway]]) {
        const got = daysUntil("2026-12-25", local);
        const want = daysBetween(parseDateInput(local), parseDateInput("2026-12-25"));
        assertEq(got, want, "calendar-consistent in " + tz);
      }
    });
  } finally {
    if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved;
  }
});

/* ---------------- storage round-trip ---------------- */

test("countdown: kv persistence round-trip via memory backend", async () => {
  const st = await openStorage({ backend: "memory" });
  const e = newExam("Chemistry", "2026-12-10", "2.5");
  await st.put("kv", { key: COUNTDOWN_KV_KEY, value: { version: 1, exams: [e] } });
  const back = await st.get("kv", COUNTDOWN_KV_KEY);
  assertEq(back.value.exams[0].name, "Chemistry", "name survives");
  assertEq(back.value.exams[0].dailyHours, 2.5, "hours survive");
});
