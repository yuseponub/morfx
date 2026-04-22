/**
 * Unit test — handleMoveResult pure function.
 *
 * Pure-function test (no UI rendering). Runs under default Node env (BLOCKER 4
 * fix in vitest.config.ts). Imports the exported helper directly from
 * kanban-board.tsx to get a real regression signal (WARNING 4 — no placeholder).
 *
 * Standalone crm-stage-integrity Plan 05, D-15, D-25.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handleMoveResult,
  type MoveOrderResult,
  type HandleMoveResultCtx,
} from '@/app/(dashboard)/crm/pedidos/components/kanban-board'

function buildCtx(
  overrides: Partial<HandleMoveResultCtx> = {},
): HandleMoveResultCtx {
  const ordersByStage = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'stage-A': [{ id: 'order-1', name: 'Test', stage_id: 'stage-A' }] as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'stage-B': [] as any,
  }
  return {
    orderId: 'order-1',
    originalStageId: 'stage-A',
    setLocalOrdersByStage: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ordersByStage: ordersByStage as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentMoveRef: { current: true } as any,
    toast: { error: vi.fn() },
    ...overrides,
  }
}

describe('handleMoveResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('success result → NO rollback, NO toast, NO ref release', () => {
    const ctx = buildCtx()
    const result: MoveOrderResult = { success: true }

    handleMoveResult(result, ctx)

    expect(ctx.setLocalOrdersByStage).not.toHaveBeenCalled()
    expect(ctx.toast.error).not.toHaveBeenCalled()
    expect(ctx.recentMoveRef.current).toBe(true)
  })

  it('stage_changed_concurrently error → rollback + toast "movido por otra fuente" + release ref', () => {
    const ctx = buildCtx()
    const result: MoveOrderResult = {
      error: 'stage_changed_concurrently',
      data: { currentStageId: 'stage-C' },
    }

    handleMoveResult(result, ctx)

    // Rollback: called once with the original ordersByStage
    expect(ctx.setLocalOrdersByStage).toHaveBeenCalledTimes(1)
    expect(ctx.setLocalOrdersByStage).toHaveBeenCalledWith(ctx.ordersByStage)

    // Toast with the exact CAS-reject message (D-15)
    expect(ctx.toast.error).toHaveBeenCalledTimes(1)
    expect(ctx.toast.error).toHaveBeenCalledWith(
      expect.stringContaining('movido por otra fuente'),
    )

    // Echo suppression released so Realtime can deliver truth-state
    expect(ctx.recentMoveRef.current).toBe(false)
  })

  it('generic error → rollback + toast con error string + NO ref release', () => {
    const ctx = buildCtx()
    const result: MoveOrderResult = { error: 'Pedido no encontrado' }

    handleMoveResult(result, ctx)

    expect(ctx.setLocalOrdersByStage).toHaveBeenCalledWith(ctx.ordersByStage)
    expect(ctx.toast.error).toHaveBeenCalledWith('Pedido no encontrado')
    // Generic errors do NOT release the ref — only CAS reject does (D-15)
    expect(ctx.recentMoveRef.current).toBe(true)
  })

  it('error result sin error string → fallback toast "Error al mover el pedido"', () => {
    const ctx = buildCtx()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: MoveOrderResult = { error: undefined as any }

    handleMoveResult(result, ctx)

    expect(ctx.toast.error).toHaveBeenCalledWith('Error al mover el pedido')
  })
})
