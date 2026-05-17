// ============================================================================
// Tests for sub-loop/output-schema.ts — LoopOutcomeSchema FLAT (Plan 03 refactor).
//
// Standalone: somnio-v4-rag-generative / Plan 03.
//
// Plan 03 RAG-generative refactor del schema:
// - status enum 'generated' / 'template' / 'no_match' (canonical ELIMINADO — D-24).
// - responseText / responseConfidence / confidenceRationale agregados.
// - canonicalText eliminado.
// - Invariants 'generated' actualizado; 'template' y 'no_match' preservados (D-12).
//
// Coverage:
//   Schema (Tests 1-7):
//     1. parses valid 'generated' (responseText/sourceTopic/responseConfidence non-null)
//     2. parses valid 'template' (responseTemplate non-null) — preservado D-12
//     3. parses valid 'no_match' (responseTemplate='handoff_humano', requiresHuman=true)
//     4. rejects status fuera del enum
//     5. rejects 'canonical' literal (eliminado del enum — D-24)
//     6. rejects requiresHuman not boolean
//     7. accepts mixed nullable fields (no failure si fields opcionales son null)
//
//   validateLoopOutcomeInvariants (Tests 8-14):
//     8. valid 'generated' con todos los fields non-null → { ok: true }
//     9. 'generated' con responseText === null → { ok: false, violation: generated_missing_responseText }
//    10. 'generated' con sourceTopic === null → { ok: false, violation: generated_missing_sourceTopic }
//    11. 'generated' con responseConfidence === null → { ok: false, violation: generated_missing_responseConfidence }
//    12. 'template' con responseTemplate === null → preservado D-12
//    13. 'no_match' con requiresHuman === false → preservado D-12
//    14. 'no_match' con responseTemplate !== 'handoff_humano' → preservado D-12
// ============================================================================

import { describe, it, expect } from 'vitest'
import { LoopOutcomeSchema, validateLoopOutcomeInvariants, type LoopOutcome } from '../output-schema'

describe('LoopOutcomeSchema (Plan 03 RAG-generative refactor)', () => {
  it('Test 1: parses a valid generated outcome', () => {
    const valid = {
      status: 'generated',
      responseText: 'El Elixir contiene melatonina + L-teanina + magnesio.',
      sourceTopic: 'producto_ingredientes',
      responseConfidence: 0.80,
      confidenceRationale: 'Material cubre la pregunta específica del cliente.',
      nuncaDecirRules: ['No prometer cura del insomnio', 'No mencionar dosis específicas'],
      responseTemplate: null,
      knowledgeQueried: ['producto_ingredientes'],
      requiresHuman: false,
      reason: 'rag_generated',
    }
    const result = LoopOutcomeSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('generated')
      expect(result.data.responseText).toMatch(/Elixir/)
      expect(result.data.sourceTopic).toBe('producto_ingredientes')
      expect(result.data.responseConfidence).toBe(0.80)
      expect(result.data.nuncaDecirRules).toHaveLength(2)
      expect(result.data.requiresHuman).toBe(false)
    }
  })

  it('Test 2: parses a valid template outcome (path legacy crm_mutation/cas_reject — D-12)', () => {
    const valid = {
      status: 'template',
      responseTemplate: 'saludo',
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'state machine ambiguous',
    }
    const result = LoopOutcomeSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('template')
      expect(result.data.responseTemplate).toBe('saludo')
      expect(result.data.responseText).toBeNull()
    }
  })

  it('Test 3: parses a valid no_match outcome', () => {
    const valid = {
      status: 'no_match',
      responseTemplate: 'handoff_humano',
      knowledgeQueried: ['producto_ingredientes', 'devoluciones'],
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      requiresHuman: true,
      reason: 'low_response_confidence',
    }
    const result = LoopOutcomeSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('no_match')
      expect(result.data.responseTemplate).toBe('handoff_humano')
      expect(result.data.requiresHuman).toBe(true)
      expect(result.data.knowledgeQueried).toEqual(['producto_ingredientes', 'devoluciones'])
    }
  })

  it('Test 4: rejects status not in enum', () => {
    const invalid = {
      status: 'foo',
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'invalid status',
    }
    expect(LoopOutcomeSchema.safeParse(invalid).success).toBe(false)
  })

  it('Test 5: rejects "canonical" literal (eliminado del enum — D-24)', () => {
    const invalid = {
      status: 'canonical',  // ya no existe en el enum
      responseText: 'text',
      sourceTopic: 'topic',
      responseConfidence: 0.9,
      confidenceRationale: 'r',
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    expect(LoopOutcomeSchema.safeParse(invalid).success).toBe(false)
  })

  it('Test 6: rejects requiresHuman not boolean', () => {
    const invalid = {
      status: 'template',
      responseTemplate: 'saludo',
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      knowledgeQueried: null,
      requiresHuman: 'yes', // string en vez de boolean
      reason: 'invalid type',
    }
    expect(LoopOutcomeSchema.safeParse(invalid).success).toBe(false)
  })

  it('Test 7: accepts mixed nullable fields (all explicit nulls — invariant FAIL, schema OK)', () => {
    // Schema flat acepta combinaciones que validateLoopOutcomeInvariants detectaría.
    const valid = {
      status: 'generated',
      responseText: null, // viola invariante 'generated' — schema OK, invariant FAIL
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    expect(LoopOutcomeSchema.safeParse(valid).success).toBe(true)
  })
})

describe('validateLoopOutcomeInvariants (Plan 03 — post-hoc enforcement)', () => {
  it('Test 8: valid generated with all fields non-null returns { ok: true }', () => {
    const output: LoopOutcome = {
      status: 'generated',
      responseText: 'redactado por Gemini Flash',
      sourceTopic: 'topic_x',
      responseConfidence: 0.80,
      confidenceRationale: 'rationale',
      nuncaDecirRules: ['regla 1'],
      responseTemplate: null,
      knowledgeQueried: ['topic_x'],
      requiresHuman: false,
      reason: 'ok',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(true)
    expect(result.violation).toBeUndefined()
  })

  it('Test 9: generated with responseText === null returns generated_missing_responseText', () => {
    const output: LoopOutcome = {
      status: 'generated',
      responseText: null,
      sourceTopic: 'topic_x',
      responseConfidence: 0.80,
      confidenceRationale: 'r',
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('generated_missing_responseText')
  })

  it('Test 10: generated with sourceTopic === null returns generated_missing_sourceTopic', () => {
    const output: LoopOutcome = {
      status: 'generated',
      responseText: 'text',
      sourceTopic: null,
      responseConfidence: 0.80,
      confidenceRationale: 'r',
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('generated_missing_sourceTopic')
  })

  it('Test 11: generated with responseConfidence === null returns generated_missing_responseConfidence', () => {
    const output: LoopOutcome = {
      status: 'generated',
      responseText: 'text',
      sourceTopic: 'topic',
      responseConfidence: null,
      confidenceRationale: 'r',
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('generated_missing_responseConfidence')
  })

  it('Test 12: template with responseTemplate === null returns template_missing_responseTemplate (D-12 preservado)', () => {
    const output: LoopOutcome = {
      status: 'template',
      responseTemplate: null,
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('template_missing_responseTemplate')
  })

  it('Test 13: no_match with requiresHuman === false returns no_match_requiresHuman_must_be_true (D-12 preservado)', () => {
    const output: LoopOutcome = {
      status: 'no_match',
      responseTemplate: 'handoff_humano',
      knowledgeQueried: ['topic_a'],
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      requiresHuman: false,
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('no_match_requiresHuman_must_be_true')
  })

  it('Test 14: no_match with responseTemplate !== handoff_humano returns violation (D-12 preservado)', () => {
    const output: LoopOutcome = {
      status: 'no_match',
      responseTemplate: 'something_else',
      knowledgeQueried: [],
      responseText: null,
      sourceTopic: null,
      responseConfidence: null,
      confidenceRationale: null,
      nuncaDecirRules: null,
      requiresHuman: true,
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('no_match_responseTemplate_must_be_handoff_humano')
  })

  it('Test 15: generated with requiresHuman=true returns generated_requiresHuman_must_be_false', () => {
    const output: LoopOutcome = {
      status: 'generated',
      responseText: 'text',
      sourceTopic: 'topic',
      responseConfidence: 0.80,
      confidenceRationale: 'r',
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: true, // INVARIANT — should be false
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('generated_requiresHuman_must_be_false')
  })
})
