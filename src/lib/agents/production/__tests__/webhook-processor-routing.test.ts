/**
 * Plan 04 Task 2 — webhook-processor routing integration smoke tests.
 *
 * Strategy: We do NOT exercise `processMessageWithAgent` end-to-end —
 * that would require mocking ~10 modules (Supabase, dynamic imports of
 * somnio-recompra/somnio-v3/godentist, V3ProductionRunner, observability,
 * domain layers). Instead — following the established pattern in
 * `webhook-processor.recompra-flag.test.ts` — we MIRROR the routing-gate
 * decision logic in a local helper that consumes the same inputs and
 * produces the same observable side-effects:
 *
 *   - `routerEnabled` flag check
 *   - `routeAgent` invocation gating
 *   - `applyRouterDecision` helper consumption
 *   - `useRecompraBranch` switching
 *   - `routerDecidedAgentId` agent_id injection
 *   - silence early return
 *   - collector event emission
 *
 * The acceptance_criteria grep checks at the source pin the literal
 * contracts in webhook-processor.ts itself (event names, identifiers).
 *
 * This test confirms:
 *   1. Flag OFF (default Regla 6) → routeAgent NEVER invoked, legacy path runs.
 *   2. Flag ON + matched → routerDecidedAgentId injected; router_matched event.
 *   3. Flag ON + human_handoff → silence (return success); router_human_handoff event.
 *   4. Flag ON + no_rule_matched → fallback to conversational_agent_id; router_fallback_default_agent event.
 *   5. Flag ON + fallback_legacy → routerHandledMessage=false (legacy runs); router_failed_fallback_legacy event.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { applyRouterDecision, dispositionForRouterThrow } from '@/lib/agents/routing/integrate'
import type { RouteDecision } from '@/lib/agents/routing/route'

// ---------------------------------------------------------------------------
// Types mirroring the webhook-processor-side state needed to assert behavior.
// ---------------------------------------------------------------------------

interface MirrorOutcome {
  routeAgentCalled: boolean
  routerHandledMessage: boolean
  routerDecidedAgentId: string | null
  earlyReturnSuccess: boolean
  effectiveAgentIdForRecompra: string
  effectiveAgentIdForV3: string
  collectorEvents: Array<{ name: string; payload: Record<string, unknown> }>
}

/**
 * Mirror of the gate logic in webhook-processor.ts post-Plan-04. Mirrors
 * exactly the sequence of decisions:
 *   1. compute routerEnabled
 *   2. if enabled + contactId → call routeAgent + applyRouterDecision
 *   3. emit collector event for the disposition
 *   4. set routerDecidedAgentId / routerHandledMessage based on kind
 *   5. compute effective agentId for downstream construction sites
 *
 * Any change to the source MUST be reflected here. The grep at acceptance
 * criteria guards literal names; this helper guards behavioral wiring.
 */
async function mirrorRoutingGate(params: {
  contactId: string | null
  workspaceId: string
  conversationId: string
  config: {
    lifecycle_routing_enabled: boolean
    conversational_agent_id?: string
  }
  routeAgentResult: RouteDecision | (() => Promise<never>)
}): Promise<MirrorOutcome> {
  const collectorEvents: MirrorOutcome['collectorEvents'] = []
  const routerEnabled = params.config?.lifecycle_routing_enabled ?? false
  let routerDecidedAgentId: string | null = null
  let routerHandledMessage = false
  let earlyReturnSuccess = false
  let routeAgentCalled = false

  if (routerEnabled && params.contactId) {
    let disposition
    try {
      const decision: RouteDecision =
        typeof params.routeAgentResult === 'function'
          ? await (params.routeAgentResult as () => Promise<never>)()
          : params.routeAgentResult
      routeAgentCalled = true
      disposition = applyRouterDecision(
        decision,
        params.config?.conversational_agent_id ?? 'somnio-sales-v1',
      )
    } catch {
      routeAgentCalled = true
      disposition = dispositionForRouterThrow()
    }

    collectorEvents.push({
      name: disposition.collectorEvent.name,
      payload: {
        conversationId: params.conversationId,
        contactId: params.contactId,
        agentId: disposition.agentId,
        lifecycleState: disposition.lifecycleState,
        firedRouterRuleId: disposition.collectorEvent.firedRouterRuleId,
        firedClassifierRuleId: disposition.collectorEvent.firedClassifierRuleId,
        latencyMs: disposition.collectorEvent.latencyMs,
      },
    })

    switch (disposition.kind) {
      case 'silence':
        earlyReturnSuccess = true
        break
      case 'use-agent':
        routerDecidedAgentId = disposition.agentId
        routerHandledMessage = true
        break
      case 'fallback-to-legacy':
        // routerHandledMessage stays false → legacy block runs.
        break
    }
  }

  // Mirror the agent_id injection at construction sites (recompra branch and
  // v3 branch). These are the exact `??` chains used in webhook-processor.ts.
  const effectiveAgentIdForRecompra = routerDecidedAgentId ?? 'somnio-recompra-v1'
  const effectiveAgentIdForV3 =
    routerDecidedAgentId ??
    params.config?.conversational_agent_id ??
    'somnio-sales-v1'

  return {
    routeAgentCalled,
    routerHandledMessage,
    routerDecidedAgentId,
    earlyReturnSuccess,
    effectiveAgentIdForRecompra,
    effectiveAgentIdForV3,
    collectorEvents,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('webhook-processor routing gate — Plan 04 (flag OFF parity + 4 reasons D-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('flag OFF → routeAgent NEVER called, legacy path runs (parity, Regla 6)', async () => {
    // Sentinel will be invoked if and only if the gate calls routeAgent.
    const sentinel = vi.fn().mockResolvedValue({
      agent_id: 'somnio-recompra-v1',
      reason: 'matched',
    } as RouteDecision)

    const outcome = await mirrorRoutingGate({
      contactId: 'contact-1',
      workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      conversationId: 'conv-1',
      config: {
        lifecycle_routing_enabled: false, // FLAG OFF (Regla 6 default)
        conversational_agent_id: 'somnio-sales-v3',
      },
      routeAgentResult: sentinel as unknown as RouteDecision, // never called
    })

    expect(outcome.routeAgentCalled).toBe(false)
    expect(sentinel).not.toHaveBeenCalled()
    expect(outcome.routerHandledMessage).toBe(false)
    expect(outcome.routerDecidedAgentId).toBeNull()
    expect(outcome.earlyReturnSuccess).toBe(false)
    expect(outcome.collectorEvents).toEqual([])
    // Downstream construction sites fall back to legacy literals when no router.
    expect(outcome.effectiveAgentIdForRecompra).toBe('somnio-recompra-v1')
    expect(outcome.effectiveAgentIdForV3).toBe('somnio-sales-v3') // conversational_agent_id from config
  })

  it('flag ON + reason=matched → routerDecidedAgentId injected into runner, router_matched event', async () => {
    const decision: RouteDecision = {
      agent_id: 'somnio-recompra-v1',
      reason: 'matched',
      lifecycle_state: 'in_transit',
      fired_classifier_rule_id: 'cls-1',
      fired_router_rule_id: 'rt-1',
      latency_ms: 5,
      facts_snapshot: {},
    }

    const outcome = await mirrorRoutingGate({
      contactId: 'contact-1',
      workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      conversationId: 'conv-1',
      config: {
        lifecycle_routing_enabled: true,
        conversational_agent_id: 'somnio-sales-v3',
      },
      routeAgentResult: decision,
    })

    expect(outcome.routeAgentCalled).toBe(true)
    expect(outcome.routerHandledMessage).toBe(true)
    expect(outcome.routerDecidedAgentId).toBe('somnio-recompra-v1')
    expect(outcome.earlyReturnSuccess).toBe(false)
    // Critical: the recompra branch (and V3 branch) sees the routed agent_id.
    expect(outcome.effectiveAgentIdForRecompra).toBe('somnio-recompra-v1')
    expect(outcome.effectiveAgentIdForV3).toBe('somnio-recompra-v1')
    // Collector event for the matched path.
    expect(outcome.collectorEvents).toHaveLength(1)
    expect(outcome.collectorEvents[0].name).toBe('router_matched')
    expect(outcome.collectorEvents[0].payload.agentId).toBe('somnio-recompra-v1')
    expect(outcome.collectorEvents[0].payload.firedRouterRuleId).toBe('rt-1')
  })

  it('flag ON + reason=human_handoff → silence (return success), no runner', async () => {
    const decision: RouteDecision = {
      agent_id: null,
      reason: 'human_handoff',
      lifecycle_state: 'blocked',
      fired_classifier_rule_id: null,
      fired_router_rule_id: 'rt-handoff',
      latency_ms: 3,
      facts_snapshot: {},
    }

    const outcome = await mirrorRoutingGate({
      contactId: 'contact-1',
      workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      conversationId: 'conv-1',
      config: {
        lifecycle_routing_enabled: true,
        conversational_agent_id: 'somnio-sales-v3',
      },
      routeAgentResult: decision,
    })

    expect(outcome.routeAgentCalled).toBe(true)
    expect(outcome.earlyReturnSuccess).toBe(true)
    expect(outcome.routerHandledMessage).toBe(false) // we returned, didn't dispatch
    expect(outcome.routerDecidedAgentId).toBeNull()
    expect(outcome.collectorEvents[0].name).toBe('router_human_handoff')
    expect(outcome.collectorEvents[0].payload.firedRouterRuleId).toBe('rt-handoff')
  })

  it('flag ON + reason=no_rule_matched → falls back to conversational_agent_id (D-16 default)', async () => {
    const decision: RouteDecision = {
      agent_id: null,
      reason: 'no_rule_matched',
      lifecycle_state: 'new_prospect',
      fired_classifier_rule_id: null,
      fired_router_rule_id: null,
      latency_ms: 2,
      facts_snapshot: {},
    }

    const outcome = await mirrorRoutingGate({
      contactId: 'contact-1',
      workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      conversationId: 'conv-1',
      config: {
        lifecycle_routing_enabled: true,
        conversational_agent_id: 'somnio-sales-v3',
      },
      routeAgentResult: decision,
    })

    expect(outcome.routeAgentCalled).toBe(true)
    expect(outcome.routerHandledMessage).toBe(true)
    // The fallback agent_id from config is what got "decided" by the helper.
    expect(outcome.routerDecidedAgentId).toBe('somnio-sales-v3')
    expect(outcome.effectiveAgentIdForV3).toBe('somnio-sales-v3')
    // Recompra branch entry would NOT happen (router decided non-recompra agent).
    // The mirror exposes the literal substitution result; the actual `useRecompraBranch`
    // gate (routerDecidedAgentId === 'somnio-recompra-v1') would be FALSE here.
    expect(outcome.collectorEvents[0].name).toBe('router_fallback_default_agent')
    expect(outcome.collectorEvents[0].payload.agentId).toBe('somnio-sales-v3')
  })

  it('flag ON + reason=fallback_legacy → routerHandledMessage=false (legacy if/else runs)', async () => {
    const decision: RouteDecision = {
      agent_id: null,
      reason: 'fallback_legacy',
      lifecycle_state: 'new_prospect',
      fired_classifier_rule_id: null,
      fired_router_rule_id: null,
      latency_ms: 8,
      facts_snapshot: {},
    }

    const outcome = await mirrorRoutingGate({
      contactId: 'contact-1',
      workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      conversationId: 'conv-1',
      config: {
        lifecycle_routing_enabled: true,
        conversational_agent_id: 'somnio-sales-v3',
      },
      routeAgentResult: decision,
    })

    expect(outcome.routeAgentCalled).toBe(true)
    expect(outcome.routerHandledMessage).toBe(false) // legacy path will run
    expect(outcome.routerDecidedAgentId).toBeNull()
    expect(outcome.earlyReturnSuccess).toBe(false)
    // Without router decision, downstream construction sites fall back to literals.
    expect(outcome.effectiveAgentIdForRecompra).toBe('somnio-recompra-v1')
    expect(outcome.effectiveAgentIdForV3).toBe('somnio-sales-v3')
    expect(outcome.collectorEvents[0].name).toBe('router_failed_fallback_legacy')
    // No router_matched (we're in legacy fallback, not match path).
    expect(outcome.collectorEvents.find((e) => e.name === 'router_matched')).toBeUndefined()
  })

  it('flag ON + routeAgent throws uncaught → dispositionForRouterThrow → router_threw_fallback_legacy', async () => {
    const outcome = await mirrorRoutingGate({
      contactId: 'contact-1',
      workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      conversationId: 'conv-1',
      config: {
        lifecycle_routing_enabled: true,
        conversational_agent_id: 'somnio-sales-v3',
      },
      // Simulates `routeAgent` itself throwing (defense-in-depth path).
      routeAgentResult: () => {
        throw new Error('routeAgent crashed')
      },
    })

    expect(outcome.routeAgentCalled).toBe(true)
    expect(outcome.routerHandledMessage).toBe(false)
    expect(outcome.routerDecidedAgentId).toBeNull()
    expect(outcome.collectorEvents[0].name).toBe('router_threw_fallback_legacy')
  })

  it('flag ON + contactId null → router NOT invoked (gate guards null contact)', async () => {
    const sentinel = vi.fn()
    const outcome = await mirrorRoutingGate({
      contactId: null,
      workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      conversationId: 'conv-1',
      config: {
        lifecycle_routing_enabled: true,
        conversational_agent_id: 'somnio-sales-v3',
      },
      routeAgentResult: sentinel as unknown as RouteDecision,
    })

    expect(outcome.routeAgentCalled).toBe(false)
    expect(outcome.routerHandledMessage).toBe(false)
    expect(outcome.collectorEvents).toEqual([])
  })
})
