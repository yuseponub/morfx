'use client'

import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { CalendarIcon, LoaderIcon } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { createTask, updateTask } from '@/app/actions/tasks'
import { cn } from '@/lib/utils'
import type { TaskWithDetails, TaskType, TaskPriority } from '@/lib/tasks/types'
import type { MemberWithUser } from '@/lib/types/database'

// Form data type
interface FormData {
  title: string
  description: string | null
  due_date: string | null
  priority: TaskPriority
  task_type_id: string | null
  assigned_to: string | null
}

interface TaskFormProps {
  mode: 'create' | 'edit'
  task?: TaskWithDetails
  taskTypes: TaskType[]
  members: MemberWithUser[]
  onSuccess?: () => void
  onCancel?: () => void
}

export function TaskForm({
  mode,
  task,
  taskTypes,
  members,
  onSuccess,
  onCancel,
}: TaskFormProps) {
  const [isPending, setIsPending] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  const defaultValues: FormData = React.useMemo(() => {
    if (mode === 'edit' && task) {
      return {
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        priority: task.priority,
        task_type_id: task.task_type_id,
        assigned_to: task.assigned_to,
      }
    }
    return {
      title: '',
      description: null,
      due_date: null,
      priority: 'medium' as TaskPriority,
      task_type_id: null,
      assigned_to: null,
    }
  }, [mode, task])

  const form = useForm<FormData>({
    defaultValues,
  })

  const handleSubmit = async (data: FormData) => {
    setIsPending(true)
    setServerError(null)

    try {
      const result = mode === 'edit' && task
        ? await updateTask(task.id, {
            title: data.title,
            description: data.description,
            due_date: data.due_date,
            priority: data.priority,
            task_type_id: data.task_type_id,
            assigned_to: data.assigned_to,
          })
        : await createTask({
            title: data.title,
            description: data.description || undefined,
            due_date: data.due_date || undefined,
            priority: data.priority,
            task_type_id: data.task_type_id || undefined,
            assigned_to: data.assigned_to || undefined,
          })

      if ('error' in result) {
        setServerError(result.error)
        return
      }

      onSuccess?.()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-6 pb-4">
          {serverError && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {serverError}
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Titulo *</Label>
            <Input
              {...form.register('title', { required: 'El titulo es requerido' })}
              placeholder="Ej: Llamar al cliente, Enviar cotizacion..."
              disabled={isPending}
              autoFocus
            />
            {form.formState.errors.title && (
              <p className="text-sm text-destructive">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Descripcion</Label>
            <Textarea
              {...form.register('description')}
              placeholder="Detalles adicionales de la tarea..."
              disabled={isPending}
              rows={3}
            />
          </div>

          {/* Due date */}
          <div className="space-y-2">
            <Label htmlFor="due_date">Fecha limite</Label>
            <Controller
              control={form.control}
              name="due_date"
              render={({ field }) => (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                      disabled={isPending}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value
                        ? format(new Date(field.value), 'PPP', { locale: es })
                        : 'Seleccionar fecha'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) =>
                        field.onChange(date ? format(date, 'yyyy-MM-dd') : null)
                      }
                      initialFocus
                      locale={es}
                    />
                    {field.value && (
                      <div className="p-2 border-t">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => field.onChange(null)}
                        >
                          Quitar fecha
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Prioridad</Label>
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        Alta
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-yellow-500" />
                        Media
                      </div>
                    </SelectItem>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-gray-400" />
                        Baja
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Task type */}
          {taskTypes.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="task_type_id">Tipo de tarea</Label>
              <Controller
                control={form.control}
                name="task_type_id"
                render={({ field }) => (
                  <Select
                    value={field.value || 'none'}
                    onValueChange={(val) => field.onChange(val === 'none' ? null : val)}
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin tipo</SelectItem>
                      {taskTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: type.color }}
                            />
                            {type.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {/* Assigned to */}
          {members.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="assigned_to">Asignar a</Label>
              <Controller
                control={form.control}
                name="assigned_to"
                render={({ field }) => (
                  <Select
                    value={field.value || 'none'}
                    onValueChange={(val) => field.onChange(val === 'none' ? null : val)}
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {members.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.user?.email || 'Usuario'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {/* Entity link (read-only when editing) */}
          {mode === 'edit' && task && (task.contact || task.order || task.conversation) && (
            <div className="space-y-2">
              <Label>Vinculada a</Label>
              <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
                {task.contact && `Contacto: ${task.contact.name}`}
                {task.order && `Pedido: $${task.order.total_value.toLocaleString()}`}
                {task.conversation && `Conversacion: ${task.conversation.phone}`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 p-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'edit' ? 'Guardar cambios' : 'Crear tarea'}
        </Button>
      </div>
    </form>
  )
}

// Dialog wrapper for convenience
interface TaskFormDialogProps {
  taskTypes: TaskType[]
  members: MemberWithUser[]
  trigger?: React.ReactNode
  onSuccess?: () => void
}

export function TaskFormDialog({
  taskTypes,
  members,
  trigger,
  onSuccess,
}: TaskFormDialogProps) {
  const [open, setOpen] = React.useState(false)

  const handleSuccess = () => {
    setOpen(false)
    onSuccess?.()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || <Button>Nueva tarea</Button>}
      </SheetTrigger>
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
          onSuccess={handleSuccess}
          onCancel={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
