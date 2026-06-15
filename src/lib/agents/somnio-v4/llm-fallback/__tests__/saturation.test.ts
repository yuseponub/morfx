/**
 * Tests del predicado de saturación (RESEARCH Q9 — casos 1-3).
 *
 * Table-driven. Construye APICallError real con el constructor verificado en
 * node_modules/@ai-sdk/provider, RetryError envolviendo saturación, y verifica
 * que NoObjectGeneratedError NO matchea (Pitfall #4 — no enmascarar bugs de schema).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { APICallError, RetryError, NoObjectGeneratedError } from 'ai'
import { isGeminiSaturation, isTimeoutError, isGeminiBillingError, isGeminiSchemaCapacity } from '../saturation'
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

  it('un Error pelado (no APICallError) sin patrón de saturación → false', () => {
    // Un Error plano "ECONNRESET" NO es el shape que el SDK arroja jamás — el provider-utils
    // siempre lo envuelve en APICallError (ver test de red abajo). Un Error plano sin patrón
    // de capacidad NO debe matchear (no enmascarar errores genéricos como saturación).
    expect(isGeminiSaturation(new Error('algo genérico salió mal'))).toBe(false)
  })
})

describe('isGeminiSaturation — error de RED (H-01) → true', () => {
  it('APICallError de red (statusCode undefined + isRetryable true, "Cannot connect to API") → true', () => {
    // Shape REAL que @ai-sdk/provider-utils (handleFetchError, dist/index.js:496-513) construye
    // ante DNS/ECONNRESET/connection refused/TLS: APICallError SIN statusCode + isRetryable=true.
    // Verificado en node_modules/@ai-sdk/provider-utils@4.0.15.
    const networkErr = new APICallError({
      message: 'Cannot connect to API: fetch failed',
      url: 'https://generativelanguage.googleapis.com/v1beta/models',
      requestBodyValues: {},
      statusCode: undefined,
      isRetryable: true,
    })
    expect(networkErr.statusCode).toBeUndefined()
    expect(isGeminiSaturation(networkErr)).toBe(true)
  })

  it('APICallError statusCode undefined pero isRetryable=false → false (no es saturación)', () => {
    const nonRetryable = new APICallError({
      message: 'some non-retryable client error',
      url: 'https://generativelanguage.googleapis.com/v1beta/models',
      requestBodyValues: {},
      statusCode: undefined,
      isRetryable: false,
    })
    expect(isGeminiSaturation(nonRetryable)).toBe(false)
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

// ─── D-01/D-09 — isGeminiBillingError ────────────────────────────────────────

describe('isGeminiBillingError — créditos agotados → true', () => {
  it('APICallError con message "Your prepayment credits are depleted" → true', () => {
    expect(isGeminiBillingError(apiError({ message: 'Your prepayment credits are depleted' }))).toBe(true)
  })

  it('Pitfall #5 — error re-envuelto por comprehension con credits en message → true', () => {
    expect(
      isGeminiBillingError(
        new Error('[Comprehension-v4 generateText] Error: Your prepayment credits are depleted | finishReason=error'),
      ),
    ).toBe(true)
  })

  it('APICallError con responseBody conteniendo RESOURCE_EXHAUSTED + quota → true', () => {
    expect(
      isGeminiBillingError(
        apiError({ responseBody: '{"error":{"message":"RESOURCE_EXHAUSTED quota exceeded for project"}}' }),
      ),
    ).toBe(true)
  })

  it('APICallError statusCode 503 sin mensaje de billing → false (eso es saturación)', () => {
    expect(isGeminiBillingError(apiError({ statusCode: 503 }))).toBe(false)
  })
})

describe('isGeminiBillingError — NO matchea parse/schema (Pitfall #4)', () => {
  it('NoObjectGeneratedError → false (no enmascarar bugs de schema como créditos)', () => {
    const err = new NoObjectGeneratedError({
      message: 'No object generated: response did not match schema',
      text: '{ broken json',
      response: { id: 'r', timestamp: new Date(), modelId: 'gemini-2.5-flash' },
      usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
      finishReason: 'stop',
    })
    expect(isGeminiBillingError(err)).toBe(false)
  })
})

// ─── D-02/D-09 — isGeminiSchemaCapacity ──────────────────────────────────────

describe('isGeminiSchemaCapacity — error union-types → true', () => {
  it('APICallError con message "too many parameters with union types" → true', () => {
    expect(
      isGeminiSchemaCapacity(
        apiError({ message: 'Schemas contains too many parameters with union types (17 parameters...)' }),
      ),
    ).toBe(true)
  })

  it('Pitfall #5 — error re-envuelto con "too many states for serving" → true', () => {
    expect(
      isGeminiSchemaCapacity(
        new Error('The specified schema produces a constraint that has too many states for serving'),
      ),
    ).toBe(true)
  })

  it('APICallError con message "bare anyOf parse failure" → false (Pitfall #4 — demasiado genérico)', () => {
    expect(isGeminiSchemaCapacity(apiError({ message: 'some anyOf parse failure' }))).toBe(false)
  })
})

describe('isGeminiSchemaCapacity — NO matchea parse/schema (Pitfall #4)', () => {
  it('NoObjectGeneratedError → false (no enmascarar bugs de schema como union-types)', () => {
    const err = new NoObjectGeneratedError({
      message: 'No object generated: response did not match schema',
      text: '{ broken json',
      response: { id: 'r', timestamp: new Date(), modelId: 'gemini-2.5-flash' },
      usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
      finishReason: 'stop',
    })
    expect(isGeminiSchemaCapacity(err)).toBe(false)
  })
})

// ─── Pitfall #4 consolidado: ambos predicados nuevos + regresión de isGeminiSaturation ──

describe('Pitfall #4 — NoObjectGeneratedError no matchea ningún predicado de fallback', () => {
  const parseErr = new NoObjectGeneratedError({
    message: 'No object generated: response did not match schema',
    text: '{ broken json',
    response: { id: 'r', timestamp: new Date(), modelId: 'gemini-2.5-flash' },
    usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
    finishReason: 'stop',
  })

  it('isGeminiBillingError(NoObjectGeneratedError) → false', () => {
    expect(isGeminiBillingError(parseErr)).toBe(false)
  })

  it('isGeminiSchemaCapacity(NoObjectGeneratedError) → false', () => {
    expect(isGeminiSchemaCapacity(parseErr)).toBe(false)
  })

  it('isGeminiSaturation(NoObjectGeneratedError) → false (no-regression)', () => {
    expect(isGeminiSaturation(parseErr)).toBe(false)
  })
})

// ─── No-overlap regresión: billing/schema-cap strings NO matchean isGeminiSaturation ─

describe('isGeminiSaturation — no matchea strings de billing/schema-cap (no-overlap)', () => {
  it('"prepayment credits are depleted" en message → false para isGeminiSaturation', () => {
    expect(
      isGeminiSaturation(apiError({ statusCode: 400, message: 'Your prepayment credits are depleted' })),
    ).toBe(false)
  })

  it('"too many parameters with union types" → false para isGeminiSaturation', () => {
    expect(
      isGeminiSaturation(
        apiError({ statusCode: 400, message: 'Schemas contains too many parameters with union types' }),
      ),
    ).toBe(false)
  })
})
