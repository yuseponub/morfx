import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { MetricsSettingsForm } from './components/metrics-settings-form'
import {
  DEFAULT_METRICS_SETTINGS,
  type MetricsSettings,
} from '@/lib/metricas-conversaciones/types'

export const dynamic = 'force-dynamic'

export default async function MetricasSettingsPage() {
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

  // Settings page IS role-restricted: only owner/admin can edit.
  // (The dashboard /metricas itself is open to all users of the workspace.)
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  const role = member?.role as string | undefined
  const isAdmin = role === 'owner' || role === 'admin'
  if (!isAdmin) {
    redirect('/metricas')
  }

  // Load current settings (may not exist yet — merge with defaults).
  const { data: ws } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  const current: MetricsSettings = {
    ...DEFAULT_METRICS_SETTINGS,
    ...(((ws?.settings as { conversation_metrics?: Partial<MetricsSettings> } | null)
      ?.conversation_metrics) ?? {}),
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container py-6 px-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            Configuracion — Metricas de conversaciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Activa el modulo y ajusta los parametros de calculo para este workspace.
          </p>
        </div>
        <MetricsSettingsForm initial={current} />
      </div>
    </div>
  )
}
