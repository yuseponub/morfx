---
phase: 18-domain-layer-foundation
plan: 03
subsystem: domain
tags: [orders, domain-layer, server-actions, tool-handlers, shopify, adapter, action-executor]

# Dependency graph
requires:
  - phase: 18-02
    provides: 7 order domain functions (createOrder, updateOrder, moveOrderToStage, deleteOrder, duplicateOrder, addOrderTag, removeOrderTag)
  - phase: 18-01
    provides: DomainContext, DomainResult types
  - phase: 17
    provides: trigger-emitter functions, action-executor, automation types
  - phase: 12
    provides: tool handler pattern, ToolResult type, crmHandlers registry
provides:
  - All 5 order callers refactored to use domain/orders (server actions, tool handlers, action executor, Shopify webhook, production adapter)
  - 4 new order tool handlers: crm.order.update, crm.order.delete, crm.order.duplicate, crm.order.list
  - 4 new order tool schemas in crm.tools.ts
  - Zero duplicate trigger emissions for orders — only domain emits
affects:
  - 18-04 (contacts/tags domain — same caller migration pattern)
  - 18-05 (if any contacts tool handler migration references this pattern)
  - 18-10 (action executor — contacts/tasks actions still have direct DB, follow this precedent)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Caller migration pattern: keep validation/auth in adapter, delegate mutation to domain, keep revalidatePath as adapter concern"
    - "Tag ID→Name adapter: server actions receive tagId from UI, look up tagName, then call domain"
    - "Shopify post-domain update: domain creates order, then webhook sets shopify_order_id directly (domain-agnostic field)"
    - "Split entity migration in action-executor: order actions via domain, contact actions still direct DB (migrated in Plan 05)"
    - "Production adapter: contact creation via tool handlers, order creation via domain (hybrid until contacts domain exists)"

key-files:
  created: []
  modified:
    - src/app/actions/orders.ts
    - src/lib/automations/action-executor.ts
    - src/lib/tools/handlers/crm/index.ts
    - src/lib/tools/schemas/crm.tools.ts
    - src/lib/shopify/webhook-handler.ts
    - src/lib/agents/engine-adapters/production/orders.ts

key-decisions:
  - "Server action addOrderTag/removeOrderTag keep tagId param (UI sends tagId), adapter looks up tagName before calling domain"
  - "Action executor splits by entity type: orders via domain, contacts still direct DB (to be migrated in Plan 05)"
  - "Shopify webhook sets shopify_order_id via direct DB update AFTER domain createOrder (domain-agnostic field)"
  - "Production adapter uses OrderCreator only for contact findOrCreate, order creation fully via domain"
  - "WIP limit check stays in server action moveOrderToStage as adapter concern (not in domain)"
  - "deleteOrders bulk action loops over domain deleteOrder per ID (sequential, not batch)"
  - "updateOrder server action handles stage_id change via separate domainMoveOrderToStage call before domainUpdateOrder"

patterns-established:
  - "Thin adapter pattern: validate auth + parse input -> call domain -> revalidatePath -> return UI format"
  - "Domain-agnostic fields: caller sets fields domain doesn't know about (shopify_order_id) via direct DB after domain call"
  - "Hybrid entity migration: migrate one entity at a time, keep others as-is with comments about which plan migrates them"

# Metrics
duration: 12min
completed: 2026-02-13
---

# Phase 18 Plan 03: Orders Caller Migration Summary

**All 5 order callers (server actions, tool handlers, action executor, Shopify webhook, production adapter) wired to domain/orders + 4 new order tool handlers — orders entity 100% migrated**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-13T16:59:17Z
- **Completed:** 2026-02-13T17:10:56Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Every order mutation in the system now goes through domain/orders.ts
- All trigger emissions removed from callers (server actions had 5 emitters, action executor had 6)
- 4 new tool handlers created and registered: crm.order.update, crm.order.delete, crm.order.duplicate, crm.order.list
- Zero TypeScript compilation errors
- Bot WhatsApp operations (tool handlers, production adapter) now emit automation triggers via domain

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire server actions + action executor to domain/orders** - `48dab0b` (feat)
2. **Task 2: Wire tool handlers + Shopify + adapter + new tool handlers** - `d1e0c9f` (feat)

## Files Created/Modified
- `src/app/actions/orders.ts` - Thin adapter calling domain/orders for all mutations, removed 5 trigger emitters
- `src/lib/automations/action-executor.ts` - Order actions via domain, contact actions still direct DB
- `src/lib/tools/handlers/crm/index.ts` - orderCreate/orderUpdateStatus via domain + 4 new handlers
- `src/lib/tools/schemas/crm.tools.ts` - 4 new tool schemas (update, delete, duplicate, list)
- `src/lib/shopify/webhook-handler.ts` - createOrderWithProducts via domain + post-domain shopify_order_id update
- `src/lib/agents/engine-adapters/production/orders.ts` - Order creation via domain, contact via tool handlers

## Decisions Made
- **Tag ID to Name adapter:** Server actions receive `tagId` from UI components but domain expects `tagName`. The adapter looks up the tag name before calling domain. This keeps the UI interface stable while domain uses the canonical name-based lookup.
- **Split entity migration in action-executor:** Only order actions migrated to domain. Contact/task actions remain direct DB with explicit comments noting which future plan migrates them. This avoids scope creep while keeping the code navigable.
- **Shopify post-domain update:** The domain doesn't know about `shopify_order_id` (Shopify-specific). The webhook handler calls `domainCreateOrder` then sets `shopify_order_id` via direct DB update. This keeps the domain clean.
- **Production adapter hybrid:** Uses OrderCreator for contact find-or-create (tool handlers) but domain for order creation. Contact creation will migrate when contacts domain exists (Plan 04/05).
- **Bulk deleteOrders:** Loops over domain `deleteOrder` per ID instead of batch. Simpler, each delete is atomic with proper workspace verification.
- **updateOrder stage_id handling:** When the server action receives a stage_id change, it calls `domainMoveOrderToStage` separately (which emits stage_changed trigger), then `domainUpdateOrder` for the other fields. This ensures the stage change trigger fires correctly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all files compiled cleanly on first pass.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Orders entity is 100% complete — every mutation goes through domain
- Pattern established for contacts, tags, messages, tasks, notes, conversations migration
- Action executor ready for contacts migration (Plan 05)
- Tool handlers ready for contacts handler migration (Plan 05)

---
*Phase: 18-domain-layer-foundation*
*Completed: 2026-02-13*
