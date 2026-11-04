/**
 * Timetable generator tests (pure module — no DOM, no browser).
 * Run: node tests/run.js
 */
import {
  generateTimetable,
  exportICS,
  encodeShare,
  decodeShare,
  SHARE_LIMIT,
  shareAllowed,
} from "../assets/js/timetable.js";

function baseInput(over = {}) {
  return {
    subjects: [
      { id: "s1", name: "Math", priority: 2 },
      { id: "s2", name: "Physics", priority: 2 },
    ],
    exams: [{ id: "e1", subjectId: "s1", name: "Math final", date: "2026-11-10" }],
    startDate: "2026-11-04",
    dailyMinutes: 120,
    sessionMin: 50,
    breakMin: 10,
    dayStartMin: 960,
    restDays: [],
    ...over,
  };
}

function dayTotal(day, breakMin) {
  const n = day.sessions.length;
  if (!n) return 0;
  return day.sessions.reduce((t, s) => t + s.lengthMin, 0) + (n - 1) * breakMin;
}

// (a) basic 2-subject / 7-day / 120-min day → every day total ≤ 120
test("basic plan: 7 days, each day total within the daily budget", () => {
  const plan = generateTimetable(baseInput());
  assertEq(plan.days.length, 7, "Nov 4 → Nov 10 inclusive");
  assertEq(plan.days[0].date, "2026-11-04");
  assertEq(plan.days[6].date, "2026-11-10");
  for (const d of plan.days) {
    assert(dayTotal(d, 10) <= 120, `day ${d.date} total ${dayTotal(d, 10)} ≤ 120`);
    for (const s of d.sessions) {
      assert(/^\d{2}:\d{2}$/.test(s.start) && /^\d{2}:\d{2}$/.test(s.end), "HH:MM times");
      assert(["study", "review"].includes(s.type), "known session type");
    }
  }
  assert(plan.stats.totalSessions > 0, "sessions were scheduled");
  assertEq(typeof plan.stats.perSubject["Math"], "number");
});

// (b) overlapping exams both get sessions
test("overlapping exams: both subjects receive study sessions", () => {
  const plan = generateTimetable(
    baseInput({
      exams: [
        { id: "e1", subjectId: "s1", name: "Math final", date: "2026-11-08" },
        { id: "e2", subjectId: "s2", name: "Physics final", date: "2026-11-08" },
      ],
    })
  );
  const study = {};
  for (const d of plan.days)
    for (const s of d.sessions)
      if (s.type === "study") study[s.subject] = (study[s.subject] || 0) + 1;
  assert((study["Math"] || 0) > 0, "Math got study sessions");
  assert((study["Physics"] || 0) > 0, "Physics got study sessions");
});

// (c) past exam date throws and names the exam
test("exam before the start date throws, naming the exam", () => {
  assertThrows(
    () =>
      generateTimetable(
        baseInput({
          exams: [{ id: "e1", subjectId: "s1", name: "Ancient History Test", date: "2026-11-01" }],
        })
      ),
    "Ancient History Test",
    "error must name the offending exam"
  );
});

// (d) zero daily minutes throws
test("dailyMinutes of 0 throws", () => {
  assertThrows(() => generateTimetable(baseInput({ dailyMinutes: 0 })), "daily study time");
});

// (e) no subjects throws
test("no subjects throws", () => {
  assertThrows(() => generateTimetable(baseInput({ subjects: [] })), "at least one subject");
  assertThrows(
    () => generateTimetable(baseInput({ subjects: [{ id: "x", name: "   ", priority: 2 }] })),
    "at least one subject"
  );
});

// (f) review blocks land exactly +1/+3/+7/+14 with type 'review'
test("spaced reviews land on +1/+3/+7/+14 with type 'review'", () => {
  const plan = generateTimetable(
    baseInput({
      subjects: [{ id: "s1", name: "Math", priority: 2 }],
      exams: [{ id: "e1", subjectId: "s1", name: "Math final", date: "2026-11-18" }],
      dailyMinutes: 25,
      sessionMin: 25,
      breakMin: 0,
    })
  );
  const byDate = {};
  for (const d of plan.days) byDate[d.date] = d.sessions;
  const expected = { 1: "2026-11-05", 3: "2026-11-07", 7: "2026-11-11", 14: "2026-11-18" };
  for (const off of [1, 3, 7, 14]) {
    const date = expected[off];
    const reviews = (byDate[date] || []).filter((s) => s.type === "review" && s.subject === "Math");
    assert(reviews.length > 0, `review scheduled on ${date} (+${off})`);
    for (const r of reviews) {
      assertEq(r.lengthMin, 20, "review is 20 minutes");
      assertEq(r.examDate, "2026-11-18");
    }
  }
});

// (g) DST week: integer day counts, no crash (US spring forward 2026-03-08)
test("DST week keeps integer day counts and does not crash", () => {
  const plan = generateTimetable(
    baseInput({
      startDate: "2026-03-02",
      exams: [{ id: "e1", subjectId: "s1", name: "Math final", date: "2026-03-09" }],
    })
  );
  assertEq(plan.days.length, 8, "Mar 2 → Mar 9 inclusive, no DST off-by-one");
  assertEq(plan.days[0].date, "2026-03-02");
  assertEq(plan.days[7].date, "2026-03-09");
  for (const d of plan.days) assert(/^\d{4}-\d{2}-\d{2}$/.test(d.date), "valid date " + d.date);
});

// (h) encode/decode round-trip equality
test("share encode/decode round-trips the input", () => {
  const input = baseInput({ restDays: [0, 6] });
  const code = encodeShare(input);
  assert(typeof code === "string" && code.length > 0, "non-empty code");
  assert(!/[+/=]/.test(code), "base64url alphabet");
  const back = decodeShare(code);
  assertEq(back.subjects, input.subjects);
  assertEq(back.exams, input.exams);
  assertEq(back.startDate, input.startDate);
  assertEq(back.dailyMinutes, input.dailyMinutes);
  assertEq(back.sessionMin, input.sessionMin);
  assertEq(back.breakMin, input.breakMin);
  assertEq(back.dayStartMin, input.dayStartMin);
  assertEq(back.restDays, input.restDays);
  assertEq(back.v, 1);
});

test("decodeShare throws plain language on garbage", () => {
  assertThrows(() => decodeShare("!!!not-a-link!!!"), "couldn't be loaded");
  assertThrows(() => decodeShare(""), "couldn't be loaded");
});

test("SHARE_LIMIT is exported and is 1500", () => {
  assertEq(SHARE_LIMIT, 1500);
});

test("shareAllowed: boundary at SHARE_LIMIT", () => {
  assertEq(shareAllowed("x".repeat(SHARE_LIMIT)), true);
  assertEq(shareAllowed("x".repeat(SHARE_LIMIT + 1)), false);
  assertEq(shareAllowed(""), false);
  assertEq(shareAllowed(null), false);
  assertEq(shareAllowed(undefined), false);
  assertEq(shareAllowed("abc"), true);
});

test("shareAllowed: a realistically large plan exceeds the guard", () => {
  // 12 subjects with long names + 12 exams blows past 1500 base64url chars,
  // which is exactly when the UI refuses the link and offers export instead.
  const big = baseInput({
    subjects: Array.from({ length: 12 }, (_, i) => ({
      id: "s" + i,
      name: "Very long subject name number " + i + " with extra words",
      priority: 3,
    })),
    exams: Array.from({ length: 12 }, (_, i) => ({
      id: "e" + i,
      subjectId: "s" + i,
      name: "Comprehensive final examination for subject " + i,
      date: "2026-12-1" + (i % 9),
    })),
  });
  const code = encodeShare(big);
  assert(code.length > SHARE_LIMIT, `expected over limit, got ${code.length}`);
  assertEq(shareAllowed(code), false);
});

test("shareAllowed: a small plan fits the guard", () => {
  const code = encodeShare(baseInput());
  assert(code.length <= SHARE_LIMIT, `expected within limit, got ${code.length}`);
  assertEq(shareAllowed(code), true);
});

// (i) ICS contains VCALENDAR, Z-suffixed DTSTART, VEVENT count == session count
test("ICS export is a valid VCALENDAR with one VEVENT per session", () => {
  const plan = generateTimetable(baseInput());
  const ics = exportICS(plan, { calendarName: "My Plan" });
  assert(ics.includes("BEGIN:VCALENDAR"), "has VCALENDAR");
  assert(ics.includes("END:VCALENDAR"), "closes VCALENDAR");
  assert(ics.includes("DTSTART:") && ics.includes("Z"), "UTC Z-suffixed start");
  const vevents = (ics.match(/BEGIN:VEVENT/g) || []).length;
  assertEq(vevents, plan.stats.totalSessions, "one VEVENT per session");
  const uids = (ics.match(/^UID:.+/gm) || []).map((l) => l.trim());
  assertEq(new Set(uids).size, uids.length, "UIDs are unique");
});

// (i2) ICS brand centralization: PRODID/UID follow opts.brandName (rename-safe)
test("ICS export uses opts.brandName for PRODID and UID domain", () => {
  const plan = generateTimetable(baseInput());
  const branded = exportICS(plan, { brandName: "ExamElm" });
  assert(branded.includes("PRODID:-//ExamElm//"), "PRODID carries brand");
  assert(branded.includes("@examelm"), "UID domain carries brand slug");
  assert(!branded.includes("StudyPilot") && !branded.includes("@studypilot"), "no old brand leaks");
  const def = exportICS(plan, {});
  assert(def.includes("PRODID:-//ExamElm//"), "default brand is ExamElm");
});

// (j) priority-3 subject gets ≥ study minutes than priority-1
test("higher priority wins more study minutes", () => {
  const plan = generateTimetable(
    baseInput({
      subjects: [
        { id: "s1", name: "LowPri", priority: 1 },
        { id: "s2", name: "HighPri", priority: 3 },
      ],
      exams: [
        { id: "e1", subjectId: "s1", name: "Low exam", date: "2026-11-10" },
        { id: "e2", subjectId: "s2", name: "High exam", date: "2026-11-10" },
      ],
      dailyMinutes: 75,
      sessionMin: 25,
      breakMin: 0,
    })
  );
  const mins = { LowPri: 0, HighPri: 0 };
  for (const d of plan.days)
    for (const s of d.sessions) if (s.type === "study") mins[s.subject] += s.lengthMin;
  assert(mins.HighPri >= mins.LowPri, `HighPri ${mins.HighPri} ≥ LowPri ${mins.LowPri}`);
  assert(mins.HighPri > mins.LowPri, "strictly more in this configuration");
});

// (k) dayStartMin respected in the first session start time
test("first session of the day starts at dayStartMin", () => {
  const plan = generateTimetable(baseInput({ dayStartMin: 1020 })); // 17:00
  assertEq(plan.days[0].sessions[0].start, "17:00");
});

// rest days produce empty days, never exceeding the budget
test("rest days are skipped", () => {
  const plan = generateTimetable(baseInput({ restDays: [3] })); // 2026-11-04 is a Wednesday
  const wed = plan.days.find((d) => d.date === "2026-11-04");
  assertEq(wed.sessions.length, 0, "rest day has no sessions");
  assertEq(wed.rest, true);
});

// never-new-Date-UTC guard: a date-only string input must not shift the day
test("date-only inputs are parsed in local time, no UTC shift", () => {
  const plan = generateTimetable(baseInput({ startDate: "2026-01-01" }));
  assertEq(plan.days[0].date, "2026-01-01");
});
