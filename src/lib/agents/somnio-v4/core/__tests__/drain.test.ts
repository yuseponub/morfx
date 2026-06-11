/**
 * Tests unitarios ADITIVOS de drainPendingAndCombine (D-03 Plan 08).
 *
 * Complemento — NUNCA reemplazo de las suites de paridad (engine-v4-lock,
 * v4-production-runner-restart/pathb, restart-loop). Esas siguen siendo el
 * guardián del comportamiento end-to-end; estos tests fijan las invariantes del
 * helper en aislamiento:
 *   (a) orden cronológico priorMsg-primero en path_a
 *   (b) clearInterrupt llamado SIEMPRE tras readAndClearPending
 *   (c) dropOwnEntry filtra la entry propia (via ctx.ownEntryUuid)
 *   (d) path_b_solo no incluye priorMsg
 *   (e) restartIteration incrementa y shouldRestart=true
 *
 * Mockea los MISMOS specifiers absolutos que el helper importa (Pitfall 8).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { PendingEntry } from '@/lib/agents/interruption-system-v2/pending'

// --- Mocks (specifiers absolutos — Pitfall 8) -----------------------------

const readAndClearPending = vi.fn<[], Promise<PendingEntry[]>>()
const clearInterrupt = vi.fn(async () => {})
vi.mock('@/lib/agents/interruption-system-v2/pending', () => ({
  readAndClearPending: (...args: unknown[]) => readAndClearPending(...(args as [])),
  clearInterrupt: (...args: unknown[]) => clearInterrupt(...(args as [])),
}))

const emitted: Array<{ label: string; payload: Record<string, unknown> }> = []
vi.mock('@/lib/agents/interruption-system-v2/observability', () => ({
  emitLockEvent: (label: string, payload: Record<string, unknown>) => {
    emitted.push({ label, payload })
  },
}))

import { drainPendingAndCombine } from '../drain'
import { createRestartContext } from '../restart-context'

const LOCK_CTX = { workspaceId: 'ws-1', channel: 'whatsapp' as const, identifier: 'id-1' }

function entry(content: string, uuid: string): PendingEntry {
  return { entry_uuid: uuid, content, received_at: '2026-06-10T00:00:00Z' }
}

beforeEach(() => {
  emitted.length = 0
  readAndClearPending.mockReset()
  clearInterrupt.mockReset()
  clearInterrupt.mockResolvedValue(undefined)
})

describe('drainPendingAndCombine — path_a', () => {
  it('(a) combina en orden cronológico: priorMsg PRIMERO, pending APPENDED', async () => {
    readAndClearPending.mockResolvedValue([entry('msg2', 'u2'), entry('msg3', 'u3')])
    const ctx = createRestartContext()

    const res = await drainPendingAndCombine({
      ctx,
      lockCtx: LOCK_CTX,
      atStep: 'ckpt_0_post_acquire',
      priorMsg: 'msg1',
      mode: 'path_a',
    })

    expect(res.pendingCount).toBe(2)
    expect(ctx.effectiveMessage).toBe('msg1\nmsg2\nmsg3')
  })

  it('(b) clearInterrupt SIEMPRE se llama tras readAndClearPending', async () => {
    readAndClearPending.mockResolvedValue([])
    const ctx = createRestartContext()
    // invocationCallOrder para verificar el orden read → clear.
    await drainPendingAndCombine({
      ctx, lockCtx: LOCK_CTX, atStep: 'ckpt_0_post_acquire', priorMsg: 'm', mode: 'path_a',
    })
    expect(readAndClearPending).toHaveBeenCalledTimes(1)
    expect(clearInterrupt).toHaveBeenCalledTimes(1)
    const readOrder = readAndClearPending.mock.invocationCallOrder[0]
    const clearOrder = clearInterrupt.mock.invocationCallOrder[0]
    expect(clearOrder).toBeGreaterThan(readOrder)
  })

  it('(c) dropOwnEntry filtra la entry propia del holder por entry_uuid', async () => {
    readAndClearPending.mockResolvedValue([entry('hola', 'own'), entry('precio', 'u2')])
    // ownPendingEntryJson con entry_uuid = 'own' → debe excluirse.
    const ctx = createRestartContext(JSON.stringify({ entry_uuid: 'own' }))

    await drainPendingAndCombine({
      ctx, lockCtx: LOCK_CTX, atStep: 'ckpt_0_post_acquire', priorMsg: 'hola', mode: 'path_a',
    })

    // La entry propia ('hola'/'own') NO se re-combina consigo misma.
    expect(ctx.effectiveMessage).toBe('hola\nprecio')
    const combined = emitted.find((e) => e.label === 'msg_aborted_path_a_combined')!
    expect(combined.payload.combined_msg_count).toBe(2) // 1 pending superviviente + priorMsg
  })

  it('(e) restartIteration incrementa y shouldRestart=true', async () => {
    readAndClearPending.mockResolvedValue([entry('x', 'u1')])
    const ctx = createRestartContext()
    expect(ctx.restartIteration).toBe(0)

    await drainPendingAndCombine({
      ctx, lockCtx: LOCK_CTX, atStep: 'ckpt_0_post_acquire', priorMsg: 'p', mode: 'path_a',
    })

    expect(ctx.restartIteration).toBe(1)
    expect(ctx.shouldRestart).toBe(true)
  })

  it('emite ambos eventos path_a (combined + pending_list_combined)', async () => {
    readAndClearPending.mockResolvedValue([entry('a', 'u1')])
    const ctx = createRestartContext()
    await drainPendingAndCombine({
      ctx, lockCtx: LOCK_CTX, atStep: 'ckpt_0_post_acquire', priorMsg: 'p', mode: 'path_a',
    })
    expect(emitted.map((e) => e.label)).toEqual([
      'msg_aborted_path_a_combined',
      'pending_list_combined',
    ])
  })
})

describe('drainPendingAndCombine — path_b_solo', () => {
  it('(d) path_b_solo NO incluye priorMsg — solo lo nuevo', async () => {
    readAndClearPending.mockResolvedValue([entry('nuevo1', 'u1'), entry('nuevo2', 'u2')])
    const ctx = createRestartContext()

    await drainPendingAndCombine({
      ctx,
      lockCtx: LOCK_CTX,
      atStep: 'ckpt_7_pre_template_1',
      priorMsg: 'IGNORADO',
      mode: 'path_b_solo',
      pathBEmitExtra: { templates_sent_before_abort: 1 },
    })

    expect(ctx.effectiveMessage).toBe('nuevo1\nnuevo2')
    expect(ctx.effectiveMessage).not.toContain('IGNORADO')
    expect(ctx.shouldRestart).toBe(true)
    expect(ctx.restartIteration).toBe(1)
    const solo = emitted.find((e) => e.label === 'msg_aborted_path_b_solo')!
    expect(solo.payload.templates_sent_before_abort).toBe(1)
  })

  it('path_b_solo con pending VACÍO: emite solo el path_b_solo, NO reinicia', async () => {
    readAndClearPending.mockResolvedValue([])
    const ctx = createRestartContext()
    // El caller resetea shouldRestart=false al tope de cada iteración del while
    // ANTES de llegar al drain (mirror del `while (shouldRestart) { shouldRestart = false; ... }`).
    ctx.shouldRestart = false

    await drainPendingAndCombine({
      ctx,
      lockCtx: LOCK_CTX,
      atStep: 'ckpt_6_pre_send_loop_main',
      priorMsg: 'p',
      mode: 'path_b_solo',
      pathBEmitExtra: { templates_sent_before_abort: 2 },
    })

    expect(emitted.map((e) => e.label)).toEqual(['msg_aborted_path_b_solo'])
    expect(ctx.shouldRestart).toBe(false)
    expect(ctx.restartIteration).toBe(0)
    // clearInterrupt SIEMPRE aunque pending esté vacío (invariante b).
    expect(clearInterrupt).toHaveBeenCalledTimes(1)
  })
})
