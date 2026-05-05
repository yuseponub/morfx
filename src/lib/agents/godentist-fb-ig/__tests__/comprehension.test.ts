/**
 * Tests for godentist-fb-ig/comprehension.ts Haiku call + parsing.
 *
 * Standalone agent-godentist-fb-ig — Plan 06 Wave 4 Task 2.
 *
 * Pattern: mock `createInstrumentedAnthropic` to return a fake client whose
 * `messages.create` returns canned structured-output responses. Verifies:
 *   - intent=datos extraction (lead-capture happy path)
 *   - intent=quiero_agendar parsing
 *   - intent=saludo + secondary intent (ej: precio_servicio)
 *   - English idioma classification
 *   - Malformed intent fallback to 'otro' (sanitization in parseAnalysis)
 *   - Invalid JSON throws (resilient parsing)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted for Anthropic mock client (visible to vi.mock factories)
const messagesCreateMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/observability/anthropic-instrumented', () => ({
  createInstrumentedAnthropic: vi.fn(() => ({
    messages: { create: messagesCreateMock },
  })),
}))

vi.mock('@/lib/observability', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    runWithPurpose: async (_purpose: string, fn: () => Promise<unknown>) => fn(),
    getCollector: () => ({ recordEvent: vi.fn() }),
  }
})

// Mock the zod helper so we don't need real output_config plumbing
vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: vi.fn(() => ({})),
}))

import { comprehend } from '../comprehension'

beforeEach(() => {
  messagesCreateMock.mockReset()
})

// ============================================================================
// Helpers
// ============================================================================

function buildResponse(payload: Record<string, unknown>, opts: { input?: number; output?: number } = {}) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload),
      },
    ],
    usage: {
      input_tokens: opts.input ?? 100,
      output_tokens: opts.output ?? 50,
    },
  }
}

function fullExtractedFields(overrides: Record<string, unknown> = {}) {
  return {
    nombre: null,
    telefono: null,
    sede_preferida: null,
    servicio_interes: null,
    cedula: null,
    fecha_preferida: null,
    fecha_vaga: null,
    preferencia_jornada: null,
    horario_seleccionado: null,
    ...overrides,
  }
}

function fullClassification(overrides: Record<string, unknown> = {}) {
  return {
    category: 'datos',
    sentiment: 'neutro',
    idioma: 'es',
    ...overrides,
  }
}

// ============================================================================
// Happy path: lead-capture turn 1
// ============================================================================

describe('comprehend — lead-capture happy path', () => {
  it('parses intent=datos with nombre + telefono extracted', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'datos',
          secondary: 'ninguno',
          confidence: 95,
          reasoning: 'lead capture turn 1',
        },
        extracted_fields: fullExtractedFields({
          nombre: 'Juan Perez',
          telefono: '573001234567',
        }),
        classification: fullClassification({ category: 'datos' }),
      }),
    )

    const result = await comprehend('Juan Perez, 3001234567', [], {}, [])
    expect(result.analysis.intent.primary).toBe('datos')
    expect(result.analysis.extracted_fields.nombre).toBe('Juan Perez')
    expect(result.analysis.extracted_fields.telefono).toBe('573001234567')
    expect(result.tokensUsed).toBe(150)
  })

  it('parses intent=datos with sede_preferida=cabecera', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'datos',
          secondary: 'ninguno',
          confidence: 90,
          reasoning: 'datos + sede',
        },
        extracted_fields: fullExtractedFields({
          nombre: 'Maria Lopez',
          telefono: '573009876543',
          sede_preferida: 'cabecera',
        }),
        classification: fullClassification(),
      }),
    )

    const result = await comprehend(
      'Maria Lopez, 3009876543, cabecera',
      [],
      {},
      [],
    )
    expect(result.analysis.extracted_fields.sede_preferida).toBe('cabecera')
  })
})

// ============================================================================
// quiero_agendar without slots
// ============================================================================

describe('comprehend — agendamiento intents', () => {
  it('parses intent=quiero_agendar without extracted fields', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'quiero_agendar',
          secondary: 'ninguno',
          confidence: 92,
          reasoning: 'directa solicitud',
        },
        extracted_fields: fullExtractedFields(),
        classification: fullClassification({ category: 'pregunta', sentiment: 'positivo' }),
      }),
    )

    const result = await comprehend('quiero agendar una cita', [], {}, [])
    expect(result.analysis.intent.primary).toBe('quiero_agendar')
    expect(result.analysis.intent.confidence).toBe(92)
    expect(result.analysis.extracted_fields.nombre).toBeNull()
  })

  it('parses intent=saludo + secondary=precio_servicio (mixed message)', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'saludo',
          secondary: 'precio_servicio',
          confidence: 88,
          reasoning: 'saludo + pregunta precio',
        },
        extracted_fields: fullExtractedFields({ servicio_interes: 'brackets_zafiro' }),
        classification: fullClassification({ category: 'mixto' }),
      }),
    )

    const result = await comprehend(
      'Hola, cuanto cuestan los brackets de zafiro?',
      [],
      {},
      [],
    )
    expect(result.analysis.intent.primary).toBe('saludo')
    expect(result.analysis.intent.secondary).toBe('precio_servicio')
    expect(result.analysis.extracted_fields.servicio_interes).toBe('brackets_zafiro')
  })
})

// ============================================================================
// English idioma detection
// ============================================================================

describe('comprehend — english idioma classification', () => {
  it('parses idioma=en for english messages', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'otro',
          secondary: 'ninguno',
          confidence: 75,
          reasoning: 'english msg, no clear dental intent',
        },
        extracted_fields: fullExtractedFields(),
        classification: fullClassification({ category: 'irrelevante', idioma: 'en' }),
      }),
    )

    const result = await comprehend('hello, do you speak english?', [], {}, [])
    expect(result.analysis.classification.idioma).toBe('en')
  })
})

// ============================================================================
// Malformed intent fallback (sanitization to 'otro')
// ============================================================================

describe('comprehend — malformed intent sanitization', () => {
  it('sanitizes unknown intent.primary to "otro"', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'totally_invalid_xyz',
          secondary: 'ninguno',
          confidence: 30,
          reasoning: 'unclear',
        },
        extracted_fields: fullExtractedFields(),
        classification: fullClassification({ category: 'irrelevante' }),
      }),
    )

    const result = await comprehend('xyzqwerty', [], {}, [])
    // Sanitization in parseAnalysis: unknown enum -> 'otro'
    expect(result.analysis.intent.primary).toBe('otro')
  })

  it('sanitizes unknown intent.secondary to "ninguno"', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'datos',
          secondary: 'invented_secondary',
          confidence: 80,
          reasoning: 'datos with invalid secondary',
        },
        extracted_fields: fullExtractedFields({ nombre: 'Juan' }),
        classification: fullClassification(),
      }),
    )

    const result = await comprehend('Juan', [], {}, [])
    expect(result.analysis.intent.secondary).toBe('ninguno')
  })
})

// ============================================================================
// Invalid JSON / no text content -> errors
// ============================================================================

describe('comprehend — error paths', () => {
  it('throws when Claude returns non-JSON text', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'this is not JSON at all' }],
      usage: { input_tokens: 50, output_tokens: 10 },
    })

    await expect(comprehend('hola', [], {}, [])).rejects.toThrow(/Invalid JSON/i)
  })

  it('throws when Claude response has no text content block', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'tu_1', name: 'unused', input: {} }],
      usage: { input_tokens: 50, output_tokens: 10 },
    })

    await expect(comprehend('hola', [], {}, [])).rejects.toThrow(/No text content/i)
  })
})
