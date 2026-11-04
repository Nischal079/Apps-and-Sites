# Alternative Models — Phase 1 Scan (Models A, B, C)
**Researched:** 2026-11-04 (read-only; no accounts, no sign-ups, no posting, no contacting)
**Budget:** $0 — free sources only
**Rule followed throughout:** only numbers actually displayed on pages opened, labeled "observed"; publicly stated rates/medial kits only; "could not verify" beats guessing. Every factual claim cites its source URL.

---

## Model A — Study Accountability Platform

**Concept:** Timezone-aware accountability-partner matching + scheduled virtual body-doubling rooms for students. The pitch: r/studypartner and Discord study groups are chaotic; people repost constantly because matching is manual and timezone-blind.

### Demand evidence (observed, not inferred)
- **r/studypartner is active with a repeating demand pattern.** On the redlib mirror (page crawled 2026-03-09), ~20+ recent posts follow the same template: exam (NEET, NMAT, CFA, CA Inter, JEE, bank exams), age/gender, **timezone (IST/CET/EST stated explicitly in most posts)**, "serious/consistent only", 1:1 vs group preference. Examples observed: *"I'm looking for an accountability partner... We can check in regularly, share progress, and keep each other disciplined"*; *"Timezone matters a lot... Daily contact is necessary hence same timezone is very important."* Source: https://redlib.freedit.eu/r/studypartner
- **The churn problem is visible in the posts themselves.** Multiple posters demand "serious" partners precisely because previous matches flaked. One poster started *"a small group on Discord for... Bodydoubling... meant to be at about 5-8 people max. There are only 2 other people in the group atm"* — a direct observation of the cold-start/churn dynamic. Source: https://redlib.freedit.eu/r/studypartner
- **r/getmotivatedbuddies shows the same demand in the broader productivity community**, with body-doubling requests specifying timezone (AEST, GMT+8, CDT, IST) and gender preferences. Source: https://red.applefritter.com/r/getmotivatedbuddies?sort=hot&t=&before=t3_1g0gbpj
- **Body doubling is an established, named technique** with a growing how-to literature (Essex Student guide, Athenify, OVRIT, College Bound Academy blogs), including ADHD-community adoption — the concept doesn't need to be invented, just productized. Sources: https://www.essexstudent.com/news/article/14274/Body-Doubling-to-help-with-revision-what-is-it-and-how-to-do-it/ · https://athenify.io/blog/body-doubling-study-technique · https://ovrit.app/study-tips/body-doubling-adhd-college

### Competitors (verified)
| Competitor | Model | Price (observed) | Scale note (observed) |
|---|---|---|---|
| **Study Together** (Discord) | 24/7 drop-in voice/video study rooms, leaderboards, study bots; free | Free to join | **1,068,406 members, 44,908 online** — observed on Discord's official server listing page. Largest study server on Discord. Source: https://discord.com/servers/study-together-595999872222756885 |
| **Focusmate** | 1:1 scheduled video sessions (25/50/75 min), stranger matching | **Free: 3 sessions/week. Plus: $8/mo billed yearly or $12/mo billed monthly** — observed on third-party reviews of Focusmate's own pricing page, Oct 2026. Sources: https://roomie.cafe/blog/focusmate-review · https://www.saner.ai/blogs/focusmate-review | "People from more than 150 countries" (Focusmate's own claim, via https://www.mindfulscholar.online/2026/09/best-one-on-one-online-study-websites.html) |
| **StudyStream** | 24/7 live video focus rooms, Pomodoro timers, streaks; free core | **Free (1 hr/day observed). Basic $1.99–$3.99/mo, Premium $6.99/mo or $69.99/yr** — US App Store in-app purchases, observed Oct 2026. Neither the site nor stores itemize what paid tiers add. Sources: https://toolgpa.com/tools/studystream · https://apps.apple.com/us/app/studystream/id6461722416 | **"270K+ motivated students"** — app store listing claim, observed on https://play.google.com/store/apps/details?id=live.studystream.app&hl=en&gl=us |
| **Supporti** | 1:1 real-person buddy, 7-day sessions, daily chat check-ins | **$15.99/mo or $129.99/yr, 14-day free trial, no free tier** — from Supporti's official help center. Source: https://www.getsupporti.com/help | Niche app; pricing shows the ceiling of what individuals pay for buddy accountability |
| **Flow Club / FLOWN / Deepwrk** | Hosted group coworking | Flow Club $40/mo; FLOWN ~$19–25/mo; Deepwrk $12–19/mo — observed via third-party market research citing vendor pages, Aug 2026. Source: https://github.com/amritkang165/cherrypick/blob/HEAD/docs/market-research.md | Premium end of the market |

**Differentiation verdict:** The space is crowded with funded players at every price tier. The only under-served wedge visible in the posts is **timezone-aware 1:1 matching for specific exam cohorts** (Indian competitive exams, Nepali students) — a niche the global platforms don't localize. That wedge is real but small and hard to defend.

### Startup + maintenance costs (money AND time, honest)
- **Money: $0** is genuinely achievable — Discord server + voice rooms + a matching board (Google Form → spreadsheet, or a free Discord bot) costs nothing. No video infrastructure to build; Discord provides it.
- **Time to launch: ~1–2 days** of setup.
- **Ongoing time — this is the critical weakness:** moderation of stranger-matching is a safety operation, not a community hobby.
  - r/studypartner's **top pinned post is a safety warning**: *"This subreddit is for finding study partners... It is not a dating app... instant bans"* for flirting/video-chat misuse. Observed: https://redlib.freedit.eu/r/studypartner
  - The 1M-member Study Together server is described as having **"robust moderation to maintain a safe environment"** — i.e., the successful incumbent pays for it in staff time. Source: http://vertahub.blogspot.com/2026/06/discord-community-study-together.html
  - Gender-specific safety requests appear in the wild ("looking for a female body double", "Please only message me if... not do something stupid"), meaning a matching platform inherits harassment-report handling, age-verification concerns (minors studying for JEE/NEET are under 18), and dispute resolution.
- **Churn treadmill:** accountability partnerships die when one side flakes; the sub's posts prove reposting is constant. A platform must continuously re-match, handle no-shows, and fight the "empty room" cold start — this never becomes passive.
- **Honest estimate: 1–3 hrs/day of human moderation at any non-trivial scale, forever.** This is the opposite of a tool that runs itself.

### Monetization path
- **Freemium subscription** is the proven path: Focusmate ($8–12/mo), StudyStream (premium tiers), Supporti ($15.99/mo). A Nepali/student audience is price-sensitive; realistic price would need to be well under Focusmate's — and conversion on free student tools is notoriously low.
- **Sponsorships** of a Discord community are weak (no owned email list, brand-safety issues with unmoderated chat).
- Realistic revenue only appears at scale, which requires the moderation operation above. **Payment collection from Nepal is solvable** (Paddle, per `research/phase1/04-monetization.md`: Nepal not on Paddle's unsupported-countries list, payouts by wire/Payoneer, $100 minimum, fee ~5% + $0.50/transaction per third-party checks) — payments are not the blocker; the human operation is.

### Risks
1. **Moderation/safety burden is existential** — stranger video matching with minors in the user base; one incident is a reputation-ending event.
2. **Cold start / liquidity:** matching needs simultaneous users in the same timezone; without it the product is an empty Discord server (observed in the "only 2 other people" post).
3. **Crowded market:** Study Together (1M members, free) and Focusmate own the two ends; a new entrant's wedge is a thin geographic/exam niche.
4. **No recurring-visitor moat without the human layer:** the moment moderation stops, quality collapses.

### Minimal-maintenance fit: **2 / 5**
Demand is genuinely strong and the $0 build is trivial — but maintenance is the model's defining cost. Moderation, re-matching, churn, and safety handling are daily human work that scales *with* success. This is a community-management business wearing a tool costume, and it fails the "minimal ongoing involvement" criterion badly.

---

## Model B — Newsletter-First Study Business

**Concept:** A free weekly study-tips/exam-prep newsletter (Beehiiv/Substack/Kit free tiers), grown via the free study tools as lead magnets. The newsletter is the owned audience; monetization comes later via sponsorships, paid tier, and digital products.

### Demand evidence (observed)
- **Education newsletters have the highest engagement in email.** Benchmarks observed: education emails 28–39% open rate (Omnisend 2026); 30–45% for education/nonprofit newsletters (ClickMinded); Paved measured **education newsletters at 55.02% open rate** — the highest engagement category in its data. Sources: https://www.omnisend.com/blog/email-open-rate/ · https://www.clickminded.com/average-newsletter-open-rate/ · https://blog.mean.ceo/newsletter-startup-statistics/
- **Real competitor newsletters exist in this space:**
  - **IBlieve Weekly** (iblieve.substack.com) — student-led IB community newsletter: weekly study/revision strategies, polls, podcast, blog picks, Instagram cross-posts. Observed active (posts from Feb 2026). Source: https://iblieve.substack.com/feed
  - **Dear Intentional Scholar** (deyoungeducator.substack.com) — student-focused newsletter on learning strategies and academic growth; published 2026-11-02. Source: https://deyoungeducator.substack.com/p/dear-intentional-scholar
  - **Virtual College Counselors** (virtualcollegecounselors.substack.com) — monthly; monetizes directly by selling **$85 SAT crash courses** inside the newsletter. Proof that a study newsletter can sell products. Source: https://virtualcollegecounselors.substack.com/p/filtering-the-information-overload
  - **Austin Scholar** (austinscholar.substack.com) — teen-written PSAT/SAT tips newsletter; **last updated ~1,466 days ago** (observed). This is evidence of the #1 risk: student newsletters die when the author graduates or loses steam.
- **Free tools → newsletter is a proven acquisition loop:** IBlieve pairs its newsletter with a 300+ post blog, podcast, and Instagram. The tools-as-lead-magnets structure fits the existing Student Success Hub assets.

### Free-tier terms (verified, no signup)
| Platform | Free tier (observed) | Paid-tier cost | Cut on paid |
|---|---|---|---|
| **Substack** | **$0, unlimited subscribers, unlimited sends**, custom domain included (one-time $50 per some sources) | None — no tiers | **10% of paid subscription revenue** + Stripe processing (~2.9% + $0.30, +0.7% recurring billing). Sources: https://dev.to/onsen/substack-review-2026-pros-cons-pricing-explained-2mjj · https://eden.so/blog/substack-fees/ |
| **Beehiiv** | **$0 up to 2,500 subscribers, unlimited sends** (plan renamed Launch→Free, Oct 1 2026). **No paid subscriptions, no custom domain, no automations on Free.** | **Lite: $59/mo monthly / $49/mo billed annually** (at ≤1,000 subs); Pro $109/mo monthly / $95/mo annual. Prices rise with list size. Sources: https://creatormailstack.com/guides/beehiiv-for-creators · https://beginnersinai.org/beehiiv-pricing/ · https://pondero.ai/agents/guides/beehiiv-pricing-scale-plan-worth-it/ | **0% platform fee** on paid subs (Stripe fees only) — on paid plans |
| **Kit** (ex-ConvertKit) | **$0 up to 10,000 subscribers**, unlimited broadcasts, can sell products (3.5% + $0.30/transaction, card fees included) | Paid from ~$25–33/mo | 3.5% + $0.30 per sale. Source: https://frameos.studio/blog/best-newsletter-platforms-for-creators |

**$0 verdict:** all three platforms support a genuine $0 start. Substack is the most generous free tier (unlimited, forever); Beehiiv's free tier caps at 2,500 subs and withholds monetization features; Kit is the middle ground (10K subs, can sell).

### Sponsorship economics (publicly stated rates only — nothing invented)
- **Median placement for newsletters under 5,000 subscribers: $150** (middle half $99–$250), from 364 printed prices read Oct 25 2026. Source: https://bookasponsor.com/newsletter-sponsorship-platform-fees
- **Education is a LOW-value ad category despite high engagement.** Paved data: education newsletters averaged **$1,025 per sponsorship at 55.02% open rate** — vs. $2,295 (tech), $2,030 (business). Paved's Q3 2026 benchmarks: **education $7.21 per 1,000 subscribers** vs. HR $18.47, Marketing $13.88, Startups $13.28. High opens, low advertiser budgets — student audiences don't buy B2B software. Sources: https://blog.mean.ceo/newsletter-startup-statistics/ · https://ppc.land/paved-finds-hr-newsletter-ad-rates-run-15-times-higher-than-lifestyle-lists/
- Typical US newsletter CPMs $15–30 for primary sponsorships (sponsorships.ai); small-list placements on Swapstack reported ~$50–$250. Source: https://sponsorships.ai/newsletter-ad-networks
- **Beehiiv Ad Network gates:** requires a paid plan (Lite/Scale+) and **~2,500+ subscribers**; pays per *unique opens* (CPM per Beehiiv's own FAQ example: $5 CPM = $5 per 1,000 unique opens) or CPC; **payouts require a Stripe Express account, "no PayPal or Wise alternative"**, paid on the 20th of the month. **Stripe is not available in Nepal** (per `research/phase1/04-monetization.md`) — could not verify any path for a Nepal-based creator to receive beehiiv Ad Network payouts. Treat ad-network revenue as **unavailable until verified otherwise**. Source: https://www.earningmoneyonline.co.uk/articles/newsletter-sponsorship-rates-uk.html
- **Realistic math at small scale:** 2,000 subs × ~40% open = 800 opens/issue. At a $20 direct CPM that's ~$16/issue — realistically you'd sell direct placements at $50–$150 (the observed sub-5K band) only once you have an engaged, demographic-defined list. Sponsorships are a *year-2* revenue line, not a launch line.

### Startup + maintenance costs (money AND time, honest)
- **Money: $0** (Substack free tier, or Kit free to 10K). No infrastructure.
- **Time to launch: ~1 day** (account, template, welcome email, first issue).
- **Ongoing time — the honest burden:** a weekly newsletter is **3–6 hrs/week** (writing, editing, formatting, subject-line testing), *forever*, on a fixed schedule. It is batchable (write 2–4 issues in a weekend) and has zero moderation, zero infra, zero customer support — but it is a treadmill with a public failure mode: miss weeks and subscribers churn; the Austin Scholar example (dead ~4 years) is what the graveyard looks like. Repurposing free-tool content (e.g., "5 formulas from this week's calculator") cuts writing time materially.
- No strangers to moderate, no matching liquidity problem, no app to maintain. Of the three models, this has the **lowest coordination burden**.

### Monetization path
1. **Phase 1 ($0, months 0–12):** free newsletter; tools as lead magnets; affiliate links for student products (where Nepal payout works — see 04-monetization.md).
2. **Phase 2 (at ~1,000–2,500 engaged subs):** direct sponsorships ($50–$150/placement band observed for sub-5K lists); digital products via Paddle (Nepal-eligible per 04-monetization.md — e.g., exam sprint planners, cheat-sheet packs); Virtual College Counselors' $85 crash-course precedent shows the product path.
3. **Phase 3 (scale):** paid tier. On Substack: free to enable, 10% cut forever (painful at scale, but $0 to start). On Beehiiv: 0% cut but paid plan required ($49+/mo) — breaks the $0 budget, so only after revenue exists.
- **Key constraint:** beehiiv Ad Network payouts to Nepal unverifiable (Stripe Express requirement) — don't model ad-network income.

### Risks
1. **Cadence death** — the #1 killer; weekly writing for months before revenue. Evidence: Austin Scholar abandoned.
2. **Low advertiser value of student audiences** — education CPMs are the bargain bin ($7.21/1K subs); sponsors pay for B2B, not students.
3. **List growth is the whole game** — newsletter without distribution is a diary; depends entirely on the free tools/SEO flywheel working.
4. **Platform risk** — Substack's 10% cut never decreases; Beehiiv repriced upward Oct 2026 (plans renamed, prices raised).

### Minimal-maintenance fit: **3 / 5**
Weekly writing is real, non-delegable work — this is not passive. But it is *solo, batchable, and moderation-free*: no strangers, no safety incidents, no liquidity problem, no infrastructure. The archive compounds (old issues keep ranking/converting), and the email list is the only truly owned audience of the three models. Best maintenance profile of the three, but capped at 3 because the cadence is relentless.

---

## Model C — Creator-Led Exam-Prep Brand

**Concept:** Faceless or personal YouTube Shorts + long-form + TikTok/Instagram Reels teaching exam techniques — the Ali Abdaal flywheel, niched down (e.g., Nepali/Indian exam prep, study techniques). Funnels viewers to the free tools and Paddle digital products.

### Demand evidence (observed public view counts)
- **The study niche on YouTube is enormous at the top:**
  - **Lofi Girl:** **15.8M subscribers, 2.7B total views**; most-viewed video "1 A.M Study Session" at **135.0M views** (outlierkit.com analysis of public YouTube data, labeled AI-generated estimates for revenue but subscriber/view counts are public data). Source: https://outlierkit.com/channel/lofigirl
  - **Sean Study** (study-with-me): **240K subscribers, 56.37M total views, 179 videos** — observed via vidIQ public stats, updated 2026-11-03. Source: https://vidiq.com/youtube-stats/channel/@seanstudy/
  - **StudyMD** (study-with-me): **563K subscribers, 56.3M total views, 85 videos** — observed Oct 29 2026. Source: https://www.speakrj.com/audit/report/UC5CRP-6oxYenIgBj17CkBZg/youtube
- **Faceless exam-prep is a live, growing niche in 2026:** aesthetic study-with-me and faceless education channels under 20K subs are growing now — e.g., Aspirant Diaries (18.1K), StudyVibes (16.9K), Alice Koval (14.8K), MEDICO DIY (11.1K), Mari (9.19K) — with study-with-me CTR at 7–12% and long-form retention of 55–65% average view duration on Pomodoro videos. Per-video reach can hit 2M+ on a single Short (though view-to-sub conversion is brutal: ~1 sub per 800–1,200 views). A third-party strategy guide estimates the ceiling for a well-run faceless education channel at **200K–500K subs within 24 months** — treat as one publisher's estimate, not a guarantee. Source: https://growcreator.pro/blog/education-faceless-youtube-strategy-2026
- **The realistic picture:** a 2016 Grapevine survey of 1,861 creators found **89% had fewer than 5,000 subscribers** and only 2% had 100K+. The demand exists; capturing it as a new channel is the hard part. Source: https://martech.org/what-it-takes-to-become-a-youtube-star-time/

### YouTube Partner Program — Nepal eligibility (verified)
- **Nepal IS on YouTube's standard YPP availability list** (country table: "Nepal | Yes"), alongside India and Bangladesh; YouTube lists 138 countries/territories. Requirements are identical globally: **1,000 subscribers + 4,000 valid public watch hours in 12 months (or 10M valid public Shorts views in 90 days)**, no strikes, linked AdSense, 2-step verification. Sources: https://dipak7.com.np/youtube-partner-program-countries-list/ · https://www.hashtagnetwork.net/youtube-partner-program/countries · https://www.lilachbullock.com/youtube-monetization-nepal-uae/
- **Caveats specific to Nepal:**
  - **Ad rates are low.** Nepal-audience CPMs are third-party-estimated at **~$0.50–$2** vs. $8–$25+ for US audiences (labeled estimate, not official). A study channel targeting Nepali/Indian students will earn at the bottom of the range. Source: https://www.lilachbullock.com/youtube-monetization-nepal-uae/
  - **Getting paid:** AdSense pays by international wire once you cross the **$100 threshold**; needs a SWIFT-capable Nepali bank account. No US–Nepal tax treaty → submit W-8BEN to avoid default US withholding (up to 24–30% on US-sourced earnings per third-party reporting). Source: https://www.lilachbullock.com/youtube-monetization-nepal-uae/
  - **Nepal is NOT on the expanded/lower-tier YPP page** (500 subs / 3,000 watch hours for fan-funding features) — only standard YPP confirmed. Final eligibility is whatever YouTube Studio's Earn tab shows. Source: https://www.ytdetective.com/blog/youtube-partner-program-countries
- **Bottom line:** YPP is *available* but ad revenue from a student audience in Nepal will be negligible for a long time. The realistic monetization is the funnel: affiliate links + Paddle digital products (Paddle is Nepal-eligible per `research/phase1/04-monetization.md`), not ads.

### Competitors
- Mega: Lofi Girl (15.8M), StudyMD (563K), Sean Study (240K) — study-with-me/ambient.
- Faceless exam-prep growers: Alice Koval, MEDICO DIY (anatomy mnemonics, productivity systems — "highest-LTV archetype" per growcreator.pro because viewers convert to ebooks/coaching at 3–5× the rate of pure aesthetic channels), Aspirant Diaries, StudyVibes.
- Personal-brand exam prep: Ali Abdaal is the cited flywheel model (study techniques → newsletter → courses/products); no subscriber numbers cited here (not observed in this pass — do not quote).
- **Differentiation verdict:** the niche rewards either extreme consistency (study-with-me daily uploads) or genuine teaching authority. A solo student can credibly do "exam techniques I actually use" — authenticity is the wedge, not production value.

### Startup + maintenance costs (money AND time — HONEST, this is the scored-against dimension)
- **Money: $0** is real — phone camera, free editing (CapCut), free thumbnails (Canva). Faceless formats (screen recordings, slide voiceovers, Pomodoro timers) need nothing else.
- **Time — the treadmill:**
  - Production benchmarks (published, labeled estimates): simple talking-head **~4 hrs/video**; structured tutorials **~10 hrs/video**; motion-graphic essays ~20 hrs. Source: https://ytvideoo.com/tools/youtube-upload-frequency-calculator/
  - Solo scripted long-form: **6–15 hrs/video at 1×/week** is the realistic sustainable cadence; Shorts **0.5–2 hrs each**, daily. Source: https://longformstudio.app/articles/how-often-to-post-on-youtube
  - Grapevine survey: **70% of creators with 100K+ subs spend 6+ hours per video; one-third spend 8+ hours.** Source: https://martech.org/what-it-takes-to-become-a-youtube-star-time/
  - ~394,000 US creators work **40+ hours/week** on YouTube (YouTube/Oxford Economics report via Money). Source: https://money.com/make-money-youtube-fulltime-job/
  - **Honest solo-student estimate: 8–12 hrs/week minimum** (1 long-form + 3–5 Shorts) to be algorithmically relevant — on top of being a student. YouTube's own Creator Insider guidance: no penalty for breaks, but growth requires consistency; the algorithm needs ~8–15 consistent uploads before committing real impressions (per growcreator.pro's read of education channels).
  - This never becomes passive: stop uploading → views decay. It is the literal definition of a content treadmill.

### Monetization path
1. **Months 0–12:** $0 revenue. Build to 1,000 subs / 4,000 watch hours for YPP.
2. **YPP ads:** available from Nepal, but at ~$0.50–$2 CPMs on a student audience this is pocket money until very large scale.
3. **Realistic path:** affiliate links (Nepal-payout-compatible networks per 04-monetization.md) + funnel to free tools → Paddle digital products (exam planners, cheat-sheet packs). The Ali Abdaal flywheel works because products monetize 10–100× better per viewer than ads.
4. Shorts fund (if any) and brand deals are unavailable/irrelevant at small scale.

### Risks
1. **Time cost is the highest of the three models** — 8–12+ hrs/week of production, directly competing with the founder's studies (the founder is a student in exam season).
2. **89% of creators never pass 5,000 subs** — the most likely outcome is months of work for triple-digit views.
3. **Ad revenue from the target audience is structurally tiny** (Nepal/India student CPMs).
4. **Platform dependence:** algorithm changes, demonetization risk, and the faceless-education space is getting more competitive (2026 growth noted by growcreator.pro cuts both ways).
5. **Identity cost:** personal brand = public exposure; faceless = slower trust-building for product sales.

### Minimal-maintenance fit: **1 / 5**
Scored harshly as instructed: video is a production treadmill. Even the "low-effort" faceless formats need 4–10 hrs/video, weekly consistency is the price of algorithmic relevance, and stopping means decaying. It directly conflicts with "minimal ongoing involvement" and with the founder being a full-time student. Demand is proven and the funnel economics (products, not ads) can work — but as a *maintenance* proposition it is the worst of the three by a wide margin.

---

## Cross-model comparison

| Dimension | A) Accountability platform | B) Newsletter-first | C) Creator-led video |
|---|---|---|---|
| Real demand | Strong (observed posts, 1M-member Discord) | Strong (55% open rates in education; active competitors) | Proven (billions of study-niche views) |
| $0 startup | Yes (Discord) | Yes (Substack/Kit free) | Yes (phone + free tools) |
| Differentiation | Weak — crowded; thin geo/exam wedge | Medium — owned list; voice/niche wedge | Medium — authenticity wedge; crowded |
| Tool-led / recurring visitors | Medium (rooms need liquidity) | **High (email list is owned; tools = lead magnets)** | Medium (algorithm owns the audience) |
| Realistic revenue path | Freemium subs at scale; crowded | Sponsorships (low CPMs) → paid tier → Paddle products | Ads (tiny) → affiliates → Paddle products |
| **Ongoing maintenance** | **High — daily moderation/safety** | **Medium — weekly writing, batchable** | **Very high — 8–12+ hrs/wk production** |
| Biggest risk | Safety incident / moderation burnout | Cadence death (Austin Scholar precedent) | Treadmill + 89% never pass 5K subs |
| **Minimal-maintenance fit** | **2/5** | **3/5** | **1/5** |

**Honest synthesis for the pivot decision:** None of the three beats a well-built free-tools site on pure maintenance — tools rank, compound, and need no feeding. But as *audience* plays layered on top of tools, **B (newsletter) is the only one with a maintenance profile a solo student can sustain**: it converts the tools' traffic into an owned list, costs $0, has no moderation or liquidity burden, and its archive compounds like SEO. A's maintenance is a human-safety operation; C's is a part-time job. If the mission wants recurring visitors without a treadmill, B is the answer — with eyes open about the weekly writing commitment and the low ad value of student audiences (monetize via products, not sponsors).

---

## Sources index
All URLs below were opened or returned by search in this research pass (2026-11-04). Subscriber/view counts are public data observed on the cited pages; revenue figures are labeled estimates where the source labels them so.

- https://redlib.freedit.eu/r/studypartner — r/studypartner posts (observed)
- https://red.applefritter.com/r/getmotivatedbuddies?sort=hot&t=&before=t3_1g0gbpj — r/getmotivatedbuddies posts (observed)
- https://discord.com/servers/study-together-595999872222756885 — Study Together: 1,068,406 members, 44,908 online (observed)
- https://thehiveindex.com/communities/study-together/ — Study Together ~1.0M members
- http://vertahub.blogspot.com/2026/06/discord-community-study-together.html — Study Together features/moderation
- https://roomie.cafe/blog/focusmate-review — Focusmate pricing (3 free/wk; Plus $8/mo yearly, $12/mo monthly)
- https://www.saner.ai/blogs/focusmate-review — Focusmate pricing cross-check
- https://www.mindfulscholar.online/2026/09/best-one-on-one-online-study-websites.html — Focusmate 150+ countries claim
- https://rankite.com/blog/best-accountability-software — accountability tools comparison
- https://www.getsupporti.com/help — Supporti official pricing ($15.99/mo, $129.99/yr)
- https://toolgpa.com/tools/studystream — StudyStream pricing (free; Basic $1.99–3.99/mo; Premium $6.99/mo, $69.99/yr)
- https://apps.apple.com/us/app/studystream/id6461722416 — StudyStream App Store listing
- https://play.google.com/store/apps/details?id=live.studystream.app&hl=en&gl=us — StudyStream "270K+ students" (observed)
- https://myyappie.app/blog/best-body-doubling-apps — StudyStream free 1 hr/day
- https://github.com/amritkang165/cherrypick/blob/HEAD/docs/market-research.md — body-doubling market research (Flow Club, FLOWN, Deepwrk pricing; The Wing cautionary tale)
- https://www.essexstudent.com/news/article/14274/Body-Doubling-to-help-with-revision-what-is-it-and-how-to-do-it/ — body doubling explainer
- https://athenify.io/blog/body-doubling-study-technique — body doubling spectrum
- https://ovrit.app/study-tips/body-doubling-adhd-college — body doubling options
- https://creatormailstack.com/guides/beehiiv-for-creators — Beehiiv free plan (2,500 subs, unlimited sends)
- https://beginnersinai.org/beehiiv-pricing/ — Beehiiv Oct 2026 repricing (Free/Lite/Pro)
- https://thatmarketingbuddy.com/compare/beehiiv-vs-mailchimp — Beehiiv free limits (no paid subs/domain/automations)
- https://pondero.ai/agents/guides/beehiiv-pricing-scale-plan-worth-it/ — Beehiiv plan gates for monetization
- https://dev.to/onsen/substack-review-2026-pros-cons-pricing-explained-2mjj — Substack free unlimited + 10% cut
- https://eden.so/blog/substack-fees/ — Substack fee breakdown (10% + Stripe)
- https://www.lilachbullock.com/substack-vs-patreon/ — Substack vs Patreon fees
- https://frameos.studio/blog/best-newsletter-platforms-for-creators — Kit free 10K subs; platform comparison
- https://iblieve.substack.com/feed — IBlieve Weekly (active study newsletter)
- https://deyoungeducator.substack.com/p/dear-intentional-scholar — Dear Intentional Scholar
- https://virtualcollegecounselors.substack.com/p/filtering-the-information-overload — $85 SAT crash courses via newsletter
- https://austinscholar.substack.com/p/austin-scholar-37-what-your-kid-needs — Austin Scholar (stale; cadence-death evidence)
- https://bookasponsor.com/newsletter-sponsorship-platform-fees — median $150 placement for sub-5K newsletters
- https://blog.mean.ceo/newsletter-startup-statistics/ — Paved: education 55.02% open rate, $1,025 avg sponsorship
- https://ppc.land/paved-finds-hr-newsletter-ad-rates-run-15-times-higher-than-lifestyle-lists/ — Paved Q3 2026: education $7.21/1K subs
- https://sponsorships.ai/newsletter-ad-networks — US CPMs $15–30; Swapstack $50–250
- https://www.earningmoneyonline.co.uk/articles/newsletter-sponsorship-rates-uk.html — Beehiiv ad network gates (2,500+ subs, Stripe Express payouts, 20th-of-month)
- https://www.siembraconnect.com/p/resource-the-complete-guide-to-building-and-monetizing-your-newsletter-with-beehiiv — beehiiv ad network CPM ranges (reported)
- https://www.omnisend.com/blog/email-open-rate/ — education open rates 28–39%
- https://www.clickminded.com/average-newsletter-open-rate/ — newsletter open-rate benchmarks
- https://dipak7.com.np/youtube-partner-program-countries-list/ — YPP countries: Nepal Yes (standard)
- https://www.hashtagnetwork.net/youtube-partner-program/countries — YPP 138 countries; Nepal since 2015
- https://www.ytdetective.com/blog/youtube-partner-program-countries — Nepal on availability list, not expanded tier
- https://www.lilachbullock.com/youtube-monetization-nepal-uae/ — YPP Nepal requirements; ~$0.50–$2 CPM estimate; AdSense $100 wire threshold; W-8BEN
- https://makuracreations.com/youtube-monetization-in-nepal/ — YPP Nepal requirements (500-sub low tier / 1,000-sub full tier)
- https://outlierkit.com/channel/lofigirl — Lofi Girl: 15.8M subs, 2.7B views (observed public data)
- https://vidiq.com/youtube-stats/channel/@seanstudy/ — Sean Study: 240K subs, 56.37M views, 179 videos (observed 2026-11-03)
- https://www.speakrj.com/audit/report/UC5CRP-6oxYenIgBj17CkBZg/youtube — StudyMD: 563K subs, 56.3M views, 85 videos (observed)
- https://growcreator.pro/blog/education-faceless-youtube-strategy-2026 — faceless exam-prep channels, sub counts, CTR/retention benchmarks
- https://growcreator.pro/blog/education-youtube-algorithm-explained-2026 — education algorithm notes
- https://ytvideoo.com/tools/youtube-upload-frequency-calculator/ — production time benchmarks (~4/10/20 hrs by format)
- https://longformstudio.app/articles/how-often-to-post-on-youtube — sustainable cadences; 6–15 hrs/video; Shorts 0.5–2 hrs
- https://martech.org/what-it-takes-to-become-a-youtube-star-time/ — Grapevine survey: 89% <5K subs; 70% of 100K+ creators spend 6+ hrs/video
- https://money.com/make-money-youtube-fulltime-job/ — ~394K US creators working 40+ hrs/week
- `research/phase1/04-monetization.md` (sibling research, this mission) — Paddle Nepal eligibility, payout rails
