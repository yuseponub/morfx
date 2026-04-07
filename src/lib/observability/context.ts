/**
 * AsyncLocalStorage context for the production observability module.
 *
 * The collector for the current turn is propagated implicitly through
 * the async call tree, so downstream code (domain layer, agent
 * pipeline, fetch wrappers in Plans 03/04) can call `getCollector()`
 * without having the collector threaded as a parameter.
 *
 * Verified in 42.1-RESEARCH.md (Pattern 1):
 * - AsyncLocalStorage works in Vercel Node runtime (Inngest handlers
 *   are plain Node serverless, not Edge).
 * - Survives `await`, `Promise.all`, `setTimeout`, callbacks scheduled
 *   on the same tick by the Node event loop.
 * - One turn = one Inngest handler invocation = one ALS context.
 * - Concurrent invocations are isolated by Node.
 *
 * IMPORTANT: `import type` is used for ObservabilityCollector to avoid
 * a circular runtime dependency with collector.ts.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

import type { ObservabilityCollector } from './collector'

const als = new AsyncLocalStorage<ObservabilityCollector>()

/**
 * Run `fn` with `collector` available via `getCollector()` in the
 * entire async subtree.
 *
 * Caller is responsible for instantiating the collector and (later, in
 * Plan 07) calling `collector.flush()` after `fn` resolves.
 */
export async function runWithCollector<T>(
  collector: ObservabilityCollector,
  fn: () => Promise<T>,
): Promise<T> {
  return als.run(collector, fn)
}

/**
 * Returns the active collector for the current async context, or null
 * if no turn is active or the feature flag is OFF.
 *
 * Callers MUST handle the null case (no-op fast path) — see Pattern 2
 * in 42.1-RESEARCH.md.
 */
export function getCollector(): ObservabilityCollector | null {
  return als.getStore() ?? null
}
