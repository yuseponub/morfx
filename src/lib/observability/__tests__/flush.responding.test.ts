import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Flush mock strategy (D-10 Plan 01 Task 4):
 *
 * `flushCollector` issues ONE insert against `agent_observability_turns`
 * and up to three inserts against the child tables. We spy on the
 * supabase admin client factory to capture every `.from(table).insert(payload)`
 * call and assert the `agent_observability_turns` payload includes the
 * new `responding_agent_id` field (null or string).
 *
 * We also mock `resolvePromptVersions` (imported by flush) so the
 * prompt-version path doesn't try to issue real queries when the
 * collector has no aiCalls.
 */
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = []

function makeMockInsert() {
  return vi.fn().mockResolvedValue({ error: null })
}

vi.mock('@/lib/supabase/admin', () => ({
  createRawAdminClient: () => ({
    from: (table: string) => {
      const insert = (payload: unknown) => {
        insertCalls.push({
          table,
          payload: Array.isArray(payload)
            ? ({ __array: payload } as Record<string, unknown>)
            : (payload as Record<string, unknown>),
        })
        return Promise.resolve({ error: null })
      }
      return { insert }
    },
  }),
  createAdminClient: () => ({
    from: () => ({ insert: makeMockInsert() }),
  }),
}))

vi.mock('../prompt-version', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>
  return {
    ...mod,
    resolvePromptVersions: vi.fn().mockResolvedValue(new Map()),
  }
})

import { flushCollector } from '../flush'
import { ObservabilityCollector } from '../collector'

function makeCollectorWithEvent() {
  const c = new ObservabilityCollector({
    conversationId: '00000000-0000-0000-0000-000000000001',
    workspaceId: '00000000-0000-0000-0000-000000000002',
    agentId: 'somnio-v3',
    turnStartedAt: new Date('2026-04-24T10:00:00Z'),
    triggerKind: 'user_message',
  })
  // Ensure the fast-path empty-turn branch doesn't skip the insert.
  c.recordEvent('pipeline_decision', 'test_marker', { probe: true })
  return c
}

describe('flushCollector — responding_agent_id INSERT (D-10)', () => {
  beforeEach(() => {
    insertCalls.length = 0
  })

  it('includes responding_agent_id when set', async () => {
    const c = makeCollectorWithEvent()
    c.setRespondingAgentId('somnio-recompra-v1')

    await flushCollector(c)

    const turnInsert = insertCalls.find((call) => call.table === 'agent_observability_turns')
    expect(turnInsert).toBeDefined()
    expect(turnInsert!.payload.responding_agent_id).toBe('somnio-recompra-v1')
    // Entry agent_id is NOT overwritten — it still reflects the routing entry.
    expect(turnInsert!.payload.agent_id).toBe('somnio-v3')
  })

  it('sends null when respondingAgentId is null', async () => {
    const c = makeCollectorWithEvent()
    // Don't call setRespondingAgentId — stays null.

    await flushCollector(c)

    const turnInsert = insertCalls.find((call) => call.table === 'agent_observability_turns')
    expect(turnInsert).toBeDefined()
    expect(turnInsert!.payload.responding_agent_id).toBeNull()
  })

  it('preserves existing INSERT shape (agent_id, turn_number, trigger_kind, etc.)', async () => {
    const c = makeCollectorWithEvent()
    c.setRespondingAgentId('godentist')

    await flushCollector(c)

    const turnInsert = insertCalls.find((call) => call.table === 'agent_observability_turns')
    expect(turnInsert).toBeDefined()
    const p = turnInsert!.payload
    expect(p.conversation_id).toBe('00000000-0000-0000-0000-000000000001')
    expect(p.workspace_id).toBe('00000000-0000-0000-0000-000000000002')
    expect(p.agent_id).toBe('somnio-v3')
    expect(p.responding_agent_id).toBe('godentist')
    expect(p.turn_number).toBeNull()
    expect(p.trigger_kind).toBe('user_message')
    expect(p).toHaveProperty('started_at')
    expect(p).toHaveProperty('finished_at')
  })
})
