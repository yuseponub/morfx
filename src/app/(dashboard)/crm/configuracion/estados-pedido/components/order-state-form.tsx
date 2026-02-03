'use client'

import * as React from 'react'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { createOrderState, updateOrderState, assignStagesToState } from '@/app/actions/order-states'
import { EmojiPicker } from '@/app/(dashboard)/whatsapp/components/emoji-picker'
import { AvatarPreview } from './avatar-preview'
import { StageAssignment } from './stage-assignment'
import { toast } from 'sonner'
import type { OrderStateWithStages, PipelineWithStages } from '@/lib/orders/types'

interface OrderStateFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  state?: OrderStateWithStages
  pipelines: PipelineWithStages[]
}

export function OrderStateForm({
  open,
  onOpenChange,
  mode,
  state,
  pipelines,
}: OrderStateFormProps) {
  const [name, setName] = React.useState(state?.name || '')
  const [emoji, setEmoji] = React.useState(state?.emoji || '')
  const [assignedStageIds, setAssignedStageIds] = React.useState<string[]>(
    state?.stages.map((s) => s.id) || []
  )
  const [isPending, setIsPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [emojiPickerOpen, setEmojiPickerOpen] = React.useState(false)

  // Track initial stage IDs for comparison
  const initialStageIds = React.useRef<string[]>(state?.stages.map((s) => s.id) || [])

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setName(state?.name || '')
      setEmoji(state?.emoji || '')
      setAssignedStageIds(state?.stages.map((s) => s.id) || [])
      initialStageIds.current = state?.stages.map((s) => s.id) || []
      setError(null)
    }
  }, [open, state])

  const handleEmojiSelect = (selectedEmoji: string) => {
    setEmoji(selectedEmoji)
    setEmojiPickerOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!name.trim()) {
      setError('El nombre es requerido')
      return
    }

    if (!emoji) {
      setError('El emoji es requerido')
      return
    }

    setIsPending(true)
    setError(null)

    try {
      if (mode === 'create') {
        // Create new state
        const result = await createOrderState({ name: name.trim(), emoji })

        if ('error' in result) {
          setError(result.error)
          setIsPending(false)
          return
        }

        // Assign stages if any selected
        if (assignedStageIds.length > 0) {
          await assignStagesToState(result.data.id, assignedStageIds)
        }

        toast.success(`Estado "${name}" creado`)
      } else {
        // Update existing state
        if (!state) return

        const result = await updateOrderState(state.id, { name: name.trim(), emoji })

        if ('error' in result) {
          setError(result.error)
          setIsPending(false)
          return
        }

        // Check if stage assignments changed
        const stageIdsChanged =
          assignedStageIds.length !== initialStageIds.current.length ||
          !assignedStageIds.every((id) => initialStageIds.current.includes(id))

        if (stageIdsChanged) {
          await assignStagesToState(state.id, assignedStageIds)
        }

        toast.success(`Estado "${name}" actualizado`)
      }

      setIsPending(false)
      onOpenChange(false)
    } catch (err) {
      setError('Ocurrio un error inesperado')
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Editar estado' : 'Nuevo estado'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Modifica los datos del estado de pedido.'
              : 'Crea un nuevo estado de pedido con nombre y emoji.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="state-name">Nombre *</Label>
            <Input
              id="state-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Nuevo, En Proceso, Enviado"
              disabled={isPending}
              maxLength={50}
            />
          </div>

          {/* Emoji picker */}
          <div className="space-y-2">
            <Label>Emoji *</Label>
            <div className="flex items-center gap-3">
              <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-16 h-16 text-3xl"
                    disabled={isPending}
                  >
                    {emoji || '+'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <EmojiPicker onSelect={handleEmojiSelect} />
                </PopoverContent>
              </Popover>
              <span className="text-sm text-muted-foreground">
                Haz clic para seleccionar un emoji
              </span>
            </div>
          </div>

          {/* Avatar preview */}
          <AvatarPreview emoji={emoji} />

          {/* Stage assignment - show in both create and edit mode */}
          <div className="space-y-2">
            <Label>Etapas asignadas</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Selecciona las etapas del pipeline que pertenecen a este estado.
              Los pedidos en estas etapas mostraran el emoji como indicador.
            </p>
            <StageAssignment
              pipelines={pipelines}
              currentStateId={state?.id}
              assignedStageIds={assignedStageIds}
              onAssignmentChange={setAssignedStageIds}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {mode === 'edit' ? 'Guardar cambios' : 'Crear estado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
