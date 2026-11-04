/**
 * StudyPilot — zero-dependency Node test harness.
 * Run: node tests/run.js
 * Convention: tests/*.test.js export nothing; they call global test().
 * Exit code 0 = all pass, 1 = any failure. No framework, $0.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;
const failures = [];

const pending = [];
globalThis.test = (name, fn) => {
  try {
    const r = fn();
    if (r && typeof r.then === "function") {
      // collect async tests so the runner awaits every one of them
      pending.push(
        r.then(
          () => {
            passed++;
          },
          (e) => {
            failed++;
            failures.push([name, e]);
          }
        )
      );
    } else {
      passed++;
    }
  } catch (e) {
    failed++;
    failures.push([name, e]);
  }
};

globalThis.assert = (cond, msg) => {
  if (!cond) throw new Error("assert failed: " + (msg || "no message"));
};
globalThis.assertEq = (a, b, msg) => {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`assertEq failed: ${msg || ""}\n  got:      ${sa}\n  expected: ${sb}`);
};
globalThis.assertThrows = (fn, needle, msg) => {
  try {
    fn();
  } catch (e) {
    if (needle && !String(e.message).includes(needle))
      throw new Error(`assertThrows: message "${e.message}" lacks "${needle}" (${msg || ""})`);
    return;
  }
  throw new Error("assertThrows: did not throw (" + (msg || "") + ")");
};

const files = (await readdir(__dirname)).filter((f) => f.endsWith(".test.js")).sort();
for (const f of files) {
  await import(path.join(__dirname, f));
}
// wait for EVERY async test to settle before reporting — slow tests
// (e.g. PBKDF2) must never be silently dropped from the results
await Promise.all(pending);

console.log(`\n${passed} passed, ${failed} failed, ${files.length} test file(s)`);
for (const [name, e] of failures) {
  console.log(`\nFAIL: ${name}\n  ${e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n  ") : e}`);
}
process.exit(failed ? 1 : 0);
