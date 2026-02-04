'use server'

// ============================================================================
// Phase 11: Shopify Integration Server Actions
// CRUD operations for Shopify integration management
// Only workspace Owner can modify integrations
// ============================================================================

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { testShopifyConnection, normalizeShopDomain, ConnectionTestResult } from '@/lib/shopify/connection-test'
import type { ShopifyIntegration, ShopifyConfig, IntegrationFormData } from '@/lib/shopify/types'
import type { Pipeline, PipelineStage } from '@/lib/orders/types'
import { cookies } from 'next/headers'

// ============================================================================
// GET OPERATIONS
// ============================================================================

/**
 * Gets the Shopify integration for the current workspace.
 * Returns null if no integration exists.
 */
export async function getShopifyIntegration(): Promise<ShopifyIntegration | null> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Get workspace from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return null

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('type', 'shopify')
    .single()

  return integration as ShopifyIntegration | null
}

/**
 * Gets webhook events for the Shopify integration (for debugging/status).
 * Returns recent events and statistics.
 */
export async function getWebhookEvents(limit: number = 20): Promise<{
  events: Array<{
    id: string
    external_id: string
    topic: string
    status: string
    error_message: string | null
    created_at: string
    processed_at: string | null
  }>
  stats: {
    total: number
    processed: number
    failed: number
    pending: number
  }
}> {
  const supabase = await createClient()

  const integration = await getShopifyIntegration()
  if (!integration) {
    return { events: [], stats: { total: 0, processed: 0, failed: 0, pending: 0 } }
  }

  // Get recent events
  const { data: events } = await supabase
    .from('webhook_events')
    .select('id, external_id, topic, status, error_message, created_at, processed_at')
    .eq('integration_id', integration.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Get stats - total count
  const { count: total } = await supabase
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('integration_id', integration.id)

  // Get stats - processed count
  const { count: processed } = await supabase
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('integration_id', integration.id)
    .eq('status', 'processed')

  // Get stats - failed count
  const { count: failed } = await supabase
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('integration_id', integration.id)
    .eq('status', 'failed')

  return {
    events: events || [],
    stats: {
      total: total || 0,
      processed: processed || 0,
      failed: failed || 0,
      pending: (total || 0) - (processed || 0) - (failed || 0),
    },
  }
}

/**
 * Gets pipelines and stages for configuration dropdown.
 * Used in the integration settings form.
 */
export async function getPipelinesForConfig(): Promise<Array<Pipeline & { stages: PipelineStage[] }>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Get workspace from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return []

  const { data: pipelines } = await supabase
    .from('pipelines')
    .select(`
      *,
      stages:pipeline_stages(*)
    `)
    .eq('workspace_id', workspaceId)
    .order('name')

  return (pipelines || []).map(p => ({
    ...p,
    stages: (p.stages || []).sort((a: PipelineStage, b: PipelineStage) => a.position - b.position),
  }))
}

// ============================================================================
// WRITE OPERATIONS (Owner only)
// ============================================================================

/**
 * Tests Shopify connection without saving.
 * Can be called by any workspace member to preview connection.
 */
export async function testConnection(formData: IntegrationFormData): Promise<ConnectionTestResult> {
  // Validate required fields
  if (!formData.shop_domain) {
    return { success: false, error: 'Dominio de tienda requerido' }
  }
  if (!formData.access_token) {
    return { success: false, error: 'Access Token requerido' }
  }
  if (!formData.api_secret) {
    return { success: false, error: 'API Secret requerido' }
  }

  const normalized = normalizeShopDomain(formData.shop_domain)
  if (!normalized) {
    return { success: false, error: 'Dominio de tienda invalido' }
  }

  return testShopifyConnection(
    normalized,
    formData.access_token,
    formData.api_secret
  )
}

/**
 * Saves Shopify integration (create or update).
 * Only workspace Owner can perform this action.
 */
export async function saveShopifyIntegration(formData: IntegrationFormData): Promise<{
  success: boolean
  error?: string
  integration?: ShopifyIntegration
}> {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'No autenticado' }
  }

  // Get workspace from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { success: false, error: 'No hay workspace seleccionado' }
  }

  // Verify Owner role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'owner') {
    return { success: false, error: 'Solo el Owner puede configurar integraciones' }
  }

  // Validate required fields
  if (!formData.shop_domain || !formData.access_token || !formData.api_secret) {
    return { success: false, error: 'Todos los campos de credenciales son requeridos' }
  }

  if (!formData.default_pipeline_id || !formData.default_stage_id) {
    return { success: false, error: 'Pipeline y etapa por defecto son requeridos' }
  }

  // Normalize shop domain
  const normalizedDomain = normalizeShopDomain(formData.shop_domain)
  if (!normalizedDomain) {
    return { success: false, error: 'Dominio de tienda invalido' }
  }

  // Test connection before saving
  const testResult = await testShopifyConnection(
    normalizedDomain,
    formData.access_token,
    formData.api_secret
  )

  if (!testResult.success) {
    return { success: false, error: testResult.error || 'Error de conexion' }
  }

  // Build config object
  const config: ShopifyConfig = {
    shop_domain: normalizedDomain,
    access_token: formData.access_token,
    api_secret: formData.api_secret,
    default_pipeline_id: formData.default_pipeline_id,
    default_stage_id: formData.default_stage_id,
    enable_fuzzy_matching: formData.enable_fuzzy_matching ?? false,
    product_matching: formData.product_matching ?? 'sku',
  }

  // Check if integration exists
  const { data: existing } = await adminSupabase
    .from('integrations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('type', 'shopify')
    .single()

  let integration: ShopifyIntegration

  if (existing) {
    // Update existing
    const { data: updated, error } = await adminSupabase
      .from('integrations')
      .update({
        name: formData.name || `Shopify - ${testResult.shopName}`,
        config,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating integration:', error)
      return { success: false, error: 'Error al actualizar integracion' }
    }
    integration = updated as ShopifyIntegration
  } else {
    // Create new
    const { data: created, error } = await adminSupabase
      .from('integrations')
      .insert({
        workspace_id: workspaceId,
        type: 'shopify',
        name: formData.name || `Shopify - ${testResult.shopName}`,
        config,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating integration:', error)
      return { success: false, error: 'Error al crear integracion' }
    }
    integration = created as ShopifyIntegration
  }

  return { success: true, integration }
}

/**
 * Toggles integration active status.
 * Only workspace Owner can perform this action.
 */
export async function toggleShopifyIntegration(isActive: boolean): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'No autenticado' }
  }

  // Get workspace from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { success: false, error: 'No hay workspace seleccionado' }
  }

  // Verify Owner role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'owner') {
    return { success: false, error: 'Solo el Owner puede modificar integraciones' }
  }

  const { error } = await adminSupabase
    .from('integrations')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('type', 'shopify')

  if (error) {
    console.error('Error toggling integration:', error)
    return { success: false, error: 'Error al actualizar integracion' }
  }

  return { success: true }
}

/**
 * Deletes Shopify integration.
 * Only workspace Owner can perform this action.
 * This will also delete all associated webhook events.
 */
export async function deleteShopifyIntegration(): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'No autenticado' }
  }

  // Get workspace from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { success: false, error: 'No hay workspace seleccionado' }
  }

  // Verify Owner role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'owner') {
    return { success: false, error: 'Solo el Owner puede eliminar integraciones' }
  }

  const { error } = await adminSupabase
    .from('integrations')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('type', 'shopify')

  if (error) {
    console.error('Error deleting integration:', error)
    return { success: false, error: 'Error al eliminar integracion' }
  }

  return { success: true }
}

/**
 * Gets integration status for display in the settings UI.
 * Returns connection status, last sync time, and recent statistics.
 */
export async function getIntegrationStatus(): Promise<{
  isConfigured: boolean
  isActive: boolean
  shopName: string | null
  lastSyncAt: string | null
  todayStats: {
    ordersImported: number
    errors: number
  }
} | null> {
  const integration = await getShopifyIntegration()

  if (!integration) {
    return null
  }

  const supabase = await createClient()

  // Get today's webhook stats
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Count orders imported today
  const { count: ordersImported } = await supabase
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('integration_id', integration.id)
    .eq('topic', 'orders/create')
    .eq('status', 'processed')
    .gte('created_at', today.toISOString())

  // Count errors today
  const { count: errors } = await supabase
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('integration_id', integration.id)
    .eq('status', 'failed')
    .gte('created_at', today.toISOString())

  // Extract shop name from domain
  const shopDomain = integration.config.shop_domain
  const shopName = shopDomain ? shopDomain.replace('.myshopify.com', '') : null

  return {
    isConfigured: true,
    isActive: integration.is_active,
    shopName,
    lastSyncAt: integration.last_sync_at,
    todayStats: {
      ordersImported: ordersImported || 0,
      errors: errors || 0,
    },
  }
}
