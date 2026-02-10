// ============================================================================
// Phase 16: Agent Metrics
// Aggregation queries for the Agentes dashboard.
// Uses createAdminClient for all DB operations (bypasses RLS, workspace
// isolation enforced via explicit filters).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Aggregated agent metrics for a date range.
 */
export interface AgentMetrics {
  /** Total conversations handled by agent */
  totalConversations: number
  /** Total orders created via agent tools */
  ordersCreated: number
  /** Conversion rate: orders / conversations * 100 */
  conversionRate: number
  /** Number of handoffs to human */
  handoffsCount: number
  /** Percentage of conversations resolved without human */
  resolvedWithoutHumanPct: number
  /** Average response time in ms (0 for MVP — TODO) */
  avgResponseTimeMs: number
  /** Total tokens used across all sessions */
  totalTokens: number
  /** Average cost per conversation (USD) */
  costPerConversation: number
  /** Average cost per order (USD) */
  costPerOrder: number
  /** Total cost (USD) */
  totalCost: number
}

/**
 * Period options for the dashboard selector.
 */
export type MetricsPeriod = 'today' | '7d' | '30d' | 'custom'

// Blended rate for token cost estimation (USD per 1M tokens).
// Approximate mix of Haiku ($1/1M) and Sonnet ($15/1M) weighted ~80/20.
const BLENDED_RATE_PER_1M = 3.0

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calculate date range based on period, using America/Bogota timezone.
 */
export function getDateRange(
  period: MetricsPeriod,
  customStart?: string,
  customEnd?: string
): { startDate: string; endDate: string } {
  if (period === 'custom' && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd }
  }

  // Current time in America/Bogota
  const nowBogota = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' })
  )

  // Start of today in Bogota
  const startOfToday = new Date(nowBogota)
  startOfToday.setHours(0, 0, 0, 0)

  // End = now
  const endDate = new Date().toISOString()

  let startDate: string

  switch (period) {
    case 'today':
      startDate = startOfToday.toISOString()
      break
    case '7d': {
      const d = new Date(startOfToday)
      d.setDate(d.getDate() - 7)
      startDate = d.toISOString()
      break
    }
    case '30d': {
      const d = new Date(startOfToday)
      d.setDate(d.getDate() - 30)
      startDate = d.toISOString()
      break
    }
    default:
      startDate = startOfToday.toISOString()
  }

  return { startDate, endDate }
}

// ============================================================================
// MAIN QUERY
// ============================================================================

/**
 * Get aggregated agent metrics for a workspace within a date range.
 *
 * Queries:
 * 1. agent_sessions for conversation count and handoff count
 * 2. tool_executions for order creation count (tool_name = 'crm.order.create')
 * 3. agent_turns (joined via agent_sessions) for token usage
 */
export async function getAgentMetrics(
  workspaceId: string,
  startDate: string,
  endDate: string
): Promise<AgentMetrics> {
  const supabase = createAdminClient()

  // 1. Count total conversations (agent_sessions in date range)
  const { count: totalConversations } = await supabase
    .from('agent_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  // 2. Count handoffs (sessions with status = 'handed_off')
  const { count: handoffsCount } = await supabase
    .from('agent_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'handed_off')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  // 3. Count orders created via agent (tool_executions with tool_name = 'crm.order.create' and agent_session_id not null)
  const { count: ordersCreated } = await supabase
    .from('tool_executions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('tool_name', 'crm.order.create')
    .eq('status', 'success')
    .not('agent_session_id', 'is', null)
    .gte('started_at', startDate)
    .lte('started_at', endDate)

  // 4. Sum tokens from agent_turns for sessions in this workspace and date range
  //    We get session IDs first, then sum turns
  const { data: sessionIds } = await supabase
    .from('agent_sessions')
    .select('id')
    .eq('workspace_id', workspaceId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  let totalTokens = 0
  if (sessionIds && sessionIds.length > 0) {
    const ids = sessionIds.map(s => s.id)
    const { data: turns } = await supabase
      .from('agent_turns')
      .select('tokens_used')
      .in('session_id', ids)

    if (turns) {
      totalTokens = turns.reduce((sum, t) => sum + (t.tokens_used || 0), 0)
    }
  }

  // Derived calculations
  const conversations = totalConversations ?? 0
  const orders = ordersCreated ?? 0
  const handoffs = handoffsCount ?? 0

  const conversionRate = conversations > 0
    ? Math.round((orders / conversations) * 100 * 10) / 10
    : 0

  const resolvedWithoutHumanPct = conversations > 0
    ? Math.round(((conversations - handoffs) / conversations) * 100 * 10) / 10
    : 0

  const totalCost = (totalTokens / 1_000_000) * BLENDED_RATE_PER_1M
  const costPerConversation = conversations > 0
    ? Math.round((totalCost / conversations) * 10000) / 10000
    : 0
  const costPerOrder = orders > 0
    ? Math.round((totalCost / orders) * 10000) / 10000
    : 0

  return {
    totalConversations: conversations,
    ordersCreated: orders,
    conversionRate,
    handoffsCount: handoffs,
    resolvedWithoutHumanPct,
    avgResponseTimeMs: 0, // TODO: implement response time tracking
    totalTokens,
    costPerConversation,
    costPerOrder,
    totalCost: Math.round(totalCost * 10000) / 10000,
  }
}

// ============================================================================
// PERIOD HELPER
// ============================================================================

/**
 * Get metrics for a workspace by period name.
 */
export async function getMetricsByPeriod(
  workspaceId: string,
  period: MetricsPeriod,
  customStart?: string,
  customEnd?: string
): Promise<AgentMetrics> {
  const { startDate, endDate } = getDateRange(period, customStart, customEnd)
  return getAgentMetrics(workspaceId, startDate, endDate)
}
