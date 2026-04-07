/**
 * `createInstrumentedAnthropic` — the SINGLE point in the repository
 * where `new Anthropic({...})` is allowed to be constructed.
 *
 * Why this exists:
 *
 *   - Plan 04 of Phase 42.1 introduces a fetch wrapper that captures
 *     every Claude call (request body, response content, tokens, cost,
 *     duration). To do that the fetch must be injected at construction
 *     time via the SDK's `fetch` option.
 *   - Centralising construction guarantees that EVERY production agent
 *     client routes through the wrapper. Plans 05/06 will migrate the
 *     ~10 existing call sites; afterwards a lint rule (or a simple
 *     grep in CI) will enforce that no other file calls `new Anthropic`
 *     directly.
 *
 * Behaviour rules:
 *
 *   1. When the observability feature flag is OFF (no collector in the
 *      AsyncLocalStorage context) the wrapper short-circuits to the
 *      underlying `fetch` with a single null check. Zero overhead.
 *
 *   2. The wrapper NEVER alters request or response bytes. It only
 *      observes — request body is parsed defensively and the response
 *      is `.clone()`-ed before reading. The original `Response` object
 *      flows through to the SDK unchanged.
 *
 *   3. Streaming responses (Server-Sent Events) are intentionally NOT
 *      consumed. The wrapper records a coarse `ai_call_streaming` event
 *      and returns the response untouched so the SDK's stream parser
 *      keeps working. Verified in 42.1-RESEARCH.md: production agents
 *      do not currently use streaming.
 *
 * Typing note: the Anthropic SDK declares its own `Fetch` type. The
 * standard global `fetch` is structurally compatible but TS may flag
 * the assignment in some configurations, so we use an explicit
 * `as unknown as` cast at the boundary. This is the only place in the
 * module where such a cast is acceptable.
 */

import Anthropic from '@anthropic-ai/sdk'

import { makeObservableFetch } from './fetch-wrapper'

export interface CreateInstrumentedAnthropicOpts {
  /** Override `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string
  /** Override the default Anthropic API base URL (used in tests). */
  baseURL?: string
}

/**
 * Construct an Anthropic SDK client whose underlying `fetch` is the
 * observability wrapper. Call this from every production agent code
 * path; never call `new Anthropic(...)` directly elsewhere.
 */
export function createInstrumentedAnthropic(
  opts: CreateInstrumentedAnthropicOpts = {},
): Anthropic {
  return new Anthropic({
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    baseURL: opts.baseURL,
    fetch: makeObservableFetch(fetch, 'anthropic') as unknown as typeof fetch,
  })
}
