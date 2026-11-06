/**
 * ExamElm AI proxy tests (2026-11-06).
 *
 * The Cloudflare Pages Function at functions/api/chat.js, exercised
 * directly via its exported handleChatRequest with mocked fetch/env.
 * Zero real API calls, zero real keys: the only key-shaped string here
 * is the fake "sk-or-v1-test" placeholder, standing in for the
 * Cloudflare secret. Run: node tests/run.js
 */
import {
  handleChatRequest,
  validateChatRequest,
  isFreeModelId,
  createRateLimiter,
  MAX_TOKENS_CAP,
} from "../../functions/api/chat.js";

const FAKE_KEY = "sk-or-v1-test";
const FREE_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const env = { OPENROUTER_API_KEY: FAKE_KEY };

function req(body, { method = "POST", ip = "203.0.113.7", rawBody = null } = {}) {
  return new Request("https://apps-and-sites.pages.dev/api/chat", {
    method,
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: method === "POST" ? (rawBody !== null ? rawBody : JSON.stringify(body)) : undefined,
  });
}

function bodyOf(over = {}) {
  return {
    model: FREE_MODEL,
    messages: [{ role: "user", content: "Hello" }],
    maxTokens: 100,
    stream: false,
    ...over,
  };
}

/** Mock upstream fetch: records calls, answers with `respond`. */
function mockUpstream(respond) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: { ...opts.headers }, body: JSON.parse(opts.body) });
    return respond(calls.length);
  };
  return { calls, fetchImpl };
}

function jsonUpstream(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sseUpstream(chunks) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/* ---------------- validation ---------------- */

test("proxy: isFreeModelId only accepts the :free suffix", () => {
  assert(isFreeModelId("x/y:free") === true);
  assert(isFreeModelId("x/y") === false);
  assert(isFreeModelId("") === false);
  assert(isFreeModelId(null) === false);
  assert(isFreeModelId("x/y:FREE") === true, "case-insensitive suffix check");
});

test("proxy: validateChatRequest cleans a valid request, defaults maxTokens/stream", () => {
  const out = validateChatRequest(bodyOf({ maxTokens: undefined, stream: undefined }));
  assertEq(out.model, FREE_MODEL);
  assertEq(out.maxTokens, 1024);
  assertEq(out.stream, false);
  assertEq(out.messages, [{ role: "user", content: "Hello" }]);
});

test("proxy: validateChatRequest clamps maxTokens to the 2048 cap", () => {
  assertEq(validateChatRequest(bodyOf({ maxTokens: 99999 })).maxTokens, MAX_TOKENS_CAP);
  assertEq(validateChatRequest(bodyOf({ maxTokens: 0 })).maxTokens, 1);
});

test("proxy: validateChatRequest rejects bad requests with 400", () => {
  const bad = [
    [{}, "empty object"],
    [bodyOf({ model: "gpt-4o" }), "non-free model"],
    [bodyOf({ model: "" }), "empty model"],
    [bodyOf({ messages: [] }), "no messages"],
    [bodyOf({ messages: [{ role: "wizard", content: "hi" }] }), "bad role"],
    [bodyOf({ messages: [{ role: "user", content: "   " }] }), "empty content"],
    [bodyOf({ messages: [{ role: "user", content: "x".repeat(20001) }] }), "message too long"],
    [bodyOf({ stream: "yes" }), "non-boolean stream"],
  ];
  for (const [input, label] of bad) {
    let err = null;
    try {
      validateChatRequest(input);
    } catch (e) {
      err = e;
    }
    assert(err !== null && err.status === 400, `expected 400 for ${label}`);
  }
});

/* ---------------- 503 / 405 / 400 gates ---------------- */

test("proxy: missing secret answers 503, no key details", async () => {
  const { fetchImpl } = mockUpstream(() => jsonUpstream({ choices: [] }));
  const res = await handleChatRequest(req(bodyOf()), {}, { fetchImpl });
  assertEq(res.status, 503);
  const data = await res.json();
  assert(data.error.includes("not configured"), "503 names the missing configuration");
  assert(!JSON.stringify(data).includes(FAKE_KEY), "no key material in the 503");
});

test("proxy: GET answers 405, no upstream call", async () => {
  const { calls, fetchImpl } = mockUpstream(() => jsonUpstream({}));
  const res = await handleChatRequest(req(null, { method: "GET" }), env, { fetchImpl });
  assertEq(res.status, 405);
  assertEq(calls.length, 0, "GET never reaches OpenRouter");
});

test("proxy: non-free model is rejected with 400 before any upstream call", async () => {
  const { calls, fetchImpl } = mockUpstream(() => jsonUpstream({}));
  const res = await handleChatRequest(req(bodyOf({ model: "openai/gpt-4o" })), env, { fetchImpl });
  assertEq(res.status, 400);
  assertEq(calls.length, 0, "rejected requests never reach OpenRouter");
  const data = await res.json();
  assert(data.error.includes(":free"), "400 names the free-only rule");
});

test("proxy: invalid JSON body answers 400", async () => {
  const { fetchImpl } = mockUpstream(() => jsonUpstream({}));
  const res = await handleChatRequest(req(null, { rawBody: "{not json" }), env, { fetchImpl });
  assertEq(res.status, 400);
});

/* ---------------- forwarding ---------------- */

test("proxy: forwards the env key as Bearer, never anything from the request", async () => {
  const { calls, fetchImpl } = mockUpstream(() =>
    jsonUpstream({ choices: [{ message: { content: "Hi!" } }] })
  );
  const res = await handleChatRequest(req(bodyOf()), env, { fetchImpl });
  assertEq(res.status, 200);
  assertEq(calls.length, 1);
  assertEq(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assertEq(calls[0].headers.Authorization, "Bearer " + FAKE_KEY);
  assertEq(calls[0].body.model, FREE_MODEL);
  assertEq(calls[0].body.max_tokens, 100);
  assertEq(calls[0].body.messages, [{ role: "user", content: "Hello" }]);
  assert(!JSON.stringify(calls[0].body).includes("OPENROUTER_API_KEY"), "no env name leaks into the body");
  const data = await res.json();
  assertEq(data.choices[0].message.content, "Hi!");
});

test("proxy: clamped maxTokens is what reaches upstream", async () => {
  const { calls, fetchImpl } = mockUpstream(() => jsonUpstream({ choices: [] }));
  await handleChatRequest(req(bodyOf({ maxTokens: 99999 })), env, { fetchImpl });
  assertEq(calls[0].body.max_tokens, MAX_TOKENS_CAP);
});

test("proxy: streaming response is passed through as SSE", async () => {
  const { fetchImpl } = mockUpstream(() =>
    sseUpstream(['data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n', "data: [DONE]\n\n"])
  );
  const res = await handleChatRequest(req(bodyOf({ stream: true })), env, { fetchImpl });
  assertEq(res.status, 200);
  assertEq(res.headers.get("content-type"), "text/event-stream");
  const text = await res.text();
  assert(text.includes("Hello"), "SSE body passes through");
  assert(text.includes("[DONE]"), "stream terminator passes through");
});

test("proxy: upstream network failure answers 502, no internals leaked", async () => {
  const fetchImpl = async () => {
    throw new Error("connect ECONNREFUSED 104.18.0.1");
  };
  const res = await handleChatRequest(req(bodyOf()), env, { fetchImpl });
  assertEq(res.status, 502);
  const data = await res.json();
  assert(!JSON.stringify(data).includes("ECONNREFUSED"), "no upstream internals leak");
  assert(!JSON.stringify(data).includes(FAKE_KEY), "no key material leaks");
});

/* ---------------- upstream error mapping ---------------- */

test("proxy: upstream 429 maps to friendly 429", async () => {
  const { fetchImpl } = mockUpstream(() => jsonUpstream({ error: { message: "rate limited" } }, 429));
  const res = await handleChatRequest(req(bodyOf()), env, { fetchImpl });
  assertEq(res.status, 429);
  const data = await res.json();
  assert(data.error.includes("fair-use"), "429 names the fair-use limit");
});

test("proxy: upstream 401 maps to 502 without leaking the key or detail", async () => {
  const { fetchImpl } = mockUpstream(() =>
    jsonUpstream({ error: { message: "Invalid API key: " + FAKE_KEY } }, 401)
  );
  const res = await handleChatRequest(req(bodyOf()), env, { fetchImpl });
  assertEq(res.status, 502);
  const data = await res.json();
  assert(!JSON.stringify(data).includes(FAKE_KEY), "upstream key detail never reaches the client");
  assert(data.error.includes("temporarily unavailable"), "502 is generic and friendly");
});

test("proxy: upstream 404 maps to 400 model-not-available", async () => {
  const { fetchImpl } = mockUpstream(() => jsonUpstream({ error: { message: "not found" } }, 404));
  const res = await handleChatRequest(req(bodyOf()), env, { fetchImpl });
  assertEq(res.status, 400);
  const data = await res.json();
  assert(data.error.includes("not available"), "404 becomes a plain model message");
});

/* ---------------- rate limiting ---------------- */

test("proxy: 10 requests/minute per IP, 11th is 429, another IP unaffected", async () => {
  const limiter = createRateLimiter();
  const { calls, fetchImpl } = mockUpstream(() => jsonUpstream({ choices: [] }));
  for (let i = 0; i < 10; i++) {
    const res = await handleChatRequest(req(bodyOf()), env, { fetchImpl, limiter });
    assertEq(res.status, 200, `request ${i + 1} passes`);
  }
  const limited = await handleChatRequest(req(bodyOf()), env, { fetchImpl, limiter });
  assertEq(limited.status, 429);
  assertEq(calls.length, 10, "the 11th request never reaches upstream");
  const other = await handleChatRequest(req(bodyOf(), { ip: "198.51.100.9" }), env, {
    fetchImpl,
    limiter,
  });
  assertEq(other.status, 200, "a different IP has its own budget");
});

test("proxy: daily cap is enforced separately from the minute cap", async () => {
  const limiter = createRateLimiter({ perMinute: 100, perDay: 2 });
  const { calls, fetchImpl } = mockUpstream(() => jsonUpstream({ choices: [] }));
  assertEq((await handleChatRequest(req(bodyOf()), env, { fetchImpl, limiter })).status, 200);
  assertEq((await handleChatRequest(req(bodyOf()), env, { fetchImpl, limiter })).status, 200);
  const limited = await handleChatRequest(req(bodyOf()), env, { fetchImpl, limiter });
  assertEq(limited.status, 429);
  assertEq(calls.length, 2, "the 3rd request never reaches upstream");
  const data = await limited.json();
  assert(data.error.includes("daily"), "daily-limit message names the day");
});
