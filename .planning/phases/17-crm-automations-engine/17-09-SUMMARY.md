---
phase: 17-crm-automations-engine
plan: 09
subsystem: ui, api
tags: [supabase, react, server-actions, related-orders, source-order-id, bidirectional-navigation]

# Dependency graph
requires:
  - phase: 17-01
    provides: "Automations types, constants, source_order_id migration"
  - phase: 17-04
    provides: "Action executor with duplicate_order setting source_order_id"
provides:
  - "RelatedOrder type for connected order display"
  - "getRelatedOrders server action (source, derived, siblings)"
  - "RelatedOrders UI component in order detail sheet"
  - "source_order_id on Order interface"
affects: ["17-10", "18-ai-automation-builder"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side server action call in useEffect for lazy data loading"
    - "In-sheet navigation via onViewOrder callback with router.push fallback"

key-files:
  created:
    - "src/app/(dashboard)/crm/pedidos/components/related-orders.tsx"
  modified:
    - "src/lib/orders/types.ts"
    - "src/app/actions/orders.ts"
    - "src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"

key-decisions:
  - "RelatedOrders placed in OrderSheet (side panel) instead of standalone page since no order detail page exists"
  - "Related orders fetched client-side via useEffect to avoid blocking sheet open"
  - "In-sheet navigation for same-pipeline orders, router.push fallback for cross-pipeline"
  - "stage_color added to RelatedOrder type (not in original plan) for visual stage badges"

patterns-established:
  - "Lazy server action fetch in client components: useEffect + server action for non-blocking data"

# Metrics
duration: 8min
completed: 2026-02-13
---

# Phase 17 Plan 09: Connected Orders Summary

**source_order_id on Order type, getRelatedOrders server action with source/derived/sibling logic, and RelatedOrders UI in order detail sheet**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-13T03:24:11Z
- **Completed:** 2026-02-13T03:32:17Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added source_order_id to Order interface and OrderFormData, matching the existing DB migration
- Implemented getRelatedOrders server action that fetches source, derived, and sibling orders
- Created RelatedOrders component with source/derived icons, stage color badges, COP formatting, and relative time
- Integrated into OrderSheet with in-sheet navigation and cross-pipeline fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Update order types and add related orders server action** - `7f1d581` (feat)
2. **Task 2: Related orders UI component in order detail sheet** - `2e2bb2a` (feat)

## Files Created/Modified
- `src/lib/orders/types.ts` - Added source_order_id to Order, source_order_id to OrderFormData, new RelatedOrder interface
- `src/app/actions/orders.ts` - Added RelatedOrder import, getRelatedOrders server action with source/derived/sibling queries
- `src/app/(dashboard)/crm/pedidos/components/related-orders.tsx` - New component: RelatedOrders with Link2, ArrowUpLeft, ArrowDownRight icons, stage badges, COP currency, relative time
- `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx` - Added related orders fetch via useEffect, RelatedOrders section, onViewOrder/allOrders props
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` - Pass allOrders and onViewOrder to OrderSheet

## Decisions Made
- **Path adaptation:** Plan referenced `/crm/orders/[id]/page.tsx` which doesn't exist. The app uses `/crm/pedidos/` with OrderSheet (side panel) for order details. Adapted to integrate RelatedOrders into OrderSheet instead.
- **Client-side fetch:** Related orders are fetched via useEffect when order opens, not blocking the initial sheet render.
- **Navigation strategy:** In-sheet navigation for orders in the current view (via onViewOrder callback), with router.push fallback for orders in other pipelines.
- **stage_color field:** Added to RelatedOrder type (beyond original plan spec) for visual stage badge coloring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted file paths to actual codebase structure**
- **Found during:** Task 2 (Related orders UI)
- **Issue:** Plan referenced `src/app/(dashboard)/crm/orders/[id]/page.tsx` and `components/related-orders.tsx` but this path doesn't exist. Orders use `/crm/pedidos/` with a Sheet component, not a standalone detail page.
- **Fix:** Created RelatedOrders component under `crm/pedidos/components/` and integrated into existing OrderSheet instead of a non-existent page.
- **Files modified:** All Task 2 files
- **Verification:** TypeScript compiles, component renders in order detail sheet
- **Committed in:** 2e2bb2a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Path adaptation necessary for correct integration. Same functionality delivered, just at the correct location.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Related orders UI is ready for testing once automation-created orders with source_order_id exist in the database
- Plan 17-10 (final verification/integration) can proceed
- The duplicate_order action (Plan 17-04) already sets source_order_id, so the full chain is wired

---
*Phase: 17-crm-automations-engine*
*Completed: 2026-02-13*
