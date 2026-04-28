import { describe, it, expect } from 'vitest'
import { condensePreviousTurn } from '../condense-previous-turn'
import type {
  TurnDetail,
  TurnDetailEvent,
} from '@/lib/observability/repository'

function makeDetail(
  opts: {
    turnId?: string
    agentId?: string
    respondingAgentId?: string | null
    hasError?: boolean
    triggerKind?: string | null
    newMode?: string | null
    events?: Array<Partial<TurnDetailEvent>>
  } = {},
): TurnDetail {
  return {
    turn: {
      id: opts.turnId ?? 't1',
      conversationId: 'c1',
      workspaceId: 'w1',
      agentId: opts.agentId ?? 'somnio-v3',
      respondingAgentId: opts.respondingAgentId ?? null,
      startedAt: '2026-04-23T10:00:00Z',
      finishedAt: '2026-04-23T10:00:01Z',
      durationMs: 1000,
      eventCount: opts.events?.length ?? 0,
      queryCount: 0,
      aiCallCount: 0,
      totalTokens: 100,
      totalCostUsd: 0.001,
      hasError: opts.hasError ?? false,
      triggerKind: opts.triggerKind ?? 'user_message',
      currentMode: null,
      newMode: opts.newMode ?? null,
      error: opts.hasError
        ? { name: 'Err', message: 'something failed', stack: '' }
        : null,
    },
    events: (opts.events ?? []).map(
      (e, i) =>
        ({
          id: `e${i}`,
          sequence: i,
          recordedAt: '2026-04-23T10:00:00Z',
          category: 'unknown',
          label: null,
          payload: {},
          durationMs: null,
          ...e,
        }) as TurnDetailEvent,
    ),
    queries: [],
    aiCalls: [],
    promptVersionsById: {},
  }
}

describe('condensePreviousTurn (D-14, RESEARCH §2)', () => {
  it('Test 1: output includes all required shape fields', () => {
    const result = condensePreviousTurn(makeDetail())
    expect(result.turnId).toBeDefined()
    expect(result.startedAt).toBeDefined()
    expect(result.durationMs).toBeDefined()
    expect(result.respondingAgentId).toBeDefined()
    expect(result.entryAgentId).toBeDefined()
    expect(result.triggerKind).toBeDefined()
    expect(result.intent).toBeDefined()
    expect(result.intentConfidence).toBeDefined()
    expect(result.pipelineDecisions).toBeDefined()
    expect(result.templatesEnviados).toBeDefined()
    expect(result.modeTransitions).toBeDefined()
    expect(result.toolCalls).toBeDefined()
    expect(result.guards).toBeDefined()
    expect(result.stateChanges).toBeDefined()
    expect(result.hasError).toBeDefined()
    expect(result.totalTokens).toBeDefined()
    expect(result.totalCostUsd).toBeDefined()
  })

  it('Test 2: respondingAgentId fallbacks to turn.agentId when null', () => {
    const result = condensePreviousTurn(
      makeDetail({ agentId: 'somnio-v3', respondingAgentId: null }),
    )
    expect(result.respondingAgentId).toBe('somnio-v3')
  })

  it('Test 2b: respondingAgentId preserved when not null', () => {
    const result = condensePreviousTurn(
      makeDetail({
        agentId: 'somnio-v3',
        respondingAgentId: 'somnio-recompra-v1',
      }),
    )
    expect(result.respondingAgentId).toBe('somnio-recompra-v1')
  })

  it('Test 3: entryAgentId always equals turn.agentId', () => {
    const result = condensePreviousTurn(
      makeDetail({
        agentId: 'somnio-v3',
        respondingAgentId: 'somnio-recompra-v1',
      }),
    )
    expect(result.entryAgentId).toBe('somnio-v3')
  })

  it('Test 4: intent and intentConfidence extracted from comprehension event', () => {
    const result = condensePreviousTurn(
      makeDetail({
        events: [
          {
            category: 'comprehension',
            label: 'comp',
            payload: { intent: 'precio', confidence: 0.95 },
          },
        ],
      }),
    )
    expect(result.intent).toBe('precio')
    expect(result.intentConfidence).toBe(0.95)
  })

  it('Test 4b: intent and intentConfidence are null when no comprehension event', () => {
    const result = condensePreviousTurn(makeDetail({ events: [] }))
    expect(result.intent).toBeNull()
    expect(result.intentConfidence).toBeNull()
  })

  it('Test 5: pipelineDecisions filter + slim payload to whitelist keys', () => {
    const result = condensePreviousTurn(
      makeDetail({
        events: [
          {
            category: 'pipeline_decision',
            label: 'recompra_routed',
            payload: {
              action: 'route',
              agent: 'somnio-recompra-v1',
              agentId: 'somnio-recompra-v1',
              reason: 'is_client',
              intent: 'saludo',
              toAction: 'reply',
              extraField: 'should be stripped',
              hugeBlob: 'x'.repeat(10000),
            },
          },
        ],
      }),
    )
    expect(result.pipelineDecisions).toHaveLength(1)
    expect(result.pipelineDecisions[0].label).toBe('recompra_routed')
    expect(result.pipelineDecisions[0].payload).not.toHaveProperty('extraField')
    expect(result.pipelineDecisions[0].payload).not.toHaveProperty('hugeBlob')
    expect(result.pipelineDecisions[0].payload.action).toBe('route')
    expect(result.pipelineDecisions[0].payload.agent).toBe('somnio-recompra-v1')
    expect(result.pipelineDecisions[0].payload.reason).toBe('is_client')
  })

  it('Test 6: templatesEnviados flatMaps payload.intents from template_selection events', () => {
    const result = condensePreviousTurn(
      makeDetail({
        events: [
          {
            category: 'template_selection',
            label: 'select_t1',
            payload: { intents: ['saludo', 'precio'] },
          },
          {
            category: 'template_selection',
            label: 'select_t2',
            payload: { intents: ['promo'] },
          },
        ],
      }),
    )
    expect(result.templatesEnviados).toEqual(['saludo', 'precio', 'promo'])
  })

  it('Test 7: modeTransitions maps to {from, to, reason?}', () => {
    const result = condensePreviousTurn(
      makeDetail({
        events: [
          {
            category: 'mode_transition',
            label: 'mt',
            payload: { from: 'recompra', to: 'sales', reason: 'escape' },
          },
          {
            category: 'mode_transition',
            label: 'mt2',
            payload: { from: 'sales', to: 'godentist' },
          },
        ],
      }),
    )
    expect(result.modeTransitions).toEqual([
      { from: 'recompra', to: 'sales', reason: 'escape' },
      { from: 'sales', to: 'godentist' },
    ])
  })

  it('Test 8: toolCalls maps to {tool, status?}', () => {
    const result = condensePreviousTurn(
      makeDetail({
        events: [
          {
            category: 'tool_call',
            label: 'tc',
            payload: { tool: 'orders_get', status: 'ok' },
          },
          {
            category: 'tool_call',
            label: 'tc2',
            payload: { tool: 'contacts_search' },
          },
        ],
      }),
    )
    expect(result.toolCalls).toEqual([
      { tool: 'orders_get', status: 'ok' },
      { tool: 'contacts_search' },
    ])
  })

  it('Test 9: guards maps to {label, reason}', () => {
    const result = condensePreviousTurn(
      makeDetail({
        events: [
          {
            category: 'guard',
            label: 'no_repeat_l2',
            payload: { reason: 'recently_sent' },
          },
        ],
      }),
    )
    expect(result.guards).toEqual([
      { label: 'no_repeat_l2', reason: 'recently_sent' },
    ])
  })

  it('Test 10a: stateChanges.modeAtEnd from session_lifecycle payload', () => {
    const result = condensePreviousTurn(
      makeDetail({
        events: [
          {
            category: 'session_lifecycle',
            label: 'finalize',
            payload: { modeAtEnd: 'recompra' },
          },
        ],
      }),
    )
    expect(result.stateChanges.modeAtEnd).toBe('recompra')
  })

  it('Test 10b: stateChanges.modeAtEnd falls back to turn.newMode', () => {
    const result = condensePreviousTurn(
      makeDetail({ newMode: 'sales', events: [] }),
    )
    expect(result.stateChanges.modeAtEnd).toBe('sales')
  })

  it('Test 11: errorMessage truncated to 200 chars when hasError', () => {
    const result = condensePreviousTurn(
      makeDetail({
        hasError: true,
      }),
    )
    expect(result.hasError).toBe(true)
    expect(result.errorMessage).toBe('something failed')
    expect((result.errorMessage ?? '').length).toBeLessThanOrEqual(200)
  })

  it('Test 12: pure function — same input gives same output', () => {
    const detail = makeDetail({
      agentId: 'somnio-v3',
      respondingAgentId: 'somnio-recompra-v1',
      events: [
        {
          category: 'comprehension',
          payload: { intent: 'saludo', confidence: 0.9 },
        },
        {
          category: 'pipeline_decision',
          label: 'route',
          payload: { action: 'r' },
        },
      ],
    })
    const a = condensePreviousTurn(detail)
    const b = condensePreviousTurn(detail)
    expect(a).toEqual(b)
  })
})
