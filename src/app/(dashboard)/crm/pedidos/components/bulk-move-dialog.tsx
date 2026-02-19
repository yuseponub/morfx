'use client'

import * as React from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LoaderIcon } from 'lucide-react'
import type { PipelineStage } from '@/lib/orders/types'

interface BulkMoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stages: PipelineStage[]
  selectedCount: number
  onConfirm: (stageId: string) => Promise<void>
}

export function BulkMoveDialog({
  open, onOpenChange, stages, selectedCount, onConfirm,
}: BulkMoveDialogProps) {
  const [selectedStageId, setSelectedStageId] = React.useState<string>('')
  const [isMoving, setIsMoving] = React.useState(false)

  const handleConfirm = async () => {
    if (!selectedStageId) return
    setIsMoving(true)
    try {
      await onConfirm(selectedStageId)
      onOpenChange(false)
      setSelectedStageId('')
    } finally {
      setIsMoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mover {selectedCount} pedido{selectedCount > 1 ? 's' : ''}</DialogTitle>
          <DialogDescription>
            Selecciona la etapa a la que deseas mover los pedidos seleccionados.
          </DialogDescription>
        </DialogHeader>
        <Select value={selectedStageId} onValueChange={setSelectedStageId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona una etapa" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  {stage.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMoving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedStageId || isMoving}>
            {isMoving ? (
              <><LoaderIcon className="h-4 w-4 mr-2 animate-spin" />Moviendo...</>
            ) : (
              'Mover'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
