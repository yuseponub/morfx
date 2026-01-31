'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LoaderIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createStage, updateStage, deleteStage } from '@/app/actions/pipelines'
import { toast } from 'sonner'
import type { PipelineStage } from '@/lib/orders/types'

// Preset colors for stages
const STAGE_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#6b7280', // gray
  '#ef4444', // red
  '#14b8a6', // teal
]

interface StageEditDialogProps {
  open: boolean
  onClose: () => void
  pipelineId: string
  stage?: PipelineStage | null // null = create mode
  mode: 'create' | 'edit' | 'delete'
}

export function StageEditDialog({
  open,
  onClose,
  pipelineId,
  stage,
  mode,
}: StageEditDialogProps) {
  const router = useRouter()
  const [isPending, setIsPending] = React.useState(false)
  const [name, setName] = React.useState(stage?.name || '')
  const [color, setColor] = React.useState(stage?.color || STAGE_COLORS[0])
  const [wipLimit, setWipLimit] = React.useState<string>(
    stage?.wip_limit?.toString() || ''
  )

  // Reset form when stage changes
  React.useEffect(() => {
    if (stage) {
      setName(stage.name)
      setColor(stage.color)
      setWipLimit(stage.wip_limit?.toString() || '')
    } else {
      setName('')
      setColor(STAGE_COLORS[0])
      setWipLimit('')
    }
  }, [stage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('El nombre es requerido')
      return
    }

    setIsPending(true)

    try {
      if (mode === 'create') {
        const result = await createStage(pipelineId, {
          name: name.trim(),
          color,
          wip_limit: wipLimit ? parseInt(wipLimit) : null,
          is_closed: false,
        })
        if ('error' in result) {
          toast.error(result.error)
        } else {
          toast.success('Etapa creada')
          router.refresh()
          onClose()
        }
      } else if (mode === 'edit' && stage) {
        const result = await updateStage(stage.id, {
          name: name.trim(),
          color,
          wip_limit: wipLimit ? parseInt(wipLimit) : null,
        })
        if ('error' in result) {
          toast.error(result.error)
        } else {
          toast.success('Etapa actualizada')
          router.refresh()
          onClose()
        }
      }
    } finally {
      setIsPending(false)
    }
  }

  const handleDelete = async () => {
    if (!stage) return

    setIsPending(true)
    try {
      const result = await deleteStage(stage.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Etapa eliminada')
        router.refresh()
        onClose()
      }
    } finally {
      setIsPending(false)
    }
  }

  if (mode === 'delete') {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar etapa</DialogTitle>
            <DialogDescription>
              ¿Estás seguro que deseas eliminar la etapa "{stage?.name}"?
              Los pedidos en esta etapa deberán moverse a otra etapa primero.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending && <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Nueva etapa' : 'Editar etapa'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Agrega una nueva etapa al pipeline'
                : 'Modifica los datos de la etapa'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: En proceso"
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {STAGE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      color === c
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wipLimit">Límite WIP (opcional)</Label>
              <Input
                id="wipLimit"
                type="number"
                min="0"
                value={wipLimit}
                onChange={(e) => setWipLimit(e.target.value)}
                placeholder="Sin límite"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Máximo de pedidos permitidos en esta etapa
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />}
              {mode === 'create' ? 'Crear' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
