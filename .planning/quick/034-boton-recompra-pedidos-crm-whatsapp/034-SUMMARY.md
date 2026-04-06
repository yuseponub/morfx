---
phase: quick-034
plan: 01
subsystem: crm-orders
tags: [recompra, orders, kanban, whatsapp, domain-layer]
completed: 2026-04-06
duration: ~15min
tech-stack:
  patterns: [domain-function, server-action, confirmation-dialog, prop-threading]
key-files:
  created: []
  modified:
    - src/lib/domain/orders.ts
    - src/app/actions/orders.ts
    - src/app/(dashboard)/crm/pedidos/components/columns.tsx
    - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
    - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
    - src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
    - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
    - src/app/(dashboard)/crm/pedidos/components/orders-table.tsx
    - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
    - src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx
---

# Quick 034: Boton Recompra Pedidos CRM + WhatsApp Summary

Recompra button across 4 UI locations (CRM table, CRM kanban, WhatsApp contact-panel, WhatsApp view-order-sheet) that duplicates an order via duplicateOrder then clears tracking/carrier/guide/closing_date fields for a fresh repeat order.

## Commits

| # | Hash | Description |
|---|------|-------------|
| 1 | a633286 | Domain recompraOrder function + server action |
| 2 | 6ecb8e0 | Recompra button in all 4 UI locations with confirmation dialogs |

## What Was Built

### Domain Layer
- `RecompraOrderParams` and `RecompraOrderResult` types
- `recompraOrder()` domain function: reads source order pipeline_id, calls `duplicateOrder()` to same pipeline (first stage), then clears `tracking_number`, `carrier`, `carrier_guide_number`, `closing_date`

### Server Action
- `recompraOrder(orderId)` server action: auth check, domain call, revalidatePath

### UI Integration
- **CRM Table**: Recompra option in dropdown menu (between Edit and Delete)
- **CRM Kanban**: RefreshCw icon button in card footer, threaded through KanbanBoard -> KanbanColumn -> KanbanCard via onRecompra prop
- **WhatsApp Contact Panel**: RefreshCw icon button next to Eye button on order cards, self-contained with own AlertDialog
- **WhatsApp View Order Sheet**: Recompra button next to Editar button
- All locations show confirmation AlertDialog before executing
- Toast feedback on success/error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed orders-table.tsx missing onRecompra prop**
- **Found during:** Task 2 (type check)
- **Issue:** `orders-table.tsx` also calls `createColumns()` but was not listed in the plan. Adding `onRecompra` as required prop broke it.
- **Fix:** Added recompra state, handler, dialog, and import to `orders-table.tsx`
- **Files modified:** `src/app/(dashboard)/crm/pedidos/components/orders-table.tsx`

**2. [Rule 3 - Blocking] Kanban prop threading through intermediary components**
- **Found during:** Task 2
- **Issue:** Plan only mentioned KanbanCard but onRecompra needs to be threaded through KanbanBoard and KanbanColumn
- **Fix:** Added onRecompra prop to KanbanBoardProps, KanbanColumnProps, and passed it down the chain
- **Files modified:** `kanban-board.tsx`, `kanban-column.tsx`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| onRecompra as optional prop in KanbanCard | Backward compatible, drag overlay KanbanCard doesn't need it |
| Self-contained recompra in contact-panel | RecentOrdersList manages its own state, no need to lift to parent |
| Recompra dialog in orders-view shared by table+kanban | Both views share the same confirmation dialog via shared state |

## Verification

- [x] `npx tsc --noEmit` passes (only pre-existing vitest type errors)
- [x] `npm run build` completes successfully
- [ ] Manual: CRM table dropdown shows Recompra option
- [ ] Manual: CRM kanban card footer shows recompra icon
- [ ] Manual: WhatsApp contact-panel order cards show recompra icon
- [ ] Manual: WhatsApp order detail sheet shows Recompra button
- [ ] Manual: Confirmation dialog + toast feedback works
