'use client'

import * as React from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVerticalIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  CheckIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createStage, updateStage, updateStageOrder, deleteStage } from '@/app/actions/pipelines'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getContrastColor } from '@/lib/data/tag-colors'
import type { PipelineWithStages, PipelineStage } from '@/lib/orders/types'

// Stage colors palette
const STAGE_COLORS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violeta', value: '#8b5cf6' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Ambar', value: '#f59e0b' },
  { name: 'Esmeralda', value: '#10b981' },
  { name: 'Cian', value: '#06b6d4' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Gris', value: '#6b7280' },
]

const DEFAULT_STAGE_COLOR = '#6366f1'

interface StageManagerProps {
  pipeline: PipelineWithStages
}

export function StageManager({ pipeline }: StageManagerProps) {
  // Unique ID for DndContext to prevent hydration mismatch
  const dndContextId = React.useId()

  const [stages, setStages] = React.useState<PipelineStage[]>(pipeline.stages)
  const [showAddDialog, setShowAddDialog] = React.useState(false)
  const [editingStage, setEditingStage] = React.useState<PipelineStage | null>(null)
  const [deletingStage, setDeletingStage] = React.useState<PipelineStage | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Update local stages when pipeline.stages changes (e.g., after server action)
  React.useEffect(() => {
    setStages(pipeline.stages)
  }, [pipeline.stages])

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = stages.findIndex((s) => s.id === active.id)
      const newIndex = stages.findIndex((s) => s.id === over.id)

      // Optimistic update
      const newStages = arrayMove(stages, oldIndex, newIndex)
      setStages(newStages)

      // Persist to server
      const stageIds = newStages.map((s) => s.id)
      const result = await updateStageOrder(pipeline.id, stageIds)

      if ('error' in result) {
        // Revert on error
        setStages(stages)
        toast.error(result.error)
      } else {
        toast.success('Orden actualizado')
      }
    }
  }

  const handleDeleteStage = async () => {
    if (!deletingStage) return

    setIsDeleting(true)
    const result = await deleteStage(deletingStage.id)
    setIsDeleting(false)

    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`Etapa "${deletingStage.name}" eliminada`)
      // Optimistically remove from local state
      setStages(stages.filter((s) => s.id !== deletingStage.id))
    }

    setDeletingStage(null)
  }

  return (
    <div className="space-y-4">
      {/* Stage list with drag and drop */}
      <DndContext
        id={dndContextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={stages.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {stages.map((stage) => (
              <SortableStageItem
                key={stage.id}
                stage={stage}
                onEdit={() => setEditingStage(stage)}
                onDelete={() => setDeletingStage(stage)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {stages.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay etapas configuradas
        </p>
      )}

      {/* Add stage button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowAddDialog(true)}
        className="w-full"
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Agregar etapa
      </Button>

      {/* Add stage dialog */}
      <StageFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        pipelineId={pipeline.id}
        mode="create"
      />

      {/* Edit stage dialog */}
      {editingStage && (
        <StageFormDialog
          open={true}
          onOpenChange={(open) => !open && setEditingStage(null)}
          pipelineId={pipeline.id}
          mode="edit"
          stage={editingStage}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deletingStage}
        onOpenChange={(open) => !open && setDeletingStage(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar etapa</AlertDialogTitle>
            <AlertDialogDescription>
              Estas seguro de eliminar la etapa &quot;{deletingStage?.name}&quot;?
              Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStage}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Sortable stage item component
interface SortableStageItemProps {
  stage: PipelineStage
  onEdit: () => void
  onDelete: () => void
}

function SortableStageItem({ stage, onEdit, onDelete }: SortableStageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 bg-background border rounded-md',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab hover:text-foreground text-muted-foreground"
      >
        <GripVerticalIcon className="h-5 w-5" />
      </button>

      {/* Color dot */}
      <div
        className="w-4 h-4 rounded-full shrink-0"
        style={{ backgroundColor: stage.color }}
      />

      {/* Stage name */}
      <span className="font-medium flex-1">{stage.name}</span>

      {/* Badges */}
      <div className="flex items-center gap-2">
        {stage.wip_limit && (
          <Badge variant="outline" className="text-xs">
            WIP: {stage.wip_limit}
          </Badge>
        )}
        {stage.is_closed && (
          <Badge variant="secondary" className="text-xs">
            Cerrado
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
          <PencilIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// Stage form dialog
interface StageFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipelineId: string
  mode: 'create' | 'edit'
  stage?: PipelineStage
}

function StageFormDialog({
  open,
  onOpenChange,
  pipelineId,
  mode,
  stage,
}: StageFormDialogProps) {
  const [name, setName] = React.useState(stage?.name || '')
  const [color, setColor] = React.useState(stage?.color || DEFAULT_STAGE_COLOR)
  const [wipLimit, setWipLimit] = React.useState<string>(
    stage?.wip_limit?.toString() || ''
  )
  const [isClosed, setIsClosed] = React.useState(stage?.is_closed || false)
  const [isPending, setIsPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setName(stage?.name || '')
      setColor(stage?.color || DEFAULT_STAGE_COLOR)
      setWipLimit(stage?.wip_limit?.toString() || '')
      setIsClosed(stage?.is_closed || false)
      setError(null)
    }
  }, [open, stage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('El nombre es requerido')
      return
    }

    setIsPending(true)
    setError(null)

    const formData = {
      name: name.trim(),
      color,
      wip_limit: wipLimit ? parseInt(wipLimit, 10) : null,
      is_closed: isClosed,
    }

    const result =
      mode === 'edit' && stage
        ? await updateStage(stage.id, formData)
        : await createStage(pipelineId, formData)

    setIsPending(false)

    if ('error' in result) {
      setError(result.error)
    } else {
      toast.success(
        mode === 'edit'
          ? `Etapa "${name}" actualizada`
          : `Etapa "${name}" creada`
      )
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Editar etapa' : 'Nueva etapa'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Modifica los datos de la etapa.'
              : 'Agrega una nueva etapa al pipeline.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="stage-name">Nombre *</Label>
            <Input
              id="stage-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: En Proceso, Enviado"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-all',
                    color === c.value
                      ? 'border-foreground ring-2 ring-offset-2 ring-foreground/30'
                      : 'border-transparent hover:scale-110'
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                  disabled={isPending}
                />
              ))}
            </div>
            {/* Custom color input */}
            <div className="flex items-center gap-2 mt-2">
              <Label className="text-xs text-muted-foreground">Personalizado:</Label>
              <Input
                type="text"
                placeholder="#hex"
                value={!STAGE_COLORS.some((c) => c.value === color) ? color : ''}
                onChange={(e) => {
                  const hex = e.target.value
                  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                    setColor(hex)
                  }
                }}
                className="w-24 h-8 text-sm"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wip-limit">Limite WIP (opcional)</Label>
            <Input
              id="wip-limit"
              type="number"
              min="1"
              value={wipLimit}
              onChange={(e) => setWipLimit(e.target.value)}
              placeholder="Sin limite"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Maximo de pedidos permitidos en esta etapa
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-closed"
              checked={isClosed}
              onCheckedChange={(checked) => setIsClosed(!!checked)}
              disabled={isPending}
            />
            <Label htmlFor="is-closed" className="cursor-pointer">
              Etapa cerrada (ganado/perdido)
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Las etapas cerradas se usan para pedidos finalizados
          </p>

          {/* Preview */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <Label className="text-muted-foreground">Vista previa:</Label>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="font-medium">{name || 'Nombre de etapa'}</span>
              {wipLimit && (
                <Badge variant="outline" className="text-xs">
                  WIP: {wipLimit}
                </Badge>
              )}
              {isClosed && (
                <Badge variant="secondary" className="text-xs">
                  Cerrado
                </Badge>
              )}
            </div>
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
              {mode === 'edit' ? 'Guardar cambios' : 'Crear etapa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
