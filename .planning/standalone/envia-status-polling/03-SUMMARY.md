---
phase: envia-status-polling
plan: 03
subsystem: ui
tags: [react, server-actions, supabase, tracking, order-sheet]

requires:
  - phase: envia-status-polling-01
    provides: order_carrier_events table
  - phase: envia-status-polling-02
    provides: carrier-events domain layer
provides:
  - Server action getOrderTrackingEvents
  - OrderTrackingSection UI component with timeline
  - Integration into order-sheet.tsx
affects: [envia-status-polling]

tech-stack:
  added: []
  patterns: [conditional section rendering based on carrier type]

key-files:
  created:
    - src/app/actions/order-tracking.ts
    - src/app/(dashboard)/crm/pedidos/components/order-tracking-section.tsx
  modified:
    - src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx

key-decisions:
  - "Section only renders for carrier containing 'envia' (case-insensitive)"
  - "Timeline shows most recent events first with novedades sub-items"

patterns-established:
  - "Conditional tracking section pattern: carrier check → fetch events → timeline render"

duration: 4min
completed: 2026-04-10
---

# Plan 03: Tracking UI Summary

**Server action + tracking timeline component integrated into order detail sheet — shows Envia shipment state history**

## Performance

- **Duration:** 4 min
- **Tasks:** 2 auto + 1 checkpoint (verified)
- **Files modified:** 3

## Accomplishments
- Server action fetches carrier events with proper auth context
- OrderTrackingSection component with loading/empty/data states
- Vertical timeline with estado + timestamp + novedades
- Integrated after Shipping section in order-sheet.tsx
- Visually verified in production — section appears for Envia orders, hidden for others

## Task Commits

1. **Task 1: Server action + tracking UI component** - `d783c68` (feat)
2. **Task 2: Integrate tracking into order sheet** - `eff3343` (feat)

## Files Created/Modified
- `src/app/actions/order-tracking.ts` - Server action with auth + domain call
- `src/app/(dashboard)/crm/pedidos/components/order-tracking-section.tsx` - Timeline component
- `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx` - Added tracking section

## Decisions Made
- Section conditionally renders only for carrier containing 'envia'
- Empty state shows "Sin eventos de tracking aun" (cron hasn't run yet)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## Next Phase Readiness
- Tracking UI ready — will populate automatically once the cron runs and stores events

---
*Phase: envia-status-polling*
*Completed: 2026-04-10*
