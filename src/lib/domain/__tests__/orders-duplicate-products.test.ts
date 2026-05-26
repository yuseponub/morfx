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
// La logica de duplicateOrder lee 'orders' + lee 'pipelines'/'pipeline_stages' si
// no se pasa targetStageId + inserta 'orders' (newOrder) + lee 'contacts' (si copyContact)
// + inserta 'order_products' + actualiza 'orders' (para el marker en error path) +
// lee 'orders' (re-read total_value) + opcionalmente update 'orders' total_value.

const singleMock = vi.fn()

// El chain de eq() es recursivo (eq().eq().eq()...). updateMock retorna { eq: eqMock },
// que a su vez retorna { eq: eqMock, single: singleMock }. Esto cubre:
//   - .update({...}).eq('id', x).eq('workspace_id', y)              (sin .single())
//   - .select(...).eq('id', x).eq('workspace_id', y).single()        (con .single())
// Explicit return-type annotation needed because eqMock is self-referential and
// TS7022 otherwise complains about implicit `any` in a circular definition.
type EqChain = { eq: typeof eqMock; single: typeof singleMock }
const eqMock: ReturnType<typeof vi.fn> & ((...args: unknown[]) => EqChain) = vi.fn(
  (): EqChain => ({ eq: eqMock, single: singleMock })
) as ReturnType<typeof vi.fn> & ((...args: unknown[]) => EqChain)
const limitMock = vi.fn(() => ({ single: singleMock }))
const orderMock = vi.fn(() => ({ limit: limitMock }))
// selectMock returns a chain that supports BOTH:
//   - .select('*, joins').eq(...).eq(...).single()             (select+eq+single)
//   - .from('pipeline_stages').select('id').eq(...).order(...).limit(1).single()
const selectMock = vi.fn(() => ({
  eq: eqMock,
  single: singleMock,
  order: orderMock,
}))
const updateMock = vi.fn(() => ({ eq: eqMock }))

// insertMock — supports BOTH patterns:
//   - `await supabase.from('order_products').insert([...])` → resolves to { data, error }
//   - `await supabase.from('orders').insert({...}).select('id').single()` → chains to singleMock
//
// We track the "next insert result" via a queue (insertResultQueue). Tests push
// `{ data, error }` for the next `await insert(...)` call. The returned object
// is a thenable (so `await` works) AND has `.select(...).single()` (so the chain
// works for orders INSERT). The chain path consumes singleMock instead of the
// queue, because production code calls .single() on it.
type InsertResult = { data: unknown; error: unknown }
const insertResultQueue: InsertResult[] = []

// IMPORTANT: shifting the queue happens ONLY when the caller does `await insert(...)`
// (i.e. accesses `.then`). If the caller does `.insert(...).select(...).single()`,
// the queue is NOT touched — singleMock handles that path. This means tests only
// push entries for the `order_products` insert, not the `orders` insert.
const insertMock = vi.fn((_payload: unknown) => {
  // Build a thenable that ALSO supports `.select().single()` chaining.
  const thenable: {
    then: (
      onFulfilled: (v: InsertResult) => unknown,
      onRejected?: (err: unknown) => unknown
    ) => Promise<unknown>
    select: (cols?: string) => { single: typeof singleMock; eq: typeof eqMock }
  } = {
    then(onFulfilled, onRejected) {
      // Lazy: only pull from the queue if/when someone actually awaits.
      const directResult = insertResultQueue.shift() ?? { data: null, error: null }
      try {
        return Promise.resolve(onFulfilled(directResult))
      } catch (err) {
        if (onRejected) return Promise.resolve(onRejected(err))
        return Promise.reject(err)
      }
    },
    select: (_cols?: string) => ({ single: singleMock, eq: eqMock }),
  }
  return thenable
})

// fromMock devuelve el shape compuesto (todas las tablas usan select/insert/update).
const fromMock = vi.fn((_table: string) => ({
  select: selectMock,
  insert: insertMock,
  update: updateMock,
}))

const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

// Stub trigger-emitter (used by duplicateOrder happy path) to avoid hitting
// Inngest in tests. The real module attempts an Inngest fetch which 401s without
// the EVENT_KEY env var, polluting test stderr.
vi.mock('@/lib/automations/trigger-emitter', () => ({
  emitOrderCreated: vi.fn(async () => undefined),
  emitOrderStageChanged: vi.fn(async () => undefined),
  emitFieldChanged: vi.fn(async () => undefined),
}))

// Importar DESPUES del vi.mock (hoisting de vitest).
import { duplicateOrder, clearOrderDuplicateError } from '@/lib/domain/orders'
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
  // Drain insertResultQueue without reassigning (preserves module-level reference).
  insertResultQueue.length = 0
  eqMock.mockImplementation(() => ({ eq: eqMock, single: singleMock }))
  limitMock.mockImplementation(() => ({ single: singleMock }))
  orderMock.mockImplementation(() => ({ limit: limitMock }))
  selectMock.mockImplementation(() => ({
    eq: eqMock,
    single: singleMock,
    order: orderMock,
  }))
  updateMock.mockImplementation(() => ({ eq: eqMock }))
  insertMock.mockImplementation((_payload: unknown) => {
    return {
      then(
        onFulfilled: (v: InsertResult) => unknown,
        onRejected?: (err: unknown) => unknown
      ) {
        const directResult = insertResultQueue.shift() ?? { data: null, error: null }
        try {
          return Promise.resolve(onFulfilled(directResult))
        } catch (err) {
          if (onRejected) return Promise.resolve(onRejected(err))
          return Promise.reject(err)
        }
      },
      select: (_cols?: string) => ({ single: singleMock, eq: eqMock }),
    }
  })
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
 * de order_products (cuando targetStageId se pasa explicito).
 *
 * Secuencia de single() calls con targetStageId='stage-dst' y copyContact=true:
 *   1. SELECT orders WHERE id=sourceOrderId AND workspace_id      → SOURCE_ORDER
 *   2. INSERT orders.select('id').single()                         → { id: newOrderId }
 *   3. SELECT contacts WHERE id=contact_id AND workspace_id        → contact data
 *
 * (Despues viene el INSERT de order_products — el llamador inyecta insertResultQueue.push({...}))
 *
 * En el branch de ERROR, despues del INSERT viene:
 *   4. SELECT orders.custom_fields WHERE id=newOrder.id AND workspace_id  → existing CF
 *   (luego update marker, no usa single)
 *
 * En el branch de HAPPY PATH, despues del INSERT viene:
 *   4. SELECT orders.total_value WHERE id=newOrder.id                     → { total_value }
 *   (luego emitOrderCreated mocked)
 */
function primeDuplicateOrderChain(opts: {
  newOrderId?: string
  // si pasamos branch='error', anadimos el 4to single (re-read custom_fields)
  branch?: 'error' | 'happy'
  // opcional: contenido de custom_fields al re-leer para marker
  existingCustomFields?: Record<string, unknown>
  // opcional: total_value en happy path (default 119900)
  finalTotalValue?: number
} = {}): void {
  const newOrderId = opts.newOrderId ?? 'order-dst-1'
  singleMock
    // 1. source order
    .mockResolvedValueOnce({ data: SOURCE_ORDER, error: null })
    // 2. INSERT newOrder.select('id').single()
    .mockResolvedValueOnce({ data: { id: newOrderId }, error: null })
    // 3. contact lookup
    .mockResolvedValueOnce({
      data: {
        name: 'Doralba',
        phone: '+57300',
        address: null,
        city: null,
        department: null,
      },
      error: null,
    })

  if (opts.branch === 'error') {
    // 4. re-read newOrder.custom_fields for marker merge
    singleMock.mockResolvedValueOnce({
      data: { custom_fields: opts.existingCustomFields ?? {} },
      error: null,
    })
  } else if (opts.branch === 'happy') {
    // 4. re-read total_value after products INSERT
    singleMock.mockResolvedValueOnce({
      data: { total_value: opts.finalTotalValue ?? 119900 },
      error: null,
    })
  }
}

// ============================================================================
// duplicateOrder — 4 FAILURE MODES (D-pre-02)
// Cada test:
//  - Prepara source via primeDuplicateOrderChain(branch='error')
//  - Inyecta error en insertMock para 'order_products'
//  - Espera success:false + marker escrito con 5 keys
// ============================================================================

describe('duplicateOrder — FK violation product_id (23503)', () => {
  it('returns success:false with code 23503 in error message', async () => {
    primeDuplicateOrderChain({ branch: 'error' })
    insertResultQueue.push({
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
    primeDuplicateOrderChain({ branch: 'error' })
    insertResultQueue.push({
      data: null,
      error: {
        code: '23503',
        message:
          'violates foreign key constraint "order_products_product_id_fkey"',
      },
    })

    await duplicateOrder(ctx, {
      sourceOrderId: 'order-src-1',
      targetPipelineId: 'pipe-dst',
      targetStageId: 'stage-dst',
      copyProducts: true,
    })

    // updateMock se llama con { custom_fields: { duplicate_error: {...} } }
    expect(updateMock).toHaveBeenCalled()
    const updateCalls = updateMock.mock.calls as unknown as Array<
      [{ custom_fields?: { duplicate_error?: Record<string, unknown> } }]
    >
    const matchedCall = updateCalls.find(
      (call) => call[0]?.custom_fields?.duplicate_error
    )
    expect(matchedCall).toBeDefined()
    const lastCallArg = matchedCall![0] as {
      custom_fields: { duplicate_error: Record<string, unknown> }
    }
    expect(lastCallArg).toBeDefined()
    const marker = lastCallArg.custom_fields.duplicate_error
    expect(marker.errorCode).toBe('23503')
    expect(typeof marker.errorMessage).toBe('string')
    expect(typeof marker.failedAt).toBe('string')
    expect(marker.sourceOrderId).toBe('order-src-1')
    expect(Array.isArray(marker.attemptedProducts)).toBe(true)
    expect((marker.attemptedProducts as unknown[]).length).toBe(1)
    // Sanity: attemptedProducts contains the source product fields
    const firstProduct = (marker.attemptedProducts as Array<Record<string, unknown>>)[0]
    expect(firstProduct.sku).toBe('002')
    expect(firstProduct.title).toBe('2 X ELIXIR')
    expect(firstProduct.unit_price).toBe(119900)
    expect(firstProduct.quantity).toBe(1)
  })
})

describe('duplicateOrder — FK violation order_id race (23503)', () => {
  it('returns success:false when order_id was deleted concurrently', async () => {
    primeDuplicateOrderChain({ branch: 'error' })
    insertResultQueue.push({
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
    primeDuplicateOrderChain({ branch: 'error' })
    insertResultQueue.push({
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
    primeDuplicateOrderChain({ branch: 'error' })
    insertResultQueue.push({
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
    primeDuplicateOrderChain({ branch: 'happy' })
    // INSERT succeeds
    insertResultQueue.push({ data: [{ id: 'op-1' }], error: null })

    const result = await duplicateOrder(ctx, {
      sourceOrderId: 'order-src-1',
      targetPipelineId: 'pipe-dst',
      targetStageId: 'stage-dst',
      copyProducts: true,
    })

    expect(result.success).toBe(true)
    expect(result.data?.orderId).toBe('order-dst-1')

    // Sanity: ningun update llamado con duplicate_error en el payload.
    const updateCallsHappy = updateMock.mock.calls as unknown as Array<
      [{ custom_fields?: { duplicate_error?: unknown } }]
    >
    const updateCallsWithMarker = updateCallsHappy.filter(
      (call) => call[0]?.custom_fields?.duplicate_error
    )
    expect(updateCallsWithMarker.length).toBe(0)
  })
})

// ============================================================================
// clearOrderDuplicateError — REQ-08, REQ-09, REQ-10 (workspace filter)
// ============================================================================

describe('clearOrderDuplicateError — remove existing key', () => {
  it('returns success:true and writes custom_fields without duplicate_error', async () => {
    // Read returns custom_fields containing the marker AND a sibling key
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

    // Confirmar que update se llamo y NO incluye duplicate_error en el payload,
    // pero SI preserva siblings.
    expect(updateMock).toHaveBeenCalledTimes(1)
    const payload = (updateMock.mock.calls as unknown as Array<
      [{ custom_fields: Record<string, unknown> }]
    >)[0][0]
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
    const payload = (updateMock.mock.calls as unknown as Array<
      [{ custom_fields: Record<string, unknown> }]
    >)[0][0]
    expect(payload.custom_fields).toEqual({ other_key: 'foo' })
    expect(payload.custom_fields).not.toHaveProperty('duplicate_error')
  })

  it('returns success:true when custom_fields is empty object', async () => {
    singleMock.mockResolvedValueOnce({
      data: { custom_fields: {} },
      error: null,
    })

    const result = await clearOrderDuplicateError(ctx, { orderId: 'order-dst-1' })

    expect(result.success).toBe(true)
    expect(updateMock).toHaveBeenCalledTimes(1)
    const payload = (updateMock.mock.calls as unknown as Array<
      [{ custom_fields: Record<string, unknown> }]
    >)[0][0]
    expect(payload.custom_fields).toEqual({})
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
      data: {
        custom_fields: {
          duplicate_error: {
            errorCode: '23503',
            errorMessage: 'x',
            failedAt: 'now',
            sourceOrderId: 'src',
            attemptedProducts: [],
          },
        },
      },
      error: null,
    })

    await clearOrderDuplicateError(ctx, { orderId: 'order-dst-1' })

    // Buscar todas las llamadas a eqMock con primer arg 'workspace_id' y valor 'ws-test'.
    // Debe haber AL MENOS 2: una en el SELECT (read) y otra en el UPDATE (write).
    const eqCalls = eqMock.mock.calls as unknown as Array<[string, unknown]>
    const workspaceFilterCalls = eqCalls.filter(
      (call) => call[0] === 'workspace_id' && call[1] === 'ws-test'
    )
    expect(workspaceFilterCalls.length).toBeGreaterThanOrEqual(2)
  })
})
