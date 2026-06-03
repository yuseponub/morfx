'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getRequestAuth } from '@/lib/auth/request-auth'
import { updateConversationMetricsSettings } from '@/lib/domain/workspace-settings'
import type { MetricsSettings } from '@/lib/metricas-conversaciones/types'

type ActionResult =
  | { ok: true; settings: MetricsSettings }
  | { ok: false; error: string }

/**
 * Server action: update workspaces.settings.conversation_metrics for the
 * current workspace.
 *
 * Auth: requires an authenticated user who is `owner` or `admin` of the
 * current workspace. `agent` role is rejected — the settings UI is
 * admin-restricted even though the dashboard itself is open to all users.
 *
 * Persistence: delegated to the domain layer
 * (src/lib/domain/workspace-settings.ts) per CLAUDE.md Rule 3.
 */
export async function updateMetricsSettings(
  partial: Partial<MetricsSettings>,
): Promise<ActionResult> {
  const auth = await getRequestAuth()
  if (!auth) {
    return { ok: false, error: 'no autenticado' }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  // Role check: owner/admin only (morfx has no 'manager' role; 'agent' is
  // regular user and cannot edit module settings).
  const { data: member, error: memberErr } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', auth.userId)
    .single()
  if (memberErr || !member) {
    return { ok: false, error: 'no eres miembro de este workspace' }
  }
  if (member.role !== 'owner' && member.role !== 'admin') {
    return { ok: false, error: 'permiso denegado: requiere rol owner o admin' }
  }

  const result = await updateConversationMetricsSettings(workspaceId, partial)
  if (!result.ok) {
    return result
  }

  // Refresh the dashboard, the settings page, and the root layout so the
  // sidebar re-renders with the updated gate.
  revalidatePath('/metricas')
  revalidatePath('/metricas/settings')
  revalidatePath('/', 'layout')

  return result
}
