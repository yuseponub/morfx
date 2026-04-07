/**
 * TODO(plan-11): VERIFICAR precios contra https://www.anthropic.com/pricing
 * antes de activar en produccion. Review quarterly.
 *
 * Anthropic per-model pricing for cost estimation.
 *
 * Values are USD per million tokens (MTok). Confidence: MEDIUM —
 * captured 2026-04-07 from public Anthropic pricing pages. The numbers
 * below MUST be re-verified before Plan 11 (activation in prod):
 *
 *   Haiku 4.5  : ~$1.00 input / ~$5.00 output per MTok
 *   Sonnet 4.5 : ~$3.00 input / ~$15.00 output per MTok
 *
 * Cache pricing (applies to both):
 *   cache_creation = 1.25x input price
 *   cache_read     = 0.10x input price
 *
 * Model IDs match what the repo currently uses (verified via grep
 * 2026-04-07): `claude-haiku-4-5-20251001` and
 * `claude-sonnet-4-5-20250929`. The bare aliases `claude-haiku-4-5`
 * and `claude-sonnet-4-5` are also accepted because some call sites
 * (e.g. engine-v3.ts) pass them.
 *
 * Unknown models fall back to zero cost + a one-time pino warning
 * (logged from `estimateCost`). This keeps observability non-fatal
 * when a new model id is rolled out before this table is updated.
 */

import pino from 'pino'

const log = pino({ name: 'observability/pricing', level: 'warn' })

export interface ModelPricing {
  /** USD per million input tokens. */
  inputPerMTok: number
  /** USD per million output tokens. */
  outputPerMTok: number
  /** USD per million cache-creation input tokens. */
  cacheCreationPerMTok: number
  /** USD per million cache-read input tokens. */
  cacheReadPerMTok: number
}

/**
 * Per-model pricing table. Keys are exact Anthropic model ids OR
 * alias strings observed in the repo.
 */
export const PRICING: Record<string, ModelPricing> = {
  // Haiku 4.5 (and bare alias used in engine-v3 / agents/types.ts)
  'claude-haiku-4-5-20251001': {
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    cacheCreationPerMTok: 1.25,
    cacheReadPerMTok: 0.1,
  },
  'claude-haiku-4-5': {
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    cacheCreationPerMTok: 1.25,
    cacheReadPerMTok: 0.1,
  },

  // Sonnet 4.5 (exact id + bare alias)
  'claude-sonnet-4-5-20250929': {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheCreationPerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  'claude-sonnet-4-5': {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheCreationPerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
}

const warnedUnknownModels = new Set<string>()

export interface EstimateCostInput {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}

/**
 * Estimate the USD cost of a single Anthropic call.
 *
 * Returns 0 (and logs a one-time warn) for unknown model ids so that
 * observability never fails because the pricing table is out of date.
 */
export function estimateCost(input: EstimateCostInput): number {
  const pricing = PRICING[input.model]
  if (!pricing) {
    if (!warnedUnknownModels.has(input.model)) {
      warnedUnknownModels.add(input.model)
      log.warn(
        { model: input.model },
        'observability/pricing: unknown model — cost defaulting to 0',
      )
    }
    return 0
  }

  const inputCost = (input.inputTokens / 1_000_000) * pricing.inputPerMTok
  const outputCost = (input.outputTokens / 1_000_000) * pricing.outputPerMTok
  const cacheCreationCost =
    ((input.cacheCreationInputTokens ?? 0) / 1_000_000) *
    pricing.cacheCreationPerMTok
  const cacheReadCost =
    ((input.cacheReadInputTokens ?? 0) / 1_000_000) * pricing.cacheReadPerMTok

  return inputCost + outputCost + cacheCreationCost + cacheReadCost
}
