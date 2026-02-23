---
phase: order-notes-system
plan: 02
subsystem: ui, api
tags: [server-actions, react, optimistic-updates, timeline, order-notes, crud]

# Dependency graph
requires:
  - phase: order-notes-01
    provides: order_notes table, OrderNote/OrderNoteWithUser types, domain CRUD functions
provides:
  - Server actions for order notes (getOrderNotes, createOrderNote, updateOrderNote, deleteOrderNote)
  - OrderNotesSection client component with optimistic updates
  - Notes integration in order sheet with on-demand loading
  - Read-only notes display in WhatsApp view-order-sheet
  - Consistent 'Descripcion' labeling across all 6 UI locations
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Order notes follow exact same pattern as task notes (server actions + component)"
    - "Notes loaded on-demand when sheet opens (not in initial page query)"
    - "Read-only notes in WhatsApp view (no CRUD, just display)"

key-files:
  created:
    - src/app/actions/order-notes.ts
    - src/app/(dashboard)/crm/pedidos/components/order-notes-section.tsx
  modified:
    - src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
    - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
    - src/app/(dashboard)/crm/pedidos/page.tsx
    - src/app/(dashboard)/crm/pedidos/components/order-form.tsx
    - src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx
    - src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx
    - src/app/actions/orders.ts

key-decisions:
  - "Notes loaded via useEffect on sheet open, not during initial page load"
  - "WhatsApp view shows notes read-only (no edit/delete buttons)"
  - "'Notas' label reserved exclusively for the notes entity; 'Descripcion' for order.description"

patterns-established:
  - "Order notes CRUD follows identical pattern to task notes CRUD"
  - "Permission prop flow: page.tsx fetches role -> orders-view -> order-sheet -> notes-section"

# Metrics
duration: 8min
completed: 2026-02-23
---

# Order Notes System Plan 02: Server Actions + UI Component Summary

**Full notes CRUD with server actions, OrderNotesSection component with optimistic updates, order sheet integration, WhatsApp read-only display, and 'Notas' to 'Descripcion' rename across 6 UI locations**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-23T22:59:02Z
- **Completed:** 2026-02-23T23:07:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Server actions for full order notes CRUD with auth, permission checks, and domain delegation
- OrderNotesSection component with Timeline UI, optimistic create/edit/delete, and loading state
- Notes integrated into order sheet with on-demand loading when sheet opens
- Read-only notes display in WhatsApp view-order-sheet
- All 6 'Notas' labels renamed to 'Descripcion' for the order.description field
- Permission model: author can edit/delete own notes; admin/owner can edit/delete any note

## Task Commits

Each task was committed atomically:

1. **Task 1: Create server actions for order notes** - `7c518ad` (feat)
2. **Task 2: OrderNotesSection component + order sheet integration** - `b413249` (feat)
3. **Task 3: Rename Notas to Descripcion + WhatsApp read-only notes** - `2187aa1` (feat)

## Files Created/Modified
- `src/app/actions/order-notes.ts` - Server actions: getOrderNotes, createOrderNote, updateOrderNote, deleteOrderNote
- `src/app/(dashboard)/crm/pedidos/components/order-notes-section.tsx` - Client component with Timeline UI, optimistic updates, edit/delete
- `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx` - Integrated OrderNotesSection, renamed Notas to Descripcion
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` - Added currentUserId + isAdminOrOwner props passthrough
- `src/app/(dashboard)/crm/pedidos/page.tsx` - Fetches workspace membership role for admin/owner check
- `src/app/(dashboard)/crm/pedidos/components/order-form.tsx` - Renamed label + placeholder to Descripcion
- `src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx` - Renamed to Descripcion + added read-only notes
- `src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx` - Renamed field label to Descripcion
- `src/app/actions/orders.ts` - Renamed CSV export header to Descripcion

## Decisions Made
- Notes loaded via useEffect on sheet open (not in initial page query) to avoid loading notes for all orders upfront
- WhatsApp view shows notes as read-only list (no CRUD UI) since it is a reference view
- 'Notas' label is now reserved exclusively for the notes entity; order.description is always labeled 'Descripcion'

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Order notes system is fully complete (plan 01 + plan 02)
- No blockers or concerns

---
*Phase: order-notes-system*
*Completed: 2026-02-23*
