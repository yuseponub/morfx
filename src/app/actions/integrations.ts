'use server'

// ============================================================================
// Phase 20: Integration Server Actions (Twilio + Shopify Extensions)
// Manages Twilio credentials, test connection, SMS usage queries,
// and Shopify auto-sync toggle.
// Owner + Admin roles can configure integrations.
// ============================================================================

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import type { TwilioConfig, SmsMessage } from '@/lib/twilio/types'
import { createTwilioClient } from '@/lib/twilio/client'

// ============================================================================
// Auth Helper
// ============================================================================

async function getIntegrationAuthContext() {
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
// 1. Save Twilio Integration
// ============================================================================

export async function saveTwilioIntegration(formData: {
  accountSid: string
  authToken: string
  phoneNumber: string
}): Promise<{ success: boolean; error?: string }> {
  const ctx = await getIntegrationAuthContext()
  if (!ctx) {
    return { success: false, error: 'No autenticado' }
  }

  if (!canManageIntegrations(ctx.role)) {
    return { success: false, error: 'Solo Owner o Admin pueden configurar integraciones' }
  }

  // Validate inputs
  if (!formData.accountSid || !formData.accountSid.startsWith('AC')) {
    return { success: false, error: 'Account SID invalido (debe empezar con AC)' }
  }
  if (!formData.authToken || formData.authToken.length < 10) {
    return { success: false, error: 'Auth Token invalido' }
  }
  if (!formData.phoneNumber || !formData.phoneNumber.startsWith('+')) {
    return { success: false, error: 'Numero de telefono invalido (formato E.164, ej: +1234567890)' }
  }

  const adminSupabase = createAdminClient()

  const config: TwilioConfig = {
    account_sid: formData.accountSid,
    auth_token: formData.authToken,
    phone_number: formData.phoneNumber,
  }

  // Check if integration exists
  const { data: existing } = await adminSupabase
    .from('integrations')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'twilio')
    .single()

  if (existing) {
    // Update existing
    const { error } = await adminSupabase
      .from('integrations')
      .update({
        config,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (error) {
      console.error('[saveTwilioIntegration] Update error:', error)
      return { success: false, error: 'Error al actualizar integracion' }
    }
  } else {
    // Create new
    const { error } = await adminSupabase
      .from('integrations')
      .insert({
        workspace_id: ctx.workspaceId,
        type: 'twilio',
        name: 'Twilio SMS',
        config,
        is_active: true,
      })

    if (error) {
      console.error('[saveTwilioIntegration] Insert error:', error)
      return { success: false, error: 'Error al crear integracion' }
    }
  }

  return { success: true }
}

// ============================================================================
// 2. Test Twilio Connection
// ============================================================================

export async function testTwilioConnection(phoneNumber: string): Promise<{
  success: boolean
  messageSid?: string
  error?: string
}> {
  const ctx = await getIntegrationAuthContext()
  if (!ctx) {
    return { success: false, error: 'No autenticado' }
  }

  if (!canManageIntegrations(ctx.role)) {
    return { success: false, error: 'Solo Owner o Admin pueden probar conexiones' }
  }

  // Load Twilio config
  const adminSupabase = createAdminClient()
  const { data: integration } = await adminSupabase
    .from('integrations')
    .select('config')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'twilio')
    .eq('is_active', true)
    .single()

  if (!integration) {
    return { success: false, error: 'Primero guarda las credenciales de Twilio' }
  }

  const config = integration.config as TwilioConfig

  if (!config.account_sid || !config.auth_token || !config.phone_number) {
    return { success: false, error: 'Credenciales de Twilio incompletas' }
  }

  // Validate test phone number
  if (!phoneNumber || !phoneNumber.startsWith('+')) {
    return { success: false, error: 'Numero de prueba invalido (formato E.164, ej: +573001234567)' }
  }

  try {
    const client = createTwilioClient(config)

    const statusCallbackUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/status`
      : undefined

    const message = await client.messages.create({
      body: 'MorfX: conexion Twilio verificada correctamente',
      from: config.phone_number,
      to: phoneNumber,
      ...(statusCallbackUrl ? { statusCallback: statusCallbackUrl } : {}),
    })

    // Store test SMS in sms_messages table
    await adminSupabase.from('sms_messages').insert({
      workspace_id: ctx.workspaceId,
      twilio_sid: message.sid,
      from_number: config.phone_number,
      to_number: phoneNumber,
      body: 'MorfX: conexion Twilio verificada correctamente',
      direction: 'outbound',
      status: message.status || 'queued',
      price: message.price ? Math.abs(parseFloat(message.price)) : null,
      price_unit: message.priceUnit || 'USD',
      segments: message.numSegments ? parseInt(message.numSegments) : 1,
    })

    return { success: true, messageSid: message.sid }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Error desconocido al enviar SMS'
    console.error('[testTwilioConnection] Error:', errorMessage)
    return { success: false, error: errorMessage }
  }
}

// ============================================================================
// 3. Get Twilio Integration (with masked auth_token)
// ============================================================================

export async function getTwilioIntegration(): Promise<{
  id: string
  accountSid: string
  authToken: string // Masked: ****XXXX
  phoneNumber: string
  isActive: boolean
} | null> {
  const ctx = await getIntegrationAuthContext()
  if (!ctx) return null

  const adminSupabase = createAdminClient()
  const { data: integration } = await adminSupabase
    .from('integrations')
    .select('id, config, is_active')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'twilio')
    .single()

  if (!integration) return null

  const config = integration.config as TwilioConfig

  // Mask auth token: show only last 4 chars
  const maskedToken = config.auth_token
    ? '****' + config.auth_token.slice(-4)
    : ''

  return {
    id: integration.id,
    accountSid: config.account_sid || '',
    authToken: maskedToken,
    phoneNumber: config.phone_number || '',
    isActive: integration.is_active,
  }
}

// ============================================================================
// 4. Get SMS Usage
// ============================================================================

export interface SmsUsageData {
  totalSent: number
  totalCost: number
  pendingCost: number
  messages: Array<{
    id: string
    to_number: string
    body: string
    status: string
    price: number | null
    price_unit: string
    segments: number
    created_at: string
  }>
}

export async function getSmsUsage(
  period: 'day' | 'week' | 'month'
): Promise<SmsUsageData> {
  const ctx = await getIntegrationAuthContext()
  if (!ctx) {
    return { totalSent: 0, totalCost: 0, pendingCost: 0, messages: [] }
  }

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

  // Get all messages in period
  const { data: messages, error } = await adminSupabase
    .from('sms_messages')
    .select('id, to_number, body, status, price, price_unit, segments, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .gte('created_at', periodStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[getSmsUsage] Error:', error)
    return { totalSent: 0, totalCost: 0, pendingCost: 0, messages: [] }
  }

  // Get aggregate stats (total count, not limited to 50)
  const { count: totalSent } = await adminSupabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', ctx.workspaceId)
    .gte('created_at', periodStart.toISOString())

  // Calculate total cost (sum of prices where not null)
  const { data: costData } = await adminSupabase
    .from('sms_messages')
    .select('price')
    .eq('workspace_id', ctx.workspaceId)
    .gte('created_at', periodStart.toISOString())
    .not('price', 'is', null)

  const totalCost = (costData || []).reduce(
    (sum, msg) => sum + (msg.price ? Number(msg.price) : 0),
    0
  )

  // Count pending (price is null)
  const { count: pendingCost } = await adminSupabase
    .from('sms_messages')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', ctx.workspaceId)
    .gte('created_at', periodStart.toISOString())
    .is('price', null)

  // Truncate body to 100 chars for display
  const truncatedMessages = (messages || []).map((msg) => ({
    ...msg,
    body: msg.body.length > 100 ? msg.body.slice(0, 100) + '...' : msg.body,
  }))

  return {
    totalSent: totalSent || 0,
    totalCost,
    pendingCost: pendingCost || 0,
    messages: truncatedMessages,
  }
}

// ============================================================================
// 5. Get SMS Usage Chart Data
// ============================================================================

export interface SmsChartData {
  date: string
  count: number
  cost: number
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

  // Fetch all messages in period
  const { data: messages, error } = await adminSupabase
    .from('sms_messages')
    .select('created_at, price')
    .eq('workspace_id', ctx.workspaceId)
    .gte('created_at', periodStart.toISOString())
    .order('created_at', { ascending: true })

  if (error || !messages) {
    console.error('[getSmsUsageChart] Error:', error)
    return []
  }

  // Group by date (Colombia timezone)
  const groupedByDate = new Map<string, { count: number; cost: number }>()

  // Initialize all dates in range
  for (let i = 0; i < days; i++) {
    const date = new Date(periodStart.getTime() + i * 24 * 60 * 60 * 1000)
    const dateStr = date.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })
    groupedByDate.set(dateStr, { count: 0, cost: 0 })
  }

  // Aggregate messages
  for (const msg of messages) {
    const dateStr = new Date(msg.created_at).toLocaleDateString('sv-SE', {
      timeZone: 'America/Bogota',
    })
    const existing = groupedByDate.get(dateStr) || { count: 0, cost: 0 }
    existing.count++
    existing.cost += msg.price ? Number(msg.price) : 0
    groupedByDate.set(dateStr, existing)
  }

  // Convert to array
  return Array.from(groupedByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      count: data.count,
      cost: data.cost,
    }))
}

// ============================================================================
// 6. Update Shopify Auto-Sync Toggle
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
