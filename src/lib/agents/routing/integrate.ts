/**
 * Bridge entre webhook-processor y router engine
 * (Plan 04 — agent-lifecycle-router — I-2 fix Approach A).
 *
 * Encapsula el switch sobre los 4 reasons del router para:
 *   1) reducir el blast radius del cambio en webhook-processor.ts
 *      (D-15 — minimo cambio sobre el codigo legacy productivo).
 *   2) hacer testeable la logica de decision en aislamiento (sin mockear
 *      los ~10 modulos que importa webhook-processor: supabase, somnio
 *      dynamic imports, runners, observability, etc).
 *
 * webhook-processor.ts invoca esta funcion CUANDO
 * `lifecycle_routing_enabled === true`. Cuando reason === 'fallback_legacy'
 * o el call mismo lanza, el caller debe correr el legacy if/else (Pitfall 4).
 *
 * Regla 6: este modulo NO altera comportamiento productivo cuando flag OFF.
 *          El switch solo se invoca dentro de `if (routerEnabled && contactId)`.
 */

import type { RouteDecision } from './route'
import type { RoutingReason } from '@/lib/domain/routing'

export type RouterDispositionKind =
  // matched o no_rule_matched (con fallback agent_id) — webhook-processor
  // continua al downstream branch usando `agentId` de la disposicion.
  | 'use-agent'
  // human_handoff — webhook-processor returns success (no runner, no response).
  | 'silence'
  // engine threw o reason='fallback_legacy' o el call routeAgent mismo lanzo —
  // webhook-processor cae al legacy if/else (Pitfall 4).
  | 'fallback-to-legacy'

/**
 * Naming exacto consumido por getCollector()?.recordEvent('pipeline_decision', name, ...).
 * Garantizado por tests (smoke + unit) y por grep en acceptance criteria.
 */
export type CollectorEventName =
  | 'router_matched'
  | 'router_human_handoff'
  | 'router_fallback_default_agent'
  | 'router_failed_fallback_legacy'
  | 'router_threw_fallback_legacy'

export interface RouterDisposition {
  kind: RouterDispositionKind
  /** Populated when kind='use-agent'; null para 'silence' y 'fallback-to-legacy'. */
  agentId: string | null
  reason: RoutingReason | 'router_threw'
  lifecycleState: string | null
  collectorEvent: {
    name: CollectorEventName
    firedRouterRuleId: string | null
    firedClassifierRuleId: string | null
    latencyMs: number
  }
}

/**
 * Maps a `RouteDecision` to a `RouterDisposition` que webhook-processor
 * consume para decidir: continuar downstream con que agent_id, retornar
 * silencio, o caer al legacy if/else.
 *
 * Cobertura de los 4 reasons D-16 + el caso defensivo.
 */
export function applyRouterDecision(
  decision: RouteDecision,
  conversationalAgentIdFallback: string,
): RouterDisposition {
  const baseEvent = {
    firedRouterRuleId: decision.fired_router_rule_id,
    firedClassifierRuleId: decision.fired_classifier_rule_id,
    latencyMs: decision.latency_ms,
  }
  switch (decision.reason) {
    case 'matched':
      return {
        kind: 'use-agent',
        agentId: decision.agent_id,
        reason: 'matched',
        lifecycleState: decision.lifecycle_state,
        collectorEvent: { ...baseEvent, name: 'router_matched' },
      }
    case 'human_handoff':
      return {
        kind: 'silence',
        agentId: null,
        reason: 'human_handoff',
        lifecycleState: decision.lifecycle_state,
        collectorEvent: { ...baseEvent, name: 'router_human_handoff' },
      }
    case 'no_rule_matched':
      return {
        kind: 'use-agent',
        agentId: conversationalAgentIdFallback,
        reason: 'no_rule_matched',
        lifecycleState: decision.lifecycle_state,
        collectorEvent: { ...baseEvent, name: 'router_fallback_default_agent' },
      }
    case 'fallback_legacy':
    default:
      return {
        kind: 'fallback-to-legacy',
        agentId: null,
        reason: 'fallback_legacy',
        lifecycleState: decision.lifecycle_state,
        collectorEvent: { ...baseEvent, name: 'router_failed_fallback_legacy' },
      }
  }
}

/**
 * Disposition para el caso donde `routeAgent` mismo lanza (defense-in-depth —
 * no deberia ocurrir porque route.ts envuelve todo en try/catch y emite
 * reason='fallback_legacy', pero el caller NO debe asumir).
 */
export function dispositionForRouterThrow(): RouterDisposition {
  return {
    kind: 'fallback-to-legacy',
    agentId: null,
    reason: 'router_threw',
    lifecycleState: null,
    collectorEvent: {
      firedClassifierRuleId: null,
      firedRouterRuleId: null,
      latencyMs: 0,
      name: 'router_threw_fallback_legacy',
    },
  }
}
