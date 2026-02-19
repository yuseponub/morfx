---
phase: bulk-actions-orders
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/actions/orders.ts
  - src/app/(dashboard)/crm/pedidos/components/bulk-move-dialog.tsx
  - src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx
autonomous: true

must_haves:
  truths:
    - "bulkMoveOrdersToStage server action loops per-order calling domainMoveOrderToStage"
    - "bulkUpdateOrderField server action loops per-order calling domainUpdateOrder"
    - "BulkMoveDialog renders a stage Select from PipelineStage[] with loading state"
    - "BulkEditDialog renders a field Select + value Input with loading state"
  artifacts:
    - path: "src/app/actions/orders.ts"
      provides: "bulkMoveOrdersToStage and bulkUpdateOrderField server actions"
      exports: ["bulkMoveOrdersToStage", "bulkUpdateOrderField"]
    - path: "src/app/(dashboard)/crm/pedidos/components/bulk-move-dialog.tsx"
      provides: "BulkMoveDialog component"
      exports: ["BulkMoveDialog"]
    - path: "src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx"
      provides: "BulkEditDialog component"
      exports: ["BulkEditDialog"]
  key_links:
    - from: "src/app/actions/orders.ts (bulkMoveOrdersToStage)"
      to: "src/lib/domain/orders.ts (moveOrderToStage)"
      via: "loop over orderIds calling domainMoveOrderToStage per ID"
      pattern: "for.*orderIds.*domainMoveOrderToStage"
    - from: "src/app/actions/orders.ts (bulkUpdateOrderField)"
      to: "src/lib/domain/orders.ts (updateOrder)"
      via: "loop over orderIds calling domainUpdateOrder per ID"
      pattern: "for.*orderIds.*domainUpdateOrder"
---

<objective>
Add bulk server actions and dialog components for moving orders to a new stage and editing a field in bulk.

Purpose: Enable the backend and UI components needed for bulk order operations. Server actions follow the existing deleteOrders loop-per-ID pattern to ensure automation triggers fire per order. Dialog components are self-contained with loading states.

Output: Two new server actions in orders.ts, two new dialog component files.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/bulk-actions-orders/RESEARCH.md
@src/app/actions/orders.ts
@src/lib/domain/orders.ts
@src/lib/domain/types.ts
@src/lib/orders/types.ts
@src/components/ui/dialog.tsx
@src/components/ui/select.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add bulk server actions to orders.ts</name>
  <files>src/app/actions/orders.ts</files>
  <action>
Add two new server actions to the END of src/app/actions/orders.ts, after the existing exportOrdersToCSV function. Follow the EXACT pattern of deleteOrders (lines 628-646):

1. **bulkMoveOrdersToStage(orderIds: string[], newStageId: string): Promise<ActionResult<{ moved: number }>>**
   - Guard: if orderIds.length === 0 return error 'No hay pedidos para mover'
   - getAuthContext() for auth + workspace
   - Create DomainContext with source: 'server-action'
   - Loop over orderIds calling `domainMoveOrderToStage(ctx, { orderId, newStageId })`
   - Count successful moves
   - revalidatePath('/crm/pedidos')
   - Return { success: true, data: { moved } }

2. **bulkUpdateOrderField(orderIds: string[], field: string, value: string | null): Promise<ActionResult<{ updated: number }>>**
   - Guard: if orderIds.length === 0 return error 'No hay pedidos para actualizar'
   - getAuthContext() for auth + workspace
   - Create DomainContext with source: 'server-action'
   - Map DB field names to domain param names:
     ```
     carrier -> carrier
     shipping_city -> shippingCity
     shipping_department -> shippingDepartment
     shipping_address -> shippingAddress
     tracking_number -> trackingNumber
     name -> name
     description -> description
     ```
   - Validate field is in the map, else return error 'Campo no soportado: ${field}'
   - Loop over orderIds calling `domainUpdateOrder(ctx, { orderId, [paramKey]: value })`
   - Count successful updates
   - revalidatePath('/crm/pedidos')
   - Return { success: true, data: { updated } }

IMPORTANT: Do NOT import anything new — domainMoveOrderToStage and domainUpdateOrder are already imported at the top of the file. Do NOT use batch SQL. Each order MUST go through the domain function individually for automation trigger emission.
  </action>
  <verify>
Run `npx tsc --noEmit 2>&1 | grep -i "orders.ts"` — no TypeScript errors in orders.ts.
Grep for `bulkMoveOrdersToStage` and `bulkUpdateOrderField` in the file to confirm they exist.
  </verify>
  <done>
Both server actions exist, follow the deleteOrders pattern exactly (getAuthContext -> domain loop -> revalidatePath), and compile without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create BulkMoveDialog component</name>
  <files>src/app/(dashboard)/crm/pedidos/components/bulk-move-dialog.tsx</files>
  <action>
Create a new file `bulk-move-dialog.tsx` with a dialog for selecting a pipeline stage.

Component: `BulkMoveDialog`

Props interface:
```typescript
interface BulkMoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stages: PipelineStage[]  // from @/lib/orders/types
  selectedCount: number
  onConfirm: (stageId: string) => Promise<void>
}
```

Implementation:
- 'use client' at top
- Internal state: `selectedStageId: string` (empty string default), `isMoving: boolean`
- Dialog from @/components/ui/dialog (Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription)
- Select from @/components/ui/select for stage picker
- Each SelectItem shows a colored dot (stage.color) + stage.name
- DialogTitle: "Mover {selectedCount} pedido(s)" with plural logic
- DialogDescription: "Selecciona la etapa a la que deseas mover los pedidos seleccionados."
- Cancel button (variant="outline", disabled while moving)
- Confirm button: disabled if no stage selected or isMoving. Shows LoaderIcon + "Moviendo..." while loading, else "Mover"
- On confirm: setIsMoving(true), try/finally pattern, await onConfirm(selectedStageId), onOpenChange(false), reset selectedStageId
- DialogContent className="sm:max-w-md"
- Import LoaderIcon from lucide-react

Follow the EXACT code structure from RESEARCH.md Example 3. The research provides the complete component — use it as-is with minor adjustments if needed for import paths.
  </action>
  <verify>
Run `npx tsc --noEmit 2>&1 | grep -i "bulk-move"` — no TypeScript errors.
File exists at the correct path and exports BulkMoveDialog.
  </verify>
  <done>
BulkMoveDialog component renders a stage picker dialog with loading state, accepts PipelineStage[] prop, and calls onConfirm with the selected stageId.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create BulkEditDialog component</name>
  <files>src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx</files>
  <action>
Create a new file `bulk-edit-dialog.tsx` with a dialog for selecting a field and entering a new value.

Component: `BulkEditDialog`

Props interface:
```typescript
interface BulkEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  onConfirm: (field: string, value: string) => Promise<void>
}
```

Implementation:
- 'use client' at top
- Define BULK_EDITABLE_FIELDS constant array:
  ```
  { value: 'carrier', label: 'Transportadora' }
  { value: 'shipping_city', label: 'Ciudad de envio' }
  { value: 'shipping_department', label: 'Departamento de envio' }
  { value: 'shipping_address', label: 'Direccion de envio' }
  { value: 'tracking_number', label: 'Numero de guia' }
  { value: 'name', label: 'Nombre del pedido' }
  { value: 'description', label: 'Notas / descripcion' }
  ```
- Internal state: `selectedField: string`, `fieldValue: string`, `isUpdating: boolean`
- Dialog with DialogContent className="sm:max-w-md"
- DialogTitle: "Editar {selectedCount} pedido(s)" with plural logic
- DialogDescription: "Selecciona el campo y el valor que deseas aplicar a todos los pedidos seleccionados."
- Field selector: Select component. When field changes, reset fieldValue to ''
- Value input: Only shown when selectedField is set. Input with placeholder based on selected field label.
- Cancel button (variant="outline", disabled while updating)
- Confirm button: disabled if no field or empty value or isUpdating. Shows LoaderIcon + "Actualizando..." while loading, else "Aplicar"
- On confirm: setIsUpdating(true), try/finally pattern, await onConfirm(selectedField, fieldValue.trim()), onOpenChange(false), reset both state values
- Import Label from @/components/ui/label, Input from @/components/ui/input

Follow the EXACT code structure from RESEARCH.md Example 4.
  </action>
  <verify>
Run `npx tsc --noEmit 2>&1 | grep -i "bulk-edit"` — no TypeScript errors.
File exists at the correct path and exports BulkEditDialog.
  </verify>
  <done>
BulkEditDialog component renders a field selector + value input dialog with loading state, and calls onConfirm with (field, value).
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — full TypeScript compilation passes (or at least no new errors in the 3 modified/created files)
2. Both server actions exist in orders.ts and follow the domain loop pattern
3. Both dialog components export their named component
4. No direct Supabase imports in the new server actions (only domain functions)
</verification>

<success_criteria>
- bulkMoveOrdersToStage and bulkUpdateOrderField server actions added to orders.ts
- BulkMoveDialog component created with stage picker + loading state
- BulkEditDialog component created with field picker + value input + loading state
- All 3 files compile without TypeScript errors
- Domain functions called per-order (not batch SQL)
</success_criteria>

<output>
After completion, create `.planning/standalone/bulk-actions-orders/001-SUMMARY.md`
</output>
