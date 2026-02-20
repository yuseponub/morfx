// ============================================================================
// Client Activation Config — Domain Module
// Manages the is_client badge configuration per workspace.
// Uses createAdminClient (bypass RLS, workspace isolation via explicit filters).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'

// ============================================================================
// TYPES
// ============================================================================

export interface ClientActivationConfig {
  workspace_id: string
  enabled: boolean
  all_are_clients: boolean
  activation_stage_ids: string[]
  created_at: string
  updated_at: string
}

export const DEFAULT_CLIENT_ACTIVATION: Omit<ClientActivationConfig, 'workspace_id' | 'created_at' | 'updated_at'> = {
  enabled: false,
  all_are_clients: false,
  activation_stage_ids: [],
}

// ============================================================================
// READ
// ============================================================================

/**
 * Get client activation config for a workspace. Returns null if no config row exists.
 */
export async function getClientActivationConfig(
  workspaceId: string
): Promise<ClientActivationConfig | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('client_activation_config')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) {
    if (error?.code !== 'PGRST116') {
      console.error('Error fetching client activation config:', error)
    }
    return null
  }

  return data as ClientActivationConfig
}

// ============================================================================
// WRITE
// ============================================================================

/**
 * Upsert client activation config. Creates or updates the config row.
 */
export async function upsertClientActivationConfig(
  workspaceId: string,
  updates: Partial<Omit<ClientActivationConfig, 'workspace_id' | 'created_at' | 'updated_at'>>
): Promise<{ data: ClientActivationConfig } | { error: string }> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const existing = await getClientActivationConfig(workspaceId)

  if (!existing) {
    const insertPayload = {
      workspace_id: workspaceId,
      ...DEFAULT_CLIENT_ACTIVATION,
      ...updates,
      created_at: now,
      updated_at: now,
    }
    const { data, error } = await supabase
      .from('client_activation_config')
      .insert(insertPayload)
      .select('*')
      .single()

    if (error) {
      console.error('[client-activation] INSERT error:', error)
      return { error: `INSERT: ${error.message} (${error.code})` }
    }
    return { data: data as ClientActivationConfig }
  }

  const { data, error } = await supabase
    .from('client_activation_config')
    .update({ ...updates, updated_at: now })
    .eq('workspace_id', workspaceId)
    .select('*')
    .single()

  if (error) {
    console.error('[client-activation] UPDATE error:', error)
    return { error: `UPDATE: ${error.message} (${error.code})` }
  }
  return { data: data as ClientActivationConfig }
}

// ============================================================================
// BACKFILL
// ============================================================================

/**
 * Recalculate is_client for all contacts in a workspace based on current config.
 * Called when activation_stage_ids changes.
 */
export async function backfillIsClient(workspaceId: string): Promise<{ updated: number } | { error: string }> {
  const supabase = createAdminClient()

  const config = await getClientActivationConfig(workspaceId)

  // If config doesn't exist, not enabled, or no stage IDs → reset all to false
  if (!config || !config.enabled || config.activation_stage_ids.length === 0) {
    const { error } = await supabase
      .from('contacts')
      .update({ is_client: false })
      .eq('workspace_id', workspaceId)
      .eq('is_client', true)

    if (error) {
      console.error('[client-activation] backfill reset error:', error)
      return { error: `[reset-disabled] ${error.code}: ${error.message}` }
    }
    return { updated: 0 }
  }

  // Get contact IDs that have orders in activation stages
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('contact_id')
    .eq('workspace_id', workspaceId)
    .not('contact_id', 'is', null)
    .in('stage_id', config.activation_stage_ids)

  if (ordersError) {
    console.error('[client-activation] backfill orders query error:', ordersError)
    return { error: `[orders-query] ${ordersError.code}: ${ordersError.message}` }
  }

  const clientContactIds = [...new Set((orders || []).map(o => o.contact_id).filter(Boolean))]

  // Reset all contacts to false first
  const { error: resetError } = await supabase
    .from('contacts')
    .update({ is_client: false })
    .eq('workspace_id', workspaceId)
    .eq('is_client', true)

  if (resetError) {
    console.error('[client-activation] backfill reset error:', resetError)
    return { error: `[reset-all] ${resetError.code}: ${resetError.message}` }
  }

  // Set matching contacts to true (batch to avoid PostgREST URL length limits)
  if (clientContactIds.length > 0) {
    const BATCH_SIZE = 200
    for (let i = 0; i < clientContactIds.length; i += BATCH_SIZE) {
      const batch = clientContactIds.slice(i, i + BATCH_SIZE)
      const { error: setError } = await supabase
        .from('contacts')
        .update({ is_client: true })
        .eq('workspace_id', workspaceId)
        .in('id', batch)

      if (setError) {
        console.error('[client-activation] backfill set error:', setError)
        return { error: `[set-clients] ${setError.code}: ${setError.message}` }
      }
    }
  }

  return { updated: clientContactIds.length }
}
