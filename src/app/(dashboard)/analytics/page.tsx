import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { AnalyticsView } from './components/analytics-view'
import { getOrderMetrics, getSalesTrend } from '@/app/actions/analytics'

export default async function AnalyticsPage() {
  // Role check: only admin/owner can access
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

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  // Agents cannot access
  if (membership?.role === 'agent') {
    redirect('/crm/pedidos')
  }

  // Fetch initial data (7 days default)
  const [metrics, trend] = await Promise.all([
    getOrderMetrics('7days'),
    getSalesTrend('7days')
  ])

  return (
    <div className="flex-1 overflow-auto">
      <div className="container py-6 px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Metricas de ventas y rendimiento del workspace
          </p>
        </div>

        <AnalyticsView initialMetrics={metrics} initialTrend={trend} />
      </div>
    </div>
  )
}
