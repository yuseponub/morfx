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
