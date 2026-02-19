# Bulk Actions para Ordenes - Research

**Researched:** 2026-02-19
**Domain:** Orders module bulk operations (move to stage, edit field in bulk)
**Confidence:** HIGH

## Summary

This research investigates how to add two new bulk actions to the existing orders module: "Mover de etapa" (move selected orders to a different pipeline stage) and "Editar campo en bulk" (edit a specific field across all selected orders). The investigation focused entirely on codebase analysis since this is an internal feature extension with no external library dependencies.

The codebase already has a mature bulk selection system in the orders view (`selectedOrderIds: Set<string>`) with a selection toolbar that supports Export and Delete. The contacts module provides a reference BulkActions component pattern. The domain layer already exposes `moveOrderToStage()` and `updateOrder()` functions that handle DB mutations, workspace scoping, and automation trigger emission. The server actions layer in `orders.ts` follows a consistent pattern: `getAuthContext() -> domain call -> revalidatePath`.

**Primary recommendation:** Extend the existing selection toolbar in `orders-view.tsx` with two new buttons that open Dialog components (not sheets). Reuse existing domain functions in a loop pattern identical to `deleteOrders()`. No new domain functions needed.

## Standard Stack

No new libraries needed. Everything uses existing project dependencies.

### Core (Already Installed)
| Library | Purpose | Where Used |
|---------|---------|------------|
| `@radix-ui/react-dialog` | Dialog component for stage picker and field editor | `src/components/ui/dialog.tsx` |
| `@radix-ui/react-select` | Select component for stage/field dropdowns | `src/components/ui/select.tsx` |
| `@radix-ui/react-dropdown-menu` | Dropdown for bulk action menu | `src/components/ui/dropdown-menu.tsx` |
| `react-hook-form` | Form handling for bulk edit form | `order-form.tsx` uses this |
| `sonner` | Toast notifications | Used everywhere for success/error |
| `lucide-react` | Icons | Used everywhere |

### No New Dependencies Required

All UI components exist:
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` from `@/components/ui/dialog`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- `Button` from `@/components/ui/button`
- `Input` from `@/components/ui/input`
- `Label` from `@/components/ui/label`
- `AlertDialog` for confirmations (already used in orders-view.tsx)

## Architecture Patterns

### Existing File Structure (Orders Module)
```
src/
  lib/
    domain/
      orders.ts           # Domain layer: moveOrderToStage, updateOrder, deleteOrder
      types.ts            # DomainContext, DomainResult
    orders/
      types.ts            # Order, OrderWithDetails, PipelineStage, PipelineWithStages
  app/
    actions/
      orders.ts           # Server actions: auth -> domain -> revalidatePath
    (dashboard)/crm/pedidos/components/
      orders-view.tsx     # Main component with selection state + toolbar
      kanban-board.tsx    # Kanban view with selection props
      kanban-card.tsx     # Card with checkbox selection
      kanban-column.tsx   # Column with selection pass-through
      order-form.tsx      # Edit form (reference for field names)
```

### Pattern 1: Server Action (Bulk Operation)
**What:** The pattern for bulk server actions in this codebase loops over IDs calling domain functions per ID.
**When to use:** For all new bulk actions.
**Example (existing deleteOrders):**
```typescript
// Source: src/app/actions/orders.ts lines 628-646
export async function deleteOrders(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  if (ids.length === 0) {
    return { error: 'No hay pedidos para eliminar' }
  }

  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  let deleted = 0

  for (const id of ids) {
    const result = await domainDeleteOrder(ctx, { orderId: id })
    if (result.success) deleted++
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: { deleted } }
}
```

### Pattern 2: Bulk Selection State Management
**What:** Orders use a `Set<string>` for selected IDs, managed in the parent `OrdersView`.
**When to use:** Already exists, just add new action buttons.
**Key state (from orders-view.tsx):**
```typescript
const [selectedOrderIds, setSelectedOrderIds] = React.useState<Set<string>>(new Set())

const handleOrderSelectChange = (orderId: string, selected: boolean) => {
  setSelectedOrderIds((prev) => {
    const next = new Set(prev)
    if (selected) { next.add(orderId) } else { next.delete(orderId) }
    return next
  })
}

const clearSelection = () => setSelectedOrderIds(new Set())
```

### Pattern 3: Selection Toolbar (Existing)
**What:** The toolbar appears when `selectedOrderIds.size > 0` and shows Export/Delete actions.
**Location:** `orders-view.tsx` lines 759-786
**Structure:**
```tsx
{selectedOrderIds.size > 0 && (
  <div className="flex items-center gap-3 mb-3 p-2 bg-primary/10 border border-primary/20 rounded-lg">
    <span className="text-sm font-medium">
      {selectedOrderIds.size} pedido{selectedOrderIds.size > 1 ? 's' : ''} seleccionado{selectedOrderIds.size > 1 ? 's' : ''}
    </span>
    <div className="flex-1" />
    {/* Action buttons go here */}
    <Button variant="ghost" size="sm" onClick={clearSelection}>
      <XIcon className="h-4 w-4" />
    </Button>
  </div>
)}
```

### Pattern 4: Contacts BulkActions Reference
**What:** The contacts module has a dedicated `BulkActions` component with tag operations.
**Location:** `src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx`
**Note:** The contacts pattern uses a separate BulkActions component. For orders, the toolbar is inline in orders-view.tsx. We should follow the existing orders pattern (inline) rather than creating a separate component, keeping consistency within the orders module.

### Anti-Patterns to Avoid
- **Direct DB writes from server actions:** ALL mutations MUST go through `src/lib/domain/orders.ts`. Never use `createAdminClient()` in server actions.
- **Bypassing automation triggers:** The domain layer's `moveOrderToStage()` emits `emitOrderStageChanged()` and `updateOrder()` emits `emitFieldChanged()`. Bulk operations MUST use these domain functions to preserve automation trigger integrity.
- **Single batch update query:** Do NOT write a single `supabase.from('orders').update().in('id', ids)` query. The domain layer needs to be called per-order to emit the correct triggers with previous/new state diff.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Move order to stage | Custom SQL update | `domainMoveOrderToStage(ctx, { orderId, newStageId })` | Emits `order.stage_changed` trigger with rich context (stage names, contact info, shipping) |
| Update order field | Custom SQL update | `domainUpdateOrder(ctx, { orderId, ...fields })` | Emits `field.changed` trigger per changed field with prev/new comparison |
| Auth validation | Custom auth check | `getAuthContext()` helper in `src/app/actions/orders.ts` | Already handles user check + workspace cookie |
| Stage selector UI | Custom dropdown | Existing `Select` + `SelectItem` from `@/components/ui/select` | Already used for stage filter in orders-view.tsx |
| Loading states | Custom spinner | Existing `LoaderIcon` from lucide-react + disabled button pattern | Used in order-form.tsx |

**Key insight:** The domain layer is designed for per-entity operations because each mutation needs to capture previous state, diff, and emit appropriate triggers. Bulk operations are just loops over the domain functions.

## Common Pitfalls

### Pitfall 1: Not Emitting Automation Triggers in Bulk
**What goes wrong:** Writing a direct Supabase batch update skips automation triggers, breaking the automation system.
**Why it happens:** Developer optimizes for DB performance by batching.
**How to avoid:** Always loop over domain functions. The trigger emission (order.stage_changed, field.changed) is critical for the automation engine.
**Warning signs:** Importing `createAdminClient` in server actions instead of using domain functions.

### Pitfall 2: Kanban State Desync After Bulk Move
**What goes wrong:** After moving 10 orders to a new stage, the kanban board doesn't reflect the change until full refresh.
**Why it happens:** The kanban uses `kanbanOrders` state (per-stage paginated data) that doesn't automatically update.
**How to avoid:** After a successful bulk move, either (a) call `setKanbanInitialized(false)` to reload all stages (simplest, matches existing pattern from deleteOrders), or (b) optimistically update kanbanOrders state.
**Warning signs:** Cards remaining in old columns after bulk move.

### Pitfall 3: Missing Pipeline Scope for Stage Selection
**What goes wrong:** Stage selector shows stages from ALL pipelines instead of only the active pipeline.
**Why it happens:** Not filtering stages by `activePipelineId`.
**How to avoid:** The stage data is already scoped - use `stages` from `activePipeline.stages` which is already filtered. The stages constant is available at line 424: `const stages = activePipeline?.stages || []`.

### Pitfall 4: Not Clearing Selection After Bulk Action
**What goes wrong:** After a bulk action completes, the selection toolbar still shows selected items.
**Why it happens:** Forgetting to call `clearSelection()` after action completes.
**How to avoid:** Follow the existing `handleBulkDelete` pattern which calls `clearSelection()` after success.

### Pitfall 5: Blocking UI During Large Bulk Operations
**What goes wrong:** Moving 50+ orders one by one via domain calls takes time, and UI appears frozen.
**Why it happens:** No loading state or progress indication.
**How to avoid:** Use loading state (isBulkMoving, isBulkEditing) to disable buttons and show progress. Follow the existing `isBulkDeleting` pattern.

## Code Examples

### Example 1: New Server Action - bulkMoveOrdersToStage
```typescript
// File: src/app/actions/orders.ts (add to existing file)

/**
 * Move multiple orders to a new pipeline stage.
 * Loops over IDs calling domain moveOrderToStage per ID.
 */
export async function bulkMoveOrdersToStage(
  orderIds: string[],
  newStageId: string
): Promise<ActionResult<{ moved: number }>> {
  if (orderIds.length === 0) {
    return { error: 'No hay pedidos para mover' }
  }

  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  let moved = 0

  for (const orderId of orderIds) {
    const result = await domainMoveOrderToStage(ctx, { orderId, newStageId })
    if (result.success) moved++
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: { moved } }
}
```

### Example 2: New Server Action - bulkUpdateOrderField
```typescript
// File: src/app/actions/orders.ts (add to existing file)

/**
 * Update a specific field across multiple orders.
 * Supports: carrier, shipping_city, shipping_department, shipping_address, name, description.
 */
export async function bulkUpdateOrderField(
  orderIds: string[],
  field: string,
  value: string | null
): Promise<ActionResult<{ updated: number }>> {
  if (orderIds.length === 0) {
    return { error: 'No hay pedidos para actualizar' }
  }

  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  let updated = 0

  // Map field name to domain param
  const fieldToParam: Record<string, string> = {
    carrier: 'carrier',
    shipping_city: 'shippingCity',
    shipping_department: 'shippingDepartment',
    shipping_address: 'shippingAddress',
    name: 'name',
    description: 'description',
    tracking_number: 'trackingNumber',
  }

  const paramKey = fieldToParam[field]
  if (!paramKey) {
    return { error: `Campo no soportado: ${field}` }
  }

  for (const orderId of orderIds) {
    const result = await domainUpdateOrder(ctx, {
      orderId,
      [paramKey]: value,
    })
    if (result.success) updated++
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: { updated } }
}
```

### Example 3: Stage Picker Dialog Component
```typescript
// File: src/app/(dashboard)/crm/pedidos/components/bulk-move-dialog.tsx

'use client'

import * as React from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LoaderIcon } from 'lucide-react'
import type { PipelineStage } from '@/lib/orders/types'

interface BulkMoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stages: PipelineStage[]
  selectedCount: number
  onConfirm: (stageId: string) => Promise<void>
}

export function BulkMoveDialog({
  open, onOpenChange, stages, selectedCount, onConfirm,
}: BulkMoveDialogProps) {
  const [selectedStageId, setSelectedStageId] = React.useState<string>('')
  const [isMoving, setIsMoving] = React.useState(false)

  const handleConfirm = async () => {
    if (!selectedStageId) return
    setIsMoving(true)
    try {
      await onConfirm(selectedStageId)
      onOpenChange(false)
      setSelectedStageId('')
    } finally {
      setIsMoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mover {selectedCount} pedido{selectedCount > 1 ? 's' : ''}</DialogTitle>
          <DialogDescription>
            Selecciona la etapa a la que deseas mover los pedidos seleccionados.
          </DialogDescription>
        </DialogHeader>
        <Select value={selectedStageId} onValueChange={setSelectedStageId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona una etapa" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  {stage.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMoving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedStageId || isMoving}>
            {isMoving ? (
              <><LoaderIcon className="h-4 w-4 mr-2 animate-spin" />Moviendo...</>
            ) : (
              'Mover'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Example 4: Bulk Edit Dialog Component
```typescript
// File: src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx

'use client'

import * as React from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LoaderIcon } from 'lucide-react'

const BULK_EDITABLE_FIELDS = [
  { value: 'carrier', label: 'Transportadora' },
  { value: 'shipping_city', label: 'Ciudad de envio' },
  { value: 'shipping_department', label: 'Departamento de envio' },
  { value: 'shipping_address', label: 'Direccion de envio' },
  { value: 'tracking_number', label: 'Numero de guia' },
  { value: 'name', label: 'Nombre del pedido' },
  { value: 'description', label: 'Notas / descripcion' },
] as const

interface BulkEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  onConfirm: (field: string, value: string) => Promise<void>
}

export function BulkEditDialog({
  open, onOpenChange, selectedCount, onConfirm,
}: BulkEditDialogProps) {
  const [selectedField, setSelectedField] = React.useState<string>('')
  const [fieldValue, setFieldValue] = React.useState('')
  const [isUpdating, setIsUpdating] = React.useState(false)

  const handleConfirm = async () => {
    if (!selectedField || !fieldValue.trim()) return
    setIsUpdating(true)
    try {
      await onConfirm(selectedField, fieldValue.trim())
      onOpenChange(false)
      setSelectedField('')
      setFieldValue('')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {selectedCount} pedido{selectedCount > 1 ? 's' : ''}</DialogTitle>
          <DialogDescription>
            Selecciona el campo y el valor que deseas aplicar a todos los pedidos seleccionados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Campo</Label>
            <Select value={selectedField} onValueChange={(v) => { setSelectedField(v); setFieldValue(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un campo" />
              </SelectTrigger>
              <SelectContent>
                {BULK_EDITABLE_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedField && (
            <div className="space-y-2">
              <Label>Nuevo valor</Label>
              <Input
                value={fieldValue}
                onChange={(e) => setFieldValue(e.target.value)}
                placeholder={`Valor para ${BULK_EDITABLE_FIELDS.find(f => f.value === selectedField)?.label}`}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedField || !fieldValue.trim() || isUpdating}>
            {isUpdating ? (
              <><LoaderIcon className="h-4 w-4 mr-2 animate-spin" />Actualizando...</>
            ) : (
              'Aplicar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Example 5: Integration in orders-view.tsx Selection Toolbar
```typescript
// Add to the selection bar (orders-view.tsx line ~759-786), between Export and Delete buttons:

<Button
  variant="outline"
  size="sm"
  onClick={() => setBulkMoveDialogOpen(true)}
>
  <ArrowRightIcon className="h-4 w-4 mr-1" />
  Mover de etapa
</Button>
<Button
  variant="outline"
  size="sm"
  onClick={() => setBulkEditDialogOpen(true)}
>
  <PencilIcon className="h-4 w-4 mr-1" />
  Editar campo
</Button>
```

## Existing Data Structures

### Order Fields Available for Bulk Edit
From `src/lib/orders/types.ts` (Order interface) and `src/lib/domain/orders.ts` (UpdateOrderParams):

| Field | DB Column | Domain Param | Type | Useful for Bulk? |
|-------|-----------|-------------|------|------------------|
| Transportadora | `carrier` | `carrier` | string | YES - Common bulk edit |
| Ciudad envio | `shipping_city` | `shippingCity` | string | YES - Common bulk edit |
| Depto envio | `shipping_department` | `shippingDepartment` | string | YES - Common bulk edit |
| Dir envio | `shipping_address` | `shippingAddress` | string | YES - Common bulk edit |
| Guia | `tracking_number` | `trackingNumber` | string | YES - For carrier import |
| Nombre | `name` | `name` | string | MAYBE |
| Notas | `description` | `description` | string | MAYBE |
| Contacto | `contact_id` | `contactId` | string (FK) | NO - Too complex for bulk |
| Productos | `products` | `products` | array | NO - Too complex for bulk |
| Custom fields | `custom_fields` | `customFields` | JSON | MAYBE - Future enhancement |

### Pipeline Stages Structure
From `src/lib/orders/types.ts`:
```typescript
interface PipelineStage {
  id: string
  pipeline_id: string
  name: string
  color: string
  position: number
  wip_limit: number | null
  is_closed: boolean
  order_state_id?: string | null
}
```

The `stages` array is already available in `orders-view.tsx` at line 424:
```typescript
const stages = activePipeline?.stages || []
```

### DomainContext Pattern
```typescript
// Always created like this in server actions:
const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Direct Supabase writes in server actions | Domain layer pattern (v2.0) | All mutations emit automation triggers |
| Full data reload on kanban changes | Paginated per-stage + optimistic updates | Better performance with large datasets |
| Confirm with `window.confirm()` (contacts) | AlertDialog component (orders) | Better UX, consistent with design system |

## Key Files to Modify

1. **`src/app/actions/orders.ts`** - Add `bulkMoveOrdersToStage()` and `bulkUpdateOrderField()` server actions
2. **`src/app/(dashboard)/crm/pedidos/components/orders-view.tsx`** - Add bulk move/edit buttons to selection toolbar, dialog state, handlers
3. **NEW: `src/app/(dashboard)/crm/pedidos/components/bulk-move-dialog.tsx`** - Stage picker dialog
4. **NEW: `src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx`** - Field editor dialog

## Open Questions

1. **WIP Limit Check for Bulk Move**
   - What we know: The single `moveOrderToStage` server action checks WIP limits before calling domain. The domain function does NOT check WIP limits (it's an adapter concern).
   - What's unclear: Should we check WIP limits before a bulk move? If moving 20 orders to a column with WIP limit 10, should we warn? Block?
   - Recommendation: Show a warning toast if WIP would be exceeded (non-blocking), matching the single-move behavior which returns a `warning` but still moves.

2. **Bulk Edit: Allow Empty/Clear Values?**
   - What we know: `domainUpdateOrder` sets fields to `null` when passed `null`.
   - What's unclear: Should the bulk edit UI allow clearing a field (e.g., remove carrier from all selected)?
   - Recommendation: Start with set-only (string value). A "Limpiar campo" option could be added later.

3. **Performance Ceiling**
   - What we know: Bulk operations loop per-order, calling domain functions sequentially. Each call involves DB reads (previous state) and writes.
   - What's unclear: At what scale does this become slow? 50 orders? 200?
   - Recommendation: For MVP, sequential loop is fine (matches deleteOrders pattern). For orders >50, show a progress indicator. If performance becomes an issue, batch with `Promise.all` (but limit concurrency to avoid Supabase connection pool exhaustion).

## Sources

### Primary (HIGH confidence)
- Codebase analysis of `src/lib/domain/orders.ts` - All domain functions verified
- Codebase analysis of `src/app/actions/orders.ts` - Server action patterns verified
- Codebase analysis of `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` - Selection state management verified
- Codebase analysis of `src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx` - Contacts bulk pattern verified
- Codebase analysis of `src/lib/orders/types.ts` - All type definitions verified
- Codebase analysis of `src/components/ui/dialog.tsx` - Dialog component API verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components already exist in codebase
- Architecture: HIGH - Direct extension of existing patterns (deleteOrders, bulk contacts)
- Pitfalls: HIGH - Based on actual codebase patterns and domain layer requirements
- Code examples: HIGH - Based on verified existing patterns in the same codebase

**Research date:** 2026-02-19
**Valid until:** 2026-04-19 (stable - internal feature extension, no external dependencies)
