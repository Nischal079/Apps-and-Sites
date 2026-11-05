/**
 * ExamElm — Step 3 Part 1 (data model) tests.
 *
 * Per-provider user-managed multi-model lists in ProviderStore, plus the
 * pure chatui.js helpers (modelsForProvider, usableProviders,
 * validateMaxTokens). Mocked storage only, zero real API calls, zero keys.
 * Run: node tests/run.js
 */
import { openStorage } from "../assets/js/storage.js";
import { ProviderStore } from "../assets/js/ai/providers.js";
import {
  modelsForProvider,
  usableProviders,
  validateMaxTokens,
} from "../assets/js/ai/chatui.js";

const SECRET = "sk-test-fake-key-12345";
const LONG_ID = "m".repeat(121);

async function freshStore() {
  const storage = await openStorage({ backend: "memory" });
  const ps = new ProviderStore(storage);
  await ps.load();
  return { storage, ps };
}

function assertThrowsAsync(fn, needle) {
  return fn().then(
    () => {
      throw new Error("assertThrowsAsync: did not throw");
    },
    (e) => {
      if (needle && !String(e.message).includes(needle))
        throw new Error(`message "${e.message}" lacks "${needle}"`);
    }
  );
}

/* Seed a raw (legacy-shaped) persisted row, bypassing add(), then reload. */
async function seedLegacyRow(storage, row) {
  await storage.put("kv", { key: "ai_providers", value: [row] });
}

const legacyRow = (over = {}) => ({
  id: "prv_legacy",
  name: "Legacy",
  builtinId: "openai",
  type: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  defaultModel: "gpt-4o-mini",
  modelsCache: [],
  modelsCachedAt: null,
  lastTest: null,
  isDefault: true,
  updatedAt: new Date().toISOString(),
  ...over,
});

/* ---------------- migration in load() ---------------- */

test("migration: legacy config (defaultModel only) -> models=[defaultModel]", async () => {
  const { storage, ps } = await freshStore();
  await seedLegacyRow(storage, legacyRow());
  const loaded = await ps.load();
  assertEq(loaded.length, 1);
  assertEq(loaded[0].models, ["gpt-4o-mini"]);
  assertEq(loaded[0].defaultModel, "gpt-4o-mini");
  // No forced save in load(): the raw row still has no models field.
  const raw = await storage.get("kv", "ai_providers");
  assert(!("models" in raw.value[0]), "load() must not force an immediate save");
  // Persisted on next save.
  await ps.save();
  const raw2 = await storage.get("kv", "ai_providers");
  assertEq(raw2.value[0].models, ["gpt-4o-mini"]);
});

test("migration: no models and no defaultModel -> models=[]", async () => {
  const { storage, ps } = await freshStore();
  await seedLegacyRow(storage, legacyRow({ defaultModel: "" }));
  const loaded = await ps.load();
  assertEq(loaded[0].models, []);
  assertEq(loaded[0].defaultModel, "");
});

test("migration: models already present are untouched (default in list)", async () => {
  const { storage, ps } = await freshStore();
  await seedLegacyRow(storage, legacyRow({ models: ["gpt-4o-mini", "gpt-4o"], defaultModel: "gpt-4o-mini" }));
  const loaded = await ps.load();
  assertEq(loaded[0].models, ["gpt-4o-mini", "gpt-4o"]);
  assertEq(loaded[0].defaultModel, "gpt-4o-mini");
});

test("migration: defaultModel missing from models is prepended", async () => {
  const { storage, ps } = await freshStore();
  await seedLegacyRow(storage, legacyRow({ models: ["gpt-4o"], defaultModel: "gpt-4o-mini" }));
  const loaded = await ps.load();
  assertEq(loaded[0].models, ["gpt-4o-mini", "gpt-4o"]);
});

test("migration: empty defaultModel with models -> defaultModel=models[0]", async () => {
  const { storage, ps } = await freshStore();
  await seedLegacyRow(storage, legacyRow({ models: ["gpt-4o", "gpt-4o-mini"], defaultModel: "" }));
  const loaded = await ps.load();
  assertEq(loaded[0].models, ["gpt-4o", "gpt-4o-mini"]);
  assertEq(loaded[0].defaultModel, "gpt-4o");
});

/* ---------------- add() ---------------- */

test("add(): new config gets models=[defaultModel], or [] without one", async () => {
  const { ps } = await freshStore();
  const withModel = await ps.add({ name: "a", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  assertEq(withModel.models, ["gpt-4o-mini"]);
  const without = await ps.add({ name: "b", builtinId: "deepseek", baseUrl: "https://api.deepseek.com/v1" });
  assertEq(without.models, []);
  assertEq(without.defaultModel, "");
});

/* ---------------- addModel ---------------- */

test("addModel: first model becomes default; appends after that", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  const afterFirst = await ps.addModel(c.id, "  gpt-4o-mini  ");
  assertEq(afterFirst.models, ["gpt-4o-mini"], "trims the id");
  assertEq(afterFirst.defaultModel, "gpt-4o-mini", "first model becomes default");
  const afterSecond = await ps.addModel(c.id, "gpt-4o");
  assertEq(afterSecond.models, ["gpt-4o-mini", "gpt-4o"]);
  assertEq(afterSecond.defaultModel, "gpt-4o-mini", "default does not move");
});

test("addModel: exact-match dedupe (case-sensitive)", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  const dup = await ps.addModel(c.id, "gpt-4o-mini");
  assertEq(dup.models, ["gpt-4o-mini"], "duplicate is not added twice");
  const cased = await ps.addModel(c.id, "GPT-4o-mini");
  assertEq(cased.models, ["gpt-4o-mini", "GPT-4o-mini"], "different case is a different id");
});

test("addModel: validation errors + unknown provider", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  await assertThrowsAsync(() => ps.addModel(c.id, ""), "empty");
  await assertThrowsAsync(() => ps.addModel(c.id, "   "), "empty");
  await assertThrowsAsync(() => ps.addModel(c.id, LONG_ID), "120");
  await assertThrowsAsync(() => ps.addModel("prv_nope", "gpt-4o-mini"), "Provider not found");
});

/* ---------------- editModel ---------------- */

test("editModel: rename in place; defaultModel follows the rename", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  await ps.addModel(c.id, "gpt-4o");
  const renamed = await ps.editModel(c.id, "gpt-4o-mini", "gpt-6-luna");
  assertEq(renamed.models, ["gpt-6-luna", "gpt-4o"], "order preserved");
  assertEq(renamed.defaultModel, "gpt-6-luna", "default follows the rename");
  const renamedOther = await ps.editModel(c.id, "gpt-4o", "gpt-4.1");
  assertEq(renamedOther.models, ["gpt-6-luna", "gpt-4.1"]);
  assertEq(renamedOther.defaultModel, "gpt-6-luna", "default untouched when another model is renamed");
});

test("editModel: duplicate target rejected; unknown model/provider rejected", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  await ps.addModel(c.id, "gpt-4o");
  await assertThrowsAsync(() => ps.editModel(c.id, "gpt-4o", "gpt-4o-mini"), "already exists");
  await assertThrowsAsync(() => ps.editModel(c.id, "gpt-4o", ""), "empty");
  await assertThrowsAsync(() => ps.editModel(c.id, "gpt-4o", LONG_ID), "120");
  await assertThrowsAsync(() => ps.editModel(c.id, "no-such-model", "x"), "Model not found");
  await assertThrowsAsync(() => ps.editModel("prv_nope", "gpt-4o", "x"), "Provider not found");
  assertEq(ps.get(c.id).models, ["gpt-4o-mini", "gpt-4o"], "failed edits leave the list unchanged");
});

/* ---------------- removeModel ---------------- */

test("removeModel: removes from list; default falls to next; provider + key untouched", async () => {
  const { storage, ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  await ps.addModel(c.id, "gpt-4o");
  ps.setKey(c.id, SECRET);
  await ps.persistEncrypted("test-passphrase");
  const after = await ps.removeModel(c.id, "gpt-4o-mini");
  assertEq(after.models, ["gpt-4o"]);
  assertEq(after.defaultModel, "gpt-4o", "default falls to the next model");
  // The provider config, its memory key and its encrypted copy all survive.
  assert(ps.get(c.id) !== null, "provider config still exists");
  assertEq(ps.getKey(c.id), SECRET, "memory key still exists");
  const enc = await storage.get("kv", "ai_keys_enc");
  assert(enc && enc.value && enc.value.items && enc.value.items[c.id], "encrypted copy still exists");
  const last = await ps.removeModel(c.id, "gpt-4o");
  assertEq(last.models, []);
  assertEq(last.defaultModel, "", "no models left -> no default");
  assert(ps.get(c.id) !== null, "provider still exists after its last model is removed");
  assertEq(ps.getKey(c.id), SECRET, "key still exists after its last model is removed");
});

test("removeModel: unknown model/provider rejected", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  await assertThrowsAsync(() => ps.removeModel(c.id, "no-such-model"), "Model not found");
  await assertThrowsAsync(() => ps.removeModel("prv_nope", "gpt-4o-mini"), "Provider not found");
});

/* ---------------- update() with models patch ---------------- */

test("update(): models patch enforces the invariant + invalidates lastTest", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  await ps.update(c.id, { lastTest: { ok: true, models: 2, at: Date.now() } });
  assert(ps.get(c.id).lastTest && ps.get(c.id).lastTest.ok === true);
  const updated = await ps.update(c.id, { models: ["gpt-4o", "gpt-4.1"] });
  // defaultModel was not in the new list, so it is appended (update rule).
  assertEq(updated.models, ["gpt-4o", "gpt-4.1", "gpt-4o-mini"]);
  assertEq(updated.defaultModel, "gpt-4o-mini");
  assertEq(updated.lastTest, null, "models list change invalidates lastTest");
});

test("update(): models patch with a fresh lastTest keeps it; empty default falls to models[0]", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  const fresh = { ok: true, models: 1, at: Date.now() };
  const updated = await ps.update(c.id, { models: ["gpt-4o"], lastTest: fresh });
  assertEq(updated.models, ["gpt-4o"]);
  assertEq(updated.defaultModel, "gpt-4o", "empty default falls to models[0]");
  assertEq(updated.lastTest, fresh, "a patch carrying a fresh lastTest wins");
});

test("update(): defaultModel patch appends it to models; unchanged models keep lastTest", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  await ps.update(c.id, { lastTest: { ok: true, models: 1, at: Date.now() } });
  const same = await ps.update(c.id, { models: ["gpt-4o-mini"] });
  assertEq(same.models, ["gpt-4o-mini"]);
  assert(same.lastTest !== null, "an unchanged models list does not invalidate lastTest");
  const changed = await ps.update(c.id, { defaultModel: "gpt-4o" });
  assertEq(changed.models, ["gpt-4o-mini", "gpt-4o"], "new default appended to models");
  assertEq(changed.defaultModel, "gpt-4o");
  assertEq(changed.lastTest, null, "defaultModel change invalidates lastTest");
});

/* ---------------- persistence hygiene ---------------- */

test("publicConfig includes models and save() still refuses key material", async () => {
  const { storage, ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini" });
  await ps.addModel(c.id, "gpt-4o");
  ps.setKey(c.id, SECRET);
  await ps.save();
  const raw = await storage.get("kv", "ai_providers");
  const dumped = JSON.stringify(raw);
  assert(!dumped.includes(SECRET), "key material leaked into persisted configs");
  assert(!dumped.includes("apiKey"), "no apiKey field persisted");
  assertEq(raw.value[0].models, ["gpt-4o-mini", "gpt-4o"]);
  // Reload round-trip keeps the list.
  const ps2 = new ProviderStore(storage);
  const reloaded = await ps2.load();
  assertEq(reloaded[0].models, ["gpt-4o-mini", "gpt-4o"]);
  assertEq(reloaded[0].defaultModel, "gpt-4o-mini");
});

/* ---------------- chatui.js pure helpers ---------------- */

test("modelsForProvider: list, default fallback, empty, dedupe, no mutation", () => {
  assertEq(modelsForProvider({ models: ["a", "b"], defaultModel: "a" }), ["a", "b"]);
  assertEq(modelsForProvider({ models: ["a", "b", "a"], defaultModel: "a" }), ["a", "b"], "deduped, order preserved");
  assertEq(modelsForProvider({ defaultModel: "gpt-4o-mini" }), ["gpt-4o-mini"], "legacy config falls back to defaultModel");
  assertEq(modelsForProvider({ models: [], defaultModel: "gpt-4o-mini" }), ["gpt-4o-mini"], "empty list falls back to defaultModel");
  assertEq(modelsForProvider({ models: [], defaultModel: "" }), []);
  assertEq(modelsForProvider({}), []);
  assertEq(modelsForProvider(null), []);
  const cfg = { models: ["a", "b", "a"], defaultModel: "a" };
  modelsForProvider(cfg);
  assertEq(cfg.models, ["a", "b", "a"], "input config is never mutated");
});

test("usableProviders: only configs with at least one model; key status is not a filter", () => {
  const withModels = { id: "1", models: ["gpt-4o-mini"], defaultModel: "gpt-4o-mini" };
  const legacyWithDefault = { id: "2", defaultModel: "claude-3-5-haiku-20241022" };
  const noModels = { id: "3", models: [], defaultModel: "" };
  const empty = { id: "4" };
  assertEq(usableProviders([withModels, legacyWithDefault, noModels, empty]), [withModels, legacyWithDefault]);
  // A provider with models but no key is still listed (no-key guidance
  // is the UI's job, not this filter's).
  assertEq(usableProviders([withModels]).length, 1);
  assertEq(usableProviders([]), []);
  assertEq(usableProviders(null), []);
});

test("validateMaxTokens: clamping, defaults, integer handling", () => {
  assertEq(validateMaxTokens(1024), { value: 1024, clamped: false });
  assertEq(validateMaxTokens("2048"), { value: 2048, clamped: false });
  assertEq(validateMaxTokens(0), { value: 1, clamped: true });
  assertEq(validateMaxTokens(-50), { value: 1, clamped: true });
  assertEq(validateMaxTokens(200000), { value: 128000, clamped: true });
  assertEq(validateMaxTokens(128000), { value: 128000, clamped: false });
  assertEq(validateMaxTokens(1), { value: 1, clamped: false });
  assertEq(validateMaxTokens(100.7), { value: 100, clamped: true });
  assertEq(validateMaxTokens("abc"), { value: 1024, clamped: true });
  assertEq(validateMaxTokens(""), { value: 1024, clamped: true });
  assertEq(validateMaxTokens(null), { value: 1024, clamped: true });
  assertEq(validateMaxTokens(undefined), { value: 1024, clamped: true });
  assertEq(validateMaxTokens(NaN), { value: 1024, clamped: true });
});
