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
import { ChevronDownIcon, ChevronRightIcon, GripVerticalIcon, PlusIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { deletePipeline, updatePipelineOrder } from '@/app/actions/pipelines'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { PipelineWithStages } from '@/lib/orders/types'
import { PipelineForm } from './pipeline-form'
import { StageManager } from './stage-manager'

interface PipelineListProps {
  pipelines: PipelineWithStages[]
}

export function PipelineList({ pipelines: initialPipelines }: PipelineListProps) {
  const dndContextId = React.useId()

  const [pipelines, setPipelines] = React.useState(initialPipelines)
  // Allow multiple pipelines to be expanded at once
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(
    () => new Set(initialPipelines.length > 0 ? [initialPipelines[0].id] : [])
  )
  const [showCreateForm, setShowCreateForm] = React.useState(false)
  const [editingPipeline, setEditingPipeline] = React.useState<PipelineWithStages | null>(null)
  const [deletingPipeline, setDeletingPipeline] = React.useState<PipelineWithStages | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Sync with server data
  React.useEffect(() => {
    setPipelines(initialPipelines)
  }, [initialPipelines])

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
      const oldIndex = pipelines.findIndex((p) => p.id === active.id)
      const newIndex = pipelines.findIndex((p) => p.id === over.id)

      // Optimistic update
      const newPipelines = arrayMove(pipelines, oldIndex, newIndex)
      setPipelines(newPipelines)

      // Persist to server
      const pipelineIds = newPipelines.map((p) => p.id)
      const result = await updatePipelineOrder(pipelineIds)

      if ('error' in result) {
        // Revert on error
        setPipelines(pipelines)
        toast.error(result.error)
      } else {
        toast.success('Orden de pipelines actualizado')
      }
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleDelete = async () => {
    if (!deletingPipeline) return

    setIsDeleting(true)
    const result = await deletePipeline(deletingPipeline.id)
    setIsDeleting(false)

    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`Pipeline "${deletingPipeline.name}" eliminado`)
    }

    setDeletingPipeline(null)
  }

  return (
    <div className="space-y-4">
      {/* New pipeline button */}
      <div className="flex justify-end">
        <Button onClick={() => setShowCreateForm(true)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Nuevo Pipeline
        </Button>
      </div>

      {/* Pipeline cards with drag and drop */}
      <DndContext
        id={dndContextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={pipelines.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {pipelines.map((pipeline) => (
              <SortablePipelineCard
                key={pipeline.id}
                pipeline={pipeline}
                isExpanded={expandedIds.has(pipeline.id)}
                onToggleExpand={() => toggleExpanded(pipeline.id)}
                onEdit={() => setEditingPipeline(pipeline)}
                onDelete={() => setDeletingPipeline(pipeline)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {pipelines.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground mb-4">
              No hay pipelines configurados
            </p>
            <Button variant="outline" onClick={() => setShowCreateForm(true)}>
              Crear primer pipeline
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create pipeline dialog */}
      <PipelineForm
        open={showCreateForm}
        onOpenChange={setShowCreateForm}
        mode="create"
      />

      {/* Edit pipeline dialog */}
      {editingPipeline && (
        <PipelineForm
          open={true}
          onOpenChange={(open) => !open && setEditingPipeline(null)}
          mode="edit"
          pipeline={editingPipeline}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deletingPipeline} onOpenChange={(open) => !open && setDeletingPipeline(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar pipeline</AlertDialogTitle>
            <AlertDialogDescription>
              Estas seguro de eliminar el pipeline &quot;{deletingPipeline?.name}&quot;?
              Esta accion eliminara tambien todas sus etapas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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

// Sortable pipeline card component
interface SortablePipelineCardProps {
  pipeline: PipelineWithStages
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
}

function SortablePipelineCard({
  pipeline,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: SortablePipelineCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pipeline.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn('py-0', isDragging && 'opacity-50 shadow-lg z-50')}
    >
      {/* Pipeline header - clickable to expand */}
      <CardHeader
        className={cn(
          'cursor-pointer hover:bg-muted/50 transition-colors py-4',
          isExpanded && 'border-b'
        )}
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Drag handle */}
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab hover:text-foreground text-muted-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVerticalIcon className="h-5 w-5" />
            </button>

            {isExpanded ? (
              <ChevronDownIcon className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{pipeline.name}</CardTitle>
                {pipeline.is_default && (
                  <Badge variant="secondary">Por defecto</Badge>
                )}
              </div>
              {pipeline.description && (
                <CardDescription className="mt-1">
                  {pipeline.description}
                </CardDescription>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                {pipeline.stages.length} etapas
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
            >
              <PencilIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              disabled={pipeline.is_default}
              title={pipeline.is_default ? 'No se puede eliminar el pipeline por defecto' : 'Eliminar pipeline'}
            >
              <Trash2Icon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Expanded content - Stage manager */}
      {isExpanded && (
        <CardContent className="py-4">
          <StageManager pipeline={pipeline} />
        </CardContent>
      )}
    </Card>
  )
}
