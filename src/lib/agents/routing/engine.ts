/**
 * Engine factory — one Engine per request per layer (Pitfall 7).
 * Cache stores the rule definitions (cache.ts); this builds a fresh Engine
 * each call so concurrent requests cannot leak almanacs or facts.
 */

import { Engine } from 'json-rules-engine'
import type { RuleProperties } from 'json-rules-engine'
import { registerOperators } from './operators'
import { registerFacts } from './facts'

export interface BuildEngineInput {
  contactId: string
  workspaceId: string
  rules: RuleProperties[]
  /** Static facts injected at engine build time (e.g. `lifecycle_state` for Layer 2). */
  runtimeFacts?: Record<string, unknown>
}

/**
 * Builds a fresh Engine with the 5 custom operators + 10 dynamic fact
 * resolvers registered. Adds any provided rules and runtime facts.
 *
 * NOTE: route.ts attaches `onSuccess` callbacks per-rule INSTEAD of using
 * this factory's `rules` parameter directly — that lets it capture
 * `fired_classifier_rule_id` / `fired_router_rule_id`. This factory still
 * accepts `rules` for tests and for Plan 05 dry-run that doesn't need
 * onSuccess wiring.
 */
export function buildEngine(input: BuildEngineInput): Engine {
  const engine = new Engine([], {
    allowUndefinedFacts: true,
    allowUndefinedConditions: false,
    replaceFactsInEventParams: false,
  })
  registerOperators(engine)
  registerFacts(engine, { contactId: input.contactId, workspaceId: input.workspaceId })
  // Static runtime facts (e.g. lifecycle_state set between Layer 1 and Layer 2).
  for (const [factId, value] of Object.entries(input.runtimeFacts ?? {})) {
    engine.addFact(factId, value as never)
  }
  for (const rule of input.rules) {
    engine.addRule(rule)
  }
  return engine
}
