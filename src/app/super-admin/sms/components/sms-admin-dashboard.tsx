'use client'

import { WorkspaceSMSRow } from '@/app/actions/sms-admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquareText, Zap, DollarSign } from 'lucide-react'
import { WorkspaceSmsTable } from './workspace-sms-table'

const copFormat = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

interface Props {
  workspaces: WorkspaceSMSRow[]
}

export function SmsAdminDashboard({ workspaces }: Props) {
  const activeCount = workspaces.filter(w => w.isActive === true).length
  const totalSmsSent = workspaces.reduce((sum, w) => sum + w.totalSmsSent, 0)
  const totalCreditsUsed = workspaces.reduce((sum, w) => sum + w.totalCreditsUsed, 0)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-500" />
              Workspaces Activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeCount}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                / {workspaces.length}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-blue-500" />
              Total SMS Enviados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSmsSent.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-yellow-500" />
              Creditos Usados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{copFormat.format(totalCreditsUsed)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Workspace Table */}
      <WorkspaceSmsTable workspaces={workspaces} />
    </div>
  )
}
