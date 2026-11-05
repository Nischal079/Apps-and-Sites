/**
 * StudyPilot · Web Crypto helpers for BYOK credential storage.
 *
 * Security contract:
 * - API keys are encrypted at rest and stored in this browser's IndexedDB.
 *   First key entry asks for an encryption passphrase ONCE; the passphrase
 *   derives a device key (PBKDF2 210k iterations, SHA-256, random 16-byte
 *   salt) that is stored as a NON-EXTRACTABLE CryptoKey, so later visits
 *   decrypt automatically with no passphrase prompt.
 * - Plaintext keys are NEVER written to storage, logs, or URLs.
 * - Wrong passphrase / tampered data fails closed with a plain-language error.
 *
 * Honesty note (see also providers.js / keystore.js headers): the
 * passphrase protects the ciphertext at rest (someone copying the stored
 * ciphertext alone cannot decrypt without it) and the derived key is
 * non-extractable. It does NOT protect against scripts running on the
 * ExamElm origin or a fully compromised device, which can use the stored
 * key through the Crypto API.
 *
 * Two payload versions exist:
 * - v:1 (legacy, encryptString/decryptString): per-key salt, passphrase
 *   derived on every unlock. Kept ONLY so keys stored by the old opt-in
 *   scheme can be recovered/migrated; new keys never use it.
 * - v:2 (encryptWithKey/decryptWithKey): one stored device key, random
 *   12-byte IV per encryption. This is the current scheme.
 *
 * Uses globalThis.crypto (Web Crypto). Works in browsers and Node 19+.
 */

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function getCrypto() {
  const c = globalThis.crypto;
  if (!c || !c.subtle || !c.getRandomValues) {
    throw new Error(
      "Secure storage is unavailable: this browser does not support Web Crypto."
    );
  }
  return c;
}

function b64encode(bytes) {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(bin);
}

function b64decode(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(passphrase, salt) {
  const c = getCrypto();
  const enc = new TextEncoder();
  const base = await c.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return c.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a string. Returns {v:1, salt, iv, data} · all base64 except v.
 */
export async function encryptString(plaintext, passphrase) {
  if (!passphrase) throw new Error("A passphrase is required to encrypt.");
  const c = getCrypto();
  const salt = c.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = c.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt);
  const ct = await c.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    v: 1,
    salt: b64encode(salt),
    iv: b64encode(iv),
    data: b64encode(new Uint8Array(ct)),
  };
}

/**
 * Decrypt a payload from encryptString. Throws a plain-language error on
 * wrong passphrase or tampered data · never returns partial plaintext.
 */
export async function decryptString(payload, passphrase) {
  if (!passphrase) throw new Error("A passphrase is required to decrypt.");
  if (!payload || payload.v !== 1 || !payload.salt || !payload.iv || !payload.data) {
    throw new Error("Stored credentials are corrupted and cannot be read.");
  }
  const c = getCrypto();
  const key = await deriveAesKey(passphrase, b64decode(payload.salt));
  try {
    const pt = await c.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(payload.iv) },
      key,
      b64decode(payload.data)
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error(
      "Wrong passphrase, or the stored data was tampered with. Your keys were not revealed."
    );
  }
}

/** True when Web Crypto (subtle) is available in this environment. */
export function cryptoAvailable() {
  try {
    getCrypto();
    return true;
  } catch {
    return false;
  }
}

/* ---------------- device key (v:2 scheme) ---------------- */

/**
 * Derive the device key from a passphrase and a base64 salt (PBKDF2
 * 210k / SHA-256 / AES-GCM 256). The derived key is NON-EXTRACTABLE
 * (extractable=false) with usages ["encrypt","decrypt"]: it can be stored
 * in IndexedDB and used through the Crypto API, but its raw bytes can
 * never be read out. `saltB64` is the base64 salt produced by
 * randomSaltB64() or stored alongside the key.
 */
export async function deriveDeviceKey(passphrase, saltB64) {
  if (!passphrase) throw new Error("A passphrase is required to derive the device key.");
  if (!saltB64) throw new Error("A salt is required to derive the device key.");
  return deriveAesKey(passphrase, b64decode(saltB64));
}

/** Fresh random 16-byte salt, base64-encoded, for a new device key. */
export function randomSaltB64() {
  const c = getCrypto();
  return b64encode(c.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * Encrypt a string with an already-derived device key. Returns
 * {v:2, iv, data} · all base64 except v. Fresh random 12-byte IV per call.
 */
export async function encryptWithKey(plaintext, cryptoKey) {
  if (!cryptoKey) throw new Error("A device key is required to encrypt.");
  const c = getCrypto();
  const iv = c.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await c.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode(plaintext)
  );
  return { v: 2, iv: b64encode(iv), data: b64encode(new Uint8Array(ct)) };
}

/**
 * Decrypt a payload from encryptWithKey. Throws a plain-language error on
 * tampered data · never returns partial plaintext.
 */
export async function decryptWithKey(payload, cryptoKey) {
  if (!cryptoKey) throw new Error("A device key is required to decrypt.");
  if (!payload || payload.v !== 2 || !payload.iv || !payload.data) {
    throw new Error("Stored credentials are corrupted and cannot be read.");
  }
  const c = getCrypto();
  try {
    const pt = await c.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(payload.iv) },
      cryptoKey,
      b64decode(payload.data)
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error(
      "Stored credentials could not be decrypted. Your keys were not revealed."
    );
  }
}
