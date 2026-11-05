/**
 * StudyPilot · My Study Space application.
 *
 * Private, browser-local workspace: notes, files, folders, saved timetables,
 * backup/restore. Built on assets/js/storage.js (versioned IndexedDB with
 * in-memory fallback). Vanilla ES modules, no framework, no network calls.
 *
 * Security: all user content reaches the DOM via esc()/textContent only
 * (markdown.js escapes before formatting). Blob previews use object URLs
 * created locally · nothing is ever uploaded anywhere.
 */
import { openStorage, validateBackup } from "./storage.js";
import { esc, toast } from "./ui.js";
import { renderMarkdown } from "./markdown.js";
import { extractDocxText } from "./docx.js";
import { encodeShare } from "./timetable.js";
import { BRAND } from "./config.js";

/* ================================================================
 * Pure helpers (exported for unit tests)
 * ================================================================ */

export function debounce(fn, wait) {
  let t = null;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, wait);
  };
  d.cancel = () => {
    clearTimeout(t);
    t = null;
  };
  d.pending = () => t !== null;
  return d;
}

export function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

function norm(s) {
  return String(s || "").toLowerCase();
}

/** Score a note against a query: title hit = 2, body hit = 1, else -1. */
export function noteScore(note, q) {
  q = norm(q).trim();
  if (!q) return 0;
  if (norm(note.title).includes(q)) return 2;
  if (norm(note.body).includes(q)) return 1;
  return -1;
}

export function searchNotes(notes, q) {
  q = norm(q).trim();
  if (!q) return notes.map((note) => ({ note, score: 0 }));
  return notes
    .map((note) => ({ note, score: noteScore(note, q) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score || String(b.note.updatedAt).localeCompare(String(a.note.updatedAt)));
}

export function fileScore(file, q) {
  q = norm(q).trim();
  if (!q) return 0;
  if (norm(file.name).includes(q)) return 2;
  if (norm(file.text).includes(q)) return 1;
  return -1;
}

export function searchFiles(files, q) {
  q = norm(q).trim();
  if (!q) return files.map((file) => ({ file, score: 0 }));
  return files
    .map((file) => ({ file, score: fileScore(file, q) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score || String(b.file.updatedAt).localeCompare(String(a.file.updatedAt)));
}

/** Folder tree helpers. folders: [{id, name, parentId}]. */
export function folderById(folders, id) {
  return folders.find((f) => f.id === id) || null;
}

export function isDescendant(folders, id, ancestorId) {
  let cur = folderById(folders, id);
  while (cur && cur.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = folderById(folders, cur.parentId);
  }
  return false;
}

/** Can `movingId` be moved under `targetId` (null = top level)? */
export function canMoveFolder(folders, movingId, targetId) {
  if (targetId === movingId) return false;
  if (targetId && isDescendant(folders, targetId, movingId)) return false;
  return true;
}

/** "Work / Physics" style breadcrumb for a folder id ("" for top level). */
export function folderPath(folders, id) {
  const parts = [];
  let cur = folderById(folders, id);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? folderById(folders, cur.parentId) : null;
  }
  return parts.join(" / ");
}

/* ---------- Backup blob (de)serialization ---------- */
function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

function base64ToBytes(b64) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Convert an exportAll() backup into JSON-safe form: file blobs become
 * "data:<mime>;base64,…" strings. Everything else passes through.
 */
export async function serializeBackup(backup) {
  const data = {};
  for (const [store, rows] of Object.entries(backup.data || {})) {
    data[store] = await Promise.all(
      (rows || []).map(async (r) => {
        if (store === "files" && r && r.blob instanceof Blob) {
          const buf = new Uint8Array(await r.blob.arrayBuffer());
          return {
            ...r,
            blob: `data:${r.blob.type || "application/octet-stream"};base64,${bytesToBase64(buf)}`,
          };
        }
        return r;
      })
    );
  }
  return { ...backup, data };
}

/** Reverse serializeBackup: data-URL strings back into Blobs. */
export function deserializeBackup(obj) {
  const data = {};
  for (const [store, rows] of Object.entries(obj.data || {})) {
    data[store] = (rows || []).map((r) => {
      if (store === "files" && r && typeof r.blob === "string" && r.blob.startsWith("data:")) {
        const m = /^data:([^;]+);base64,(.*)$/s.exec(r.blob);
        if (m) return { ...r, blob: new Blob([base64ToBytes(m[2])], { type: m[1] }) };
      }
      return r;
    });
  }
  return { ...obj, data };
}

/* ================================================================
 * App
 * ================================================================ */

const $ = (id) => document.getElementById(id);
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per-file sanity cap
const TEXT_CACHE_MAX = 200 * 1024; // 200 KB of extracted text kept for search

let storage = null;
let folders = [];
let notes = [];
let files = [];
let timetables = [];

const state = {
  tab: "notes",
  noteFolder: null, // null = all, "unfiled" = no folder
  fileFolder: null,
  noteQuery: "",
  fileQuery: "",
  openNoteId: null,
  editorDirty: false,
  previewMode: false,
};

async function getStorage() {
  if (!storage) storage = await openStorage();
  return storage;
}

async function refreshAll() {
  const st = await getStorage();
  [folders, notes, files, timetables] = await Promise.all([
    st.list("folders"),
    st.list("notes"),
    st.list("files"),
    st.list("timetables"),
  ]);
  notes.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  files.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  timetables.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function showDegradedBanner() {
  if (storage && storage.degraded) {
    const b = $("degradedBanner");
    b.hidden = false;
  }
}

/* ---------------- Tabs ---------------- */
function switchTab(name) {
  state.tab = name;
  document.querySelectorAll("[data-tab-btn]").forEach((b) => {
    const active = b.dataset.tabBtn === name;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-tab-panel]").forEach((p) => {
    p.hidden = p.dataset.tabPanel !== name;
  });
  if (name === "backup") refreshBackupPanel();
}

/* ---------------- Folder tree ---------------- */
function renderFolderTree(container, opts) {
  // opts: {selected, onSelect, allowAll=true, allowUnfiled=true}
  container.innerHTML = "";
  const mk = (label, value, depth, count) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tree-item" + (opts.selected === value ? " active" : "");
    btn.style.paddingLeft = `${0.75 + depth * 1.1}rem`;
    const name = document.createElement("span");
    name.textContent = label;
    const c = document.createElement("span");
    c.className = "tree-count";
    c.textContent = String(count);
    btn.append(name, c);
    btn.addEventListener("click", () => opts.onSelect(value));
    container.appendChild(btn);
  };
  const countFor = (fid) => opts.counter(fid);
  if (opts.allowAll !== false) mk("All", null, 0, opts.counter("__all"));
  const walk = (parentId, depth) => {
    folders
      .filter((f) => (f.parentId || null) === (parentId || null))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((f) => {
        mk(f.name, f.id, depth, countFor(f.id));
        walk(f.id, depth + 1);
      });
  };
  walk(null, 0);
  if (opts.allowUnfiled !== false) mk("Unfiled", "unfiled", 0, opts.counter("unfiled"));
}

function folderOptions(selectEl, { includeNone = true, excludeId = null, current = null } = {}) {
  selectEl.innerHTML = "";
  const add = (value, label) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    if (value === current) o.selected = true;
    selectEl.appendChild(o);
  };
  if (includeNone) add("", "No folder");
  const walk = (parentId, depth) => {
    folders
      .filter((f) => (f.parentId || null) === (parentId || null) && f.id !== excludeId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((f) => {
        add(f.id, "  ".repeat(depth) + f.name);
        walk(f.id, depth + 1);
      });
  };
  walk(null, 0);
}

/* ---------------- Notes ---------------- */
function visibleNotes() {
  let list = notes;
  if (state.noteFolder === "unfiled") list = list.filter((n) => !n.folderId);
  else if (state.noteFolder) list = list.filter((n) => n.folderId === state.noteFolder);
  return searchNotes(list, state.noteQuery).map((r) => r.note);
}

function renderNoteTree() {
  renderFolderTree($("noteFolders"), {
    selected: state.noteFolder,
    onSelect: (v) => {
      state.noteFolder = v;
      renderNotes();
    },
    counter: (fid) =>
      fid === "__all"
        ? notes.length
        : fid === "unfiled"
          ? notes.filter((n) => !n.folderId).length
          : notes.filter((n) => n.folderId === fid).length,
  });
}

function renderNoteList() {
  const list = $("noteList");
  list.innerHTML = "";
  const items = visibleNotes();
  if (!items.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.innerHTML = state.noteQuery
      ? "<p>No notes match your search.</p>"
      : "<p>No notes yet.</p><p class=\"muted\">Create your first note · it saves automatically in this browser.</p>";
    if (!state.noteQuery) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-primary btn-sm";
      b.style.marginTop = "0.7rem";
      b.textContent = "+ Create your first note";
      b.addEventListener("click", createNote);
      d.appendChild(b);
    }
    list.appendChild(d);
    return;
  }
  for (const n of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "list-item" + (state.openNoteId === n.id ? " active" : "");
    const t = document.createElement("span");
    t.className = "list-item-title";
    t.textContent = n.title || "Untitled note";
    const m = document.createElement("span");
    m.className = "list-item-meta";
    m.textContent = snippet(n.body);
    b.append(t, m);
    b.addEventListener("click", () => openNote(n.id));
    list.appendChild(b);
  }
}

function renderNotes() {
  renderNoteTree();
  renderNoteList();
  renderEditor();
}

function snippet(body) {
  const s = String(body || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return s || "Empty note";
}

function openNote(id) {
  flushAutosave();
  state.openNoteId = id;
  state.previewMode = false;
  state.editorDirty = false;
  renderNotes();
  if (window.matchMedia("(max-width: 760px)").matches) {
    $("noteEditor").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function currentNote() {
  return notes.find((n) => n.id === state.openNoteId) || null;
}

function renderEditor() {
  const ed = $("noteEditor");
  const n = currentNote();
  if (!n) {
    const d = document.createElement("div");
    d.className = "empty";
    const p = document.createElement("p");
    p.textContent = "Select a note, or create a new one.";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-primary btn-sm";
    b.style.marginTop = "0.7rem";
    b.textContent = "+ New note";
    b.addEventListener("click", createNote);
    d.append(p, b);
    ed.innerHTML = "";
    ed.appendChild(d);
    return;
  }
  ed.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "editor";

  const title = document.createElement("input");
  title.type = "text";
  title.className = "editor-title";
  title.placeholder = "Note title";
  title.value = n.title || "";
  title.setAttribute("aria-label", "Note title");

  const toolbar = document.createElement("div");
  toolbar.className = "md-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Formatting");
  const tools = [
    ["B", "Bold", "**", "**", "bold text"],
    ["I", "Italic", "*", "*", "italic text"],
    ["H", "Heading", "### ", "", "Heading"],
    ["•", "List", "- ", "", "list item"],
    ["1.", "Numbered list", "1. ", "", "list item"],
    ["❝", "Quote", "> ", "", "quote"],
    ["<>", "Code", "`", "`", "code"],
    ["🔗", "Link", "[", "](https://)", "link text"],
  ];
  for (const [glyph, label, pre, post, placeholder] of tools) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-sm btn-ghost";
    b.textContent = glyph;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => wrapSelection(body, pre, post, placeholder));
    toolbar.appendChild(b);
  }
  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn btn-sm" + (state.previewMode ? " btn-primary" : " btn-ghost");
  previewBtn.textContent = state.previewMode ? "Edit" : "Preview";
  previewBtn.addEventListener("click", () => {
    flushAutosave();
    state.previewMode = !state.previewMode;
    renderEditor();
  });
  toolbar.appendChild(previewBtn);

  const body = document.createElement("textarea");
  body.className = "editor-body";
  body.value = n.body || "";
  body.placeholder = "Write your note… (Markdown supported)";
  body.setAttribute("aria-label", "Note body");
  body.rows = 14;

  const preview = document.createElement("div");
  preview.className = "md-preview prose";
  preview.hidden = !state.previewMode;
  body.hidden = state.previewMode;
  if (state.previewMode) preview.innerHTML = renderMarkdown(n.body || "*Nothing to preview yet.*");

  const meta = document.createElement("div");
  meta.className = "editor-meta";

  const folderSel = document.createElement("select");
  folderSel.setAttribute("aria-label", "Move note to folder");
  folderOptions(folderSel, { current: n.folderId || "" });

  const status = document.createElement("span");
  status.className = "muted";
  status.id = "saveStatus";
  status.textContent = "Saved";

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn btn-sm btn-ghost danger";
  delBtn.textContent = "Delete note";
  delBtn.addEventListener("click", () => deleteNote(n.id));

  meta.append(folderSel, status, delBtn);
  wrap.append(title, toolbar, body, preview, meta);
  ed.appendChild(wrap);

  const markDirty = () => {
    state.editorDirty = true;
    status.textContent = "Saving…";
    scheduleAutosave(n.id);
  };
  title.addEventListener("input", markDirty);
  body.addEventListener("input", markDirty);
  folderSel.addEventListener("change", async () => {
    flushAutosave();
    try {
      const st = await getStorage();
      const rec = await st.get("notes", n.id);
      if (!rec) throw new Error("note not found");
      rec.folderId = folderSel.value || null;
      await st.put("notes", rec);
      await refreshAll();
      renderNotes();
      toast("Note moved.");
    } catch (e) {
      toast("Couldn't move the note: " + friendly(e));
    }
  });
}

function wrapSelection(textarea, pre, post, placeholder) {
  const { selectionStart: s, selectionEnd: e, value } = textarea;
  const sel = value.slice(s, e) || placeholder;
  textarea.value = value.slice(0, s) + pre + sel + post + value.slice(e);
  textarea.focus();
  textarea.setSelectionRange(s + pre.length, s + pre.length + sel.length);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

const autosave = debounce(async (noteId) => {
  const title = document.querySelector(".editor-title");
  const body = document.querySelector(".editor-body");
  if (!title || !body) return;
  try {
    const st = await getStorage();
    const rec = await st.get("notes", noteId);
    if (!rec) {
      // Note was deleted elsewhere · keep the text on screen, do not recreate.
      const s = $("saveStatus");
      if (s) s.textContent = "Note was deleted elsewhere · text kept on screen.";
      return;
    }
    rec.title = title.value;
    rec.body = body.value;
    await st.put("notes", rec);
    await refreshAll();
    state.editorDirty = false;
    const s = $("saveStatus");
    if (s) s.textContent = "Saved ✓";
    // Refresh list + tree only · rebuilding the editor would steal focus
    // and reset the cursor while the user is typing.
    renderNoteTree();
    renderNoteList();
  } catch (e) {
    const s = $("saveStatus");
    if (s) s.textContent = "Couldn't save · your text is still here. Export a backup to be safe.";
    toast("Couldn't save the note: " + friendly(e));
  }
}, 800);

function scheduleAutosave(noteId) {
  autosave(noteId);
}

function flushAutosave() {
  autosave.cancel();
  // If dirty, save synchronously-ish now (best effort, no await in all paths).
  if (state.editorDirty && state.openNoteId) {
    const title = document.querySelector(".editor-title");
    const body = document.querySelector(".editor-body");
    if (title && body) {
      const id = state.openNoteId;
      state.editorDirty = false;
      getStorage()
        .then(async (st) => {
          const rec = await st.get("notes", id);
          if (rec) {
            rec.title = title.value;
            rec.body = body.value;
            await st.put("notes", rec);
          }
        })
        .catch(() => {});
    }
  }
}

async function createNote() {
  flushAutosave();
  try {
    const st = await getStorage();
    const rec = await st.put("notes", {
      id: st.newId("note"),
      title: "",
      body: "",
      folderId: state.noteFolder && state.noteFolder !== "unfiled" ? state.noteFolder : null,
      createdAt: new Date().toISOString(),
    });
    await refreshAll();
    state.openNoteId = rec.id;
    state.previewMode = false;
    renderNotes();
    const t = document.querySelector(".editor-title");
    if (t) t.focus();
  } catch (e) {
    toast("Couldn't create the note: " + friendly(e));
  }
}

async function deleteNote(id) {
  const n = notes.find((x) => x.id === id);
  const label = (n && n.title) || "this note";
  if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
  flushAutosave();
  autosave.cancel();
  state.editorDirty = false;
  try {
    const st = await getStorage();
    await st.del("notes", id);
    await refreshAll();
    if (state.openNoteId === id) state.openNoteId = null;
    renderNotes();
    toast("Note deleted.");
  } catch (e) {
    toast("Couldn't delete the note: " + friendly(e));
  }
}

/* ---------------- Folders ---------------- */
async function createFolder() {
  const name = $("newFolderName").value.trim();
  if (!name) {
    toast("Give the folder a name first.");
    return;
  }
  if (name.length > 80) {
    toast("Folder name is too long (80 characters max).");
    return;
  }
  try {
    const st = await getStorage();
    await st.put("folders", { id: st.newId("folder"), name, parentId: null });
    $("newFolderName").value = "";
    await refreshAll();
    renderNotes();
    renderFiles();
    renderFolderManager();
    toast("Folder created.");
  } catch (e) {
    toast("Couldn't create the folder: " + friendly(e));
  }
}

async function renameFolder(id) {
  const f = folderById(folders, id);
  if (!f) return;
  const name = prompt("Rename folder:", f.name);
  if (name === null) return;
  const clean = name.trim();
  if (!clean) {
    toast("Folder name can't be empty.");
    return;
  }
  try {
    const st = await getStorage();
    f.name = clean.slice(0, 80);
    await st.put("folders", f);
    await refreshAll();
    renderNotes();
    renderFiles();
    renderFolderManager();
  } catch (e) {
    toast("Couldn't rename the folder: " + friendly(e));
  }
}

async function deleteFolder(id) {
  const f = folderById(folders, id);
  if (!f) return;
  const hasKids =
    folders.some((x) => x.parentId === id) ||
    notes.some((n) => n.folderId === id) ||
    files.some((x) => x.folderId === id);
  if (hasKids) {
    toast("That folder isn't empty · move its notes, files and subfolders out first. Nothing was deleted.");
    return;
  }
  if (!confirm(`Delete the folder "${f.name}"?`)) return;
  try {
    const st = await getStorage();
    await st.del("folders", id);
    await refreshAll();
    if (state.noteFolder === id) state.noteFolder = null;
    if (state.fileFolder === id) state.fileFolder = null;
    renderNotes();
    renderFiles();
    renderFolderManager();
    toast("Folder deleted.");
  } catch (e) {
    toast("Couldn't delete the folder: " + friendly(e));
  }
}

async function moveFolder(id, targetId) {
  if (!canMoveFolder(folders, id, targetId || null)) {
    toast("Can't move a folder into itself or one of its subfolders.");
    return;
  }
  try {
    const st = await getStorage();
    const f = await st.get("folders", id);
    if (!f) throw new Error("folder not found");
    f.parentId = targetId || null;
    await st.put("folders", f);
    await refreshAll();
    renderNotes();
    renderFiles();
    renderFolderManager();
    toast("Folder moved.");
  } catch (e) {
    toast("Couldn't move the folder: " + friendly(e));
  }
}

function renderFolderManager() {
  const box = $("folderManager");
  box.innerHTML = "";
  if (!folders.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No folders yet · create one above to organize notes and files.";
    box.appendChild(p);
    return;
  }
  const walk = (parentId, depth) => {
    folders
      .filter((f) => (f.parentId || null) === (parentId || null))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((f) => {
        const row = document.createElement("div");
        row.className = "folder-row";
        row.style.paddingLeft = `${0.5 + depth * 1.25}rem`;
        const name = document.createElement("span");
        name.className = "folder-row-name";
        name.textContent = "📁 " + f.name;
        const nCount = notes.filter((n) => n.folderId === f.id).length;
        const fCount = files.filter((x) => x.folderId === f.id).length;
        const meta = document.createElement("span");
        meta.className = "muted";
        meta.textContent = `${nCount} note${nCount === 1 ? "" : "s"}, ${fCount} file${fCount === 1 ? "" : "s"}`;

        const moveSel = document.createElement("select");
        moveSel.setAttribute("aria-label", `Move folder ${f.name}`);
        const targets = [{ v: "", l: "Top level" }];
        const collect = (pid, d) => {
          folders
            .filter((x) => (x.parentId || null) === (pid || null) && x.id !== f.id)
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((x) => {
              if (canMoveFolder(folders, f.id, x.id)) targets.push({ v: x.id, l: "  ".repeat(d) + x.name });
              collect(x.id, d + 1);
            });
        };
        collect(null, 0);
        for (const t of targets) {
          const o = document.createElement("option");
          o.value = t.v;
          o.textContent = (t.v === (f.parentId || "") ? "✓ " : "") + t.l;
          moveSel.appendChild(o);
        }
        moveSel.value = f.parentId || "";
        moveSel.addEventListener("change", () => moveFolder(f.id, moveSel.value || null));

        const ren = document.createElement("button");
        ren.type = "button";
        ren.className = "btn btn-sm btn-ghost";
        ren.textContent = "Rename";
        ren.addEventListener("click", () => renameFolder(f.id));
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-sm btn-ghost danger";
        del.textContent = "Delete";
        del.addEventListener("click", () => deleteFolder(f.id));
        row.append(name, meta, moveSel, ren, del);
        box.appendChild(row);
        walk(f.id, depth + 1);
      });
  };
  walk(null, 0);
}

/* ---------------- Files ---------------- */
function visibleFiles() {
  let list = files;
  if (state.fileFolder === "unfiled") list = list.filter((f) => !f.folderId);
  else if (state.fileFolder) list = list.filter((f) => f.folderId === state.fileFolder);
  return searchFiles(list, state.fileQuery).map((r) => r.file);
}

function renderFiles() {
  renderFolderTree($("fileFolders"), {
    selected: state.fileFolder,
    onSelect: (v) => {
      state.fileFolder = v;
      renderFiles();
    },
    counter: (fid) =>
      fid === "__all"
        ? files.length
        : fid === "unfiled"
          ? files.filter((f) => !f.folderId).length
          : files.filter((f) => f.folderId === fid).length,
  });

  const list = $("fileList");
  list.innerHTML = "";
  const items = visibleFiles();
  if (!items.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.innerHTML = state.fileQuery
      ? "<p>No files match your search.</p>"
      : "<p>No files yet.</p><p class=\"muted\">Upload PDFs, images, text or Word documents · they stay in this browser.</p>";
    if (!state.fileQuery) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-primary btn-sm";
      b.style.marginTop = "0.7rem";
      b.textContent = "Choose files";
      b.addEventListener("click", () => $("fileInput").click());
      d.appendChild(b);
    }
    list.appendChild(d);
    return;
  }
  for (const f of items) {
    const row = document.createElement("div");
    row.className = "file-row";
    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = fileIcon(f.mime, f.name);
    icon.setAttribute("aria-hidden", "true");
    const info = document.createElement("button");
    info.type = "button";
    info.className = "file-info";
    const nm = document.createElement("span");
    nm.className = "list-item-title";
    nm.textContent = f.name;
    const mt = document.createElement("span");
    mt.className = "list-item-meta";
    const fp = f.folderId ? folderPath(folders, f.folderId) + " · " : "";
    mt.textContent = `${fp}${formatBytes(f.size)} · ${String(f.updatedAt || "").slice(0, 10)}`;
    info.append(nm, mt);
    info.addEventListener("click", () => previewFile(f.id));

    const dl = document.createElement("button");
    dl.type = "button";
    dl.className = "btn btn-sm btn-ghost";
    dl.textContent = "Download";
    dl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      downloadFile(f.id);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-sm btn-ghost danger";
    del.textContent = "Delete";
    del.addEventListener("click", (ev) => {
      ev.stopPropagation();
      deleteFile(f.id);
    });
    row.append(icon, info, dl, del);
    list.appendChild(row);
  }
}

function fileIcon(mime, name) {
  const m = String(mime || "");
  const ext = String(name || "").split(".").pop().toLowerCase();
  if (m.startsWith("image/")) return "🖼️";
  if (m === "application/pdf" || ext === "pdf") return "📕";
  if (m.startsWith("text/") || ext === "txt" || ext === "md") return "📝";
  if (ext === "docx" || m.includes("wordprocessingml")) return "📄";
  return "📎";
}

async function handleFileInput(fileList) {
  const arr = [...fileList];
  if (!arr.length) return;
  let ok = 0;
  for (const file of arr) {
    if (file.size > MAX_FILE_BYTES) {
      toast(`"${file.name}" is too large (${formatBytes(file.size)} · 50 MB max). Skipped, nothing else was affected.`);
      continue;
    }
    try {
      const st = await getStorage();
      let text = "";
      const isTxt = file.type.startsWith("text/") || /\.(txt|md|csv)$/i.test(file.name);
      const isDocx = /\.docx$/i.test(file.name) || file.type.includes("wordprocessingml");
      if (isTxt && file.size <= TEXT_CACHE_MAX) {
        text = (await file.text()).slice(0, TEXT_CACHE_MAX);
      } else if (isDocx && file.size <= 10 * 1024 * 1024) {
        try {
          text = (await extractDocxText(await file.arrayBuffer())).slice(0, TEXT_CACHE_MAX);
        } catch {
          text = ""; // preview will offer download fallback
        }
      }
      await st.put("files", {
        id: st.newId("file"),
        name: file.name.slice(0, 200),
        mime: file.type || "application/octet-stream",
        size: file.size,
        folderId: state.fileFolder && state.fileFolder !== "unfiled" ? state.fileFolder : null,
        blob: file,
        text,
        createdAt: new Date().toISOString(),
      });
      ok++;
    } catch (e) {
      toast(`Couldn't save "${file.name}": ${friendly(e)}`);
    }
  }
  if (ok) {
    await refreshAll();
    renderFiles();
    toast(ok === 1 ? "File saved in this browser." : `${ok} files saved in this browser.`);
  }
}

let previewUrl = null;
function closePreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
  $("previewModal").hidden = true;
  $("previewBody").innerHTML = "";
}

async function previewFile(id) {
  const f = files.find((x) => x.id === id);
  if (!f) return;
  closePreview();
  const body = $("previewBody");
  const title = $("previewTitle");
  title.textContent = f.name;
  try {
    const st = await getStorage();
    const rec = await st.get("files", id);
    if (!rec || !rec.blob) throw new Error("file data missing");
    previewUrl = URL.createObjectURL(rec.blob);
    const m = rec.mime || "";
    if (m.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = previewUrl;
      img.alt = rec.name;
      img.style.maxWidth = "100%";
      body.appendChild(img);
    } else if (m === "application/pdf") {
      const fr = document.createElement("iframe");
      fr.src = previewUrl;
      fr.title = rec.name;
      fr.style.cssText = "width:100%;height:70vh;border:0;";
      body.appendChild(fr);
    } else if (m.startsWith("text/") || /\.(txt|md|csv)$/i.test(rec.name)) {
      const pre = document.createElement("pre");
      pre.className = "preview-text";
      try {
        pre.textContent = (await rec.blob.text()).slice(0, 500000);
      } catch {
        pre.textContent = rec.text || "Couldn't read this file's text.";
      }
      body.appendChild(pre);
    } else if (/\.docx$/i.test(rec.name)) {
      const pre = document.createElement("pre");
      pre.className = "preview-text";
      if (rec.text) {
        pre.textContent = rec.text;
      } else {
        pre.textContent = "Couldn't extract this document's text for preview.";
      }
      const dl = document.createElement("p");
      const a = document.createElement("a");
      a.href = previewUrl;
      a.download = rec.name;
      a.className = "btn btn-primary btn-sm";
      a.textContent = "Download to view";
      dl.appendChild(a);
      body.append(pre, dl);
    } else {
      const p = document.createElement("p");
      p.textContent = "No preview available for this file type.";
      const a = document.createElement("a");
      a.href = previewUrl;
      a.download = rec.name;
      a.className = "btn btn-primary btn-sm";
      a.textContent = "Download";
      body.append(p, a);
    }
  } catch (e) {
    const p = document.createElement("p");
    p.className = "error";
    p.textContent = "Couldn't open a preview: " + friendly(e);
    body.appendChild(p);
  }
  $("previewModal").hidden = false;
}

async function downloadFile(id) {
  const f = files.find((x) => x.id === id);
  if (!f) return;
  try {
    const st = await getStorage();
    const rec = await st.get("files", id);
    if (!rec || !rec.blob) throw new Error("file data missing");
    const url = URL.createObjectURL(rec.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = rec.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    toast("Couldn't download the file: " + friendly(e));
  }
}

async function deleteFile(id) {
  const f = files.find((x) => x.id === id);
  if (!f) return;
  if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return;
  try {
    const st = await getStorage();
    await st.del("files", id);
    await refreshAll();
    renderFiles();
    toast("File deleted.");
  } catch (e) {
    toast("Couldn't delete the file: " + friendly(e));
  }
}

/* ---------------- Saved timetables ---------------- */
function renderTimetables() {
  const list = $("timetableList");
  list.innerHTML = "";
  if (!timetables.length) {
    const d = document.createElement("div");
    d.className = "empty";
    d.innerHTML = "<p>No saved timetables yet.</p><p class=\"muted\">Generate one in the <a href=\"/tools/timetable/\">Timetable Generator</a> and save it · it will appear here.</p>";
    list.appendChild(d);
    return;
  }
  for (const t of timetables) {
    const row = document.createElement("div");
    row.className = "file-row";
    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = "🗓️";
    const info = document.createElement("div");
    info.className = "file-info";
    const nm = document.createElement("span");
    nm.className = "list-item-title";
    nm.textContent = t.name || "Untitled timetable";
    const mt = document.createElement("span");
    mt.className = "list-item-meta";
    const subj = (t.input && t.input.subjects ? t.input.subjects.length : 0);
    mt.textContent = `${subj} subject${subj === 1 ? "" : "s"} · saved ${String(t.createdAt || t.updatedAt || "").slice(0, 10)}`;
    info.append(nm, mt);
    const open = document.createElement("a");
    open.className = "btn btn-sm btn-primary";
    open.textContent = "Open";
    try {
      open.href = "/tools/timetable/#plan=" + encodeURIComponent(encodeShare(t.input));
    } catch {
      open.href = "/tools/timetable/";
    }
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-sm btn-ghost danger";
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      if (!confirm(`Delete "${t.name || "this timetable"}"? This cannot be undone.`)) return;
      try {
        const st = await getStorage();
        await st.del("timetables", t.id);
        await refreshAll();
        renderTimetables();
        toast("Timetable deleted.");
      } catch (e) {
        toast("Couldn't delete it: " + friendly(e));
      }
    });
    row.append(icon, info, open, del);
    list.appendChild(row);
  }
}

/* ---------------- Backup ---------------- */
async function refreshBackupPanel() {
  const st = await getStorage();
  let usage = { bytes: 0, quota: 0, percent: 0 };
  try {
    usage = await st.usage();
  } catch {
    /* ignore */
  }
  $("usageText").textContent =
    usage.quota > 0
      ? `${formatBytes(usage.bytes)} of ${formatBytes(usage.quota)} used (${usage.percent}%)`
      : "Storage estimate unavailable in this browser.";
  $("usageBar").style.width = `${Math.min(100, usage.percent)}%`;
  $("usageBar").setAttribute("aria-valuenow", String(Math.min(100, usage.percent)));

  const counts = { notes: notes.length, files: files.length, folders: folders.length, timetables: timetables.length };
  $("backupCounts").textContent =
    `${counts.notes} note${counts.notes === 1 ? "" : "s"}, ${counts.files} file${counts.files === 1 ? "" : "s"}, ` +
    `${counts.folders} folder${counts.folders === 1 ? "" : "s"}, ${counts.timetables} saved timetable${counts.timetables === 1 ? "" : "s"}`;

  try {
    const persisted =
      typeof navigator !== "undefined" && navigator.storage && navigator.storage.persisted
        ? await navigator.storage.persisted()
        : false;
    $("persistStatus").textContent = persisted
      ? "Persistent storage: granted · the browser will try not to delete your data under pressure."
      : "Persistent storage: not granted · keep regular backups, or tap the button below to request it.";
  } catch {
    $("persistStatus").textContent = "Persistent storage: not supported by this browser · keep regular backups.";
  }
}

async function exportBackup() {
  const btn = $("exportBtn");
  btn.disabled = true;
  try {
    const st = await getStorage();
    const raw = await st.exportAll();
    const serial = await serializeBackup(raw);
    const json = JSON.stringify(serial);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = url;
    a.download = `studypilot-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("Backup downloaded.");
  } catch (e) {
    toast("Couldn't export the backup: " + friendly(e));
  } finally {
    btn.disabled = false;
  }
}

async function importBackupFile(file) {
  const out = $("importResult");
  out.hidden = true;
  out.textContent = "";
  out.className = "";
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    fail("That file isn't valid JSON · is it a " + BRAND.name + " backup?");
    return;
  }
  let restored;
  try {
    validateBackup(parsed);
    restored = deserializeBackup(parsed);
    validateBackup(restored); // ids survive deserialization
  } catch (e) {
    fail(e.message || "Import failed: backup didn't pass validation. Your current data was not touched.");
    return;
  }
  const mode = document.querySelector('input[name="importMode"]:checked').value;
  if (mode === "replace") {
    const confirmed = $("confirmReplace").checked;
    if (!confirmed) {
      fail("To replace everything, tick the confirmation box first · and consider exporting your current data before you do.");
      return;
    }
    if (!confirm("Replace ALL current " + BRAND.name + " data with this backup? This cannot be undone.")) return;
  }
  try {
    const st = await getStorage();
    const res = await st.importBackup(restored, { mode, overwrite: mode === "replace" });
    await refreshAll();
    renderNotes();
    renderFiles();
    renderTimetables();
    refreshBackupPanel();
    out.hidden = false;
    out.className = "result";
    out.textContent = `Import complete: ${res.added} added, ${res.skipped} skipped (already existed), ${res.replaced} replaced.`;
  } catch (e) {
    fail("Import failed partway: " + friendly(e) + " Your existing data was left as-is where possible · check your notes and files.");
  }
  function fail(msg) {
    out.hidden = false;
    out.className = "error";
    out.textContent = msg;
  }
}

async function requestPersistence() {
  try {
    const st = await getStorage();
    const ok = await st.requestPersistence();
    toast(
      ok
        ? "Persistent storage granted · the browser will try not to evict your data."
        : "The browser declined persistent storage. Export backups regularly to be safe."
    );
    refreshBackupPanel();
  } catch {
    toast("Persistent storage isn't supported in this browser.");
  }
}

/* ---------------- Errors ---------------- */
function friendly(e) {
  const m = (e && e.message) || String(e || "unknown error");
  if (/quota/i.test(m)) return "browser storage is full · delete some files or export a backup, then try again.";
  return m;
}

/* ---------------- Init ---------------- */
function initTabs() {
  document.querySelectorAll("[data-tab-btn]").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tabBtn));
  });
}

function initNotes() {
  $("newNoteBtn").addEventListener("click", createNote);
  $("noteSearch").addEventListener("input", (e) => {
    state.noteQuery = e.target.value;
    renderNotes();
  });
}

function initFolders() {
  $("createFolderBtn").addEventListener("click", createFolder);
  $("newFolderName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createFolder();
  });
}

function initFiles() {
  const input = $("fileInput");
  $("uploadBtn").addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    handleFileInput(input.files);
    input.value = "";
  });
  const zone = $("dropZone");
  ["dragenter", "dragover"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("dragging");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove("dragging");
    })
  );
  zone.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length) handleFileInput(e.dataTransfer.files);
  });
  $("fileSearch").addEventListener("input", (e) => {
    state.fileQuery = e.target.value;
    renderFiles();
  });
  $("previewClose").addEventListener("click", closePreview);
  $("previewModal").addEventListener("click", (e) => {
    if (e.target.id === "previewModal") closePreview();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("previewModal").hidden) closePreview();
  });
}

function initBackup() {
  $("exportBtn").addEventListener("click", exportBackup);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    if (e.target.files[0]) importBackupFile(e.target.files[0]);
    e.target.value = "";
  });
  $("persistBtn").addEventListener("click", requestPersistence);
}

export async function initStudySpace() {
  initTabs();
  initNotes();
  initFolders();
  initFiles();
  initBackup();
  try {
    await refreshAll();
  } catch (e) {
    toast("Couldn't open browser storage: " + friendly(e) + " The page will still work, but nothing will persist.");
  }
  showDegradedBanner();
  renderNotes();
  renderFiles();
  renderTimetables();
  renderFolderManager();
  switchTab("notes");

  window.addEventListener("beforeunload", (e) => {
    if (state.editorDirty || autosave.pending()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
