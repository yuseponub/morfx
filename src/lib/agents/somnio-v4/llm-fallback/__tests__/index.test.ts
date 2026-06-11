/**
 * Tests del orquestador callWithGeminiFallback (RESEARCH Q9 — casos index).
 *
 * Cubre: saturación → fallback + fallback_triggered; NoObjectGeneratedError →
 * re-throw SIN anthropic (Pitfall #4); gemini OK → sin anthropic; doble fallo →
 * fallback_failed + propaga error de anthropic (Pitfall #8).
 *
 * Closures gemini/anthropic = vi.fn() (funciones puras; MockLanguageModelV3 se usa
 * en parity tests de Wave 2, no aquí).
 */

import { describe, it, expect, afterEach, vi } from 'vitest'

const recordEvent = vi.fn()
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent }),
}))

import { callWithGeminiFallback } from '../index'
import { __resetBreakers } from '../breaker'
import { APICallError, NoObjectGeneratedError } from 'ai'

afterEach(() => {
  __resetBreakers()
  recordEvent.mockClear()
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

function parseError(): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    message: 'No object generated: response did not match schema',
    text: '{ broken',
    response: { id: 'r', timestamp: new Date(), modelId: 'gemini-2.5-flash' },
    usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
    finishReason: 'stop',
  })
}

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

  it('Pitfall #8 — doble fallo: emite fallback_failed + propaga error de anthropic', async () => {
    const geminiSpy = vi.fn(async () => {
      throw saturation()
    })
    const anthropicErr = new Error('anthropic 529 overloaded')
    anthropicErr.name = 'AnthropicError'
    const anthropicSpy = vi.fn(async () => {
      throw anthropicErr
    })

    await expect(
      callWithGeminiFallback<{ from: string }>({
        callSite: 'vision',
        gemini: geminiSpy,
        anthropic: anthropicSpy,
      }),
    ).rejects.toBe(anthropicErr)

    expect(anthropicSpy).toHaveBeenCalledTimes(1)
    const failedCall = recordEvent.mock.calls.find((c) => c[1] === 'fallback_failed')
    expect(failedCall).toBeDefined()
    expect(failedCall?.[2]).toMatchObject({
      callSite: 'vision',
      anthropic_error: 'AnthropicError',
    })
  })
})
