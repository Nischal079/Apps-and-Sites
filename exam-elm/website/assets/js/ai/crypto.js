/**
 * StudyPilot — Web Crypto helpers for BYOK credential storage.
 *
 * Security contract:
 * - API keys are held in MEMORY by default and never touch disk.
 * - Optional opt-in persistence: each key is encrypted with a key derived
 *   from the user's passphrase via PBKDF2 (210k iterations, SHA-256, random
 *   16-byte salt) using AES-GCM (256-bit, random 12-byte IV).
 * - Plaintext keys are NEVER written to storage, logs, or URLs.
 * - Wrong passphrase / tampered data fails closed with a plain-language error.
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
 * Encrypt a string. Returns {v:1, salt, iv, data} — all base64 except v.
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
 * wrong passphrase or tampered data — never returns partial plaintext.
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
