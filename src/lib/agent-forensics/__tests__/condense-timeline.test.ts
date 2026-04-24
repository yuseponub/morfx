/**
 * Unit tests for the condensed timeline filter.
 *
 * Plan 02 / standalone `agent-forensics-panel` — D-04 whitelist + D-05
 * strict query exclusion. Pure-function tests: no React, no DOM.
 *
 * Coverage:
 *   1. Whitelisted event categories pass, noisy ones drop.
 *   2. Queries never surface (D-05).
 *   3. Sort stability by `sequence`.
 *   4. Mechanism AI purposes filter.
 *   5. Summary generation per category.
 *   6. `error` always surfaces.
 *   7. Rest of the whitelist keeps its coverage.
 */
import { describe, it, expect } from 'vitest'
import { condenseTimeline } from '../condense-timeline'

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    turn: {
      id: 't1',
      conversationId: 'c1',
      workspaceId: 'w1',
      agentId: 'somnio-v3',
      respondingAgentId: 'somnio-recompra-v1',
      startedAt: '2026-04-24T10:00:00Z',
      finishedAt: '2026-04-24T10:00:01Z',
      durationMs: 1000,
      eventCount: 0,
      queryCount: 0,
      aiCallCount: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      hasError: false,
      triggerKind: 'user_message',
      currentMode: null,
      newMode: null,
      error: null,
    },
    events: [],
    queries: [],
    aiCalls: [],
    promptVersionsById: {},
    ...overrides,
  }
}

function makeEvent(
  sequence: number,
  category: string,
  label: string | null,
  payload: Record<string, unknown> = {},
) {
  return {
    id: `e-${sequence}`,
    sequence,
    recordedAt: `2026-04-24T10:00:0${sequence}Z`,
    category,
    label,
    payload,
    durationMs: null,
  }
}

function makeAiCall(sequence: number, purpose: string) {
  return {
    id: `ai-${sequence}`,
    sequence,
    recordedAt: `2026-04-24T10:00:0${sequence}Z`,
    promptVersionId: 'pv-1',
    purpose,
    model: 'claude-haiku-4-5',
    messages: [],
    responseContent: null,
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 150,
    costUsd: 0.001,
    durationMs: 200,
    statusCode: 200,
    error: null,
  }
}

describe('condenseTimeline — whitelist + D-05 query exclusion', () => {
  it('includes whitelisted event categories and excludes noisy ones', () => {
    const detail = makeDetail({
      events: [
        makeEvent(1, 'pipeline_decision', 'recompra_routed', { contactId: 'x' }),
        makeEvent(2, 'char_delay', null, {}), // excluded (noise)
        makeEvent(3, 'mode_transition', null, { from: 'a', to: 'b' }),
        makeEvent(4, 'block_composition', null, {}), // excluded (implied by template_selection)
        makeEvent(5, 'template_selection', 'block_composed', { intents: ['saludo'] }),
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = condenseTimeline(detail as any, 'somnio-recompra-v1')
    const categories = out.map((i) => i.category)
    expect(categories).toContain('pipeline_decision')
    expect(categories).toContain('mode_transition')
    expect(categories).toContain('template_selection')
    expect(categories).not.toContain('char_delay')
    expect(categories).not.toContain('block_composition')
  })

  it('never includes queries (D-05 strict)', () => {
    const detail = makeDetail({
      events: [makeEvent(1, 'pipeline_decision', 'x')],
      queries: [
        {
          id: 'q1',
          sequence: 2,
          recordedAt: '2026-04-24T10:00:02Z',
          tableName: 'conversations',
          operation: 'select',
          filters: {},
          columns: null,
          requestBody: null,
          durationMs: 5,
          statusCode: 200,
          rowCount: 1,
          error: null,
        },
        {
          id: 'q2',
          sequence: 3,
          recordedAt: '2026-04-24T10:00:03Z',
          tableName: 'contacts',
          operation: 'update',
          filters: {},
          columns: null,
          requestBody: null,
          durationMs: 10,
          statusCode: 200,
          rowCount: 1,
          error: null,
        },
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = condenseTimeline(detail as any, 'somnio-v3')
    // No item should be tagged as a query — kind is only 'event' | 'ai'
    expect(out.every((i) => i.kind === 'event' || i.kind === 'ai')).toBe(true)
    expect(out.length).toBe(1)
  })

  it('sorts output by sequence ascending', () => {
    const detail = makeDetail({
      events: [
        makeEvent(5, 'pipeline_decision', 'a'),
        makeEvent(1, 'mode_transition', null, { from: 'x', to: 'y' }),
        makeEvent(3, 'comprehension', 'result', { intent: 'saludo' }),
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = condenseTimeline(detail as any, 'somnio-v3')
    const seqs = out.map((i) => i.sequence)
    expect(seqs).toEqual([1, 3, 5])
  })

  it('includes only mechanism AI call purposes', () => {
    const detail = makeDetail({
      aiCalls: [
        makeAiCall(1, 'comprehension'), // include
        makeAiCall(2, 'classifier'), // include
        makeAiCall(3, 'prompt_versioning'), // exclude
        makeAiCall(4, 'no_rep_l2'), // include
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = condenseTimeline(detail as any, 'somnio-v3')
    const purposes = out
      .filter((i) => i.kind === 'ai')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((i) => (i.raw as any).purpose)
    expect(purposes).toEqual(['comprehension', 'classifier', 'no_rep_l2'])
  })

  it('generates meaningful summaries per category', () => {
    const detail = makeDetail({
      events: [
        makeEvent(1, 'pipeline_decision', 'recompra_routed', {
          agentId: 'somnio-recompra-v1',
          reason: 'is_client',
        }),
        makeEvent(2, 'guard', 'blocked', { reason: 'low_confidence' }),
        makeEvent(3, 'template_selection', 'block_composed', {
          intents: ['saludo', 'precio'],
        }),
        makeEvent(4, 'mode_transition', null, {
          from: 'initial',
          to: 'ofrecer_promos',
          reason: 'client',
        }),
        makeEvent(5, 'comprehension', 'result', { intent: 'precio', confidence: 0.9 }),
        makeEvent(6, 'tool_call', null, { tool: 'contacts_get', status: 'ok' }),
        makeEvent(7, 'session_lifecycle', 'turn_started', {}),
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = condenseTimeline(detail as any, 'somnio-v3')
    expect(out.find((i) => i.category === 'pipeline_decision')?.summary).toMatch(
      /recompra_routed/,
    )
    expect(out.find((i) => i.category === 'guard')?.summary).toMatch(/low_confidence/)
    expect(out.find((i) => i.category === 'template_selection')?.summary).toMatch(
      /saludo/,
    )
    expect(out.find((i) => i.category === 'mode_transition')?.summary).toMatch(
      /initial.*ofrecer_promos/,
    )
    expect(out.find((i) => i.category === 'comprehension')?.summary).toMatch(/precio/)
  })

  it('always includes error events', () => {
    const detail = makeDetail({
      events: [makeEvent(1, 'error', 'runner_threw', { message: 'boom' })],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = condenseTimeline(detail as any, 'somnio-v3')
    expect(out.length).toBe(1)
    expect(out[0].category).toBe('error')
  })

  it('keeps handoff/timer_signal/media_gate/pre_send_check/interruption_handling/retake/ofi_inter/pending_pool/classifier whitelist members', () => {
    const detail = makeDetail({
      events: [
        makeEvent(1, 'handoff', 'human_takeover', {}),
        makeEvent(2, 'timer_signal', 'fired', {}),
        makeEvent(3, 'media_gate', 'passthrough', {}),
        makeEvent(4, 'pre_send_check', 'passed', {}),
        makeEvent(5, 'interruption_handling', 'branch', {}),
        makeEvent(6, 'retake', 'retoma_inicial', {}),
        makeEvent(7, 'ofi_inter', 'routed', {}),
        makeEvent(8, 'pending_pool', 'enqueued', {}),
        makeEvent(9, 'classifier', 'text', {}),
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = condenseTimeline(detail as any, 'somnio-recompra-v1')
    expect(out).toHaveLength(9)
    expect(out.every((i) => i.kind === 'event')).toBe(true)
  })
})
