import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClientActivationSettings } from '@/app/actions/client-activation'
import { getPipelines } from '@/app/actions/pipelines'
import { ActivationConfigForm } from './components/activation-config-form'

export default async function ClientActivationPage() {
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
    getClientActivationSettings(),
    getPipelines(),
  ])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Badge de Cliente</h1>
          <p className="text-muted-foreground">
            Configura cuando un contacto se marca como cliente en el inbox de WhatsApp
          </p>
        </div>

        <ActivationConfigForm
          config={config}
          pipelines={pipelines}
        />
      </div>
    </div>
  )
}
