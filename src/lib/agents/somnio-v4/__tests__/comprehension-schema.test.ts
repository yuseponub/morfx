/**
 * Tests for somnio-v4 comprehension-schema.ts (D-10, D-63).
 *
 * Coverage:
 * - Test 1: Schema válido con intent_confidence=0.85 → parses ok
 * - Test 2: intent_confidence=1.5 → throws (max 1)
 * - Test 3: intent_confidence=-0.1 → throws (min 0)
 * - Test 4: intent_confidence_reasoning omitido → parses ok (optional — D-68)
 * - Test 5: intent.primary fuera de V4_INTENTS → throws
 *
 * Extensión v4-hybrid-template-rag-turn (D-01/D-04):
 * - Campos nullable secondary_confidence, secondary_confidence_reasoning, secondary_query
 *
 * Standalone: somnio-sales-v4
 */

import { describe, it, expect } from 'vitest'
import { MessageAnalysisSchema } from '../comprehension-schema'

// ============================================================================
// Fixtures
// ============================================================================

function baseValidPayload(): Record<string, unknown> {
  return {
    intent: {
      primary: 'precio',
      secondary: 'ninguno',
      confidence: 95,
      reasoning: 'Pregunta directa por precio',
      intent_confidence: 0.95,
      intent_confidence_reasoning: 'Pregunta universal-clara',
      // v4-hybrid-template-rag-turn D-01/D-04 — null when secondary='ninguno'
      secondary_confidence: null,
      secondary_confidence_reasoning: null,
      secondary_query: null,
    },
    extracted_fields: {
      nombre: null,
      apellido: null,
      telefono: null,
      ciudad: null,
      departamento: null,
      direccion: null,
      barrio: null,
      correo: null,
      indicaciones_extra: null,
      cedula_recoge: null,
      pack: null,
      entrega_oficina: null,
      menciona_inter: null,
    },
    classification: {
      category: 'pregunta',
      sentiment: 'neutro',
    },
    negations: {
      correo: false,
      telefono: false,
      barrio: false,
      cedula_recoge: false,
    },
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('MessageAnalysisSchema — V4 intent_confidence (D-10, D-63)', () => {
  it('Test 1: válido con intent_confidence=0.85 → parses ok', () => {
    const payload = baseValidPayload()
    ;(payload.intent as Record<string, unknown>).intent_confidence = 0.85

    const result = MessageAnalysisSchema.safeParse(payload)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.intent.intent_confidence).toBe(0.85)
    }
  })

  it('Test 2: intent_confidence=1.5 → throws (max 1)', () => {
    const payload = baseValidPayload()
    ;(payload.intent as Record<string, unknown>).intent_confidence = 1.5

    const result = MessageAnalysisSchema.safeParse(payload)

    expect(result.success).toBe(false)
    if (!result.success) {
      const issuePaths = result.error.issues.map(i => i.path.join('.'))
      expect(issuePaths).toContain('intent.intent_confidence')
    }
  })

  it('Test 3: intent_confidence=-0.1 → throws (min 0)', () => {
    const payload = baseValidPayload()
    ;(payload.intent as Record<string, unknown>).intent_confidence = -0.1

    const result = MessageAnalysisSchema.safeParse(payload)

    expect(result.success).toBe(false)
    if (!result.success) {
      const issuePaths = result.error.issues.map(i => i.path.join('.'))
      expect(issuePaths).toContain('intent.intent_confidence')
    }
  })

  it('Test 4: intent_confidence_reasoning omitido → parses ok (D-68 optional)', () => {
    const payload = baseValidPayload()
    delete (payload.intent as Record<string, unknown>).intent_confidence_reasoning

    const result = MessageAnalysisSchema.safeParse(payload)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.intent.intent_confidence_reasoning).toBeUndefined()
    }
  })

  it('Test 5: intent.primary fuera de V4_INTENTS → throws', () => {
    const payload = baseValidPayload()
    ;(payload.intent as Record<string, unknown>).primary = 'fake_intent_xyz'

    const result = MessageAnalysisSchema.safeParse(payload)

    expect(result.success).toBe(false)
    if (!result.success) {
      const issuePaths = result.error.issues.map(i => i.path.join('.'))
      expect(issuePaths).toContain('intent.primary')
    }
  })

  it('boundary: intent_confidence=0 (min) parses ok', () => {
    const payload = baseValidPayload()
    ;(payload.intent as Record<string, unknown>).intent_confidence = 0

    const result = MessageAnalysisSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('boundary: intent_confidence=1 (max) parses ok', () => {
    const payload = baseValidPayload()
    ;(payload.intent as Record<string, unknown>).intent_confidence = 1

    const result = MessageAnalysisSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// D-01/D-04 — secondary_confidence + secondary_query fields
// ============================================================================

describe('secondary intent coverage fields (D-01/D-04)', () => {
  it('secondary fields present (covered+low) — secondary_confidence=0.25 accepted', () => {
    const payload = baseValidPayload()
    const intent = payload.intent as Record<string, unknown>
    intent.secondary = 'contraindicaciones'
    intent.secondary_confidence = 0.25
    intent.secondary_confidence_reasoning = 'Pregunta sobre apnea — fuera del scope cardíaco del template'
    intent.secondary_query = 'puedo tomarlo si tengo apnea?'

    const result = MessageAnalysisSchema.safeParse(payload)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.intent.secondary_confidence).toBe(0.25)
      expect(result.data.intent.secondary_query).toBe('puedo tomarlo si tengo apnea?')
    }
  })

  it('secondary fields null when ninguno — all three nullable fields accepted as null', () => {
    const payload = baseValidPayload()
    const intent = payload.intent as Record<string, unknown>
    intent.secondary = 'ninguno'
    intent.secondary_confidence = null
    intent.secondary_confidence_reasoning = null
    intent.secondary_query = null

    const result = MessageAnalysisSchema.safeParse(payload)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.intent.secondary_confidence).toBeNull()
      expect(result.data.intent.secondary_confidence_reasoning).toBeNull()
      expect(result.data.intent.secondary_query).toBeNull()
    }
  })

  it('secondary_confidence wrong type rejected — string fails validation', () => {
    const payload = baseValidPayload()
    const intent = payload.intent as Record<string, unknown>
    intent.secondary = 'contraindicaciones'
    intent.secondary_confidence = 'high'
    intent.secondary_confidence_reasoning = 'test'
    intent.secondary_query = 'pregunta?'

    const result = MessageAnalysisSchema.safeParse(payload)

    expect(result.success).toBe(false)
    if (!result.success) {
      const issuePaths = result.error.issues.map(i => i.path.join('.'))
      expect(issuePaths).toContain('intent.secondary_confidence')
    }
  })
})
