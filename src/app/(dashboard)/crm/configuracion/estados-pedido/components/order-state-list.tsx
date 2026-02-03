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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { updateOrderStateOrder, deleteOrderState } from '@/app/actions/order-states'
import { OrderStateForm } from './order-state-form'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { OrderStateWithStages, PipelineWithStages } from '@/lib/orders/types'

interface OrderStateListProps {
  states: OrderStateWithStages[]
  pipelines: PipelineWithStages[]
}

export function OrderStateList({ states, pipelines }: OrderStateListProps) {
  // Unique ID for DndContext to prevent hydration mismatch
  const dndContextId = React.useId()

  const [localStates, setLocalStates] = React.useState<OrderStateWithStages[]>(states)
  const [showAddDialog, setShowAddDialog] = React.useState(false)
  const [editingState, setEditingState] = React.useState<OrderStateWithStages | null>(null)
  const [deletingState, setDeletingState] = React.useState<OrderStateWithStages | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Update local states when props change (e.g., after server action)
  React.useEffect(() => {
    setLocalStates(states)
  }, [states])

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
      const oldIndex = localStates.findIndex((s) => s.id === active.id)
      const newIndex = localStates.findIndex((s) => s.id === over.id)

      // Optimistic update
      const newStates = arrayMove(localStates, oldIndex, newIndex)
      setLocalStates(newStates)

      // Persist to server
      const stateIds = newStates.map((s) => s.id)
      const result = await updateOrderStateOrder(stateIds)

      if ('error' in result) {
        // Revert on error
        setLocalStates(localStates)
        toast.error(result.error)
      } else {
        toast.success('Orden actualizado')
      }
    }
  }

  const handleDeleteState = async () => {
    if (!deletingState) return

    setIsDeleting(true)
    const result = await deleteOrderState(deletingState.id)
    setIsDeleting(false)

    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`Estado "${deletingState.name}" eliminado`)
      // Optimistically remove from local state
      setLocalStates(localStates.filter((s) => s.id !== deletingState.id))
    }

    setDeletingState(null)
  }

  return (
    <div className="space-y-4">
      {/* State list with drag and drop */}
      <DndContext
        id={dndContextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={localStates.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {localStates.map((state) => (
              <SortableStateItem
                key={state.id}
                state={state}
                onEdit={() => setEditingState(state)}
                onDelete={() => setDeletingState(state)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {localStates.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay estados configurados
        </p>
      )}

      {/* Add state button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowAddDialog(true)}
        className="w-full"
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Agregar estado
      </Button>

      {/* Add state dialog */}
      <OrderStateForm
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        mode="create"
        pipelines={pipelines}
      />

      {/* Edit state dialog */}
      {editingState && (
        <OrderStateForm
          open={true}
          onOpenChange={(open) => !open && setEditingState(null)}
          mode="edit"
          state={editingState}
          pipelines={pipelines}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deletingState}
        onOpenChange={(open) => !open && setDeletingState(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar estado</AlertDialogTitle>
            <AlertDialogDescription>
              Estas seguro de eliminar el estado &quot;{deletingState?.name}&quot;?
              Las etapas asignadas quedaran sin estado. Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteState}
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

// Sortable state item component
interface SortableStateItemProps {
  state: OrderStateWithStages
  onEdit: () => void
  onDelete: () => void
}

function SortableStateItem({ state, onEdit, onDelete }: SortableStateItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: state.id })

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

      {/* Emoji */}
      <span className="text-2xl">{state.emoji}</span>

      {/* State name */}
      <span className="font-medium flex-1">{state.name}</span>

      {/* Stage count badge */}
      {state.stages.length > 0 && (
        <Badge variant="secondary" className="text-xs">
          {state.stages.length} etapa{state.stages.length !== 1 ? 's' : ''}
        </Badge>
      )}

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
