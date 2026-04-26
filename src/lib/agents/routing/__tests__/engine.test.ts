// ============================================================================
// Plan 03 Task 2 — engine factory + fact resolvers tests
//
// Mocks the domain layer entirely (Regla 3 — facts.ts only imports from
// @/lib/domain/*). Each test exercises one edge-of-contract:
//   - factory wires operators + facts
//   - happy path resolvers
//   - Pitfall 4 sentinel on resolver throw
//   - FIRST-hit (Pitfall 1) priority semantics
//   - runtime fact (lifecycle_state) injection
//   - B-1 fix recompraEnabled fact
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Engine } from 'json-rules-engine'

vi.mock('@/lib/domain/orders', () => ({
  getActiveOrderForContact: vi.fn(),
  getLastDeliveredOrderDate: vi.fn(),
  countOrdersInLastNDays: vi.fn(),
  isContactInRecompraPipeline: vi.fn(),
}))
vi.mock('@/lib/domain/tags', () => ({ getContactTags: vi.fn() }))
vi.mock('@/lib/domain/contacts', () => ({ getContactIsClient: vi.fn() }))
vi.mock('@/lib/domain/messages', () => ({ getLastInboundMessageAt: vi.fn() }))
vi.mock('@/lib/domain/workspace-agent-config', () => ({
  getWorkspaceRecompraEnabled: vi.fn(),
}))

import * as orders from '@/lib/domain/orders'
import * as tagsDomain from '@/lib/domain/tags'
import * as contactsDomain from '@/lib/domain/contacts'
import * as wsConfig from '@/lib/domain/workspace-agent-config'
import { buildEngine } from '../engine'

const ctx = {
  contactId: 'ct1',
  workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
  rules: [] as never[],
}

beforeEach(() => {
  vi.clearAllMocks()
  // Sensible defaults so a stray fact lookup doesn't throw the wrong error.
  ;(orders.getActiveOrderForContact as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  ;(orders.getLastDeliveredOrderDate as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  ;(orders.countOrdersInLastNDays as ReturnType<typeof vi.fn>).mockResolvedValue(0)
  ;(orders.isContactInRecompraPipeline as ReturnType<typeof vi.fn>).mockResolvedValue(false)
  ;(tagsDomain.getContactTags as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(contactsDomain.getContactIsClient as ReturnType<typeof vi.fn>).mockResolvedValue(false)
  ;(wsConfig.getWorkspaceRecompraEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(true)
})

describe('buildEngine — basic factory', () => {
  it('returns Engine with 5 custom operators registered + 10 dynamic facts (+ runtime if provided)', () => {
    const engine = buildEngine({ ...ctx, runtimeFacts: { lifecycle_state: 'in_transit' } })
    expect(engine).toBeInstanceOf(Engine)

    // engine.operators is an OperatorMap; its internal .operators Map has stock + custom.
    const opMap = (engine as unknown as { operators: { operators: Map<string, unknown> } }).operators
      .operators
    // Stock json-rules-engine ships >=10 built-ins; +5 custom = at least 15.
    expect(opMap.size).toBeGreaterThanOrEqual(15)
    expect(opMap.has('daysSinceAtMost')).toBe(true)
    expect(opMap.has('daysSinceAtLeast')).toBe(true)
    expect(opMap.has('tagMatchesPattern')).toBe(true)
    expect(opMap.has('arrayContainsAny')).toBe(true)
    expect(opMap.has('arrayContainsAll')).toBe(true)

    // engine.facts is a Map<string, Fact> — 10 dynamic + 1 runtime = 11.
    const factMap = (engine as unknown as { facts: Map<string, unknown> }).facts
    expect(factMap.size).toBeGreaterThanOrEqual(11)
    expect(factMap.has('activeOrderStage')).toBe(true)
    expect(factMap.has('tags')).toBe(true)
    expect(factMap.has('recompraEnabled')).toBe(true)
    expect(factMap.has('lifecycle_state')).toBe(true)
  })
})

describe('fact resolvers — happy path', () => {
  it('activeOrderStage delegates to getActiveOrderForContact and maps stage name → kind', async () => {
    ;(orders.getActiveOrderForContact as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1',
      stage_kind: 'REPARTO', // raw stage name → 'transit' kind per Plan 01 mapping
      created_at: 'x',
    })
    const engine = buildEngine(ctx)
    let fired = false
    engine.addRule({
      conditions: { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
      event: { type: 'route', params: { lifecycle_state: 'in_transit' } },
      onSuccess: () => {
        fired = true
      },
    })
    await engine.run({})
    expect(fired).toBe(true)
    expect(orders.getActiveOrderForContact).toHaveBeenCalledWith('ct1', ctx.workspaceId)
  })

  it('tags fact returns string[] from getContactTags', async () => {
    ;(tagsDomain.getContactTags as ReturnType<typeof vi.fn>).mockResolvedValue([
      'vip',
      'forzar_humano',
    ])
    const engine = buildEngine(ctx)
    let fired = false
    engine.addRule({
      conditions: { all: [{ fact: 'tags', operator: 'arrayContainsAny', value: ['forzar_humano'] }] },
      event: { type: 'route', params: { agent_id: null } },
      onSuccess: () => {
        fired = true
      },
    })
    await engine.run({})
    expect(fired).toBe(true)
  })

  it('recompraEnabled fact returns boolean from getWorkspaceRecompraEnabled (B-1)', async () => {
    ;(wsConfig.getWorkspaceRecompraEnabled as ReturnType<typeof vi.fn>).mockResolvedValue(false)
    ;(contactsDomain.getContactIsClient as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    const engine = buildEngine(ctx)
    let fired = false
    engine.addRule({
      conditions: {
        all: [
          { fact: 'isClient', operator: 'equal', value: true },
          { fact: 'recompraEnabled', operator: 'equal', value: false },
        ],
      },
      event: { type: 'route', params: { agent_id: 'somnio-sales-v1' } },
      onSuccess: () => {
        fired = true
      },
    })
    await engine.run({})
    expect(fired).toBe(true)
    expect(wsConfig.getWorkspaceRecompraEnabled).toHaveBeenCalledWith(ctx.workspaceId)
  })
})

describe('fact resolvers — error sentinel (Pitfall 4)', () => {
  it('throw inside resolver does NOT reject engine.run — engine completes normally', async () => {
    ;(orders.getActiveOrderForContact as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DB hiccup'),
    )
    const engine = buildEngine(ctx)
    // Even with a rule that references the throwing fact, run completes.
    engine.addRule({
      conditions: { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
      event: { type: 'route', params: { lifecycle_state: 'in_transit' } },
    })
    await expect(engine.run({})).resolves.toBeDefined()
  })
})

describe('FIRST-hit semantics (Pitfall 1)', () => {
  it('with priority 100 + 90 both matching, only priority 100 fires onSuccess after engine.stop()', async () => {
    ;(orders.getActiveOrderForContact as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'o1',
      stage_kind: 'REPARTO', // → 'transit'
      created_at: 'x',
    })
    let firedFirst = false
    let firedSecond = false
    const engine = buildEngine(ctx)
    engine.addRule({
      conditions: { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
      event: { type: 'route', params: { lifecycle_state: 'in_transit' } },
      priority: 100,
      onSuccess: () => {
        firedFirst = true
        engine.stop()
      },
    })
    engine.addRule({
      conditions: { all: [{ fact: 'activeOrderStage', operator: 'equal', value: 'transit' }] },
      event: { type: 'route', params: { lifecycle_state: 'just_received' } },
      priority: 90,
      onSuccess: () => {
        firedSecond = true
      },
    })
    await engine.run({})
    expect(firedFirst).toBe(true)
    expect(firedSecond).toBe(false)
  })
})

describe('runtime facts override', () => {
  it('runtime fact lifecycle_state is queryable in Layer 2 conditions', async () => {
    const engine = buildEngine({ ...ctx, runtimeFacts: { lifecycle_state: 'in_transit' } })
    let fired = false
    engine.addRule({
      conditions: { all: [{ fact: 'lifecycle_state', operator: 'equal', value: 'in_transit' }] },
      event: { type: 'route', params: { agent_id: 'somnio-recompra-v1' } },
      onSuccess: () => {
        fired = true
      },
    })
    await engine.run({})
    expect(fired).toBe(true)
  })
})
