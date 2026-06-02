---
plan: 03
title: "Server action: clearOrderDuplicateError + revalidatePath"
phase: crm-duplicate-order-products-integrity
wave: 1
depends_on: [01]
files_modified:
  - src/app/actions/orders.ts
autonomous: true
requirements: []
estimated_duration: 20m

must_haves:
  truths:
    - "Existe export server action clearOrderDuplicateError(orderId) en src/app/actions/orders.ts"
    - "El server action valida auth via getAuthContext (helper existente, lineas 76-88)"
    - "El server action construye DomainContext con source: 'server-action' y llama al domain helper"
    - "El server action llama revalidatePath('/crm/pedidos') tras success"
    - "El server action retorna ActionResult<{orderId}> shape (canonical)"
    - "El server action NO toca DB directamente — toda mutacion via domain layer (Regla 3)"
  artifacts:
    - path: "src/app/actions/orders.ts"
      provides: "Server action clearOrderDuplicateError invocable desde Client components"
      contains: "export async function clearOrderDuplicateError"
  key_links:
    - from: "src/app/actions/orders.ts (server action)"
      to: "src/lib/domain/orders.ts (domain helper)"
      via: "import { clearOrderDuplicateError as domainClearOrderDuplicateError }"
      pattern: "domainClearOrderDuplicateError\\(ctx,"
    - from: "src/app/actions/orders.ts (after success)"
      to: "Next.js cache invalidation"
      via: "revalidatePath('/crm/pedidos')"
      pattern: "revalidatePath\\('/crm/pedidos'\\)"
---

# Plan 03: Server action clearOrderDuplicateError

## Goal

Agregar el server action `clearOrderDuplicateError(orderId)` en `src/app/actions/orders.ts` siguiendo verbatim el patron del existente `deleteOrder` (lineas 638-651): valida auth via `getAuthContext`, construye `DomainContext` con `source: 'server-action'`, invoca el domain helper agregado en Plan 01, retorna `ActionResult<{orderId}>` shape, y llama `revalidatePath('/crm/pedidos')` para refrescar el Kanban tras success. Este action es consumido por el boton "Marcar resuelto" del UI en Plan 05.

## Out of scope

- NO UI ni componentes (Plan 05).
- NO modificacion al domain layer (eso fue Plan 01).
- NO tests para este server action (el domain helper ya esta cubierto en Plan 02 con mocks; el server action es trivial wrapper — su unica logica nueva es la llamada a getAuthContext + revalidatePath, ya probada implicitamente por los otros server actions del mismo archivo).
- NO validacion zod del orderId con regex UUID custom — `updateOrder` (linea 505 del mismo archivo) no lo hace; el domain layer ya retorna "Pedido no encontrado" si el id es invalido.
- NO `revalidateTag` — el codebase usa solo `revalidatePath` en `src/app/actions/orders.ts` (verificado por grep).

## Tasks

<task id="t1" parallel="false" type="auto">
<name>Task 1: Agregar import + server action en src/app/actions/orders.ts</name>
<files>src/app/actions/orders.ts</files>
<read_first>
- src/app/actions/orders.ts lineas 1-30 (block de imports — para agregar el nuevo)
- src/app/actions/orders.ts lineas 17-26 (existing imports desde @/lib/domain/orders)
- src/app/actions/orders.ts lineas 638-651 (deleteOrder canonical — pattern S-2)
- src/app/actions/orders.ts lineas 76-88 (getAuthContext helper — reusar)
- src/app/actions/orders.ts lineas 65-70 (ActionResult type — reusar)
- .planning/standalone/crm-duplicate-order-products-integrity/PATTERNS.md §"src/app/actions/orders.ts (MODIFY)"
- .planning/standalone/crm-duplicate-order-products-integrity/RESEARCH.md §"Server action pattern"
</read_first>
<action>
1. Abrir `src/app/actions/orders.ts`.

2. LOCALIZAR el import block actual (lineas 17-26):

```typescript
import {
  createOrder as domainCreateOrder,
  updateOrder as domainUpdateOrder,
  moveOrderToStage as domainMoveOrderToStage,
  deleteOrder as domainDeleteOrder,
  addOrderTag as domainAddOrderTag,
  removeOrderTag as domainRemoveOrderTag,
  recompraOrder as domainRecompraOrder,
} from '@/lib/domain/orders'
```

REEMPLAZARLO con (agregando `clearOrderDuplicateError as domainClearOrderDuplicateError`):

```typescript
import {
  createOrder as domainCreateOrder,
  updateOrder as domainUpdateOrder,
  moveOrderToStage as domainMoveOrderToStage,
  deleteOrder as domainDeleteOrder,
  addOrderTag as domainAddOrderTag,
  removeOrderTag as domainRemoveOrderTag,
  recompraOrder as domainRecompraOrder,
  clearOrderDuplicateError as domainClearOrderDuplicateError,
} from '@/lib/domain/orders'
```

3. LOCALIZAR el final del bloque de "Order Delete Operations" — `deleteOrders` termina en linea ~675, antes del comentario `// Recompra — via domain/orders` que arranca ~677.

INSERTAR despues de `deleteOrders` (linea 675) y ANTES del comentario `// Recompra — via domain/orders` (linea 677) el siguiente bloque:

```typescript

// ============================================================================
// Clear Duplicate Error Marker — via domain/orders
// Standalone: crm-duplicate-order-products-integrity (D-05 manual button)
// ============================================================================

/**
 * Clear the duplicate_error marker from an order's custom_fields.
 * Invoked by the "Marcar resuelto" button in the Kanban badge popover.
 * Delegates to domain/orders.clearOrderDuplicateError (idempotent + workspace-filtered).
 */
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

4. NO tocar nada mas del archivo. Verificar que `recompraOrder` server action (lineas ~687-718) sigue intacto al final.
</action>
<acceptance_criteria>
- `grep -n "clearOrderDuplicateError as domainClearOrderDuplicateError" src/app/actions/orders.ts` returns exactly 1 hit (import).
- `grep -n "^export async function clearOrderDuplicateError" src/app/actions/orders.ts` returns exactly 1 hit (server action export).
- `grep -A4 "^export async function clearOrderDuplicateError" src/app/actions/orders.ts | grep -c "getAuthContext"` returns 1 (auth check first).
- `grep -A20 "^export async function clearOrderDuplicateError" src/app/actions/orders.ts | grep -c "revalidatePath.*crm/pedidos"` returns 1.
- `grep -A20 "^export async function clearOrderDuplicateError" src/app/actions/orders.ts | grep -c "source: 'server-action'"` returns 1.
- `grep -c "^export async function recompraOrder" src/app/actions/orders.ts` returns 1 (recompraOrder still exists after our insert).
- `git diff src/app/actions/orders.ts | grep -E "^[+-].*createAdminClient"` returns 0 hits (NO direct DB access from server action — Regla 3).
- `npx tsc --noEmit` exits 0.
</acceptance_criteria>
<done>
Server action agregado siguiendo verbatim el patron de deleteOrder. Import correcto. Auth + DomainContext + domain call + revalidatePath en el orden canonico.
</done>
</task>

<task id="t2" parallel="false" type="auto">
<name>Task 2: Typecheck + correr suite domain para confirmar no-regresion + commit</name>
<files></files>
<read_first>
- (sin nuevos archivos)
</read_first>
<action>
1. Typecheck:

```bash
npx tsc --noEmit
```

   Esperado: exit 0. Si falla, fix.

2. Correr suite del domain layer para confirmar que el server action no rompio nada (los tests de Plan 02 deberian seguir verdes):

```bash
npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts
```

   Esperado: >=11 passing.

3. Sanity grep final:

```bash
grep -c "^export async function clearOrderDuplicateError" src/app/actions/orders.ts   # esperado: 1
grep -c "domainClearOrderDuplicateError" src/app/actions/orders.ts                    # esperado: 2 (import + call)
grep -c "^export async function deleteOrder" src/app/actions/orders.ts                # esperado: 1 (intact)
grep -c "^export async function recompraOrder" src/app/actions/orders.ts              # esperado: 1 (intact)
```

4. Commit atomico:

```bash
git add src/app/actions/orders.ts
git commit -m "$(cat <<'EOF'
feat(crm-duplicate-order-products-integrity-03): server action clearOrderDuplicateError + revalidatePath

Server action invocado por el boton "Marcar resuelto" del Kanban badge (Plan 05).
Sigue verbatim el patron de deleteOrder (mismo archivo, lineas 638-651):
- Valida auth via getAuthContext (Pitfall: Regla 3 + multi-tenant safety)
- Construye DomainContext con source: 'server-action'
- Llama al domain helper agregado en Plan 01 (cero acceso DB directo desde aqui)
- revalidatePath('/crm/pedidos') tras success para refrescar Kanban en el siguiente render
- Retorna ActionResult<{orderId}> shape (canonical en el archivo)

NO modifica deleteOrder, recompraOrder, updateOrder ni ningun otro action existente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

5. Verificar:

```bash
git log -1 --stat
```

   Esperado: 1 archivo modificado (src/app/actions/orders.ts), diff acotado (~25 lineas added: 1 import + ~22 del action).
</action>
<acceptance_criteria>
- `npx tsc --noEmit` exits 0.
- `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts` returns >=11 passing.
- `git log -1 --name-only` lista exactamente `src/app/actions/orders.ts`.
- `git log -1 --pretty=%s` empieza con `feat(crm-duplicate-order-products-integrity-03):`.
- `git diff HEAD~1 HEAD --shortstat` muestra ~25 lineas added, 0-8 deleted (depende de como queda el import block reformat).
</acceptance_criteria>
<done>
Server action listo + typecheck verde + tests del domain siguen verdes. Plan 03 listo para handoff a Plan 05 (UI).
</done>
</task>

## Commit message

```
feat(crm-duplicate-order-products-integrity-03): server action clearOrderDuplicateError + revalidatePath

[ver Task 2 para mensaje completo]
```
