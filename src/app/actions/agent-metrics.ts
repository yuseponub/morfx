'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import {
  getMetricsByPeriod,
  type AgentMetrics,
  type MetricsPeriod,
} from '@/lib/agents/production/metrics'

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Fetch agent metrics for the current workspace by period.
 *
 * Validates authentication and workspace membership before querying.
 */
export async function fetchAgentMetrics(
  period: MetricsPeriod,
  customStart?: string,
  customEnd?: string
): Promise<
  | { success: true; data: AgentMetrics }
  | { error: string }
> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'Workspace no seleccionado' }
  }

  // Verify membership (agent role cannot access metrics)
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return { error: 'No eres miembro de este workspace' }
  }

  if (membership.role === 'agent') {
    return { error: 'Acceso restringido' }
  }

  const metrics = await getMetricsByPeriod(workspaceId, period, customStart, customEnd)

  return { success: true, data: metrics }
}
