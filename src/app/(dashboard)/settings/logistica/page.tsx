import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLogisticsConfig } from '@/app/actions/logistics-config'
import { getPipelines } from '@/app/actions/pipelines'
import { LogisticsConfigForm } from './components/logistics-config-form'

export default async function LogisticsSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) redirect('/workspace')

  // Check admin role
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    redirect('/settings')
  }

  const [config, pipelines] = await Promise.all([
    getLogisticsConfig(),
    getPipelines(),
  ])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Logistica</h1>
          <p className="text-muted-foreground">
            Configura que etapa del pipeline activa cada robot de transportadora
          </p>
        </div>

        <LogisticsConfigForm
          config={config}
          pipelines={pipelines}
        />
      </div>
    </div>
  )
}
