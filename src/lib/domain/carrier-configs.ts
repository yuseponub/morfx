// ============================================================================
// Domain Layer -- Carrier Configs
// CRUD for workspace carrier credentials (portal username/password).
// Uses createAdminClient (bypass RLS, workspace isolation via explicit filters).
// Pattern follows client-activation.ts (config CRUD with PGRST116 handling).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Types
// ============================================================================

export interface CarrierConfig {
  id: string
  workspace_id: string
  carrier: string
  portal_username: string | null
  portal_password: string | null
  dispatch_pipeline_id: string | null
  dispatch_stage_id: string | null
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export interface UpsertCarrierConfigParams {
  carrier?: string
  portalUsername?: string | null
  portalPassword?: string | null
  dispatchPipelineId?: string | null
  dispatchStageId?: string | null
  isEnabled?: boolean
}

export interface CarrierCredentials {
  username: string
  password: string
}

// ============================================================================
// READ
// ============================================================================

/**
 * Get carrier config for a workspace + carrier pair.
 * Returns null if no config row exists.
 */
export async function getCarrierConfig(
  ctx: DomainContext,
  carrier?: string
): Promise<DomainResult<CarrierConfig | null>> {
  const supabase = createAdminClient()
  const carrierName = carrier || 'coordinadora'

  try {
    const { data, error } = await supabase
      .from('carrier_configs')
      .select('*')
      .eq('workspace_id', ctx.workspaceId)
      .eq('carrier', carrierName)
      .single()

    if (error) {
      // PGRST116 = no rows found -- config not yet created
      if (error.code === 'PGRST116') {
        return { success: true, data: null }
      }
      return { success: false, error: `Error obteniendo config: ${error.message}` }
    }

    return { success: true, data: data as CarrierConfig }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// WRITE
// ============================================================================

/**
 * Upsert carrier config. Creates if not exists, updates if exists.
 * Only provided fields are updated (undefined fields are skipped).
 */
export async function upsertCarrierConfig(
  ctx: DomainContext,
  params: UpsertCarrierConfigParams
): Promise<DomainResult<CarrierConfig>> {
  const supabase = createAdminClient()
  const carrierName = params.carrier || 'coordinadora'
  const now = new Date().toISOString()

  try {
    const existingResult = await getCarrierConfig(ctx, carrierName)

    if (!existingResult.success) {
      return { success: false, error: existingResult.error }
    }

    if (!existingResult.data) {
      // INSERT new config
      const insertPayload: Record<string, unknown> = {
        workspace_id: ctx.workspaceId,
        carrier: carrierName,
        portal_username: params.portalUsername ?? null,
        portal_password: params.portalPassword ?? null,
        dispatch_pipeline_id: params.dispatchPipelineId ?? null,
        dispatch_stage_id: params.dispatchStageId ?? null,
        is_enabled: params.isEnabled ?? false,
        created_at: now,
        updated_at: now,
      }

      const { data, error } = await supabase
        .from('carrier_configs')
        .insert(insertPayload)
        .select('*')
        .single()

      if (error) {
        console.error('[carrier-configs] INSERT error:', error)
        return { success: false, error: `INSERT: ${error.message} (${error.code})` }
      }

      return { success: true, data: data as CarrierConfig }
    }

    // UPDATE existing config (only provided fields)
    const updates: Record<string, unknown> = { updated_at: now }
    if (params.portalUsername !== undefined) updates.portal_username = params.portalUsername
    if (params.portalPassword !== undefined) updates.portal_password = params.portalPassword
    if (params.dispatchPipelineId !== undefined) updates.dispatch_pipeline_id = params.dispatchPipelineId
    if (params.dispatchStageId !== undefined) updates.dispatch_stage_id = params.dispatchStageId
    if (params.isEnabled !== undefined) updates.is_enabled = params.isEnabled

    const { data, error } = await supabase
      .from('carrier_configs')
      .update(updates)
      .eq('workspace_id', ctx.workspaceId)
      .eq('carrier', carrierName)
      .select('*')
      .single()

    if (error) {
      console.error('[carrier-configs] UPDATE error:', error)
      return { success: false, error: `UPDATE: ${error.message} (${error.code})` }
    }

    return { success: true, data: data as CarrierConfig }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// CONVENIENCE
// ============================================================================

/**
 * Get carrier credentials for robot dispatch.
 * Validates that the config exists, is enabled, and has complete credentials.
 */
export async function getCarrierCredentials(
  ctx: DomainContext,
  carrier?: string
): Promise<DomainResult<CarrierCredentials>> {
  try {
    const configResult = await getCarrierConfig(ctx, carrier)

    if (!configResult.success) {
      return { success: false, error: configResult.error }
    }

    if (!configResult.data) {
      return { success: false, error: 'Carrier no configurado' }
    }

    if (!configResult.data.is_enabled) {
      return { success: false, error: 'Carrier no configurado o deshabilitado' }
    }

    if (!configResult.data.portal_username || !configResult.data.portal_password) {
      return { success: false, error: 'Credenciales incompletas' }
    }

    return {
      success: true,
      data: {
        username: configResult.data.portal_username,
        password: configResult.data.portal_password,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Get the dispatch stage configuration for a carrier.
 * Returns null if config doesn't exist or dispatch_pipeline_id/dispatch_stage_id are not set.
 * Used by "subir ordenes coord" command to know which stage to pull orders from.
 */
export async function getDispatchStage(
  ctx: DomainContext,
  carrier?: string
): Promise<DomainResult<{ pipelineId: string; stageId: string } | null>> {
  try {
    const configResult = await getCarrierConfig(ctx, carrier)

    if (!configResult.success) {
      return { success: false, error: configResult.error }
    }

    if (!configResult.data) {
      return { success: true, data: null }
    }

    const { dispatch_pipeline_id, dispatch_stage_id } = configResult.data

    if (!dispatch_pipeline_id || !dispatch_stage_id) {
      return { success: true, data: null }
    }

    return {
      success: true,
      data: {
        pipelineId: dispatch_pipeline_id,
        stageId: dispatch_stage_id,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
