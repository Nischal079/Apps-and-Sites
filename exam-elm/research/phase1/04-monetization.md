# Monetization Research — Student Success Hub
**Researched:** 2026-11-04 (read-only; no accounts created, no sign-ups)
**Budget:** $0 — free sources only
**Rule followed throughout:** every factual claim cites its source URL. Where something could not be verified from an official page, it says so. Nothing is invented.

---

## TL;DR — Nepal payment verdict

| Rail | Works from Nepal? | Verdict |
|---|---|---|
| **Paddle** (merchant of record, sells your digital products, handles tax) | ✅ Nepal NOT on its official unsupported-countries list → eligible, subject to review. Payout monthly by wire or Payoneer, $100 minimum | **Primary digital-product rail** |
| **Google AdSense** (display ads) | ✅ Official Google table: Nepal gets Check + Wire transfer (no EFT). Wire to a Nepali bank works | **First income channel** |
| **Khalti by IME** (Nepali wallet, Stripe integration) | ✅ Official Khalti blog: receive international payments via Stripe into Khalti wallet, 2% fee, settled in NPR, KYC-verified users. Inward only | **Useful fallback / invoice-style** |
| **Payoneer** | ✅ Works in Nepal; receive via USD/GBP/EUR receiving accounts; withdraw to Nepali bank; government-ID KYC | **Useful as a payout destination for affiliate networks (Impact, Paddle)** |
| Stripe (own account) | ❌ Nepal not on stripe.com/global list | Closed |
| PayPal (Nepal account) | ❌ Send-only; cannot link Nepali bank; cannot receive or withdraw | Closed for payouts |
| Gumroad | ❌ Nepal not on its bank-payout list; PayPal fallback fails because Nepali PayPal can't receive. Gumroad's own help: "If your country is not supported by direct bank deposits or PayPal, then unfortunately, we have no way to pay you out for now." | Closed |
| Lemon Squeezy | ❌ Nepal not on its bank-payout country list; only remaining route is PayPal, which a Nepali account can't receive through | Effectively closed |
| Wise | ❌ NPR is send-to-only; "transaction origin country cannot be Nepal"; Nepal not on Wise's hold-money list | Send-to-Nepal only, not usable as creator payout rail |
| eSewa / Khalti (domestic) / FonePay | ❌ Domestic only (eSewa: India-UPI inbound only; wallets settle in NPR) | Not for international customers |
| Amazon Associates direct deposit | ⚠️ Direct deposit only for eligible countries (IBAN/BIC list); Nepal not documented → realistic options are check ($100 min) or gift card; a Payoneer US receiving account is a documented workaround | Usable but awkward |

---

## A) Digital product opportunities

### What actually sells — observed prices (from public product pages, 2026-11-04)

**Notion student dashboards/templates (Gumroad):**
| Product (public listing) | Price | Notes |
|---|---|---|
| The Ultimate Student Dashboard (thenoteworthy.gumroad.com) | £12.99 | 11 custom templates bundled; "worth £12.99" framing |
| 🎓 Study Planner Notion (currentyted.gumroad.com) | $14 | Dashboard w/ deadlines, GPA, weekly focus |
| Academic Notion Planner, ADHD-focused (functionalfairy.gumroad.com) | $8.99 | Aesthetic niche positioning |
| Student Planner (pixelshine.gumroad.com) | $15 | Complete academic organizer |
| Student Planner Minimal Theme (theorganizednotebook.gumroad.com) | $15 | Minimal aesthetic niche |
| Academic Dashboard (wysvisionary.gumroad.com) | $8.50 | Course manager + grade calc + bonus pages |
| Studio Ghibli Student Dashboard (peachiesuga.gumroad.com) | $9.99 | Pop-culture theme niche; **"2 ratings" shown publicly** |
| IB Student Planner (designsbymegg.gumroad.com) | $2.99 | Niche exam niche |
| Student Planner (flownotiontemplates.gumroad.com) | A$7.50 | 20+ pages |
| Student's Dashboard (momomuse.gumroad.com) | $4.99+ | Pay-what-you-want floor |

**Observed price band: ~$1–$15; cluster around $5–$15 for full dashboards, $3–$8 for smaller planners.** Top products bundle many databases (assignments, exams, notes, grades, habits) and lean on an aesthetic/theme niche (Ghibli, minimal, ADHD). Instant PDF delivery of a duplicate-link is standard; most state "no refunds — digital product."

**Printable study planners (Etsy):** $1.75 (daily study bundle, sale) to $12.25 (ultimate 32-page academic planner). Typical range $3–$12. Exam-prep niche kits go higher (NCLEX-RN 26-page kit: $12.00).

**Review-count signals:** No listing surfaced in this research pass showed a public review-count other than "2 ratings" on one Gumroad listing. Treat Gumroad/Etsy search ranking (not public reviews) as the visible popularity signal; do not assume sales figures.

### Why they sell
- Student buyers want "done-for-you" organization, not theory: dashboards, trackers, printable planners.
- Aesthetic/thematic niches (minimal, anime, ADHD-friendly) differentiate commodity planners.
- Low prices ($3–$15) = impulse buys; refund risk is minimal so creators accept "no refunds."

### 5–7 realistic product ideas for Student Success Hub (price points are PROPOSED/estimates, pegged to the observed bands above)

1. **Ultimate Study OS (Notion dashboard)** — *proposed $12–$15.* Bundles: course tracker, assignment/exam countdown, weekly study planner, grade calculator, revision habit tracker. Why: matches the top-selling Gumroad band exactly; a free slim version doubles as list-builder bait.
2. **30-Day Exam Sprint Planner (printable PDF)** — *proposed $5–$7.* Undated daily pages, Pomodoro trackers, "topic coverage map" sheets. Why: undated = evergreen, sells year-round to every exam cohort.
3. **Formula & Key-Concept Cheat-Sheet Pack (per subject)** — *proposed $4–$6 per subject.* Why: our site already produces study-guide content — these are packaged versions of free content, near-zero extra production cost.
4. **Flashcard Decks (Anki/Quizlet + printable)** — *proposed $3–$5 per deck.* Why: flashcard decks are evergreen exam-niche sellers (NCLEX-type precedent at $12); low production effort.
5. **Essay & Lab-Report Template Pack** — *proposed $6–$9.* Structured Word/Google Docs templates with examples and marking-rubric checklists. Why: fills a gap — few templates target academic writing specifically.
6. **"First Semester Survival" Bundle** — *proposed $9–$12.* Bundles products 1–5 at a discount. Why: bundles raise average order value; Gumroad supports product bundles natively.
7. **Niche exam prep kit** (e.g., Nepal SEE/+2 or a global standardized exam module) — *proposed $7–$10.* Why: the NCLEX-style niche kits command the highest observed prices; a Nepal-specific kit has near-zero competition. (Wait for niche decision in Phase 1 before producing.)

**Pricing strategy note:** start at the low end of each band, use Gumroad-style "pay what you want" floors if the chosen rail supports them, and apply purchasing-power-parity discounts (Gumroad has PPP built in; Paddle checkout is USD-centric — plan a low headline price).

---

## B) Affiliate programs — terms as publicly stated

| Program | Commission (as cited) | Cookie | Payout rails / min | Fit for a study site | Sources |
|---|---|---|---|---|---|
| **Amazon Associates** | 0–10% by category (US): physical books **4.5%**, All Other **4%**, luxury beauty 10%. *Rates change periodically — re-check Amazon's fee schedule.* | **24 hours** | Direct deposit ($10 min), gift card ($10), check ($100, $15 fee waived if address outside US). Net-60. Application reviewed after 3 qualifying sales in 180 days | High. Recommend stationery, desk gear, books on study-guide pages | affiliate-program.amazon.com help pages (payments, international); ecomchief.com, amawp.com, milesinsights.com (Aug–Sep 2026 checks of Amazon's own table) |
| **Bookshop.org** | **10% per sale** (up to 15% enhanced program) — more than double Amazon's 4.5% on books | ⚠️ Official support says commissions apply to sales "for 48 hours by way of a referral link"; third-party reviews cite 30 days — **not fully verified, confirm before relying** | Program page on bookshop.org; network profile on Awin | Good for book-heavy study content; indie-bookstore mission is a differentiator | bookshop.org/affiliates/profile/introduction; support.bookshop.org (official); brandid.app, inkfluenceai.com (2026 checks) |
| **Coursera** | **15–45%** per sale depending on product type | **30 days** | Via **Impact** network: self-scheduled, $10 min, PayPal or bank transfer (70+ currencies) | High. Recommend relevant courses inside study guides | theaffiliateslist.com, affiliatepicker.com, affground.com, getacomma.com (2026); about.coursera.org/affiliates |
| **Udemy** | ~**10–15%** (varies by promo); courses often sell at $9.99–$14.99 so per-sale $ is small | **7 days** | Via Impact ($10 min) or Rakuten ($50 min), PayPal / direct deposit / check, NET 60 | Medium. Good conversion via sale prices, low per-sale payout | affiliatepicker.com (Aug 2026 check), wecantrack.com, uppromote.com, commissiondex.com |
| **Skillshare** | **10% baseline** per valid sale (performance increases) | **30 days** | Via Impact | Medium-high for creative/study-skill content | theaffiliateslist.com |
| **Notion (refer the tool itself)** | Historically up to $50 per activated signup + 20% of first-year revenue | — | — | ⚠️ **Notion's official affiliate page is currently CLOSED to new affiliates** (checked Sep 2026 by multiple sources). Watch notion.com/affiliates for reopening. Meanwhile: SELL templates on Notion Marketplace (8% + $0.40 per transaction + 1% FX fee outside US, per Notion's help page) | notion.com/affiliates; way2earning.com, scoutner.com, makeinfluence.com (2026) |
| **Gumroad affiliate (as a promoter, not seller)** | Default 10% to promoters of others' products | — | — | Low priority for now | makeinfluence.com (citing Gumroad docs) |
| Web hosting affiliates ("start a blog" angle) | — | — | — | **Not recommended** — irrelevant to a student audience | General reasoning |

**Nepal payout practicality for affiliates:** Amazon's own help limits international direct deposit to eligible countries — assume check/gift-card for Nepal, or route via a **Payoneer US receiving account** (a widely documented workaround; verify the receiving-account details work for the specific program at signup). Impact network pays by bank transfer in many currencies — check Nepal eligibility during signup. **Every network's country eligibility must be verified at signup; none of them publish a Nepal-specific "yes" I could confirm in this pass.**

---

## C) Ad revenue

| Network | Requirements (publicly stated) | Revenue share | Verdict for a new site |
|---|---|---|---|
| **Google AdSense** | No minimum traffic. Must be 18+, own site with original content, comply with policies. **Nepal payouts: Check and Wire transfer available (EFT not available)** — wire goes straight to a Nepali bank; $100 payment threshold | Google keeps 32% (publishers get 68% on content ads — longstanding AdSense terms) | **Start here, day one.** Only rail in this section with a verified Nepal payout |
| **Journey by Mediavine** (entry tier) | 1,000 sessions in 30 days from Tier-1 countries (US, Canada, UK, Australia); original content; Mediavine's free Grow plugin installed ≥30 days | Publisher keeps **70%** | Realistic first upgrade target |
| **Mediavine (full)** | Since Jan 2026: **$5,000 in annual ad revenue** (replaced the old 50,000-sessions rule); original audience-first content; good standing with AdSense/Ad Exchange | 75% → up to 85–90% with tenure | Long-term target |
| **Ezoic** | ⚠️ Raised bar: **250,000 monthly users** (reported Feb 2026, from Ezoic's own page as read Sep 2026 by toolincomelab.com — secondary source, verify) | Not stated here — verify | Effectively out of reach for now |
| **Raptive** | 25,000 monthly pageviews (down from 100k) | — | Mid-term alternative |

**Realistic expectations (general reasoning, not a promise):** a new site earns ~$0 for months. AdSense RPMs for informational/study content are typically low single dollars; meaningful revenue starts around 10k+ monthly pageviews, and Mediavine-tier money requires either big traffic or high-RPM niches. Ads are a slow-burn channel — plan on 6–12 months before they matter. Sources: outrank.so, monetizes.net, technoxprt.com (Mediavine 2026 rules, Oct 2026 checks); toolincomelab.com (Ezoic/Mediavine comparison, Sep 2026).

---

## D) Nepal payment verification — official-source table

| Provider | Nepal eligibility (creator receiving money) | KYC / requirements | Payout method & minimum | Fees (as stated) | Source URL |
|---|---|---|---|---|---|
| **Stripe** | ❌ **Not supported.** Nepal is absent from Stripe's official global availability list | N/A | N/A | N/A | https://stripe.com/global (opened 2026-11-04; Nepal not listed) |
| **PayPal** | ⚠️ **Send-only.** Nepali accounts can be created and can send/pay with an internationally-enabled (USD/dual-currency) card, but **cannot receive payments or withdraw to a Nepali bank**. NRB forex rules block inbound; a formal PayPal launch has been projected (mid-2026–2027) but **no official announcement exists** | Email + phone signup; a USD "dollar card" ($500/yr NRB limit) for verification | No payout path exists | N/A | https://merokalam.com/blog/paypal-account-in-nepal/ · https://nepinsights.com/world/national-news-nepal/paypal-stripe-nepal-freelancers · https://byajdar.com/blog/paypal-in-nepal · https://www.gulmiresunga.com/2025/12/paypal-account-nepal.html · https://thinkmovesolutions.com/blogs/paypal-in-nepal/ (official paypal.com country page could not be fetched in this pass — consensus across five Nepal-focused sources) |
| **Gumroad** | ❌ **No payout route for Nepal.** Official help: bank payouts in ~120 listed countries — **Nepal is not listed**; PayPal is the only fallback, and Nepali PayPal can't receive. Gumroad: "If your country is not supported by direct bank deposits or PayPal, then unfortunately, we have no way to pay you out for now." No Payoneer/Wise/wire/check | Gov't photo ID; proof of residence | $100 minimum standard; bank (where listed) or PayPal (+2% fee), 1–3 business days | 10% + $0.50 per direct sale, plus 2.9% + $0.30 card processing (third-party check of Gumroad pricing, Oct 2026) | https://gumroad.com/help/article/13-getting-paid (official) · https://www.swell.is/content/gumroad-pricing (fees) |
| **Paddle** | ✅ **Supported.** Official help: "Paddle works with software businesses anywhere in the world with the exception of the unsupported countries listed below" — **Nepal is not on the list.** Every seller still passes Paddle's review (reportedly strict) | Business/product review; identity & business details | Monthly by **bank wire or Payoneer**, **$100 minimum** | Paddle's standard fee is 5% + $0.50 per transaction (third-party checks, Sep–Oct 2026 — verify on paddle.com pricing at signup); MoR (handles global VAT/sales tax) | https://www.paddle.com/help/legal/sanctions/which-countries-are-supported-by-paddle (official) · https://edgekits.dev/en/blog/stripe-not-available-in-my-country-sell-code/ · https://pactors.io/en/blog/kompaniya-dlya-saas-bez-stripe (payout details, Sep 2026) |
| **Lemon Squeezy** | ❌ **Effectively closed.** Official docs: bank payouts in listed countries — **Nepal not listed**; PayPal payouts in 200+ countries/regions, and "If you don't see your country listed by PayPal or in the list below, sorry, you won't be able to use Lemon Squeezy at this time." Nepali PayPal can't receive → no route. (Also: Stripe-owned, migrating toward Stripe Managed Payments) | — | — | 5% + $0.50 per order +1.5% non-US +1.5% PayPal (third-party checks of LS pricing) | https://docs.lemonsqueezy.com/help/getting-started/supported-countries (official) |
| **Payoneer** | ✅ **Works in Nepal.** Receive via USD/GBP/EUR "receiving accounts"; withdraw to a linked Nepali bank (NPR or USD FCD); standard route for Nepali freelancers via Upwork/Fiverr | Government-issued ID (citizenship/passport); proof of address sometimes; Nepali bank account in matching name (SWIFT code) | Withdraw to bank; ~3–5 business days | Conversion markup historically ~1.85% for NPR (third-party fee schedules — confirm inside account at signup) | https://merokalam.com/blog/payoneer-card-in-nepal/ · https://www.gulmiresunga.com/2025/12/withdraw-payoneer-funds-nepal.html · https://gettingpaid.scaleturn.com/payoneer-nepal-guide.html (official payoneer.com fee page could not be fetched — verify numbers inside account) |
| **Wise** | ❌ **Not usable as a Nepal-based creator account.** NPR is send-to-only ("You can only send money to these currencies"); "Transaction origin country cannot be Nepal"; Nepal not on Wise's hold-money list. Money can be SENT *to* Nepali banks, not received *as* a Nepal-based creator | — | — | — | https://wise.com/help/articles/2932337/guide-to-npr-transfers · https://wise.com/help/articles/2571907/what-currencies-can-i-send-to-and-from (official) |
| **eSewa** | ❌ **Domestic only.** Nepal's largest digital wallet; cross-border limited to **inbound from India via UPI**. Cannot receive payments from international customers worldwide | NRB-regulated KYC | NPR wallet; merchant caps apply | — | https://docs.barcoder.ai/docs/wallets/khalti (Khalti/eSewa technical doc) · https://rabinsxp.com (eSewa India-UPI note) |
| **Khalti by IME** | ✅ **Receives international payments.** Official Khalti blog: built-in **Stripe integration** — create a payment request in-app, client pays by card/Apple Pay/Google Pay/eBanking from 100+ countries, **settled instantly in NPR into the Khalti wallet**. **2% service fee.** KYC-verified users only; **inward only** (no outward transfers) | Full KYC in-app (per NRB rules); PAN + occupation details on payment requests | Wallet → bank transfer (NRB wallet limits apply: wallet may not hold >Rs 50,000 overnight) | 2% service fee on transaction amount | https://blog.khalti.com/offers/frequently-asked-questions-receive-international-payments-directly-in-your-khalti-wallet-via-stripe/ (official) · https://blog.khalti.com/services-in-khalti/khalti-stripe-international-payments-nepal/ (official) |
| **FonePay** | ❌ Domestic QR/switch network (NEPALPAY QR) — no international customer payments | — | — | — | https://docs.barcoder.ai/docs/wallets/khalti |

**Also noted (not fully verified, secondary sources):** **Creem** (merchant of record) lists Nepal as supported for payouts (getpaidatlas.com, Oct 2026) and **Freemius** pays Nepal by bank wire (zealden.com, Oct 2026) — both are software-oriented; treat as backup options to research if Paddle rejects the application. **Etsy Payments** availability for Nepal sellers could not be verified from an official page in this pass — do not build on Etsy as a sales channel yet.

**Regulatory context:** Nepal Rastra Bank (NRB) controls foreign exchange; foreign income must enter through authorized banking channels and be declared; the IRD expects tax filing on foreign income. Neither PayPal nor Stripe has a formal NRB partnership as of the latest checks (Sep 2026); NRB is developing a payment-gateway policy that may open the door mid-2026–2027 — **no official launch announced, do not plan around it.**

---

## E) Realistic monetization timeline (order of operations)

### Phase 0 — Now (Months 0–2): $0, build only
- No income expected. Focus: content, SEO, free tools, email list.
- **Apply for Google AdSense early** — approval takes time; it's the only ad rail with a verified Nepal payout (wire to Nepali bank, $100 threshold).
- **Join affiliate programs with viable Nepal payout paths:** Amazon Associates (plan on check/gift-card, or route via Payoneer US receiving account — verify at signup), Coursera/Udemy/Skillshare via Impact (verify Nepal bank-transfer eligibility at signup). Use affiliate links in study guides from day one — links compound.
- **Set up Payoneer account** (free, read-only KYC prep) as the universal payout destination.
- **Complete Khalti full KYC** so the Stripe-payment-request feature is ready as a fallback.

### Phase 1 — Traction (Months 3–6): first dollars
- **AdSense** revenue begins (small; wire transfer at $100 threshold).
- Affiliate income from course/stationery/book recommendations (Coursera 15–45% is the highest-leverage one).
- At **1,000 sessions/30 days from US/CA/UK/AU** → apply to **Journey by Mediavine** (70% rev share).
- Begin building the first digital product (free slim version as lead magnet; full version held for launch).

### Phase 2 — Products (Months 6+): only when audience exists
- **Launch digital products on Paddle** (merchant of record, handles tax, pays Nepal via wire/Payoneer, $100/mo minimum). Paddle review is the gating risk — apply with a finished product and real site.
- Products: Study OS Notion dashboard ($12–15), Exam Sprint Planner ($5–7), cheat-sheet packs ($4–6), flashcard decks ($3–5) — start with 1–2.
- **Khalti-Stripe payment requests** as a manual fallback for direct sales/coaching (2% fee) — not a storefront, but workable for high-touch sales.

### Phase 3 — Scale (Month 12+)
- Full **Mediavine** at $5,000/yr ad revenue → 75–85% share.
- Expand product line (bundles, niche exam kits); consider Creem/Freemius as backup rails.

### Honest caveats
1. **Expect $0 for the first 2–6 months.** Monetization before traffic is fantasy.
2. **Nepal's rails are workarounds, not first-class.** Paddle is the only mainstream digital-product rail confirmed open to Nepal — its application review is the single biggest risk to product income. Have Creem as backup research ready.
3. **Do not touch Gumroad or Lemon Squeezy as a Nepal-based creator** — no verified payout path.
4. **NRB compliance:** receive foreign income only through authorized channels (Paddle wire, Payoneer, AdSense wire, Khalti); keep records for IRD tax filing. Never use VPN workarounds for PayPal/Stripe — accounts get frozen with funds held (documented pattern).
5. **Affiliate network eligibility must be re-verified at signup** — country lists change; this file is a snapshot of 2026-11-04.
6. AdSense RPMs for study/informational content are low; affiliate + products will outperform ads per visitor for the first year.
7. Prices above marked "proposed" are estimates pegged to observed market bands, not quotes.
