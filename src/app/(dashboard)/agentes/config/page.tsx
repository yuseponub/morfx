import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { ConfigPanel } from '../components/config-panel'

export default async function AgentesConfigPage() {
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

  // Only admin/owner can access config
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!membership || membership.role === 'agent') {
    redirect('/agentes')
  }

  return <ConfigPanel />
}
