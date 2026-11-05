# StudyPilot — Task List
Last updated: 2026-11-04 (direction approved: StudyPilot, global, 4 tools, 30-day plan)

## Phase 1 — Market Validation ✅ COMPLETE (2026-11-04)
- [x] Research: 30 recurring student problems (sourced), real questions from Reddit/forums/communities, underserved needs, 15 competitor analyses
- [x] Free-tool/downloadable opportunities; keyword demand vs competition (25 keywords, 15 tools, 18 long-tails)
- [x] Top 5 business opportunities with demand evidence, competitors, costs, monetization, risks → files/business-plan-phase1.md
- [x] Nepal payments verification (eSewa/Khalti/IME Pay, Payoneer/Wise, Paddle/Gumroad/etc., ad networks)
- [x] Pivot research (Nepal exam-prep) + alternative models scan + final scoring of 9 candidates
- [x] Presented to Nischal → direction approved: StudyPilot, GLOBAL (not South-Asia-first)

## Build v0.1 — Master Execution Order (kicked off 2026-11-04)
Authoritative spec: user's MASTER DEVELOPMENT EXECUTION ORDER + files/architecture.md. Each phase: build, test, commit, report. Brand: "StudyPilot" working name CENTRALIZED in one config/strings file (rename = one line); rename decision (ExamElm recommended) stays open, not blocking dev.

### Phase 0 — Inspect & foundations
- [ ] Inspect website/ + website/reference/prototype.html; preserve working demo logic (timetable algorithm, grade calc)
- [ ] Project structure: assets/css, assets/js, config/regions, per-tool dirs, pages
- [ ] Shared foundations: storage.js (versioned IndexedDB), regions.js, design-system CSS, CSP + SEO meta, PWA manifest + service worker

### Phase 1 — Website shell
- [ ] Responsive nav + homepage (hero, what/who/tools/why, 4 tool cards, trust strip, footer)
- [ ] About, Contact, Privacy, Methodology, Guides index
- [ ] SEO metadata, offline fallback

### Phase 2 — Timetable Generator (FIRST TOOL)
- [ ] Full implementation per order §3A (subjects/priorities, exam dates, sessions/breaks, spaced repetition, hour-cap enforcement, local save, print, .ics export, URL-hash sharing) + automated tests + mobile verified

### Phase 3 — My Study Space ✅ COMPLETE (2026-11-04)
- [x] Notes: create/edit/delete, debounced autosave (800ms), full-text search with ranking, markdown toolbar + safe preview (markdown.js escapes-before-formatting; no heavy editor lib)
- [x] Files: upload via input + drag-and-drop (50MB cap), blobs in IndexedDB, preview — images/PDF (page-scoped `frame-src blob:`)/TXT natively, DOCX via dependency-free zip+inflate text extraction (docx.js) with download fallback; download + delete
- [x] Folders: create/rename/move/delete, nested tree, notes+files organized; delete blocked unless empty (never silently discards); cannot move into self/descendant
- [x] Saved timetables: list/load-via-deep-link (`#plan=` hash round-trip into timetable tool)/delete from the timetables store
- [x] Search across note bodies + file names + cached TXT/DOCX text
- [x] Backup: JSON export (blobs→base64) + validated import (merge default, replace requires explicit confirm + export-first nudge), storage usage via navigator.storage.estimate(), persistent-storage request, quota/degraded handling, data-loss warnings
- [x] UI: 4 tabs (Notes/Files/Timetables/Backup) + folder manager, mobile-first, design-system CSS, empty states, plain-language errors, noindex kept
- [x] Tests: 17 new (40/40 green), node --check clean, link/CSP/brand/external-resource/ID audits clean; sw.js precache + v2 bump; privacy page wording corrected
- [x] Visual QA outstanding — flagged in KNOWN-ISSUES.md (environmentally blocked, needs human eyes)

### Phase 4 — BYOK foundation + AI chat ✅ COMPLETE (2026-11-04)
- [x] Adapter architecture (assets/js/ai/): OpenAICompatibleAdapter (OpenAI/OpenRouter/DeepSeek/OmniRoute/custom) + AnthropicAdapter (messages API, anthropic-version + dangerous-direct-browser-access headers, system extraction) + GeminiAdapter (x-goog-api-key header, never in URL; assistant→model role mapping); normalized requests/responses/streaming/errors; AIError codes (invalid-key/rate-limited/model-not-found/bad-request/cors-blocked/network/timeout/aborted)
- [x] Provider management UI (/ai-chat/ Providers tab): add multiple configs (builtin select with honest per-provider CORS notes), model discovery where supported + manual model-ID entry, set default, edit, remove (purges keys); Test-connection button (cheap models-list call) is the CORS verification path — never claims unverified browser access
- [x] Credential security: keys in memory by default, never persisted; optional passphrase-encrypted IndexedDB storage (PBKDF2 210k + AES-GCM via Web Crypto); persisted configs provably key-free (test asserts); full wipe with confirmation; wrong-passphrase fails closed; requests direct browser→provider, key in headers only
- [x] Chat UI: conversation list (conversations store) with delete, streaming with stop/cancel, regenerate, copy (+fallback), per-conversation provider/model/max-tokens, save-assistant-reply-as-note (notes store), configurable output-token limit, pre-send cost estimate with approximate pricing table, 60s timeout, auto-retry with backoff honoring Retry-After
- [x] Disclosures: in-UI warning banner + expanded privacy page section (provider receipt, key storage, XSS risk, separate billing, nothing sent until Send)
- [x] Tests: 32 new (72/72 green), node --check clean; CSP extended per provider origin (explicit allowlist, no wildcards) on ai-chat page; sw.js v3 precache; nav on all pages; TESTING.md + KNOWN-ISSUES.md updated
- [x] Visual QA outstanding — flagged in KNOWN-ISSUES.md (environmentally blocked, needs human eyes)

### Phase 5 — Grade Calculator ✅ COMPLETE (2026-11-04)
- [x] 8 region configs authored from files/regional-grading.md — every trap honored, every UNVERIFIED flag labeled estimate-only or omitted: us.json (4 scale presets: college-board / tenths-default / thirds / A+4.33; weighted bumps user-adjustable; retake replace-vs-average), uk.json (classification bands + 4 UKSCQA year-weighting presets + borderline 2pp override; GCSE/A-level grade-orders reference-only), in-cbse.json (×9.5 LEGACY-ONLY pre-2018 gate; 10 CGPA=95% labeled indicative), in-icse.json (English-forced best-of-5/best-of-4), in-vtu.json (scheme picker MANDATORY: 2021+ ×10 vs 2015–18 (CGPA−0.75)×10), in-mumbai.json (Engineering piecewise 7.1×+12 / 7.4×+12, ceiling; general faculties NOT shipped — coefficient conflict), np-neb.json (8-band table, credit-hour weighting, dual pass thresholds, NG rules; GPA→% estimate-only), sg-nus-ntu.json (5.0 table, NUS + NTU pre-AY2024/25 S/U + NTU FGO presets, honours bands; no Wikipedia % bands)
- [x] Schema extended minimally per review: scale_type += gpa_10, rounding.mode += ceiling (MU); machine-readable conversion params added (VTU scheme.linear, MU formula.pieces, CBSE legacy_conversion.linear, NEB percentage_estimate.linear) — page wiring consumes config data, not hard-coded values
- [x] assets/js/grade.js — pure engine: computeGPA (weighted, exclusions, zero-credit skip, plain-language errors), requiredFinal (needed/impossible+maxPossible/alreadyMet), convertLinear/convertPiecewise, cbseLegacyToPct, estimateGpaToPct, bandFor, weightedYearMark, applyBestOfN, applyRetakeMode, roundValue
- [x] tools/grade-calculator/ — full tool page replacing "coming soon" placeholder (region presets, course rows, per-course exclusion, US bumps/retakes, UK year marks, VTU/MU/CBSE/ICSE converters, NEB estimator, final-needed panel, formula+source+estimate badges on every result, localStorage drafts); noindex removed; no hard-coded brand; esc() throughout
- [x] methodology/grade-calculator/ — trust-contract page: every formula, trap, estimate label, source links; linked from methodology/index.html
- [x] Tests: 41 new (120/120 green, run twice) — known-answer vectors per region incl. VTU both schemes, MU piecewise boundaries, NEB bands, NUS 5.0, UK classification, required-final all 3 outcomes, invalid inputs, config↔engine machine-param agreement, all 9 configs validate
- [x] Static audits: CSP all pages, 0 missing links, 0 fetched external resources, IDs 43/43 + 2/2 present, innerHTML review clean (esc()/static), node --check clean, regions.js fetch made root-relative (+ removed <base> workaround), methodology nav dup link fixed
- [x] sw.js precache extended (grade.js + 8 configs + methodology subpage), cache bumped to studypilot-v4
- [x] Visual QA outstanding — flagged in KNOWN-ISSUES.md (environmentally blocked, needs human eyes)

### Phase 6 — Syllabus Tracker + Exam Countdown ✅ (2026-11-04)
- [x] Tracker: subjects/topics, confidence, completion %, pace, weakest topics (146/146 tests green)
- [x] Countdown: multi-exam, days remaining (timezone-safe date math), prep-time estimates, check-on-load reminders (no backend scheduling)
- [x] Methodology pages: methodology/syllabus-tracker/, methodology/exam-countdown/; noindex removed from both tool pages

### Phase 7 — AI document workflows (incremental, after BYOK solid)
- [x] Chat with explicitly selected notes/files (live "what will be sent" preview, send gated, saved to conversations) — ai-workflows tab 1
- [x] Flashcard generator (parse → flip review → known/unknown → decks in kv `flashdecks:v1` → JSON export) — tab 2
- [x] Quiz generator (MCQ + short → instant scoring → attempts in kv `quizattempts:v1`) — tab 3
- [x] AI study planner (tracker summary → streaming plan → editable draft → save-as-note / structured `#plan=` handoff to timetable) — tab 4
- [x] Notes assistant (summarize/expand/simplify/key-points → preview → Replace/Append behind explicit confirm, never auto-mutates) — tab 5
- [x] Cross-cutting: cost estimate before every send, streaming cancel via Phase 4 engine, output only through safe markdown renderer, per-tab token limits, zero auto-transmission
- [x] Tests: website/tests/aiworkflows.test.js (37 tests) — 183/183 green, zero real API calls; 2 lib bugs found + fixed (summarizeTracker topicName/percent)
- [x] Drive-by fixes: aichat.js unimported adapterFor() → ReferenceError (fixed to adapterForConfig); [hidden] overridden by .btn display (fixed globally)

### Phase 8 — Hardening & launch ✅ COMPLETE (2026-11-04)
- [x] Fixed architecture-review must-fix items: region schema fields (phase 5), SEO/crawlable tool pages (static copy + sitemap 18 URLs + canonicals + JSON-LD), CSP on all 21 pages, import sanitization (innerHTML audit), PWA update story (v7 + toast)
- [x] **Site-wide CSP fix:** 19/21 pages had inline `<script type="module">` dead under `script-src 'self'` — extracted to `site.js` + 5 page controllers; zero inline scripts remain; csp.test.js regression (64 tests)
- [x] Methodology pages per tool: 7 subpages (timetable, grade-calculator, syllabus-tracker, exam-countdown, ai-chat, ai-workflows, study-space)
- [x] Security review: ~97 innerHTML sites clean, secret grep clean, key-storage semantics re-verified; GitHub Action added (.github/workflows/test.yml)
- [x] Offline: sw.js v7 precache verified vs disk (zero 404-at-install); performance: no page over 150KB first-load
- [x] Brand-centralization sweep: .ics PRODID/UID, backup strings, titles, body copy — rename checklist documented
- [x] No unfinished tools public (zero "coming soon" tool placeholders); **files/launch-checklist.md** written — shippable now vs needs-human (visual QA, real-provider smoke tests, deploy, rename decision)
- [x] Tests: 261/261 green (11 files), run twice, stable

### AI Chat redesign — llama.ui-style shell ✅ COMPLETE (2026-11-05, committed, NOT pushed)
- [x] ai-chat page rebuilt as a full-height app shell (this page only): sidebar with brand, pencil new-chat button, search filtering sessions by title, Today/Earlier groups from the unchanged conversations store, IndexedDB footer note, Back to ExamElm link; mobile drawer via hamburger
- [x] Main panel: gear-icon settings, centered greeting + 4 suggestion chips (click fills AND sends), messages with existing markdown/copy/regenerate/save-as-note, composer pinned at bottom (Enter sends, Shift+Enter newline), AI-inaccuracy footer line, active provider + model line opening Settings, cost estimate kept near composer
- [x] Settings slide-over holds ALL provider/model config (list with test/edit/remove, add form, encrypted key storage, model picker + max tokens) + full five BYOK disclosures; Providers tab removed; ProviderStore logic untouched; last-used provider/model memory, streaming + Stop, persistence preserved
- [x] Pure logic in assets/js/ai/chatui.js + tests/aichat-ui.test.js (13 tests); full suite 282/282 green (269 baseline + 13 new), node --check clean, CSP/ID/external-resource/innerHTML/em-dash audits clean; sw.js precache + v11 bump; TESTING.md + KNOWN-ISSUES.md updated
- [x] Pre-existing uncommitted work preserved in the same commit: costs.js price re-verification + launch-checklist.md note
- [ ] Visual QA + real-provider smoke pass outstanding — flagged in KNOWN-ISSUES.md (needs human eyes / live browser); deployment handled separately by coordinator (NOT pushed)

### Step 2 — AI provider connection fixes ✅ COMPLETE (2026-11-05, audit RC-1..RC-10)
- [x] Audit first (read-only, files/ai-provider-audit-2026-11-05.md): verdict code bugs, not a CORS block; zero website/ changes during audit
- [x] RC-1 inline encrypted-storage offer at key entry + explicit key-lost-on-reload messaging (memory-only default preserved)
- [x] RC-2 persisted lastTest per provider, rendered in the card after re-render (success and failure survive)
- [x] RC-4 model always reset to the new provider's default on provider change (both pages); saveLastUsed ordered after reset
- [x] RC-3 testConnection validates the configured model; RC-5 /models-404 falls back to tiny completion
- [x] RC-6 Regenerate missing-key surfaces an inline error (no more silent unhandled rejection)
- [x] RC-8 stream_options gated to openai/openrouter; RC-9 completeOnce abort-race + zero-token JSON fallback; RC-10 OpenAI cors "blocked" → "supported" (probe-verified, browser confirmation pending); RC-7 custom endpoints made honest in the form (no backend proxy)
- [x] Tests: 315/315 green (16 files), run twice; 3 stale ai.test.js expectations updated to the new contract; node --check clean; CSP/ID/innerHTML/em-dash audits clean; TESTING.md + KNOWN-ISSUES.md updated
- [ ] Live provider end-to-end verification outstanding — needs the user's key in the live app (Step 4); Step 3 (Settings UI redesign) NOT started

### Step 3 — Settings redesign ✅ COMPLETE (2026-11-05, data model + UI, committed, NOT pushed)
- [x] Data model (Part 1): per-provider user-managed `models[]` with `addModel` / `editModel` / `removeModel` in ProviderStore, legacy migration on `load()`, pure helpers `modelsForProvider` / `usableProviders` / `validateMaxTokens` in chatui.js; 20 new tests
- [x] UI (Part 2): Settings reordered Providers-first / Chat Model-below; compact accordion provider rows (icon tile, key badge, Connected/Test-failed status, chevron, session-only state); "+" menu with Add Provider (existing fields + password key field, stored in memory, new provider collapsed) and Add Model (provider select, Discover pick-list, manual ID; expands the provider after save); expanded config with key management, per-model Set selected / Edit / Remove + inline Add model, and all existing Test/Discover/Set default/Edit/Remove actions; Chat Model provider select lists only usable providers, model stays input+datalist (user models UNION discovered cache), provider-change reset preserved, max tokens validated via validateMaxTokens, no-key/no-model guidance with shortcut button
- [x] §E implemented: "Store encrypted" action in the expanded key area reveals the encrypted-setup form and focuses the passphrase when encrypted storage already exists — guarded by an unlock-first prompt when any stored key is not in memory (persistEncrypted overwrites the whole stored set)
- [x] AI Tools compat: aiworkflows.js `syncModelList()` uses the same model-suggestion union; provider-change reset and `resolveProvider()` untouched
- [x] Tests: 353/353 green (18 files), run twice; node --check clean; CSP/ID/innerHTML/em-dash audits clean; TESTING.md + KNOWN-ISSUES.md updated
- [ ] In-browser visual QA + Step 4 live provider end-to-end outstanding — needs human eyes / the user's key

### Auto-persist API keys encrypted (once-only passphrase) ✅ COMPLETE + LIVE (2026-11-05, local 1483355, GitHub 75056ea7)
- [x] New flow: first key entry asks for an encryption passphrase ONCE, in the same form as the key; passphrase derives a non-extractable device key (PBKDF2 210k / SHA-256, AES-GCM-256) stored in IndexedDB; keys auto-decrypt on reload/return visits — no passphrase prompt, no key prompt. New module `website/assets/js/ai/keystore.js` (device-key orchestration, IndexedDB-only gate); `crypto.js` gains v:2 `deriveDeviceKey` / `encryptWithKey` / `decryptWithKey`; `ProviderStore` gains `keyStoreState` ("ready" | "needs-passphrase" | "unavailable"), async `setKey`/`forgetKey`, `_readKeyBlobs`/`_writeKeyBlobs`, `tryMigrateLegacy`; `persistEncrypted()`/`wipeEncrypted()` and the `encryptedAtRest` flag removed; `unlock()` kept as the legacy v:1 reader only
- [x] FORGET RULE: forgetting the last stored key also deletes the stored device key + salt, so a fresh start asks for a passphrase again. LEGACY DECISION: v:1 keys migrate only when the user reuses their old passphrase at first new-scheme setup; otherwise they stay stored (not dropped), `unlock()` remains for future one-off recovery. SECURITY HONESTY documented (passphrase protects ciphertext at rest, not against same-origin scripts or a compromised device)
- [x] UI: "Encrypted key storage (optional)" card, inline encrypt offer, and "Store encrypted" action deleted; passphrase field shows only while `keyStoreState` is "needs-passphrase" (per-provider rows + Add Provider form); badge now "Key saved"; disclaimer "Your messages are sent to the API provider you choose. Your API keys are stored encrypted in this browser." in 3 places (Settings under Providers intro, composer under the AI-accuracy line, AI Tools provider section); `missingKeyMessage()` simplified to the single Settings-pointing text
- [x] Cost line follow-up (same change): "Cost unknown" never appears again — unknown (non-free, unlisted) models now show only "Nothing is sent until you press Send." in both `updateCostLine()` (aichat.js) and `setCost()` (aiworkflows.js); `estimateCost()` unchanged (unlisted models still return known:false), known-price estimates and ":free" $0 line untouched
- [x] Tests: 363/363 green (18 files), run twice, stable; 12 new keystore/legacy tests via a reference store stub (plain Map, by-reference, backend "indexeddb"); node --check clean; CSP/ID/innerHTML/em-dash audits clean; TESTING.md + KNOWN-ISSUES.md updated; sw.js precache + v13 bump
- [ ] In-browser reload check outstanding (owner verifies live: add key + passphrase, reload, key still saved with no prompt) + visual QA of the passphrase field/disclaimer — needs human eyes / live browser

### Reasoning-model no-reply fix + Models list moved to Chat Model ✅ COMPLETE (2026-11-05)
- [x] Bug: free reasoning models (nvidia/nemotron-3.5-super-vl:free, xingchen-agi/xing4.0-29b-a4b:free) passed the connection test but the chat sat in "thinking" forever with no reply. Root cause: the SSE parser dropped delta.reasoning_content / delta.reasoning, and the non-streaming fallback was gated on a JSON content-type, so a reasoning-only stream never fell back. Fix: adapters.js parses reasoning deltas (parseJsonResponse also falls back to reasoning fields); chat.js streamChat accumulates reasoning via onReasoning and falls back to completeOnce whenever streaming yields zero content tokens, regardless of content-type; aichat.js/aiworkflows.js render live thinking, and an empty result (even after fallback) now shows "The model returned no response — try another model." saved to history instead of a silent stall; errors are also saved to history so the re-render cannot wipe them
- [x] UI: the Models list moved out of the provider's expanded config into the Chat Model section (below Providers), scoped to the provider selected in Chat Model via new chatui.js helper chatModelListScope; the model search + scrolling input (input+datalist) is untouched; provider config keeps info, key, Test/Discover/Set default/Edit/Remove but no Models list; discovered-count moves with the list; model actions reuse onProviderAction (card null-guarded, edit/add inputs queried document-wide)
- [x] Tests: 375/375 green (18 files) — 10 new reasoning/fallback tests (mocked SSE) + 2 chatModelListScope tests; node --check clean; zero real API calls
- [x] Discover models button added inside the Chat Model Models list too (same action as the provider section's button; the provider one stays) — 2026-11-05
- [x] Add-provider dead-end fixed (2026-11-05): adding a provider with the model field left blank created a model-less provider that the Chat Model dropdown (usable providers only) silently hid, showing "None of your providers has a model yet." Now, adding a provider without a model opens the Add Model form for it and auto-runs discovery so the user taps a model from the list; the toast says "Pick a model to start chatting."
- [ ] Owner's live checks outstanding: send a message to the two free models and confirm a reply appears; confirm the Models list shows under Chat Model, not inside the provider section
