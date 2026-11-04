/**
 * StudyPilot — tiny safe markdown renderer for notes.
 *
 * Security contract: user input is HTML-escaped FIRST, and only then is
 * markdown syntax applied to the escaped text. The output is therefore safe
 * to assign via innerHTML. Links are restricted to http(s) URLs.
 *
 * Supported: headings (#..###), fenced code blocks, **bold**, *italic*,
 * `code`, [links](https://…), - unordered lists, 1. ordered lists,
 * > blockquotes, --- rules, paragraphs.
 */
import { esc } from "./ui.js";

const PH = "\u0000"; // placeholder marker for protected code spans

function inlineMd(escaped) {
  // Protect `code spans` before other inline rules run.
  const codes = [];
  let s = escaped.replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`);
    return `${PH}${codes.length - 1}${PH}`;
  });
  // Links: [text](http://… or https://…) only.
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  // Bold then italic (non-greedy, single-line).
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // Restore code spans.
  s = s.replace(new RegExp(`${PH}(\\d+)${PH}`, "g"), (_, n) => codes[Number(n)]);
  return s;
}

export function renderMarkdown(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const n = lines.length;

  while (i < n) {
    const line = lines[i];

    // Fenced code block — content shown verbatim (escaped), no markdown inside.
    if (/^```/.test(line)) {
      const body = [];
      i++;
      while (i < n && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence (or EOF)
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }

    // Blank line: block separator.
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // ATX heading.
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      out.push(`<h${h[1].length} class="md-h">${inlineMd(esc(h[2].trim()))}</h${h[1].length}>`);
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^---+$/.test(line.trim())) {
      out.push("<hr />");
      i++;
      continue;
    }

    // Blockquote: consecutive > lines.
    if (/^>\s?/.test(line)) {
      const qs = [];
      while (i < n && /^>\s?/.test(lines[i])) {
        qs.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inlineMd(esc(qs.join("\n"))).replace(/\n/g, "<br />")}</blockquote>`);
      continue;
    }

    // Lists: consecutive - or 1. lines (single level; nesting out of scope).
    if (/^(\s*[-*]|\s*\d+\.)\s+/.test(line)) {
      const items = [];
      let ordered = false;
      while (i < n && /^(\s*[-*]|\s*\d+\.)\s+/.test(lines[i])) {
        const m = /^(\s*[-*]|\s*\d+\.)\s+(.*)$/.exec(lines[i]);
        if (/^\s*\d+\./.test(m[1])) ordered = true;
        items.push(`<li>${inlineMd(esc(m[2]))}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }

    // Paragraph: consecutive plain lines joined with <br />.
    const ps = [];
    while (
      i < n &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^>\s?/.test(lines[i]) &&
      !/^(\s*[-*]|\s*\d+\.)\s+/.test(lines[i])
    ) {
      ps.push(lines[i]);
      i++;
    }
    out.push(`<p>${inlineMd(esc(ps.join("\n"))).replace(/\n/g, "<br />")}</p>`);
  }

  return out.join("\n");
}
