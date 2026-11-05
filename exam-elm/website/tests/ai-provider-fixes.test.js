/**
 * StudyPilot, Step 2 provider-connection fixes (RC-2, RC-3, RC-5, RC-8,
 * RC-9, RC-10).
 *
 * All provider I/O uses injected mock fetch implementations. No real API
 * calls, no real keys, no network. Run: node tests/run.js
 */
import { openStorage } from "../assets/js/storage.js";
import { AIError, OpenAICompatibleAdapter } from "../assets/js/ai/adapters.js";
import { ProviderStore, BUILTINS, builtinById, formatTestResult } from "../assets/js/ai/providers.js";
import { streamChat, completeOnce } from "../assets/js/ai/chat.js";

const SECRET = "sk-test-fake-key-12345";
const cfg = (over = {}) => ({
  id: "prv_x",
  name: "Test",
  type: "openai-compatible",
  baseUrl: "https://example.com/v1/",
  apiKey: SECRET,
  ...over,
});

async function freshStore() {
  const storage = await openStorage({ backend: "memory" });
  const ps = new ProviderStore(storage);
  await ps.load();
  return { storage, ps };
}

async function addProvider(ps, over = {}) {
  const c = await ps.add({
    name: "t",
    builtinId: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    ...over,
  });
  await ps.setKey(c.id, SECRET);
  return c;
}

function jsonResponse(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function sseResponse(chunks, status = 200, headers = {}) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "content-type": "text/event-stream", ...headers },
  });
}

function assertThrowsAsync(fn, needle) {
  return fn().then(
    () => {
      throw new Error("assertThrowsAsync: did not throw");
    },
    (e) => {
      if (needle && !String(e.message).includes(needle))
        throw new Error(`message "${e.message}" lacks "${needle}"`);
      return e;
    }
  );
}

/* ---------------- RC-10: OpenAI CORS note ---------------- */

test("RC-10: OpenAI cors is supported, note cites the 2026-11-05 probes", () => {
  const openai = builtinById("openai");
  assertEq(openai.cors, "supported");
  assert(openai.corsNote.includes("2026-11-05"), "note must cite the probe date");
  assert(openai.corsNote.includes("allows direct browser requests"), "note must state the probe result");
  assert(openai.corsNote.includes("real-browser confirmation is still pending"), "note must stay honest about pending confirmation");
  assert(!openai.corsNote.includes("—"), "no em dashes in user-visible text");
  assert(!/blocked/.test(openai.corsNote), "note must not claim a block");
  // DeepSeek / Gemini stay unverified: their authenticated responses are unprobed.
  assertEq(builtinById("deepseek").cors, "unverified");
  assertEq(builtinById("gemini").cors, "unverified");
  for (const b of BUILTINS) assert(!b.corsNote.includes("—"), b.id + " corsNote must not contain an em dash");
});

/* ---------------- RC-3: testConnection model validation ---------------- */

test("RC-3: testConnection verifies a listed model", async () => {
  const { ps } = await freshStore();
  const c = await addProvider(ps);
  const fakeFetch = async () =>
    jsonResponse({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] });
  const r = await ps.testConnection(c.id, fakeFetch);
  assertEq(r.ok, true);
  assertEq(r.models, 2);
  assertEq(r.modelVerified, true);
  assertEq(r.listUnavailable, false);
  assertEq(r.model, "gpt-4o-mini");
  assert(r.message.includes("gpt-4o-mini verified"), "message must name the verified model");
  assertEq(ps.get(c.id).modelsCache, ["gpt-4o-mini", "gpt-4o"]);
});

test("RC-3: testConnection flags a model missing from the list", async () => {
  const { ps } = await freshStore();
  const c = await addProvider(ps, { defaultModel: "gpt-9-nope" });
  const fakeFetch = async () => jsonResponse({ data: [{ id: "gpt-4o-mini" }] });
  const r = await ps.testConnection(c.id, fakeFetch);
  assertEq(r.ok, true);
  assertEq(r.models, 1);
  assertEq(r.modelVerified, false);
  assertEq(r.listUnavailable, false);
  assert(r.message.includes("not in the provider's list"), "message must flag the missing model");
  // A missing model is still a successful connection: the key works.
  assertEq(ps.get(c.id).lastTest.modelVerified, false);
});

test("RC-3: testConnection with no model to check returns modelVerified null", async () => {
  const { ps } = await freshStore();
  const c = await addProvider(ps, { defaultModel: "" });
  const fakeFetch = async () => jsonResponse({ data: [{ id: "gpt-4o-mini" }] });
  const r = await ps.testConnection(c.id, fakeFetch);
  assertEq(r.ok, true);
  assertEq(r.modelVerified, null);
  assertEq(r.model, null);
});

test("RC-3: explicit model param overrides config.defaultModel", async () => {
  const { ps } = await freshStore();
  const c = await addProvider(ps, { defaultModel: "gpt-4o-mini" });
  const fakeFetch = async () => jsonResponse({ data: [{ id: "gpt-4o" }] });
  const r = await ps.testConnection(c.id, fakeFetch, "gpt-4o");
  assertEq(r.modelVerified, true);
  assertEq(r.model, "gpt-4o");
});

/* ---------------- RC-5: /models 404 falls back to tiny completion ---------------- */

test("RC-5: list 404 falls back to tiny completion and reports list-unavailable", async () => {
  const { ps } = await freshStore();
  const c = await addProvider(ps);
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push([url, opts]);
    if (String(url).endsWith("/models")) return new Response("not here", { status: 404 });
    // Tiny completion: exact prompt, tiny cap, configured model.
    const body = JSON.parse(opts.body);
    assertEq(body.messages, [{ role: "user", content: "Reply with the single word: ok" }]);
    assertEq(body.max_tokens, 8);
    assertEq(body.model, "gpt-4o-mini");
    assertEq(body.stream, undefined);
    return jsonResponse({ choices: [{ message: { content: "ok" } }] });
  };
  const r = await ps.testConnection(c.id, fakeFetch);
  assertEq(r, {
    ok: true,
    models: null,
    modelVerified: true,
    listUnavailable: true,
    model: "gpt-4o-mini",
    message: "Connected (model list unavailable) · model gpt-4o-mini verified",
    at: r.at,
  });
  assertEq(calls.length, 2, "one list attempt + one tiny completion");
  assertEq(ps.get(c.id).lastTest.listUnavailable, true);
});

test("RC-5: list 404 + tiny completion 404 propagates model-not-found", async () => {
  const { ps } = await freshStore();
  const c = await addProvider(ps);
  const fakeFetch = async (url) =>
    String(url).endsWith("/models")
      ? new Response("no list", { status: 404 })
      : new Response("no such model", { status: 404 });
  const err = await assertThrowsAsync(() => ps.testConnection(c.id, fakeFetch));
  assertEq(err.code, "model-not-found");
  assertEq(ps.get(c.id).lastTest.ok, false);
});

test("RC-5: non-404 list failure still throws the mapped error (no fallback)", async () => {
  const { ps } = await freshStore();
  const c = await addProvider(ps);
  let posts = 0;
  const fakeFetch = async (url, opts) => {
    if (opts && opts.method === "POST") posts++;
    return new Response("bad key", { status: 401 });
  };
  const err = await assertThrowsAsync(() => ps.testConnection(c.id, fakeFetch));
  assertEq(err.code, "invalid-key");
  assertEq(posts, 0, "401 must not trigger the tiny-completion fallback");
});

/* ---------------- RC-2: lastTest persistence + formatTestResult ---------------- */

test("RC-2: lastTest is persisted on success (survives a reload)", async () => {
  const { storage, ps } = await freshStore();
  const c = await addProvider(ps);
  const fakeFetch = async () => jsonResponse({ data: [{ id: "gpt-4o-mini" }] });
  await ps.testConnection(c.id, fakeFetch);
  const raw = await storage.get("kv", "ai_providers");
  const dumped = JSON.stringify(raw);
  assert(!dumped.includes(SECRET), "key material must never be persisted");
  const saved = raw.value.find((r) => r.id === c.id);
  assertEq(saved.lastTest.ok, true);
  assertEq(saved.lastTest.models, 1);
  assertEq(saved.lastTest.modelVerified, true);
  assert(typeof saved.lastTest.at === "number", "lastTest needs a timestamp");
  // A fresh store loading the same storage sees the persisted result.
  const ps2 = new ProviderStore(storage);
  await ps2.load();
  assertEq(ps2.get(c.id).lastTest.ok, true);
});

test("RC-2: lastTest is persisted on failure too", async () => {
  const { storage, ps } = await freshStore();
  const c = await addProvider(ps);
  const bad = async () => new Response("bad key", { status: 401 });
  await assertThrowsAsync(() => ps.testConnection(c.id, bad));
  const lt = ps.get(c.id).lastTest;
  assertEq(lt.ok, false);
  assertEq(lt.models, null);
  assertEq(lt.modelVerified, null);
  assertEq(lt.listUnavailable, false);
  assert(lt.message.includes("Invalid API key"), "failure message must be the mapped error");
  assert(typeof lt.at === "number");
  const raw = await storage.get("kv", "ai_providers");
  assertEq(raw.value.find((r) => r.id === c.id).lastTest.ok, false);
});

test("RC-2: lastTest is cleared when the config is edited", async () => {
  const { ps } = await freshStore();
  const c = await addProvider(ps);
  const fakeFetch = async () => jsonResponse({ data: [{ id: "gpt-4o-mini" }] });
  await ps.testConnection(c.id, fakeFetch);
  assert(ps.get(c.id).lastTest && ps.get(c.id).lastTest.ok, "precondition: verified");
  await ps.update(c.id, { defaultModel: "gpt-4o" });
  assertEq(ps.get(c.id).lastTest, null, "model edit clears stale verification");
  await ps.testConnection(c.id, fakeFetch);
  await ps.update(c.id, { name: "Renamed" });
  assertEq(ps.get(c.id).lastTest, null, "name edit clears stale verification");
  await ps.testConnection(c.id, fakeFetch);
  await ps.update(c.id, { baseUrl: "https://api.openai.com/v1" });
  assertEq(ps.get(c.id).lastTest, null, "base URL edit clears stale verification");
  // Non-identity updates (discovery cache) must NOT clear it.
  await ps.testConnection(c.id, fakeFetch);
  await ps.update(c.id, { modelsCache: ["gpt-4o-mini"], modelsCachedAt: "2026-11-05T00:00:00.000Z" });
  assert(ps.get(c.id).lastTest && ps.get(c.id).lastTest.ok, "cache update keeps lastTest");
});

test("RC-2: formatTestResult renders every lastTest shape", () => {
  assertEq(formatTestResult(null), "");
  assertEq(formatTestResult(undefined), "");
  const at = new Date(2026, 10, 5, 12, 3, 0).getTime();
  assertEq(
    formatTestResult({ ok: true, models: 42, modelVerified: true, listUnavailable: false, model: "gpt-4o-mini", message: "x", at }),
    "Connected · 42 models listed · model gpt-4o-mini verified · 12:03"
  );
  assertEq(
    formatTestResult({ ok: true, models: 42, modelVerified: false, listUnavailable: false, model: "xyz", message: "x", at }),
    "Connected · 42 models listed · model xyz not in the provider's list · 12:03"
  );
  assertEq(
    formatTestResult({ ok: true, models: 42, modelVerified: null, listUnavailable: false, model: null, message: "x", at }),
    "Connected · 42 models listed · 12:03"
  );
  assertEq(
    formatTestResult({ ok: true, models: null, modelVerified: true, listUnavailable: true, model: "xyz", message: "x", at }),
    "Connected (model list unavailable) · model xyz verified · 12:03"
  );
  const failed = formatTestResult({ ok: false, models: null, modelVerified: null, listUnavailable: false, model: null, message: "Invalid API key", at });
  assertEq(failed, "Test failed · Invalid API key · 12:03");
  for (const s of [
    formatTestResult({ ok: true, models: 1, modelVerified: true, listUnavailable: false, model: "m", at }),
  ]) {
    assert(!s.includes("—"), "formatTestResult must not emit em dashes");
  }
});

test("RC-2: discoverModels still returns {count, models} and updates lastTest", async () => {
  const { ps } = await freshStore();
  const c = await addProvider(ps);
  const fakeFetch = async () => jsonResponse({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] });
  const r = await ps.discoverModels(c.id, fakeFetch);
  assertEq(r, { count: 2, models: ["gpt-4o-mini", "gpt-4o"] });
  assertEq(ps.get(c.id).lastTest.ok, true);
});

/* ---------------- RC-8: stream_options gating ---------------- */

test("RC-8: stream_options only for openai and openrouter builtins", () => {
  const a = new OpenAICompatibleAdapter();
  const opts = { messages: [{ role: "user", content: "hi" }], model: "m", maxTokens: 10, stream: true };
  assertEq(a.requestInfo(cfg({ builtinId: "openai" }), opts).body.stream_options, { include_usage: true });
  assertEq(a.requestInfo(cfg({ builtinId: "openrouter" }), opts).body.stream_options, { include_usage: true });
  for (const builtinId of ["deepseek", "custom", "anthropic", "gemini", undefined]) {
    const info = a.requestInfo(cfg({ builtinId }), opts);
    assertEq(info.body.stream, true, builtinId + " still streams");
    assert(!("stream_options" in info.body), builtinId + " must not receive stream_options");
  }
  // Non-streaming requests never carry stream_options, even for OpenAI.
  const plain = a.requestInfo(cfg({ builtinId: "openai" }), { ...opts, stream: false });
  assert(!("stream_options" in plain.body), "non-streaming must not carry stream_options");
});

/* ---------------- RC-9: completeOnce abort/timeout + streaming fallback ---------------- */

test("RC-9: completeOnce returns parsed text on success", async () => {
  const a = new OpenAICompatibleAdapter();
  const fakeFetch = async () => jsonResponse({ choices: [{ message: { content: "hello" } }] });
  const r = await completeOnce({
    adapter: a,
    config: cfg(),
    messages: [{ role: "user", content: "hi" }],
    model: "m",
    fetchImpl: fakeFetch,
  });
  assertEq(r, { text: "hello" });
});

test("RC-9: completeOnce user abort maps to aborted", async () => {
  const a = new OpenAICompatibleAdapter();
  const fakeFetch = () => new Promise(() => {}); // hangs forever
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 20);
  const err = await assertThrowsAsync(() =>
    completeOnce({
      adapter: a,
      config: cfg(),
      messages: [],
      model: "m",
      signal: ctrl.signal,
      timeoutMs: 5000,
      fetchImpl: fakeFetch,
    })
  );
  assertEq(err.code, "aborted");
});

test("RC-9: completeOnce timeout maps to timeout (not a bare abort)", async () => {
  const a = new OpenAICompatibleAdapter();
  const fakeFetch = () => new Promise(() => {}); // hangs forever
  const err = await assertThrowsAsync(() =>
    completeOnce({
      adapter: a,
      config: cfg(),
      messages: [],
      model: "m",
      timeoutMs: 20,
      fetchImpl: fakeFetch,
    })
  );
  assertEq(err.code, "timeout");
});

test("RC-9: streamChat zero-token JSON falls back once to completeOnce", async () => {
  const a = new OpenAICompatibleAdapter();
  let calls = 0;
  const fakeFetch = async (url, opts) => {
    calls++;
    if (calls === 1) {
      // Endpoint ignored stream:true and answered with a plain JSON body.
      assert(JSON.parse(opts.body).stream === true, "first call must request streaming");
      return new Response(JSON.stringify({ choices: [{ message: { content: "ignored" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Fallback: one non-streaming call with the same model/messages.
    const body = JSON.parse(opts.body);
    assertEq(body.stream, undefined, "fallback must not request streaming");
    assertEq(body.model, "m");
    return jsonResponse({ choices: [{ message: { content: "fallback hello" } }] });
  };
  const r = await streamChat({
    adapter: a,
    config: cfg(),
    messages: [{ role: "user", content: "hi" }],
    model: "m",
    maxTokens: 10,
    fetchImpl: fakeFetch,
  });
  assertEq(r, { text: "fallback hello", usage: null });
  assertEq(calls, 2, "exactly one fallback attempt");
});

test("RC-9: streamChat zero-token JSON with empty fallback returns empty", async () => {
  const a = new OpenAICompatibleAdapter();
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return jsonResponse({ choices: [{ message: { content: "" } }] });
  };
  const r = await streamChat({
    adapter: a,
    config: cfg(),
    messages: [{ role: "user", content: "hi" }],
    model: "m",
    fetchImpl: fakeFetch,
  });
  assertEq(r, { text: "", usage: null });
  assertEq(calls, 2, "fallback ran once even though it came back empty");
});

test("RC-9: streamChat zero-token SSE does NOT fall back", async () => {
  const a = new OpenAICompatibleAdapter();
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return sseResponse(["data: [DONE]\n\n"]);
  };
  const r = await streamChat({
    adapter: a,
    config: cfg(),
    messages: [{ role: "user", content: "hi" }],
    model: "m",
    fetchImpl: fakeFetch,
  });
  assertEq(r, { text: "", usage: null });
  assertEq(calls, 1, "an empty SSE stream must not trigger a fallback call");
});

test("RC-9: streamChat with tokens never falls back", async () => {
  const a = new OpenAICompatibleAdapter();
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return sseResponse(['data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n']);
  };
  const r = await streamChat({
    adapter: a,
    config: cfg(),
    messages: [{ role: "user", content: "hi" }],
    model: "m",
    fetchImpl: fakeFetch,
  });
  assertEq(r.text, "hi");
  assertEq(calls, 1, "a stream that produced tokens needs no fallback");
});
