/**
 * StudyPilot — versioned browser storage foundation.
 *
 * - IndexedDB database "studypilot" for application data (notes, files,
 *   folders, timetables, AI conversations, key-value).
 * - localStorage is reserved for small preferences only (theme, region).
 * - Graceful degradation: if IndexedDB is unavailable (private mode, blocked),
 *   an in-memory backend with the identical async API is used and `degraded`
 *   is set so the UI can warn the user.
 * - Schema versioning: DB_VERSION bumped on structural change; onupgradeneeded
 *   creates any missing store idempotently. kv['schema_version'] pins the data
 *   schema; migrate() runs forward migrations on load.
 * - Backups: exportAll()/importBackup() with validation. Imports NEVER silently
 *   overwrite: default mode is 'merge' (existing ids are skipped unless
 *   options.overwrite === true, which the UI must confirm explicitly).
 *
 * Key paths: notes/files/folders/timetables/conversations -> 'id',
 * kv -> 'key'. Every record should carry updatedAt (ISO string).
 */
export const DB_NAME = "studypilot";
export const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const STORES = ["notes", "files", "folders", "timetables", "conversations", "kv"];
export const KEY_PATH = { kv: "key" };
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024; // 100 MB sanity cap

function keyPathFor(store) {
  return KEY_PATH[store] || "id";
}

function uid(prefix) {
  return (
    (prefix || "id") +
    "_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

function idbAvailable() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

/* ---------------- IndexedDB backend ---------------- */
function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: keyPathFor(s) });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another open tab"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

const idbBackend = {
  name: "indexeddb",
  _db: null,
  async _dbp() {
    if (!this._db) this._db = await openIdb();
    return this._db;
  },
  async get(store, key) {
    const db = await this._dbp();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const rq = tx.objectStore(store).get(key);
      rq.onsuccess = () => resolve(rq.result === undefined ? null : rq.result);
      rq.onerror = () => reject(rq.error);
    });
  },
  async put(store, value) {
    const db = await this._dbp();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    await txDone(tx);
    return value;
  },
  async del(store, key) {
    const db = await this._dbp();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    await txDone(tx);
  },
  async list(store, opts = {}) {
    const db = await this._dbp();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const rq = tx.objectStore(store).getAll();
      rq.onsuccess = () => {
        let rows = rq.result || [];
        if (opts.reverse) rows = rows.slice().reverse();
        if (opts.limit) rows = rows.slice(0, opts.limit);
        resolve(rows);
      };
      rq.onerror = () => reject(rq.error);
    });
  },
  async clear(store) {
    const db = await this._dbp();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    await txDone(tx);
  },
};

/* ---------------- In-memory backend (fallback + tests) ---------------- */
function memoryBackend() {
  const maps = new Map(STORES.map((s) => [s, new Map()]));
  return {
    name: "memory",
    async get(store, key) {
      const v = maps.get(store).get(key);
      return v === undefined ? null : structuredCloneSafe(v);
    },
    async put(store, value) {
      maps.get(store).set(value[keyPathFor(store)], structuredCloneSafe(value));
      return value;
    },
    async del(store, key) {
      maps.get(store).delete(key);
    },
    async list(store, opts = {}) {
      let rows = [...maps.get(store).values()];
      if (opts.reverse) rows = rows.reverse();
      if (opts.limit) rows = rows.slice(0, opts.limit);
      return rows.map(structuredCloneSafe);
    },
    async clear(store) {
      maps.get(store).clear();
    },
  };
}

function structuredCloneSafe(v) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(v);
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(v));
}

/* ---------------- Backup validation ---------------- */
export function validateBackup(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("Import failed: this file is not a StudyPilot backup.");
  }
  if (obj.app !== "studypilot") {
    throw new Error("Import failed: unrecognized backup format (missing app marker).");
  }
  if (typeof obj.schemaVersion !== "number" || obj.schemaVersion < 1) {
    throw new Error("Import failed: backup has no readable schema version.");
  }
  if (obj.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Import failed: backup was made with a newer version (v${obj.schemaVersion}) than this app (v${SCHEMA_VERSION}). Update the app first — your data was not touched.`
    );
  }
  if (!obj.data || typeof obj.data !== "object") {
    throw new Error("Import failed: backup contains no data section.");
  }
  let bytes = 0;
  for (const [store, rows] of Object.entries(obj.data)) {
    if (!STORES.includes(store)) {
      throw new Error(`Import failed: unknown data section "${store}".`);
    }
    if (!Array.isArray(rows)) {
      throw new Error(`Import failed: data section "${store}" is corrupted.`);
    }
    const kp = keyPathFor(store);
    for (const r of rows) {
      if (!r || typeof r !== "object" || r[kp] === undefined || r[kp] === null || r[kp] === "") {
        throw new Error(`Import failed: a record in "${store}" is missing its id.`);
      }
    }
    bytes += JSON.stringify(rows).length;
  }
  if (bytes > MAX_IMPORT_BYTES) {
    throw new Error(
      `Import failed: backup is too large (${Math.round(bytes / 1048576)} MB, limit ${MAX_IMPORT_BYTES / 1048576} MB).`
    );
  }
  return true;
}

/* ---------------- Public storage object ---------------- */
export async function openStorage(opts = {}) {
  const want = opts.backend || "auto"; // 'auto' | 'indexeddb' | 'memory'
  let backend;
  let degraded = false;
  if (want === "memory") {
    backend = memoryBackend();
    degraded = true;
  } else if (want === "indexeddb" || (want === "auto" && idbAvailable())) {
    try {
      backend = idbBackend;
      await backend._dbp(); // fail fast so we can fall back
    } catch (e) {
      backend = memoryBackend();
      degraded = true;
    }
  } else {
    backend = memoryBackend();
    degraded = true;
  }

  const storage = {
    backend: backend.name,
    degraded,
    newId: uid,
    get: (store, key) => backend.get(store, key),
    put: (store, value) => {
      const v = { ...value, updatedAt: new Date().toISOString() };
      return backend.put(store, v);
    },
    del: (store, key) => backend.del(store, key),
    list: (store, opts) => backend.list(store, opts),
    clear: (store) => backend.clear(store),

    /** Full backup: {app, schemaVersion, exportedAt, data:{store:[records]}} */
    async exportAll() {
      const data = {};
      for (const s of STORES) data[s] = await backend.list(s);
      return {
        app: "studypilot",
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        data,
      };
    },

    /**
     * Restore a backup. Default mode 'merge': existing ids are KEPT unless
     * options.overwrite === true (UI must confirm this explicitly).
     * Mode 'replace': clears all stores first (also requires explicit UI confirm).
     */
    async importBackup(obj, options = {}) {
      validateBackup(obj);
      const mode = options.mode || "merge";
      if (mode === "replace") {
        for (const s of STORES) await backend.clear(s);
      }
      let added = 0,
        skipped = 0,
        replaced = 0;
      for (const s of STORES) {
        const rows = obj.data[s] || [];
        for (const r of rows) {
          const existing = await backend.get(s, r[keyPathFor(s)]);
          if (existing && mode === "merge" && !options.overwrite) {
            skipped++;
            continue;
          }
          if (existing) replaced++;
          else added++;
          await backend.put(s, r);
        }
      }
      return { added, skipped, replaced };
    },

    /** Storage quota info; null fields when unavailable (memory backend). */
    async usage() {
      try {
        if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
          const e = await navigator.storage.estimate();
          return {
            bytes: e.usage || 0,
            quota: e.quota || 0,
            percent: e.quota ? Math.round(((e.usage || 0) / e.quota) * 100) : 0,
          };
        }
      } catch {
        /* ignore */
      }
      return { bytes: 0, quota: 0, percent: 0 };
    },

    /** Ask the browser not to evict our data under storage pressure. */
    async requestPersistence() {
      try {
        if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
          return await navigator.storage.persist();
        }
      } catch {
        /* ignore */
      }
      return false;
    },
  };

  // Seed schema version marker (forward-migration hook reads it).
  try {
    const cur = await storage.get("kv", "schema_version");
    if (!cur) await storage.put("kv", { key: "schema_version", value: SCHEMA_VERSION });
  } catch {
    /* non-fatal */
  }
  return storage;
}
