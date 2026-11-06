/**
 * ExamElm — built-in free provider tests (2026-11-06).
 *
 * Covers: ExamElm builtin definition + seeding, no-key send path (no
 * Authorization header ever), free-only model rules, the proxy adapter,
 * and testConnection proving the proxy end to end. All provider I/O uses
 * injected mock fetch implementations. No real API calls, no real keys,
 * no network. The only key-shaped string here is the fake "sk-or-v1-test"
 * placeholder, used to prove the client never forwards a user key to
 * the proxy. Run: node tests/run.js
 */
import { openStorage } from "../assets/js/storage.js";
import {
  ExamElmProxyAdapter,
  adapterFor,
} from "../assets/js/ai/adapters.js";
import {
  ProviderStore,
  BUILTINS,
  builtinById,
  providerNeedsKey,
  isFreeModelId,
  examElmSeedConfig,
  EXAMELM_BUILTIN_ID,
  EXAMELM_CONFIG_ID,
  EXAMELM_DEFAULT_MODEL,
  EXAMELM_DISPLAY_MODEL,
  EXAMELM_FREE_HINT,
} from "../assets/js/ai/providers.js";
import { streamChat } from "../assets/js/ai/chat.js";
import {
  modelSuggestions,
  filterModelsForProvider,
  freeModelsOnly,
  usableProviders,
} from "../assets/js/ai/chatui.js";

const FAKE_KEY = "sk-or-v1-test";

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

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sseResponse(chunks, status = 200) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

/* ---------------- builtin definition ---------------- */

test("examelm: builtin is first, no-key, free default model", () => {
  assertEq(BUILTINS[0].id, EXAMELM_BUILTIN_ID, "ExamElm leads BUILTINS");
  assertEq(BUILTINS[0].type, "examelm-proxy");
  assertEq(BUILTINS[0].needsKey, false);
  assertEq(BUILTINS[0].label, "ExamElm");
  assertEq(EXAMELM_DEFAULT_MODEL, "nvidia/nemotron-3-ultra-550b-a55b:free");
  assertEq(EXAMELM_DISPLAY_MODEL, "Examelm AI");
  assertEq(EXAMELM_FREE_HINT, "Free · fair-use limits apply");
  assert(builtinById("examelm") !== null, "builtinById finds examelm");
  assert(isFreeModelId(EXAMELM_DEFAULT_MODEL), "default model is a :free id");
});

/* ---------------- seeding ---------------- */

test("examelm: ensureExamElmSeeded seeds one default config, first, idempotent", async () => {
  const { ps } = await freshStore();
  assertEq(ps.list().length, 0, "fresh store starts empty (load() never seeds)");
  const seed = await ps.ensureExamElmSeeded();
  assertEq(seed.id, EXAMELM_CONFIG_ID);
  assertEq(seed.name, "ExamElm");
  assertEq(seed.builtinId, EXAMELM_BUILTIN_ID);
  assertEq(seed.type, "examelm-proxy");
  assertEq(seed.defaultModel, EXAMELM_DEFAULT_MODEL);
  assertEq(seed.models, [EXAMELM_DEFAULT_MODEL]);
  assertEq(seed.isDefault, true, "only provider, so it is the default");
  assertEq(ps.list().length, 1);
  assertEq(ps.list()[0].id, EXAMELM_CONFIG_ID, "seed is first");
  assertEq(ps.getDefault().id, EXAMELM_CONFIG_ID);
  const again = await ps.ensureExamElmSeeded();
  assertEq(ps.list().length, 1, "second seed call adds nothing");
  assertEq(again.id, EXAMELM_CONFIG_ID);
});

test("examelm: seeding keeps existing providers and their default, moves ExamElm first", async () => {
  const { ps } = await freshStore();
  const other = await ps.add({
    name: "Mine",
    builtinId: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "x/y:free",
  });
  assertEq(other.isDefault, true, "first added provider was the default");
  await ps.ensureExamElmSeeded();
  assertEq(ps.list().length, 2);
  assertEq(ps.list()[0].id, EXAMELM_CONFIG_ID, "ExamElm leads the list");
  assertEq(ps.get(EXAMELM_CONFIG_ID).isDefault, false, "existing default is kept");
  assertEq(ps.getDefault().id, other.id, "getDefault still returns the existing default");
});

test("examelm: seeded config survives a reload (it is persisted)", async () => {
  const { storage } = await freshStore();
  const ps = new ProviderStore(storage);
  await ps.load();
  await ps.ensureExamElmSeeded();
  const ps2 = new ProviderStore(storage);
  await ps2.load();
  assertEq(ps2.list().length, 1);
  assertEq(ps2.list()[0].id, EXAMELM_CONFIG_ID, "seeded config reloads first");
  assertEq(ps2.getDefault().id, EXAMELM_CONFIG_ID);
});

test("examelm: examElmSeedConfig is a fresh object each call", () => {
  const a = examElmSeedConfig();
  const b = examElmSeedConfig();
  assert(a !== b && a.models !== b.models, "no shared mutable state");
  assertEq(a.defaultModel, EXAMELM_DEFAULT_MODEL);
});

/* ---------------- no-key rules ---------------- */

test("examelm: needsKey false, getKey returns empty string, setKey refused", async () => {
  const { ps } = await freshStore();
  await ps.ensureExamElmSeeded();
  assertEq(providerNeedsKey(ps.get(EXAMELM_CONFIG_ID)), false);
  assertEq(ps.needsKey(EXAMELM_CONFIG_ID), false);
  assertEq(ps.needsKey(ps.get(EXAMELM_CONFIG_ID)), false);
  assertEq(ps.getKey(EXAMELM_CONFIG_ID), "", "no key, no throw");
  assertEq(ps.hasKey(EXAMELM_CONFIG_ID), false, "hasKey stays false (no key stored)");
  await assertThrowsAsync(() => ps.setKey(EXAMELM_CONFIG_ID, FAKE_KEY), "needs no API key");
  assertEq(ps.hasKey(EXAMELM_CONFIG_ID), false, "refused setKey stores nothing");
});

test("examelm: add() refuses a hand-added ExamElm provider", async () => {
  const { ps } = await freshStore();
  await assertThrowsAsync(
    () => ps.add({ name: "E", builtinId: "examelm", baseUrl: "", defaultModel: EXAMELM_DEFAULT_MODEL }),
    "built in"
  );
});

test("examelm: usableProviders includes the seeded provider (models, no key needed)", async () => {
  const { ps } = await freshStore();
  await ps.ensureExamElmSeeded();
  const usable = usableProviders(ps.list());
  assertEq(usable.length, 1);
  assertEq(usable[0].id, EXAMELM_CONFIG_ID);
});

/* ---------------- free-only model rules ---------------- */

test("examelm: addModel/editModel/update reject non-free models, accept :free", async () => {
  const { ps } = await freshStore();
  await ps.ensureExamElmSeeded();
  await assertThrowsAsync(
    () => ps.addModel(EXAMELM_CONFIG_ID, "nvidia/nemotron-3-ultra-550b-a55b"),
    ":free"
  );
  await ps.addModel(EXAMELM_CONFIG_ID, "google/gemma-4-26b-a4b-it:free");
  assert(ps.get(EXAMELM_CONFIG_ID).models.includes("google/gemma-4-26b-a4b-it:free"), "free model added");
  await assertThrowsAsync(
    () => ps.editModel(EXAMELM_CONFIG_ID, "google/gemma-4-26b-a4b-it:free", "gpt-4o"),
    ":free"
  );
  await assertThrowsAsync(
    () => ps.update(EXAMELM_CONFIG_ID, { defaultModel: "gpt-4o" }),
    ":free"
  );
  assertEq(
    ps.get(EXAMELM_CONFIG_ID).defaultModel,
    EXAMELM_DEFAULT_MODEL,
    "refused update leaves the default untouched"
  );
  await assertThrowsAsync(
    () => ps.update(EXAMELM_CONFIG_ID, { models: [EXAMELM_DEFAULT_MODEL, "gpt-4o"] }),
    ":free"
  );
  assertEq(ps.get(EXAMELM_CONFIG_ID).models, [EXAMELM_DEFAULT_MODEL, "google/gemma-4-26b-a4b-it:free"]);
});

test("examelm: keyed providers are unaffected by the free-only rule", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({
    name: "OR",
    builtinId: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "gpt-4o",
  });
  await ps.addModel(c.id, "gpt-4o-mini");
  assertEq(ps.get(c.id).models, ["gpt-4o", "gpt-4o-mini"]);
});

/* ---------------- proxy adapter ---------------- */

test("examelm adapter: POSTs to same-origin /api/chat with NO Authorization header", () => {
  const a = new ExamElmProxyAdapter();
  assert(adapterFor("examelm-proxy") instanceof ExamElmProxyAdapter);
  const info = a.requestInfo(
    { id: EXAMELM_CONFIG_ID, builtinId: "examelm", type: "examelm-proxy", baseUrl: "", apiKey: FAKE_KEY },
    {
      messages: [{ role: "user", content: "hi" }],
      model: EXAMELM_DEFAULT_MODEL,
      maxTokens: 100,
      stream: true,
    }
  );
  assertEq(info.url, "/api/chat");
  assertEq(info.headers, { "Content-Type": "application/json" });
  assert(!("Authorization" in info.headers), "never sends an Authorization header");
  assert(!JSON.stringify(info).includes(FAKE_KEY), "a key in the config is never forwarded");
  assertEq(info.body, {
    model: EXAMELM_DEFAULT_MODEL,
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 100,
    stream: true,
    stream_options: { include_usage: true },
  });
  assertEq(a.listModelsRequest({}), null, "proxy has no list endpoint");
});

test("examelm adapter: error mapping (503 not-configured, 429 fair-use)", () => {
  const a = new ExamElmProxyAdapter();
  const notConfigured = a.mapHttpError(503, "");
  assertEq(notConfigured.code, "not-configured");
  assert(notConfigured.message.includes("not configured"), "503 says not configured");
  const limited = a.mapHttpError(429, "");
  assertEq(limited.code, "rate-limited");
  assert(limited.message.includes("fair-use"), "429 names the fair-use limit");
  const bad = a.mapHttpError(400, "only free models");
  assertEq(bad.code, "bad-request");
});

test("examelm: streamChat through the proxy streams tokens, no auth header sent", async () => {
  const seen = [];
  const mockFetch = async (url, opts) => {
    seen.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    return sseResponse([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  };
  const a = new ExamElmProxyAdapter();
  const tokens = [];
  const res = await streamChat({
    adapter: a,
    config: { id: EXAMELM_CONFIG_ID, builtinId: "examelm", type: "examelm-proxy", baseUrl: "" },
    messages: [{ role: "user", content: "hi" }],
    model: EXAMELM_DEFAULT_MODEL,
    maxTokens: 100,
    fetchImpl: mockFetch,
    onToken: (t) => tokens.push(t),
  });
  assertEq(res.text, "Hello");
  assertEq(tokens, ["Hello"]);
  assertEq(seen.length, 1);
  assertEq(seen[0].url, "/api/chat");
  assert(!("Authorization" in seen[0].headers), "streamChat sends no Authorization header");
  assertEq(seen[0].body.model, EXAMELM_DEFAULT_MODEL);
});

/* ---------------- testConnection proves the proxy ---------------- */

test("examelm: testConnection runs the tiny completion via /api/chat, keyVerified stays null", async () => {
  const { ps } = await freshStore();
  await ps.ensureExamElmSeeded();
  const seen = [];
  const mockFetch = async (url, opts) => {
    seen.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
    return jsonResponse({ choices: [{ message: { content: "ok" } }] });
  };
  const result = await ps.testConnection(EXAMELM_CONFIG_ID, mockFetch);
  assertEq(result.ok, true);
  assertEq(result.modelVerified, true, "tiny completion proves the model works");
  assertEq(result.keyVerified, null, "no key exists to verify, so null (never true/false)");
  assertEq(result.listUnavailable, true, "proxy has no list endpoint");
  assert(!result.message.includes("key verified"), "message never claims a key was verified");
  assertEq(seen.length, 1, "one tiny completion, no list call");
  assertEq(seen[0].url, "/api/chat");
  assert(!("Authorization" in seen[0].headers), "test completion sends no Authorization header");
  assertEq(seen[0].body.model, EXAMELM_DEFAULT_MODEL);
  assertEq(seen[0].body.max_tokens, 8, "proof completion is tiny");
  const stored = ps.get(EXAMELM_CONFIG_ID).lastTest;
  assertEq(stored.keyVerified, null, "persisted lastTest also carries null");
});

test("examelm: testConnection fails honestly when the proxy answers 503 (not configured)", async () => {
  const { ps } = await freshStore();
  await ps.ensureExamElmSeeded();
  const mockFetch = async () =>
    jsonResponse({ error: "ExamElm AI is not configured yet." }, 503);
  let threw = null;
  try {
    await ps.testConnection(EXAMELM_CONFIG_ID, mockFetch);
  } catch (e) {
    threw = e;
  }
  assert(threw !== null, "503 throws");
  assertEq(threw.code, "not-configured");
  assertEq(ps.get(EXAMELM_CONFIG_ID).lastTest.ok, false, "failure is persisted, no green badge");
});

test("examelm: discoverModels reports no list (count null) without throwing", async () => {
  const { ps } = await freshStore();
  await ps.ensureExamElmSeeded();
  const mockFetch = async () => jsonResponse({ choices: [{ message: { content: "ok" } }] });
  const r = await ps.discoverModels(EXAMELM_CONFIG_ID, mockFetch);
  assertEq(r.count, null);
  assertEq(r.models, []);
});

/* ---------------- free-only filtering (chatui) ---------------- */

test("examelm: modelSuggestions filters discovered cache to :free only", () => {
  const config = {
    id: EXAMELM_CONFIG_ID,
    builtinId: "examelm",
    defaultModel: EXAMELM_DEFAULT_MODEL,
    models: [EXAMELM_DEFAULT_MODEL],
    modelsCache: ["gpt-4o", "google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free"],
  };
  assertEq(freeModelsOnly(config), true);
  assertEq(modelSuggestions(config), [EXAMELM_DEFAULT_MODEL, "google/gemma-4-26b-a4b-it:free"]);
  assertEq(
    filterModelsForProvider(config, ["a:free", "b", "c:free"]),
    ["a:free", "c:free"]
  );
  assertEq(filterModelsForProvider(null, ["a", "b"]), ["a", "b"], "null config is unfiltered");
  const other = { builtinId: "openrouter", models: ["gpt-4o"], modelsCache: ["gpt-4o-mini"] };
  assertEq(freeModelsOnly(other), false);
  assertEq(modelSuggestions(other), ["gpt-4o", "gpt-4o-mini"], "keyed providers unfiltered");
});
