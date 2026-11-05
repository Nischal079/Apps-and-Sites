/**
 * ExamElm · BYOK cost estimation.
 *
 * Prices are APPROXIMATE public list prices (USD per 1M tokens), re-verified
 * 2026-11-05 against provider pricing pages and current pricing trackers.
 * Providers change pricing · the UI labels every figure as an estimate and
 * links the provider's pricing page. Unknown models return known:false so the
 * UI says "unknown" instead of inventing a number.
 *
 * 2026-11-05 verification notes:
 * - Removed retired model IDs (estimates for them would be worse than
 *   "unknown", since the IDs no longer work): deepseek-chat + deepseek-reasoner
 *   (retired 2026-07-24; current IDs are deepseek-flash and deepseek-v4-pro),
 *   gemini-1.5-flash / gemini-1.5-pro (retired 2025-09-29),
 *   gemini-2.0-flash (retired 2026-06-01), o4-mini (shut down 2026-10-23).
 * - GPT-4o / GPT-4o-mini / GPT-4.1 / GPT-4.1-mini prices verified current, but
 *   OpenAI shuts these API snapshots down 2027-01-14; gpt-6-luna is the
 *   listed replacement and is added below.
 * - DeepSeek uses peak/off-peak pricing since 2026-08-16 (peak Mon–Fri
 *   01:00–04:00 and 06:00–10:00 UTC, 2x). Table uses PEAK rates (worst case,
 *   consistent with estimateCost's full-output-budget assumption).
 * - Gemini 2.5 Pro tiers above 200K tokens ($2.50 in / $15.00 out); table uses
 *   the standard ≤200K rates and the UI labels figures as estimates.
 */

export const PRICING = [
  // [match substring (lowercase), {in: $/1M input, out: $/1M output, label}]
  ["gpt-4o-mini", { input: 0.15, output: 0.6, label: "GPT-4o mini (API retires 2027-01-14)" }],
  ["gpt-4o", { input: 2.5, output: 10, label: "GPT-4o (API retires 2027-01-14)" }],
  ["gpt-4.1-mini", { input: 0.4, output: 1.6, label: "GPT-4.1 mini (API retires 2027-01-14)" }],
  ["gpt-4.1", { input: 2, output: 8, label: "GPT-4.1 (API retires 2027-01-14)" }],
  ["gpt-6-luna", { input: 0.1, output: 0.5, label: "GPT-6 Luna" }],
  ["claude-3-5-haiku", { input: 0.8, output: 4, label: "Claude 3.5 Haiku" }],
  ["claude-3-haiku", { input: 0.25, output: 1.25, label: "Claude 3 Haiku" }],
  ["claude-haiku-4-5", { input: 1, output: 5, label: "Claude Haiku 4.5" }],
  ["claude-sonnet-4-5", { input: 3, output: 15, label: "Claude Sonnet 4.5" }],
  ["claude-sonnet-4", { input: 3, output: 15, label: "Claude Sonnet 4" }],
  ["claude-3-5-sonnet", { input: 3, output: 15, label: "Claude 3.5 Sonnet" }],
  ["claude-opus-4-5", { input: 5, output: 25, label: "Claude Opus 4.5" }],
  ["claude-opus-4", { input: 15, output: 75, label: "Claude Opus 4" }],
  ["gemini-2.5-flash-lite", { input: 0.1, output: 0.4, label: "Gemini 2.5 Flash-Lite" }],
  ["gemini-2.5-flash", { input: 0.3, output: 2.5, label: "Gemini 2.5 Flash" }],
  ["gemini-2.5-pro", { input: 1.25, output: 10, label: "Gemini 2.5 Pro (≤200K ctx)" }],
  ["gemini-3.5-flash", { input: 1.5, output: 9, label: "Gemini 3.5 Flash" }],
  ["gemini-3.1-pro", { input: 2, output: 12, label: "Gemini 3.1 Pro (≤200K ctx)" }],
  ["deepseek-flash", { input: 0.3, output: 1.2, label: "DeepSeek Flash (peak hrs)" }],
  ["deepseek-v4-pro", { input: 1.32, output: 3.96, label: "DeepSeek V4 Pro (peak hrs)" }],
];

/** Rough token estimate: ~4 chars per token. Labeled as estimate in the UI. */
export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function priceFor(modelId) {
  const id = String(modelId || "").toLowerCase();
  for (const [match, price] of PRICING) {
    if (id.includes(match)) return price;
  }
  return null;
}

/**
 * Estimate the cost of one request BEFORE sending.
 * Returns {known, promptTokens, maxOutputTokens, estCostUsd, label}.
 * estCostUsd assumes the full output budget is used (worst case).
 */
export function estimateCost(modelId, promptText, maxOutputTokens) {
  const price = priceFor(modelId);
  const promptTokens = estimateTokens(promptText);
  const maxOut = Math.max(0, Number(maxOutputTokens) || 0);
  if (!price) {
    return { known: false, promptTokens, maxOutputTokens: maxOut, estCostUsd: null, label: String(modelId || "unknown model") };
  }
  const estCostUsd = (promptTokens / 1e6) * price.input + (maxOut / 1e6) * price.output;
  return { known: true, promptTokens, maxOutputTokens: maxOut, estCostUsd, label: price.label };
}

/** Format $0.00042 as "$0.0004" / "$0.02" · never rounds to misleading $0.00. */
export function formatUsd(v) {
  if (v == null || Number.isNaN(v)) return "unknown";
  if (v === 0) return "$0.00";
  if (v < 0.01) return "$" + v.toFixed(4);
  return "$" + v.toFixed(2);
}
