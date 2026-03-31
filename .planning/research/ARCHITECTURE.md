# Architecture: Meta Direct Integration into MorfX

**Domain:** Multi-channel messaging platform (WhatsApp + Facebook + Instagram)
**Researched:** 2026-03-31
**Focus:** How direct Meta API integration fits into existing MorfX architecture

## Executive Summary

MorfX currently uses 360dialog as WhatsApp BSP and ManyChat for Facebook/Instagram. Direct Meta integration replaces both intermediaries with Meta's Graph API (Cloud API), using Embedded Signup for onboarding, System User tokens for API access, and a unified webhook for all channels.

The existing architecture is well-prepared for this migration:
- The `ChannelSender` interface already abstracts send operations
- The domain layer already mediates all mutations
- The webhook handler already parses WhatsApp Cloud API payloads (360dialog proxies them)
- Workspace settings JSONB already stores per-tenant credentials

The migration is **evolutionary, not revolutionary** -- most changes are adding a new provider alongside existing ones, not replacing them.

## Current Architecture (As-Is)

```
Inbound:
  360dialog webhook --> /api/webhooks/whatsapp/route.ts --> webhook-handler.ts --> domain/messages.ts --> Inngest event
  ManyChat webhook  --> /api/webhooks/manychat/route.ts --> manychat/webhook-handler.ts --> domain/messages.ts --> Inngest event

Outbound:
  Agent/Action --> domain/messages.ts --> channels/registry.ts --> whatsapp-sender.ts (360dialog) | manychat-sender.ts
                                                                         |
                                                                    whatsapp/api.ts (D360-API-KEY header, waba-v2.360dialog.io)

Credentials:
  workspaces.settings JSONB: { whatsapp_api_key, whatsapp_phone_number_id, manychat_api_key }
  Fallback: process.env.WHATSAPP_API_KEY, process.env.WHATSAPP_PHONE_NUMBER_ID
```

### Key Files

| File | Role |
|------|------|
| `src/lib/whatsapp/api.ts` | 360dialog API client (send text/media/template/button, download media) |
| `src/lib/whatsapp/webhook-handler.ts` | Process inbound WA messages + status updates |
| `src/lib/whatsapp/templates-api.ts` | 360dialog template CRUD |
| `src/lib/whatsapp/types.ts` | Webhook payload types (Cloud API format) |
| `src/lib/channels/types.ts` | ChannelSender interface (sendText, sendImage) |
| `src/lib/channels/registry.ts` | Maps ChannelType to sender implementation |
| `src/lib/channels/whatsapp-sender.ts` | WhatsApp sender via 360dialog |
| `src/lib/channels/manychat-sender.ts` | Facebook/Instagram sender via ManyChat |
| `src/lib/domain/messages.ts` | Domain layer: send + receive messages |
| `src/app/api/webhooks/whatsapp/route.ts` | WA webhook endpoint (HMAC verify, workspace resolve) |
| `src/app/api/webhooks/manychat/route.ts` | ManyChat webhook endpoint |
| `src/lib/agents/engine-adapters/production/messaging.ts` | Agent message sending adapter |

---

## Target Architecture (To-Be)

```
Inbound:
  Meta webhook --> /api/webhooks/meta/route.ts --> meta/webhook-router.ts
                                                       |
                                    +------------------+------------------+
                                    v                  v                  v
                            wa-handler.ts      fb-handler.ts      ig-handler.ts
                                    |                  |                  |
                                    +------------------+------------------+
                                                       v
                                              domain/messages.ts --> Inngest event

  360dialog webhook --> /api/webhooks/whatsapp/route.ts  (PRESERVED for legacy workspaces)
  ManyChat webhook  --> /api/webhooks/manychat/route.ts  (PRESERVED for legacy workspaces)

Outbound:
  Agent/Action --> domain/messages.ts --> channels/registry.ts --> meta-whatsapp-sender.ts (Cloud API direct)
                                                                   meta-facebook-sender.ts (Messenger API)
                                                                   meta-instagram-sender.ts (IG Messaging API)
                                                                   whatsapp-sender.ts (360dialog, legacy)
                                                                   manychat-sender.ts (ManyChat, legacy)

Credentials:
  workspace_meta_accounts table: { waba_id, phone_number_id, page_id, ig_account_id, access_token (encrypted) }
  workspaces.settings JSONB: { provider: 'meta_direct' | '360dialog' | 'manychat', ... }
```

---

## 1. Webhook Consolidation

### Decision: NEW unified route, keep existing routes

**Do NOT replace** `/api/webhooks/whatsapp/route.ts` -- it serves active 360dialog clients.
**Do NOT replace** `/api/webhooks/manychat/route.ts` -- it serves active ManyChat clients.
**ADD** `/api/webhooks/meta/route.ts` -- unified endpoint for all Meta direct events.

### Why One Unified Meta Endpoint

Meta's webhook system sends ALL subscribed events to a single callback URL per app. The `object` field differentiates:
- `"whatsapp_business_account"` -- WhatsApp messages and statuses
- `"page"` -- Facebook Messenger messages
- `"instagram"` -- Instagram DM messages

One webhook URL is configured in the Meta App Dashboard and serves all channels.

### New Route: `/api/webhooks/meta/route.ts`

**Responsibilities:**
1. GET: Hub challenge verification (same as existing WA webhook -- `hub.mode`, `hub.verify_token`, `hub.challenge`)
2. POST: HMAC-SHA256 verification using `X-Hub-Signature-256` header + app secret
3. Parse `payload.object` to determine channel type
4. Route to appropriate handler based on object type
5. Return 200 immediately (must respond within 20 seconds)

**Key design:**
```typescript
// Pseudocode for route.ts
export async function POST(request: NextRequest) {
  // 1. HMAC verify with META_APP_SECRET
  // 2. Parse payload
  // 3. Route by object type:
  switch (payload.object) {
    case 'whatsapp_business_account':
      return handleWhatsAppEvents(payload, rawBody)
    case 'page':
      return handleFacebookEvents(payload)
    case 'instagram':
      return handleInstagramEvents(payload)
  }
}
```

**Workspace resolution for Meta direct:**
- WhatsApp: `phone_number_id` from payload -> lookup `workspace_meta_accounts.phone_number_id`
- Facebook: `page_id` from `entry[].id` -> lookup `workspace_meta_accounts.page_id`
- Instagram: `ig_account_id` from entry -> lookup `workspace_meta_accounts.ig_account_id`

### New Files

| File | Purpose |
|------|---------|
| `src/app/api/webhooks/meta/route.ts` | Unified Meta webhook endpoint |
| `src/lib/meta/webhook-router.ts` | Routes parsed payload to channel-specific handlers |
| `src/lib/meta/handlers/whatsapp.ts` | WhatsApp event processor (reuses 90% of existing webhook-handler.ts logic) |
| `src/lib/meta/handlers/facebook.ts` | Facebook Messenger event processor |
| `src/lib/meta/handlers/instagram.ts` | Instagram DM event processor |

### Existing webhook-handler.ts Reuse

The existing `src/lib/whatsapp/webhook-handler.ts` already parses Cloud API format payloads (360dialog proxies the same format). The key difference is:
- 360dialog: `D360-API-KEY` header for media downloads, `waba-v2.360dialog.io` base URL
- Meta direct: `Bearer {access_token}` header for media downloads, `graph.facebook.com` base URL

**Strategy:** Extract the message processing logic from `webhook-handler.ts` into shared utilities, then have both the 360dialog handler and Meta direct handler call into them.

---

## 2. Token Storage and Management

### Token Types

| Token | Scope | Lifetime | Per-Workspace |
|-------|-------|----------|---------------|
| App Access Token | `{app_id}\|{app_secret}` | Never expires | NO (global) |
| System User Token | All WABAs owned by business | Never expires (until revoked) | NO (MorfX platform) |
| Business Integration Token | Single customer WABA | Never expires (until revoked) | YES |
| Short-lived User Token | From Embedded Signup code exchange | 1 hour | Temporary |

### Recommended: Business Integration System User Tokens

For multi-tenant SaaS, use **Business Integration System User access tokens** -- one per customer WABA, generated during Embedded Signup code exchange. These tokens:
- Are scoped to the specific customer's WABA (principle of least privilege)
- Never expire (no refresh needed)
- Are revocable per-customer without affecting others

### Storage: New `workspace_meta_accounts` Table

**Do NOT store tokens in workspace settings JSONB.** Tokens need:
- Encryption at rest
- Separate access control
- Structured querying (lookup by phone_number_id, page_id, etc.)

```sql
CREATE TABLE workspace_meta_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Account identifiers
  waba_id TEXT,                    -- WhatsApp Business Account ID
  phone_number_id TEXT,            -- WhatsApp phone number ID
  phone_number TEXT,               -- Display phone number (E.164)
  page_id TEXT,                    -- Facebook Page ID
  ig_account_id TEXT,              -- Instagram account ID
  business_id TEXT,                -- Meta Business Portfolio ID

  -- Encrypted access token (Business Integration System User token)
  access_token_encrypted TEXT NOT NULL,

  -- Channel configuration
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'facebook', 'instagram')),
  provider TEXT NOT NULL DEFAULT 'meta_direct',

  -- Status
  is_active BOOLEAN DEFAULT true,
  verified_at TIMESTAMPTZ,

  -- Metadata
  account_name TEXT,               -- Business display name
  quality_rating TEXT,             -- WhatsApp quality rating
  messaging_limit TEXT,            -- Current messaging tier

  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),

  -- Unique constraints for webhook resolution
  CONSTRAINT uq_meta_phone UNIQUE (phone_number_id),
  CONSTRAINT uq_meta_page UNIQUE (page_id),
  CONSTRAINT uq_meta_ig UNIQUE (ig_account_id)
);

-- Fast webhook resolution indexes
CREATE INDEX idx_meta_accounts_phone ON workspace_meta_accounts(phone_number_id) WHERE phone_number_id IS NOT NULL;
CREATE INDEX idx_meta_accounts_page ON workspace_meta_accounts(page_id) WHERE page_id IS NOT NULL;
CREATE INDEX idx_meta_accounts_ig ON workspace_meta_accounts(ig_account_id) WHERE ig_account_id IS NOT NULL;
CREATE INDEX idx_meta_accounts_workspace ON workspace_meta_accounts(workspace_id);
```

### Token Encryption

Use AES-256-GCM encryption with a server-side key stored in environment variable:

```typescript
// src/lib/meta/token-encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ENCRYPTION_KEY = process.env.META_TOKEN_ENCRYPTION_KEY! // 32-byte hex string
const ALGORITHM = 'aes-256-gcm'

export function encryptToken(token: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: iv:authTag:encrypted (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptToken(encryptedToken: string): string {
  const [ivB64, authTagB64, encryptedB64] = encryptedToken.split(':')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const encrypted = Buffer.from(encryptedB64, 'base64')
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
```

**Environment variable:** `META_TOKEN_ENCRYPTION_KEY` -- a 64-character hex string (32 bytes). Generate once: `openssl rand -hex 32`.

### Provider Selection Per-Workspace

Add to `workspaces.settings` JSONB:

```jsonc
{
  // Existing fields preserved
  "whatsapp_api_key": "...",          // 360dialog (legacy)
  "whatsapp_phone_number_id": "...",  // 360dialog (legacy)
  "manychat_api_key": "...",          // ManyChat (legacy)

  // New field for provider routing
  "whatsapp_provider": "meta_direct", // "meta_direct" | "360dialog" (default for existing)
  "facebook_provider": "meta_direct", // "meta_direct" | "manychat" (default for existing)
  "instagram_provider": "meta_direct" // "meta_direct" | "manychat" (default for existing)
}
```

---

## 3. Channel Sender Refactor

### Current Interface Problem

```typescript
interface ChannelSender {
  sendText(apiKey: string, to: string, text: string): Promise<ChannelSendResult>
  sendImage(apiKey: string, to: string, imageUrl: string, caption?: string): Promise<ChannelSendResult>
}
```

The `apiKey: string` parameter assumes a single credential. Meta direct needs:
- `access_token` (from workspace_meta_accounts)
- `phone_number_id` (for WhatsApp -- the endpoint path includes it)
- Different base URLs

### Solution: Two-Phase Migration

**Phase 1 (Pragmatic):** Keep `apiKey: string` signature. New Meta senders accept the access_token as the `apiKey` parameter and receive `phone_number_id` / `page_id` via a closure or module-level context. This avoids touching ~30+ call sites.

**Phase 2 (Clean):** Migrate to `ChannelCredentials` object:

```typescript
export interface ChannelCredentials {
  apiKey: string
  provider: 'meta_direct' | '360dialog' | 'manychat'
  accountId?: string  // phone_number_id for WA, page_id for FB
}

export interface ChannelSender {
  sendText(creds: ChannelCredentials, to: string, text: string): Promise<ChannelSendResult>
  sendImage(creds: ChannelCredentials, to: string, imageUrl: string, caption?: string): Promise<ChannelSendResult>
  sendTemplate?(creds: ChannelCredentials, to: string, templateName: string, language: string, components?: unknown[]): Promise<ChannelSendResult>
}
```

### New Senders

| File | Provider | Channel |
|------|----------|---------|
| `src/lib/channels/meta-whatsapp-sender.ts` | Meta direct | WhatsApp |
| `src/lib/channels/meta-facebook-sender.ts` | Meta direct | Facebook Messenger |
| `src/lib/channels/meta-instagram-sender.ts` | Meta direct | Instagram DM |

### Updated Registry

```typescript
// src/lib/channels/registry.ts -- updated
export function getChannelSender(channel: ChannelType, provider?: string): ChannelSender {
  if (provider === 'meta_direct') {
    switch (channel) {
      case 'whatsapp': return metaWhatsAppSender
      case 'facebook': return metaFacebookSender
      case 'instagram': return metaInstagramSender
    }
  }
  // Legacy defaults
  switch (channel) {
    case 'whatsapp': return whatsappSender       // 360dialog
    case 'facebook': return manychatFacebookSender
    case 'instagram': return manychatInstagramSender
  }
  return whatsappSender
}
```

### Meta WhatsApp API Client

New file: `src/lib/meta/api.ts`

This replaces `src/lib/whatsapp/api.ts` functionality for Meta direct workspaces:
- Base URL: `https://graph.facebook.com/v21.0`
- Auth: `Authorization: Bearer {access_token}` (not `D360-API-KEY`)
- Endpoint: `/{phone_number_id}/messages` (not `/messages`)
- Same payload format (both are Cloud API -- 360dialog just proxies)

**Key insight:** The message payload body is IDENTICAL between 360dialog and Meta Cloud API. The only differences are:
1. Base URL
2. Auth header format
3. Endpoint path (Meta includes phone_number_id in URL)
4. Media download URL (Meta: graph.facebook.com, 360dialog: waba-v2.360dialog.io proxy)

---

## 4. Embedded Signup Integration

### Where It Lives

Embedded Signup is a **frontend flow** that launches Meta's Facebook Login popup. In Next.js App Router:

```
src/app/(dashboard)/settings/channels/page.tsx     -- Settings UI with "Connect WhatsApp" button
src/app/(dashboard)/settings/channels/components/  -- Embedded Signup React component
src/app/api/meta/exchange-token/route.ts            -- Server-side token exchange endpoint
src/lib/meta/embedded-signup.ts                     -- Token exchange + WABA provisioning logic
```

### Flow

```
1. User clicks "Connect WhatsApp" in Settings
2. Facebook JS SDK launches login popup (FB.login with config_id)
3. User completes signup in Meta's UI (business verification, phone number)
4. sessionInfoListener receives: { waba_id, phone_number_id, code }
5. Frontend POSTs code to /api/meta/exchange-token
6. Server exchanges code for Business Integration token via:
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?client_id={app_id}
     &client_secret={app_secret}
     &code={code}
7. Server stores encrypted token + account IDs in workspace_meta_accounts
8. Server subscribes webhook for the new WABA via:
   POST https://graph.facebook.com/v21.0/{waba_id}/subscribed_apps
9. Server updates workspace settings with provider = 'meta_direct'
10. Frontend shows success, workspace is now on Meta direct
```

### Environment Variables (App-Level, Not Per-Workspace)

```
META_APP_ID=123456789              # Facebook App ID
META_APP_SECRET=abc123...          # Facebook App Secret
META_CONFIG_ID=987654321           # Embedded Signup Configuration ID
META_WEBHOOK_VERIFY_TOKEN=...     # For /api/webhooks/meta GET verification
META_TOKEN_ENCRYPTION_KEY=...     # 32-byte hex for AES-256-GCM
```

---

## 5. Template Management

### Current State

- `src/lib/whatsapp/templates-api.ts` calls 360dialog's `/v1/configs/templates` endpoint
- Templates stored in `whatsapp_templates` table
- UI in settings for template CRUD

### Meta Direct Template API

Meta Cloud API template management uses:
- `POST https://graph.facebook.com/v21.0/{waba_id}/message_templates` -- Create
- `GET https://graph.facebook.com/v21.0/{waba_id}/message_templates` -- List
- `DELETE https://graph.facebook.com/v21.0/{waba_id}/message_templates?name={name}` -- Delete

The payload format is the same as 360dialog (both are Cloud API).

### New File

```
src/lib/meta/templates-api.ts  -- Meta direct template CRUD
```

### Integration with Existing Templates Table

No schema change needed for `whatsapp_templates`. Use the `workspace_meta_accounts` table to determine which API to call:

```typescript
async function syncTemplates(workspaceId: string) {
  const account = await getMetaCredentials(workspaceId, 'whatsapp')
  if (account?.provider === 'meta_direct') {
    return listTemplatesMeta(account.accessToken, account.wabaId)
  } else {
    const apiKey = await get360dialogKey(workspaceId)
    return listTemplates360(apiKey)
  }
}
```

---

## 6. Media Handling

### Current Media Pipeline

```
Inbound:
  360dialog webhook -> mediaId in payload -> downloadMedia(apiKey, mediaId)
    -> 360dialog proxies Facebook CDN -> re-host to Supabase Storage

Outbound:
  Agent sends image URL -> domain/messages.ts -> send360Media(apiKey, to, 'image', url)
```

### Meta Direct Media Pipeline

**Inbound (download):**
```
Meta webhook -> mediaId in payload -> GET graph.facebook.com/v21.0/{mediaId}
  -> returns { url: "https://lookaside.fbsbx.com/..." }
  -> GET url with Authorization: Bearer {token}
  -> re-host to Supabase Storage
```

Key difference: 360dialog replaces `lookaside.fbsbx.com` with their proxy domain. Meta direct accesses Facebook CDN directly with a Bearer token.

**Outbound:** For sending, use `link` field in message payload (same as current approach -- no upload needed if media is publicly accessible). Media upload API only needed for non-public media.

### New File

```
src/lib/meta/media.ts  -- Meta direct media download/upload
```

---

## 7. Multi-Tenant Token Management

### Resolution Flow (Inbound)

```
Webhook arrives with phone_number_id / page_id / ig_account_id
  -> Query workspace_meta_accounts by identifier
  -> Get workspace_id + encrypted access_token
  -> Decrypt token
  -> Process message with correct workspace context
```

### Resolution Flow (Outbound)

```
Domain layer needs to send message for workspace X, channel Y
  -> Query workspace_meta_accounts WHERE workspace_id = X AND channel = Y AND is_active = true
  -> Decrypt access_token
  -> Use token + account_id for API call
```

### Credential Resolution Function

```typescript
// src/lib/meta/credentials.ts
export async function getMetaCredentials(
  workspaceId: string,
  channel: ChannelType
): Promise<MetaCredentials | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspace_meta_accounts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('channel', channel)
    .eq('is_active', true)
    .single()

  if (!data) return null

  return {
    accessToken: decryptToken(data.access_token_encrypted),
    phoneNumberId: data.phone_number_id,
    wabaId: data.waba_id,
    pageId: data.page_id,
    igAccountId: data.ig_account_id,
    provider: data.provider,
  }
}
```

---

## 8. Migration Path: Coexistence Strategy

### Per-Workspace Provider Selection

Each workspace independently chooses its provider per channel:

```jsonc
// Workspace A (legacy -- 360dialog + ManyChat)
{ "whatsapp_provider": "360dialog", "facebook_provider": "manychat", "instagram_provider": "manychat" }

// Workspace B (migrated -- all Meta direct)
{ "whatsapp_provider": "meta_direct", "facebook_provider": "meta_direct", "instagram_provider": "meta_direct" }

// Workspace C (hybrid -- WA migrated, FB/IG still ManyChat)
{ "whatsapp_provider": "meta_direct", "facebook_provider": "manychat", "instagram_provider": "manychat" }
```

### Migration Flow Per Workspace

1. Admin opens Settings > Channels
2. Clicks "Connect via Meta" (launches Embedded Signup)
3. Embedded Signup flow completes
4. System stores Meta credentials in `workspace_meta_accounts`
5. System updates `workspaces.settings.whatsapp_provider = 'meta_direct'`
6. System subscribes Meta webhook for the WABA
7. 360dialog webhook still configured but now dead (no more events from that WABA)
8. Old 360dialog key preserved in settings for rollback

### Rollback

If Meta direct has issues for a workspace:
1. Set `whatsapp_provider = '360dialog'` in settings
2. All outbound traffic immediately routes to 360dialog
3. Inbound requires re-registering the number with 360dialog (non-trivial -- rollback is mainly for outbound)

### Webhook Coexistence

Both webhook endpoints active simultaneously:
- `/api/webhooks/whatsapp/` -- receives 360dialog events (legacy workspaces)
- `/api/webhooks/meta/` -- receives Meta direct events (migrated workspaces)
- `/api/webhooks/manychat/` -- receives ManyChat events (legacy FB/IG workspaces)

No conflict because each workspace's events only arrive at one endpoint.

---

## 9. Database Schema Changes Summary

### New Table: `workspace_meta_accounts`

(Full schema in Section 2 above)

### Modified: `workspaces.settings` JSONB

Add fields:
- `whatsapp_provider`: `'meta_direct' | '360dialog'` (default: `'360dialog'` for existing)
- `facebook_provider`: `'meta_direct' | 'manychat'` (default: `'manychat'` for existing)
- `instagram_provider`: `'meta_direct' | 'manychat'` (default: `'manychat'` for existing)

### No Change Needed

- `whatsapp_templates` -- schema works for both providers
- `messages` -- provider-agnostic, `wamid` works for both
- `conversations` -- already has `channel` field
- `whatsapp_webhook_events` -- raw payload storage works for any source

---

## 10. Inngest Integration

### Current Flow

```
WhatsApp webhook -> processWebhook() -> stores message via domain
                                     -> emits Inngest event 'agent/whatsapp.message_received'
                                     -> Inngest function processes agent response
```

### Meta Direct Flow (Same Pattern)

```
Meta webhook -> meta/handlers/whatsapp.ts -> stores message via domain (SAME path)
                                          -> emits SAME Inngest event 'agent/whatsapp.message_received'
                                          -> SAME Inngest function processes agent response
```

**No Inngest changes needed for WhatsApp.** The webhook handler difference is upstream of the domain layer. By the time the message reaches `domain/messages.ts`, it is provider-agnostic. The Inngest event is emitted by the domain layer, not the webhook handler.

### Facebook/Instagram via Meta Direct

For FB/IG agent processing (if needed later), reuse the existing event with a `channel` field or add new events:
- `agent/facebook.message_received`
- `agent/instagram.message_received`

**Recommendation:** Keep `agent/whatsapp.message_received` for now. Add FB/IG agent events only when those channels need agent processing.

---

## Component Dependency Graph and Build Order

```
Phase 1: Foundation (no external dependencies)
  +-- workspace_meta_accounts table (migration)
  +-- src/lib/meta/token-encryption.ts
  +-- src/lib/meta/credentials.ts
  +-- src/lib/meta/types.ts
  +-- src/lib/meta/api.ts (Cloud API client)

Phase 2: Embedded Signup (depends on Phase 1)
  +-- src/app/api/meta/exchange-token/route.ts
  +-- src/lib/meta/embedded-signup.ts
  +-- Settings UI component (Facebook JS SDK)

Phase 3: Inbound Webhook (depends on Phase 1)
  +-- src/app/api/webhooks/meta/route.ts
  +-- src/lib/meta/webhook-router.ts
  +-- src/lib/meta/handlers/whatsapp.ts (reuses domain layer)

Phase 4: Outbound Sending (depends on Phase 1)
  +-- src/lib/channels/meta-whatsapp-sender.ts
  +-- Updated registry.ts (provider-aware)
  +-- Updated getChannelCredentials() in messaging adapter

Phase 5: Templates (depends on Phase 1)
  +-- src/lib/meta/templates-api.ts
  +-- Updated template sync/CRUD actions

Phase 6: Media (depends on Phase 3)
  +-- src/lib/meta/media.ts
  +-- Updated downloadAndUploadMedia to support both providers

Phase 7: FB/IG Channels (depends on Phases 1-4)
  +-- src/lib/meta/handlers/facebook.ts
  +-- src/lib/meta/handlers/instagram.ts
  +-- src/lib/channels/meta-facebook-sender.ts
  +-- src/lib/channels/meta-instagram-sender.ts
```

---

## New Files Summary

| File Path | Purpose |
|-----------|---------|
| `src/lib/meta/api.ts` | Meta Cloud API client (send text/media/template/interactive) |
| `src/lib/meta/types.ts` | Meta-specific type definitions |
| `src/lib/meta/token-encryption.ts` | AES-256-GCM encrypt/decrypt for access tokens |
| `src/lib/meta/credentials.ts` | Resolve + decrypt credentials per workspace/channel |
| `src/lib/meta/embedded-signup.ts` | Token exchange + WABA provisioning logic |
| `src/lib/meta/templates-api.ts` | Meta direct template CRUD |
| `src/lib/meta/media.ts` | Meta direct media download/upload |
| `src/lib/meta/webhook-router.ts` | Route webhook events by object type |
| `src/lib/meta/handlers/whatsapp.ts` | Process WA events from Meta direct |
| `src/lib/meta/handlers/facebook.ts` | Process FB events from Meta direct |
| `src/lib/meta/handlers/instagram.ts` | Process IG events from Meta direct |
| `src/lib/channels/meta-whatsapp-sender.ts` | ChannelSender for Meta direct WA |
| `src/lib/channels/meta-facebook-sender.ts` | ChannelSender for Meta direct FB |
| `src/lib/channels/meta-instagram-sender.ts` | ChannelSender for Meta direct IG |
| `src/app/api/webhooks/meta/route.ts` | Unified Meta webhook endpoint |
| `src/app/api/meta/exchange-token/route.ts` | Embedded Signup token exchange |
| `supabase/migrations/xxx_create_workspace_meta_accounts.sql` | New table migration |

### Modified Files

| File Path | Change |
|-----------|--------|
| `src/lib/channels/registry.ts` | Add provider parameter, register Meta senders |
| `src/lib/channels/types.ts` | Add ChannelCredentials type (Phase 2 refactor) |
| `src/lib/agents/engine-adapters/production/messaging.ts` | Provider-aware credential resolution |
| `src/lib/domain/messages.ts` | Provider-aware send routing |
| `src/app/actions/templates.ts` | Provider-aware template API calls |
| `src/app/actions/messages.ts` | Provider-aware credential resolution |
| `src/inngest/functions/agent-timers.ts` | Provider-aware credential resolution |
| `src/inngest/functions/agent-timers-v3.ts` | Provider-aware credential resolution |
| `src/lib/automations/action-executor.ts` | Provider-aware credential resolution |
| Settings UI pages | Add channel connection UI, Embedded Signup |

---

## Serverless Constraints (Vercel)

### Function Timeout
- Current: `maxDuration = 60` on webhook routes
- Meta requires webhook response within 20 seconds
- Solution: Same as current approach -- store-before-process + Inngest for async

### Cold Starts
- Meta webhook verification (GET) must be fast -- no heavy imports
- Token decryption is lightweight (~1ms), no concern

### No Persistent Connections
- Each webhook invocation is stateless -- no in-memory token cache
- For MVP: decrypt on every request (acceptable overhead)
- For scale: consider Vercel KV or Upstash Redis for decrypted token cache

### Bundle Size
- `src/lib/meta/` is pure HTTP + crypto -- no heavy dependencies
- Facebook JS SDK loaded client-side only (Settings page)

---

## Security Considerations

1. **Token encryption at rest** -- AES-256-GCM with server-side key
2. **Webhook HMAC verification** -- SHA-256 with app secret (same as current WA webhook)
3. **Token scope** -- Business Integration tokens scoped to single WABA (not all WABAs)
4. **RLS bypass** -- Token operations use `createAdminClient()` (existing pattern)
5. **No tokens in client** -- All token operations server-side only
6. **Environment isolation** -- `META_TOKEN_ENCRYPTION_KEY` separate from other secrets
7. **Audit trail** -- Token creation/revocation logged in `workspace_meta_accounts.created_at`

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Webhook structure | HIGH | Meta Cloud API webhook format is identical to 360dialog proxy format -- verified in existing codebase |
| Token types | MEDIUM | Based on Meta developer docs (WebSearch); exact Embedded Signup code exchange flow needs validation during implementation |
| ChannelSender refactor | HIGH | Clear path based on existing interface analysis |
| Migration coexistence | HIGH | Per-workspace provider selection is straightforward with settings JSONB |
| Template API | HIGH | Same payload format, different endpoint -- low risk |
| Media handling | MEDIUM | Meta CDN direct access vs 360dialog proxy -- needs testing for auth headers and URL formats |
| FB/IG Messenger API | LOW | Have not deeply researched Messenger/IG DM API specifics -- different payload formats than WhatsApp |

## Sources

- [Meta Embedded Signup Documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Meta Access Tokens Guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/)
- [WhatsApp Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- [Meta Cloud API Media Reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-api)
- [Meta Auth Tokens Blog Post](https://developers.facebook.com/blog/post/2022/12/05/auth-tokens/)
- [Chatwoot WhatsApp Embedded Signup](https://developers.chatwoot.com/self-hosted/configuration/features/integrations/whatsapp-embedded-signup)
- [WhatsApp Cloud API Message API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api)
- [Meta Unified Webhook Guide](https://www.adarshyadav.dev/blog/webhook-integration-meta-apis)
- Existing MorfX codebase analysis (src/lib/whatsapp/, src/lib/channels/, src/lib/domain/, src/app/api/webhooks/)
