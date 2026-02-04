'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ListTodo,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  LoaderIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getTasks, completeTask, reopenTask } from '@/app/actions/tasks'
import { CreateTaskButton } from '@/components/tasks/create-task-button'
import type { TaskWithDetails, TaskPriority } from '@/lib/tasks/types'

interface ContactTasksProps {
  contactId: string
  contactName: string
}

export function ContactTasks({ contactId, contactName }: ContactTasksProps) {
  const router = useRouter()
  const [tasks, setTasks] = React.useState<TaskWithDetails[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [loadingTaskId, setLoadingTaskId] = React.useState<string | null>(null)

  // Fetch tasks for this contact
  React.useEffect(() => {
    async function fetchTasks() {
      setIsLoading(true)
      try {
        const contactTasks = await getTasks({
          entity_type: 'contact',
          entity_id: contactId,
          status: 'all',
        })
        setTasks(contactTasks)
      } catch (error) {
        console.error('Error fetching contact tasks:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTasks()
  }, [contactId])

  const handleToggleComplete = async (task: TaskWithDetails) => {
    setLoadingTaskId(task.id)
    try {
      const result = task.status === 'completed'
        ? await reopenTask(task.id)
        : await completeTask(task.id)

      if ('error' in result) {
        console.error('Error toggling task:', result.error)
        return
      }

      // Update local state
      setTasks(prev =>
        prev.map(t =>
          t.id === task.id
            ? { ...t, status: task.status === 'completed' ? 'pending' : 'completed' }
            : t
        )
      )
      router.refresh()
    } finally {
      setLoadingTaskId(null)
    }
  }

  // Separate pending and completed tasks
  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const completedTasks = tasks.filter(t => t.status === 'completed')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoaderIcon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ListTodo className="h-5 w-5" />
          <span className="font-medium">
            {tasks.length === 0
              ? 'Sin tareas'
              : `${pendingTasks.length} pendiente${pendingTasks.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <CreateTaskButton
          contactId={contactId}
          contactName={contactName}
          variant="outline"
          size="sm"
        />
      </div>

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <ListTodo className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No hay tareas para este contacto</p>
          <p className="text-sm">Crea una tarea para hacer seguimiento</p>
        </div>
      )}

      {/* Pending tasks */}
      {pendingTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Pendientes</h4>
          <div className="space-y-2">
            {pendingTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                isLoading={loadingTaskId === task.id}
                onToggleComplete={() => handleToggleComplete(task)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed tasks */}
      {completedTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Completadas ({completedTasks.length})
          </h4>
          <div className="space-y-2">
            {completedTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                isLoading={loadingTaskId === task.id}
                onToggleComplete={() => handleToggleComplete(task)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Individual task item
interface TaskItemProps {
  task: TaskWithDetails
  isLoading: boolean
  onToggleComplete: () => void
}

function TaskItem({ task, isLoading, onToggleComplete }: TaskItemProps) {
  const isCompleted = task.status === 'completed'
  const isOverdue = !isCompleted && task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date))
  const isDueSoon = !isCompleted && task.due_date && (isToday(new Date(task.due_date)) || isTomorrow(new Date(task.due_date)))

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border bg-card',
        isCompleted && 'opacity-60',
        isOverdue && 'border-destructive/50 bg-destructive/5'
      )}
    >
      {/* Toggle button */}
      <button
        onClick={onToggleComplete}
        disabled={isLoading}
        className={cn(
          'mt-0.5 shrink-0 transition-colors',
          isCompleted
            ? 'text-green-500 hover:text-green-600'
            : 'text-muted-foreground hover:text-primary'
        )}
      >
        {isLoading ? (
          <LoaderIcon className="h-5 w-5 animate-spin" />
        ) : isCompleted ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className={cn(
          'font-medium',
          isCompleted && 'line-through text-muted-foreground'
        )}>
          {task.title}
        </p>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Due date */}
          {task.due_date && (
            <span
              className={cn(
                'flex items-center gap-1',
                isOverdue && 'text-destructive font-medium',
                isDueSoon && !isOverdue && 'text-yellow-600 dark:text-yellow-500 font-medium',
                !isOverdue && !isDueSoon && 'text-muted-foreground'
              )}
            >
              {isOverdue ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {isToday(new Date(task.due_date))
                ? 'Hoy'
                : isTomorrow(new Date(task.due_date))
                ? 'Manana'
                : isOverdue
                ? `Vencida hace ${formatDistanceToNow(new Date(task.due_date), { locale: es })}`
                : format(new Date(task.due_date), 'd MMM', { locale: es })}
            </span>
          )}

          {/* Priority */}
          <PriorityBadge priority={task.priority} />

          {/* Task type */}
          {task.task_type && (
            <Badge
              variant="outline"
              className="text-xs"
              style={{
                backgroundColor: `${task.task_type.color}15`,
                borderColor: task.task_type.color,
                color: task.task_type.color,
              }}
            >
              {task.task_type.name}
            </Badge>
          )}
        </div>

        {/* Description preview */}
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}
      </div>
    </div>
  )
}

// Priority badge component
function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const config: Record<TaskPriority, { label: string; color: string }> = {
    high: { label: 'Alta', color: 'bg-red-500' },
    medium: { label: 'Media', color: 'bg-yellow-500' },
    low: { label: 'Baja', color: 'bg-gray-400' },
  }

  const { label, color } = config[priority]

  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 rounded-full', color)} />
      {label}
    </span>
  )
}
