/**
 * StudyPilot · BYOK provider adapters.
 *
 * Provider-independent architecture: every provider speaks through the same
 * normalized interface, so the chat UI never contains provider-specific code.
 *
 * Adapter contract:
 *   id, label
 *   capabilities: { streaming, modelListing, maxTokens }
 *   requestInfo(config, {messages, model, maxTokens, stream})
 *     -> { url, headers, body }          // exact fetch() inputs
 *   parseSseEvent(eventName, dataString)
 *     -> {type:'token',text} | {type:'done'} | {type:'usage',...} | null
 *   parseJsonResponse(json) -> { text }   // non-streaming calls
 *   mapHttpError(status, bodyText) -> AIError
 *   listModelsRequest(config) -> {url, headers} | null
 *   parseModelList(json) -> [modelId, ...]
 *
 * Messages use the normalized shape: [{role:'system'|'user'|'assistant', content}]
 *
 * SECURITY: keys travel only in request headers (Authorization / x-api-key /
 * x-goog-api-key) · never in URLs, never in logs. The page CSP allowlists
 * provider origins explicitly (see ai-chat/index.html); no wildcards.
 */

/** Normalized error with a machine-readable code and plain-language message. */
export class AIError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AIError";
    this.code = code; // invalid-key | rate-limited | model-not-found |
    // bad-request | cors-blocked | network | timeout | aborted | unknown
  }
}

function plainCorsGuidance(providerLabel) {
  return (
    `Could not reach ${providerLabel}. This usually means the request was blocked ` +
    `by the browser (CORS) or the network: the provider did not allow this page to ` +
    `call it directly. Check the provider's "Direct browser access" note in the ` +
    `provider list, verify the base URL, or point a custom endpoint at your own ` +
    `local relay. Nothing was sent and your key was not exposed.`
  );
}

export function networkError(providerLabel) {
  return new AIError("cors-blocked", plainCorsGuidance(providerLabel));
}

class BaseAdapter {
  constructor(id, label) {
    this.id = id;
    this.label = label;
    this.capabilities = { streaming: true, modelListing: false, maxTokens: true };
  }
  requestInfo(/* config, opts */) {
    throw new Error("not implemented");
  }
  parseSseEvent(/* eventName, dataString */) {
    return null;
  }
  parseJsonResponse(/* json */) {
    throw new Error("not implemented");
  }
  mapHttpError(status, bodyText) {
    return new AIError(
      "unknown",
      `Request failed (HTTP ${status}). ${String(bodyText || "").slice(0, 200)}`
    );
  }
  listModelsRequest(/* config */) {
    return null;
  }
  parseModelList(/* json */) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible adapter: OpenAI, OpenRouter, DeepSeek, OmniRoute, */
/* and any custom OpenAI-style endpoint.                               */
/* ------------------------------------------------------------------ */
export class OpenAICompatibleAdapter extends BaseAdapter {
  constructor(id = "openai-compatible", label = "OpenAI-compatible") {
    super(id, label);
    this.capabilities = { streaming: true, modelListing: true, maxTokens: true };
  }

  endpoint(config, path) {
    return config.baseUrl.replace(/\/+$/, "") + path;
  }

  authHeaders(config) {
    return { Authorization: "Bearer " + config.apiKey };
  }

  requestInfo(config, { messages, model, maxTokens, stream }) {
    const body = { model, messages: messages.map((m) => ({ role: m.role, content: m.content })) };
    if (maxTokens) body.max_tokens = maxTokens;
    if (stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }
    return {
      url: this.endpoint(config, "/chat/completions"),
      headers: { "Content-Type": "application/json", ...this.authHeaders(config) },
      body,
    };
  }

  parseSseEvent(_eventName, data) {
    const d = data.trim();
    if (!d) return null;
    if (d === "[DONE]") return { type: "done" };
    let json;
    try {
      json = JSON.parse(d);
    } catch {
      return null; // partial line · the stream parser re-buffers
    }
    const delta = json.choices && json.choices[0] && json.choices[0].delta;
    if (delta && typeof delta.content === "string" && delta.content) {
      return { type: "token", text: delta.content };
    }
    if (json.usage) {
      return {
        type: "usage",
        promptTokens: json.usage.prompt_tokens,
        completionTokens: json.usage.completion_tokens,
      };
    }
    return null;
  }

  parseJsonResponse(json) {
    const c = json.choices && json.choices[0];
    const text = c && c.message && typeof c.message.content === "string" ? c.message.content : "";
    return { text };
  }

  mapHttpError(status, bodyText) {
    const body = String(bodyText || "").slice(0, 300);
    if (status === 401)
      return new AIError(
        "invalid-key",
        `Invalid API key for ${this.label} (HTTP 401). Check the key and try Test connection. ${body}`
      );
    if (status === 429)
      return new AIError(
        "rate-limited",
        `Rate limited by ${this.label} (HTTP 429). Wait a moment and retry · the app backs off automatically. ${body}`
      );
    if (status === 404)
      return new AIError(
        "model-not-found",
        `Model not found on ${this.label} (HTTP 404). Check the model ID. ${body}`
      );
    if (status === 400)
      return new AIError("bad-request", `Request rejected by ${this.label} (HTTP 400). ${body}`);
    return super.mapHttpError(status, bodyText);
  }

  listModelsRequest(config) {
    return { url: this.endpoint(config, "/models"), headers: { ...this.authHeaders(config) } };
  }

  parseModelList(json) {
    const arr = json && Array.isArray(json.data) ? json.data : [];
    return arr.map((m) => m.id).filter((id) => typeof id === "string");
  }
}

/* ------------------------------------------------------------------ */
/* Anthropic Claude (native messages API).                             */
/* Direct browser access is supported by Anthropic when the             */
/* `anthropic-dangerous-direct-browser-access: true` header is sent.    */
/* ------------------------------------------------------------------ */
export const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicAdapter extends BaseAdapter {
  constructor() {
    super("anthropic", "Anthropic Claude");
    this.capabilities = { streaming: true, modelListing: true, maxTokens: true };
  }

  toAnthropicMessages(messages) {
    let system = undefined;
    const rest = [];
    for (const m of messages) {
      if (m.role === "system") {
        system = system ? system + "\n\n" + m.content : m.content;
      } else {
        rest.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
      }
    }
    return { system, rest };
  }

  requestInfo(config, { messages, model, maxTokens, stream }) {
    const { system, rest } = this.toAnthropicMessages(messages);
    const body = {
      model,
      max_tokens: maxTokens || 1024,
      messages: rest,
      ...(system ? { system } : {}),
      ...(stream ? { stream: true } : {}),
    };
    return {
      url: config.baseUrl.replace(/\/+$/, "") + "/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body,
    };
  }

  parseSseEvent(eventName, data) {
    const d = data.trim();
    if (!d) return null;
    if (eventName === "message_stop") return { type: "done" };
    let json;
    try {
      json = JSON.parse(d);
    } catch {
      return null;
    }
    if (eventName === "content_block_delta" && json.delta && json.delta.type === "text_delta") {
      return { type: "token", text: json.delta.text || "" };
    }
    if (eventName === "message_delta" && json.usage && json.usage.output_tokens) {
      return { type: "usage", completionTokens: json.usage.output_tokens };
    }
    return null;
  }

  parseJsonResponse(json) {
    const blocks = (json.content || []).filter((b) => b.type === "text");
    return { text: blocks.map((b) => b.text).join("") };
  }

  mapHttpError(status, bodyText) {
    const body = String(bodyText || "").slice(0, 300);
    if (status === 401)
      return new AIError(
        "invalid-key",
        `Invalid API key for Anthropic (HTTP 401). Check the key and try Test connection. ${body}`
      );
    if (status === 429)
      return new AIError(
        "rate-limited",
        `Rate limited by Anthropic (HTTP 429). Wait a moment and retry · the app backs off automatically. ${body}`
      );
    if (status === 404)
      return new AIError(
        "model-not-found",
        `Model not found on Anthropic (HTTP 404). Check the model ID. ${body}`
      );
    if (status === 400)
      return new AIError("bad-request", `Request rejected by Anthropic (HTTP 400). ${body}`);
    return super.mapHttpError(status, bodyText);
  }

  listModelsRequest(config) {
    return {
      url: config.baseUrl.replace(/\/+$/, "") + "/v1/models",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
    };
  }

  parseModelList(json) {
    const arr = json && Array.isArray(json.data) ? json.data : [];
    return arr.map((m) => m.id).filter((id) => typeof id === "string");
  }
}

/* ------------------------------------------------------------------ */
/* Google Gemini (native). Key travels in the x-goog-api-key header ·  */
/* never in the URL query string.                                      */
/* ------------------------------------------------------------------ */
export class GeminiAdapter extends BaseAdapter {
  constructor() {
    super("gemini", "Google Gemini");
    this.capabilities = { streaming: true, modelListing: true, maxTokens: true };
  }

  toGeminiContents(messages) {
    let systemInstruction = undefined;
    const contents = [];
    for (const m of messages) {
      if (m.role === "system") {
        const t = m.content;
        systemInstruction = systemInstruction
          ? { parts: [{ text: systemInstruction.parts[0].text + "\n\n" + t }] }
          : { parts: [{ text: t }] };
      } else {
        contents.push({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        });
      }
    }
    return { systemInstruction, contents };
  }

  requestInfo(config, { messages, model, maxTokens, stream }) {
    const { systemInstruction, contents } = this.toGeminiContents(messages);
    const method = stream ? "streamGenerateContent" : "generateContent";
    const body = {
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(maxTokens ? { generationConfig: { maxOutputTokens: maxTokens } } : {}),
    };
    return {
      url:
        config.baseUrl.replace(/\/+$/, "") +
        `/v1beta/models/${encodeURIComponent(model)}:${method}?alt=sse`,
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
      body,
    };
  }

  parseSseEvent(_eventName, data) {
    const d = data.trim();
    if (!d) return null;
    let json;
    try {
      json = JSON.parse(d);
    } catch {
      return null;
    }
    const parts =
      (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
    const text = parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .join("");
    if (text) return { type: "token", text };
    if (json.usageMetadata) {
      return {
        type: "usage",
        promptTokens: json.usageMetadata.promptTokenCount,
        completionTokens: json.usageMetadata.candidatesTokenCount,
      };
    }
    return null;
  }

  parseJsonResponse(json) {
    const parts =
      (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
    return {
      text: parts
        .filter((p) => typeof p.text === "string")
        .map((p) => p.text)
        .join(""),
    };
  }

  mapHttpError(status, bodyText) {
    const body = String(bodyText || "").slice(0, 300);
    if (status === 401)
      return new AIError("invalid-key", "Invalid API key for Google Gemini (HTTP 401). Check the key and try Test connection.");
    if (status === 400 && /API_KEY_INVALID/i.test(body))
      return new AIError(
        "invalid-key",
        `Invalid API key for Google Gemini (API_KEY_INVALID). Check the key and try Test connection.`
      );
    if (status === 429)
      return new AIError(
        "rate-limited",
        `Rate limited by Google Gemini (HTTP 429). Wait a moment and retry · the app backs off automatically. ${body}`
      );
    if (status === 404)
      return new AIError(
        "model-not-found",
        `Model not found on Google Gemini (HTTP 404). Check the model ID. ${body}`
      );
    if (status === 400)
      return new AIError("bad-request", `Request rejected by Google Gemini (HTTP 400). ${body}`);
    return super.mapHttpError(status, bodyText);
  }

  listModelsRequest(config) {
    return {
      url: config.baseUrl.replace(/\/+$/, "") + "/v1beta/models",
      headers: { "x-goog-api-key": config.apiKey },
    };
  }

  parseModelList(json) {
    const arr = json && Array.isArray(json.models) ? json.models : [];
    return arr
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter(Boolean);
  }
}

/** Factory: adapter instance for a provider type id. */
export function adapterFor(type) {
  switch (type) {
    case "anthropic":
      return new AnthropicAdapter();
    case "gemini":
      return new GeminiAdapter();
    case "openai-compatible":
    default:
      return new OpenAICompatibleAdapter(type, "OpenAI-compatible");
  }
}
