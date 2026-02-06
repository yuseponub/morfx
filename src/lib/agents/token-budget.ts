/**
 * Token Budget Manager
 * Phase 13: Agent Engine Core - Plan 03
 *
 * Tracks and enforces token limits per conversation.
 * Prevents runaway costs by checking budget before each Claude call.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { TokenUsage } from './types'
import { MAX_TOKENS_PER_CONVERSATION } from './types'
import { BudgetExceededError } from './errors'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('token-budget')

/** Budget check result */
export interface BudgetCheckResult {
  allowed: boolean
  remaining: number
  used: number
  estimatedAfter: number
}

/**
 * Manages token budgets for agent sessions.
 *
 * Each session has a maximum token budget (default 50K).
 * Budget is checked before each Claude call and recorded after.
 *
 * Usage:
 * ```typescript
 * const budget = new TokenBudgetManager()
 *
 * // Before calling Claude
 * const check = await budget.checkBudget(sessionId, 2000)
 * if (!check.allowed) {
 *   // Handle budget exceeded
 * }
 *
 * // After calling Claude
 * await budget.recordUsage(sessionId, turnId, actualTokensUsed)
 * ```
 */
export class TokenBudgetManager {
  private supabase = createAdminClient()
  private maxTokens: number

  constructor(maxTokens: number = MAX_TOKENS_PER_CONVERSATION) {
    this.maxTokens = maxTokens
  }

  /**
   * Get current token usage for a session.
   */
  async getUsage(sessionId: string): Promise<TokenUsage> {
    const { data, error } = await this.supabase
      .from('agent_turns')
      .select('tokens_used')
      .eq('session_id', sessionId)

    if (error) {
      logger.error({ error, sessionId }, 'Failed to get token usage')
      throw new Error(`Failed to get token usage: ${error.message}`)
    }

    const totalTokens = data?.reduce((sum, turn) => sum + (turn.tokens_used ?? 0), 0) ?? 0
    const turnCount = data?.length ?? 0
    const remaining = this.maxTokens - totalTokens

    return {
      sessionId,
      totalTokens,
      turnCount,
      remaining,
    }
  }

  /**
   * Check if a session has budget for an estimated token usage.
   *
   * @param sessionId The session to check
   * @param estimatedTokens Estimated tokens for the upcoming operation
   * @returns Budget check result with allowed flag
   */
  async checkBudget(
    sessionId: string,
    estimatedTokens: number
  ): Promise<BudgetCheckResult> {
    const usage = await this.getUsage(sessionId)
    const estimatedAfter = usage.totalTokens + estimatedTokens
    const allowed = estimatedAfter <= this.maxTokens

    if (!allowed) {
      logger.warn(
        {
          sessionId,
          used: usage.totalTokens,
          estimated: estimatedTokens,
          limit: this.maxTokens,
        },
        'Token budget would be exceeded'
      )
    }

    return {
      allowed,
      remaining: usage.remaining,
      used: usage.totalTokens,
      estimatedAfter,
    }
  }

  /**
   * Check budget and throw if exceeded.
   * Convenience method for strict enforcement.
   */
  async requireBudget(
    sessionId: string,
    estimatedTokens: number
  ): Promise<BudgetCheckResult> {
    const check = await this.checkBudget(sessionId, estimatedTokens)

    if (!check.allowed) {
      throw new BudgetExceededError(sessionId, check.used, this.maxTokens, estimatedTokens)
    }

    return check
  }

  /**
   * Record token usage for a turn.
   * Called after a Claude call completes.
   */
  async recordUsage(
    sessionId: string,
    turnId: string,
    tokensUsed: number
  ): Promise<void> {
    const { error } = await this.supabase
      .from('agent_turns')
      .update({ tokens_used: tokensUsed })
      .eq('id', turnId)

    if (error) {
      logger.error({ error, sessionId, turnId }, 'Failed to record token usage')
      throw new Error(`Failed to record token usage: ${error.message}`)
    }

    logger.debug(
      { sessionId, turnId, tokensUsed },
      'Token usage recorded'
    )
  }

  /**
   * Get remaining budget percentage.
   * Useful for warning messages.
   */
  async getRemainingPercentage(sessionId: string): Promise<number> {
    const usage = await this.getUsage(sessionId)
    return Math.max(0, Math.round((usage.remaining / this.maxTokens) * 100))
  }

  /**
   * Check if session is near budget limit.
   * Returns true if less than 10% budget remaining.
   */
  async isNearLimit(sessionId: string): Promise<boolean> {
    const percentage = await this.getRemainingPercentage(sessionId)
    return percentage < 10
  }

  /**
   * Get budget summary for logging/debugging.
   */
  async getSummary(sessionId: string): Promise<{
    used: number
    remaining: number
    percentage: number
    turnCount: number
  }> {
    const usage = await this.getUsage(sessionId)
    const percentage = Math.round((usage.remaining / this.maxTokens) * 100)

    return {
      used: usage.totalTokens,
      remaining: usage.remaining,
      percentage,
      turnCount: usage.turnCount,
    }
  }
}
