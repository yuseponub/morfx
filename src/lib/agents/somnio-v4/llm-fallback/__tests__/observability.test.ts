/**
 * Tests del emitter typed-union (RESEARCH Q9 + D-10).
 *
 * Estructura copiada del analogo verbatim
 * `src/lib/agents/interruption-system-v2/__tests__/observability.test.ts`:
 * dual emission (collector.recordEvent + console.log), prefijo [gemini-fallback],
 * 6 labels exhaustivos.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

let collectorPresent = true
const recordEvent = vi.fn()

vi.mock('@/lib/observability', () => ({
  getCollector: () => (collectorPresent ? { recordEvent } : null),
}))

import { emitFallbackEvent, type FallbackEventLabel } from '../observability'
import { __resetBreakers } from '../breaker'

const ALL_LABELS: FallbackEventLabel[] = [
  'fallback_triggered',
  'circuit_opened',
  'circuit_closed',
  'probe_ok',
  'probe_failed',
  'fallback_failed',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let consoleSpy: any

beforeEach(() => {
  collectorPresent = true
  recordEvent.mockClear()
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  __resetBreakers() // Pitfall #3
  consoleSpy.mockRestore()
})

describe('emitFallbackEvent — D-10 (typed 6-label emitter)', () => {
  it('expone exactamente 6 labels en FallbackEventLabel', () => {
    expect(ALL_LABELS).toHaveLength(6)
    expect(new Set(ALL_LABELS).size).toBe(6)
  })

  it('rutea los 6 labels a collector.recordEvent bajo pipeline_decision', () => {
    for (const label of ALL_LABELS) {
      recordEvent.mockClear()
      const payload = { test_label: label, callSite: 'generation' }
      emitFallbackEvent(label, payload)

      expect(recordEvent).toHaveBeenCalledTimes(1)
      expect(recordEvent).toHaveBeenCalledWith('pipeline_decision', label, payload)
    }
  })

  it('dual-emite a console.log con prefijo estable [gemini-fallback]', () => {
    consoleSpy.mockClear()
    const payload = { callSite: 'generation', model: 'claude-haiku-4-5', errorKind: 'saturation' }
    emitFallbackEvent('fallback_triggered', payload)
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalledWith('[gemini-fallback] fallback_triggered', payload)
  })

  it('emite console.log aunque getCollector() retorne null (no-throw)', () => {
    collectorPresent = false
    consoleSpy.mockClear()
    recordEvent.mockClear()

    expect(() => emitFallbackEvent('circuit_closed', { callSite: 'generation' })).not.toThrow()
    expect(recordEvent).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('D-10 strict — label inválido es error de compilación TypeScript', () => {
    // @ts-expect-error - 'not_a_label' no es miembro de FallbackEventLabel
    emitFallbackEvent('not_a_label', {})
    expect(true).toBe(true)
  })
})
