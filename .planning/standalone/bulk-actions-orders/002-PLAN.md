---
phase: bulk-actions-orders
plan: 002
type: execute
wave: 2
depends_on: ["001"]
files_modified:
  - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
autonomous: false

must_haves:
  truths:
    - "Selection toolbar shows 'Mover de etapa' and 'Editar campo' buttons when orders are selected"
    - "Clicking 'Mover de etapa' opens BulkMoveDialog with active pipeline stages"
    - "Clicking 'Editar campo' opens BulkEditDialog"
    - "After successful bulk move, kanban reloads and selection clears"
    - "After successful bulk edit, page refreshes and selection clears"
    - "Existing Export and Delete buttons still work"
  artifacts:
    - path: "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"
      provides: "Bulk action buttons in toolbar + dialog state + handlers"
      contains: "BulkMoveDialog"
  key_links:
    - from: "orders-view.tsx (handleBulkMove)"
      to: "bulkMoveOrdersToStage server action"
      via: "import and call with Array.from(selectedOrderIds)"
      pattern: "bulkMoveOrdersToStage.*Array\\.from"
    - from: "orders-view.tsx (handleBulkEdit)"
      to: "bulkUpdateOrderField server action"
      via: "import and call with Array.from(selectedOrderIds)"
      pattern: "bulkUpdateOrderField.*Array\\.from"
    - from: "orders-view.tsx (BulkMoveDialog)"
      to: "stages prop"
      via: "stages={stages} from activePipeline"
      pattern: "BulkMoveDialog.*stages=\\{stages\\}"
    - from: "orders-view.tsx (handleBulkMove success)"
      to: "kanban reload"
      via: "setKanbanInitialized(false)"
      pattern: "setKanbanInitialized\\(false\\)"
---

<objective>
Wire the bulk move and bulk edit dialogs into the orders-view.tsx selection toolbar, connecting them to the server actions created in Plan 001.

Purpose: Complete the integration so users can actually trigger bulk operations from the UI. This is the final wiring step that connects backend (server actions) to frontend (dialogs) through the existing selection infrastructure.

Output: Modified orders-view.tsx with 2 new buttons in the toolbar, dialog state management, and handler functions.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/bulk-actions-orders/RESEARCH.md
@.planning/standalone/bulk-actions-orders/001-SUMMARY.md
@src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
@src/app/(dashboard)/crm/pedidos/components/bulk-move-dialog.tsx
@src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx
@src/app/actions/orders.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire bulk actions into orders-view.tsx</name>
  <files>src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</files>
  <action>
Modify orders-view.tsx to add the two new bulk action buttons, dialogs, and handlers. Follow the EXACT pattern of the existing handleBulkDelete + bulkDeleteDialogOpen.

**1. Add imports (at top of file):**
- Import `ArrowRightIcon, PencilIcon` from lucide-react (add to existing lucide-react import line)
- Import `{ BulkMoveDialog }` from `./bulk-move-dialog`
- Import `{ BulkEditDialog }` from `./bulk-edit-dialog`
- Import `{ bulkMoveOrdersToStage, bulkUpdateOrderField }` from `@/app/actions/orders` (add to existing orders import)

**2. Add state (near existing bulkDeleteDialogOpen/isBulkDeleting around line 304-305):**
```typescript
const [bulkMoveDialogOpen, setBulkMoveDialogOpen] = React.useState(false)
const [bulkEditDialogOpen, setBulkEditDialogOpen] = React.useState(false)
```

**3. Add handler functions (near existing handleBulkDelete around line 329):**

```typescript
// Handle bulk move to stage
const handleBulkMove = async (stageId: string) => {
  if (selectedOrderIds.size === 0) return
  const result = await bulkMoveOrdersToStage(Array.from(selectedOrderIds), stageId)
  if ('error' in result) {
    toast.error(result.error)
  } else {
    toast.success(`${result.data?.moved} pedido(s) movido(s)`)
    clearSelection()
    router.refresh()
    if (viewMode === 'kanban' && activePipelineId) {
      setKanbanInitialized(false)
    }
  }
}

// Handle bulk field edit
const handleBulkEdit = async (field: string, value: string) => {
  if (selectedOrderIds.size === 0) return
  const result = await bulkUpdateOrderField(Array.from(selectedOrderIds), field, value)
  if ('error' in result) {
    toast.error(result.error)
  } else {
    toast.success(`${result.data?.updated} pedido(s) actualizado(s)`)
    clearSelection()
    router.refresh()
    if (viewMode === 'kanban' && activePipelineId) {
      setKanbanInitialized(false)
    }
  }
}
```

NOTE: The loading state is handled INSIDE the dialog components (isMoving/isUpdating), not in orders-view.tsx. The handlers are async and the dialogs await onConfirm. This is different from handleBulkDelete which manages isBulkDeleting at the parent level. The dialog components handle their own loading internally.

**4. Add buttons to the selection bar (between the Export button and Delete button, around line 772-780):**

Insert AFTER the Export button and BEFORE the Delete button:
```tsx
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

**5. Add dialog component instances (near the existing AlertDialog for bulk delete, around line 870):**

Insert AFTER the existing AlertDialog closing tag:
```tsx
{/* Bulk move dialog */}
<BulkMoveDialog
  open={bulkMoveDialogOpen}
  onOpenChange={setBulkMoveDialogOpen}
  stages={stages}
  selectedCount={selectedOrderIds.size}
  onConfirm={handleBulkMove}
/>

{/* Bulk edit dialog */}
<BulkEditDialog
  open={bulkEditDialogOpen}
  onOpenChange={setBulkEditDialogOpen}
  selectedCount={selectedOrderIds.size}
  onConfirm={handleBulkEdit}
/>
```

The `stages` prop uses the existing `const stages = activePipeline?.stages || []` already defined around line 424. This automatically scopes to the active pipeline.

IMPORTANT: Do NOT modify any existing buttons or handlers. Export and Delete must remain exactly as they are. Only ADD new elements.
  </action>
  <verify>
1. `npx tsc --noEmit` — no TypeScript errors
2. Grep for `BulkMoveDialog` and `BulkEditDialog` in orders-view.tsx
3. Grep for `bulkMoveOrdersToStage` and `bulkUpdateOrderField` import in orders-view.tsx
4. Grep for `ArrowRightIcon` and `PencilIcon` in orders-view.tsx
5. Verify the existing Export and Delete buttons are untouched (grep for handleExport and setBulkDeleteDialogOpen)
  </verify>
  <done>
orders-view.tsx has two new toolbar buttons (Mover de etapa, Editar campo), two new state variables, two handler functions following the handleBulkDelete pattern, and both dialog components rendered with correct props.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Complete bulk actions feature: "Mover de etapa" and "Editar campo en bulk" for selected orders. Two new buttons in the selection toolbar, two dialog components, two server actions that loop through domain functions.</what-built>
  <how-to-verify>
1. Go to /crm/pedidos in the browser
2. Select 2-3 orders using checkboxes
3. Verify the selection toolbar shows 4 buttons: Exportar, Mover de etapa, Editar campo, Eliminar
4. Click "Mover de etapa" — dialog should open with stages from the active pipeline (colored dots + names)
5. Select a stage and click "Mover" — should show loading spinner, then success toast, orders move to new stage, selection clears
6. In kanban view, verify orders appear in the new column
7. Select orders again, click "Editar campo"
8. Select "Transportadora" from the field dropdown
9. Enter a value (e.g., "Servientrega") and click "Aplicar"
10. Verify success toast, selection clears, and the field is updated on all selected orders
11. Verify Export and Delete still work as before
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
1. TypeScript compilation passes: `npx tsc --noEmit`
2. Selection toolbar shows all 4 buttons when orders selected
3. BulkMoveDialog opens with correct stages from active pipeline
4. BulkEditDialog opens with 7 field options
5. Bulk move updates orders and refreshes kanban
6. Bulk edit updates the chosen field on all selected orders
7. Both actions clear selection and show success toast
8. Existing Export and Delete remain functional
</verification>

<success_criteria>
- Two new buttons visible in the selection toolbar
- "Mover de etapa" dialog shows active pipeline stages with colors
- "Editar campo" dialog shows 7 editable fields with value input
- Both operations succeed, emit automation triggers (via domain layer), refresh UI
- Selection clears after any successful bulk action
- No regressions to existing Export and Delete functionality
</success_criteria>

<output>
After completion, create `.planning/standalone/bulk-actions-orders/002-SUMMARY.md`
</output>
