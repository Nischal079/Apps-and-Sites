# US + UK Grading Systems — Verification Research Notes (StudyPilot grade calculator)
Date researched: 2026-11-04. Method: read-only public-web research, no accounts. Every factual claim has an inline source URL.

## 1. US 4.0 GPA scale

### 1a. There is no single official US scale
- College Board BigFuture (official) states: "High schools use different grading scales to calculate GPA (grade point average), and the 4.0 scale is just one common example... The ranges in the chart below reflect one commonly used system, but your school may calculate GPA differently." — https://bigfuture.collegeboard.org/plan-for-college/get-started/how-to-calculate-gpa-4.0-scale
- Secondary converter summarizing College Board: "There is no single official conversion... College Board describes this as one commonly used system and says schools differ." — https://gpa-converter.archie-design.app/
- Design decision for StudyPilot: offer the most common plus/minus 4.0 mapping as default AND let the user pick a variant scale; never hard-code one "official" US scale.

### 1b. College Board BigFuture reference table (whole-letter, no plus/minus) — OFFICIAL
https://bigfuture.collegeboard.org/plan-for-college/get-started/how-to-calculate-gpa-4.0-scale
- A, 90–100 → 4.0
- B, 80–89 → 3.0
- C, 70–79 → 2.0
- D, 66–69 → 1.0
- E/F, below 65 → 0.0
- GPA method given: add GPA points from each course, divide by number of classes. (For credit-weighted: total quality points ÷ total credit hours.)

### 1c. Most common plus/minus mapping (points) — verified across multiple university registrars
University of Missouri Academic Catalog (official): https://catalog.missouri.edu/academicpolicies/grades/
- A+ 4.00, A 4.00, A− 3.7, B+ 3.3, B 3.00, B− 2.7, C+ 2.3, C 2.00, C− 1.7, D+ 1.3, D 1.00, D− 0.7, F 0
- Same table confirms the GPA formula: "The grade point average for any period is obtained by dividing the quality points earned by the total number of credits for which the student was enrolled during that period."
- UCLA Extension policy under UC Academic Senate regulations (official): "The final course grades of A+ and A are weighted with 4.0 grade points, A- = 3.7; B+ = 3.3, B = 3.0, B- = 2.7; C+ = 2.3, C = 2.0, etc. 'Plus' grades carry three-tenths grade-point more per unit, with the exception of the A+, and 'minus' grades carry three-tenths grade-point less per unit than un-suffixed grades." — https://dev.uclaextension.edu/policy/credit-grading-and-continuing-education-unit-aa121
- Indiana University grading policy (official): A+ = 4.0 (highest passing grade), A− = 3.7, B+ = 3.3, B = 3.0, B− = 2.7 — https://bulletins.iu.edu/iupui/2021-2022/policies/academic-policy/grading-system.shtml
- College Board's own older plus/minus chart (quoted from a College Board document, secondary forum copy): A+ (97-100) = 4.0, A (93-96) = 4.0, A− (90-92) = 3.7, B+ (87-89) = 3.3, B (83-86) = 3.0, B− (80-82) = 2.7, C+ (77-79) = 2.3, C (73-76) = 2.0, C− (70-72) = 1.7, D+ (67-69) = 1.3, D (65-66) = 1.0, E/F (below 65) = 0.0 — https://talk.collegeconfidential.com/t/gpa-conversion-to-4-0/1386456 (secondary quoting College Board; percent bands vary by school)

### 1d. Major variants (documented; school chooses one)
- A+ = 4.0 (no extra credit): Mizzou, IU, UC — the most common convention; capped unweighted scale at 4.0.
- A+ = 4.33: Law School Admission Council (LSAC) assigns 4.33 for A+ when standardizing transcripts (secondary: https://calccentrals.com/blog/how-to-calculate-gpa); Arizona State registrar prices A+ at 4.33 with unweighted GPA capped at 4.00 (secondary: https://calculatemygrade.org/gpa-calculator/).
- A+ = 4.3: William & Mary transcript key gives A+ = 4.3 but notes "A+ Law School only" — https://www.wm.edu/offices/registrar/_documents/transcript/transcriptkeynsc.pdf (official)
- Decimal series variant: some schools use thirds (A− 3.67, B+ 3.33, B− 2.67) instead of tenths (3.7/3.3/2.7) — reported e.g. University of Toledo registrar (secondary: https://calculatemygrade.org/gpa-calculator/).
- No plus/minus at all: some schools collapse to whole letters only (A/A+/A− all 4.0); College Board's BigFuture table above is the canonical example of this variant — https://bigfuture.collegeboard.org/plan-for-college/get-started/how-to-calculate-gpa-4.0-scale
- D− (0.7) exists at some schools (Mizzou); many schools have no D− or no D+ at all.

### 1e. Percentage ↔ GPA conversion
- The percentage bands above are conventions, not law. Common bands: A 90–100 (CB), A− 90–92 / B+ 87–89 / B 83–86 / B− 80–82 / C+ 77–79 / C 73–76 / C− 70–72 / D+ 67–69 / D 65–66 / F below 65 (secondary sources citing College Board; schools set their own cutoffs).
- A straight proportional conversion (GPA ÷ 4 × 100) is NOT how US grading works and no school uses it; it is only a rough international estimate — https://us-calculator.com/gpa-to-percentage-calculator (secondary). Mark any StudyPilot %↔GPA conversion as an estimate.

### 1f. Weighted GPA conventions — conventions only, vary by district
- College Board BigFuture: "Some schools also use a weighted GPA system, where courses like AP and honors classes are assigned higher GPA points." — https://bigfuture.collegeboard.org/plan-for-college/get-started/how-to-calculate-gpa-4.0-scale
- Common conventions (secondary, widely reported; https://calccentrals.com/blog/how-to-calculate-gpa, https://gradecalculator.app/high-school-gpa-calculator/):
  - Honors / accelerated: +0.5 (A = 4.5)
  - AP / IB / dual enrollment / college: +1.0 (A = 5.0)
  - No bonus typically applied to D/F grades in some schemes.
- Colleges often recalculate GPA with their own weighting or strip weighting entirely (BigFuture notes colleges recalculate by own criteria).

### 1g. What counts as passing (US) — convention
- On the College Board table, D (66–69, 1.0 points) earns credit; only E/F (0.0) is a fail — https://bigfuture.collegeboard.org/plan-for-college/get-started/how-to-calculate-gpa-4.0-scale
- Indiana University: "A+ (highest passing grade)" — https://bulletins.iu.edu/iupui/2021-2022/policies/academic-policy/grading-system.shtml
- Convention: D earns credit at most schools, but many programs/majors require C (2.0) or better in major courses, and graduation often requires cumulative 2.0 (Mizzou: "Students must have a cumulative GPA of 2.00 to remain in good academic standing" — https://catalog.missouri.edu/academicpolicies/grades/). Exact passing rules vary by school — mark specifics as varying.

### 1h. Retake / repeat policies — vary by institution; two documented models
- Grade replacement: some schools replace the old grade with the new one in GPA.
- Averaging: UMKC official catalog: "Since 1985, all grades, including those in repeated courses, are included in the GPA calculation." — https://catalog.umkc.edu/general-graduate-academic-regulations-information/general-graduate-academic-regulations/course-and-grading-policies/graduate-course-grading/
- W (withdrawal) does not enter GPA; repeated courses may be flagged (UMKC used "R" prefix before 1985). No national rule — StudyPilot must label retake handling as school-specific.

### 1i. Excluded from US GPA
- Mizzou official: "Grades of S, U, H, W, NR, or I are not included in determining the grade point average." (S = satisfactory, U = unsatisfactory, W = withdrawal, NR = not reported, I = incomplete) — https://catalog.missouri.edu/academicpolicies/grades/
- Pass/No-Pass and audited courses are excluded at most schools (same source). Typical exclusions: P/NP, S/U, W, I (until resolved), audited.

## 2. UK degree classification

### 2a. Standard bands — OFFICIAL (UKSCQA / Universities UK)
- UK Standing Committee for Quality Assessment, "Principles for effective degree algorithm design": "Typically, although not always, the following classification boundaries are used: first (≥70), upper-second (60–69), lower-second (50–59), third (40–49), pass (35–40). Alternative scales, for example between 1 and 20, are also used by some degree-awarding bodies." — archived official copy: https://dera.ioe.ac.uk/id/eprint/36040/contents
- University of Law official UG regulations example: 70%+ First; 60–69% Upper Second (2.1); 50–59% Lower Second (2.2); 40–49% Third (3rd) — https://www.law.ac.uk/globalassets/13.-media--doc-repo/08.-policies/pdf_policies_ug-assessment-award-regulations-policy.pdf
- Sheffield Hallam writes them as 60.00–69.99 etc. (secondary: https://gpawise.com/uk-university-grade-calculator)

### 2b. How the final mark is computed — varies by university
- UKSCQA names four typical year-weighting models for three-year degrees (indicative): exit velocity (0/0/100), emphasis on exit velocity (0/33/67), equal weighting (0/50/50), Level 4 inclusion (10/30/60). For four-year: 0/0/0/100, 0/0/25/75, 0/0/50/50, 0/10/30/60 (secondary summary of UKSCQA: https://gpawise.com/uk-university-grade-calculator).
- Examples: UCL Scheme A uses 1:3:5 across years; Leeds 1:2 (years 2–3); Birmingham ~25% year 2 / 75% year 3 (secondary: https://www.theacademicpapers.co.uk/blog/2026/10/03/uk-degree-classifications/). Year 1 usually excluded entirely.
- Design decision: StudyPilot must ask the user for their university's year-weighting or offer the four UKSCQA models as presets.

### 2c. Borderline / zone of consideration — varies by university
- UKSCQA recommends a "zone of consideration" of at most 2 percentage points below a boundary, "with no additional rounding": e.g. 68.0 may be reconsidered for a First, 67.99 may not (secondary: https://gpawise.com/uk-university-grade-calculator).
- Real examples: Birmingham borderline zone ~68.0 up to below 69.5 for a First; City St George's (SGUL) applies a 1% borderline zone via rounding (68.5 → 69 → 1st considered with 60+ level-6 credits in the higher band) (secondary: https://www.theacademicpapers.co.uk/blog/2026/10/03/uk-degree-classifications/, https://studenthub.citystgeorges.ac.uk/__data/assets/pdf_file/0005/923549/BSc-Radiotherapy-and-Oncology-Year-3.pdf).
- Some universities (e.g. University of Law) simply round the overall average to the nearest whole number (22.7: "The overall weighted average will be rounded to the nearest whole number") — https://www.law.ac.uk/globalassets/13.-media--doc-repo/08.-policies/pdf_policies_ug-assessment-award-regulations-policy.pdf

### 2d. Condoned / compensated fails — varies by university
- UKSCQA's "pass (35–40)" band implies sub-40 marks can still yield an award in some cases; specific compensation rules differ per institution. Bath awards unclassified honours from 38.00; Swansea a pass degree from 35; Edinburgh lists 30–39 as fail (secondary: https://gpawise.com/uk-university-grade-calculator). No sector-wide condonement formula — mark as institution-specific.
- Retake/resit capping: commonly capped at the 40% pass mark on resit (secondary: https://openeducat.org/articles/uk-degree-classifications-explained/) — convention, varies.

### 2e. What's excluded from classification
- Pass/fail modules typically don't count toward the average (reported for Bath, Portsmouth, Buckinghamshire New University — secondary: https://gpawise.com/uk-university-grade-calculator).
- Year 1 (Level 4) is usually excluded entirely in the common weighting models above (UKSCQA).

### 2f. Honours vs ordinary degrees
- Honours degrees carry the First/2:1/2:2/Third classification. An ordinary (non-honours) degree is unclassified — City St George's scheme: "BSc (nonhons): 40 Pass per mod (not classified)" — https://studenthub.citystgeorges.ac.uk/__data/assets/pdf_file/0005/923549/BSc-Radiotherapy-and-Oncology-Year-3.pdf
- England/Wales/NI: honours = 3 years, 360 credits; ordinary = 300 credits (secondary: https://alchetron.com/British-undergraduate-degree-classification).
- Scotland: 4-year honours (480 credits, classified); 3-year ordinary (360 credits, not a failed honours — a qualification in its own right, may be awarded with distinction) (secondary: https://alchetron.com/British-undergraduate-degree-classification, https://acolyteliving.com/post/uk-university-grading-system).
- Medical degrees (MBBS/MBChB) usually unclassified: Pass / Honours / Distinction (secondary: https://acolyteliving.com/post/uk-university-grading-system).
- UKSCQA also lists 35–40 as typical "pass" band, below which no honours is awarded (https://dera.ioe.ac.uk/id/eprint/36040/contents).

## 3. GCSE 9–1 grades

### 3a. Grade order — OFFICIAL (Ofqual glossary, GOV.UK)
- "Reformed GCSEs award, from highest to lowest, 9, 8, 7, 6, 5, 4, 3, 2 and 1, with a grade of U for unclassified." — https://www.gov.uk/government/publications/glossary-for-ofquals-statistics/glossary-for-ofquals-statistics
- Combined Science double award grades (official): 9-9, 9-8, 8-8, 8-7, 7-7, 7-6, 6-6, 6-5, 5-5, 5-4, 4-4, 4-3, 3-3, 3-2, 2-2, 2-1, 1-1 and U — same source.

### 3b. Anchor points vs old A*–G — OFFICIAL (Ofqual blog)
- "The bottom of a grade 7 is comparable to the bottom of the old grade A, the bottom of a new grade 4 is comparable to the bottom of the old grade C, and the bottom of the new grade 1 is comparable to the bottom of the old grade G. ... if they previously set entry requirements of at least a grade C, then the equivalent now would be to require at least grade 4." — https://ofqual.blog.gov.uk/2018/03/02/gcse-9-to-1-grades-a-brief-guide-for-parents/
- Grades 9/8/7 cover old A*–A (with 9 above old A*); grades 4/5/6 cover old B–C; grades 1/2/3 cover old D–G (same blog, grade diagram).

### 3c. Standard pass (4) vs strong pass (5) — OFFICIAL (DfE + Ofqual)
- "Standard pass" (grade 4) and "strong pass" (grade 5) are Department for Education terms from school performance tables — Letter from the Secretary of State to the Education Select Committee, March 2017: https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/603594/ESC_letter.pdf (URL as listed in search results: https://medium.com/@skoolur/is-gcse-harder-than-cbse-49c739f83fba)
- Grade 4 is the minimum standard for most post-16 options; grade 5 is the DfE benchmark in performance tables (secondary: https://www.schoolplanner.co.uk/blog/gcse-grades-explained/).

### 3d. Grade boundaries set per series (ESTIMATE/secondary)
- Grade boundaries are set per exam series per subject/board after marking using comparable-outcomes statistics; last year's boundaries don't apply to this year (secondary: https://www.theacademicpapers.co.uk/blog/2026/10/03/uk-degree-classifications/ is degree-focused; GCSE series point from https://ukcalculator.com/blog/gcse-grade-calculator-guide.html and https://www.cbac.co.uk/media/nyzj2ivd/guide-to-results-as-a-level-june-2026-eduqas.pdf which states "Grade boundaries are the minimum number of marks needed to achieve each grade... may change between one series and another").
- Grade 9 formula: approximately the top 20% of those achieving grade 7+ receive grade 9 (ESTIMATE, secondary: https://ukcalculator.com/blog/gcse-grade-calculator-guide.html).

### 3e. Tiering (secondary)
- Higher tier: grades 4–9 (plus allowed grade 3 on a narrow miss); Foundation tier tops out at grade 5 (secondary: https://www.tugotutors.com/blog/parents-guide-gcse-maths, https://medium.com/@skoolur/is-gcse-harder-than-cbse-49c739f83fba).

### 3f. UK nations (secondary)
- England: 9–1. Wales: A*–G letters. Northern Ireland: A*–G with C* added (varies by board). Scotland: National 5 graded A–D (secondary: https://www.thesun.co.uk/news/40100957/gcse-grades-explained-pass-results-system/).

### 3g. Excluded / non-grades
- U = ungraded/unclassified (below grade 1 — no certificate). X = absent/incomplete (A-level context; JCQ: https://www.jcq.org.uk/knowledge-hub/reformed-linear-gce-exams-in-england/).

## 4. A-level grades A*–E (+U)

### 4a. Grade order — OFFICIAL
- JCQ (official): "Candidates' results are reported as grades: A*–E for A level and A–E for AS." Results documentation may show grade (A*–E or A–E, U, X). — https://www.jcq.org.uk/knowledge-hub/reformed-linear-gce-exams-in-england/
- Ofqual glossary (official, GOV.UK): "A levels award a grade, from highest to lowest, of A*, A, B, C, D and E, with a grade of U for unclassified. AS levels award a grade, from highest to lowest, of A, B, C, D and E, with a grade of U for unclassified." (No A* at AS.) — https://www.gov.uk/government/publications/glossary-for-ofquals-statistics/glossary-for-ofquals-statistics
- WJEC/Eduqas (official board): "Single award grades are reported as A* - E (with grade A* being the highest). ... Candidates whose level of attainment is below the minimum standard will receive an unclassified (U) result." — https://www.cbac.co.uk/media/nyzj2ivd/guide-to-results-as-a-level-june-2026-eduqas.pdf

### 4b. Boundaries set per series — OFFICIAL
- Boards set grade boundaries after each series; raw marks → scaled/weighted marks, then aggregated (JCQ: https://www.jcq.org.uk/knowledge-hub/reformed-linear-gce-exams-in-england/). WJEC: "Grade boundaries are the minimum number of marks needed to achieve each grade... Notional grade boundaries may change between one series and another." — https://www.cbac.co.uk/media/nyzj2ivd/guide-to-results-as-a-level-june-2026-eduqas.pdf

### 4c. A* rule (modular/UMS era) — OFFICIAL (Ofqual report)
- Ofqual report (summer 2016 series, Ofqual/17/6254): "To achieve an A* in the existing A level qualifications students must a) achieve a grade A overall (equivalent to 320 UMS on a 4 unit A level) and b) have at least an average of 90% of available UMS for A2 examinations (equivalent to 180 UMS or more for a 4 unit A level). In the reformed A level qualifications (first awarded in some subjects in 2017) there is no UMS so exam boards will use..." — https://dera.ioe.ac.uk/id/eprint/29731/contents
- Historical UMS equivalences (secondary, Wikipedia citing board docs): four-module A-level = 400 UMS (200 AS + 200 A2); six-module = 600 UMS; pass grades 40% E, 50% D, 60% C, 70% B, 80% A; A* = 80% average + 90% on A2 units; Maths: only C3/C4 count; Further Maths: best three A2 units — https://en.wikipedia.org/wiki/GCE_Advanced_Level_(United_Kingdom)
- Since 2015 reforms (England): linear A-levels, no UMS, AS no longer counts; A* boundary set per series by boards using statistical evidence — the per-series rule above.

### 4d. UCAS tariff points (secondary; tariff is UCAS-official but cited via secondary page)
- A* = 56, A = 48 UCAS points (secondary page checked against UCAS: https://ukcalculator.com/a-level-grade-calculator.html). Full tariff B=40, C=32, D=24, E=16 — UNVERIFIED from an official source in this research (standard UCAS tariff values; verify against UCAS before shipping).

### 4e. Science practical endorsement (official)
- A-level sciences carry a separate practical endorsement: Pass or Not Classified, not contributing to the overall grade (WJEC: https://www.cbac.co.uk/media/nyzj2ivd/guide-to-results-as-a-level-june-2026-eduqas.pdf; JCQ: https://www.jcq.org.uk/knowledge-hub/reformed-linear-gce-exams-in-england/).

## 5. Conflicts / ambiguities found
1. A+ points: 4.0 (most US schools, CB) vs 4.33 (ASU, LSAC) vs 4.3 (W&M law). No conflict to "resolve" — it is genuinely school-dependent; StudyPilot must offer all three as options.
2. Plus/minus decimals: tenths (3.7/3.3/2.7) vs thirds (3.67/3.33/2.67). Both documented; tenths is the more common default.
3. Percent bands: CB BigFuture uses A 90–100 (no +/-); the detailed +/- bands (A− 90–92 etc.) come from a CB doc quoted secondarily and vary by school. No official national percent table exists.
4. UK 35–40: UKSCQA calls it a typical "pass" band, but whether sub-40 earns an ordinary/pass degree vs fail is institution-specific (Bath unclassified honours from 38; Swansea pass degree from 35; Edinburgh 30–39 fail).
5. GCSE 9 formula (~20% of 7+ get 9): secondary estimate, not confirmed on an official page in this research.

## 6. UNVERIFIED (could not confirm from an official source in this research)
- U1. Full UCAS tariff table for B–E (A*=56, A=48 confirmed via secondary citing UCAS; B=40, C=32, D=24, E=16 not verified against ucas.com).
- U2. Exact percent-band → letter mapping for the US plus/minus table at national level (no official national table exists; school-specific).
- U3. Precise weighted-GPA bump values (+0.5 honors / +1.0 AP) as official policy — documented as common conventions, vary by district; CB only confirms weighted systems exist.
- U4. US course-retake policy specifics — varies; both replacement and averaging models documented at official school pages but no national rule.
- U5. UK borderline/zone-of-consideration mechanics — UKSCQA's 2pp recommendation found via secondary summary; exact per-university rules require each university's regulations.
- U6. UK condonement/compensation rules — institution-specific; no sector-wide formula verified.
- U7. US pass/fail "D earns credit" universality — CB table implies it; individual school policies vary (some require C in major).
- U8. GCSE grade-9 20%-of-7+ formula — estimate from secondary source.
- U9. NI GCSE C* and Welsh A*–G specifics — secondary source only.
- U10. A* boundary-setting method for reformed linear A-levels — boards set per series (official), but the statistical method details not verified beyond "exam boards will use..." (Ofqual sentence truncated in source).
