'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import {
  getCarrierConfig,
  upsertCarrierConfig,
  type CarrierConfig,
} from '@/lib/domain/carrier-configs'

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string }

/**
 * Get logistics config (carrier=coordinadora) for the current workspace.
 */
export async function getLogisticsConfig(): Promise<CarrierConfig | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return null

  const result = await getCarrierConfig(
    { workspaceId, source: 'server-action' },
    'coordinadora'
  )

  return result.success ? (result.data ?? null) : null
}

/**
 * Update dispatch pipeline/stage/enabled for a carrier.
 * Does NOT touch portalUsername or portalPassword (preserves existing credentials).
 */
export async function updateDispatchConfig(params: {
  carrier: string
  dispatchPipelineId: string | null
  dispatchStageId: string | null
  isEnabled: boolean
}): Promise<ActionResult<CarrierConfig>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  // Check admin role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return { error: 'Solo administradores pueden cambiar esta configuracion' }
  }

  const result = await upsertCarrierConfig(
    { workspaceId, source: 'server-action' },
    {
      carrier: params.carrier,
      dispatchPipelineId: params.dispatchPipelineId,
      dispatchStageId: params.dispatchStageId,
      isEnabled: params.isEnabled,
    }
  )

  if (!result.success) {
    return { error: result.error ?? 'Error actualizando configuracion' }
  }

  revalidatePath('/settings/logistica')

  return { success: true, data: result.data as CarrierConfig }
}

/**
 * Update OCR pipeline/stage config for guide reading.
 * Separate from dispatch config — OCR matches guides to orders in a specific stage
 * (e.g., "ESPERANDO GUIAS") for external carriers (Envia, Inter, etc.).
 */
export async function updateOcrConfig(params: {
  ocrPipelineId: string | null
  ocrStageId: string | null
}): Promise<ActionResult<CarrierConfig>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  // Check admin role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return { error: 'Solo administradores pueden cambiar esta configuracion' }
  }

  const result = await upsertCarrierConfig(
    { workspaceId, source: 'server-action' },
    {
      carrier: 'coordinadora',
      ocrPipelineId: params.ocrPipelineId,
      ocrStageId: params.ocrStageId,
    }
  )

  if (!result.success) {
    return { error: result.error ?? 'Error actualizando configuracion OCR' }
  }

  revalidatePath('/settings/logistica')

  return { success: true, data: result.data as CarrierConfig }
}

/**
 * Update guide lookup pipeline/stage config.
 * Used by "buscar guias coord" to read from a stage different from dispatch stage.
 */
export async function updateGuideLookupConfig(params: {
  guideLookupPipelineId: string | null
  guideLookupStageId: string | null
}): Promise<ActionResult<CarrierConfig>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return { error: 'Solo administradores pueden cambiar esta configuracion' }
  }

  const result = await upsertCarrierConfig(
    { workspaceId, source: 'server-action' },
    {
      carrier: 'coordinadora',
      guideLookupPipelineId: params.guideLookupPipelineId,
      guideLookupStageId: params.guideLookupStageId,
    }
  )

  if (!result.success) {
    return { error: result.error ?? 'Error actualizando configuracion de busqueda de guias' }
  }

  revalidatePath('/settings/logistica')

  return { success: true, data: result.data as CarrierConfig }
}

/**
 * Update guide generation pipeline/stage config for a specific carrier type.
 * Each carrier type maps to its own column prefix on the same config row
 * (carrier='coordinadora') to keep all logistics config in a single row per workspace.
 *
 * - inter  -> pdf_inter_pipeline_id / pdf_inter_stage_id
 * - bogota -> pdf_bogota_pipeline_id / pdf_bogota_stage_id
 * - envia  -> pdf_envia_pipeline_id / pdf_envia_stage_id
 */
export async function updateGuideGenConfig(params: {
  carrierType: 'inter' | 'bogota' | 'envia'
  pipelineId: string | null
  stageId: string | null
}): Promise<ActionResult<CarrierConfig>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  // Check admin role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return { error: 'Solo administradores pueden cambiar esta configuracion' }
  }

  // Map carrierType to domain param names
  type UpsertFields = {
    pdfInterPipelineId?: string | null
    pdfInterStageId?: string | null
    pdfBogotaPipelineId?: string | null
    pdfBogotaStageId?: string | null
    pdfEnviaPipelineId?: string | null
    pdfEnviaStageId?: string | null
  }

  const fieldMap: Record<'inter' | 'bogota' | 'envia', UpsertFields> = {
    inter: {
      pdfInterPipelineId: params.pipelineId,
      pdfInterStageId: params.stageId,
    },
    bogota: {
      pdfBogotaPipelineId: params.pipelineId,
      pdfBogotaStageId: params.stageId,
    },
    envia: {
      pdfEnviaPipelineId: params.pipelineId,
      pdfEnviaStageId: params.stageId,
    },
  }

  const result = await upsertCarrierConfig(
    { workspaceId, source: 'server-action' },
    {
      carrier: 'coordinadora',
      ...fieldMap[params.carrierType],
    }
  )

  if (!result.success) {
    return { error: result.error ?? 'Error actualizando configuracion de generacion de guias' }
  }

  revalidatePath('/settings/logistica')

  return { success: true, data: result.data as CarrierConfig }
}
