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
 * Second AsyncLocalStorage layered on top of the collector ALS to carry
 * the LOGICAL PURPOSE of the next AI call (e.g. 'comprehension',
 * 'minifrase', 'paraphrase', 'block_composer').
 *
 * Why a second ALS instead of a parameter on the call site?
 *
 *   - Production agents construct the Anthropic client once and call
 *     `client.messages.create(...)` from many different pipeline steps.
 *     The client itself has no notion of "what it is being used for",
 *     and we do not want to pass the purpose down through every layer.
 *
 *   - The fetch wrapper observes Claude calls one level below the SDK,
 *     so by the time the request hits the wrapper the original call
 *     site is gone. ALS is the only mechanism that survives that round
 *     trip without modifying the request body.
 *
 *   - Layering it on a SEPARATE ALS keeps the collector ALS pure
 *     (collector lifetime = full turn) while purpose ALS lifetime can
 *     be as narrow as a single `messages.create(...)` call.
 *
 * Usage from Plans 05/06:
 *
 *   await runWithPurpose('comprehension', () =>
 *     anthropic.messages.create({...})
 *   )
 *
 * If `runWithPurpose` is not used, `getCurrentPurpose()` returns null
 * and the wrapper records `purpose: 'unknown'`. That is acceptable —
 * Plan 11 reviews the percentage of unknown purposes and decides
 * whether more migration work is needed.
 */
const purposeAls = new AsyncLocalStorage<string>()

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

/**
 * Run `fn` with `purpose` available via `getCurrentPurpose()` in the
 * entire async subtree.
 *
 * Intended scope: a SINGLE Anthropic call, e.g.
 *
 *   await runWithPurpose('comprehension', async () => {
 *     return await anthropic.messages.create({...})
 *   })
 *
 * Wider scopes are allowed but discouraged because the purpose label is
 * meant to identify which pipeline step issued the call.
 */
export function runWithPurpose<T>(
  purpose: string,
  fn: () => Promise<T>,
): Promise<T> {
  return purposeAls.run(purpose, fn)
}

/**
 * Returns the active purpose string for the current async context, or
 * null if no `runWithPurpose` frame is on the stack. The fetch wrapper
 * defaults to `'unknown'` when this returns null.
 */
export function getCurrentPurpose(): string | null {
  return purposeAls.getStore() ?? null
}
