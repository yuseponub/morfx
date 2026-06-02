# Standalone crm-duplicate-order-products-integrity — Research

**Researched:** 2026-05-26
**Domain:** Bug fix in `src/lib/domain/orders.ts` `duplicateOrder` + UI badge on Kanban + server action for clear
**Confidence:** HIGH

## Phase Summary

`src/lib/domain/orders.ts:959` runs `await supabase.from('order_products').insert(productsToInsert)` without destructuring/checking `{error}`. INSERT failures (FK 23503, CHECK 23514, NOT NULL 23502, FK on `order_id` race) are silently discarded, producing a "success" automation execution with `total_value: 0` and zero products. Audit: 52 of 825 (6.3%) in 60 days. Bug fully reproduced experimentally in `scripts/debug-doralba-silent-fail.mjs`.

Fix is constrained by 6 D-XX + 7 D-pre-XX locked decisions (CONTEXT.md). In scope: capture INSERT error, persist into `orders.custom_fields.duplicate_error` (existing JSONB, no migration), return `{success:false}` so `executeDuplicateOrder` throws → `automation_executions.actions_log[i].status='failed'` + `error_message` populated, plus Kanban badge with Popover + AlertDialog confirmation + server action `clearOrderDuplicateError`. Out of scope: retry, rollback, backfill, Doralba case, `recompraOrder`, Slack alerts, feature flag, DB migration.

**Primary recommendation:** make `duplicateOrder` follow the same pattern as `updateOrder` (lines 484-490 of orders.ts) — destructure `{error: productsError}` from the insert, then on truthy, persist error to `custom_fields.duplicate_error` via in-place merge (read → spread → write), then return `{success:false, error:'Error al copiar productos: ${code} - ${message}'}`. UI consumes the JSONB field directly via existing `order.custom_fields` already on `OrderWithDetails`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Capture INSERT error + persist marker | Domain (`src/lib/domain/orders.ts`) | — | Regla 3 absoluta — all mutations through domain |
| Propagate failure to `automation_executions.error_message` | Action executor wrapper (`src/lib/automations/action-executor.ts:646-692`) | Inngest automation-runner (`src/inngest/functions/automation-runner.ts:301-322`) | Already wired — wrapper throws on `!result.success`; runner caches throw inside `step.run` and writes `status:'failed'` + `error_message` |
| Render badge on Kanban card | Browser/Client component (`kanban-card.tsx`) | — | Pure UI — reads `order.custom_fields.duplicate_error` already in props |
| "Marcar resuelto" mutation | API/Backend (server action `src/app/actions/orders.ts`) | Domain (`src/lib/domain/orders.ts` helper) | Server action validates auth + workspace; domain mutates JSONB |
| Confirm dialog before clear | Browser/Client (Radix AlertDialog) | — | Pure UI — prevents accidental click per D-Specifics |

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.93.1 | DB client + PostgrestError type | Already the only DB client in domain layer [VERIFIED: package.json:46] |
| `@radix-ui/react-popover` | ^1.1.15 | Hover/click popover for badge detail | Already used in `variable-picker.tsx` and 4 other places [VERIFIED: package.json:33, grep] |
| `@radix-ui/react-alert-dialog` | ^1.1.15 | Confirm dialog for "Marcar resuelto" | Already used in `quick-reply-list.tsx` and 4 other places [VERIFIED: package.json:27, grep] |
| `lucide-react` | (already installed) | `AlertTriangleIcon` / `AlertCircleIcon` for badge | Already used throughout kanban-card.tsx [VERIFIED: kanban-card.tsx:5] |
| `vitest` | ^1.6.1 | Unit + integration tests (Node env) | Project standard, single config [VERIFIED: vitest.config.ts] |
| `sonner` | (already installed) | Toast for success/error after server action | Already used in kanban-board.tsx [VERIFIED: kanban-board.tsx:27] |

**Zero new npm packages required.** Re-verify: `npm list @radix-ui/react-popover @radix-ui/react-alert-dialog` returns installed versions.

### Alternatives Considered

| Instead of | Could Use | Why we keep the standard |
|------------|-----------|--------------------------|
| Radix Popover | Radix HoverCard | HoverCard is hover-only; we need click for mobile + the "Marcar resuelto" button inside. Popover supports both interactions. |
| Radix Popover | Radix Tooltip | Tooltip cannot contain interactive elements per Radix docs. We need an AlertDialog trigger inside. |
| New `clearOrderDuplicateError` domain helper | Extend `updateOrder` with `clearDuplicateError?: boolean` param | A dedicated helper is more discoverable + smaller blast radius. CONTEXT D-05 already names it. |

## Architecture Patterns

### System Architecture (data flow for the bug fix)

```
[Automation trigger]
      │
      ▼
[automation-runner.ts step.run("action-...")] ─── catches throw
      │                                            │
      ▼                                            ▼
[action-executor executeDuplicateOrder]      writes actions_log[i].status='failed'
      │                                       + automation_executions.error_message
      ▼ throw if !result.success
[domain/orders.ts duplicateOrder]
      │
      ▼
[supabase.from('order_products').insert(...)]
      │
      ├─ success: continue (emit trigger, return {success:true})
      └─ error: ─── NEW BEHAVIOR
              │
              ▼
        [SELECT custom_fields → spread → write
         custom_fields.duplicate_error = {code,message,failedAt,sourceOrderId,attemptedProducts}]
              │
              ▼
        return {success:false, error:'...'}


[Kanban UI]
      │
      ▼
[getOrders() → SELECT * → custom_fields included]
      │
      ▼
[KanbanCard reads order.custom_fields.duplicate_error]
      │
      ├─ falsy: render normally
      └─ truthy: render badge ⚠ red
              │
              ▼ click
        [Popover: products list + source link + AlertDialog button]
              │
              ▼ confirm "Marcar resuelto"
        [server action clearOrderDuplicateError(orderId)]
              │
              ▼
        [domain helper: SELECT custom_fields → omit duplicate_error key → UPDATE]
              │
              ▼
        revalidatePath('/crm/pedidos')
```

### Recommended Project Structure (touched files)

```
src/lib/domain/orders.ts                                      # bug fix + clearOrderDuplicateError helper
src/lib/orders/types.ts                                       # add DuplicateError interface
src/app/actions/orders.ts                                     # add clearOrderDuplicateError server action
src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx    # badge + popover + alert-dialog
src/lib/domain/__tests__/orders-duplicate-products.test.ts    # NEW — 4 failure modes (mock)
src/__tests__/integration/orders-duplicate-products.test.ts   # NEW — real DB FK violation
```

### Pattern 1: Domain mutation with INSERT error capture

The existing `updateOrder` (lines 484-490) is the canonical pattern — apply identically to `duplicateOrder`:

```typescript
// Source: src/lib/domain/orders.ts:484-490 (existing pattern in updateOrder)
const { error: productsError } = await supabase
  .from('order_products')
  .insert(productsToInsert)

if (productsError) {
  return { success: false, error: `Error al insertar productos: ${productsError.message}` }
}
```

### Pattern 2: JSONB custom_fields read-merge-write

Both `updateCustomFieldValues` (contacts) and `updateOrder` already use this pattern. **Always read first, merge in JS, write back.** Do NOT use `jsonb_set()` RPC — the codebase has zero usage.

```typescript
// Source: src/lib/domain/custom-fields.ts:77-87 (existing pattern)
const existing = (contact.custom_fields as Record<string, unknown>) || {}
const merged = { ...existing, ...params.fields }

const { error: updateError } = await supabase
  .from('contacts')
  .update({ custom_fields: merged })
  .eq('id', params.contactId)
  .eq('workspace_id', ctx.workspaceId)
```

### Anti-Patterns to Avoid

- **Don't add retry logic** — D-02 locks fail-fast. Even "1 retry for transient" is forbidden.
- **Don't call `jsonb_set()` via RPC** — codebase pattern is read-merge-write in JS; introducing a new pattern adds maintenance cost.
- **Don't delete the order on failure** — D-01 locks "mantener vacía"; rollback would lose traceability.
- **Don't fire-and-forget the JSONB write** — must complete before returning `{success:false}`. If the JSONB write itself fails, return both errors concatenated.

## UI integration points

### Active variant for `/crm/pedidos`

There is **NO** `ui_inbox_v2`, `theme-editorial`, or dashboard-retrofit variant active for `/crm/pedidos` [VERIFIED: `grep -rn "ui_inbox_v2|theme-editorial|dashboard-retrofit" src/app/(dashboard)/crm/pedidos/` returns 0 matches]. The current Kanban card uses standard shadcn primitives (border, shadow, muted-foreground tokens). The badge **must follow the same convention** — no special editorial token set required.

### Exact files to modify

| File | Line(s) | Change |
|------|---------|--------|
| `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` | After header block (~line 158), inside the card | Add conditional badge `{order.custom_fields?.duplicate_error && <DuplicateErrorBadge order={order} />}` |
| Same file | top | Import Popover, AlertDialog, AlertTriangle icon, server action |

### Data flow — already complete (no query change needed)

`getOrders()` at `src/app/actions/orders.ts:255-265` does `select('*, ...')` on `orders`. The `*` includes `custom_fields` automatically. `Order.custom_fields: Record<string, unknown>` is declared at `src/lib/orders/types.ts:143`. `OrderWithDetails extends Order` so `order.custom_fields.duplicate_error` is accessible inside `KanbanCard`.

**No data-fetch change needed.** Just read `order.custom_fields.duplicate_error` directly.

### Type-safe access pattern for the badge

Add a discriminated type in `src/lib/orders/types.ts` so the kanban-card render is type-safe:

```typescript
// Source: NEW — src/lib/orders/types.ts (add after Order interface)
export interface DuplicateError {
  errorCode: string
  errorMessage: string
  failedAt: string  // ISO timestamp
  sourceOrderId: string
  attemptedProducts: Array<{
    sku: string
    title: string
    unit_price: number
    quantity: number
  }>
}

export function getDuplicateError(order: { custom_fields: Record<string, unknown> }): DuplicateError | null {
  const raw = order.custom_fields?.duplicate_error
  if (!raw || typeof raw !== 'object') return null
  return raw as DuplicateError
}
```

### Existing Popover example to follow (verbatim style)

```typescript
// Source: src/app/(dashboard)/automatizaciones/components/variable-picker.tsx:40-80
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button type="button" variant="ghost" size="sm" className={className}>
      <Braces className="size-4" />
    </Button>
  </PopoverTrigger>
  <PopoverContent align="end" className="w-72 p-0">
    <div className="p-3 border-b">
      <p className="text-sm font-medium">Variables disponibles</p>
    </div>
    <div className="max-h-56 overflow-y-auto p-1">{/* content */}</div>
  </PopoverContent>
</Popover>
```

### Existing AlertDialog example to follow (verbatim style)

```typescript
// Source: src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx:97-110
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
      <Trash2 className="h-4 w-4" />
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Eliminar respuesta</AlertDialogTitle>
      <AlertDialogDescription>Esta accion no se puede deshacer.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>{/* Cancel + Action */}</AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Stop-propagation requirement

The KanbanCard is wrapped in `useDraggable` with click handler. Any badge interactions (Popover trigger, AlertDialog trigger) **must** `onClick={(e) => e.stopPropagation()}` to prevent drag start + opening the order sheet. The existing Checkbox at line 117 and WhatsApp Link at line 224 do this — follow the same pattern.

### Badge wording (recommendation)

Based on the audit ("sin productos" is what operators saw), use:
- Badge label: `⚠ Sin productos` (compact, fits in the card next to total)
- Popover title: `⚠ Productos no se copiaron al duplicar`

This matches operator mental model + the D-Specifics open question.

## JSONB custom_fields pattern

### Recommended approach: read-merge-write in JS (already in codebase)

The codebase has **zero usage** of `jsonb_set()` RPC [VERIFIED: `grep -rn "jsonb_set" src/lib/` returns 0]. Both `updateCustomFieldValues` (contacts) and `updateOrder` (orders, line 445) do read-merge-write in JS. Stick with this.

### Set the error key

```typescript
// NEW pattern inside duplicateOrder fix
const { data: cur } = await supabase
  .from('orders')
  .select('custom_fields')
  .eq('id', newOrder.id)
  .eq('workspace_id', ctx.workspaceId)
  .single()

const existing = (cur?.custom_fields as Record<string, unknown>) || {}
const merged = {
  ...existing,
  duplicate_error: {
    errorCode: productsError.code ?? 'unknown',
    errorMessage: productsError.message ?? '',
    failedAt: new Date().toISOString(),
    sourceOrderId: params.sourceOrderId,
    attemptedProducts: sourceProducts.map(p => ({
      sku: p.sku, title: p.title, unit_price: p.unit_price, quantity: p.quantity
    })),
  },
}

await supabase
  .from('orders')
  .update({ custom_fields: merged })
  .eq('id', newOrder.id)
  .eq('workspace_id', ctx.workspaceId)
```

### Clear the error key (D-05 manual button)

The server action calls a new domain helper `clearOrderDuplicateError`. JS-level key deletion:

```typescript
// NEW in src/lib/domain/orders.ts — domain helper for clearOrderDuplicateError
export async function clearOrderDuplicateError(
  ctx: DomainContext,
  params: { orderId: string }
): Promise<DomainResult<{ orderId: string }>> {
  const supabase = createAdminClient()
  const { data: cur, error: readError } = await supabase
    .from('orders')
    .select('custom_fields')
    .eq('id', params.orderId)
    .eq('workspace_id', ctx.workspaceId)
    .single()
  if (readError || !cur) return { success: false, error: 'Pedido no encontrado' }

  const existing = (cur.custom_fields as Record<string, unknown>) || {}
  // Remove the key (vs setting to null — keeps JSONB clean)
  const { duplicate_error, ...rest } = existing as Record<string, unknown> & { duplicate_error?: unknown }
  void duplicate_error  // suppress unused warning

  const { error: updateError } = await supabase
    .from('orders')
    .update({ custom_fields: rest })
    .eq('id', params.orderId)
    .eq('workspace_id', ctx.workspaceId)
  if (updateError) return { success: false, error: `Error al limpiar: ${updateError.message}` }

  return { success: true, data: { orderId: params.orderId } }
}
```

**Confidence:** HIGH — matches `updateCustomFieldValues` pattern verbatim.

## Trigger semantics

### `order_products_update_total` does NOT fire on failed INSERT

[VERIFIED: PostgreSQL docs + `supabase/migrations/20260129000003_orders_foundation.sql:245-248`] Trigger is `AFTER INSERT OR UPDATE OR DELETE`. PostgreSQL evaluates NOT NULL, CHECK and FK constraints at row-insertion time; if any fails, the row is not inserted, and AFTER ROW triggers do NOT fire on a non-existent row mutation. **Consequence:** when the INSERT fails, `orders.total_value` remains at its default `0`. The Kanban card will show `$0` + the red badge, which is the desired UX per D-01 ("visualmente claro que la order está incompleta").

### No trigger on `orders.custom_fields` updates

[VERIFIED: grep of `20260129000003_orders_foundation.sql`] Only `orders_set_workspace` (BEFORE INSERT) and `orders_updated_at` (BEFORE UPDATE) exist on `orders`. Writing `custom_fields.duplicate_error` will bump `updated_at` (via `update_updated_at_column()`), which is harmless. **It will NOT re-trigger any automation chain** unless there's a `change_field` automation watching `custom_fields` — that's by design and we don't need it.

**Confidence:** HIGH for "trigger does not fire on failed insert"; HIGH for "no other triggers on orders.custom_fields."

## Server action pattern

### Auth + workspace pattern (canonical in this codebase)

```typescript
// Source: src/app/actions/orders.ts:76-88 (existing helper — reuse)
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

### Result type (canonical)

```typescript
// Source: src/app/actions/orders.ts:68-70
type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }
```

### The new server action (template)

```typescript
// NEW — append to src/app/actions/orders.ts
import { clearOrderDuplicateError as domainClearOrderDuplicateError } from '@/lib/domain/orders'

export async function clearOrderDuplicateError(orderId: string): Promise<ActionResult<{ orderId: string }>> {
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

### Revalidation

`revalidatePath('/crm/pedidos')` only. No tag-based revalidation is used in `src/app/actions/orders.ts` [VERIFIED: grep returns only `revalidatePath` calls, no `revalidateTag`]. The page is dynamically rendered (uses `cookies()` in page.tsx:23), so this triggers a fresh `getOrders()` call on next navigation.

**Confidence:** HIGH — exact pattern mirrors `updateOrder`, `moveOrderToStage`, `deleteOrder` in the same file.

## Test setup + patterns

### File naming + location

| Test type | Location | Example | Vitest env |
|-----------|----------|---------|------------|
| Unit (mocked Supabase) | `src/lib/domain/__tests__/{module}.test.ts` | `src/lib/domain/__tests__/conversations.test.ts` | node (default) |
| Integration (real DB) | `src/__tests__/integration/{module}.test.ts` | `src/__tests__/integration/orders-cas.test.ts` | node (default) |
| Component | Co-located, with comment `// @vitest-environment jsdom` at top | (none for orders yet) | jsdom (per-file opt-in) |

For this standalone:
- **Unit:** `src/lib/domain/__tests__/orders-duplicate-products.test.ts` (covers 4 failure modes with mocked Supabase)
- **Integration:** `src/__tests__/integration/orders-duplicate-products.test.ts` (real DB FK violation — env-gated SKIP)

### Mock pattern (canonical)

```typescript
// Source: src/lib/domain/__tests__/conversations.test.ts:12-34
import { describe, it, expect, vi, beforeEach } from 'vitest'

const singleMock = vi.fn()
const eqMock = vi.fn(() => ({ eq: eqMock, single: singleMock }))
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))
const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

import { duplicateOrder } from '@/lib/domain/orders'

beforeEach(() => {
  vi.clearAllMocks()
  eqMock.mockImplementation(() => ({ eq: eqMock, single: singleMock }))
  selectMock.mockImplementation(() => ({ eq: eqMock }))
  fromMock.mockImplementation(() => ({ select: selectMock }))
  createAdminClientMock.mockImplementation(() => ({ from: fromMock }))
})
```

Adapting this for `duplicateOrder` requires also mocking `.insert()` because it's used by `from('order_products').insert(...)`. Add `insertMock`:

```typescript
const insertMock = vi.fn()
fromMock.mockImplementation((table: string) => {
  if (table === 'order_products') return { insert: insertMock }
  return { select: selectMock, insert: insertMock, update: vi.fn(...) }
})
```

### Integration test pattern

```typescript
// Source: src/__tests__/integration/orders-cas.test.ts:11-30 (canonical pattern)
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const TEST_PIPELINE_ID = process.env.TEST_PIPELINE_ID ?? ''
const STAGE_A = process.env.TEST_STAGE_A ?? ''

const envReady = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && TEST_WORKSPACE_ID && TEST_PIPELINE_ID && STAGE_A)
const admin = envReady ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null

describe.skipIf(!envReady)('duplicateOrder INSERT failure (real DB)', () => {
  // ...
})
```

**Env vars already documented in `.env.test.example`.** Reuse `TEST_WORKSPACE_ID`, `TEST_PIPELINE_ID`, `TEST_STAGE_A`. No new vars needed (we can use any existing stage as both source and target; just use different pipelines or same pipeline + different stage).

### 4 failure modes to cover (per D-pre-02)

Reproductions already in `scripts/debug-doralba-silent-fail.mjs`:

| Mode | Trigger | Postgres code | HTTP status |
|------|---------|---------------|-------------|
| FK violation `product_id` | Insert with random UUID `product_id` not in `products` table | `23503` | 409 |
| FK violation `order_id` | Race: delete dst order before insert runs | `23503` | 409 |
| CHECK violation `quantity > 0` | Insert with `quantity: 0` | `23514` | 400 |
| NOT NULL violation `sku` | Omit `sku` field | `23502` | 400 |

For unit tests, mock `insertMock.mockResolvedValueOnce({ data: null, error: { code: '23503', message: 'insert or update on table "order_products" violates foreign key constraint "order_products_product_id_fkey"' } })`.

For integration tests, use the FK-violation mode (cleanest — no need to corrupt source data): create source order WITH a valid product, then delete that product from `products` table just before calling `duplicateOrder`. Cleanup in `afterEach`.

### No Playwright tests in scope

[VERIFIED: `find e2e/` returns no orders-related e2e tests today]. Manual smoke test only for the UI badge — operator visually confirms in `/crm/pedidos` Kanban after deploy. This is consistent with `ui-redesign-conversaciones` and other recent UI-only shipped standalones.

**Confidence:** HIGH — patterns verified against 2 existing test files.

## Supabase error shape

### PostgrestError contract (Supabase JS v2 / `@supabase/supabase-js@^2.93.1`)

```typescript
// Shape returned by await supabase.from('x').insert(y)
type Response = {
  data: T | null
  error: PostgrestError | null
  status: number  // HTTP status code
  statusText: string
  count: number | null
}

type PostgrestError = {
  code: string        // PostgreSQL SQLSTATE: '23503', '23514', '23502', etc.
  message: string     // Human-readable
  details: string | null   // Additional context (often the failing row)
  hint: string | null      // Suggested fix
}
```

[CITED: https://supabase.com/docs/guides/api/rest/postgrest-error-codes + https://deepwiki.com/supabase/supabase-js/4.5-response-handling-and-error-management]

### Type-safe error capture

Use the existing `updateOrder` pattern at orders.ts:484-490. **Do not** import `PostgrestError` as a type — domain layer never imports from `@supabase/supabase-js` types directly. Just destructure `{error}` and use `error.code` + `error.message` (strings).

**Confidence:** HIGH — verified against official Supabase docs.

## Pitfalls to avoid (locked by discuss-phase)

### P-1: Don't add retry logic for transient errors (D-02 locked)

> Tempting because: "FK violations are logical but 23P01 deadlock / 57014 timeout / 53300 too many connections are transient and 1 retry would help."

**Why forbidden:** D-02 explicitly rejected this. The user chose simplicity + predictability over marginal resilience. The operator can manually retry from the UI.

**Verification:** plan must NOT include any `for (let attempt = 0; attempt < N; attempt++)` loop, exponential backoff helper, or transient-error discrimination table.

### P-2: Don't introduce a feature flag (D-pre-05 locked)

> Tempting because: "What if the new error-surfacing breaks an upstream consumer that was relying on success?"

**Why forbidden:** No consumer relies on the silent-success behavior — it was always a bug. The new behavior is strictly better. Adding a flag would mean prod stays broken until someone flips it.

**Verification:** plan must NOT touch `platform_config`, environment variables, or any conditional `if (FLAG_ENABLED) { newBehavior } else { oldBehavior }`.

### P-3: Don't touch `recompraOrder` (D-pre-04 locked)

> `recompraOrder` (orders.ts:1086+) calls `duplicateOrder({ copyProducts: false })` then does its own product INSERT at orders.ts:1170-1181. Crucially, **recompraOrder already handles `productsError` + rolls back** (line 1174). It does NOT have the bug.

**Verification:** grep `recompraOrder` should not appear in the diff of any plan in this standalone. The auditor for "other similar patterns" is a deferred standalone (`domain-error-handling-audit`).

### P-4: Don't auto-clear the badge on first product INSERT (D-05 rejected)

> Tempting because: "Operator manually adds products → badge auto-clears, fewer clicks."

**Why forbidden:** D-05 rejected this with the reason "operator could accidentally add wrong products without verifying." The explicit button forces visual verification.

**Verification:** no Postgres trigger on `order_products` AFTER INSERT that clears `custom_fields.duplicate_error`. No JS auto-clear when calling `updateOrder` with new products.

### P-5: Don't backfill the 41 historical empty orders (D-03 rejected)

**Verification:** no `scripts/backfill-*.mjs` written; no SQL migration that touches existing orders.

### P-6: Don't try to "fix" Doralba's case in code (D-04 rejected)

**Verification:** no SQL/script that touches order `[Doralba order id]`, no logic that special-cases the Coordinadora guide `53180511308`.

### P-7: DO ensure `automation_executions.error_message` is populated (positive requirement)

[VERIFIED: action-executor.ts:669 `if (!result.success) throw new Error(result.error || 'Failed to duplicate order')`] The throw is caught by Inngest `step.run` at automation-runner.ts:301, which sets `actionResult.error` (322), which becomes `actions_log[i].error` (321). The runner aggregates and writes `errorMessage` to `automation_executions.error_message` at line 767.

**Plan must include a test asserting:** after a forced INSERT failure, the corresponding `automation_executions` row has `status='failed'` AND `error_message` includes the Postgres error code. Integration test, env-gated.

### P-8: Don't break drag interaction on the Kanban card

The KanbanCard root div has `useDraggable` listeners. Any interactive element added inside (Popover trigger, AlertDialog trigger) MUST `onClick={(e) => e.stopPropagation()}` — otherwise clicking the badge starts a drag. Pattern is already used at kanban-card.tsx:117 and :224.

### P-9: Don't omit `e.preventDefault()` on Popover button inside draggable

In addition to stopPropagation, draggable cards from `@dnd-kit/core` also listen on `pointerdown`. A click that doesn't movement will still fire onClick. Test by manually dragging the badge area — should NOT enter drag mode if just clicked.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Retry helper for transient errors | A `retryWithBackoff(fn, codes)` util | Nothing (D-02) | Forbidden by decision |
| Custom JSONB merge RPC | Postgres `jsonb_set()` wrapper | JS read-merge-write (custom-fields.ts pattern) | Codebase has zero JSONB RPCs; introducing one adds maintenance cost |
| Custom popover component | Wrapping headless UI lib | `@/components/ui/popover` (Radix) | Already installed + used in 5+ places |
| Custom confirm-dialog | `window.confirm()` or custom modal | `@/components/ui/alert-dialog` (Radix) | shadcn pattern used in 5+ places |
| Custom toast | DOM manipulation | `sonner` `toast.success/error` | Already imported in kanban-board.tsx |
| Discriminate transient vs logical errors | Lookup table of Postgres SQLSTATEs | Nothing — fail fast | D-02 |
| Backfill script | Idempotent script for 41 historical orders | Nothing — only fix forward | D-03 |
| Slack/email alerts | Inngest event + notification function | Nothing — UI badge + `automation_executions` is sufficient | Decided in CONTEXT |

**Key insight:** This standalone is a surgical fix + UI surface, not a feature build. Resist scope creep on every "but what if..." question — the user has already considered and rejected those paths.

## Code Examples

### The broken line (current state)

```typescript
// Source: src/lib/domain/orders.ts:959 — THE BUG
await supabase.from('order_products').insert(productsToInsert)
//                                                              ^^^ no destructure, no check
```

### Existing reference: how `updateOrder` does it correctly

```typescript
// Source: src/lib/domain/orders.ts:484-490 — pattern to follow
const { error: productsError } = await supabase
  .from('order_products')
  .insert(productsToInsert)

if (productsError) {
  return { success: false, error: `Error al insertar productos: ${productsError.message}` }
}
```

### The full fix (recommended shape — planner refines exact code)

```typescript
// Replace src/lib/domain/orders.ts:949-961 with:

if (sourceProducts && sourceProducts.length > 0) {
  const productsToInsert = sourceProducts.map((p) => ({
    order_id: newOrder.id,
    product_id: p.product_id || null,
    sku: p.sku,
    title: p.title,
    unit_price: p.unit_price,
    quantity: p.quantity,
  }))

  const { error: productsError } = await supabase
    .from('order_products')
    .insert(productsToInsert)

  if (productsError) {
    // Persist error to custom_fields.duplicate_error (D-01 + D-pre-06)
    // Read-merge-write JSON pattern (custom-fields.ts canonical)
    const { data: cur } = await supabase
      .from('orders')
      .select('custom_fields')
      .eq('id', newOrder.id)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    const existing = (cur?.custom_fields as Record<string, unknown>) || {}
    const merged = {
      ...existing,
      duplicate_error: {
        errorCode: productsError.code ?? 'unknown',
        errorMessage: productsError.message ?? '',
        failedAt: new Date().toISOString(),
        sourceOrderId: params.sourceOrderId,
        attemptedProducts: sourceProducts.map(p => ({
          sku: p.sku, title: p.title, unit_price: p.unit_price, quantity: p.quantity
        })),
      },
    }

    // Best-effort marker write — don't shadow the productsError if marker fails
    const { error: markerError } = await supabase
      .from('orders')
      .update({ custom_fields: merged })
      .eq('id', newOrder.id)
      .eq('workspace_id', ctx.workspaceId)

    if (markerError) {
      console.error('[duplicateOrder] failed to persist duplicate_error marker:', markerError)
    }

    // Fail-fast (D-02) — return success:false so executor throws → automation_executions.error_message populated
    return {
      success: false,
      error: `Error al copiar productos: ${productsError.code ?? '?'} - ${productsError.message ?? 'unknown'}`,
    }
  }
}
```

### Existing UI checkbox stop-propagation (pattern for badge)

```typescript
// Source: src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx:113-124
<div
  className={cn('absolute top-2 left-2 ...')}
  onClick={(e) => e.stopPropagation()}
>
  <Checkbox checked={isSelected} onCheckedChange={...} />
</div>
```

### Existing Sonner toast pattern (for success after clear)

```typescript
// Source: src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx:60-65
if ('error' in result) {
  toast.error(result.error)
  return
}
toast.success('Respuesta eliminada')
router.refresh()
```

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Silent INSERT discard (the bug) | Destructured error + persist + return failure | This standalone | Surfaces 6.3% of duplication failures |
| `crm-writer` two-step for mutations | Direct domain calls for server-action UI flows | crm-writer remains for sandbox/agent flows | Our `clearOrderDuplicateError` is server-action → domain (not propose/confirm) — appropriate for an explicit operator click |

**No deprecated APIs in scope.**

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | PostgreSQL AFTER ROW triggers do not fire on rows that fail constraint checks at INSERT time | Trigger semantics | If wrong: `total_value` could be touched unexpectedly. Mitigation: integration test asserts `total_value == 0` after forced failure. [CITED but ambiguous in web results — confirm via integration test in Plan] |
| A2 | The user wants the badge wording "Sin productos" (vs "Error de duplicación") | UI integration points | Operator UX preference — confirm with user during plan-phase if not obvious |
| A3 | The badge should be visible permanently until the operator clicks "Marcar resuelto" (D-05) | UI integration points | This is CONTEXT D-05 — locked. |

## Open Questions

1. **Should the badge appear on the source order too?** Currently the fix only marks the destination (empty) order. The source order is unaffected — its products are intact.
   - What we know: D-06 says the popover links from dst → src ("Ver pedido origen →")
   - What's unclear: should the source ALSO get a marker like `custom_fields.duplicated_with_failure`?
   - Recommendation: NO — out of scope. The source had successful execution from its perspective. If operator navigates from dst → src, they see context. Adding source marker is scope creep.

2. **What's the expected behavior when `clearOrderDuplicateError` is called on an order that DOESN'T have the flag?**
   - Recommendation: idempotent success. If `custom_fields.duplicate_error` doesn't exist, return `{success: true}` without writing. The destructure `{ duplicate_error, ...rest } = existing` will produce `rest === existing` and the UPDATE will be a no-op write — that's fine. Plan should add a test for this idempotency.

3. **Should `unit_price` in `attemptedProducts` snapshot be number or string?**
   - Recommendation: number. The source `order_products.unit_price` is `DECIMAL(12,2)` but the Supabase JS client returns it as `number` in the `OrderProduct` interface (orders/types.ts:226). Keep as number.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/supabase-js` | Domain layer | ✓ | 2.93.1 | — |
| `@radix-ui/react-popover` | Kanban badge UI | ✓ | 1.1.15 | — |
| `@radix-ui/react-alert-dialog` | Confirm dialog | ✓ | 1.1.15 | — |
| `vitest` | Tests | ✓ | 1.6.1 | — |
| `sonner` | Toast | ✓ | (in package.json) | — |
| `lucide-react` (`AlertTriangle`) | Badge icon | ✓ | (in package.json) | — |
| Supabase admin DB access | Domain mutations | ✓ | — | — |
| Test workspace env (`TEST_WORKSPACE_ID`, etc.) | Integration tests | Conditional (per `.env.test`) | — | Tests SKIP via `describe.skipIf(!envReady)` |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test framework

| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.1 (Node env) |
| Config | `vitest.config.ts` (no env-per-suite split — opt-in jsdom via per-file comment) |
| Quick run command | `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase requirements → test map

| Req | Behavior | Test type | Automated command | File status |
|-----|----------|-----------|-------------------|-------------|
| REQ-01 | INSERT FK violation (`product_id`) → returns `{success:false, error: '...23503...'}` | unit (mock) | `npx vitest run -t "FK violation product_id"` | Wave 0 |
| REQ-02 | INSERT FK violation (`order_id` race) → returns `{success:false}` + persists marker | unit (mock) | `npx vitest run -t "FK violation order_id"` | Wave 0 |
| REQ-03 | CHECK violation `quantity > 0` → returns `{success:false}` + persists marker | unit (mock) | `npx vitest run -t "CHECK quantity"` | Wave 0 |
| REQ-04 | NOT NULL violation `sku` → returns `{success:false}` + persists marker | unit (mock) | `npx vitest run -t "NOT NULL sku"` | Wave 0 |
| REQ-05 | Marker written contains `errorCode, errorMessage, failedAt, sourceOrderId, attemptedProducts[]` | unit (mock) | included in above | Wave 0 |
| REQ-06 | On success, no marker written; `success:true` returned | unit (mock) | `npx vitest run -t "happy path no marker"` | Wave 0 |
| REQ-07 | `automation_executions.error_message` populated when triggered via action-executor | integration (real DB) | `npx vitest run src/__tests__/integration/orders-duplicate-products.test.ts` | Wave 0 (env-gated SKIP) |
| REQ-08 | `clearOrderDuplicateError` removes key from JSONB | unit (mock) | `npx vitest run -t "clearOrderDuplicateError"` | Wave 0 |
| REQ-09 | `clearOrderDuplicateError` idempotent on missing key | unit (mock) | included above | Wave 0 |
| REQ-10 | Server action validates auth + workspace before calling domain | unit (mock auth helpers) | `npx vitest run -t "clearOrderDuplicateError auth"` | Wave 0 |
| REQ-11 | UI: badge renders when `order.custom_fields.duplicate_error` truthy | manual smoke | visual in `/crm/pedidos` after deploy | manual |
| REQ-12 | UI: badge hidden when no `duplicate_error` | manual smoke | visual | manual |
| REQ-13 | UI: AlertDialog confirms before clear | manual smoke | visual | manual |

### Sampling rate

- **Per task commit:** `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts` + `npx tsc --noEmit`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green + manual smoke in `/crm/pedidos` UI verified by user before `/gsd-verify-work`

### Wave 0 gaps

- [ ] `src/lib/domain/__tests__/orders-duplicate-products.test.ts` — new file covering REQ-01..REQ-06, REQ-08..REQ-10
- [ ] `src/__tests__/integration/orders-duplicate-products.test.ts` — new file covering REQ-07 (env-gated SKIP)
- [ ] No new test fixtures needed (mocks built per-test); integration uses existing `TEST_WORKSPACE_ID` from `.env.test.example`
- [ ] No framework install needed (vitest already configured)

## Security Domain

Per `security_enforcement` default-enabled (no opt-out in `.planning/config.json`):

### Applicable ASVS categories

| Category | Applies | Standard control |
|----------|---------|------------------|
| V2 Authentication | yes | Server action calls `supabase.auth.getUser()` — existing `getAuthContext()` helper |
| V3 Session management | yes | `cookies()` reads `morfx_workspace` cookie set by middleware |
| V4 Access control | yes | Domain `clearOrderDuplicateError` filters by `workspace_id` — Regla 3 |
| V5 Input validation | yes | `orderId` is a UUID — validate via existing zod pattern in actions/orders.ts (uuid string) |
| V6 Cryptography | no | No new cryptographic operations |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation |
|---------|--------|---------------------|
| Cross-workspace marker clear (operator from wrong workspace clears another workspace's order) | Tampering, Elevation | Domain layer filters by `ctx.workspaceId` on every `.eq('workspace_id', ctx.workspaceId)` — Regla 3 |
| Operator forges `order.custom_fields.duplicate_error` via UI to hide a real error | Tampering | N/A — operators don't have a write path to `custom_fields.duplicate_error` other than via the explicit clear action. The badge UI is read-only and the clear action only removes the key. |
| Race: two operators click "Marcar resuelto" concurrently | — | Idempotent — second call is a no-op (key already absent). No correctness issue. |
| PII leak in error message persisted to JSONB | Information disclosure | `attemptedProducts` contains SKU/title/quantity/price — no PII. The Postgres error message could contain a UUID but no contact data. Acceptable. |

## Sources

### Primary (HIGH confidence)

- `src/lib/domain/orders.ts:484-490` — existing INSERT error-check pattern (canonical)
- `src/lib/domain/orders.ts:949-961` — the bug location
- `src/lib/domain/orders.ts:1086-1200` — recompraOrder (verified does NOT have the bug)
- `src/lib/domain/custom-fields.ts:77-87` — canonical read-merge-write JSONB pattern
- `src/lib/automations/action-executor.ts:646-692` — wrapper that throws on `!success`
- `src/inngest/functions/automation-runner.ts:231-322` — error → `actions_log[].error` → `error_message`
- `supabase/migrations/20260129000003_orders_foundation.sql:99-109, 245-248` — schema + trigger
- `src/app/actions/orders.ts:76-88, 505-568` — auth + server-action pattern
- `src/lib/domain/__tests__/conversations.test.ts:12-100` — Vitest mock pattern
- `src/__tests__/integration/orders-cas.test.ts:11-110` — integration test pattern
- `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` — full Kanban card source
- `src/app/(dashboard)/automatizaciones/components/variable-picker.tsx:40-80` — Popover example
- `src/app/(dashboard)/configuracion/whatsapp/quick-replies/components/quick-reply-list.tsx:97-110` — AlertDialog example
- `scripts/debug-doralba-silent-fail.mjs` — 4 failure modes reproduction
- `.env.test.example` — integration test env vars

### Secondary (MEDIUM-HIGH confidence)

- [Supabase Error Codes](https://supabase.com/docs/guides/api/rest/postgrest-error-codes) — PostgrestError shape
- [PostgrestError response handling](https://deepwiki.com/supabase/supabase-js/4.5-response-handling-and-error-management) — JS v2 response semantics
- [PostgreSQL Error Reference 23503](https://www.bytebase.com/reference/postgres/error/23503-foreign-key-violation/) — FK violation code

### Tertiary (LOW — verified via local schema, not authoritative)

- AFTER trigger semantics on failed INSERTs — confirm in integration test (A1 in Assumptions Log)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in package.json + grep
- Architecture: HIGH — exact pattern mirrors existing `updateOrder` + `updateCustomFieldValues`
- UI integration: HIGH — no UI variant detected; Popover + AlertDialog patterns proven in 5+ files
- Tests: HIGH — patterns from 2 existing test files (conversations.test.ts + orders-cas.test.ts)
- Trigger semantics: MEDIUM (A1 in Assumptions Log) — integration test will confirm

**Research date:** 2026-05-26
**Valid until:** 2026-06-25 (30 days — stable codebase, no fast-moving dependencies)
