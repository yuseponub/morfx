'use client'

import * as React from 'react'
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, PencilIcon, Trash2Icon } from 'lucide-react'
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
import { deletePipeline } from '@/app/actions/pipelines'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { PipelineWithStages } from '@/lib/orders/types'
import { PipelineForm } from './pipeline-form'
import { StageManager } from './stage-manager'

interface PipelineListProps {
  pipelines: PipelineWithStages[]
}

export function PipelineList({ pipelines }: PipelineListProps) {
  // Allow multiple pipelines to be expanded at once
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(
    () => new Set(pipelines.length > 0 ? [pipelines[0].id] : [])
  )
  const [showCreateForm, setShowCreateForm] = React.useState(false)
  const [editingPipeline, setEditingPipeline] = React.useState<PipelineWithStages | null>(null)
  const [deletingPipeline, setDeletingPipeline] = React.useState<PipelineWithStages | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

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

      {/* Pipeline cards */}
      <div className="space-y-4">
        {pipelines.map((pipeline) => (
          <Card key={pipeline.id} className="py-0">
            {/* Pipeline header - clickable to expand */}
            <CardHeader
              className={cn(
                'cursor-pointer hover:bg-muted/50 transition-colors py-4',
                expandedIds.has(pipeline.id) && 'border-b'
              )}
              onClick={() => toggleExpanded(pipeline.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {expandedIds.has(pipeline.id) ? (
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
                    onClick={() => setEditingPipeline(pipeline)}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingPipeline(pipeline)}
                    disabled={pipeline.is_default}
                    title={pipeline.is_default ? 'No se puede eliminar el pipeline por defecto' : 'Eliminar pipeline'}
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {/* Expanded content - Stage manager */}
            {expandedIds.has(pipeline.id) && (
              <CardContent className="py-4">
                <StageManager pipeline={pipeline} />
              </CardContent>
            )}
          </Card>
        ))}
      </div>

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
