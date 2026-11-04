/**
 * StudyPilot — BYOK cost estimation.
 *
 * Prices are APPROXIMATE public list prices (USD per 1M tokens) captured
 * 2026-11-04. Providers change pricing — the UI labels every figure as an
 * estimate and links the provider's pricing page. Unknown models return
 * known:false so the UI says "unknown" instead of inventing a number.
 */

export const PRICING = [
  // [match substring (lowercase), {in: $/1M input, out: $/1M output, label}]
  ["gpt-4o-mini", { input: 0.15, output: 0.6, label: "GPT-4o mini" }],
  ["gpt-4o", { input: 2.5, output: 10, label: "GPT-4o" }],
  ["gpt-4.1-mini", { input: 0.4, output: 1.6, label: "GPT-4.1 mini" }],
  ["gpt-4.1", { input: 2, output: 8, label: "GPT-4.1" }],
  ["o4-mini", { input: 1.1, output: 4.4, label: "o4-mini" }],
  ["claude-3-5-haiku", { input: 0.8, output: 4, label: "Claude 3.5 Haiku" }],
  ["claude-3-haiku", { input: 0.25, output: 1.25, label: "Claude 3 Haiku" }],
  ["claude-sonnet-4", { input: 3, output: 15, label: "Claude Sonnet 4" }],
  ["claude-3-5-sonnet", { input: 3, output: 15, label: "Claude 3.5 Sonnet" }],
  ["claude-opus-4", { input: 15, output: 75, label: "Claude Opus 4" }],
  ["gemini-2.0-flash", { input: 0.1, output: 0.4, label: "Gemini 2.0 Flash" }],
  ["gemini-1.5-flash", { input: 0.075, output: 0.3, label: "Gemini 1.5 Flash" }],
  ["gemini-1.5-pro", { input: 1.25, output: 5, label: "Gemini 1.5 Pro" }],
  ["gemini-2.5-pro", { input: 1.25, output: 10, label: "Gemini 2.5 Pro" }],
  ["deepseek-chat", { input: 0.27, output: 1.1, label: "DeepSeek Chat" }],
  ["deepseek-reasoner", { input: 0.55, output: 2.19, label: "DeepSeek Reasoner" }],
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

/** Format $0.00042 as "$0.0004" / "$0.02" — never rounds to misleading $0.00. */
export function formatUsd(v) {
  if (v == null || Number.isNaN(v)) return "unknown";
  if (v === 0) return "$0.00";
  if (v < 0.01) return "$" + v.toFixed(4);
  return "$" + v.toFixed(2);
}
