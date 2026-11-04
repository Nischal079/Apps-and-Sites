/**
 * AI document workflows tests (pure module — no DOM, no network, no keys).
 * Tests assets/js/ai/workflows.js against ../storage.js memory backend.
 * Run: node tests/run.js
 */
import {
  CTX, TOKEN_LIMITS, KV_DECKS, KV_ATTEMPTS,
  NOTE_ACTIONS, NOTE_ACTION_LABEL,
  assembleContext, chatContextMessages,
  flashcardPrompt, quizPrompt, plannerPrompt, noteActionPrompt, summarizeTracker,
  parseFlashcards, parseQuiz, scoreQuiz,
  validatePlannerInput, plannerDraftToTimetable,
  applyNoteAction,
  listDecks, saveDeck, deleteDeck, listAttempts, saveAttempt,
} from "../assets/js/ai/workflows.js";
import { openStorage } from "../assets/js/storage.js";

const T = "2026-11-04"; // fixed "today" for deterministic tracker summaries

/* ================= assembleContext ================= */

test("aiworkflows: assembleContext builds parts + payload shape", () => {
  const r = assembleContext([
    { kind: "note", id: "n1", name: "Chapter 1", text: "abc" },
    { kind: "file", id: "f1", name: "notes.pdf", text: "def" },
  ]);
  assertEq(r.itemCount, 2, "itemCount");
  assertEq(r.droppedCount, 0, "droppedCount");
  assertEq(r.totalChars, 6, "totalChars");
  assertEq(r.truncatedAny, false, "truncatedAny");
  assertEq(r.parts[0].kind, "note", "kind preserved");
  assertEq(r.parts[0].name, "Chapter 1", "name preserved");
  assertEq(r.parts[1].kind, "file", "file kind preserved");
  assert(r.payload.includes("--- note: Chapter 1 ---"), "payload header note");
  assert(r.payload.includes("--- file: notes.pdf ---"), "payload header file");
  assert(r.payload.includes("abc") && r.payload.includes("def"), "payload text");
});

test("aiworkflows: assembleContext truncates a 9000-char item to 8000", () => {
  const r = assembleContext([{ kind: "note", id: "n1", name: "big", text: "x".repeat(9000) }]);
  assertEq(r.parts.length, 1, "one part");
  assertEq(r.parts[0].chars, 9000, "chars reports original length");
  assertEq(r.parts[0].includedChars, CTX.MAX_ITEM_CHARS, "includedChars capped at 8000");
  assertEq(r.parts[0].truncated, true, "truncated flag");
  assertEq(r.truncatedAny, true, "truncatedAny");
  assertEq(r.totalChars, 8000, "total reflects truncation");
});

test("aiworkflows: assembleContext caps total at 24000 chars", () => {
  const items = [1, 2, 3].map((i) => ({ kind: "note", id: "n" + i, name: "n" + i, text: "x".repeat(9000) }));
  const r = assembleContext(items);
  assertEq(r.itemCount, 3, "all three fit");
  assertEq(r.totalChars, CTX.MAX_TOTAL_CHARS, "total exactly 24000");
  assertEq(r.parts[2].includedChars, 8000, "third item cut to 8000 by total cap");
  assert(r.parts.every((p) => p.truncated), "all truncated");
  assertEq(r.droppedCount, 0, "none dropped");
});

test("aiworkflows: assembleContext drops items beyond MAX_ITEMS", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ kind: "note", id: "n" + i, name: "n" + i, text: "x" }));
  const r = assembleContext(items);
  assertEq(r.itemCount, CTX.MAX_ITEMS, "20 parts");
  assertEq(r.droppedCount, 5, "droppedCount = 25 - 20");
});

test("aiworkflows: assembleContext handles empty input", () => {
  const r = assembleContext([]);
  assertEq(r.parts, [], "no parts");
  assertEq(r.payload, "", "empty payload");
  assertEq(r.totalChars, 0, "zero chars");
  assertEq(r.itemCount, 0, "zero items");
  assertEq(r.droppedCount, 0, "zero dropped");
  assertEq(r.truncatedAny, false, "not truncated");
});

/* ================= chatContextMessages ================= */

test("aiworkflows: chatContextMessages returns system + user messages", () => {
  const asm = assembleContext([{ kind: "note", id: "n1", name: "Ch1", text: "the mitochondria" }]);
  const msgs = chatContextMessages(asm, "What does it do?");
  assertEq(msgs.length, 2, "two messages");
  assertEq(msgs[0].role, "system", "first is system");
  assert(msgs[0].content.includes("ONLY"), "system instructs materials-only answering");
  assert(msgs[0].content.includes("study materials"), "system references materials");
  assertEq(msgs[1].role, "user", "second is user");
  assert(msgs[1].content.includes("the mitochondria"), "user message contains payload");
  assert(msgs[1].content.includes("What does it do?"), "user message contains question");
});

/* ================= parseFlashcards ================= */

test("aiworkflows: parseFlashcards handles Q:/A: blocks", () => {
  const raw = "Q: What is 2+2?\nA: 4\n\nQ: Capital of Nepal?\nA: Kathmandu";
  const cards = parseFlashcards(raw);
  assertEq(cards, [
    { front: "What is 2+2?", back: "4" },
    { front: "Capital of Nepal?", back: "Kathmandu" },
  ], "exact Q/A cards");
});

test("aiworkflows: parseFlashcards handles Front:/Back: labels", () => {
  const cards = parseFlashcards("Front: atom\nBack: smallest unit of matter");
  assertEq(cards.length, 1, "one card");
  assertEq(cards[0].front, "atom", "front");
  assertEq(cards[0].back, "smallest unit of matter", "back");
});

test("aiworkflows: parseFlashcards handles JSON arrays", () => {
  const a = parseFlashcards(JSON.stringify([{ front: "f1", back: "b1" }]));
  assertEq(a, [{ front: "f1", back: "b1" }], "front/back JSON");
  const b = parseFlashcards(JSON.stringify([{ q: "f2", a: "b2" }]));
  assertEq(b, [{ front: "f2", back: "b2" }], "q/a JSON");
});

test("aiworkflows: parseFlashcards handles numbered Q/A pairs", () => {
  const raw = "1. What is photosynthesis?\nA: How plants make food from light.\n\n2. What is mitosis?\nA: Cell division.";
  const cards = parseFlashcards(raw);
  assertEq(cards.length, 2, "two cards");
  assert(cards[0].front.includes("photosynthesis"), "first front");
  assert(cards[0].back.includes("plants"), "first back");
  assert(cards[1].front.includes("mitosis"), "second front");
});

test("aiworkflows: parseFlashcards rejects garbage without throwing", () => {
  assertEq(parseFlashcards("just a rambling line about nothing in particular"), [], "single line");
  assertEq(parseFlashcards(""), [], "empty string");
  assertEq(parseFlashcards("lorem ipsum dolor sit amet, no structure here at all"), [], "unparseable text");
  assertEq(parseFlashcards(null), [], "null input");
});

/* ================= parseQuiz ================= */

test("aiworkflows: parseQuiz MCQ block with Answer: B", () => {
  const raw = "1. What is 2+2? [MCQ]\nA. 3\nB. 4\nC. 5\nD. 6\nAnswer: B\nExplanation: Basic addition.";
  const qs = parseQuiz(raw);
  assertEq(qs.length, 1, "one question");
  assertEq(qs[0].type, "mcq", "type mcq");
  assertEq(qs[0].question, "What is 2+2?", "question text");
  assertEq(qs[0].options, ["3", "4", "5", "6"], "options");
  assertEq(qs[0].answerIndex, 1, "Answer: B → index 1");
  assertEq(qs[0].answerText, "4", "answerText resolved");
  assert(qs[0].explanation.includes("addition"), "explanation kept");
});

test("aiworkflows: parseQuiz short-answer block", () => {
  const raw = "1. Capital of France? [short]\nAnswer: Paris\nExplanation: Geography.";
  const qs = parseQuiz(raw);
  assertEq(qs.length, 1, "one question");
  assertEq(qs[0].type, "short", "type short");
  assertEq(qs[0].answerText, "Paris", "answerText");
  assertEq(qs[0].answerIndex, null, "no index for short");
});

test("aiworkflows: parseQuiz handles JSON array form", () => {
  const raw = JSON.stringify([
    { question: "Q1", options: ["a", "b", "c", "d"], answer: "C", explanation: "why" },
    { question: "Q2", type: "short", answerText: "the answer" },
  ]);
  const qs = parseQuiz(raw);
  assertEq(qs.length, 2, "two questions");
  assertEq(qs[0].type, "mcq", "json mcq");
  assertEq(qs[0].answerIndex, 2, "C → 2");
  assertEq(qs[1].type, "short", "json short");
  assertEq(qs[1].answerText, "the answer", "short answerText");
});

test("aiworkflows: parseQuiz answer letter beyond options is graceful", () => {
  const raw = "1. Which? [MCQ]\nA. x\nB. y\nAnswer: D\nExplanation: hmm";
  const qs = parseQuiz(raw);
  assertEq(qs.length, 1, "one question");
  assertEq(qs[0].type, "mcq", "still mcq");
  assertEq(qs[0].answerIndex, null, "answerIndex null, not a crash");
  assertEq(qs[0].answerText, "D", "raw answer kept");
});

test("aiworkflows: parseQuiz never throws on garbage", () => {
  const r1 = parseQuiz("");
  assertEq(r1, [], "empty string → []");
  let threw = false;
  try { parseQuiz(";;; [[ random garbage ;;;"); } catch { threw = true; }
  assert(!threw, "garbage does not throw");
});

/* ================= scoreQuiz ================= */

function sampleQuiz() {
  return [
    { type: "mcq", question: "2+2?", options: ["3", "4", "5", "6"], answerIndex: 1, answerText: "4", explanation: "add" },
    { type: "mcq", question: "bad?", options: ["x", "y"], answerIndex: null, answerText: "D", explanation: "" },
    { type: "short", question: "Capital of France?", options: [], answerIndex: null, answerText: "Paris", explanation: "" },
    { type: "short", question: "Capital of Nepal?", options: [], answerIndex: null, answerText: "Kathmandu", explanation: "" },
  ];
}

test("aiworkflows: scoreQuiz mcq correct and wrong", () => {
  const qs = sampleQuiz();
  const r = scoreQuiz(qs, { 0: 1, 2: "Paris", 3: "Kathmandu" });
  assertEq(r.total, 4, "total counts all questions");
  assertEq(r.scorable, 3, "null-answerIndex question not scorable");
  assertEq(r.score, 3, "three correct");
  assertEq(r.details[0].correct, true, "mcq correct");
  assertEq(r.details[0].givenLabel, "B. 4", "givenLabel");
  assertEq(r.details[0].expectedLabel, "B. 4", "expectedLabel");
  const r2 = scoreQuiz(qs, { 0: 0 });
  assertEq(r2.details[0].correct, false, "mcq wrong");
  assertEq(r2.score, 0, "wrong mcq scores zero");
  assertEq(r2.details[0].givenLabel, "A. 3", "wrong givenLabel");
});

test("aiworkflows: scoreQuiz short answer is lenient", () => {
  const qs = sampleQuiz();
  const r = scoreQuiz(qs, { 2: "  pArIs  " });
  assertEq(r.details[2].correct, true, "case/whitespace-insensitive match");
  const r2 = scoreQuiz(qs, { 2: "London" });
  assertEq(r2.details[2].correct, false, "clear miss is wrong");
  const r3 = scoreQuiz(qs, { 3: "I visited Kathmandu city" });
  assertEq(r3.details[3].correct, true, "containment counts");
});

test("aiworkflows: scoreQuiz unscorable questions don't hurt the score", () => {
  const qs = sampleQuiz();
  const r = scoreQuiz(qs, { 0: 1, 1: 0, 2: "Paris", 3: "Kathmandu" });
  assertEq(r.details[1].scorable, false, "null key → scorable false");
  assertEq(r.details[1].correct, false, "unscorable reports correct false");
  assertEq(r.score, 3, "score unaffected by unscorable answer");
});

test("aiworkflows: scoreQuiz missing answer label", () => {
  const qs = sampleQuiz();
  const r = scoreQuiz(qs, {});
  assertEq(r.details[0].givenLabel, "(no answer)", "missing → '(no answer)'");
  assertEq(r.details[0].correct, false, "missing is not correct");
  assertEq(r.score, 0, "no points for blanks");
});

/* ================= validatePlannerInput ================= */

test("aiworkflows: validatePlannerInput catches bad inputs", () => {
  const e1 = validatePlannerInput({ subjects: [], dailyMinutes: 120 });
  assert(e1.length > 0 && e1.some((e) => e.toLowerCase().includes("subject")), "empty subjects → subject error");
  const e2 = validatePlannerInput({ subjects: [{ name: "Math" }], dailyMinutes: 0 });
  assert(e2.some((e) => e.includes("0 minutes")), "0 minutes → error");
  const e3 = validatePlannerInput({ subjects: [{ name: "Math" }], dailyMinutes: 1000 });
  assert(e3.some((e) => e.toLowerCase().includes("typo")), "1000 minutes → typo warning");
  assertEq(validatePlannerInput({ subjects: [{ name: "Math" }], dailyMinutes: 120 }), [], "valid → []");
});

/* ================= plannerDraftToTimetable ================= */

test("aiworkflows: plannerDraftToTimetable converts a valid draft", () => {
  const out = plannerDraftToTimetable({
    subjects: [
      { name: "Math", priority: 1, examDate: "2026-12-01" },
      { name: "Physics", priority: 3 },
    ],
    exams: [
      { name: "Math final", date: "2026-12-01", subjectName: "Math" },
      { name: "Bad date exam", date: "tomorrow", subjectName: "Physics" },
    ],
    dailyMinutes: 120,
    sessionMin: 50,
    startDate: "2026-11-05",
  });
  assertEq(out.subjects.length, 2, "two subjects");
  assertEq(out.subjects[0].name, "Math", "name kept");
  assertEq(out.subjects[0].priority, 1, "priority kept");
  assert(out.subjects[0].id, "subject id assigned");
  const mathExam = out.exams.find((e) => e.name === "Math final");
  assert(mathExam, "math exam kept");
  assertEq(mathExam.subjectId, out.subjects[0].id, "exam mapped to subject by name");
  assert(!out.exams.some((e) => e.name === "Bad date exam"), "bad-date exam dropped, not fatal");
  assertEq(out.dailyMinutes, 120, "dailyMinutes preserved");
  assertEq(out.sessionMin, 50, "sessionMin preserved");
  assertEq(out.startDate, "2026-11-05", "startDate kept");
});

test("aiworkflows: plannerDraftToTimetable throws plain-language errors", () => {
  assertThrows(() => plannerDraftToTimetable({}), "subject", "empty draft throws plain error");
  try {
    plannerDraftToTimetable({ subjects: [] });
    assert(false, "should have thrown");
  } catch (e) {
    assert(e.message.includes("subject"), "plain-language: mentions subjects");
    assert(!e.message.includes("\n"), "single-line plain message, no stack");
    assert(e.message.length < 200, "short message");
  }
});

/* ================= summarizeTracker ================= */

function mkSumSubject(name, examDate, topics) {
  return { id: "s-" + name, name, examDate, topics: topics.map(([tname, conf], i) => ({ id: "t" + i, name: tname, confidence: conf })) };
}

// summarizeTracker: coveragePct comes from tracker.js subjectCoverage().percent
// (already 0–100, null when the subject has no topics). Fixed 2026-11-04:
// was Math.round(object * 100) → always NaN.
test("aiworkflows: summarizeTracker coverage and topic counts", () => {
  const subs = [
    mkSumSubject("Math", "2026-12-01", [["Limits", "done"], ["Derivatives", "done"]]),
    mkSumSubject("Physics", "2026-12-10", [["Kinematics", "done"], ["Dynamics", "wip"]]),
    mkSumSubject("History", null, []),
  ];
  const s = summarizeTracker(subs, T);
  assertEq(s.length, 3, "one entry per subject");
  assertEq(s[0].name, "Math", "name");
  assertEq(s[0].examDate, "2026-12-01", "examDate kept");
  assertEq(s[0].coveragePct, 100, "all done → 100");
  assertEq(s[0].topicsTotal, 2, "topicsTotal");
  assertEq(s[0].topicsDone, 2, "topicsDone");
  assertEq(s[1].coveragePct, 75, "done=1 + wip=0.5 of 2 → 75");
  assertEq(s[1].topicsDone, 1, "only done counts as done");
  assertEq(s[2].examDate, null, "null examDate handled");
  assertEq(s[2].coveragePct, null, "no topics → null, not NaN");
});

// summarizeTracker: weakestTopics() returns flat entries with `topicName`
// (no nested `topic` object). Fixed 2026-11-04: was w.topic.name → TypeError.
test("aiworkflows: summarizeTracker lists weakest topics without crashing", () => {
  const subs = [mkSumSubject("Math", "2026-12-01", [["Limits", "done"], ["Derivatives", "wip"], ["Integrals", "none"]])];
  const s = summarizeTracker(subs, T);
  assertEq(s.length, 1, "one entry");
  assert(Array.isArray(s[0].weakestTopics), "weakestTopics is an array");
  assertEq(s[0].weakestTopics.length, 2, "done topic excluded, wip+none listed");
  assert(!s[0].weakestTopics.includes("Limits"), "confident topic not listed as weak");
  assert(s[0].weakestTopics.includes("Derivatives"), "wip topic listed");
  assert(s[0].weakestTopics.includes("Integrals"), "unstarted topic listed");
});

/* ================= applyNoteAction ================= */

test("aiworkflows: applyNoteAction preview never mutates", () => {
  const src = "original note text";
  const r = applyNoteAction(src, "AI OUTPUT", "preview");
  assertEq(r.mutated, false, "mutated false");
  assertEq(r.preview, "AI OUTPUT", "preview carries output");
  assertEq(src, "original note text", "input string unchanged (strict equality)");
  const r2 = applyNoteAction(src, "x", "weird-mode");
  assertEq(r2.mutated, false, "unknown mode falls back to preview semantics");
});

test("aiworkflows: applyNoteAction replace and append", () => {
  const rep = applyNoteAction("old text", "new text", "replace");
  assertEq(rep.mutated, true, "replace mutated");
  assertEq(rep.text, "new text", "replace → text equals output");
  const app = applyNoteAction("old text", "more", "append");
  assertEq(app.mutated, true, "append mutated");
  assert(app.text.includes("old text"), "append keeps original");
  assert(app.text.includes("more"), "append includes output");
});

/* ================= persistence (memory backend) ================= */

function freshStorage() {
  return openStorage({ backend: "memory" });
}

test("aiworkflows: saveDeck → listDecks returns it", async () => {
  const storage = await freshStorage();
  const saved = await saveDeck(storage, {
    id: "deck-test-alpha",
    name: "Alpha deck",
    source: { kind: "note", name: "Ch1" },
    cards: [{ front: "f", back: "b" }, { front: "f2", back: "b2" }],
  });
  assertEq(saved.name, "Alpha deck", "saved name");
  assertEq(saved.cards.length, 2, "cards kept");
  const decks = await listDecks(storage);
  assert(decks.some((d) => d.id === "deck-test-alpha"), "listDecks includes saved deck");
});

test("aiworkflows: saveDeck rejects empty cards", async () => {
  const storage = await freshStorage();
  let threw = false;
  try {
    await saveDeck(storage, { id: "deck-test-empty", name: "Empty", cards: [] });
  } catch (e) {
    threw = true;
    assert(e.message.toLowerCase().includes("card"), "error mentions cards");
  }
  assert(threw, "empty cards throws");
  let threw2 = false;
  try {
    await saveDeck(storage, { id: "deck-test-blank", name: "Blank", cards: [{ front: "  ", back: "" }] });
  } catch (e) { threw2 = true; }
  assert(threw2, "blank-only cards throw");
});

test("aiworkflows: saveDeck caps name length at 80", async () => {
  const storage = await freshStorage();
  const saved = await saveDeck(storage, {
    id: "deck-test-longname",
    name: "x".repeat(100),
    cards: [{ front: "f", back: "b" }],
  });
  assert(saved.name.length <= 80, `name capped (got ${saved.name.length})`);
});

test("aiworkflows: deleteDeck removes the deck", async () => {
  const storage = await freshStorage();
  await saveDeck(storage, { id: "deck-test-doomed", name: "Doomed", cards: [{ front: "f", back: "b" }] });
  await saveDeck(storage, { id: "deck-test-keeper", name: "Keeper", cards: [{ front: "f", back: "b" }] });
  await deleteDeck(storage, "deck-test-doomed");
  const decks = await listDecks(storage);
  assert(!decks.some((d) => d.id === "deck-test-doomed"), "deleted deck gone");
  assert(decks.some((d) => d.id === "deck-test-keeper"), "other deck kept");
});

test("aiworkflows: saveAttempt → listAttempts", async () => {
  const storage = await freshStorage();
  const rec = await saveAttempt(storage, {
    id: "attempt-test-1",
    title: "Math quiz",
    score: 3,
    total: 4,
    scorable: 4,
    details: [{ index: 0, correct: true }],
  });
  assertEq(rec.title, "Math quiz", "title kept");
  const attempts = await listAttempts(storage);
  assert(attempts.some((a) => a.id === "attempt-test-1" && a.score === 3), "listAttempts includes attempt");
});

/* ================= prompt builders ================= */

test("aiworkflows: flashcardPrompt includes count and format markers", () => {
  const p = flashcardPrompt("some material", 12);
  assert(p.includes("12"), "count included");
  assert(p.includes("Q:"), "Q: marker");
  assert(p.includes("A:"), "A: marker");
  assert(p.includes("some material"), "material included");
  const p2 = flashcardPrompt("m", 0);
  assert(p2.includes("exactly 1"), "clamps count to min 1");
});

test("aiworkflows: quizPrompt includes mcq/short counts", () => {
  const p = quizPrompt("material here", { mcq: 5, short: 3 });
  assert(p.includes("5 multiple-choice"), "mcq count");
  assert(p.includes("3 short-answer"), "short count");
  assert(p.includes("Answer:"), "answer marker");
});

test("aiworkflows: noteActionPrompt rejects unknown action with summarize fallback", () => {
  const p = noteActionPrompt("teleport", "note body");
  assert(p.includes("Summarize the following note"), "falls back to summarize");
  assert(p.includes("note body"), "text included");
  const p2 = noteActionPrompt("keypoints", "body");
  assert(p2.includes("key points"), "keypoints action");
});

test("aiworkflows: plannerPrompt includes minutes and subject names", () => {
  const summary = summarizeTracker([mkSumSubject("Math", "2026-12-01", [["Limits", "done"]])], T);
  const p = plannerPrompt(summary, { dailyMinutes: 90, horizonDays: 7 });
  assert(p.includes("90 minutes per day"), "daily minutes");
  assert(p.includes("7-day"), "horizon days");
  assert(p.includes("Math"), "subject name");
});

test("aiworkflows: constants and note-action labels", () => {
  assertEq(CTX.MAX_ITEMS, 20, "MAX_ITEMS");
  assertEq(CTX.MAX_ITEM_CHARS, 8000, "MAX_ITEM_CHARS");
  assertEq(CTX.MAX_TOTAL_CHARS, 24000, "MAX_TOTAL_CHARS");
  assertEq(KV_DECKS, "flashdecks:v1", "decks key");
  assertEq(KV_ATTEMPTS, "quizattempts:v1", "attempts key");
  assertEq(NOTE_ACTIONS, ["summarize", "expand", "simplify", "keypoints"], "actions list");
  assertEq(NOTE_ACTION_LABEL.simplify, "Simplify the language", "label");
  assertEq(TOKEN_LIMITS.quiz, 3000, "token limit");
});
