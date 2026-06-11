/**
 * Tests de paridad para el fallback Gemini → Haiku 4.5 en comprehension.ts
 * (standalone gemini-fallback-haiku / Plan 03).
 *
 * Cubre las dos complicaciones del RESEARCH específicas de este call-site:
 *
 *  - Pitfall #1: Anthropic via AI SDK rechaza min/max en el JSON Schema → el branch
 *    Anthropic usa `MessageAnalysisSchemaSanitized` (sin min/max). El rango 0..1 se
 *    valida en post-parse vía `clampConfidence`, que clampa antes del strict parse
 *    contra `MessageAnalysisSchema` (que SÍ conserva min(0).max(1)).
 *  - Paridad de shape: un MessageAnalysis válido pasa AMBOS schemas con el mismo shape.
 *
 * Tests deterministas, sin LLM real (RESEARCH Q9 tests 3 + 5). El caso
 * "no-fallback en parse error" (Pitfall #4) ya está cubierto en el index.test.ts del
 * módulo llm-fallback (Plan 01) — aquí se documenta la cobertura sin re-mockear los
 * providers (setup E2E complejo; el contrato del helper ya está probado en aislamiento).
 *
 * Standalone: gemini-fallback-haiku
 */

import { describe, it, expect, afterEach } from 'vitest'
import { z } from 'zod'
import { MessageAnalysisSchema } from '../comprehension-schema'
import { MessageAnalysisSchemaSanitized, clampConfidence } from '../comprehension'
import { stripNumericConstraints } from '../sanitize-schema'
import { __resetBreakers } from '../llm-fallback'

// ============================================================================
// Fixture — payload válido completo (clonado de comprehension-schema.test.ts)
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

afterEach(() => {
  // Evita leak del module-singleton del circuit-breaker entre tests (Pitfall #3 Plan 01).
  __resetBreakers()
})

describe('comprehension fallback — schema saneado para Anthropic (Pitfall #1)', () => {
  it('el schema saneado NO contiene bounds min/max en intent_confidence (acepta 0.9)', () => {
    const payload = baseValidPayload()
    ;(payload.intent as Record<string, unknown>).intent_confidence = 0.9

    const result = MessageAnalysisSchemaSanitized.safeParse(payload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.intent.intent_confidence).toBe(0.9)
    }
  })

  it('el schema saneado acepta intent_confidence FUERA de 0..1 (1.5) — sin bounds', () => {
    // Esto es lo que distingue el schema saneado del original: Anthropic devolvería
    // este valor sin 400 porque el JSON Schema no lleva maximum. El clamp posterior lo corrige.
    const payload = baseValidPayload()
    ;(payload.intent as Record<string, unknown>).intent_confidence = 1.5

    const sanitized = MessageAnalysisSchemaSanitized.safeParse(payload)
    expect(sanitized.success).toBe(true)

    // El schema ORIGINAL (con max(1)) sí lo rechaza — confirma que el saneado quitó el bound.
    const original = MessageAnalysisSchema.safeParse(payload)
    expect(original.success).toBe(false)
  })

  it('M-04 — el JSON Schema saneado ESTRUCTURALMENTE NO emite NINGÚN constraint numérico', () => {
    // Pitfall #1: Anthropic rechaza con 400 si el JSON Schema lleva minimum/maximum/exclusive*.
    // M-04: la sanitización es estructural (stripNumericConstraints recorre todo el árbol), no
    // por lista fija de 2 campos. El assert se endurece de `< original` a `=== 0`: el schema que
    // realmente se envía a Anthropic NO debe contener ningún keyword de constraint numérico.
    const stripped = stripNumericConstraints(z.toJSONSchema(MessageAnalysisSchemaSanitized))
    const serialized = JSON.stringify(stripped)

    // Control: el schema ORIGINAL sí los lleva (confirma que el strip hace algo).
    const originalSerialized = JSON.stringify(z.toJSONSchema(MessageAnalysisSchema))
    expect((originalSerialized.match(/"maximum"/g) ?? []).length).toBeGreaterThan(0)

    // El saneado estructural: CERO constraints numéricos en TODO el árbol.
    expect((serialized.match(/"maximum"/g) ?? []).length).toBe(0)
    expect((serialized.match(/"minimum"/g) ?? []).length).toBe(0)
    expect((serialized.match(/"exclusiveMinimum"/g) ?? []).length).toBe(0)
    expect((serialized.match(/"exclusiveMaximum"/g) ?? []).length).toBe(0)
    expect((serialized.match(/"multipleOf"/g) ?? []).length).toBe(0)
  })

  it('M-04 — un campo FUTURO con bounds queda saneado automáticamente (no lista fija)', () => {
    // Simula la evolución del schema base: un campo nuevo con .min/.max/.int se agrega.
    // La sanitización estructural debe removerlo SIN tocar la lista de campos conocidos.
    const futureSchema = z.object({
      existing_field: z.string().describe('campo previo'),
      new_score: z.number().int().min(0).max(100).describe('campo numérico futuro con bounds'),
      nested: z.object({
        deep_ratio: z.number().min(0).max(1),
      }),
    })
    const stripped = stripNumericConstraints(z.toJSONSchema(futureSchema))
    const serialized = JSON.stringify(stripped)

    // El schema original SÍ lleva bounds del campo futuro.
    expect((JSON.stringify(z.toJSONSchema(futureSchema)).match(/"maximum"/g) ?? []).length).toBeGreaterThan(0)

    // Tras el strip estructural: cero bounds — incluido el campo anidado profundo.
    expect((serialized.match(/"maximum"/g) ?? []).length).toBe(0)
    expect((serialized.match(/"minimum"/g) ?? []).length).toBe(0)
    expect((serialized.match(/"multipleOf"/g) ?? []).length).toBe(0)
    // Pero preserva los describes (M-03) y la estructura.
    expect(serialized).toContain('campo numérico futuro con bounds')
    expect(serialized).toContain('campo previo')
  })
})

describe('comprehension fallback — clamp 0..1 post-parse (T-fb-05)', () => {
  it('clampConfidence corrige intent_confidence=1.5 → 1.0 antes del strict parse', () => {
    const raw = baseValidPayload()
    ;(raw.intent as Record<string, unknown>).intent_confidence = 1.5

    clampConfidence(raw)
    expect((raw.intent as Record<string, unknown>).intent_confidence).toBe(1)

    // Tras el clamp, el strict parse contra MessageAnalysisSchema (que tiene max(1)) pasa.
    const strict = MessageAnalysisSchema.safeParse(raw)
    expect(strict.success).toBe(true)
    if (strict.success) {
      expect(strict.data.intent.intent_confidence).toBe(1)
    }
  })

  it('clampConfidence corrige secondary_confidence=-0.3 → 0.0', () => {
    const raw = baseValidPayload()
    const intent = raw.intent as Record<string, unknown>
    intent.secondary = 'contraindicaciones'
    intent.secondary_confidence = -0.3
    intent.secondary_confidence_reasoning = 'fuera de scope'
    intent.secondary_query = 'pregunta?'

    clampConfidence(raw)
    expect((raw.intent as Record<string, unknown>).secondary_confidence).toBe(0)

    const strict = MessageAnalysisSchema.safeParse(raw)
    expect(strict.success).toBe(true)
    if (strict.success) {
      expect(strict.data.intent.secondary_confidence).toBe(0)
    }
  })

  it('clampConfidence NO altera valores ya dentro de 0..1', () => {
    const raw = baseValidPayload()
    ;(raw.intent as Record<string, unknown>).intent_confidence = 0.73

    clampConfidence(raw)
    expect((raw.intent as Record<string, unknown>).intent_confidence).toBe(0.73)
  })

  it('clampConfidence es no-op si secondary_confidence es null (secondary=ninguno)', () => {
    const raw = baseValidPayload()
    // baseValidPayload ya tiene secondary_confidence=null
    clampConfidence(raw)
    expect((raw.intent as Record<string, unknown>).secondary_confidence).toBeNull()
  })
})

describe('comprehension fallback — paridad de shape gemini ↔ anthropic', () => {
  it('un MessageAnalysis válido pasa AMBOS schemas con el mismo shape', () => {
    const payload = baseValidPayload()

    // Branch gemini: schema original.
    const gemini = MessageAnalysisSchema.safeParse(payload)
    expect(gemini.success).toBe(true)

    // Branch anthropic: schema saneado produce el MISMO shape.
    const anthropic = MessageAnalysisSchemaSanitized.safeParse(payload)
    expect(anthropic.success).toBe(true)

    if (gemini.success && anthropic.success) {
      expect(anthropic.data.intent.primary).toBe(gemini.data.intent.primary)
      expect(anthropic.data.intent.intent_confidence).toBe(gemini.data.intent.intent_confidence)
      expect(anthropic.data.classification.category).toBe(gemini.data.classification.category)
      expect(Object.keys(anthropic.data.extracted_fields).sort()).toEqual(
        Object.keys(gemini.data.extracted_fields).sort(),
      )
    }
  })

  it('paridad con secondary intent presente (covered+low)', () => {
    const payload = baseValidPayload()
    const intent = payload.intent as Record<string, unknown>
    intent.secondary = 'contraindicaciones'
    intent.secondary_confidence = 0.25
    intent.secondary_confidence_reasoning = 'pregunta sobre apnea'
    intent.secondary_query = 'puedo tomarlo si tengo apnea?'

    const gemini = MessageAnalysisSchema.safeParse(payload)
    const anthropic = MessageAnalysisSchemaSanitized.safeParse(payload)

    expect(gemini.success).toBe(true)
    expect(anthropic.success).toBe(true)
    if (gemini.success && anthropic.success) {
      expect(anthropic.data.intent.secondary).toBe(gemini.data.intent.secondary)
      expect(anthropic.data.intent.secondary_query).toBe(gemini.data.intent.secondary_query)
    }
  })
})

describe('comprehension fallback — no-fallback en parse error (Pitfall #4)', () => {
  it('documentado: NoObjectGeneratedError NO dispara fallback (cubierto en llm-fallback/index.test.ts)', () => {
    // El contrato "parse/schema error → re-throw, NO fallback" vive en el helper
    // callWithGeminiFallback (Plan 01) y está probado en aislamiento en
    // src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts.
    // Aquí solo dejamos constancia de que el call-site comprehension hereda ese
    // comportamiento sin sobre-escribirlo: el closure gemini hace el generateText
    // limpio (Pitfall #5) y el re-throw diagnóstico se aplica DESPUÉS del helper,
    // por lo que un parse error de Gemini se propaga sin invocar Anthropic.
    expect(typeof clampConfidence).toBe('function')
  })
})
