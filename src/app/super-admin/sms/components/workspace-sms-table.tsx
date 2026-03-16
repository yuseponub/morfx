'use client'

import { useState, useTransition } from 'react'
import { WorkspaceSMSRow, toggleWorkspaceSMS } from '@/app/actions/sms-admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RechargeDialog } from './recharge-dialog'
import { toast } from 'sonner'

const copFormat = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

interface Props {
  workspaces: WorkspaceSMSRow[]
}

export function WorkspaceSmsTable({ workspaces }: Props) {
  const [rechargeTarget, setRechargeTarget] = useState<WorkspaceSMSRow | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleToggle(ws: WorkspaceSMSRow) {
    const newActive = ws.isActive !== true
    setTogglingId(ws.workspaceId)

    startTransition(async () => {
      const result = await toggleWorkspaceSMS(ws.workspaceId, newActive)
      setTogglingId(null)
      if (result.success) {
        toast.success(`SMS ${newActive ? 'activado' : 'desactivado'} para ${ws.workspaceName}`)
      } else {
        toast.error(result.error || 'Error al cambiar estado')
      }
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspaces</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">SMS Enviados</TableHead>
                <TableHead className="text-right">Creditos Usados</TableHead>
                <TableHead>Saldo Negativo</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No hay workspaces registrados
                  </TableCell>
                </TableRow>
              ) : (
                workspaces.map((ws) => (
                  <TableRow key={ws.workspaceId}>
                    <TableCell className="font-medium">{ws.workspaceName}</TableCell>
                    <TableCell>
                      {ws.isActive === null ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          No configurado
                        </Badge>
                      ) : ws.isActive ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          'font-mono',
                          ws.balanceCop > 5000
                            ? 'text-green-600'
                            : ws.balanceCop >= 1000
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        )}
                      >
                        {copFormat.format(ws.balanceCop)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{ws.totalSmsSent.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {copFormat.format(ws.totalCreditsUsed)}
                    </TableCell>
                    <TableCell>
                      {ws.isActive === null ? (
                        <span className="text-muted-foreground text-sm">-</span>
                      ) : ws.allowNegativeBalance ? (
                        <Badge variant="outline" className="text-green-700 border-green-200">
                          Permitido
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-700 border-red-200">
                          Bloqueado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRechargeTarget(ws)}
                        >
                          Recargar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={togglingId === ws.workspaceId && isPending}
                          onClick={() => handleToggle(ws)}
                        >
                          {togglingId === ws.workspaceId && isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : ws.isActive ? (
                            'Desactivar'
                          ) : (
                            'Activar'
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {rechargeTarget && (
        <RechargeDialog
          workspace={rechargeTarget}
          open={!!rechargeTarget}
          onClose={() => setRechargeTarget(null)}
        />
      )}
    </>
  )
}
