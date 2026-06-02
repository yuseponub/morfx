# Phase 38: Embedded Signup + WhatsApp Inbound - Research

**Researched:** 2026-06-02
**Domain:** Meta WhatsApp Cloud API direct integration (inbound webhook + Embedded Signup v4 onboarding) on Next.js 15 App Router / Vercel
**Confidence:** HIGH for webhook/HMAC/reuse path (corroborated against shipped codebase + official docs); MEDIUM for Embedded Signup v4 frontend/exchange details (Meta changes config_id/feature config frequently — version-sensitive claims flagged)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Sequence = minimal path FIRST (webhook inbound + manual connection of 1 test number to validate HMAC/receipt/inbox), THEN Embedded Signup multi-tenant. Both within Phase 38. The webhook is shared by both paths (not throwaway); the only throwaway part is the manual token insert (a trivial SQL row).
- **D-02:** Test-number credential = **System User permanent token** (manually generated in Business Settings for own-portfolio numbers), stored encrypted in `workspace_meta_accounts`. Does NOT expire. The real multi-tenant production token is the **BISUAT** delivered by Embedded Signup (deliverable 2), one per workspace/client.
- **D-03:** Multi-tenant model unchanged: `workspace_meta_accounts` stores **one row per (workspace, channel)** with its own encrypted token. Deliverable 1 vs 2 differ only in HOW the token enters that row (manual insert vs Embedded Signup popup) — both end in the same per-workspace table.
- **D-04:** Routing via per-workspace **`whatsapp_provider` flag**: default `'360dialog'` TODAY (Somnio + all current clients unchanged), opt-in `'meta_direct'` activated manually by SQL per workspace.
- **D-05:** Gradual migration: flip workspace by workspace to `'meta_direct'`. When all migrated → change default to `'meta_direct'`, leave 360dialog as fallback/legacy.
- **D-06:** REJECTED the "row-presence in `workspace_meta_accounts`" routing approach — connecting a number would auto-flip traffic. The explicit flag gives control to connect/test WITHOUT activating traffic.
- **D-07:** Test number connects in a **dedicated/separate test workspace** (never Somnio nor a real client). Total isolation.
- **D-08:** Meta direct IS faster than 360dialog — direct `graph.facebook.com` calls without the relay. Latency benefit of the migration.
- **D-09:** `/api/webhooks/meta` **reuses `processWebhook`** (`src/lib/whatsapp/webhook-handler.ts`), identical to 360dialog. The new endpoint changes ONLY: (a) HMAC-SHA256 verify with `META_APP_SECRET` over the **raw body** (`req.text()`, NOT re-serialized JSON — failure cause #1), (b) workspace resolution via `resolveByPhoneNumberId` (Phase 37, `src/lib/meta/credentials.ts`) instead of `workspaces.settings`, (c) `META_WEBHOOK_VERIFY_TOKEN` for the GET handshake. NO new dedicated handler.
- **D-10:** Dedup by `wamid` is **free** via reusing `processWebhook`: `messages.wamid TEXT UNIQUE` (`messages_wamid_unique`) already discards duplicates. Meta retries (up to 7x) deduplicated with zero new code. NO new dedup table.
- **D-11:** First receive test with **your other real WhatsApp** (not Meta's test number). Operational req: register that number to the WABA (SMS/call verify) and it must NOT be active in 360dialog (one number = one WABA at a time).
- **D-12:** Switch app to **Live mode BEFORE** the inbound test. Meta doesn't send all webhooks in Development mode. Live is at YOUR app level (`1457229738955828`), does NOT affect 360dialog/ManyChat (separate Meta apps).
- **D-13:** Success criteria: (1) GET handshake returns `hub.challenge`, (2) HMAC validates over raw body, (3) incoming message visible in inbox identical to 360dialog, (4) dedup confirmed (Meta retry creates no duplicate row), (5) Somnio 100% operational on 360dialog unchanged (Regla 6).
- **D-14:** "Human Agent" permission (not approved) does NOT block WhatsApp messaging. Only extends the response window to 7 days and is a Messenger feature. With `whatsapp_business_messaging` approved, receive/respond in 24h window/templates works. Do NOT re-request for WhatsApp.

### Claude's Discretion
- Exact storage mechanism for `whatsapp_provider` flag (column on `workspaces` vs dedicated table vs `settings` JSONB) — research/planning decision, respecting current default `'360dialog'`.
- Form of the manual test-token insert (direct SQL vs mini admin action) — must be trivial (D-01).
- Webhook error-handling details (revoked/expired token, malformed payload) and Meta-flow observability/logging — follow existing 360dialog webhook patterns.

### Deferred Ideas (OUT OF SCOPE)
- WhatsApp outbound/send via Meta direct — Phase 39 (WA-01..09, MIG-01/MIG-03). EXCEPTION: planning may evaluate a MINIMAL send (one text via existing `sendWhatsAppText`) as a round-trip validation step for D-11, without assuming Phase 39 scope.
- FB Messenger direct — Phase 40. Instagram Direct — Phase 41.
- Template CRUD / media CDN / read receipts — Phase 39.
- Business Verification blocks B/C/D — manual user steps outside code (Phase 37.5).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIGNUP-01 | "Conectar WhatsApp" button opens Meta Embedded Signup v4 popup → client authorizes, MorfX receives tokens automatically | Architecture Pattern 4 (FB JS SDK `FB.login` + config_id + message listener). Frontend SDK load + popup launch + capture of `code` (callback) and `waba_id`/`phone_number_id` (message event). |
| SIGNUP-02 | Token exchange (code → BISUAT) and encrypted per-workspace storage | Architecture Pattern 5 (`GET /v22.0/oauth/access_token?client_id&client_secret&code`). Reuse `encryptToken` + insert into `workspace_meta_accounts`. |
| SIGNUP-03 | Auto-subscription to webhooks after successful signup | Architecture Pattern 6 (`POST /{waba-id}/subscribed_apps` with BISUAT) + `POST /{phone-number-id}/register`. |
| WA-05 | Receive WhatsApp webhooks (messages + status updates) via unified endpoint | Architecture Pattern 1-3. Reuse `processWebhook`; payload format identical to 360dialog. |
| HOOK-01 | Unified `/api/webhooks/meta` endpoint routing to correct workspace | Pattern 2 (GET handshake + POST events) + `resolveByPhoneNumberId`. (Phase 38 = WhatsApp only; FB/IG branches added Phases 40/41.) |
| HOOK-02 | HMAC-SHA256 signature verification with App Secret | Pattern 3 (raw-body HMAC). Reuse `verifyWhatsAppHmac` pattern with `META_APP_SECRET`. |
| HOOK-03 | 200 response in <5s | Existing route is synchronous `processWebhook` with `maxDuration=60`; mirror it. See Pitfall 7 + Open Question 1. |
| HOOK-04 | Dedup by message_id (Meta retries up to 7x) | `messages.wamid UNIQUE` (D-10). Free via `processWebhook`. |
</phase_requirements>

## Summary

This phase is **lighter than it looks** because Phase 37 + the existing 360dialog pipeline already solved most of it. The single most important verified fact: **360dialog already relays the raw Meta Cloud API payload format** (`object: 'whatsapp_business_account'`, `entry[].changes[].value.metadata.phone_number_id`, `value.messages[].id` as `wamid`). The existing `processWebhook` consumes exactly this shape. Therefore `/api/webhooks/meta` is a **near-clone of `src/app/api/webhooks/whatsapp/route.ts`** changing only three things (D-09): HMAC secret/source, workspace resolution, and verify-token env var.

The genuinely uncertain/error-prone work is concentrated in **deliverable 2 (Embedded Signup v4)**: the `FB.login` config-driven popup, the dual return path (authorization `code` via the JS callback + `waba_id`/`phone_number_id` via a `window.postMessage` `WA_EMBEDDED_SIGNUP` event), the server-side `code → BISUAT` exchange (`GET /v22.0/oauth/access_token`), and the auto-subscribe (`POST /{waba-id}/subscribed_apps`). These are verified against official Meta API references and multiple BSP implementation guides, but config_id/feature-flag specifics shift between Embedded Signup versions — flagged MEDIUM.

The #1 operational gate for the inbound test (D-12): the Meta app **must be in Live mode**; Meta withholds webhooks for non-role users in Development mode. This is verified.

**Primary recommendation:** Build deliverable 1 by literally copying `src/app/api/webhooks/whatsapp/route.ts` to `src/app/api/webhooks/meta/route.ts`, swapping the three D-09 items and the workspace resolver to `resolveByPhoneNumberId`. Store `whatsapp_provider` as a **column on `workspace_meta_accounts`** is WRONG (that table only exists for connected accounts) — instead add it to **`workspaces.settings` JSONB** (default-safe: absent = `'360dialog'`) OR a dedicated column on `workspaces`. Reuse `processWebhook` untouched. For deliverable 2, use the official Facebook JS SDK `FB.login` with `config_id`, capture both return channels, exchange server-side, and auto-subscribe.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GET webhook handshake (`hub.challenge`) | API / Route Handler | — | Stateless verification; no DB. Reads `META_WEBHOOK_VERIFY_TOKEN` env. |
| POST webhook HMAC verify | API / Route Handler | — | Must run on **Node.js runtime** (crypto + raw body); not Edge. Secret = `META_APP_SECRET`. |
| Workspace resolution from `phone_number_id` | API → `src/lib/meta/credentials.ts` | Database (`workspace_meta_accounts`) | Already built (Phase 37). Reuse `resolveByPhoneNumberId`. |
| Message ingest + agent dispatch + dedup | `src/lib/whatsapp/webhook-handler.ts` (`processWebhook`) | Domain (`src/lib/domain/*`), Database | Reuse verbatim. Dedup via `messages.wamid UNIQUE`. |
| "Connect WhatsApp" popup (FB.login) | Browser / Client (React 19) | Meta JS SDK (external) | Embedded Signup runs in the user's browser; SDK injected client-side. |
| `code → BISUAT` token exchange | API / Server Action | Meta Graph API (external) | **Must be server-side** — `META_APP_SECRET` never touches the browser. |
| Token encrypt + persist | Server Action → `src/lib/meta/token.ts` → Domain | Database (`workspace_meta_accounts`) | Reuse `encryptToken`. Mutation via domain (Regla 3). |
| Auto-subscribe WABA to app | API / Server Action | Meta Graph API (external) | `POST /{waba-id}/subscribed_apps` with the new BISUAT. |
| `whatsapp_provider` routing flag | Database (`workspaces`) | read at send/route point | Default-safe storage; absent = `'360dialog'`. Read by Phase 39 sender + (now) optionally gated at webhook to avoid double-processing during migration. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js Route Handlers | 15 (App Router) | `GET`/`POST` at `src/app/api/webhooks/meta/route.ts` | Already the project's webhook pattern (360dialog route). `[VERIFIED: codebase]` |
| Node.js `crypto` (`createHmac`, `timingSafeEqual`) | built-in | HMAC-SHA256 over raw body, timing-safe compare | Already used in `verifyWhatsAppHmac`. `[VERIFIED: codebase src/app/api/webhooks/whatsapp/route.ts:24]` |
| Facebook JS SDK (`connect.facebook.net/en_US/sdk.js`) | current (FB.init `v22.0`) | Embedded Signup `FB.login` popup | Official + only supported way to launch Embedded Signup. `[CITED: developers.facebook.com Embedded Signup implementation]` |
| Meta Graph API | **v22.0** (pinned in `META_GRAPH_API_VERSION`) | `oauth/access_token`, `subscribed_apps`, `register` | Project-pinned. `[VERIFIED: codebase src/lib/meta/constants.ts]` |
| Supabase (admin client) | existing | `workspace_meta_accounts` row read/write | Phase 37 foundation. `[VERIFIED: codebase]` |

### Supporting (REUSE — do not rebuild)
| Asset | File | Purpose | Action |
|-------|------|---------|--------|
| `resolveByPhoneNumberId(phoneNumberId)` | `src/lib/meta/credentials.ts:47` | Inbound workspace resolution | **Reuse as-is** (D-09). Filters `is_active=true`. |
| `encryptToken` / `decryptToken` | `src/lib/meta/token.ts` | AES-256-GCM packed format | **Reuse** for storing System User token + BISUAT. |
| `metaRequest` | `src/lib/meta/api.ts:24` | Typed Graph fetch (Bearer auth, error parsing) | **Reuse** for `subscribed_apps` + `register`. NOTE: `oauth/access_token` needs an **unauthenticated** call (no Bearer) — see Pitfall 6. |
| `verifyToken(accessToken, wabaId)` | `src/lib/meta/api.ts:118` | BISUAT health check | **Reuse** to validate token after exchange. |
| `processWebhook(payload, workspaceId, phoneNumberId)` | `src/lib/whatsapp/webhook-handler.ts:56` | Full inbound pipeline (inbox + agents + dedup) | **Reuse verbatim** (D-09). |
| `verifyWhatsAppHmac(body, signature, secret)` | `src/app/api/webhooks/whatsapp/route.ts:24` | Raw-body HMAC, timing-safe, `sha256=` prefix-tolerant | **Copy** into the new route (or extract to shared util). |
| `messages.wamid UNIQUE` | migration `20260130000002` | DB-level dedup | **Already there** (D-10). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `workspaces.settings` JSONB for `whatsapp_provider` | New column `workspaces.whatsapp_provider TEXT DEFAULT '360dialog'` | Column is more queryable + enforces default at DB level; JSONB avoids a migration but absent-key handling must default to `'360dialog'` in code. **Recommendation: dedicated column** (DB-enforced default = safest for Regla 6). See Architecture Patterns §7. |
| Synchronous `processWebhook` (current pattern) | `inngest.send` without await + DB safety net (HOOK-03 suggested) | The CURRENT 360dialog route is synchronous and works within `maxDuration=60`. Mirror it for parity (D-09). Async is a Phase-39+ optimization, NOT required here. See Open Question 1. |
| Manual SDK injection | Meta's hosted Embedded Signup iframe | The JS SDK `FB.login` is the documented v4 path; an iframe-only flow is not standard for self-hosted onboarding. |

**Installation:** No new npm packages. Facebook JS SDK is loaded via `<script>` injection in the client component (not an npm dep). All crypto is Node built-in.

**Version verification:**
- `META_GRAPH_API_VERSION = 'v22.0'` is pinned in code `[VERIFIED: codebase src/lib/meta/constants.ts:7]`. v22.0 is current/enforced. Graph API has since shipped v23/v24/v25 (subscribed_apps reference page shows v25.0) but v22.0 remains valid and is the project lock — **do not bump in this phase** unless an endpoint 400s on version.
- The Facebook JS SDK `FB.init({ version: 'v22.0' })` should match the pinned constant.

## Architecture Patterns

### System Architecture Diagram

```
DELIVERABLE 1 — INBOUND (the de-risk path, build first)
======================================================

  WhatsApp user ──msg──► Meta Cloud API
                              │
                              │ (app in LIVE mode; webhook subscribed)
                              ▼
                    POST /api/webhooks/meta   ◄── GET handshake (hub.challenge) on setup
                    src/app/api/webhooks/meta/route.ts
                              │
              ┌───────────────┴────────────────┐
              │ 1. rawBody = await req.text()   │  ← RAW body (Pitfall 1)
              │ 2. verify X-Hub-Signature-256   │  ← HMAC-SHA256(rawBody, META_APP_SECRET)
              │    timing-safe (Pitfall 2)      │
              │ 3. JSON.parse(rawBody)          │
              │ 4. phone_number_id from payload │
              └───────────────┬────────────────┘
                              ▼
              resolveByPhoneNumberId(phoneNumberId)   ── src/lib/meta/credentials.ts (Phase 37)
                              │  (→ workspaceId; is_active=true)
                              ▼
              processWebhook(payload, workspaceId, phoneNumberId)  ── REUSE verbatim
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                       ▼
   inbox (messages)    dedup via wamid UNIQUE    agent dispatch (v3/v4)
                        (Meta retry 7x → no dup)
                              │
                              ▼
                    return 200 { received: true }  (< 5s, maxDuration=60)


DELIVERABLE 2 — EMBEDDED SIGNUP v4 (multi-tenant onboarding)
===========================================================

  Admin clicks "Conectar WhatsApp" (React client component)
                              │
                              ▼
            FB.login({ config_id, response_type:'code',
                       override_default_response_type:true,
                       extras:{ featureType, sessionInfoVersion:'3' } })
                              │
          ┌───────────────────┴────────────────────┐
          ▼                                          ▼
   FB.login CALLBACK                       window 'message' listener
   response.authResponse.code              data.type === 'WA_EMBEDDED_SIGNUP'
   = short-lived AUTH CODE                 → { waba_id, phone_number_id }
   (single-use, ~10 min)                   (event:'FINISH' on success)
          │                                          │
          └──────────────────┬───────────────────────┘
                             ▼
            POST to MorfX server action / route (code + waba_id + phone_number_id)
                             │  ← META_APP_SECRET stays server-side ONLY
                             ▼
   GET https://graph.facebook.com/v22.0/oauth/access_token
        ?client_id=META_APP_ID&client_secret=META_APP_SECRET&code=CODE
                             │  → { access_token: BISUAT, token_type }
                             ▼
   encryptToken(BISUAT) ──► INSERT workspace_meta_accounts (workspace, channel='whatsapp',
                            waba_id, phone_number_id, access_token_encrypted, is_active)
                             │
                             ▼
   POST /v22.0/{waba_id}/subscribed_apps   (Bearer = BISUAT)  → { success: true }
                             │
                             ▼  (optional, if number not yet registered)
   POST /v22.0/{phone_number_id}/register  { messaging_product:'whatsapp', pin:'<6-digit>' }
                             │
                             ▼
   workspace_meta_accounts row ready. whatsapp_provider STILL '360dialog' until
   manual SQL flip (D-04/D-06 — connecting ≠ activating traffic).
```

### Recommended File Structure
```
src/app/api/webhooks/meta/route.ts          # NEW: GET handshake + POST events (clone of whatsapp route)
src/app/actions/meta-onboarding.ts          # NEW: server action — code→BISUAT exchange + persist + subscribe
src/lib/meta/embedded-signup.ts             # NEW: code exchange + subscribed_apps + register helpers (server-only)
src/components/settings/connect-whatsapp.tsx# NEW: client component — FB SDK load + FB.login + message listener
src/lib/meta/credentials.ts                 # REUSE (resolveByPhoneNumberId)
src/lib/meta/token.ts                        # REUSE (encryptToken)
src/lib/meta/api.ts                          # REUSE (metaRequest) + add unauthenticated exchange OR new helper
src/lib/whatsapp/webhook-handler.ts          # REUSE verbatim (processWebhook)
supabase/migrations/...add_whatsapp_provider # NEW: workspaces.whatsapp_provider column (Regla 5: apply first)
```

### Pattern 1: Reuse 360dialog inbound verbatim (D-09)
**What:** The new Meta route is a 3-change clone of the existing 360dialog route.
**When to use:** Always — this is the locked decision.
**Example (the diff, not a rewrite):**
```typescript
// src/app/api/webhooks/meta/route.ts  — clone of whatsapp/route.ts with 3 changes
import { resolveByPhoneNumberId } from '@/lib/meta/credentials'  // CHANGE (b)
import { processWebhook } from '@/lib/whatsapp/webhook-handler'   // SAME — reuse

export const maxDuration = 60
export const runtime = 'nodejs'  // explicit: crypto + raw body need Node runtime (Pitfall 3)

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')
  // CHANGE (c): Meta verify token env var
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()                 // RAW body (Pitfall 1)
  const signature = request.headers.get('X-Hub-Signature-256') || ''
  // CHANGE (a): META_APP_SECRET, and signature is ALWAYS required for Meta direct
  if (!verifyMetaHmac(rawBody, signature, process.env.META_APP_SECRET!)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  const payload = JSON.parse(rawBody)
  if (payload.object !== 'whatsapp_business_account') {
    return NextResponse.json({ error: 'Invalid webhook type' }, { status: 400 })
  }
  const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
  if (!phoneNumberId) return NextResponse.json({ received: true }, { status: 200 })

  // CHANGE (b): resolve via meta credentials (no env fallback — explicit per-workspace)
  const creds = await resolveByPhoneNumberId(phoneNumberId)
  if (!creds) return NextResponse.json({ received: true }, { status: 200 })  // ack & drop unknown

  await processWebhook(payload, creds.workspaceId, phoneNumberId)  // REUSE
  return NextResponse.json({ received: true }, { status: 200 })
}
```
`[VERIFIED: codebase — derived directly from src/app/api/webhooks/whatsapp/route.ts + resolveByPhoneNumberId signature]`

### Pattern 2: GET verification handshake
**What:** Meta sends `GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`; echo `hub.challenge` as **plain text** 200.
**Why it matters:** Identical to 360dialog. Verified independently against the WhatsApp Cloud API webhook setup pattern. `[CITED: pons.chat WhatsApp Cloud API Next.js + developers.facebook.com webhooks getting-started]`

### Pattern 3: HMAC over RAW body (the #1 failure mode)
**What:** Read `await req.text()` FIRST, HMAC-SHA256 it with the App Secret, compare to `X-Hub-Signature-256` (strip `sha256=` prefix), timing-safe. Parse JSON only AFTER.
**Why:** Re-serializing parsed JSON changes whitespace/key-order/unicode-escaping → hash mismatch → every request 401s.
**Verified:** Multiple independent sources confirm "Call .text() first, verify, then JSON.parse yourself" and "force Node.js runtime to eliminate encoding issues that occur with Edge." `[CITED: webhooks.cc Next.js App Router Webhook guide; pons.chat; Meta Community Forums]` The existing `verifyWhatsAppHmac` already does this correctly. `[VERIFIED: codebase]`

### Pattern 4: Embedded Signup launch (FB.login)
**What:** Load the FB JS SDK, `FB.init({ appId, version:'v22.0' })`, then on button click call `FB.login(callback, options)`.
**Verified config shape** `[CITED: ycloud Partner Center embedded-signup + chatwoot docs]`:
```javascript
FB.login(function (response) {
  // AUTH CODE return channel:
  if (response.authResponse && response.authResponse.code) {
    const code = response.authResponse.code   // short-lived, single-use, ~10 min
    // POST code (+ captured waba_id/phone_number_id) to MorfX server
  }
}, {
  config_id: '<YOUR_CONFIG_ID>',            // from Meta App > Embedded Signup config
  response_type: 'code',
  override_default_response_type: true,
  extras: {
    setup: {},                               // optional pre-fill
    featureType: '',                         // version-sensitive (see Open Question 4)
    sessionInfoVersion: '3',                 // current
  }
})
```
**The SECOND return channel** (the `waba_id` / `phone_number_id`) arrives via a `window` message listener, NOT in `FB.login`'s callback `[CITED: ycloud]`:
```javascript
window.addEventListener('message', (event) => {
  if (!event.origin.endsWith('facebook.com')) return
  try {
    const data = JSON.parse(event.data)
    if (data.type === 'WA_EMBEDDED_SIGNUP') {
      // data.event === 'FINISH' on success → data.data = { phone_number_id, waba_id, business_id }
      // data.event === 'CANCEL' / 'ERROR' on failure
    }
  } catch { /* not our message */ }
})
```
**Confidence: MEDIUM.** The `config_id`, `featureType`, and exact `extras` keys change between Embedded Signup versions and Meta App configs. The team must read the live config_id from the Meta App dashboard (Embedded Signup product). Treat the `extras` object as a starting point to validate in the browser, not gospel.

### Pattern 5: code → BISUAT exchange (server-side ONLY)
**What:** Exchange the single-use `code` for a Business Integration System User Access Token.
**Verified endpoint** `[CITED: Bird API docs + Meta access-tokens doc + multiple BSP guides]`:
```
GET https://graph.facebook.com/v22.0/oauth/access_token
    ?client_id=<META_APP_ID>
    &client_secret=<META_APP_SECRET>
    &code=<CODE_FROM_FB_LOGIN>
```
Response: `{ "access_token": "<BISUAT>", "token_type": "bearer", ... }` (no `expires_in` for BISUAT — it does not expire but can be invalidated). `[CITED: REQUIREMENTS.md note "BISUAT tokens no expiran pero pueden invalidarse"; Meta access-tokens doc]`
- **No `redirect_uri` needed** for the Embedded Signup code grant (the code is bound to the FB.login session, not a redirect). `[ASSUMED — corroborated by BSP guides that pass only client_id/client_secret/code]`
- `META_APP_SECRET` must NEVER reach the browser → exchange runs in a server action / route handler.
- Then `encryptToken(BISUAT)` and INSERT into `workspace_meta_accounts` via the admin client (Regla 3 — through domain or a dedicated meta-onboarding helper that wraps the admin write).

### Pattern 6: Auto-subscribe WABA to the app
**What:** Subscribe the app to the WABA's webhooks so messages start flowing.
**Verified endpoint** `[VERIFIED: developers.facebook.com Graph API reference whats-app-business-account/subscribed_apps]`:
```
POST https://graph.facebook.com/v22.0/{waba-id}/subscribed_apps
Authorization: Bearer <BISUAT>
→ { "success": true }
```
- Optional `override_callback_uri` + `verify_token` params exist for per-WABA callback overrides (both required together). For Phase 38 the app-level callback (`/api/webhooks/meta`) is sufficient — do NOT override unless multi-callback routing is needed. `[VERIFIED: subscribed_apps API reference]`
- `GET /{waba-id}/subscribed_apps` → `{ data: [], paging: {} }` to verify subscription; `DELETE` to unsubscribe. `[VERIFIED: subscribed_apps API reference]`
- Phone registration (if the number is new to Cloud API): `POST /v22.0/{phone-number-id}/register` with `{ messaging_product: 'whatsapp', pin: '<6-digit>' }`. `[CITED: WhatsApp Cloud API get-started; ASSUMED exact for v22.0 — confirm in execution]`

### Pattern 7: `whatsapp_provider` routing flag storage
**What:** Per-workspace flag, default `'360dialog'`, opt-in `'meta_direct'` (D-04).
**Recommendation: dedicated column on `workspaces`** (not on `workspace_meta_accounts` — that table only has rows for connected accounts, but the flag must answer "which provider?" for EVERY workspace including those with no Meta row yet):
```sql
ALTER TABLE workspaces
  ADD COLUMN whatsapp_provider TEXT NOT NULL DEFAULT '360dialog'
  CHECK (whatsapp_provider IN ('360dialog', 'meta_direct'));
```
- DB-enforced default = Regla 6 safe (every existing workspace stays `'360dialog'` with zero backfill).
- Flip per workspace: `UPDATE workspaces SET whatsapp_provider='meta_direct' WHERE id='<uuid>';` (D-05).
- **Where read:** Primarily Phase 39 (outbound sender selection). For Phase 38 inbound, the flag is **optional at the webhook** — because routing is already decided by WHICH endpoint Meta hits (`/api/webhooks/meta` vs `/api/webhooks/whatsapp`) and by `resolveByPhoneNumberId` (only connected Meta numbers resolve). A workspace still on 360dialog has no `workspace_meta_accounts` row → `resolveByPhoneNumberId` returns null → ack & drop. So **double-processing is structurally impossible** as long as a number lives in exactly one WABA at a time (D-11). The flag's job in Phase 38 is forward-looking control for Phase 39 sends.
- **Alternative if avoiding a migration:** store in `workspaces.settings` JSONB with code-level default `?? '360dialog'`. Less safe (no DB default) — only choose if the team wants zero schema change this phase.
`[VERIFIED: codebase — workspaces.settings JSONB already used for whatsapp_phone_number_id; workspace_agent_config pattern for ALTER ADD COLUMN ... DEFAULT false]`

### Anti-Patterns to Avoid
- **Writing a new inbound handler** instead of reusing `processWebhook` — violates D-09, risks divergence between the two paths.
- **Parsing JSON before HMAC** — guarantees signature failure (Pitfall 1).
- **Putting `whatsapp_provider` only on `workspace_meta_accounts`** — that table has no row for un-connected workspaces; the flag can't default correctly there.
- **Exchanging the code client-side** — leaks `META_APP_SECRET`.
- **Adding an env-var workspace fallback** (like 360dialog's `WHATSAPP_DEFAULT_WORKSPACE_ID`) to the Meta route — defeats the explicit per-workspace control of D-06; unknown numbers should ack-and-drop.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inbound message pipeline (inbox + agents + dedup) | A new Meta-specific handler | `processWebhook` (reuse) | D-09; 360dialog payload === Meta payload. Re-building risks divergence. |
| Message deduplication | A dedup table / cache keyed by message_id | `messages.wamid UNIQUE` | D-10; Meta's 7x retries already deduplicated at DB layer. |
| Workspace resolution | New SQL lookup | `resolveByPhoneNumberId` | Phase 37 built it, filters `is_active`. |
| Token encryption | New crypto | `encryptToken`/`decryptToken` | AES-256-GCM, tested 4/4 in Phase 37. |
| HMAC verify | New implementation | Copy `verifyWhatsAppHmac` (or extract to shared util) | Already timing-safe + `sha256=` prefix tolerant. |
| Graph API calls | Raw fetch | `metaRequest` (except the unauthenticated oauth exchange — see Pitfall 6) | Bearer + error parsing handled. |
| Embedded Signup popup | Custom OAuth iframe | Facebook JS SDK `FB.login` + `config_id` | The only documented/supported v4 path. |

**Key insight:** Phase 38's real surface area is ~1 new route file (clone) + ~1 onboarding server action + ~1 client component + ~1 migration. Everything heavy (pipeline, crypto, resolution, dedup) is already shipped.

## Common Pitfalls

### Pitfall 1: HMAC over re-serialized JSON
**What goes wrong:** Every webhook POST returns 401.
**Why:** `await req.json()` then `JSON.stringify` produces different bytes than Meta sent (whitespace, key order, unicode escapes).
**How to avoid:** `const rawBody = await req.text()` → HMAC the string → `JSON.parse(rawBody)` after. The existing route already does this. `[VERIFIED: codebase + CITED multiple sources]`
**Warning signs:** Signature mismatch on 100% of requests despite correct secret.

### Pitfall 2: Non-timing-safe / length-mismatch comparison
**What goes wrong:** Either a timing side-channel, or `timingSafeEqual` throws on unequal buffer lengths (crashing the handler → 500 → Meta retries).
**How to avoid:** Wrap `crypto.timingSafeEqual` in try/catch returning `false` on length mismatch (existing code does this). `[VERIFIED: codebase src/app/api/webhooks/whatsapp/route.ts:30-37]`

### Pitfall 3: Edge runtime breaks raw-body HMAC
**What goes wrong:** On Vercel Edge, body encoding / `node:crypto` availability differs → intermittent signature failures.
**How to avoid:** Add `export const runtime = 'nodejs'` to the route. `[CITED: webhooks.cc — "Force Node.js runtime to eliminate encoding issues with Edge Runtime"]`

### Pitfall 4: App in Development mode → no webhooks (blocks the whole inbound test)
**What goes wrong:** GET handshake succeeds, but real inbound messages from a non-tester user never arrive. Hours of phantom debugging.
**Why:** "Some webhooks will not be sent if your app is in Dev mode." Development mode only delivers events for users with an app role (admin/dev/tester). `[CITED: developers.facebook.com App Modes + WhatsApp webhooks setup; CONTEXT D-12]`
**How to avoid:** Switch the app (`1457229738955828`) to **Live mode BEFORE** the inbound test (D-12). This does NOT affect 360dialog/ManyChat (separate apps).
**Warning signs:** Handshake OK, zero POST events for real messages.

### Pitfall 5: Advanced Access required for solution-provider webhooks
**What goes wrong:** Even in Live mode, webhooks for *onboarded customer* WABAs (the multi-tenant Embedded Signup case) don't flow if only Standard Access is granted.
**Why:** "If you are a solution provider and need these webhooks to provide messaging services to onboarded business customers, you must be approved for advanced access for these permissions via App Review." `[CITED: developers.facebook.com WhatsApp webhooks setup]`
**How to avoid:** Confirm `whatsapp_business_messaging` + `whatsapp_business_management` have **Advanced Access** (not just Standard) for the production Embedded Signup path. CONTEXT says App Review approved these — verify the access *level* is Advanced before deliverable-2 customer tests. **Note:** the deliverable-1 test number is in YOUR own portfolio, so Standard Access likely suffices for it; the gap bites at multi-tenant onboarding (deliverable 2). `[ASSUMED level distinction — verify in Meta App dashboard]`

### Pitfall 6: `oauth/access_token` must NOT carry a Bearer token
**What goes wrong:** Reusing `metaRequest` for the code exchange fails — `metaRequest` always sets `Authorization: Bearer <token>`, but the exchange authenticates via `client_id`+`client_secret` query params, not a Bearer header.
**How to avoid:** Write a dedicated unauthenticated `fetch` for the exchange (or a `metaRequest` variant without the Authorization header). `[VERIFIED: codebase src/lib/meta/api.ts:31-38 always sets Bearer]`

### Pitfall 7: 200 must return in <5s (HOOK-03)
**What goes wrong:** Meta marks the endpoint unhealthy / retries if the response exceeds its timeout; agent processing (multiple Claude calls) can exceed 5s.
**Current mitigation:** The 360dialog route runs `processWebhook` synchronously and relies on `maxDuration=60` + Meta's retry tolerance. Meta retries with exponential backoff for up to ~36h, and dedup makes retries harmless (D-10). For Phase 38 **mirror the synchronous pattern** for parity; if real-world latency causes Meta to flag the endpoint, the Phase-39 async pattern (store message + `inngest.send` without await) is the upgrade. `[VERIFIED: codebase maxDuration=60; CITED: Meta retry/backoff up to 36h]` See Open Question 1.

### Pitfall 8: Embedded Signup config_id / version drift
**What goes wrong:** The `FB.login` `extras` / `config_id` / `featureType` that worked in a blog post fails because Meta changed Embedded Signup versions.
**How to avoid:** Read the live `config_id` from the Meta App's Embedded Signup configuration; validate the `FB.login` options in the actual browser popup before wiring the backend. Treat Pattern 4 as a starting template. `[CITED: chakrahq error guide; MEDIUM confidence]`

### Pitfall 9: Authorization code is single-use and short-lived (~10 min)
**What goes wrong:** Exchanging a code twice, or after expiry, returns an OAuth error.
**How to avoid:** Exchange immediately server-side on receipt; never retry the same code. `[CITED: multiple OAuth/Meta sources — "single-use, expires ~10 min"; ASSUMED exact 10-min window for Embedded Signup specifically — treat as "exchange immediately"]`

### Pitfall 10: One number = one WABA at a time (D-11)
**What goes wrong:** The real test number is still active in 360dialog → cannot register to your WABA, or messages still route through 360dialog.
**How to avoid:** Ensure the number is removed from 360dialog before registering to your WABA (D-11). `[CITED: CONTEXT D-11; standard WhatsApp constraint]`

## Code Examples

### GET handshake (verified pattern)
```typescript
// Source: existing src/app/api/webhooks/whatsapp/route.ts (VERIFIED) — change only the env var
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  if (sp.get('hub.mode') === 'subscribe' &&
      sp.get('hub.verify_token') === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(sp.get('hub.challenge'), {
      status: 200, headers: { 'Content-Type': 'text/plain' },
    })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}
```

### HMAC verify (verified pattern, reuse)
```typescript
// Source: VERIFIED src/app/api/webhooks/whatsapp/route.ts:24
import crypto from 'crypto'
function verifyMetaHmac(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const actual = signature.startsWith('sha256=') ? signature.slice(7) : signature
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  } catch { return false }
}
```

### code → BISUAT exchange (server-side)
```typescript
// Source: CITED Bird API docs + Meta access-tokens — unauthenticated GET (Pitfall 6)
import { META_BASE_URL } from '@/lib/meta/constants' // .../v22.0
async function exchangeCodeForBisuat(code: string): Promise<string> {
  const url = `${META_BASE_URL}/oauth/access_token`
    + `?client_id=${process.env.META_APP_ID}`
    + `&client_secret=${process.env.META_APP_SECRET}`
    + `&code=${encodeURIComponent(code)}`
  const res = await fetch(url)            // NO Authorization header
  const data = await res.json()
  if (!res.ok || !data.access_token) throw new Error(`exchange failed: ${JSON.stringify(data)}`)
  return data.access_token as string      // BISUAT — does not expire, can be invalidated
}
```

### Auto-subscribe WABA (verified endpoint, reuse metaRequest)
```typescript
// Source: VERIFIED developers.facebook.com .../subscribed_apps reference
import { metaRequest } from '@/lib/meta/api'
async function subscribeWaba(bisuat: string, wabaId: string): Promise<void> {
  const r = await metaRequest<{ success: boolean }>(
    bisuat, `/${wabaId}/subscribed_apps`, { method: 'POST' }
  )
  if (!r.success) throw new Error('subscribed_apps did not return success:true')
}
```

### FB.login launch (frontend, MEDIUM confidence — validate config_id live)
```javascript
// Source: CITED ycloud + chatwoot. extras are version-sensitive — confirm in browser.
FB.login((response) => {
  if (response.authResponse?.code) {
    fetch('/api/meta/onboard', {                 // POST code (+ waba_id/phone_number_id from listener)
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: response.authResponse.code, ...capturedSessionInfo }),
    })
  }
}, {
  config_id: META_EMBEDDED_SIGNUP_CONFIG_ID,
  response_type: 'code',
  override_default_response_type: true,
  extras: { sessionInfoVersion: '3' },
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Embedded Signup v2/v3 (`sessionInfoVersion: 2`) | v4 / `sessionInfoVersion: '3'`, supports WA+FB+IG single flow | Dec 2025 (per REQUIREMENTS.md) | Use `'3'`. |
| 360dialog BSP relay | Meta Cloud API direct (`graph.facebook.com`) | This milestone | Lower latency (D-08); payload format unchanged. |
| User access tokens (expire 60d) | BISUAT (no expiry, can be invalidated → health check) | Embedded Signup | Reuse `verifyToken` for health checks. |
| Graph API ≤ v21 | v22.0 enforced (Sep 2025); v25 now latest | Sep 2025 | Project pinned v22.0 — keep. |
| DigiCert-signed mTLS webhook certs | Meta's own CA (`meta-outbound-api-ca-2025-12.pem`) | **March 31, 2026** | ONLY affects opted-in **mTLS** webhooks. Standard HTTPS webhooks on Vercel are unaffected. **Do NOT opt into mTLS** for Phase 38; if ever enabled, update trust store. `[CITED: chatarmin 2026 guide + search corroboration]` |

**Deprecated/outdated:**
- Env-var single-workspace fallback (`WHATSAPP_DEFAULT_WORKSPACE_ID`) — do not replicate in the Meta route (D-06).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No `redirect_uri` required for Embedded Signup code exchange | Pattern 5 | Exchange 400s; add `redirect_uri` matching the FB.login origin. LOW risk (BSP guides omit it). |
| A2 | Authorization code expires ~10 min, single-use | Pitfall 9 | If shorter, "exchange immediately" still holds; only matters if code is queued/delayed. |
| A3 | Standard Access suffices for own-portfolio test number; Advanced Access needed for multi-tenant onboarded customers | Pitfall 5 | If Standard insufficient even for own number, deliverable-1 test blocked until Advanced granted. MEDIUM. |
| A4 | `featureType` / exact `extras` keys in FB.login | Pattern 4 | Popup errors / wrong flow; validate live config_id in browser. MEDIUM — Meta version-sensitive. |
| A5 | `POST /{phone-number-id}/register` body `{ messaging_product, pin }` exact for v22.0 | Pattern 6 | Registration 400s; confirm exact params during execution. May be skippable if number pre-registered. |
| A6 | Synchronous `processWebhook` keeps response < 5s in practice | Pitfall 7 / Open Q1 | Meta flags endpoint under heavy agent latency → migrate to async (Phase 39 pattern). Dedup makes retries safe meanwhile. |
| A7 | mTLS CA change (Mar 31 2026) does NOT affect standard HTTPS Vercel webhooks | State of the Art | If Meta forces mTLS, trust store must add Meta CA. LOW — mTLS is opt-in. |

## Open Questions

1. **Synchronous vs async webhook processing (HOOK-03 says "inngest.send without await + DB safety net"; current 360dialog route is synchronous).**
   - What we know: existing route is synchronous within `maxDuration=60` and works; Meta wants 200 in <5s; dedup makes retries harmless.
   - What's unclear: whether Somnio-scale agent latency on the Meta path will exceed Meta's tolerance.
   - Recommendation: **mirror the synchronous pattern for Phase 38** (parity, D-09, lowest risk). Treat the async refactor as an explicit Phase-39 task only if real latency proves it necessary. Flag for planner to decide as a single task, not a fork.

2. **Where exactly is `whatsapp_provider` read in Phase 38?**
   - What we know: inbound routing is already disambiguated by endpoint + `resolveByPhoneNumberId`; the flag mainly governs Phase 39 outbound.
   - Recommendation: add the column/flag now (deliverable for MIG-01, even though MIG-01 is mapped to Phase 39) so Phase 39 has it, but do NOT gate inbound on it in Phase 38 (structurally unnecessary). Confirm with planner whether to land the migration here or defer to Phase 39.

3. **Exact `config_id` and Embedded Signup feature config in the Meta App dashboard.**
   - What we know: required by `FB.login`; must come from the live Meta App.
   - Recommendation: a planning/execution task to read it from the dashboard before wiring the frontend; cannot be hard-coded from research.

4. **Does the test number (D-11) need `POST /{phone-number-id}/register` or is it already registered via 360dialog history?**
   - Recommendation: execution-time check — try `subscribed_apps` first; register only if Cloud API reports the number unregistered.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `META_APP_ID` | code exchange, FB.init | ✓ (Vercel env) | — | none (blocking) |
| `META_APP_SECRET` | HMAC verify + code exchange | ✓ (Vercel env) | — | none (blocking) |
| `META_WEBHOOK_VERIFY_TOKEN` | GET handshake | ✓ (Vercel env) | — | none (blocking) |
| `META_TOKEN_ENCRYPTION_KEY` | encryptToken | ✓ (Vercel env) | 32-byte base64 | none (blocking) |
| Meta App in Live mode | inbound webhooks (D-12) | ✗ (must flip) | — | none — flip before test (Pitfall 4) |
| Advanced Access (`whatsapp_business_messaging` + `_management`) | multi-tenant onboarded webhooks | ? verify level | — | Standard may suffice for own-portfolio test number (Pitfall 5) |
| Embedded Signup `config_id` | FB.login | ? read from dashboard | — | none — required for deliverable 2 (Open Q3) |
| Real WhatsApp number off 360dialog | inbound test (D-11) | manual user action | — | none — one number/one WABA |
| `node:crypto`, `fetch` | HMAC + Graph calls | ✓ (Node runtime) | built-in | none |
| Facebook JS SDK | FB.login popup | ✓ (CDN script) | v22.0 | none |

**Missing dependencies with no fallback (blockers for the test):**
- App not yet in Live mode (D-12) — user must flip before inbound test.
- Embedded Signup `config_id` — must be read/created in Meta App dashboard (deliverable 2 only).
- Test number must be removed from 360dialog (D-11).

**Missing dependencies with fallback:**
- Advanced Access level — own-portfolio test number likely works on Standard; only deliverable-2 onboarding needs Advanced (verify).

## Validation Architecture

> `.planning/config.json` had no `nyquist_validation` key found; treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project standard — used across `src/lib/agents/**/__tests__/`) |
| Config file | project root (existing vitest config) |
| Quick run command | `npx vitest run <path>` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOOK-02 | HMAC valid sig passes, tampered sig fails, length-mismatch returns false | unit | `npx vitest run src/app/api/webhooks/meta/__tests__/hmac.test.ts` | ❌ Wave 0 |
| HOOK-01 | GET handshake echoes challenge on correct verify_token, 403 otherwise | unit | `npx vitest run src/app/api/webhooks/meta/__tests__/handshake.test.ts` | ❌ Wave 0 |
| HOOK-04 | Duplicate wamid → no second DB row (relies on existing dedup) | integration | exercise `processWebhook` twice with same wamid | ❌ Wave 0 (may already be covered by existing webhook-handler tests) |
| WA-05 | Meta payload → message in inbox identical to 360dialog | integration | `npx vitest run src/lib/whatsapp/__tests__/` (existing) | ✅ existing processWebhook tests |
| SIGNUP-02 | code→BISUAT exchange builds correct URL + parses access_token; unauthenticated (no Bearer) | unit | `npx vitest run src/lib/meta/__tests__/embedded-signup.test.ts` | ❌ Wave 0 |
| SIGNUP-03 | subscribeWaba posts to `/{waba}/subscribed_apps`, throws if not success | unit | same file | ❌ Wave 0 |
| Regla 6 | 360dialog route + processWebhook byte-identical behavior for non-meta workspaces | regression | `git diff` on webhook-handler.ts = 0 + existing tests green | ✅ existing |

### Sampling Rate
- **Per task commit:** `npx vitest run src/app/api/webhooks/meta/ src/lib/meta/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green + manual smoke (D-13: handshake, HMAC, inbox, dedup, Somnio intact) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/app/api/webhooks/meta/__tests__/hmac.test.ts` — covers HOOK-02
- [ ] `src/app/api/webhooks/meta/__tests__/handshake.test.ts` — covers HOOK-01
- [ ] `src/lib/meta/__tests__/embedded-signup.test.ts` — covers SIGNUP-02/03 (exchange URL shape + subscribe contract; mock `fetch`)
- [ ] Confirm existing `processWebhook` dedup test covers HOOK-04 (Meta retry); if not, add one
- [ ] No framework install needed (Vitest present)

## Security Domain

> `security_enforcement` not found as `false` in config — included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | HMAC-SHA256 webhook auth (`X-Hub-Signature-256` + `META_APP_SECRET`); OAuth code grant for onboarding. |
| V3 Session Management | partial | FB.login session is Meta-managed; MorfX server action must be auth-gated (workspace admin only) before exchange. |
| V4 Access Control | yes | Only workspace **admins** may trigger "Connect WhatsApp" / token exchange (mirror `workspace_agent_config` admin RLS). |
| V5 Input Validation | yes | Validate `payload.object === 'whatsapp_business_account'`, presence of `phone_number_id`; validate `code`/`waba_id` server-side before exchange. |
| V6 Cryptography | yes | AES-256-GCM via existing `encryptToken` (never hand-roll); timing-safe HMAC compare. |

### Known Threat Patterns for Meta webhook + OAuth onboarding
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook POST (spoofed Meta payload) | Spoofing | HMAC-SHA256 over raw body, reject on mismatch (401). |
| Replayed webhook (Meta retry or attacker replay) | Tampering/DoS | `messages.wamid UNIQUE` dedup (D-10) → idempotent. |
| `META_APP_SECRET` leak via client | Info Disclosure | Code exchange + HMAC strictly server-side; secret never in client bundle. |
| BISUAT theft from DB | Info Disclosure | Stored AES-256-GCM encrypted; RLS blocks client INSERT/UPDATE (admin client only). |
| Unauthorized workspace connecting a number | Elevation | Server action gated to workspace admin; workspace_id from session, never request body. |
| Token invalidation (BISUAT revoked) | DoS | `verifyToken` health check; surface error, do not crash webhook (ack & log). |
| Code interception / reuse | Spoofing | Single-use code, exchanged immediately server-side; HTTPS only. |

## Project Constraints (from CLAUDE.md)
- **Regla 6:** Somnio (production, 360dialog) must stay byte-identical — default `whatsapp_provider='360dialog'`, no feature flips without explicit user action. `processWebhook` MUST NOT be modified in a way that changes 360dialog behavior (the Meta route reuses it read-only). Verify via `git diff` on shared files + existing tests green.
- **Regla 3:** All mutations (insert `workspace_meta_accounts`, update `whatsapp_provider`) via `src/lib/domain/*` or the meta credential/onboarding helpers that wrap the admin client — no direct Supabase writes from the route/action body.
- **Regla 5:** The `workspaces.whatsapp_provider` migration (and any schema change) MUST be applied to prod BEFORE pushing code that references it. PAUSE for user to apply.
- **Regla 2:** Timestamps in `America/Bogota` (table already uses `timezone('America/Bogota', NOW())`).
- **Regla 1 / code-changes:** Push to Vercel after code changes before asking user to test.
- **Agent scope:** This phase adds an inbound endpoint + onboarding, not a new AI agent — no new agentRegistry entry. But if planning frames the test path as an agent interaction, the existing v3/v4 scopes apply unchanged (Regla 6).

## Sources

### Primary (HIGH confidence)
- **Codebase (VERIFIED):** `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/whatsapp/webhook-handler.ts`, `src/lib/meta/{credentials,api,token,constants,types}.ts`, `supabase/migrations/20260401100000_create_workspace_meta_accounts.sql`, `20260209000000_agent_production.sql`.
- developers.facebook.com — WhatsApp Business Account **subscribed_apps** API reference (POST/GET/DELETE shapes, `{success:true}`, `override_callback_uri`/`verify_token`) — VERIFIED exact.
- developers.facebook.com — App Modes (Development vs Live; permissions only from role users in Dev mode).

### Secondary (MEDIUM confidence)
- developers.facebook.com — WhatsApp Cloud API set-up webhooks (permissions `whatsapp_business_messaging`/`_management`; Advanced Access for solution providers; Live mode).
- pons.chat — WhatsApp Cloud API Webhook with Next.js (GET handshake + raw-body HMAC + Node runtime).
- webhooks.cc — Next.js App Router Webhook Handler (`.text()` first, Node runtime, unicode/whitespace failure cause).
- Bird API docs — Embedded Signup flow (`GET /oauth/access_token?client_id&client_secret&code` exchange).
- ycloud Partner Center + Chatwoot docs — `FB.login` config (`config_id`, `response_type:'code'`, `override_default_response_type`, `sessionInfoVersion:'3'`) + `WA_EMBEDDED_SIGNUP` message listener (`waba_id`, `phone_number_id`, `event:'FINISH'`).
- chatarmin 2026 WhatsApp Webhooks guide — mTLS CA change (Mar 31 2026), retry/backoff up to 36h.

### Tertiary (LOW confidence — flagged for validation)
- Aggregated OAuth-code expiry (~10 min, single-use) across Meta OAuth sources — directional, not Embedded-Signup-specific. Treat as "exchange immediately."
- `POST /{phone-number-id}/register` exact v22.0 body — confirm at execution.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — almost entirely reuse of shipped, tested Phase 37 + 360dialog code.
- Inbound webhook (handshake/HMAC/reuse/dedup): HIGH — verified against codebase + multiple independent sources.
- Embedded Signup v4 frontend + exchange + subscribe: MEDIUM — endpoints verified, but config_id/extras/feature config are Meta-version-sensitive and must be validated live.
- Live Mode / Advanced Access gating: MEDIUM-HIGH — verified in principle; the Standard-vs-Advanced distinction for own-portfolio test number needs dashboard confirmation.

**Research date:** 2026-06-02
**Valid until:** 2026-06-16 for Embedded Signup specifics (Meta iterates frequently); 2026-09-02 for the inbound/HMAC/reuse path (stable).
