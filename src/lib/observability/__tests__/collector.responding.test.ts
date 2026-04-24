import { describe, it, expect, beforeEach } from 'vitest'
import { ObservabilityCollector } from '../collector'
import type { ObservabilityCollectorInit } from '../types'

function makeInit(overrides: Partial<ObservabilityCollectorInit> = {}): ObservabilityCollectorInit {
  return {
    conversationId: '00000000-0000-0000-0000-000000000001',
    workspaceId: '00000000-0000-0000-0000-000000000002',
    agentId: 'somnio-v3',
    turnStartedAt: new Date('2026-04-24T10:00:00Z'),
    triggerKind: 'user_message',
    ...overrides,
  }
}

describe('ObservabilityCollector — respondingAgentId setter (D-10, D-12)', () => {
  let c: ObservabilityCollector

  beforeEach(() => {
    c = new ObservabilityCollector(makeInit())
  })

  it('initializes respondingAgentId to null when init.respondingAgentId is undefined', () => {
    expect(c.respondingAgentId).toBeNull()
  })

  it('setRespondingAgentId from null sets the field', () => {
    c.setRespondingAgentId('somnio-recompra-v1')
    expect(c.respondingAgentId).toBe('somnio-recompra-v1')
  })

  it('is idempotent on same value', () => {
    c.setRespondingAgentId('somnio-recompra-v1')
    c.setRespondingAgentId('somnio-recompra-v1')
    expect(c.respondingAgentId).toBe('somnio-recompra-v1')
  })

  it('ignores second-different-value (preserves routing audit trail)', () => {
    c.setRespondingAgentId('somnio-recompra-v1')
    c.setRespondingAgentId('godentist')
    expect(c.respondingAgentId).toBe('somnio-recompra-v1')
  })

  it('never throws (Regla 6 defensive)', () => {
    expect(() => c.setRespondingAgentId('somnio-recompra-v1')).not.toThrow()
    // @ts-expect-error — simulate garbage input to exercise the defensive try/catch
    expect(() => c.setRespondingAgentId(null)).not.toThrow()
  })

  it('mergeFrom propagates respondingAgentId when outer is null', () => {
    c.mergeFrom({
      events: [],
      queries: [],
      aiCalls: [],
      respondingAgentId: 'somnio-v3',
    })
    expect(c.respondingAgentId).toBe('somnio-v3')
  })

  it('mergeFrom ignores respondingAgentId when outer already has a different value', () => {
    c.setRespondingAgentId('somnio-recompra-v1')
    c.mergeFrom({
      events: [],
      queries: [],
      aiCalls: [],
      respondingAgentId: 'somnio-v3',
    })
    expect(c.respondingAgentId).toBe('somnio-recompra-v1')
  })

  it('constructor seeds respondingAgentId when init.respondingAgentId is provided', () => {
    const seeded = new ObservabilityCollector(makeInit({ respondingAgentId: 'somnio-recompra-v1' }))
    expect(seeded.respondingAgentId).toBe('somnio-recompra-v1')
  })
})
