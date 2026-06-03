'use server'

import { createClient } from '@/lib/supabase/server'
import { getRequestAuth } from '@/lib/auth/request-auth'
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
  const auth = await getRequestAuth()
  if (!auth) return null

  return getClientActivationConfig(auth.workspaceId)
}

/**
 * Update client activation config. Triggers backfill when stage IDs change.
 */
export async function updateClientActivation(
  updates: Partial<Omit<ClientActivationConfig, 'workspace_id' | 'created_at' | 'updated_at'>>
): Promise<ActionResult<ClientActivationConfig>> {
  const auth = await getRequestAuth()
  if (!auth) return { error: 'No autenticado' }
  const workspaceId = auth.workspaceId
  const supabase = await createClient()

  // Check admin role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', auth.userId)
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
