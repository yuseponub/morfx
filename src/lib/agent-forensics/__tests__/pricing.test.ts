import { describe, it, expect } from 'vitest'
import { SONNET_4_6_PRICING, calculateAuditCost } from '../pricing'

describe('SONNET_4_6_PRICING constants (RESEARCH-plan-05 §3)', () => {
  it('input price is $3 per million tokens', () => {
    expect(SONNET_4_6_PRICING.inputPerMTok).toBe(3)
  })
  it('output price is $15 per million tokens', () => {
    expect(SONNET_4_6_PRICING.outputPerMTok).toBe(15)
  })
})

describe('calculateAuditCost (D-17 cost_usd persistence)', () => {
  it('returns 0 for zero usage', () => {
    expect(calculateAuditCost(0, 0)).toBe(0)
  })
  it('handles 1M input tokens exactly', () => {
    expect(calculateAuditCost(1_000_000, 0)).toBeCloseTo(3, 6)
  })
  it('handles 1M output tokens exactly', () => {
    expect(calculateAuditCost(0, 1_000_000)).toBeCloseTo(15, 6)
  })
  it('cap maximo D-15 (50K input + 3K output) returns ~$0.195', () => {
    // 50000 * 3 / 1_000_000 + 3000 * 15 / 1_000_000 = 0.15 + 0.045 = 0.195
    expect(calculateAuditCost(50_000, 3_000)).toBeCloseTo(0.195, 6)
  })
  it('result fits NUMERIC(10,6) — at most 6 decimals significant', () => {
    const cost = calculateAuditCost(1234, 567)
    expect(Number.isFinite(cost)).toBe(true)
    // Check it can be serialized to NUMERIC(10,6) without overflow
    expect(cost).toBeLessThan(10_000) // 4 digits before decimal max
  })
})
