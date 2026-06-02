---
plan: 02
title: "Unit tests: 4 failure modes + happy path + clearOrderDuplicateError idempotency"
phase: crm-duplicate-order-products-integrity
wave: 1
depends_on: [01]
files_modified:
  - src/lib/domain/__tests__/orders-duplicate-products.test.ts
autonomous: true
requirements: []
estimated_duration: 60m

must_haves:
  truths:
    - "duplicateOrder retorna success:false cuando INSERT order_products falla con FK 23503 (product_id)"
    - "duplicateOrder retorna success:false cuando INSERT order_products falla con FK 23503 (order_id race)"
    - "duplicateOrder retorna success:false cuando INSERT order_products falla con CHECK 23514 (quantity)"
    - "duplicateOrder retorna success:false cuando INSERT order_products falla con NOT NULL 23502 (sku)"
    - "En cada fallo, se llama update con custom_fields.duplicate_error conteniendo las 5 keys"
    - "Happy path: INSERT exitoso retorna success:true SIN escribir marker"
    - "clearOrderDuplicateError borra la key duplicate_error del JSONB"
    - "clearOrderDuplicateError es idempotente cuando la key no existe"
    - "Todas las queries a orders filtran por workspace_id (Regla 3)"
  artifacts:
    - path: "src/lib/domain/__tests__/orders-duplicate-products.test.ts"
      provides: "Suite de tests unitarios cubriendo REQ-01..REQ-06 + REQ-08..REQ-10"
      min_tests: 8
      contains: "FK product_id, FK order_id, CHECK quantity, NOT NULL sku, happy path, clearOrderDuplicateError remove, clearOrderDuplicateError idempotent, workspace_id filter"
  key_links:
    - from: "test"
      to: "src/lib/domain/orders.ts → duplicateOrder + clearOrderDuplicateError"
      via: "vi.mock('@/lib/supabase/admin')"
      pattern: "createAdminClient"
---

# Plan 02: Unit tests para duplicateOrder error capture + clearOrderDuplicateError

## Goal

Crear suite de tests unitarios en `src/lib/domain/__tests__/orders-duplicate-products.test.ts` que cubra los 4 modos de fallo experimentalmente confirmados (FK product_id 23503, FK order_id race 23503, CHECK quantity 23514, NOT NULL sku 23502) + happy path sin marker + 2 tests para `clearOrderDuplicateError` (remove existente + idempotente cuando ausente). Mock chain de `createAdminClient` siguiendo S-4 (canonical pattern de `conversations.test.ts`). Cada test FK/CHECK/NOT NULL valida que (a) `result.success === false`, (b) `result.error` incluye el SQLSTATE, (c) `updateMock` fue llamado con `custom_fields.duplicate_error` conteniendo las 5 keys requeridas.

## Out of scope

- NO integration tests con DB real (eso es Plan 04).
- NO tests de UI (Plan 05 + smoke manual Plan 06).
- NO tests para `recompraOrder` ni `updateOrder` (no se modifican aqui — solo si hay regresion, NO esperada).
- NO tests del server action en `src/app/actions/orders.ts` (eso es Plan 03 — el server action ahi es trivial wrapper de la mismo helper que aqui se mockea).

## Tasks

<task id="t1" parallel="false" type="auto">
<name>Task 1: Crear archivo de tests con mock chain setup (S-4 boilerplate)</name>
<files>src/lib/domain/__tests__/orders-duplicate-products.test.ts</files>
<read_first>
- src/lib/domain/__tests__/conversations.test.ts lineas 1-117 (canonical mock chain — pattern S-4)
- src/lib/domain/orders.ts lineas 835-1062 (duplicateOrder despues de fix de Plan 01)
- src/lib/domain/orders.ts (clearOrderDuplicateError — agregado en Plan 01 al final del archivo, antes de addOrderTag)
- .planning/standalone/crm-duplicate-order-products-integrity/PATTERNS.md §"src/lib/domain/__tests__/orders-duplicate-products.test.ts (CREATE)"
- .planning/standalone/crm-duplicate-order-products-integrity/RESEARCH.md §"Test setup + patterns" + §"4 failure modes to cover"
</read_first>
<action>
1. Crear el archivo `src/lib/domain/__tests__/orders-duplicate-products.test.ts` con la siguiente estructura. Empezar con el boilerplate del mock chain y los imports — los `describe` blocks se llenan en Task 2/3/4.

```typescript
// ============================================================================
// Standalone crm-duplicate-order-products-integrity — Plan 02
// Tests unitarios para duplicateOrder error capture + clearOrderDuplicateError.
//
// Cubre:
//   - REQ-01..REQ-05: 4 failure modes (FK product_id, FK order_id race,
//     CHECK quantity, NOT NULL sku) → success:false + marker en custom_fields
//   - REQ-06: happy path → success:true SIN marker
//   - REQ-08..REQ-09: clearOrderDuplicateError remove + idempotente
//   - Regla 3: filtros workspace_id en TODAS las queries de orders
//
// Mock pattern: S-4 (conversations.test.ts canonical) — chain de
// createAdminClient → from → select/insert/update.
//
// CRITICAL: este archivo NO toca DB. Integration test con DB real esta
// en src/__tests__/integration/orders-duplicate-products.test.ts (Plan 04).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase admin client mock --------------------------------------------
// Extiende S-4 con insertMock + updateMock (conversations.test.ts solo necesita select).
// La logica de duplicateOrder lee 'orders' + lee 'order_products' (via join) + inserta
// 'order_products' + actualiza 'orders' (para el marker).

const singleMock = vi.fn()
const insertMock = vi.fn()

// El chain de eq() es recursivo (eq().eq().eq()...). updateMock retorna { eq: eqMock },
// que a su vez retorna { eq: eqMock, single: singleMock }. Esto cubre:
//   - .update({...}).eq('id', x).eq('workspace_id', y)              (sin .single())
//   - .select(...).eq('id', x).eq('workspace_id', y).single()        (con .single())
const eqMock = vi.fn(() => ({ eq: eqMock, single: singleMock }))
const selectMock = vi.fn(() => ({ eq: eqMock }))
const updateMock = vi.fn(() => ({ eq: eqMock }))

// fromMock devuelve el shape segun la tabla (Pitfall: order_products solo expone insert).
const fromMock = vi.fn((_table: string) => ({
  select: selectMock,
  insert: insertMock,
  update: updateMock,
}))

const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

// Importar DESPUES del vi.mock (hoisting de vitest).
import {
  duplicateOrder,
  clearOrderDuplicateError,
} from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'

const ctx: DomainContext = {
  workspaceId: 'ws-test',
  source: 'automation',
  cascadeDepth: 0,
}

// Source order fixture — usado por TODOS los tests de duplicateOrder.
// Es lo que devuelve el primer single() del flow (lectura del source).
const SOURCE_ORDER = {
  id: 'order-src-1',
  workspace_id: 'ws-test',
  contact_id: 'contact-1',
  pipeline_id: 'pipe-src',
  stage_id: 'stage-src',
  name: 'Test Order',
  closing_date: null,
  description: null,
  shipping_address: 'Calle 1',
  shipping_city: 'Bogota',
  shipping_department: 'Cundinamarca',
  carrier: null,
  tracking_number: null,
  custom_fields: {},
  total_value: 119900,
  source_order_id: null,
  order_products: [
    {
      title: '2 X ELIXIR',
      sku: '002',
      unit_price: 119900,
      quantity: 1,
      product_id: 'prod-elixir-2x',
    },
  ],
}

// Helper para resetear y preparar el chain antes de cada test
beforeEach(() => {
  vi.clearAllMocks()
  eqMock.mockImplementation(() => ({ eq: eqMock, single: singleMock }))
  selectMock.mockImplementation(() => ({ eq: eqMock }))
  updateMock.mockImplementation(() => ({ eq: eqMock }))
  fromMock.mockImplementation(() => ({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  }))
  createAdminClientMock.mockImplementation(() => ({ from: fromMock }))
})

// ============================================================================
// HELPERS — armar la secuencia de single() para el happy-path-prefix
// ============================================================================

/**
 * Setup el prefix de mocks que duplicateOrder consume ANTES de hacer el INSERT
 * de order_products. Es el mismo para TODOS los tests (FK/CHECK/NOT NULL/happy).
 *
 * Secuencia de single() calls en orden:
 *   1. SELECT orders WHERE id=sourceOrderId AND workspace_id (lectura source)
 *   2. SELECT pipeline_stages (resolucion de primer stage del target pipeline)
 *      — SOLO si params.targetStageId no viene; con targetStageId='stage-dst' lo saltamos
 *   3. INSERT orders (.select('id').single()) → returns newOrder.id
 *   4. SELECT contacts (lectura para enrichment del trigger) — si copyContact
 *
 * Para mantener tests simples, pasamos targetStageId explicito (saltea step 2).
 */
function primeDuplicateOrderChain(opts: {
  newOrderId?: string
} = {}): void {
  const newOrderId = opts.newOrderId ?? 'order-dst-1'
  singleMock
    .mockResolvedValueOnce({ data: SOURCE_ORDER, error: null }) // 1. source
    .mockResolvedValueOnce({ data: { id: newOrderId }, error: null }) // 2. newOrder insert.select().single()
    .mockResolvedValueOnce({ data: { name: 'Doralba', phone: '+57300', address: null, city: null, department: null }, error: null }) // 3. contact
    .mockResolvedValueOnce({ data: { custom_fields: {} }, error: null }) // 4. re-read newOrder custom_fields para merge
    .mockResolvedValueOnce({ data: { total_value: 0 }, error: null }) // 5. re-read total_value (no usado en branch error, pero defensive)
}

// PLACEHOLDER — describe blocks llenados en Task 2, 3, 4
describe('duplicateOrder — placeholder', () => {
  it('placeholder until Task 2', () => {
    expect(true).toBe(true)
  })
})
```

2. Confirmar que el archivo compile y los mocks puedan importar sin tocar nada de DB real:

```bash
npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts
```

   Esperado: 1 test passing (el placeholder). Si hay errores de tipos o imports, fix antes de seguir.

3. NO commit aun — Task 2/3/4 llenan los describes; el commit final lo hace Task 5.
</action>
<acceptance_criteria>
- File `src/lib/domain/__tests__/orders-duplicate-products.test.ts` exists.
- `grep -c "vi.mock('@/lib/supabase/admin'" src/lib/domain/__tests__/orders-duplicate-products.test.ts` returns >=1.
- `grep -c "primeDuplicateOrderChain" src/lib/domain/__tests__/orders-duplicate-products.test.ts` returns >=1 (helper exists).
- `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts` exits 0 with 1 placeholder test passing.
- `npx tsc --noEmit` exits 0.
</acceptance_criteria>
<done>
Mock chain setup compila + placeholder test pasa. Listo para llenar 4 failure modes en Task 2.
</done>
</task>

<task id="t2" parallel="false" type="auto">
<name>Task 2: 4 failure mode tests + happy-path no-marker</name>
<files>src/lib/domain/__tests__/orders-duplicate-products.test.ts</files>
<read_first>
- src/lib/domain/orders.ts lineas 949-1015 (verbatim del bloque modificado en Plan 01 — para asegurar que los mocks reflejen el orden real de calls)
- scripts/debug-doralba-silent-fail.mjs (referencia experimental de los 4 codigos)
</read_first>
<action>
1. En `src/lib/domain/__tests__/orders-duplicate-products.test.ts`, REEMPLAZAR el bloque PLACEHOLDER con:

```typescript
// ============================================================================
// duplicateOrder — 4 FAILURE MODES (D-pre-02)
// Cada test:
//  - Prepara source via primeDuplicateOrderChain
//  - Inyecta error en insertMock para 'order_products'
//  - Espera success:false + marker escrito con 5 keys
// ============================================================================

describe('duplicateOrder — FK violation product_id (23503)', () => {
  it('returns success:false with code 23503 in error message', async () => {
    primeDuplicateOrderChain()
    insertMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23503',
        message:
          'insert or update on table "order_products" violates foreign key constraint "order_products_product_id_fkey"',
      },
    })

    const result = await duplicateOrder(ctx, {
      sourceOrderId: 'order-src-1',
      targetPipelineId: 'pipe-dst',
      targetStageId: 'stage-dst',
      copyProducts: true,
      copyContact: true,
      copyValue: true,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('23503')
    expect(result.error).toContain('Error al copiar productos al duplicar')
  })

  it('persists marker with all 5 keys to custom_fields.duplicate_error', async () => {
    primeDuplicateOrderChain()
    insertMock.mockResolvedValueOnce({
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint "order_products_product_id_fkey"' },
    })

    await duplicateOrder(ctx, {
      sourceOrderId: 'order-src-1',
      targetPipelineId: 'pipe-dst',
      targetStageId: 'stage-dst',
      copyProducts: true,
    })

    // updateMock se llama con { custom_fields: { duplicate_error: {...} } }
    expect(updateMock).toHaveBeenCalled()
    const lastCallArg = updateMock.mock.calls.find(
      (call) => (call[0] as { custom_fields?: { duplicate_error?: unknown } })?.custom_fields?.duplicate_error
    )?.[0] as { custom_fields: { duplicate_error: Record<string, unknown> } }
    expect(lastCallArg).toBeDefined()
    const marker = lastCallArg.custom_fields.duplicate_error
    expect(marker.errorCode).toBe('23503')
    expect(typeof marker.errorMessage).toBe('string')
    expect(typeof marker.failedAt).toBe('string')
    expect(marker.sourceOrderId).toBe('order-src-1')
    expect(Array.isArray(marker.attemptedProducts)).toBe(true)
    expect((marker.attemptedProducts as unknown[]).length).toBe(1)
  })
})

describe('duplicateOrder — FK violation order_id race (23503)', () => {
  it('returns success:false when order_id was deleted concurrently', async () => {
    primeDuplicateOrderChain()
    insertMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23503',
        message:
          'insert or update on table "order_products" violates foreign key constraint "order_products_order_id_fkey"',
      },
    })

    const result = await duplicateOrder(ctx, {
      sourceOrderId: 'order-src-1',
      targetPipelineId: 'pipe-dst',
      targetStageId: 'stage-dst',
      copyProducts: true,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('23503')
    expect(result.error).toContain('order_products_order_id_fkey')
  })
})

describe('duplicateOrder — CHECK violation quantity > 0 (23514)', () => {
  it('returns success:false with code 23514', async () => {
    primeDuplicateOrderChain()
    insertMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23514',
        message:
          'new row for relation "order_products" violates check constraint "order_products_quantity_check"',
      },
    })

    const result = await duplicateOrder(ctx, {
      sourceOrderId: 'order-src-1',
      targetPipelineId: 'pipe-dst',
      targetStageId: 'stage-dst',
      copyProducts: true,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('23514')
  })
})

describe('duplicateOrder — NOT NULL violation sku (23502)', () => {
  it('returns success:false with code 23502', async () => {
    primeDuplicateOrderChain()
    insertMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23502',
        message:
          'null value in column "sku" of relation "order_products" violates not-null constraint',
      },
    })

    const result = await duplicateOrder(ctx, {
      sourceOrderId: 'order-src-1',
      targetPipelineId: 'pipe-dst',
      targetStageId: 'stage-dst',
      copyProducts: true,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('23502')
  })
})

describe('duplicateOrder — happy path (no marker)', () => {
  it('returns success:true and does NOT write duplicate_error to custom_fields', async () => {
    primeDuplicateOrderChain()
    // INSERT succeeds
    insertMock.mockResolvedValueOnce({ data: [{ id: 'op-1' }], error: null })

    const result = await duplicateOrder(ctx, {
      sourceOrderId: 'order-src-1',
      targetPipelineId: 'pipe-dst',
      targetStageId: 'stage-dst',
      copyProducts: true,
    })

    expect(result.success).toBe(true)
    expect(result.data?.orderId).toBe('order-dst-1')

    // Sanity: ningun update llamado con duplicate_error en el payload.
    const updateCallsWithMarker = updateMock.mock.calls.filter(
      (call) => (call[0] as { custom_fields?: { duplicate_error?: unknown } })?.custom_fields?.duplicate_error
    )
    expect(updateCallsWithMarker.length).toBe(0)
  })
})
```

2. Correr los tests:

```bash
npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts
```

   Esperado: 6 passing (2 del FK product_id + 1 de FK order_id + 1 CHECK + 1 NOT NULL + 1 happy).

3. Si algun test falla porque la cantidad de `singleMock.mockResolvedValueOnce` calls no coincide con el flow real de `duplicateOrder`, ajustar `primeDuplicateOrderChain` para reflejar el orden EXACTO de queries del codigo en Plan 01. Re-leer `src/lib/domain/orders.ts` lineas 835-1015 si hace falta para verificar el orden.
</action>
<acceptance_criteria>
- `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts -t "FK violation product_id"` returns 2 passing.
- `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts -t "FK violation order_id"` returns 1 passing.
- `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts -t "CHECK violation"` returns 1 passing.
- `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts -t "NOT NULL violation"` returns 1 passing.
- `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts -t "happy path"` returns 1 passing.
- Total: at least 6 tests passing, 0 failing.
</acceptance_criteria>
<done>
4 failure modes + happy path cubiertos via mock. Cada test valida codigo SQLSTATE + estructura del marker. Listos los REQ-01..REQ-06.
</done>
</task>

<task id="t3" parallel="false" type="auto">
<name>Task 3: clearOrderDuplicateError tests (remove + idempotent + workspace filter)</name>
<files>src/lib/domain/__tests__/orders-duplicate-products.test.ts</files>
<read_first>
- src/lib/domain/orders.ts (funcion clearOrderDuplicateError agregada en Plan 01 — al final, antes de addOrderTag)
</read_first>
<action>
1. APPEND al final de `src/lib/domain/__tests__/orders-duplicate-products.test.ts`:

```typescript
// ============================================================================
// clearOrderDuplicateError — REQ-08, REQ-09, REQ-10 (workspace filter)
// ============================================================================

describe('clearOrderDuplicateError — remove existing key', () => {
  it('returns success:true and writes custom_fields without duplicate_error', async () => {
    // Read returns custom_fields containing the marker
    singleMock.mockResolvedValueOnce({
      data: {
        custom_fields: {
          some_other_key: 'preserve_me',
          duplicate_error: {
            errorCode: '23503',
            errorMessage: 'fk violation',
            failedAt: '2026-05-25T10:00:00Z',
            sourceOrderId: 'order-src-1',
            attemptedProducts: [],
          },
        },
      },
      error: null,
    })

    const result = await clearOrderDuplicateError(ctx, { orderId: 'order-dst-1' })

    expect(result.success).toBe(true)
    expect(result.data?.orderId).toBe('order-dst-1')

    // Confirmar que update se llamo y NO incluye duplicate_error en el payload
    expect(updateMock).toHaveBeenCalledTimes(1)
    const payload = updateMock.mock.calls[0][0] as { custom_fields: Record<string, unknown> }
    expect(payload.custom_fields).toEqual({ some_other_key: 'preserve_me' })
    expect(payload.custom_fields).not.toHaveProperty('duplicate_error')
  })
})

describe('clearOrderDuplicateError — idempotent on missing key', () => {
  it('returns success:true when custom_fields has no duplicate_error', async () => {
    singleMock.mockResolvedValueOnce({
      data: { custom_fields: { other_key: 'foo' } },
      error: null,
    })

    const result = await clearOrderDuplicateError(ctx, { orderId: 'order-dst-1' })

    expect(result.success).toBe(true)
    expect(updateMock).toHaveBeenCalledTimes(1)
    const payload = updateMock.mock.calls[0][0] as { custom_fields: Record<string, unknown> }
    expect(payload.custom_fields).toEqual({ other_key: 'foo' })
  })

  it('returns success:true when custom_fields is empty object', async () => {
    singleMock.mockResolvedValueOnce({
      data: { custom_fields: {} },
      error: null,
    })

    const result = await clearOrderDuplicateError(ctx, { orderId: 'order-dst-1' })

    expect(result.success).toBe(true)
    expect(updateMock).toHaveBeenCalledTimes(1)
  })
})

describe('clearOrderDuplicateError — not found / wrong workspace', () => {
  it('returns success:false when order does not exist in workspace', async () => {
    singleMock.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'no row' },
    })

    const result = await clearOrderDuplicateError(ctx, { orderId: 'nonexistent' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Pedido no encontrado')
    expect(updateMock).not.toHaveBeenCalled()
  })
})

describe('clearOrderDuplicateError — Regla 3 workspace filter', () => {
  it('filters both read and write by workspace_id (Regla 3)', async () => {
    singleMock.mockResolvedValueOnce({
      data: { custom_fields: { duplicate_error: { errorCode: '23503', errorMessage: 'x', failedAt: 'now', sourceOrderId: 'src', attemptedProducts: [] } } },
      error: null,
    })

    await clearOrderDuplicateError(ctx, { orderId: 'order-dst-1' })

    // Buscar todas las llamadas a eqMock con primer arg 'workspace_id' y valor 'ws-test'
    const workspaceFilterCalls = eqMock.mock.calls.filter(
      (call) => call[0] === 'workspace_id' && call[1] === 'ws-test'
    )
    // Debe haber AL MENOS 2 (una en el read, una en el update)
    expect(workspaceFilterCalls.length).toBeGreaterThanOrEqual(2)
  })
})
```

2. Correr la suite completa:

```bash
npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts
```

   Esperado: total >=11 tests passing (6 de Task 2 + 5 nuevos aqui).
</action>
<acceptance_criteria>
- `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts -t "clearOrderDuplicateError"` returns at least 5 passing (remove + 2 idempotent + not-found + workspace filter).
- Total suite passes: >=11 tests.
- 0 tests failing, 0 tests skipped.
- `npx tsc --noEmit` exits 0.
</acceptance_criteria>
<done>
REQ-08 (remove), REQ-09 (idempotent), REQ-10 (auth/workspace via Regla 3) cubiertos. Suite completa verde.
</done>
</task>

<task id="t4" parallel="false" type="auto">
<name>Task 4: Eliminar placeholder + remove unused exports + commit</name>
<files>src/lib/domain/__tests__/orders-duplicate-products.test.ts</files>
<read_first>
- (sin nuevos archivos — solo limpieza del test file)
</read_first>
<action>
1. Eliminar del archivo `src/lib/domain/__tests__/orders-duplicate-products.test.ts` el bloque PLACEHOLDER que quedo despues de Task 2 (si Task 2 lo reemplazo no hay nada que hacer; si quedo, borrarlo).

2. Confirmar suite full pasa:

```bash
npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts
```

   Esperado: >=11 passing, 0 failing.

3. Correr typecheck final:

```bash
npx tsc --noEmit
```

4. Commit atomico:

```bash
git add src/lib/domain/__tests__/orders-duplicate-products.test.ts
git commit -m "$(cat <<'EOF'
test(crm-duplicate-order-products-integrity-02): unit tests para duplicateOrder error capture + clearOrderDuplicateError

Cubre REQ-01..REQ-06 + REQ-08..REQ-10:
- 4 failure modes via mock (FK product_id 23503, FK order_id race 23503, CHECK quantity 23514, NOT NULL sku 23502)
- Cada failure: valida success:false + marker con 5 keys (errorCode, errorMessage, failedAt, sourceOrderId, attemptedProducts)
- Happy path: success:true + NO marker escrito (no regresion)
- clearOrderDuplicateError: remove key + idempotente cuando ausente + idempotente cuando custom_fields={}
- clearOrderDuplicateError: error 'Pedido no encontrado' cuando order no existe en workspace
- Regla 3: workspace_id filtra en read AND write

Mock chain: S-4 pattern (extension de conversations.test.ts canonical).
Reproduccion experimental de los codigos: scripts/debug-doralba-silent-fail.mjs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

5. Verificar:

```bash
git log -1 --stat
```

   Esperado: 1 archivo nuevo (orders-duplicate-products.test.ts), >=200 lineas added.
</action>
<acceptance_criteria>
- `npx vitest run src/lib/domain/__tests__/orders-duplicate-products.test.ts` returns >=11 passing, 0 failing, 0 skipped.
- `npx tsc --noEmit` exits 0.
- `git log -1 --name-only` lista exactamente el nuevo test file (no archivos colaterales).
- `git log -1 --pretty=%s` empieza con `test(crm-duplicate-order-products-integrity-02):`.
- NO se rompio ningun test pre-existente: correr `npx vitest run src/lib/domain/__tests__/conversations.test.ts` y confirmar que sigue verde.
</acceptance_criteria>
<done>
Suite de 11+ tests pasando, commit atomico. Plan 02 listo.
</done>
</task>

## Commit message

```
test(crm-duplicate-order-products-integrity-02): unit tests para duplicateOrder error capture + clearOrderDuplicateError

[ver Task 4 para mensaje completo]
```
