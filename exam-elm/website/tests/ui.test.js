/**
 * Shared UI utility tests (pure functions only — no DOM, no browser).
 * The day-change wiring itself lives in onDayChange(); the predicate it uses
 * (dayRolledOver) is tested here so the overnight-stale-countdown logic is
 * pinned without a browser.
 * Run: node tests/run.js
 */
import { toISODate, parseDateInput, dayRolledOver, daysBetween } from "../assets/js/ui.js";

test("toISODate formats a local date without timezone shift", () => {
  assertEq(toISODate(new Date(2026, 10, 4)), "2026-11-04");
  assertEq(toISODate(new Date(2026, 0, 1)), "2026-01-01");
});

test("parseDateInput builds a local date from YYYY-MM-DD", () => {
  const d = parseDateInput("2026-11-04");
  assertEq([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 10, 4]);
  assertEq(parseDateInput("not-a-date"), null);
  assertEq(parseDateInput(""), null);
  // Documented leniency: out-of-range parts roll over like the Date
  // constructor (tracker.js does its own strict validation on top).
  const rolled = parseDateInput("2026-02-30");
  assertEq([rolled.getFullYear(), rolled.getMonth(), rolled.getDate()], [2026, 2, 2]);
});

test("dayRolledOver: same day -> false, new day -> true", () => {
  assertEq(dayRolledOver("2026-11-04", new Date(2026, 10, 4, 23, 59)), false);
  assertEq(dayRolledOver("2026-11-04", new Date(2026, 10, 5, 0, 0)), true);
  assertEq(dayRolledOver("2026-11-04", new Date(2026, 10, 4, 0, 0)), false);
});

test("dayRolledOver: month/year boundaries count as rollover", () => {
  assertEq(dayRolledOver("2026-10-31", new Date(2026, 11, 1)), true);
  assertEq(dayRolledOver("2026-12-31", new Date(2027, 0, 1)), true);
});

test("daysBetween is calendar-exact across a DST spring-forward week", () => {
  // US DST 2026-03-08: a 23-hour day must still count as exactly one day.
  assertEq(daysBetween(new Date(2026, 2, 7), new Date(2026, 2, 8)), 1);
  assertEq(daysBetween(new Date(2026, 10, 4), new Date(2026, 10, 4)), 0);
  assertEq(daysBetween(new Date(2026, 10, 5), new Date(2026, 10, 4)), -1);
});
