/**
 * StudyPilot · BYOK provider registry and credential management.
 *
 * Security contract (non-negotiable):
 * - Requests go DIRECTLY from the browser to the provider. No proxy, no
 *   relay, no StudyPilot server (there isn't one).
 * - API keys live in MEMORY by default. `save()` persists everything EXCEPT
 *   keys · the on-disk record never contains key material.
 * - Optional opt-in: passphrase-encrypted key storage (see ai/crypto.js).
 *   Plaintext keys are never written to IndexedDB, localStorage, URLs,
 *   logs, or analytics.
 * - Key deletion purges memory AND any encrypted copy, with UI confirmation.
 *
 * Per-provider direct-browser-access notes are honest: "verified",
 * "supported via header", or "unverified · use Test connection". Never claim
 * support that hasn't been verified.
 */

import { adapterFor, AIError, networkError } from "./adapters.js";
import { encryptString, decryptString } from "./crypto.js";

export const KV_PROVIDERS = "ai_providers"; // non-secret configs only
export const KV_KEYS_ENC = "ai_keys_enc"; // encrypted blobs only, opt-in

/**
 * Built-in provider definitions. `cors` is one of:
 *  'blocked'   · provider sends no CORS headers; direct browser calls fail.
 *  'supported' · provider explicitly supports browser calls.
 *  'unverified'· unknown; the Test-connection button is the verification.
 */
export const BUILTINS = [
  {
    id: "openai",
    label: "OpenAI",
    type: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    cors: "blocked",
    corsNote:
      "Direct browser access is blocked: OpenAI's API sends no CORS headers, so browsers refuse the call. Use a custom endpoint pointed at your own local relay, or choose another provider below.",
    modelListing: true,
    docsUrl: "https://platform.openai.com/docs/api-reference",
    keyHelp: "Create a key at platform.openai.com → API keys. Billing is pay-as-you-go and separate from any ChatGPT subscription.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    type: "openai-compatible",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    cors: "supported",
    corsNote:
      "OpenRouter explicitly supports direct browser requests. Keys are per-account; billing is separate from any subscription.",
    modelListing: true,
    docsUrl: "https://openrouter.ai/docs",
    keyHelp: "Create a key at openrouter.ai → Keys. Add credits; models are billed per token by the underlying provider.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    type: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    cors: "unverified",
    corsNote:
      "DeepSeek's browser (CORS) support is unverified · press Test connection. If the browser blocks it, use a custom endpoint pointed at your own local relay.",
    modelListing: true,
    docsUrl: "https://api-docs.deepseek.com",
    keyHelp: "Create a key at platform.deepseek.com → API keys.",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    type: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    cors: "supported",
    corsNote:
      "Direct browser access is supported: the app sends Anthropic's required browser-access header automatically. Billing is pay-as-you-go and separate from any Claude subscription.",
    modelListing: true,
    docsUrl: "https://docs.anthropic.com/en/api",
    keyHelp: "Create a key at console.anthropic.com → API keys.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    type: "gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    cors: "unverified",
    corsNote:
      "Browser requests with an API-key header are reported to work, but verify with Test connection. The key is sent in a request header, never in the URL. Billing is separate from any Gemini/ Google One subscription.",
    modelListing: true,
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    keyHelp: "Create a key at aistudio.google.com → Get API key.",
  },
  {
    id: "custom",
    label: "Custom endpoint",
    type: "openai-compatible",
    defaultBaseUrl: "",
    cors: "unverified",
    corsNote:
      "Your own OpenAI-compatible relay or local gateway (for example a small server you run that forwards to a provider). It must send CORS headers allowing this page's origin. NOTE: this page's Content Security Policy currently allowlists only the built-in provider domains above · a custom domain will be blocked by the browser until a future update. Tracked as a known limitation.",
    modelListing: true,
    docsUrl: "",
    keyHelp: "Enter the base URL of your relay (e.g. http://localhost:8787/v1) and the key it expects, if any.",
  },
];

export function builtinById(id) {
  return BUILTINS.find((b) => b.id === id) || null;
}

function uid() {
  return (
    "prv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10)
  );
}

function publicConfig(c) {
  // Everything EXCEPT the key · safe to persist.
  return {
    id: c.id,
    name: c.name,
    builtinId: c.builtinId,
    type: c.type,
    baseUrl: c.baseUrl,
    defaultModel: c.defaultModel || "",
    modelsCache: c.modelsCache || [],
    modelsCachedAt: c.modelsCachedAt || null,
    isDefault: !!c.isDefault,
    updatedAt: c.updatedAt || new Date().toISOString(),
  };
}

export class ProviderStore {
  constructor(storage) {
    this.storage = storage; // openStorage() handle (kv store)
    this.configs = new Map(); // id -> config (no keys inside)
    this.keys = new Map(); // id -> apiKey (MEMORY ONLY)
    this.encryptedAtRest = false;
  }

  /* ---------------- configs (non-secret, persisted) ---------------- */

  async load() {
    this.configs.clear();
    let rows = [];
    try {
      const rec = await this.storage.get("kv", KV_PROVIDERS);
      rows = (rec && rec.value) || [];
    } catch {
      rows = [];
    }
    for (const r of rows) {
      if (r && r.id && r.type && r.baseUrl !== undefined) this.configs.set(r.id, { ...r });
    }
    // Encrypted-keys marker (presence only · never the keys).
    try {
      const enc = await this.storage.get("kv", KV_KEYS_ENC);
      this.encryptedAtRest = !!(enc && enc.value && enc.value.items);
    } catch {
      this.encryptedAtRest = false;
    }
    return [...this.configs.values()];
  }

  async save() {
    const rows = [...this.configs.values()].map(publicConfig);
    // Paranoia: assert no key material sneaks into the persisted record.
    for (const r of rows) {
      if ("apiKey" in r || "key" in r) throw new Error("Refusing to persist key material.");
    }
    await this.storage.put("kv", { key: KV_PROVIDERS, value: rows });
  }

  list() {
    return [...this.configs.values()];
  }

  get(id) {
    return this.configs.get(id) || null;
  }

  getDefault() {
    return this.list().find((c) => c.isDefault) || this.list()[0] || null;
  }

  async add({ name, builtinId, baseUrl, defaultModel }) {
    const builtin = builtinById(builtinId);
    if (!builtin) throw new Error("Unknown provider type.");
    const cleanBase = String(baseUrl || builtin.defaultBaseUrl).replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(cleanBase))
      throw new Error("Base URL must start with http:// or https://");
    const id = uid();
    const config = {
      id,
      name: String(name || "").trim().slice(0, 60) || builtin.label,
      builtinId: builtin.id,
      type: builtin.type,
      baseUrl: cleanBase,
      defaultModel: String(defaultModel || "").slice(0, 120),
      modelsCache: [],
      modelsCachedAt: null,
      isDefault: this.configs.size === 0,
      updatedAt: new Date().toISOString(),
    };
    this.configs.set(id, config);
    await this.save();
    return config;
  }

  async update(id, patch) {
    const c = this.get(id);
    if (!c) throw new Error("Provider not found.");
    const allowed = ["name", "baseUrl", "defaultModel", "modelsCache", "modelsCachedAt"];
    for (const k of allowed) {
      if (patch[k] !== undefined) {
        if (k === "baseUrl") {
          const v = String(patch[k]).replace(/\/+$/, "");
          if (!/^https?:\/\//i.test(v)) throw new Error("Base URL must start with http:// or https://");
          c[k] = v;
        } else c[k] = patch[k];
      }
    }
    c.updatedAt = new Date().toISOString();
    await this.save();
    return c;
  }

  async setDefault(id) {
    for (const c of this.configs.values()) c.isDefault = c.id === id;
    await this.save();
  }

  /** Remove a config AND purge its key from memory and encrypted storage. */
  async remove(id) {
    this.configs.delete(id);
    this.keys.delete(id);
    await this._removeEncryptedKey(id);
    await this.save();
    // Keep exactly one default if any configs remain.
    const rest = this.list();
    if (rest.length && !rest.some((c) => c.isDefault)) {
      rest[0].isDefault = true;
      await this.save();
    }
  }

  /* ---------------- keys: memory by default ---------------- */

  setKey(id, key) {
    if (!this.configs.has(id)) throw new Error("Provider not found.");
    const k = String(key || "").trim();
    if (!k) throw new Error("Key is empty.");
    this.keys.set(id, k);
  }

  getKey(id) {
    const k = this.keys.get(id);
    if (!k)
      throw new AIError(
        "invalid-key",
        "No API key is set for this provider. Enter the key (kept in memory only) or unlock encrypted storage."
      );
    return k;
  }

  hasKey(id) {
    return this.keys.has(id);
  }

  forgetKey(id) {
    this.keys.delete(id);
  }

  forgetAllKeys() {
    this.keys.clear();
  }

  /* ---------------- optional encrypted persistence ---------------- */

  /**
   * Encrypt every in-memory key with the passphrase and store the blobs.
   * Plaintext keys NEVER touch storage · verified by save()'s assertion and
   * by tests that scan the raw kv record.
   */
  async persistEncrypted(passphrase) {
    if (!passphrase) throw new Error("A passphrase is required.");
    if (this.keys.size === 0) throw new Error("No keys in memory to store.");
    const items = {};
    for (const [id, key] of this.keys) {
      if (!this.configs.has(id)) continue;
      items[id] = await encryptString(key, passphrase);
    }
    await this.storage.put("kv", { key: KV_KEYS_ENC, value: { v: 1, items } });
    this.encryptedAtRest = true;
  }

  /** Decrypt stored keys into memory. Wrong passphrase fails closed. */
  async unlock(passphrase) {
    const rec = await this.storage.get("kv", KV_KEYS_ENC);
    const payload = rec && rec.value;
    if (!payload || !payload.items || Object.keys(payload.items).length === 0)
      throw new Error("No encrypted keys are stored on this device.");
    const loaded = [];
    for (const [id, blob] of Object.entries(payload.items)) {
      if (!this.configs.has(id)) continue; // config deleted meanwhile · skip
      const key = await decryptString(blob, passphrase); // throws on wrong passphrase
      this.keys.set(id, key);
      loaded.push(id);
    }
    return loaded;
  }

  /** Wipe memory keys AND the encrypted copy. UI must confirm first. */
  async wipeEncrypted() {
    this.forgetAllKeys();
    try {
      await this.storage.del("kv", KV_KEYS_ENC);
    } catch {
      /* already gone */
    }
    this.encryptedAtRest = false;
  }

  async _removeEncryptedKey(id) {
    try {
      const rec = await this.storage.get("kv", KV_KEYS_ENC);
      if (rec && rec.value && rec.value.items && rec.value.items[id]) {
        delete rec.value.items[id];
        if (Object.keys(rec.value.items).length === 0) {
          await this.storage.del("kv", KV_KEYS_ENC);
          this.encryptedAtRest = false;
        } else {
          await this.storage.put("kv", { key: KV_KEYS_ENC, value: rec.value });
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  /* ---------------- discovery & connection test ---------------- */

  adapterForConfig(config) {
    return adapterFor(config.type);
  }

  /** Minimal cheap call: list models where supported, else a tiny completion. */
  async testConnection(id, fetchImpl) {
    const config = this.get(id);
    if (!config) throw new Error("Provider not found.");
    const key = this.getKey(id); // friendly error when missing
    const adapter = this.adapterForConfig(config);
    const withKey = { ...config, apiKey: key };
    const f = fetchImpl || globalThis.fetch;

    const modelsReq = adapter.listModelsRequest(withKey);
    if (modelsReq) {
      let res;
      try {
        res = await f(modelsReq.url, { method: "GET", headers: modelsReq.headers });
      } catch {
        throw networkError(adapter.label);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw adapter.mapHttpError(res.status, body);
      }
      const models = adapter.parseModelList(await res.json().catch(() => ({})));
      await this.update(id, { modelsCache: models.slice(0, 200), modelsCachedAt: new Date().toISOString() });
      return { ok: true, models: models.length };
    }

    // Fallback: one tiny non-streaming completion.
    const info = adapter.requestInfo(withKey, {
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      model: config.defaultModel || "default",
      maxTokens: 8,
      stream: false,
    });
    let res;
    try {
      res = await f(info.url, {
        method: "POST",
        headers: info.headers,
        body: JSON.stringify(info.body),
      });
    } catch {
      throw networkError(adapter.label);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw adapter.mapHttpError(res.status, body);
    }
    return { ok: true, models: 0 };
  }

  async discoverModels(id, fetchImpl) {
    const r = await this.testConnection(id, fetchImpl);
    const c = this.get(id);
    return { count: r.models, models: (c && c.modelsCache) || [] };
  }
}
