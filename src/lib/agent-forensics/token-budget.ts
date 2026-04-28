/**
 * Token budgeting for the multi-turn auditor (D-15, RESEARCH-plan-05 §3).
 *
 * Strategy hibrida (Pitfall 14):
 *  1. Local estimation `length / 2.8` (mix prosa-espanol + JSON) — zero latency.
 *  2. API call to Anthropic `/v1/messages/count_tokens` ONLY when local
 *     estimation > 40K (deja margen 20% para error de estimacion).
 *
 * Cap: 50K tokens TOTAL prompt (D-15). Si excede, truncar drop-oldest
 * preservando turn auditado.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { CondensedPreviousTurn } from './condense-previous-turn'

const CHARS_PER_TOKEN = 2.8 // RESEARCH §3 mix espanol + JSON
const DEFAULT_CAP_TOKENS = 50_000
const SAFETY_MARGIN_TOKENS = 2_000
const COUNT_TOKENS_THRESHOLD = 40_000 // estimate > this → API call

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export async function countTokensIfNeeded(
  systemPrompt: string,
  userMessage: string,
  threshold: number = COUNT_TOKENS_THRESHOLD,
): Promise<{ inputTokens: number; usedApi: boolean }> {
  const localEstimate =
    estimateTokens(systemPrompt) + estimateTokens(userMessage)
  if (localEstimate <= threshold) {
    return { inputTokens: localEstimate, usedApi: false }
  }
  // Crosses threshold — call API for precision
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY_TOOLS })
  const result = await client.messages.countTokens({
    model: 'claude-sonnet-4-6',
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })
  return { inputTokens: result.input_tokens, usedApi: true }
}

export function truncateContext(args: {
  previousTurns: CondensedPreviousTurn[]
  auditedTurnId: string
  fixedCostTokens: number
  capTokens?: number
}): { kept: CondensedPreviousTurn[]; trimmed: number } {
  const cap = args.capTokens ?? DEFAULT_CAP_TOKENS
  const remainingBudget = cap - args.fixedCostTokens - SAFETY_MARGIN_TOKENS

  // Always exclude audited turn from "previous" set
  const candidates = args.previousTurns.filter(
    (t) => t.turnId !== args.auditedTurnId,
  )

  // Sort newest first for selection (drop oldest policy)
  const newestFirst = [...candidates].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  )

  const kept: CondensedPreviousTurn[] = []
  let used = 0
  for (const turn of newestFirst) {
    const cost = estimateTokens(JSON.stringify(turn))
    if (used + cost > remainingBudget) break
    kept.push(turn)
    used += cost
  }

  // Re-sort chronological ASC for the model
  kept.sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  return {
    kept,
    trimmed: candidates.length - kept.length,
  }
}
