// ============================================================================
// Tests for sub-loop/output-schema.ts — LoopOutcomeSchema (D-62 enforcement).
// Standalone: somnio-sales-v4 / Plan 05 / Task 5.
//
// Coverage:
//   - Test 1: válido template → parses ok
//   - Test 2: válido canonical con sourceTopic + nuncaDecirRules → parses ok
//   - Test 3: válido no_match con responseTemplate=handoff_humano → parses ok
//   - Test 4: no_match con responseTemplate≠handoff_humano → throws (D-57 literal)
//   - Test 5: payload con freeText:'foo' bypassa schema (D-62 — sin variante)
//   - Test 6: canonical con requiresHuman=true → throws (canonical es false estructural)
// ============================================================================

import { describe, it, expect } from 'vitest'
import { LoopOutcomeSchema, type LoopOutcome } from '../output-schema'

describe('LoopOutcomeSchema', () => {
  it('parses a valid template outcome (Test 1)', () => {
    const payload = {
      status: 'template' as const,
      responseTemplate: 'pendiente_promo',
      requiresHuman: false as const,
      reason: 'state machine ambiguous',
    }
    const parsed = LoopOutcomeSchema.parse(payload)
    expect(parsed.status).toBe('template')
    if (parsed.status === 'template') {
      expect(parsed.responseTemplate).toBe('pendiente_promo')
      expect(parsed.requiresHuman).toBe(false)
    }
  })

  it('parses a valid canonical outcome with sourceTopic + nuncaDecirRules (Test 2)', () => {
    const payload = {
      status: 'canonical' as const,
      canonicalText: 'El Elixir contiene melatonina + L-teanina + magnesio.',
      sourceTopic: 'producto_ingredientes',
      nuncaDecirRules: ['No prometer cura del insomnio', 'No mencionar dosis específicas'],
      requiresHuman: false as const,
      reason: 'low_confidence — KB hit found',
    }
    const parsed = LoopOutcomeSchema.parse(payload)
    expect(parsed.status).toBe('canonical')
    if (parsed.status === 'canonical') {
      expect(parsed.canonicalText).toMatch(/Elixir/)
      expect(parsed.sourceTopic).toBe('producto_ingredientes')
      expect(parsed.nuncaDecirRules).toHaveLength(2)
    }
  })

  it('parses a valid no_match with responseTemplate=handoff_humano (Test 3)', () => {
    const payload = {
      status: 'no_match' as const,
      responseTemplate: 'handoff_humano' as const,
      requiresHuman: true as const,
      reason: 'low_confidence_no_knowledge_match',
      knowledgeQueried: ['producto_ingredientes', 'devoluciones'],
    }
    const parsed = LoopOutcomeSchema.parse(payload)
    expect(parsed.status).toBe('no_match')
    if (parsed.status === 'no_match') {
      expect(parsed.responseTemplate).toBe('handoff_humano')
      expect(parsed.requiresHuman).toBe(true)
      expect(parsed.knowledgeQueried).toEqual(['producto_ingredientes', 'devoluciones'])
    }
  })

  it('throws on no_match with responseTemplate≠handoff_humano (D-57 literal — Test 4)', () => {
    const payload = {
      status: 'no_match',
      responseTemplate: 'something_else',
      requiresHuman: true,
      reason: 'fake',
      knowledgeQueried: [],
    }
    expect(() => LoopOutcomeSchema.parse(payload)).toThrow()
  })

  it('strips/rejects payloads with freeText variant (D-62 — sin variante — Test 5)', () => {
    const payload = {
      status: 'freeText',
      text: 'foo',
    }
    // status='freeText' no está en la unión discriminada → parse falla.
    expect(() => LoopOutcomeSchema.parse(payload)).toThrow()
  })

  it('throws on canonical with requiresHuman=true (estructural false — Test 6)', () => {
    const payload = {
      status: 'canonical',
      canonicalText: 'foo',
      sourceTopic: 'topic',
      requiresHuman: true, // canonical exige z.literal(false)
      reason: 'bad',
    }
    expect(() => LoopOutcomeSchema.parse(payload)).toThrow()
  })

  it('type-check: LoopOutcome type is exported and usable', () => {
    // Compile-time only check (won't fail in runtime if types are right).
    const example: LoopOutcome = {
      status: 'template',
      responseTemplate: 'saludo',
      requiresHuman: false,
      reason: 'ok',
    }
    expect(example.status).toBe('template')
  })
})
