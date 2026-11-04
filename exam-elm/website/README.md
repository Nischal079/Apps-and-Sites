# StudyPilot v0.1 — website source

Production source for the StudyPilot platform. Vanilla HTML/CSS/JS (ES modules), no framework, no backend, static hosting. $0.

## Run locally

```bash
cd website
python3 -m http.server 8000
# open http://localhost:8000
```

ES modules require http(s) — `file://` will not work.

## Run tests

```bash
cd website
node tests/run.js
```
Zero dependencies. Run before every commit. See TESTING.md for results.

## Structure

```
website/
├── index.html                  homepage (phase 1)
├── offline.html                PWA fallback
├── manifest.webmanifest        PWA manifest
├── sw.js                       service worker (versioned cache, update toast)
├── robots.txt / sitemap.xml    SEO (phase 1)
├── assets/
│   ├── css/main.css            design system (tokens, components, print)
│   ├── js/config.js            BRAND + shared strings — rename = edit here
│   ├── js/ui.js                esc(), date-only helpers, theme, toast, brand injection
│   ├── js/storage.js           versioned IndexedDB wrapper + backup validation
│   └── js/regions.js           region-config loader + validation
├── config/regions/
│   ├── _schema.json            required fields per architecture review §1
│   └── _default.json           universal percentage fallback
├── tools/
│   ├── timetable/              study timetable generator (phase 2)
│   ├── grade-calculator/       (phase 5 — regional-grading.md is authoritative)
│   ├── syllabus-tracker/       (phase 6)
│   └── exam-countdown/         (phase 6)
├── study-space/                My Study Space (phase 3)
├── pages/                      about, contact, privacy, methodology, guides
├── tests/                      node unit tests, no framework
├── reference/                  prototype.html (reference only — not shipped)
├── README.md / TESTING.md / KNOWN-ISSUES.md
└── CSP                         strict, in <meta> on every page:
    default-src 'self'; script-src 'self'; style-src 'self';
    img-src 'self' data: blob:; connect-src 'self'; object-src 'none'
    (BYOK phase extends connect-src per user-configured provider only)
```

## Conventions

- Brand strings: import from `assets/js/config.js`. Never hard-code the brand name in markup (use `data-brand="name"` + `ui.injectBrand()`).
- User data in DOM: `esc()` or `textContent` only — never `innerHTML` with user content.
- Dates: `parseDateInput()` / `todayLocal()` / `daysBetween()` from ui.js. Never `new Date("YYYY-MM-DD")`.
- Storage: `openStorage()` from storage.js. localStorage for prefs only (theme, region).
- Every tool page ships real content in HTML (SEO: crawlers see headings + explainer, JS enhances).
- Definition of done per tool: tests green · mobile verified · invalid inputs handled · methodology live · privacy check (zero non-asset network requests) · no unfinished tool published.
