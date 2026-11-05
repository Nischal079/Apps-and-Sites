/**
 * ExamElm · device-key orchestration for automatic encrypted key storage.
 *
 * How it works: the FIRST time the user enters an API key, they also enter
 * an encryption passphrase (once, in the same form). The passphrase
 * derives a device key (PBKDF2 210k / SHA-256, non-extractable AES-GCM
 * 256) that is stored as a CryptoKey object in IndexedDB (kv record
 * `ai_device_key` = {v:2, salt, key}). On later visits the stored device
 * key is loaded and every stored key blob is decrypted automatically —
 * no passphrase prompt, no key prompt.
 *
 * Security honesty: the passphrase protects the ciphertext at rest
 * (someone copying the stored ciphertext alone cannot decrypt without
 * it) and the derived key is non-extractable. It does NOT protect
 * against scripts running on the ExamElm origin or a fully compromised
 * device, which can use the stored key through the Crypto API. The
 * disclaimer text in the UI stays accurate to this.
 *
 * Backend gate: the device-key path runs ONLY when
 * `storage.backend === "indexeddb"`. The in-memory fallback backend
 * clones values via structuredClone/JSON, which MANGLES CryptoKey
 * objects, so the device key must never be stored against it — the
 * store then reports keyStoreState "unavailable" and keys stay in
 * memory for the tab only.
 */
import {
  cryptoAvailable,
  deriveDeviceKey,
  randomSaltB64,
  encryptWithKey,
  decryptWithKey,
} from "./crypto.js";

/** kv record holding the stored device key: {v:2, salt: <b64>, key: <CryptoKey>}. */
export const KV_DEVICE_KEY = "ai_device_key";

/**
 * True only when the device-key path can run: Web Crypto is available AND
 * the storage backend is real IndexedDB (the memory backend mangles
 * CryptoKey objects). Pure check, never throws.
 */
export function keystoreAvailable(storage) {
  try {
    return !!storage && storage.backend === "indexeddb" && cryptoAvailable();
  } catch {
    return false;
  }
}

/**
 * Load the stored device key, or null when there is none / it is unreadable.
 * Never throws outward — a corrupt record behaves exactly like no record.
 */
export async function getDeviceKey(storage) {
  try {
    const rec = await storage.get("kv", KV_DEVICE_KEY);
    const v = rec && rec.value;
    if (!v || v.v !== 2 || !v.salt || !v.key) return null;
    // A stored CryptoKey round-trips through IndexedDB intact; anything
    // else (a mangled clone, a plain object) is unusable.
    if (typeof v.key !== "object" || !v.key.algorithm) return null;
    return v.key;
  } catch {
    return null;
  }
}

/**
 * Derive a fresh device key from the passphrase (new random salt) and
 * store the record. Returns the derived CryptoKey. Throws on crypto or
 * storage failure — the caller reports it plainly.
 */
export async function createDeviceKey(storage, passphrase) {
  const salt = randomSaltB64();
  const key = await deriveDeviceKey(passphrase, salt);
  await storage.put("kv", { key: KV_DEVICE_KEY, value: { v: 2, salt, key } });
  return key;
}

/** Delete the stored device key + salt. Never throws. */
export async function deleteDeviceKey(storage) {
  try {
    await storage.del("kv", KV_DEVICE_KEY);
  } catch {
    /* already gone */
  }
}

/** Encrypt one API key with the device key. Returns a v:2 blob. */
export async function encryptKey(deviceKey, plaintext) {
  return encryptWithKey(plaintext, deviceKey);
}

/** Decrypt one v:2 blob with the device key. Throws on tampered data. */
export async function decryptKey(deviceKey, blob) {
  return decryptWithKey(blob, deviceKey);
}
