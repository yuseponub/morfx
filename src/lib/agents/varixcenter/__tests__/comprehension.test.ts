/**
 * Tests for varixcenter/comprehension.ts Haiku call + parsing.
 *
 * Standalone agent-varixcenter — Plan 04 Wave 2 Task 1.
 *
 * Pattern: mock `createInstrumentedAnthropic` to return a fake client whose
 * `messages.create` returns canned structured-output responses. Verifies:
 *   - intent=datos extraction (nombre + telefono + cedula + ciudad)
 *   - tipo_venas enum parsing
 *   - intent=quiero_agendar parsing (afirmativo post-saludo)
 *   - intent=saludo + secondary intent (ej: precio_tratamiento)
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
import { MessageAnalysisSchema } from '../comprehension-schema'
import { VARIX_INTENTS } from '../constants'

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
    cedula: null,
    ciudad: null,
    tipo_venas: null,
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
// Happy path: datos extraction (sin sede, con cedula + ciudad)
// ============================================================================

describe('comprehend — datos happy path', () => {
  it('parses intent=datos with nombre + telefono + cedula + ciudad extracted', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'datos',
          secondary: 'ninguno',
          confidence: 95,
          reasoning: 'datos del paciente',
        },
        extracted_fields: fullExtractedFields({
          nombre: 'Paola Mendez',
          telefono: '573001234567',
          cedula: '1098765432',
          ciudad: 'Bucaramanga',
        }),
        classification: fullClassification({ category: 'datos' }),
      }),
    )

    const result = await comprehend('Paola Mendez, CC 1098765432, 3001234567, Bucaramanga', [], {}, [])
    expect(result.analysis.intent.primary).toBe('datos')
    expect(result.analysis.extracted_fields.nombre).toBe('Paola Mendez')
    expect(result.analysis.extracted_fields.telefono).toBe('573001234567')
    expect(result.analysis.extracted_fields.cedula).toBe('1098765432')
    expect(result.analysis.extracted_fields.ciudad).toBe('Bucaramanga')
    expect(result.tokensUsed).toBe(150)
  })

  it('parses tipo_venas=vasitos enum', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'precio_tratamiento',
          secondary: 'ninguno',
          confidence: 90,
          reasoning: 'pregunta precio con tipo de venas',
        },
        extracted_fields: fullExtractedFields({ tipo_venas: 'vasitos' }),
        classification: fullClassification({ category: 'pregunta' }),
      }),
    )

    const result = await comprehend('cuanto cuesta tratar las arañitas?', [], {}, [])
    expect(result.analysis.extracted_fields.tipo_venas).toBe('vasitos')
  })

  it('parses tipo_venas=ambas enum', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'sintomas_descripcion',
          secondary: 'ninguno',
          confidence: 85,
          reasoning: 'describe ambos tipos',
        },
        extracted_fields: fullExtractedFields({ tipo_venas: 'ambas' }),
        classification: fullClassification({ category: 'pregunta' }),
      }),
    )

    const result = await comprehend('tengo de los dos tipos de venas', [], {}, [])
    expect(result.analysis.extracted_fields.tipo_venas).toBe('ambas')
  })
})

// ============================================================================
// quiero_agendar (afirmativo post-saludo — AMENDA D-12)
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

    const result = await comprehend('quiero agendar la valoracion', [], {}, [])
    expect(result.analysis.intent.primary).toBe('quiero_agendar')
    expect(result.analysis.intent.confidence).toBe(92)
    expect(result.analysis.extracted_fields.nombre).toBeNull()
  })

  it('parses intent=saludo + secondary=precio_tratamiento (mixed message)', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildResponse({
        intent: {
          primary: 'saludo',
          secondary: 'precio_tratamiento',
          confidence: 88,
          reasoning: 'saludo + pregunta precio',
        },
        extracted_fields: fullExtractedFields(),
        classification: fullClassification({ category: 'mixto' }),
      }),
    )

    const result = await comprehend('Hola, cuanto cuesta el tratamiento?', [], {}, [])
    expect(result.analysis.intent.primary).toBe('saludo')
    expect(result.analysis.intent.secondary).toBe('precio_tratamiento')
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
          reasoning: 'english msg, no clear intent',
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

// ============================================================================
// MessageAnalysisSchema — 24 intents válidos + tipo_venas mapping + sin sede (diseño §2)
// ============================================================================

function buildAnalysisPayload(overrides: {
  primary?: string
  secondary?: string
  tipo_venas?: 'grandes' | 'vasitos' | 'ambas' | null
} = {}) {
  return {
    intent: {
      primary: overrides.primary ?? 'datos',
      secondary: overrides.secondary ?? 'ninguno',
      confidence: 90,
      reasoning: 'schema test',
    },
    extracted_fields: {
      nombre: null, telefono: null, cedula: null, ciudad: null,
      tipo_venas: overrides.tipo_venas ?? null,
      fecha_preferida: null, fecha_vaga: null, preferencia_jornada: null, horario_seleccionado: null,
    },
    classification: { category: 'pregunta', sentiment: 'neutro', idioma: 'es' },
  }
}

describe('MessageAnalysisSchema — los 24 intents son válidos (diseño §1)', () => {
  it('VARIX_INTENTS tiene exactamente 24 intents', () => {
    expect(VARIX_INTENTS.length).toBe(24)
  })

  for (const intent of VARIX_INTENTS) {
    it(`schema acepta intent.primary="${intent}"`, () => {
      const parsed = MessageAnalysisSchema.safeParse(buildAnalysisPayload({ primary: intent }))
      expect(parsed.success).toBe(true)
    })
  }

  it('schema acepta secondary="ninguno"', () => {
    const parsed = MessageAnalysisSchema.safeParse(buildAnalysisPayload({ secondary: 'ninguno' }))
    expect(parsed.success).toBe(true)
  })

  it('schema rechaza un intent.primary inválido', () => {
    const parsed = MessageAnalysisSchema.safeParse(buildAnalysisPayload({ primary: 'intent_que_no_existe' }))
    expect(parsed.success).toBe(false)
  })
})

describe('MessageAnalysisSchema — tipo_venas enum mapping (diseño §2)', () => {
  it('acepta tipo_venas="vasitos" (arañitas/vasculares/venitas)', () => {
    const parsed = MessageAnalysisSchema.safeParse(buildAnalysisPayload({ tipo_venas: 'vasitos' }))
    expect(parsed.success).toBe(true)
  })

  it('acepta tipo_venas="grandes" (vena gruesa/pronunciada/várices grandes)', () => {
    const parsed = MessageAnalysisSchema.safeParse(buildAnalysisPayload({ tipo_venas: 'grandes' }))
    expect(parsed.success).toBe(true)
  })

  it('acepta tipo_venas="ambas" (las dos/de todo)', () => {
    const parsed = MessageAnalysisSchema.safeParse(buildAnalysisPayload({ tipo_venas: 'ambas' }))
    expect(parsed.success).toBe(true)
  })

  it('acepta tipo_venas=null (no mencionado)', () => {
    const parsed = MessageAnalysisSchema.safeParse(buildAnalysisPayload({ tipo_venas: null }))
    expect(parsed.success).toBe(true)
  })

  it('rechaza un valor tipo_venas fuera del enum', () => {
    const payload = buildAnalysisPayload()
    ;(payload.extracted_fields as Record<string, unknown>).tipo_venas = 'medianas'
    const parsed = MessageAnalysisSchema.safeParse(payload)
    expect(parsed.success).toBe(false)
  })
})

describe('MessageAnalysisSchema — sin campos de sede (diseño §2: 1 sola sede)', () => {
  it('el schema NO declara sede_preferida en extracted_fields', () => {
    const parsed = MessageAnalysisSchema.parse(buildAnalysisPayload())
    expect(Object.keys(parsed.extracted_fields)).not.toContain('sede_preferida')
    expect(Object.keys(parsed.extracted_fields)).not.toContain('sede')
  })

  it('un sede_preferida inyectado se descarta (no aparece en el output parseado)', () => {
    const payload = buildAnalysisPayload()
    ;(payload.extracted_fields as Record<string, unknown>).sede_preferida = 'Centro'
    const parsed = MessageAnalysisSchema.parse(payload)
    expect((parsed.extracted_fields as Record<string, unknown>).sede_preferida).toBeUndefined()
  })
})
