/**
 * StudyPilot — Phase 4 (BYOK) tests.
 *
 * All provider I/O uses injected mock fetch implementations. No real API
 * calls, no real keys, no network. Run: node tests/run.js
 */
import { openStorage } from "../assets/js/storage.js";
import {
  AIError,
  OpenAICompatibleAdapter,
  AnthropicAdapter,
  GeminiAdapter,
  ANTHROPIC_VERSION,
  adapterFor,
} from "../assets/js/ai/adapters.js";
import { ProviderStore, BUILTINS, builtinById } from "../assets/js/ai/providers.js";
import { encryptString, decryptString, cryptoAvailable } from "../assets/js/ai/crypto.js";
import { streamChat, createSseParser } from "../assets/js/ai/chat.js";
import { estimateCost, formatUsd, estimateTokens } from "../assets/js/ai/costs.js";

const SECRET = "sk-test-fake-key-12345";
const cfg = (over = {}) => ({
  id: "prv_x",
  name: "Test",
  type: "openai-compatible",
  baseUrl: "https://example.com/v1/",
  apiKey: SECRET,
  ...over,
});

/* ---------------- adapter: request builders ---------------- */

test("openai-compatible: exact request shape, key in header not URL", () => {
  const a = new OpenAICompatibleAdapter();
  // stream_options is sent only for known-compatible builtins (RC-8).
  const info = a.requestInfo(cfg({ builtinId: "openai" }), {
    messages: [{ role: "user", content: "hi" }],
    model: "gpt-4o-mini",
    maxTokens: 100,
    stream: true,
  });
  assertEq(info.url, "https://example.com/v1/chat/completions");
  assertEq(info.headers, { "Content-Type": "application/json", Authorization: "Bearer " + SECRET });
  assertEq(info.body, {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 100,
    stream: true,
    stream_options: { include_usage: true },
  });
  assert(!info.url.includes(SECRET), "key must not appear in URL");
});

test("openai-compatible: trailing slashes trimmed from base URL", () => {
  const a = new OpenAICompatibleAdapter();
  const info = a.requestInfo(cfg({ baseUrl: "https://example.com/v1///" }), {
    messages: [],
    model: "m",
    stream: false,
  });
  assertEq(info.url, "https://example.com/v1/chat/completions");
});

test("anthropic: headers, version, system extraction, default max_tokens", () => {
  const a = new AnthropicAdapter();
  const info = a.requestInfo(cfg({ type: "anthropic", baseUrl: "https://api.anthropic.com" }), {
    messages: [
      { role: "system", content: "Be brief." },
      { role: "user", content: "hi" },
    ],
    model: "claude-3-5-haiku-20241022",
    stream: true,
  });
  assertEq(info.url, "https://api.anthropic.com/v1/messages");
  assertEq(info.headers["x-api-key"], SECRET);
  assertEq(info.headers["anthropic-version"], ANTHROPIC_VERSION);
  assertEq(info.headers["anthropic-dangerous-direct-browser-access"], "true");
  assertEq(info.body.system, "Be brief.");
  assertEq(info.body.messages, [{ role: "user", content: "hi" }]);
  assertEq(info.body.max_tokens, 1024);
  assertEq(info.body.stream, true);
  assert(!info.url.includes(SECRET), "key must not appear in URL");
});

test("gemini: key in x-goog-api-key header, never in URL; role mapping", () => {
  const a = new GeminiAdapter();
  const info = a.requestInfo(
    cfg({ type: "gemini", baseUrl: "https://generativelanguage.googleapis.com" }),
    {
      messages: [
        { role: "system", content: "sys" },
        { role: "assistant", content: "prev" },
        { role: "user", content: "hi" },
      ],
      model: "gemini-2.0-flash",
      maxTokens: 50,
      stream: true,
    }
  );
  assert(info.url.includes(":streamGenerateContent?alt=sse"), "streams via SSE method");
  assert(!info.url.includes(SECRET) && !info.url.includes("key="), "key must not appear in URL");
  assertEq(info.headers["x-goog-api-key"], SECRET);
  assertEq(info.body.systemInstruction, { parts: [{ text: "sys" }] });
  assertEq(info.body.contents, [
    { role: "model", parts: [{ text: "prev" }] },
    { role: "user", parts: [{ text: "hi" }] },
  ]);
  assertEq(info.body.generationConfig, { maxOutputTokens: 50 });
});

test("adapterFor factory returns the right classes", () => {
  assert(adapterFor("anthropic") instanceof AnthropicAdapter);
  assert(adapterFor("gemini") instanceof GeminiAdapter);
  assert(adapterFor("openai-compatible") instanceof OpenAICompatibleAdapter);
  assert(adapterFor("weird") instanceof OpenAICompatibleAdapter, "unknown type falls back safely");
});

test("capability flags", () => {
  for (const a of [new OpenAICompatibleAdapter(), new AnthropicAdapter(), new GeminiAdapter()]) {
    assertEq(a.capabilities.streaming, true);
    assertEq(a.capabilities.modelListing, true);
    assertEq(a.capabilities.maxTokens, true);
  }
});

/* ---------------- adapter: SSE parsing ---------------- */

test("openai SSE: tokens, [DONE], usage, partial JSON ignored", () => {
  const a = new OpenAICompatibleAdapter();
  const t1 = a.parseSseEvent("", '{"choices":[{"delta":{"content":"Hello"}}]}');
  assertEq(t1, { type: "token", text: "Hello" });
  assertEq(a.parseSseEvent("", "[DONE]"), { type: "done" });
  const u = a.parseSseEvent("", '{"usage":{"prompt_tokens":5,"completion_tokens":3}}');
  assertEq(u, { type: "usage", promptTokens: 5, completionTokens: 3 });
  assertEq(a.parseSseEvent("", '{"choices":[{"delta":{"con'), null, "partial JSON -> null");
  assertEq(a.parseSseEvent("", ""), null);
});

test("anthropic SSE: text_delta -> token, message_stop -> done", () => {
  const a = new AnthropicAdapter();
  const t = a.parseSseEvent(
    "content_block_delta",
    '{"delta":{"type":"text_delta","text":"Hi"}}'
  );
  assertEq(t, { type: "token", text: "Hi" });
  assertEq(a.parseSseEvent("message_stop", "{}"), { type: "done" });
  assertEq(a.parseSseEvent("ping", "{}"), null);
});

test("gemini SSE: parts text joined", () => {
  const a = new GeminiAdapter();
  const t = a.parseSseEvent(
    "",
    '{"candidates":[{"content":{"parts":[{"text":"A"},{"text":"B"}]}}]}'
  );
  assertEq(t, { type: "token", text: "AB" });
});

test("createSseParser: reassembles events split across chunks", () => {
  const seen = [];
  const p = createSseParser((event, data) => seen.push([event, data]));
  p.feed('event: content_block_delta\ndata: {"delta":{"type":"text_del');
  p.feed('ta","text":"Hel');
  p.feed('lo"}}\n\nevent: message_stop\ndata: {}');
  p.feed("\n\n");
  p.flush();
  assertEq(seen.length, 2);
  assertEq(seen[0][0], "content_block_delta");
  assert(seen[0][1].includes("Hello"), "split payload reassembled");
  assertEq(seen[1][0], "message_stop");
});

test("createSseParser: ignores SSE comments, handles data-only events", () => {
  const seen = [];
  const p = createSseParser((event, data) => seen.push([event, data]));
  p.feed(": keepalive\n\ndata: [DONE]\n\n");
  p.flush();
  assertEq(seen, [["", "[DONE]"]]);
});

/* ---------------- adapter: error mapping ---------------- */

test("error mapping: 401/429/404/400 across adapters", () => {
  const adapters = [new OpenAICompatibleAdapter(), new AnthropicAdapter(), new GeminiAdapter()];
  for (const a of adapters) {
    assertEq(a.mapHttpError(401, "").code, "invalid-key");
    assertEq(a.mapHttpError(429, "").code, "rate-limited");
    assertEq(a.mapHttpError(404, "").code, "model-not-found");
    assertEq(a.mapHttpError(400, "").code, "bad-request");
    assert(a.mapHttpError(401, "").message.length > 20, "plain-language message");
  }
});

test("gemini: API_KEY_INVALID body maps to invalid-key", () => {
  const a = new GeminiAdapter();
  const e = a.mapHttpError(400, '{"error":{"status":"INVALID_ARGUMENT","message":"API_KEY_INVALID"}}');
  assertEq(e.code, "invalid-key");
});

test("error mapping: unknown status -> unknown code, no throw", () => {
  const a = new OpenAICompatibleAdapter();
  const e = a.mapHttpError(503, "overloaded");
  assertEq(e.code, "unknown");
  assert(e instanceof AIError);
});

/* ---------------- adapter: model list parsing ---------------- */

test("model list parsing per provider", () => {
  const oai = new OpenAICompatibleAdapter();
  assertEq(oai.parseModelList({ data: [{ id: "a" }, { id: "b" }, {}] }), ["a", "b"]);

  const gem = new GeminiAdapter();
  assertEq(
    gem.parseModelList({
      models: [
        { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
      ],
    }),
    ["gemini-2.0-flash"]
  );
});

test("listModelsRequest shapes (auth, no key in URL)", () => {
  const oai = new OpenAICompatibleAdapter();
  const r1 = oai.listModelsRequest(cfg());
  assertEq(r1.url, "https://example.com/v1/models");
  assert(r1.headers.Authorization.includes(SECRET));

  const gem = new GeminiAdapter();
  const r2 = gem.listModelsRequest(cfg({ type: "gemini", baseUrl: "https://generativelanguage.googleapis.com" }));
  assertEq(r2.url, "https://generativelanguage.googleapis.com/v1beta/models");
  assert(!r2.url.includes(SECRET) && !r2.url.includes("key="));
  assertEq(r2.headers["x-goog-api-key"], SECRET);
});

/* ---------------- crypto ---------------- */

test("crypto available in this environment", () => {
  assert(cryptoAvailable(), "WebCrypto subtle required for tests");
});

test("encrypt/decrypt round-trip", async () => {
  const enc = await encryptString(SECRET, "correct horse battery staple");
  assert(enc.v === 1 && enc.salt && enc.iv && enc.data);
  assert(!JSON.stringify(enc).includes(SECRET), "ciphertext must not contain plaintext");
  const dec = await decryptString(enc, "correct horse battery staple");
  assertEq(dec, SECRET);
});

test("wrong passphrase fails closed", async () => {
  const enc = await encryptString(SECRET, "right-pass");
  await assertThrowsAsync(() => decryptString(enc, "wrong-pass"), "Wrong passphrase");
});

test("tampered ciphertext fails closed", async () => {
  const enc = await encryptString(SECRET, "pass1234");
  const tampered = { ...enc, data: enc.data.slice(0, -4) + "AAAA" };
  await assertThrowsAsync(() => decryptString(tampered, "pass1234"), "tampered");
});

test("random salt/iv: two encryptions differ", async () => {
  const a = await encryptString("x", "pass1234");
  const b = await encryptString("x", "pass1234");
  assert(a.data !== b.data && a.iv !== b.iv, "IV/salt must be random");
});

test("empty passphrase rejected", async () => {
  await assertThrowsAsync(() => encryptString("x", ""), "passphrase");
});

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

/* ---------------- providers ---------------- */

async function freshStore() {
  const storage = await openStorage({ backend: "memory" });
  const ps = new ProviderStore(storage);
  await ps.load();
  return { storage, ps };
}

test("add: trims slashes, rejects bad URL and unknown builtin", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "  ", builtinId: "openrouter", baseUrl: "https://openrouter.ai/api/v1///", defaultModel: "x" });
  assertEq(c.baseUrl, "https://openrouter.ai/api/v1");
  assertEq(c.name, "OpenRouter", "blank name falls back to builtin label");
  await assertThrowsAsync(() => ps.add({ name: "n", builtinId: "nope", baseUrl: "https://x" }), "Unknown provider");
  await assertThrowsAsync(
    () => ps.add({ name: "n", builtinId: "openai", baseUrl: "ftp://evil" }),
    "http"
  );
});

test("persisted configs never contain key material", async () => {
  const { storage, ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  await ps.setKey(c.id, SECRET);
  await ps.save();
  const raw = await storage.get("kv", "ai_providers");
  const dumped = JSON.stringify(raw);
  assert(!dumped.includes(SECRET), "key material leaked into persisted configs");
  assert(!dumped.includes("apiKey"), "no apiKey field persisted");
});

test("setKey/forgetKey round-trip; getKey throws friendly error when missing", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  try {
    ps.getKey(c.id);
    throw new Error("should have thrown");
  } catch (e) {
    assert(e instanceof AIError && e.code === "invalid-key");
    assert(e.message.includes("Add its key in Settings"), "points at Settings, got: " + e.message);
  }
  await ps.setKey(c.id, SECRET);
  assert(ps.hasKey(c.id));
  assertEq(ps.getKey(c.id), SECRET);
  await ps.forgetKey(c.id);
  assert(!ps.hasKey(c.id));
});

test("memory backend: keyStoreState unavailable, setKey stays memory-only", async () => {
  const { storage, ps } = await freshStore();
  assertEq(ps.keyStoreState, "unavailable");
  assert(ps.keyStoreNote.length > 10, "honest note set");
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  await ps.setKey(c.id, SECRET); // no passphrase needed, nothing persisted
  assert(ps.hasKey(c.id));
  assertEq(ps.getKey(c.id), SECRET);
  const keys = await storage.get("kv", "ai_keys_enc");
  assert(keys === null, "nothing persisted on the memory backend");
  const dev = await storage.get("kv", "ai_device_key");
  assert(dev === null, "no device key on the memory backend");
});

/**
 * Reference store stub for keystore tests: a plain Map, get/put/del by
 * reference (like real IndexedDB, which stores CryptoKey objects intact),
 * backend "indexeddb". The memory backend mangles CryptoKey objects, so
 * keystore tests must NOT use freshStore() (memory backend).
 */
function refStore() {
  const kv = new Map();
  return {
    backend: "indexeddb",
    degraded: false,
    async get(store, key) {
      const v = kv.get(store + ":" + key);
      return v === undefined ? null : v;
    },
    async put(store, value) {
      kv.set(store + ":" + (value.key ?? value.id), value);
      return value;
    },
    async del(store, key) {
      kv.delete(store + ":" + key);
    },
    async list() {
      return [];
    },
  };
}

async function freshRefStore() {
  const storage = refStore();
  const ps = new ProviderStore(storage);
  await ps.load();
  return { storage, ps };
}

test("keystore: first setKey with passphrase auto-stores ciphertext + device key", async () => {
  const { storage, ps } = await freshRefStore();
  assertEq(ps.keyStoreState, "needs-passphrase");
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  await ps.setKey(c.id, SECRET, "correct horse battery staple");
  assertEq(ps.keyStoreState, "ready");
  assertEq(ps.getKey(c.id), SECRET);
  const raw = await storage.get("kv", "ai_keys_enc");
  assert(raw && raw.value && raw.value.v === 2, "v:2 payload stored");
  assert(!JSON.stringify(raw).includes(SECRET), "ciphertext must not contain plaintext");
  assert(raw.value.items[c.id] && raw.value.items[c.id].v === 2, "blob for the provider");
  const dev = await storage.get("kv", "ai_device_key");
  assert(dev && dev.value && dev.value.v === 2 && dev.value.salt && dev.value.key, "device-key record exists");
});

test("keystore: decrypt-on-load, no passphrase supplied", async () => {
  const { storage, ps } = await freshRefStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  await ps.setKey(c.id, SECRET, "correct horse battery staple");
  const ps2 = new ProviderStore(storage);
  await ps2.load();
  assertEq(ps2.keyStoreState, "ready");
  assert(ps2.hasKey(c.id), "key auto-decrypted on load");
  assertEq(ps2.getKey(c.id), SECRET);
});

test("keystore: later setKey needs no passphrase", async () => {
  const { storage, ps } = await freshRefStore();
  const a = await ps.add({ name: "a", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  await ps.setKey(a.id, SECRET, "correct horse battery staple");
  const b = await ps.add({ name: "b", builtinId: "openrouter", baseUrl: "https://openrouter.ai/api/v1" });
  await ps.setKey(b.id, "sk-test-fake-key-67890"); // no passphrase
  assertEq(ps.getKey(b.id), "sk-test-fake-key-67890");
  const raw = await storage.get("kv", "ai_keys_enc");
  assert(raw.value.items[a.id] && raw.value.items[b.id], "both blobs stored");
});

test("keystore: forgetKey deletes the blob; last key also deletes the device key", async () => {
  const { storage, ps } = await freshRefStore();
  const a = await ps.add({ name: "a", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  const b = await ps.add({ name: "b", builtinId: "openrouter", baseUrl: "https://openrouter.ai/api/v1" });
  await ps.setKey(a.id, SECRET, "correct horse battery staple");
  await ps.setKey(b.id, "sk-test-fake-key-67890");
  await ps.forgetKey(a.id);
  assert(!ps.hasKey(a.id));
  let raw = await storage.get("kv", "ai_keys_enc");
  assert(raw && raw.value.items[b.id] && !raw.value.items[a.id], "only b's blob remains");
  assertEq(ps.keyStoreState, "ready", "device key kept while keys remain");
  await ps.forgetKey(b.id);
  assert(!ps.hasKey(b.id));
  raw = await storage.get("kv", "ai_keys_enc");
  assert(raw === null, "key record gone after the last key");
  const dev = await storage.get("kv", "ai_device_key");
  assert(dev === null, "device key deleted with the last key");
  assertEq(ps.keyStoreState, "needs-passphrase", "fresh start asks for a passphrase again");
});

test("keystore: short/missing passphrase rejected on first setKey, no trace left", async () => {
  const { storage, ps } = await freshRefStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  await assertThrowsAsync(() => ps.setKey(c.id, SECRET), "at least 8 characters");
  await assertThrowsAsync(() => ps.setKey(c.id, SECRET, "short"), "at least 8 characters");
  assert(!ps.hasKey(c.id), "refused setKey leaves no memory key");
  assertEq(ps.keyStoreState, "needs-passphrase");
  assert((await storage.get("kv", "ai_device_key")) === null, "no device key created");
  assert((await storage.get("kv", "ai_keys_enc")) === null, "no blob written");
});

test("legacy v:1: load flags it, leaves the record untouched, no crash", async () => {
  const { storage, ps } = await freshRefStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  const legacyBlob = await encryptString(SECRET, "old-passphrase-123");
  const legacyPayload = { v: 1, items: { [c.id]: legacyBlob } };
  await storage.put("kv", { key: "ai_keys_enc", value: legacyPayload });
  const ps2 = new ProviderStore(storage);
  await ps2.load();
  assertEq(ps2.legacyKeysPresent, true);
  assertEq(ps2.keyStoreState, "needs-passphrase");
  assert(!ps2.hasKey(c.id), "legacy keys are NOT auto-decrypted");
  const raw = await storage.get("kv", "ai_keys_enc");
  assertEq(JSON.parse(JSON.stringify(raw.value)), legacyPayload, "legacy record untouched");
});

test("legacy v:1: matching passphrase migrates to v:2 on first new-scheme setKey", async () => {
  const { storage, ps } = await freshRefStore();
  const a = await ps.add({ name: "a", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  const b = await ps.add({ name: "b", builtinId: "openrouter", baseUrl: "https://openrouter.ai/api/v1" });
  const legacyBlob = await encryptString(SECRET, "old-passphrase-123");
  await storage.put("kv", { key: "ai_keys_enc", value: { v: 1, items: { [a.id]: legacyBlob } } });
  const ps2 = new ProviderStore(storage);
  await ps2.load();
  assertEq(ps2.legacyKeysPresent, true);
  await ps2.setKey(b.id, "sk-test-fake-key-67890", "old-passphrase-123");
  assertEq(ps2.legacyKeysPresent, false, "migration cleared the flag");
  assertEq(ps2.getKey(a.id), SECRET, "legacy key migrated");
  assertEq(ps2.getKey(b.id), "sk-test-fake-key-67890");
  const raw = await storage.get("kv", "ai_keys_enc");
  assertEq(raw.value.v, 2, "record is now v:2");
  assert(!raw.value.legacy, "legacy payload dropped");
  assert(raw.value.items[a.id] && raw.value.items[b.id], "both keys stored as v:2 blobs");
  assert(!JSON.stringify(raw).includes(SECRET), "no plaintext at rest");
  // Reload proves the migrated key decrypts with the device key alone.
  const ps3 = new ProviderStore(storage);
  await ps3.load();
  assertEq(ps3.getKey(a.id), SECRET);
});

test("legacy v:1: wrong passphrase leaves the legacy record fully intact", async () => {
  const storage = refStore();
  const ps = new ProviderStore(storage);
  await ps.load();
  const c = await ps.add({ name: "c", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  const d = await ps.add({ name: "d", builtinId: "openrouter", baseUrl: "https://openrouter.ai/api/v1" });
  const legacyBlob = await encryptString(SECRET, "old-passphrase-123");
  const legacyPayload = { v: 1, items: { [c.id]: legacyBlob } };
  await storage.put("kv", { key: "ai_keys_enc", value: legacyPayload });
  const ps2 = new ProviderStore(storage);
  await ps2.load();
  await ps2.setKey(d.id, "sk-test-fake-key-67890", "different-passphrase");
  assertEq(ps2.legacyKeysPresent, true, "failed migration keeps the flag");
  const raw = await storage.get("kv", "ai_keys_enc");
  assertEq(raw.value.v, 2, "new key still persisted as v:2");
  assert(raw.value.items[d.id], "new key blob present");
  assertEq(JSON.parse(JSON.stringify(raw.value.legacy)), legacyPayload, "legacy payload fully intact");
  assert(!ps2.hasKey(c.id), "unmigrated legacy key stays out of memory");
  // A later load still sees the legacy flag and decrypts the new key.
  const ps3 = new ProviderStore(storage);
  await ps3.load();
  assertEq(ps3.legacyKeysPresent, true);
  assertEq(ps3.getKey(d.id), "sk-test-fake-key-67890");
});

test("legacy v:1 unlock: right passphrase loads keys, wrong passphrase fails closed", async () => {
  const { storage, ps } = await freshRefStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  const blob = await encryptString(SECRET, "my-secret-passphrase");
  await storage.put("kv", { key: "ai_keys_enc", value: { v: 1, items: { [c.id]: blob } } });
  const loaded = await ps.unlock("my-secret-passphrase");
  assertEq(loaded, [c.id]);
  assertEq(ps.getKey(c.id), SECRET);
  ps.forgetAllKeys();
  await assertThrowsAsync(() => ps.unlock("wrong-passphrase"), "Wrong passphrase");
  assert(!ps.hasKey(c.id), "failed unlock must not leave keys in memory");
});

test("remove() purges memory key, encrypted blob, and device key when last", async () => {
  const { storage, ps } = await freshRefStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  await ps.setKey(c.id, SECRET, "pass12345");
  await ps.remove(c.id);
  assert(!ps.hasKey(c.id));
  const raw = await storage.get("kv", "ai_keys_enc");
  assert(raw === null, "encrypted copy must be gone after remove");
  const dev = await storage.get("kv", "ai_device_key");
  assert(dev === null, "device key gone with the last key");
  assertEq(ps.keyStoreState, "needs-passphrase");
});

test("builtins carry honest CORS notes", () => {
  for (const b of BUILTINS) {
    assert(b.corsNote && b.corsNote.length > 20, b.id + " needs a CORS note");
    assert(["blocked", "supported", "unverified"].includes(b.cors), b.id);
  }
  assert(builtinById("anthropic").cors === "supported");
  assert(builtinById("openai").cors === "supported"); // RC-10: live probes contradict the old "blocked" claim
});

test("testConnection: success caches models (mocked fetch)", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  await ps.setKey(c.id, SECRET);
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push([url, opts]);
    return new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }), { status: 200 });
  };
  const r = await ps.testConnection(c.id, fakeFetch);
  assert(r.ok === true && r.models === 2, "ok + count");
  assert(r.modelVerified === null, "no model configured to check");
  assert(r.keyVerified === false, "no model configured, so the key could not be proven");
  assert(r.listUnavailable === false, "list worked");
  assert(typeof r.at === "number", "timestamp recorded");
  assert(String(r.message).includes("2 models listed"), "message names the count");
  assert(String(r.message).includes("key not verified"), "message must say the key was not verified");
  assert(calls[0][1].headers.Authorization === "Bearer " + SECRET);
  assertEq(ps.get(c.id).modelsCache, ["m1", "m2"]);
  assert(ps.get(c.id).lastTest && ps.get(c.id).lastTest.ok === true, "lastTest persisted");
});

test("testConnection: 401 -> invalid-key; TypeError -> cors-blocked", async () => {
  const { ps } = await freshStore();
  const c = await ps.add({ name: "t", builtinId: "openai", baseUrl: "https://api.openai.com/v1" });
  await ps.setKey(c.id, SECRET);
  const bad = async () => new Response("bad key", { status: 401 });
  try {
    await ps.testConnection(c.id, bad);
    throw new Error("should have thrown");
  } catch (e) {
    assertEq(e.code, "invalid-key");
  }
  const boom = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    await ps.testConnection(c.id, boom);
    throw new Error("should have thrown");
  } catch (e) {
    assertEq(e.code, "cors-blocked");
    assert(e.message.includes("CORS"), "guidance must mention CORS");
  }
});

/* ---------------- costs ---------------- */

test("estimateTokens: ~4 chars per token", () => {
  assertEq(estimateTokens("abcd"), 1);
  assertEq(estimateTokens("abcde"), 2);
  assertEq(estimateTokens(""), 0);
});

test("estimateCost math (gpt-4o-mini)", () => {
  // 4000 chars -> 1000 prompt tokens @ $0.15/1M = $0.00015
  // 1024 output tokens @ $0.60/1M = $0.0006144 ; total $0.0007644
  const r = estimateCost("gpt-4o-mini", "x".repeat(4000), 1024);
  assertEq(r.known, true);
  assert(Math.abs(r.estCostUsd - 0.0007644) < 1e-9, "got " + r.estCostUsd);
  assertEq(r.promptTokens, 1000);
});

test("estimateCost: unknown model -> known:false, no invented price", () => {
  const r = estimateCost("future-model-9000", "hello", 100);
  assertEq(r.known, false);
test("estimateCost: ':free' variant -> known, free, $0", () => {
  const r = estimateCost("nvidia/nemotron-3-ultra-550b-a55b:free", "hello world", 100);
  assertEq(r.known, true);
  assertEq(r.free, true);
  assertEq(r.estCostUsd, 0);
});
test("estimateCost: ':FREE' suffix is case-insensitive", () => {
  const r = estimateCost("Some/Model:FREE", "hello", 100);
  assertEq(r.known, true);
  assertEq(r.free, true);
  assertEq(r.estCostUsd, 0);
});
test("estimateCost: priced model is known and not free", () => {
  const r = estimateCost("gpt-4o-mini", "hello", 100);
  assertEq(r.known, true);
  assertEq(r.free, false);
});
  assertEq(r.estCostUsd, null);
});

test("formatUsd never misleads", () => {
  assertEq(formatUsd(0.0007644), "$0.0008");
  assertEq(formatUsd(0.02), "$0.02");
  assertEq(formatUsd(0), "$0.00");
  assertEq(formatUsd(null), "unknown");
});

/* ---------------- chat engine ---------------- */

function sseResponse(chunks, status = 200, headers = {}) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, { status, headers });
}

test("streamChat: accumulates tokens across awkwardly-split chunks", async () => {
  const a = new OpenAICompatibleAdapter();
  const chunks = [
    'data: {"choices":[{"delta":{"con',
    'tent":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]',
    "\n\n",
  ];
  const fakeFetch = async () => sseResponse(chunks);
  const seen = [];
  const { text } = await streamChat({
    adapter: a,
    config: cfg(),
    messages: [{ role: "user", content: "hi" }],
    model: "m",
    maxTokens: 10,
    fetchImpl: fakeFetch,
    onToken: (t, full) => seen.push([t, full]),
  });
  assertEq(text, "Hello world");
  assertEq(seen.map((s) => s[0]), ["Hello", " world"]);
  assertEq(seen[1][1], "Hello world");
});

test("streamChat: 429 retries with backoff then succeeds", async () => {
  const a = new OpenAICompatibleAdapter();
  let n = 0;
  const fakeFetch = async () => {
    n++;
    if (n === 1) return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
    return sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n']);
  };
  const { text } = await streamChat({
    adapter: a,
    config: cfg(),
    messages: [{ role: "user", content: "hi" }],
    model: "m",
    fetchImpl: fakeFetch,
  });
  assertEq(text, "ok");
  assertEq(n, 2, "retried once after 429");
});

test("streamChat: 401 -> invalid-key AIError", async () => {
  const a = new OpenAICompatibleAdapter();
  const fakeFetch = async () => new Response("bad", { status: 401 });
  try {
    await streamChat({ adapter: a, config: cfg(), messages: [], model: "m", fetchImpl: fakeFetch });
    throw new Error("should have thrown");
  } catch (e) {
    assertEq(e.code, "invalid-key");
  }
});

test("streamChat: network TypeError -> cors-blocked guidance", async () => {
  const a = new OpenAICompatibleAdapter();
  const fakeFetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    await streamChat({ adapter: a, config: cfg(), messages: [], model: "m", fetchImpl: fakeFetch });
    throw new Error("should have thrown");
  } catch (e) {
    assertEq(e.code, "cors-blocked");
  }
});

test("streamChat: user abort -> aborted, no partial save confusion", async () => {
  const a = new OpenAICompatibleAdapter();
  const fakeFetch = () => new Promise(() => {}); // hangs forever
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 20);
  try {
    await streamChat({
      adapter: a,
      config: cfg(),
      messages: [],
      model: "m",
      fetchImpl: fakeFetch,
      signal: ctrl.signal,
      timeoutMs: 5000,
    });
    throw new Error("should have thrown");
  } catch (e) {
    assertEq(e.code, "aborted");
  }
});

/* ---------------- reasoning models + empty-stream fallback ----------------
 * Regression tests for the free-reasoning-model bug: models that stream
 * only reasoning deltas (or nothing) and answer solely non-streaming.
 * Mocked fetch only — zero real API calls. */

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

test("parseSseEvent: reasoning_content delta -> reasoning type", () => {
  const a = new OpenAICompatibleAdapter();
  const r = a.parseSseEvent("", '{"choices":[{"delta":{"reasoning_content":"Let me think"}}]}');
  assertEq(r, { type: "reasoning", text: "Let me think" });
});

test("parseSseEvent: reasoning delta -> reasoning type", () => {
  const a = new OpenAICompatibleAdapter();
  const r = a.parseSseEvent("", '{"choices":[{"delta":{"reasoning":"Step 1"}}]}');
  assertEq(r, { type: "reasoning", text: "Step 1" });
});

test("parseSseEvent: content wins over reasoning when both present", () => {
  const a = new OpenAICompatibleAdapter();
  const r = a.parseSseEvent("", '{"choices":[{"delta":{"content":"answer","reasoning_content":"thought"}}]}');
  assertEq(r, { type: "token", text: "answer" });
});

test("parseJsonResponse: reasoning_content-only message -> text", () => {
  const a = new OpenAICompatibleAdapter();
  const r = a.parseJsonResponse({ choices: [{ message: { content: "", reasoning_content: "The answer is 42." } }] });
  assertEq(r.text, "The answer is 42.");
});

test("parseJsonResponse: content takes precedence over reasoning_content", () => {
  const a = new OpenAICompatibleAdapter();
  const r = a.parseJsonResponse({ choices: [{ message: { content: "Hi", reasoning_content: "thought" } }] });
  assertEq(r.text, "Hi");
});

test("streamChat: reasoning-only SSE stream reports reasoning, returns empty text", async () => {
  const a = new OpenAICompatibleAdapter();
  const sse = sseResponse(
    [
      'data: {"choices":[{"delta":{"reasoning_content":"Let me"}}]}\n\ndata: {"choices":[{"delta":{"reasoning_content":" think"}}]}\n\ndata: [DONE]\n\n',
    ],
    200,
    { "content-type": "text/event-stream" }
  );
  const calls = [];
  const fakeFetch = async (url, opts) => {
    // Non-streaming requests omit the stream field entirely, so compare
    // strictly against true.
    calls.push(JSON.parse(opts.body).stream === true);
    return calls[0] === true ? sse : jsonResponse({ choices: [{ message: { content: "" } }] });
  };
  const seen = [];
  const r = await streamChat({
    adapter: a,
    config: cfg(),
    messages: [{ role: "user", content: "hi" }],
    model: "m",
    fetchImpl: fakeFetch,
    onReasoning: (t, full) => seen.push([t, full]),
  });
  assertEq(r.text, "");
  assertEq(r.reasoning, "Let me think");
  assertEq(seen, [
    ["Let me", "Let me"],
    [" think", "Let me think"],
  ]);
  assertEq(calls, [true, false], "fallback still ran for the empty stream");
});

test("streamChat: empty SSE stream falls back to non-streaming (no JSON content-type gate)", async () => {
  const a = new OpenAICompatibleAdapter();
  const fakeFetch = async (url, opts) => {
    const stream = JSON.parse(opts.body).stream;
    if (stream) return sseResponse(["data: [DONE]\n\n"], 200, { "content-type": "text/event-stream" });
    return jsonResponse({ choices: [{ message: { content: "Hello from fallback" } }] });
  };
  const r = await streamChat({ adapter: a, config: cfg(), messages: [], model: "m", fetchImpl: fakeFetch });
  assertEq(r.text, "Hello from fallback");
  assertEq(r.reasoning, "");
});

test("streamChat: reasoning-only stream + non-streaming fallback returns both", async () => {
  const a = new OpenAICompatibleAdapter();
  const fakeFetch = async (url, opts) => {
    const stream = JSON.parse(opts.body).stream;
    if (stream)
      return sseResponse(
        ['data: {"choices":[{"delta":{"reasoning_content":"Step 1"}}]}\n\ndata: [DONE]\n\n'],
        200,
        { "content-type": "text/event-stream" }
      );
    return jsonResponse({ choices: [{ message: { content: "Final answer" } }] });
  };
  const r = await streamChat({ adapter: a, config: cfg(), messages: [], model: "m", fetchImpl: fakeFetch });
  assertEq(r.text, "Final answer");
  assertEq(r.reasoning, "Step 1");
});

test("streamChat: empty stream + empty fallback -> empty text, no throw", async () => {
  const a = new OpenAICompatibleAdapter();
  const fakeFetch = async (url, opts) => {
    const stream = JSON.parse(opts.body).stream;
    if (stream) return sseResponse(["data: [DONE]\n\n"], 200, { "content-type": "text/event-stream" });
    return jsonResponse({ choices: [{ message: { content: "" } }] });
  };
  const r = await streamChat({ adapter: a, config: cfg(), messages: [], model: "m", fetchImpl: fakeFetch });
  assertEq(r.text, "");
  assertEq(r.reasoning, "");
});

test("streamChat: fallback error propagates (model-not-found)", async () => {
  const a = new OpenAICompatibleAdapter();
  const fakeFetch = async (url, opts) => {
    const stream = JSON.parse(opts.body).stream;
    if (stream) return sseResponse(["data: [DONE]\n\n"], 200, { "content-type": "text/event-stream" });
    return new Response("no such model", { status: 404 });
  };
  try {
    await streamChat({ adapter: a, config: cfg(), messages: [], model: "m", fetchImpl: fakeFetch });
    throw new Error("should have thrown");
  } catch (e) {
    assertEq(e.code, "model-not-found");
  }
});
