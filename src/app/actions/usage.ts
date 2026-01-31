'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from 'date-fns'

// ============================================================================
// Types
// ============================================================================

export type CostCategory = 'marketing' | 'utility' | 'authentication' | 'service'

export interface MessageCost {
  id: string
  workspace_id: string
  wamid: string
  category: CostCategory
  pricing_model: string
  recipient_country: string | null
  cost_usd: number
  recorded_at: string
}

export interface UsageSummary {
  totalMessages: number
  totalCost: number
  byCategory: Record<CostCategory, { count: number; cost: number }>
}

export interface DailyUsage {
  date: string
  count: number
  cost: number
}

export interface WorkspaceUsage {
  workspaceId: string
  workspaceName: string
  totalMessages: number
  totalCost: number
  limit: number | null
  usagePercent: number | null
}

export interface SpendingStatus {
  currentSpend: number
  limit: number | null
  percentUsed: number | null
  isOverLimit: boolean
  isNearLimit: boolean
}

export type DatePreset = 'today' | '7days' | '30days' | 'month'

// ============================================================================
// Cost Rates (Meta's pricing per message in USD)
// Update monthly from Meta's pricing page
// ============================================================================

const COST_RATES: Record<CostCategory, Record<string, number>> = {
  marketing: { CO: 0.0177, default: 0.02 },     // Colombia, default
  utility: { CO: 0.0064, default: 0.008 },
  authentication: { CO: 0.0064, default: 0.008 },
  service: { CO: 0.0, default: 0.0 }            // Service within 24h is free
}

function getCostRate(category: CostCategory, countryCode?: string | null): number {
  const rates = COST_RATES[category]
  return rates[countryCode || 'default'] || rates.default
}

// ============================================================================
// Date Range Helpers
// ============================================================================

function getDateRange(preset: DatePreset): { start: Date; end: Date } {
  const now = new Date()
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) }
    case '7days':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) }
    case '30days':
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) }
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) }
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) }
  }
}

// ============================================================================
// Recording Costs (Internal - called from webhook handler)
// ============================================================================

/**
 * Record message cost from webhook
 * Uses admin client to bypass RLS (called internally, not from UI)
 * Uses upsert to handle webhook retries (deduplication on wamid)
 */
export async function recordMessageCost(params: {
  workspaceId: string
  wamid: string
  category: CostCategory
  recipientCountry?: string | null
}): Promise<void> {
  const supabase = createAdminClient()

  const cost = getCostRate(params.category, params.recipientCountry)

  const { error } = await supabase
    .from('message_costs')
    .upsert({
      workspace_id: params.workspaceId,
      wamid: params.wamid,
      category: params.category,
      pricing_model: 'PMP',
      recipient_country: params.recipientCountry || null,
      cost_usd: cost,
      recorded_at: new Date().toISOString()
    }, {
      onConflict: 'wamid',
      ignoreDuplicates: true
    })

  if (error) {
    // Log but don't throw - cost recording shouldn't block message processing
    console.error('Failed to record message cost:', error)
  }
}

// ============================================================================
// Usage Summary (Workspace Owner View)
// ============================================================================

/**
 * Get usage summary for current workspace
 * Supports preset date ranges or custom range
 */
export async function getUsageSummary(
  preset: DatePreset = 'month',
  customRange?: { start: string; end: string }
): Promise<UsageSummary> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('No autenticado')
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    throw new Error('No hay workspace seleccionado')
  }

  const range = customRange
    ? { start: new Date(customRange.start), end: new Date(customRange.end) }
    : getDateRange(preset)

  const { data, error } = await supabase
    .from('message_costs')
    .select('category, cost_usd')
    .eq('workspace_id', workspaceId)
    .gte('recorded_at', range.start.toISOString())
    .lte('recorded_at', range.end.toISOString())

  if (error) {
    console.error('Error fetching usage:', error)
    throw new Error('Error al obtener datos de consumo')
  }

  // Initialize summary
  const byCategory: Record<CostCategory, { count: number; cost: number }> = {
    marketing: { count: 0, cost: 0 },
    utility: { count: 0, cost: 0 },
    authentication: { count: 0, cost: 0 },
    service: { count: 0, cost: 0 }
  }

  let totalMessages = 0
  let totalCost = 0

  for (const row of data || []) {
    const cat = row.category as CostCategory
    const cost = row.cost_usd || 0

    if (byCategory[cat]) {
      byCategory[cat].count++
      byCategory[cat].cost += cost
    }
    totalMessages++
    totalCost += cost
  }

  return { totalMessages, totalCost, byCategory }
}

/**
 * Get daily usage for line chart
 * Returns array with all days filled (0 for days without messages)
 */
export async function getUsageByDay(days: number = 30): Promise<DailyUsage[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

  const startDate = startOfDay(subDays(new Date(), days - 1))

  const { data, error } = await supabase
    .from('message_costs')
    .select('recorded_at, cost_usd')
    .eq('workspace_id', workspaceId)
    .gte('recorded_at', startDate.toISOString())
    .order('recorded_at')

  if (error) {
    console.error('Error fetching daily usage:', error)
    return []
  }

  // Group by day
  const dayMap = new Map<string, { count: number; cost: number }>()

  for (const row of data || []) {
    const day = row.recorded_at.split('T')[0]
    const existing = dayMap.get(day) || { count: 0, cost: 0 }
    existing.count++
    existing.cost += row.cost_usd || 0
    dayMap.set(day, existing)
  }

  // Fill in all days (including zeros)
  const result: DailyUsage[] = []
  for (let i = 0; i < days; i++) {
    const date = startOfDay(subDays(new Date(), days - 1 - i)).toISOString().split('T')[0]
    const dayData = dayMap.get(date) || { count: 0, cost: 0 }
    result.push({ date, count: dayData.count, cost: dayData.cost })
  }

  return result
}

/**
 * Get usage by category for pie chart
 */
export async function getUsageByCategory(
  preset: DatePreset = 'month'
): Promise<{ category: string; count: number; cost: number }[]> {
  const summary = await getUsageSummary(preset)

  return Object.entries(summary.byCategory).map(([category, data]) => ({
    category,
    count: data.count,
    cost: data.cost
  }))
}

// ============================================================================
// Spending Limits and Status
// ============================================================================

/**
 * Get current month's spending status vs limit
 * Used for header/dashboard warning indicators
 */
export async function getSpendingStatus(): Promise<SpendingStatus> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('No autenticado')
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    throw new Error('No hay workspace seleccionado')
  }

  // Get current month's spend
  const summary = await getUsageSummary('month')

  // Get limits from workspace_limits table
  // Using admin client since RLS may not cover this table
  const adminClient = createAdminClient()
  const { data: limits } = await adminClient
    .from('workspace_limits')
    .select('monthly_spend_limit_usd, alert_threshold_percent')
    .eq('workspace_id', workspaceId)
    .single()

  const limit = limits?.monthly_spend_limit_usd ?? null
  const threshold = limits?.alert_threshold_percent ?? 80
  const percentUsed = limit ? (summary.totalCost / limit) * 100 : null

  return {
    currentSpend: summary.totalCost,
    limit,
    percentUsed,
    isOverLimit: limit ? summary.totalCost >= limit : false,
    isNearLimit: limit ? summary.totalCost >= limit * (threshold / 100) : false
  }
}

// ============================================================================
// Super Admin Functions (Cross-workspace)
// ============================================================================

/**
 * Get usage for all workspaces (Super Admin only)
 * Requires MORFX_OWNER_USER_ID env var match
 */
export async function getAllWorkspacesUsage(
  preset: DatePreset = 'month'
): Promise<WorkspaceUsage[]> {
  const supabase = await createClient()

  // Verify super admin access
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('No autenticado')
  }

  const MORFX_OWNER_ID = process.env.MORFX_OWNER_USER_ID
  if (!MORFX_OWNER_ID || user.id !== MORFX_OWNER_ID) {
    throw new Error('No autorizado - solo super admin')
  }

  const adminClient = createAdminClient()
  const range = getDateRange(preset)

  // Get all workspaces
  const { data: workspaces, error: wsError } = await adminClient
    .from('workspaces')
    .select('id, name')

  if (wsError || !workspaces) {
    console.error('Error fetching workspaces:', wsError)
    return []
  }

  const results: WorkspaceUsage[] = []

  for (const ws of workspaces) {
    // Get costs for this workspace
    const { data: costs } = await adminClient
      .from('message_costs')
      .select('cost_usd')
      .eq('workspace_id', ws.id)
      .gte('recorded_at', range.start.toISOString())
      .lte('recorded_at', range.end.toISOString())

    const totalMessages = costs?.length || 0
    const totalCost = costs?.reduce((sum, c) => sum + (c.cost_usd || 0), 0) || 0

    // Get limits
    const { data: limits } = await adminClient
      .from('workspace_limits')
      .select('monthly_spend_limit_usd')
      .eq('workspace_id', ws.id)
      .single()

    const limit = limits?.monthly_spend_limit_usd ?? null
    const usagePercent = limit ? (totalCost / limit) * 100 : null

    results.push({
      workspaceId: ws.id,
      workspaceName: ws.name,
      totalMessages,
      totalCost,
      limit,
      usagePercent
    })
  }

  // Sort by total cost descending (biggest spenders first)
  return results.sort((a, b) => b.totalCost - a.totalCost)
}

/**
 * Set workspace spending limit (Super Admin only)
 */
export async function setWorkspaceLimit(
  workspaceId: string,
  monthlyLimitUsd: number | null,
  alertThresholdPercent: number = 80
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Verify super admin access
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'No autenticado' }
  }

  const MORFX_OWNER_ID = process.env.MORFX_OWNER_USER_ID
  if (!MORFX_OWNER_ID || user.id !== MORFX_OWNER_ID) {
    return { success: false, error: 'No autorizado - solo super admin' }
  }

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('workspace_limits')
    .upsert({
      workspace_id: workspaceId,
      monthly_spend_limit_usd: monthlyLimitUsd,
      alert_threshold_percent: alertThresholdPercent,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'workspace_id'
    })

  if (error) {
    console.error('Error setting workspace limit:', error)
    return { success: false, error: 'Error al actualizar limite' }
  }

  return { success: true }
}

// ============================================================================
// Cost Estimation (for UI preview)
// ============================================================================

/**
 * Estimate cost for sending a message
 * Used in UI to show estimated cost before sending template
 */
export function estimateMessageCost(
  category: CostCategory,
  countryCode?: string | null
): { costUsd: number; costCop: number } {
  const costUsd = getCostRate(category, countryCode)
  // Approximate USD to COP conversion (update periodically)
  const usdToCop = 4200
  const costCop = costUsd * usdToCop

  return { costUsd, costCop }
}
