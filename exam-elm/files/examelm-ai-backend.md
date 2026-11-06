# ExamElm AI — built-in free provider (Pages Function proxy)

Built 2026-11-06, user-approved feature. ExamElm AI is the site's own free
AI provider: no key needed from the user, free models only, backed by a
real server-side proxy to OpenRouter.

## Architecture

```
Browser (AI Chat / AI Tools)
  -- POST /api/chat { model, messages, maxTokens, stream } --> Pages Function
  functions/api/chat.js (Cloudflare Pages Functions, same origin)
  -- POST https://openrouter.ai/api/v1/chat/completions --> OpenRouter
  <-- SSE stream passed through, or JSON completion
```

- The site is otherwise static. This is the one server-side piece.
- The browser NEVER talks to OpenRouter directly for ExamElm AI and never
  sends an Authorization header for it (asserted in tests).
- The proxy forwards the upstream SSE stream unchanged when `stream` is
  true, so the existing chat streaming, reasoning deltas, and the
  non-streaming fallback in `assets/js/ai/chat.js` all work untouched.
- The display name is "Examelm AI". The real model id is shown in the UI
  (provider card, Chat Model line) so it is transparent what runs
  underneath.

## The key (read this first)

- The OpenRouter API key lives ONLY as the Cloudflare Pages secret named
  `OPENROUTER_API_KEY`. It is read from the Function environment
  (`context.env.OPENROUTER_API_KEY`), never from the request.
- Set it here: Cloudflare dashboard → Pages → **apps-and-sites** →
  Settings → Environment variables → **Production** → add
  `OPENROUTER_API_KEY` with the OpenRouter key value → Save → redeploy
  (or wait for the next push-triggered deploy).
- The real key is NOT in this brief and must NEVER be written to any file,
  test, commit, log, or message. The repo is public and the site is
  static: a key in client code or the repo would be stolen immediately.
  Tests use only the fake placeholder `sk-or-v1-test`.
- Until the secret is set, the proxy answers `503 "ExamElm AI is not
  configured yet"` (no key details). That 503 IS the proof the proxy
  deployed: it means the Function is live and no key is in client code.
- The client adapter (`ExamElmProxyAdapter`) sends no key at all; the
  Function is the only place the secret exists.

## Free models only

- Enforcement is server-side: the proxy forwards ONLY model ids ending
  in `:free`. Anything else is rejected with 400. The UI filtering (model
  datalist, discovered lists, Add Model validation) is only the UX on top.
- Default model: `nvidia/nemotron-3-ultra-550b-a55b:free`.
  - Chosen because it was still listed as free in OpenRouter's public
    `/models` list on 2026-11-06 (re-checked live that day), AND it already
    produced a real reply through this app on 2026-11-05 ("Hi! How can I
    help you today?" via the free model on OpenRouter).
  - Free models verified live 2026-11-06 (public `/models` list, 454 total,
    12 free): recursive/flint-v1.0:free, xingchen-agi/xing4.0-29b-a4b:free,
    nvidia/nemotron-3.5-super-vl:free, dots-studio/dots-3-note-preview:free,
    liquid/lfm-2.5-2.6b:free, nvidia/nemotron-3.5-lightning:free,
    cohere/north-mini-code:free, nvidia/nemotron-3.5-content-safety:free,
    nvidia/nemotron-3-ultra-550b-a55b:free,
    nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free,
    google/gemma-4-26b-a4b-it:free, google/gemma-4-31b-it:free.
  - Free-model lists change over time. If the default ever disappears from
    OpenRouter's list, pick another verified `:free` id and record why here.
- Cost lines: ExamElm models end in `:free`, so the existing cost handling
  already shows "Free model · estimated cost $0".

## Rate limits (per IP)

- 10 requests/minute and 100/day per IP, enforced in the Function.
- 429 answers carry a friendly fair-use message and a `retry-after`.
- The limiter is IN-MEMORY (one counter map per isolate). That is
  approximate: a burst spread across isolates can exceed it, and a restart
  resets it. KV or Durable Objects would harden it later; the upstream
  provider's own limits are the backstop. This is stated honestly in the
  UI ("Free · fair-use limits apply") and here.
- Request limits: 1..50 messages, each 1..20,000 chars, 100,000 chars
  total per request; `maxTokens` clamped to 1..2048 (default 1024).

## Client wiring

- `assets/js/ai/providers.js`: `BUILTINS` leads with `examelm`
  (type `examelm-proxy`, `needsKey: false`). `ensureExamElmSeeded()` —
  called by both AI pages right after `load()` — creates the config
  (stable id `prv_examelm`) for every user, first in list order, default
  only when no other provider is the default yet. It is deliberately NOT
  in `load()`: `load()` must never force a save (existing test), and
  existing users' saved lastUsed choices are respected by the pages.
  ExamElm has no Remove button in Settings (it is re-seeded on next load);
  `add()` refuses a hand-added ExamElm; `setKey()` refuses a key for it.
- `assets/js/ai/adapters.js`: `ExamElmProxyAdapter` posts to same-origin
  `/api/chat` with `{ model, messages, maxTokens, stream }` and a
  `Content-Type` header only. 503 maps to `not-configured`, 429 to
  `rate-limited` with fair-use wording. No model-list endpoint: discovery
  falls back to the tiny completion check, which proves the proxy end to
  end instead of listing.
- `assets/js/ai/chatui.js`: `isFreeModelId`, `freeModelsOnly`,
  `filterModelsForProvider`; `modelSuggestions()` filters both halves to
  `:free` for ExamElm, so AI Chat and AI Tools agree.
- `assets/js/aichat.js` / `assets/js/aiworkflows.js`: both seed after
  load; both label ExamElm "(free)" in selectors; both gate the key
  requirement on `needsKey()` (send path and `resolveProvider()`); the
  AI Tools key badge reads "Free · no key needed". Provider switching
  reuses the existing RC-4 reset (`modelForProviderChange`): switching TO
  ExamElm sets the ExamElm default model; switching AWAY resets to that
  provider's default. Last-used provider/model memory covers ExamElm too.
- CSP: unchanged. `connect-src` already contains `'self'`, which covers
  the same-origin `/api/chat` proxy. No new third-party origin was added.
- Disclosures updated for honesty: the old "no server in between" wording
  now carries the ExamElm exception (AI Chat + AI Tools pages, privacy
  page, methodology ai-chat page). The BYOK direct-browser claim is still
  true for BYOK providers.

## Tests (zero real API calls)

- `website/tests/examelm-ai.test.js` (client/store/adapter): builtin
  first + no-key, seeding (fresh, with existing providers, persisted,
  idempotent), no-key rules, free-only add/edit/update, proxy adapter
  request shape (no Authorization header, ever), streamChat through the
  proxy, testConnection proving the proxy (keyVerified null, no "key
  verified" claim), 503 failure honesty, free-only suggestion filtering.
- `website/tests/examelm-proxy.test.js` (Function): validation, 503
  without a secret, 405 for GET, 400 for non-free models (never reaches
  upstream), Bearer forwarding from env only, maxTokens clamping, SSE
  passthrough, upstream 429/401/404 mapping without leaking internals,
  per-IP minute + daily caps.
- Full suite: `node website/tests/run.js` — 416 passed, 0 failed
  (20 files) as of 2026-11-06.

## What is still unverified (live)

- End-to-end ExamElm AI reply in a real browser: needs the
  `OPENROUTER_API_KEY` secret set in Cloudflare, then the owner presses
  Test connection (expect "Connected (model list unavailable) · model
  nvidia/nemotron-3-ultra-550b-a55b:free verified", with NO key bit) and
  sends a chat message via ExamElm AI. Do NOT claim it works live until
  that happens. A public list/status check proves reachability only.
- In-browser visual QA of the new provider rows, "(free)" labels, and
  the ExamElm hint (mobile 360px, dark mode).
