/**
 * StudyPilot · BYOK provider registry and credential management.
 *
 * Security contract (non-negotiable):
 * - Requests go DIRECTLY from the browser to the provider. No proxy, no
 *   relay, no StudyPilot server (there isn't one).
 * - API keys are stored ENCRYPTED in this browser (IndexedDB) by default.
 *   The first key entry asks for an encryption passphrase ONCE, in the
 *   same form as the key; the passphrase derives a non-extractable device
 *   key (see ai/keystore.js) that auto-decrypts stored keys on later
 *   visits — no passphrase prompt, no key prompt. `save()` persists
 *   everything EXCEPT keys · the on-disk config record never contains
 *   key material, and key blobs (kv `ai_keys_enc`) never contain plaintext.
 * - Plaintext keys are never written to IndexedDB, localStorage, URLs,
 *   logs, or analytics.
 * - Key deletion purges memory AND any encrypted copy, with UI confirmation.
 *   Forgetting the LAST stored key also deletes the stored device key, so
 *   a fresh start asks for a passphrase again (see forgetKey).
 *
 * Security honesty: the passphrase protects the ciphertext at rest
 * (someone copying the stored ciphertext alone cannot decrypt without it)
 * and the derived key is non-extractable. It does NOT protect against
 * scripts running on the ExamElm origin or a fully compromised device,
 * which can use the stored key through the Crypto API.
 *
 * Legacy: keys stored by the old opt-in scheme (v:1 payloads, see
 * ai/crypto.js) are NEVER dropped. load() flags them
 * (legacyKeysPresent) and leaves the record untouched; they are migrated
 * to v:2 blobs only when the user happens to reuse their old passphrase
 * at first new-scheme setup (tryMigrateLegacy), and unlock() remains as
 * the legacy-only reader for a future one-off recovery.
 *
 * Per-provider direct-browser-access notes are honest: "verified",
 * "supported via header", or "unverified · use Test connection". Never claim
 * support that hasn't been verified.
 */

import { adapterFor, AIError, networkError } from "./adapters.js";
import { decryptString } from "./crypto.js";
import {
  getDeviceKey,
  createDeviceKey,
  deleteDeviceKey,
  encryptKey,
  decryptKey,
  keystoreAvailable,
} from "./keystore.js";

export const KV_PROVIDERS = "ai_providers"; // non-secret configs only
export const KV_KEYS_ENC = "ai_keys_enc"; // encrypted blobs only (v:2; legacy v:1 may be embedded)

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
    cors: "supported",
    corsNote:
      "Preflight probes from this site (curl, 2026-11-05) show OpenAI allows direct browser requests, but real-browser confirmation is still pending. If Test connection reports a block, check the console error.",
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

/**
 * One-line display string for a stored lastTest record, e.g.
 *   "Connected · 42 models listed · model gpt-4o-mini verified · 12:03"
 *   "Connected · 42 models listed · model xyz not in the provider's list · 12:03"
 *   "Connected (model list unavailable) · model xyz verified · 12:03"
 *   "Test failed · Invalid API key for OpenAI (HTTP 401). Check the key… · 12:03"
 * Time is HH:MM local. Returns "" for null/undefined input.
 * Pure function: no I/O, no em dashes.
 */
export function formatTestResult(lastTest) {
  if (!lastTest) return "";
  const at = lastTest.at ? new Date(lastTest.at) : new Date();
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;
  if (!lastTest.ok) {
    return `Test failed · ${lastTest.message || "Unknown error"} · ${time}`;
  }
  if (lastTest.listUnavailable) {
    const modelBit =
      lastTest.modelVerified && lastTest.model ? ` · model ${lastTest.model} verified` : "";
    return `Connected (model list unavailable)${modelBit} · ${time}`;
  }
  const countBit =
    typeof lastTest.models === "number" ? ` · ${lastTest.models} models listed` : "";
  let modelBit = "";
  if (lastTest.model) {
    if (lastTest.modelVerified === true) modelBit = ` · model ${lastTest.model} verified`;
    else if (lastTest.modelVerified === false)
      modelBit = ` · model ${lastTest.model} not in the provider's list`;
  }
  return `Connected${countBit}${modelBit} · ${time}`;
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
    // User-managed per-provider model list. Legacy configs (loaded before
    // this field existed) are migrated in load(); the fallback here only
    // covers an in-memory config that somehow lacks the field.
    models: Array.isArray(c.models)
      ? [...c.models]
      : c.defaultModel
        ? [c.defaultModel]
        : [],
    modelsCache: c.modelsCache || [],
    modelsCachedAt: c.modelsCachedAt || null,
    lastTest: c.lastTest || null,
    isDefault: !!c.isDefault,
    updatedAt: c.updatedAt || new Date().toISOString(),
  };
}

/** Max length of one model ID (matches the defaultModel cap in add()). */
export const MAX_MODEL_ID_LENGTH = 120;

/**
 * Validate + clean a model ID: non-empty after trimming, at most 120 chars.
 * Returns the trimmed ID. Throws a plain-language Error otherwise.
 */
function cleanModelId(modelId) {
  const clean = String(modelId || "").trim();
  if (!clean) throw new Error("Model ID is empty.");
  if (clean.length > MAX_MODEL_ID_LENGTH)
    throw new Error("Model ID must be 120 characters or fewer.");
  return clean;
}

/**
 * Normalise a models value into a clean list: an array of trimmed,
 * non-empty, at most 120-char IDs, exact-match deduped, order preserved.
 * Non-array input becomes []. Throws on an over-long entry.
 */
function cleanModelList(models) {
  if (!Array.isArray(models)) return [];
  const out = [];
  for (const m of models) {
    const clean = String(m || "").trim();
    if (!clean) continue;
    if (clean.length > MAX_MODEL_ID_LENGTH)
      throw new Error("Model ID must be 120 characters or fewer.");
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}

/**
 * Migration invariant for a loaded config (Step 3 data model):
 * - no `models` array yet -> [defaultModel] when one is set, else []
 * - defaultModel set but missing from `models` -> prepend it (the default
 *   is the provider's selected model, so it leads the list)
 * - defaultModel empty but `models` non-empty -> defaultModel = models[0]
 * Mutates and returns the config. Does NOT save (persist on next save()).
 */
function migrateModels(c) {
  if (!Array.isArray(c.models)) {
    c.models = c.defaultModel ? [c.defaultModel] : [];
  } else if (c.defaultModel && !c.models.includes(c.defaultModel)) {
    c.models = [c.defaultModel, ...c.models];
  }
  if (!c.defaultModel && c.models.length) c.defaultModel = c.models[0];
  return c;
}

/**
 * Invariant enforced after any patch to a config (update()):
 * - defaultModel, if non-empty, must be in `models` (appended if missing)
 * - defaultModel empty and `models` non-empty -> defaultModel = models[0]
 * Mutates and returns the config.
 */
function enforceModelInvariant(c) {
  if (!Array.isArray(c.models)) c.models = [];
  if (c.defaultModel && !c.models.includes(c.defaultModel)) {
    c.models = [...c.models, c.defaultModel];
  } else if (!c.defaultModel && c.models.length) {
    c.defaultModel = c.models[0];
  }
  return c;
}

export class ProviderStore {
  constructor(storage) {
    this.storage = storage; // openStorage() handle (kv store)
    this.configs = new Map(); // id -> config (no keys inside)
    this.keys = new Map(); // id -> apiKey (memory; auto-decrypted on load when stored)
    // Encrypted key storage state:
    //   "ready"            · a device key exists; keys auto-persist encrypted
    //   "needs-passphrase" · no device key yet; first setKey asks for one
    //   "unavailable"      · no IndexedDB / no Web Crypto; memory-only this tab
    this.keyStoreState = "unavailable";
    // Short honest string shown in the UI when keyStoreState is "unavailable".
    this.keyStoreNote = "";
    // True when a legacy v:1 payload is stored (never dropped; see
    // tryMigrateLegacy). Set by load(); cleared only by a successful migration.
    this.legacyKeysPresent = false;
    // In-memory handle on the stored device key (a CryptoKey, never its bytes).
    this._deviceKey = null;
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
      if (r && r.id && r.type && r.baseUrl !== undefined) {
        // Legacy configs have no `models` field · migrate in memory; the
        // migrated shape is persisted on the next save(), not here.
        this.configs.set(r.id, migrateModels({ ...r }));
      }
    }
    // Encrypted keys: auto-decrypt on load when a device key exists.
    // load() NEVER throws because of key handling — a corrupt blob skips
    // that one key, a device-key load failure falls through to
    // needs-passphrase/unavailable, and a legacy v:1 payload is flagged
    // and left untouched.
    this.keyStoreState = "unavailable";
    this.keyStoreNote = "";
    this.legacyKeysPresent = false;
    this._deviceKey = null;
    try {
      if (!keystoreAvailable(this.storage)) {
        this.keyStoreState = "unavailable";
        this.keyStoreNote =
          "Encrypted storage is unavailable in this browser. Keys are kept in memory for this tab only.";
      } else {
        const deviceKey = await getDeviceKey(this.storage);
        const { items, legacy } = await this._readKeyBlobs();
        if (legacy) this.legacyKeysPresent = true;
        if (deviceKey) {
          this._deviceKey = deviceKey;
          this.keyStoreState = "ready";
          for (const [id, blob] of Object.entries(items)) {
            if (!this.configs.has(id)) continue; // config deleted meanwhile · skip
            try {
              this.keys.set(id, await decryptKey(deviceKey, blob));
            } catch {
              /* one bad blob skips that key, never the whole load */
            }
          }
        } else {
          this.keyStoreState = "needs-passphrase";
        }
      }
    } catch {
      // Key handling is best-effort: fall back to asking for a passphrase.
      if (this.keyStoreState !== "unavailable") this.keyStoreState = "needs-passphrase";
      this._deviceKey = null;
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
      models: defaultModel ? [String(defaultModel).slice(0, 120)] : [],
      modelsCache: [],
      modelsCachedAt: null,
      lastTest: null,
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
    const allowed = ["name", "baseUrl", "defaultModel", "models", "modelsCache", "modelsCachedAt", "lastTest"];
    // Editing name, base URL or default model invalidates any earlier
    // verification: the stored test result no longer describes this config.
    // (A patch that itself carries a fresh lastTest wins over the clear.)
    if (["name", "baseUrl", "defaultModel"].some((k) => patch[k] !== undefined)) {
      c.lastTest = null;
    }
    const prevDefaultModel = c.defaultModel || "";
    const prevModels = JSON.stringify(Array.isArray(c.models) ? c.models : []);
    for (const k of allowed) {
      if (patch[k] !== undefined) {
        if (k === "baseUrl") {
          const v = String(patch[k]).replace(/\/+$/, "");
          if (!/^https?:\/\//i.test(v)) throw new Error("Base URL must start with http:// or https://");
          c[k] = v;
        } else if (k === "models") {
          c.models = cleanModelList(patch[k]);
        } else c[k] = patch[k];
      }
    }
    // Invariant: a non-empty defaultModel must be in `models` (appended
    // if missing); an empty defaultModel with models falls to models[0].
    enforceModelInvariant(c);
    // The models list changing also invalidates any earlier verification,
    // unless the patch itself carries a fresh lastTest (applied above, so
    // it survives this clear). Same for a defaultModel change that the
    // pre-clear above did not already cover (e.g. via the invariant).
    const modelsChanged = JSON.stringify(c.models) !== prevModels;
    const defaultChanged = (c.defaultModel || "") !== prevDefaultModel;
    if ((modelsChanged || defaultChanged) && patch.lastTest === undefined) {
      c.lastTest = null;
    }
    c.updatedAt = new Date().toISOString();
    await this.save();
    return c;
  }

  /**
   * Per-provider model management (Step 3 data model). All three persist
   * via save() and return the updated config. None of them touches the
   * provider config itself beyond the model list, its memory key, or its
   * encrypted copy — removeModel() in particular never deletes those.
   */

  /** Add one model ID to the provider's list (exact-match deduped). */
  async addModel(id, modelId) {
    const c = this.get(id);
    if (!c) throw new Error("Provider not found.");
    const clean = cleanModelId(modelId);
    if (!Array.isArray(c.models)) c.models = [];
    if (c.models.includes(clean)) return c; // already listed · dedupe, no-op
    c.models = [...c.models, clean];
    if (!c.defaultModel) c.defaultModel = clean; // first model becomes default
    c.updatedAt = new Date().toISOString();
    await this.save();
    return c;
  }

  /** Rename a model ID in place (order preserved); default follows. */
  async editModel(id, oldId, newId) {
    const c = this.get(id);
    if (!c) throw new Error("Provider not found.");
    const cleanNew = cleanModelId(newId);
    const models = Array.isArray(c.models) ? c.models : [];
    const idx = models.indexOf(String(oldId || "").trim());
    if (idx === -1) throw new Error("Model not found.");
    if (cleanNew !== models[idx] && models.includes(cleanNew))
      throw new Error("A model with that ID already exists.");
    c.models = models.map((m, i) => (i === idx ? cleanNew : m));
    if (c.defaultModel === models[idx]) c.defaultModel = cleanNew;
    c.updatedAt = new Date().toISOString();
    await this.save();
    return c;
  }

  /** Remove one model ID; default falls to the next model (or ""). */
  async removeModel(id, modelId) {
    const c = this.get(id);
    if (!c) throw new Error("Provider not found.");
    const clean = String(modelId || "").trim();
    const models = Array.isArray(c.models) ? c.models : [];
    if (!models.includes(clean)) throw new Error("Model not found.");
    c.models = models.filter((m) => m !== clean);
    if (c.defaultModel === clean) c.defaultModel = c.models[0] || "";
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
    // Routes through forgetKey so the device-key cleanup rule applies
    // (forgetting the last stored key also deletes the device key).
    await this.forgetKey(id);
    await this.save();
    // Keep exactly one default if any configs remain.
    const rest = this.list();
    if (rest.length && !rest.some((c) => c.isDefault)) {
      rest[0].isDefault = true;
      await this.save();
    }
  }

  /* ---------------- keys: auto-persisted encrypted ---------------- */

  /**
   * Set a key in memory and auto-persist it encrypted (unless the store
   * is unavailable, where it stays memory-only for this tab).
   * - state "ready": encrypts with the stored device key, no passphrase needed.
   * - state "needs-passphrase": `passphrase` is REQUIRED (at least 8
   *   characters); creates the device key, persists the key, then
   *   best-effort migrates any legacy v:1 keys (tryMigrateLegacy).
   * - state "unavailable": memory only, no throw.
   * Plaintext keys NEVER touch storage · verified by save()'s assertion
   * and by tests that scan the raw kv record.
   */
  async setKey(id, key, passphrase) {
    if (!this.configs.has(id)) throw new Error("Provider not found.");
    const k = String(key || "").trim();
    if (!k) throw new Error("Key is empty.");
    // Validate the passphrase BEFORE mutating anything: a refused setKey
    // leaves no trace (no memory key, no device key, no blob).
    if (this.keyStoreState === "needs-passphrase") {
      const p = String(passphrase || "");
      if (!p || p.length < 8)
        throw new Error("Enter an encryption passphrase (at least 8 characters).");
    }
    this.keys.set(id, k);
    if (this.keyStoreState === "ready" && this._deviceKey) {
      const { items, legacy } = await this._readKeyBlobs();
      items[id] = await encryptKey(this._deviceKey, k);
      await this._writeKeyBlobs(items, legacy);
    } else if (this.keyStoreState === "needs-passphrase") {
      const p = String(passphrase || "");
      this._deviceKey = await createDeviceKey(this.storage, p);
      this.keyStoreState = "ready";
      const { items, legacy } = await this._readKeyBlobs();
      items[id] = await encryptKey(this._deviceKey, k);
      await this._writeKeyBlobs(items, legacy);
      // Best-effort: a legacy v:1 payload migrates only when the user
      // happened to reuse their old passphrase here; otherwise it stays
      // stored (never dropped) and legacyKeysPresent stays true.
      await this.tryMigrateLegacy(p);
    }
    // "unavailable": memory only, nothing persisted.
  }

  getKey(id) {
    const k = this.keys.get(id);
    if (!k)
      throw new AIError(
        "invalid-key",
        "No API key is set for this provider. Add its key in Settings."
      );
    return k;
  }

  hasKey(id) {
    return this.keys.has(id);
  }

  /**
   * Forget a key: deletes it from memory AND its encrypted blob.
   *
   * FORGET RULE: when the last stored key is forgotten, the stored device
   * key + salt are ALSO deleted and the state returns to
   * "needs-passphrase", so a fresh start asks for a passphrase again.
   * (A stored legacy v:1 payload is not a v:2 key and never triggers
   * this; it stays stored until a successful migration.)
   */
  async forgetKey(id) {
    this.keys.delete(id);
    const { items, legacy } = await this._readKeyBlobs();
    if (items[id]) {
      delete items[id];
      await this._writeKeyBlobs(items, legacy);
    }
    if (Object.keys(items).length === 0 && this.keyStoreState === "ready") {
      try {
        await deleteDeviceKey(this.storage);
      } catch {
        /* already gone */
      }
      this._deviceKey = null;
      this.keyStoreState = "needs-passphrase";
    }
  }

  forgetAllKeys() {
    this.keys.clear();
  }

  /**
   * Read the v:2 key-blob record. Returns { items, legacy } where items
   * is the id -> v:2 blob map ({} when none) and legacy is the untouched
   * v:1 payload when one is stored (null otherwise — either as its own
   * v:1 record, or embedded in a v:2 record's `legacy` field after a new
   * key was persisted while migration had not yet succeeded). Never throws.
   */
  async _readKeyBlobs() {
    try {
      const rec = await this.storage.get("kv", KV_KEYS_ENC);
      const v = rec && rec.value;
      if (!v || typeof v !== "object") return { items: {}, legacy: null };
      if (v.v === 2) {
        return {
          items: v.items && typeof v.items === "object" ? { ...v.items } : {},
          legacy: v.legacy && typeof v.legacy === "object" ? v.legacy : null,
        };
      }
      if (v.v === 1) return { items: {}, legacy: v };
      return { items: {}, legacy: null };
    } catch {
      return { items: {}, legacy: null };
    }
  }

  /**
   * Write the v:2 key-blob record. `legacy` (when given) is carried along
   * untouched in the record's `legacy` field so a not-yet-migrated v:1
   * payload is never dropped by writing a new key. Deletes the whole
   * record when there are neither blobs nor a legacy payload left.
   */
  async _writeKeyBlobs(items, legacy) {
    const hasItems = items && Object.keys(items).length > 0;
    if (!hasItems && !legacy) {
      try {
        await this.storage.del("kv", KV_KEYS_ENC);
      } catch {
        /* already gone */
      }
      return;
    }
    const value = { v: 2, items: { ...(items || {}) } };
    if (legacy) value.legacy = legacy;
    await this.storage.put("kv", { key: KV_KEYS_ENC, value });
  }

  /**
   * LEGACY-ONLY reader for v:1 payloads (the old opt-in scheme). Kept so
   * keys stored before the auto-persist change can be recovered or
   * migrated; new keys never go through here. Wrong passphrase fails
   * closed (decryptString throws; nothing is left half-loaded).
   */
  async unlock(passphrase) {
    const { legacy } = await this._readKeyBlobs();
    if (!legacy || !legacy.items || Object.keys(legacy.items).length === 0)
      throw new Error("No encrypted keys are stored on this device.");
    // Atomic: decrypt everything first, commit to memory only on full
    // success — a failure halfway must not leave half the keys loaded.
    const pending = new Map();
    for (const [id, blob] of Object.entries(legacy.items)) {
      if (!this.configs.has(id)) continue; // config deleted meanwhile · skip
      pending.set(id, await decryptString(blob, passphrase)); // throws on wrong passphrase
    }
    const loaded = [];
    for (const [id, key] of pending) {
      this.keys.set(id, key);
      loaded.push(id);
    }
    return loaded;
  }

  /**
   * Migrate legacy v:1 keys to v:2 blobs under the current device key.
   * Only runs when legacyKeysPresent is true. On success each migrated
   * key is re-stored as a v:2 blob, the legacy payload is dropped and
   * legacyKeysPresent becomes false; returns the migrated ids. On ANY
   * failure (wrong passphrase, tampered data, no device key yet) returns
   * [] and leaves the legacy record FULLY intact. Never throws.
   *
   * Decision (see KNOWN-ISSUES.md): legacy keys migrate only when the
   * user happens to reuse their old passphrase at first new-scheme
   * setup; otherwise they stay stored (not dropped) and this store-level
   * unlock() path remains for a future one-off recovery.
   */
  async tryMigrateLegacy(passphrase) {
    if (!this.legacyKeysPresent || !this._deviceKey) return [];
    try {
      // A key already stored as a v:2 blob (e.g. just entered, possibly a
      // rotation) wins over its legacy copy: snapshot it before unlock()
      // loads the legacy key into memory, then restore it.
      const before = await this._readKeyBlobs();
      const protectedIds = new Set(Object.keys(before.items));
      const savedMemory = new Map();
      for (const id of protectedIds) {
        if (this.keys.has(id)) savedMemory.set(id, this.keys.get(id));
      }
      const migrated = await this.unlock(passphrase);
      if (!migrated.length) return [];
      for (const [id, key] of savedMemory) this.keys.set(id, key);
      const { items } = await this._readKeyBlobs();
      for (const id of migrated) {
        if (items[id]) continue; // fresh key already stored · legacy copy loses
        const key = this.keys.get(id);
        if (key) items[id] = await encryptKey(this._deviceKey, key);
      }
      // Legacy payload dropped (items survive); delete the whole record
      // only when nothing remains — handled by _writeKeyBlobs.
      await this._writeKeyBlobs(items, null);
      this.legacyKeysPresent = false;
      return migrated;
    } catch {
      return [];
    }
  }

  /* ---------------- discovery & connection test ---------------- */

  adapterForConfig(config) {
    return adapterFor(config.type);
  }

  /**
   * One tiny non-streaming completion, used to verify a provider whose
   * model-list endpoint is unavailable (404) or absent. Returns the parsed
   * completion ({text}); throws the mapped AIError on failure, including
   * model-not-found when the model itself is wrong.
   */
  async _tinyCompletionCheck(withKey, model, fetchImpl) {
    const adapter = this.adapterForConfig(withKey);
    const f = fetchImpl || globalThis.fetch;
    const info = adapter.requestInfo(withKey, {
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      model: model || "default",
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
    return adapter.parseJsonResponse(await res.json().catch(() => ({})));
  }

  /**
   * Test a provider connection and validate the model.
   *
   * testConnection(id, fetchImpl, model), where model is optional and defaults
   * to config.defaultModel. Returns:
   *   { ok:true, models:N, modelVerified:true|false|null,
   *     listUnavailable:false, model, message }
   * where modelVerified is null when no model was given to check, and
   * `model` is the model that was checked (or null).
   * When the list endpoint 404s, falls back to a tiny completion and
   * returns { ok:true, models:null, modelVerified:true,
   * listUnavailable:true, model, message } ("Connected (model list
   * unavailable)"). Any other non-OK list response throws the mapped error.
   * Every outcome (success or failure) is stored as config.lastTest and
   * persisted, so the UI can render it after a re-render.
   */
  async testConnection(id, fetchImpl, model) {
    const config = this.get(id);
    if (!config) throw new Error("Provider not found.");
    const modelToCheck =
      model !== undefined && model !== null && String(model) !== ""
        ? String(model)
        : config.defaultModel || "";
    const f = fetchImpl || globalThis.fetch;

    const record = async (result) => {
      try {
        await this.update(id, { lastTest: result });
      } catch {
        /* best-effort: a failed persist must not mask the test outcome */
      }
    };

    try {
      const key = this.getKey(id); // friendly error when missing
      const adapter = this.adapterForConfig(config);
      const withKey = { ...config, apiKey: key };

      const modelsReq = adapter.listModelsRequest(withKey);
      if (modelsReq) {
        let res;
        try {
          res = await f(modelsReq.url, { method: "GET", headers: modelsReq.headers });
        } catch {
          throw networkError(adapter.label);
        }
        if (!res.ok) {
          if (res.status === 404) {
            // Model listing unsupported · verify with a tiny completion.
            await this._tinyCompletionCheck(withKey, modelToCheck, f);
            const result = {
              ok: true,
              models: null,
              modelVerified: modelToCheck ? true : null,
              listUnavailable: true,
              model: modelToCheck || null,
              message: modelToCheck
                ? `Connected (model list unavailable) · model ${modelToCheck} verified`
                : "Connected (model list unavailable)",
              at: Date.now(),
            };
            await record(result);
            return result;
          }
          const body = await res.text().catch(() => "");
          throw adapter.mapHttpError(res.status, body);
        }
        const models = adapter.parseModelList(await res.json().catch(() => ({})));
        const modelVerified = modelToCheck ? models.includes(modelToCheck) : null;
        await this.update(id, {
          modelsCache: models.slice(0, 200),
          modelsCachedAt: new Date().toISOString(),
        });
        const result = {
          ok: true,
          models: models.length,
          modelVerified,
          listUnavailable: false,
          model: modelToCheck || null,
          message: modelToCheck
            ? modelVerified
              ? `Connected · ${models.length} models listed · model ${modelToCheck} verified`
              : `Connected · ${models.length} models listed · model ${modelToCheck} not in the provider's list`
            : `Connected · ${models.length} models listed`,
          at: Date.now(),
        };
        await record(result);
        return result;
      }

      // No list endpoint at all: verify with a tiny completion.
      await this._tinyCompletionCheck(withKey, modelToCheck, f);
      const result = {
        ok: true,
        models: null,
        modelVerified: modelToCheck ? true : null,
        listUnavailable: true,
        model: modelToCheck || null,
        message: modelToCheck
          ? `Connected (model list unavailable) · model ${modelToCheck} verified`
          : "Connected (model list unavailable)",
        at: Date.now(),
      };
      await record(result);
      return result;
    } catch (err) {
      const failure = {
        ok: false,
        models: null,
        modelVerified: null,
        listUnavailable: false,
        model: modelToCheck || null,
        message: err && err.message ? err.message : String(err),
        at: Date.now(),
      };
      await record(failure);
      throw err;
    }
  }

  async discoverModels(id, fetchImpl) {
    const r = await this.testConnection(id, fetchImpl);
    const c = this.get(id);
    return { count: r.models, models: (c && c.modelsCache) || [] };
  }
}
