# ExamElm — AI Provider Integration Audit

**Date:** 2026-11-05
**Auditor:** read-only investigation (no code changed, no commits, no deploys)
**Scope:** the complete BYOK provider lifecycle in `website/` — provider add → key entry → config save → key storage → model selection → connection test → chat send → response display — on the AI Chat page (`ai-chat/`) and the AI Tools page (`ai-workflows/`).
**Method:** read the actual source files line by line (listed in §2); ran `curl` preflight/actual-request probes against all five provider origins from this environment (no keys used, no authenticated requests made); checked the live site's served CSP. No valid provider credentials exist in this environment, so **no authenticated provider request was ever made** — anything that can only be proven with a real key is marked UNVERIFIABLE-WITHOUT-A-KEY, not "verified".

**One-sentence verdict:** the core send path is correctly wired and contains no hardcoded provider/endpoint/model and no cross-provider key mix-up — but the integration fails in practice for a stack of smaller reasons, the largest being that **memory-only keys vanish on every page navigation/reload by design**, compounded by **a test-success message that is erased by an immediate re-render**, **a connection test that never validates the configured model**, and **a stale model surviving provider switches**. The documented "OpenAI: CORS blocked" claim is also **contradicted by live preflight probes** (see §8). The settings UI gap vs the requested redesign is real but is a UI problem, not a connectivity cause.

---

## 1. Files read

| File | What was traced |
|---|---|
| `website/assets/js/ai/adapters.js` | All three adapters (OpenAI-compatible, Anthropic, Gemini), request shapes, error mapping, model-list requests |
| `website/assets/js/ai/providers.js` | ProviderStore: configs, per-provider keys, encrypted storage, testConnection, discovery |
| `website/assets/js/ai/chat.js` | `streamChat`, `completeOnce`, SSE parser, retry/abort |
| `website/assets/js/ai/crypto.js` | PBKDF2/AES-GCM encrypted key storage |
| `website/assets/js/ai/costs.js` | Price table, `estimateCost` |
| `website/assets/js/ai/lastused.js` | Last-used provider+model persistence (localStorage, non-sensitive) |
| `website/assets/js/ai/chatui.js` | Suggestion chips, session search/grouping |
| `website/assets/js/aichat.js` | AI Chat page controller (settings slide-over, composer, conversations) |
| `website/assets/js/aiworkflows.js` | AI Tools page controller (provider bar, shared `runStream`) |
| `website/assets/js/ai/workflows.js` | Pure workflow library (payloads, prompts, parsers, scoring) |
| `website/ai-chat/index.html` | Redesigned app shell + settings slide-over + CSP |
| `website/ai-workflows/index.html` | Provider bar + CSP |
| `website/assets/js/storage.js` | IndexedDB kv store (where configs persist) |
| `website/tests/ai.test.js` | What the mocked tests actually cover |
| `website/KNOWN-ISSUES.md`, `website/TESTING.md` | Documented limitations vs reality |
| `files/architecture-review.md` | (checked; no AI-provider findings beyond CSP enforcement) |

---

## 2. Lifecycle trace

| Step | File:line | Verdict | Evidence |
|---|---|---|---|
| 1. Add provider | `providers.js:185` (`add`), `aichat.js:265` (add form) | **PASS** | Validates builtin, trims trailing slashes, requires `http(s)://`, persists via `save()` |
| 2. Enter API key | `aichat.js:204` (`keep-key`), input is `type="password"` | **PASS** | Password input; value cleared after save (`input.value = ""`) |
| 3. Config saved | `providers.js:save` (~line 150) via `publicConfig` | **PASS** | Persists only non-secret fields; `save()` throws if `apiKey`/`key` present |
| 4. Key stored | `providers.js:136` (`keys` Map), `:248` (`setKey`) | **PASS with caveat** | Per-provider-id in-memory Map; encrypted opt-in per-id blobs (`:284`). Caveat: memory only — see RC-1 |
| 5. Model selected | `aichat.js:384` (`renderChatSelectors`), `:425` (`syncModelDatalist`) | **FAIL** | Switching provider keeps the previous provider's model text (RC-4). Model is free text, never validated against the provider |
| 6. Connection verified | `providers.js:347` (`testConnection`) | **FAIL** | Only lists models; never validates the configured model (RC-3). Success message is wiped by re-render (RC-2). `/models`-less custom endpoints falsely fail (RC-5) |
| 7. Send chat message | `aichat.js:702` (`sendPrompt`) | **PASS** | Reads current provider/model at send time; missing key → toast + opens Settings |
| 8. Credentials retrieved | `providers.js:255` (`getKey`), `aichat.js:748` (`runCompletion`) | **PASS** | Key fetched by the selected provider's id at send time; no cross-provider reuse found |
| 9. Request constructed + sent | `adapters.js:97/199/312` (`requestInfo`), `chat.js:99` (`streamChat`) | **PASS with caveats** | Correct per-provider shapes; no hardcoded provider/endpoint/model in send path. Caveats: `stream_options` unconditional (RC-8), no non-streaming fallback (RC-7) |
| 10. Provider responds | `adapters.js` `parseSseEvent` per adapter, `chat.js` SSE parser | **PASS with caveat** | Parsers correct for the three native formats. Caveat: Gemini safety blocks → silent empty reply (RC-9) |
| 11. Response displayed | `aichat.js:515` (`renderMessages`) via `renderMarkdown` | **PASS** | Escape-first rendering; streaming tokens appended live |

---

## 3. Key isolation — PASS (with one design caveat)

- Keys live in `ProviderStore.keys`, a `Map` keyed by provider config id (`providers.js:136`). `setKey(id, key)` (`:248`) requires the config to exist; `forgetKey(id)` (`:269`) deletes only that id; `remove(id)` (`:233`) deletes the config **and** its memory key **and** its encrypted copy (`_removeEncryptedKey`). `persistEncrypted` (`:284`) stores one encrypted blob per provider id; `unlock` (`:297`) skips blobs whose config was deleted. No path was found where adding/updating/forgetting one provider's key touches another's.
- Persisted configs (`publicConfig`, `save()`) contain no key material, and `save()` throws if `apiKey`/`key` sneaks in. The only localStorage write is `lastused.js:35` — `{providerId, model}`, no keys. No key is ever written to localStorage/sessionStorage/plaintext, URL, or log (grep-verified; adapters send keys only in headers).
- **Caveat (design, not a bug):** the Map lives in the page's JS context. Any full page load — reload, new tab, navigating AI Chat → AI Tools — destroys it. Keys survive only inside one uninterrupted page session unless the user opted into encrypted storage. See RC-1.

## 4. Key retrieval at request time — PASS

- AI Chat: `sendPrompt` (`aichat.js:702`) reads `$("chatProvider").value`, then `state.providers.getKey(providerId)` — the key for exactly that provider id. `runCompletion` (`:746`) builds `{...config, apiKey: key}` (`:748`) and passes it to `streamChat`. No cached/stale credential is reused; `getKey` throws a friendly `AIError("invalid-key")` when missing.
- AI Tools: `resolveProvider` (`aiworkflows.js:243`) does the same per selected provider id; the shared `runStream` (`:280`) builds `withKey` at `:295` from the resolved provider. Both pages create their own `ProviderStore` instance and load the same persisted configs, so the config set is shared — but **keys are not shared across pages/tabs** (each page has its own in-memory Map). A key entered on AI Chat is absent on AI Tools until re-entered or unlocked from encrypted storage.
- No hardcoded provider, endpoint, or model exists anywhere in the send paths (grep-verified across `aichat.js`, `aiworkflows.js`, `chat.js`, `workflows.js`).

## 5. Endpoint normalization — PASS with edge cases

- All adapters strip trailing slashes (`adapters.js:89`, `:266`, `:390`-style `replace(/\/+$/, "")`) and append a fixed path: OpenAI-compatible `+ "/chat/completions"` (`:105`) / `+ "/models"` (`:164`); Anthropic `+ "/v1/messages"` (`:199`); Gemini `+ "/v1beta/models/<model>:<method>?alt=sse"` (`:312`).
- Correct when the base URL is the documented default (`https://api.openai.com/v1`, `https://api.anthropic.com`, `https://generativelanguage.googleapis.com`). **Failure modes, all unvalidated:**
  - Base URL missing the version path (`https://api.openai.com`) → `/chat/completions` 404s.
  - Base URL already containing the version path for Anthropic/Gemini (`https://api.anthropic.com/v1`) → `/v1/v1/messages` 404s.
  - Full endpoint pasted as base URL (`…/v1/chat/completions`) → path duplicated.
  - `add()`/`update()` (`providers.js:185`, `update`) only check the `http(s)://` scheme — no path validation, no warning.
- `stream_options: { include_usage: true }` is sent unconditionally to every OpenAI-compatible endpoint (`adapters.js:97`). Some gateways reject unknown fields with 400 — see RC-8.

## 6. Model handling — FAIL (two real gaps)

- **No per-provider multi-model management exists.** The persisted model state per provider is a single `defaultModel` string plus a `modelsCache` array (discovery results only). There is no user-managed list of models, no Add/Edit/Remove model actions. "Add Model" as requested does not exist anywhere.
- **Stale model across provider switch (real bug).** `syncModelDatalist` (`aichat.js:425`): `if (c && c.defaultModel && !$("chatModel").value) $("chatModel").value = c.defaultModel;` — the new provider's default is applied only when the model field is empty. If the user typed `gpt-4o-mini` under OpenAI and then switches to DeepSeek, `gpt-4o-mini` stays in the field and is sent to DeepSeek → HTTP 404 `model-not-found`. Identical pattern in AI Tools (`aiworkflows.js:221`). `saveLastUsed` then persists the mismatched pair. This directly violates "never allow a model belonging to one provider to be sent to another provider accidentally."
- The configured model is never validated against the provider's discovered list (the datalist is suggestions only; the input is free text). `testConnection` never checks the configured model either (see §7).
- `defaultModel` is never silently replaced by a hardcoded default in the live send path. The only hardcoded model string is `"default"` in the dead fallback branch of `testConnection` (`providers.js:380`-ish), unreachable for all current adapters.

## 7. Connection test — FAIL (three defects)

`testConnection` (`providers.js:347`):
1. `getKey(id)` first — missing key throws a friendly error. Good.
2. Calls `adapter.listModelsRequest` — **every** adapter returns one, so the "tiny completion" fallback (`:373`) is dead code for all built-ins and custom endpoints.
3. On success, caches up to 200 models (`:368`) and returns `{ok: true, models: N}`.

**Defects:**
- **(a) It never validates the configured model.** A provider can report "Connected" while its configured model is wrong, retired, or unavailable; the failure only appears later in chat as a 404. The UI's "Connected" therefore does not mean "ready to chat."
- **(b) The success message is erased.** In `aichat.js` `onProviderAction`, the `test` branch does `say("Connected · N models listed.")` at `:217` and then immediately calls `renderProviders()` at `:218`, which rebuilds the whole provider list and destroys the message node. Error messages survive (the `catch` at `:245` does not re-render); success messages do not. Same pattern in the `discover` branch (`:225`). A user who presses Test connection sees "Testing connection…" and then… nothing. This is the most direct match for "I tested and nothing happened."
- **(c) False failure for `/models`-less endpoints.** A custom gateway that serves `/chat/completions` but not `/models` returns 404 → `mapHttpError` 404 → `model-not-found` ("Check the model ID"), even though chat would work. The test conflates "model listing unsupported" with "model unavailable."
- **Statuses the UI can actually show:** badges "Key in memory" / "No key set" (persistent, `aichat.js:144`); "Direct browser access: yes / blocked / unverified" (static per builtin); transient test-result text: "Testing connection…", "Connected · N models listed.", "Connected.", "Discovering models…", "Found N models.", "Connected, but no model list returned · type the model ID manually.", plus error texts for `invalid-key` ("Invalid API key for X (HTTP 401)…"), `rate-limited`, `model-not-found`, `bad-request`, `cors-blocked` ("Could not reach X…"), `network`, `timeout`, `aborted`, `unknown`. **There is no persistent "verified/connected" state anywhere** — after the transient message is wiped, a provider looks identical whether it was ever tested. A saved key is never rendered as "connected" (correct per spec) — but neither is a genuinely verified provider.
- `modelsCache` never expires (`modelsCachedAt` is recorded at `providers.js:368` but never read for expiry).

## 8. CORS / CSP — findings (live probes, 2026-11-05)

**What curl can and cannot prove:** `curl -X OPTIONS` shows the CORS headers the server *declares* for a preflight. It cannot prove browser enforcement (preflight caching, credentials mode, or the browser's treatment of a specific response). All probes below used `Origin: https://apps-and-sites.pages.dev` (the live site) and the exact header sets the adapters send. Probes ran from this VM through its network path (proxy CONNECT visible); the ACAO values returned (origin-echo for DeepSeek/Gemini, `*` for the rest) are origin-server behavior, not proxy injection — but re-check in a real browser before treating these as final.

### Preflight (OPTIONS) results

| Provider | Endpoint probed | ACAO | Allow-Headers (for the requested set) | Allow-Methods | Verdict for chat POST |
|---|---|---|---|---|---|
| OpenAI | `/v1/chat/completions` | echoes origin | `authorization, content-type` | GET, OPTIONS, POST | **PASS** |
| OpenRouter | `/api/v1/chat/completions` | `*` | `Authorization, Content-Type, …` (broad) | GET, OPTIONS, PATCH, DELETE, POST, PUT | **PASS** |
| DeepSeek | `/v1/chat/completions` | echoes origin | `authorization, content-type` | POST | **PASS** |
| Anthropic | `/v1/messages` | `*` | `x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access, content-type` | DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT | **PASS** |
| Gemini | `/v1beta/models/…:streamGenerateContent` | echoes origin | `x-goog-api-key, content-type` | DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT | **PASS** |

GET `/models` preflights also pass everywhere. **The documented claim in `providers.js` that "OpenAI's API sends no CORS headers, so browsers refuse the call" is contradicted by these probes**: `api.openai.com` returned `Access-Control-Allow-Origin: *` on the GET preflight, echoed the origin with `authorization, content-type` allowed on the POST preflight, and returned `ACAO: *` on the actual unauthenticated 401 GET. The claim may have been true when written, or never verified — either way it is stale and must be re-verified in a real browser, not trusted. The UI currently steers users *away* from OpenAI on false premises.

### Actual (non-preflight) responses without a key

| Provider | GET `/models` | ACAO on that response |
|---|---|---|
| OpenAI | 401 Unauthorized | `*` — browser can read it → app maps to `invalid-key` correctly |
| DeepSeek | 401 Unauthorized | echoes origin — readable → `invalid-key` |
| OpenRouter | (not probed unauthenticated; preflight fully open) | — |
| Anthropic | 405 Method Not Allowed | **none** — browser surfaces it as a network TypeError → app mislabels it `cors-blocked` |
| Gemini | 404 Not Found | **none** — browser surfaces it as a network TypeError → app mislabels it `cors-blocked` |

The Anthropic/Gemini rows are unauthenticated edge cases (no key sent): with a valid key the real responses presumably carry ACAO, but **that is unverifiable without a key**. The error-mapping consequence is real either way: any provider response that lacks ACAO (including some error responses) becomes a generic `cors-blocked` message in the UI, hiding the true status.

### CSP

- `ai-chat/index.html:11` and `ai-workflows/index.html:10`: `connect-src 'self' https://api.openai.com https://openrouter.ai https://api.deepseek.com https://api.anthropic.com https://generativelanguage.googleapis.com`. Both pages that call providers have the full allowlist. No other page calls providers.
- **Custom endpoints are hard-blocked by CSP** (documented in the CSP comment and KNOWN-ISSUES.md:13): any user-configured domain outside the five built-ins is refused by the browser before any network activity. The `custom` builtin's own `corsNote` admits this. This is an architectural limitation, not a code bug — but it means the "Custom endpoint" option in the UI is effectively non-functional for any non-built-in domain, and its failure surfaces as the generic `cors-blocked` guidance. OmniRoute (named in the user's brief) has **no builtin entry at all** — it can only be added as a "Custom endpoint" with an OpenAI-compatible type, which then hits the CSP block unless its domain happens to be one of the five.
- `completeOnce` note: it is defined (`chat.js:197`) but **never called** by either page (grep-verified) — its AbortSignal-only timeout is latent, not live. All live traffic goes through `streamChat` (`chat.js:99`), which races fetch and stream reads against abort (fixed 2026-11-04).

## 9. Chat integration — PASS with two defects

- `sendPrompt` (`aichat.js:702`) reads the *current* provider/model at send time, validates key presence, saves last-used, creates/persists the conversation, and calls `runCompletion` (`:746`) with the resolved config/key/model. Provider/model switching does change subsequent requests (the values are re-read per send) — **except** for the stale-model bug in §6.
- Streaming: `streamChat` retries 429s (max 2, honoring `Retry-After`), races fetch + stream reads against abort, maps HTTP errors per adapter. **No non-streaming fallback exists**: if a provider ignores `stream: true` and returns a plain JSON body, the SSE parser yields no tokens and the UI shows "The provider returned an empty reply." `completeOnce` exists but is never wired as a fallback.
- Regenerate path defect: `onMessageAction`'s regen branch (`aichat.js:671`) calls `await runCompletion()` with no `try/catch`. If the key is gone by then (e.g. page reloaded, memory cleared), `getKey` throws inside `runCompletion` (`:748`) and the rejection is unhandled — no toast, no error shown, the assistant reply silently disappears.
- Error surfacing in chat: failures render inline as "Couldn't complete: <message>" and the failed attempt is kept out of history (deliberate). A `TypeError` (offline, DNS, CORS, or an ACAO-less error response) is always mapped to `cors-blocked` with CORS guidance (`adapters.js:46`, `chat.js` catch) — correct for CORS, **misleading for plain network failures**.
- Gemini safety blocks: `parseJsonResponse`/`parseSseEvent` extract `candidates[0].content.parts` text only; a `promptFeedback` block (safety refusal) yields empty text with no explanation. Silent empty reply.

## 10. Workflows integration — PASS (same store, same bugs, two extras)

- AI Tools uses the same `ProviderStore` class and the same `streamChat` engine (`aiworkflows.js:18-20`, `:280-295`). `resolveProvider` (`:243`) validates provider + key + model before any transmission; `runStream` (`:280`) is the single shared send path for all five workflow tabs. No separate credential path, no separate key store — the §3/§4 findings apply identically.
- **Extras specific to workflows:**
  1. Same stale-model bug as §6 (`aiworkflows.js:221` — provider switch keeps the previous model text).
  2. The provider bar's "Manage providers & keys →" link points to `/ai-chat/#providers` (`ai-workflows/index.html:111`), but the AI Chat page has **no `#providers` handling and no Providers tab anymore** (removed in the 2026-11-05 redesign) — the link lands on the page without opening Settings. Dead anchor.
  3. Token caps differ between pages: workflows clamp `maxTokens` to 100–8000 (`runStream` clamp), AI Chat allows 1–128000 (`aichat.js` send). Inconsistent, not a connectivity bug.
  4. Keys are per-page memory: a key entered on AI Chat is not available on AI Tools after navigation (see RC-1).

## 11. Settings UI — current state vs requested redesign (gap documentation only)

Current settings slide-over (`ai-chat/index.html:85-` and `aichat.js:144`):
- **Order is inverted vs the request:** "Chat model" (provider select, model input, max tokens) appears FIRST (`:85`), "Providers" second (`:101`). The request requires Providers first, Chat Model below.
- **No collapsible rows:** every configured provider renders as a full card with key input + 7 buttons (Keep key / Forget key / Test connection / Discover models / Set default / Edit / Remove) — all always visible. No expand/collapse, no compact name-and-icon row.
- **No (+) menu:** the "Add a provider" form is always visible (not hidden behind a + button); there is no "Add Model" action at all.
- **No per-provider model management:** only a single `defaultModel` text field (in the Edit form) plus the discovery cache shown as "N models discovered". No list of configured models per provider, no add/edit/remove model.
- **Status display:** per-provider badges are only "Key in memory" / "No key set" (+ "default", + CORS note). No "verified/connected/failed" state exists in the UI.
- **What it does have:** provider list, add form (builtin select, base URL, default model), encrypted storage panel, full five-point disclosures, model picker + max tokens (in the Chat Model section), search/grouped sessions in the sidebar.

---

## 12. Ranked root causes of "does not connect"

### A. REAL CODE BUGS (fixable in code, no provider cooperation needed)

**RC-1 — Memory-only keys vanish on every navigation/reload (highest-impact, by design).**
*Files:* `providers.js:136` (in-memory Map), `aichat.js:204`, `aiworkflows.js:243`.
*Mechanism:* keys live only in the page's JS context. Reload, new tab, or navigating AI Chat ↔ AI Tools destroys them. The encrypted-storage opt-in is the only persistence, and it is buried in Settings, requires a passphrase, and is never offered at the moment a key is entered. The user experience is: "I entered my key, it worked once (or never), then the app says no key is set." The UI does say "kept in memory only" — but nothing in the flow warns that navigating away loses the key, and the "No key set" badge is the only signal.
*Fix:* (1) On first key entry, offer the encrypted-storage opt-in inline (one click, passphrase prompt) instead of hiding it in Settings. (2) When a send fails for a missing key after a provider was previously used, say so explicitly ("Your key was in memory only and was lost when the page reloaded — re-enter it, or enable encrypted storage"). (3) Do NOT silently persist plaintext keys — the memory-only default must stay.

**RC-2 — Test-connection success message is erased by an immediate re-render.**
*Files:* `aichat.js:217-218` (test branch), `:225` (discover branch).
*Mechanism:* `say("Connected · N models listed.")` is followed immediately by `renderProviders()`, which rebuilds the provider list's `innerHTML` and destroys the message node. Errors survive (the `catch` at `:245` doesn't re-render); successes don't. The user presses Test connection, sees "Testing connection…", then nothing — a reasonable reading is "it didn't connect."
*Fix:* render first, then write the result into the fresh node (or store the last test result per provider id in state and render it as part of the card). Also persist a `lastVerifiedAt` / `lastTestStatus` on the config so a verified provider stays visibly verified.

**RC-3 — Connection test never validates the configured model.**
*Files:* `providers.js:347-369`.
*Mechanism:* `testConnection` only calls the list-models endpoint. A provider with a valid key but a wrong/retired/unavailable configured model reports "Connected"; chat then fails with 404 `model-not-found`. "Connected" does not mean "ready to chat."
*Fix:* after a successful list, check whether `config.defaultModel` (and/or the currently selected model) appears in the returned list; report "Connected · model X verified" or "Connected, but model X was not in the provider's list". For adapters without listing, keep the tiny-completion fallback (currently dead code — wire it as the fallback when `listModelsRequest` returns null or 404s).

**RC-4 — Stale model survives provider switches (model sent to the wrong provider).**
*Files:* `aichat.js:425`, `aiworkflows.js:221`.
*Mechanism:* on provider change, the new provider's `defaultModel` is applied only if the model field is empty. Otherwise the previous provider's model text stays and is sent to the new provider → 404. `saveLastUsed` then persists the mismatched pair.
*Fix:* on provider change, always reset the model field to the new provider's `defaultModel` (or its first discovered model), or clear it and force an explicit pick. Never carry a model across providers.

**RC-5 — Connection test falsely fails for `/models`-less custom endpoints.**
*Files:* `providers.js:355-369`, `adapters.js:163-164`.
*Mechanism:* `testConnection` treats any non-OK list response as failure. A gateway that serves `/chat/completions` but not `/models` returns 404 → `model-not-found` ("Check the model ID") even though chat would work.
*Fix:* on a 404 from the list endpoint, fall back to the tiny-completion verification instead of failing; label the outcome "Connected (model list unavailable)".

**RC-6 — Regenerate with a missing key fails silently (unhandled rejection).**
*Files:* `aichat.js:671` (regen branch), `:748` (`getKey` inside `runCompletion`).
*Mechanism:* the regen branch awaits `runCompletion()` with no `try/catch`; a missing key throws and nothing is shown to the user.
*Fix:* wrap the regen call in `try/catch` and surface `friendly(err)` via toast + inline message, as `sendPrompt` already does.

### B. PROVIDER-SIDE BLOCKS / ARCHITECTURAL LIMITS (not code bugs)

**RC-7 — Custom endpoints hard-blocked by the static CSP.**
*Files:* `ai-chat/index.html:11`, `ai-workflows/index.html:10` (`connect-src` allowlist of the 5 built-in origins only).
*Mechanism:* any user-configured domain outside the five built-ins is refused by the browser before any network activity. The fetch fails as a `TypeError` → generic `cors-blocked` guidance. The "Custom endpoint" option is effectively non-functional for arbitrary domains, and OmniRoute has no builtin entry at all — it can only be added as Custom, which then hits this block. Documented in KNOWN-ISSUES.md:13; the fix is architectural (documented gateway-subdomain pattern, a same-origin relay, or a per-user CSP mechanism), not a code tweak.

**RC-8 — `stream_options.include_usage` sent unconditionally to all OpenAI-compatible endpoints.**
*Files:* `adapters.js:97`.
*Mechanism:* some gateways reject unknown request fields with 400 `bad-request`. OpenAI/OpenRouter document support; generic custom endpoints are unverified.
*Fix:* send `stream_options` only for known-compatible builtins, or drop it on a 400 and retry without it.

**RC-9 — No non-streaming fallback.**
*Files:* `chat.js:99` (`streamChat`), `chat.js:197` (`completeOnce` — defined, never called).
*Mechanism:* if an endpoint ignores `stream: true` and returns plain JSON, the SSE parser yields nothing → "The provider returned an empty reply." `completeOnce` exists but is not wired as a fallback.
*Fix:* if streaming yields zero tokens and the response `Content-Type` is JSON, retry once via `completeOnce`; also wire `completeOnce` to the same abort-race pattern as `streamChat` first (KNOWN-ISSUES.md:28).

**RC-10 — Documented "OpenAI: CORS blocked" is contradicted by live probes (docs bug with UX consequences).**
*Files:* `providers.js` BUILTINS `openai.corsNote` ("blocked").
*Evidence:* §8 probes — OpenAI preflight and actual 401 both carry ACAO. The app steers users away from the most common provider on a stale premise, while the code itself would attempt the request. Re-verify in a real browser; if confirmed, change the label to "supported" and remove the steering note.

### C. UNVERIFIABLE WITHOUT A REAL KEY (cannot be proven or fixed by the auditor)

- Whether any specific provider + key + model combination actually returns a chat completion end-to-end (streaming tokens, usage, finish reason). Mocked tests prove wiring only.
- Whether Anthropic/Gemini error responses (401/400) carry ACAO — the unauthenticated probes returned 405/404 without ACAO, so **bad-key errors on those two providers may surface as generic `cors-blocked` instead of `invalid-key`** in a real browser. Needs a real (even invalid) key to test.
- Whether `stream_options` is accepted by DeepSeek/custom gateways; whether reasoning models (o-series) accept `max_tokens` + system role; whether Gemini safety blocks are the cause of any particular empty reply.
- Whether the DeepSeek/Gemini CORS verdicts hold for authenticated POSTs (preflights pass; actual authenticated responses unprobed).

---

## 13. Exact fixes required (in priority order)

1. **RC-1:** inline encrypted-storage offer at key entry; explicit "key lost on reload" messaging on missing-key send failures.
2. **RC-2:** persist test results per provider; render the result after re-render (store `lastTest: {ok, models, at}` on state/config and display it in the card).
3. **RC-4:** reset model on provider change (both pages).
4. **RC-3:** validate the configured model in `testConnection`; report model-verified vs model-missing distinctly.
5. **RC-5:** fall back to tiny-completion when the list endpoint 404s.
6. **RC-6:** `try/catch` around Regenerate.
7. **RC-10:** re-verify OpenAI CORS in a real browser; correct the `corsNote` and `cors` flag if confirmed.
8. **RC-7:** decide the custom-endpoint architecture (documented relay/gateway-subdomain pattern) — do not pretend the Custom option works for arbitrary domains.
9. **RC-9:** wire `completeOnce` as a streaming fallback (after fixing its abort handling).
10. **RC-8:** gate `stream_options` to known-compatible endpoints (or retry-without on 400).
11. **Settings UI redesign** (separate workstream): Providers first / Chat Model below; collapsible provider rows; + menu (Add Provider / Add Model); per-provider multi-model management; persistent verified status. None of this fixes connectivity by itself — do it after RC-1–RC-6.

## 14. Live verification plan (for the user — with their own key, never shared in chat)

No valid credentials exist in this environment, so the auditor could not run a real provider request. The user can verify with their own key, in the live app, in ~10 minutes:

1. **OpenAI or OpenRouter (expected to work):** open https://apps-and-sites.pages.dev/ai-chat/ → Settings → Add provider → pick the provider, paste your key, press **Keep key in memory**, press **Test connection**. Expected: "Connected · N models listed." (If the success message disappears, that is RC-2 — report it.) Then type a message and Send. Expected: a streaming reply. **Do not paste your key anywhere in chat, and do not share screenshots showing the key field.**
2. **DeepSeek / Gemini (expected to work per probes, unverified live):** same steps. If Test connection reports a CORS error, capture the browser console's exact error (DevTools → Console) — that distinguishes a CORS block from an invalid key.
3. **Anthropic:** same steps. Note the `anthropic-dangerous-direct-browser-access` header is sent automatically.
4. **Invalid-key check:** deliberately test with a wrong key first (any provider) — you should see "Invalid API key (HTTP 401)", NOT a CORS message. If you see the CORS message instead, that is the ACAO-less error response issue (§8).
5. **Key-persistence check:** after a successful chat, reload the page and send another message. Expected (current design): "No API key is set" — the key is memory-only by design. If that surprises you, that is RC-1, and the fix is the encrypted-storage opt-in.
6. **Provider-switch check:** chat with provider A, switch to provider B in Settings, send again. If you get "Model not found", that is RC-4 — the old model was carried over.
7. **What to report back:** provider name, which step failed (Test connection vs Send), and the exact message shown. Screenshots of the *message text* (never the key) are enough.

## 15. What is already correct (needs no change)

- **Key isolation and storage:** per-provider-id memory keys; encrypted opt-in with PBKDF2 210k + AES-GCM; wrong-passphrase/tamper fails closed; `remove()` purges memory + encrypted copies; persisted configs contain zero key material (asserted in `save()` and covered by tests). No key ever touches localStorage, URLs, or logs.
- **Key retrieval:** the selected provider's key — and only that key — is fetched at send time on both pages; no stale/cached/wrong-provider key path exists.
- **Adapter request shapes:** OpenAI-compatible (`/chat/completions`, Bearer), Anthropic (`/v1/messages`, `x-api-key` + version + browser-access header, system extraction), Gemini (`/v1beta/models/<model>:streamGenerateContent?alt=sse`, `x-goog-api-key` header, never in URL) are all correctly formed per the providers' documented APIs.
- **Streaming engine:** abort-race on fetch and stream reads (no hung cancel), 429 retry honoring `Retry-After`, SSE reassembly across split chunks, per-adapter error mapping (401/429/404/400 + Gemini `API_KEY_INVALID`).
- **Error mapping:** HTTP statuses map to distinct, plain-language codes; keys never appear in error text.
- **Cost estimates:** pre-send, worst-case, `known:false` for unknown models (never invents a price).
- **Workflows:** same store and send path as AI Chat; explicit "what will be sent" preview; no auto-transmission; output rendered escape-first.
- **CSP:** both provider-calling pages carry the identical 5-origin `connect-src` allowlist; no page that needs a provider origin lacks it.
- **Tests:** 39 AI tests (mocked fetch) cover adapters, SSE, error mapping, crypto, key isolation, persistence hygiene, testConnection shapes, streamChat accumulation/retry/abort. They prove wiring, not live connectivity — the report says so plainly and the codebase's own TESTING.md already records real-provider streaming as unverified.
