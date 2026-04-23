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
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

const DEFAULT_TYPE_COLOR = '#6366f1' // Indigo

interface TaskTypesManagerProps {
  initialTypes: TaskType[]
  v2?: boolean
}

export function TaskTypesManager({ initialTypes, v2: v2Prop }: TaskTypesManagerProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook
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

  const btnSecondaryV2 = v2
    ? 'w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold shadow-none hover:bg-[var(--paper-2)]'
    : 'w-full'
  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
  const v2FontDisplay = v2 ? { fontFamily: 'var(--font-display)' } : undefined

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
                v2={v2}
                onEdit={() => setEditingType(type)}
                onDelete={() => setDeletingType(type)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {types.length === 0 && (
        v2 ? (
          <div className="text-center py-8 flex flex-col items-center gap-2">
            <p className="mx-h3">No hay tipos de tarea.</p>
            <p className="mx-caption">Crea el primer tipo para empezar a categorizar tareas.</p>
            <p className="mx-rule-ornament">· · ·</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay tipos de tarea configurados
          </p>
        )
      )}

      {/* Add type button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowAddDialog(true)}
        className={btnSecondaryV2}
        style={v2FontSans}
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Agregar tipo
      </Button>

      {/* Add type dialog */}
      <TaskTypeFormDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        mode="create"
        v2={v2}
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
          v2={v2}
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
        <AlertDialogContent className={cn(v2 && 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]')}>
          <AlertDialogHeader>
            <AlertDialogTitle className={cn(v2 && 'text-[20px] font-bold tracking-[-0.01em]')} style={v2FontDisplay}>Eliminar tipo de tarea</AlertDialogTitle>
            <AlertDialogDescription className={cn(v2 && 'text-[13px] text-[var(--ink-2)]')} style={v2FontSans}>
              Estas seguro de eliminar el tipo &quot;{deletingType?.name}&quot;?
              Las tareas existentes con este tipo no seran afectadas, pero el tipo ya no estara disponible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className={cn(v2 && 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold hover:bg-[var(--paper-2)]')} style={v2FontSans}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteType}
              disabled={isDeleting}
              className={cn(
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                v2 && '!inline-flex !items-center !gap-1.5 !px-3 !py-1.5 !rounded-[var(--radius-3)] !border !border-[oklch(0.75_0.10_28)] !bg-[var(--paper-0)] !text-[oklch(0.38_0.14_28)] !shadow-[0_1px_0_oklch(0.75_0.10_28)] hover:!bg-[oklch(0.98_0.02_28)] !text-[13px] !font-semibold'
              )}
              style={v2FontSans}
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
  v2?: boolean
}

function SortableTypeItem({ type, onEdit, onDelete, v2 = false }: SortableTypeItemProps) {
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
        'flex items-center gap-3 p-3 border rounded-md',
        v2
          ? 'bg-[var(--paper-0)] border-[var(--border)] rounded-[var(--radius-3)] hover:bg-[var(--paper-1)]'
          : 'bg-background',
        isDragging && (v2 ? 'opacity-50 shadow-[0_2px_0_var(--ink-1)]' : 'opacity-50 shadow-lg')
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className={cn(
          'cursor-grab',
          v2 ? 'text-[var(--ink-3)] hover:text-[var(--ink-1)]' : 'hover:text-foreground text-muted-foreground'
        )}
      >
        <GripVerticalIcon className="h-5 w-5" />
      </button>

      {/* Color dot */}
      <div
        className={cn('w-4 h-4 rounded-full shrink-0', v2 && 'border border-[var(--ink-2)]')}
        style={{ backgroundColor: type.color }}
      />

      {/* Type name */}
      <span
        className={cn('font-medium flex-1', v2 && '!text-[13px] !font-semibold !text-[var(--ink-1)]')}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        {type.name}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', v2 && 'text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]')}
          onClick={onEdit}
        >
          <PencilIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-8 text-destructive hover:text-destructive',
            v2 && '!text-[oklch(0.55_0.14_28)] hover:!bg-[oklch(0.98_0.02_28)]'
          )}
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
  v2?: boolean
}

function TaskTypeFormDialog({
  open,
  onOpenChange,
  mode,
  type,
  onSuccess,
  v2 = false,
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

  const inputV2 = v2
    ? 'border border-[var(--border)] bg-[var(--paper-0)] px-[10px] py-[8px] rounded-[var(--radius-3)] text-[13px] text-[var(--ink-1)] focus-visible:outline-none focus-visible:border-[var(--ink-1)] focus-visible:shadow-[0_0_0_3px_var(--paper-3)] focus-visible:ring-0'
    : ''
  const labelV2 = v2 ? 'text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em]' : ''
  const btnPrimaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] !bg-[var(--ink-1)] !text-[var(--paper-0)] hover:!bg-[var(--ink-2)] !border !border-[var(--ink-1)] !shadow-[0_1px_0_var(--ink-1)] text-[13px] font-semibold'
    : ''
  const btnSecondaryV2 = v2
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-3)] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[13px] font-semibold shadow-none hover:bg-[var(--paper-2)]'
    : ''
  const v2FontSans = v2 ? { fontFamily: 'var(--font-sans)' } : undefined
  const v2FontDisplay = v2 ? { fontFamily: 'var(--font-display)' } : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-[400px]', v2 && 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]')}>
        <DialogHeader>
          <DialogTitle className={cn(v2 && 'text-[20px] font-bold tracking-[-0.01em]')} style={v2FontDisplay}>
            {mode === 'edit' ? 'Editar tipo de tarea' : 'Nuevo tipo de tarea'}
          </DialogTitle>
          <DialogDescription className={cn(v2 && 'text-[13px] text-[var(--ink-2)]')} style={v2FontSans}>
            {mode === 'edit'
              ? 'Modifica los datos del tipo de tarea.'
              : 'Agrega un nuevo tipo de tarea para categorizar.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              className={cn(
                'text-sm text-destructive bg-destructive/10 p-3 rounded-md',
                v2 && '!text-[13px] !text-[oklch(0.38_0.14_28)] !bg-[oklch(0.98_0.02_28)] !border !border-[oklch(0.75_0.10_28)] !rounded-[var(--radius-3)]'
              )}
              style={v2FontSans}
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="type-name" className={labelV2} style={v2FontSans}>Nombre *</Label>
            <Input
              id="type-name"
              className={inputV2}
              style={v2FontSans}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Llamada, Seguimiento, Cobro"
              disabled={isPending}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label className={labelV2} style={v2FontSans}>Color</Label>
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 transition-all',
                    color === c.value
                      ? (v2
                        ? 'border-[var(--ink-1)] ring-2 ring-offset-2 ring-[var(--ink-1)] ring-offset-[var(--paper-0)]'
                        : 'border-foreground ring-2 ring-offset-2 ring-foreground/30')
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
              <Label className={cn('text-xs text-muted-foreground', v2 && '!text-[11px] !text-[var(--ink-3)]')} style={v2FontSans}>Personalizado:</Label>
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
                className={cn('w-24 h-8 text-sm', inputV2)}
                style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
                disabled={isPending}
              />
            </div>
          </div>

          {/* Preview */}
          <div className={cn('flex items-center gap-3 pt-2 border-t', v2 && 'border-[var(--border)]')}>
            <Label className={cn('text-muted-foreground', v2 && '!text-[11px] !text-[var(--ink-3)] !uppercase !tracking-[0.08em] !font-semibold')} style={v2FontSans}>Vista previa:</Label>
            <div className="flex items-center gap-2">
              <div
                className={cn('w-4 h-4 rounded-full', v2 && 'border border-[var(--ink-2)]')}
                style={{ backgroundColor: color }}
              />
              <span className={cn('font-medium', v2 && '!text-[13px] !font-semibold !text-[var(--ink-1)]')} style={v2FontSans}>{name || 'Nombre del tipo'}</span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className={btnSecondaryV2}
              style={v2FontSans}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className={btnPrimaryV2} style={v2FontSans}>
              {mode === 'edit' ? 'Guardar cambios' : 'Crear tipo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
