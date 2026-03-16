import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getSMSConfig, getSMSMetrics } from '@/app/actions/sms'
import { SmsDashboard } from './components/sms-dashboard'

export default async function SmsPage() {
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

  // Fetch initial data
  const [config, metrics] = await Promise.all([
    getSMSConfig(),
    getSMSMetrics(),
  ])

  const isSuperAdmin = user.email === 'joseromerorincon041100@gmail.com'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container py-6 px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">SMS</h1>
          <p className="text-muted-foreground">
            Monitorea el uso de SMS, saldo y estadisticas de entrega
          </p>
        </div>

        <SmsDashboard initialConfig={config} initialMetrics={metrics} isSuperAdmin={isSuperAdmin} />
      </div>
    </div>
  )
}
