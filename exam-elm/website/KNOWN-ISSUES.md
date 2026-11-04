# KNOWN-ISSUES.md

## Open
- AI Workflows (ai-workflows page) visual QA outstanding (layout, mobile 360px, dark mode, empty states, streaming UX, 5-tab flow): live-browser verification is environmentally blocked — needs human eyes before public launch.
- AI Workflows: zero real API calls made during development (per constraints) — end-to-end streaming against real providers unverified; PDF/DOCX text-extraction paths in-browser unverified; `#plan=` timetable handoff verified only at the unit level (phase-2 hash handler trusted); SW v6 update flow unverified.
- Syllabus Tracker + Exam Countdown visual QA outstanding (layout, mobile 360px, dark mode, confidence-cycler/reorder UX, countdown edit flow, reminder banner on day rollover, print): live-browser verification is environmentally blocked — needs human eyes before public launch.
- Grade Calculator visual QA outstanding (layout, mobile 360px, dark mode, region-switching UX, draft persistence, print): live-browser verification is environmentally blocked — needs human eyes before public launch.
- Grade Calculator deliberate behaviors (documented, not bugs): US weighted bumps apply at base ≥ 2.0 (C and above — "often no bonus on D/F" per doc, flagged on screen as district convention); UK weights by YEAR per UKSCQA models (credits recorded for reference, stated in UI); MU ships Engineering piecewise only (general-faculty coefficients conflicted — not shipped); CBSE ×9.5 gated behind explicit pre-2018 confirmation; NEB GPA→% always badged estimate.
- AI Chat visual QA outstanding (layout, mobile 360px, dark mode, empty states, streaming UX): live-browser verification is environmentally blocked — needs human eyes before public launch.
- Per-provider direct-browser-access claims are documented honestly in the UI (OpenAI: blocked, Anthropic: supported via header, OpenRouter: supported, DeepSeek/Gemini: unverified) but the DeepSeek/Gemini verdicts were NOT verified from this environment — the in-app Test-connection button is the verification path. Do not mark them verified until a real browser test passes.
- Custom user endpoints (local gateways) are blocked by the ai-chat page's static CSP, which allowlists only the 5 built-in provider origins. A static page cannot grant per-user CSP exceptions — this is an architectural limitation, documented in the UI and the CSP comment. Future options: per-user options page, browser extension, or documented gateway subdomain pattern.
- Cost table (assets/js/ai/costs.js) is approximate public pricing captured 2026-11-04; providers change prices — re-verify before launch and periodically after.
- Study Space visual QA outstanding (layout, mobile 360px, dark mode, empty states): live-browser verification is environmentally blocked — needs human eyes before public launch.
- PDF preview renders via `<iframe src="blob:…">` under a page-scoped `frame-src blob:` CSP addition: logic reviewed, needs in-browser confirmation (Chrome/Edge/Safari/Firefox).
- Quota-exceeded and private-mode (IndexedDB unavailable → in-memory fallback) paths are implemented with graceful messaging but untested in a real browser; the degraded banner and backup-first guidance need a manual pass.
- Large-file uploads (>50 MB) are rejected client-side with a plain message; very large IndexedDB blobs may still hit browser-specific limits — observed behavior should be recorded here after manual testing.

## Resolved
- 2026-11-04 (phase 8): brand-centralization sweep — .ics PRODID/UID now take opts.brandName (page passes BRAND.name), backup error/confirm strings via BRAND, 5 hard-coded <title>s → {{brand}}, privacy + ai-chat body copy → data-brand spans. Data identifiers (IndexedDB name, backup app marker/filenames) intentionally survive renames.
- 2026-11-04 (phase 8): sw.js precache gaps closed — /contact/, /guides/, 4 new methodology pages added; manifest verified against disk (zero 404-at-install risk).
- 2026-11-04 (phase 8): inline `<script type="module">` dead under `script-src 'self'` — the open item named index.html but it was site-wide: 19 of 21 shipped pages. Fixed by extracting one shared bootstrap (`assets/js/site.js`, loaded by 13 static pages) and 5 page controllers (`page-studyspace.js`, `page-timetable.js`, `page-grade-calculator.js`, `page-syllabus-tracker.js`, `page-exam-countdown.js`). 0 inline executable scripts site-wide, guarded by new `tests/csp.test.js` (64 tests); sw.js → studypilot-v7. In-browser smoke pass still outstanding (see TESTING.md phase 8 entry).
- 2026-11-04 (phase 7): `aichat.js` called unimported `adapterFor()` → ReferenceError on first real chat send; fixed to `state.providers.adapterForConfig(config)`.
- 2026-11-04 (phase 7): global `[hidden]{display:none!important}` added — `.btn`'s `display:inline-flex` was overriding the UA `[hidden]` style, so the ai-chat Stop button was always visible.

## Deferred (documented, not forgotten)
- `completeOnce()` (assets/js/ai/chat.js, one-shot non-streaming path) still relies solely on AbortSignal propagation: it takes no user `signal` param and a signal-ignoring fetch could wedge its timeout. Same hang class as the fixed streamChat issue, lower severity (used sparingly, has timeoutMs). Fix or remove before public launch.

- Region configs beyond `_default` (us/uk/in-*/np-neb/sg-nus-ntu) ship with the grade calculator (phase 5), authored from files/regional-grading.md.
- BYOK provider adapters need per-provider `connect-src` CSP additions — phase 4, user-configured providers only.
- Push-style scheduled notifications are NOT possible without a backend (arch review §4): reminders are day-level check-on-load banners.
- GitHub Action for tests: recommended by review; add before public launch.
