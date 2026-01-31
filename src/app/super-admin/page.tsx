import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAllWorkspacesUsage } from '@/app/actions/usage'
import { Building2, MessageSquare, DollarSign } from 'lucide-react'

export default async function SuperAdminPage() {
  const workspaces = await getAllWorkspacesUsage('month')

  const totalWorkspaces = workspaces.length
  const totalMessages = workspaces.reduce((sum, ws) => sum + ws.totalMessages, 0)
  const totalCost = workspaces.reduce((sum, ws) => sum + ws.totalCost, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Panel de Super Admin</h1>
        <p className="text-muted-foreground">
          Vision general de la plataforma MorfX
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Workspaces</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWorkspaces}</div>
            <p className="text-xs text-muted-foreground">
              Workspaces activos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensajes (mes)</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMessages.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Total de mensajes este mes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costos (mes)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalCost.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              USD estimados
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
