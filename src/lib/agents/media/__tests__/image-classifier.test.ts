/**
 * Tests for image-classifier.ts
 * Plan 03 (v4-media-audio-image Wave 2) — TDD RED phase.
 *
 * Validates:
 * - classifyImage returns { categoria, descripcion, decision }
 * - decision is ALWAYS derived from categoria in code (never from LLM — Pitfall 4)
 * - D-07 fail-safe: any generateText throw → { categoria:'ambiguo', descripcion:'', decision:'handoff' }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ImageClassification } from '../image-classifier'

// Mock the AI SDK BEFORE importing the module under test.
// We mock the `ai` package's generateText and the `@ai-sdk/google` google() factory.
vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: {
    object: vi.fn().mockReturnValue({ type: 'object' }),
  },
}))

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn().mockReturnValue({ modelId: 'gemini-2.5-flash' }),
}))

// Import after mocks are in place.
import { generateText } from 'ai'
import { classifyImage } from '../image-classifier'

const mockGenerateText = generateText as ReturnType<typeof vi.fn>

describe('classifyImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('categoria=producto → decision=responder (never from LLM)', async () => {
    // LLM returns ONLY categoria + descripcion (Pitfall 4 — no decision field)
    mockGenerateText.mockResolvedValueOnce({
      experimental_output: { categoria: 'producto', descripcion: 'Foto del frasco de ELIXIR DEL SUEÑO' },
    })

    const result: ImageClassification = await classifyImage(
      'https://example.com/image.jpg',
      'image/jpeg'
    )

    expect(result.categoria).toBe('producto')
    expect(result.descripcion).toBe('Foto del frasco de ELIXIR DEL SUEÑO')
    // CRITICAL: decision derived in code, not from model output
    expect(result.decision).toBe('responder')
  })

  it('categoria=comprobante_pago → decision=handoff (never from LLM)', async () => {
    mockGenerateText.mockResolvedValueOnce({
      experimental_output: { categoria: 'comprobante_pago', descripcion: 'Captura de Nequi con transferencia' },
    })

    const result: ImageClassification = await classifyImage(
      'https://example.com/receipt.jpg',
      'image/jpeg'
    )

    expect(result.categoria).toBe('comprobante_pago')
    expect(result.decision).toBe('handoff')
  })

  it('categoria=documento_identidad → decision=handoff (never from LLM)', async () => {
    mockGenerateText.mockResolvedValueOnce({
      experimental_output: { categoria: 'documento_identidad', descripcion: 'Cédula de ciudadanía colombiana' },
    })

    const result: ImageClassification = await classifyImage(
      'https://example.com/id.jpg',
      'image/png',
      'foto de mi cédula'
    )

    expect(result.categoria).toBe('documento_identidad')
    expect(result.decision).toBe('handoff')
  })

  it('D-07 fail-safe: generateText throws → returns ambiguo/handoff with no throw', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('Gemini API timeout'))

    const result: ImageClassification = await classifyImage(
      'https://example.com/image.jpg',
      'image/jpeg'
    )

    // D-07: any failure → fail-safe, no throw
    expect(result.categoria).toBe('ambiguo')
    expect(result.descripcion).toBe('')
    expect(result.decision).toBe('handoff')
  })
})
