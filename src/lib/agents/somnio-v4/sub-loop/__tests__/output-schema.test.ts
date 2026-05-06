// ============================================================================
// Tests for sub-loop/output-schema.ts — LoopOutcomeSchema FLAT (D-29 RE-SHAPE).
//
// Standalone: somnio-sales-v4-runtime-wiring / Plan 02 / Task 1.
//
// RESEARCH H-1: el schema previo (z.discriminatedUnion + z.literal + z.record)
// NUNCA corrió contra API real — todos los providers lo rechazan. Estos tests
// reemplazan los anteriores (que asumían discriminated union) con cases del
// nuevo shape FLAT compatible con OpenAI strict + Gemini + Anthropic.
//
// Coverage:
//   Schema (Tests 1-6):
//     1. parses valid 'canonical' (canonicalText/sourceTopic/nuncaDecirRules non-null)
//     2. parses valid 'template' (responseTemplate non-null, otros nullable=null)
//     3. parses valid 'no_match' (responseTemplate='handoff_humano', requiresHuman=true)
//     4. rejects status fuera del enum
//     5. rejects requiresHuman not boolean
//     6. accepts mixed nullable fields (no failure si fields opcionales son null)
//
//   validateLoopOutcomeInvariants (Tests 7-10):
//     7. valid 'canonical' con canonicalText non-null → { ok: true }
//     8. 'canonical' con canonicalText === null → { ok: false, violation: 'canonical_missing_canonicalText' }
//     9. 'no_match' con requiresHuman === false → { ok: false, ... }
//    10. 'template' con responseTemplate === null → { ok: false, ... }
// ============================================================================

import { describe, it, expect } from 'vitest'
import { LoopOutcomeSchema, validateLoopOutcomeInvariants, type LoopOutcome } from '../output-schema'

describe('LoopOutcomeSchema (D-29 flat — Plan 02 re-shape)', () => {
  it('Test 1: parses a valid canonical outcome', () => {
    const valid = {
      status: 'canonical',
      canonicalText: 'El Elixir contiene melatonina + L-teanina + magnesio.',
      sourceTopic: 'producto_ingredientes',
      nuncaDecirRules: ['No prometer cura del insomnio', 'No mencionar dosis específicas'],
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'low_confidence — KB hit found',
    }
    const result = LoopOutcomeSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('canonical')
      expect(result.data.canonicalText).toMatch(/Elixir/)
      expect(result.data.sourceTopic).toBe('producto_ingredientes')
      expect(result.data.nuncaDecirRules).toHaveLength(2)
      expect(result.data.requiresHuman).toBe(false)
    }
  })

  it('Test 2: parses a valid template outcome', () => {
    const valid = {
      status: 'template',
      responseTemplate: 'saludo',
      canonicalText: null,
      sourceTopic: null,
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
      expect(result.data.canonicalText).toBeNull()
    }
  })

  it('Test 3: parses a valid no_match outcome', () => {
    const valid = {
      status: 'no_match',
      responseTemplate: 'handoff_humano',
      knowledgeQueried: ['producto_ingredientes', 'devoluciones'],
      canonicalText: null,
      sourceTopic: null,
      nuncaDecirRules: null,
      requiresHuman: true,
      reason: 'low_confidence_no_knowledge_match',
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
      canonicalText: null,
      sourceTopic: null,
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'invalid status',
    }
    expect(LoopOutcomeSchema.safeParse(invalid).success).toBe(false)
  })

  it('Test 5: rejects requiresHuman not boolean', () => {
    const invalid = {
      status: 'template',
      responseTemplate: 'saludo',
      canonicalText: null,
      sourceTopic: null,
      nuncaDecirRules: null,
      knowledgeQueried: null,
      requiresHuman: 'yes', // string en vez de boolean
      reason: 'invalid type',
    }
    expect(LoopOutcomeSchema.safeParse(invalid).success).toBe(false)
  })

  it('Test 6: accepts mixed nullable fields (all explicit nulls)', () => {
    // Caso defensivo: schema flat acepta combinaciones que un consumer responsable
    // detectaría con validateLoopOutcomeInvariants. Aquí el schema NO falla — la
    // invariante post-hoc es la que catch.
    const valid = {
      status: 'canonical',
      canonicalText: null, // viola invariante (canonical sin canonicalText) — schema OK, invariant FAIL
      sourceTopic: null,
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    expect(LoopOutcomeSchema.safeParse(valid).success).toBe(true)
  })
})

describe('validateLoopOutcomeInvariants (D-29 — post-hoc enforcement)', () => {
  it('Test 7: valid canonical with canonicalText non-null returns { ok: true }', () => {
    const output: LoopOutcome = {
      status: 'canonical',
      canonicalText: 'verbatim KB',
      sourceTopic: 'topic_x',
      nuncaDecirRules: ['regla 1'],
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'ok',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(true)
    expect(result.violation).toBeUndefined()
  })

  it('Test 8: canonical with canonicalText === null returns { ok: false, violation: canonical_missing_canonicalText }', () => {
    const output: LoopOutcome = {
      status: 'canonical',
      canonicalText: null,
      sourceTopic: 'topic_x',
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('canonical_missing_canonicalText')
  })

  it('Test 9: no_match with requiresHuman === false returns { ok: false }', () => {
    const output: LoopOutcome = {
      status: 'no_match',
      responseTemplate: 'handoff_humano',
      knowledgeQueried: ['topic_a'],
      canonicalText: null,
      sourceTopic: null,
      nuncaDecirRules: null,
      requiresHuman: false, // INVARIANT VIOLATION — should be true
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('no_match_requiresHuman_must_be_true')
  })

  it('Test 10: template with responseTemplate === null returns { ok: false, violation: template_missing_responseTemplate }', () => {
    const output: LoopOutcome = {
      status: 'template',
      responseTemplate: null, // INVARIANT VIOLATION
      canonicalText: null,
      sourceTopic: null,
      nuncaDecirRules: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('template_missing_responseTemplate')
  })

  it('bonus: canonical with sourceTopic === null returns canonical_missing_sourceTopic', () => {
    const output: LoopOutcome = {
      status: 'canonical',
      canonicalText: 'verbatim',
      sourceTopic: null,
      nuncaDecirRules: null,
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('canonical_missing_sourceTopic')
  })

  it('bonus: no_match with responseTemplate !== handoff_humano returns violation', () => {
    const output: LoopOutcome = {
      status: 'no_match',
      responseTemplate: 'something_else',
      knowledgeQueried: [],
      canonicalText: null,
      sourceTopic: null,
      nuncaDecirRules: null,
      requiresHuman: true,
      reason: 'r',
    }
    const result = validateLoopOutcomeInvariants(output)
    expect(result.ok).toBe(false)
    expect(result.violation).toBe('no_match_responseTemplate_must_be_handoff_humano')
  })
})
