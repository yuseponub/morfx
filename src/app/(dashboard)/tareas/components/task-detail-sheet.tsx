'use client'

import * as React from 'react'
import { ChevronRightIcon, XIcon } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { TaskNotesSection } from '@/components/tasks/task-notes'
import { TaskHistoryTimeline } from '@/components/tasks/task-history'
import { PostponementBadge } from '@/components/tasks/postponement-badge'
import { getTaskNotes } from '@/app/actions/task-notes'
import { getTaskActivity } from '@/app/actions/task-activity'
import { cn } from '@/lib/utils'
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
  const v2 = useDashboardV2()

  const [notes, setNotes] = React.useState<TaskNoteWithUser[]>([])
  const [activities, setActivities] = React.useState<TaskActivityWithUser[]>([])
  const [loading, setLoading] = React.useState(false)

  // Portal target for D-DASH-10 — re-root into `.theme-editorial` scope when v2.
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!v2) return
    const target = document.querySelector<HTMLElement>('.theme-editorial')
    setPortalTarget(target)
  }, [v2])

  // Load notes and activities when task changes (Regla 6 — PRESERVED unchanged)
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
      <SheetContent
        portalContainer={v2 ? portalTarget ?? undefined : undefined}
        className={cn(
          'flex flex-col h-full',
          v2
            ? 'sm:max-w-[600px] p-0 bg-[var(--paper-1)] border-l border-[var(--ink-1)]'
            : 'sm:max-w-[600px]'
        )}
      >
        {v2 ? (
          // Editorial dp-hd (mock tareas.html lines 155-163)
          <div className="bg-[var(--paper-0)] border-b border-[var(--ink-1)] px-5 py-4">
            <div
              className="flex items-center gap-2 mb-1.5 text-[11px] text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              <span>T-{task.id.slice(0, 4).toUpperCase()}</span>
              <span>·</span>
              <span>{task.task_type?.name ?? 'Tarea'}</span>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="ml-auto bg-transparent border-0 cursor-pointer text-[var(--ink-3)] hover:text-[var(--ink-1)] p-0"
                aria-label="Cerrar"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <h2
              className="text-[22px] font-bold tracking-[-0.01em] leading-[1.2] text-[var(--ink-1)] flex items-center gap-2 m-0"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {task.title}
              <PostponementBadge count={task.postponement_count} />
            </h2>
            {task.description && (
              <p
                className="mt-1.5 text-[13px] italic text-[var(--ink-2)] leading-[1.5]"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {task.description}
              </p>
            )}
          </div>
        ) : (
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {task.title}
              <PostponementBadge count={task.postponement_count} />
            </SheetTitle>
          </SheetHeader>
        )}

        {v2 ? (
          <div className="flex-1 overflow-y-auto">
            <EditorialMetaGrid task={task} />

            <details open className="border-b border-[var(--border)]">
              <summary
                className="list-none cursor-pointer px-5 py-3 flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-1)] hover:bg-[var(--paper-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <ChevronRightIcon className="h-3 w-3 text-[var(--rubric-2)] transition-transform" />
                <span className="flex-1">Notas</span>
                <span
                  className="text-[10px] text-[var(--ink-3)] font-medium normal-case tracking-normal"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {notes.length}
                </span>
              </summary>
              <div className="px-5 pb-4">
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-16 bg-[var(--paper-2)] border border-[var(--border)]" />
                  </div>
                ) : (
                  <TaskNotesSection
                    taskId={task.id}
                    initialNotes={notes}
                    currentUserId={currentUserId}
                    isAdminOrOwner={isAdminOrOwner}
                  />
                )}
              </div>
            </details>

            <details open className="border-b border-[var(--border)]">
              <summary
                className="list-none cursor-pointer px-5 py-3 flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-1)] hover:bg-[var(--paper-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <ChevronRightIcon className="h-3 w-3 text-[var(--rubric-2)] transition-transform" />
                <span className="flex-1">Historial</span>
                <span
                  className="text-[10px] text-[var(--ink-3)] font-medium normal-case tracking-normal"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {activities.length}
                </span>
              </summary>
              <div className="px-5 pb-4">
                {loading ? (
                  <div className="h-16 bg-[var(--paper-2)] border border-[var(--border)]" />
                ) : (
                  <TaskHistoryTimeline activities={activities} />
                )}
              </div>
            </details>
          </div>
        ) : (
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
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * Editorial meta grid — mock tareas.html lines 170-179 (dp-meta-grid)
 * 2-col grid with cells bordered (right-of-even 0, last-row bottom 0).
 */
function EditorialMetaGrid({ task }: { task: TaskWithDetails }) {
  const cells: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: 'Estado',
      value: task.status === 'completed' ? 'Completada' : 'Pendiente',
    },
    {
      label: 'Prioridad',
      value:
        task.priority === 'high'
          ? 'Alta'
          : task.priority === 'medium'
          ? 'Media'
          : 'Baja',
    },
    {
      label: 'Fecha limite',
      value: task.due_date
        ? new Date(task.due_date).toLocaleString('es-CO', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'America/Bogota',
          })
        : '—',
    },
    {
      label: 'Asignado',
      value: task.assigned_user?.email.split('@')[0] ?? 'Sin asignar',
    },
    {
      label: 'Tipo',
      value: task.task_type?.name ?? 'General',
    },
    {
      label: 'Vinculada',
      value: task.contact?.name
        ? `Contacto: ${task.contact.name}`
        : task.order
        ? `Pedido #${task.id.slice(0, 6).toUpperCase()}`
        : task.conversation?.phone ?? '—',
    },
  ]

  return (
    <div className="grid grid-cols-2 border-b border-[var(--border)]">
      {cells.map((c, i) => {
        const isRightCol = i % 2 === 1
        const isLastRow = i >= cells.length - 2
        return (
          <div
            key={c.label}
            className={cn(
              'px-5 py-2.5',
              !isRightCol && 'border-r border-[var(--border)]',
              !isLastRow && 'border-b border-[var(--border)]'
            )}
          >
            <div
              className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {c.label}
            </div>
            <div
              className="text-[13px] font-medium text-[var(--ink-1)] mt-1 flex items-center gap-1.5"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {c.value}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Helper component for task info display (legacy non-v2 path — preserved verbatim)
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
