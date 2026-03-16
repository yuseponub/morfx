import { getAllWorkspaceSMS } from '@/app/actions/sms-admin'
import { SmsAdminDashboard } from './components/sms-admin-dashboard'

export default async function SuperAdminSmsPage() {
  const workspaces = await getAllWorkspaceSMS()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SMS</h1>
        <p className="text-muted-foreground">
          Gestiona saldos y configuracion SMS de todos los workspaces
        </p>
      </div>

      <SmsAdminDashboard workspaces={workspaces} />
    </div>
  )
}
