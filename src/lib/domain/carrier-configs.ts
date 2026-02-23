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
  ocr_pipeline_id: string | null
  ocr_stage_id: string | null
  // Guide generation stage configs (Phase 28)
  pdf_inter_pipeline_id: string | null
  pdf_inter_stage_id: string | null
  pdf_inter_dest_stage_id: string | null
  pdf_bogota_pipeline_id: string | null
  pdf_bogota_stage_id: string | null
  pdf_bogota_dest_stage_id: string | null
  pdf_envia_pipeline_id: string | null
  pdf_envia_stage_id: string | null
  pdf_envia_dest_stage_id: string | null
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
  ocrPipelineId?: string | null
  ocrStageId?: string | null
  // Guide generation stage configs (Phase 28)
  pdfInterPipelineId?: string | null
  pdfInterStageId?: string | null
  pdfInterDestStageId?: string | null
  pdfBogotaPipelineId?: string | null
  pdfBogotaStageId?: string | null
  pdfBogotaDestStageId?: string | null
  pdfEnviaPipelineId?: string | null
  pdfEnviaStageId?: string | null
  pdfEnviaDestStageId?: string | null
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
        ocr_pipeline_id: params.ocrPipelineId ?? null,
        ocr_stage_id: params.ocrStageId ?? null,
        pdf_inter_pipeline_id: params.pdfInterPipelineId ?? null,
        pdf_inter_stage_id: params.pdfInterStageId ?? null,
        pdf_inter_dest_stage_id: params.pdfInterDestStageId ?? null,
        pdf_bogota_pipeline_id: params.pdfBogotaPipelineId ?? null,
        pdf_bogota_stage_id: params.pdfBogotaStageId ?? null,
        pdf_bogota_dest_stage_id: params.pdfBogotaDestStageId ?? null,
        pdf_envia_pipeline_id: params.pdfEnviaPipelineId ?? null,
        pdf_envia_stage_id: params.pdfEnviaStageId ?? null,
        pdf_envia_dest_stage_id: params.pdfEnviaDestStageId ?? null,
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
    if (params.ocrPipelineId !== undefined) updates.ocr_pipeline_id = params.ocrPipelineId
    if (params.ocrStageId !== undefined) updates.ocr_stage_id = params.ocrStageId
    // Guide generation stage configs (Phase 28)
    if (params.pdfInterPipelineId !== undefined) updates.pdf_inter_pipeline_id = params.pdfInterPipelineId
    if (params.pdfInterStageId !== undefined) updates.pdf_inter_stage_id = params.pdfInterStageId
    if (params.pdfInterDestStageId !== undefined) updates.pdf_inter_dest_stage_id = params.pdfInterDestStageId
    if (params.pdfBogotaPipelineId !== undefined) updates.pdf_bogota_pipeline_id = params.pdfBogotaPipelineId
    if (params.pdfBogotaStageId !== undefined) updates.pdf_bogota_stage_id = params.pdfBogotaStageId
    if (params.pdfBogotaDestStageId !== undefined) updates.pdf_bogota_dest_stage_id = params.pdfBogotaDestStageId
    if (params.pdfEnviaPipelineId !== undefined) updates.pdf_envia_pipeline_id = params.pdfEnviaPipelineId
    if (params.pdfEnviaStageId !== undefined) updates.pdf_envia_stage_id = params.pdfEnviaStageId
    if (params.pdfEnviaDestStageId !== undefined) updates.pdf_envia_dest_stage_id = params.pdfEnviaDestStageId
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
 * Get the OCR stage configuration (pipeline + stage where orders await guide matching).
 * Returns null if config doesn't exist or ocr_pipeline_id/ocr_stage_id are not set.
 * Used by "leer guias" command to know which orders are eligible for OCR matching.
 */
export async function getOcrStage(
  ctx: DomainContext,
): Promise<DomainResult<{ pipelineId: string; stageId: string } | null>> {
  try {
    const configResult = await getCarrierConfig(ctx, 'coordinadora')

    if (!configResult.success) {
      return { success: false, error: configResult.error }
    }

    if (!configResult.data) {
      return { success: true, data: null }
    }

    const { ocr_pipeline_id, ocr_stage_id } = configResult.data

    if (!ocr_pipeline_id || !ocr_stage_id) {
      return { success: true, data: null }
    }

    return {
      success: true,
      data: {
        pipelineId: ocr_pipeline_id,
        stageId: ocr_stage_id,
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

/**
 * Get the guide generation stage configuration for a specific carrier type.
 * Returns null if config doesn't exist or pipeline_id/stage_id are not set.
 * destStageId may be null (optional post-generation stage move).
 *
 * Used by "generar guias inter/bogota" and "generar excel envia" commands
 * to know which stage to pull orders from and where to move them after.
 */
export async function getGuideGenStage(
  ctx: DomainContext,
  carrierType: 'inter' | 'bogota' | 'envia'
): Promise<DomainResult<{ pipelineId: string; stageId: string; destStageId: string | null } | null>> {
  try {
    const configResult = await getCarrierConfig(ctx, 'coordinadora')

    if (!configResult.success) {
      return { success: false, error: configResult.error }
    }

    if (!configResult.data) {
      return { success: true, data: null }
    }

    // Map carrierType to column prefix
    const config = configResult.data
    let pipelineId: string | null
    let stageId: string | null
    let destStageId: string | null

    switch (carrierType) {
      case 'inter':
        pipelineId = config.pdf_inter_pipeline_id
        stageId = config.pdf_inter_stage_id
        destStageId = config.pdf_inter_dest_stage_id
        break
      case 'bogota':
        pipelineId = config.pdf_bogota_pipeline_id
        stageId = config.pdf_bogota_stage_id
        destStageId = config.pdf_bogota_dest_stage_id
        break
      case 'envia':
        pipelineId = config.pdf_envia_pipeline_id
        stageId = config.pdf_envia_stage_id
        destStageId = config.pdf_envia_dest_stage_id
        break
    }

    if (!pipelineId || !stageId) {
      return { success: true, data: null }
    }

    return {
      success: true,
      data: {
        pipelineId,
        stageId,
        destStageId: destStageId ?? null,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
