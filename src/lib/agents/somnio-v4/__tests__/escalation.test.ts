/**
 * Tests for decideSubLoopReason — pure function que evalúa los 4 triggers D-02.
 *
 * Standalone: somnio-sales-v4 / Plan 07 Task 6.
 *
 * Verifica:
 * - Happy path (todas condiciones false) → null
 * - low_confidence cuando confidence < threshold
 * - razonamiento_libre cuando intent === 'razonamiento_libre' (gana sobre confidence alto)
 * - razonamiento_libre cuando intent === 'otro' (D-69 sumidero — gana sobre confidence alto)
 * - crm_mutation cuando isCrmMutation=true (gana sobre confidence)
 * - cas_reject como top priority (gana sobre todos)
 */
import { describe, it, expect } from 'vitest'
import { decideSubLoopReason, type EscalationInput } from '../escalation'

describe('decideSubLoopReason — D-02 sub-loop escalation triggers', () => {
  const base: EscalationInput = {
    confidence: 0.8,
    threshold: 0.7,
    intent: 'precio',
    isCrmMutation: false,
    casReject: false,
  }

  it('returns null on happy path (todas condiciones false)', () => {
    expect(decideSubLoopReason(base)).toBeNull()
  })

  it('returns "low_confidence" when intent_confidence < threshold', () => {
    expect(decideSubLoopReason({ ...base, confidence: 0.5 })).toBe('low_confidence')
  })

  it('returns "razonamiento_libre" when intent is "razonamiento_libre" (gana sobre confidence alto)', () => {
    expect(decideSubLoopReason({ ...base, intent: 'razonamiento_libre', confidence: 0.95 })).toBe(
      'razonamiento_libre',
    )
  })

  it('returns "razonamiento_libre" when intent is "otro" (D-69 sumidero, gana sobre confidence alto)', () => {
    expect(decideSubLoopReason({ ...base, intent: 'otro', confidence: 0.95 })).toBe(
      'razonamiento_libre',
    )
  })

  it('returns "crm_mutation" when isCrmMutation=true (gana sobre confidence)', () => {
    expect(decideSubLoopReason({ ...base, isCrmMutation: true, confidence: 0.95 })).toBe(
      'crm_mutation',
    )
  })

  it('returns "cas_reject" as top priority (gana sobre todos los demás flags)', () => {
    expect(
      decideSubLoopReason({
        ...base,
        casReject: true,
        isCrmMutation: true,
        intent: 'razonamiento_libre',
        confidence: 0.1,
      }),
    ).toBe('cas_reject')
  })
})
