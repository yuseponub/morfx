/**
 * Tests del orquestador callWithGeminiFallback (RESEARCH Q9 — casos index).
 *
 * Cubre: saturación → fallback + fallback_triggered; NoObjectGeneratedError →
 * re-throw SIN anthropic (Pitfall #4); gemini OK → sin anthropic; doble fallo →
 * fallback_failed + sentinel llm_providers_down: + correo CRÍTICO (Plan 03).
 * Billing → llm_credits_depleted + correo NORMAL; schema-cap → evento ruidoso.
 *
 * Closures gemini/anthropic = vi.fn() (funciones puras; MockLanguageModelV3 se usa
 * en parity tests de Wave 2, no aquí).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

// ─── Mocks declarados ANTES de cualquier import del código bajo test ───────────

const recordEvent = vi.fn()

vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent, workspaceId: 'ws-test' }),
}))

const sendLLMCreditsDepletedAlertSpy = vi.fn().mockResolvedValue(undefined)
const sendBothProvidersDownAlertSpy = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/agents/_shared/alerts', () => ({
  sendLLMCreditsDepletedAlert: sendLLMCreditsDepletedAlertSpy,
  sendBothProvidersDownAlert: sendBothProvidersDownAlertSpy,
}))

// ─── Imports del código bajo test ─────────────────────────────────────────────

import { callWithGeminiFallback, PROVIDERS_DOWN_SENTINEL } from '../index'
import { __resetBreakers } from '../breaker'
import { APICallError, NoObjectGeneratedError } from 'ai'

// ─── Helpers ─────────────────────────────────────────────────────────────────

afterEach(() => {
  __resetBreakers()
  recordEvent.mockClear()
  sendLLMCreditsDepletedAlertSpy.mockClear()
  sendBothProvidersDownAlertSpy.mockClear()
})

/** Microtask flush: permite que los void fire-and-forget completen antes de assertar spies. */
const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0))

function saturation(): APICallError {
  return new APICallError({
    message: 'This model is currently experiencing high demand',
    url: 'https://generativelanguage.googleapis.com',
    requestBodyValues: {},
    statusCode: 503,
    isRetryable: true,
  })
}

function billingError(): APICallError {
  return new APICallError({
    message: 'Your prepayment credits are depleted. Please add credits to continue.',
    url: 'https://generativelanguage.googleapis.com',
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: false,
  })
}

function schemaCapError(): APICallError {
  return new APICallError({
    message: 'Schemas contains too many parameters with union types (17 parameters exceed the limit)',
    url: 'https://generativelanguage.googleapis.com',
    requestBodyValues: {},
    statusCode: 400,
    isRetryable: false,
  })
}

function parseError(): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    message: 'No object generated: response did not match schema',
    text: '{ broken',
    response: { id: 'r', timestamp: new Date(), modelId: 'gemini-2.5-flash' },
    usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
    finishReason: 'stop',
  })
}

// ─── Suite principal ──────────────────────────────────────────────────────────

describe('callWithGeminiFallback — orquestación', () => {
  it('saturación (APICallError 503 "high demand") → fallback a anthropic + fallback_triggered', async () => {
    const geminiSpy = vi.fn(async () => {
      throw saturation()
    })
    const anthropicSpy = vi.fn(async () => ({ from: 'anthropic' as const }))

    const result = await callWithGeminiFallback<{ from: string }>({
      callSite: 'generation',
      gemini: geminiSpy,
      anthropic: anthropicSpy,
    })

    expect(result.from).toBe('anthropic')
    expect(anthropicSpy).toHaveBeenCalledTimes(1)
    const labels = recordEvent.mock.calls.map((c) => c[1])
    expect(labels).toContain('fallback_triggered')
    expect(labels).toContain('circuit_opened')
  })

  it('Pitfall #4 — NoObjectGeneratedError re-throws SIN llamar anthropic', async () => {
    const geminiSpy = vi.fn(async () => {
      throw parseError()
    })
    const anthropicSpy = vi.fn(async () => ({ from: 'anthropic' as const }))

    await expect(
      callWithGeminiFallback<{ from: string }>({
        callSite: 'generation',
        gemini: geminiSpy,
        anthropic: anthropicSpy,
      }),
    ).rejects.toBeInstanceOf(NoObjectGeneratedError)

    expect(anthropicSpy).not.toHaveBeenCalled()
    const labels = recordEvent.mock.calls.map((c) => c[1])
    expect(labels).not.toContain('fallback_triggered')
  })

  it('M-01 — el closure anthropic recibe un AbortSignal FRESCO (no el de Gemini)', async () => {
    let geminiSignal: AbortSignal | undefined
    let anthropicSignal: AbortSignal | undefined
    const geminiSpy = vi.fn(async (signal: AbortSignal) => {
      geminiSignal = signal
      throw saturation()
    })
    const anthropicSpy = vi.fn(async (signal: AbortSignal) => {
      anthropicSignal = signal
      return { from: 'anthropic' as const }
    })

    await callWithGeminiFallback<{ from: string }>({
      callSite: 'comprehension',
      gemini: geminiSpy,
      anthropic: anthropicSpy,
    })

    expect(anthropicSignal).toBeInstanceOf(AbortSignal)
    // Signal FRESCO: NO es el mismo objeto que el de Gemini (que pudo ya vencer).
    expect(anthropicSignal).not.toBe(geminiSignal)
  })

  it('gemini OK (closed) → resultado de gemini SIN llamar anthropic', async () => {
    const geminiSpy = vi.fn(async () => ({ from: 'gemini' as const }))
    const anthropicSpy = vi.fn(async () => ({ from: 'anthropic' as const }))

    const result = await callWithGeminiFallback<{ from: string }>({
      callSite: 'compliance',
      gemini: geminiSpy,
      anthropic: anthropicSpy,
    })

    expect(result.from).toBe('gemini')
    expect(anthropicSpy).not.toHaveBeenCalled()
  })

  it('Pitfall #8 — doble fallo: emite fallback_failed + lanza sentinel llm_providers_down:', async () => {
    const geminiSpy = vi.fn(async () => {
      throw saturation()
    })
    const anthropicErr = new Error('anthropic 529 overloaded')
    anthropicErr.name = 'AnthropicError'
    const anthropicSpy = vi.fn(async () => {
      throw anthropicErr
    })

    // El sentinel reemplaza al anthropicErr original (D-06 — Plan 04 lo detecta).
    await expect(
      callWithGeminiFallback<{ from: string }>({
        callSite: 'vision',
        gemini: geminiSpy,
        anthropic: anthropicSpy,
      }),
    ).rejects.toThrow(/llm_providers_down:/)

    expect(anthropicSpy).toHaveBeenCalledTimes(1)
    const failedCall = recordEvent.mock.calls.find((c) => c[1] === 'fallback_failed')
    expect(failedCall).toBeDefined()
    expect(failedCall?.[2]).toMatchObject({
      callSite: 'vision',
      anthropic_error: 'AnthropicError',
    })
  })

  it('M-02 — circuito OPEN + Haiku falla → emite fallback_failed (gemini_error=circuit_open) + sentinel', async () => {
    // 1) Primera llamada: Gemini saturado abre el circuito.
    const geminiSat = vi.fn(async () => {
      throw saturation()
    })
    const anthropicOk = vi.fn(async () => ({ from: 'anthropic' as const }))
    await callWithGeminiFallback<{ from: string }>({
      callSite: 'comprehension',
      gemini: geminiSat,
      anthropic: anthropicOk,
    })
    recordEvent.mockClear()

    // 2) Segunda llamada dentro del cooldown: state='open' → salta Gemini, va directo a
    //    Haiku. Si Haiku falla, emite fallback_failed + lanza sentinel.
    const anthropicErr = new Error('anthropic 529 overloaded')
    anthropicErr.name = 'AnthropicError'
    const geminiSpy = vi.fn(async () => ({ from: 'gemini' as const }))
    const anthropicFail = vi.fn(async () => {
      throw anthropicErr
    })

    await expect(
      callWithGeminiFallback<{ from: string }>({
        callSite: 'comprehension',
        gemini: geminiSpy,
        anthropic: anthropicFail,
      }),
    ).rejects.toThrow(/llm_providers_down:/)

    // Gemini NO se intenta (circuito abierto); Haiku sí.
    expect(geminiSpy).not.toHaveBeenCalled()
    expect(anthropicFail).toHaveBeenCalledTimes(1)
    const failedCall = recordEvent.mock.calls.find((c) => c[1] === 'fallback_failed')
    expect(failedCall).toBeDefined()
    expect(failedCall?.[2]).toMatchObject({
      callSite: 'comprehension',
      gemini_error: 'circuit_open',
      anthropic_error: 'AnthropicError',
    })
  })
})

// ─── Suite billing + schema-cap (Plan 03 nuevas ramas) ───────────────────────

describe('callWithGeminiFallback — billing / schema-cap / doble-fallo (Plan 03)', () => {
  it('D-01 — billing error de Gemini, Haiku OK → retorna resultado Haiku + emite llm_credits_depleted + NORMAL email', async () => {
    const geminiSpy = vi.fn(async () => {
      throw billingError()
    })
    const anthropicSpy = vi.fn(async () => ({ from: 'anthropic' as const }))

    const result = await callWithGeminiFallback<{ from: string }>({
      callSite: 'comprehension',
      gemini: geminiSpy,
      anthropic: anthropicSpy,
    })

    expect(result.from).toBe('anthropic')
    expect(anthropicSpy).toHaveBeenCalledTimes(1)

    const labels = recordEvent.mock.calls.map((c) => c[1])
    expect(labels).toContain('llm_credits_depleted')
    expect(labels).toContain('fallback_triggered')
    // schema-cap NO debe emitirse en una billing error
    expect(labels).not.toContain('gemini_schema_capacity_fallback')

    // Esperar microtask flush para el fire-and-forget del correo.
    await flushMicrotasks()
    expect(sendLLMCreditsDepletedAlertSpy).toHaveBeenCalledTimes(1)
    expect(sendLLMCreditsDepletedAlertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'gemini', callSite: 'comprehension' }),
    )
    // CRITICAL email NO debe dispararse (bot está VIVO con Haiku)
    expect(sendBothProvidersDownAlertSpy).not.toHaveBeenCalled()
  })

  it('D-02 — union-types error de Gemini, Haiku OK → retorna resultado Haiku + emite gemini_schema_capacity_fallback (no NORMAL email)', async () => {
    const geminiSpy = vi.fn(async () => {
      throw schemaCapError()
    })
    const anthropicSpy = vi.fn(async () => ({ from: 'anthropic' as const }))

    const result = await callWithGeminiFallback<{ from: string }>({
      callSite: 'generation',
      gemini: geminiSpy,
      anthropic: anthropicSpy,
    })

    expect(result.from).toBe('anthropic')

    const labels = recordEvent.mock.calls.map((c) => c[1])
    expect(labels).toContain('gemini_schema_capacity_fallback')
    // Credits email NO debe dispararse (no es un error de billing)
    await flushMicrotasks()
    expect(sendLLMCreditsDepletedAlertSpy).not.toHaveBeenCalled()
    expect(sendBothProvidersDownAlertSpy).not.toHaveBeenCalled()
  })

  it('Pitfall #4 — NoObjectGeneratedError re-throws SIN fallback, SIN anthropic, SIN email', async () => {
    const geminiSpy = vi.fn(async () => {
      throw parseError()
    })
    const anthropicSpy = vi.fn(async () => ({ from: 'anthropic' as const }))

    await expect(
      callWithGeminiFallback<{ from: string }>({
        callSite: 'compliance',
        gemini: geminiSpy,
        anthropic: anthropicSpy,
      }),
    ).rejects.toBeInstanceOf(NoObjectGeneratedError)

    expect(anthropicSpy).not.toHaveBeenCalled()
    await flushMicrotasks()
    expect(sendLLMCreditsDepletedAlertSpy).not.toHaveBeenCalled()
    expect(sendBothProvidersDownAlertSpy).not.toHaveBeenCalled()
  })

  it('D-06/D-07b — billing error + Haiku TAMBIÉN falla → sentinel llm_providers_down: + CRITICAL email', async () => {
    const geminiSpy = vi.fn(async () => {
      throw billingError()
    })
    const anthropicErr = new Error('anthropic overloaded')
    anthropicErr.name = 'APIError'
    const anthropicSpy = vi.fn(async () => {
      throw anthropicErr
    })

    await expect(
      callWithGeminiFallback<{ from: string }>({
        callSite: 'comprehension',
        gemini: geminiSpy,
        anthropic: anthropicSpy,
      }),
    ).rejects.toThrow(/llm_providers_down:/)

    // Evento fallback_failed debe emitirse
    const labels = recordEvent.mock.calls.map((c) => c[1])
    expect(labels).toContain('fallback_failed')

    // CRITICAL email disparado
    await flushMicrotasks()
    expect(sendBothProvidersDownAlertSpy).toHaveBeenCalledTimes(1)
    expect(sendBothProvidersDownAlertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ callSite: 'comprehension' }),
    )
  })
})
