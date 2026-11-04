/**
 * StudyPilot — CSP regression tests (Phase 8).
 *
 * Guards the site-wide inline-script fix: every shipped HTML page must load
 * its JS from external files only (the site ships `script-src 'self'`, which
 * makes inline <script> dead code in real browsers). Pure node:fs reads —
 * imports nothing DOM-touching, so no browser/DOM stubs are needed.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function shippedHtmlFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "reference") continue; // prototype only, not shipped
        walk(p);
      } else if (e.name.endsWith(".html")) {
        out.push(p);
      }
    }
  };
  walk(ROOT);
  return out.sort();
}

const pages = shippedHtmlFiles();
const rel = (p) => path.relative(ROOT, p);

test("csp: ships at least one HTML page", () => {
  assert(pages.length > 0, "no shipped HTML pages found");
});

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  const name = rel(page);

  test(`csp: ${name} has no inline <script> (script-src 'self' blocks them)`, () => {
    const tags = html.match(/<script\b[^>]*>/gi) || [];
    for (const tag of tags) {
      // Data blocks (e.g. JSON-LD) never execute: script-src does not apply.
      if (/type\s*=\s*["']application\/ld\+json["']/i.test(tag)) continue;
      assert(
        /\ssrc\s*=\s*["']/.test(tag),
        `${name}: inline script without src would be dead under CSP: ${tag}`
      );
    }
  });

  test(`csp: ${name} carries a CSP meta`, () => {
    const m = html.match(
      /<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i
    );
    assert(m, `${name}: missing Content-Security-Policy meta tag`);
    assert(
      /script-src\s+'self'/.test(m[0]),
      `${name}: CSP meta does not pin script-src 'self'`
    );
  });

  test(`csp: ${name} <script src> targets exist on disk`, () => {
    const tags = html.match(/<script\b[^>]*>/gi) || [];
    // pages like offline.html legitimately ship zero scripts
    for (const tag of tags) {
      if (/type\s*=\s*["']application\/ld\+json["']/i.test(tag)) continue; // data block
      const sm = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i);
      assert(sm, `${name}: script tag without src: ${tag}`);
      const src = sm[1];
      // Site convention: absolute /assets/... paths resolved from site root.
      const disk = src.startsWith("/")
        ? path.join(ROOT, src.slice(1))
        : path.join(path.dirname(page), src);
      assert(
        existsSync(disk),
        `${name}: script src "${src}" does not exist on disk`
      );
    }
  });
}
