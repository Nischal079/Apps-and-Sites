# StudyPilot — Technical Architecture & Build Plan
**Status:** Approved direction · **Date:** 2026-11-04 · **Budget:** $0
**Brand:** StudyPilot — "Study smarter. Prepare better. Achieve more."
**Positioning:** Free academic productivity toolkit for high-school and university students worldwide. Global-first; region-configurable, never region-locked.

---

## 1. Final brand direction

- **Name (working):** StudyPilot — clear, memorable, says what it does. Availability/trademark/handle verification runs in parallel (files/brand-direction.md); rename cost is near-zero before launch if a conflict surfaces.
- **Tagline:** Study smarter. Prepare better. Achieve more.
- **Voice:** plain-spoken, encouraging, precise. No hype, no edu-jargon. Every claim verifiable (methodology pages show the working).
- **Visual identity:** modern, trustworthy, calm. Deep indigo (trust/study) + warm amber accent (achievement/energy) on clean neutrals. System-ui + Inter-style grotesque; large touch targets; generous whitespace. Light-first with dark-mode support via `prefers-color-scheme`.
- **Brand promise (homepage must prove in 5 seconds):** free · no signup · private (your data stays in your browser) · works for your grading system.

## 2. Website structure

```
studypilot.web (static)
├── /                          homepage — what / who / tools / why
├── /tools/
│   ├── timetable/              (chosen over /study-timetable-generator/ — short URLs)
│   ├── grade-calculator/
│   ├── syllabus-tracker/
│   └── exam-countdown/
├── /guides/                   original guides mapped 1:1 to real student problems
├── /methodology/              how each calculation works, per region (trust pages)
├── /about/  /contact/  /privacy/
└── /offline.html              PWA fallback
```

- Every tool is reachable from the homepage in one tap. Every tool links to its methodology page.
- URL scheme is region-agnostic; region is a user setting (default: auto-detect locale, changeable anytime).

## 3. Technology stack ($0, no lock-in)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS (ES modules), no framework | Fastest load, zero dependencies, zero CVE churn, trivial to maintain |
| Styling | Hand-written modern CSS, custom properties | Mobile-first, <150 KB total first load |
| Storage | `localStorage` (namespaced `sp:*`), JSON export/import | Privacy principle: data never leaves the browser; works offline |
| Offline | Service worker (cache-first for shell) | Low-bandwidth users; exam-hall reliability |
| Hosting | Cloudflare Pages (free) | Global CDN, free SSL, preview deploys |
| Domain | Free option (e.g. `studypilot.com.np` via register.com.np) or Pages subdomain at launch; custom domain only with approval | $0 rule |
| i18n | All strings in `locale/en.json` from day one | English first; future languages = new JSON files |
| Testing | Node-based unit tests for calculations (no framework needed); manual device matrix | Calculations must be provably correct |
| Analytics | None at launch (privacy principle); privacy-respecting option later only | No unnecessary data collection |

**Performance budget:** <150 KB first load · <1 s on 3G · Lighthouse ≥95 · WCAG 2.1 AA.

## 4. Regional configuration architecture (global-first)

Never assume a grading formula. All regional logic lives in versioned JSON configs the tools consume — never hard-coded:

```
/config/regions/
  ├── _schema.json        # required fields every region defines
  ├── us.json             # 4.0 GPA (plus/minus variants, weighted option)
  ├── uk.json             # degree classification bands; GCSE 9–1; A-level A*–E
  ├── in-cbse.json        # CGPA → % (×9.5), ...
  ├── in-vtu.json / in-mumbai.json / ...
  ├── np-neb.json         # NEB 4.0 GPA, A+–E bands
  ├── sg-nus-ntu.json     # 5.0 scale, A+–F, S/U excluded
  └── _default.json       # universal fallback (percentage-based)
```

Each config documents: grade→points mapping, pass thresholds, percentage conversions, date format, week start, and **source URLs**. Provisional values are marked `UNVERIFIED` until `files/regional-grading.md` (parallel research, official sources) confirms them. Adding a country = adding one JSON file + methodology section. No code changes.

## 5. Four-tool technical specifications

### T1 — Study Timetable Generator (Week 1 build)
- **Inputs:** subjects (name, priority 1–3), exam dates, available hours/day, session length (25/50/90 min), break preference, start date, region (for date format/week start).
- **Algorithm:** (1) days remaining per subject = exam date − today (timezone-safe, date-only math); (2) weight = priority × urgency(1/days-left); (3) allocate sessions proportionally, never exceeding daily hours; (4) auto-insert spaced-repetition review blocks at +1/+3/+7/+14 days; (5) rest day preserved if requested.
- **Outputs:** day-by-day plan table, printable view, `.ics` download, save-to-browser, shareable read-only link (encoded state in URL hash — no server).
- **Edge cases:** exam date in past → error; zero hours → error; overlapping exams; DST transitions (date-only arithmetic, never timestamp diffs).

### T2 — Grade Calculator
- **Inputs:** courses (name, credits/hours, current grade or score, weight), region selector; "what do I need on the final?" mode (current %, final weight %, target grade).
- **Calculations:** weighted GPA per active region config; percentage↔GPA both directions; required-final-score = (target − (1−w)×current) / w with boundary checks.
- **Validation:** rejects grades outside the region's scale; warns when target is mathematically impossible ("even 100% won't reach A — highest possible is B+").
- **Edge cases:** retakes, pass/fail (S/U excluded per region), zero-credit courses, mixed scales in one term.

### T3 — Syllabus Coverage Tracker
- **Inputs:** subjects → chapters/topics (add/remove/reorder), exam date, confidence per topic (haven't started / in progress / confident).
- **Features:** % complete per subject and overall; pace indicator (required topics/day vs. elapsed); "weakest topics" list sorted by exam proximity × low confidence; all state in localStorage; export/import JSON.
- **Edge cases:** empty syllabus, exam date moved, topics added late (re-baselines pace).

### T4 — Exam Countdown Planner
- **Inputs:** exams (name, date, daily study-hours available).
- **Features:** days-left per exam (timezone-safe); required daily hours = remaining syllabus topics ÷ days left (links to T3 data when present); visual countdown cards; optional browser notification permission (opt-in only, local only).
- **Edge cases:** same-day exams, past dates, timezone travel (recompute on load from date-only values).

**Shared tool contract:** every tool works with zero signup; every input validated with human-readable errors; every calculation links to its methodology page; every tool saves locally and exports; no tool phones home.

## 6. Development milestones (30-day plan)

| Week | Dates | Milestone | Done when |
|---|---|---|---|
| 1 | Nov 4–10 | Architecture + brand verification + **T1 timetable generator** built | Architecture approved; T1 passes its test matrix on mobile + desktop |
| 2 | Nov 11–17 | T1 polish + **T2 grade calculator** (all region configs verified) | Both tools pass calculation tests for every shipped region |
| 3 | Nov 18–24 | **T3 syllabus tracker + T4 countdown** | All four tools complete, linked, methodology pages live |
| 4 | Nov 25–Dec 1 | Full test pass, fixes, feedback, **public launch** | Zero known calculation errors; no unfinished tool is public |

## 7. Testing strategy

- **Calculation tests:** Node script asserting known-answer cases per region (e.g., US 4.0: A(4)+B(3) over equal credits = 3.50; NEB bands; NUS 5.0 scale; "need on final" impossibility cases). Every region config ships with its test vectors; CI-less — run before every deploy.
- **Input validation:** fuzz every field (empty, negative, absurd dates, unicode, 10k topics); each failure must produce a plain-language error, never a crash or NaN display.
- **Timezone/date:** fixed test dates across UTC−8…UTC+12, DST spring-forward/fall-back weeks, date-line crossing; countdowns use date-only arithmetic.
- **Storage:** localStorage full/quota-exceeded → graceful in-memory fallback + export prompt; private-mode Safari; schema versioning with migration.
- **Mobile layout:** 360×640, 390×844, 768×1024, desktop; touch targets ≥44px; no horizontal scroll.
- **Accessibility:** keyboard-only run-through, screen-reader labels on all inputs, contrast AA, `prefers-reduced-motion` respected.
- **Privacy review:** confirm zero network requests beyond page assets before launch (devtools check).
- **Definition of done per tool:** tests green · mobile verified · invalid inputs handled · methodology page live · privacy check passed. **Unfinished tools are never published.**

## 8. Estimated ongoing maintenance

- **Time:** ~0–1 hr/week steady state. Tools are evergreen; region configs change only when boards revise formulas (rare, and each is one JSON edit + test run).
- **Money:** $0 — static hosting free tier, no backend, no database, no AI/API costs, no dependencies to patch.
- **What could raise it:** adding regions (one-time ~1–2 hrs each incl. tests), guides cadence (kept deliberately light), user feedback triage. Content treadmills (daily posts, video) were rejected in Phase 1 and stay rejected.

---

## Open verifications (parallel workstream, must land before T2 build)
1. `files/regional-grading.md` — every formula above confirmed against official sources (US, UK, CBSE/ICSE/VTU/Mumbai, NEB, NTU/NUS), with URLs.
2. `files/brand-direction.md` — StudyPilot name/domain/handle/trademark clearance.
3. Architecture review pass on this document.
