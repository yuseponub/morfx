---
plan: 01
title: "Domain fix: capture INSERT error en duplicateOrder + clearOrderDuplicateError helper + DuplicateError type"
phase: crm-duplicate-order-products-integrity
wave: 0
depends_on: []
files_modified:
  - src/lib/orders/types.ts
  - src/lib/domain/orders.ts
autonomous: true
requirements: []
estimated_duration: 45m

must_haves:
  truths:
    - "Cuando el INSERT de order_products falla en duplicateOrder, el error se captura (no se descarta)"
    - "Cuando el INSERT falla, se persiste un marker en orders.custom_fields.duplicate_error con 5 keys (errorCode, errorMessage, failedAt, sourceOrderId, attemptedProducts)"
    - "Cuando el INSERT falla, duplicateOrder retorna { success: false, error: '...errorCode - errorMessage' }"
    - "Cuando el INSERT funciona (happy path), no se escribe ningun marker y se retorna success: true (no regresion)"
    - "recompraOrder permanece intacto (D-pre-04)"
    - "Existe el helper exportado clearOrderDuplicateError(ctx, { orderId }) que borra la key duplicate_error del JSONB de forma idempotente"
  artifacts:
    - path: "src/lib/orders/types.ts"
      provides: "Interface DuplicateError + helper getDuplicateError"
      contains: "export interface DuplicateError"
    - path: "src/lib/domain/orders.ts"
      provides: "duplicateOrder con error capture + clearOrderDuplicateError exportado"
      contains: "export async function clearOrderDuplicateError"
  key_links:
    - from: "src/lib/domain/orders.ts (duplicateOrder)"
      to: "supabase.from('orders').update({ custom_fields: merged })"
      via: "JSONB read-merge-write S-3"
      pattern: "duplicate_error"
    - from: "src/lib/domain/orders.ts (clearOrderDuplicateError)"
      to: "supabase.from('orders').update({ custom_fields: rest })"
      via: "JSONB read-omit-write S-3"
      pattern: "duplicate_error.*\\.\\.\\..*rest"
---

# Plan 01: Domain fix - capture INSERT error + DuplicateError type + clearOrderDuplicateError helper

## Goal

Fix the silent INSERT discard bug at `src/lib/domain/orders.ts:959` by adding the canonical destructure-and-check pattern (same shape as `updateOrder` lines 484-490). On error, persist a `duplicate_error` marker to `orders.custom_fields` via the codebase's standard JSONB read-merge-write pattern and return `{success:false}` so the `executeDuplicateOrder` wrapper throws and `automation_executions.error_message` gets populated. Also add the new domain helper `clearOrderDuplicateError` that the UI server action (Plan 03) will invoke. Adds `DuplicateError` interface + `getDuplicateError` accessor to `src/lib/orders/types.ts` for type-safe consumption by Plan 05's badge.

## Out of scope

- NO modificacion a `recompraOrder` (D-pre-04) — debe quedar intacto.
- NO retry logic (D-02 — fail fast).
- NO rollback de la order destino (D-01 — mantener vacia).
- NO migracion DB nueva (D-pre-06).
- NO feature flag (D-pre-05).
- NO server action ni UI (Plans 03 + 05).
- NO tests (Plans 02 + 04).
- NO `jsonb_set` RPC (codebase tiene cero usos — read-merge-write en JS).

## Tasks

<task id="t1" parallel="false" type="auto">
<name>Task 1: Add DuplicateError interface + getDuplicateError accessor to types.ts</name>
<files>src/lib/orders/types.ts</files>
<read_first>
- src/lib/orders/types.ts (full file, 371 lines — confirmar estructura existente; OrderProduct interface esta en lineas 220-230, Order en lineas 126-147)
- .planning/standalone/crm-duplicate-order-products-integrity/PATTERNS.md §"src/lib/orders/types.ts (MODIFY)"
</read_first>
<action>
1. Abrir `src/lib/orders/types.ts`.

2. INSERTAR despues de la linea 238 (final del bloque OrderProduct + OrderProductFormData) y antes del comentario `// ORDER TAG TYPES` (linea 240) el siguiente bloque:

```typescript
// ============================================================================
// DUPLICATE ERROR MARKER
// Standalone: crm-duplicate-order-products-integrity
// ============================================================================

/**
 * Marker persisted to `orders.custom_fields.duplicate_error` when
 * `duplicateOrder` cannot copy products from source. Surfaced in Kanban badge.
 *
 * D-01 + D-pre-06: keep destination order empty + visible, don't rollback.
 * Shape is stable; if a future consumer needs versioning, add `version: 1` then.
 */
export interface DuplicateError {
  /** PostgreSQL SQLSTATE: '23503' (FK), '23514' (CHECK), '23502' (NOT NULL), etc. */
  errorCode: string
  /** Raw Postgres error message — surfaced verbatim in UI (truncated to 80 chars in Popover) */
  errorMessage: string
  /** ISO timestamp when the failure occurred */
  failedAt: string
  /** Duplicates orders.source_order_id for accessibility in UI without re-fetching */
  sourceOrderId: string
  /** Snapshot of products the source had at the moment of the failed duplication */
  attemptedProducts: Array<{
    sku: string
    title: string
    unit_price: number
    quantity: number
  }>
}

/**
 * Type-safe accessor for the marker. Returns null when absent or malformed.
 * Use in KanbanCard render to gate the badge.
 */
export function getDuplicateError(
  order: { custom_fields: Record<string, unknown> }
): DuplicateError | null {
  const raw = order.custom_fields?.duplicate_error
  if (!raw || typeof raw !== 'object') return null
  // Minimal shape validation — if the marker is present we trust the writer
  const candidate = raw as Partial<DuplicateError>
  if (
    typeof candidate.errorCode !== 'string' ||
    typeof candidate.errorMessage !== 'string' ||
    typeof candidate.failedAt !== 'string' ||
    typeof candidate.sourceOrderId !== 'string' ||
    !Array.isArray(candidate.attemptedProducts)
  ) {
    return null
  }
  return candidate as DuplicateError
}
```

3. NO tocar nada mas del archivo — preservar todo lo existente.
</action>
<acceptance_criteria>
- `grep -n "export interface DuplicateError" src/lib/orders/types.ts` returns exactly 1 hit.
- `grep -n "export function getDuplicateError" src/lib/orders/types.ts` returns exactly 1 hit.
- `grep -c "attemptedProducts" src/lib/orders/types.ts` returns >=1.
- `npx tsc --noEmit` exits 0 (no type errors).
- The existing `OrderProduct` interface (lines 220-230) is UNCHANGED — `git diff src/lib/orders/types.ts | grep "OrderProduct" | grep -v "+++"` returns 0 modification lines.
</acceptance_criteria>
<done>
DuplicateError + getDuplicateError exported and importable from `@/lib/orders/types`. Typecheck passes. No regression to existing types.
</done>
</task>

<task id="t2" parallel="false" type="auto">
<name>Task 2: Fix duplicateOrder error capture (lines 949-961) + persist marker via JSONB read-merge-write</name>
<files>src/lib/domain/orders.ts</files>
<read_first>
- src/lib/domain/orders.ts lines 484-490 (canonical destructure-and-check pattern in updateOrder — pattern A)
- src/lib/domain/orders.ts lines 835-1062 (the full duplicateOrder function — bug at line 959)
- src/lib/domain/orders.ts lines 1086-1215 (recompraOrder — VERIFY NOT MODIFIED at the end)
- src/lib/domain/custom-fields.ts lines 67-87 (canonical JSONB read-merge-write — pattern B)
- .planning/standalone/crm-duplicate-order-products-integrity/PATTERNS.md §"src/lib/domain/orders.ts (MODIFY)"
- .planning/standalone/crm-duplicate-order-products-integrity/RESEARCH.md §"Code Examples"
</read_first>
<action>
1. Abrir `src/lib/domain/orders.ts`.

2. Agregar al import block del top del archivo (donde estan los otros imports de tipos):

```typescript
import type { DuplicateError } from '@/lib/orders/types'
```

(Si ya existe un import desde `@/lib/orders/types`, agregar `DuplicateError` a la lista; si no existe, agregar la linea nueva.)

3. LOCALIZAR el bloque actual (lineas 949-961):

```typescript
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
      }
```

REEMPLAZARLO literalmente con:

```typescript
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
          // Persist marker to orders.custom_fields.duplicate_error (D-01 + D-pre-06).
          // Read-merge-write JSON pattern (canonical: src/lib/domain/custom-fields.ts:67-87).
          // The destination order already exists with sourceOrder.custom_fields cloned (line 906),
          // so we re-read to avoid clobbering any other key. Best-effort: if the marker write
          // itself fails, we log + still return the original productsError (don't shadow it).
          const { data: cur } = await supabase
            .from('orders')
            .select('custom_fields')
            .eq('id', newOrder.id)
            .eq('workspace_id', ctx.workspaceId)
            .single()

          const existing = (cur?.custom_fields as Record<string, unknown>) || {}
          const duplicateError: DuplicateError = {
            errorCode: productsError.code ?? 'unknown',
            errorMessage: productsError.message ?? '',
            failedAt: new Date().toISOString(),
            sourceOrderId: params.sourceOrderId,
            attemptedProducts: sourceProducts.map((p) => ({
              sku: p.sku,
              title: p.title,
              unit_price: p.unit_price,
              quantity: p.quantity,
            })),
          }
          const merged = { ...existing, duplicate_error: duplicateError }

          const { error: markerError } = await supabase
            .from('orders')
            .update({ custom_fields: merged })
            .eq('id', newOrder.id)
            .eq('workspace_id', ctx.workspaceId)

          if (markerError) {
            console.error(
              '[domain/orders.duplicateOrder] failed to persist duplicate_error marker:',
              markerError,
            )
          }

          // Fail-fast (D-02): return success:false so executeDuplicateOrder throws
          // → automation_executions.actions_log[i].status='failed' + error_message populated.
          // NO rollback of newOrder (D-01) — leave visible + empty for operator action.
          return {
            success: false,
            error: `Error al copiar productos al duplicar: ${productsError.code ?? '?'} - ${productsError.message ?? 'unknown'}`,
          }
        }
      }
```

4. Verificar que NO se haya modificado nada mas dentro de `duplicateOrder`:
   - Lineas 835-948 (entrada, lectura source, resolucion target stage, creacion newOrder, fetch contact) intactas.
   - Lineas 963-1062 (set total_value, emit triggers, return) intactas.

5. Verificar que `recompraOrder` (lineas 1086-1215) NO se haya tocado. Confirmacion: `git diff src/lib/domain/orders.ts` debe mostrar cambios SOLO entre las lineas 949 y 961 (mas el import al top).
</action>
<acceptance_criteria>
- `grep -n "const { error: productsError } = await supabase" src/lib/domain/orders.ts` returns exactly 2 hits (existing updateOrder line ~484 + new duplicateOrder block).
- `grep -n "duplicate_error" src/lib/domain/orders.ts` returns >=2 hits (the merged write + the error return message can reference).
- `grep -n "Error al copiar productos al duplicar" src/lib/domain/orders.ts` returns exactly 1 hit.
- `grep -n "import.*DuplicateError.*from '@/lib/orders/types'" src/lib/domain/orders.ts` returns >=1 hit.
- `git diff src/lib/domain/orders.ts -- src/lib/domain/orders.ts | grep -E "^\+.*recompraOrder|^-.*recompraOrder"` returns 0 hits (recompraOrder body unchanged).
- `git diff src/lib/domain/orders.ts | grep -c "^+ "` should show a diff bounded to the duplicateOrder body region (sanity check: total added lines between ~40-55).
- `npx tsc --noEmit` exits 0.
- NO `for (let attempt = 0` y NO `retryWithBackoff` aparece anywhere in the diff (anti-P-1).
- NO `getPlatformConfig` ni `process.env` lookup en el diff (anti-P-2 feature-flag-less).
- NO `await supabase.from('orders').delete()` en el diff dentro de duplicateOrder (anti-rollback per D-01).
</acceptance_criteria>
<done>
duplicateOrder ahora destructura el error del INSERT, persiste marker JSONB, y retorna success:false en caso de fallo. recompraOrder permanece byte-identico. Typecheck pasa.
</done>
</task>

<task id="t3" parallel="false" type="auto">
<name>Task 3: Add clearOrderDuplicateError exported domain helper</name>
<files>src/lib/domain/orders.ts</files>
<read_first>
- src/lib/domain/orders.ts lines 785-823 (deleteOrder skeleton — pattern C en PATTERNS)
- .planning/standalone/crm-duplicate-order-products-integrity/PATTERNS.md §"Shared / Cross-Cutting Patterns" → S-1 + S-3
- .planning/standalone/crm-duplicate-order-products-integrity/RESEARCH.md §"Clear the error key (D-05 manual button)"
</read_first>
<action>
1. Abrir `src/lib/domain/orders.ts`.

2. INSERTAR la nueva funcion al final del archivo (despues de `recompraOrder` que termina ~linea 1215; antes de `addOrderTag` que arranca ~linea 1219 con el comentario `// addOrderTag`):

   Confirmar primero la linea exacta: `grep -n "^// addOrderTag\|^export async function addOrderTag" src/lib/domain/orders.ts` — insertar JUSTO ANTES de ese bloque, conservando una linea en blanco como separador.

3. Bloque a insertar:

```typescript
// ============================================================================
// clearOrderDuplicateError
// Standalone: crm-duplicate-order-products-integrity (D-05 manual button)
// ============================================================================

/**
 * Remove the `duplicate_error` key from `orders.custom_fields` for a given order.
 *
 * Called by the server action triggered by the operator clicking
 * "Marcar resuelto" in the Kanban badge popover (D-05).
 *
 * Idempotent: returns success:true when the key is already absent (no-op write
 * still occurs to keep the call shape uniform, but produces no functional change).
 *
 * Regla 3: filters by workspace_id on read AND write. Returns 'Pedido no encontrado'
 * when the order does not exist in this workspace.
 */
export async function clearOrderDuplicateError(
  ctx: DomainContext,
  params: { orderId: string }
): Promise<DomainResult<{ orderId: string }>> {
  const supabase = createAdminClient()

  try {
    // Read current custom_fields (filtered by workspace — Regla 3)
    const { data: cur, error: readError } = await supabase
      .from('orders')
      .select('custom_fields')
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (readError || !cur) {
      return { success: false, error: 'Pedido no encontrado' }
    }

    const existing = (cur.custom_fields as Record<string, unknown>) || {}

    // Remove the key by destructuring it out (keeps JSONB clean — null would
    // leave a stale null literal that the UI would have to ignore).
    const { duplicate_error: _dropped, ...rest } = existing as Record<string, unknown> & {
      duplicate_error?: unknown
    }
    void _dropped // silence unused-var lint without using @ts-ignore

    // Idempotent write — even if `_dropped` was already undefined, this is a no-op
    // semantically; we keep the write to keep the function shape uniform + bump updated_at.
    const { error: updateError } = await supabase
      .from('orders')
      .update({ custom_fields: rest })
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)

    if (updateError) {
      return { success: false, error: `Error al limpiar marca de error: ${updateError.message}` }
    }

    return { success: true, data: { orderId: params.orderId } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
```

4. Verificar que el archivo siga compilando y que `addOrderTag` (el siguiente export) este intacto.
</action>
<acceptance_criteria>
- `grep -n "^export async function clearOrderDuplicateError" src/lib/domain/orders.ts` returns exactly 1 hit.
- `grep -nA1 "clearOrderDuplicateError" src/lib/domain/orders.ts | grep -c "DomainContext"` returns >=1 (signature uses DomainContext).
- `grep -n "duplicate_error: _dropped" src/lib/domain/orders.ts` returns exactly 1 hit (idempotent destructure).
- `grep -n "addOrderTag" src/lib/domain/orders.ts` returns >=1 hit (next function still exported).
- `npx tsc --noEmit` exits 0.
- NO `.rpc('jsonb_set'` en el diff (anti-S-3).
- NO console.log de objetos completos que puedan filtrar PII (sanity).
</acceptance_criteria>
<done>
clearOrderDuplicateError exportado, sigue S-1 skeleton de deleteOrder + S-3 JSONB pattern. Typecheck pasa. addOrderTag intacto despues.
</done>
</task>

<task id="t4" parallel="false" type="auto">
<name>Task 4: Typecheck + atomic commit Plan 01</name>
<files></files>
<read_first>
- CLAUDE.md §"Commits" + §"Regla 0" (mensaje en espanol, atomico, co-authored)
</read_first>
<action>
1. Correr typecheck final:

```bash
npx tsc --noEmit
```

   Esperado: exit 0. Si falla, fix antes de commit.

2. Sanity grep final — confirmar invariantes de las 3 tareas:

```bash
grep -c "export interface DuplicateError" src/lib/orders/types.ts          # esperado: 1
grep -c "export function getDuplicateError" src/lib/orders/types.ts        # esperado: 1
grep -c "Error al copiar productos al duplicar" src/lib/domain/orders.ts   # esperado: 1
grep -c "^export async function clearOrderDuplicateError" src/lib/domain/orders.ts  # esperado: 1
grep -c "duplicate_error" src/lib/domain/orders.ts                          # esperado: >=2
```

3. Confirmar que `recompraOrder` no aparece en el diff de orders.ts:

```bash
git diff src/lib/domain/orders.ts | grep -E "^[+-].*recompraOrder" | wc -l
```

   Esperado: 0.

4. Commit atomico (mensaje en espanol — Regla 0):

```bash
git add src/lib/orders/types.ts src/lib/domain/orders.ts
git commit -m "$(cat <<'EOF'
fix(crm-duplicate-order-products-integrity-01): capturar error INSERT en duplicateOrder + DuplicateError type + clearOrderDuplicateError helper

- src/lib/orders/types.ts: agregar interface DuplicateError + accessor getDuplicateError (consumido por badge Kanban en Plan 05).
- src/lib/domain/orders.ts:
  - duplicateOrder: destructurar { error } del INSERT order_products (mismo patron que updateOrder linea 484), persistir marker en custom_fields.duplicate_error via JSONB read-merge-write (D-01 + D-pre-06), retornar success:false con codigo Postgres (D-02 fail-fast). NO rollback de la order destino (D-01). NO retry (D-02).
  - clearOrderDuplicateError: helper exportado que borra la key duplicate_error de JSONB de forma idempotente (consumido por server action Plan 03 + UI Plan 05).
- recompraOrder INTACTO (D-pre-04) — diff vacio en su cuerpo.

Bug productivo: Doralba Echavarria 2026-05-25 + audit 52/825 (6.3%) en 60d.
Causa raiz: orders.ts:959 ejecutaba INSERT sin destructurar {error}.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

5. Verificar commit:

```bash
git log -1 --stat
```

   Esperado: 2 archivos modificados (types.ts + orders.ts), sin otros archivos colaterales.
</action>
<acceptance_criteria>
- `npx tsc --noEmit` exits 0.
- `git log -1 --name-only` lista exactamente `src/lib/orders/types.ts` y `src/lib/domain/orders.ts` (no archivos extras).
- `git log -1 --pretty=%s` empieza con `fix(crm-duplicate-order-products-integrity-01):`.
- `git diff HEAD~1 HEAD -- src/lib/domain/orders.ts | grep -E "^[+-].*recompraOrder" | wc -l` returns 0.
</acceptance_criteria>
<done>
Commit atomico creado con typecheck verde, sin tocar recompraOrder. Plan 01 listo para handoff a Wave 1 (Plans 02/03/04 en paralelo).
</done>
</task>

## Commit message

```
fix(crm-duplicate-order-products-integrity-01): capturar error INSERT en duplicateOrder + DuplicateError type + clearOrderDuplicateError helper

[ver Task 4 para mensaje completo]
```
