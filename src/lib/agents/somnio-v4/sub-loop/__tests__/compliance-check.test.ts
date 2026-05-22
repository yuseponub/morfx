// ============================================================================
// Tests for sub-loop/compliance-check.ts — 2026-05-22 refactor.
//
// Successor de nunca-decir-check.test.ts (renombrado + expandido). El compliance
// check ahora evalúa 2 dimensiones independientes en una sola call:
//   D1: nunca-decir (text-vs-forbidden-proposition) — polarity-aware.
//   D2: escalation (case-vs-escalation-trigger) — direct match + evasion.
//
// Coverage:
//   1. Early-return cuando AMBOS arrays vacíos (no llama al modelo).
//   2. D1 fail solo — violatesNuncaDecir=true, shouldEscalate=false → ok=false con
//      nuncaDecirViolation populated, sin escalationTrigger.
//   3. D2 fail solo — violatesNuncaDecir=false, shouldEscalate=true → ok=false con
//      escalationTrigger populated, sin nuncaDecirViolation.
//   4. Ambas fail — los 2 fields populated, ok=false.
//   5. Ambas pasan (legitimate derivation, response neutral) → ok=true.
//   6. Solo nuncaDecir rules disponibles (cuandoEscalar vacío) — D2 trivially false.
//   7. Solo cuandoEscalar rules disponibles (nuncaDecir vacío) — D1 trivially false.
//   8. Prompt + model contract — system prompt contiene secciones D1 y D2 separadas,
//      polarity rules + escalation criteria; model = gemini-2.5-flash NORMAL.
//
// El LLM mockeado: estos tests validan el wrapper TypeScript (mapping de output del
// modelo al consumer contract). La calidad del razonamiento polaridad/escalación la
// valida Smoke A V3 (integración real).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const generateTextMock = vi.fn()

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  }
})

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn((modelId: string) => ({ __mockModelId: modelId })),
}))

vi.mock('@/lib/observability', () => ({
  runWithPurpose: <T>(_purpose: string, fn: () => Promise<T>): Promise<T> => fn(),
}))

import { checkCompliance } from '../compliance-check'

describe('checkCompliance (2026-05-22 refactor — D1 nunca-decir + D2 escalation)', () => {
  beforeEach(() => {
    generateTextMock.mockReset()
  })

  it('Test 1: early-return ok=true cuando AMBOS arrays vacíos (no llama al modelo)', async () => {
    const result = await checkCompliance({
      userMessage: 'cualquier mensaje',
      candidateText: 'cualquier respuesta',
      nuncaDecirRules: [],
      cuandoEscalar: [],
    })
    expect(result).toMatchObject({ ok: true })
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('Test 2: D1 fail solo — nuncaDecirViolation populated, no escalationTrigger', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        violatesNuncaDecir: true,
        violatedRule: 'El producto cura el insomnio.',
        shouldEscalate: false,
      },
    })

    const result = await checkCompliance({
      userMessage: 'sirve para el insomnio?',
      candidateText: 'El Elixir cura el insomnio para siempre.',
      nuncaDecirRules: ['El producto cura el insomnio.'],
      cuandoEscalar: ['cliente reporta insomnio crónico de años'],
    })

    expect(result).toMatchObject({
      ok: false,
      nuncaDecirViolation: 'El producto cura el insomnio.',
      escalationTrigger: undefined,
    })
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('Test 3: D2 fail solo — escalationTrigger populated, no nuncaDecirViolation', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        violatesNuncaDecir: false,
        shouldEscalate: true,
        matchedTrigger: 'cliente reporta polifarmacia (varios recetados activos)',
      },
    })

    const result = await checkCompliance({
      userMessage: 'tengo diabetes, hipertensión y depresión, tomo 5 medicamentos',
      candidateText: 'Lo mejor es validar con tu médico tratante.',
      nuncaDecirRules: ['El producto no tiene interacciones.'],
      cuandoEscalar: ['cliente reporta polifarmacia (varios recetados activos)'],
    })

    expect(result).toMatchObject({
      ok: false,
      nuncaDecirViolation: undefined,
      escalationTrigger: 'cliente reporta polifarmacia (varios recetados activos)',
    })
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('Test 4: ambas dimensiones fail — los 2 fields populated, ok=false', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        violatesNuncaDecir: true,
        violatedRule: 'El producto es seguro durante el embarazo.',
        shouldEscalate: true,
        matchedTrigger: 'embarazada insiste en comprar a pesar de la advertencia',
      },
    })

    const result = await checkCompliance({
      userMessage: 'estoy embarazada de 7 meses pero igual lo quiero',
      candidateText: 'Sí, el producto es seguro durante el embarazo, comprá con confianza.',
      nuncaDecirRules: ['El producto es seguro durante el embarazo.'],
      cuandoEscalar: ['embarazada insiste en comprar a pesar de la advertencia'],
    })

    expect(result).toMatchObject({
      ok: false,
      nuncaDecirViolation: 'El producto es seguro durante el embarazo.',
      escalationTrigger: 'embarazada insiste en comprar a pesar de la advertencia',
    })
  })

  it('Test 5: ambas pasan — caso legítimo, respuesta correcta, ok=true', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        violatesNuncaDecir: false,
        shouldEscalate: false,
      },
    })

    const result = await checkCompliance({
      userMessage: 'tomo levotiroxina, puedo usarlo?',
      candidateText: 'Por la levotiroxina, validá con tu médico antes de combinarlo.',
      nuncaDecirRules: ['Combinar con cualquier medicamento es seguro.'],
      cuandoEscalar: ['cliente menciona medicamento específico no listado'],
    })

    expect(result).toMatchObject({
      ok: true,
      nuncaDecirViolation: undefined,
      escalationTrigger: undefined,
    })
  })

  it('Test 6: solo nuncaDecir rules — cuandoEscalar vacío → D2 trivially false', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        violatesNuncaDecir: false,
        shouldEscalate: false,
      },
    })

    const result = await checkCompliance({
      userMessage: 'cuánto cuesta?',
      candidateText: 'El precio es $X.',
      nuncaDecirRules: ['Inventar promociones sin confirmar es válido.'],
      cuandoEscalar: [],
    })

    expect(result).toMatchObject({
      ok: true,
      nuncaDecirViolation: undefined,
      escalationTrigger: undefined,
    })
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('Test 7: solo cuandoEscalar rules — nuncaDecir vacío → D1 trivially false', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        violatesNuncaDecir: false,
        shouldEscalate: false,
      },
    })

    const result = await checkCompliance({
      userMessage: 'me dieron el producto y duermo bien',
      candidateText: 'Qué bueno que te funciona.',
      nuncaDecirRules: [],
      cuandoEscalar: ['cliente reporta efecto adverso tras haber tomado el producto'],
    })

    expect(result).toMatchObject({
      ok: true,
      nuncaDecirViolation: undefined,
      escalationTrigger: undefined,
    })
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('Test 8: prompt + model contract — D1+D2 sections present, model = gemini-2.5-flash NORMAL', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: { violatesNuncaDecir: false, shouldEscalate: false },
    })

    await checkCompliance({
      userMessage: 'texto cliente',
      candidateText: 'respuesta bot',
      nuncaDecirRules: ['una regla nunca-decir'],
      cuandoEscalar: ['un trigger de escalación'],
    })

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    const callArgs = generateTextMock.mock.calls[0]?.[0] as {
      model: { __mockModelId: string }
      system: string
      messages: Array<{ role: string; content: string }>
    }

    // Model: Flash NORMAL (no Flash-Lite — D-09 unlock heredado de nunca-decir).
    expect(callArgs.model.__mockModelId).toBe('gemini-2.5-flash')
    expect(callArgs.model.__mockModelId).not.toBe('gemini-2.5-flash-lite')

    // D1 polarity rules.
    expect(callArgs.system).toContain('DIMENSION 1')
    expect(callArgs.system).toContain('NUNCA-decir')
    expect(callArgs.system).toContain('POLARITY RULES')
    expect(callArgs.system).toContain('AFFIRMS')
    expect(callArgs.system).toContain('NEGATES')
    expect(callArgs.system).toContain('REDIRECTS')
    expect(callArgs.system).toContain('NEUTRAL')

    // D2 escalation criteria.
    expect(callArgs.system).toContain('DIMENSION 2')
    expect(callArgs.system).toContain('Escalation')
    expect(callArgs.system).toContain('DIRECT MATCH')
    expect(callArgs.system).toContain('ESCALATION EVASION')

    // Independence statement.
    expect(callArgs.system).toContain('INDEPENDENCE')

    // User message includes both userMessage and candidateText.
    const userContent = callArgs.messages[0]?.content ?? ''
    expect(userContent).toContain('USER MESSAGE')
    expect(userContent).toContain('CANDIDATE RESPONSE')
    expect(userContent).toContain('texto cliente')
    expect(userContent).toContain('respuesta bot')
  })
})
