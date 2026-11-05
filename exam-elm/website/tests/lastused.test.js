/**
 * ExamElm — last-used AI provider/model persistence tests.
 *
 * The module uses localStorage; Node has none, so a tiny in-memory mock
 * stands in. No real browser storage, no network. Run: node tests/run.js
 */
import { loadLastUsed, saveLastUsed, clearLastUsed } from "../assets/js/ai/lastused.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};

test("lastused: round-trips provider + model", () => {
  clearLastUsed();
  saveLastUsed("prv_openai", "gpt-4o-mini");
  assertEq(loadLastUsed(), { providerId: "prv_openai", model: "gpt-4o-mini" });
});

test("lastused: empty load returns null", () => {
  clearLastUsed();
  assertEq(loadLastUsed(), null);
});

test("lastused: corrupt stored JSON returns null, never throws", () => {
  store.set("sp:ai:lastUsed", "{not json");
  assertEq(loadLastUsed(), null);
  clearLastUsed();
});

test("lastused: model is capped at 120 chars", () => {
  saveLastUsed("prv_x", "m".repeat(500));
  assertEq(loadLastUsed().model.length, 120);
});

test("lastused: clear removes the entry", () => {
  saveLastUsed("prv_x", "model-y");
  clearLastUsed();
  assertEq(loadLastUsed(), null);
});
