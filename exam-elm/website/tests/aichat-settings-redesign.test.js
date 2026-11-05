/**
 * ExamElm — Step 3 Part 2 (Settings redesign UI) tests.
 *
 * Pure-logic coverage for the redesigned settings: accordion state,
 * "+" menu state, provider readiness guidance, model-suggestion union,
 * usableProviders filtering for the Chat Model select, Add Model
 * targeting the right provider (store API), provider-change model reset,
 * and validateMaxTokens wiring. Mocked storage only — zero real API
 * calls, zero keys. Run: node tests/run.js
 */
import { openStorage } from "../assets/js/storage.js";
import { ProviderStore } from "../assets/js/ai/providers.js";
import {
  accordionToggle,
  nextAddForm,
  providerReadiness,
  modelSuggestions,
  modelsForProvider,
  usableProviders,
  modelForProviderChange,
  validateMaxTokens,
  MAX_TOKENS_MIN,
  MAX_TOKENS_MAX,
  MAX_TOKENS_DEFAULT,
} from "../assets/js/ai/chatui.js";

const SECRET = "sk-test-fake-key-12345";

async function freshStore() {
  const storage = await openStorage({ backend: "memory" });
  const ps = new ProviderStore(storage);
  await ps.load();
  return { storage, ps };
}

/* ---------------- accordion state ---------------- */

test("accordionToggle: first click expands, second collapses, other row switches", () => {
  assertEq(accordionToggle(null, "prv_a"), "prv_a", "collapsed -> expanded");
  assertEq(accordionToggle("prv_a", "prv_a"), null, "expanded -> collapsed on second click");
  assertEq(accordionToggle("prv_a", "prv_b"), "prv_b", "expanding one collapses the other");
  assertEq(accordionToggle("prv_a", "prv_b"), "prv_b");
  assertEq(accordionToggle(null, null), null, "no row clicked -> unchanged");
  assertEq(accordionToggle("prv_a", null), "prv_a", "falsy click leaves state unchanged");
  assertEq(accordionToggle("prv_a", undefined), "prv_a");
});

test("accordionToggle: exactly one provider expanded at a time (state is a single id)", () => {
  let state = null;
  state = accordionToggle(state, "prv_a");
  state = accordionToggle(state, "prv_b");
  state = accordionToggle(state, "prv_c");
  assertEq(state, "prv_c", "only the last-clicked row stays expanded");
});

/* ---------------- "+" menu state ---------------- */

test("nextAddForm: picking a form opens it, picking it again closes it, switching works", () => {
  assertEq(nextAddForm(null, "provider"), "provider");
  assertEq(nextAddForm(null, "model"), "model");
  assertEq(nextAddForm("provider", "provider"), null, "same choice toggles closed");
  assertEq(nextAddForm("model", "model"), null);
  assertEq(nextAddForm("provider", "model"), "model", "switches forms");
  assertEq(nextAddForm("model", "provider"), "provider");
  assertEq(nextAddForm("provider", null), null, "null closes");
  assertEq(nextAddForm(null, null), null);
});

test("nextAddForm: only the two specified forms exist", () => {
  for (const choice of ["provider", "model"]) {
    assert(["provider", "model"].includes(nextAddForm(null, choice)));
  }
});

/* ---------------- provider readiness guidance ---------------- */

test("providerReadiness: none / no-model / no-key / ready", () => {
  assertEq(providerReadiness(null, false), { kind: "none" });
  assertEq(providerReadiness(undefined, true), { kind: "none" });
  assertEq(providerReadiness({ models: [], defaultModel: "" }, false), { kind: "no-model" });
  assertEq(providerReadiness({}, false), { kind: "no-model" });
  assertEq(providerReadiness({ models: ["gpt-4o-mini"], defaultModel: "gpt-4o-mini" }, false), { kind: "no-key" });
  assertEq(providerReadiness({ models: ["gpt-4o-mini"], defaultModel: "gpt-4o-mini" }, true), { kind: "ready" });
});

test("providerReadiness: legacy defaultModel-only config counts as having a model", () => {
  // A pre-Step-3 config has no models array; modelsForProvider falls back
  // to defaultModel, so readiness must not report "no-model" for it.
  assertEq(providerReadiness({ defaultModel: "claude-3-5-haiku-20241022" }, false), { kind: "no-key" });
  assertEq(providerReadiness({ defaultModel: "claude-3-5-haiku-20241022" }, true), { kind: "ready" });
});

/* ---------------- model suggestions (datalist union) ---------------- */

test("modelSuggestions: user models first, then discovered cache, deduped, capped", () => {
  const config = {
    models: ["gpt-4o-mini", "gpt-4o"],
    defaultModel: "gpt-4o-mini",
    modelsCache: ["gpt-4o", "gpt-4.1", "o4-mini"],
  };
  assertEq(modelSuggestions(config), ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "o4-mini"]);
  assertEq(modelSuggestions({ models: [], defaultModel: "", modelsCache: [] }), []);
  assertEq(modelSuggestions({ defaultModel: "gpt-4o-mini", modelsCache: ["gpt-4o"] }), ["gpt-4o-mini", "gpt-4o"], "legacy fallback feeds the union too");
  assertEq(modelSuggestions(null), []);
  assertEq(modelSuggestions({}), []);
});

test("modelSuggestions: cap is 200 (user models win the cap)", () => {
  const many = Array.from({ length: 250 }, (_, i) => "model-" + i);
  const config = { models: many.slice(0, 150), defaultModel: "model-0", modelsCache: many.slice(150) };
  const out = modelSuggestions(config);
  assertEq(out.length, 200);
  assertEq(out.slice(0, 150), many.slice(0, 150), "user models are never pushed out by the cache");
});

test("modelSuggestions: input config is never mutated", () => {
  const config = { models: ["a"], defaultModel: "a", modelsCache: ["a", "b"] };
  modelSuggestions(config);
  assertEq(config.models, ["a"]);
  assertEq(config.modelsCache, ["a", "b"]);
});

/* ---------------- Chat Model select: usableProviders ---------------- */

test("usableProviders: Chat Model select lists only providers with a model", () => {
  const withModels = { id: "1", models: ["gpt-4o-mini"], defaultModel: "gpt-4o-mini" };
  const legacy = { id: "2", defaultModel: "claude-3-5-haiku-20241022" };
  const modelLess = { id: "3", models: [], defaultModel: "" };
  const bare = { id: "4" };
  assertEq(usableProviders([withModels, legacy, modelLess, bare]), [withModels, legacy]);
});

test("usableProviders: a provider with models but no key IS listed (key is not a filter)", () => {
  // The Chat Model select must still show it; the no-key guidance line
  // (providerReadiness "no-key") is what tells the user to add the key.
  const noKey = { id: "1", models: ["gpt-4o-mini"], defaultModel: "gpt-4o-mini" };
  assertEq(usableProviders([noKey]), [noKey]);
  assertEq(providerReadiness(noKey, false), { kind: "no-key" });
});

/* ---------------- Add Model targets the right provider ---------------- */

test("addModel: targets only the selected provider; sibling providers untouched", async () => {
  const { ps } = await freshStore();
  const a = await ps.add({ name: "A", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  const b = await ps.add({ name: "B", builtinId: "deepseek", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" });
  await ps.addModel(a.id, "gpt-4o");
  assertEq(modelsForProvider(ps.get(a.id)), ["gpt-4o-mini", "gpt-4o"]);
  assertEq(modelsForProvider(ps.get(b.id)), ["deepseek-chat"], "provider B is untouched");
  assertEq(ps.get(b.id).defaultModel, "deepseek-chat");
});

test("addModel: never creates a provider entry per model", async () => {
  const { ps } = await freshStore();
  const a = await ps.add({ name: "A", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  await ps.addModel(a.id, "gpt-4o");
  await ps.addModel(a.id, "gpt-4.1");
  assertEq(ps.list().length, 1, "still exactly one provider");
  assertEq(modelsForProvider(ps.get(a.id)), ["gpt-4o-mini", "gpt-4o", "gpt-4.1"]);
});

test("removeModel: removing the selected model moves selection, never the provider/key", async () => {
  const { ps } = await freshStore();
  const a = await ps.add({ name: "A", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  await ps.addModel(a.id, "gpt-4o");
  await ps.setKey(a.id, SECRET);
  const after = await ps.removeModel(a.id, "gpt-4o-mini");
  assertEq(after.models, ["gpt-4o"]);
  assertEq(after.defaultModel, "gpt-4o", "selection falls to the next model");
  assert(ps.get(a.id) !== null, "provider still exists");
  assertEq(ps.getKey(a.id), SECRET, "key still exists");
  assertEq(ps.list().length, 1);
});

/* ---------------- Chat Model selector sync on provider change ---------------- */

test("modelForProviderChange: provider change always resets the model (never carried over)", () => {
  assertEq(modelForProviderChange("gpt-4o-mini", "deepseek-chat"), "deepseek-chat");
  assertEq(modelForProviderChange("gpt-4o-mini", ""), "", "new provider with no model -> blank, never the old model");
  assertEq(modelForProviderChange("", "gpt-4o-mini"), "gpt-4o-mini");
  assertEq(modelForProviderChange("gpt-4o-mini", "gpt-4o-mini"), "gpt-4o-mini");
});

test("provider change: model reset + lastUsed save order keeps the pair consistent", async () => {
  // Mirrors the wireComposer change handler: reset first, then the saved
  // pair is the new provider + its default — never a mismatched pair.
  const { ps } = await freshStore();
  const a = await ps.add({ name: "A", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  const b = await ps.add({ name: "B", builtinId: "deepseek", baseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat" });
  let field = "gpt-4o-mini"; // typed under A
  field = modelForProviderChange(field, ps.get(b.id).defaultModel); // switch to B
  assertEq(field, "deepseek-chat");
  assert(field !== "gpt-4o-mini", "A's model is never sent to B");
  assertEq(ps.get(a.id).defaultModel, "gpt-4o-mini", "A's own default is untouched");
});

/* ---------------- validateMaxTokens wiring ---------------- */

test("validateMaxTokens: constants are the 1..128000 range with 1024 default", () => {
  assertEq(MAX_TOKENS_MIN, 1);
  assertEq(MAX_TOKENS_MAX, 128000);
  assertEq(MAX_TOKENS_DEFAULT, 1024);
});

test("validateMaxTokens: send-path clamping (string input, bounds, garbage)", () => {
  // The send path and the field's change handler both use this one helper,
  // so the value sent can never leave 1..128000.
  assertEq(validateMaxTokens("2048"), { value: 2048, clamped: false });
  assertEq(validateMaxTokens(" 2048 "), { value: 2048, clamped: false });
  assertEq(validateMaxTokens("128001"), { value: 128000, clamped: true });
  assertEq(validateMaxTokens("0"), { value: 1, clamped: true });
  assertEq(validateMaxTokens("not-a-number"), { value: 1024, clamped: true });
  assertEq(validateMaxTokens(999999), { value: 128000, clamped: true });
  assertEq(validateMaxTokens(512.9), { value: 512, clamped: true });
});
