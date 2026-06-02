---
phase: quick-034
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/domain/orders.ts
  - src/app/actions/orders.ts
  - src/app/(dashboard)/crm/pedidos/components/columns.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
  - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
  - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
  - src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx
autonomous: true

must_haves:
  truths:
    - "User can trigger recompra from CRM table dropdown menu"
    - "User can trigger recompra from CRM kanban card"
    - "User can trigger recompra from WhatsApp contact-panel order cards"
    - "User can trigger recompra from WhatsApp view-order-sheet"
    - "Recompra creates new order with current date, same pipeline first stage, no tracking/carrier/guide/closing_date"
    - "Recompra copies contact, products, value, shipping address, description, custom_fields"
    - "User sees toast feedback after recompra success or failure"
  artifacts:
    - path: "src/lib/domain/orders.ts"
      provides: "recompraOrder() domain function"
      contains: "export async function recompraOrder"
    - path: "src/app/actions/orders.ts"
      provides: "recompraOrder server action"
      contains: "export async function recompraOrder"
  key_links:
    - from: "src/app/actions/orders.ts"
      to: "src/lib/domain/orders.ts"
      via: "recompraOrder server action calls domain recompraOrder"
      pattern: "domainRecompraOrder"
    - from: "columns.tsx, kanban-card.tsx, contact-panel.tsx, view-order-sheet.tsx"
      to: "src/app/actions/orders.ts"
      via: "UI calls recompraOrder server action"
      pattern: "recompraOrder"
---

<objective>
Add "Recompra" button across 4 UI locations (CRM table, CRM kanban, WhatsApp contact-panel, WhatsApp view-order-sheet) that duplicates an order with cleaned shipping/tracking fields and current date, placed in the first stage of the same pipeline.

Purpose: Enable quick repeat orders for returning customers without manually recreating orders.
Output: Domain function, server action, and UI buttons in 4 locations with confirmation + toast feedback.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/domain/orders.ts (duplicateOrder at line 665, DuplicateOrderParams at line 81)
@src/app/actions/orders.ts (deleteOrder pattern at line 615 for auth+domain+revalidate)
@src/app/(dashboard)/crm/pedidos/components/columns.tsx (DropdownMenu with Edit/Delete at line 232)
@src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx (KanbanCardProps at line 42)
@src/app/(dashboard)/crm/pedidos/components/orders-view.tsx (createColumns callbacks at line 549, handleDeleteConfirm at line 584)
@src/app/(dashboard)/whatsapp/components/contact-panel.tsx (RecentOrdersList at line 326, order card with Eye button at line 555)
@src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx (ViewOrderSheet at line 69, Edit button at line 222)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Domain function + server action for recompraOrder</name>
  <files>
    src/lib/domain/orders.ts
    src/app/actions/orders.ts
  </files>
  <action>
**Domain layer (`src/lib/domain/orders.ts`):**

1. Add `RecompraOrderParams` interface near line 91 (after DuplicateOrderParams):
```ts
export interface RecompraOrderParams {
  sourceOrderId: string
}
```

2. Add `RecompraOrderResult` interface near line 126 (after DuplicateOrderResult):
```ts
export interface RecompraOrderResult {
  orderId: string
  sourceOrderId: string
}
```

3. Add `recompraOrder()` function after `duplicateOrder()` (after line 882). This function:
   - Reads the source order to get its `pipeline_id`
   - Calls `duplicateOrder()` with `sourceOrderId`, `targetPipelineId: sourceOrder.pipeline_id` (same pipeline, no targetStageId so it picks first stage automatically), `copyContact: true`, `copyProducts: true`, `copyValue: true`
   - After duplicate succeeds, uses `createAdminClient()` to UPDATE the new order clearing: `tracking_number: null`, `carrier: null`, `carrier_guide_number: null`, `closing_date: null`
   - The `created_at` is auto-set by DB to current timestamp (no action needed)
   - Returns `{ success: true, data: { orderId, sourceOrderId } }`

Implementation pattern:
```ts
export async function recompraOrder(
  ctx: DomainContext,
  params: RecompraOrderParams
): Promise<DomainResult<RecompraOrderResult>> {
  const supabase = createAdminClient()

  // Read source order to get pipeline_id
  const { data: sourceOrder, error: sourceError } = await supabase
    .from('orders')
    .select('pipeline_id')
    .eq('id', params.sourceOrderId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (sourceError || !sourceOrder) {
    return { success: false, error: 'Pedido origen no encontrado' }
  }

  // Duplicate to same pipeline, first stage
  const dupResult = await duplicateOrder(ctx, {
    sourceOrderId: params.sourceOrderId,
    targetPipelineId: sourceOrder.pipeline_id,
    copyContact: true,
    copyProducts: true,
    copyValue: true,
  })

  if (!dupResult.success) {
    return { success: false, error: dupResult.error || 'Error al crear recompra' }
  }

  // Clear tracking/carrier/closing_date on the new order
  const { error: clearError } = await supabase
    .from('orders')
    .update({
      tracking_number: null,
      carrier: null,
      carrier_guide_number: null,
      closing_date: null,
    })
    .eq('id', dupResult.data!.orderId)
    .eq('workspace_id', ctx.workspaceId)

  if (clearError) {
    return { success: false, error: `Error al limpiar campos de envio: ${clearError.message}` }
  }

  return {
    success: true,
    data: {
      orderId: dupResult.data!.orderId,
      sourceOrderId: params.sourceOrderId,
    },
  }
}
```

**Server action (`src/app/actions/orders.ts`):**

1. Add import for `recompraOrder as domainRecompraOrder` from domain (line 24 area, alongside other imports)

2. Add server action after `deleteOrders` function:
```ts
export async function recompraOrder(orderId: string): Promise<ActionResult<{ orderId: string }>> {
  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  const result = await domainRecompraOrder(ctx, { sourceOrderId: orderId })

  if (!result.success) {
    return { error: result.error || 'Error al crear recompra' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: { orderId: result.data!.orderId } }
}
```
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors. Grep for `recompraOrder` in both files to confirm exports exist.
  </verify>
  <done>
`recompraOrder` domain function exists and clears tracking/carrier/carrier_guide_number/closing_date after duplicating. Server action exported and follows auth+domain+revalidate pattern.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Recompra button to all 4 UI locations</name>
  <files>
    src/app/(dashboard)/crm/pedidos/components/columns.tsx
    src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
    src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
    src/app/(dashboard)/whatsapp/components/contact-panel.tsx
    src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx
  </files>
  <action>
**1. CRM Table — `columns.tsx`:**

- Add `onRecompra: (order: OrderWithDetails) => void` to `ColumnsProps` interface (line 47)
- Pass `onRecompra` in `createColumns` destructuring (line 52)
- Add a new `DropdownMenuItem` BEFORE the delete item (line 236 area):
```tsx
<DropdownMenuItem onClick={() => onRecompra(order)}>
  <RefreshCwIcon className="mr-2 h-4 w-4" />
  Recompra
</DropdownMenuItem>
<DropdownMenuSeparator />
```
- Import `RefreshCwIcon` from lucide-react

**2. Orders View — `orders-view.tsx` (state management):**

- Import `recompraOrder` from `@/app/actions/orders.ts`
- Add state: `const [recompraDialogOpen, setRecompraDialogOpen] = useState(false)` and `const [orderToRecompra, setOrderToRecompra] = useState<OrderWithDetails | null>(null)`
- Add `onRecompra` callback in `createColumns` call (line 551 area):
```ts
onRecompra: (order) => {
  setOrderToRecompra(order)
  setRecompraDialogOpen(true)
},
```
- Add `handleRecompraConfirm` function (similar to handleDeleteConfirm):
```ts
const handleRecompraConfirm = async () => {
  if (!orderToRecompra) return
  const result = await recompraOrder(orderToRecompra.id)
  if ('error' in result) {
    toast.error(result.error)
  } else {
    toast.success('Recompra creada exitosamente')
    router.refresh()
    if (viewMode === 'kanban' && activePipelineId) {
      setKanbanInitialized(false)
    }
  }
  setRecompraDialogOpen(false)
  setOrderToRecompra(null)
}
```
- Add `AlertDialog` for recompra confirmation in JSX (near the existing delete dialog):
```tsx
<AlertDialog open={recompraDialogOpen} onOpenChange={setRecompraDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Crear recompra</AlertDialogTitle>
      <AlertDialogDescription>
        Se creara un nuevo pedido con los mismos productos y contacto, sin tracking ni guia. El pedido se ubicara en la primera etapa del pipeline.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleRecompraConfirm}>
        Crear recompra
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```
- Import AlertDialog components if not already imported

**3. CRM Kanban — `kanban-card.tsx`:**

- Add `onRecompra?: (order: OrderWithDetails) => void` to `KanbanCardProps` interface
- Destructure `onRecompra` in component
- Add a small button in the footer area (line 177 area, near the WhatsApp link), visible on hover:
```tsx
{onRecompra && (
  <button
    onClick={(e) => {
      e.stopPropagation()
      onRecompra(order)
    }}
    className="p-1 rounded hover:bg-blue-100 hover:text-blue-600 transition-colors"
    title="Recompra"
  >
    <RefreshCwIcon className="h-3.5 w-3.5" />
  </button>
)}
```
- Import `RefreshCwIcon` from lucide-react
- In `orders-view.tsx`, find where KanbanCard is rendered and pass `onRecompra` prop that triggers the same confirmation dialog:
```tsx
onRecompra={(order) => {
  setOrderToRecompra(order)
  setRecompraDialogOpen(true)
}}
```

**4. WhatsApp Contact Panel — `contact-panel.tsx`:**

- Import `recompraOrder` from `@/app/actions/orders.ts`
- Import `RefreshCwIcon` from lucide-react
- In `RecentOrdersList`, add state for recompra confirmation: `const [recompraOrderId, setRecompraOrderId] = useState<string | null>(null)`
- Add a `handleRecompra` function:
```ts
const handleRecompra = async () => {
  if (!recompraOrderId) return
  const result = await recompraOrder(recompraOrderId)
  if ('error' in result) {
    toast.error(result.error)
  } else {
    toast.success('Recompra creada')
    // Trigger re-fetch
    const freshOrders = await getRecentOrders(contactId)
    setOrders(freshOrders)
    orderIdsRef.current = freshOrders.map(o => o.id).join(',')
    onStageChanged?.()
  }
  setRecompraOrderId(null)
}
```
- Add a recompra button next to the Eye button (line 555 area):
```tsx
<button
  onClick={() => setRecompraOrderId(order.id)}
  className="p-1.5 rounded-md hover:bg-accent shrink-0"
  title="Recompra"
>
  <RefreshCwIcon className="h-4 w-4 text-muted-foreground" />
</button>
```
- Add AlertDialog at the end of the component (before closing `</div>` at line 644):
```tsx
<AlertDialog open={!!recompraOrderId} onOpenChange={(open) => !open && setRecompraOrderId(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Crear recompra</AlertDialogTitle>
      <AlertDialogDescription>
        Se creara un nuevo pedido con los mismos productos y contacto, sin tracking ni guia.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleRecompra}>Crear recompra</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```
- Import AlertDialog components from `@/components/ui/alert-dialog`

**5. WhatsApp View Order Sheet — `view-order-sheet.tsx`:**

- Import `recompraOrder` from `@/app/actions/orders.ts`
- Import `RefreshCwIcon` from lucide-react
- Add state: `const [recompraDialogOpen, setRecompraDialogOpen] = React.useState(false)`
- Add handler:
```ts
const handleRecompra = async () => {
  if (!orderId) return
  const result = await recompraOrder(orderId)
  if ('error' in result) {
    toast.error(result.error)
  } else {
    toast.success('Recompra creada exitosamente')
    onSuccess?.()
    handleClose()
  }
  setRecompraDialogOpen(false)
}
```
- Add a "Recompra" button next to the existing "Editar" button (line 222 area):
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setRecompraDialogOpen(true)}
>
  <RefreshCwIcon className="h-4 w-4 mr-1" />
  Recompra
</Button>
```
- Add AlertDialog for confirmation (same pattern as contact-panel)
- Import AlertDialog components
  </action>
  <verify>
1. `npx tsc --noEmit` passes with no errors
2. `npm run build` completes successfully
3. Grep for `recompraOrder` across all 5 UI files to confirm imports
4. Grep for `RefreshCwIcon` to confirm icon is used in all 4 UI locations
  </verify>
  <done>
Recompra button visible and functional in: CRM table dropdown, CRM kanban card (hover), WhatsApp contact-panel order cards, WhatsApp view-order-sheet. Each shows confirmation dialog before executing. Toast feedback on success/error.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — no type errors
2. `npm run build` — builds successfully
3. Manual test: Open CRM table view, click "..." on any order, see "Recompra" option
4. Manual test: Open CRM kanban view, hover a card, see recompra icon
5. Manual test: Open WhatsApp, select a contact with orders, see recompra icon on order cards
6. Manual test: Open WhatsApp order detail sheet, see "Recompra" button
7. Click recompra on any location -> confirmation dialog appears -> confirm -> new order created in first stage without tracking/carrier/guide/closing_date -> toast shows success
</verification>

<success_criteria>
- recompraOrder domain function creates order via duplicateOrder then clears tracking_number, carrier, carrier_guide_number, closing_date
- Server action validates auth, calls domain, revalidates path
- All 4 UI locations show Recompra button with RefreshCw icon
- Confirmation dialog prevents accidental recompra
- Toast feedback on success and error
- New order appears in first stage of same pipeline with current date
- Build passes with no errors
</success_criteria>

<output>
After completion, create `.planning/quick/034-boton-recompra-pedidos-crm-whatsapp/034-SUMMARY.md`
</output>
