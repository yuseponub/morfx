/**
 * Tests for engine-adapters/production/crm-writer-adapter.ts
 *
 * Plan 12 Wave 6 — coverage de propose+confirm + error contracts:
 *   - updateOrderShipping happy path (D-12)
 *   - moveOrderToConfirmado happy path (D-10)
 *   - moveOrderToFaltaConfirmar happy path (D-14)
 *   - stage_changed_concurrently propagated VERBATIM (D-06 cross-agent contract,
 *     standalone crm-stage-integrity Plan 02). NO conversion a mensaje generico.
 *   - propose throws → 'propose_failed'
 *   - confirm 'expired' → 'expired_or_dup'
 *   - confirm 'not_found' → 'unknown_status'
 *
 * Mock pattern: vi.hoisted para que las refs sean visibles a las factories de
 * vi.mock (que se hoistean al top antes de inicializar top-level consts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mock proposeAction + confirmAction de @/lib/agents/crm-writer/two-step
// ============================================================================

const { proposeActionMock, confirmActionMock } = vi.hoisted(() => ({
  proposeActionMock: vi.fn(),
  confirmActionMock: vi.fn(),
}))

vi.mock('@/lib/agents/crm-writer/two-step', () => ({
  proposeAction: proposeActionMock,
  confirmAction: confirmActionMock,
}))

// Imports AFTER mocks
import {
  updateOrderShipping,
  moveOrderToConfirmado,
  moveOrderToFaltaConfirmar,
  SOMNIO_PW_CONFIRMATION_AGENT_ID,
} from '../../engine-adapters/production/crm-writer-adapter'
import { PW_CONFIRMATION_STAGES } from '../constants'

// ============================================================================
// Fixtures
// ============================================================================

const WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490' // Somnio
const ORDER_ID = 'order-test-1'
const ACTION_ID = 'action-uuid-1'

const CTX = {
  agentId: SOMNIO_PW_CONFIRMATION_AGENT_ID,
  conversationId: 'conv-test-1',
} as const

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// Happy paths: propose + confirm executed → adapter returns 'executed'
// ============================================================================

describe('crm-writer-adapter — updateOrderShipping happy path (D-12)', () => {
  it('propose succeeds + confirm executed → {status: "executed", actionId}', async () => {
    proposeActionMock.mockResolvedValueOnce({
      status: 'proposed',
      action_id: ACTION_ID,
      tool: 'updateOrder',
      preview: { action: 'update', entity: 'order', after: {} },
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    confirmActionMock.mockResolvedValueOnce({
      status: 'executed',
      output: { orderId: ORDER_ID, updated: true },
    })

    const result = await updateOrderShipping(
      WORKSPACE_ID,
      ORDER_ID,
      {
        shippingAddress: 'Calle 100 #15-20',
        shippingCity: 'Bogota',
        shippingDepartment: 'Cundinamarca',
      },
      CTX,
    )

    expect(result.status).toBe('executed')
    if (result.status === 'executed') {
      expect(result.actionId).toBe(ACTION_ID)
    }
    expect(proposeActionMock).toHaveBeenCalledTimes(1)
    expect(confirmActionMock).toHaveBeenCalledTimes(1)
    // Verify the proposed tool name + input shape
    const proposeCall = proposeActionMock.mock.calls[0]
    expect(proposeCall[1].tool).toBe('updateOrder')
    expect(proposeCall[1].input).toMatchObject({
      orderId: ORDER_ID,
      shippingAddress: 'Calle 100 #15-20',
      shippingCity: 'Bogota',
      shippingDepartment: 'Cundinamarca',
    })
  })
})

describe('crm-writer-adapter — moveOrderToConfirmado happy path (D-10)', () => {
  it('propose+confirm executed → {status: "executed"} y usa CONFIRMADO stage UUID', async () => {
    proposeActionMock.mockResolvedValueOnce({
      status: 'proposed',
      action_id: ACTION_ID,
      tool: 'moveOrderToStage',
      preview: { action: 'move', entity: 'order', after: {} },
      expires_at: new Date().toISOString(),
    })
    confirmActionMock.mockResolvedValueOnce({
      status: 'executed',
      output: { orderId: ORDER_ID, newStageId: PW_CONFIRMATION_STAGES.CONFIRMADO },
    })

    const result = await moveOrderToConfirmado(WORKSPACE_ID, ORDER_ID, CTX)

    expect(result.status).toBe('executed')
    const proposeCall = proposeActionMock.mock.calls[0]
    expect(proposeCall[1].tool).toBe('moveOrderToStage')
    expect(proposeCall[1].input).toEqual({
      orderId: ORDER_ID,
      newStageId: PW_CONFIRMATION_STAGES.CONFIRMADO,
    })
  })
})

describe('crm-writer-adapter — moveOrderToFaltaConfirmar happy path (D-14)', () => {
  it('propose+confirm executed → {status: "executed"} y usa FALTA_CONFIRMAR stage UUID', async () => {
    proposeActionMock.mockResolvedValueOnce({
      status: 'proposed',
      action_id: ACTION_ID,
      tool: 'moveOrderToStage',
      preview: { action: 'move', entity: 'order', after: {} },
      expires_at: new Date().toISOString(),
    })
    confirmActionMock.mockResolvedValueOnce({
      status: 'executed',
      output: { orderId: ORDER_ID, newStageId: PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR },
    })

    const result = await moveOrderToFaltaConfirmar(WORKSPACE_ID, ORDER_ID, CTX)

    expect(result.status).toBe('executed')
    const proposeCall = proposeActionMock.mock.calls[0]
    expect(proposeCall[1].input).toEqual({
      orderId: ORDER_ID,
      newStageId: PW_CONFIRMATION_STAGES.FALTA_CONFIRMAR,
    })
  })
})

// ============================================================================
// D-06 contract: stage_changed_concurrently propagated VERBATIM
// ============================================================================

describe('crm-writer-adapter — D-06 stage_changed_concurrently propagated verbatim', () => {
  it('confirm returns failed/stage_changed_concurrently → adapter returns failed con MISMO error.code (NO conversion a generico)', async () => {
    proposeActionMock.mockResolvedValueOnce({
      status: 'proposed',
      action_id: ACTION_ID,
      tool: 'moveOrderToStage',
      preview: { action: 'move', entity: 'order', after: {} },
      expires_at: new Date().toISOString(),
    })
    confirmActionMock.mockResolvedValueOnce({
      status: 'failed',
      error: {
        code: 'stage_changed_concurrently',
        message: 'order was moved by another source between SELECT and UPDATE',
      },
    })

    const result = await moveOrderToConfirmado(WORKSPACE_ID, ORDER_ID, CTX)

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      // VERBATIM: el error.code DEBE preservarse como 'stage_changed_concurrently'
      // — Plan 11 engine matchea exacto este string para trigger handoff humano
      // (D-21 trigger c). Si el adapter lo convirtiera a 'unknown' o 'generic',
      // el handoff downstream no se dispararia.
      expect(result.error.code).toBe('stage_changed_concurrently')
      expect(result.error.message).toContain('between SELECT and UPDATE')
      expect(result.actionId).toBe(ACTION_ID)
    }
  })
})

// ============================================================================
// Error paths: propose throws / confirm expired / confirm not_found
// ============================================================================

describe('crm-writer-adapter — propose throws → propose_failed', () => {
  it('proposeAction throws (DB unavailable) → adapter returns failed con code="propose_failed"', async () => {
    proposeActionMock.mockRejectedValueOnce(new Error('connection refused'))

    const result = await moveOrderToConfirmado(WORKSPACE_ID, ORDER_ID, CTX)

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error.code).toBe('propose_failed')
      expect(result.error.message).toContain('connection refused')
    }
    // confirm NO debe haber sido invocado si propose fallo
    expect(confirmActionMock).not.toHaveBeenCalled()
  })
})

describe('crm-writer-adapter — confirm expired → expired_or_dup', () => {
  it('confirm returns status="expired" → adapter returns failed con code="expired_or_dup"', async () => {
    proposeActionMock.mockResolvedValueOnce({
      status: 'proposed',
      action_id: ACTION_ID,
      tool: 'moveOrderToStage',
      preview: { action: 'move', entity: 'order', after: {} },
      expires_at: new Date().toISOString(),
    })
    confirmActionMock.mockResolvedValueOnce({ status: 'expired' })

    const result = await moveOrderToConfirmado(WORKSPACE_ID, ORDER_ID, CTX)

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error.code).toBe('expired_or_dup')
    }
  })
})

describe('crm-writer-adapter — confirm not_found → unknown_status', () => {
  it('confirm returns status="not_found" (action_id race) → adapter returns failed con code="unknown_status"', async () => {
    proposeActionMock.mockResolvedValueOnce({
      status: 'proposed',
      action_id: ACTION_ID,
      tool: 'moveOrderToStage',
      preview: { action: 'move', entity: 'order', after: {} },
      expires_at: new Date().toISOString(),
    })
    confirmActionMock.mockResolvedValueOnce({ status: 'not_found' })

    const result = await moveOrderToConfirmado(WORKSPACE_ID, ORDER_ID, CTX)

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.error.code).toBe('unknown_status')
    }
  })
})

// ============================================================================
// Idempotency: confirm 'already_executed' → treated as success
// ============================================================================

describe('crm-writer-adapter — already_executed treated as success (idempotency)', () => {
  it('confirm returns already_executed → adapter returns executed (in-process synchronous safeguard)', async () => {
    proposeActionMock.mockResolvedValueOnce({
      status: 'proposed',
      action_id: ACTION_ID,
      tool: 'moveOrderToStage',
      preview: { action: 'move', entity: 'order', after: {} },
      expires_at: new Date().toISOString(),
    })
    confirmActionMock.mockResolvedValueOnce({
      status: 'already_executed',
      output: { idempotent: true },
    })

    const result = await moveOrderToConfirmado(WORKSPACE_ID, ORDER_ID, CTX)

    expect(result.status).toBe('executed')
    if (result.status === 'executed') {
      expect(result.actionId).toBe(ACTION_ID)
    }
  })
})
