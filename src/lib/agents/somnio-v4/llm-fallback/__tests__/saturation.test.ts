/**
 * Tests del predicado de saturación (RESEARCH Q9 — casos 1-3).
 *
 * Table-driven. Construye APICallError real con el constructor verificado en
 * node_modules/@ai-sdk/provider, RetryError envolviendo saturación, y verifica
 * que NoObjectGeneratedError NO matchea (Pitfall #4 — no enmascarar bugs de schema).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { APICallError, RetryError, NoObjectGeneratedError } from 'ai'
import { isGeminiSaturation, isTimeoutError } from '../saturation'
import { __resetBreakers } from '../breaker'

// Pitfall #3 — reset del module-singleton aunque saturation.ts no toque el breaker.
afterEach(() => {
  __resetBreakers()
})

function apiError(opts: { statusCode?: number; message?: string; responseBody?: string }): APICallError {
  return new APICallError({
    message: opts.message ?? 'api error',
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    requestBodyValues: {},
    statusCode: opts.statusCode,
    responseBody: opts.responseBody,
    isRetryable: true,
  })
}

describe('isGeminiSaturation — statusCodes de saturación → true', () => {
  it.each([503, 429, 500, 504])('statusCode %i → true', (statusCode) => {
    expect(isGeminiSaturation(apiError({ statusCode }))).toBe(true)
  })

  it('statusCode 400 (bad request) → false (no es saturación)', () => {
    expect(isGeminiSaturation(apiError({ statusCode: 400 }))).toBe(false)
  })
})

describe('isGeminiSaturation — mensajes de capacidad → true', () => {
  it('message "experiencing high demand" → true', () => {
    expect(
      isGeminiSaturation(apiError({ statusCode: 400, message: 'This model is currently experiencing high demand' })),
    ).toBe(true)
  })

  it('message "MODEL_CAPACITY_EXHAUSTED" → true', () => {
    expect(isGeminiSaturation(apiError({ statusCode: 400, message: 'MODEL_CAPACITY_EXHAUSTED' }))).toBe(true)
  })

  it('responseBody con "RESOURCE_EXHAUSTED" → true', () => {
    expect(
      isGeminiSaturation(apiError({ statusCode: 400, message: 'x', responseBody: '{"error":"RESOURCE_EXHAUSTED"}' })),
    ).toBe(true)
  })

  it('Pitfall #5 — error re-envuelto en new Error con "high demand" preservado → true', () => {
    expect(isGeminiSaturation(new Error('comprehension failed: high demand'))).toBe(true)
  })
})

describe('isGeminiSaturation — RetryError envolviendo saturación (Pitfall #2)', () => {
  it('RetryError con lastError APICallError(503) → true', () => {
    const inner = apiError({ statusCode: 503 })
    const wrapped = new RetryError({
      message: 'max retries exceeded',
      reason: 'maxRetriesExceeded',
      errors: [inner],
    })
    // RetryError.lastError es readonly en el .d.ts; el constructor no lo recibe.
    // Lo seteamos via Object.defineProperty para simular el SDK runtime.
    Object.defineProperty(wrapped, 'lastError', { value: inner, configurable: true })
    expect(isGeminiSaturation(wrapped)).toBe(true)
  })
})

describe('isGeminiSaturation — NO matchea parse/schema (Pitfall #4)', () => {
  it('NoObjectGeneratedError → false (no enmascarar bugs de schema)', () => {
    const err = new NoObjectGeneratedError({
      message: 'No object generated: response did not match schema',
      text: '{ broken json',
      response: { id: 'r', timestamp: new Date(), modelId: 'gemini-2.5-flash' },
      usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
      finishReason: 'stop',
    })
    expect(isGeminiSaturation(err)).toBe(false)
  })

  it('error de red genérico ECONNRESET → false', () => {
    expect(isGeminiSaturation(new Error('ECONNRESET'))).toBe(false)
  })

  it('valor no-Error (string) sin patrón de saturación → false', () => {
    expect(isGeminiSaturation('some random string')).toBe(false)
  })
})

describe('isTimeoutError — abort/timeout → true', () => {
  it('error con name=TimeoutError → true', () => {
    const e = new Error('signal timed out')
    e.name = 'TimeoutError'
    expect(isTimeoutError(e)).toBe(true)
  })

  it('error con name=AbortError → true', () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    expect(isTimeoutError(e)).toBe(true)
  })

  it('error genérico → false', () => {
    expect(isTimeoutError(new Error('x'))).toBe(false)
  })
})
