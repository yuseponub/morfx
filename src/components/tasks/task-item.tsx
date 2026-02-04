'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { format, isToday, isPast, isTomorrow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CalendarIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  UserIcon,
  MessageSquareIcon,
  ShoppingCartIcon,
  UserCircleIcon,
  CheckIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { completeTask, reopenTask, deleteTask } from '@/app/actions/tasks'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { PostponementBadge } from '@/components/tasks/postponement-badge'
import type { TaskWithDetails } from '@/lib/tasks/types'

interface TaskItemProps {
  task: TaskWithDetails
  onEdit?: (task: TaskWithDetails) => void
  onDelete?: (task: TaskWithDetails) => void
}

/**
 * Priority colors
 */
const priorityColors: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
}

const priorityLabels: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

/**
 * Get due date badge styling based on urgency
 */
function getDueDateStyle(dueDate: string | null, isCompleted: boolean) {
  if (!dueDate || isCompleted) {
    return { className: 'bg-muted text-muted-foreground', label: '' }
  }

  const date = parseISO(dueDate)
  const now = new Date()

  if (isPast(date) && !isToday(date)) {
    return { className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Vencida' }
  }
  if (isToday(date)) {
    return { className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', label: 'Hoy' }
  }
  if (isTomorrow(date)) {
    return { className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Manana' }
  }
  return { className: 'bg-muted text-muted-foreground', label: '' }
}

export function TaskItem({ task, onEdit, onDelete }: TaskItemProps) {
  const router = useRouter()
  const [isPending, setIsPending] = React.useState(false)
  const isCompleted = task.status === 'completed'

  // Handle completion toggle
  const handleToggleComplete = async () => {
    setIsPending(true)
    try {
      const result = isCompleted
        ? await reopenTask(task.id)
        : await completeTask(task.id)

      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(isCompleted ? 'Tarea reabierta' : 'Tarea completada')
        router.refresh()
      }
    } finally {
      setIsPending(false)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (onDelete) {
      onDelete(task)
      return
    }

    setIsPending(true)
    try {
      const result = await deleteTask(task.id)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Tarea eliminada')
        router.refresh()
      }
    } finally {
      setIsPending(false)
    }
  }

  const dueDateStyle = getDueDateStyle(task.due_date, isCompleted)

  // Get linked entity info
  const linkedEntity = React.useMemo(() => {
    if (task.contact) {
      return {
        icon: UserCircleIcon,
        label: task.contact.name,
        href: `/crm/contactos/${task.contact.id}`,
      }
    }
    if (task.order) {
      return {
        icon: ShoppingCartIcon,
        label: task.order.contact?.name || `Pedido $${task.order.total_value.toLocaleString()}`,
        href: `/crm/pedidos?order=${task.order.id}`,
      }
    }
    if (task.conversation) {
      return {
        icon: MessageSquareIcon,
        label: task.conversation.contact?.name || task.conversation.phone,
        href: `/whatsapp/${task.conversation.id}`,
      }
    }
    return null
  }, [task])

  return (
    <div
      className={cn(
        'group flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors',
        isCompleted && 'opacity-60'
      )}
    >
      {/* Checkbox */}
      <Checkbox
        checked={isCompleted}
        onCheckedChange={handleToggleComplete}
        disabled={isPending}
        className="mt-0.5"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'flex-1 font-medium',
              isCompleted && 'line-through text-muted-foreground'
            )}
          >
            {task.title}
          </span>

          {/* Priority indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn('h-2 w-2 rounded-full shrink-0 mt-1.5', priorityColors[task.priority])}
              />
            </TooltipTrigger>
            <TooltipContent>Prioridad {priorityLabels[task.priority]}</TooltipContent>
          </Tooltip>
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {task.description}
          </p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {/* Task type badge */}
          {task.task_type && (
            <Badge
              variant="outline"
              className="text-xs"
              style={{ borderColor: task.task_type.color, color: task.task_type.color }}
            >
              {task.task_type.name}
            </Badge>
          )}

          {/* Due date badge */}
          {task.due_date && (
            <Badge variant="outline" className={cn('text-xs gap-1', dueDateStyle.className)}>
              <CalendarIcon className="h-3 w-3" />
              {dueDateStyle.label ? `${dueDateStyle.label} - ` : ''}
              {format(parseISO(task.due_date), 'dd MMM', { locale: es })}
            </Badge>
          )}

          {/* Postponement badge - shows after due date */}
          {task.postponement_count > 0 && (
            <PostponementBadge count={task.postponement_count} />
          )}

          {/* Assigned user */}
          {task.assigned_user && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-xs gap-1">
                  <UserIcon className="h-3 w-3" />
                  {task.assigned_user.email.split('@')[0]}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Asignada a {task.assigned_user.email}</TooltipContent>
            </Tooltip>
          )}

          {/* Linked entity */}
          {linkedEntity && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="text-xs gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={() => router.push(linkedEntity.href)}
                >
                  <linkedEntity.icon className="h-3 w-3" />
                  {linkedEntity.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Ver {linkedEntity.label}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            disabled={isPending}
          >
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleToggleComplete}>
            {isCompleted ? (
              <>
                <RotateCcwIcon className="h-4 w-4 mr-2" />
                Reabrir
              </>
            ) : (
              <>
                <CheckIcon className="h-4 w-4 mr-2" />
                Completar
              </>
            )}
          </DropdownMenuItem>
          {onEdit && (
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <PencilIcon className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2Icon className="h-4 w-4 mr-2" />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
