/**
 * Pricing constants for the auditor (Sonnet 4.6).
 *
 * Source: RESEARCH-plan-05.md §3 lines 518-557.
 * [VERIFIED at 2026-04-25: Anthropic public pricing — $3/MTok input, $15/MTok output]
 * [ASSUMED A1: planner verifies pricing on day-of-execution via Anthropic Console
 *  before this task ships; if pricing changed, update SONNET_4_6_PRICING.]
 *
 * Used by `agent_audit_sessions.cost_usd` persistence (D-17).
 */

export const SONNET_4_6_PRICING = {
  inputPerMTok: 3,
  outputPerMTok: 15,
} as const

/**
 * Calcula el costo USD de un round del auditor.
 * Resultado fits NUMERIC(10, 6) en DB.
 */
export function calculateAuditCost(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens * SONNET_4_6_PRICING.inputPerMTok) / 1_000_000 +
    (outputTokens * SONNET_4_6_PRICING.outputPerMTok) / 1_000_000
  )
}
