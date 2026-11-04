/**
 * Region registry + locale mapping tests (pure module — no DOM, no fetch).
 * Pins the arch-review §7 requirement: navigator.language gives language, not
 * country, so the locale→region table must be explicit and fall back to
 * _default on ambiguity.
 * Run: node tests/run.js
 */
import { DEFAULT_REGION, listRegions, regionForLocale } from "../assets/js/regions.js";

test("registry lists every shipped region", () => {
  assertEq(listRegions(), [
    "_default",
    "us",
    "uk",
    "in-cbse",
    "in-icse",
    "in-vtu",
    "in-mumbai",
    "np-neb",
    "sg-nus-ntu",
  ]);
});

test("regionForLocale: explicit locales map to the right region", () => {
  assertEq(regionForLocale("en-US"), "us");
  assertEq(regionForLocale("en-GB"), "uk");
  assertEq(regionForLocale("en-NP"), "np-neb");
  assertEq(regionForLocale("ne"), "np-neb");
  assertEq(regionForLocale("en-SG"), "sg-nus-ntu");
});

test("regionForLocale: matching is case-insensitive", () => {
  assertEq(regionForLocale("EN-us"), "us");
  assertEq(regionForLocale("En-Gb"), "uk");
});

test("regionForLocale: ambiguous locales fall back to _default", () => {
  // en-IN spans CBSE/ICSE/state boards — too ambiguous to guess.
  assertEq(regionForLocale("en-IN"), DEFAULT_REGION);
  // bare language tags give language, not country.
  assertEq(regionForLocale("en"), DEFAULT_REGION);
  assertEq(regionForLocale("fr"), DEFAULT_REGION);
  assertEq(regionForLocale(""), DEFAULT_REGION);
  assertEq(regionForLocale(null), DEFAULT_REGION);
});

test("regionForLocale: every mapped region exists in the registry", () => {
  const reg = listRegions();
  for (const locale of ["en-US", "en-GB", "en-NP", "ne", "en-SG", "en-IN", "en", "xx"]) {
    const r = regionForLocale(locale);
    assert(reg.includes(r), `${locale} -> ${r} not in registry`);
  }
});
