---
phase: 20-integration-automations
plan: 04
subsystem: api
tags: [shopify, webhooks, triggers, automations, dual-behavior]

# Dependency graph
requires:
  - phase: 20-02
    provides: "Shopify trigger emitters, Inngest events, automation runners"
  - phase: 11
    provides: "Original Shopify webhook route and handler (orders/create)"
provides:
  - "3-topic Shopify webhook dispatch (orders/create, orders/updated, draft_orders/create)"
  - "Dual-behavior auto_sync toggle for orders/create"
  - "processShopifyOrderUpdated handler with context enrichment"
  - "processShopifyDraftOrder handler (trigger-only)"
affects: ["20-05", "20-06", "20-07"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-behavior webhook handler with config toggle"
    - "Topic-based webhook dispatch via switch statement"
    - "Context enrichment from existing MorfX records before trigger emission"

key-files:
  created: []
  modified:
    - "src/app/api/webhooks/shopify/route.ts"
    - "src/lib/shopify/webhook-handler.ts"

key-decisions:
  - "auto_sync_orders defaults to true for full backward compatibility"
  - "Draft orders always trigger-only, never auto-create CRM records"
  - "orders/updated enriches trigger data with existing MorfX order/contact info"
  - "All webhook responses return 200 per Shopify requirements"

patterns-established:
  - "Dual-behavior toggle: config flag controls whether webhook auto-creates or only emits trigger"
  - "Generic payload parsing with type-safe cast per topic branch"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 20 Plan 04: Shopify Webhook Extension Summary

**3-topic Shopify webhook with dual-behavior auto_sync toggle and trigger emission for orders/create, orders/updated, draft_orders/create**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T20:01:19Z
- **Completed:** 2026-02-16T20:05:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Webhook route now dispatches to 3 topic-specific handlers instead of only orders/create
- orders/create respects auto_sync_orders toggle: true (default) creates CRM records + emits trigger, false only emits trigger
- orders/updated handler looks up existing MorfX order for context enrichment before emitting trigger
- draft_orders/create handler always goes through automations only (no CRM creation)
- All 3 handlers emit their respective Shopify triggers (emitShopifyOrderCreated, emitShopifyOrderUpdated, emitShopifyDraftOrderCreated)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Shopify webhook route for 3 topics** - `6dfde8b` (feat)
2. **Task 2: Implement dual-behavior toggle and 2 new handlers** - `32d7f8a` (feat)

## Files Created/Modified
- `src/app/api/webhooks/shopify/route.ts` - Extended from single-topic to 3-topic dispatch with type-safe casting
- `src/lib/shopify/webhook-handler.ts` - Added auto_sync toggle, processShopifyOrderUpdated, processShopifyDraftOrder, trigger emission

## Decisions Made
- auto_sync_orders defaults to true (config.auto_sync_orders !== false) ensuring existing integrations continue working unchanged
- Draft orders never auto-create CRM records -- user configures behavior via automations
- orders/updated looks up existing MorfX order by shopify_order_id to enrich trigger with contactId/contactName/contactPhone
- Payload parsing is generic (unknown) with type cast per switch branch for clean separation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Shopify webhook subscriptions for orders/updated and draft_orders/create topics need to be registered in Shopify admin (covered by plan 20-05 or manual setup).

## Next Phase Readiness
- Webhook handlers complete for all 3 Shopify topics
- Trigger emission active -- automations engine can process Shopify events
- Ready for plan 20-05 (Shopify settings UI with auto_sync toggle)

---
*Phase: 20-integration-automations*
*Completed: 2026-02-16*
