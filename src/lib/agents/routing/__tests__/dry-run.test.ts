// ============================================================================
// Plan 05 — Dry-run replay simulator tests
//
// Coverage (per PLAN.md <behavior>):
//   1. Throws BEFORE replay if a candidate rule has `path` field (Pitfall 2 +
//      Pitfall 5 — early validation via validateRule). No DB read happens.
//   2. NEVER invokes recordAuditLog (D-10 safety net — verified via vi.mock).
//      Note: routeAgent is also mocked, so recordAuditLog stays untouched even
//      transitively. Pairs with the source-file grep `! grep -q "recordAuditLog"`.
//   3. Returns the documented shape `{ total_inbound, decisions[], summary }`.
//   4. Honours the `limit` parameter (default 500) — propagated to the domain
//      reader so 1000 rows in the window stay capped.
//   5. Honours the `daysBack` parameter (default 7).
//   6. `changed_count` reflects the diff between current_decision (routeAgent)
//      and candidate_decision (built from candidateRules + buildEngine).
//   7. Candidate pipeline that throws is treated as `fallback_legacy` for the
//      candidate side (defense-in-depth — a bad operator/fact in the candidate
//      should not crash the entire dry-run; the conversation is still listed).
//   8. Dedupe-by-conversation_id is provided by the domain layer
//      (getInboundConversationsLastNDays) — we do not re-dedupe in dry-run.ts.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ruleWithPathField, makeRule } from './fixtures'

// --- Mocks ------------------------------------------------------------------

// routeAgent: production decision under current rules. We mock the entire
// module so the dry-run test does not touch the LRU cache or the audit log.
const mockRouteAgent = vi.fn()
vi.mock('../route', () => ({
  routeAgent: (input: unknown) => mockRouteAgent(input),
}))

// buildEngine: candidate decision pipeline. We mock with a configurable Engine
// double so each test can express its own classifier/router outcomes without
// running fact resolvers against a real DB.
type MockEngine = {
  addRule: ReturnType<typeof vi.fn>
  addFact: ReturnType<typeof vi.fn>
  run: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  __addedRules: Array<{ name?: string; onSuccess?: (event: unknown) => void }>
}
const buildEngineCalls: Array<{ runtimeFacts?: Record<string, unknown> }> = []
const engineFactory: { onClassifierEngine?: (e: MockEngine) => void; onRouterEngine?: (e: MockEngine) => void } = {}
let engineCallIndex = 0
function freshMockEngine(): MockEngine {
  const e: MockEngine = {
    addRule: vi.fn(),
    addFact: vi.fn(),
    run: vi.fn().mockResolvedValue({ events: [], results: [] }),
    stop: vi.fn(),
    __addedRules: [],
  }
  e.addRule.mockImplementation((rule: { name?: string; onSuccess?: (event: unknown) => void }) => {
    e.__addedRules.push(rule)
  })
  return e
}
vi.mock('../engine', () => ({
  buildEngine: vi.fn((args: { runtimeFacts?: Record<string, unknown> }) => {
    buildEngineCalls.push({ runtimeFacts: args?.runtimeFacts })
    const e = freshMockEngine()
    // Even-indexed calls = Layer 1 (classifier), odd = Layer 2 (router).
    // The pipeline always builds in classifier-then-router order per
    // candidate, so the mapping is deterministic per conversation.
    if (engineCallIndex % 2 === 0) engineFactory.onClassifierEngine?.(e)
    else engineFactory.onRouterEngine?.(e)
    engineCallIndex++
    return e as unknown as ReturnType<typeof import('../engine').buildEngine>
  }),
}))

// Domain reader: feeds the simulator with conversations to replay.
const mockGetConversations = vi.fn()
vi.mock('@/lib/domain/messages', () => ({
  getInboundConversationsLastNDays: (...args: unknown[]) => mockGetConversations(...args),
}))

// recordAuditLog: must NEVER be called by dry-run.ts. We mock it through the
// '@/lib/domain/routing' module (preserving the rest of the surface so types
// like RoutingRule still resolve) and assert .not.toHaveBeenCalled().
const mockRecordAuditLog = vi.fn()
vi.mock('@/lib/domain/routing', async () => {
  const actual = await vi.importActual<typeof import('@/lib/domain/routing')>(
    '@/lib/domain/routing',
  )
  return {
    ...actual,
    recordAuditLog: (...args: unknown[]) => mockRecordAuditLog(...args),
  }
})

// Imported AFTER the mocks above so the mocked surface wins.
import { dryRunReplay } from '../dry-run'

const ws = 'a3843b3f-c337-4836-92b5-89c58bb98490'

beforeEach(() => {
  vi.clearAllMocks()
  buildEngineCalls.length = 0
  engineCallIndex = 0
  engineFactory.onClassifierEngine = undefined
  engineFactory.onRouterEngine = undefined

  // Default: 2 conversations in the window.
  mockGetConversations.mockResolvedValue([
    { conversation_id: 'c1', contact_id: 'ct1', inbound_message_at: '2026-04-25T10:00:00-05:00' },
    { conversation_id: 'c2', contact_id: 'ct2', inbound_message_at: '2026-04-24T10:00:00-05:00' },
  ])

  // Default production decision: matched somnio-recompra-v1.
  mockRouteAgent.mockResolvedValue({
    agent_id: 'somnio-recompra-v1',
    reason: 'matched',
    lifecycle_state: 'in_transit',
    fired_classifier_rule_id: 'cls-1',
    fired_router_rule_id: 'rt-1',
    latency_ms: 5,
    facts_snapshot: {},
  })
})

// ----------------------------------------------------------------------------
// 1. Pitfall 2 / Pitfall 5 — early validation
// ----------------------------------------------------------------------------

describe('dryRunReplay — candidate validation (Pitfall 2 + Pitfall 5)', () => {
  it('throws BEFORE replay if a candidate rule has a `path` field', async () => {
    await expect(
      dryRunReplay({
        workspaceId: ws,
        candidateRules: [ruleWithPathField as never],
        daysBack: 7,
      }),
    ).rejects.toThrow(/schema|path|validation/i)
    // No DB read should have happened.
    expect(mockGetConversations).not.toHaveBeenCalled()
    // No engine should have been built.
    expect(buildEngineCalls.length).toBe(0)
    // No production decision should have been requested.
    expect(mockRouteAgent).not.toHaveBeenCalled()
  })

  it('throws with a descriptive message that includes the offending rule name', async () => {
    const bad = { ...ruleWithPathField, name: 'my_bad_rule' }
    await expect(
      dryRunReplay({ workspaceId: ws, candidateRules: [bad as never], daysBack: 7 }),
    ).rejects.toThrow(/my_bad_rule/)
  })
})

// ----------------------------------------------------------------------------
// 2. D-10 — NEVER writes audit log
// ----------------------------------------------------------------------------

describe('dryRunReplay — D-10 safety (no audit log writes)', () => {
  it('never invokes recordAuditLog across a full replay', async () => {
    const goodRule = makeRule({ rule_type: 'lifecycle_classifier' })
    await dryRunReplay({ workspaceId: ws, candidateRules: [goodRule], daysBack: 7 })
    expect(mockRecordAuditLog).not.toHaveBeenCalled()
  })
})

// ----------------------------------------------------------------------------
// 3. Output shape contract
// ----------------------------------------------------------------------------

describe('dryRunReplay — output shape', () => {
  it('returns { total_inbound, decisions[], summary } with correct keys', async () => {
    const goodRule = makeRule({ rule_type: 'lifecycle_classifier' })
    const result = await dryRunReplay({
      workspaceId: ws,
      candidateRules: [goodRule],
      daysBack: 7,
    })
    expect(result.total_inbound).toBe(2)
    expect(Array.isArray(result.decisions)).toBe(true)
    expect(result.decisions.length).toBe(2)
    expect(result.summary).toBeTypeOf('object')
    expect(result.summary).toHaveProperty('changed_count')
    expect(result.summary).toHaveProperty('before')
    expect(result.summary).toHaveProperty('after')
    // Each decision row carries the contract fields.
    for (const row of result.decisions) {
      expect(row).toHaveProperty('conversation_id')
      expect(row).toHaveProperty('contact_id')
      expect(row).toHaveProperty('inbound_message_at')
      expect(row).toHaveProperty('current_decision')
      expect(row).toHaveProperty('candidate_decision')
      expect(row).toHaveProperty('changed')
      expect(typeof row.changed).toBe('boolean')
    }
  })
})

// ----------------------------------------------------------------------------
// 4. limit + daysBack propagation
// ----------------------------------------------------------------------------

describe('dryRunReplay — pagination + window honoured', () => {
  it('respects an explicit limit (default 500 forwarded to domain)', async () => {
    const goodRule = makeRule()
    await dryRunReplay({
      workspaceId: ws,
      candidateRules: [goodRule],
      daysBack: 7,
    })
    expect(mockGetConversations).toHaveBeenCalledWith(ws, 7, 500)
  })

  it('forwards a custom daysBack to the domain reader', async () => {
    const goodRule = makeRule()
    await dryRunReplay({
      workspaceId: ws,
      candidateRules: [goodRule],
      daysBack: 30,
      limit: 250,
    })
    expect(mockGetConversations).toHaveBeenCalledWith(ws, 30, 250)
  })

  it('falls back to defaults (daysBack=7, limit=500) when omitted', async () => {
    const goodRule = makeRule()
    await dryRunReplay({ workspaceId: ws, candidateRules: [goodRule] })
    expect(mockGetConversations).toHaveBeenCalledWith(ws, 7, 500)
  })
})

// ----------------------------------------------------------------------------
// 5. Diff semantics — changed_count, before/after distribution
// ----------------------------------------------------------------------------

describe('dryRunReplay — diff between current and candidate', () => {
  it('changed_count = N when every conversation flips agent_id', async () => {
    // Production says 'somnio-recompra-v1' for everyone.
    mockRouteAgent.mockResolvedValue({
      agent_id: 'somnio-recompra-v1',
      reason: 'matched',
      lifecycle_state: 'in_transit',
      fired_classifier_rule_id: 'cls-1',
      fired_router_rule_id: 'rt-1',
      latency_ms: 1,
      facts_snapshot: {},
    })

    // Candidate Layer 2 fires a NEW agent for everyone.
    engineFactory.onRouterEngine = (e) => {
      const original = e.addRule
      e.addRule = vi.fn((rule: { name?: string; onSuccess?: (event: unknown) => void }) => {
        original(rule)
        // Simulate router rule firing → invoke onSuccess synchronously after
        // engine.run resolves. We arm e.run to invoke the callbacks.
      }) as unknown as ReturnType<typeof vi.fn>
      e.run = vi.fn(async () => {
        for (const rule of e.__addedRules) {
          rule.onSuccess?.({ params: { agent_id: 'somnio-postsale-v1' } })
        }
        return { events: [], results: [] }
      }) as unknown as ReturnType<typeof vi.fn>
    }

    const candidateRouter = makeRule({
      rule_type: 'agent_router',
      conditions: { all: [{ fact: 'lifecycle_state', operator: 'equal', value: 'in_transit' }] },
      event: { type: 'route', params: { agent_id: 'somnio-postsale-v1' } },
    })
    const result = await dryRunReplay({
      workspaceId: ws,
      candidateRules: [candidateRouter],
      daysBack: 7,
    })

    expect(result.summary.changed_count).toBe(2)
    expect(result.summary.before['somnio-recompra-v1']).toBe(2)
    expect(result.summary.after['somnio-postsale-v1']).toBe(2)
    for (const row of result.decisions) {
      expect(row.changed).toBe(true)
      expect(row.current_decision?.agent_id).toBe('somnio-recompra-v1')
      expect(row.candidate_decision.agent_id).toBe('somnio-postsale-v1')
      expect(row.candidate_decision.reason).toBe('matched')
    }
  })

  it('changed_count = 0 when candidate produces same agent_id and reason as current', async () => {
    // Production: matched somnio-recompra-v1.
    // Candidate Layer 2 fires SAME 'somnio-recompra-v1' for everyone.
    engineFactory.onRouterEngine = (e) => {
      e.run = vi.fn(async () => {
        for (const rule of e.__addedRules) {
          rule.onSuccess?.({ params: { agent_id: 'somnio-recompra-v1' } })
        }
        return { events: [], results: [] }
      }) as unknown as ReturnType<typeof vi.fn>
    }

    const candidateRouter = makeRule({
      rule_type: 'agent_router',
      event: { type: 'route', params: { agent_id: 'somnio-recompra-v1' } },
    })
    const result = await dryRunReplay({
      workspaceId: ws,
      candidateRules: [candidateRouter],
      daysBack: 7,
    })

    expect(result.summary.changed_count).toBe(0)
    for (const row of result.decisions) {
      expect(row.changed).toBe(false)
    }
  })

  it('rolls up before/after counts using bucketKey (agent_id when matched, reason otherwise)', async () => {
    // Production: half matched, half no_rule_matched.
    let call = 0
    mockRouteAgent.mockImplementation(async () => {
      call++
      if (call === 1) {
        return {
          agent_id: 'somnio-sales-v1',
          reason: 'matched',
          lifecycle_state: 'new_prospect',
          fired_classifier_rule_id: null,
          fired_router_rule_id: 'rt-x',
          latency_ms: 1,
          facts_snapshot: {},
        }
      }
      return {
        agent_id: null,
        reason: 'no_rule_matched',
        lifecycle_state: 'new_prospect',
        fired_classifier_rule_id: null,
        fired_router_rule_id: null,
        latency_ms: 1,
        facts_snapshot: {},
      }
    })

    // Candidate: nothing fires (empty router rules → no_rule_matched for both).
    const result = await dryRunReplay({
      workspaceId: ws,
      candidateRules: [],
      daysBack: 7,
    })

    expect(result.summary.before['somnio-sales-v1']).toBe(1)
    expect(result.summary.before['no_rule_matched']).toBe(1)
    expect(result.summary.after['no_rule_matched']).toBe(2)
  })
})

// ----------------------------------------------------------------------------
// 6. Robustness — fact resolver / engine throws on candidate side
// ----------------------------------------------------------------------------

describe('dryRunReplay — robustness against candidate pipeline failures', () => {
  it('candidate Engine.run throws → conversation surfaces with reason fallback_legacy', async () => {
    engineFactory.onClassifierEngine = (e) => {
      e.run = vi.fn().mockRejectedValue(new Error('fact resolver exploded'))
    }

    const candidateClassifier = makeRule({ rule_type: 'lifecycle_classifier' })
    const result = await dryRunReplay({
      workspaceId: ws,
      candidateRules: [candidateClassifier],
      daysBack: 7,
    })

    expect(result.total_inbound).toBe(2)
    expect(result.decisions.length).toBe(2)
    for (const row of result.decisions) {
      expect(row.candidate_decision.reason).toBe('fallback_legacy')
    }
    // Sanity: no audit log writes from dry-run itself.
    expect(mockRecordAuditLog).not.toHaveBeenCalled()
  })
})

// ----------------------------------------------------------------------------
// 7. Engine usage — fresh per conversation per layer (Pitfall 7)
// ----------------------------------------------------------------------------

describe('dryRunReplay — Pitfall 7 (Engine per conversation per layer)', () => {
  it('builds 2 engines per conversation (Layer 1 + Layer 2) — never reuses', async () => {
    const candidateClassifier = makeRule({ rule_type: 'lifecycle_classifier' })
    const candidateRouter = makeRule({
      rule_type: 'agent_router',
      event: { type: 'route', params: { agent_id: 'somnio-recompra-v1' } },
    })
    await dryRunReplay({
      workspaceId: ws,
      candidateRules: [candidateClassifier, candidateRouter],
      daysBack: 7,
    })
    // 2 conversations × 2 layers = 4 buildEngine calls.
    expect(buildEngineCalls.length).toBe(4)
    // Layer 2 calls (odd indices) carry runtimeFacts.lifecycle_state.
    expect(buildEngineCalls[1].runtimeFacts).toHaveProperty('lifecycle_state')
    expect(buildEngineCalls[3].runtimeFacts).toHaveProperty('lifecycle_state')
  })
})
