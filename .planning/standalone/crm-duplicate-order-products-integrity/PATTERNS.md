# Standalone crm-duplicate-order-products-integrity — Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 6 in scope (4 MODIFY + 2 CREATE)
**Analogs found:** 6/6 (100% match — all patterns proven in codebase)

## Summary

- **6 total files** touched by the planner: 4 MODIFY (`orders.ts` domain, `orders.ts` action, `types.ts`, `kanban-card.tsx`) + 2 CREATE (unit test + integration test).
- **100% analog coverage** — every change has a verbatim pattern already in the codebase. Zero novel constructs required.
- **Key reusable patterns:** (a) destructure-and-check `{error}` from Supabase insert (orders.ts:484-490), (b) JSONB read-merge-write (custom-fields.ts:78-87), (c) domain helper + server action wrapper + `revalidatePath` (orders.ts deleteOrder, actions/orders.ts deleteOrder), (d) vitest mock chain for `createAdminClient` (conversations.test.ts:14-34), (e) env-gated integration test with `describe.skipIf(!envReady)` (orders-cas.test.ts:24-30), (f) Popover + AlertDialog with `onClick stopPropagation` for draggable cards (variable-picker.tsx + quick-reply-list.tsx + kanban-card.tsx:117).

---

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/lib/domain/orders.ts` (MODIFY duplicateOrder + ADD clearOrderDuplicateError) | domain | CRUD + JSONB merge | `src/lib/domain/orders.ts` updateOrder (lines 484-490) + `src/lib/domain/custom-fields.ts:55-120` | exact (same file + same JSONB pattern) |
| `src/lib/orders/types.ts` (ADD `DuplicateError` interface + helper) | model/types | type-only | Existing `OrderWithDetails` + `OrderProduct` in same file | exact |
| `src/app/actions/orders.ts` (ADD `clearOrderDuplicateError` server action) | server-action | request-response | `deleteOrder` server action lines 638-651 in same file | exact (same file + same pattern) |
| `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` (ADD badge + popover + alert-dialog) | component | event-driven UI | `variable-picker.tsx` (Popover) + `quick-reply-list.tsx` (AlertDialog) + same-file Checkbox at line 117 (stopPropagation) | role-match (3 analogs composed) |
| `src/lib/domain/__tests__/orders-duplicate-products.test.ts` (CREATE) | test | mocked unit | `src/lib/domain/__tests__/conversations.test.ts` lines 12-117 | exact (same dir, same framework) |
| `src/__tests__/integration/orders-duplicate-products.test.ts` (CREATE) | test | integration (real DB) | `src/__tests__/integration/orders-cas.test.ts` lines 1-145 | exact (same dir, same env gating) |

---

## Pattern Assignments

### `src/lib/domain/orders.ts` (MODIFY)

**Role:** Domain layer — fix `duplicateOrder` to capture INSERT error + persist to JSONB + return `{success:false}`; ADD new helper `clearOrderDuplicateError` for the UI clear action.

**Closest analog:** Same file. Two existing patterns to compose:
- **For the error-capture line:** `updateOrder` at lines 484-490 (canonical destructure-and-check)
- **For the JSONB merge:** `custom-fields.ts:67-87` (read-merge-write JSONB pattern — also used inline by `updateOrder` for `custom_fields`)

**Why this analog:** Same I/O shape (Supabase v2 insert/update), same return contract (`DomainResult<T>`), same file convention (createAdminClient + `eq('workspace_id', ctx.workspaceId)` everywhere). The fix is literally "make line 959 look like line 484."

**Pattern A — INSERT error capture (lines 484-490 from updateOrder, copy verbatim shape):**

```typescript
// Source: src/lib/domain/orders.ts:484-490
const { error: productsError } = await supabase
  .from('order_products')
  .insert(productsToInsert)

if (productsError) {
  return { success: false, error: `Error al insertar productos: ${productsError.message}` }
}
```

**Pattern B — JSONB read-merge-write (from custom-fields.ts:67-87):**

```typescript
// Source: src/lib/domain/custom-fields.ts:67-87 (canonical)
const { data: contact, error: readError } = await supabase
  .from('contacts')
  .select('custom_fields, name')
  .eq('id', params.contactId)
  .eq('workspace_id', ctx.workspaceId)
  .single()

if (readError || !contact) {
  return { success: false, error: 'Contacto no encontrado' }
}

const existing = (contact.custom_fields as Record<string, unknown>) || {}
const merged = { ...existing, ...params.fields }

const { error: updateError } = await supabase
  .from('contacts')
  .update({ custom_fields: merged })
  .eq('id', params.contactId)
  .eq('workspace_id', ctx.workspaceId)

if (updateError) {
  console.error('[domain/custom-fields] updateCustomFieldValues error:', updateError)
  return { success: false, error: 'Error al actualizar campos personalizados' }
}
```

**Pattern C — Domain helper shape (from deleteOrder lines 785-823 in same file):**

```typescript
// Source: src/lib/domain/orders.ts:785-823 (skeleton for clearOrderDuplicateError)
export async function deleteOrder(
  ctx: DomainContext,
  params: DeleteOrderParams
): Promise<DomainResult<DeleteOrderResult>> {
  const supabase = createAdminClient()

  try {
    // Verify order exists and belongs to workspace
    const { data: existing, error: fetchError } = await supabase
      .from('orders')
      .select('id')
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Pedido no encontrado' }
    }
    // ... mutation ...
    return { success: true, data: { orderId: params.orderId } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
```

**Current bug line (lines 949-961 — what to replace):**

```typescript
// Source: src/lib/domain/orders.ts:949-961 — THE BUG
if (sourceProducts && sourceProducts.length > 0) {
  const productsToInsert = sourceProducts.map((p) => ({
    order_id: newOrder.id,
    product_id: p.product_id || null,
    sku: p.sku,
    title: p.title,
    unit_price: p.unit_price,
    quantity: p.quantity,
  }))

  await supabase.from('order_products').insert(productsToInsert)
  //                                                              ^^^ no destructure, no check
}
```

**Adaptations needed:**
- Replace line 959 with `const { error: productsError } = await supabase.from('order_products').insert(productsToInsert)`.
- On `productsError`: read `newOrder` `custom_fields` (which was just-INSERTed with `sourceOrder.custom_fields || {}` at line 906 — so it already exists, but re-read for correctness), merge `duplicate_error: { errorCode, errorMessage, failedAt, sourceOrderId, attemptedProducts }`, write back.
- If the JSONB marker write itself fails, `console.error` but don't shadow `productsError` — return the original `productsError` to the caller.
- Return `{ success: false, error: \`Error al copiar productos: ${productsError.code ?? '?'} - ${productsError.message ?? 'unknown'}\` }`.
- ADD new exported function `clearOrderDuplicateError(ctx, params: { orderId: string })` that reads `custom_fields`, destructures the `duplicate_error` key out, writes back the remainder. Use `Pattern C` skeleton.
- Add `DuplicateError` interface (or import from `@/lib/orders/types`) for the marker shape — keeps types co-located with what they describe.

**Don't copy:**
- `recompraOrder` rollback at lines 1170-1181 — D-pre-04 + D-01 forbid rollback. The rollback pattern (`await supabase.from('orders').delete().eq('id', newOrderId)`) is the WRONG pattern for THIS fix. The whole point of D-01 is "mantener huérfana visible."
- `emitFieldChanged` calls when writing `custom_fields.duplicate_error` — the marker is internal state, not a user-facing field change. Adding emit would create automation cascade noise. See updateOrder lines 559-576 — that path only triggers when the caller explicitly passes `custom_fields` as a mutation, which is NOT what the marker write is doing.
- Retry logic — P-1 in RESEARCH locks fail-fast. No loops, no backoff.

---

### `src/lib/orders/types.ts` (MODIFY — add type + helper)

**Role:** Add typed accessor for `order.custom_fields.duplicate_error` so the badge UI and the domain layer share one definition.

**Closest analog:** Same file — see `OrderProduct` (lines 220-230) and `OrderWithDetails` (lines 185-211). Same naming convention (PascalCase interface), same export style, same comment block.

**Pattern to mimic (existing OrderProduct shape — same flat-property style):**

```typescript
// Source: src/lib/orders/types.ts:220-230
export interface OrderProduct {
  id: string
  order_id: string
  product_id: string | null
  sku: string
  title: string
  unit_price: number
  quantity: number
  subtotal: number
  created_at: string
}
```

**Adaptations needed — ADD after `OrderProduct` block (around line 240):**

```typescript
// ============================================================================
// DUPLICATE ERROR MARKER (standalone crm-duplicate-order-products-integrity)
// ============================================================================

/**
 * Marker persisted to `orders.custom_fields.duplicate_error` when
 * `duplicateOrder` cannot copy products from source. Surface in Kanban badge.
 * See D-01 + D-pre-06: keep destination order empty + visible, don't rollback.
 */
export interface DuplicateError {
  errorCode: string         // pg SQLSTATE: '23503', '23514', '23502', etc.
  errorMessage: string      // raw Postgres message
  failedAt: string          // ISO timestamp
  sourceOrderId: string     // duplicates orders.source_order_id for accessibility
  attemptedProducts: Array<{
    sku: string
    title: string
    unit_price: number
    quantity: number
  }>
}

/**
 * Type-safe accessor — read the marker from any order with custom_fields.
 * Returns null when absent / malformed. Use in KanbanCard render.
 */
export function getDuplicateError(
  order: { custom_fields: Record<string, unknown> }
): DuplicateError | null {
  const raw = order.custom_fields?.duplicate_error
  if (!raw || typeof raw !== 'object') return null
  return raw as DuplicateError
}
```

**Don't copy:**
- `OrderFormData` shape (lines 149-165) — that's for create/edit forms. The duplicate_error marker is system-managed, never user-edited.
- Versioning helpers — RESEARCH §Specifics mentions `version: 1` as "future-proofing" but D-pre-06 says we don't migrate; keep the type flat for now. Add `version` only if a real second consumer appears.

---

### `src/app/actions/orders.ts` (MODIFY — add server action)

**Role:** Server action wrapping the domain `clearOrderDuplicateError` helper. Validates auth, builds `DomainContext`, calls domain, revalidates the Kanban path.

**Closest analog:** Same file. `deleteOrder` server action (lines 638-651) is the closest shape — same single-orderId param, same `revalidatePath('/crm/pedidos')`, same `ActionResult<void>`-ish return.

**Why this analog:** Same module, same `getAuthContext` helper, same DomainContext build, same revalidation target. Just swap the domain function name.

**Pattern to mimic verbatim (lines 638-651):**

```typescript
// Source: src/app/actions/orders.ts:638-651 (canonical for single-orderId actions)
export async function deleteOrder(id: string): Promise<ActionResult> {
  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  const result = await domainDeleteOrder(ctx, { orderId: id })

  if (!result.success) {
    return { error: result.error || 'Error al eliminar el pedido' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: undefined }
}
```

**Auth helper (lines 76-88 — already in file, just reuse):**

```typescript
// Source: src/app/actions/orders.ts:76-88
async function getAuthContext(): Promise<{ workspaceId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  return { workspaceId, userId: user.id }
}
```

**ActionResult type (line 68-70 — already in file):**

```typescript
type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }
```

**Adaptations needed:**
- Add import: `clearOrderDuplicateError as domainClearOrderDuplicateError` from `@/lib/domain/orders`.
- Add server action:
  ```typescript
  export async function clearOrderDuplicateError(
    orderId: string
  ): Promise<ActionResult<{ orderId: string }>> {
    const auth = await getAuthContext()
    if ('error' in auth) return { error: auth.error }

    const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
    const result = await domainClearOrderDuplicateError(ctx, { orderId })

    if (!result.success) {
      return { error: result.error || 'Error al limpiar la marca de error' }
    }

    revalidatePath('/crm/pedidos')
    return { success: true, data: { orderId } }
  }
  ```
- UUID validation: the codebase uses `z.string().uuid()` (see `orderProductSchema` line 33). For this single-arg action, an inline check or zod call is appropriate. Match the existing pattern from `updateOrder` (line 505) which doesn't validate the id explicitly — it's fine to do the same here since domain layer already filters by workspace and returns "not found" if it's a bad UUID.

**Don't copy:**
- `getOrder()` re-fetch pattern at line 562 — `clearOrderDuplicateError` doesn't need to return the updated order; the `revalidatePath` triggers Next to refetch the Kanban on next render. Sonner toast + `router.refresh()` on the client closes the loop.
- The `actorId / actorLabel` audit fields from `moveOrderToStage` (lines 609-614) — those are for the `order_stage_history` table specifically. The clear action doesn't touch stage history.

---

### `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` (MODIFY — add badge + popover + alert-dialog)

**Role:** Render a small red `⚠ Sin productos` badge when `order.custom_fields.duplicate_error` is truthy. Click opens a Popover with marker details + a "Ver pedido origen" link + an AlertDialog-guarded "Marcar resuelto" button that calls the server action.

**Closest analogs (composed from 3 sources):**
1. **Popover shape:** `src/app/(dashboard)/automatizaciones/components/variable-picker.tsx` (lines 40-80) — uses `@/components/ui/popover` with controlled `open` state.
2. **AlertDialog shape:** `src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx` (lines 19-29 imports, 97-117 usage) — `AlertDialogTrigger asChild`, server-action handler in `onClick` of `AlertDialogAction`.
3. **`stopPropagation` for draggable parent:** Same file `kanban-card.tsx` already uses this pattern at lines 117 (Checkbox div), 211 (Recompra button), 223 (WhatsApp Link). Copy verbatim — no new pattern needed.

**Popover analog verbatim (variable-picker.tsx:40-80):**

```typescript
// Source: src/app/(dashboard)/automatizaciones/components/variable-picker.tsx:40-80
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      title="Insertar variable"
    >
      <Braces className="size-4" />
    </Button>
  </PopoverTrigger>
  <PopoverContent align="end" className="w-72 p-0">
    <div className="p-3 border-b">
      <p className="text-sm font-medium">Variables disponibles</p>
    </div>
    <div className="max-h-56 overflow-y-auto p-1">
      {/* ... items ... */}
    </div>
  </PopoverContent>
</Popover>
```

**AlertDialog analog verbatim (quick-reply-list.tsx:97-117):**

```typescript
// Source: src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx:97-117
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
      <Trash2 className="h-4 w-4" />
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Eliminar respuesta</AlertDialogTitle>
      <AlertDialogDescription>
        Esta accion no se puede deshacer.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={() => handleDelete(reply)}>
        Eliminar
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Server-action call pattern (quick-reply-list.tsx:53-69):**

```typescript
// Source: src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx:53-69
async function handleDelete(reply: QuickReply) {
  try {
    const result = await deleteQuickReply(reply.id)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    toast.success('Respuesta eliminada')
    router.refresh()
  } catch (error) {
    toast.error('Error al eliminar')
  }
}
```

**stopPropagation analog (same file, line 117):**

```typescript
// Source: src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx:113-124
<div
  className={cn(
    'absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity',
    isSelected && 'opacity-100'
  )}
  onClick={(e) => e.stopPropagation()}  // ← critical for draggable parent
>
  <Checkbox checked={isSelected} ... />
</div>
```

**Adaptations needed:**
- New imports at top of file:
  ```typescript
  import { AlertTriangle } from 'lucide-react'  // join existing lucide line 5
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
    AlertDialogTitle, AlertDialogTrigger,
  } from '@/components/ui/alert-dialog'
  import { toast } from 'sonner'
  import { useRouter } from 'next/navigation'
  import { getDuplicateError } from '@/lib/orders/types'
  import { clearOrderDuplicateError } from '@/app/actions/orders'
  ```
- Compute `const duplicateError = getDuplicateError(order)` inside the component body (alongside `productTypes` at line 81-84).
- Conditionally render badge inside the card — recommended location: after the header block (right after line 158, just before "Products summary"). Style follows current convention: small `text-[10px] font-medium` + `bg-destructive/10 text-destructive border border-destructive/30 rounded` pill with `AlertTriangle` icon at `h-3 w-3`.
- Wrap entire badge subtree in a `<div onClick={(e) => e.stopPropagation()}>` like line 117 — non-negotiable per P-8/P-9 in RESEARCH.
- Inside the badge container: `Popover` whose `PopoverContent align="start" className="w-80 p-0"` renders:
  - Header `<div className="p-3 border-b">` with `<p className="text-sm font-medium">⚠ Productos no se copiaron al duplicar</p>` + `<p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(duplicateError.failedAt)}</p>`.
  - Error block with `<code className="text-xs">{duplicateError.errorCode}</code>` + `<p className="text-xs text-muted-foreground line-clamp-3">{duplicateError.errorMessage}</p>` (truncate at 80 chars per D-06).
  - Products list — `duplicateError.attemptedProducts.map(...)` rendering each as `{quantity}× {title} — {formatCurrency(unit_price)}`.
  - `<Link href={\`/crm/pedidos/${duplicateError.sourceOrderId}\`} onClick={(e) => e.stopPropagation()}>Ver pedido origen →</Link>` — match existing WhatsApp Link pattern at line 221-228.
  - Footer with AlertDialog-wrapped "Marcar resuelto" button (use destructive variant style from quick-reply-list:99).
- `handleResolve` async handler: call `clearOrderDuplicateError(order.id)`, on `'error' in result` → `toast.error`, else → `toast.success('Marca de error eliminada')` + `router.refresh()`.
- Badge wording (per RESEARCH §Badge wording recommendation): `⚠ Sin productos` (4 syllables, fits next to total value).

**Don't copy:**
- The hover-only opacity pattern from Checkbox (line 113-116: `opacity-0 group-hover:opacity-100`) — the badge MUST be permanently visible per D-05 ("badge visible until operator clicks Marcar resuelto").
- The `useState(open)` pattern from variable-picker for the AlertDialog — AlertDialog manages its own state via `AlertDialogTrigger`. The Popover may also use uncontrolled state (it auto-closes when user clicks outside). Only add controlled `useState` if you need to programmatically close the Popover after a successful resolve.
- The `Dialog` (not AlertDialog) component from quick-reply-list lines 13-18, 143-155 — that's for editing forms with multiple fields. AlertDialog is the right choice for a single yes/no confirm.

---

### `src/lib/domain/__tests__/orders-duplicate-products.test.ts` (CREATE)

**Role:** Unit tests for `duplicateOrder` (4 failure modes + happy path no-marker) and `clearOrderDuplicateError` (removes key + idempotent on missing). Mock `createAdminClient` to inject `error` responses without hitting DB.

**Closest analog:** `src/lib/domain/__tests__/conversations.test.ts` — only existing file in the `__tests__/` directory for the domain layer. Same dir, same convention.

**Why this analog:** Same dir (`src/lib/domain/__tests__/`), same `vi.mock('@/lib/supabase/admin', ...)` pattern, same chain-method mock style (`fromMock` → `selectMock` → `eqMock` → `singleMock`).

**Pattern to mimic verbatim (conversations.test.ts:12-34):**

```typescript
// Source: src/lib/domain/__tests__/conversations.test.ts:12-34
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase admin client mock --------------------------------------------
const singleMock = vi.fn()
const eqMock = vi.fn(() => ({ eq: eqMock, single: singleMock }))
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))
const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

import { getConversationChannel } from '@/lib/domain/conversations'

beforeEach(() => {
  vi.clearAllMocks()
  // Restore default chain wiring after clearAllMocks reset implementations.
  eqMock.mockImplementation(() => ({ eq: eqMock, single: singleMock }))
  selectMock.mockImplementation(() => ({ eq: eqMock }))
  fromMock.mockImplementation(() => ({ select: selectMock }))
  createAdminClientMock.mockImplementation(() => ({ from: fromMock }))
})
```

**Adaptations needed:**
- ADD `insertMock` and `updateMock` to the chain (conversations.test.ts only mocks `select`):
  ```typescript
  const insertMock = vi.fn()  // returns { error: ... }
  const updateMock = vi.fn(() => ({ eq: eqMock }))  // chains .eq().eq()
  ```
- Adapt `fromMock` to handle 3 tables (`orders` read, `order_products` insert, `orders` update for marker):
  ```typescript
  fromMock.mockImplementation((table: string) => {
    if (table === 'order_products') return { insert: insertMock }
    if (table === 'orders') return { select: selectMock, insert: insertMock, update: updateMock }
    if (table === 'contacts') return { select: selectMock }
    if (table === 'pipelines') return { select: selectMock }
    if (table === 'pipeline_stages') return { select: selectMock }
    return { select: selectMock }
  })
  ```
- The 4 failure modes (per D-pre-02) each set `insertMock.mockResolvedValueOnce(...)` for the `order_products` INSERT:
  | Mode | Mock response |
  |------|---------------|
  | FK product_id | `{ data: null, error: { code: '23503', message: 'insert or update on table "order_products" violates foreign key constraint "order_products_product_id_fkey"' } }` |
  | FK order_id race | `{ data: null, error: { code: '23503', message: '... "order_products_order_id_fkey"' } }` |
  | CHECK quantity | `{ data: null, error: { code: '23514', message: 'new row for relation "order_products" violates check constraint "order_products_quantity_check"' } }` |
  | NOT NULL sku | `{ data: null, error: { code: '23502', message: 'null value in column "sku" of relation "order_products" violates not-null constraint' } }` |
- Each test asserts: (a) `result.success === false`, (b) `result.error` includes the SQLSTATE, (c) `updateMock` was called with `custom_fields` containing `duplicate_error` with all 5 keys (errorCode, errorMessage, failedAt, sourceOrderId, attemptedProducts).
- Happy-path test (REQ-06): `insertMock.mockResolvedValueOnce({ data: [...], error: null })` → assert `result.success === true` AND `updateMock` was NOT called with a `duplicate_error` key.
- `clearOrderDuplicateError` tests (REQ-08, REQ-09):
  - Test 1: pre-existing `duplicate_error` in selectMock response → assert update is called with that key absent in the new `custom_fields` payload.
  - Test 2 (idempotent): selectMock returns `custom_fields = {}` (no marker) → still returns `success: true`, update call payload omits the key.
- Multi-tenant assertion (Regla 3): `expect(eqMock).toHaveBeenCalledWith('workspace_id', 'ws-test')` for both the read and write of `orders` table.

**Don't copy:**
- The "short-circuit on null param" tests from conversations.test.ts:36-56 — `duplicateOrder` takes a non-nullable `sourceOrderId` (type-checked at compile time); no need for runtime null tests.
- The `expect(eqMock).toHaveBeenNthCalledWith(1, ...)` Nth ordering assertion (line 113) — useful but brittle if internal query order changes. Prefer `expect.objectContaining` or general `.toHaveBeenCalledWith` calls.

---

### `src/__tests__/integration/orders-duplicate-products.test.ts` (CREATE)

**Role:** Integration test against real Supabase. Force a real FK violation (delete the product from `products` table before calling `duplicateOrder`) to verify (a) marker actually written to `custom_fields.duplicate_error`, (b) `success: false` returned, (c) `total_value` stays 0 (trigger semantics confirmed — Assumption A1 in RESEARCH).

**Closest analog:** `src/__tests__/integration/orders-cas.test.ts` — exact same dir, same vitest env, same env gating, same admin client.

**Why this analog:** Same I/O shape (calls a domain function against a real workspace), same `describe.skipIf(!envReady)` pattern, same `beforeEach/afterEach` seed+cleanup, same env var names (`TEST_WORKSPACE_ID`, `TEST_PIPELINE_ID`, `TEST_STAGE_A`).

**Pattern to mimic verbatim (orders-cas.test.ts:1-69):**

```typescript
// Source: src/__tests__/integration/orders-cas.test.ts:1-69
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { moveOrderToStage } from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const TEST_PIPELINE_ID = process.env.TEST_PIPELINE_ID ?? ''
const STAGE_A = process.env.TEST_STAGE_A ?? ''

const envReady = Boolean(
  SUPABASE_URL && SERVICE_ROLE_KEY && TEST_WORKSPACE_ID &&
  TEST_PIPELINE_ID && STAGE_A
)

const admin = envReady ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null

async function seedOrder(stageId: string): Promise<string> {
  const { data, error } = await admin!
    .from('orders')
    .insert({
      workspace_id: TEST_WORKSPACE_ID,
      stage_id: stageId,
      pipeline_id: TEST_PIPELINE_ID,
      name: 'TEST CAS',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

async function cleanupOrder(orderId: string) {
  await admin!.from('orders').delete().eq('id', orderId)
}

const ctx: DomainContext = {
  workspaceId: TEST_WORKSPACE_ID,
  source: 'server-action',
  actorId: null,
  actorLabel: 'test',
}

describe.skipIf(!envReady)('moveOrderToStage CAS (flag ON)', () => {
  // ...
})
```

**Adaptations needed:**
- Import `duplicateOrder` from `@/lib/domain/orders` (not `moveOrderToStage`).
- Extend env vars: need a `TEST_PIPELINE_ID_TARGET` (different from source) OR a `TEST_STAGE_B` for in-pipeline target.
- Helper `seedOrderWithProduct(stageId)`: insert order, insert a real product into `products` table, insert order_product referencing that product, return `{ orderId, productId }`.
- Forced-failure test:
  1. Seed source order + product + order_product (valid).
  2. Delete the `products` row → now any `order_products.insert` referencing that productId will fail FK.
  3. Wait — since `duplicateOrder` reads `sourceOrder.order_products` and uses its `product_id`, the FK violation will fire on insert into the duplicated order.
  4. Call `duplicateOrder(ctx, { sourceOrderId, targetPipelineId, copyProducts: true })`.
  5. Assert: `result.success === false`, `result.error` includes `'23503'`.
  6. Assert: query the new order's `custom_fields.duplicate_error` from DB — has all 5 keys.
  7. Assert: query the new order's `total_value` — equals 0 (trigger did NOT fire — confirms A1).
  8. Assert: source order's products are intact.
- Cleanup in `afterEach`: delete source order + destination order. CASCADE will clean `order_products` + `order_stage_history`. Re-insert the product if other tests need it (or run this test last in suite).
- The throwing wrapper test (REQ-07): NOT in this file. The integration test calls domain directly. To validate the `automation_executions.error_message` path, either (a) trust the action-executor pattern at line 669 which already throws on `!success`, or (b) write a separate integration test that triggers a real automation row. Recommended: (a) — verify in code review that `executeDuplicateOrder` is unchanged.

**Don't copy:**
- The CAS flag-toggle (`setFlag('crm_stage_integrity_cas_enabled', ...)` at lines 48-54, 73-74, 78-79) — that flag is irrelevant to duplicateOrder. No flags are introduced by THIS standalone (D-pre-05).
- The `Promise.all([move1, move2])` concurrent-call pattern from orders-cas.test.ts:85-88 — duplicateOrder doesn't have a concurrency bug to test for. Sequential calls only.

---

## Shared / Cross-Cutting Patterns

### S-1: Domain layer mutation contract

**Source:** `src/lib/domain/orders.ts:785-823` (deleteOrder, simplest example).

**Apply to:** Both new domain code paths in `orders.ts` (fix in `duplicateOrder` + new `clearOrderDuplicateError`).

```typescript
export async function FOO(
  ctx: DomainContext,
  params: FooParams
): Promise<DomainResult<FooResult>> {
  const supabase = createAdminClient()
  try {
    // 1. Verify row exists + belongs to workspace (Regla 3)
    const { data: existing, error: fetchError } = await supabase
      .from('X')
      .select('id')
      .eq('id', params.id)
      .eq('workspace_id', ctx.workspaceId)
      .single()
    if (fetchError || !existing) return { success: false, error: 'No encontrado' }

    // 2. Mutation with destructured error check
    const { error: mutError } = await supabase.from('X').update(...).eq(...).eq('workspace_id', ctx.workspaceId)
    if (mutError) return { success: false, error: `Error: ${mutError.message}` }

    return { success: true, data: { ... } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

### S-2: Server action wrapping a domain helper

**Source:** `src/app/actions/orders.ts:638-651` (deleteOrder action).

**Apply to:** new `clearOrderDuplicateError` server action.

```typescript
export async function FOO(arg: string): Promise<ActionResult<T>> {
  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  const result = await domainFoo(ctx, { arg })

  if (!result.success) return { error: result.error || 'Error generico' }

  revalidatePath('/crm/pedidos')
  return { success: true, data: ... }
}
```

### S-3: JSONB read-merge-write (NEVER use `jsonb_set` RPC)

**Source:** `src/lib/domain/custom-fields.ts:67-87` + `src/lib/domain/orders.ts:559-576` (existing inline JSONB compare).

**Apply to:** Both write paths in the fix (write `duplicate_error` marker + clear `duplicate_error` key).

**Verified:** `grep -rn "jsonb_set" src/lib/` returns 0 matches. The codebase always reads, merges in JS, writes back. Do NOT introduce `.rpc('jsonb_set')`.

```typescript
const { data: row } = await supabase
  .from('TABLE')
  .select('custom_fields')
  .eq('id', id)
  .eq('workspace_id', ctx.workspaceId)
  .single()

const existing = (row?.custom_fields as Record<string, unknown>) || {}

// To set a key:
const merged = { ...existing, my_key: value }

// To remove a key:
const { my_key, ...rest } = existing as Record<string, unknown> & { my_key?: unknown }
void my_key  // silence unused warning
const merged = rest

await supabase
  .from('TABLE')
  .update({ custom_fields: merged })
  .eq('id', id)
  .eq('workspace_id', ctx.workspaceId)
```

### S-4: Vitest mock chain for createAdminClient

**Source:** `src/lib/domain/__tests__/conversations.test.ts:12-34`.

**Apply to:** New unit test file.

Boilerplate template at the top of every domain unit test:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const singleMock = vi.fn()
const insertMock = vi.fn()
const updateMock = vi.fn(() => ({ eq: eqMock }))
const eqMock = vi.fn(() => ({ eq: eqMock, single: singleMock }))
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({
  select: selectMock,
  insert: insertMock,
  update: updateMock,
}))
const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

import { duplicateOrder, clearOrderDuplicateError } from '@/lib/domain/orders'

beforeEach(() => {
  vi.clearAllMocks()
  eqMock.mockImplementation(() => ({ eq: eqMock, single: singleMock }))
  selectMock.mockImplementation(() => ({ eq: eqMock }))
  updateMock.mockImplementation(() => ({ eq: eqMock }))
  fromMock.mockImplementation(() => ({
    select: selectMock, insert: insertMock, update: updateMock,
  }))
  createAdminClientMock.mockImplementation(() => ({ from: fromMock }))
})
```

### S-5: Integration test env gating

**Source:** `src/__tests__/integration/orders-cas.test.ts:24-30`.

**Apply to:** New integration test file.

```typescript
const envReady = Boolean(
  SUPABASE_URL && SERVICE_ROLE_KEY && TEST_WORKSPACE_ID && TEST_PIPELINE_ID && STAGE_A
)
const admin = envReady ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null

describe.skipIf(!envReady)('duplicateOrder INSERT failure (real DB)', () => {
  // ...
})
```

### S-6: stopPropagation on interactive elements inside a draggable card

**Source:** `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` lines 117, 211, 223 (same file we're modifying — 3 existing examples).

**Apply to:** EVERY new interactive element added to KanbanCard (badge wrapper, Popover trigger, Link to source, AlertDialog trigger, AlertDialogAction button).

```typescript
onClick={(e) => e.stopPropagation()}
```

Without this, clicks bubble up to the `useDraggable` listener and the card enters drag mode + the parent's `onClick={handleClick}` fires → opens the order sheet. P-8 + P-9 in RESEARCH lock this requirement.

### S-7: Sonner toast + router.refresh after server action

**Source:** `src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx:53-69`.

**Apply to:** `handleResolve` in kanban-card.tsx for the "Marcar resuelto" success/error flow.

```typescript
const result = await clearOrderDuplicateError(order.id)
if ('error' in result) {
  toast.error(result.error)
  return
}
toast.success('Marca de error eliminada')
router.refresh()
```

---

## No-Analog Files

None — all 6 in-scope files have a strong existing analog.

---

## Anti-Patterns the Planner Must Avoid (sourced from RESEARCH §Pitfalls)

| Anti-pattern | Why forbidden | Verifiable signal |
|--------------|---------------|-------------------|
| Retry loop on transient INSERT errors | D-02 fail-fast locked | No `for (let i = 0; i < N; i++)` in `duplicateOrder` diff |
| Feature flag (`platform_config` lookup wrapping the new behavior) | D-pre-05 — bug fix is strictly better | No `getPlatformConfig` call inside `duplicateOrder` |
| Touching `recompraOrder` | D-pre-04 — out of scope | `recompraOrder` not in any diff |
| Auto-clear marker on first product INSERT | D-05 — explicit click required | No Postgres trigger on `order_products` AFTER INSERT |
| Backfill script for 41 historical empty orders | D-03 — fix forward only | No `scripts/backfill-*.mjs` |
| Special-casing the Doralba order | D-04 — manual operations | No hardcoded order IDs in any diff |
| Slack/email alert wiring | Decided in CONTEXT — UI badge sufficient | No `inngest.send('order.duplicate_failed', ...)` |
| `jsonb_set` RPC | Codebase pattern is JS read-merge-write | `grep -rn "jsonb_set" src/lib/` stays at 0 matches |
| `window.confirm()` instead of AlertDialog | shadcn pattern locked | No `window.confirm(` in `kanban-card.tsx` diff |
| Tooltip instead of Popover for the badge details | Tooltip can't host interactive children (Radix docs) | No `@radix-ui/react-tooltip` import for the badge |
| Re-fetching the order after `clearOrderDuplicateError` | `revalidatePath('/crm/pedidos')` + `router.refresh()` already trigger fresh fetch | Server action returns only `{ orderId }`, not full `OrderWithDetails` |

---

## Metadata

**Analog search scope:**
- `src/lib/domain/**` (orders.ts, custom-fields.ts, types.ts)
- `src/app/actions/orders.ts`
- `src/app/(dashboard)/crm/pedidos/components/**`
- `src/lib/orders/types.ts`
- `src/lib/domain/__tests__/**`
- `src/__tests__/integration/**`
- `src/components/ui/**` (popover.tsx + alert-dialog.tsx exist — verified)
- `src/app/(dashboard)/automatizaciones/components/variable-picker.tsx`
- `src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx`

**Files scanned:** ~15 files read in full or in targeted ranges.

**Pattern extraction date:** 2026-05-26.

---

## PATTERN MAPPING COMPLETE

**Standalone:** crm-duplicate-order-products-integrity
**Files classified:** 6 (4 MODIFY + 2 CREATE)
**Analogs found:** 6 / 6 (100% coverage — every change has a verbatim or composed analog already in the codebase)

**Key reusable patterns identified:**
- S-1 Domain mutation contract (deleteOrder skeleton)
- S-2 Server action wrapping domain (`getAuthContext` + `DomainContext` + `revalidatePath`)
- S-3 JSONB read-merge-write in JS (custom-fields.ts canonical — NEVER `jsonb_set` RPC)
- S-4 Vitest `createAdminClient` mock chain (conversations.test.ts boilerplate)
- S-5 Env-gated integration test (`describe.skipIf(!envReady)` + `TEST_*` vars)
- S-6 `stopPropagation` for interactive elements inside `useDraggable` card
- S-7 Sonner toast + `router.refresh()` after server action

**Ready for planning:** Planner can now reference each analog by exact path:lines in plan actions. Zero novel patterns required — surgical bug fix + UI surface using proven primitives.
