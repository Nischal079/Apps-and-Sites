/**
 * Storage foundation tests (memory backend — same API as IndexedDB path).
 * The IndexedDB-specific code path is thin (open/transaction plumbing) and is
 * verified manually in-browser; all logic (validation, merge semantics,
 * export/import round-trip) is covered here.
 */
import { openStorage, validateBackup, STORES, SCHEMA_VERSION } from "../assets/js/storage.js";

test("openStorage memory backend reports degraded", async () => {
  const s = await openStorage({ backend: "memory" });
  assert(s.degraded === true, "memory backend must set degraded");
  assert(s.backend === "memory");
});

test("put/get/del/list round-trip", async () => {
  const s = await openStorage({ backend: "memory" });
  await s.put("notes", { id: "n1", title: "Hello", body: "world" });
  const got = await s.get("notes", "n1");
  assertEq(got.title, "Hello");
  assert(typeof got.updatedAt === "string", "put stamps updatedAt");
  const all = await s.list("notes");
  assertEq(all.length, 1);
  await s.del("notes", "n1");
  assertEq(await s.get("notes", "n1"), null);
});

test("exportAll/importBackup round-trip", async () => {
  const s = await openStorage({ backend: "memory" });
  await s.put("notes", { id: "n1", title: "T" });
  await s.put("timetables", { id: "t1", name: "Week 1" });
  const backup = await s.exportAll();
  assertEq(backup.app, "studypilot");
  assertEq(backup.schemaVersion, SCHEMA_VERSION);

  const s2 = await openStorage({ backend: "memory" });
  const res = await s2.importBackup(backup);
  assertEq(res.added, 2);
  assertEq((await s2.get("notes", "n1")).title, "T");
});

test("import merge never silently overwrites", async () => {
  const s = await openStorage({ backend: "memory" });
  await s.put("notes", { id: "n1", title: "ORIGINAL" });
  const backup = {
    app: "studypilot",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      notes: [
        { id: "n1", title: "INCOMING" },
        { id: "n2", title: "NEW" },
      ],
    },
  };
  const res = await s.importBackup(backup); // default merge, no overwrite
  assertEq(res.added, 1);
  assertEq(res.skipped, 1);
  assertEq((await s.get("notes", "n1")).title, "ORIGINAL", "existing record must be kept");

  const res2 = await s.importBackup(backup, { overwrite: true });
  assertEq(res2.replaced, 2);
  assertEq((await s.get("notes", "n1")).title, "INCOMING");
});

test("import replace clears stores first", async () => {
  const s = await openStorage({ backend: "memory" });
  await s.put("notes", { id: "n9", title: "OLD" });
  const backup = {
    app: "studypilot",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: { notes: [{ id: "n1", title: "FRESH" }] },
  };
  await s.importBackup(backup, { mode: "replace" });
  assertEq(await s.get("notes", "n9"), null, "old record cleared");
  assertEq((await s.get("notes", "n1")).title, "FRESH");
});

test("validateBackup rejects garbage with plain-language errors", () => {
  assertThrows(() => validateBackup(null), "not a StudyPilot backup");
  assertThrows(() => validateBackup({ app: "other" }), "unrecognized backup format");
  assertThrows(
    () => validateBackup({ app: "studypilot", schemaVersion: 999, data: {} }),
    "newer version"
  );
  assertThrows(
    () => validateBackup({ app: "studypilot", schemaVersion: 1, data: { bogus: [] } }),
    'unknown data section "bogus"'
  );
  assertThrows(
    () =>
      validateBackup({
        app: "studypilot",
        schemaVersion: 1,
        data: { notes: [{ title: "no id" }] },
      }),
    "missing its id"
  );
});

test("validateBackup accepts all known stores", () => {
  const data = {};
  for (const st of STORES) data[st] = [];
  validateBackup({ app: "studypilot", schemaVersion: 1, exportedAt: "x", data });
});

test("usage() degrades gracefully without navigator.storage", async () => {
  const s = await openStorage({ backend: "memory" });
  const u = await s.usage();
  assertEq(typeof u.percent, "number");
});
