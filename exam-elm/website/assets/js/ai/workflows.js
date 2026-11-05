/**
 * StudyPilot · AI document workflows shared library (pure functions).
 *
 * SECURITY CONTRACT (read before touching):
 * - Nothing in this module transmits anything. It ASSEMBLES payloads,
 *   builds prompts, parses model output, and scores quizzes · all locally.
 * - Transmission happens ONLY in the page controller, ONLY through
 *   streamChat(), and ONLY after the user explicitly presses Send with a
 *   "what will be sent" preview on screen.
 * - Model output is NEVER trusted: the page must render it ONLY through
 *   renderMarkdown() (escape-first). Parsers below extract plain strings;
 *   they never produce HTML.
 * - No API keys, no endpoints, no fetch in this file. Ever.
 *
 * Persistence: flashcard decks and quiz attempts live in the existing kv
 * store (flashdecks:v1, quizattempts:v1) · no new IndexedDB stores, no
 * DB_VERSION bump, same convention as tracker:v1 / countdown:v1.
 */

import { subjectCoverage, weakestTopics, CONF_LABEL } from "../tracker.js";

/* ============================ constants ============================ */

/** Context-window guardrails for "chat with my study space". */
export const CTX = {
  MAX_ITEMS: 20, // max notes/files selectable
  MAX_ITEM_CHARS: 8000, // per-item truncation point
  MAX_TOTAL_CHARS: 24000, // whole-payload truncation point
};

/** Per-feature output token budgets (worst-case cost basis). */
export const TOKEN_LIMITS = {
  chat: 2000,
  flashcards: 2000,
  quiz: 3000,
  planner: 2500,
  notes: 1500,
};

export const KV_DECKS = "flashdecks:v1";
export const KV_ATTEMPTS = "quizattempts:v1";

export const NOTE_ACTIONS = ["summarize", "expand", "simplify", "keypoints"];
export const NOTE_ACTION_LABEL = {
  summarize: "Summarize",
  expand: "Expand with examples",
  simplify: "Simplify the language",
  keypoints: "Extract key points",
};

function uid(prefix) {
  return (
    (prefix || "id") +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

/* ====================== context payload assembly =================== */

/**
 * Assemble an explicit, inspectable context payload from user-selected
 * notes/files. Truncation is per-item AND total, and every part reports
 * exactly what was included so the preview panel can show it.
 *
 * items: [{kind:'note'|'file', id, name, text}]
 * Returns {parts:[{kind,id,name,chars,includedChars,truncated}], payload,
 *          totalChars, itemCount, droppedCount, truncatedAny}
 */
export function assembleContext(items) {
  const list = Array.isArray(items) ? items : [];
  const parts = [];
  let total = 0;
  let truncatedAny = false;
  const n = Math.min(list.length, CTX.MAX_ITEMS);

  for (let i = 0; i < n; i++) {
    const it = list[i] || {};
    const text = String(it.text ?? "");
    const name = String(it.name || it.id || `item-${i + 1}`).slice(0, 120);
    const kind = it.kind === "file" ? "file" : "note";
    const id = String(it.id || "");
    const roomLeft = CTX.MAX_TOTAL_CHARS - total;
    if (roomLeft <= 0) break; // payload full · rest are dropped, not silently cut
    const cap = Math.min(CTX.MAX_ITEM_CHARS, roomLeft);
    let take = text;
    let truncated = false;
    if (take.length > cap) {
      take = take.slice(0, cap);
      truncated = true;
      truncatedAny = true;
    }
    parts.push({
      kind,
      id,
      name,
      chars: text.length,
      includedChars: take.length,
      truncated,
      text: take,
    });
    total += take.length;
  }

  const droppedCount = list.length - parts.length;
  const payload = parts
    .map((p) => `--- ${p.kind}: ${p.name} ---\n${p.text}`)
    .join("\n\n");
  return {
    parts,
    payload,
    totalChars: total,
    itemCount: parts.length,
    droppedCount,
    truncatedAny,
  };
}

/**
 * Build the message list for "chat with my study space".
 * The model is instructed to answer ONLY from the provided materials.
 */
export function chatContextMessages(assembly, userQuestion) {
  const q = String(userQuestion || "").trim();
  return [
    {
      role: "system",
      content:
        "You are a study assistant. Answer ONLY using the study materials provided below. " +
        "If the answer is not in the materials, say so plainly instead of guessing. " +
        "Cite which material each key point comes from.",
    },
    {
      role: "user",
      content: `STUDY MATERIALS:\n${assembly.payload}\n\nQUESTION:\n${q}`,
    },
  ];
}

/* ============================ prompt builders ====================== */

export function flashcardPrompt(text, count) {
  const n = Math.max(1, Math.min(50, Number(count) || 12));
  return (
    `Create exactly ${n} flashcards from the study material below.\n\n` +
    `OUTPUT FORMAT · repeat this block per card, nothing else:\n` +
    `Q: <a clear, specific question>\n` +
    `A: <a concise, complete answer>\n\n` +
    `Rules: one concept per card; questions must be answerable from the material; ` +
    `no markdown headings, no numbering, no extra commentary.\n\n` +
    `STUDY MATERIAL:\n${text}`
  );
}

export function quizPrompt(text, { mcq = 5, short = 3 } = {}) {
  const m = Math.max(0, Math.min(20, Number(mcq) || 0));
  const s = Math.max(0, Math.min(10, Number(short) || 0));
  return (
    `Create a quiz from the study material below: ${m} multiple-choice questions ` +
    `and ${s} short-answer questions.\n\n` +
    `OUTPUT FORMAT · repeat per question, nothing else:\n` +
    `1. <question text> [MCQ]\n` +
    `A. <option>\nB. <option>\nC. <option>\nD. <option>\n` +
    `Answer: <letter>\nExplanation: <one sentence>\n\n` +
    `${m + 1}. <question text> [short]\n` +
    `Answer: <expected answer>\nExplanation: <one sentence>\n\n` +
    `Rules: exactly 4 options per MCQ with one correct answer; cover different ` +
    `parts of the material; no extra commentary.\n\n` +
    `STUDY MATERIAL:\n${text}`
  );
}

/**
 * Summarize tracker subjects into a compact, prompt-ready object.
 * subjects: tracker subject array; todayISO: YYYY-MM-DD.
 */
export function summarizeTracker(subjects, todayISO) {
  const list = Array.isArray(subjects) ? subjects : [];
  return list.map((s) => {
    const cov = subjectCoverage(s);
    const weak = weakestTopics([s], todayISO, 3).map((w) => w.topicName);
    const topics = Array.isArray(s.topics) ? s.topics : [];
    return {
      name: String(s.name || "Untitled subject"),
      examDate: s.examDate || null,
      coveragePct: cov.percent === null ? null : cov.percent,
      topicsTotal: topics.length,
      topicsDone: topics.filter((t) => t.confidence === "done").length,
      weakestTopics: weak,
    };
  });
}

export function plannerPrompt(summary, { dailyMinutes, horizonDays } = {}) {
  const lines = summary.map((s) => {
    const cov = s.coveragePct === null ? "no topics yet" : `${s.coveragePct}% covered`;
    const weak = s.weakestTopics.length ? `weakest: ${s.weakestTopics.join("; ")}` : "no weak topics flagged";
    return `- ${s.name} (exam ${s.examDate || "no date set"}): ${cov}, ${s.topicsDone}/${s.topicsTotal} topics done, ${weak}`;
  });
  const mins = Number(dailyMinutes) || 120;
  const days = Number(horizonDays) || 14;
  return (
    `You are a study planner. Draft a concrete ${days}-day study plan as markdown ` +
    `(day headings, subjects, topics, and minutes per block). The student has ` +
    `${mins} minutes per day. Prioritize weakest topics and nearest exams. ` +
    `Keep it realistic: no day may exceed ${mins} minutes total. No commentary ` +
    `outside the plan.\n\nSUBJECTS:\n${lines.join("\n")}`
  );
}

export function noteActionPrompt(action, text) {
  const a = NOTE_ACTIONS.includes(action) ? action : "summarize";
  const verbs = {
    summarize: "Summarize the following note in clear bullet points, keeping all key facts.",
    expand: "Expand the following note with concrete examples and brief explanations of each concept.",
    simplify: "Rewrite the following note in simpler language a beginner could follow, without losing meaning.",
    keypoints: "Extract the key points from the following note as a short numbered list.",
  };
  return `${verbs[a]}\n\nOutput markdown only, no extra commentary.\n\nNOTE:\n${text}`;
}

/* ============================ output parsers ======================= */

/**
 * Tolerant flashcard parser. Accepts: JSON arrays, Q:/A: blocks,
 * Question:/Answer: or Front:/Back: labels, numbered "1. Q … A …" pairs,
 * or a naive first-line=front / rest=back fallback per blank-line block.
 * Returns [{front, back}]. Never throws on garbage · returns [].
 */
export function parseFlashcards(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const fromJson = tryParseJsonCards(text);
  if (fromJson) return fromJson;

  const cards = [];
  const blocks = text.split(/\n\s*\n/);
  for (const block of blocks) {
    const b = block.trim();
    if (!b) continue;
    const pair = parseCardBlock(b);
    if (pair) cards.push(pair);
    if (cards.length >= 100) break;
  }
  return cards;
}

function tryParseJsonCards(text) {
  let arr = null;
  try {
    const v = JSON.parse(text);
    arr = Array.isArray(v) ? v : v.cards || v.flashcards || null;
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const front = String(it.front ?? it.q ?? it.question ?? "").trim();
    const back = String(it.back ?? it.a ?? it.answer ?? "").trim();
    if (front && back) out.push({ front, back });
    if (out.length >= 100) break;
  }
  return out;
}

function parseCardBlock(b) {
  // Labeled pairs: Q:/Question:/Front: ... A:/Answer:/Back:
  const qm = b.match(/^(?:q|question|front)\s*[:\-]\s*(.+)$/im);
  const am = b.match(/^(?:a|answer|back)\s*[:\-]\s*(.+)$/im);
  if (qm && am) {
    const front = cleanInline(qm[1]);
    const back = cleanMultiline(b.slice(b.indexOf(am[0]) + am[0].length), am[1]);
    if (front && back) return { front, back };
  }
  // Numbered "1. <question>" followed by an A: line later in the block.
  const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
  const aIdx = lines.findIndex((l) => /^(?:a|answer|back)\s*[:\-]/i.test(l));
  if (aIdx > 0) {
    const front = cleanInline(lines.slice(0, aIdx).join(" ").replace(/^\d+[.)]\s*/, ""));
    const back = cleanInline(lines.slice(aIdx).join(" ").replace(/^(?:a|answer|back)\s*[:\-]\s*/i, ""));
    if (front && back) return { front, back };
  }
  // Fallback: first line = front, rest = back.
  if (lines.length >= 2) {
    const front = cleanInline(lines[0].replace(/^\d+[.)]\s*/, ""));
    const back = cleanInline(lines.slice(1).join(" "));
    if (front && back) return { front, back };
  }
  return null;
}

/**
 * Tolerant quiz parser. Accepts JSON arrays or numbered blocks:
 *   1. <question> [MCQ]      (tag optional)
 *   A. <opt>  B. <opt>  C. <opt>  D. <opt>
 *   Answer: <letter | text>
 *   Explanation: <text>
 * Returns [{type:'mcq'|'short', question, options, answerIndex|null,
 *            answerText, explanation}]. Never throws on garbage.
 */
export function parseQuiz(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const fromJson = tryParseJsonQuiz(text);
  if (fromJson) return fromJson;

  const questions = [];
  // Split on lines starting a new numbered question: "1. ", "2) ", etc.
  const blocks = text.split(/\n(?=\d{1,2}[.)]\s)/);
  for (const rawBlock of blocks) {
    const q = parseQuizBlock(rawBlock.trim());
    if (q) questions.push(q);
    if (questions.length >= 50) break;
  }
  return questions;
}

function tryParseJsonQuiz(text) {
  let arr = null;
  try {
    const v = JSON.parse(text);
    arr = Array.isArray(v) ? v : v.questions || v.quiz || null;
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const question = String(it.question ?? "").trim();
    if (!question) continue;
    const options = Array.isArray(it.options)
      ? it.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 4)
      : [];
    const type = it.type === "short" || options.length === 0 ? "short" : "mcq";
    let answerIndex = null;
    let answerText = String(it.answerText ?? it.answer ?? "").trim();
    if (type === "mcq") {
      const a = String(it.answer ?? "").trim().toUpperCase();
      const li = "ABCD".indexOf(a);
      if (li >= 0 && li < options.length) {
        answerIndex = li;
        answerText = options[li];
      } else {
        const oi = options.findIndex((o) => o.toLowerCase() === a.toLowerCase());
        if (oi >= 0) {
          answerIndex = oi;
          answerText = options[oi];
        }
      }
    }
    out.push({
      type,
      question,
      options,
      answerIndex,
      answerText,
      explanation: String(it.explanation ?? "").trim(),
    });
    if (out.length >= 50) break;
  }
  return out;
}

function parseQuizBlock(b) {
  if (!b) return null;
  const lines = b.split("\n").map((l) => l.trim());
  const first = lines[0].replace(/^\d{1,2}[.)]\s*/, "").trim();
  if (!first) return null;
  const tagM = first.match(/\[(mcq|short|multiple choice)\]\s*$/i);
  const question = (tagM ? first.slice(0, tagM.index) : first).trim();

  const options = [];
  let answerLine = "";
  let explanation = "";
  let explOn = false;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    const om = l.match(/^([A-Da-d])[.)]\s+(.+)$/);
    if (om && !explOn) {
      options.push(om[2].trim());
      continue;
    }
    const am = l.match(/^answer\s*[:\-]\s*(.*)$/i);
    if (am) {
      answerLine = am[1].trim();
      explOn = false;
      continue;
    }
    const em = l.match(/^explanation\s*[:\-]\s*(.*)$/i);
    if (em) {
      explanation = em[1].trim();
      explOn = true;
      continue;
    }
    if (explOn && l) explanation += " " + l;
  }

  const type =
    tagM && /short/i.test(tagM[1]) ? "short" : options.length >= 2 ? "mcq" : "short";
  let answerIndex = null;
  let answerText = answerLine;
  if (type === "mcq" && answerLine) {
    const li = "ABCD".indexOf(answerLine.toUpperCase().charAt(0));
    if (answerLine.length <= 2 && li >= 0 && li < options.length) {
      answerIndex = li;
      answerText = options[li];
    } else {
      const oi = options.findIndex((o) => o.toLowerCase() === answerLine.toLowerCase());
      if (oi >= 0) {
        answerIndex = oi;
        answerText = options[oi];
      }
    }
  }
  return {
    type,
    question,
    options: type === "mcq" ? options : [],
    answerIndex,
    answerText,
    explanation: explanation.trim(),
  };
}

/* ============================== quiz scoring ======================= */

function norm(s) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Score a taken quiz. answers: { [qIndex]: number|string }.
 * MCQ: exact option-index match. Short answer: lenient · normalized
 * equality or mutual containment (min 3 chars). Questions with no answer
 * key are unscorable (reported, not counted wrong).
 * Returns {score, total, scorable, details:[{index,type,correct,scorable,
 *           givenLabel,expectedLabel,explanation}]}.
 */
export function scoreQuiz(questions, answers) {
  const qs = Array.isArray(questions) ? questions : [];
  const ans = answers && typeof answers === "object" ? answers : {};
  const details = [];
  let score = 0;
  let scorable = 0;

  qs.forEach((q, i) => {
    const given = ans[i];
    const givenLabel =
      q.type === "mcq" && typeof given === "number" && q.options[given]
        ? `${"ABCD"[given]}. ${q.options[given]}`
        : given === undefined || given === null || given === ""
          ? "(no answer)"
          : String(given);
    const expectedLabel =
      q.type === "mcq" && q.answerIndex !== null && q.options[q.answerIndex]
        ? `${"ABCD"[q.answerIndex]}. ${q.options[q.answerIndex]}`
        : q.answerText || "(no answer key)";

    const hasKey =
      q.type === "mcq" ? q.answerIndex !== null : Boolean(norm(q.answerText));
    let correct = false;
    if (hasKey) {
      scorable++;
      if (q.type === "mcq") {
        correct = given === q.answerIndex;
      } else {
        const g = norm(given);
        const e = norm(q.answerText);
        correct = Boolean(g && e) && (g === e || (e.length >= 3 && (g.includes(e) || e.includes(g))));
      }
      if (correct) score++;
    }
    details.push({
      index: i,
      type: q.type,
      correct,
      scorable: hasKey,
      givenLabel,
      expectedLabel,
      explanation: q.explanation || "",
    });
  });

  return { score, total: qs.length, scorable, details };
}

/* ========================= planner input / handoff ================= */

/**
 * Validate planner inputs in plain language. Returns [errors]; [] = valid.
 */
export function validatePlannerInput({ subjects, dailyMinutes }) {
  const errors = [];
  const subs = Array.isArray(subjects) ? subjects.filter((s) => s && String(s.name || "").trim()) : [];
  if (!subs.length) errors.push("Add at least one subject with a name before generating a plan.");
  const mins = Number(dailyMinutes);
  if (!Number.isFinite(mins) || mins <= 0)
    errors.push("Set your daily study time to more than 0 minutes.");
  if (Number.isFinite(mins) && mins > 960)
    errors.push("Daily study time above 16 hours looks like a typo · please check it.");
  return errors;
}

/**
 * Convert a reviewed planner draft (structured inputs, NOT the AI's prose)
 * into a generateTimetable()-compatible input object for the
 * "Open in timetable generator" handoff. Throws plain-language errors.
 *
 * draft: {subjects:[{name, priority(1-3), examDate}], exams:[{name,date,subjectName}],
 *         dailyMinutes, sessionMin, startDate}
 */
export function plannerDraftToTimetable(draft) {
  const d = draft && typeof draft === "object" ? draft : {};
  const errors = validatePlannerInput(d);
  if (errors.length) throw new Error(errors[0]);

  const subjects = d.subjects
    .filter((s) => s && String(s.name || "").trim())
    .map((s, i) => ({
      id: `planner-s${i}`,
      name: String(s.name).trim().slice(0, 80),
      priority: [1, 2, 3].includes(Number(s.priority)) ? Number(s.priority) : 2,
    }));
  const byName = new Map(subjects.map((s) => [s.name.toLowerCase(), s.id]));
  const exams = (Array.isArray(d.exams) ? d.exams : [])
    .filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || "")))
    .map((e, i) => ({
      id: `planner-e${i}`,
      name: String(e.name || "").trim().slice(0, 80) || `Exam ${i + 1}`,
      date: e.date,
      subjectId: byName.get(String(e.subjectName || "").toLowerCase()) || null,
    }));

  return {
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(d.startDate || "")) ? d.startDate : undefined,
    dailyMinutes: Number(d.dailyMinutes),
    sessionMin: [25, 50, 90].includes(Number(d.sessionMin)) ? Number(d.sessionMin) : 50,
    breakMin: 10,
    dayStartMin: 960,
    restDays: [],
    subjects,
    exams,
  };
}

/* ===================== note-assistant apply modes ================== */

/**
 * Apply a note-assistant result. 'preview' NEVER mutates · it returns the
 * output for on-screen review only. 'replace'/'append' require the caller
 * (UI) to have obtained explicit user confirmation first.
 */
export function applyNoteAction(noteText, output, mode) {
  const src = String(noteText ?? "");
  const out = String(output ?? "");
  if (mode === "replace") return { text: out, mutated: true };
  if (mode === "append") return { text: src + (src && !src.endsWith("\n") ? "\n\n" : "") + out, mutated: true };
  return { preview: out, mutated: false }; // 'preview' and anything else
}

/* ============================ persistence ========================== */

async function readKvDoc(storage, key) {
  try {
    const rec = await storage.get("kv", key);
    return (rec && rec.value) || null;
  } catch {
    return null;
  }
}

async function writeKvDoc(storage, key, value) {
  await storage.put("kv", { key, value, updatedAt: new Date().toISOString() });
}

/** Deck: {id, name, createdAt, updatedAt, source:{kind,name}|null, cards:[{front,back,known}]} */
export async function listDecks(storage) {
  const doc = await readKvDoc(storage, KV_DECKS);
  return (doc && Array.isArray(doc.decks) ? doc.decks : []).slice().sort((a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
  );
}

export async function saveDeck(storage, deck) {
  if (!deck || typeof deck !== "object") throw new Error("Deck is missing.");
  const cards = (Array.isArray(deck.cards) ? deck.cards : [])
    .map((c) => ({ front: String(c.front || "").trim(), back: String(c.back || "").trim(), known: !!c.known }))
    .filter((c) => c.front && c.back)
    .slice(0, 500);
  if (!cards.length) throw new Error("A deck needs at least one card with a front and a back.");
  const now = new Date().toISOString();
  const record = {
    id: String(deck.id || uid("deck")),
    name: String(deck.name || "Untitled deck").trim().slice(0, 80) || "Untitled deck",
    createdAt: deck.createdAt || now,
    updatedAt: now,
    source: deck.source && deck.source.name ? { kind: deck.source.kind === "file" ? "file" : "note", name: String(deck.source.name).slice(0, 120) } : null,
    cards,
  };
  const decks = await listDecks(storage);
  const i = decks.findIndex((d) => d.id === record.id);
  if (i >= 0) decks[i] = record;
  else decks.push(record);
  await writeKvDoc(storage, KV_DECKS, { version: 1, decks });
  return record;
}

export async function deleteDeck(storage, id) {
  const decks = await listDecks(storage);
  const kept = decks.filter((d) => d.id !== id);
  await writeKvDoc(storage, KV_DECKS, { version: 1, decks: kept });
  return kept.length;
}

/** Attempt: {id, createdAt, title, score, total, scorable, details:[...]} */
export async function listAttempts(storage) {
  const doc = await readKvDoc(storage, KV_ATTEMPTS);
  return (doc && Array.isArray(doc.attempts) ? doc.attempts : []).slice().sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
}

export async function saveAttempt(storage, attempt) {
  if (!attempt || typeof attempt !== "object") throw new Error("Attempt is missing.");
  const now = new Date().toISOString();
  const record = {
    id: String(attempt.id || uid("attempt")),
    createdAt: attempt.createdAt || now,
    title: String(attempt.title || "Quiz").slice(0, 80),
    score: Number(attempt.score) || 0,
    total: Number(attempt.total) || 0,
    scorable: Number(attempt.scorable) || 0,
    details: Array.isArray(attempt.details) ? attempt.details.slice(0, 200) : [],
  };
  const attempts = await listAttempts(storage);
  attempts.push(record);
  await writeKvDoc(storage, KV_ATTEMPTS, { version: 1, attempts: attempts.slice(-200) });
  return record;
}

/* ================================ misc ============================= */

function cleanInline(s) {
  return String(s || "")
    .replace(/\*\*/g, "")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#+\s*/, "")
    .trim();
}

function cleanMultiline(tail, firstLine) {
  // Keep following lines until a new Q:/numbered item starts.
  const lines = String(tail || "").split("\n");
  const out = [firstLine];
  for (const l of lines) {
    if (/^(?:q|question|front)\s*[:\-]/i.test(l.trim())) break;
    if (/^\d{1,2}[.)]\s+\S/.test(l.trim()) && out.length > 1) break;
    out.push(l);
  }
  return cleanInline(out.join(" ").trim());
}
