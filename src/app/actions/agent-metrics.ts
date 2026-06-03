'use server'

import { createClient } from '@/lib/supabase/server'
import { getRequestAuth } from '@/lib/auth/request-auth'
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
  const auth = await getRequestAuth()
  if (!auth) {
    return { error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  // Verify membership (agent role cannot access metrics)
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', auth.userId)
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
