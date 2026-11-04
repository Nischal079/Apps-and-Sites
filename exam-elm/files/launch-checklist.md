# StudyPilot v0.1 — Launch Checklist
**Status:** build complete (Phase 8, 2026-11-04). **261/261 tests green.** NOT yet deployed.
Owner: Nischal. Budget: $0 — nothing here costs money.

## Shippable NOW (verified in this repo)
- [x] All 4 core tools functional: timetable generator, grade calculator (9 region configs, traps honored), syllabus tracker, exam countdown
- [x] My Study Space (notes/files/folders/backups), AI chat (BYOK), AI workflows (5 tabs)
- [x] Zero "coming soon" tool placeholders — every tool page is real and working
- [x] 261/261 unit tests green (`node tests/run.js`), incl. timezone matrix (8 zones, DST), CSP regression tests, share-guard, region validation
- [x] Security: no inline scripts site-wide (CSP `script-src 'self'` honored), innerHTML audit clean (~97 sites), zero secrets in repo, key storage memory-first + encrypted opt-in + wipe
- [x] Methodology trust-contract page for every tool (7 subpages)
- [x] SEO: sitemap.xml (18 URLs), robots.txt, canonicals, meta descriptions, WebApplication JSON-LD, static crawler-visible copy per tool page
- [x] PWA: versioned service worker (v7), precache manifest verified against disk, offline fallback page
- [x] CI: `.github/workflows/test.yml` runs the suite on push/PR
- [x] Performance: no page exceeds the 150KB first-load budget (heaviest: grade-calculator ~102KB raw)
- [x] Brand centralized: rename flows through config.js (plus the small checklist below)

## Needs a human before public launch (cannot be done from the build environment)
1. **Visual QA on a hosted preview** — layout, mobile 360px, dark mode, empty states for every page (live-browser access is environmentally blocked from here)
2. **Real-provider smoke tests** — BYOK streaming end-to-end against at least one provider (zero real API calls were made during development, per constraints); the in-app Test-connection button is the verification path for DeepSeek/Gemini CORS claims
3. **Deploy to Cloudflare Pages** — connect the repo, confirm the custom domain/subdomain, verify `_headers`/redirects if needed
4. **Rename decision** — DONE 2026-11-04: Nischal chose **ExamElm**. Applied via the rename checklist below.
5. **Re-verify the AI cost table** (`assets/js/ai/costs.js`) — captured 2026-11-04, providers change prices
6. **Guides content** — guides page honestly shows "coming soon" cards (content backlog, NOT a tool gap; not a launch blocker)
7. **iOS Safari + installed-PWA pass** and service-worker update flow in a real browser

## Rename checklist — DONE 2026-11-04 (StudyPilot → ExamElm)
1. [x] `website/assets/js/config.js` → `BRAND.name = "ExamElm"` (flows to all UI, titles, JSON-LD, .ics, backup strings)
2. [x] `website/manifest.webmanifest` → `name`, `short_name` = "ExamElm"
3. [ ] Canonical URLs + `sitemap.xml` domain — LEFT for deploy time (domain undecided; currently `studypilot.pages.dev`)
4. [ ] `tools/timetable/index.html` JSON-LD `url` field — LEFT for deploy time (same reason)
5. [ ] `website/assets/js/site.js` / docs references to the Pages URL — none exist; recheck at deploy
Also done: `data-brand` fallback text (privacy, ai-chat), timetable.js engine fallback default + its test, sw.js cache bumped to v8.
6. **Do NOT change** (data identifiers — renaming these breaks existing users' data):
   - IndexedDB database name (`studypilot` in storage.js)
   - Backup format `app: "studypilot"` marker and `studypilot-backup-*.json` filenames
   - Region config `id` fields

## Suggested launch sequence
1. Nischal decides the brand (or ships under the working name on a Pages subdomain)
2. Deploy preview → human visual QA pass → fix round
3. Real-provider smoke test → cost table re-check
4. Deploy production → submit sitemap to search console → announce in one student community (per growth plan: organic, no spam)

## Deliberate limitations (documented, not bugs)
- Custom local-gateway AI endpoints blocked by the static CSP allowlist (architectural; needs a future mechanism)
- `completeOnce()` one-shot AI path still relies on AbortSignal propagation (low severity, used sparingly)
- NEB GPA→% and similar unverified conversions are labeled estimate-only in UI + methodology
- Mumbai University ships Engineering piecewise only (general-faculty coefficients conflicted in sources)
- No scheduled push notifications (no backend) — reminders are check-on-load banners
