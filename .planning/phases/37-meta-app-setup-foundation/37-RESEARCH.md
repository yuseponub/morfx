# Phase 37: Meta App Setup + Foundation - Research

**Researched:** 2026-03-31
**Domain:** Meta Graph API v22.0, AES-256-GCM encryption, DB schema, developer app configuration
**Confidence:** HIGH

## Summary

Phase 37 is the foundation layer for replacing 360dialog + ManyChat with direct Meta APIs. It covers four deliverables: (1) Meta App registration and permission approval, (2) `workspace_meta_accounts` table with encrypted tokens, (3) typed Graph API client wrapper, and (4) a step-by-step guide for the user to configure everything in the Meta developer dashboard.

The existing codebase is well-prepared: `src/lib/whatsapp/api.ts` already uses raw `fetch` with the Cloud API payload format (identical to Meta's direct API). The `ChannelSender` interface and `channels/registry.ts` provide extension points. The webhook route at `/api/webhooks/whatsapp/route.ts` already implements HMAC-SHA256 verification with `request.text()` for raw body -- the exact same pattern needed for Meta direct.

**Primary recommendation:** Build `src/lib/meta/` module with `api.ts` (typed Graph API client), `token.ts` (AES-256-GCM encrypt/decrypt), `types.ts` (API response and webhook types), and `credentials.ts` (workspace credential resolution). The SETUP-04 guide must be delivered FIRST since the Meta App creation and App Review submission must happen before any code can be tested.

## Standard Stack

### Core (Zero new npm packages)

| Component | Technology | Purpose | Why Standard |
|-----------|-----------|---------|--------------|
| HTTP Client | Native `fetch` | All Graph API calls | Already used for 360dialog. Identical payload format. |
| Encryption | Node.js `crypto` (AES-256-GCM) | Token encryption at rest | Built-in, no deps. NIST-recommended AEAD cipher. |
| Types | TypeScript interfaces | Graph API response types | Existing project pattern |

### Supporting (already in project)

| Component | Already Have | How Used in Phase 37 |
|-----------|-------------|---------------------|
| Supabase | Yes | `workspace_meta_accounts` table, RLS policies |
| `createAdminClient()` | Yes | All credential read/write (bypass RLS) |
| `crypto.createHmac` | Yes | Webhook HMAC verification (already in whatsapp route.ts) |
| `crypto.timingSafeEqual` | Yes | Signature comparison (already implemented) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw fetch | `facebook-nodejs-business-sdk` npm | Marketing/Ads-focused, overkill for messaging. Adds large dependency. |
| Node crypto AES-256-GCM | `@aws-crypto/encrypt-node` | Adds AWS dependency. Unnecessary when Node crypto suffices. |
| JSONB in workspaces.settings | Separate table | Table is correct -- enables indexed lookups by phone_number_id, page_id, ig_account_id for webhook routing. |

**Installation:** None. Zero new packages.

## Architecture Patterns

### New Module Structure

```
src/lib/meta/
  api.ts              # Graph API HTTP client (version-pinned, typed)
  types.ts            # API response types, webhook payload types
  token.ts            # AES-256-GCM encrypt/decrypt
  credentials.ts      # Resolve + decrypt credentials per workspace/channel
  constants.ts        # META_GRAPH_API_VERSION, META_BASE_URL
```

### Pattern 1: Version-Pinned Graph API Client

**What:** A thin typed wrapper around `fetch` that pins the Graph API version in a single constant and provides typed request/response handling.

**When to use:** Every Graph API call throughout the entire v5.0 codebase.

**Example:**
```typescript
// src/lib/meta/constants.ts
export const META_GRAPH_API_VERSION = 'v22.0'
export const META_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

// src/lib/meta/api.ts
import { META_BASE_URL } from './constants'
import type { MetaApiResponse, MetaApiError } from './types'

export async function metaRequest<T>(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${META_BASE_URL}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    const error = data as MetaApiError
    throw new MetaGraphApiError(
      error.error?.message || `Meta API error: ${response.status}`,
      error.error?.code,
      error.error?.error_subcode,
      response.status
    )
  }

  return data as T
}
```

**Key insight:** This mirrors `src/lib/whatsapp/api.ts` exactly -- same pattern, different base URL and auth header. The message payloads are IDENTICAL between 360dialog and Meta direct (both are Cloud API).

### Pattern 2: AES-256-GCM Token Encryption

**What:** Encrypt access tokens before storing in DB, decrypt on read. Each token gets a unique random IV. Auth tag is stored alongside ciphertext.

**Format:** `base64(iv || authTag || ciphertext)` -- single string, easy to store in TEXT column.

**Example:**
```typescript
// src/lib/meta/token.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12  // 96 bits -- NIST recommended for GCM
const AUTH_TAG_LENGTH = 16  // 128 bits

function getEncryptionKey(): Buffer {
  const key = process.env.META_TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('META_TOKEN_ENCRYPTION_KEY not set')
  // Key is 32 bytes stored as base64 (43 chars)
  return Buffer.from(key, 'base64')
}

export function encryptToken(token: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Pack: iv (12) + authTag (16) + ciphertext (variable)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decryptToken(packed: string): string {
  const key = getEncryptionKey()
  const data = Buffer.from(packed, 'base64')
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
```

### Pattern 3: Credential Resolution by Identifier

**What:** Look up workspace credentials from `workspace_meta_accounts` by channel-specific identifier (phone_number_id for inbound webhooks, workspace_id for outbound sends).

**Example:**
```typescript
// src/lib/meta/credentials.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from './token'

export interface MetaCredentials {
  accessToken: string
  wabaId: string | null
  phoneNumberId: string | null
  phoneNumber: string | null
  pageId: string | null
  igAccountId: string | null
  businessId: string | null
  workspaceId: string
}

// For inbound: resolve workspace from phone_number_id
export async function resolveByPhoneNumberId(phoneNumberId: string): Promise<MetaCredentials | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspace_meta_accounts')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .eq('is_active', true)
    .single()
  if (!data) return null
  return { ...data, accessToken: decryptToken(data.access_token_encrypted) }
}

// For outbound: resolve credentials for a workspace + channel
export async function resolveByWorkspace(
  workspaceId: string,
  channel: 'whatsapp' | 'facebook' | 'instagram'
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
  return { ...data, accessToken: decryptToken(data.access_token_encrypted) }
}
```

### Pattern 4: Custom Error Class with Meta Error Codes

**What:** A typed error class that captures Meta's error structure (code, subcode, fbtrace_id) for debugging.

**Example:**
```typescript
// src/lib/meta/types.ts
export class MetaGraphApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly errorSubcode?: number,
    public readonly httpStatus?: number,
    public readonly fbtraceId?: string
  ) {
    super(message)
    this.name = 'MetaGraphApiError'
  }

  get isAuthError(): boolean {
    return this.httpStatus === 401 || this.code === 190
  }

  get isRateLimitError(): boolean {
    return this.httpStatus === 429 || this.code === 4 || this.code === 80007
  }

  get isPermissionError(): boolean {
    return this.code === 10 || this.code === 200
  }
}
```

### Anti-Patterns to Avoid

- **Storing tokens in workspaces.settings JSONB:** JSONB is not indexed for webhook routing lookups. Use the dedicated `workspace_meta_accounts` table with unique constraints on phone_number_id, page_id, ig_account_id.
- **Hardcoding API version in individual files:** Pin once in `constants.ts`, import everywhere.
- **Using `NEXT_PUBLIC_` prefix for any Meta secret:** App Secret and Encryption Key must NEVER be exposed client-side.
- **Storing encryption key as hex string:** Use base64 encoding for the 32-byte key. Hex would be 64 chars and is less compact.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token encryption | Custom cipher protocol | AES-256-GCM via Node `crypto` | Standard AEAD cipher, proven. GCM provides both confidentiality and integrity. |
| HMAC verification | Manual byte comparison | `crypto.timingSafeEqual` | Prevents timing attacks. Already used in existing webhook route. |
| IV generation | Sequential counters or timestamps | `crypto.randomBytes(12)` | Cryptographically secure random. Counters risk reuse across serverless instances. |
| Error code handling | Ad-hoc status code checks | Typed `MetaGraphApiError` class | Meta has specific error codes (190=auth, 4=rate limit, 10=permission). Centralize. |
| Graph API version management | Per-file URL strings | Single `META_GRAPH_API_VERSION` constant | One place to update when Meta releases new versions. |

**Key insight:** There is genuinely nothing to install. Node.js `crypto` and native `fetch` cover 100% of Phase 37's needs.

## Common Pitfalls

### Pitfall 1: IV Reuse in AES-256-GCM

**What goes wrong:** Using a fixed or predictable IV defeats GCM's security. With the same key+IV pair, an attacker can XOR two ciphertexts to recover plaintexts.
**Why it happens:** Developer uses a deterministic IV (e.g., hash of workspace_id) thinking "each workspace gets its own IV."
**How to avoid:** ALWAYS use `randomBytes(12)` for a new IV on every encrypt call. Store IV with the ciphertext (our packed format does this).
**Warning signs:** Any encrypt call that does not call `randomBytes()`.

### Pitfall 2: Encryption Key in Wrong Format

**What goes wrong:** Key must be exactly 32 bytes (256 bits). Common mistake: using a 32-character ASCII string (which is 32 bytes but low entropy) or a hex-encoded key without decoding (64 hex chars = 64 bytes, not 32).
**Why it happens:** `openssl rand -hex 32` produces 64 hex characters. Developer stores it as-is and passes to `createCipheriv` which then fails or uses wrong key length.
**How to avoid:** Generate key: `openssl rand -base64 32` (produces 44 chars of base64). Decode with `Buffer.from(key, 'base64')` which yields exactly 32 bytes.
**Warning signs:** Key string is 64 characters (hex) or 32 characters (ASCII) instead of 44 characters (base64).

### Pitfall 3: App Review Rejection Delays Everything

**What goes wrong:** Meta App Review takes 2-7 business days. Rejection adds another cycle. Without approved `whatsapp_business_messaging` and `whatsapp_business_management` permissions, you cannot send messages to non-test numbers.
**Why it happens:** Team saves app review for last.
**How to avoid:** Submit App Review in Week 1. The SETUP-04 guide must be the FIRST deliverable of this phase. Video walkthrough must show the business-facing interface (not the consumer-facing chat).
**Warning signs:** No App Review submission before code is written.

### Pitfall 4: Meta App Secret Confused with Verify Token

**What goes wrong:** Three different secrets serve three purposes and are frequently confused:
- `META_APP_SECRET` -- HMAC webhook signature verification (X-Hub-Signature-256 header)
- `META_WEBHOOK_VERIFY_TOKEN` -- arbitrary string for webhook URL verification (hub.verify_token parameter)
- `META_TOKEN_ENCRYPTION_KEY` -- AES-256-GCM key for token encryption (internal only)
**How to avoid:** Name them clearly. Document each in the SETUP-04 guide. Never reuse values between them.

### Pitfall 5: workspace_meta_accounts Missing Workspace-Scoped Unique Constraints

**What goes wrong:** A workspace should have at most one active WhatsApp account, one Facebook page, one Instagram account. Without proper constraints, duplicate entries cause credential resolution to return wrong tokens.
**How to avoid:** Add unique partial index: `UNIQUE (workspace_id, channel) WHERE is_active = true`. Also add global unique constraints on `phone_number_id`, `page_id`, `ig_account_id` (a phone number belongs to exactly one workspace).

## Code Examples

### Database Migration

```sql
-- supabase/migrations/20260401100000_create_workspace_meta_accounts.sql

CREATE TABLE workspace_meta_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Account identifiers (one or more populated depending on channel)
  waba_id TEXT,                    -- WhatsApp Business Account ID
  phone_number_id TEXT,            -- WhatsApp phone number ID
  phone_number TEXT,               -- Display phone number (E.164 format)
  page_id TEXT,                    -- Facebook Page ID
  ig_account_id TEXT,              -- Instagram account ID
  business_id TEXT,                -- Meta Business Portfolio ID

  -- Encrypted access token (AES-256-GCM packed format)
  access_token_encrypted TEXT NOT NULL,

  -- Channel type
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'facebook', 'instagram')),

  -- Provider (always 'meta_direct' for now, supports future expansion)
  provider TEXT NOT NULL DEFAULT 'meta_direct',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),

  -- Metadata (optional, populated from Meta API)
  account_name TEXT,
  quality_rating TEXT,
  messaging_limit TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- Global uniqueness: a phone/page/ig account belongs to exactly one row
  CONSTRAINT uq_meta_phone UNIQUE (phone_number_id),
  CONSTRAINT uq_meta_page UNIQUE (page_id),
  CONSTRAINT uq_meta_ig UNIQUE (ig_account_id)
);

-- Only one active account per workspace per channel
CREATE UNIQUE INDEX idx_meta_accounts_active_per_ws
  ON workspace_meta_accounts(workspace_id, channel)
  WHERE is_active = true;

-- Fast webhook routing indexes (lookup by channel identifier)
CREATE INDEX idx_meta_accounts_phone ON workspace_meta_accounts(phone_number_id) WHERE phone_number_id IS NOT NULL;
CREATE INDEX idx_meta_accounts_page ON workspace_meta_accounts(page_id) WHERE page_id IS NOT NULL;
CREATE INDEX idx_meta_accounts_ig ON workspace_meta_accounts(ig_account_id) WHERE ig_account_id IS NOT NULL;
CREATE INDEX idx_meta_accounts_workspace ON workspace_meta_accounts(workspace_id);

-- RLS: workspace members can read their own workspace's accounts (token stays encrypted)
ALTER TABLE workspace_meta_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_meta_accounts"
  ON workspace_meta_accounts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE via RLS -- all mutations go through createAdminClient()
-- This prevents accidental client-side token modification

-- Updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON workspace_meta_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Graph API Client (Full)

```typescript
// src/lib/meta/api.ts
import { META_BASE_URL } from './constants'
import { MetaGraphApiError } from './types'

/**
 * Make a typed request to Meta Graph API.
 * All endpoints are relative to the versioned base URL.
 */
export async function metaRequest<T>(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${META_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    const err = (data as { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } }).error
    throw new MetaGraphApiError(
      err?.message || `Meta API error: ${response.status}`,
      err?.code,
      err?.error_subcode,
      response.status,
      err?.fbtrace_id
    )
  }

  return data as T
}

// -- Convenience methods for common operations --

/** Send a WhatsApp text message */
export async function sendWhatsAppText(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  text: string
) {
  return metaRequest<{ messaging_product: string; contacts: Array<{ wa_id: string }>; messages: Array<{ id: string }> }>(
    accessToken,
    `/${phoneNumberId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  )
}

/** Send a WhatsApp template message */
export async function sendWhatsAppTemplate(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  templateName: string,
  languageCode: string = 'es',
  components?: unknown[]
) {
  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode },
  }
  if (components) template.components = components

  return metaRequest(
    accessToken,
    `/${phoneNumberId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'template',
        template,
      }),
    }
  )
}

/** Verify token is still valid by fetching WABA info */
export async function verifyToken(
  accessToken: string,
  wabaId: string
): Promise<boolean> {
  try {
    await metaRequest(accessToken, `/${wabaId}?fields=id,name`)
    return true
  } catch {
    return false
  }
}
```

### Environment Variables

```bash
# === Meta App (one per MorfX deployment) ===

# From Meta App Dashboard > Settings > Basic
META_APP_ID=                       # Facebook App ID (numeric)
META_APP_SECRET=                   # Facebook App Secret (hex string)

# Custom string for webhook URL verification (hub.verify_token)
META_WEBHOOK_VERIFY_TOKEN=         # Any random string, e.g. "morfx_meta_verify_2026"

# Embedded Signup configuration ID (from App Dashboard > WhatsApp > Embedded Signup)
META_CONFIG_ID=                    # Numeric ID

# === Token Encryption ===
# Generate: openssl rand -base64 32
# CRITICAL: 44 characters of base64, decodes to exactly 32 bytes
META_TOKEN_ENCRYPTION_KEY=         # Base64-encoded 32-byte key

# === Keep existing (legacy, until migration complete) ===
WHATSAPP_API_KEY=                  # 360dialog key (existing workspaces)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=     # Existing webhook verify token
WHATSAPP_WEBHOOK_SECRET=           # Existing HMAC secret
```

## Permissions Required for Meta App Review

### WhatsApp (Required for Phase 37)

| Permission | Purpose | Review | Video Required |
|------------|---------|--------|----------------|
| `whatsapp_business_messaging` | Send/receive WhatsApp messages via Cloud API | YES | YES -- show business-facing interface |
| `whatsapp_business_management` | Manage templates, phone numbers, WABAs | YES | YES -- show template management UI |

### Facebook + Instagram (Required later, can submit simultaneously)

| Permission | Purpose | Review | Notes |
|------------|---------|--------|-------|
| `pages_messaging` | Send/receive Facebook Messenger messages | YES | Needed for FB channel |
| `instagram_manage_messages` | Send/receive Instagram DMs | YES | Advanced Access required |
| `business_management` | Access Business Portfolio endpoints | YES | Needed for Embedded Signup token exchange |

### Submission Tips (from Meta's sample submission guide)

1. Video walkthrough must show the **business-facing interface** (dashboard), NOT the consumer chat
2. Show how each permission is actually used in the app
3. Privacy policy must be live at a public URL, fast-loading, and mention WhatsApp data usage
4. Request ONLY permissions you need -- extra permissions increase rejection risk
5. Review typically takes 24-72 hours, up to 5 business days
6. If rejected, check "App Requests" tab for feedback before resubmitting

## Tech Provider Enrollment

### Requirements

| Requirement | Status | Action |
|-------------|--------|--------|
| Meta Business Portfolio | Required | Create at business.facebook.com |
| Business Verification | IN REVIEW | Submitted 2026-03-31, wait for approval |
| Two-Factor Authentication | Required | Enable on Meta Business Suite |
| Meta Developer Account | Required | Register at developers.facebook.com |
| WhatsApp Sender Registration | Required | Register MorfX's own number via Self Sign-up |
| App Review (messaging permissions) | Required | Submit with video walkthroughs |

### Deadline

All ISVs must enroll as Tech Providers by **June 30, 2025** (deadline already passed). MorfX should enroll ASAP. Failure to enroll prohibits sending WhatsApp messages on behalf of clients.

### Enrollment Steps

1. Go to Meta Business Suite > Settings > Business Assets
2. Enroll in Tech Provider program
3. Complete business verification (already submitted)
4. Create Meta App with type "Business"
5. Enable WhatsApp, Messenger, Instagram products
6. Submit App Review for required permissions
7. Configure Embedded Signup for client onboarding

## Meta App Configuration Steps (SETUP-04 Guide Content)

### Step 1: Create Meta App

1. Go to https://developers.facebook.com/apps/
2. Click "Create App"
3. Select app type: **Business**
4. Enter app name: "MorfX"
5. Select Business Portfolio: [your verified business]
6. Click "Create App"

### Step 2: Enable Products

1. In app dashboard, click "Add Product"
2. Add **WhatsApp** -- click "Set Up"
3. Add **Messenger** -- click "Set Up"
4. Add **Instagram** -- click "Set Up"
5. (Webhooks product is auto-added with WhatsApp)

### Step 3: Configure WhatsApp

1. WhatsApp > Getting Started: Note the temporary access token (dev only)
2. WhatsApp > Configuration > Webhook: Set callback URL to `https://[your-domain]/api/webhooks/meta`
3. Set Verify Token to the value of `META_WEBHOOK_VERIFY_TOKEN`
4. Subscribe to fields: `messages`, `message_template_status_update`

### Step 4: App Settings

1. Settings > Basic: Copy **App ID** and **App Secret**
2. Store App ID as `META_APP_ID`
3. Store App Secret as `META_APP_SECRET`
4. Set App Domains: your production domain
5. Set Privacy Policy URL: `https://[your-domain]/privacy`
6. Set Terms of Service URL: `https://[your-domain]/terms`

### Step 5: Submit App Review

1. App Review > Permissions and Features
2. Request Advanced Access for `whatsapp_business_messaging`
3. Request Advanced Access for `whatsapp_business_management`
4. For each: complete the form + upload video walkthrough
5. Click "Submit For Review"

### Step 6: Generate Encryption Key

```bash
# Run locally, store in Vercel env vars
openssl rand -base64 32
# Output example: K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=
# Store as META_TOKEN_ENCRYPTION_KEY
```

### Step 7: Set Vercel Environment Variables

```
META_APP_ID=<from step 4>
META_APP_SECRET=<from step 4>
META_WEBHOOK_VERIFY_TOKEN=<any random string>
META_CONFIG_ID=<from Embedded Signup config, created later>
META_TOKEN_ENCRYPTION_KEY=<from step 6>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Conversation-based pricing | Per-message pricing | July 2025 | Utility templates free in service window |
| Per-phone-number messaging limits | Per-Business Portfolio limits | Oct 2025 | All numbers share limit pool |
| v21.0 minimum | v22.0 minimum enforced | Sep 2025 | Older versions rejected |
| BSP-managed webhooks | Single webhook per app | Always (Cloud API) | Must build routing layer |
| Solution Provider program | Tech Provider program | 2024-2025 | Must enroll by June 30, 2025 |

## Open Questions

1. **Meta Business Verification timeline**
   - What we know: Submitted 2026-03-31, typically takes 2-10 business days
   - What's unclear: Whether it's approved before we need App Review approval
   - Recommendation: Proceed with code. App Review can be submitted in parallel. Use test numbers (max 5) until full approval.

2. **Embedded Signup Config ID**
   - What we know: Created in Meta App Dashboard > WhatsApp > Embedded Signup Configuration
   - What's unclear: Exact configuration options available (cannot render Meta's dashboard docs)
   - Recommendation: `META_CONFIG_ID` env var is not needed for Phase 37 (foundation). It's needed in Phase 38 (Embedded Signup). Document its existence now, create later.

3. **Tech Provider enrollment deadline**
   - What we know: Deadline was June 30, 2025 (already passed). Some sources say March 31, 2025.
   - What's unclear: Whether late enrollment is still possible or if there's a grace period
   - Recommendation: Attempt enrollment immediately. If blocked, contact Meta Business Support.

## Sources

### Primary (HIGH confidence)
- [Meta App Review Sample Submission](https://developers.facebook.com/docs/whatsapp/solution-providers/app-review/sample-submission) -- exact permissions and video walkthrough requirements
- [Meta Permissions Reference](https://developers.facebook.com/docs/permissions/) -- pages_messaging, instagram_manage_messages, business_management
- [Meta Graph API WABA Reference](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/) -- confirms v25.0 is latest, v22.0 still supported
- Existing MorfX codebase (`src/lib/whatsapp/api.ts`, `src/app/api/webhooks/whatsapp/route.ts`) -- verified current patterns

### Secondary (MEDIUM confidence)
- [Node.js AES-256-GCM Gist (rjz)](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81) -- IV size 12 bytes, auth tag 16 bytes confirmed
- [Node.js AES-GCM Gist (AndiDittrich)](https://gist.github.com/AndiDittrich/4629e7db04819244e843) -- encryption/decryption pattern verified
- [AesGcmParams MDN](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams) -- 96-bit IV recommended for GCM
- [BotSailor WhatsApp Embedded Signup Guide](https://botsailor.com/blog/how-to-submit-app-for-botsailor-whitelabel-whatsapp-embedded-signup) -- real-world app review submission walkthrough
- [Meta Tech Provider Docs (360dialog)](https://docs.360dialog.com/partner/get-started/tech-provider-program/understanding-the-meta-tech-provider-program) -- enrollment requirements

### Tertiary (LOW confidence)
- [Infobip Tech Provider Program](https://www.infobip.com/docs/whatsapp/tech-provider-program) -- enrollment deadline June 30, 2025
- [Alibaba Cloud Tech Provider Registration](https://www.alibabacloud.com/help/en/chatapp/use-cases/how-to-register-as-a-meta-tech-provider) -- step-by-step enrollment
- [GMCSco WhatsApp API Compliance 2026](https://gmcsco.com/your-simple-guide-to-whatsapp-api-compliance-2026/) -- compliance overview

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new packages, all Node.js built-ins, verified against existing codebase
- Architecture (meta/ module): HIGH -- mirrors existing whatsapp/ module pattern exactly
- AES-256-GCM implementation: HIGH -- standard Node.js crypto, IV=12 bytes, authTag=16 bytes verified across multiple sources
- DB schema: HIGH -- workspace_meta_accounts table design verified against project patterns (createAdminClient, RLS, workspace_id filtering)
- Permissions for App Review: HIGH -- verified against Meta's official sample submission guide
- Tech Provider enrollment: MEDIUM -- deadline info varies across sources, Meta's own docs failed to render
- Meta App Dashboard steps: MEDIUM -- based on multiple third-party guides since Meta docs render only CSS

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable domain, 30 days)
