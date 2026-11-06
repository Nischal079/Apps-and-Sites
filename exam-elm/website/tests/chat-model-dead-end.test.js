/**
 * Chat Model dead-end fix tests (2026-11-06).
 *
 * The owner reported the AI Chat Settings "Chat model" section with an
 * EMPTY provider dropdown, the model field still showing a model id, and
 * the guidance "None of your providers has a model yet." Root cause,
 * reproduced here first: every stored provider was model-less
 * (models: [] and defaultModel: ""), which happens when the last model
 * of a provider is removed — removeModel() allowed it, and
 * ensureExamElmSeeded() returned an existing model-less ExamElm config
 * as-is instead of repairing it. The stale lastUsed model was then
 * applied to the field even though its provider was gone.
 *
 * Covers: the dead-end state itself, the seed repair, the last-model
 * removal guard, the Add Model escape hatch, and the shared
 * resolveLastUsedRestore() helper. Store-level only (the page controllers
 * are DOM code); the UI wiring is verified by code inspection against
 * these store/pure contracts. No real API calls, no real keys, no network.
 * Run: node tests/run.js
 */
import { openStorage } from "../assets/js/storage.js";
import {
  ProviderStore,
  EXAMELM_CONFIG_ID,
  EXAMELM_DEFAULT_MODEL,
} from "../assets/js/ai/providers.js";
import {
  usableProviders,
  providerReadiness,
  resolveLastUsedRestore,
} from "../assets/js/ai/chatui.js";

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

/** The owner's broken state: ExamElm + OpenRouter, both model-less. */
async function brokenStore() {
  const { ps } = await freshStore();
  await ps.ensureExamElmSeeded();
  // ExamElm lost its only model (the Models list Remove button allowed it).
  await ps.update(EXAMELM_CONFIG_ID, { models: [], defaultModel: "" });
  // OpenRouter was added without a model (blank "Default model ID").
  const openrouter = await ps.add({
    name: "OpenRouter",
    builtinId: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
  });
  return { ps, openrouter };
}

/* ---------------- the dead end, reproduced ---------------- */

test("dead end: all providers model-less -> empty usable list, 'none' guidance", async () => {
  const { ps } = await brokenStore();
  assertEq(usableProviders(ps.list()), [], "no usable provider");
  // updateChatGuidance() reads providerReadiness(null, false) when the
  // select is empty: kind "none" with configs present is the screenshot's
  // "None of your providers has a model yet." message.
  assertEq(providerReadiness(null, false).kind, "none");
  assertEq(ps.list().length, 2, "providers still exist in storage");
});

/* ---------------- seed repair ---------------- */

test("ensureExamElmSeeded repairs a model-less ExamElm and makes it usable", async () => {
  const { ps } = await brokenStore();
  const repaired = await ps.ensureExamElmSeeded();
  assertEq(repaired.models, [EXAMELM_DEFAULT_MODEL]);
  assertEq(repaired.defaultModel, EXAMELM_DEFAULT_MODEL);
  assertEq(
    usableProviders(ps.list()).map((c) => c.id),
    [EXAMELM_CONFIG_ID],
    "ExamElm usable again; OpenRouter still model-less"
  );
  // Repair persists: a fresh store over the same storage sees it.
  const ps2 = new ProviderStore(ps.storage);
  await ps2.load();
  assertEq(ps2.get(EXAMELM_CONFIG_ID).models, [EXAMELM_DEFAULT_MODEL]);
});

test("ensureExamElmSeeded does not clobber a healthy ExamElm", async () => {
  const { ps } = await freshStore();
  await ps.ensureExamElmSeeded();
  await ps.addModel(EXAMELM_CONFIG_ID, "meta-llama/llama-3.1-8b-instruct:free");
  const again = await ps.ensureExamElmSeeded();
  assertEq(again.models, [
    EXAMELM_DEFAULT_MODEL,
    "meta-llama/llama-3.1-8b-instruct:free",
  ]);
  assertEq(again.defaultModel, EXAMELM_DEFAULT_MODEL);
});

test("ensureExamElmSeeded repair is idempotent", async () => {
  const { ps } = await brokenStore();
  await ps.ensureExamElmSeeded();
  const again = await ps.ensureExamElmSeeded();
  assertEq(again.models, [EXAMELM_DEFAULT_MODEL]);
  assertEq(usableProviders(ps.list()).length, 1);
});

/* ---------------- last-model removal guard ---------------- */

test("removeModel refuses the last model (ExamElm and other providers)", async () => {
  const { ps } = await freshStore();
  await ps.ensureExamElmSeeded();
  await assertThrowsAsync(
    () => ps.removeModel(EXAMELM_CONFIG_ID, EXAMELM_DEFAULT_MODEL),
    "only model"
  );
  assertEq(ps.get(EXAMELM_CONFIG_ID).models, [EXAMELM_DEFAULT_MODEL], "unchanged");
  const other = await ps.add({
    name: "OpenRouter",
    builtinId: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "moonshotai/kimi-k3.1-pro",
  });
  await assertThrowsAsync(
    () => ps.removeModel(other.id, "moonshotai/kimi-k3.1-pro"),
    "only model"
  );
  assertEq(ps.get(other.id).models, ["moonshotai/kimi-k3.1-pro"], "unchanged");
});

test("removeModel still works when more than one model remains", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({
    name: "OpenRouter",
    builtinId: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "moonshotai/kimi-k3.1-pro",
  });
  await ps.addModel(c.id, "nvidia/nemotron-3-ultra-550b-a55b:free");
  const after = await ps.removeModel(c.id, "moonshotai/kimi-k3.1-pro");
  assertEq(after.models, ["nvidia/nemotron-3-ultra-550b-a55b:free"]);
  assertEq(after.defaultModel, "nvidia/nemotron-3-ultra-550b-a55b:free");
  await assertThrowsAsync(
    () => ps.removeModel(c.id, "nvidia/nemotron-3-ultra-550b-a55b:free"),
    "only model"
  );
});

test("removeModel refuses the legacy shape (models [] with a defaultModel)", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({
    name: "OpenRouter",
    builtinId: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "moonshotai/kimi-k3.1-pro",
  });
  // Legacy stored shape: the model lives only in defaultModel.
  ps.get(c.id).models = [];
  await assertThrowsAsync(
    () => ps.removeModel(c.id, "moonshotai/kimi-k3.1-pro"),
    "only model"
  );
});

/* ---------------- the escape hatch ---------------- */

test("escape hatch: Add Model on a model-less provider makes it usable again", async () => {
  const { ps, openrouter } = await brokenStore();
  // What the guidance "Add a model" button opens: the Add Model form's
  // provider picker lists ALL configs (ExamElm first), and addModel()
  // restores usability — the Chat Model dropdown repopulates on the
  // next renderChatSelectors().
  const after = await ps.addModel(openrouter.id, "moonshotai/kimi-k3.1-pro");
  assertEq(after.models, ["moonshotai/kimi-k3.1-pro"]);
  assertEq(after.defaultModel, "moonshotai/kimi-k3.1-pro");
  assertEq(
    usableProviders(ps.list()).map((c) => c.id),
    [openrouter.id],
    "OpenRouter usable again"
  );
});

/* ---------------- restore helper ---------------- */

test("resolveLastUsedRestore: stale provider falls back to the default's model, never the stale model", () => {
  const usable = [
    { id: EXAMELM_CONFIG_ID, isDefault: true, defaultModel: EXAMELM_DEFAULT_MODEL },
    { id: "prv_openrouter", isDefault: false, defaultModel: "moonshotai/kimi-k3.1-pro" },
  ];
  // The screenshot's pair: lastUsed names a provider that is no longer
  // usable, with the ExamElm default model id as its stale model.
  const stale = { providerId: "prv_gone", model: EXAMELM_DEFAULT_MODEL };
  assertEq(resolveLastUsedRestore(usable, stale), {
    providerId: EXAMELM_CONFIG_ID,
    model: EXAMELM_DEFAULT_MODEL,
  });
  // A usable saved provider still restores its own saved model.
  assertEq(
    resolveLastUsedRestore(usable, { providerId: "prv_openrouter", model: "moonshotai/kimi-k3.1-pro" }),
    { providerId: "prv_openrouter", model: "moonshotai/kimi-k3.1-pro" }
  );
  // Nothing saved: the default provider's default model (never blank).
  assertEq(resolveLastUsedRestore(usable, null), {
    providerId: EXAMELM_CONFIG_ID,
    model: EXAMELM_DEFAULT_MODEL,
  });
  // Nothing usable: null (the field is cleared, not left stale).
  assertEq(resolveLastUsedRestore([], { providerId: "prv_gone", model: "x" }), null);
  assertEq(resolveLastUsedRestore([], null), null);
});
