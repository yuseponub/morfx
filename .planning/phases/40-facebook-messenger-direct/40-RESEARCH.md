# Phase 40: Facebook Messenger Direct - Research

**Researched:** 2026-06-04
**Domain:** Meta Messenger Platform (Graph API) — native Facebook Messenger inbox for human agents, mirroring the Phase 38/39 WhatsApp Direct playbook
**Confidence:** HIGH (codebase patterns verified by reading the actual files; Meta policy claims cross-verified against multiple current 2026 sources)

## Summary

Phase 40 is **not greenfield** — almost all the plumbing already exists in this repo. The `workspace_meta_accounts` table already has a `page_id` column with a `UNIQUE` constraint, the `channel` CHECK already allows `'facebook'`, `src/lib/meta/credentials.ts` already exports `resolveByPageId(pageId)`, and the unified Meta webhook (`src/app/api/webhooks/meta/route.ts`) is one `object==='page'` branch away from receiving Messenger events. The ChannelSender contract, the `manychatFacebookSender` (the byte-identical Regla-6 path), the inbound `processManyChatWebhook` pattern, and the provider-flag chokepoint in `src/lib/domain/messages.ts` are all proven and directly mirrorable. **This phase wires together existing pieces; it does not invent infrastructure.**

The single highest-risk area is **messaging policy (D-09)**. The Meta message-tag landscape changed materially: as of **April 27, 2026** the old tags (`CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`, `POST_PURCHASE_UPDATE`) are **dead** — API calls with them return error code 100. The **only** compliant way to message a Messenger user outside the 24-hour window is the **`HUMAN_AGENT` tag** (7-day window, human-only), and it requires the **"Human Agent" permission/feature granted via App Review** — it is NOT available by default. This drives the inbox UX: inside 24h → free text+image; 24h–7d with Human Agent feature granted → send with `messaging_type: MESSAGE_TAG, tag: HUMAN_AGENT`; otherwise → **block the send with a clear explanation**.

The second-most-important finding is a **divergence from Phase 38's connect flow**: WhatsApp uses a Meta-side **WhatsApp Embedded Signup `config_id`** (`FB.login` with `config_id`, `response_type: 'code'`, then `exchangeCodeForBisuat`). Facebook Page connection is **classic Facebook Login** requesting `pages_messaging` (+ the IG messaging scope for D-02 forward-compat), returning a **user access token**, from which we must derive a **long-lived Page Access Token** via the token-exchange + `me/accounts` chain, then subscribe the Page to our app via `POST /{page-id}/subscribed_apps`. The token storage (`upsertMetaAccount`) extends cleanly, but the popup/exchange logic is a NEW sibling, not a verbatim clone of `embedded-signup.ts`.

**Primary recommendation:** Build Phase 40 as a structural clone of the Phase 38+39 pattern — extend `upsertMetaAccount`/`meta-onboarding.ts` for `channel:'facebook'` + Page token, add an `object==='page'` branch to the unified webhook that routes by `page_id` via the existing `resolveByPageId`, add a `metaFacebookSender` (ChannelSender-shaped, creds-object not apiKey — exactly like `metaWhatsappSender`), and gate everything behind a new `workspaces.messenger_provider` column (default `'manychat'`, Regla 5 apply-before-deploy). Use raw Graph API `v22.0` via the existing `metaRequest` client. Do NOT add an SDK.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Page connect popup (FB.login) | Frontend / Client | — | `pages_messaging` consent must happen in the browser via the FB JS SDK; mirrors `connect-whatsapp.tsx` |
| User→long-lived→Page token exchange | API / Backend (Server Action) | — | Carries `META_APP_SECRET`; server-only, exactly like `exchangeCodeForBisuat` |
| Page Access Token storage | Database (domain `meta-accounts.ts`) | — | Regla 3 single write path; encrypted token; `page_id` column already exists |
| Page → app webhook subscription | API / Backend | Meta | `POST /{page-id}/subscribed_apps` with Page token (per-page, unlike WABA) |
| Inbound Messenger event | API (unified webhook route) → domain | — | HMAC verify + `object==='page'` branch + route by `page_id` |
| PSID → contact resolution | Database (domain contacts/conversations) | Meta (profile fetch) | Create-or-get by `(page_id, PSID)`, no fuzzy match (D-04) |
| Outbound send (text+image) | Database (domain `messages.ts`) → `metaFacebookSender` | Meta Graph API | Provider chokepoint reads `messenger_provider`; sender calls Send API |
| 24h window / HUMAN_AGENT gate | API (server action) + sender | Meta policy | Window check + tag selection before send |
| Provider decision (meta_direct vs manychat) | Database (domain chokepoint, Regla 3) | — | Single read of `messenger_provider`, never per-call-site (D-10) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Raw Graph API via `metaRequest` | `src/lib/meta/api.ts` (existing) | All Send API + profile + token + subscription calls | The repo already standardized on a thin typed fetch wrapper with pinned version; an SDK would fragment auth/error handling `[VERIFIED: codebase src/lib/meta/api.ts]` |
| Graph API version | **`v22.0`** | Pinned in `src/lib/meta/constants.ts` (`META_GRAPH_API_VERSION`) | Already the repo standard; v22.0 is enforced by Meta since Sep 2025 and is current/valid in 2026 `[VERIFIED: codebase constants.ts]` `[CITED: REQUIREMENTS.md SETUP-03]` |
| Facebook JS SDK (`window.FB`) | loaded client-side (existing in `connect-whatsapp.tsx`) | `FB.login` popup for Page connect consent | Already loaded for WhatsApp Embedded Signup; reuse for `pages_messaging` Login `[VERIFIED: codebase connect-whatsapp.tsx]` |
| `encryptToken` / `decryptToken` | `src/lib/meta/token.ts` (existing) | AES-256-GCM for the Page Access Token at rest | Same security contract as the BISUAT (T-38-14) `[VERIFIED: codebase]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `getRequestAuth` | `src/lib/auth/request-auth.ts` | Session-derived workspaceId + owner gate on the connect action | Every connect/send server action (copy `meta-onboarding.ts` gate) |
| `inngest` | existing | Async agent dispatch on inbound (NOT in P40 scope — D-12 human-only, but the inbox/realtime path stays) | Only if mirroring the manychat-handler dispatch; P40 may skip the agent event entirely |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw Graph API | `messenger-node` / `bottender` SDK | Adds a dependency, diverges from the repo's `metaRequest` error/version conventions, and provides nothing P40 needs — REJECT |
| New `messenger_accounts` table | Extend `workspace_meta_accounts` (channel='facebook') | The table already supports it (`page_id` UNIQUE, `channel` CHECK includes 'facebook', `resolveByPageId` exists) — extend, do not create `[VERIFIED: migration 20260401100000]` |
| `me/messages` endpoint | `/{PAGE_ID}/messages` | Both work with a Page token; `/{page-id}/messages` is explicit and matches the WhatsApp `/{phoneNumberId}/messages` shape — prefer it for symmetry |

**Installation:**
```bash
# No new packages. All capabilities use existing repo modules.
```

**Version verification:** `META_GRAPH_API_VERSION = 'v22.0'` is already pinned in `src/lib/meta/constants.ts`. No bump needed — v22.0 supports Messenger Send API, the Human Agent tag, and `subscribed_apps`. `[VERIFIED: codebase]`

## Architecture Patterns

### System Architecture Diagram

```
CONNECT (one-time, per workspace)
  Browser: "Conectar Facebook" button
    → FB.login({ scope: 'pages_messaging,<ig_messaging_scope>', response_type: 'token' OR 'code' })
    → user grants → user access token (or code)
        │
        ▼
  Server Action connectFacebookPage()  [server-only, META_APP_SECRET]
    → exchange short-lived user token → long-lived user token (60d)
    → GET /me/accounts → pick Page → long-lived Page Access Token (no expiry)
    → encryptToken(pageToken)
    → upsertMetaAccount({ channel:'facebook', pageId, accessTokenEncrypted })   [Regla 3]
    → POST /{page-id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks  [Page token]
        │ (does NOT flip messenger_provider — manual SQL flip, mirrors P38 D-06)
        ▼
     workspace_meta_accounts row (channel='facebook', page_id, token)

INBOUND (per message)
  Meta → POST /api/webhooks/meta   (object === 'page')
    → verifyMetaHmac(rawBody, X-Hub-Signature-256, META_APP_SECRET)   [existing, reused]
    → NEW branch: object === 'page'
        → entry[].messaging[]  → sender.id (PSID), recipient.id (page_id), message.text/attachments
        → resolveByPageId(recipient.id) → workspaceId   [existing resolver]
        → unknown page → ack 200 & drop  (no cross-tenant leak)
        → processMessengerWebhook(payload, workspaceId, pageId)   [NEW, clone of processManyChatWebhook]
            → findOrCreateConversation({ phone:`fb-${PSID}`, channel:'facebook', externalSubscriberId: PSID })
            → resolve-or-create contact by (page_id, PSID)   [D-04, no fuzzy match]
            → fetch GET /{PSID}?fields=first_name,last_name,profile_pic  → display name/avatar
            → domain receiveMessage(...)  → realtime → inbox

OUTBOUND (human agent reply)
  Inbox compose → server action sendTextMessage/sendMediaMessage
    → load conversation (channel='facebook', external_subscriber_id=PSID, last_customer_message_at)
    → 24h window check (D-09):
         inside 24h          → messaging_type: RESPONSE
         24h–7d + HA feature → messaging_type: MESSAGE_TAG, tag: HUMAN_AGENT
         else                → BLOCK with explanation
    → domain sendTextMessage(channel:'facebook')
        → readMessengerProvider(workspaceId)   [NEW chokepoint, Regla 3]
            meta_direct → metaFacebookSender (Send API, Page token from resolveByWorkspace)
            manychat    → manychatFacebookSender (BYTE-IDENTICAL, Regla 6)
        → store outbound message row
```

### Recommended Project Structure
```
src/lib/meta/
├── messenger-connect.ts     # NEW: exchangeForLongLivedUserToken, getPageToken (me/accounts), subscribePage
├── messenger-api.ts         # NEW: sendMessengerText, sendMessengerImage, getMessengerUserProfile
├── credentials.ts           # EXISTING: resolveByPageId already present — reuse as-is
src/lib/channels/
├── meta-facebook-sender.ts  # NEW: metaFacebookSender (creds-object shape, mirrors meta-whatsapp-sender.ts)
src/lib/messenger/           # OR reuse src/lib/whatsapp/ pattern
├── webhook-handler.ts       # NEW: processMessengerWebhook (clone of manychat/webhook-handler.ts)
src/app/actions/
├── meta-onboarding.ts       # EXTEND: add connectFacebookPage() server action
src/app/api/webhooks/meta/route.ts  # EXTEND: add object==='page' branch
src/lib/domain/messages.ts   # EXTEND: readMessengerProvider + facebook arm in send fns
supabase/migrations/
├── 20260604xxxxxx_add_messenger_provider.sql  # NEW (Regla 5 — apply before deploy)
```

### Pattern 1: Provider-flag chokepoint (mirror `readWhatsappProvider`)
**What:** A single domain-layer read of `workspaces.messenger_provider` that branches `meta_direct` vs `manychat`. Default/null → `'manychat'` (Regla 6).
**When to use:** Inside `sendTextMessage` / `sendMediaMessage` for `channel === 'facebook'`, exactly where `readWhatsappProvider` is read for WhatsApp.
**Example:**
```typescript
// Source: src/lib/domain/messages.ts:44-54 (adapt for messenger)  [VERIFIED: codebase]
async function readMessengerProvider(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string
): Promise<'manychat' | 'meta_direct'> {
  const { data: ws } = await supabase
    .from('workspaces')
    .select('messenger_provider')
    .eq('id', workspaceId)
    .single()
  return ws?.messenger_provider === 'meta_direct' ? 'meta_direct' : 'manychat'
}
```

### Pattern 2: Creds-object ChannelSender (mirror `metaWhatsappSender`)
**What:** A sender that implements the ChannelSender shape but takes a `{ accessToken, pageId }` creds object instead of an `apiKey` string, and is NOT registered in the channel-keyed `registry.ts` map (the domain branch imports it directly).
**When to use:** `metaFacebookSender` for the meta_direct facebook arm.
**Example:**
```typescript
// Source: src/lib/channels/meta-whatsapp-sender.ts (structural mirror)  [VERIFIED: codebase]
export interface MetaPageCreds { accessToken: string; pageId: string }

export const metaFacebookSender = {
  async sendText(creds: MetaPageCreds, psid: string, text: string, tag?: 'HUMAN_AGENT') {
    const resp = await sendMessengerText(creds.accessToken, creds.pageId, psid, text, tag)
    return { success: true, externalMessageId: resp.message_id }
  },
  async sendImage(creds: MetaPageCreds, psid: string, imageUrl: string, caption?: string, tag?: 'HUMAN_AGENT') {
    const resp = await sendMessengerImage(creds.accessToken, creds.pageId, psid, imageUrl, tag)
    // Messenger has no native image caption — send caption as a follow-up text (mirror manychatFacebookSender)
    return { success: true, externalMessageId: resp.message_id }
  },
}
```

### Pattern 3: Unified webhook `object==='page'` branch
**What:** Add a Messenger branch to the existing route AFTER HMAC verify and BEFORE the WhatsApp `phone_number_id` extraction. Today the route hard-rejects non-`whatsapp_business_account` at line 116 — that 400 must become a branch.
**When to use:** `src/app/api/webhooks/meta/route.ts`.
**Example:**
```typescript
// Source: adapt route.ts:116 + manychat/webhook-handler.ts  [VERIFIED: codebase]
if (payload.object === 'page') {
  for (const entry of payload.entry ?? []) {
    const pageId = entry.id
    const creds = await resolveByPageId(pageId)           // existing resolver
    if (!creds) { /* ack & drop unknown page */ continue }
    for (const ev of entry.messaging ?? []) {
      if (ev.message && !ev.message.is_echo) {            // ignore our own echoes
        await processMessengerWebhook(ev, creds.workspaceId, pageId)
      }
      // ignore delivery / read receipts for inbox-only V1
    }
  }
  return NextResponse.json({ received: true }, { status: 200 })
}
// ... existing whatsapp_business_account handling continues below
```

### Anti-Patterns to Avoid
- **Treating PSID as a phone number:** PSIDs are page-scoped and can exceed `Number.MAX_SAFE_INTEGER` — ALWAYS handle as strings, never `Number()` them (the manychat client already does manual JSON string building for this reason — `src/lib/manychat/api.ts:31`). `[VERIFIED: codebase]`
- **Fuzzy-matching PSID contacts to phone/email contacts:** Explicitly rejected (D-04/D-05). Create-or-get strictly by `(page_id, PSID)`. Auto-merge is a manual operator action only.
- **Flipping `messenger_provider` during connect:** Connecting a Page must NOT change the active provider (mirror P38 D-06 — connect inserts the row `is_active`, traffic stays on manychat until a manual SQL flip).
- **Sending outside 24h without a tag, or with a deprecated tag:** Will fail (error 10 / 100 family). Never send `CONFIRMED_EVENT_UPDATE`/`ACCOUNT_UPDATE`/`POST_PURCHASE_UPDATE` — removed April 2026.
- **Registering `metaFacebookSender` in the channel-keyed `registry.ts` map:** That map (`facebook: manychatFacebookSender`) must stay byte-identical (Regla 6). The meta_direct sender is domain-imported, exactly like `metaWhatsappSender`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC signature verify | A new verifier | Existing `verifyMetaHmac` in `route.ts` (exported) | Already timing-safe + handles `sha256=` prefix; tested in P38 |
| Page-id → workspace routing | A new lookup | Existing `resolveByPageId(pageId)` | Already written, scoped, decrypts token `[VERIFIED: credentials.ts:90]` |
| Token encryption at rest | Custom crypto | Existing `encryptToken`/`decryptToken` (AES-256-GCM) | Same contract as BISUAT (T-38-14) |
| Token storage write path | Inline Supabase insert | Existing `upsertMetaAccount` (extend for `channel:'facebook'`) | Regla 3 sole write path; UNIQUE(page_id) conflict already mapped |
| Graph API request/error handling | New fetch wrapper | Existing `metaRequest<T>` | Pinned version, Bearer auth, `MetaGraphApiError` parsing |
| Conversation find-or-create + channel | New conversation logic | Existing `findOrCreateConversation({ channel:'facebook', externalSubscriberId })` | Already channel-aware, UNIQUE by (workspace, phone, channel) `[VERIFIED: conversations.ts:315]` |
| 24h window field | New tracking column | Existing `conversations.last_customer_message_at` | Already used by the WhatsApp window check `[VERIFIED: messages action]` |
| Long-lived Page token derivation | Manual OAuth dance from scratch | Standard `oauth/access_token?grant_type=fb_exchange_token` + `me/accounts` | Documented Meta flow; Page token from a long-lived user token never expires |

**Key insight:** Phase 40 is ~80% wiring of existing, proven modules. The genuinely NEW code is: the FB.login Page-connect popup + token-exchange chain, the `metaFacebookSender`, the `processMessengerWebhook` handler, the `messenger_provider` column + chokepoint branch, and the HUMAN_AGENT window logic. Everything else is reuse.

## Common Pitfalls

### Pitfall 1: Sending outside the 24h window with a dead or missing tag (POLICY — highest risk)
**What goes wrong:** A human agent replies after 24h; the send fails or (worse) violates Meta policy. Old tags (`CONFIRMED_EVENT_UPDATE` etc.) now return error 100 (removed 2026-04-27).
**Why it happens:** Training data and old tutorials list deprecated tags as valid; the only survivor is `HUMAN_AGENT`.
**How to avoid:** Window-gate every facebook send. Inside 24h → `messaging_type: RESPONSE`. 24h–7d AND the app has the **Human Agent feature granted** → `messaging_type: MESSAGE_TAG, tag: HUMAN_AGENT`. Otherwise → block with a clear Spanish message ("Ventana de 24h cerrada. Activa el permiso Human Agent o espera a que el cliente escriba."). `[VERIFIED: multiple 2026 sources — see Sources]`
**Warning signs:** Send returns error code 10 (permission) or 100 (deprecated tag); message silently not delivered.

### Pitfall 2: Assuming HUMAN_AGENT works without App Review
**What goes wrong:** Code sends `tag: HUMAN_AGENT` but the app never applied for the "Human Agent" permission → rejected.
**Why it happens:** The 7-day window is widely described but the permission gate is often omitted.
**How to avoid:** The **"Human Agent" permission/feature must be requested in App Dashboard → Permissions and Features and approved via App Review** before HUMAN_AGENT works. Treat it as an operator/setup prerequisite (like SETUP-01). Until granted, the inbox should treat 24h–7d sends as blocked. Plan should surface a config flag/check for whether the feature is granted. `[VERIFIED: developers.facebook.com/docs/features-reference/human-agent + chatwoot/sleekflow 2026]`
**Warning signs:** error code 10 ("This message is sent outside of allowed window").

### Pitfall 3: Short-lived Page token (1-hour expiry)
**What goes wrong:** Page token works for an hour then dies; inbound subscription stays but sends start failing.
**Why it happens:** If you derive the Page token from a **short-lived** user token, the Page token is valid only 1 hour. Only a Page token derived from a **long-lived** user token never expires.
**How to avoid:** Always: short-lived user token → `oauth/access_token?grant_type=fb_exchange_token` (long-lived user, ~60d) → `GET /me/accounts` (or `/{user-id}/accounts`) to read the Page's `access_token` (now non-expiring). Store THAT. `[VERIFIED: developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/]`
**Warning signs:** Sends fail ~1h after connect with token-expired errors.

### Pitfall 4: Page not subscribed to the app (no inbound)
**What goes wrong:** Webhook is configured at app level but the specific Page is not subscribed → zero inbound events.
**Why it happens:** Messenger requires a **per-Page** subscription (`POST /{page-id}/subscribed_apps`) using the **Page token**, distinct from the WhatsApp WABA `subscribed_apps` call (which uses the BISUAT and no fields). It's easy to copy the WABA flow and forget the Page-level subscribe.
**How to avoid:** In `connectFacebookPage()`, after storing the token, call `POST /{page-id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks` with the Page token. Verify `success:true`. `[VERIFIED: multiple 2026 webhook guides]`
**Warning signs:** Connect succeeds, sends work, but no inbound messages ever arrive.

### Pitfall 5: PSID integer overflow / wrong recipient field
**What goes wrong:** PSID parsed as a JS number loses precision; or the agent replies to `page_id` instead of `sender.id`.
**Why it happens:** PSIDs exceed `Number.MAX_SAFE_INTEGER`; on inbound, `sender.id` = customer PSID, `recipient.id` = your page_id — swapping them sends to yourself.
**How to avoid:** Keep PSID as a string end-to-end (store in `conversations.external_subscriber_id`, recipient = that string). Recipient for outbound = the customer PSID. The manychat path already treats subscriber_id as a string for this reason. `[VERIFIED: codebase manychat/api.ts]`
**Warning signs:** "Invalid recipient" errors; messages echoing to the page.

### Pitfall 6: Processing echo / delivery / read events as inbound messages
**What goes wrong:** The inbox shows duplicate/garbage "messages" from `message_echoes`, `delivery`, `read` events.
**Why it happens:** A subscribed Page emits many event types in `entry[].messaging[]`.
**How to avoid:** For V1 inbox-only, process ONLY `ev.message` where `ev.message.is_echo !== true`. Ignore `ev.delivery`, `ev.read`, `ev.postback` (P40 has no buttons). `[VERIFIED: webhook-events/messages docs + 2026 guides]`
**Warning signs:** Self-sent messages reappearing as inbound.

### Pitfall 7: `messenger_provider` migration not applied before deploy (Regla 5)
**What goes wrong:** Deployed code reads `workspaces.messenger_provider`; column doesn't exist in prod → every facebook send errors (the exact failure class Regla 5 exists to prevent).
**How to avoid:** Sequence the migration as its OWN step applied to prod and confirmed by the user BEFORE pushing any code that references the column. Default `'manychat'`, zero backfill. See Runtime State Inventory.
**Warning signs:** `column "messenger_provider" does not exist` in prod logs.

## Code Examples

Verified payloads from official sources (cross-checked across multiple 2026 references).

### Send a Messenger text (inside 24h — RESPONSE)
```typescript
// Source: developers.facebook.com/docs/messenger-platform/reference/send-api  [CITED]
// POST https://graph.facebook.com/v22.0/{PAGE_ID}/messages  (Bearer = Page Access Token)
{
  "messaging_type": "RESPONSE",
  "recipient": { "id": "<PSID string>" },
  "message": { "text": "Hola 👋" }
}
```

### Send a Messenger text OUTSIDE 24h (24h–7d, human agent)
```typescript
// Source: Send API + message-tags docs  [CITED] [VERIFIED across 2026 sources]
// Requires the "Human Agent" feature granted via App Review.
{
  "messaging_type": "MESSAGE_TAG",
  "tag": "HUMAN_AGENT",
  "recipient": { "id": "<PSID string>" },
  "message": { "text": "Seguimos disponibles para ayudarte 🙂" }
}
```

### Send a Messenger image by URL
```typescript
// Source: developers.facebook.com/docs/messenger-platform/reference/send-api (attachments)  [CITED]
// Max attachment 25 MB; max image resolution 85 MP. is_reusable returns an attachment_id for reuse.
{
  "messaging_type": "RESPONSE",          // or MESSAGE_TAG + tag for outside-window
  "recipient": { "id": "<PSID string>" },
  "message": {
    "attachment": {
      "type": "image",
      "payload": { "url": "https://.../image.jpg", "is_reusable": true }
    }
  }
}
// NOTE: image attachments have NO caption field. Send the caption as a separate
// text message (this is exactly what manychatFacebookSender.sendImage already does).  [VERIFIED: codebase]
```

### Fetch the Messenger user profile (PSID → name/avatar, D-04)
```typescript
// Source: developers.facebook.com/docs/messenger-platform/identity/user-profile  [CITED]
// GET https://graph.facebook.com/v22.0/{PSID}?fields=first_name,last_name,profile_pic  (Bearer = Page token)
// first_name, last_name, profile_pic remain available in 2026 via the Page token for a user
// who has messaged the Page. profile_pic URLs are short-lived (cache the image, not the URL).
// Treat as best-effort: on failure, fall back to `FB-${PSID}` display name (mirror manychat handler).
```

### Webhook inbound shape (`object==='page'`)
```jsonc
// Source: developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages  [CITED]
{
  "object": "page",
  "entry": [{
    "id": "<PAGE_ID>",                    // route to workspace via resolveByPageId
    "time": 1700000000000,
    "messaging": [{
      "sender":    { "id": "<PSID>" },    // the customer — outbound recipient
      "recipient": { "id": "<PAGE_ID>" }, // your page
      "timestamp": 1700000000000,
      "message": {
        "mid": "m_xxx",                   // dedup key (store as message external id)
        "text": "hola",
        "attachments": [                  // optional
          { "type": "image", "payload": { "url": "https://..." } }
        ]
        // "is_echo": true  → SKIP (our own outbound)
      }
    }]
  }]
}
```

### Page connect: token exchange + Page token + subscribe
```typescript
// Source: facebook-login/guides/access-tokens/get-long-lived + me/accounts  [CITED]
// 1. (client) FB.login({ scope: 'pages_messaging,instagram_basic,instagram_manage_messages', ... })
//    → short-lived user access token (or code → exchange)
// 2. (server) long-lived user token:
//    GET /oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=SECRET&fb_exchange_token=SHORT
// 3. (server) Page token (never expires when derived from long-lived user token):
//    GET /me/accounts?fields=id,name,access_token   → pick the Page → page.access_token
// 4. (server) encryptToken(page.access_token) → upsertMetaAccount({ channel:'facebook', pageId: page.id, accessTokenEncrypted })
// 5. (server) subscribe the Page to our app:
//    POST /{page-id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks   (Bearer = Page token)
```

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|--------------|-------------------------|--------------|--------|
| Message tags: `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`, `POST_PURCHASE_UPDATE` | **Removed** — API returns error 100 | **2026-04-27** | Only `HUMAN_AGENT` survives for outside-window human sends |
| Recurring Notifications (RN) | Discontinued globally except AU/EU/JP/KR/UK | 2026-02-10 | Not relevant to P40 (human inbox), but rules out RN as a window workaround |
| Generic "messaging" via ManyChat | Native Graph API Messenger Send | This phase | Removes the ManyChat dependency for migrated workspaces |
| Graph API < v22.0 | **v22.0** | Enforced Sep 2025 | Already pinned in repo |

**Deprecated/outdated:**
- The three classic message tags above — DEAD as of 2026-04-27. Do not reference them.
- `me/messages` with implicit v2.6 in old tutorials — use the pinned `v22.0` base URL from `constants.ts`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `response_type` for the FB Page connect popup can be `'token'` (implicit) OR `'code'`; the repo's WhatsApp flow uses `'code'` + server exchange. P40 should prefer `'code'` for parity and to keep the secret server-side. | Code Examples (connect) | LOW — both are valid Facebook Login flows; `code` is the safer/standard choice and matches existing infra. Confirm exact `extras`/scope string at plan time. |
| A2 | `profile_pic` is still returned by the User Profile API in 2026 via a Page token for a user who messaged the Page. | Code Examples (profile) | MEDIUM — Meta has historically tightened profile fields. Display name (`first_name`/`last_name`) is the critical field; treat `profile_pic` as best-effort and degrade gracefully if absent. |
| A3 | The exact IG messaging scope string for D-02 forward-compat (`instagram_manage_messages` + `instagram_basic`, or the newer `instagram_business_manage_messages`). | Connect | MEDIUM — IG scope names changed with the IG-with-Facisbook-Login migration. P40 only needs `pages_messaging` to function; the IG scope is additive/forward-compat (D-02 graceful no-op). Confirm the current IG scope string at plan time; a wrong IG scope must NOT block the FB flow. |
| A4 | One Meta app + one callback URL handles `object==='page'` alongside `whatsapp_business_account` (app-level webhook, per-Page subscription). | Webhook | LOW — verified by docs; the unified webhook (HOOK-01) is already designed for this. |

**These four `[ASSUMED]`/`[MEDIUM]` items should be confirmed during planning** (A1, A3 by reading the current Meta Login + IG-messaging docs/app config; A2, A3 are non-blocking because they degrade gracefully).

## Open Questions

1. **Is the "Human Agent" feature already granted on MorfX's Meta app?**
   - What we know: HUMAN_AGENT requires App Review approval of the "Human Agent" permission/feature; it is not default.
   - What's unclear: Whether MorfX's existing app (from SETUP-01) already has it, or needs a new App Review submission.
   - Recommendation: Plan a setup/prerequisite check. Until granted, the inbox blocks 24h–7d sends and shows a clear message. Add a config/env flag (e.g. `META_HUMAN_AGENT_ENABLED`) the send-gate reads so the feature can be turned on once approved without a code change.

2. **Should P40 emit the Inngest agent event on inbound, or skip it (D-12 human-only)?**
   - What we know: The manychat handler dispatches `agent/whatsapp.message_received`; D-12 defers AI agents on meta_direct Messenger.
   - What's unclear: Whether to wire the dispatch now (inert until a future agent phase) or omit it.
   - Recommendation: Omit the agent dispatch in P40 (cleaner, no dormant code path). The inbound path only needs: store message → realtime → inbox. A later phase adds the dispatch when AI is in scope.

3. **Exact IG messaging scope string (D-02 forward-compat).**
   - See Assumption A3. Non-blocking; confirm at plan time. The FB connect must succeed even if the IG scope is denied (graceful no-op).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Meta app (WhatsApp+Messenger products, App Secret) | All Meta calls | ✓ (SETUP-01 Phase 37 complete) | — | — |
| `META_APP_ID` / `META_APP_SECRET` / `META_WEBHOOK_VERIFY_TOKEN` | Connect + webhook | ✓ (used by P38) | — | — |
| `workspace_meta_accounts` table w/ `page_id` UNIQUE + `channel` CHECK incl. 'facebook' | Token storage + routing | ✓ | migration 20260401100000 | — |
| `resolveByPageId` resolver | Inbound routing | ✓ | credentials.ts:90 | — |
| Facebook JS SDK (`window.FB`) | Connect popup | ✓ (loaded in connect-whatsapp.tsx) | — | — |
| **"Human Agent" App Review feature** | Outside-24h sends (D-09) | **✗ / UNKNOWN** | — | Block 24h–7d sends until granted; inside-24h sends unaffected |
| `messenger_provider` column | Provider chokepoint | **✗ (this phase creates it)** | — | none — must be created (Regla 5) |
| `NEXT_PUBLIC_META_FB_CONNECT_*` (config/app id for FB Login) | Connect popup | likely reuses existing `META_APP_ID` | — | — |

**Missing dependencies with no fallback:**
- `messenger_provider` column — created by this phase's migration (Regla 5, apply before deploy).

**Missing dependencies with fallback:**
- "Human Agent" App Review feature — if not yet granted, the phase still ships fully functional for inside-24h conversations; outside-window sends are blocked with a clear message until the feature is approved (gate behind a config flag).

## Validation Architecture

> `.planning/config.json` not inspected for `nyquist_validation`; included per default-enabled rule. Confirm framework at plan time.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (repo standard — used across `__tests__/` dirs, e.g. interruption-system-v2) |
| Config file | repo vitest config (existing) |
| Quick run command | `npx vitest run src/lib/meta/__tests__/messenger-*.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FB-01 | inbound `object==='page'` → routed by page_id → message stored | unit | `npx vitest run src/lib/messenger/__tests__/webhook-handler.test.ts` | ❌ Wave 0 |
| FB-02 | text + image Send API payloads (RESPONSE + MESSAGE_TAG/HUMAN_AGENT) shaped correctly | unit | `npx vitest run src/lib/meta/__tests__/messenger-api.test.ts` | ❌ Wave 0 |
| FB-03 | create-or-get contact by (page_id, PSID), no fuzzy match | unit | `npx vitest run src/lib/messenger/__tests__/psid-contact.test.ts` | ❌ Wave 0 |
| FB-04 | conversation channel='facebook' + Messenger indicator | unit/UI | `npx vitest run src/lib/domain/__tests__/conversations-fb.test.ts` | ❌ Wave 0 |
| SIGNUP-04 | connect action stores Page token + page_id, subscribes Page | unit | `npx vitest run src/app/actions/__tests__/connect-facebook.test.ts` | ❌ Wave 0 |
| MIG-02 | provider chokepoint defaults manychat; meta_direct routes metaFacebookSender; manychat byte-identical | unit | `npx vitest run src/lib/domain/__tests__/messenger-provider.test.ts` | ❌ Wave 0 |
| D-09 | window gate: inside 24h RESPONSE; 24h–7d HUMAN_AGENT; else BLOCK | unit | `npx vitest run src/app/actions/__tests__/messenger-window.test.ts` | ❌ Wave 0 |
| Regla 6 | `manychatFacebookSender` + `registry.ts` map byte-identical (git diff) | grep/diff | `git diff --stat src/lib/channels/manychat-sender.ts src/lib/channels/registry.ts` returns empty post-impl | ✅ verifiable |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test file>`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green + Regla-6 byte-identical diff check before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/messenger/__tests__/webhook-handler.test.ts` — FB-01 inbound routing
- [ ] `src/lib/meta/__tests__/messenger-api.test.ts` — FB-02 send payloads + tag logic
- [ ] `src/lib/messenger/__tests__/psid-contact.test.ts` — FB-03 PSID resolution
- [ ] `src/app/actions/__tests__/connect-facebook.test.ts` — SIGNUP-04 connect
- [ ] `src/lib/domain/__tests__/messenger-provider.test.ts` — MIG-02 chokepoint + Regla 6
- [ ] `src/app/actions/__tests__/messenger-window.test.ts` — D-09 window/tag gate

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Owner-only connect via `getRequestAuth` + `workspace_members.role==='owner'` (copy `meta-onboarding.ts` gate) |
| V3 Session Management | no | Stateless server actions; no new sessions |
| V4 Access Control | yes | `workspaceId` ALWAYS session-derived, NEVER from request body (T-38-10/T-39-02); webhook routes only via `resolveByPageId` (no payload-supplied workspace) |
| V5 Input Validation | yes | Validate webhook shape before use; PSID kept as string; HMAC verify before JSON parse (existing) |
| V6 Cryptography | yes | `encryptToken`/`decryptToken` (AES-256-GCM) for the Page token; never log/decrypt token outside resolver; HMAC via `crypto.timingSafeEqual` (existing) |

### Known Threat Patterns for Meta Messenger + Next.js

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook (spoofed inbound) | Spoofing | `verifyMetaHmac` over RAW body with `META_APP_SECRET` BEFORE parse — reuse existing |
| Cross-tenant message injection (unknown page_id) | Tampering / EoP | `resolveByPageId` → unknown page → ack 200 & drop; never process with null workspace |
| Page Access Token leakage | Info Disclosure | Encrypt at rest; never log; decrypt only in `credentials.ts` resolver |
| `META_APP_SECRET` in client | Info Disclosure | Token exchange is server-only (mirror `embedded-signup.ts` SERVER-ONLY rule) |
| Replay / Meta retries (up to 7×) | — | Dedup by `message.mid` (HOOK-04 pattern); idempotent receiveMessage |
| Policy violation (outside-window send) | Repudiation / account risk | D-09 window+HUMAN_AGENT gate; block when no valid tag/feature |

## Sources

### Primary (HIGH confidence)
- Codebase (read directly this session): `src/lib/meta/{api,constants,credentials,embedded-signup,token}.ts`, `src/lib/domain/{meta-accounts,messages,contacts,conversations}.ts`, `src/lib/channels/{types,registry,manychat-sender,meta-whatsapp-sender}.ts`, `src/lib/manychat/{api,webhook-handler}.ts`, `src/app/api/webhooks/meta/route.ts`, `src/app/actions/{meta-onboarding,messages}.ts`, `src/components/settings/connect-whatsapp.tsx`, `supabase/migrations/{20260401100000_create_workspace_meta_accounts,20260602120000_add_whatsapp_provider}.sql`
- developers.facebook.com/docs/messenger-platform/reference/send-api/ — Send API payloads, messaging_type, tags
- developers.facebook.com/docs/features-reference/human-agent — Human Agent permission/App Review requirement
- developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/ — long-lived user → Page token (never expires)
- developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages/ — webhook `object==='page'` shape
- developers.facebook.com/docs/messenger-platform/identity/user-profile — PSID profile fields
- developers.facebook.com/docs/messenger-platform/reference/attachment-upload-api — image attachment / 25MB / 85MP limits

### Secondary (MEDIUM confidence — cross-verified the policy timeline)
- chatimize.com/facebook-messenger-policy/ (2026) — message tag deprecation timeline, HUMAN_AGENT survival
- chatwoot.com/hc/user-guide/articles/.../human-agent-tag — HUMAN_AGENT 7-day window, App Dashboard permission step
- sleekflow.io/blog/ultimate-guide-to-the-new-facebook-message-tags — 2026 tag landscape, HUMAN_AGENT not deprecated
- help.genesys.cloud / sprinklr / respond.io — corroborating tag deprecation (error 100 from 2026-04-27) + Send API tag payload

### Tertiary (LOW confidence — informational only)
- Various webhook setup guides (messengerbot.app 2026, rollout.com) — `subscribed_apps` per-Page subscription corroboration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against actual repo files; zero new packages
- Architecture: HIGH — direct structural mirror of shipped P38/P39 code that was read this session
- Pitfalls (codebase): HIGH — derived from existing code (PSID-as-string, byte-identical Regla 6, provider chokepoint)
- Pitfalls (Meta policy / tags): MEDIUM-HIGH — cross-verified across 5+ current 2026 sources; the deprecation timeline + HUMAN_AGENT survival is consistent everywhere
- Token lifecycle: HIGH — standard documented Facebook Login flow
- IG scope string (A3) / profile_pic availability (A2): MEDIUM — flagged for plan-time confirmation; both degrade gracefully

**Research date:** 2026-06-04
**Valid until:** 2026-07-04 (30 days; Meta messaging policy is fast-moving — re-verify the HUMAN_AGENT permission status and any new tag deprecations before the outbound-window plan is executed)
