import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  countTokensMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { countTokens: mocks.countTokensMock },
  })),
}))

import {
  estimateTokens,
  countTokensIfNeeded,
  truncateContext,
} from '../token-budget'
import type { CondensedPreviousTurn } from '../condense-previous-turn'

function makePrevTurn(opts: {
  id: string
  startedAt: string
  bytesPad?: number
}): CondensedPreviousTurn {
  return {
    turnId: opts.id,
    startedAt: opts.startedAt,
    durationMs: 1000,
    respondingAgentId: 'somnio-recompra-v1',
    entryAgentId: 'somnio-v3',
    triggerKind: 'user_message',
    intent: 'saludo',
    intentConfidence: 0.9,
    pipelineDecisions: [],
    templatesEnviados: opts.bytesPad
      ? new Array(opts.bytesPad).fill('x').map((c, i) => `${c}${i}`)
      : [],
    modeTransitions: [],
    toolCalls: [],
    guards: [],
    stateChanges: {},
    hasError: false,
    totalTokens: 100,
    totalCostUsd: 0.001,
  }
}

describe('estimateTokens (heuristic chars/2.8)', () => {
  it('Test 1: empty string returns 0', () => {
    expect(estimateTokens('')).toBe(0)
  })
  it('Test 2: 3 chars returns Math.ceil(3/2.8)=2', () => {
    expect(estimateTokens('abc')).toBe(2)
  })
  it('Test 3: 2800 chars returns ~1000 (IEEE754 floating-point: ceil(2800/2.8) returns 1001)', () => {
    // Math.ceil(2800/2.8) = Math.ceil(1000.0000000000001) = 1001 due to FP imprecision.
    // Acceptable since estimateTokens is a HEURISTIC (Pitfall 14 documents 20% margin).
    const result = estimateTokens('a'.repeat(2800))
    expect(result).toBeGreaterThanOrEqual(1000)
    expect(result).toBeLessThanOrEqual(1001)
  })
  it('Test 3b: 280 chars returns ~100', () => {
    const result = estimateTokens('a'.repeat(280))
    expect(result).toBeGreaterThanOrEqual(100)
    expect(result).toBeLessThanOrEqual(101)
  })
})

describe('truncateContext (D-15 drop-oldest)', () => {
  it('Test 4: total fits within cap returns all turns + trimmed=0', () => {
    const turns = [
      makePrevTurn({ id: 't1', startedAt: '2026-04-23T10:00:00Z' }),
      makePrevTurn({ id: 't2', startedAt: '2026-04-23T10:01:00Z' }),
    ]
    const result = truncateContext({
      previousTurns: turns,
      auditedTurnId: 't_audited',
      fixedCostTokens: 1000,
      capTokens: 50_000,
    })
    expect(result.kept).toHaveLength(2)
    expect(result.trimmed).toBe(0)
  })

  it('Test 5: exceeds cap drops oldest first; result is chronological ASC', () => {
    // Make turns each with bytesPad to inflate JSON size
    const turns = [
      makePrevTurn({
        id: 't1_oldest',
        startedAt: '2026-04-23T10:00:00Z',
        bytesPad: 500,
      }),
      makePrevTurn({
        id: 't2',
        startedAt: '2026-04-23T10:01:00Z',
        bytesPad: 500,
      }),
      makePrevTurn({
        id: 't3_newest',
        startedAt: '2026-04-23T10:02:00Z',
        bytesPad: 500,
      }),
    ]
    // Tight budget: only fits ~2 turns
    const result = truncateContext({
      previousTurns: turns,
      auditedTurnId: 't_audited',
      fixedCostTokens: 0,
      capTokens: 4_000, // 4K - 2K margin = 2K budget
    })
    // newest selected first, then re-sorted ASC for model
    expect(result.kept.length).toBeLessThan(3)
    if (result.kept.length > 0) {
      // Chronological order (ASC)
      for (let i = 1; i < result.kept.length; i++) {
        expect(
          result.kept[i].startedAt >= result.kept[i - 1].startedAt,
        ).toBe(true)
      }
      // Newest preserved over oldest (drop-oldest policy)
      expect(result.kept.map((t) => t.turnId)).toContain('t3_newest')
    }
    expect(result.trimmed).toBeGreaterThan(0)
  })

  it('Test 6: audited turn never appears in kept', () => {
    const turns = [
      makePrevTurn({ id: 't_audited', startedAt: '2026-04-23T10:00:00Z' }),
      makePrevTurn({ id: 't_other', startedAt: '2026-04-23T10:01:00Z' }),
    ]
    const result = truncateContext({
      previousTurns: turns,
      auditedTurnId: 't_audited',
      fixedCostTokens: 0,
    })
    expect(result.kept.map((t) => t.turnId)).not.toContain('t_audited')
    expect(result.kept.map((t) => t.turnId)).toContain('t_other')
  })

  it('Test 7: empty previousTurns returns empty kept + trimmed=0', () => {
    const result = truncateContext({
      previousTurns: [],
      auditedTurnId: 't_audited',
      fixedCostTokens: 0,
    })
    expect(result.kept).toEqual([])
    expect(result.trimmed).toBe(0)
  })

  it('Test 8: safety margin of 2K applied (cap effective = capTokens - fixedCost - 2000)', () => {
    // Default cap=50K. fixedCost=48000. Margin=2000. → effective remaining=0.
    // Even small turn shouldn't fit.
    const turns = [makePrevTurn({ id: 't1', startedAt: '2026-04-23T10:00:00Z' })]
    const result = truncateContext({
      previousTurns: turns,
      auditedTurnId: 't_audited',
      fixedCostTokens: 48_000,
    })
    expect(result.kept).toHaveLength(0)
    expect(result.trimmed).toBe(1)
  })
})

describe('countTokensIfNeeded (Pitfall 14)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Test 9: under threshold uses local estimate, no API call', async () => {
    const result = await countTokensIfNeeded('short sys', 'short user', 40_000)
    expect(result.usedApi).toBe(false)
    expect(result.inputTokens).toBe(
      estimateTokens('short sys') + estimateTokens('short user'),
    )
    expect(mocks.countTokensMock).not.toHaveBeenCalled()
  })

  it('Test 10: over threshold calls API and returns result', async () => {
    mocks.countTokensMock.mockResolvedValueOnce({ input_tokens: 45_000 })
    // Provide >40K of estimated tokens (each char counts /2.8)
    const big = 'x'.repeat(60_000 * 3) // ~64K tokens estimated
    const result = await countTokensIfNeeded(big, 'user', 40_000)
    expect(result.usedApi).toBe(true)
    expect(result.inputTokens).toBe(45_000)
    expect(mocks.countTokensMock).toHaveBeenCalledTimes(1)
  })

  it('Test 11: API call passes claude-sonnet-4-6 model', async () => {
    mocks.countTokensMock.mockResolvedValueOnce({ input_tokens: 45_000 })
    const big = 'x'.repeat(60_000 * 3)
    await countTokensIfNeeded(big, 'user', 40_000)
    const call = mocks.countTokensMock.mock.calls[0][0]
    expect(call.model).toBe('claude-sonnet-4-6')
    expect(call.system).toBe(big)
    expect(call.messages).toEqual([{ role: 'user', content: 'user' }])
  })
})
