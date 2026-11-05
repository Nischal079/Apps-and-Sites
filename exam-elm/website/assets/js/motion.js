/**
 * ExamElm · motion system.
 *
 * Runs once per page (side-effect import from site.js, and directly from
 * aiworkflows.js which wires its own menu and must not import site.js).
 * Everything is guarded: no document/window (Node tests) means only the
 * pure helpers export; prefers-reduced-motion disables all of it.
 *
 * What it does:
 * - Word-by-word headline reveal on tool-page headers (static h1s only;
 *   data-brand headlines and empty ones are left alone).
 * - Rotating hero word on the homepage (#heroRotator).
 * - Scroll reveals: cards and list items fade up once when they enter view.
 * - Page-leaving fade: internal link clicks fade the page out briefly
 *   before the browser navigates, so the next page's entrance feels smooth.
 */

export const ROTATOR_WORDS = ["Learn", "Practice", "Understand", "Remember"];

export function rotatorNext(index) {
  return (index + 1) % ROTATOR_WORDS.length;
}

function splitHeadline(h1) {
  const text = h1.textContent.trim();
  if (!text || h1.hasAttribute("data-brand")) return;
  const words = text.split(/\s+/);
  if (words.length < 2) return;
  h1.setAttribute("aria-label", text);
  h1.textContent = "";
  words.forEach((word, i) => {
    const span = document.createElement("span");
    span.className = "w";
    span.style.animationDelay = i * 70 + "ms";
    span.textContent = word;
    h1.append(span);
    if (i < words.length - 1) h1.append(document.createTextNode(" "));
  });
}

function initRotator() {
  const el = document.getElementById("heroRotator");
  if (!el) return;
  let index = 0;
  window.setInterval(() => {
    if (document.hidden) return;
    el.classList.add("rot-out");
    window.setTimeout(() => {
      index = rotatorNext(index);
      el.textContent = ROTATOR_WORDS[index];
      el.classList.remove("rot-out");
    }, 250);
  }, 2600);
}

function initReveals() {
  // The AI chat page keeps its approved design untouched by reveals.
  if (document.body.classList.contains("chat-app")) return;
  const targets = document.querySelectorAll(
    "main .card, main .tool-card, main .stat-card, main .dash-link, " +
      "main .plan-day, main .ss-section, main .ss-side, main .ss-main, main .list-item",
  );
  if (!targets.length) return;
  if (typeof IntersectionObserver === "undefined") {
    return; // very old browser: leave everything visible, no animation
  }
  targets.forEach((el) => el.classList.add("reveal"));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -8% 0px" },
  );
  targets.forEach((el) => io.observe(el));
}

function initPageLeaving() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    if (link.target && link.target !== "_self") return;
    try {
      if (new URL(href, location.href).origin !== location.origin) return;
    } catch {
      return;
    }
    document.body.classList.add("page-leaving");
  });
}

export function initMotion() {
  document.querySelectorAll(".tool-header h1").forEach(splitHeadline);
  initRotator();
  initReveals();
  initPageLeaving();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) initMotion();
}
