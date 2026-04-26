// ============================================================================
// Plan 03 Task 3 — routeAgent tests
//
// Mocks the cache + agentRegistry + audit log so each test exercises route.ts
// branching in isolation. Domain layer is mocked via the cache mock (which
// supplies pre-compiled rules) so fact resolvers may still execute against
// the real domain mocks set up below — facts are observed via the events the
// rules trigger, not via direct DB calls.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Domain mocks (used by facts.ts under the hood) -------------------------
vi.mock('@/lib/domain/orders', () => ({
  getActiveOrderForContact: vi.fn().mockResolvedValue(null),
  getLastDeliveredOrderDate: vi.fn().mockResolvedValue(null),
  countOrdersInLastNDays: vi.fn().mockResolvedValue(0),
  isContactInRecompraPipeline: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/lib/domain/tags', () => ({
  getContactTags: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/domain/contacts', () => ({
  getContactIsClient: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/lib/domain/messages', () => ({
  getLastInboundMessageAt: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/domain/workspace-agent-config', () => ({
  getWorkspaceRecompraEnabled: vi.fn().mockResolvedValue(true),
}))

// --- Routing-domain mocks (audit log + cache feed) --------------------------
const mockRecordAuditLog = vi.fn().mockResolvedValue({ success: true, data: undefined })
vi.mock('@/lib/domain/routing', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/domain/routing')>('@/lib/domain/routing')
  return {
    ...actual,
    recordAuditLog: (...args: never[]) => mockRecordAuditLog(...args),
  }
})

// --- Cache mock — feeds compiled rules into routeAgent ----------------------
const mockGetRulesForWorkspace = vi.fn()
vi.mock('../cache', () => ({
  getRulesForWorkspace: (...args: never[]) => mockGetRulesForWorkspace(...args),
  invalidateWorkspace: vi.fn(),
  _clearAllCache: vi.fn(),
}))

// --- agentRegistry mock — control what's "registered" -----------------------
const mockHas = vi.fn()
vi.mock('@/lib/agents/registry', () => ({
  agentRegistry: { has: (...args: never[]) => mockHas(...args) },
}))

import * as orders from '@/lib/domain/orders'
import * as tagsDomain from '@/lib/domain/tags'
import { routeAgent } from '../route'
import type { CompiledRule, CompiledRuleSet } from '../cache'

const ws = 'a3843b3f-c337-4836-92b5-89c58bb98490'
const contactId = '00000000-0000-0000-0000-0000000000ct'

function compiledRule(
  id: string,
  rule_type: 'lifecycle_classifier' | 'agent_router',
  conditions: unknown,
  eventParams: Record<string, unknown>,
  priority = 100,
): CompiledRule {
  return {
    id,
    rule_type,
    compiled: {
      name: id,
      priority,
      conditions: conditions as never,
      event: { type: 'route', params: eventParams } as never,
    },
  }
}

function ruleSet(
  classifierRules: CompiledRule[],
  routerRules: CompiledRule[],
): CompiledRuleSet {
  return {
    classifierRules,
    routerRules,
    maxUpdatedAt: null,
    loadedAt: Date.now(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHas.mockReturnValue(true) // by default, all agent_ids look registered
  mockRecordAuditLog.mockResolvedValue({ success: true, data: undefined })
})

describe('routeAgent — D-16 reason: matched', () => {
  it('classifier emits lifecycle_state, router matches and emits agent_id', async () => {
    ;(orders.getActiveOrderForContact as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1',
      stage_kind: 'REPARTO', // → 'transit'
      created_at: 'x',
    })
    mockGetRulesForWorkspace.mockResolvedValue(
      ruleSet(
        [
          compiledRule(
            'cls-in-transit',
            'lifecycle_classifier',
            { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
            { lifecycle_state: 'in_transit' },
          ),
        ],
        [
          compiledRule(
            'router-in-transit-postsale',
            'agent_router',
            { all: [{ fact: 'lifecycle_state', operator: 'equal', value: 'in_transit' }] },
            { agent_id: 'somnio-recompra-v1' },
          ),
        ],
      ),
    )

    const decision = await routeAgent({ contactId, workspaceId: ws })
    expect(decision.reason).toBe('matched')
    expect(decision.agent_id).toBe('somnio-recompra-v1')
    expect(decision.lifecycle_state).toBe('in_transit')
    expect(decision.fired_classifier_rule_id).toBe('cls-in-transit')
    expect(decision.fired_router_rule_id).toBe('router-in-transit-postsale')
    expect(mockHas).toHaveBeenCalledWith('somnio-recompra-v1')
  })

  it('throws when matched agent_id is NOT in agentRegistry → fallback_legacy', async () => {
    ;(orders.getActiveOrderForContact as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1',
      stage_kind: 'REPARTO',
      created_at: 'x',
    })
    mockHas.mockReturnValue(false) // unregistered
    mockGetRulesForWorkspace.mockResolvedValue(
      ruleSet(
        [
          compiledRule(
            'cls',
            'lifecycle_classifier',
            { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
            { lifecycle_state: 'in_transit' },
          ),
        ],
        [
          compiledRule(
            'router',
            'agent_router',
            { all: [{ fact: 'lifecycle_state', operator: 'equal', value: 'in_transit' }] },
            { agent_id: 'unknown-agent-id' },
          ),
        ],
      ),
    )

    const decision = await routeAgent({ contactId, workspaceId: ws })
    // Unregistered agent_id throws inside the pipeline → caught → fallback_legacy.
    expect(decision.reason).toBe('fallback_legacy')
    expect(decision.agent_id).toBeNull()
  })
})

describe('routeAgent — D-16 reason: human_handoff', () => {
  it('forzar_humano rule emits agent_id:null → human_handoff', async () => {
    ;(tagsDomain.getContactTags as ReturnType<typeof vi.fn>).mockResolvedValue([
      'forzar_humano',
    ])
    mockGetRulesForWorkspace.mockResolvedValue(
      ruleSet(
        [], // no classifier rules → lifecycle_state stays default
        [
          compiledRule(
            'router-handoff',
            'agent_router',
            {
              all: [
                { fact: 'tags', operator: 'arrayContainsAny', value: ['forzar_humano'] },
              ],
            },
            { agent_id: null },
            1000, // priority above any imaginable matched rule
          ),
        ],
      ),
    )

    const decision = await routeAgent({ contactId, workspaceId: ws })
    expect(decision.reason).toBe('human_handoff')
    expect(decision.agent_id).toBeNull()
    expect(decision.fired_router_rule_id).toBe('router-handoff')
  })
})

describe('routeAgent — D-16 reason: no_rule_matched', () => {
  it('no rule matches anywhere → no_rule_matched, lifecycle stays new_prospect', async () => {
    mockGetRulesForWorkspace.mockResolvedValue(ruleSet([], []))
    const decision = await routeAgent({ contactId, workspaceId: ws })
    expect(decision.reason).toBe('no_rule_matched')
    expect(decision.agent_id).toBeNull()
    expect(decision.lifecycle_state).toBe('new_prospect')
    expect(decision.fired_classifier_rule_id).toBeNull()
    expect(decision.fired_router_rule_id).toBeNull()
  })
})

describe('routeAgent — D-16 reason: fallback_legacy (Pitfall 4)', () => {
  it('cache.getRulesForWorkspace throws → fallback_legacy, agent_id null', async () => {
    mockGetRulesForWorkspace.mockRejectedValue(new Error('DB exploded'))
    const decision = await routeAgent({ contactId, workspaceId: ws })
    expect(decision.reason).toBe('fallback_legacy')
    expect(decision.agent_id).toBeNull()
  })
})

describe('routeAgent — FIRST-hit semantics (Pitfall 1)', () => {
  it('with two classifier rules at different priorities, only the highest fires', async () => {
    ;(orders.getActiveOrderForContact as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1',
      stage_kind: 'REPARTO', // → 'transit'
      created_at: 'x',
    })
    mockGetRulesForWorkspace.mockResolvedValue(
      ruleSet(
        [
          // Highest priority (100): matches → in_transit.
          compiledRule(
            'cls-high',
            'lifecycle_classifier',
            { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
            { lifecycle_state: 'in_transit' },
            100,
          ),
          // Lower priority (50): same matching condition but different output.
          compiledRule(
            'cls-low',
            'lifecycle_classifier',
            { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
            { lifecycle_state: 'just_received' },
            50,
          ),
        ],
        [
          compiledRule(
            'router-postsale',
            'agent_router',
            { all: [{ fact: 'lifecycle_state', operator: 'equal', value: 'in_transit' }] },
            { agent_id: 'somnio-recompra-v1' },
          ),
        ],
      ),
    )
    const decision = await routeAgent({ contactId, workspaceId: ws })
    expect(decision.fired_classifier_rule_id).toBe('cls-high')
    expect(decision.lifecycle_state).toBe('in_transit')
    expect(decision.reason).toBe('matched')
  })
})

describe('routeAgent — audit log + telemetry', () => {
  it('emits audit log with reason + facts_snapshot + latency_ms (fire-and-forget)', async () => {
    mockGetRulesForWorkspace.mockResolvedValue(ruleSet([], []))
    const decision = await routeAgent({
      contactId,
      workspaceId: ws,
      conversationId: 'conv1',
      inboundMessageId: 'msg1',
    })
    // recordAuditLog is fire-and-forget — let microtasks settle.
    await new Promise((resolve) => setImmediate(resolve))
    expect(mockRecordAuditLog).toHaveBeenCalledOnce()
    const arg = mockRecordAuditLog.mock.calls[0][0]
    expect(arg.workspace_id).toBe(ws)
    expect(arg.contact_id).toBe(contactId)
    expect(arg.conversation_id).toBe('conv1')
    expect(arg.inbound_message_id).toBe('msg1')
    expect(arg.reason).toBe('no_rule_matched')
    expect(arg.lifecycle_state).toBe('new_prospect')
    expect(typeof arg.latency_ms).toBe('number')
    expect(arg.latency_ms).toBeGreaterThanOrEqual(0)
    expect(arg.facts_snapshot).toBeTypeOf('object')
    expect(decision.latency_ms).toBeGreaterThanOrEqual(0)
  })

  it('facts_snapshot contains expected fact keys captured from almanac', async () => {
    mockGetRulesForWorkspace.mockResolvedValue(ruleSet([], []))
    const decision = await routeAgent({ contactId, workspaceId: ws })
    expect(decision.facts_snapshot).toHaveProperty('tags')
    expect(decision.facts_snapshot).toHaveProperty('isClient')
    expect(decision.facts_snapshot).toHaveProperty('recompraEnabled')
  })

  it('audit log failure does NOT throw or alter the decision (fire-and-forget)', async () => {
    mockRecordAuditLog.mockRejectedValueOnce(new Error('audit DB down'))
    mockGetRulesForWorkspace.mockResolvedValue(ruleSet([], []))
    // routeAgent must resolve successfully even if recordAuditLog rejects.
    await expect(routeAgent({ contactId, workspaceId: ws })).resolves.toMatchObject({
      reason: 'no_rule_matched',
    })
    // Let the rejected promise settle so the unhandled rejection logs in console.error
    // (handled by the .catch in route.ts) instead of polluting test output.
    await new Promise((resolve) => setImmediate(resolve))
  })
})
