# StudyPilot — Regional Grading Verification
**Date:** 2026-11-04 · **Status:** Verified against official sources · **Purpose:** Feeds `config/regions/*.json` — must land before the grade calculator (T2) is built.
**Method:** Read-only research across three parallel streams; raw notes in `research/phase2-verification/` (`us-uk-grading.md`, `india-grading.md`, `nepal-singapore-grading.md`) with inline source URLs.

> **Global rule for the calculator:** there is NO single official scale in any of these systems. Every region must ship as a *preset* (with documented variants), never a hard-coded formula. Anything labeled *(estimate)* is an inference from observed signals, not a measured/official number. Items marked **UNVERIFIED** could not be confirmed from an official source — do not ship them as fact.

---

## 1. United States — 4.0 GPA

**There is no single official US scale.** College Board (BigFuture) states verbatim: "High schools use different grading scales to calculate GPA… the 4.0 scale is just one common example… your school may calculate GPA differently."
Source: https://bigfuture.collegeboard.org/plan-for-college/get-started/how-to-calculate-gpa-4.0-scale

### 1a. College Board reference table (official, whole letters, no plus/minus)
| Grade | % | Points |
|---|---|---|
| A | 90–100 | 4.0 |
| B | 80–89 | 3.0 |
| C | 70–79 | 2.0 |
| D | 66–69 | 1.0 |
| F | below 65 | 0.0 |

GPA = total grade points ÷ number of classes; credit-weighted GPA = total quality points ÷ total credit hours. (Same source.)

### 1b. Most common plus/minus mapping (verified across multiple university registrars)
| A+ 4.00 | A 4.00 | A− 3.70 | B+ 3.30 | B 3.00 | B− 2.70 | C+ 2.30 | C 2.00 | C− 1.70 | D+ 1.30 | D 1.00 | D− 0.70 | F 0.00 |

Sources: University of Missouri Academic Catalog (https://catalog.missouri.edu/academicpolicies/grades/); UC Academic Senate regulations via UCLA Extension — confirms "+0.3/−0.3, except A+" (https://dev.uclaextension.edu/policy/credit-grading-and-continuing-education-unit-aa121); Indiana University (https://bulletins.iu.edu/iupui/2021-2022/policies/academic-policy/grading-system.shtml).

### 1c. Documented variants (all real — offer as presets)
- **A+ = 4.33** (Arizona State registrar; LSAC transcript standardization).
- **A+ = 4.3** (William & Mary, law-only: https://www.wm.edu/offices/registrar/_documents/transcript/transcriptkeynsc.pdf).
- **Thirds series** (3.67/3.33/2.67, e.g. University of Toledo) vs **tenths** (3.7/3.3/2.7) — default to tenths.
- **No plus/minus** schools (College Board table above); **no D−** at many schools.
- Common secondary %-bands (A+ 97–100, A 93–96, A− 90–92, …) are school-set cutoffs, not national. A proportional GPA÷4×100 conversion is used by **no** school — any %↔GPA conversion is an **estimate**.

### 1d. Weighted GPA (conventions only — vary by district)
Common: Honors +0.5 (A = 4.5), AP/IB/dual-enrollment +1.0 (A = 5.0); often no bonus on D/F. Sources: BigFuture (above); https://calccentrals.com/blog/how-to-calculate-gpa. **Tool must let users set their own bumps.**

### 1e. Pass, retakes, exclusions
- **Passing:** D (1.0) earns credit at most schools; F fails. Many majors require C+; graduation commonly requires cumulative 2.0 (Mizzou catalog). School-specific.
- **Retakes:** vary — grade replacement (some schools) vs averaging (UMKC official: "Since 1985, all grades, including those in repeated courses, are included in the GPA calculation" — https://catalog.umkc.edu/general-graduate-academic-regulations-information/general-graduate-academic-regulations/course-and-grading-policies/graduate-course-grading/). **Tool must offer both modes.**
- **Excluded from GPA:** S/U, P/NP, W, I (until resolved), NR, audited courses (Mizzou catalog).

---

## 2. United Kingdom

### 2a. Degree classification bands (sector standard)
| Classification | % |
|---|---|
| First-class honours | ≥ 70 |
| Upper second (2:1) | 60–69 |
| Lower second (2:2) | 50–59 |
| Third-class honours | 40–49 |
| Pass / fail boundary | 35–40 (institution-specific) |

Sources: UKSCQA "Principles for effective degree algorithm design" (via Universities UK): "first (≥70), upper-second (60–69), lower-second (50–59), third (40–49), pass (35–40)" — https://dera.ioe.ac.uk/id/eprint/36040/contents; live example: University of Law assessment regulations — https://www.law.ac.uk/globalassets/13.-media--doc-repo/08.-policies/pdf_policies_ug-assessment-award-regulations-policy.pdf.

### 2b. How classification is computed (varies by university — NOT a grade→points table)
- **Year weightings:** UKSCQA's four typical models — 0/0/100, 0/33/67, 0/50/50, 0/10/30/60 (Year 1 usually zero-weighted). Real examples: UCL 1:3:5, Leeds 1:2, Birmingham ~25/75. **Tool must ask for the university's weighting or offer the four UKSCQA presets.**
- **Borderlines:** UKSCQA recommends a zone of consideration ≤ 2pp below a boundary with no additional rounding (68.0 may be reconsidered for a First; 67.99 not). Birmingham ~68.0–69.5; some universities round to nearest integer. **Tool needs a borderline override.**
- **Condoned fails:** UKSCQA 35–40 "pass" band; Bath unclassified honours from 38.00; Swansea pass degree from 35; Edinburgh 30–39 = fail. Resits commonly capped at 40.
- **Excluded:** pass/fail modules don't count; Year 1 usually excluded.
- **Honours vs ordinary:** honours degrees are classified; ordinary (non-honours) degrees are unclassified (e.g., City St George's: "BSc (nonhons): 40 Pass per mod (not classified)" — https://studenthub.citystgeorges.ac.uk/__data/assets/pdf_file/0005/923549/BSc-Radiotherapy-and-Oncology-Year-3.pdf). Scotland: 4-yr/480-credit honours vs 3-yr/360-credit ordinary. Medical degrees (MBBS/MBChB) usually unclassified (Pass/Honours/Distinction).

### 2c. GCSE 9–1 (Ofqual official)
Grade order, highest→lowest: **9, 8, 7, 6, 5, 4, 3, 2, 1, U** (ungraded). Combined Science double awards: 9-9 down to 1-1.
Source: https://www.gov.uk/government/publications/glossary-for-ofquals-statistics/glossary-for-ofquals-statistics
- **Anchor points** (Ofqual): bottom of 7 = bottom of old A; bottom of 4 = bottom of old C; bottom of 1 = bottom of old G; 9 sits above old A*. Source: https://ofqual.blog.gov.uk/2018/03/02/gcse-9-to-1-grades-a-brief-guide-for-parents/
- **Grade 4 = "standard pass," grade 5 = "strong pass"** (Department for Education). Source: https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/603594/ESC_letter.pdf
- **Boundaries are set per exam series per board after marking** — never hard-code. Tiering: Higher = grades 4–9; Foundation tops out at 5. Nations: England 9–1; Wales A*–G; NI A*–G with C*; Scotland National 5 A–D.

### 2d. A-levels (JCQ/Ofqual official)
Grade order: **A\*, A, B, C, D, E, U** (unclassified); **X** = incomplete. No A\* at AS (A–E only).
Sources: https://www.jcq.org.uk/knowledge-hub/reformed-linear-gce-exams-in-england/; Ofqual glossary (GOV.UK, above).
- **A\* rule (modular era, Ofqual/17/6254):** grade A overall AND ≥90% average UMS on A2 units. Source: https://dera.ioe.ac.uk/id/eprint/29731/contents. Post-2015 reformed linear: no UMS; boards set the A\* boundary per series.
- Boundaries set per series by boards after marking (raw → scaled → aggregated). Science practical endorsement is separate (Pass/Not Classified).

---

## 3. India

### 3a. CBSE — CGPA × 9.5 is HISTORICAL ONLY ⚠️
- **Formula (CCE era):** Percentage = CGPA × 9.5; subject-wise = 9.5 × subject grade point. **Official source: CBSE Circular No. 24/2010 (28-05-2010)** — result explicitly called an *indicative* percentage. 9.5 came from CBSE's analysis that A1-band students averaged ~95 marks (95 ÷ 10 = 9.5), so **10 CGPA = 95%, not 100%**.
- **Current status (verified):** CCE was abolished March 2017 (Uniform System of Assessment, marks-based, from 2017–18; Class 10 board exams restored 2018). **Current marksheets show subject marks + positional grades (A1–D2, E = Essential Repeat) — no CGPA, no grade points, nothing to convert.** CBSE declares no aggregate percentage/division/merit list.
- **CCE-era grade points:** A1=10, A2=9, B1=8, B2=7, C1=6, C2=5, D=4, E=fail. CGPA = average of five main subjects' grade points; additional 6th subject excluded.
- **Calculator rule: gate ×9.5 to legacy pre-2018 CCE marksheets only**, with a clear label. Never apply to current CBSE marksheets.
- Sources: http://www.icbse.com/cgpa; https://gradekar.com/blog/cgpa-to-percentage-guide; https://supertutor.in/resources/blog/cbse-grading-system-2026/; https://www.india.com/education/cbse-new-mandate-does-away-with-cce-introduces-uniform-assessment-from-class-vi-onwards-1949084/?d=dds

### 3b. ICSE / ISC (CISCE)
- **ICSE Class 10:** Percentage = (best 5 subjects ÷ 500) × 100, **English Language compulsorily included**; lowest other subject dropped. No CGPA. Pass: 33% per subject (written + internal separately).
- **ISC Class 12:** Aggregate = (English + best 3 others) ÷ 4 × 100 — **Best of 4, not 5.** Divisions: Distinction ≥75%, First 60–74.99%, Pass 35–59.99%.
- **Conflict resolved:** current pass = 35%/subject (lowered 40→35 for ISC from 2024 exams; ICSE lowered to 33%). Use 35%; note 40% appears on outdated pages.
- **Calculator rule:** English-forced best-of-N selection, not plain averages.
- Sources: https://collegedunia.com/exams/icse-class-x-board/grading-system; https://collegedunia.com/exams/isc/grading-system; https://www.kollegeapply.com/exams/isc-board-class-12; https://amityonline.com/blog/isc-12th-result-announced; https://www.shiksha.com/boards/icse-board-results

### 3c. VTU — scheme split (wrong scheme = ±7.5 points) ⚠️
| Schemes | Formula |
|---|---|
| 2021 / 2022 / 2025 | **M = CGPA × 10** |
| 2015 / 2017 / 2018 | **(CGPA − 0.75) × 10** |

- 2021+ evidence: VTU M.Arch Regulations 2024 clause 22-OMA-11.4 states "M = CGPA Earned × 10" verbatim; B.E./B.Tech Regs 2022 clause 22OB 6.7 and 2021 clause 21OB13.2 carry the same formula.
- Older: VTU's own "CGPA Standard Formula" page (vtu.ac.in/en/cgpa-standard-formula/).
- **Conflict:** one site claims a VTU notification (VTU/Exam/Circular/2025/CGPA-PCT, 17-06-2025) prescribing (CGPA − 0.50) × 10 for 2021/2022 schemes — zero corroboration, contradicts VTU's own regulations. **UNVERIFIED — do not implement.**
- Grade tables: newer schemes O=10, A+=9, A=8, B+=7, B=6, C=5, P=4, F=0; older (2018-era) S=10, A=9, B=8, C=7, D=6, E=4, F=0. Class thresholds (new): FCD ≥7.0 (first-attempt clears only), FC ≥6.0, SC ≥5.0, Pass ≥4.0.
- **Calculator rule: scheme/batch picker is mandatory.**
- Sources: https://gradekar.com/cgpa-to-percentage/vtu; https://toolisky.com/blog/vtu-cgpa-to-percentage-calculator; https://sgpatopercentage.com/; https://shishya.in/tools/cgpa-to-percentage; https://vtu.ac.in/wp-content/uploads/2024/10/03.-M.-Arch_2024-25-Regulation-final-10th-August-2024^.pdf

### 3d. Mumbai University — no single formula ⚠️
- **Engineering (Faculty of Technology):** % = **7.1×CGPI + 12** (CGPI < 7); **7.4×CGPI + 12** (CGPI ≥ 7), **rounded up** to next integer. Circular Exam/Engg/720 of 2015, printed verbatim on B.E. transcripts. Unaffected by 2026 changes.
- **Pre-2026 10-point CBCS (general faculties):** coefficients **conflicted** — most sources (CGPA × 7.1) + 11 (Circular Exam/Com/97 of 2018); one detailed source 7.25 × CGPI + 11 (same circular). Repeal agreed: **effective 1 January 2026** (Circular Exam/Result/803 of 2026). Post-2026: **no formula** — college computes actual marks %; certificate on request.
- **NEP 2020:** no formula, band table only (e.g., 7.00–<8.00 CGPA → 70–<80%). Pass: 40% separately in internal and semester-end.
- **CBSGS 7-point (old):** no formula ever existed — actual marks only. The commonly quoted "(CGPA − 0.75) × 10 for the 7-point" is **wrong** — that's VTU's old formula, misattributed by aggregator sites.
- **Calculator rule: faculty + batch picker mandatory; show the formula source on every result.**
- Sources: https://www.munotes.in/calculators; https://gradekar.com/blog/cgpa-to-percentage-guide; https://globalcgpa.in/sgpa-to-percentage/; https://www.cgpa.app/p/mumbai-university-cgpa-percentage.html

### 3e. State-board variance (note)
- **Maharashtra (MSBSHSE):** marks-only, no CGPA conversion — SSC % on **best of five** subjects; HSC on all subjects; pass 35%/subject; Distinction ≥75%, First 60%, Second 45%, Pass 35%.
- General pattern: most state boards (UP, WB, TN, Karnataka) are direct-marks boards needing only marks÷total plus thresholds — individual board documents **UNVERIFIED** in this pass (beyond Maharashtra).

---

## 4. Nepal NEB (SEE + Class 11/12) — 4.0 scale

**Governing document:** CDC Letter Grading Directive 2078 (4th amendment 2081).

| % | Letter | Grade point |
|---|---|---|
| ≥90 | A+ | 4.0 |
| 80–<90 | A | 3.6 |
| 70–<80 | B+ | 3.2 |
| 60–<70 | B | 2.8 |
| 50–<60 | C+ | 2.4 |
| 40–<50 | C | 2.0 |
| 35–<40 | D | 1.6 (**minimum pass**) |
| <35 | NG | — (Not Graded) |

Sources: https://www.bikrambhujel.com.np/p/neb-gpa-calculator.html (cites directive sections); https://www.ambition.guru/blog/see-result-2081-published; https://www.educatenepal.com/news/detail/how-to-check-see-class-10-exam-results-2083-2026-with-marksheet; https://www.educatenepal.com/news/detail/how-to-check-neb-grade-12-result-2083-2082-with-gradesheet-via-websites-sms-ivr-2026-online

- **Pass thresholds:** ≥35% in theory AND ≥40% in internal/practical, **separately per subject** (75-mark theory → 27 marks; 25-mark internal → 10). Below either → NG for that subject. Same rule for SEE and +2. Sources: https://www.collegenp.com/news/see-grade-increment-and-supplementary-exam-results-2082; https://www.acharyar.com.np/2021/12/new-see-grading-system-2078-nepal.html
- **GPA computation:** weighted by credit hours — theory and internal graded separately, each grade point × its credit-hour share, summed ÷ subject credit hours; overall GPA = Σ(credit hours × grade point) ÷ Σ(credit hours). Sources: https://www.bikrambhujel.com.np/p/neb-gpa-calculator.html; https://www.tikka.com.np/2026/09/Neb-Gpa-Calculate.html
- **NG rules:** NG in 1–2 subjects → supplementary grade-increment exam; NG in >2 subjects → repeat the year; no certificate until NG cleared. Source: https://www.acharyar.com.np/2021/12/new-see-grading-system-2078-nepal.html
- ⚠️ **"Percentage = GPA × 25" is UNVERIFIED** — a directive-citing source explicitly says **no official GPA→percentage formula exists**. The tool must label any such conversion an **estimate**.
- **Conflict noted:** thenepal.io alone publishes D+ 35–39 = 1.6 / D 20–34 = 1.2 / NG below 20, contradicting itself across its own pages; no official source. Using the directive's 8-band table above.

---

## 5. Singapore — NTU & NUS (5.0 scale)

### 5a. Grade→point table (identical at both universities)
| A+ 5.00 | A 5.00 | A− 4.50 | B+ 4.00 | B 3.50 | B− 3.00 | C+ 2.50 | C 2.00 | D+ 1.50 | D 1.00 | F 0.00 |

- NUS sources: Science freshmen briefing (https://www.science.nus.edu.sg/wp-content/uploads/2026/07/BPharm_Faculty-Freshmen-Briefing-2026_Student-Copy.pdf); CDE briefing (https://cde.nus.edu.sg/wp-content/uploads/2024/07/CDE-Freshman-Welcome-2024_Academic-Briefing_19Jul2024.pdf). Law/Dentistry/Medicine use separate scales.
- NTU source: Academic Handbook AY2026-27 §6.2.1 (https://www.ntu.edu.sg/media/docs/default-source/office-of-academic-services/academic-handbook-(undergraduate-studies)-ay2026-27v3.pdf?sfvrsn=69b13d12_1)
- ⚠️ Neither university publishes percentage bands for letter grades — **do not use Wikipedia's bands.**

### 5b. NUS specifics
- **Renamed:** CAP → GPA on 1 Aug 2023. Formula (FASS handbook): GPA = Σ(grade point × Units) ÷ Σ(Units); **F included at 0**; passed courses may not be repeated. Source: https://fass.nus.edu.sg/socanth/wp-content/uploads/sites/16/2026/07/MA-GSA-Student-Handbook_vJul2026.pdf
- **S/U:** letter hidden, not computed; CS/CU, EXE, W, IC, IP carry no grade points. From AY2021/22, S = D or above (pre-AY2021/22: C or above); only S earns units. Quota: 32 units total — 20 time-limited (first-year courses for AY2016/17–AY2024/25 cohorts; **first 2 years** for AY2025/26+ cohorts) + 12 carry-over. Variants: 20 units if 20+ APCs; 12 anytime with prior university experience; prior degree holders ineligible. Applies to Level 1000/2000 (no NUS prereqs); not for Dentistry/Law/Medicine (excl. Nursing)/Yale-NUS.
- **Honours cutoffs** (160-unit programmes, from AY2012/13; faculties may add requirements): Highest Distinction ≥4.50; Distinction 4.00–4.49; Merit 3.50–3.99; Honours 3.00–3.49; Pass 2.00–2.99. Graduation minimum 2.00.
- Source: https://nus.edu.sg/registrar/academic-information-policies/undergraduate-students/continuation-and-graduation-requirements

### 5c. NTU specifics
- **Formula** (§6.2.3): CGPA = Σ(grade point × AU) ÷ total AU attempted; **failed courses included**. Excluded: Pass/Fail-only courses, FGO-declared, LOA, EX, IP. YGPA covers Semester 1+2 (Special Term excluded).
- **FGO replaced S/U from AY2024/25** (§6.3): A/B/C/D → **P** (Pass, earns AU); F → **NR** (No Record, invisible externally); both excluded from CGPA; irrevocable; declared after results in a fixed window. Quota: 3-yr up to **21 AU**; 4/5-yr full-time up to **24 AU**; part-time up to 21 AU; max 12 AU on Major Core/ICC/MPE. Excludes FYP, internships, sanctioned courses, LKCMedicine/exchange/non-graduating students. **Tool must offer S/U (pre-AY2024/25) and FGO (AY2024/25+) as separate presets.**
- **Retakes:** passed courses may not be repeated (§6.1.4); all attempts on transcript (§6.1.5); the F stays in CGPA on retake.
- **Classification** (§6.6): Highest Distinction 4.50–5.00; Distinction 4.00–4.49; Merit 3.50–3.99; Honours 3.00–3.49; Pass 2.00–2.99. **FYP conditions:** Engineering/Computing&DS — Highest Distinction needs ≥B+ FYP; Science — ≥A− FYP for Highest, Pass FYP for Distinction; HSS FYP opt-out → ineligible for top two classes. Graduation minimum: 2.00 CGPA.

---

## 6. Calculator design implications (for T2 build)

1. **Presets, not formulas.** US: scale preset picker (CB whole-letter / standard +/− tenths / +/− thirds / A+ 4.33) + weighted-bump controls + retake mode (replace vs average) + "no single official US scale" disclaimer.
2. **UK:** year-weighting picker (four UKSCQA presets: 0/0/100, 0/33/67, 0/50/50, 0/10/30/60) + borderline override; GCSE/A-level modes are grade-order only (no GPA math).
3. **India:** scheme/batch pickers mandatory for VTU and Mumbai University; CBSE ×9.5 gated to pre-2018 CCE marksheets with label; ICSE/ISC English-forced best-of-N.
4. **NEB:** credit-hour-weighted GPA; dual pass thresholds (theory ≥35%, internal ≥40%); NG handling; GPA→% labeled estimate-only.
5. **Singapore:** NUS S/U quota rules by cohort; NTU S/U vs FGO by AY; honours cutoffs + NTU FYP conditions as informational outputs.
6. **Every result shows its formula source** (config `source_urls`) and any estimate labels. Every region config ships with test vectors pinning its rounding behavior.

## 7. Consolidated UNVERIFIED list (do not ship as fact)

- U1. Full UCAS tariff B–E points (standard values B=40, C=32, D=24, E=16 — not verified against ucas.com).
- U2. Any national US %↔letter table (doesn't exist; school-specific).
- U3. Weighted-GPA bumps as official policy (conventions only; vary by district).
- U4. US retake specifics (both models documented at school level; no national rule).
- U5. UKSCQA 2pp zone-of-consideration mechanics (via secondary summary of the official doc).
- U6. UK condonement/compensation rules (institution-specific; no sector formula).
- U7. "D earns credit" universality (CB table implies; some schools require C).
- U8. GCSE grade-9 allocation formula (secondary estimate only).
- U9. NI C*, Welsh A*–G, Scottish National 5 details (secondary only).
- U10. A* boundary-setting statistics for reformed linear A-levels beyond "boards set per series".
- U11. CBSE Circular 24/2010 primary text; cbse.gov.in's current position on ×9.5 (corroborated by 3–5 independent sources each, but primary sites not directly opened).
- U12. VTU B.E./B.Tech 2021/2022 regulation PDFs primary text; VTU "CGPA Standard Formula" page primary text.
- U13. Mumbai University circulars Exam/Engg/720 of 2015, Exam/Com/97 of 2018, Exam/Result/803 of 2026 primary text; resolution of the 7.1 vs 7.25 coefficient conflict.
- U14. CISCE regulations primary text (Best-of-5/Best-of-4, 35%); CISCE grace-mark claim (single secondary source).
- U15. State-board documents beyond Maharashtra.
- U16. NEB "GPA × 25" percentage conversion (no official formula exists — treat as estimate, not fact).
- U17. NUS failed-then-retaken module GPA treatment (third-party only).
- U18. Legacy NEB nine-level scale exact points.

*Note: several items above are corroborated by multiple independent secondary sources citing the primary documents; the UNVERIFIED flag means the primary document itself wasn't opened in this pass. Re-verify against primaries before launch where feasible.*
