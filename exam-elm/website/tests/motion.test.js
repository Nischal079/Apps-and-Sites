/**
 * ExamElm — motion system tests.
 *
 * motion.js is a side-effect module (it initializes on import in the
 * browser), but it guards the DOM access, so importing it in Node is a
 * no-op and the pure helpers can be tested here. Run: node tests/run.js
 */
import { ROTATOR_WORDS, rotatorNext } from "../assets/js/motion.js";

test("rotator words are the four hero verbs in order", () => {
  if (ROTATOR_WORDS.join("|") !== "Learn|Practice|Understand|Remember") {
    throw new Error("rotator words changed: " + ROTATOR_WORDS.join(", "));
  }
});

test("rotatorNext advances and wraps back to the first word", () => {
  if (rotatorNext(0) !== 1) throw new Error("0 should advance to 1");
  if (rotatorNext(2) !== 3) throw new Error("2 should advance to 3");
  if (rotatorNext(3) !== 0) throw new Error("last word should wrap to 0");
  if (rotatorNext(ROTATOR_WORDS.length - 1) !== 0) {
    throw new Error("wrap must use the word list length");
  }
});

test("rotator cycle visits every word exactly once before repeating", () => {
  const seen = [];
  let i = 0;
  for (let n = 0; n < ROTATOR_WORDS.length; n++) {
    seen.push(ROTATOR_WORDS[i]);
    i = rotatorNext(i);
  }
  if (new Set(seen).size !== ROTATOR_WORDS.length) {
    throw new Error("cycle repeats a word early: " + seen.join(", "));
  }
  if (i !== 0) throw new Error("cycle should return to the first word");
});
