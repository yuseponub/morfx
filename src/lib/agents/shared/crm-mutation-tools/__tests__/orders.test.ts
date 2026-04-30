/**
 * Unit tests for order mutation tools (Plan 03 / Wave 2).
 *
 * Coverage (5 tools × multiple paths):
 *   createOrder:
 *     - Test 1: happy path → executed + OrderDetail.
 *     - Test 2: idempotency replay → first executed, second duplicate.
 *     - Test 3: pipeline_not_found → resource_not_found with missing.resource='pipeline'.
 *     - Test 4: stage_not_found → resource_not_found with missing.resource='stage'.
 *     - Test 5: validation_error → validation_error.
 *     - Test 6: unexpected error → status:error.
 *
 *   updateOrder:
 *     - Test 7: resource_not_found short-circuit (no domain.updateOrder call).
 *     - Test 8: happy path → executed + re-hydrated OrderDetail.
 *     - Test 9: validation_error from domain.
 *     - Test 10: unexpected error → status:error.
 *
 *   moveOrderToStage:
 *     - Test 11: resource_not_found short-circuit.
 *     - Test 12: happy path → executed.
 *     - Test 13: stage_changed_concurrently with actualStageId from domain.data.currentStageId.
 *     - Test 14: stage_changed_concurrently with actualStageId === null (refetch failed).
 *     - Test 15: stage_not_found → resource_not_found with missing.resource='stage'.
 *     - Test 16: unexpected error → status:error.
 *
 *   archiveOrder:
 *     - Test 17: resource_not_found short-circuit.
 *     - Test 18: happy path → executed.
 *     - Test 19: idempotent (already archived) → executed.
 *
 *   closeOrder:
 *     - Test 20: resource_not_found short-circuit.
 *     - Test 21: happy path → executed.
 *     - Test 22: idempotent (already closed) → executed.
 *
 * Pitfall 1 (textbook gate): NO retry on stage_changed_concurrently — verbatim propagation.
 * Two-step cast pattern (Pitfall 3 — AI SDK v6).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  createOrderDomainMock,
  updateOrderDomainMock,
  moveOrderToStageDomainMock,
  archiveOrderDomainMock,
  closeOrderDomainMock,
  getOrderByIdMock,
  getIdempotencyRowMock,
  insertIdempotencyRowMock,
  recordEventMock,
} = vi.hoisted(() => ({
  createOrderDomainMock: vi.fn(),
  updateOrderDomainMock: vi.fn(),
  moveOrderToStageDomainMock: vi.fn(),
  archiveOrderDomainMock: vi.fn(),
  closeOrderDomainMock: vi.fn(),
  getOrderByIdMock: vi.fn(),
  getIdempotencyRowMock: vi.fn(),
  insertIdempotencyRowMock: vi.fn(),
  recordEventMock: vi.fn(),
}))

vi.mock('@/lib/domain/orders', () => ({
  createOrder: createOrderDomainMock,
  updateOrder: updateOrderDomainMock,
  moveOrderToStage: moveOrderToStageDomainMock,
  archiveOrder: archiveOrderDomainMock,
  closeOrder: closeOrderDomainMock,
  getOrderById: getOrderByIdMock,
}))

vi.mock('@/lib/domain/crm-mutation-idempotency', () => ({
  getIdempotencyRow: getIdempotencyRowMock,
  insertIdempotencyRow: insertIdempotencyRowMock,
}))

vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: recordEventMock }),
}))

// Import AFTER mocks
import { createCrmMutationTools } from '../index'

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111'
const CTX = { workspaceId: WORKSPACE_ID, invoker: 'test-suite' } as const

const PIPELINE_ID = '22222222-2222-2222-2222-222222222222'
const STAGE_ID = '33333333-3333-3333-3333-333333333333'
const STAGE_EXPECTED_ID = '44444444-4444-4444-4444-444444444444'
const STAGE_ACTUAL_ID = '55555555-5555-5555-5555-555555555555'
const ORDER_ID = '66666666-6666-6666-6666-666666666666'
const CONTACT_ID = '77777777-7777-7777-7777-777777777777'

function buildOrderDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    contactId: CONTACT_ID,
    pipelineId: PIPELINE_ID,
    stageId: STAGE_ID,
    totalValue: 0,
    description: null,
    shippingAddress: null,
    shippingCity: null,
    shippingDepartment: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    closedAt: null,
    items: [],
    ...overrides,
  }
}

beforeEach(() => {
  createOrderDomainMock.mockReset()
  updateOrderDomainMock.mockReset()
  moveOrderToStageDomainMock.mockReset()
  archiveOrderDomainMock.mockReset()
  closeOrderDomainMock.mockReset()
  getOrderByIdMock.mockReset()
  getIdempotencyRowMock.mockReset()
  insertIdempotencyRowMock.mockReset()
  recordEventMock.mockReset()
})

// ============================================================================
// createOrder
// ============================================================================

describe('createOrder — happy path (no idempotency)', () => {
  it('Test 1: returns executed with OrderDetail when domain succeeds', async () => {
    createOrderDomainMock.mockResolvedValueOnce({
      success: true,
      data: { orderId: ORDER_ID, stageId: STAGE_ID },
    })
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.createOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ contactId: CONTACT_ID, pipelineId: PIPELINE_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: { id: ORDER_ID, contactId: CONTACT_ID, pipelineId: PIPELINE_ID },
    })

    expect(createOrderDomainMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID, source: 'tool-handler' }),
      expect.objectContaining({ contactId: CONTACT_ID, pipelineId: PIPELINE_ID }),
    )
    expect(getIdempotencyRowMock).not.toHaveBeenCalled()
  })
})

describe('createOrder — idempotency replay', () => {
  it('Test 2: first call executed, second call same key → duplicate same order id', async () => {
    // First call.
    getIdempotencyRowMock.mockResolvedValueOnce({ success: true, data: null })
    createOrderDomainMock.mockResolvedValueOnce({
      success: true,
      data: { orderId: ORDER_ID, stageId: STAGE_ID },
    })
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    insertIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: { inserted: true },
    })

    // Second call.
    getIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: {
        workspaceId: WORKSPACE_ID,
        toolName: 'createOrder',
        key: 'idem-1',
        resultId: ORDER_ID,
        resultPayload: buildOrderDetail(ORDER_ID),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID, { description: 'fresh' }),
    })

    const tools = createCrmMutationTools(CTX)
    const exec = (
      tools.createOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute

    const first = await exec({ contactId: CONTACT_ID, pipelineId: PIPELINE_ID, idempotencyKey: 'idem-1' })
    expect(first).toMatchObject({ status: 'executed', data: { id: ORDER_ID } })

    const second = await exec({ contactId: CONTACT_ID, pipelineId: PIPELINE_ID, idempotencyKey: 'idem-1' })
    expect(second).toMatchObject({
      status: 'duplicate',
      data: { id: ORDER_ID, description: 'fresh' },
    })

    expect(createOrderDomainMock).toHaveBeenCalledTimes(1)
  })
})

describe('createOrder — pipeline_not_found', () => {
  it('Test 3: domain "Pipeline no encontrado en este workspace" → resource_not_found pipeline', async () => {
    createOrderDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'Pipeline no encontrado en este workspace',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.createOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ contactId: CONTACT_ID, pipelineId: PIPELINE_ID })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: { code: 'pipeline_not_found', missing: { resource: 'pipeline' } },
    })
  })
})

describe('createOrder — stage_not_found', () => {
  it('Test 4: domain "No hay etapas configuradas en el pipeline" → resource_not_found stage', async () => {
    createOrderDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'No hay etapas configuradas en el pipeline',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.createOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ contactId: CONTACT_ID, pipelineId: PIPELINE_ID })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: { code: 'stage_not_found', missing: { resource: 'stage' } },
    })
  })
})

describe('createOrder — validation_error', () => {
  it('Test 5: domain validation message → validation_error', async () => {
    createOrderDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'contactId es requerido',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.createOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ contactId: CONTACT_ID, pipelineId: PIPELINE_ID })

    expect(result).toMatchObject({
      status: 'validation_error',
      error: { code: 'validation_error', message: 'contactId es requerido' },
    })
  })
})

describe('createOrder — unexpected error', () => {
  it('Test 6: domain "db connection lost" → status:error', async () => {
    createOrderDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'db connection lost',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.createOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ contactId: CONTACT_ID, pipelineId: PIPELINE_ID })

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'create_order_failed' },
    })
  })
})

// ============================================================================
// updateOrder
// ============================================================================

describe('updateOrder — resource_not_found', () => {
  it('Test 7: pre-check fails → resource_not_found, domain not called', async () => {
    getOrderByIdMock.mockResolvedValueOnce({ success: true, data: null })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.updateOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, name: 'New name' })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: {
        code: 'order_not_found',
        missing: { resource: 'order', id: ORDER_ID },
      },
    })
    expect(updateOrderDomainMock).not.toHaveBeenCalled()
  })
})

describe('updateOrder — happy path', () => {
  it('Test 8: returns executed with re-hydrated OrderDetail', async () => {
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    updateOrderDomainMock.mockResolvedValueOnce({
      success: true,
      data: { orderId: ORDER_ID },
    })
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID, { description: 'updated' }),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.updateOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, description: 'updated' })

    expect(result).toMatchObject({
      status: 'executed',
      data: { id: ORDER_ID, description: 'updated' },
    })
  })
})

describe('updateOrder — validation_error', () => {
  it('Test 9: domain validation message → validation_error', async () => {
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    updateOrderDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'closingDate invalido',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.updateOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, closingDate: 'not-a-date' })

    expect(result).toMatchObject({
      status: 'validation_error',
      error: { code: 'validation_error', message: 'closingDate invalido' },
    })
  })
})

describe('updateOrder — unexpected error', () => {
  it('Test 10: domain unknown error → status:error', async () => {
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    updateOrderDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'db down',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.updateOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, name: 'foo' })

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'update_order_failed' },
    })
  })
})

// ============================================================================
// moveOrderToStage — Pitfall 1 (CAS propagation)
// ============================================================================

describe('moveOrderToStage — resource_not_found', () => {
  it('Test 11: pre-check fails → resource_not_found order', async () => {
    getOrderByIdMock.mockResolvedValueOnce({ success: true, data: null })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.moveOrderToStage as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, stageId: STAGE_ID })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: { code: 'order_not_found', missing: { resource: 'order', id: ORDER_ID } },
    })
    expect(moveOrderToStageDomainMock).not.toHaveBeenCalled()
  })
})

describe('moveOrderToStage — happy path', () => {
  it('Test 12: domain succeeds → executed with re-hydrated OrderDetail', async () => {
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    moveOrderToStageDomainMock.mockResolvedValueOnce({
      success: true,
      data: { orderId: ORDER_ID, previousStageId: STAGE_ID, newStageId: STAGE_EXPECTED_ID },
    })
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID, { stageId: STAGE_EXPECTED_ID }),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.moveOrderToStage as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, stageId: STAGE_EXPECTED_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: { id: ORDER_ID, stageId: STAGE_EXPECTED_ID },
    })

    // Domain receives newStageId (not stageId) — verify mapping.
    expect(moveOrderToStageDomainMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID }),
      { orderId: ORDER_ID, newStageId: STAGE_EXPECTED_ID },
    )
  })
})

describe('moveOrderToStage — stage_changed_concurrently with currentStageId from domain', () => {
  it('Test 13: domain returns currentStageId → propagates verbatim as actualStageId', async () => {
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    moveOrderToStageDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'stage_changed_concurrently',
      data: { currentStageId: STAGE_ACTUAL_ID },
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.moveOrderToStage as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, stageId: STAGE_EXPECTED_ID })

    expect(result).toMatchObject({
      status: 'stage_changed_concurrently',
      error: {
        code: 'stage_changed_concurrently',
        expectedStageId: STAGE_EXPECTED_ID,
        actualStageId: STAGE_ACTUAL_ID,
      },
    })

    // Pitfall 1 textbook gate: domain.moveOrderToStage called EXACTLY ONCE — no retry.
    expect(moveOrderToStageDomainMock).toHaveBeenCalledTimes(1)

    const failed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_mutation_failed')
    expect(failed?.[2]).toMatchObject({ errorCode: 'stage_changed_concurrently' })
  })
})

describe('moveOrderToStage — stage_changed_concurrently with refetch null', () => {
  it('Test 14: domain returns currentStageId: null → actualStageId === null', async () => {
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    moveOrderToStageDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'stage_changed_concurrently',
      data: { currentStageId: null },
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.moveOrderToStage as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, stageId: STAGE_EXPECTED_ID })

    expect(result).toMatchObject({
      status: 'stage_changed_concurrently',
      error: {
        code: 'stage_changed_concurrently',
        expectedStageId: STAGE_EXPECTED_ID,
        actualStageId: null,
      },
    })
    // Pitfall 1: NO retry.
    expect(moveOrderToStageDomainMock).toHaveBeenCalledTimes(1)
  })
})

describe('moveOrderToStage — stage_not_found', () => {
  it('Test 15: domain "Stage no encontrado" → resource_not_found stage', async () => {
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    moveOrderToStageDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'Stage no encontrado',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.moveOrderToStage as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, stageId: STAGE_EXPECTED_ID })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: {
        code: 'stage_not_found',
        missing: { resource: 'stage', id: STAGE_EXPECTED_ID },
      },
    })
  })
})

describe('moveOrderToStage — unexpected error', () => {
  it('Test 16: domain "db crashed" → status:error', async () => {
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    moveOrderToStageDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'db crashed',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.moveOrderToStage as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, stageId: STAGE_EXPECTED_ID })

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'move_order_failed' },
    })
  })
})

// ============================================================================
// archiveOrder
// ============================================================================

describe('archiveOrder — resource_not_found', () => {
  it('Test 17: pre-check fails → resource_not_found order', async () => {
    getOrderByIdMock.mockResolvedValueOnce({ success: true, data: null })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.archiveOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: { code: 'order_not_found', missing: { resource: 'order', id: ORDER_ID } },
    })
    expect(archiveOrderDomainMock).not.toHaveBeenCalled()
  })
})

describe('archiveOrder — happy path (newly archived)', () => {
  it('Test 18: domain succeeds → executed with re-hydrated archivedAt', async () => {
    const archivedAt = '2026-04-29T12:00:00.000Z'
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    archiveOrderDomainMock.mockResolvedValueOnce({
      success: true,
      data: { orderId: ORDER_ID, archivedAt },
    })
    // Re-hydrate with includeArchived=true so archived row is returned.
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID, { archivedAt }),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.archiveOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: { id: ORDER_ID, archivedAt },
    })
  })
})

describe('archiveOrder — idempotent (already archived)', () => {
  it('Test 19: already-archived returns executed with original archivedAt', async () => {
    const archivedAt = '2026-04-01T00:00:00.000Z'
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID, { archivedAt }),
    })
    archiveOrderDomainMock.mockResolvedValueOnce({
      success: true,
      data: { orderId: ORDER_ID, archivedAt },
    })
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID, { archivedAt }),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.archiveOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: { id: ORDER_ID, archivedAt },
    })
  })
})

// ============================================================================
// closeOrder
// ============================================================================

describe('closeOrder — resource_not_found', () => {
  it('Test 20: pre-check fails → resource_not_found order', async () => {
    getOrderByIdMock.mockResolvedValueOnce({ success: true, data: null })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.closeOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: { code: 'order_not_found', missing: { resource: 'order', id: ORDER_ID } },
    })
    expect(closeOrderDomainMock).not.toHaveBeenCalled()
  })
})

describe('closeOrder — happy path', () => {
  it('Test 21: domain succeeds → executed with closedAt set', async () => {
    const closedAt = '2026-04-29T15:00:00.000Z'
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    closeOrderDomainMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID, { closedAt }),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.closeOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: { id: ORDER_ID, closedAt },
    })
  })
})

describe('closeOrder — idempotent (already closed)', () => {
  it('Test 22: already-closed order returns executed with original closedAt', async () => {
    const closedAt = '2026-04-01T00:00:00.000Z'
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID, { closedAt }),
    })
    closeOrderDomainMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID, { closedAt }),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.closeOrder as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: { id: ORDER_ID, closedAt },
    })
  })
})
