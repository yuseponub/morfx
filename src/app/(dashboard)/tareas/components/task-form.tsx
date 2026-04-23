'use client'

import * as React from 'react'
import { useForm, Controller } from 'react-hook-form'
import { CalendarIcon, LoaderIcon, Clock } from 'lucide-react'
import { format, isToday, startOfDay, addHours } from 'date-fns'
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
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { createTask, updateTask } from '@/app/actions/tasks'
import { cn } from '@/lib/utils'
import type { TaskWithDetails, TaskType, TaskPriority } from '@/lib/tasks/types'
import type { MemberWithUser } from '@/lib/types/database'

// Helper: Get default time based on selected date
function getDefaultTime(selectedDate: Date): string {
  const now = new Date()
  if (isToday(selectedDate)) {
    // If today, default to current time + 4 hours
    const futureTime = addHours(now, 4)
    return format(futureTime, 'HH:mm')
  }
  // If tomorrow or later, use current time
  return format(now, 'HH:mm')
}

// Helper: Combine date and time into ISO string with Colombia timezone
function combineDateAndTime(date: Date, time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const combined = new Date(date)
  combined.setHours(hours, minutes, 0, 0)
  // Return as ISO string - the server will interpret in Colombia timezone
  return combined.toISOString()
}

// Helper: Extract time from ISO date string
function extractTime(isoString: string): string {
  const date = new Date(isoString)
  return format(date, 'HH:mm')
}

// Generate time options (every 30 minutes)
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2)
  const minutes = (i % 2) * 30
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
})

// Form data type
interface FormData {
  title: string
  description: string | null
  due_date: string | null
  due_time: string
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

// Editorial token helpers — D-DASH-14 (inputs + labels + buttons)
const editorialInputClasses =
  'border border-[var(--ink-1)] rounded-[3px] bg-[var(--paper-0)] text-[var(--ink-1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)] focus-visible:ring-0 focus-visible:border-[var(--ink-1)] shadow-none'

// Editorial labels — smallcaps 10px tracking-[0.12em] uppercase ink-3 (D-DASH-14).
// Uses Tailwind arbitrary value `tracking-[0.12em]` so the class is greppable
// per plan acceptance criterion, plus inline letter-spacing as defensive BC.
const editorialLabelClassName =
  'font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)]'

const editorialLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
}

export function TaskForm({
  mode,
  task,
  taskTypes,
  members,
  onSuccess,
  onCancel,
}: TaskFormProps) {
  const v2 = useDashboardV2()
  const [isPending, setIsPending] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  // Portal target for D-DASH-10 — shared by PopoverContent (calendar) when v2
  const portalTarget =
    typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.theme-editorial')
      : null

  const defaultValues: FormData = React.useMemo(() => {
    const defaultTime = format(addHours(new Date(), 4), 'HH:mm')
    if (mode === 'edit' && task) {
      return {
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        due_time: task.due_date ? extractTime(task.due_date) : defaultTime,
        priority: task.priority,
        task_type_id: task.task_type_id,
        assigned_to: task.assigned_to,
      }
    }
    return {
      title: '',
      description: null,
      due_date: null,
      due_time: defaultTime,
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

    // Combine date and time if date is set
    let dueDateTime: string | undefined = undefined
    if (data.due_date) {
      const dateObj = new Date(data.due_date)
      dueDateTime = combineDateAndTime(dateObj, data.due_time)
    }

    try {
      const result = mode === 'edit' && task
        ? await updateTask(task.id, {
            title: data.title,
            description: data.description,
            due_date: dueDateTime || null,
            priority: data.priority,
            task_type_id: data.task_type_id,
            assigned_to: data.assigned_to,
          })
        : await createTask({
            title: data.title,
            description: data.description || undefined,
            due_date: dueDateTime,
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
            <div
              className={cn(
                'text-sm p-3',
                v2
                  ? 'border border-[var(--rubric-2)] bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] text-[var(--rubric-2)] rounded-[3px]'
                  : 'text-destructive bg-destructive/10 rounded-md'
              )}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            >
              {serverError}
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className={cn(v2 && editorialLabelClassName)} style={v2 ? editorialLabelStyle : undefined}>
              {v2 ? 'Titulo' : 'Titulo *'}
            </Label>
            <Input
              {...form.register('title', { required: 'El titulo es requerido' })}
              placeholder="Ej: Llamar al cliente, Enviar cotizacion..."
              disabled={isPending}
              autoFocus
              className={cn(v2 && editorialInputClasses)}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            />
            {form.formState.errors.title && (
              <p
                className={cn(
                  'text-sm',
                  v2 ? 'text-[var(--rubric-2)]' : 'text-destructive'
                )}
                style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
              >
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label
              htmlFor="description"
              className={cn(v2 && editorialLabelClassName)} style={v2 ? editorialLabelStyle : undefined}
            >
              Descripcion
            </Label>
            <Textarea
              {...form.register('description')}
              placeholder="Detalles adicionales de la tarea..."
              disabled={isPending}
              rows={3}
              className={cn(v2 && editorialInputClasses)}
              style={
                v2
                  ? { fontFamily: 'var(--font-serif)', fontSize: '13px' }
                  : undefined
              }
            />
          </div>

          {/* Due date and time */}
          <div className="space-y-2">
            <Label htmlFor="due_date" className={cn(v2 && editorialLabelClassName)} style={v2 ? editorialLabelStyle : undefined}>
              Fecha y hora limite
            </Label>
            <div className="flex gap-2">
              {/* Date picker */}
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
                          'flex-1 justify-start text-left font-normal',
                          !field.value && !v2 && 'text-muted-foreground',
                          !field.value && v2 && 'text-[var(--ink-3)]',
                          v2 &&
                            'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] rounded-[3px] shadow-none hover:bg-[var(--paper-2)]'
                        )}
                        disabled={isPending}
                        style={
                          v2 ? { fontFamily: 'var(--font-sans)' } : undefined
                        }
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value
                          ? format(new Date(field.value), 'PPP', { locale: es })
                          : 'Seleccionar fecha'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0"
                      align="start"
                      portalContainer={
                        v2 ? portalTarget ?? undefined : undefined
                      }
                    >
                      <Calendar
                        mode="single"
                        selected={field.value ? new Date(field.value) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            // Store as ISO string at start of day (local time)
                            const localDate = startOfDay(date)
                            field.onChange(localDate.toISOString())
                            // Update default time based on selected date
                            form.setValue('due_time', getDefaultTime(date))
                          } else {
                            field.onChange(null)
                          }
                        }}
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

              {/* Time picker */}
              <Controller
                control={form.control}
                name="due_time"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending || !form.watch('due_date')}
                  >
                    <SelectTrigger
                      className={cn(
                        'w-[120px]',
                        v2 && editorialInputClasses
                      )}
                      style={
                        v2 ? { fontFamily: 'var(--font-sans)' } : undefined
                      }
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Hora" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {TIME_OPTIONS.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label
              htmlFor="priority"
              className={cn(v2 && editorialLabelClassName)} style={v2 ? editorialLabelStyle : undefined}
            >
              Prioridad
            </Label>
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isPending}
                >
                  <SelectTrigger
                    className={cn(v2 && editorialInputClasses)}
                    style={
                      v2 ? { fontFamily: 'var(--font-sans)' } : undefined
                    }
                  >
                    <SelectValue placeholder="Seleccionar prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            v2
                              ? 'w-2.5 h-2.5 border border-[var(--ink-1)]'
                              : 'h-2 w-2 rounded-full bg-red-500'
                          )}
                          style={
                            v2 ? { background: 'var(--rubric-2)' } : undefined
                          }
                        />
                        Alta
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            v2
                              ? 'w-2.5 h-2.5 border border-[var(--ink-1)]'
                              : 'h-2 w-2 rounded-full bg-yellow-500'
                          )}
                          style={
                            v2 ? { background: 'var(--accent-gold)' } : undefined
                          }
                        />
                        Media
                      </div>
                    </SelectItem>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            v2
                              ? 'w-2.5 h-2.5 border border-[var(--ink-1)]'
                              : 'h-2 w-2 rounded-full bg-gray-400'
                          )}
                          style={
                            v2 ? { background: 'var(--ink-4)' } : undefined
                          }
                        />
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
              <Label
                htmlFor="task_type_id"
                className={cn(v2 && editorialLabelClassName)} style={v2 ? editorialLabelStyle : undefined}
              >
                Tipo de tarea
              </Label>
              <Controller
                control={form.control}
                name="task_type_id"
                render={({ field }) => (
                  <Select
                    value={field.value || 'none'}
                    onValueChange={(val) => field.onChange(val === 'none' ? null : val)}
                    disabled={isPending}
                  >
                    <SelectTrigger
                      className={cn(v2 && editorialInputClasses)}
                      style={
                        v2 ? { fontFamily: 'var(--font-sans)' } : undefined
                      }
                    >
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin tipo</SelectItem>
                      {taskTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                v2
                                  ? 'w-2.5 h-2.5 border border-[var(--ink-1)]'
                                  : 'h-2 w-2 rounded-full'
                              )}
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
              <Label
                htmlFor="assigned_to"
                className={cn(v2 && editorialLabelClassName)} style={v2 ? editorialLabelStyle : undefined}
              >
                Asignar a
              </Label>
              <Controller
                control={form.control}
                name="assigned_to"
                render={({ field }) => (
                  <Select
                    value={field.value || 'none'}
                    onValueChange={(val) => field.onChange(val === 'none' ? null : val)}
                    disabled={isPending}
                  >
                    <SelectTrigger
                      className={cn(v2 && editorialInputClasses)}
                      style={
                        v2 ? { fontFamily: 'var(--font-sans)' } : undefined
                      }
                    >
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
              <Label className={cn(v2 && editorialLabelClassName)} style={v2 ? editorialLabelStyle : undefined}>
                Vinculada a
              </Label>
              <div
                className={cn(
                  'text-sm p-2',
                  v2
                    ? 'border border-[var(--border)] bg-[var(--paper-2)] text-[var(--ink-2)] rounded-[3px]'
                    : 'text-muted-foreground bg-muted rounded-md'
                )}
                style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
              >
                {task.contact && `Contacto: ${task.contact.name}`}
                {task.order && `Pedido: $${task.order.total_value.toLocaleString()}`}
                {task.conversation && `Conversacion: ${task.conversation.phone}`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className={cn(
          'flex items-center justify-end gap-3 p-4 border-t',
          v2 && 'bg-[var(--paper-1)]'
        )}
        style={v2 ? { borderTopColor: 'var(--ink-1)' } : undefined}
      >
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            className={cn(
              v2 &&
                'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] hover:bg-[var(--paper-2)] shadow-[0_1px_0_var(--ink-1)] rounded-[3px] font-semibold'
            )}
            style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
          >
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          disabled={isPending}
          className={cn(
            v2 &&
              'bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] rounded-[3px] font-semibold'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
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
  const v2 = useDashboardV2()
  const [open, setOpen] = React.useState(false)

  const portalTarget =
    typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.theme-editorial')
      : null

  const handleSuccess = () => {
    setOpen(false)
    onSuccess?.()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || <Button>Nueva tarea</Button>}
      </SheetTrigger>
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
          onSuccess={handleSuccess}
          onCancel={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
