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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createTaskType, updateTaskType, deleteTaskType, reorderTaskTypes } from '@/app/actions/tasks'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { TAG_COLORS } from '@/lib/data/tag-colors'
import type { TaskType } from '@/lib/tasks/types'

const DEFAULT_TYPE_COLOR = '#6366f1' // Indigo

interface TaskTypesManagerProps {
  initialTypes: TaskType[]
}

export function TaskTypesManager({ initialTypes }: TaskTypesManagerProps) {
  // Unique ID for DndContext to prevent hydration mismatch
  const dndContextId = React.useId()

  const [types, setTypes] = React.useState<TaskType[]>(initialTypes)
  const [showAddDialog, setShowAddDialog] = React.useState(false)
  const [editingType, setEditingType] = React.useState<TaskType | null>(null)
  const [deletingType, setDeletingType] = React.useState<TaskType | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Update local types when initialTypes changes (e.g., after server action)
  React.useEffect(() => {
    setTypes(initialTypes)
  }, [initialTypes])

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
      const oldIndex = types.findIndex((t) => t.id === active.id)
      const newIndex = types.findIndex((t) => t.id === over.id)

      // Optimistic update
      const newTypes = arrayMove(types, oldIndex, newIndex)
      setTypes(newTypes)

      // Persist to server
      const typeIds = newTypes.map((t) => t.id)
      const result = await reorderTaskTypes(typeIds)

      if ('error' in result) {
        // Revert on error
        setTypes(types)
        toast.error(result.error)
      } else {
        toast.success('Orden actualizado')
      }
    }
  }

  const handleDeleteType = async () => {
    if (!deletingType) return

    setIsDeleting(true)
    const result = await deleteTaskType(deletingType.id)
    setIsDeleting(false)

    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`Tipo "${deletingType.name}" eliminado`)
      // Optimistically remove from local state
      setTypes(types.filter((t) => t.id !== deletingType.id))
    }

    setDeletingType(null)
  }

  return (
    <div className="space-y-4">
      {/* Type list with drag and drop */}
      <DndContext
        id={dndContextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={types.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {types.map((type) => (
              <SortableTypeItem
                key={type.id}
                type={type}
                onEdit={() => setEditingType(type)}
                onDelete={() => setDeletingType(type)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {types.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay tipos de tarea configurados
        </p>
      )}

      {/* Add type button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowAddDialog(true)}
        className="w-full"
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Agregar tipo
      </Button>

      {/* Add type dialog */}
      <TaskTypeFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        mode="create"
        onSuccess={(newType) => {
          setTypes([...types, newType])
        }}
      />

      {/* Edit type dialog */}
      {editingType && (
        <TaskTypeFormDialog
          open={true}
          onOpenChange={(open) => !open && setEditingType(null)}
          mode="edit"
          type={editingType}
          onSuccess={(updatedType) => {
            setTypes(types.map((t) => t.id === updatedType.id ? updatedType : t))
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deletingType}
        onOpenChange={(open) => !open && setDeletingType(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tipo de tarea</AlertDialogTitle>
            <AlertDialogDescription>
              Estas seguro de eliminar el tipo &quot;{deletingType?.name}&quot;?
              Las tareas existentes con este tipo no seran afectadas, pero el tipo ya no estara disponible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteType}
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

// Sortable type item component
interface SortableTypeItemProps {
  type: TaskType
  onEdit: () => void
  onDelete: () => void
}

function SortableTypeItem({ type, onEdit, onDelete }: SortableTypeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: type.id })

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
        style={{ backgroundColor: type.color }}
      />

      {/* Type name */}
      <span className="font-medium flex-1">{type.name}</span>

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

// Task type form dialog
interface TaskTypeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  type?: TaskType
  onSuccess: (type: TaskType) => void
}

function TaskTypeFormDialog({
  open,
  onOpenChange,
  mode,
  type,
  onSuccess,
}: TaskTypeFormDialogProps) {
  const [name, setName] = React.useState(type?.name || '')
  const [color, setColor] = React.useState(type?.color || DEFAULT_TYPE_COLOR)
  const [isPending, setIsPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setName(type?.name || '')
      setColor(type?.color || DEFAULT_TYPE_COLOR)
      setError(null)
    }
  }, [open, type])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('El nombre es requerido')
      return
    }

    setIsPending(true)
    setError(null)

    const result =
      mode === 'edit' && type
        ? await updateTaskType(type.id, { name: name.trim(), color })
        : await createTaskType({ name: name.trim(), color })

    setIsPending(false)

    if ('error' in result) {
      setError(result.error)
    } else {
      toast.success(
        mode === 'edit'
          ? `Tipo "${name}" actualizado`
          : `Tipo "${name}" creado`
      )
      onSuccess(result.data)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Editar tipo de tarea' : 'Nuevo tipo de tarea'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Modifica los datos del tipo de tarea.'
              : 'Agrega un nuevo tipo de tarea para categorizar.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="type-name">Nombre *</Label>
            <Input
              id="type-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Llamada, Seguimiento, Cobro"
              disabled={isPending}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((c) => (
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
                value={!TAG_COLORS.some((c) => c.value === color) ? color : ''}
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

          {/* Preview */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <Label className="text-muted-foreground">Vista previa:</Label>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="font-medium">{name || 'Nombre del tipo'}</span>
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
              {mode === 'edit' ? 'Guardar cambios' : 'Crear tipo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
