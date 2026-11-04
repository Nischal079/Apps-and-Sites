/**
 * StudyPilot — minimal DOCX text extractor. Zero dependencies.
 *
 * A .docx is a ZIP containing word/document.xml. We parse the ZIP central
 * directory (robust against data descriptors), inflate the entry with the
 * platform DecompressionStream, and convert the WordprocessingML to plain
 * text (paragraphs -> newlines, breaks/tabs preserved).
 *
 * Throws a plain-language Error when extraction fails so the UI can offer
 * "download to view" instead. Never throws raw binary at the user.
 */

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

function findEOCD(bytes) {
  // EOCD is within the last 22 + 65535 (max comment) bytes.
  const start = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= start; i--) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset + i, 4);
    if (dv.getUint32(0, true) === EOCD_SIG) return i;
  }
  return -1;
}

/** Parse central directory -> Map of filename -> {method, compSize, offset}. */
function parseCentralDirectory(bytes, eocdOff) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset + eocdOff);
  const count = dv.getUint16(10, true);
  let cdOff = dv.getUint32(16, true);
  const entries = new Map();
  let p = cdOff;
  for (let k = 0; k < count; k++) {
    const h = new DataView(bytes.buffer, bytes.byteOffset + p);
    if (h.getUint32(0, true) !== CD_SIG) {
      throw new Error("zip central directory is corrupted");
    }
    const method = h.getUint16(10, true);
    const compSize = h.getUint32(20, true);
    const nameLen = h.getUint16(28, true);
    const extraLen = h.getUint16(30, true);
    const commentLen = h.getUint16(32, true);
    const localOff = h.getUint32(42, true);
    const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    entries.set(name, { method, compSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data) {
  // DecompressionStream("deflate-raw") is available in all modern browsers
  // and Node 18+. Falls back to a clear error on ancient platforms.
  if (typeof DecompressionStream === "undefined") {
    throw new Error("this browser cannot decompress .docx files");
  }
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** word/document.xml -> plain text. Exported separately for unit testing. */
export function docxXmlToText(xml) {
  let s = String(xml);
  s = s.replace(/<\/w:p[^>]*>/g, "\n");
  s = s.replace(/<w:br[^/]*\/>/g, "\n");
  s = s.replace(/<w:tab[^/]*\/>/g, "\t");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  // Tidy: collapse 3+ newlines, trim trailing space per line.
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/** Extract searchable plain text from a .docx ArrayBuffer. */
export async function extractDocxText(arrayBuffer) {
  let bytes;
  try {
    bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    const eocdOff = findEOCD(bytes);
    if (eocdOff < 0) throw new Error("not a zip file");
    const entries = parseCentralDirectory(bytes, eocdOff);
    const entry = entries.get("word/document.xml");
    if (!entry) throw new Error("no document text found inside");
    // Local file header: skip name + extra to reach the data.
    const lh = new DataView(bytes.buffer, bytes.byteOffset + entry.localOff);
    const nameLen = lh.getUint16(26, true);
    const extraLen = lh.getUint16(28, true);
    const dataOff = entry.localOff + 30 + nameLen + extraLen;
    const comp = bytes.subarray(dataOff, dataOff + entry.compSize);
    let xmlBytes;
    if (entry.method === 0) {
      xmlBytes = comp; // stored, no compression
    } else if (entry.method === 8) {
      xmlBytes = await inflateRaw(comp);
    } else {
      throw new Error("unsupported compression in .docx");
    }
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(xmlBytes);
    const text = docxXmlToText(xml);
    if (!text) throw new Error("document appears to be empty");
    return text;
  } catch (e) {
    if (e && /^(not a zip|no document|unsupported|this browser|document appears|zip central)/.test(e.message)) {
      throw new Error("Couldn't read the text of this .docx file — download it to view instead.");
    }
    throw new Error("Couldn't read the text of this .docx file — download it to view instead.");
  }
}
