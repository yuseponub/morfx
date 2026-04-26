/**
 * Plan 04 Task 2 — unit tests for integrate.ts (I-2 fix Approach A).
 *
 * Tests `applyRouterDecision` + `dispositionForRouterThrow` in isolation.
 * Webhook-processor consumes the disposition; this file pins the contract
 * so any change to the switch is caught by CI before it reaches production.
 *
 * Coverage (D-16 4 reasons + defense-in-depth throw):
 *   1. matched              → kind=use-agent,           agentId=decision.agent_id, event=router_matched
 *   2. human_handoff        → kind=silence,             agentId=null,              event=router_human_handoff
 *   3. no_rule_matched      → kind=use-agent,           agentId=fallback,          event=router_fallback_default_agent
 *   4. fallback_legacy      → kind=fallback-to-legacy,  agentId=null,              event=router_failed_fallback_legacy
 *   5. dispositionForRouterThrow → kind=fallback-to-legacy, agentId=null,          event=router_threw_fallback_legacy
 */

import { describe, it, expect } from 'vitest'

import { applyRouterDecision, dispositionForRouterThrow } from '../integrate'
import type { RouteDecision } from '../route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FALLBACK_AGENT = 'somnio-sales-v3'

function buildDecision(overrides: Partial<RouteDecision>): RouteDecision {
  return {
    agent_id: null,
    reason: 'no_rule_matched',
    lifecycle_state: 'new_prospect',
    fired_classifier_rule_id: null,
    fired_router_rule_id: null,
    latency_ms: 0,
    facts_snapshot: {},
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// applyRouterDecision — 4 reasons (D-16)
// ---------------------------------------------------------------------------

describe('integrate.applyRouterDecision — D-16 reasons', () => {
  it('reason=matched → kind=use-agent, agentId=decision.agent_id, event=router_matched', () => {
    const decision = buildDecision({
      agent_id: 'somnio-recompra-v1',
      reason: 'matched',
      lifecycle_state: 'in_transit',
      fired_classifier_rule_id: 'cls-1',
      fired_router_rule_id: 'rt-1',
      latency_ms: 5,
    })

    const disposition = applyRouterDecision(decision, FALLBACK_AGENT)

    expect(disposition.kind).toBe('use-agent')
    expect(disposition.agentId).toBe('somnio-recompra-v1')
    expect(disposition.reason).toBe('matched')
    expect(disposition.lifecycleState).toBe('in_transit')
    expect(disposition.collectorEvent.name).toBe('router_matched')
    expect(disposition.collectorEvent.firedRouterRuleId).toBe('rt-1')
    expect(disposition.collectorEvent.firedClassifierRuleId).toBe('cls-1')
    expect(disposition.collectorEvent.latencyMs).toBe(5)
  })

  it('reason=human_handoff → kind=silence, agentId=null, event=router_human_handoff', () => {
    const decision = buildDecision({
      agent_id: null,
      reason: 'human_handoff',
      lifecycle_state: 'blocked',
      fired_router_rule_id: 'rt-handoff',
      latency_ms: 3,
    })

    const disposition = applyRouterDecision(decision, FALLBACK_AGENT)

    expect(disposition.kind).toBe('silence')
    expect(disposition.agentId).toBeNull()
    expect(disposition.reason).toBe('human_handoff')
    expect(disposition.lifecycleState).toBe('blocked')
    expect(disposition.collectorEvent.name).toBe('router_human_handoff')
    expect(disposition.collectorEvent.firedRouterRuleId).toBe('rt-handoff')
    expect(disposition.collectorEvent.latencyMs).toBe(3)
  })

  it('reason=no_rule_matched → kind=use-agent, agentId=fallback, event=router_fallback_default_agent', () => {
    const decision = buildDecision({
      agent_id: null,
      reason: 'no_rule_matched',
      lifecycle_state: 'new_prospect',
      latency_ms: 2,
    })

    const disposition = applyRouterDecision(decision, FALLBACK_AGENT)

    expect(disposition.kind).toBe('use-agent')
    // Critical: fallback agent_id (preserves legacy "always have a default agent" semantics, D-16).
    expect(disposition.agentId).toBe(FALLBACK_AGENT)
    expect(disposition.reason).toBe('no_rule_matched')
    expect(disposition.lifecycleState).toBe('new_prospect')
    expect(disposition.collectorEvent.name).toBe('router_fallback_default_agent')
    expect(disposition.collectorEvent.firedRouterRuleId).toBeNull()
    expect(disposition.collectorEvent.firedClassifierRuleId).toBeNull()
  })

  it('reason=fallback_legacy → kind=fallback-to-legacy, agentId=null, event=router_failed_fallback_legacy', () => {
    const decision = buildDecision({
      agent_id: null,
      reason: 'fallback_legacy',
      lifecycle_state: 'new_prospect',
      latency_ms: 8,
    })

    const disposition = applyRouterDecision(decision, FALLBACK_AGENT)

    expect(disposition.kind).toBe('fallback-to-legacy')
    expect(disposition.agentId).toBeNull()
    expect(disposition.reason).toBe('fallback_legacy')
    expect(disposition.collectorEvent.name).toBe('router_failed_fallback_legacy')
    expect(disposition.collectorEvent.latencyMs).toBe(8)
  })

  it('preserves fired_router_rule_id and fired_classifier_rule_id verbatim (audit trail)', () => {
    const decision = buildDecision({
      agent_id: 'somnio-sales-v3',
      reason: 'matched',
      fired_classifier_rule_id: 'cls-uuid-abc',
      fired_router_rule_id: 'rt-uuid-xyz',
      latency_ms: 12,
    })

    const disposition = applyRouterDecision(decision, FALLBACK_AGENT)

    expect(disposition.collectorEvent.firedRouterRuleId).toBe('rt-uuid-xyz')
    expect(disposition.collectorEvent.firedClassifierRuleId).toBe('cls-uuid-abc')
    expect(disposition.collectorEvent.latencyMs).toBe(12)
  })

  it('does not mutate the input decision object (pure function)', () => {
    const decision = buildDecision({
      agent_id: 'somnio-recompra-v1',
      reason: 'matched',
    })
    const snapshot = JSON.stringify(decision)

    applyRouterDecision(decision, FALLBACK_AGENT)

    expect(JSON.stringify(decision)).toBe(snapshot)
  })
})

// ---------------------------------------------------------------------------
// dispositionForRouterThrow — defense-in-depth path
// ---------------------------------------------------------------------------

describe('integrate.dispositionForRouterThrow — defensive path', () => {
  it('returns kind=fallback-to-legacy with router_threw event', () => {
    const disposition = dispositionForRouterThrow()

    expect(disposition.kind).toBe('fallback-to-legacy')
    expect(disposition.agentId).toBeNull()
    expect(disposition.reason).toBe('router_threw')
    expect(disposition.lifecycleState).toBeNull()
    expect(disposition.collectorEvent.name).toBe('router_threw_fallback_legacy')
    expect(disposition.collectorEvent.firedRouterRuleId).toBeNull()
    expect(disposition.collectorEvent.firedClassifierRuleId).toBeNull()
    expect(disposition.collectorEvent.latencyMs).toBe(0)
  })
})
