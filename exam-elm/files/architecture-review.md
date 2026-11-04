# StudyPilot — Architecture Review
**Reviewer:** verification workstream · **Date:** 2026-11-04 · **Target:** files/architecture.md
**Verdict:** Solid foundation — the right stack for $0 and the privacy story is coherent. But there are **must-fix items before build** (marked 🔴), mostly where the doc is hand-wavy about things that will bite in code: the region schema is underspecified for the calculator's real needs, the PWA notification plan won't work as described, and the SEO story contradicts the JS-rendered tool plan. **Should-fix** items are marked 🟡, nice-to-haves 🟢.

What's genuinely good (keep): vanilla stack + no dependencies, data-never-leaves-browser as a load-bearing principle, date-only arithmetic for countdowns, methodology pages as trust/SEO assets, "unfinished tools never published" as a launch gate, region-as-config-not-code.

---

## 1. Region-config schema — underspecified for what the calculator must do 🔴

The doc says each config holds "grade→points mapping, pass thresholds, percentage conversions, date format, week start, and source URLs." A grade calculator needs more than that, and some regions don't fit a grade→points table at all:

- **Scale type is missing.** US 4.0 GPA, NUS 5.0, NEB 4.0, UK degree *classification* (not a GPA), CBSE percentage — the calculator needs a declared `scale_type` (`gpa_4`, `gpa_5`, `percentage`, `classification_bands`, ...) plus `max_points`, otherwise "weighted GPA per active region config" is unimplementable generically.
- **UK degrees break the table model.** Classification comes from weighted module marks with year weightings (commonly final year ×2 or ×3) and borderline zones — not a grade→points lookup. The schema needs an `algorithm` field (e.g., `weighted_mean_with_bands`) or the UK config will be a lie. Same for any "best-of-N subjects" rule (ICSE best-5).
- **Rounding rules are unspecified** and GPA math lives or dies on them (round half-up to 2dp? truncate? institution-specific?). "Provably correct" tests need the rounding rule in the config, with a test vector that pins it.
- **Credit systems differ by region.** US credit hours ≠ ECTS ≠ UK CATS. The "credits" input needs a per-region label and weight semantics (`credit_unit`, `credit_label`), or users will enter incomparable numbers.
- **Weighted GPA (US) is institution-level, not region-level.** AP +1.0 / honors +0.5 varies by district. Schema should separate *region defaults* from *user-overridable* fields, or the tool will present one district's convention as national truth.
- **"What do I need on the final" needs input-format rules per region** (letter vs percentage input, final-weight conventions) — currently unspecified.
- **Mixed scales in one term** is listed as an edge case with no resolution. Recommendation: normalize every grade to percentage via the region config first, then convert to the target scale. State this in the arch.
- **Versioning**: "versioned JSON configs" names no scheme. Recommend `version` + `effective_from` date + `supersedes` note per config, since boards change formulas (VTU demonstrably has).
- **Grade token validation**: each config should declare its allowed input tokens (e.g., UK GCSE `9..1`, NEB `A+..E`) so validation is data-driven, not coded per region.
- **i18n collision**: region configs contain display strings (grade names, band labels). Decide now whether region configs are locale-neutral keys with strings in `locale/*.json`, or accept English-only region data in v1 (simpler; document the choice).

**Recommendation:** write `_schema.json` FIRST, before T2, with the fields above; every region JSON must validate against it in the test script. No schema, no T2 build.

## 2. Timezone / date edge cases the doc misses 🟡

Credit where due: date-only arithmetic and the DST callout are correct instincts. Gaps:

- **The classic `new Date("2026-11-04")` bug.** ISO date-only strings parse as UTC midnight, shifting the day for users west of UTC. The arch must mandate constructing dates via `new Date(y, m-1, d)` (local) or an explicit parse function — this is the #1 date bug in student tools and the test matrix should include a UTC−8 case specifically for it.
- **"Today" needs a definition**: user's local calendar date at load; recompute on visibility-change/focus, not just load (a tab left open overnight shows stale countdowns).
- **Exam times.** If exams have times (not just dates), "days left" vs "hours left" needs the exam's timezone. Recommendation: v1 = date-only exams (document the limitation); if times are added later, store `exam_tz` explicitly.
- **Timezone travel** is listed as "recompute on load from date-only values" — correct, and worth stating *why* it works (date-only strings carry no zone, so there's nothing stale to fix). The real travel hazard is **scheduled notifications** (see §4).
- **`.ics` export needs a timezone decision.** Floating times shift when the file is imported in another zone; use `TZID` with the user's zone or UTC timestamps. Specify one.
- **Locale date input**: `<input type="date">` is fine where supported, but the manual-entry fallback must accept the region's date format (config already has `date_format` — wire it to the fallback parser and test `DD/MM/YYYY` vs `MM/DD/YYYY` ambiguity explicitly).
- **Week start** is in the config (good) — also decide the timetable's "week" boundary for weekly hour totals, and note Middle-East Saturday-start locales.

## 3. localStorage at syllabus-tracker scale 🟡

The 5MB-per-origin limit is real but the doc has no data model to judge it against:

- **Do the math in the arch.** Rough: one topic ≈ 150–300 bytes JSON. 10 subjects × 60 topics ≈ 120–180 KB — comfortable. The "10k topics" fuzz case ≈ 2–3 MB — survivable on desktop, risky in iOS Safari private mode (where localStorage may throw or be ephemeral). State a supported ceiling (e.g., tested to 5k topics) and what happens past it.
- **No lifecycle story.** Old exam data accumulates forever. Add: archive/delete completed exams flow, and a storage-usage indicator in settings before quota errors surprise users.
- **Import is an attack surface.** JSON import + vanilla JS rendering = XSS if subject names ever hit `innerHTML`. Mandate `textContent`-only rendering (or a tiny escape helper) and schema-validate imports (version check, type check, size cap) with human-readable rejection.
- **Schema migration** is mentioned ("schema versioning with migration") but not designed. Specify: `sp:schema_version` key, per-key version prefixes, and a migrate-on-load function with tests — otherwise v1.1 will corrupt v1.0 data.
- **Cross-tab sync** via the `storage` event is cheap and prevents "I updated in another tab and lost it" confusion. 🟢 nice-to-have, not launch-blocking.
- **QuotaExceededError path** is correctly identified; add the concrete UX: banner + one-tap JSON export + option to archive old exams.

## 4. PWA offline plan — one feature won't work as described 🔴

- **Local exam-reminder notifications are not reliably schedulable without a backend.** A service worker cannot wake itself at an arbitrary future time; `setTimeout` dies with the tab. Options: (a) cut time-based reminders for v1 and do **day-level "check on load"** reminders ("2 exams within 7 days" banner when the app opens) — honest and robust; (b) keep the Notification API only for in-session countdown pings. The arch currently implies real reminders — fix the doc before promising it on a methodology page. 🟡 if scoped to (a).
- **Cache-first HTML needs an update story.** Cache-first shell serves stale UI after deploys with no signal. Specify: versioned cache name, `skipWaiting` + "New version available — refresh" toast. Otherwise users run old calculators with old region configs.
- **Precache manifest must be explicit.** `/offline.html` plus *every* tool page and its assets, since each tool is a separate path. List them; test airplane-mode navigation to each tool.
- **SPA fallback.** The URL scheme (`/tools/grade-calculator/`) on Cloudflare Pages needs either a static `index.html` per tool (better for SEO — see §5) or a `_redirects` SPA fallback rule. Pick one in the arch; don't discover it at deploy time.
- **Shareable URL-hash state has a length ceiling.** A big timetable encoded in the hash can exceed practical URL limits (~2,000 chars for safe sharing). Add a size guard: if encoded state > ~1,500 chars, offer export-file instead of link. Also note hash state is never sent to servers (good for the privacy story) but anyone with the link sees the data (one line in privacy policy).
- **iOS PWA caveats**: installed-PWA-only web push (16.4+), 50MB cache-ish limits vary, `beforeinstallprompt` doesn't fire on iOS. None are launch-blockers for an install-optional tool, but the test matrix should include iOS Safari + installed-PWA pass.

## 5. SEO vs JS-rendered tools — contradiction to resolve 🔴

The growth strategy depends on organic search, but if tool pages are JS-rendered shells, crawlers see thin content and the 18 mapped long-tail queries won't rank.

- **Decision needed:** static HTML per tool with real content in the markup (JS enhances), or a prerender step at build time. Vanilla stack makes this easy — each tool page ships with its heading, explainer copy, and FAQ in HTML; the calculator hydrates. Write this into the arch as a requirement, not an accident.
- **Methodology pages** are correctly identified as SEO assets — add: one URL per region per tool methodology (e.g., `/methodology/grade-calculator/us/`), each targeting its long-tail phrasing. This is also where the region-config source URLs get published (transparency = trust = links).
- Crawlability checklist for launch: sitemap.xml, robots.txt, canonical URLs, meta descriptions per tool, JSON-LD (WebApplication/FAQPage where honest).

## 6. Privacy claim needs enforcement, not just intention 🟡

- **"Zero network requests beyond page assets"** should be enforced by a **Content Security Policy** (`default-src 'self'`, no `connect-src`), not just checked in devtools once. A CSP also mitigates the import-XSS class from §3.
- **Font strategy vs the privacy check.** "Inter-style grotesque" via Google Fonts = a third-party request on every load, contradicting both the privacy story and offline mode. Decide: system-ui stack only (recommended — zero cost, fastest), or self-hosted subsetted woff2 (adds weight to the 150KB budget; document it).
- **Analytics later**: name the planned privacy-respecting option now (e.g., Cloudflare Web Analytics — cookieless, no JS needed) so Phase 4 doesn't re-litigate it, and note the privacy policy must be updated when it lands.
- **Contact page with no backend is undecided.** Options: `mailto:` (spam-scraped, meh), or a free form endpoint (privacy tradeoff — document it). Don't leave it blank; it's a launch checklist item.

## 7. Testing & process gaps 🟢/🟡

- **"CI-less — run before every deploy" will be forgotten.** A GitHub Action running the Node test script on push is free and removes human memory from the loop. 🟡 (cheap, high value)
- **Accessibility**: add `aria-live="polite"` on calculator result regions (screen-reader users otherwise get silence), and label the methodology "show your work" tables properly (`<th scope>`). 🟢
- **Print CSS**: the timetable's "printable view" needs `@media print` rules (ink-friendly, no nav chrome) — one line in the arch saves a bug report. 🟢
- **Reduced motion**: already noted; also honor it in the countdown animations. 🟢
- **Region auto-detect**: `navigator.language` gives language, not country (`en` could be US/UK/India/Singapore). Specify the mapping table locale→default-region with explicit user override, defaulting to `_default` on ambiguity. 🟡

## 8. What's missing entirely

- **Error/empty states design**: every tool needs designed empty states (no exams yet, no subjects yet) — these are the first-run experience, not an afterthought. 🟡
- **Data portability wording**: export/import is listed; specify format stability promise (exports from v1 import into v2) — it becomes a trust feature. 🟢
- **Performance budget enforcement**: who measures the 150KB/Lighthouse gates? Add to definition-of-done: "Lighthouse ≥95 mobile run recorded in the release notes." 🟢
- **Threat model one-liner**: no auth, no backend, no PII — the remaining risks are XSS-via-import (§3) and supply chain (zero deps = near-zero). Worth one paragraph so future contributors don't add a dependency casually. 🟢

---

## Priority-ordered fix list (before T1/T2 build)

**🔴 Must fix (doc changes, no code yet):**
1. Specify the region-config schema fully (scale_type, algorithm, rounding, credit semantics, grade tokens, versioning) — blocks T2.
2. Resolve SEO rendering: static content in HTML per tool page (or prerender) — blocks the growth strategy.
3. Fix the notifications plan: day-level check-on-load reminders, not scheduled push — blocks a false promise.
4. Choose SPA-fallback vs per-tool index.html for Cloudflare Pages; list the precache manifest.
5. Add CSP + font decision (system-ui recommended) to reconcile the privacy story.

**🟡 Should fix:**
6. `new Date(y, m-1, d)` mandate + UTC−8 test case; "today" recompute on visibility change.
7. Storage lifecycle (archive flow, usage indicator, import validation, migration design).
8. GitHub Action for the test script; locale→region mapping table; contact-page mechanism; `.ics` TZID decision; URL-hash size guard.

None of this changes the stack or the $0 budget. The architecture's core bets (vanilla, local-first, config-driven regions) all survive review — these fixes make them actually implementable.
