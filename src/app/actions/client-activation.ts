'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import {
  getClientActivationConfig,
  upsertClientActivationConfig,
  backfillIsClient,
  type ClientActivationConfig,
} from '@/lib/domain/client-activation'

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string }

/**
 * Get client activation settings for the current workspace.
 */
export async function getClientActivationSettings(): Promise<ClientActivationConfig | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return null

  return getClientActivationConfig(workspaceId)
}

/**
 * Update client activation config. Triggers backfill when stage IDs change.
 */
export async function updateClientActivation(
  updates: Partial<Omit<ClientActivationConfig, 'workspace_id' | 'created_at' | 'updated_at'>>
): Promise<ActionResult<ClientActivationConfig>> {
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

  const result = await upsertClientActivationConfig(workspaceId, updates)

  if ('error' in result) {
    return { error: result.error }
  }

  // Backfill when activation_stage_ids or enabled changes
  if (updates.activation_stage_ids !== undefined || updates.enabled !== undefined) {
    const backfillResult = await backfillIsClient(workspaceId)
    if ('error' in backfillResult) {
      console.error('[client-activation] backfill failed:', backfillResult.error)
    }
  }

  revalidatePath('/settings/activacion-cliente')
  revalidatePath('/whatsapp')

  return { success: true, data: result.data }
}

/**
 * Manually run the is_client backfill for existing contacts.
 */
export async function runClientBackfill(): Promise<ActionResult<{ updated: number }>> {
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
    return { error: 'Solo administradores pueden ejecutar el backfill' }
  }

  const result = await backfillIsClient(workspaceId)

  if ('error' in result) {
    return { error: result.error }
  }

  revalidatePath('/whatsapp')

  return { success: true, data: { updated: result.updated } }
}
