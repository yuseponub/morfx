/**
 * Public API barrel for the production observability module.
 *
 * Wave 1 (Plan 02) exports the core primitives only:
 *
 *   - Feature flag         (flag.ts)
 *   - AsyncLocalStorage    (context.ts)
 *   - ObservabilityCollector + supporting types (collector.ts, types.ts)
 *   - Pricing helpers      (pricing.ts)
 *
 * Plans 03/04 (Wave 2) will add the fetch wrappers
 * (`makeObservableFetch`), the instrumented Supabase / Anthropic
 * factories, and the prompt-versioning hash. Plans 05+ wire the
 * collector into the production entry points and implement `flush()`.
 *
 * Stability contract: anything re-exported here is part of the public
 * surface that the rest of the repo may import. Changes after Wave 1
 * must be backwards-compatible.
 */

// Feature flag
export {
  isObservabilityEnabled,
  OBSERVABILITY_FLAG_NAME,
} from './flag'

// AsyncLocalStorage context
export { runWithCollector, getCollector } from './context'

// Collector class + helper input types
export {
  ObservabilityCollector,
  type ParsedQuery,
  type RecordAiCallInput,
  type RecordedErrorInfo,
} from './collector'

// Domain types
export type {
  AgentId,
  TriggerKind,
  EventCategory,
  ObservabilityEvent,
  ObservabilityQuery,
  ObservabilityAiCall,
  ObservabilityCollectorInit,
} from './types'

// Pricing
export { estimateCost, PRICING, type ModelPricing } from './pricing'
