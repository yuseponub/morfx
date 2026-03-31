# Technology Stack: Direct Meta Integration

**Project:** MorfX - Replace 360dialog + ManyChat with Direct Meta APIs
**Researched:** 2026-03-31
**Overall Confidence:** HIGH (verified with official Meta docs + multiple sources)

---

## Executive Summary

Direct Meta integration replaces two intermediaries (360dialog, ManyChat) with a single Meta App using Graph API v22.0 (latest stable, enforced since Sep 2025). No new npm libraries are required -- raw HTTP via `fetch` is the correct approach. The Meta JS SDK (loaded via `<script>`) is needed only on the frontend for Embedded Signup. Token management is the hardest part: each workspace gets a Business Integration System User Access Token (BISUAT) that never expires but must be stored encrypted.

---

## 1. Meta Graph API Version

| Detail | Value | Confidence |
|--------|-------|------------|
| Current stable | **v22.0** | HIGH |
| Base URL | `https://graph.facebook.com/v22.0` | HIGH |
| Minimum enforced | v22.0 (older versions rejected since Sep 9, 2025) | HIGH |
| Versioning strategy | Include version in URL path, pin to v22.0 | HIGH |

**Source:** [Meta Graph API Changelog](https://developers.facebook.com/docs/graph-api/changelog/version22.0/)

**Recommendation:** Pin to v22.0. Create a constant `META_GRAPH_API_VERSION = 'v22.0'` and `META_BASE_URL = 'https://graph.facebook.com/v22.0'`. Review and bump when Meta releases v23.0.

---

## 2. SDK vs Raw HTTP -- Decision

### Recommendation: Raw HTTP (fetch) -- NO SDK

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **Raw fetch** | **USE THIS** | MorfX already uses this pattern for 360dialog. Same payload format (Cloud API IS the Graph API). Zero new dependencies. Full control over error handling. |
| `whatsapp-cloud-api` npm | SKIP | Thin wrapper, adds dep without value. Last updated irregularly. |
| `facebook-nodejs-business-sdk` | SKIP | Marketing/Ads-focused. Overkill for messaging. Huge package. |

**Why raw fetch works perfectly:** The 360dialog API is already a pass-through to Meta's Cloud API. The message payloads (`messaging_product: 'whatsapp'`, `type: 'text'`, etc.) are IDENTICAL. The only change is:
- URL: `https://waba-v2.360dialog.io/messages` --> `https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages`
- Auth: `D360-API-KEY: {key}` header --> `Authorization: Bearer {token}` header

**Exception:** The Meta JS SDK (`https://connect.facebook.net/en_US/sdk.js`) is loaded on the FRONTEND only for the Embedded Signup flow. This is a `<script>` tag, not an npm package.

---

## 3. Recommended Stack Additions

### Core (Zero new npm packages for messaging)

| Component | Technology | Version | Purpose | Why |
|-----------|-----------|---------|---------|-----|
| HTTP Client | Native `fetch` | Built-in | All Graph API calls | Already used for 360dialog. Same pattern. |
| Webhook signature | Node.js `crypto` | Built-in | HMAC-SHA256 validation | Already implemented in current webhook route. Same algo. |
| Graph API wrapper | Custom `src/lib/meta/api.ts` | N/A | Typed wrapper around fetch | Mirrors existing `src/lib/whatsapp/api.ts` pattern |
| Embedded Signup | Meta JS SDK (CDN) | Latest | Frontend onboarding flow | Loaded via `<script>` tag, no npm |
| Token encryption | `crypto` (AES-256-GCM) | Built-in | Encrypt tokens at rest in DB | Node built-in, no dependency needed |

### Supporting (existing stack, no additions needed)

| Component | Already Have | How It's Used |
|-----------|-------------|---------------|
| Inngest | Yes | Async webhook processing, agent timers -- unchanged |
| Supabase | Yes | Token storage, workspace settings, RLS |
| Next.js App Router | Yes | Webhook routes (`/api/webhooks/meta`), Embedded Signup page |
| Domain layer | Yes | All mutations through `src/lib/domain/` |
| ChannelSender | Yes | Interface already exists, just add new implementations |

---

## 4. Meta App Configuration Requirements

### App Type & Products

| Setting | Value | Notes |
|---------|-------|-------|
| App Type | **Business** | Required for WhatsApp Cloud API + Messenger + Instagram |
| Product: WhatsApp | Enable | Cloud API messaging |
| Product: Messenger | Enable | Facebook Page messaging |
| Product: Instagram | Enable | Instagram DM API |
| Product: Webhooks | Enable (auto) | Comes with WhatsApp product |
| Business Verification | Required | Must verify MorfX business on Meta Business Suite |
| Tech Provider | Required | Must enroll by June 30, 2025 (deadline passed -- enroll ASAP) |

### Permissions Required (App Review)

| Permission | Channel | Purpose | Review Required |
|------------|---------|---------|-----------------|
| `whatsapp_business_messaging` | WhatsApp | Send/receive messages via Cloud API | YES -- video walkthrough |
| `whatsapp_business_management` | WhatsApp | Manage templates, phone numbers, WABA | YES -- video walkthrough |
| `pages_messaging` | Messenger | Send/receive Facebook Page messages | YES |
| `pages_manage_metadata` | Messenger + IG | Subscribe to webhooks for Pages | YES |
| `instagram_manage_messages` | Instagram | Send/receive Instagram DMs | YES (Advanced access) |
| `instagram_basic` | Instagram | Read IG account profile info | YES |
| `business_management` | All | Access Business Portfolio endpoints | YES |

**CRITICAL:** App Review takes 3-4 weeks. Submit early. Video walkthroughs required for each permission showing real usage in the app.

---

## 5. Embedded Signup Flow (Client Onboarding)

This is how 360dialog onboards clients, and how MorfX will too. Meta provides the Embedded Signup as a JavaScript-based popup flow.

### How It Works (Step by Step)

```
1. MorfX Dashboard: Client clicks "Connect WhatsApp"
2. Frontend loads Meta JS SDK via <script>
3. Frontend calls FB.login() with specific parameters
4. Meta popup opens (Facebook Login for Business)
5. Client logs into Facebook (or uses existing session)
6. Client selects/creates Meta Business Portfolio
7. Client selects/creates WhatsApp Business Account (WABA)
8. Client registers phone number + verifies via SMS/call
9. Popup closes, returns to MorfX with:
   - waba_id (WhatsApp Business Account ID)
   - phone_number_id (registered phone number)
   - code (authorization code for token exchange)
10. MorfX backend exchanges code for Business Integration System User Access Token
11. Backend subscribes app to WABA webhooks: POST /{WABA_ID}/subscribed_apps
12. Done -- workspace is now connected
```

### Frontend Implementation

```javascript
// 1. Load SDK (in Next.js, load in <Script> component)
// <Script src="https://connect.facebook.net/en_US/sdk.js" />

// 2. Initialize
window.fbAsyncInit = function() {
  FB.init({
    appId: '{META_APP_ID}',
    cookie: true,
    xfbml: true,
    version: 'v22.0'
  });
};

// 3. Session info listener (receives waba_id before flow completes)
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://www.facebook.com') return;
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'WA_EMBEDDED_SIGNUP') {
      // data.data.waba_id - WhatsApp Business Account ID
      // data.data.phone_number_id - Phone number ID
      // data.event - 'FINISH' or 'CANCEL' or 'ERROR'
    }
  } catch {}
});

// 4. Launch signup
function launchWhatsAppSignup() {
  FB.login((response) => {
    if (response.authResponse) {
      const code = response.authResponse.code;
      // Send code + waba_id + phone_number_id to backend
    }
  }, {
    config_id: '{WHATSAPP_CONFIG_ID}', // Created in Meta App Dashboard
    response_type: 'code',
    override_default_response_type: true,
    extras: {
      setup: {
        // solutionID only if you're a Solution Partner, otherwise omit
      },
      featureType: '',
      sessionInfoVersion: '3',
    }
  });
}
```

### Backend Token Exchange

```typescript
// POST to exchange code for token
const response = await fetch(
  `https://graph.facebook.com/v22.0/oauth/access_token` +
  `?client_id=${META_APP_ID}` +
  `&client_secret=${META_APP_SECRET}` +
  `&code=${code}`,
  { method: 'GET' }
);
const { access_token } = await response.json();
// This is a Business Integration System User Access Token (BISUAT)
// It NEVER expires. Store it encrypted in the workspace record.

// Subscribe app to WABA webhooks
await fetch(
  `https://graph.facebook.com/v22.0/${waba_id}/subscribed_apps`,
  {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${access_token}` }
  }
);
```

### Config ID Setup

The `config_id` is created in Meta App Dashboard > WhatsApp > Embedded Signup Configuration. It defines:
- Which permissions to request
- What the signup flow looks like
- Callback URL settings

**Source:** [Meta Embedded Signup Docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/), [Chatwoot Implementation](https://developers.chatwoot.com/self-hosted/configuration/features/integrations/whatsapp-embedded-signup)

---

## 6. Token Management Strategy

### Token Types and Lifetimes

| Token Type | Source | Lifetime | Use Case | Storage |
|------------|--------|----------|----------|---------|
| **Business Integration System User Access Token (BISUAT)** | Embedded Signup code exchange | **Never expires** | WhatsApp Cloud API calls (send messages, manage templates) | Encrypted in `workspaces.settings` |
| **Page Access Token** | Facebook Login / Graph API | Long-lived (60 days) or never-expire if from System User | Messenger + Instagram API calls | Encrypted in `workspaces.settings` |
| **App Access Token** | `{APP_ID}|{APP_SECRET}` | Never expires | Webhook verification, app-level operations | Environment variable |
| **Temporary User Token** | Graph API Explorer | 1-2 hours | Dev/debug only | Never store |

### Multi-Tenant Token Architecture

```
workspaces table
  settings JSONB:
    meta_waba_id: "123456789"
    meta_phone_number_id: "987654321"
    meta_access_token_encrypted: "AES-256-GCM encrypted BISUAT"
    meta_page_id: "111222333"
    meta_page_token_encrypted: "AES-256-GCM encrypted page token"
    meta_ig_account_id: "444555666"
    whatsapp_webhook_secret: "per-workspace secret for signature validation"
```

### Encryption Strategy

```typescript
// Use AES-256-GCM with a master key from environment
// Key: META_TOKEN_ENCRYPTION_KEY (32 bytes, base64 encoded)
// Each token gets a unique IV (12 bytes, stored with ciphertext)
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function encryptToken(token: string): string {
  const key = Buffer.from(process.env.META_TOKEN_ENCRYPTION_KEY!, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}
```

### Why BISUAT is the Right Choice

- **Never expires** -- no refresh logic needed
- **Scoped to WABA** -- each workspace has its own token
- **Generated automatically** via Embedded Signup code exchange
- **Can be revoked** by the business owner in Meta Business Suite
- 360dialog uses API keys that map 1:1 to WABA tokens under the hood -- we just hold the real token now

---

## 7. Webhook Infrastructure

### Unified Webhook Endpoint

**Recommendation:** Single webhook route `/api/webhooks/meta` handles ALL three channels.

All Meta webhooks share the same format:
- Verification: GET with `hub.mode`, `hub.verify_token`, `hub.challenge`
- Events: POST with JSON body, `X-Hub-Signature-256` header
- Signature: HMAC-SHA256 of body with App Secret

### Webhook Payload Differences by Channel

#### WhatsApp
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15551234567",
          "phone_number_id": "PHONE_ID"
        },
        "messages": [{ "from": "SENDER", "type": "text", "text": { "body": "..." } }],
        "statuses": [{ "id": "wamid.xxx", "status": "delivered" }]
      },
      "field": "messages"
    }]
  }]
}
```

#### Messenger
```json
{
  "object": "page",
  "entry": [{
    "id": "PAGE_ID",
    "messaging": [{
      "sender": { "id": "PSID" },
      "recipient": { "id": "PAGE_ID" },
      "message": { "mid": "msg_id", "text": "..." }
    }]
  }]
}
```

#### Instagram
```json
{
  "object": "instagram",
  "entry": [{
    "id": "IG_USER_ID",
    "messaging": [{
      "sender": { "id": "IG_SCOPED_ID" },
      "recipient": { "id": "IG_USER_ID" },
      "message": { "mid": "msg_id", "text": "..." }
    }]
  }]
}
```

### Routing Strategy

```typescript
// /api/webhooks/meta/route.ts
export async function POST(request: NextRequest) {
  // 1. Verify signature (same for all 3 channels)
  // 2. Parse payload
  // 3. Route by object type:
  switch (payload.object) {
    case 'whatsapp_business_account':
      return handleWhatsApp(payload);
    case 'page':
      return handleMessenger(payload);
    case 'instagram':
      return handleInstagram(payload);
  }
}
```

### Signature Validation

**Identical to current implementation.** The existing `verifyWhatsAppHmac()` in `src/app/api/webhooks/whatsapp/route.ts` already uses `X-Hub-Signature-256` + HMAC-SHA256. The only change: the secret is now the **Meta App Secret** instead of a 360dialog-specific secret.

**CRITICAL (March 2026):** Meta is switching the Certificate Authority for mTLS. Without a trust store update, webhooks stop arriving in April 2026. Vercel manages TLS for us, but verify this works.

---

## 8. Channel-Specific API Endpoints

### WhatsApp Cloud API

| Operation | Method | Endpoint | Auth |
|-----------|--------|----------|------|
| Send message | POST | `/{PHONE_NUMBER_ID}/messages` | Bearer BISUAT |
| Upload media | POST | `/{PHONE_NUMBER_ID}/media` | Bearer BISUAT |
| Get media URL | GET | `/{MEDIA_ID}` | Bearer BISUAT |
| Download media | GET | `{CDN_URL}` (from media URL response) | Bearer BISUAT |
| Mark as read | POST | `/{PHONE_NUMBER_ID}/messages` (status: read) | Bearer BISUAT |
| Get templates | GET | `/{WABA_ID}/message_templates` | Bearer BISUAT |
| Create template | POST | `/{WABA_ID}/message_templates` | Bearer BISUAT |
| Delete template | DELETE | `/{WABA_ID}/message_templates?name={NAME}` | Bearer BISUAT |
| Subscribe webhooks | POST | `/{WABA_ID}/subscribed_apps` | Bearer BISUAT |

### Messenger Platform

| Operation | Method | Endpoint | Auth |
|-----------|--------|----------|------|
| Send message | POST | `/me/messages` | Bearer Page Token |
| Get user profile | GET | `/{PSID}?fields=first_name,last_name` | Bearer Page Token |
| Set welcome text | POST | `/me/messenger_profile` | Bearer Page Token |

### Instagram Messaging API

| Operation | Method | Endpoint | Auth |
|-----------|--------|----------|------|
| Send message | POST | `/me/messages` | Bearer Page Token |
| Get user profile | GET | `/{IG_SCOPED_ID}?fields=name,username` | Bearer Page Token |

**Key difference:** Messenger and Instagram use the same Send API (`/me/messages`) with Page Access Tokens. WhatsApp uses `/{PHONE_NUMBER_ID}/messages` with BISUAT.

---

## 9. Rate Limits

### WhatsApp

| Limit Type | Value | Scope |
|------------|-------|-------|
| **Throughput (standard)** | 80 messages/second | Per phone number |
| **Throughput (unlimited tier)** | Up to 1,000 messages/second | Per phone number (auto-upgrade) |
| **Unique contacts/24h (Tier 0)** | 250 | Per Business Portfolio (unverified) |
| **Unique contacts/24h (Tier 1)** | 1,000 | Per Business Portfolio |
| **Unique contacts/24h (Tier 2)** | 10,000 | Per Business Portfolio |
| **Unique contacts/24h (Tier 3)** | 100,000 | Per Business Portfolio |
| **Unique contacts/24h (Tier 4)** | Unlimited | Per Business Portfolio |
| **Media upload** | 25 requests/second | Per phone number |
| **Media download fail limit** | 5 failures/hour blocks for 1 hour | Per phone number |

**Note (Oct 2025 change):** Messaging limits are now per Business Portfolio, not per phone number.

### Messenger

| Limit Type | Value |
|------------|-------|
| Send API | 200 calls/hour per page (standard), higher with approved use |
| 24h messaging window | After user messages, unlimited replies for 24 hours |
| Outside window | Requires message tags (most deprecated Jan 2026) |

### Instagram

| Limit Type | Value |
|------------|-------|
| **DMs per hour** | 200 (firm, no exceptions) |
| **24h messaging window** | Unlimited messages after user initiates |
| **Outside window** | Cannot message (no equivalent of templates) |

---

## 10. Template Management via API

### Creating Templates

```typescript
// POST https://graph.facebook.com/v22.0/{WABA_ID}/message_templates
{
  "name": "order_confirmation",
  "language": "es",
  "category": "UTILITY", // MARKETING | UTILITY | AUTHENTICATION
  "components": [
    {
      "type": "BODY",
      "text": "Hola {{1}}, tu pedido {{2}} ha sido confirmado.",
      "example": {
        "body_text": [["Juan", "ORD-001"]]
      }
    }
  ]
}
```

### Approval Flow

1. Submit template via API
2. Status: `PENDING` (under review)
3. Meta reviews (1 min to 48 hours typically)
4. Status changes to `APPROVED` or `REJECTED`
5. Webhook notification: `message_template_status_update`

### Syncing Template Status

```typescript
// GET https://graph.facebook.com/v22.0/{WABA_ID}/message_templates
// Returns all templates with current status
// Webhook field "message_template_status_update" for real-time updates
```

**Migration from 360dialog:** Templates are associated with the WABA, not with 360dialog. When a client connects via Embedded Signup using their existing WABA, their templates carry over automatically.

---

## 11. Media Handling

### Upload (WhatsApp)

```typescript
// POST https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/media
// Content-Type: multipart/form-data
// Body: file (binary), type (MIME), messaging_product: "whatsapp"
// Returns: { id: "MEDIA_ID" }
```

### Download (WhatsApp)

```typescript
// Step 1: Get URL
// GET https://graph.facebook.com/v22.0/{MEDIA_ID}
// Returns: { url: "https://lookaside.fbsbx.com/...", mime_type: "...", ... }

// Step 2: Download binary
// GET {url} with Authorization: Bearer {token}
// Returns: binary data
// URL expires after 5 minutes
```

**Key difference from 360dialog:** Currently we replace `lookaside.fbsbx.com` with 360dialog's proxy domain. With direct integration, we hit `lookaside.fbsbx.com` directly using the Bearer token. Simpler.

### Messenger/Instagram Media

Messenger and Instagram handle media inline in the Send API:
```json
{
  "recipient": { "id": "PSID" },
  "message": {
    "attachment": {
      "type": "image",
      "payload": { "url": "https://example.com/image.jpg" }
    }
  }
}
```

---

## 12. Pricing Impact (Direct vs 360dialog)

### WhatsApp (Direct Meta Billing)

Since July 2025, pricing is per delivered template message:
- **Service messages** (replies within 24h window): **FREE**
- **Marketing templates:** Most expensive (~$0.01-0.24 depending on country, Colombia is cheap)
- **Utility templates:** ~80-90% cheaper than marketing. **FREE within open service window**
- **Authentication templates:** Variable, international significantly more expensive

### Cost Savings

| Current (360dialog) | Direct Meta |
|---------------------|-------------|
| 360dialog markup on messages | Zero markup -- Meta direct pricing |
| 360dialog monthly fee per number | Zero platform fee |
| ManyChat Pro subscription | Zero -- direct API is free |
| Limited by 360dialog's features | Full API access |

**Key insight:** 360dialog claims "zero markup" but charges a monthly fee per number. ManyChat charges per-subscriber fees. Both are eliminated.

---

## 13. Migration Path from Current Stack

### What Changes

| Component | Current | New | Migration Effort |
|-----------|---------|-----|-----------------|
| WhatsApp API base URL | `waba-v2.360dialog.io` | `graph.facebook.com/v22.0` | Low -- constant change |
| WhatsApp auth header | `D360-API-KEY: {key}` | `Authorization: Bearer {token}` | Low -- header change |
| WhatsApp payload format | Same as Cloud API | Cloud API | **ZERO** -- identical |
| Messenger send | ManyChat `sendContent` | Graph API `/me/messages` | Medium -- new sender |
| Instagram send | ManyChat tag+field hack | Graph API `/me/messages` | Medium -- much simpler |
| Webhook route | `/api/webhooks/whatsapp` | `/api/webhooks/meta` (unified) | Medium |
| Webhook payload | Same as Meta format | Meta format | **ZERO** -- 360dialog passes through |
| Client onboarding | Manual (paste API key) | Embedded Signup (self-service) | High -- new UI flow |
| Token management | API key per workspace | Encrypted BISUAT per workspace | Medium |
| Template management | Via 360dialog hub | Via Graph API | Medium -- new UI |

### What Does NOT Change

- `ChannelSender` interface (already abstracted)
- `ChannelType` enum (same channels)
- `processWebhook()` handler logic (payload format identical for WhatsApp)
- Domain layer mutations
- Inngest async processing
- Supabase storage
- Contact resolution logic

---

## 14. What NOT to Add

| Technology | Why Skip |
|------------|----------|
| `whatsapp-cloud-api` npm | Thin wrapper around fetch. Adds dependency for zero value. |
| `facebook-nodejs-business-sdk` npm | Marketing/Ads SDK. Wrong tool for messaging. |
| Separate webhook routes per channel | One `/api/webhooks/meta` route handles all 3. Simpler. |
| Redis for token caching | Tokens never expire. Store in DB, cache in memory per request. No Redis needed. |
| Separate Meta Apps per workspace | One MorfX Meta App serves ALL workspaces. Each workspace connects their own WABA/Page via Embedded Signup. |
| Webhook queue (SQS/Redis) | Inngest already handles async processing. Don't add infrastructure. |

---

## 15. Environment Variables (New)

```bash
# Meta App (one per MorfX deployment)
META_APP_ID=               # From Meta App Dashboard
META_APP_SECRET=           # From Meta App Dashboard (also used for webhook signature)
META_CONFIG_ID=            # Embedded Signup configuration ID

# Token encryption
META_TOKEN_ENCRYPTION_KEY= # 32 bytes, base64 encoded, for AES-256-GCM

# Webhook verification
META_WEBHOOK_VERIFY_TOKEN= # Custom string for webhook URL verification

# Remove after migration complete:
# WHATSAPP_API_KEY (360dialog)
# WHATSAPP_WEBHOOK_SECRET (360dialog-specific)
# MANYCHAT_API_KEY
```

---

## 16. File Structure (New/Modified)

```
src/lib/meta/
  api.ts              # Graph API HTTP client (replaces 360dialog api.ts)
  types.ts            # Webhook payload types, API response types
  webhook-handler.ts  # Unified webhook handler for all 3 channels
  token.ts            # Token encryption/decryption
  templates.ts        # Template CRUD operations
  media.ts            # Media upload/download
  embedded-signup.ts  # Backend: code exchange, webhook subscription

src/lib/channels/
  meta-whatsapp-sender.ts   # New ChannelSender for direct WhatsApp
  meta-messenger-sender.ts  # New ChannelSender for direct Messenger
  meta-instagram-sender.ts  # New ChannelSender for direct Instagram
  registry.ts               # Updated to include new senders

src/app/api/webhooks/meta/
  route.ts            # Unified webhook endpoint (replaces /whatsapp and /manychat)

src/app/api/meta/
  embedded-signup/route.ts  # Backend for code exchange after Embedded Signup

src/app/(dashboard)/settings/channels/
  page.tsx            # UI for Embedded Signup + channel connection
  whatsapp-connect.tsx
  messenger-connect.tsx
  instagram-connect.tsx
```

---

## Sources

### Official Meta Documentation
- [Graph API Changelog v22.0](https://developers.facebook.com/docs/graph-api/changelog/version22.0/)
- [Embedded Signup Overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Embedded Signup Implementation](https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation/)
- [Access Tokens Guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/)
- [WhatsApp Cloud API Media Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/)
- [WhatsApp Templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
- [WhatsApp Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Messaging Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Messenger Platform Webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks)
- [Messenger Send API](https://developers.facebook.com/docs/messenger-platform/reference/send-api/)
- [Instagram Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [WhatsApp Webhook Messages Reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/)
- [Tech Provider Program](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)

### Verified Implementation References
- [Chatwoot Embedded Signup Docs](https://developers.chatwoot.com/self-hosted/configuration/features/integrations/whatsapp-embedded-signup)
- [360dialog Embedded Signup](https://docs.360dialog.com/docs/hub/embedded-signup)
- [360dialog Host Your Own Embedded Signup](https://docs.360dialog.com/partner/integrations-and-api-development/integration-best-practices/integrated-onboarding/host-your-own-embedded-signup)
- [Twilio Tech Provider Integration Guide](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/integration-guide)
- [Infobip Tech Provider Setup](https://www.infobip.com/docs/whatsapp/tech-provider-program/setup-and-integration)
- [Meta Business Integration Prototype (GitHub)](https://github.com/RadithSandeepa/meta-business-integration-prototype)

### Community / Industry Sources
- [WhatsApp Messaging Limits 2026 (Chatarmin)](https://chatarmin.com/en/blog/whats-app-messaging-limits)
- [Scale WhatsApp Cloud API Throughput (WuSeller)](https://www.wuseller.com/whatsapp-business-knowledge-hub/scale-whatsapp-cloud-api-master-throughput-limits-upgrades-2026/)
- [Shadow Delivery Webhook Fix (Medium)](https://medium.com/@siri.prasad/the-shadow-delivery-mystery-why-your-whatsapp-cloud-api-webhooks-silently-fail-and-how-to-fix-2c7383fec59f)
- [Teknasyon Embedded Signup Implementation](https://engineering.teknasyon.com/embedded-signup-a-solution-to-streamline-transition-to-whatsapp-business-api-cdf57783a2d4)
