'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

// ============================================================================
// Auth Helper
// ============================================================================

async function getAuthContext(): Promise<{ workspaceId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  return { workspaceId }
}

// ============================================================================
// Colombia timezone date helpers
// ============================================================================

function getColombiaDate(): Date {
  // Get current time in Colombia by formatting to sv-SE (ISO-like) and parsing back
  const nowStr = new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' })
  return new Date(nowStr)
}

function startOfDayColombia(): string {
  const col = getColombiaDate()
  col.setHours(0, 0, 0, 0)
  return col.toISOString()
}

function startOfWeekColombia(): string {
  const col = getColombiaDate()
  // Monday = 1, Sunday = 0 -> adjust for Monday start
  const day = col.getDay()
  const diff = day === 0 ? 6 : day - 1
  col.setDate(col.getDate() - diff)
  col.setHours(0, 0, 0, 0)
  return col.toISOString()
}

function startOfMonthColombia(): string {
  const col = getColombiaDate()
  col.setDate(1)
  col.setHours(0, 0, 0, 0)
  return col.toISOString()
}

// ============================================================================
// SMS Config
// ============================================================================

export interface SMSConfig {
  isActive: boolean
  balanceCop: number
  allowNegativeBalance: boolean
  totalSmsSent: number
  totalCreditsUsed: number
}

export async function getSMSConfig(): Promise<SMSConfig | null> {
  const auth = await getAuthContext()
  if ('error' in auth) return null

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('sms_workspace_config')
    .select('is_active, balance_cop, allow_negative_balance, total_sms_sent, total_credits_used')
    .eq('workspace_id', auth.workspaceId)
    .single()

  if (!data) return null

  return {
    isActive: data.is_active,
    balanceCop: Number(data.balance_cop),
    allowNegativeBalance: data.allow_negative_balance,
    totalSmsSent: data.total_sms_sent,
    totalCreditsUsed: Number(data.total_credits_used),
  }
}

// ============================================================================
// SMS Metrics
// ============================================================================

export interface SMSMetrics {
  sentToday: number
  sentThisWeek: number
  sentThisMonth: number
  deliveredCount: number
  failedCount: number
  totalCount: number
  deliveryRate: number
  totalCostCop: number
}

export async function getSMSMetrics(): Promise<SMSMetrics> {
  const auth = await getAuthContext()
  if ('error' in auth) {
    return { sentToday: 0, sentThisWeek: 0, sentThisMonth: 0, deliveredCount: 0, failedCount: 0, totalCount: 0, deliveryRate: 0, totalCostCop: 0 }
  }

  const supabase = createAdminClient()
  const { workspaceId } = auth

  const todayStart = startOfDayColombia()
  const weekStart = startOfWeekColombia()
  const monthStart = startOfMonthColombia()

  // Run all queries in parallel
  const [todayRes, weekRes, monthRes, deliveredRes, failedRes, totalRes, costRes] = await Promise.all([
    supabase.from('sms_messages').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).gte('created_at', todayStart),
    supabase.from('sms_messages').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).gte('created_at', weekStart),
    supabase.from('sms_messages').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).gte('created_at', monthStart),
    supabase.from('sms_messages').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'delivered'),
    supabase.from('sms_messages').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('status', 'failed'),
    supabase.from('sms_messages').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId),
    supabase.from('sms_messages').select('cost_cop')
      .eq('workspace_id', workspaceId).not('cost_cop', 'is', null),
  ])

  const sentToday = todayRes.count ?? 0
  const sentThisWeek = weekRes.count ?? 0
  const sentThisMonth = monthRes.count ?? 0
  const deliveredCount = deliveredRes.count ?? 0
  const failedCount = failedRes.count ?? 0
  const totalCount = totalRes.count ?? 0
  const totalCostCop = costRes.data?.reduce((sum, row) => sum + Number(row.cost_cop || 0), 0) ?? 0

  const denominator = deliveredCount + failedCount
  const deliveryRate = denominator > 0 ? Math.round((deliveredCount / denominator) * 1000) / 10 : 0

  return {
    sentToday,
    sentThisWeek,
    sentThisMonth,
    deliveredCount,
    failedCount,
    totalCount,
    deliveryRate,
    totalCostCop,
  }
}

// ============================================================================
// SMS History (paginated)
// ============================================================================

export interface SMSHistoryMessage {
  id: string
  to_number: string
  contact_name: string | null
  body: string
  status: string
  cost_cop: number | null
  source: string | null
  created_at: string
}

export interface SMSHistoryResult {
  data: SMSHistoryMessage[]
  total: number
  page: number
  pageSize: number
}

export async function getSMSHistory(page: number = 1, pageSize: number = 20): Promise<SMSHistoryResult> {
  const auth = await getAuthContext()
  if ('error' in auth) {
    return { data: [], total: 0, page, pageSize }
  }

  const supabase = createAdminClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, count } = await supabase
    .from('sms_messages')
    .select('id, to_number, contact_name, body, status, cost_cop, source, created_at', { count: 'exact' })
    .eq('workspace_id', auth.workspaceId)
    .order('created_at', { ascending: false })
    .range(from, to)

  return {
    data: (data ?? []).map(row => ({
      ...row,
      cost_cop: row.cost_cop ? Number(row.cost_cop) : null,
    })),
    total: count ?? 0,
    page,
    pageSize,
  }
}

// ============================================================================
// SMS Usage Data (for chart)
// ============================================================================

export interface SMSUsageDataPoint {
  date: string
  count: number
  cost: number
}

export async function getSMSUsageData(days: number = 30): Promise<SMSUsageDataPoint[]> {
  const auth = await getAuthContext()
  if ('error' in auth) return []

  const supabase = createAdminClient()

  // Calculate start date
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startISO = startDate.toISOString()

  const { data } = await supabase
    .from('sms_messages')
    .select('created_at, cost_cop')
    .eq('workspace_id', auth.workspaceId)
    .gte('created_at', startISO)
    .order('created_at', { ascending: true })

  if (!data || data.length === 0) return []

  // Group by date (Colombia timezone)
  const grouped = new Map<string, { count: number; cost: number }>()

  // Initialize all days in range
  for (let i = days; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateKey = d.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
    grouped.set(dateKey, { count: 0, cost: 0 })
  }

  // Fill with actual data
  for (const row of data) {
    const dateKey = new Date(row.created_at).toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
    const existing = grouped.get(dateKey) || { count: 0, cost: 0 }
    existing.count += 1
    existing.cost += Number(row.cost_cop || 0)
    grouped.set(dateKey, existing)
  }

  return Array.from(grouped.entries()).map(([date, val]) => ({
    date,
    count: val.count,
    cost: val.cost,
  }))
}

// ============================================================================
// Update SMS Config
// ============================================================================

export async function updateSMSConfig(updates: { allowNegativeBalance?: boolean }): Promise<{ success: boolean; error?: string }> {
  const auth = await getAuthContext()
  if ('error' in auth) return { success: false, error: auth.error }

  const supabase = createAdminClient()

  const updateData: Record<string, unknown> = {}
  if (updates.allowNegativeBalance !== undefined) {
    updateData.allow_negative_balance = updates.allowNegativeBalance
  }

  if (Object.keys(updateData).length === 0) {
    return { success: true }
  }

  updateData.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('sms_workspace_config')
    .update(updateData)
    .eq('workspace_id', auth.workspaceId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/sms')
  return { success: true }
}
