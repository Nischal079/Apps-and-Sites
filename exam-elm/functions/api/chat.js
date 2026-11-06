/**
 * ExamElm AI · Cloudflare Pages Function proxy (POST /api/chat).
 *
 * The site is otherwise static, so this is the one server-side piece:
 * it forwards chat completions to OpenRouter using the site's own key,
 * so users get a built-in free provider ("ExamElm", model "Examelm AI")
 * without entering any key of their own.
 *
 * Security contract (non-negotiable):
 * - The OpenRouter key lives ONLY as the Cloudflare Pages secret
 *   OPENROUTER_API_KEY (dashboard -> Pages -> apps-and-sites -> Settings
 *   -> Environment variables, Production). It is read from the Function
 *   environment here, never from the request, and never written to any
 *   file, test, commit, log, or message. The repo is public; a key in
 *   client code or the repo would be stolen immediately.
 * - FREE MODELS ONLY: only model ids ending in ":free" are forwarded.
 *   Anything else is rejected with 400. This is the enforcement point;
 *   the UI filtering is only the UX on top of it.
 * - Rate limiting is per IP: 10 requests/minute and 100/day. It is
 *   IN-MEMORY, so it is approximate per isolate (a Workers isolate
 *   holds its own counters; a burst spread across isolates can exceed
 *   it). KV or Durable Objects would harden it later; the upstream
 *   provider's own limits are the backstop. Documented honestly in
 *   files/examelm-ai-backend.md.
 * - POST only, same-origin only: no CORS headers are set, so only pages
 *   on this site can call it from a browser. Upstream errors are mapped
 *   to friendly messages without leaking the key or upstream internals.
 * - No request or response content is logged here.
 *
 * Request body: { model, messages, maxTokens?, stream? }
 *   messages: 1..50 items, { role: system|user|assistant, content }.
 *   maxTokens is clamped to 1..2048 (default 1024).
 * Response: the upstream SSE stream passed through when stream is true,
 *   otherwise the upstream JSON completion. A missing secret answers
 *   503 "ExamElm AI is not configured yet" (no key details).
 *
 * Pure helpers (validateChatRequest, isFreeModelId, createRateLimiter)
 * and handleChatRequest(request, env, deps) are exported so the node
 * test suite can exercise them with mocked fetch/env and zero real
 * API calls. onRequest is the only Pages Functions entry point.
 */

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const MAX_TOKENS_CAP = 2048;
export const MAX_TOKENS_DEFAULT = 1024;
export const RATE_LIMIT_PER_MINUTE = 10;
export const RATE_LIMIT_PER_DAY = 100;
export const MAX_MESSAGES = 50;
export const MAX_MESSAGE_CHARS = 20000;
export const MAX_TOTAL_CHARS = 100000;
export const MAX_MODEL_ID_LENGTH = 120;

/** True when the model id is a free OpenRouter variant (":free" suffix). */
export function isFreeModelId(id) {
  return typeof id === "string" && id.trim().toLowerCase().endsWith(":free");
}

class ProxyError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ProxyError";
    this.status = status;
  }
}

/**
 * Validate + clean a chat request body. Returns
 * { messages, model, maxTokens, stream } with messages reduced to
 * [{role, content}], maxTokens clamped to 1..2048 (default 1024), and
 * stream defaulting to false. Throws ProxyError(400) on anything invalid.
 */
export function validateChatRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProxyError(400, "Request body must be a JSON object.");
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ProxyError(400, "Provide at least one message.");
  }
  if (messages.length > MAX_MESSAGES) {
    throw new ProxyError(400, `Send at most ${MAX_MESSAGES} messages per request.`);
  }
  const roles = new Set(["system", "user", "assistant"]);
  let totalChars = 0;
  const clean = [];
  for (const m of messages) {
    if (!m || typeof m !== "object" || !roles.has(m.role)) {
      throw new ProxyError(400, "Each message needs a role of system, user, or assistant.");
    }
    if (typeof m.content !== "string" || !m.content.trim()) {
      throw new ProxyError(400, "Each message needs non-empty text content.");
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      throw new ProxyError(400, "One message is too long. Keep each message under 20,000 characters.");
    }
    totalChars += m.content.length;
    clean.push({ role: m.role, content: m.content });
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    throw new ProxyError(400, "The conversation is too long for one request. Start a new chat.");
  }
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) throw new ProxyError(400, "Provide a model ID.");
  if (model.length > MAX_MODEL_ID_LENGTH) {
    throw new ProxyError(400, "Model ID must be 120 characters or fewer.");
  }
  if (!isFreeModelId(model)) {
    throw new ProxyError(400, "ExamElm AI only offers free models (model IDs ending in :free).");
  }
  let maxTokens = MAX_TOKENS_DEFAULT;
  if (body.maxTokens !== undefined && body.maxTokens !== null) {
    const n = Number(body.maxTokens);
    if (!Number.isFinite(n)) throw new ProxyError(400, "maxTokens must be a number.");
    maxTokens = Math.max(1, Math.min(MAX_TOKENS_CAP, Math.floor(n)));
  }
  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    throw new ProxyError(400, "stream must be true or false.");
  }
  return { messages: clean, model, maxTokens, stream: body.stream === true };
}

/**
 * In-memory per-IP rate limiter. Windows are fixed (60s minute, 24h day)
 * per isolate; see the file header for why this is approximate.
 * check(ip, now) returns { allowed: true } or
 * { allowed: false, scope: "minute"|"day", retryAfterSeconds }.
 */
export function createRateLimiter({ perMinute = RATE_LIMIT_PER_MINUTE, perDay = RATE_LIMIT_PER_DAY } = {}) {
  const hits = new Map(); // ip -> { minuteStart, minuteCount, dayStart, dayCount }
  return {
    check(ip, now = Date.now()) {
      const key = String(ip || "unknown");
      let rec = hits.get(key);
      if (!rec) {
        rec = { minuteStart: now, minuteCount: 0, dayStart: now, dayCount: 0 };
        hits.set(key, rec);
      }
      if (now - rec.minuteStart >= 60000) {
        rec.minuteStart = now;
        rec.minuteCount = 0;
      }
      if (now - rec.dayStart >= 86400000) {
        rec.dayStart = now;
        rec.dayCount = 0;
      }
      if (rec.minuteCount >= perMinute) {
        return { allowed: false, scope: "minute", retryAfterSeconds: Math.ceil((rec.minuteStart + 60000 - now) / 1000) };
      }
      if (rec.dayCount >= perDay) {
        return { allowed: false, scope: "day", retryAfterSeconds: Math.ceil((rec.dayStart + 86400000 - now) / 1000) };
      }
      rec.minuteCount += 1;
      rec.dayCount += 1;
      return { allowed: true };
    },
    reset() {
      hits.clear();
    },
  };
}

/** Module-level limiter used by the live handler (tests inject their own). */
export const defaultLimiter = createRateLimiter();

function jsonResponse(obj, status, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function clientIp(request) {
  try {
    const h = request.headers;
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
  } catch {
    /* fall through */
  }
  return "unknown";
}

function mapUpstreamError(status, bodyText) {
  const body = String(bodyText || "").slice(0, 200);
  if (status === 429) {
    return {
      status: 429,
      message: "ExamElm AI is busy right now (fair-use limit). Wait a moment and retry.",
    };
  }
  if (status === 401 || status === 403) {
    // The site's key is rejected upstream: a server-side problem, never
    // the user's fault and never their key. Do not leak upstream detail.
    return { status: 502, message: "ExamElm AI is temporarily unavailable. Try again in a moment." };
  }
  if (status === 404) {
    return { status: 400, message: "That model is not available through ExamElm AI. Try another free model." };
  }
  if (status === 400) {
    return {
      status: 400,
      message: body ? `Request rejected by ExamElm AI (HTTP 400). ${body}` : "Request rejected by ExamElm AI (HTTP 400).",
    };
  }
  return { status: 502, message: "ExamElm AI is temporarily unavailable. Try again in a moment." };
}

/**
 * Handle one POST /api/chat request. `deps` is test-only:
 * { fetchImpl, limiter }. In production both default (global fetch,
 * module-level limiter).
 */
export async function handleChatRequest(request, env, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const limiter = deps.limiter || defaultLimiter;

  if (!request || request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }
  const apiKey = env && env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      { error: "ExamElm AI is not configured yet. The site owner needs to add the OpenRouter key in Cloudflare Pages settings." },
      503
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }
  let parsed;
  try {
    parsed = validateChatRequest(body);
  } catch (e) {
    if (e instanceof ProxyError) return jsonResponse({ error: e.message }, e.status);
    return jsonResponse({ error: "Invalid request." }, 400);
  }

  const limit = limiter.check(clientIp(request));
  if (!limit.allowed) {
    const message =
      limit.scope === "day"
        ? "ExamElm AI free daily limit reached for your network. Try again tomorrow."
        : "ExamElm AI free limit reached for now. Wait a minute and retry.";
    return jsonResponse({ error: message }, 429, {
      "retry-after": String(Math.max(1, limit.retryAfterSeconds || 60)),
    });
  }

  let upstream;
  try {
    upstream = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
        "HTTP-Referer": "https://apps-and-sites.pages.dev/",
        "X-Title": "ExamElm",
      },
      body: JSON.stringify({
        model: parsed.model,
        messages: parsed.messages,
        max_tokens: parsed.maxTokens,
        ...(parsed.stream
          ? { stream: true, stream_options: { include_usage: true } }
          : { stream: false }),
      }),
    });
  } catch {
    return jsonResponse({ error: "ExamElm AI is temporarily unavailable. Try again in a moment." }, 502);
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    const mapped = mapUpstreamError(upstream.status, text);
    const extra = {};
    if (mapped.status === 429) {
      try {
        const ra = upstream.headers && upstream.headers.get("retry-after");
        if (ra) extra["retry-after"] = ra;
      } catch {
        /* ignore */
      }
    }
    return jsonResponse({ error: mapped.message }, mapped.status, extra);
  }

  if (parsed.stream) {
    if (!upstream.body) {
      return jsonResponse({ error: "ExamElm AI is temporarily unavailable. Try again in a moment." }, 502);
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-store",
        "x-accel-buffering": "no",
      },
    });
  }
  const data = await upstream.json().catch(() => ({}));
  return jsonResponse(data, 200);
}

/** Pages Functions entry point: POST /api/chat only, same-origin only. */
export async function onRequest(context) {
  return handleChatRequest(context.request, context.env || {});
}
