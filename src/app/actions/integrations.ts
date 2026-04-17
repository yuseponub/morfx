'use server'

// ============================================================================
// Integration Server Actions (Shopify + SMS Onurix usage reporting)
// Manages Shopify integration state + SMS (Onurix) usage/chart queries.
// Owner + Admin roles can configure integrations.
// ============================================================================

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

// ============================================================================
// Auth Helper
// ============================================================================

export async function getIntegrationAuthContext() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return null
  }

  // Verify workspace membership + get role
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id, role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return null
  }

  return { supabase, user, workspaceId, role: membership.role as string }
}

/**
 * Check if user has permission to manage integrations.
 * Per CONTEXT.md: Owner + Admin can configure integrations.
 */
function canManageIntegrations(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

// ============================================================================
// 1. Get SMS Usage (Onurix)
// ============================================================================

/**
 * Aggregate SMS usage for the current workspace, filtered to provider='onurix'.
 * Costs are integer COP (Onurix model — no fractional currency).
 */
export interface SmsUsageData {
  totalSms: number
  totalCostCop: number
  delivered: number
  failed: number
  pending: number
  messages: Array<{
    id: string
    to_number: string
    body: string
    status: string
    cost_cop: number | null
    segments: number
    created_at: string
  }>
}

export async function getSmsUsage(
  period: 'day' | 'week' | 'month'
): Promise<SmsUsageData> {
  const empty: SmsUsageData = {
    totalSms: 0,
    totalCostCop: 0,
    delivered: 0,
    failed: 0,
    pending: 0,
    messages: [],
  }

  const ctx = await getIntegrationAuthContext()
  if (!ctx) return empty

  const adminSupabase = createAdminClient()

  // Calculate period start date
  const now = new Date()
  let periodStart: Date
  switch (period) {
    case 'day':
      periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      break
    case 'week':
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
  }

  // Get latest 50 messages in period (provider='onurix' only)
  const { data: messages, error } = await adminSupabase
    .from('sms_messages')
    .select('id, to_number, body, status, cost_cop, segments, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('provider', 'onurix')
    .gte('created_at', periodStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[getSmsUsage] Error:', error)
    return empty
  }

  // Aggregate counts + total cost across the full period (not limited to 50)
  const { data: aggregateRows, error: aggErr } = await adminSupabase
    .from('sms_messages')
    .select('status, cost_cop')
    .eq('workspace_id', ctx.workspaceId)
    .eq('provider', 'onurix')
    .gte('created_at', periodStart.toISOString())

  if (aggErr) {
    console.error('[getSmsUsage] Aggregate error:', aggErr)
    return empty
  }

  let totalSms = 0
  let totalCostCop = 0
  let delivered = 0
  let failed = 0
  let pending = 0

  for (const row of aggregateRows || []) {
    totalSms++
    if (typeof row.cost_cop === 'number') totalCostCop += row.cost_cop
    if (row.status === 'delivered') delivered++
    else if (row.status === 'failed' || row.status === 'undelivered') failed++
    else if (row.status === 'sent' || row.status === 'queued' || row.status === 'sending') pending++
  }

  // Truncate body to 100 chars for display
  const truncatedMessages = (messages || []).map((msg) => ({
    ...msg,
    body: msg.body.length > 100 ? msg.body.slice(0, 100) + '...' : msg.body,
  }))

  return {
    totalSms,
    totalCostCop,
    delivered,
    failed,
    pending,
    messages: truncatedMessages,
  }
}

// ============================================================================
// 2. Get SMS Usage Chart Data (Onurix)
// ============================================================================

export interface SmsChartData {
  date: string
  count: number
  costCop: number
}

export async function getSmsUsageChart(
  period: 'week' | 'month'
): Promise<SmsChartData[]> {
  const ctx = await getIntegrationAuthContext()
  if (!ctx) return []

  const adminSupabase = createAdminClient()

  // Calculate period start
  const now = new Date()
  const days = period === 'week' ? 7 : 30
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  // Fetch all messages in period (provider='onurix' only)
  const { data: messages, error } = await adminSupabase
    .from('sms_messages')
    .select('created_at, cost_cop')
    .eq('workspace_id', ctx.workspaceId)
    .eq('provider', 'onurix')
    .gte('created_at', periodStart.toISOString())
    .order('created_at', { ascending: true })

  if (error || !messages) {
    console.error('[getSmsUsageChart] Error:', error)
    return []
  }

  // Group by date (Colombia timezone)
  const groupedByDate = new Map<string, { count: number; costCop: number }>()

  // Initialize all dates in range
  for (let i = 0; i < days; i++) {
    const date = new Date(periodStart.getTime() + i * 24 * 60 * 60 * 1000)
    const dateStr = date.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
    groupedByDate.set(dateStr, { count: 0, costCop: 0 })
  }

  // Aggregate messages
  for (const msg of messages) {
    const dateStr = new Date(msg.created_at).toLocaleDateString('sv-SE', {
      timeZone: 'America/Bogota',
    })
    const existing = groupedByDate.get(dateStr) || { count: 0, costCop: 0 }
    existing.count++
    existing.costCop += typeof msg.cost_cop === 'number' ? msg.cost_cop : 0
    groupedByDate.set(dateStr, existing)
  }

  // Convert to array
  return Array.from(groupedByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      count: data.count,
      costCop: data.costCop,
    }))
}

// ============================================================================
// 3. Update Shopify Auto-Sync Toggle
// ============================================================================

export async function updateShopifyAutoSync(autoSync: boolean): Promise<{
  success: boolean
  error?: string
}> {
  const ctx = await getIntegrationAuthContext()
  if (!ctx) {
    return { success: false, error: 'No autenticado' }
  }

  if (!canManageIntegrations(ctx.role)) {
    return { success: false, error: 'Solo Owner o Admin pueden configurar integraciones' }
  }

  const adminSupabase = createAdminClient()

  // Load existing Shopify integration
  const { data: integration } = await adminSupabase
    .from('integrations')
    .select('id, config')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'shopify')
    .single()

  if (!integration) {
    return { success: false, error: 'No hay integracion de Shopify configurada' }
  }

  // Update config with auto_sync_orders field
  const updatedConfig = {
    ...(integration.config as Record<string, unknown>),
    auto_sync_orders: autoSync,
  }

  const { error } = await adminSupabase
    .from('integrations')
    .update({
      config: updatedConfig,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id)

  if (error) {
    console.error('[updateShopifyAutoSync] Error:', error)
    return { success: false, error: 'Error al actualizar configuracion' }
  }

  return { success: true }
}
