/**
 * StudyPilot · shared site bootstrap.
 *
 * Runs once per page (imported as a side effect). Handles theme init, brand
 * injection, mobile menu wiring, theme-toggle icon sync, and service-worker
 * registration. Previously inlined in every HTML page; extracted to an
 * external module so it survives the site-wide `script-src 'self'` CSP
 * (inline <script> blocks are dead code in real browsers).
 *
 * Pages load this directly (<script type="module" src="/assets/js/site.js">)
 * or via a side-effect import from their page-controller module.
 * Everything here is null-guarded: pages may omit menuBtn/mobileMenu or the
 * theme toggle without errors.
 */
import { initTheme, injectBrand, toast } from "/assets/js/ui.js";

initTheme();
injectBrand();

/* Mobile menu */
const menuBtn = document.getElementById("menuBtn");
const mobileMenu = document.getElementById("mobileMenu");
if (menuBtn && mobileMenu) {
  menuBtn.addEventListener("click", () => {
    const open = mobileMenu.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  mobileMenu.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      mobileMenu.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.setAttribute("aria-label", "Open menu");
    }
  });
}

/* Theme toggle icon */
const themeBtn = document.querySelector("[data-theme-toggle]");
const syncThemeIcon = () => {
  if (themeBtn)
    themeBtn.textContent =
      document.documentElement.dataset.theme === "dark" ? "\u2600" : "\u263E";
};
syncThemeIcon();
new MutationObserver(syncThemeIcon).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});

/* Service worker: toast on 'sp-update' (guarded for file:// dev) */
try {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "sp-update") {
        toast("New version available \u2014 refresh to update");
        const el = document.querySelector(".toast");
        if (el) {
          el.style.pointerEvents = "auto";
          el.style.cursor = "pointer";
          el.addEventListener("click", () => location.reload(), { once: true });
        }
      }
    });
  }
} catch (e) {
  /* file:// dev or unsupported */
}
