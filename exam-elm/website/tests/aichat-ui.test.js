/**
 * ExamElm · AI Chat shell tests (redesign: sidebar search, date grouping,
 * suggestion chips). Pure logic only — imports chatui.js, touches no DOM,
 * so it runs in node like the rest of the suite.
 */
import {
  SUGGESTION_CHIPS,
  sessionTitle,
  filterSessions,
  groupSessions,
  localDateKey,
  sessionDate,
} from "../assets/js/ai/chatui.js";

const rows = [
  { id: "a", title: "Photosynthesis notes", createdAt: "2026-11-05T08:00:00.000Z" },
  { id: "b", title: "Calculus quiz prep", createdAt: "2026-11-04T08:00:00.000Z" },
  { id: "c", title: "PHOTOSYNTHESIS deep dive", createdAt: "2026-11-03T08:00:00.000Z" },
  { id: "d", title: "", createdAt: "2026-11-02T08:00:00.000Z" },
];
// Fixed "now": 2026-11-05 in the viewer's local calendar. Tests run in the
// VM's local timezone, so build the date from local parts, not UTC.
const now = new Date(2026, 10, 5, 12, 0, 0);

test("chatui: suggestion chips are exactly the four study prompts", () => {
  assertEq(SUGGESTION_CHIPS, [
    "Explain photosynthesis in simple terms",
    "Quiz me on calculus basics",
    "Make a study plan for my exams",
    "Summarize my notes",
  ]);
});

test("chatui: chips carry no em dashes (standing style rule)", () => {
  for (const c of SUGGESTION_CHIPS) assert(!c.includes("—"), `chip has em dash: ${c}`);
});

test("chatui: sessionTitle falls back for blank titles", () => {
  assertEq(sessionTitle(rows[0]), "Photosynthesis notes");
  assertEq(sessionTitle(rows[3]), "Untitled chat");
  assertEq(sessionTitle(null), "Untitled chat");
});

test("chatui: empty query returns rows unchanged and in order", () => {
  assertEq(filterSessions(rows, ""), rows);
  assertEq(filterSessions(rows, "   "), rows);
});

test("chatui: search filters by title, case-insensitive", () => {
  assertEq(filterSessions(rows, "photo").map((r) => r.id), ["a", "c"]);
  assertEq(filterSessions(rows, "CALCULUS").map((r) => r.id), ["b"]);
  assertEq(filterSessions(rows, "untitled").map((r) => r.id), ["d"]);
  assertEq(filterSessions(rows, "zzz"), []);
});

test("chatui: search never mutates the input", () => {
  const before = rows.map((r) => r.id);
  filterSessions(rows, "photo");
  assertEq(rows.map((r) => r.id), before);
});

test("chatui: grouping puts local-today rows first, then Earlier", () => {
  // Row "a" is dated 2026-11-05 UTC; in timezones behind UTC its local date
  // is 2026-11-04, so assert on structure, not on a fixed split: every row
  // appears exactly once, Today (if any) precedes Earlier, order preserved.
  const groups = groupSessions(rows, now);
  assert(groups.length >= 1 && groups.length <= 2, "1 or 2 groups");
  assertEq(groups[0].label, groups.length === 2 ? "Today" : "Earlier");
  const seen = groups.flatMap((g) => g.items.map((r) => r.id));
  assertEq(seen, ["a", "b", "c", "d"]);
  if (groups.length === 2) assertEq(groups[1].label, "Earlier");
});

test("chatui: grouping a same-local-day set yields only Today", () => {
  const same = [
    { id: "x", title: "One", createdAt: new Date(2026, 10, 5, 9, 0, 0).toISOString() },
    { id: "y", title: "Two", createdAt: new Date(2026, 10, 5, 10, 0, 0).toISOString() },
  ];
  assertEq(groupSessions(same, now), [{ label: "Today", items: same }]);
});

test("chatui: grouping an old set yields only Earlier", () => {
  const old = [{ id: "x", title: "Old", createdAt: "2026-10-01T09:00:00.000Z" }];
  assertEq(groupSessions(old, now), [{ label: "Earlier", items: old }]);
});

test("chatui: rows without a usable date land in Earlier, never dropped", () => {
  const mixed = [
    { id: "x", title: "No date" },
    { id: "y", title: "Garbage", createdAt: "not-a-date" },
  ];
  assertEq(groupSessions(mixed, now), [{ label: "Earlier", items: mixed }]);
});

test("chatui: empty input groups to nothing", () => {
  assertEq(groupSessions([], now), []);
});

test("chatui: sessionDate prefers createdAt, falls back to updatedAt", () => {
  assert(sessionDate({ createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-02T00:00:00.000Z" }) instanceof Date);
  assertEq(sessionDate({ updatedAt: "2026-11-02T00:00:00.000Z" }).toISOString(), "2026-11-02T00:00:00.000Z");
  assertEq(sessionDate({}), null);
  assertEq(sessionDate(null), null);
});

test("chatui: localDateKey uses local calendar parts", () => {
  const d = new Date(2026, 0, 5, 23, 30, 0); // local Jan 5, regardless of TZ
  assertEq(localDateKey(d), "2026-01-05");
});
