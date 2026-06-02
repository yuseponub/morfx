# Phase 38: Embedded Signup + WhatsApp Inbound - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 5 new + 1 migration + REUSE-verbatim assets
**Analogs found:** 5 / 5 (all exact or strong role-match)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/api/webhooks/meta/route.ts` | route (webhook) | request-response / event-driven | `src/app/api/webhooks/whatsapp/route.ts` | **exact** (D-09 = 3-change clone) |
| `src/lib/meta/embedded-signup.ts` | service (server-only helpers) | request-response (Graph API) | `src/lib/meta/api.ts` (metaRequest/verifyToken) | role-match |
| `src/app/actions/meta-onboarding.ts` | server action | CRUD (auth-gate + admin write) | `src/app/actions/shopify-oauth.ts` + `src/app/api/integrations/shopify/oauth/callback/route.ts` | **exact** (OAuth code→token→persist) |
| `src/components/settings/connect-whatsapp.tsx` | component (client) | event-driven (popup + message listener) | `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx` | role-match (connect-flow UI) |
| `supabase/migrations/*_add_whatsapp_provider.sql` | migration | DDL (ALTER ADD COLUMN DEFAULT) | `20260209000000_agent_production.sql:46-48` + `20260401100000_create_workspace_meta_accounts.sql:22` (CHECK enum) | role-match |
| `src/lib/domain/meta-accounts.ts` (NEW helper, Regla 3) | domain (mutation) | CRUD (admin insert) | `upsertShopifyIntegration` in `src/lib/domain/integrations.ts` (called from shopify callback) | role-match |

> **Note on the domain helper:** RESEARCH §Pattern 5 says persist "via the admin client (Regla 3 — through domain or a dedicated meta-onboarding helper that wraps the admin write)." `credentials.ts` only **reads** `workspace_meta_accounts`; there is NO existing insert path. The Regla 3 (CLAUDE.md) + Regla 3-in-RESEARCH (line 606) mandate is satisfied by the shopify analog: callback uses `createAdminClient` for the auth re-check but delegates the actual write to `upsertShopifyIntegration` in `src/lib/domain/integrations.ts`. **The meta-onboarding action MUST NOT write `workspace_meta_accounts` inline** — it must call a new domain helper (`insertMetaAccount` / `upsertMetaAccount`) that wraps the admin write, exactly mirroring the shopify pattern. The planner should add this helper as an explicit task.

---

## Pattern Assignments

### `src/app/api/webhooks/meta/route.ts` (route, request-response)

**Analog:** `src/app/api/webhooks/whatsapp/route.ts` — clone with EXACTLY 3 changes (D-09). This is the de-risk path; build it FIRST (D-01).

**Module config** (analog lines 13, + RESEARCH Pitfall 3 adds `runtime`):
```typescript
export const maxDuration = 60          // analog whatsapp/route.ts:13 — agent processing headroom
export const runtime = 'nodejs'        // NEW: crypto + raw body need Node runtime (Pitfall 3); analog omits but Meta path must set it
```

**HMAC verify — COPY VERBATIM** (analog lines 24-38, `verifyWhatsAppHmac`). Timing-safe, `sha256=` prefix-tolerant, try/catch on length mismatch:
```typescript
function verifyWhatsAppHmac(body: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(body)
  const expectedSignature = hmac.digest('hex')
  const actualSignature = signature.startsWith('sha256=') ? signature.slice(7) : signature
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(actualSignature)
    )
  } catch {
    return false // Length mismatch
  }
}
```
> Copy as-is (rename to `verifyMetaHmac` optional, or extract to shared util per RESEARCH line 96). The byte-for-byte logic is correct already.

**GET handshake — CHANGE (c)** (analog lines 76-100). ONLY the env var changes:
```typescript
// analog reads process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN (line 85)
// CHANGE (c): Meta uses META_WEBHOOK_VERIFY_TOKEN
const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN
if (mode === 'subscribe' && token === expectedToken) {
  return new Response(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },   // plain text echo of hub.challenge
  })
}
return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
```

**POST body read + HMAC — CHANGE (a)** (analog lines 108-148). RAW body FIRST (Pitfall 1), then verify with `META_APP_SECRET`. KEY DIVERGENCE: analog makes signature **optional** (only if `WHATSAPP_WEBHOOK_SECRET` set, lines 120-133); for Meta direct the signature is **ALWAYS required**:
```typescript
const rawBody = await request.text()           // RAW (analog line 114) — NEVER req.json() first
const signature = request.headers.get('X-Hub-Signature-256') || ''
// CHANGE (a): META_APP_SECRET, signature ALWAYS required (no optional bypass)
if (!verifyMetaHmac(rawBody, signature, process.env.META_APP_SECRET!)) {
  return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
}
const payload = JSON.parse(rawBody)             // parse AFTER verify (analog line 138)
if (payload.object !== 'whatsapp_business_account') {
  return NextResponse.json({ error: 'Invalid webhook type' }, { status: 400 })
}
```

**Workspace resolution — CHANGE (b)** (analog lines 150-162). Replace `resolveWorkspaceId` (analog's DB-lookup-then-env-fallback, lines 51-69) with `resolveByPhoneNumberId`. **DO NOT replicate the env-var fallback** (anti-pattern per RESEARCH line 340 / D-06 — unknown numbers ack-and-drop):
```typescript
const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
if (!phoneNumberId) return NextResponse.json({ received: true }, { status: 200 })

// CHANGE (b): meta credentials resolver (Phase 37) — NO env fallback (D-06)
const creds = await resolveByPhoneNumberId(phoneNumberId)   // src/lib/meta/credentials.ts:47
if (!creds) return NextResponse.json({ received: true }, { status: 200 })  // ack & drop unknown
```

**processWebhook call — REUSE VERBATIM** (analog lines 164-178). Same signature, same synchronous pattern, same 500-on-throw-for-retry semantics:
```typescript
try {
  const result = await processWebhook(payload, creds.workspaceId, phoneNumberId)
  return NextResponse.json({ received: true }, { status: 200 })
} catch (error) {
  console.error('[webhook] NOT stored, returning 500 for retry:', error)
  return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 })
}
```

**Imports** (analog lines 6-10, swap workspace resolver):
```typescript
import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { resolveByPhoneNumberId } from '@/lib/meta/credentials'  // CHANGE (b) — replaces createAdminClient lookup
import { processWebhook } from '@/lib/whatsapp/webhook-handler'   // SAME — reuse
import type { WebhookPayload } from '@/lib/whatsapp/types'
```

---

### `src/lib/meta/embedded-signup.ts` (service, server-only)

**Analog:** `src/lib/meta/api.ts` (`metaRequest`:24, `verifyToken`:118). Reuse `metaRequest` for authenticated calls; write a dedicated unauthenticated `fetch` for the code exchange (Pitfall 6).

**code → BISUAT exchange — DEDICATED unauthenticated fetch** (NOT `metaRequest` — analog `metaRequest` always sets `Authorization: Bearer` at lines 33-37, which breaks the exchange):
```typescript
import { META_BASE_URL } from './constants'   // 'https://graph.facebook.com/v22.0' (constants.ts:9)
async function exchangeCodeForBisuat(code: string): Promise<string> {
  const url = `${META_BASE_URL}/oauth/access_token`
    + `?client_id=${process.env.META_APP_ID}`
    + `&client_secret=${process.env.META_APP_SECRET}`
    + `&code=${encodeURIComponent(code)}`
  const res = await fetch(url)            // NO Authorization header (Pitfall 6)
  const data = await res.json()
  if (!res.ok || !data.access_token) throw new Error(`exchange failed: ${JSON.stringify(data)}`)
  return data.access_token as string      // BISUAT — no expiry, can be invalidated
}
```

**Auto-subscribe — REUSE `metaRequest`** (analog `metaRequest`:24, POST with Bearer = BISUAT):
```typescript
import { metaRequest } from '@/lib/meta/api'
async function subscribeWaba(bisuat: string, wabaId: string): Promise<void> {
  const r = await metaRequest<{ success: boolean }>(
    bisuat, `/${wabaId}/subscribed_apps`, { method: 'POST' }   // metaRequest sets Bearer + Content-Type (api.ts:33-37)
  )
  if (!r.success) throw new Error('subscribed_apps did not return success:true')
}
```

**Optional phone register** (RESEARCH Pattern 6 / A5 — confirm exact body at execution): `POST /${phoneNumberId}/register { messaging_product: 'whatsapp', pin }` via `metaRequest`.

**Health check — REUSE `verifyToken`** (analog api.ts:118-128) after exchange to validate the BISUAT against the WABA.

---

### `src/app/actions/meta-onboarding.ts` (server action, CRUD)

**Analog:** `src/app/actions/shopify-oauth.ts` (auth gate, lines 70-93) + `src/app/api/integrations/shopify/oauth/callback/route.ts` (admin re-check + domain upsert, lines 138-234). The onboarding action receives `{ code, waba_id, phone_number_id }` from the client, exchanges server-side, encrypts, and persists via domain.

**`'use server'` + auth gate — COPY** (shopify-oauth.ts lines 70-93). getUser → cookie `morfx_workspace` → `workspace_members.role` check (V4 access control — admin/owner only):
```typescript
'use server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return { success: false, error: 'No autenticado' }

const cookieStore = await cookies()
const workspaceId = cookieStore.get('morfx_workspace')?.value
if (!workspaceId) return { success: false, error: 'No hay workspace seleccionado' }

const { data: member } = await supabase
  .from('workspace_members')
  .select('role')
  .eq('workspace_id', workspaceId)
  .eq('user_id', user.id)
  .single()
if (!member || member.role !== 'owner') {     // shopify uses 'owner' (shopify-oauth.ts:91); confirm role gate with planner
  return { success: false, error: 'Solo el Owner puede conectar WhatsApp' }
}
```

**Envelope shape — COPY** (shopify-oauth.ts:66-69): `{ success: true; ... } | { success: false; error: string }` with Spanish error strings for toast.

**Exchange → encrypt → persist** (combines embedded-signup.ts exchange + `encryptToken` (token.ts:48) + domain helper, mirroring shopify callback lines 219-235 `upsertShopifyIntegration`):
```typescript
import { encryptToken } from '@/lib/meta/token'           // token.ts:48 — AES-256-GCM packed
import { upsertMetaAccount } from '@/lib/domain/meta-accounts'  // NEW domain helper (Regla 3 — see Shared Patterns)

const bisuat = await exchangeCodeForBisuat(code)
const access_token_encrypted = encryptToken(bisuat)
const result = await upsertMetaAccount({               // domain layer wraps the admin write (Regla 3)
  workspaceId, channel: 'whatsapp', wabaId, phoneNumberId, access_token_encrypted, isActive: true,
})
if (!result.success) return { success: false, error: '...' }
await subscribeWaba(bisuat, wabaId)                    // SIGNUP-03 auto-subscribe
```
> **Regla 3 (CLAUDE.md + RESEARCH:606):** `META_APP_SECRET` and the admin write stay server-side. The action calls the domain helper; it does NOT `createAdminClient().from('workspace_meta_accounts').insert(...)` inline. Mirrors shopify callback delegating to `upsertShopifyIntegration` (callback route.ts:33,219).

---

### `src/components/settings/connect-whatsapp.tsx` (component, client / event-driven)

**Analog:** `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx` (`'use client'` connect-flow UI, lines 136-190 `DisconnectedBranch`). Same shape: button → `startTransition(async)` → call server action → handle result. The Meta difference: the connect action is a **FB JS SDK popup**, not a server-action redirect.

**`'use client'` + transition + toast pattern — COPY** (shopify-form.tsx lines 136-157):
```typescript
'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

const [isPending, startTransition] = useTransition()
const handleConnect = () => {
  startTransition(async () => {
    const result = await someServerAction(...)
    if (!result.success) { toast.error(result.error); return }
    // ...
  })
}
```

**FB SDK load + FB.login + message listener — NEW** (RESEARCH Pattern 4, MEDIUM confidence — validate `config_id`/`extras` live in browser, Pitfall 8). No analog in codebase (no existing component injects `connect.facebook.net`). Two return channels:
```typescript
// Channel 1: auth code via FB.login callback
FB.login((response) => {
  if (response.authResponse?.code) {
    capturedCode = response.authResponse.code   // short-lived single-use (~10 min, Pitfall 9)
  }
}, { config_id: META_EMBEDDED_SIGNUP_CONFIG_ID, response_type: 'code',
     override_default_response_type: true, extras: { sessionInfoVersion: '3' } })

// Channel 2: waba_id / phone_number_id via window message listener
window.addEventListener('message', (event) => {
  if (!event.origin.endsWith('facebook.com')) return
  try {
    const data = JSON.parse(event.data)
    if (data.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH') {
      // data.data = { phone_number_id, waba_id, business_id } → POST with code to meta-onboarding action
    }
  } catch { /* not our message */ }
})
```
> Once BOTH channels fire, call `meta-onboarding` action with `{ code, waba_id, phone_number_id }`. SDK loaded via `<script src="https://connect.facebook.net/en_US/sdk.js">` injection (no npm dep). `FB.init({ appId: '1457229738955828', version: 'v22.0' })` — version MUST match `META_GRAPH_API_VERSION` (constants.ts:7).

---

### `supabase/migrations/*_add_whatsapp_provider.sql` (migration, DDL)

**Analog:** `20260209000000_agent_production.sql:46-48` (ALTER ADD COLUMN DEFAULT) + `20260401100000_create_workspace_meta_accounts.sql:22` (CHECK enum) + `20260130000002_whatsapp_conversations.sql:21` (`DEFAULT 'x' CHECK (col IN (...))` exact shape).

**Recommended column** (RESEARCH Pattern 7 — on `workspaces`, NOT `workspace_meta_accounts`; DB-enforced default = Regla 6 safe, zero backfill):
```sql
-- Pattern: ALTER ... ADD COLUMN ... NOT NULL DEFAULT ... CHECK (col IN (...))
-- DEFAULT '360dialog' guarantees every existing workspace (Somnio + clients) stays unchanged (D-04, Regla 6)
ALTER TABLE workspaces
  ADD COLUMN whatsapp_provider TEXT NOT NULL DEFAULT '360dialog'
  CHECK (whatsapp_provider IN ('360dialog', 'meta_direct'));
```
> CHECK-enum idiom copied from `whatsapp_conversations.sql:21` (`status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'))`). **Regla 5 (CLAUDE.md):** PAUSE — apply this migration to prod BEFORE pushing any code that reads/writes the column. Flip per-workspace via `UPDATE workspaces SET whatsapp_provider='meta_direct' WHERE id='<uuid>';` (D-05).
>
> **Open Question 2 (RESEARCH:511):** the flag is NOT read at inbound in Phase 38 (routing is disambiguated by endpoint + `resolveByPhoneNumberId`). Land the migration here so Phase 39 outbound has it; do NOT gate the webhook on it. Confirm with planner whether to land here or defer to Phase 39.

---

## Shared Patterns

### REUSE-Verbatim Asset Signatures (confirmed, real line numbers)

| Asset | Exact signature | File:line |
|-------|-----------------|-----------|
| `resolveByPhoneNumberId` | `(phoneNumberId: string): Promise<MetaCredentials \| null>` — filters `.eq('is_active', true)`, returns `.workspaceId` | `src/lib/meta/credentials.ts:47-62` |
| `processWebhook` | `(payload: WebhookPayload, workspaceId: string, phoneNumberId: string): Promise<{ stored: boolean }>` | `src/lib/whatsapp/webhook-handler.ts:56-60` |
| `verifyWhatsAppHmac` | `(body: string, signature: string, secret: string): boolean` — timing-safe, `sha256=` prefix-tolerant, try/catch len-mismatch | `src/app/api/webhooks/whatsapp/route.ts:24-38` |
| `metaRequest<T>` | `(accessToken: string, endpoint: string, options?: RequestInit): Promise<T>` — ALWAYS sets `Authorization: Bearer` (Pitfall 6) | `src/lib/meta/api.ts:24-54` |
| `verifyToken` | `(accessToken: string, wabaId: string): Promise<boolean>` | `src/lib/meta/api.ts:118-128` |
| `encryptToken` | `(token: string): string` — base64(iv12+authTag16+ciphertext), AES-256-GCM | `src/lib/meta/token.ts:48-59` |
| `decryptToken` | `(packed: string): string` — verifies auth tag | `src/lib/meta/token.ts:69-80` |
| `META_BASE_URL` | `'https://graph.facebook.com/v22.0'` | `src/lib/meta/constants.ts:9` |
| `messages_wamid_unique` | `ALTER TABLE messages ADD CONSTRAINT messages_wamid_unique UNIQUE (wamid)` — free dedup (D-10) | `supabase/migrations/20260130000002_whatsapp_conversations.sql:82` |

### Auth Gate (server action / onboarding)
**Source:** `src/app/actions/shopify-oauth.ts:70-93` (getUser → cookie `morfx_workspace` → `workspace_members.role`)
**Apply to:** `src/app/actions/meta-onboarding.ts` (V4 access control — only workspace owner/admin may connect a number; `workspaceId` from cookie/session, NEVER from request body — security threat "Unauthorized workspace connecting a number", RESEARCH:600).

### Domain-mediated admin write (Regla 3)
**Source:** `src/app/api/integrations/shopify/oauth/callback/route.ts:219` delegates to `upsertShopifyIntegration` (`src/lib/domain/integrations.ts`); callback uses `createAdminClient` ONLY for the owner re-check (line 138), not the write.
**Apply to:** `src/app/actions/meta-onboarding.ts` → a NEW `src/lib/domain/meta-accounts.ts` helper (`upsertMetaAccount`) that wraps the `workspace_meta_accounts` insert. The action and route MUST NOT `createAdminClient().from('workspace_meta_accounts').insert()` inline (Regla 3, CLAUDE.md + RESEARCH:606).

### HMAC raw-body verification (the #1 failure mode)
**Source:** `src/app/api/webhooks/whatsapp/route.ts:24-38` (verify) + `:114` (`await request.text()` FIRST) + `:138` (`JSON.parse(rawBody)` AFTER)
**Apply to:** `src/app/api/webhooks/meta/route.ts` — copy the order verbatim: raw text → HMAC → parse. Never `req.json()` before HMAC (Pitfall 1). Add `runtime='nodejs'` (Pitfall 3).

### Regla 6 isolation (Somnio byte-identical)
**Source:** Default `whatsapp_provider='360dialog'` at DB level; `processWebhook` reused read-only.
**Apply to:** ALL files. Verify via `git diff` on `src/lib/whatsapp/webhook-handler.ts` = 0 (MUST NOT modify), `src/app/api/webhooks/whatsapp/route.ts` = 0, and existing `src/lib/whatsapp/__tests__/` green. The Meta route is purely additive; the 360dialog route + handler are untouched.

---

## No Analog Found

| File / sub-pattern | Role | Data Flow | Reason |
|--------------------|------|-----------|--------|
| FB JS SDK injection + `FB.login` + `WA_EMBEDDED_SIGNUP` message listener (inside `connect-whatsapp.tsx`) | component | event-driven | No existing component loads `connect.facebook.net` or uses a `window.postMessage` dual-channel return. Use RESEARCH Pattern 4 (MEDIUM confidence — validate `config_id`/`extras` live in browser, Pitfall 8). The surrounding `'use client'` + `useTransition` + toast shell DOES have an analog (shopify-form.tsx). |
| `oauth/access_token` unauthenticated exchange | service | request-response | `metaRequest` (api.ts) always sets Bearer (Pitfall 6) — no existing unauthenticated Graph helper. Write a dedicated `fetch`. |

---

## Metadata

**Analog search scope:** `src/app/api/webhooks/`, `src/lib/meta/`, `src/lib/whatsapp/`, `src/app/actions/`, `src/app/(dashboard)/configuracion/integraciones/components/`, `src/lib/domain/`, `supabase/migrations/`
**Files scanned:** ~12 read + grep across actions/migrations/components
**Pattern extraction date:** 2026-06-02
