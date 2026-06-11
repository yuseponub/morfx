/**
 * Suite de paridad del fallback en los 2 call-sites del sub-loop (Wave 2 Plan 02).
 *
 * Verifica D-09: el branch Anthropic produce el MISMO shape de salida que Gemini —
 * GenerationOutputSchema / ComplianceCheckSchema validan independiente del provider.
 *
 * Estrategia (la "más simple y robusta" del plan): testear via el orquestador
 * `callWithGeminiFallback` pasando closures `gemini` (arroja APICallError 503 →
 * saturación) y `anthropic` (resuelve el objeto del schema), asertando que el
 * resultado validado por `*.parse(...)` NO lanza. Cubre la paridad de shape sin
 * acoplarse a la construcción inline de `google(...)`/`anthropic(...)` dentro de
 * runGenerationCall/checkCompliance.
 *
 * NOTA (LEARNINGS): `MockLanguageModelV3` de 'ai/test' está disponible para un smoke
 * E2E más profundo que mockee los providers a nivel de módulo (vi.mock('@ai-sdk/google')
 * + vi.mock('@ai-sdk/anthropic') devolviendo factories que retornan instancias del mock).
 * Sería el primer uso de MockLanguageModelV3 en el proyecto. Para esta suite de paridad
 * de shape, el approach helper-direct es suficiente y más estable (no depende de la
 * internals del provider construction).
 */

import { describe, it, expect, afterEach, vi } from 'vitest'

const recordEvent = vi.fn()
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent }),
}))

import { callWithGeminiFallback } from '../../llm-fallback'
import { __resetBreakers } from '../../llm-fallback'
import { GenerationOutputSchema } from '../generation-call'
import { ComplianceCheckSchema } from '../compliance-check'
import { APICallError } from 'ai'

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

describe('fallback parity — generation (callSite generation)', () => {
  it('saturación Gemini (503 "high demand") → fallback a Anthropic con shape GenerationOutput válido', async () => {
    const geminiSpy = vi.fn(async () => {
      throw saturation()
    })
    // El branch Anthropic resuelve el MISMO shape que Gemini (D-09): result.output.
    const anthropicSpy = vi.fn(async () => ({
      output: {
        responseText: 'Hola, con gusto te ayudo.',
        responseConfidence: 0.9,
        confidenceRationale: 'cubre la pregunta con el material',
        binary: 'RESPONDE_BIEN' as const,
      },
    }))

    const result = await callWithGeminiFallback<{ output: unknown }>({
      callSite: 'generation',
      gemini: geminiSpy,
      anthropic: anthropicSpy,
    })

    expect(anthropicSpy).toHaveBeenCalledTimes(1)
    // PARIDAD: el output del fallback valida contra el schema de Gemini sin lanzar.
    expect(() => GenerationOutputSchema.parse(result.output)).not.toThrow()
    const parsed = GenerationOutputSchema.parse(result.output)
    expect(parsed.responseText).toBe('Hola, con gusto te ayudo.')
    expect(parsed.binary).toBe('RESPONDE_BIEN')

    const labels = recordEvent.mock.calls.map((c) => c[1])
    expect(labels).toContain('fallback_triggered')
  })

  it('happy path — Gemini OK → resultado de Gemini, Anthropic NUNCA invocado', async () => {
    const geminiSpy = vi.fn(async () => ({
      output: {
        responseText: 'Respuesta de Gemini',
        responseConfidence: 0.85,
        confidenceRationale: 'ok',
        binary: 'RESPONDE_BIEN' as const,
      },
    }))
    const anthropicSpy = vi.fn(async () => ({
      output: {
        responseText: 'NO debería llamarse',
        responseConfidence: 0,
        confidenceRationale: 'x',
        binary: 'FUERA_SCOPE' as const,
      },
    }))

    const result = await callWithGeminiFallback<{ output: unknown }>({
      callSite: 'generation',
      gemini: geminiSpy,
      anthropic: anthropicSpy,
    })

    expect(anthropicSpy).not.toHaveBeenCalled()
    const parsed = GenerationOutputSchema.parse(result.output)
    expect(parsed.responseText).toBe('Respuesta de Gemini')
  })
})

describe('fallback parity — compliance (callSite compliance)', () => {
  it('saturación Gemini → fallback a Anthropic con shape ComplianceCheck válido', async () => {
    const geminiSpy = vi.fn(async () => {
      throw saturation()
    })
    const anthropicSpy = vi.fn(async () => ({
      output: {
        violatesNuncaDecir: false,
        shouldEscalate: false,
      },
    }))

    const result = await callWithGeminiFallback<{ output: unknown }>({
      callSite: 'compliance',
      gemini: geminiSpy,
      anthropic: anthropicSpy,
    })

    expect(anthropicSpy).toHaveBeenCalledTimes(1)
    expect(() => ComplianceCheckSchema.parse(result.output)).not.toThrow()
    const parsed = ComplianceCheckSchema.parse(result.output)
    expect(parsed.violatesNuncaDecir).toBe(false)
    expect(parsed.shouldEscalate).toBe(false)

    const labels = recordEvent.mock.calls.map((c) => c[1])
    expect(labels).toContain('fallback_triggered')
  })

  it('happy path — Gemini OK → resultado de Gemini, Anthropic NUNCA invocado', async () => {
    const geminiSpy = vi.fn(async () => ({
      output: { violatesNuncaDecir: true, shouldEscalate: false, violatedRule: 'regla X' },
    }))
    const anthropicSpy = vi.fn(async () => ({
      output: { violatesNuncaDecir: false, shouldEscalate: false },
    }))

    const result = await callWithGeminiFallback<{ output: unknown }>({
      callSite: 'compliance',
      gemini: geminiSpy,
      anthropic: anthropicSpy,
    })

    expect(anthropicSpy).not.toHaveBeenCalled()
    const parsed = ComplianceCheckSchema.parse(result.output)
    expect(parsed.violatesNuncaDecir).toBe(true)
  })
})
