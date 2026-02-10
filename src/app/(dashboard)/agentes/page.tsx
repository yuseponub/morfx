import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { MetricsDashboard } from './components/metrics-dashboard'
import { getMetricsByPeriod } from '@/lib/agents/production/metrics'

export default async function AgentesPage() {
  const supabase = await createClient()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  if (!workspaceId) {
    redirect('/crm/pedidos')
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Check membership — agents cannot access
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (membership?.role === 'agent') {
    redirect('/crm/pedidos')
  }

  // Fetch initial metrics (today)
  const initialMetrics = await getMetricsByPeriod(workspaceId, 'today')

  return <MetricsDashboard initialMetrics={initialMetrics} />
}
