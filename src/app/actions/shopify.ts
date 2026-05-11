'use server'

// ============================================================================
// Phase 11: Shopify Integration Server Actions
// CRUD operations for Shopify integration management
// Only workspace Owner can modify integrations
// ============================================================================

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteShopifyIntegration as domainDeleteShopifyIntegration } from '@/lib/domain/integrations'
import type { ShopifyIntegration } from '@/lib/shopify/types'
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
//
// NOTE: las funciones legacy `testConnection` + `saveShopifyIntegration` que
// vivian aqui (acceso manual con shpat_/shpss_ pegados desde el form) fueron
// eliminadas en el standalone shopify-dev-dashboard-oauth (Plan 06, D-03):
//   - El flow OAuth (Plan 04 startShopifyOauth + Plan 05 callback) reemplaza
//     ambos: el callback ya hace test-before-persist (Pattern G) y persiste
//     via domain layer `upsertShopifyIntegration` (Regla 3, D-10).
//   - El UI legacy (form de credenciales manuales) fue reemplazado por el
//     branch DISCONNECTED de `shopify-form.tsx` (Plan 06).
//
// Las funciones GET (`getShopifyIntegration`, `getWebhookEvents`,
// `getPipelinesForConfig`, `getIntegrationStatus`) y las MUTACIONES restantes
// `toggleShopifyIntegration` (active/inactive) y `deleteShopifyIntegration`
// permanecen porque siguen siendo invocadas desde la UI / callers existentes.
// `deleteShopifyIntegration` ahora delega al domain layer (Regla 3, Plan 06).

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

  // Regla 3 (D-10): toda mutacion via domain layer.
  // Standalone shopify-dev-dashboard-oauth Plan 06 — refactor del delete path
  // para llamar a `src/lib/domain/integrations.ts` (Opcion A6: import alias).
  const result = await domainDeleteShopifyIntegration({
    workspaceId,
    source: 'server-action',
    actorId: user.id,
    actorLabel: `user:${user.id.slice(0, 8)}`,
  })

  if (!result.success) {
    console.error('Error deleting integration:', result.error)
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
