/**
 * Tests for computeSlots — per-intent coverage classifier (D-02/D-03/T-2).
 *
 * Standalone: v4-hybrid-template-rag-turn / Plan 02.
 *
 * Verifica los 4 casos de la matriz (D-02):
 *   - covered+covered → ambos templates, ragQuery null
 *   - covered+low    → template primary + RAG secondary, secondary.ragQuery = secondary_query
 *   - low+covered    → RAG primary (ragQuery = rawMessage) + template secondary
 *   - low+low        → RAG+RAG (primary ragQuery = rawMessage, secondary ragQuery = secondary_query)
 *
 * Edge cases:
 *   - secondary='ninguno' → secondary === null
 *   - razonamiento_libre primary → coverage='low', reason='razonamiento_libre'
 *   - 'otro' secondary → coverage='low', reason='razonamiento_libre'
 *   - secondaryConfidence=null con secondary!=ninguno → coverage='low', ragQuery fallback a rawMessage
 *
 * T-2: sub-query selection:
 *   - low PRIMARY  → ragQuery = rawMessage (mensaje crudo)
 *   - low SECONDARY → ragQuery = secondary_query (cuando disponible), fallback rawMessage
 */
import { describe, it, expect } from 'vitest'
import { computeSlots, type SlotPlan, type SlotDecision } from '../slots'

const RAW_MESSAGE = 'cuanto vale y lo puedo tomar si tengo apnea?'
const THRESHOLD = 0.7

describe('computeSlots — D-02/D-03 coverage matrix + T-2 sub-query selection', () => {

  // ============================================================
  // Case 1: covered + covered
  // ============================================================
  describe('covered+covered: precio@0.92 + contenido@0.85', () => {
    let result: SlotPlan

    beforeAll(() => {
      result = computeSlots({
        primaryIntent: 'precio',
        primaryConfidence: 0.92,
        secondaryIntent: 'contenido',
        secondaryConfidence: 0.85,
        secondaryQuery: null,
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
    })

    it('primary.coverage is "covered"', () => {
      expect(result.primary.coverage).toBe('covered')
    })

    it('primary.reason is null (happy path)', () => {
      expect(result.primary.reason).toBeNull()
    })

    it('primary.ragQuery is null (no RAG needed)', () => {
      expect(result.primary.ragQuery).toBeNull()
    })

    it('secondary is not null', () => {
      expect(result.secondary).not.toBeNull()
    })

    it('secondary.coverage is "covered"', () => {
      expect(result.secondary!.coverage).toBe('covered')
    })

    it('secondary.reason is null', () => {
      expect(result.secondary!.reason).toBeNull()
    })

    it('secondary.ragQuery is null', () => {
      expect(result.secondary!.ragQuery).toBeNull()
    })
  })

  // ============================================================
  // Case 2: covered + low
  // ============================================================
  describe('covered+low: precio@0.92 + contraindicaciones@0.25', () => {
    const SECONDARY_QUERY = 'puedo tomarlo si tengo apnea?'
    let result: SlotPlan

    beforeAll(() => {
      result = computeSlots({
        primaryIntent: 'precio',
        primaryConfidence: 0.92,
        secondaryIntent: 'contraindicaciones',
        secondaryConfidence: 0.25,
        secondaryQuery: SECONDARY_QUERY,
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
    })

    it('primary.coverage is "covered"', () => {
      expect(result.primary.coverage).toBe('covered')
    })

    it('primary.ragQuery is null', () => {
      expect(result.primary.ragQuery).toBeNull()
    })

    it('secondary.coverage is "low"', () => {
      expect(result.secondary!.coverage).toBe('low')
    })

    it('secondary.reason is "low_confidence"', () => {
      expect(result.secondary!.reason).toBe('low_confidence')
    })

    it('secondary.ragQuery === secondary_query (T-2: low secondary uses secondary_query)', () => {
      expect(result.secondary!.ragQuery).toBe(SECONDARY_QUERY)
    })
  })

  // ============================================================
  // Case 3: low + covered
  // ============================================================
  describe('low+covered: contraindicaciones@0.25 + tiempo_entrega@0.88', () => {
    let result: SlotPlan

    beforeAll(() => {
      result = computeSlots({
        primaryIntent: 'contraindicaciones',
        primaryConfidence: 0.25,
        secondaryIntent: 'tiempo_entrega',
        secondaryConfidence: 0.88,
        secondaryQuery: null,
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
    })

    it('primary.coverage is "low"', () => {
      expect(result.primary.coverage).toBe('low')
    })

    it('primary.reason is "low_confidence"', () => {
      expect(result.primary.reason).toBe('low_confidence')
    })

    it('primary.ragQuery === rawMessage (T-2: low primary uses raw message)', () => {
      expect(result.primary.ragQuery).toBe(RAW_MESSAGE)
    })

    it('secondary.coverage is "covered"', () => {
      expect(result.secondary!.coverage).toBe('covered')
    })

    it('secondary.ragQuery is null', () => {
      expect(result.secondary!.ragQuery).toBeNull()
    })
  })

  // ============================================================
  // Case 4: low + low
  // ============================================================
  describe('low+low: contraindicaciones@0.25 + dependencia@0.30', () => {
    const SECONDARY_QUERY = 'genera dependencia el producto?'
    let result: SlotPlan

    beforeAll(() => {
      result = computeSlots({
        primaryIntent: 'contraindicaciones',
        primaryConfidence: 0.25,
        secondaryIntent: 'dependencia',
        secondaryConfidence: 0.30,
        secondaryQuery: SECONDARY_QUERY,
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
    })

    it('primary.coverage is "low"', () => {
      expect(result.primary.coverage).toBe('low')
    })

    it('primary.ragQuery === rawMessage (T-2)', () => {
      expect(result.primary.ragQuery).toBe(RAW_MESSAGE)
    })

    it('secondary.coverage is "low"', () => {
      expect(result.secondary!.coverage).toBe('low')
    })

    it('secondary.ragQuery === secondary_query (T-2)', () => {
      expect(result.secondary!.ragQuery).toBe(SECONDARY_QUERY)
    })
  })

  // ============================================================
  // Edge: secondary === 'ninguno'
  // ============================================================
  describe('secondary none: precio@0.92 + ninguno', () => {
    let result: SlotPlan

    beforeAll(() => {
      result = computeSlots({
        primaryIntent: 'precio',
        primaryConfidence: 0.92,
        secondaryIntent: 'ninguno',
        secondaryConfidence: null,
        secondaryQuery: null,
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
    })

    it('secondary is null when secondaryIntent is "ninguno"', () => {
      expect(result.secondary).toBeNull()
    })

    it('primary is still evaluated correctly', () => {
      expect(result.primary.coverage).toBe('covered')
    })
  })

  // ============================================================
  // Edge: razonamiento_libre primary — escalates even at high confidence
  // ============================================================
  describe('razonamiento_libre primary: intent@0.90 (high confidence, but escalates)', () => {
    let result: SlotPlan

    beforeAll(() => {
      result = computeSlots({
        primaryIntent: 'razonamiento_libre',
        primaryConfidence: 0.90,
        secondaryIntent: 'ninguno',
        secondaryConfidence: null,
        secondaryQuery: null,
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
    })

    it('primary.coverage is "low" (razonamiento_libre always escalates)', () => {
      expect(result.primary.coverage).toBe('low')
    })

    it('primary.reason is "razonamiento_libre"', () => {
      expect(result.primary.reason).toBe('razonamiento_libre')
    })

    it('primary.ragQuery === rawMessage', () => {
      expect(result.primary.ragQuery).toBe(RAW_MESSAGE)
    })
  })

  // ============================================================
  // Edge: 'otro' secondary — escalates as razonamiento_libre (D-69)
  // ============================================================
  describe('"otro" secondary: precio@0.92 + otro@0.90', () => {
    let result: SlotPlan

    beforeAll(() => {
      result = computeSlots({
        primaryIntent: 'precio',
        primaryConfidence: 0.92,
        secondaryIntent: 'otro',
        secondaryConfidence: 0.90,
        secondaryQuery: null,
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
    })

    it('secondary.coverage is "low"', () => {
      expect(result.secondary!.coverage).toBe('low')
    })

    it('secondary.reason is "razonamiento_libre" (D-69 otro sumidero)', () => {
      expect(result.secondary!.reason).toBe('razonamiento_libre')
    })

    it('secondary.ragQuery falls back to rawMessage when secondary_query is null', () => {
      expect(result.secondary!.ragQuery).toBe(RAW_MESSAGE)
    })
  })

  // ============================================================
  // Edge: secondaryConfidence null but intent not ninguno → treat as 0 → low
  // ============================================================
  describe('secondaryConfidence null (not ninguno) → defensive low', () => {
    let result: SlotPlan

    beforeAll(() => {
      result = computeSlots({
        primaryIntent: 'precio',
        primaryConfidence: 0.92,
        secondaryIntent: 'contraindicaciones',
        secondaryConfidence: null,  // missing confidence — treat as 0
        secondaryQuery: null,        // no secondary_query either — fallback rawMessage
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
    })

    it('secondary.coverage is "low" (null confidence treated as 0)', () => {
      expect(result.secondary!.coverage).toBe('low')
    })

    it('secondary.ragQuery falls back to rawMessage when secondary_query is null', () => {
      expect(result.secondary!.ragQuery).toBe(RAW_MESSAGE)
    })
  })

  // ============================================================
  // Invariant: intent field preserved in SlotDecision
  // ============================================================
  describe('intent field preserved in SlotDecision', () => {
    it('primary.intent matches input primaryIntent', () => {
      const result = computeSlots({
        primaryIntent: 'precio',
        primaryConfidence: 0.92,
        secondaryIntent: 'ninguno',
        secondaryConfidence: null,
        secondaryQuery: null,
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
      expect(result.primary.intent).toBe('precio')
    })

    it('secondary.intent matches input secondaryIntent', () => {
      const result = computeSlots({
        primaryIntent: 'precio',
        primaryConfidence: 0.92,
        secondaryIntent: 'tiempo_entrega',
        secondaryConfidence: 0.85,
        secondaryQuery: null,
        rawMessage: RAW_MESSAGE,
        threshold: THRESHOLD,
      })
      expect(result.secondary!.intent).toBe('tiempo_entrega')
    })
  })
})
