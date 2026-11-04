/**
 * Syllabus tracker tests (pure module — no DOM, no browser).
 * Run: node tests/run.js
 */
import {
  CONF, CONF_WEIGHT,
  parseStrictDate, isoOf,
  validateSubjectName, validateExamDate, validateTopicName, validateConfidence,
  newSubject, newTopic,
  subjectCoverage, overallCoverage,
  paceFor,
  weakestTopics, weakestReason,
  setConfidence, moveTopic, removeTopic, linkExam,
  TRACKER_KV_KEY,
} from "../assets/js/tracker.js";
import { openStorage } from "../assets/js/storage.js";
import { todayLocal, toISODate, daysBetween, parseDateInput } from "../assets/js/ui.js";

const T = "2026-11-04"; // fixed "today" for deterministic tests

function mkSubject(name, examDate, createdAt, topicSpecs) {
  const s = newSubject(name, examDate, createdAt);
  for (const [tname, conf] of topicSpecs || []) {
    const t = newTopic(tname);
    t.confidence = conf;
    s.topics.push(t);
  }
  return s;
}

/* ---------------- strict date parsing ---------------- */

test("tracker: parseStrictDate rejects rollover dates", () => {
  assertEq(parseStrictDate("2026-13-40"), null, "month 13");
  assertEq(parseStrictDate("2026-02-30"), null, "Feb 30 rolls over");
  assertEq(parseStrictDate("2026-04-31"), null, "Apr 31 rolls over");
  assertEq(parseStrictDate("not-a-date"), null, "garbage");
  assertEq(parseStrictDate(""), null, "empty");
  const d = parseStrictDate("2026-12-04");
  assert(d !== null && isoOf(d) === "2026-12-04", "valid date round-trips");
});

test("tracker: parseDateInput (ui.js) vs strict — ui allows rollover, we don't", () => {
  // documents WHY the tracker uses its own strict parser
  const loose = parseDateInput("2026-13-40");
  assert(loose !== null, "ui.js parseDateInput rolls 2026-13-40 over (known leniency)");
  assertEq(parseStrictDate("2026-13-40"), null, "tracker strict parser rejects it");
});

/* ---------------- validation ---------------- */

test("tracker: subject/exam/topic validation errors are plain-language", () => {
  assertThrows(() => validateSubjectName("   "), "Give the subject a name");
  assertThrows(() => validateSubjectName("x".repeat(81)), "80 characters");
  assertThrows(() => validateExamDate("2026-13-01"), "valid exam date");
  assertThrows(() => validateExamDate("1999-05-01"), "between 2000 and 2100");
  assertThrows(() => validateExamDate("2200-01-01"), "between 2000 and 2100");
  assertEq(validateExamDate(""), null, "empty exam date is allowed (optional)");
  assertThrows(() => validateTopicName(""), "Give the topic a name");
  assertThrows(() => validateConfidence("sort-of"), "corrupted data");
});

test("tracker: newSubject stamps createdAt from the given today", () => {
  const s = newSubject("Physics", "2026-12-04", T);
  assertEq(s.createdAt, T, "createdAt");
  assertEq(s.examDate, "2026-12-04", "examDate kept");
  assertEq(s.examId, null, "examId starts null");
});

/* ---------------- coverage ---------------- */

test("tracker: weighted coverage % (done=1, wip=0.5, none=0)", () => {
  const s = mkSubject("Maths", null, T, [
    ["A", "done"], ["B", "done"], ["C", "wip"], ["D", "none"],
  ]);
  const c = subjectCoverage(s);
  assertEq(c.total, 4, "total");
  assertEq(c.done, 2, "done");
  assertEq(c.wip, 1, "wip");
  assertEq(c.percent, 62.5, "(2 + 0.5) / 4");
});

test("tracker: coverage edge cases", () => {
  assertEq(subjectCoverage(mkSubject("Empty", null, T, [])).percent, null, "no topics -> null, not NaN");
  assertEq(subjectCoverage(mkSubject("All", null, T, [["a", "done"], ["b", "done"]])).percent, 100, "all done");
  assertEq(subjectCoverage(mkSubject("None", null, T, [["a", "none"]])).percent, 0, "none started");
  const all = overallCoverage([
    mkSubject("A", null, T, [["x", "done"]]),
    mkSubject("B", null, T, [["y", "wip"], ["z", "none"]]),
  ]);
  assertEq(all.percent, 50, "overall across subjects: (1+0.5)/3");
});

/* ---------------- pace ---------------- */

test("tracker: pace verdicts across statuses (fixed dates)", () => {
  // no exam date
  let p = paceFor(mkSubject("S", null, T, [["a", "none"]]), T);
  assertEq(p.status, "no-date", "no-date");

  // past exam
  p = paceFor(mkSubject("S", "2026-10-01", T, [["a", "none"]]), T);
  assertEq(p.status, "past", "past");
  assert(p.daysLeft < 0, "negative daysLeft");

  // done: all confident, future exam
  p = paceFor(mkSubject("S", "2026-12-04", T, [["a", "done"], ["b", "done"]]), T);
  assertEq(p.status, "done", "done");
  assertEq(p.remaining, 0, "nothing remaining");

  // exam today
  p = paceFor(mkSubject("S", T, "2026-10-01", [["a", "none"], ["b", "wip"]]), T);
  assertEq(p.status, "today", "today");
  assertEq(p.daysLeft, 0, "0 days left");

  // too early: created today
  p = paceFor(mkSubject("S", "2026-12-04", T, [["a", "none"]]), T);
  assertEq(p.status, "too-early", "too-early");
});

test("tracker: pace behind vs on-track math", () => {
  // 10 topics, started 10 days ago, only 1 done; exam in 10 days
  const behind = mkSubject("S", "2026-11-14", "2026-10-25",
    [["t1", "done"], ...Array.from({ length: 9 }, (_, i) => ["t" + (i + 2), "none"])]);
  let p = paceFor(behind, T);
  assertEq(p.status, "behind", "behind");
  assertEq(p.requiredPerDay, 0.9, "9 remaining / 10 days");
  assertEq(p.actualPerDay, 0.1, "1 done / 10 elapsed days");
  assert(p.message.includes("Behind pace"), "plain-language message");

  // 8 of 10 done in the same window -> on track
  const ahead = mkSubject("S", "2026-11-14", "2026-10-25",
    [...Array.from({ length: 8 }, (_, i) => ["t" + (i + 1), "done"]),
     ["t9", "none"], ["t10", "none"]]);
  p = paceFor(ahead, T);
  assertEq(p.status, "on-track", "on-track");
  assertEq(p.requiredPerDay, 0.2, "2 remaining / 10 days");
  assertEq(p.actualPerDay, 0.8, "8 done / 10 elapsed days");
  assert(p.message.includes("On track"), "plain-language message");
});

test("tracker: wip topics count as remaining but add half weight to actual pace", () => {
  const s = mkSubject("S", "2026-11-14", "2026-10-25",
    [["a", "done"], ["b", "wip"], ["c", "none"], ["d", "none"]]);
  const p = paceFor(s, T);
  assertEq(p.remaining, 3, "wip + none are remaining");
  assertEq(p.actualPerDay, 0.2, "(1 + 0.5) weighted / 10 elapsed, rounded to 1dp — proves wip counts (would be 0.1 without)");
});

/* ---------------- weakest topics ---------------- */

test("tracker: weakest-topics ranking = proximity x low confidence", () => {
  const near = mkSubject("Physics", "2026-11-06", "2026-10-01", [["Thermo", "none"], ["Optics", "wip"], ["Done1", "done"]]);
  const far = mkSubject("History", "2026-12-30", "2026-10-01", [["WW1", "none"]]);
  const nodate = mkSubject("Art", null, "2026-10-01", [["Color", "none"]]);
  const past = mkSubject("Old", "2026-10-01", "2026-09-01", [["X", "none"]]);
  const ranked = weakestTopics([far, nodate, near, past], T, 10);
  const names = ranked.map((r) => r.topicName);
  assertEq(names[0], "Thermo", "nearest exam + not started ranks first");
  assertEq(names[1], "Optics", "same exam but in-progress ranks below not-started");
  assert(names.includes("WW1"), "far exam still listed");
  assert(names.indexOf("WW1") < names.indexOf("Color"), "dated subject outranks undated");
  assert(!names.includes("Done1"), "confident topics never listed");
  assert(!names.includes("X"), "past-exam subjects excluded");
  assertEq(ranked.length, 4, "limit respected, exclusions applied");
  const r0 = ranked[0];
  assertEq(r0.daysLeft, 2, "daysLeft attached");
  assert(weakestReason(r0).includes("exam in 2 days"), "reason line: " + weakestReason(r0));
  assert(weakestReason(ranked.find((r) => r.topicName === "Color")).includes("no exam date"), "undated reason");
});

/* ---------------- mutations ---------------- */

test("tracker: confidence set / move / remove", () => {
  const s = mkSubject("S", null, T, [["a", "none"], ["b", "none"], ["c", "none"]]);
  const [a, b, c] = s.topics;
  setConfidence(s, b.id, "wip");
  assertEq(b.confidence, "wip", "set");
  assertThrows(() => setConfidence(s, "nope", "done"), "not found");
  assertEq(moveTopic(s, a.id, -1), false, "can't move first up");
  assertEq(moveTopic(s, c.id, 1), false, "can't move last down");
  assertEq(moveTopic(s, b.id, -1), true, "move up works");
  assertEq(s.topics[0].id, b.id, "order swapped");
  removeTopic(s, c.id);
  assertEq(s.topics.length, 2, "removed");
  assertThrows(() => removeTopic(s, c.id), "deleted already");
});

test("tracker: linkExam stores exam ref and syncs date", () => {
  const s = mkSubject("Physics", null, T, []);
  linkExam(s, "exam_1", "2026-12-04");
  assertEq(s.examId, "exam_1", "examId stored");
  assertEq(s.examDate, "2026-12-04", "date synced");
  linkExam(s, null, null);
  assertEq(s.examId, null, "unlink clears ref");
});

/* ---------------- storage round-trip (memory backend) ---------------- */

test("tracker: kv persistence round-trip via memory backend", async () => {
  const st = await openStorage({ backend: "memory" });
  assertEq(st.degraded, true, "memory backend flags degraded");
  const s = mkSubject("Physics", "2026-12-04", T, [["Thermo", "wip"]]);
  await st.put("kv", { key: TRACKER_KV_KEY, value: { version: 1, subjects: [s] } });
  const back = await st.get("kv", TRACKER_KV_KEY);
  assertEq(back.value.subjects[0].name, "Physics", "name survives");
  assertEq(back.value.subjects[0].topics[0].confidence, "wip", "confidence survives");
  assertEq(back.value.version, 1, "version stamp survives");
});
