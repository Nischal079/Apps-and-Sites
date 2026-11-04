/**
 * My Study Space tests (pure logic + storage round-trips, memory backend).
 * Browser-only paths (IndexedDB plumbing, object URLs, drag events) are
 * verified manually; everything testable in Node is covered here.
 */
import { deflateRawSync } from "node:zlib";
import { openStorage, validateBackup } from "../assets/js/storage.js";
import { renderMarkdown } from "../assets/js/markdown.js";
import { extractDocxText, docxXmlToText } from "../assets/js/docx.js";
import {
  debounce,
  formatBytes,
  searchNotes,
  searchFiles,
  canMoveFolder,
  folderPath,
  serializeBackup,
  deserializeBackup,
} from "../assets/js/studyspace.js";

/* ---------------- markdown ---------------- */

test("markdown: headings, bold, italic, code", () => {
  const html = renderMarkdown("# Title\n## Sub\nSome **bold** and *italic* and `code`.");
  assert(html.includes('<h1 class="md-h">Title</h1>'), "h1");
  assert(html.includes('<h2 class="md-h">Sub</h2>'), "h2");
  assert(html.includes("<strong>bold</strong>"), "bold");
  assert(html.includes("<em>italic</em>"), "italic");
  assert(html.includes("<code>code</code>"), "code");
});

test("markdown: lists, quote, rule, fenced code", () => {
  const html = renderMarkdown("- a\n- b\n\n1. one\n2. two\n\n> quoted\n\n---\n\n```\n**not bold**\n```");
  assert(html.includes("<ul>") && html.includes("<li>a</li>"), "ul");
  assert(html.includes("<ol>") && html.includes("<li>one</li>"), "ol");
  assert(html.includes("<blockquote>quoted</blockquote>"), "quote");
  assert(html.includes("<hr />"), "rule");
  assert(html.includes("<pre><code>**not bold**</code></pre>"), "fenced code is literal");
});

test("markdown: XSS is escaped, javascript: links rejected", () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[click](javascript:alert(1))\n\n[ok](https://example.com)');
  assert(!html.includes("<script>"), "script tag must be escaped");
  assert(html.includes("&lt;script&gt;"), "script escaped visibly");
  assert(!/<a[^>]*href="javascript:/i.test(html), "no link element with javascript: href");
  assert(!/<a[^>]*href="[^"]*\(javascript/i.test(html), "no smuggled js href");
  assert(html.includes('<a href="https://example.com" rel="noopener">ok</a>'), "https link kept");
});

test("markdown: code spans protect formatting chars", () => {
  const html = renderMarkdown("Use `**x**` here.");
  assert(html.includes("<code>**x**</code>"), "code span literal");
  assert(!html.includes("<strong>x</strong>"), "no bold inside code");
});

/* ---------------- search ---------------- */

const sampleNotes = [
  { id: "1", title: "Physics revision", body: "thermodynamics and waves", updatedAt: "2026-11-04T10:00:00Z" },
  { id: "2", title: "Shopping list", body: "physics textbook needed", updatedAt: "2026-11-04T11:00:00Z" },
  { id: "3", title: "Biology", body: "cells", updatedAt: "2026-11-04T12:00:00Z" },
];

test("searchNotes: title outranks body, empty query returns all", () => {
  const r = searchNotes(sampleNotes, "physics");
  assertEq(r.length, 2);
  assertEq(r[0].note.id, "1", "title match first");
  assertEq(r[1].note.id, "2", "body match second");
  assertEq(searchNotes(sampleNotes, "").length, 3, "empty query returns all");
  assertEq(searchNotes(sampleNotes, "zzz").length, 0, "no match");
});

test("searchFiles: name outranks cached text", () => {
  const files = [
    { id: "a", name: "notes.pdf", text: "chemistry", updatedAt: "2026-11-04T10:00:00Z" },
    { id: "b", name: "scan.png", text: "chemistry lab", updatedAt: "2026-11-04T11:00:00Z" },
  ];
  const r = searchFiles(files, "chemistry");
  assertEq(r.length, 2);
  assertEq(r[0].file.id, "b", "name match first");
});

/* ---------------- folders ---------------- */

const sampleFolders = [
  { id: "root1", name: "School", parentId: null },
  { id: "child1", name: "Physics", parentId: "root1" },
  { id: "grand1", name: "Thermo", parentId: "child1" },
  { id: "root2", name: "Personal", parentId: null },
];

test("canMoveFolder: blocks self and descendants, allows the rest", () => {
  assert(!canMoveFolder(sampleFolders, "root1", "root1"), "not into itself");
  assert(!canMoveFolder(sampleFolders, "root1", "grand1"), "not into descendant");
  assert(!canMoveFolder(sampleFolders, "child1", "grand1"), "not into child");
  assert(canMoveFolder(sampleFolders, "grand1", "root1"), "up is fine");
  assert(canMoveFolder(sampleFolders, "root1", "root2"), "sibling is fine");
  assert(canMoveFolder(sampleFolders, "root1", null), "top level is fine");
});

test("folderPath: builds breadcrumb", () => {
  assertEq(folderPath(sampleFolders, "grand1"), "School / Physics / Thermo");
  assertEq(folderPath(sampleFolders, "root2"), "Personal");
  assertEq(folderPath(sampleFolders, "missing"), "");
});

/* ---------------- debounce ---------------- */

test("debounce: coalesces rapid calls, trailing only", async () => {
  let calls = 0;
  const d = debounce(() => calls++, 30);
  d();
  d();
  d();
  assert(d.pending(), "pending while waiting");
  await new Promise((r) => setTimeout(r, 70));
  assertEq(calls, 1, "exactly one trailing call");
  assert(!d.pending(), "not pending after fire");
});

test("debounce: cancel prevents the call", async () => {
  let calls = 0;
  const d = debounce(() => calls++, 30);
  d();
  d.cancel();
  await new Promise((r) => setTimeout(r, 70));
  assertEq(calls, 0, "cancelled");
});

/* ---------------- formatBytes ---------------- */

test("formatBytes", () => {
  assertEq(formatBytes(0), "0 B");
  assertEq(formatBytes(1536), "1.5 KB");
  assertEq(formatBytes(5 * 1048576), "5.0 MB");
});

/* ---------------- docx ---------------- */

function crc32(buf) {
  let table = crc32._t;
  if (!table) {
    table = crc32._t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build a minimal real ZIP (central directory) in-memory. */
function makeZip(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name);
    const comp = deflateRawSync(Buffer.from(data));
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(8, 8, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, comp.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(lh.buffer), nameBytes, comp);
    central.push({ nameBytes, crc, compLen: comp.length, len: data.length, offset });
    offset += 30 + nameBytes.length + comp.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) {
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(10, 8, true);
    ch.setUint32(14, c.crc, true);
    ch.setUint32(20, c.compLen, true);
    ch.setUint32(24, c.len, true);
    ch.setUint16(28, c.nameBytes.length, true);
    ch.setUint32(42, c.offset, true);
    chunks.push(new Uint8Array(ch.buffer), c.nameBytes);
    cdSize += 46 + c.nameBytes.length;
  }
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, central.length, true);
  eocd.setUint16(10, central.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdStart, true);
  chunks.push(new Uint8Array(eocd.buffer));
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const DOC_XML = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t> world</w:t></w:r></w:p><w:p><w:r><w:t>Line2</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>after break</w:t></w:r></w:p></w:body></w:document>`;

test("docxXmlToText: paragraphs, breaks, entities", () => {
  const t = docxXmlToText('<w:p><w:r><w:t>A &amp; B</w:t></w:r></w:p><w:p><w:r><w:t>C</w:t></w:r></w:p>');
  assertEq(t, "A & B\nC");
});

test("extractDocxText: real zip round-trip", async () => {
  const zip = makeZip([
    { name: "[Content_Types].xml", data: new TextEncoder().encode("<Types/>") },
    { name: "word/document.xml", data: new TextEncoder().encode(DOC_XML) },
  ]);
  const text = await extractDocxText(zip.buffer);
  assertEq(text, "Hello world\nLine2\nafter break");
});

test("extractDocxText: garbage input gives friendly error", async () => {
  let msg = "";
  try {
    await extractDocxText(new Uint8Array([1, 2, 3, 4]).buffer);
  } catch (e) {
    msg = e.message;
  }
  assert(msg.includes("download it to view"), "friendly fallback message, got: " + msg);
});

/* ---------------- backup round-trip with blobs ---------------- */

test("backup: serialize/deserialize preserves file blobs; import merges", async () => {
  const s = await openStorage({ backend: "memory" });
  const blob = new Blob(["hello file"], { type: "text/plain" });
  await s.put("files", { id: "f1", name: "a.txt", mime: "text/plain", size: 10, blob, text: "hello" });
  await s.put("notes", { id: "n1", title: "T", body: "b" });

  const raw = await s.exportAll();
  const serial = await serializeBackup(raw);
  const json = JSON.stringify(serial); // must be JSON-safe
  const parsed = JSON.parse(json);
  assert(typeof parsed.data.files[0].blob === "string", "blob became data URL string");
  assert(parsed.data.files[0].blob.startsWith("data:text/plain;base64,"), "data URL shape");

  validateBackup(parsed);
  const restored = deserializeBackup(parsed);
  const s2 = await openStorage({ backend: "memory" });
  const res = await s2.importBackup(restored);
  assertEq(res.added, 2, "files + notes added");
  assertEq(res.skipped, 1, "kv schema marker was already seeded by openStorage");
  const got = await s2.get("files", "f1");
  assert(got.blob instanceof Blob, "blob restored as Blob");
  assertEq(await got.blob.text(), "hello file");
});

test("backup: import merge skips existing ids without overwrite", async () => {
  const s = await openStorage({ backend: "memory" });
  await s.put("notes", { id: "n1", title: "MINE" });
  const backup = {
    app: "studypilot",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: { notes: [{ id: "n1", title: "THEIRS" }], files: [], folders: [], timetables: [], conversations: [], kv: [] },
  };
  const res = await s.importBackup(backup); // merge, no overwrite
  assertEq(res.skipped, 1, "existing id skipped");
  assertEq((await s.get("notes", "n1")).title, "MINE", "existing record untouched");
});

test("backup: validateBackup rejects corrupt payloads", () => {
  assertThrows(() => validateBackup(null), "not a StudyPilot backup");
  assertThrows(() => validateBackup({ app: "other" }), "unrecognized");
  assertThrows(
    () => validateBackup({ app: "studypilot", schemaVersion: 99, data: {} }),
    "newer version"
  );
  assertThrows(
    () => validateBackup({ app: "studypilot", schemaVersion: 1, data: { bogus: [] } }),
    "unknown data section"
  );
});
