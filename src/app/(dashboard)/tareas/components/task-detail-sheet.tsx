'use client'

import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TaskNotesSection } from '@/components/tasks/task-notes'
import { TaskHistoryTimeline } from '@/components/tasks/task-history'
import { PostponementBadge } from '@/components/tasks/postponement-badge'
import { getTaskNotes } from '@/app/actions/task-notes'
import { getTaskActivity } from '@/app/actions/task-activity'
import type { TaskWithDetails, TaskNoteWithUser, TaskActivityWithUser } from '@/lib/tasks/types'

interface TaskDetailSheetProps {
  task: TaskWithDetails | null
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId?: string
  isAdminOrOwner?: boolean
}

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  currentUserId,
  isAdminOrOwner = false,
}: TaskDetailSheetProps) {
  const [notes, setNotes] = React.useState<TaskNoteWithUser[]>([])
  const [activities, setActivities] = React.useState<TaskActivityWithUser[]>([])
  const [loading, setLoading] = React.useState(false)

  // Load notes and activities when task changes
  React.useEffect(() => {
    if (task && open) {
      setLoading(true)
      Promise.all([
        getTaskNotes(task.id),
        getTaskActivity(task.id),
      ]).then(([notesData, activitiesData]) => {
        setNotes(notesData)
        setActivities(activitiesData)
        setLoading(false)
      })
    }
  }, [task?.id, open])

  if (!task) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] flex flex-col h-full">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {task.title}
            <PostponementBadge count={task.postponement_count} />
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0 mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="notes">
              Notas {notes.length > 0 && `(${notes.length})`}
            </TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 overflow-y-auto">
            <TaskInfoSection task={task} />
          </TabsContent>

          <TabsContent value="notes" className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="animate-pulse space-y-4 p-4">
                <div className="h-20 bg-muted rounded" />
                <div className="h-20 bg-muted rounded" />
              </div>
            ) : (
              <TaskNotesSection
                taskId={task.id}
                initialNotes={notes}
                currentUserId={currentUserId}
                isAdminOrOwner={isAdminOrOwner}
              />
            )}
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="animate-pulse space-y-4 p-4">
                <div className="h-16 bg-muted rounded" />
                <div className="h-16 bg-muted rounded" />
              </div>
            ) : (
              <TaskHistoryTimeline activities={activities} />
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

// Helper component for task info display
function TaskInfoSection({ task }: { task: TaskWithDetails }) {
  return (
    <div className="space-y-4 p-4">
      {task.description && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Descripcion</h4>
          <p className="text-sm whitespace-pre-wrap">{task.description}</p>
        </div>
      )}
      {task.due_date && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Fecha limite</h4>
          <p className="text-sm">
            {new Date(task.due_date).toLocaleString('es-CO', {
              dateStyle: 'full',
              timeStyle: 'short',
              timeZone: 'America/Bogota',
            })}
          </p>
        </div>
      )}
      {task.task_type && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Tipo</h4>
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: task.task_type.color }}
            />
            <span className="text-sm">{task.task_type.name}</span>
          </div>
        </div>
      )}
      {task.assigned_user && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Asignado a</h4>
          <p className="text-sm">{task.assigned_user.email}</p>
        </div>
      )}
      {(task.contact || task.order || task.conversation) && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Vinculada a</h4>
          <p className="text-sm">
            {task.contact && `Contacto: ${task.contact.name}`}
            {task.order && `Pedido: $${task.order.total_value.toLocaleString()}`}
            {task.conversation && `Conversacion: ${task.conversation.phone}`}
          </p>
        </div>
      )}
      {task.status === 'completed' && task.completed_at && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Completada el</h4>
          <p className="text-sm">
            {new Date(task.completed_at).toLocaleString('es-CO', {
              dateStyle: 'full',
              timeStyle: 'short',
              timeZone: 'America/Bogota',
            })}
          </p>
        </div>
      )}
      {/* Priority display */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-1">Prioridad</h4>
        <p className="text-sm capitalize">
          {task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja'}
        </p>
      </div>
      {/* Status display */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-1">Estado</h4>
        <p className="text-sm">
          {task.status === 'completed' ? 'Completada' : 'Pendiente'}
        </p>
      </div>
    </div>
  )
}
