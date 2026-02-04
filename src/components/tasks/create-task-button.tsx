'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ListTodo, LoaderIcon, CalendarIcon, Clock, User, ShoppingBag, MessageSquare } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { createTask, getTaskTypes, getWorkspaceMembersForTasks } from '@/app/actions/tasks'
import { cn } from '@/lib/utils'
import type { TaskType, TaskPriority } from '@/lib/tasks/types'

// Simplified member type for task assignment
interface TaskMember {
  user_id: string
  email: string | null
}

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

// Helper: Combine date and time into ISO string
function combineDateAndTime(date: Date, time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const combined = new Date(date)
  combined.setHours(hours, minutes, 0, 0)
  return combined.toISOString()
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
  description: string
  due_date: string | null
  due_time: string
  priority: TaskPriority
  task_type_id: string | null
  assigned_to: string | null
}

interface CreateTaskButtonProps {
  // Pre-fill entity link (at most one)
  contactId?: string
  contactName?: string
  orderId?: string
  orderInfo?: string // e.g., "Pedido #123 - $50,000"
  conversationId?: string
  conversationPhone?: string

  // Styling
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'default' | 'icon'
  className?: string
}

export function CreateTaskButton({
  contactId,
  contactName,
  orderId,
  orderInfo,
  conversationId,
  conversationPhone,
  variant = 'outline',
  size = 'sm',
  className,
}: CreateTaskButtonProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [taskTypes, setTaskTypes] = React.useState<TaskType[]>([])
  const [members, setMembers] = React.useState<TaskMember[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [isPending, setIsPending] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)

  // Determine entity context
  const linkedEntity = React.useMemo(() => {
    if (contactId && contactName) {
      return { type: 'contact' as const, id: contactId, label: contactName, icon: User }
    }
    if (orderId && orderInfo) {
      return { type: 'order' as const, id: orderId, label: orderInfo, icon: ShoppingBag }
    }
    if (conversationId && conversationPhone) {
      return { type: 'conversation' as const, id: conversationId, label: conversationPhone, icon: MessageSquare }
    }
    return null
  }, [contactId, contactName, orderId, orderInfo, conversationId, conversationPhone])

  const form = useForm<FormData>({
    defaultValues: {
      title: '',
      description: '',
      due_date: null,
      due_time: format(addHours(new Date(), 4), 'HH:mm'),
      priority: 'medium',
      task_type_id: null,
      assigned_to: null,
    },
  })

  // Fetch task types and members when sheet opens
  React.useEffect(() => {
    if (open) {
      setIsLoading(true)
      Promise.all([
        getTaskTypes(),
        getWorkspaceMembersForTasks(),
      ]).then(([types, workspaceMembers]) => {
        setTaskTypes(types)
        setMembers(workspaceMembers)
      }).finally(() => {
        setIsLoading(false)
      })
    }
  }, [open])

  // Reset form when sheet closes
  React.useEffect(() => {
    if (!open) {
      form.reset()
      setServerError(null)
    }
  }, [open, form])

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
      const result = await createTask({
        title: data.title,
        description: data.description || undefined,
        due_date: dueDateTime,
        priority: data.priority,
        task_type_id: data.task_type_id || undefined,
        assigned_to: data.assigned_to || undefined,
        // Entity linking
        contact_id: contactId || undefined,
        order_id: orderId || undefined,
        conversation_id: conversationId || undefined,
      })

      if ('error' in result) {
        setServerError(result.error)
        return
      }

      setOpen(false)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button
                variant={variant}
                size={size}
                className={className}
              >
                <ListTodo className={cn('h-4 w-4', size !== 'icon' && 'mr-2')} />
                {size !== 'icon' && 'Tarea'}
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Crear tarea</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <SheetContent className="sm:max-w-[500px] p-0 flex flex-col h-full max-h-screen overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>Nueva tarea</SheetTitle>
          <SheetDescription>
            Crea una nueva tarea para hacer seguimiento
          </SheetDescription>
          {/* Linked entity badge */}
          {linkedEntity && (
            <div className="flex items-center gap-2 pt-2">
              <Badge variant="secondary" className="gap-1.5">
                <linkedEntity.icon className="h-3 w-3" />
                Vinculada a: {linkedEntity.label}
              </Badge>
            </div>
          )}
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoaderIcon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
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

                {/* Due date and time */}
                <div className="space-y-2">
                  <Label htmlFor="due_date">Fecha y hora limite</Label>
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
                              onSelect={(date) => {
                                if (date) {
                                  const localDate = startOfDay(date)
                                  field.onChange(localDate.toISOString())
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
                          <SelectTrigger className="w-[120px]">
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
                                {member.email || 'Usuario'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
                Crear tarea
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
}
