/**
 * StudyPilot · Study Space page controller.
 * Runs the shared site bootstrap (theme, brand, menu, service worker),
 * then starts the Study Space app with an error toast on failure.
 */
import "/assets/js/site.js";

import { toast } from '/assets/js/ui.js';
import { initStudySpace } from '/assets/js/studyspace.js';

/* Shared site bootstrap (theme, brand, mobile menu, theme icon, service worker)
   now runs via /assets/js/site.js (side-effect import at the top of this module). */

initStudySpace().catch((e) => {
  console.error(e);
  toast('Study Space had trouble starting: ' + (e && e.message ? e.message : 'unknown error'));
});
