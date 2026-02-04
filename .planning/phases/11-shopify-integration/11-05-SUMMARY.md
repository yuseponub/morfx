---
phase: 11
plan: 05
subsystem: shopify-integration
tags: [webhook, api-route, hmac, security, shopify]

dependency-graph:
  requires: [11-03]
  provides: [webhook-endpoint]
  affects: [11-02]

tech-stack:
  added: []
  patterns: [webhook-receiver, hmac-verification, shop-domain-routing]

key-files:
  created:
    - src/app/api/webhooks/shopify/route.ts
  modified: []

decisions:
  - id: return-200-always
    choice: "Always return 200 even on errors to prevent Shopify retry storms"
    rationale: "Errors are logged in webhook_events table for manual retry"

metrics:
  duration: ~4 minutes
  completed: 2026-02-04
---

# Phase 11 Plan 05: Shopify Webhook Endpoint Summary

Webhook endpoint for receiving and processing Shopify orders/create events with HMAC security

## What Was Built

### Webhook Route Handler (`/api/webhooks/shopify`)

**POST Handler** - Receives Shopify webhooks with security-first approach:

1. **Raw Body First**: Uses `request.text()` before any JSON parsing to preserve exact bytes for HMAC verification
2. **Header Validation**: Requires X-Shopify-Hmac-SHA256, X-Shopify-Webhook-Id, X-Shopify-Shop-Domain
3. **Integration Lookup**: Finds matching integration by shop domain (case-insensitive)
4. **HMAC Verification**: Validates signature using integration's api_secret before trusting payload
5. **Topic Filtering**: Only processes `orders/create`, ignores other topics gracefully
6. **Webhook Processing**: Delegates to `processShopifyWebhook()` for order creation
7. **Error Handling**: Always returns 200 to prevent Shopify retry storms; errors logged for manual review

**GET Handler** - Health check endpoint for monitoring:
- Returns `{ status: "ok", endpoint: "shopify-webhook", timestamp: "..." }`

### Security Measures

| Measure | Implementation |
|---------|----------------|
| HMAC Verification | `verifyShopifyHmac()` with timing-safe comparison |
| Raw Body Handling | `request.text()` before JSON.parse |
| Shop Domain Routing | Integration lookup by domain |
| Unknown Shops | Return 200 with `ignored: unknown_shop` |
| Failed HMAC | Return 401 |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 291ced3 | feat | Shopify webhook endpoint |

## Deviations from Plan

None - plan executed exactly as written.

## Key Files Created

**src/app/api/webhooks/shopify/route.ts** (139 lines)
```typescript
// Key exports
export async function POST(request: NextRequest) { ... }
export async function GET() { ... }

// Critical flow
const rawBody = await request.text()  // BEFORE JSON parsing
const isValid = verifyShopifyHmac(rawBody, hmacHeader, apiSecret)
// Only parse JSON after HMAC verification
const payload = JSON.parse(rawBody)
```

## Integration Points

| From | To | Via |
|------|----|----|
| route.ts | hmac.ts | `import verifyShopifyHmac` |
| route.ts | webhook-handler.ts | `import processShopifyWebhook` |
| route.ts | types.ts | `import ShopifyOrderWebhook, ShopifyIntegration` |
| middleware.ts | route.ts | `/api/webhooks` passthrough (no auth) |

## Verification Results

- [x] Webhook endpoint exists at /api/webhooks/shopify
- [x] HMAC verification happens before payload parsing
- [x] Integration lookup finds correct workspace by shop domain
- [x] Always returns 200 (errors logged, not exposed via HTTP status)
- [x] GET endpoint works for health check

## Next Steps

This completes Wave 3 of Phase 11. The webhook pipeline is now complete:
1. **11-01**: Database schema (integrations, webhook_events tables)
2. **11-02**: HMAC verification, types, phone normalizer, contact matcher
3. **11-03**: Order mapper, webhook handler orchestration
4. **11-04**: Connection test, server actions for CRUD
5. **11-05**: Webhook endpoint (this plan)

Remaining for Phase 11:
- **11-06**: Integration settings UI
- **11-07**: Integration testing with real Shopify store

---

*Generated: 2026-02-04*
