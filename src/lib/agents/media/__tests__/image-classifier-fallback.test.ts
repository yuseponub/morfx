/**
 * Tests del fallback Gemini → Haiku 4.5 (visión) en classifyImage.
 * Standalone gemini-fallback-haiku Plan 04 (Wave 2 — callSite 'vision').
 *
 * Valida D-03/D-07: el fail-safe handoff queda SOLO como último recurso cuando
 * AMBOS providers fallan. Una sola saturación de Gemini NO debe degradar al cliente
 * a handoff — el branch Anthropic (Haiku 4.5 con visión) recoge la clasificación.
 *
 * Casos:
 * 1. Saturación en Gemini → fallback a Anthropic → si Anthropic clasifica OK,
 *    classifyImage devuelve la categoría de Anthropic (NO el FAIL_SAFE).
 * 2. Doble fallo (Gemini saturado + Anthropic falla) → fail-safe handoff.
 * 3. Happy path: Gemini clasifica → Anthropic NUNCA invocado.
 *
 * `decision` SIEMPRE derivada en código de `categoria` (Pitfall 4), incluso desde
 * el branch Anthropic.
 *
 * NOTA de mocking: `vi.mock('ai', importOriginal)` preserva APICallError/RetryError/
 * NoObjectGeneratedError/Output (que `llm-fallback` y `safe-output` necesitan) y solo
 * sustituye `generateText`. Los modelos `google()`/`anthropic()` se mockean como
 * factories que devuelven un marcador; el branch real lo distingue porque cada closure
 * pasa su propio `model` a `generateText` (que está mockeado por call).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ImageClassification } from '../image-classifier'

// Mock `ai` preservando los exports reales (APICallError, etc.) y solo sustituyendo generateText.
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateText: vi.fn(),
    Output: {
      object: vi.fn().mockReturnValue({ type: 'object' }),
    },
  }
})

// Marcadores de modelo — el branch real solo necesita pasarlos a generateText (mockeado).
vi.mock('@ai-sdk/google', () => ({
  google: vi.fn().mockReturnValue({ provider: 'google', modelId: 'gemini-2.5-flash' }),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue({ provider: 'anthropic', modelId: 'claude-haiku-4-5' }),
}))

// fetchAsBase64 — devolver buffer dummy con ok=true.
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeFetchOk() {
  return mockFetch.mockResolvedValue({
    ok: true,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  })
}

// Import después de los mocks.
import { generateText } from 'ai'
import { classifyImage } from '../image-classifier'
import { __resetBreakers } from '../../somnio-v4/llm-fallback'

const mockGenerateText = generateText as ReturnType<typeof vi.fn>

// Error de saturación reconocido por isGeminiSaturation vía el regex de message
// (cubre Pitfall #5: el message preservado contiene "high demand" / 503).
function saturationError(): Error {
  return new Error('503 Service Unavailable: model is experiencing high demand')
}

describe('classifyImage — fallback Gemini → Haiku 4.5 (visión)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    makeFetchOk()
  })

  afterEach(() => {
    // Resetea el circuit-breaker module-singleton entre tests (Pitfall #3).
    __resetBreakers()
  })

  it('saturación en Gemini → fallback a Anthropic OK → devuelve clasificación real (NO fail-safe)', async () => {
    // 1er call (gemini closure) → saturación 503/high demand.
    // 2do call (anthropic closure) → clasifica OK.
    mockGenerateText
      .mockRejectedValueOnce(saturationError())
      .mockResolvedValueOnce({ output: { categoria: 'producto', descripcion: 'frasco de ELIXIR' } })

    const result: ImageClassification = await classifyImage('https://example.com/frasco.jpg', 'image/jpeg')

    // El cliente NO recibe handoff por una sola saturación de Gemini (D-03).
    expect(result.categoria).toBe('producto')
    expect(result.descripcion).toBe('frasco de ELIXIR')
    // decision derivada EN CÓDIGO de categoria (Pitfall 4), incluso desde el branch Anthropic.
    expect(result.decision).toBe('responder')
    // No es el FAIL_SAFE (que tendría descripcion:'' + ambiguo).
    expect(result.categoria).not.toBe('ambiguo')
    expect(result.descripcion).not.toBe('')
    // Ambos providers fueron invocados (gemini falló → anthropic recogió).
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
  })

  it('doble fallo (Gemini saturado + Anthropic falla) → fail-safe handoff', async () => {
    mockGenerateText
      .mockRejectedValueOnce(saturationError())          // gemini
      .mockRejectedValueOnce(new Error('anthropic down')) // anthropic

    const result: ImageClassification = await classifyImage('https://example.com/x.jpg', 'image/jpeg')

    // D-07: handoff SOLO cuando AMBOS caen.
    expect(result.categoria).toBe('ambiguo')
    expect(result.descripcion).toBe('')
    expect(result.decision).toBe('handoff')
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
  })

  it('happy path: Gemini clasifica → Anthropic NUNCA invocado', async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { categoria: 'pagina', descripcion: 'captura de una tienda online' },
    })

    const result: ImageClassification = await classifyImage('https://example.com/web.jpg', 'image/jpeg')

    expect(result.categoria).toBe('pagina')
    expect(result.decision).toBe('responder') // derivada en código
    // Anthropic NO se invoca cuando Gemini responde.
    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })
})
