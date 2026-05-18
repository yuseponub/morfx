// ============================================================================
// Tests for sub-loop/nunca-decir-check.ts — Plan 07b (D-09 unlock).
//
// Standalone: somnio-v4-rag-generative / Plan 07b.
//
// Coverage:
//   1. Early-return cuando rules.length === 0 (no llama al modelo).
//   2. AFFIRMS — output.violates=true → ok=false con violation populated.
//   3. NEGATES — output.violates=false → ok=true (mock simula que el LLM razonó polaridad).
//   4. NEUTRAL / handoff silente (empty candidateText) — output.violates=false → ok=true.
//   5. Prompt + model contract — system prompt contiene POLARITY RULES y model selector
//      apunta a gemini-2.5-flash NORMAL (NO flash-lite).
//
// El LLM mockeado: el test NO valida que el LLM razone polaridad correctamente —
// eso lo valida Smoke A V3 (integración real). Estos tests aseguran que el wrapper
// de TypeScript mapea correctamente el output del modelo al contract del consumer
// (`{ ok, violation? }`) y que el prompt enviado al modelo contiene las polarity rules
// + el model selector es Flash NORMAL post-D-09-unlock.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks declarados ANTES del import del módulo bajo test (vi.mock se eleva al tope).
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

// Import DESPUÉS de los mocks.
import { checkNuncaDecir } from '../nunca-decir-check'

describe('checkNuncaDecir (Plan 07b — D-09 unlock)', () => {
  beforeEach(() => {
    generateTextMock.mockReset()
  })

  it('Test 1: early-return ok=true cuando nuncaDecirRules está vacío (no llama al modelo)', async () => {
    const result = await checkNuncaDecir({
      candidateText: 'cualquier texto',
      nuncaDecirRules: [],
    })
    expect(result).toEqual({ ok: true })
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('Test 2: AFFIRMS — output.violates=true mapea a ok=false con violation populated', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        violates: true,
        violatedRule: 'El producto cura el insomnio.',
      },
    })

    const result = await checkNuncaDecir({
      candidateText: 'El Elixir cura el insomnio para siempre.',
      nuncaDecirRules: ['El producto cura el insomnio.'],
    })

    expect(result).toEqual({
      ok: false,
      violation: 'El producto cura el insomnio.',
    })
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('Test 3: NEGATES — output.violates=false mapea a ok=true (LLM razonó negación)', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: { violates: false },
    })

    const result = await checkNuncaDecir({
      candidateText:
        'No recomendamos el uso durante el embarazo, consultá con tu ginecólogo.',
      nuncaDecirRules: ['El producto es seguro durante el embarazo.'],
    })

    expect(result).toEqual({ ok: true })
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('Test 4: NEUTRAL / handoff silente — candidateText vacío y violates=false → ok=true', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: { violates: false },
    })

    const result = await checkNuncaDecir({
      candidateText: '',
      nuncaDecirRules: [
        'Combinar el producto con alcohol es seguro o recomendable.',
        'El envío fuera de Colombia está aprobado por el bot.',
      ],
    })

    expect(result).toEqual({ ok: true })
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })

  it('Test 5: prompt + model contract — system prompt contiene POLARITY RULES y model es gemini-2.5-flash (NO flash-lite)', async () => {
    generateTextMock.mockResolvedValueOnce({
      output: { violates: false },
    })

    await checkNuncaDecir({
      candidateText: 'texto neutral',
      nuncaDecirRules: ['una regla'],
    })

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    const callArgs = generateTextMock.mock.calls[0]?.[0] as {
      model: { __mockModelId: string }
      system: string
    }

    // D-09 unlock: model is Flash NORMAL, not Flash-Lite.
    expect(callArgs.model.__mockModelId).toBe('gemini-2.5-flash')
    expect(callArgs.model.__mockModelId).not.toBe('gemini-2.5-flash-lite')

    // Polarity rules present in system prompt.
    expect(callArgs.system).toContain('POLARITY RULES')
    expect(callArgs.system).toContain('AFFIRMS')
    expect(callArgs.system).toContain('NEGATES')
    expect(callArgs.system).toContain('REDIRECTS')
    expect(callArgs.system).toContain('NEUTRAL')
  })
})
