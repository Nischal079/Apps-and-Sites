/**
 * StudyPilot · BYOK chat engine (streaming).
 *
 * - Builds the request through the provider's adapter (no provider-specific
 *   code here).
 * - Streams server-sent events, calling onToken(text) per chunk.
 * - Cancellation: AbortController; user cancel and timeout share one signal.
 * - Retry: up to 2 automatic retries on rate-limit (429) honoring the
 *   Retry-After header, then the mapped AIError is thrown.
 * - CORS/network failures (fetch TypeError) become plain-language guidance.
 * - Nothing is logged; the key travels only in request headers.
 */

import { AIError, networkError } from "./adapters.js";

export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function retryAfterMs(res) {
  try {
    const h = res.headers && res.headers.get ? res.headers.get("retry-after") : null;
    const s = Number(h);
    if (Number.isFinite(s) && s >= 0) return Math.min(s, 120) * 1000;
  } catch {
    /* ignore */
  }
  return 0;
}

/**
 * Stateful SSE parser: feed() accepts arbitrary text chunks (they may split
 * mid-line or mid-event) and emits complete {event, data} pairs.
 */
export function createSseParser(onEvent) {
  let buf = "";
  return {
    feed(chunk) {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = "";
        const dataLines = [];
        for (const line of raw.split("\n")) {
          if (line.startsWith(":")) continue; // SSE comment / keepalive
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^\s/, ""));
        }
        // Comment-only blocks (keepalives) carry no payload · don't emit.
        if (dataLines.length || event) onEvent(event, dataLines.join("\n"));
      }
    },
    flush() {
      if (buf.trim()) {
        const lines = buf.split("\n");
        let event = "";
        const dataLines = [];
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^\s/, ""));
        }
        if (dataLines.length) onEvent(event, dataLines.join("\n"));
      }
      buf = "";
    },
  };
}

/**
 * Returns a promise that rejects when the AbortController fires, independent
 * of whether the awaited operation respects the signal. This guarantees
 * cancel/timeout always work, even against a fetch implementation that
 * ignores AbortSignals (a hung request must never wedge the UI).
 */
function abortRejected(ctrl) {
  return new Promise((_, reject) => {
    if (ctrl.signal.aborted) {
      reject(ctrl.signal.reason);
    } else {
      ctrl.signal.addEventListener("abort", () => reject(ctrl.signal.reason), {
        once: true,
      });
    }
  });
}

/**
 * Stream one chat completion.
 *
 * opts: { adapter, config (with apiKey), messages, model, maxTokens,
 *         signal (user abort), timeoutMs, fetchImpl, onToken, onUsage }
 * Returns { text, usage } · throws AIError on failure.
 */
export async function streamChat(opts) {
  const {
    adapter,
    config,
    messages,
    model,
    maxTokens,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl,
    onToken,
    onUsage,
  } = opts;
  const f = fetchImpl || globalThis.fetch;
  const info = adapter.requestInfo(config, { messages, model, maxTokens, stream: true });

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new AIError("timeout", `Request timed out after ${Math.round(timeoutMs / 1000)}s. The provider may be slow · try again.`)), timeoutMs);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer);
        throw new AIError("aborted", "Cancelled.");
      }
      signal.addEventListener("abort", () => ctrl.abort(new AIError("aborted", "Cancelled.")), { once: true });
    }

    let res;
    try {
      const fetchP = f(info.url, {
        method: "POST",
        headers: info.headers,
        body: JSON.stringify(info.body),
        signal: ctrl.signal,
      });
      // Swallow late rejections: if abort wins the race, the underlying fetch
      // may still reject later · it must not become an unhandled rejection.
      fetchP.catch(() => {});
      res = await Promise.race([fetchP, abortRejected(ctrl)]);
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof AIError) throw e; // our own abort(reason)
      if (e && e.name === "AbortError") throw new AIError("aborted", "Cancelled.");
      throw networkError(adapter.label); // TypeError => CORS or network
    }

    if (!res.ok) {
      clearTimeout(timer);
      const body = await res.text().catch(() => "");
      const mapped = adapter.mapHttpError(res.status, body);
      if (mapped.code === "rate-limited" && attempt < MAX_RETRIES) {
        attempt++;
        await sleep(retryAfterMs(res) || attempt * 2000);
        continue;
      }
      throw mapped;
    }

    // Stream the body.
    let text = "";
    let usage = null;
    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = createSseParser((event, data) => {
        const r = adapter.parseSseEvent(event, data);
        if (!r) return;
        if (r.type === "token" && r.text) {
          text += r.text;
          if (onToken) onToken(r.text, text);
        } else if (r.type === "usage") {
          usage = r;
          if (onUsage) onUsage(r);
        }
      });
      for (;;) {
        const readP = reader.read();
        readP.catch(() => {});
        const { done, value } = await Promise.race([readP, abortRejected(ctrl)]);
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
      parser.feed(decoder.decode());
      parser.flush();
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof AIError) throw e;
      if (e && e.name === "AbortError") throw new AIError("aborted", "Cancelled.");
      throw new AIError("network", `Stream interrupted: ${e && e.message ? e.message : e}`);
    }
    clearTimeout(timer);
    return { text, usage };
  }
}

/** One-shot non-streaming completion (used sparingly; streaming is default). */
export async function completeOnce(opts) {
  const { adapter, config, messages, model, maxTokens, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = opts;
  const f = fetchImpl || globalThis.fetch;
  const info = adapter.requestInfo(config, { messages, model, maxTokens, stream: false });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await f(info.url, {
      method: "POST",
      headers: info.headers,
      body: JSON.stringify(info.body),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    throw networkError(adapter.label);
  }
  clearTimeout(timer);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw adapter.mapHttpError(res.status, body);
  }
  return adapter.parseJsonResponse(await res.json().catch(() => ({})));
}
