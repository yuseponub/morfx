/**
 * Unit tests for observability.ts (standalone v4-observability-completeness, Plan 01 Task 1).
 *
 * Cubre el helper dual-emission recordV4Event:
 *   - Test 1: label + restart_iteration explícito + category pipeline_decision.
 *   - Test 2: default restart_iteration 0 cuando no se pasa opts.restartIteration.
 *   - Test 3: opts.durationMs viaja como 4º arg a recordEvent.
 *   - Test 4: getCollector() null → no-op vía ?. (no tira).
 *   - Test 5 (Regla 6): un throw en recordEvent NO propaga (no-throw global).
 *
 * Modela interruption-system-v2/__tests__/observability.test.ts: spy de recordEvent
 * + vi.mock('@/lib/observability') con el specifier absoluto (Pitfall 3).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

let collectorPresent = true
let throwOnRecord = false
const recordEvent = vi.fn()

vi.mock('@/lib/observability', () => ({
  getCollector: () =>
    collectorPresent
      ? {
          recordEvent: (...args: unknown[]) => {
            if (throwOnRecord) throw new Error('boom')
            recordEvent(...args)
          },
        }
      : null,
}))

import { recordV4Event } from './observability'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let consoleSpy: any

beforeEach(() => {
  collectorPresent = true
  throwOnRecord = false
  recordEvent.mockClear()
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('recordV4Event — dual-emission no-throw helper (D-03)', () => {
  it('Test 1: emite a recordEvent con category pipeline_decision, label libre y restart_iteration inyectado', () => {
    recordV4Event('engine_error', { stage: 'crm-gate' }, { restartIteration: 2 })

    expect(recordEvent).toHaveBeenCalledTimes(1)
    expect(recordEvent).toHaveBeenCalledWith(
      'pipeline_decision',
      'engine_error',
      expect.objectContaining({ stage: 'crm-gate', restart_iteration: 2 }),
      undefined,
    )
  })

  it('Test 2: sin opts.restartIteration el payload lleva restart_iteration: 0', () => {
    recordV4Event('subloop_completed', { outcome: 'generated' })

    expect(recordEvent).toHaveBeenCalledWith(
      'pipeline_decision',
      'subloop_completed',
      expect.objectContaining({ outcome: 'generated', restart_iteration: 0 }),
      undefined,
    )
  })

  it('Test 3: opts.durationMs se pasa como 4º arg a recordEvent', () => {
    recordV4Event('crm_gate_completed', { fired: true }, { durationMs: 123 })

    expect(recordEvent).toHaveBeenCalledWith(
      'pipeline_decision',
      'crm_gate_completed',
      expect.objectContaining({ fired: true, restart_iteration: 0 }),
      123,
    )
  })

  it('Test 4: si getCollector() retorna null NO tira (no-op vía ?.)', () => {
    collectorPresent = false

    expect(() => recordV4Event('stage_entered', { stage: 'send' })).not.toThrow()
    expect(recordEvent).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('Test 5 (Regla 6): si recordEvent tira, recordV4Event NO propaga la excepción', () => {
    throwOnRecord = true

    expect(() => recordV4Event('engine_error', { stage: 'sub-loop-slot' })).not.toThrow()
  })
})
