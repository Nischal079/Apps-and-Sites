/**
 * StudyPilot service worker · offline foundations.
 *
 * Strategy: versioned cache, cache-first for app shell + tool pages.
 * On new deploy: skipWaiting + clients get a "New version available · refresh"
 * toast (page listens for the 'sp-update' message). Update PRECACHE on every
 * release so airplane-mode navigation to each tool keeps working.
 *
 * NOTE: no scheduled background work here · exam reminders are day-level
 * "check on load" banners (a service worker cannot wake itself without a
 * backend). See architecture review §4.
 */
const CACHE = "studypilot-v10";

// Update this list on every release. Every tool page + its assets.
const PRECACHE = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/assets/css/main.css",
  "/assets/js/config.js",
  "/assets/js/ui.js",
  "/assets/js/storage.js",
  "/assets/js/regions.js",
  "/assets/js/grade.js",
  "/assets/js/tracker.js",
  "/assets/js/countdown.js",
  "/assets/js/timetable.js",
  "/assets/js/studyspace.js",
  "/assets/js/markdown.js",
  "/assets/js/docx.js",
  "/assets/js/aichat.js",
  "/assets/js/aiworkflows.js",
  "/assets/js/site.js",
  "/assets/js/page-studyspace.js",
  "/assets/js/page-timetable.js",
  "/assets/js/page-grade-calculator.js",
  "/assets/js/page-syllabus-tracker.js",
  "/assets/js/page-exam-countdown.js",
  "/assets/js/ai/adapters.js",
  "/assets/js/ai/providers.js",
  "/assets/js/ai/chat.js",
  "/assets/js/ai/costs.js",
  "/assets/js/ai/crypto.js",
  "/assets/js/ai/workflows.js",
  "/assets/js/ai/lastused.js",
  "/assets/js/page-dashboard.js",
  "/config/regions/_default.json",
  "/config/regions/us.json",
  "/config/regions/uk.json",
  "/config/regions/in-cbse.json",
  "/config/regions/in-icse.json",
  "/config/regions/in-vtu.json",
  "/config/regions/in-mumbai.json",
  "/config/regions/np-neb.json",
  "/config/regions/sg-nus-ntu.json",
  "/tools/timetable/",
  "/tools/grade-calculator/",
  "/tools/syllabus-tracker/",
  "/tools/exam-countdown/",
  "/study-space/",
  "/dashboard/",
  "/ai-chat/",
  "/ai-workflows/",
  "/about/",
  "/privacy/",
  "/methodology/",
  "/methodology/grade-calculator/",
  "/methodology/syllabus-tracker/",
  "/methodology/exam-countdown/",
  "/methodology/timetable/",
  "/methodology/ai-chat/",
  "/methodology/ai-workflows/",
  "/methodology/study-space/",
  "/contact/",
  "/guides/",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => {
        /* offline during install · runtime caching still applies */
      })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll().then((clients) =>
          clients.forEach((c) => c.postMessage({ type: "sp-update" }))
        )
      )
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never cache third parties
  e.respondWith(
    caches.match(request, { ignoreSearch: false }).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          // Runtime-cache successful same-origin GETs for offline resilience.
          if (res.ok && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/config/"))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    ).catch(() => caches.match("/offline.html"))
  );
});
