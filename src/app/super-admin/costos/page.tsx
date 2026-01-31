'use client'

import { useState, useEffect } from 'react'
import { getAllWorkspacesUsage, WorkspaceUsage } from '@/app/actions/usage'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, Building2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Period = 'today' | '7days' | '30days' | 'month'

export default function SuperAdminCostosPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [loading, setLoading] = useState(true)
  const [workspaces, setWorkspaces] = useState<WorkspaceUsage[]>([])

  useEffect(() => {
    loadData()
  }, [period])

  async function loadData() {
    setLoading(true)
    try {
      const data = await getAllWorkspacesUsage(period)
      setWorkspaces(data)
    } catch (error) {
      console.error('Failed to load usage:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalCost = workspaces.reduce((sum, ws) => sum + ws.totalCost, 0)
  const totalMessages = workspaces.reduce((sum, ws) => sum + ws.totalMessages, 0)
  const workspacesNearLimit = workspaces.filter(ws => ws.usagePercent && ws.usagePercent >= 80)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Costos por Workspace</h1>
          <p className="text-muted-foreground">
            Vision consolidada de uso y costos
          </p>
        </div>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(['today', '7days', '30days', 'month'] as Period[]).map((p) => (
            <Button
              key={p}
              variant="ghost"
              size="sm"
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-md',
                period === p && 'bg-background shadow-sm'
              )}
            >
              {p === 'today' ? 'Hoy' :
               p === '7days' ? '7 dias' :
               p === '30days' ? '30 dias' : 'Mes'}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Mensajes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMessages.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Costo Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className={workspacesNearLimit.length > 0 ? 'border-orange-200' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {workspacesNearLimit.length > 0 && (
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              )}
              Workspaces cerca del limite
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workspacesNearLimit.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Workspace Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Desglose por Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : workspaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay datos de uso en este periodo
            </div>
          ) : (
            <div className="space-y-4">
              {workspaces.map((ws) => (
                <div key={ws.workspaceId} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{ws.workspaceName}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${ws.totalCost.toFixed(4)}</p>
                      <p className="text-sm text-muted-foreground">
                        {ws.totalMessages.toLocaleString()} mensajes
                      </p>
                    </div>
                  </div>

                  {ws.limit && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Limite: ${ws.limit.toFixed(2)}
                        </span>
                        <span className={cn(
                          ws.usagePercent && ws.usagePercent >= 100 ? 'text-red-600' :
                          ws.usagePercent && ws.usagePercent >= 80 ? 'text-orange-600' :
                          'text-muted-foreground'
                        )}>
                          {ws.usagePercent?.toFixed(0)}%
                        </span>
                      </div>
                      <Progress
                        value={Math.min(ws.usagePercent || 0, 100)}
                        className={cn(
                          'h-2',
                          ws.usagePercent && ws.usagePercent >= 100 ? '[&>div]:bg-red-500' :
                          ws.usagePercent && ws.usagePercent >= 80 ? '[&>div]:bg-orange-500' : ''
                        )}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
