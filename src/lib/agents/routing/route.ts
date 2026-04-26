/**
 * Public API for agent-lifecycle-router.
 *
 * Called by webhook-processor.ts (Plan 04) when
 * `workspace_agent_config.lifecycle_routing_enabled === true`.
 *
 * Pipeline (3-layer model):
 *   Layer 0 (Facts):       resolved on-demand via almanac (facts.ts)
 *   Layer 1 (Classifier):  rules emit `lifecycle_state`. Default 'new_prospect'
 *                          if no classifier rule fires.
 *   Layer 2 (Router):      rules consume `lifecycle_state` + tags + … and emit
 *                          `agent_id` (or null for explicit human handoff).
 *
 * Output (D-16, 4 reasons):
 *   - { agent_id: '<id>',  reason: 'matched',         rule_fired }
 *   - { agent_id: null,    reason: 'human_handoff',   rule_fired }
 *   - { agent_id: null,    reason: 'no_rule_matched' }
 *   - { agent_id: null,    reason: 'fallback_legacy' }   // engine.run threw
 *
 * Pitfall 1: FIRST-hit policy. Each rule's onSuccess calls `engine.stop()` so
 *            only the highest-priority matching rule per layer fires. The
 *            DB UNIQUE INDEX (Plan 01) prevents writes with same priority
 *            within a (workspace_id, rule_type) group; we still defend at
 *            cache load time and rely on engine.stop() at runtime.
 *
 * Pitfall 4: engine.run is wrapped in try/catch — any DB hiccup or fact
 *            resolver throw cascades to fallback_legacy and downstream
 *            webhook-processor uses its legacy if/else.
 *
 * Audit log: emitted fire-and-forget via recordAuditLog. Failures are logged
 *            but never block the routing decision.
 */

import { agentRegistry } from '@/lib/agents/registry'
import { recordAuditLog, type RoutingReason } from '@/lib/domain/routing'
import { getRulesForWorkspace } from './cache'
import { buildEngine } from './engine'

export interface RouteDecision {
  agent_id: string | null
  reason: RoutingReason
  lifecycle_state: string
  fired_classifier_rule_id: string | null
  fired_router_rule_id: string | null
  latency_ms: number
  facts_snapshot: Record<string, unknown>
}

export interface RouteAgentInput {
  contactId: string
  workspaceId: string
  conversationId?: string | null
  inboundMessageId?: string | null
}

/**
 * Names of dynamic facts to capture in the audit log snapshot. Keeping this
 * list explicit avoids leaking arbitrary almanac internals (e.g. derived
 * helpers) into the snapshot column. `lifecycle_state` is captured separately
 * via the decision object since it's the runtime value set between layers.
 */
const FACT_NAMES_TO_SNAPSHOT = [
  'activeOrderStage',
  'daysSinceLastDelivery',
  'daysSinceLastInteraction',
  'isClient',
  'tags',
  'hasPagoAnticipadoTag',
  'isInRecompraPipeline',
  'lastInteractionAt',
  'recompraEnabled',
] as const

const DEFAULT_LIFECYCLE_STATE = 'new_prospect'

export async function routeAgent(input: RouteAgentInput): Promise<RouteDecision> {
  const t0 = Date.now()
  let lifecycleState = DEFAULT_LIFECYCLE_STATE
  let firedClassifierId: string | null = null
  let firedRouterId: string | null = null
  let agentId: string | null = null
  let reason: RoutingReason = 'no_rule_matched'
  let factsSnapshot: Record<string, unknown> = {}

  try {
    const ruleSet = await getRulesForWorkspace(input.workspaceId)

    // ============ Layer 1: Classifier ============
    const e1 = buildEngine({
      contactId: input.contactId,
      workspaceId: input.workspaceId,
      rules: [], // attach via addRule below to wire onSuccess
    })
    for (const r of ruleSet.classifierRules) {
      e1.addRule({
        ...r.compiled,
        onSuccess: (event) => {
          firedClassifierId = r.id
          const params = (event as { params?: Record<string, unknown> }).params ?? {}
          if (typeof params.lifecycle_state === 'string') {
            lifecycleState = params.lifecycle_state
          }
          e1.stop()
        },
      })
    }
    const e1Result = await e1.run({})
    factsSnapshot = await snapshotFacts(e1Result.almanac, FACT_NAMES_TO_SNAPSHOT)

    // ============ Layer 2: Router ============
    const e2 = buildEngine({
      contactId: input.contactId,
      workspaceId: input.workspaceId,
      rules: [],
      runtimeFacts: { lifecycle_state: lifecycleState },
    })
    for (const r of ruleSet.routerRules) {
      e2.addRule({
        ...r.compiled,
        onSuccess: (event) => {
          firedRouterId = r.id
          const params = (event as { params?: Record<string, unknown> }).params ?? {}
          // agent_id may be string or null (D-16: null = human_handoff).
          // Use `in` check so a missing key behaves differently from explicit null.
          if ('agent_id' in params) {
            const candidate = params.agent_id
            agentId = typeof candidate === 'string' ? candidate : null
          }
          e2.stop()
        },
      })
    }
    await e2.run({})

    // ============ Determine reason (D-16) ============
    if (firedRouterId !== null && agentId !== null) {
      // matched → validate against agentRegistry (defense vs misconfigured rules)
      if (!agentRegistry.has(agentId)) {
        throw new Error(`Routing emitted unregistered agent_id: ${agentId}`)
      }
      reason = 'matched'
    } else if (firedRouterId !== null && agentId === null) {
      reason = 'human_handoff'
    } else {
      reason = 'no_rule_matched'
    }
  } catch (err) {
    console.error('[routing.route] engine pipeline threw — fallback_legacy:', err)
    reason = 'fallback_legacy'
    agentId = null
  }

  const decision: RouteDecision = {
    agent_id: agentId,
    reason,
    lifecycle_state: lifecycleState,
    fired_classifier_rule_id: firedClassifierId,
    fired_router_rule_id: firedRouterId,
    latency_ms: Date.now() - t0,
    facts_snapshot: factsSnapshot,
  }

  // Fire-and-forget audit log. Failures must not block routing.
  void recordAuditLog({
    workspace_id: input.workspaceId,
    contact_id: input.contactId,
    conversation_id: input.conversationId ?? null,
    inbound_message_id: input.inboundMessageId ?? null,
    agent_id: decision.agent_id,
    reason: decision.reason,
    lifecycle_state: decision.lifecycle_state,
    fired_classifier_rule_id: decision.fired_classifier_rule_id,
    fired_router_rule_id: decision.fired_router_rule_id,
    facts_snapshot: decision.facts_snapshot,
    rule_set_version_at_decision: null, // Plan 06 may compute via cache.maxUpdatedAt
    latency_ms: decision.latency_ms,
  }).catch((err) => {
    console.error('[routing.route] audit log write failed:', err)
  })

  return decision
}

/**
 * Reads a fixed set of fact names from the almanac post-run. Wrapped so that
 * one missing fact (allowUndefinedFacts:true) cannot derail the snapshot.
 */
async function snapshotFacts(
  almanac: { factValue<T = unknown>(name: string): Promise<T> },
  names: readonly string[],
): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {}
  for (const name of names) {
    try {
      snapshot[name] = await almanac.factValue(name)
    } catch {
      snapshot[name] = null
    }
  }
  return snapshot
}
