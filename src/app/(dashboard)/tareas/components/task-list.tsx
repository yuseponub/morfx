'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, CheckCircleIcon, ListTodoIcon } from 'lucide-react'
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
import { TaskFiltersBar } from './task-filters'
import { TaskForm } from './task-form'
import { TaskItem } from '@/components/tasks/task-item'
import { TaskDetailSheet } from './task-detail-sheet'
import { deleteTask } from '@/app/actions/tasks'
import { toast } from 'sonner'
import type { TaskWithDetails, TaskType, TaskFilters } from '@/lib/tasks/types'
import type { MemberWithUser } from '@/lib/types/database'

interface TaskListProps {
  initialTasks: TaskWithDetails[]
  taskTypes: TaskType[]
  members: MemberWithUser[]
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

export function TaskList({ initialTasks, taskTypes, members }: TaskListProps) {
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

      return true
    })
  }, [tasks, filters])

  // Group tasks
  const groupedTasks = React.useMemo(() => {
    return groupTasks(filteredTasks)
  }, [filteredTasks])

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

  // Empty state
  if (tasks.length === 0) {
    return (
      <>
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

        <Sheet open={formSheetOpen} onOpenChange={handleFormClose}>
          <SheetContent className="sm:max-w-[500px] p-0 flex flex-col h-full max-h-screen overflow-hidden">
            <SheetHeader className="px-6 pt-6 pb-4 border-b">
              <SheetTitle>Nueva tarea</SheetTitle>
              <SheetDescription>
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

  return (
    <>
      {/* Filters and actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TaskFiltersBar
          filters={filters}
          onFiltersChange={setFilters}
          members={members}
        />
        <Button onClick={() => setFormSheetOpen(true)}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Nueva tarea
        </Button>
      </div>

      {/* Results count when filtering */}
      <div className="text-sm text-muted-foreground">
        {filteredTasks.length} tarea{filteredTasks.length !== 1 ? 's' : ''}
        {filteredTasks.length !== tasks.length && ` de ${tasks.length}`}
      </div>

      {/* Task groups */}
      {groupedTasks.length === 0 ? (
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
                    onClick={() => handleViewDetails(task)}
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
        <SheetContent className="sm:max-w-[500px] p-0 flex flex-col h-full max-h-screen overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>
              {editingTask ? 'Editar tarea' : 'Nueva tarea'}
            </SheetTitle>
            <SheetDescription>
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tarea</AlertDialogTitle>
            <AlertDialogDescription>
              Estas seguro que deseas eliminar la tarea &quot;{taskToDelete?.title}&quot;?
              Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
