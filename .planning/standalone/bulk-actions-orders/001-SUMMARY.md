# Phase bulk-actions-orders Plan 001: Bulk Server Actions and Dialog Components Summary

**One-liner:** Two bulk server actions (move stage + edit field) with domain-loop pattern, plus BulkMoveDialog and BulkEditDialog React components with loading states.

## What Was Done

### Task 1: Add bulk server actions to orders.ts
- Added `bulkMoveOrdersToStage(orderIds, newStageId)` — loops per order calling `domainMoveOrderToStage` for automation trigger emission
- Added `bulkUpdateOrderField(orderIds, field, value)` — maps DB field names to domain params, loops per order calling `domainUpdateOrder`
- Both follow the exact `deleteOrders` pattern: guard -> getAuthContext -> DomainContext -> loop -> revalidatePath
- Field mapping supports: carrier, shipping_city, shipping_department, shipping_address, tracking_number, name, description
- **Commit:** `832be2d`

### Task 2: Create BulkMoveDialog component
- Stage picker dialog accepting `PipelineStage[]` prop
- Color-coded stage items in Select dropdown
- Loading state with spinner during async move operation
- Resets selection on close/success
- **Commit:** `4eb4b08`

### Task 3: Create BulkEditDialog component
- Two-step field-then-value picker (7 editable fields)
- Value input appears conditionally after field selection
- Loading state with spinner during async update
- Resets field + value on close/success
- **Commit:** `ac7831a`

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Per-order domain loop (not batch SQL) | Required for automation trigger emission per order |
| Field map in server action (not domain) | DB column names -> domain param names is adapter concern |
| Dialogs are self-contained (no external state) | Simpler integration in Plan 002 — parent just passes open/onConfirm |

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- Full `npx tsc --noEmit` passes with zero errors
- Both server actions exist and follow domain loop pattern
- Both dialog components export named components
- No direct Supabase writes in new server actions (domain only)

## Files

### Created
- `src/app/(dashboard)/crm/pedidos/components/bulk-move-dialog.tsx` (82 lines)
- `src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx` (101 lines)

### Modified
- `src/app/actions/orders.ts` (+74 lines — two new server actions)

## Next Phase Readiness

Plan 002 (Wave 2) can now proceed. It depends on:
- `bulkMoveOrdersToStage` and `bulkUpdateOrderField` exports from `src/app/actions/orders.ts`
- `BulkMoveDialog` export from `bulk-move-dialog.tsx`
- `BulkEditDialog` export from `bulk-edit-dialog.tsx`

## Metrics

- **Duration:** ~8 minutes
- **Completed:** 2026-02-19
- **Tasks:** 3/3
