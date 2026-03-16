'use client'

import { useState, useTransition } from 'react'
import { WorkspaceSMSRow, rechargeWorkspaceBalance } from '@/app/actions/sms-admin'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

const copFormat = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

interface Props {
  workspace: WorkspaceSMSRow
  open: boolean
  onClose: () => void
}

export function RechargeDialog({ workspace, open, onClose }: Props) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ newBalance: number } | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Ingresa un monto valido mayor a 0')
      return
    }

    startTransition(async () => {
      const res = await rechargeWorkspaceBalance(
        workspace.workspaceId,
        numAmount,
        description || undefined
      )

      if (res.success && res.newBalance !== undefined) {
        setResult({ newBalance: res.newBalance })
        toast.success(`Recarga exitosa: ${copFormat.format(numAmount)}`)
      } else {
        toast.error(res.error || 'Error al recargar')
      }
    })
  }

  function handleClose() {
    setAmount('')
    setDescription('')
    setResult(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recargar SMS - {workspace.workspaceName}</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg font-medium">Recarga exitosa</p>
            <p className="text-muted-foreground">
              Nuevo saldo: <span className="font-bold text-foreground">{copFormat.format(result.newBalance)}</span>
            </p>
            <Button onClick={handleClose} className="mt-4">
              Cerrar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Saldo actual: <span className="font-medium">{copFormat.format(workspace.balanceCop)}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Monto (COP)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="1"
                placeholder="Ej: 50000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripcion (opcional)</Label>
              <Input
                id="description"
                placeholder="Ej: Recarga mensual marzo"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isPending}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || !amount}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Recargando...
                  </>
                ) : (
                  'Recargar'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
