---
phase: crm-duplicate-order-products-integrity
plan: "03"
subsystem: app/actions/orders
tags: [server-action, domain-wrapper, revalidate-path, wave-1]
one_liner: "Server action clearOrderDuplicateError wraps domain helper + revalidatePath('/crm/pedidos') — Kanban refresh after marker cleared"
status: complete
completed_at: 2026-05-26
duration_minutes: 12
tasks_completed: 2
tasks_total: 2
files_created: 0
files_modified: 1
commits: [160fb31a]

dependency_graph:
  requires:
    - "Plan 01: domain helper clearOrderDuplicateError(ctx, {orderId}) (consumed via import alias)"
  provides:
    - "Server action clearOrderDuplicateError(orderId): ActionResult<{orderId}> — consumed by Plan 05 UI button"
  affects:
    - "src/app/actions/orders.ts (single file, +28 lines insertion, NO deletions, NO renames)"

tech_stack:
  added: []
  patterns:
    - "S-2 Server action canonical (deleteOrder skeleton — verbatim mirror)"
    - "Domain wrapper pattern: getAuthContext → DomainContext{source:'server-action'} → domain call → revalidatePath"
    - "Import alias for namespace collision (domainClearOrderDuplicateError vs server action name)"
    - "Regla 3 conformance: NO createAdminClient in server action — all mutation via @/lib/domain/*"

key_files:
  created: []
  modified:
    - path: src/app/actions/orders.ts
      change: "Added `clearOrderDuplicateError as domainClearOrderDuplicateError` to import block from @/lib/domain/orders (line 25). Added new section 'Clear Duplicate Error Marker — via domain/orders' with `export async function clearOrderDuplicateError(orderId)` between deleteOrders (line 675) and Recompra section (line 706). +28 lines total. NO modifications to deleteOrder, deleteOrders, recompraOrder, updateOrder, or any other existing action."

decisions:
  - "Mirror deleteOrder pattern verbatim (lines 638-651): getAuthContext → DomainContext → domain call → if !success return error → revalidatePath → return success"
  - "Import alias `domainClearOrderDuplicateError` mandatory to avoid namespace collision with server action's exported name `clearOrderDuplicateError` (Pitfall from plan)"
  - "No Zod validation on orderId — domain helper returns 'Pedido no encontrado' if invalid (matches updateOrder pattern, line 505)"
  - "revalidatePath('/crm/pedidos') (NOT revalidateTag) — codebase uses revalidatePath consistently in this file"
  - "ActionResult<{orderId}> return shape canonical — matches recompraOrder shape for orderId-returning actions"
  - "source: 'server-action' in DomainContext — matches deleteOrder canonical source for server-action-originated mutations"

metrics:
  duration: 12m
  completed: 2026-05-26
  task_count: 2
  file_count: 1
---

# Phase crm-duplicate-order-products-integrity Plan 03: Server action clearOrderDuplicateError

## Summary

Server action wrapper invocable desde Client Components (Plan 05 UI badge) que limpia el marker `duplicate_error` de `orders.custom_fields` via el domain helper agregado en Plan 01. Sigue verbatim el patron de `deleteOrder` (mismo archivo, lineas 638-651): valida auth, construye `DomainContext` con `source: 'server-action'`, delega al domain layer, llama `revalidatePath('/crm/pedidos')` tras success para refrescar el Kanban, y retorna `ActionResult<{orderId}>`. Zero acceso directo a Supabase (Regla 3 conformance).

## Tasks completed

| Task | Name                                                              | Commit     | Files                                |
| ---- | ----------------------------------------------------------------- | ---------- | ------------------------------------ |
| 1    | Agregar import + server action en src/app/actions/orders.ts       | (squashed) | src/app/actions/orders.ts            |
| 2    | Typecheck + correr suite domain + commit                          | 160fb31a   | src/app/actions/orders.ts            |

(Tasks 1 y 2 commitearon juntos via el unico commit `160fb31a` — el plan describe Task 1 como edicion atomica del archivo y Task 2 como verificacion+commit del mismo conjunto de cambios.)

## Acceptance criteria — todos PASS

### Task 1 ACs (post-edit grep gates)

| AC | Check | Resultado |
|----|-------|-----------|
| 1  | `grep -n "clearOrderDuplicateError as domainClearOrderDuplicateError" src/app/actions/orders.ts` | 1 hit (line 25) |
| 2  | `grep -n "^export async function clearOrderDuplicateError" src/app/actions/orders.ts` | 1 hit (line 688) |
| 3  | `grep -A4 "^export async function clearOrderDuplicateError" .. \| grep -c "getAuthContext"` | 1 (auth first) |
| 4  | `grep -A20 ... \| grep -c "revalidatePath.*crm/pedidos"` | 1 |
| 5  | `grep -A20 ... \| grep -c "source: 'server-action'"` | 1 |
| 6  | `grep -c "^export async function recompraOrder" src/app/actions/orders.ts` | 1 (intact) |
| 7  | `git diff src/app/actions/orders.ts \| grep -E "^[+-].*createAdminClient" \| wc -l` | 0 (Regla 3 OK) |

### Task 2 ACs (typecheck + tests + commit)

| AC | Check | Resultado |
|----|-------|-----------|
| 1  | `npx tsc --noEmit` exit code | 21 lines pre-existing baseline (zero new errors in `src/app/actions/orders.ts`) |
| 2  | `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts` | 11/11 passing |
| 3  | `git log -1 --name-only` lista exactamente `src/app/actions/orders.ts` | YES |
| 4  | `git log -1 --pretty=%s` empieza con `feat(crm-duplicate-order-products-integrity-03):` | YES |
| 5  | `git diff HEAD~1 HEAD --shortstat` ~25 added | 28 added, 0 deleted (within range) |

## Typecheck baseline

`npx tsc --noEmit` retorna 21 lineas de errores PRE-EXISTENTES (no introducidos por este plan):
- 4 errores en `.next/dev/types/validator.ts` (Next.js generated file)
- 2 errores `eqMock implicit any` en `src/lib/domain/__tests__/conversations.test.ts`
- 2 errores `eqMock implicit any` en `src/lib/domain/__tests__/orders-duplicate-products.test.ts`
- 5 errores en `orders-duplicate-products.test.ts` por tuple type narrowing (`undefined` cast, tuple length 0 access)

Stash-toggle baseline confirmado:
- `git stash && npx tsc --noEmit 2>&1 | wc -l` → 21 lineas
- `git stash pop && npx tsc --noEmit 2>&1 | wc -l` → 21 lineas

Estos errores son OUT OF SCOPE para Plan 03 (Rule 4 — pre-existing, no introducidos por nuestro cambio). El `grep -E "src/app/actions/orders.ts"` en el output de tsc retorna 0 hits.

## Domain test suite — green

```
✓ src/lib/domain/__tests__/orders-duplicate-products.test.ts  (11 tests) 9ms
Test Files  1 passed (1)
Tests       11 passed (11)
Duration    12.45s
```

Los 11 tests de Plan 02 siguen verdes — el server action no rompio el contrato del domain helper.

## Deviations from Plan

None — plan executed exactly as written.

- Edicion verbatim del import block (Task 1 step 2)
- Insercion verbatim del nuevo bloque entre `deleteOrders` (line 675) y comentario "Recompra" (line 677 pre-edit, ahora 706 post-edit)
- Tasks 1 y 2 commitearon en un solo commit atomico (`160fb31a`) — el plan describe Task 1 como editar el archivo y Task 2 como typecheck+tests+commit del mismo conjunto de cambios; el plan no exige commits separados por task

## Auth gates / blockers

None.

## Threat Flags

None — el server action no introduce nueva superficie de seguridad:
- Auth gate via `getAuthContext` (cookie-based, mismo patron que TODOS los server actions del archivo)
- Workspace isolation via `DomainContext.workspaceId` (resuelto en el helper, no del input)
- `orderId` viaja como string a domain layer; domain helper filtra por workspace_id en read AND write (Plan 01)
- No nueva ruta HTTP — server actions usan POST automatico de Next.js con CSRF protection built-in

## Known Stubs

None.

## Regla 3 conformance check

```
git diff src/app/actions/orders.ts | grep -E "^[+-].*createAdminClient" | wc -l
> 0
```

El server action NO importa `createAdminClient` ni `@supabase/supabase-js`. Toda mutacion DB pasa por el domain helper agregado en Plan 01 (que SI usa `createAdminClient` pero filtra por workspace_id en read AND write).

## Self-Check: PASSED

- File `src/app/actions/orders.ts` exists and contains `export async function clearOrderDuplicateError` at line 688 (verified via grep).
- Commit `160fb31a` exists in git log: `git log --oneline -1 160fb31a` → `160fb31a feat(crm-duplicate-order-products-integrity-03): server action clearOrderDuplicateError + revalidatePath`
- Tests 11/11 verdes
- Typecheck no introduce nuevos errores
