---
phase: standalone/crm-orders-performance
plan: 01
subsystem: ui, api
tags: [kanban, scroll, pagination, server-actions, supabase]

# Dependency graph
requires: []
provides:
  - "Fixed Kanban column vertical scroll via height constraint"
  - "getOrdersForStage server action with LIMIT/OFFSET pagination"
  - "getStageOrderCounts server action for column header counts"
affects:
  - "standalone/crm-orders-performance plan 02 (infinite scroll)"
  - "standalone/crm-orders-performance plan 03 (virtualization)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "hasMore pagination pattern: fetch limit+1, slice to limit"
    - "Fixed height board container enabling column overflow scroll"

key-files:
  created: []
  modified:
    - "src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx"
    - "src/app/actions/orders.ts"

key-decisions:
  - "Changed min-h to h (not max-h) for deterministic column height"
  - "Used .range(offset, offset+limit) with hasMore detection for pagination"
  - "Kept existing getOrders/getOrdersByPipeline unchanged for backwards compatibility"

patterns-established:
  - "Per-stage pagination: getOrdersForStage(stageId, limit, offset) returns { orders, hasMore }"

# Metrics
duration: 18min
completed: 2026-02-17
---

# Standalone Plan 01: Kanban Scroll Fix + Paginated Server Actions Summary

**Fixed Kanban column scroll via height constraint and added getOrdersForStage/getStageOrderCounts server actions for per-stage pagination**

## Performance

- **Duration:** 18 min
- **Started:** 2026-02-17T12:25:03Z
- **Completed:** 2026-02-17T12:43:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Kanban columns now scroll vertically when cards exceed viewport height
- New `getOrdersForStage` server action supports LIMIT/OFFSET pagination per stage
- New `getStageOrderCounts` returns order counts per stage for column headers
- Existing `getOrders()` and `getOrdersByPipeline()` fully unchanged (backwards compatible)
- Build passes without errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Kanban board height constraint** - `dd2af04` (fix)
2. **Task 2: Add getOrdersForStage and getStageOrderCounts** - `69036fc` (feat)

## Files Created/Modified
- `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` - Changed `min-h-[calc(100vh-280px)]` to `h-[calc(100vh-280px)]` for fixed height enabling column scroll
- `src/app/actions/orders.ts` - Added `getOrdersForStage` (paginated per-stage) and `getStageOrderCounts` (counts per stage for headers)

## Decisions Made
- Used `h-[calc(100vh-280px)]` instead of `max-h` because the columns need a fixed parent height for `overflow-y-auto` to activate. `max-h` would still allow the container to shrink below the viewport.
- Used `hasMore` pattern (fetch limit+1, check length, slice to limit) instead of a separate count query for efficiency.
- Did NOT refactor to use `getAuthContext()` helper in new actions because the existing `getOrders()` function also uses inline auth -- kept consistent with surrounding code patterns.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Kanban scroll works, ready for Plan 02 (infinite scroll with IntersectionObserver)
- `getOrdersForStage` returns `{ orders, hasMore }` which Plan 02 will consume
- `getStageOrderCounts` ready for column header total display
- No blockers

---
*Phase: standalone/crm-orders-performance*
*Completed: 2026-02-17*
