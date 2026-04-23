'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusIcon,
  CheckCircleIcon,
  ListTodoIcon,
  Columns3Icon,
  ListIcon,
} from 'lucide-react'
import { isToday, isPast, isTomorrow, isThisWeek, parseISO, startOfDay } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { TaskFiltersBar } from './task-filters'
import { TaskForm } from './task-form'
import { TaskItem } from '@/components/tasks/task-item'
import { TaskDetailSheet } from './task-detail-sheet'
import { TaskKanban } from './task-kanban'
import { TaskRow } from './task-row'
import { deleteTask } from '@/app/actions/tasks'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { TaskWithDetails, TaskType, TaskFilters } from '@/lib/tasks/types'
import type { MemberWithUser } from '@/lib/types/database'

interface TaskListProps {
  initialTasks: TaskWithDetails[]
  taskTypes: TaskType[]
  members: MemberWithUser[]
  dashV2?: boolean
}

type TaskGroup = {
  id: string
  title: string
  tasks: TaskWithDetails[]
  className?: string
}

/**
 * Group tasks by due date proximity
 */
function groupTasks(tasks: TaskWithDetails[]): TaskGroup[] {
  const groups: TaskGroup[] = [
    { id: 'overdue', title: 'Vencidas', tasks: [], className: 'text-destructive' },
    { id: 'today', title: 'Hoy', tasks: [], className: 'text-yellow-600 dark:text-yellow-400' },
    { id: 'tomorrow', title: 'Manana', tasks: [] },
    { id: 'week', title: 'Esta semana', tasks: [] },
    { id: 'upcoming', title: 'Proximas', tasks: [] },
    { id: 'no-date', title: 'Sin fecha', tasks: [], className: 'text-muted-foreground' },
  ]

  const now = new Date()
  const todayStart = startOfDay(now)

  for (const task of tasks) {
    // Completed tasks go to their original group but won't be shown in overdue
    if (!task.due_date) {
      groups[5].tasks.push(task) // no-date
      continue
    }

    const dueDate = parseISO(task.due_date)
    const dueDateStart = startOfDay(dueDate)

    if (task.status === 'completed') {
      // Completed tasks: place in their time group but not overdue
      if (isToday(dueDate)) {
        groups[1].tasks.push(task) // today
      } else if (isTomorrow(dueDate)) {
        groups[2].tasks.push(task) // tomorrow
      } else if (isThisWeek(dueDate, { weekStartsOn: 1 })) {
        groups[3].tasks.push(task) // week
      } else if (dueDateStart >= todayStart) {
        groups[4].tasks.push(task) // upcoming
      } else {
        groups[4].tasks.push(task) // completed but past - put in upcoming
      }
      continue
    }

    // Pending tasks
    if (isPast(dueDate) && !isToday(dueDate)) {
      groups[0].tasks.push(task) // overdue
    } else if (isToday(dueDate)) {
      groups[1].tasks.push(task) // today
    } else if (isTomorrow(dueDate)) {
      groups[2].tasks.push(task) // tomorrow
    } else if (isThisWeek(dueDate, { weekStartsOn: 1 })) {
      groups[3].tasks.push(task) // week
    } else {
      groups[4].tasks.push(task) // upcoming
    }
  }

  // Filter out empty groups
  return groups.filter(g => g.tasks.length > 0)
}

type SavedView = 'all' | 'mine' | 'unassigned' | 'today'

export function TaskList({
  initialTasks,
  taskTypes,
  members,
  dashV2: dashV2Prop,
}: TaskListProps) {
  const v2FromContext = useDashboardV2()
  // SSR-resolved flag from page.tsx takes precedence to avoid first-paint flash; fallback to context.
  const v2 = dashV2Prop ?? v2FromContext

  const router = useRouter()
  const [tasks, setTasks] = React.useState(initialTasks)
  const [filters, setFilters] = React.useState<TaskFilters>({ status: 'pending' })

  // Sheet states
  const [formSheetOpen, setFormSheetOpen] = React.useState(false)
  const [editingTask, setEditingTask] = React.useState<TaskWithDetails | null>(null)

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [taskToDelete, setTaskToDelete] = React.useState<TaskWithDetails | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  // Detail sheet state
  const [detailSheetOpen, setDetailSheetOpen] = React.useState(false)
  const [selectedTask, setSelectedTask] = React.useState<TaskWithDetails | null>(null)

  // View mode (v2 only) — kanban | list — persisted in localStorage per mock tareas.html line 313
  const [viewMode, setViewMode] = React.useState<'kanban' | 'list'>('kanban')
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('morfx_tareas_view_mode')
    if (saved === 'kanban' || saved === 'list') {
      setViewMode(saved)
    }
  }, [])
  const handleViewModeChange = (mode: 'kanban' | 'list') => {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('morfx_tareas_view_mode', mode)
    }
  }

  // Saved view tab (v2 only) — local UI state that derives filter overlays.
  const [savedView, setSavedView] = React.useState<SavedView>('all')

  // Portal target for v2 sheets/dialogs — re-roots Radix portals inside `.theme-editorial` (D-DASH-10).
  const portalTarget =
    typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.theme-editorial')
      : null

  // Update tasks when initialTasks changes (e.g., after server revalidation)
  React.useEffect(() => {
    setTasks(initialTasks)
  }, [initialTasks])

  // Apply client-side filters
  const filteredTasks = React.useMemo(() => {
    return tasks.filter((task) => {
      // Status filter
      if (filters.status && filters.status !== 'all') {
        if (task.status !== filters.status) return false
      }

      // Priority filter
      if (filters.priority && task.priority !== filters.priority) {
        return false
      }

      // Assignment filter
      if (filters.assigned_to) {
        if (filters.assigned_to === 'unassigned' && task.assigned_to) {
          return false
        }
        if (filters.assigned_to !== 'unassigned' && filters.assigned_to !== 'me') {
          if (task.assigned_to !== filters.assigned_to) return false
        }
        // 'me' filter would need current user ID - handled server-side
      }

      // v2 Saved-view tab overlay (only applies when v2)
      if (v2) {
        if (savedView === 'mine') {
          if (!filters.assigned_to && !task.assigned_to) return false
          // best-effort: if user explicitly set assigned_to filter, honor it; tab is an auxiliary hint
        }
        if (savedView === 'unassigned' && task.assigned_to) {
          return false
        }
        if (savedView === 'today') {
          if (!task.due_date) return false
          const d = parseISO(task.due_date)
          if (!isToday(d)) return false
          if (task.status === 'completed') return false
        }
      }

      return true
    })
  }, [tasks, filters, savedView, v2])

  // Group tasks (legacy non-v2 path only — Regla 6 preserves groupTasks helper)
  const groupedTasks = React.useMemo(() => {
    return groupTasks(filteredTasks)
  }, [filteredTasks])

  // v2 saved-view tab counts (derived from `tasks` universe — not filtered)
  const savedViewCounts = React.useMemo(() => {
    return {
      all: tasks.length,
      mine: tasks.filter((t) => !!t.assigned_to).length,
      unassigned: tasks.filter((t) => !t.assigned_to).length,
      today: tasks.filter((t) => {
        if (!t.due_date) return false
        const d = parseISO(t.due_date)
        return isToday(d) && t.status !== 'completed'
      }).length,
    }
  }, [tasks])

  // Handlers
  const handleEdit = (task: TaskWithDetails) => {
    setEditingTask(task)
    setFormSheetOpen(true)
  }

  const handleDelete = (task: TaskWithDetails) => {
    setTaskToDelete(task)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!taskToDelete) return

    setIsDeleting(true)
    try {
      const result = await deleteTask(taskToDelete.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Tarea eliminada')
        router.refresh()
      }
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setTaskToDelete(null)
    }
  }

  const handleFormSuccess = () => {
    setFormSheetOpen(false)
    setEditingTask(null)
    toast.success(editingTask ? 'Tarea actualizada' : 'Tarea creada')
    router.refresh()
  }

  const handleFormClose = () => {
    setFormSheetOpen(false)
    setEditingTask(null)
  }

  const handleViewDetails = (task: TaskWithDetails) => {
    setSelectedTask(task)
    setDetailSheetOpen(true)
  }

  const handleDetailSheetClose = (open: boolean) => {
    if (!open) {
      setDetailSheetOpen(false)
      setSelectedTask(null)
    }
  }

  // ---------- Reusable helpers ----------

  // Primary "Nueva tarea" button (editorial .btn.red when v2, shadcn default otherwise)
  const NewTaskButton = (
    <Button
      onClick={() => setFormSheetOpen(true)}
      className={cn(
        v2 &&
          'bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] rounded-[3px] px-3 py-1.5 text-[13px] font-semibold inline-flex items-center gap-1.5'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      <PlusIcon className={cn(v2 ? 'h-[14px] w-[14px]' : 'h-4 w-4 mr-2')} />
      Nueva tarea
    </Button>
  )

  // View toggle (v2-only) — mock tareas.html lines 42-46 + 313-316
  const ViewToggle = v2 ? (
    <div className="inline-flex border border-[var(--ink-1)] rounded-[3px] overflow-hidden shadow-[0_1px_0_var(--ink-1)]">
      {(['kanban', 'list'] as const).map((mode, idx) => (
        <button
          key={mode}
          type="button"
          onClick={() => handleViewModeChange(mode)}
          aria-pressed={viewMode === mode}
          className={cn(
            'px-3 py-1.5 text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors',
            idx === 0 && 'border-r border-[var(--ink-1)]',
            viewMode === mode
              ? 'bg-[var(--ink-1)] text-[var(--paper-0)]'
              : 'bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-2)]'
          )}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {mode === 'kanban' ? (
            <>
              <Columns3Icon className="h-[13px] w-[13px]" />
              Tablero
            </>
          ) : (
            <>
              <ListIcon className="h-[13px] w-[13px]" />
              Lista
            </>
          )}
        </button>
      ))}
    </div>
  ) : null

  // ---------- Empty state ----------
  if (tasks.length === 0) {
    return (
      <>
        {v2 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <h3
              className="text-[22px] font-bold tracking-[-0.01em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Sin tareas pendientes.
            </h3>
            <p
              className="text-[13px] italic text-[var(--ink-3)] max-w-sm"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Crea tu primera tarea o espera a que un agente escale.
            </p>
            {NewTaskButton}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <CheckCircleIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Sin tareas</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Crea tu primera tarea para comenzar a organizar tu trabajo.
            </p>
            <Button onClick={() => setFormSheetOpen(true)}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Nueva tarea
            </Button>
          </div>
        )}

        <Sheet open={formSheetOpen} onOpenChange={handleFormClose}>
          <SheetContent
            portalContainer={v2 ? portalTarget ?? undefined : undefined}
            className={cn(
              'sm:max-w-[500px] p-0 flex flex-col h-full max-h-screen overflow-hidden',
              v2 && 'bg-[var(--paper-1)] border-l border-[var(--ink-1)]'
            )}
          >
            <SheetHeader
              className={cn(
                'px-6 pt-6 pb-4 border-b',
                v2 && 'border-[var(--ink-1)] bg-[var(--paper-0)]'
              )}
            >
              <SheetTitle
                className={cn(v2 && 'text-[20px] font-bold tracking-[-0.01em]')}
                style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
              >
                Nueva tarea
              </SheetTitle>
              <SheetDescription
                className={cn(v2 && 'italic text-[13px] text-[var(--ink-2)]')}
                style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
              >
                Crea una nueva tarea para hacer seguimiento
              </SheetDescription>
            </SheetHeader>
            <TaskForm
              mode="create"
              taskTypes={taskTypes}
              members={members}
              onSuccess={handleFormSuccess}
              onCancel={handleFormClose}
            />
          </SheetContent>
        </Sheet>
      </>
    )
  }

  // ---------- Main render ----------
  return (
    <>
      {/* v2 saved-view tabs row (mock lines 48-54 + 323-327) */}
      {v2 && (
        <div
          className="flex gap-5 px-0 border-b border-[var(--border)] items-center"
          role="tablist"
          aria-label="Vistas guardadas"
        >
          {(
            [
              { id: 'all', label: 'Todas', count: savedViewCounts.all },
              { id: 'mine', label: 'Mías', count: savedViewCounts.mine },
              { id: 'unassigned', label: 'Sin asignar', count: savedViewCounts.unassigned },
              { id: 'today', label: 'Vencen hoy', count: savedViewCounts.today },
            ] as const
          ).map((tab) => {
            const isActive = savedView === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSavedView(tab.id)}
                className={cn(
                  'pb-2.5 pt-2.5 inline-flex items-center gap-1.5 transition-colors text-[13px]',
                  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink-1)]',
                  isActive
                    ? 'font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]'
                    : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] border-b-2 border-transparent'
                )}
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {tab.label}
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    isActive ? 'text-[var(--rubric-2)]' : 'text-[var(--ink-3)]'
                  )}
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Filters + actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TaskFiltersBar
          filters={filters}
          onFiltersChange={setFilters}
          members={members}
          v2={v2}
        />
        {v2 ? (
          <div className="flex items-center gap-2">
            {ViewToggle}
            {NewTaskButton}
          </div>
        ) : (
          NewTaskButton
        )}
      </div>

      {/* Results count when filtering */}
      {v2 ? (
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {filteredTasks.length} tarea{filteredTasks.length !== 1 ? 's' : ''}
          {filteredTasks.length !== tasks.length && ` · ${tasks.length} totales`}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          {filteredTasks.length} tarea{filteredTasks.length !== 1 ? 's' : ''}
          {filteredTasks.length !== tasks.length && ` de ${tasks.length}`}
        </div>
      )}

      {/* Body — switch between v2 kanban/list or legacy grouped vertical layout */}
      {v2 && viewMode === 'kanban' ? (
        <TaskKanban
          tasks={filteredTasks}
          onSelectTask={handleViewDetails}
          selectedTaskId={selectedTask?.id ?? null}
        />
      ) : v2 && viewMode === 'list' ? (
        <div className="overflow-auto">
          <table className="w-full border-collapse bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
            <thead>
              <tr>
                {[
                  { id: 'id', label: 'ID' },
                  { id: 'title', label: 'Tarea' },
                  { id: 'status', label: 'Estado' },
                  { id: 'priority', label: 'Prioridad' },
                  { id: 'assigned', label: 'Asignado' },
                  { id: 'due', label: 'Vence' },
                ].map((col) => (
                  <th
                    key={col.id}
                    className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--ink-3)] bg-[var(--paper-1)] border-b border-[var(--ink-1)] sticky top-0"
                    style={{ fontFamily: 'var(--font-sans)' }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-[13px] text-[var(--ink-3)] italic"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    Nada coincide con los filtros activos.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isSelected={selectedTask?.id === task.id}
                    onClick={handleViewDetails}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : groupedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <ListTodoIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No hay tareas que mostrar</h3>
          <p className="text-muted-foreground">
            Ajusta los filtros para ver mas tareas.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedTasks.map((group) => (
            <div key={group.id}>
              <h3 className={`text-sm font-semibold mb-3 ${group.className || ''}`}>
                {group.title}
                <span className="text-muted-foreground font-normal ml-2">
                  ({group.tasks.length})
                </span>
              </h3>
              <div className="space-y-2">
                {group.tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={(e) => {
                      // Don't open detail sheet if clicking on dropdown or checkbox
                      const target = e.target as HTMLElement
                      if (target.closest('[data-radix-collection-item]') ||
                          target.closest('button') ||
                          target.closest('[role="checkbox"]')) {
                        return
                      }
                      handleViewDetails(task)
                    }}
                    className="cursor-pointer"
                  >
                    <TaskItem
                      task={task}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Sheet */}
      <Sheet open={formSheetOpen} onOpenChange={handleFormClose}>
        <SheetContent
          portalContainer={v2 ? portalTarget ?? undefined : undefined}
          className={cn(
            'sm:max-w-[500px] p-0 flex flex-col h-full max-h-screen overflow-hidden',
            v2 && 'bg-[var(--paper-1)] border-l border-[var(--ink-1)]'
          )}
        >
          <SheetHeader
            className={cn(
              'px-6 pt-6 pb-4 border-b',
              v2 && 'border-[var(--ink-1)] bg-[var(--paper-0)]'
            )}
          >
            <SheetTitle
              className={cn(v2 && 'text-[20px] font-bold tracking-[-0.01em]')}
              style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
            >
              {editingTask ? 'Editar tarea' : 'Nueva tarea'}
            </SheetTitle>
            <SheetDescription
              className={cn(v2 && 'italic text-[13px] text-[var(--ink-2)]')}
              style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
            >
              {editingTask
                ? 'Actualiza la informacion de la tarea'
                : 'Crea una nueva tarea para hacer seguimiento'}
            </SheetDescription>
          </SheetHeader>
          <TaskForm
            mode={editingTask ? 'edit' : 'create'}
            task={editingTask || undefined}
            taskTypes={taskTypes}
            members={members}
            onSuccess={handleFormSuccess}
            onCancel={handleFormClose}
          />
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent
          portalContainer={v2 ? portalTarget ?? undefined : undefined}
          className={cn(
            v2 &&
              'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] rounded-[3px]'
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle
              className={cn(
                v2 && 'text-[18px] font-bold tracking-[-0.01em] text-[var(--ink-1)]'
              )}
              style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
            >
              Eliminar tarea
            </AlertDialogTitle>
            <AlertDialogDescription
              className={cn(v2 && 'text-[13px] italic text-[var(--ink-2)]')}
              style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
            >
              Estas seguro que deseas eliminar la tarea &quot;{taskToDelete?.title}&quot;?
              Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              className={cn(
                v2 &&
                  'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] hover:bg-[var(--paper-2)] rounded-[3px] font-semibold shadow-[0_1px_0_var(--ink-1)]'
              )}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className={cn(
                v2
                  ? 'bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] rounded-[3px] font-semibold'
                  : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              )}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        task={selectedTask}
        open={detailSheetOpen}
        onOpenChange={handleDetailSheetClose}
      />
    </>
  )
}
