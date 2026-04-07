import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getConversationMetrics } from '@/app/actions/metricas-conversaciones'
import { MetricasView } from './components/metricas-view'

export const dynamic = 'force-dynamic'

export default async function MetricasPage() {
  const supabase = await createClient()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    redirect('/crm/pedidos')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Settings gate: module is only accessible if workspaces.settings.conversation_metrics.enabled === true
  const { data: ws } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  const enabled =
    (ws?.settings as { conversation_metrics?: { enabled?: boolean } } | null)
      ?.conversation_metrics?.enabled === true
  if (!enabled) {
    redirect('/crm/pedidos')
  }

  // NOTE: NO role restriction — explicit exception vs analytics.
  // ALL workspace users (including agents) can access this module.

  const initial = await getConversationMetrics('today')

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container py-6 px-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Metricas de conversaciones</h1>
          <p className="text-sm text-muted-foreground">
            Nuevas, reabiertas y valoraciones agendadas por dia.
          </p>
        </div>
        <MetricasView initial={initial} workspaceId={workspaceId} />
      </div>
    </div>
  )
}
