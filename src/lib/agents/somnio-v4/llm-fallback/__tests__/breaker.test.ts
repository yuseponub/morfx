/**
 * Tests de integración del FSM del circuit-breaker via callWithGeminiFallback
 * (RESEARCH Q9 — casos breaker, D-07/D-08).
 *
 * Fake timers (patrón lock.test.ts:258-286): vi.useFakeTimers() en try /
 * vi.useRealTimers() en finally. El cooldown se mide con Date.now() (controlado
 * por fake timers); la closure gemini rechaza síncronamente → el AbortSignal.timeout
 * nunca dispara (no interfiere con los fake timers).
 *
 * Pitfall #3 — __resetBreakers() en afterEach evita leak del module-singleton.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'

const recordEvent = vi.fn()
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent }),
}))

import { callWithGeminiFallback } from '../index'
import { __resetBreakers } from '../breaker'
import { APICallError } from 'ai'

afterEach(() => {
  __resetBreakers()
  recordEvent.mockClear()
  vi.restoreAllMocks()
})

function saturation(): APICallError {
  return new APICallError({
    message: 'This model is currently experiencing high demand',
    url: 'https://generativelanguage.googleapis.com',
    requestBodyValues: {},
    statusCode: 503,
    isRetryable: true,
  })
}

describe('circuit-breaker FSM — open → cooldown → half_open → close/reopen', () => {
  it('abre tras el 1er fallo, salta Gemini durante el cooldown, hace probe tras 30s', async () => {
    vi.useFakeTimers()
    try {
      const geminiSpy = vi.fn(async () => {
        throw saturation()
      })
      const anthropicSpy = vi.fn(async () => ({ ok: true, from: 'anthropic' as const }))

      const call = () =>
        callWithGeminiFallback<{ ok: boolean; from: string }>({
          callSite: 'generation',
          gemini: geminiSpy,
          anthropic: anthropicSpy,
        })

      // 1a llamada: gemini falla (saturación) → abre circuito → fallback a anthropic.
      const r1 = await call()
      expect(geminiSpy).toHaveBeenCalledTimes(1)
      expect(anthropicSpy).toHaveBeenCalledTimes(1)
      expect(r1.from).toBe('anthropic')

      // 2a llamada inmediata (dentro de cooldown): gemini NO se invoca, directo anthropic.
      const r2 = await call()
      expect(geminiSpy).toHaveBeenCalledTimes(1) // sigue en 1 — no se intentó Gemini
      expect(anthropicSpy).toHaveBeenCalledTimes(2)
      expect(r2.from).toBe('anthropic')

      // Avanzar 30s → cooldown vence → estado efectivo = half_open.
      await vi.advanceTimersByTimeAsync(30_000)

      // 3a llamada: probe → gemini SE invoca de nuevo (sigue fallando) → re-abre + fallback.
      const r3 = await call()
      expect(geminiSpy).toHaveBeenCalledTimes(2) // probe intentado
      expect(anthropicSpy).toHaveBeenCalledTimes(3)
      expect(r3.from).toBe('anthropic')
    } finally {
      vi.useRealTimers()
    }
  })

  it('probe OK tras cooldown cierra el circuito y vuelve a usar Gemini', async () => {
    vi.useFakeTimers()
    try {
      let geminiHealthy = false
      const geminiSpy = vi.fn(async () => {
        if (!geminiHealthy) throw saturation()
        return { ok: true, from: 'gemini' as const }
      })
      const anthropicSpy = vi.fn(async () => ({ ok: true, from: 'anthropic' as const }))

      const call = () =>
        callWithGeminiFallback<{ ok: boolean; from: string }>({
          callSite: 'comprehension',
          gemini: geminiSpy,
          anthropic: anthropicSpy,
        })

      // 1a: falla → abre.
      await call()
      expect(geminiSpy).toHaveBeenCalledTimes(1)

      // Gemini se recupera. Avanzar cooldown.
      geminiHealthy = true
      await vi.advanceTimersByTimeAsync(30_000)

      // Probe OK → cierra circuito → resultado de gemini.
      const r2 = await call()
      expect(geminiSpy).toHaveBeenCalledTimes(2)
      expect(r2.from).toBe('gemini')
      expect(anthropicSpy).toHaveBeenCalledTimes(1) // solo la 1a llamada usó anthropic

      // 3a llamada (circuito cerrado): gemini directo, sin anthropic adicional.
      const r3 = await call()
      expect(geminiSpy).toHaveBeenCalledTimes(3)
      expect(r3.from).toBe('gemini')
      expect(anthropicSpy).toHaveBeenCalledTimes(1)

      // Verificar que se emitieron circuit_closed + probe_ok.
      const labels = recordEvent.mock.calls.map((c) => c[1])
      expect(labels).toContain('probe_ok')
      expect(labels).toContain('circuit_closed')
    } finally {
      vi.useRealTimers()
    }
  })
})
