/**
 * ExamElm · AI provider fixes tests (Step 2, page controllers).
 *
 * Pure helpers only — the page controllers touch the DOM and cannot be
 * imported in node, so only chatui.js helpers are tested here.
 * formatTestResult is NOT tested here: it lives in the core library
 * (providers.js) and is covered by that worker's tests.
 */
import { modelForProviderChange, missingKeyMessage } from "../assets/js/ai/chatui.js";

const KEY_LOST = "lost when the page reloaded";
const GENERIC = "No API key is set for this provider.";

test("modelForProviderChange: carries nothing across providers", () => {
  assertEq(modelForProviderChange("gpt-4o-mini", "deepseek-chat"), "deepseek-chat");
});

test("modelForProviderChange: no new default gives a blank model", () => {
  assertEq(modelForProviderChange("gpt-4o-mini", ""), "");
  assertEq(modelForProviderChange("gpt-4o-mini", undefined), "");
  assertEq(modelForProviderChange("", null), "");
});

test("modelForProviderChange: same-model case still returns the new default", () => {
  assertEq(modelForProviderChange("deepseek-chat", "deepseek-chat"), "deepseek-chat");
});

test("modelForProviderChange: empty previous model takes the new default", () => {
  assertEq(modelForProviderChange("", "claude-sonnet-4-5"), "claude-sonnet-4-5");
});

test("missingKeyMessage: verified provider gets the key-lost text", () => {
  const m = missingKeyMessage({ hadVerified: true, wasLastUsed: false });
  assert(m.includes(KEY_LOST), "key-lost wording, got: " + m);
  assert(m.includes("encrypted storage"), "points at encrypted storage");
  assert(!m.includes(GENERIC), "not the generic text");
});

test("missingKeyMessage: last-used provider gets the key-lost text", () => {
  const m = missingKeyMessage({ hadVerified: false, wasLastUsed: true });
  assert(m.includes(KEY_LOST), "key-lost wording, got: " + m);
});

test("missingKeyMessage: neither verified nor last-used gets the generic text", () => {
  const m = missingKeyMessage({ hadVerified: false, wasLastUsed: false });
  assert(m.startsWith(GENERIC), "generic text, got: " + m);
  assert(!m.includes(KEY_LOST), "no key-lost claim without evidence");
});

test("missingKeyMessage: defaults to the generic text with no arguments", () => {
  assert(missingKeyMessage().startsWith(GENERIC));
  assert(missingKeyMessage({}).startsWith(GENERIC));
});

test("missingKeyMessage: never contains key material", () => {
  // The helper only takes booleans; even a caller that passes a key
  // alongside must never see it echoed back.
  const m = missingKeyMessage({ hadVerified: true, wasLastUsed: true, apiKey: "sk-test-12345" });
  assert(!m.includes("sk-test-12345"), "key material leaked into message");
  assert(!m.includes("sk-"), "no key-like fragment in message");
});
