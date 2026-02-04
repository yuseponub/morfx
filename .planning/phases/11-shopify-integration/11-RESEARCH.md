# Phase 11: Shopify Integration - Research

**Researched:** 2026-02-04
**Domain:** Shopify Webhooks, Contact Matching, E-commerce Integration
**Confidence:** HIGH

## Summary

This research covers implementing Shopify webhook integration for automatic order synchronization from Shopify to MorfX. The integration receives `orders/create` webhooks, verifies HMAC signatures for security, matches or creates contacts using phone number (E.164) with optional fuzzy name+city matching, and creates orders with mapped products.

The standard approach is:
1. **No Shopify SDK needed for webhooks** - Use native Node.js `crypto` for HMAC verification (the official SDK is designed for OAuth apps, not just webhook receivers)
2. **libphonenumber-js already in use** - Existing phone normalization utility can handle Shopify phone formats
3. **Fuse.js for fuzzy matching** - Lightweight, well-documented library for name+city fuzzy search
4. **Talisman for phonetic algorithms** - Double Metaphone for "sounds like" matching

**Primary recommendation:** Build a simple webhook receiver using Next.js App Router route handlers with manual HMAC verification. Use existing phone normalization. Add Fuse.js + Talisman for intelligent contact matching.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js crypto (built-in) | - | HMAC-SHA256 webhook verification | Official Shopify recommendation, no extra dependency |
| libphonenumber-js | ^1.11 | Phone number normalization to E.164 | Already in project, Google's standard |
| fuse.js | ^7.0 | Fuzzy string search for name+city matching | Lightweight (5kb gzipped), fast, TypeScript support |
| talisman | ^1.1 | Phonetic algorithms (Double Metaphone, Soundex) | Modular imports, comprehensive phonetic functions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.22 | Webhook payload validation | Already in project, type-safe validation |
| @shopify/shopify-api | ^12.3 | API calls to verify credentials | ONLY for test connection, NOT for webhooks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fuse.js | FlexSearch | FlexSearch is faster but heavier; Fuse.js is sufficient for contact lists |
| talisman | phonetics npm | phonetics is smaller but talisman has more algorithms |
| Manual HMAC | @shopify/shopify-api | SDK is overkill for just receiving webhooks; adds complexity |

**Installation:**
```bash
pnpm add fuse.js talisman @shopify/shopify-api
# libphonenumber-js and zod already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── api/
│   │   └── webhooks/
│   │       └── shopify/
│   │           └── route.ts        # Webhook receiver endpoint
│   └── (dashboard)/
│       └── settings/
│           └── integraciones/
│               └── page.tsx        # Integrations settings UI
├── lib/
│   └── shopify/
│       ├── types.ts                # Shopify webhook payload types
│       ├── webhook-handler.ts      # Process incoming webhooks
│       ├── hmac.ts                 # HMAC verification utility
│       ├── contact-matcher.ts      # Contact matching logic
│       └── order-mapper.ts         # Map Shopify order to MorfX order
└── actions/
    └── shopify.ts                  # Server actions for settings
```

### Pattern 1: Webhook Route Handler with HMAC Verification
**What:** Next.js App Router route handler that verifies HMAC before processing
**When to use:** All incoming Shopify webhook requests
**Example:**
```typescript
// Source: Shopify docs + Next.js App Router pattern
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  // 1. Get raw body as text (CRITICAL for HMAC)
  const rawBody = await request.text()

  // 2. Get HMAC header
  const hmacHeader = request.headers.get('X-Shopify-Hmac-SHA256')
  if (!hmacHeader) {
    return NextResponse.json({ error: 'Missing HMAC' }, { status: 401 })
  }

  // 3. Get shop domain from header
  const shopDomain = request.headers.get('X-Shopify-Shop-Domain')

  // 4. Look up API secret for this shop
  const integration = await getShopifyIntegration(shopDomain)
  if (!integration) {
    return NextResponse.json({ error: 'Unknown shop' }, { status: 404 })
  }

  // 5. Verify HMAC
  const generatedHmac = crypto
    .createHmac('sha256', integration.api_secret)
    .update(rawBody, 'utf8')
    .digest('base64')

  const verified = crypto.timingSafeEqual(
    Buffer.from(generatedHmac),
    Buffer.from(hmacHeader)
  )

  if (!verified) {
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 })
  }

  // 6. Parse payload (now safe to parse after verification)
  const payload = JSON.parse(rawBody)

  // 7. Check for duplicate (idempotency)
  const webhookId = request.headers.get('X-Shopify-Webhook-Id')
  // ... check if already processed

  // 8. Process synchronously (Shopify timeout is 5 seconds)
  await processShopifyOrder(payload, integration.workspace_id)

  // 9. Return 200 immediately
  return NextResponse.json({ received: true }, { status: 200 })
}
```

### Pattern 2: Contact Matching with Tiered Strategy
**What:** Multi-step contact matching: phone first, then fuzzy name+city
**When to use:** When processing incoming Shopify order
**Example:**
```typescript
// Source: Project requirements + Fuse.js docs
import Fuse from 'fuse.js'
import doubleMetaphone from 'talisman/phonetics/double-metaphone'
import { normalizePhone } from '@/lib/utils/phone'

interface MatchResult {
  contact: Contact | null
  matchType: 'phone' | 'fuzzy' | 'none'
  confidence: number
  needsVerification: boolean
}

export async function matchContact(
  customerData: ShopifyCustomer,
  workspaceId: string,
  options: { enableFuzzyMatching: boolean }
): Promise<MatchResult> {
  // Step 1: Try exact phone match (E.164 normalized)
  if (customerData.phone) {
    const normalizedPhone = normalizePhone(customerData.phone)
    if (normalizedPhone) {
      const contact = await findContactByPhone(normalizedPhone, workspaceId)
      if (contact) {
        return { contact, matchType: 'phone', confidence: 1.0, needsVerification: false }
      }
    }
  }

  // Step 2: Fuzzy name+city matching (if enabled)
  if (options.enableFuzzyMatching && customerData.first_name) {
    const contacts = await getWorkspaceContacts(workspaceId)

    // Get phonetic codes for customer name
    const customerName = `${customerData.first_name} ${customerData.last_name || ''}`
    const customerPhonetic = doubleMetaphone(customerName)
    const customerCity = customerData.default_address?.city || ''

    // Prepare contacts with phonetic codes
    const contactsWithPhonetic = contacts.map(c => ({
      ...c,
      phonetic: doubleMetaphone(c.name),
      nameCity: `${c.name} ${c.city || ''}`
    }))

    // Fuse.js for fuzzy matching
    const fuse = new Fuse(contactsWithPhonetic, {
      keys: ['nameCity'],
      threshold: 0.4,
      includeScore: true
    })

    const results = fuse.search(`${customerName} ${customerCity}`)

    if (results.length > 0 && results[0].score! < 0.3) {
      // Also check phonetic similarity
      const bestMatch = results[0].item
      const phoneticMatch = bestMatch.phonetic[0] === customerPhonetic[0]

      return {
        contact: bestMatch,
        matchType: 'fuzzy',
        confidence: 1 - (results[0].score || 0),
        needsVerification: true  // ALWAYS flag fuzzy matches for human review
      }
    }
  }

  return { contact: null, matchType: 'none', confidence: 0, needsVerification: false }
}
```

### Pattern 3: Custom App Connection Test
**What:** Verify Shopify credentials by making a simple API call
**When to use:** When admin saves integration credentials
**Example:**
```typescript
// Source: Shopify custom app docs
import { shopifyApi, ApiVersion } from '@shopify/shopify-api'
import '@shopify/shopify-api/adapters/node'

export async function testShopifyConnection(
  shopDomain: string,
  accessToken: string,
  apiSecret: string
): Promise<{ success: boolean; error?: string; scopes?: string[] }> {
  try {
    const shopify = shopifyApi({
      apiKey: '', // Not needed for custom app
      apiSecretKey: apiSecret,
      hostName: shopDomain,
      apiVersion: ApiVersion.January25,
      isCustomStoreApp: true,
      adminApiAccessToken: accessToken,
    })

    const session = shopify.session.customAppSession(shopDomain)
    const client = new shopify.clients.Rest({ session })

    // Test with access_scopes endpoint
    const response = await client.get({
      path: 'oauth/access_scopes',
    })

    const scopes = response.body.access_scopes.map((s: any) => s.handle)

    // Verify required scopes
    const requiredScopes = ['read_orders']
    const missingScopes = requiredScopes.filter(s => !scopes.includes(s))

    if (missingScopes.length > 0) {
      return {
        success: false,
        error: `Missing required scopes: ${missingScopes.join(', ')}`
      }
    }

    return { success: true, scopes }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to connect to Shopify'
    }
  }
}
```

### Anti-Patterns to Avoid
- **Parsing body before HMAC verification:** The HMAC must be computed on the RAW body string, not parsed JSON
- **Using request.json() for webhooks:** Use request.text() first, verify HMAC, THEN JSON.parse()
- **Blocking webhook response:** Process synchronously but quickly; respond 200 within 5 seconds
- **Trusting webhook without HMAC:** Always verify X-Shopify-Hmac-SHA256 header
- **Auto-assigning fuzzy matches:** Always flag fuzzy name+city matches for human verification

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone normalization | Regex-based parser | libphonenumber-js | Country codes, formats, validation edge cases |
| HMAC timing attacks | Simple string comparison | crypto.timingSafeEqual | Constant-time comparison prevents timing attacks |
| Fuzzy string matching | Levenshtein from scratch | Fuse.js | Optimized, handles edge cases, configurable threshold |
| Phonetic encoding | Custom Soundex | Talisman double-metaphone | Handles non-English phonemes, widely tested |
| Webhook retry handling | Custom retry logic | Idempotency by webhook_id | Shopify already handles retries |

**Key insight:** Phone number handling seems simple but has dozens of edge cases (country codes, formatting, mobile vs landline). libphonenumber-js handles all of this. Similarly, phonetic matching for names has language-specific nuances that Talisman handles well.

## Common Pitfalls

### Pitfall 1: Body Parsing Before HMAC Verification
**What goes wrong:** HMAC computed on modified body, verification always fails
**Why it happens:** Middleware or request.json() parses body before verification code runs
**How to avoid:** Use request.text() FIRST, verify HMAC, THEN JSON.parse()
**Warning signs:** All webhooks return 401 even with correct secret

### Pitfall 2: Shopify 5-Second Timeout
**What goes wrong:** Webhook processing takes too long, Shopify marks delivery as failed
**Why it happens:** Complex processing (DB writes, external calls) exceeds 5 seconds
**How to avoid:** Keep processing under 5 seconds. If needed, queue for background processing
**Warning signs:** Shopify retries webhook multiple times, then deletes subscription

### Pitfall 3: Missing Duplicate Handling
**What goes wrong:** Same order created multiple times
**Why it happens:** Shopify may send same webhook multiple times (at-least-once delivery)
**How to avoid:** Store and check X-Shopify-Webhook-Id OR shopify_order_id in database
**Warning signs:** Duplicate orders with same Shopify order number

### Pitfall 4: Phone Number Format Mismatch
**What goes wrong:** Contact not matched even though phone exists
**Why it happens:** Shopify phone format (+1 555-123-4567) vs stored format (+15551234567)
**How to avoid:** Normalize BOTH incoming phone and stored phones to E.164 before comparison
**Warning signs:** Duplicate contacts created for same customer

### Pitfall 5: Fuzzy Match False Positives
**What goes wrong:** Wrong customer matched based on similar name
**Why it happens:** Overly aggressive fuzzy matching threshold
**How to avoid:** Use threshold 0.3-0.4, ALWAYS flag for human verification, combine with city
**Warning signs:** Orders assigned to wrong contacts

### Pitfall 6: API Secret vs Access Token Confusion
**What goes wrong:** HMAC verification fails
**Why it happens:** Using access token instead of API secret for HMAC computation
**How to avoid:** HMAC uses API Secret Key; API calls use Access Token
**Warning signs:** All webhook signatures invalid

## Code Examples

Verified patterns from official sources:

### HMAC Verification Utility
```typescript
// Source: Shopify webhook docs
import crypto from 'crypto'

export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string,
  apiSecret: string
): boolean {
  const generatedHmac = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody, 'utf8')
    .digest('base64')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(generatedHmac),
      Buffer.from(hmacHeader)
    )
  } catch {
    return false
  }
}
```

### Shopify Order Webhook Payload Types
```typescript
// Source: Shopify webhooks reference
export interface ShopifyOrderWebhook {
  id: number
  name: string  // "#1001"
  order_number: number  // 1001
  email: string | null
  phone: string | null
  created_at: string
  total_price: string
  subtotal_price: string
  total_tax: string
  currency: string
  financial_status: string  // "paid", "pending", etc.
  fulfillment_status: string | null
  customer: ShopifyCustomer | null
  billing_address: ShopifyAddress | null
  shipping_address: ShopifyAddress | null
  line_items: ShopifyLineItem[]
  note: string | null
}

export interface ShopifyCustomer {
  id: number
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
  default_address: ShopifyAddress | null
}

export interface ShopifyAddress {
  first_name: string | null
  last_name: string | null
  address1: string | null
  address2: string | null
  city: string | null
  province: string | null
  country: string | null
  zip: string | null
  phone: string | null
}

export interface ShopifyLineItem {
  id: number
  product_id: number | null
  variant_id: number | null
  sku: string
  name: string
  title: string
  quantity: number
  price: string
  total_discount: string
}
```

### Phone Normalization for Shopify Numbers
```typescript
// Source: Existing project utility + Shopify phone formats
import { parsePhoneNumber } from 'libphonenumber-js'

export function normalizeShopifyPhone(phone: string | null): string | null {
  if (!phone) return null

  // Clean the input
  const cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '')
  if (!cleaned) return null

  try {
    // Try parsing with country code detection
    // Shopify typically includes country code
    const phoneNumber = parsePhoneNumber(cleaned)

    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format('E.164')
    }

    // Fallback: try with CO default (for Colombian stores)
    const coPhone = parsePhoneNumber(cleaned, 'CO')
    if (coPhone && coPhone.isValid()) {
      return coPhone.format('E.164')
    }

    return null
  } catch {
    return null
  }
}
```

### Integration Config Database Schema
```sql
-- Integration configuration table
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'shopify'
  name TEXT NOT NULL,  -- Display name for the integration
  config JSONB NOT NULL DEFAULT '{}',
  -- For Shopify:
  -- {
  --   shop_domain: "mystore.myshopify.com",
  --   access_token: "shpat_xxx", (encrypted)
  --   api_secret: "xxx", (encrypted)
  --   webhook_secret: "xxx", (generated)
  --   default_pipeline_id: "uuid",
  --   default_stage_id: "uuid",
  --   enable_fuzzy_matching: true,
  --   product_matching: "sku" | "name" | "value",
  --   field_mappings: {...}
  -- }
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, type)
);

-- Webhook events log for debugging and idempotency
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,  -- X-Shopify-Webhook-Id
  topic TEXT NOT NULL,  -- "orders/create"
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processed, failed
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(integration_id, external_id)
);

-- Add shopify_order_id to orders table
ALTER TABLE orders ADD COLUMN shopify_order_id BIGINT;
CREATE INDEX idx_orders_shopify_order_id ON orders(shopify_order_id) WHERE shopify_order_id IS NOT NULL;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Legacy custom apps (Shopify Admin) | Dev Dashboard custom apps | Jan 2026 | New apps use client credentials flow |
| REST Admin API | GraphQL Admin API (required for new public apps) | Apr 2025 | REST still works for custom apps |
| OAuth flow for all apps | Custom store apps skip OAuth | Current | Simpler auth for single-store apps |
| @shopify/shopify-api v7 (apiSecretKey = token) | v12+ (separate apiSecretKey and adminApiAccessToken) | 2024 | Breaking change for HMAC verification |

**Deprecated/outdated:**
- Creating legacy custom apps in Shopify Admin (after Jan 1, 2026)
- REST Admin API for new public apps (GraphQL required since Apr 2025)
- Using apiSecretKey for access token in @shopify/shopify-api v7

## Open Questions

Things that couldn't be fully resolved:

1. **Field mapping granularity**
   - What we know: Shopify order has many fields (100+), user wants to select which to import
   - What's unclear: Exact field list for Colombia stores, custom metafields support
   - Recommendation: Start with core fields (customer, address, products, totals), add field picker UI later

2. **Product matching by value**
   - What we know: User wants to match products by SKU, name, OR value
   - What's unclear: How "value matching" should work (exact price? range?)
   - Recommendation: Implement SKU and name matching first, ask user to clarify value matching

3. **Retry queue implementation**
   - What we know: Should retry failed webhooks automatically, notify owner on persistent failure
   - What's unclear: Best approach without external queue (database polling vs cron?)
   - Recommendation: Use database-based retry with simple polling in serverless function

## Sources

### Primary (HIGH confidence)
- [Shopify Webhooks Best Practices](https://shopify.dev/docs/apps/build/webhooks/best-practices) - Official webhook guidelines
- [Shopify HTTPS Webhook Delivery](https://shopify.dev/docs/apps/build/webhooks/subscribe/https) - HMAC verification
- [Shopify Custom Store App Guide](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/guides/custom-store-app.md) - SDK configuration
- [libphonenumber-js README](https://github.com/catamphetamine/libphonenumber-js) - Phone normalization
- [Fuse.js Options](https://www.fusejs.io/api/options.html) - Fuzzy search configuration

### Secondary (MEDIUM confidence)
- [Talisman Phonetics](https://yomguithereal.github.io/talisman/phonetics/) - Phonetic algorithms
- [Next.js Webhook with Stripe Pattern](https://kitson-broadhurst.medium.com/next-js-app-router-stripe-webhook-signature-verification-ea9d59f3593f) - Raw body handling pattern
- [Shopify Access Scopes](https://shopify.dev/docs/api/usage/access-scopes) - Required permissions

### Tertiary (LOW confidence)
- Community forum discussions about duplicate webhooks and retry behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official docs and established libraries
- Architecture: HIGH - Pattern matches existing WhatsApp webhook in project
- Pitfalls: HIGH - Well-documented in official Shopify docs
- Contact matching: MEDIUM - Fuse.js documented, phonetic combination is custom

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - Shopify API is stable)
