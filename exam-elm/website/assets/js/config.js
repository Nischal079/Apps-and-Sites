/**
 * ExamElm — centralized brand & shared strings.
 *
 * BRANDING RULE: every user-visible brand reference (name, tagline) MUST come
 * from this module. A rename is a one-line change here plus
 * asset filenames — never scattered string edits through the codebase.
 *
 * Brand decided 2026-11-04 by Nischal (was the "StudyPilot" working name;
 * brand clearance returned BLOCKED — active commercial use).
 */
export const BRAND = {
  name: "ExamElm",
  tagline: "Study smarter. Prepare better. Achieve more.",
  shortDescription:
    "Free academic productivity tools for high-school and university students worldwide. No signup. Private by design.",
  themeColor: "#312e81", // deep indigo
  accentColor: "#f59e0b", // warm amber
};

export const PROMISES = ["FREE", "NO SIGNUP", "PRIVATE", "GLOBAL"];

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/about/", label: "About" },
  { href: "/study-space/", label: "My Study Space" },
  { href: "/ai-chat/", label: "AI Chat" },
  { href: "/ai-workflows/", label: "AI Tools" },
  { href: "/guides/", label: "Guides" },
  { href: "/tools/timetable/", label: "Timetable" },
  { href: "/tools/grade-calculator/", label: "Grade Calculator" },
  { href: "/tools/syllabus-tracker/", label: "Syllabus Tracker" },
  { href: "/tools/exam-countdown/", label: "Exam Countdown" },
];

export const FOOTER_LINKS = [
  { href: "/about/", label: "About" },
  { href: "/contact/", label: "Contact" },
  { href: "/privacy/", label: "Privacy Policy" },
  { href: "/methodology/", label: "Methodology" },
  { href: "/guides/", label: "Guides" },
];
