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
import { ContactSelector } from './contact-selector'
import { ProductPicker } from './product-picker'
import { CityCombobox } from '@/components/contacts/city-combobox'
import { createOrder, updateOrder, type OrderFormData } from '@/app/actions/orders'
import { cn } from '@/lib/utils'
import type { OrderWithDetails, PipelineWithStages, Product, OrderProductFormData } from '@/lib/orders/types'
import type { ContactWithTags } from '@/lib/types/database'

// Form data type (simpler than Zod inference for react-hook-form compatibility)
interface FormData {
  contact_id: string | null
  pipeline_id: string
  stage_id: string
  closing_date: string | null
  description: string | null
  carrier: string | null
  tracking_number: string | null
  shipping_address: string | null
  shipping_city: string | null
  products: Array<{
    product_id?: string | null
    sku: string
    title: string
    unit_price: number
    quantity: number
  }>
}

interface OrderFormProps {
  mode: 'create' | 'edit'
  order?: OrderWithDetails
  pipelines: PipelineWithStages[]
  products: Product[]
  contacts: ContactWithTags[]
  defaultPipelineId?: string
  defaultStageId?: string
  defaultContactId?: string
  /** Pre-fill phone when creating new contact inline (e.g., from WhatsApp) */
  defaultPhone?: string
  /** Called when a new contact is created inline (e.g., to link to conversation) */
  onContactCreated?: (contact: ContactWithTags) => void
  onSuccess?: () => void
  onCancel?: () => void
}

export function OrderForm({
  mode,
  order,
  pipelines,
  products,
  contacts: initialContacts,
  defaultPipelineId,
  defaultStageId,
  defaultContactId,
  defaultPhone,
  onContactCreated,
  onSuccess,
  onCancel,
}: OrderFormProps) {
  const [isPending, setIsPending] = React.useState(false)
  const [serverError, setServerError] = React.useState<string | null>(null)
  // Local contacts state to allow adding new contacts without page refresh
  const [contacts, setContacts] = React.useState(initialContacts)

  // Handle new contact created inline
  const handleContactCreated = React.useCallback((newContact: ContactWithTags) => {
    setContacts(prev => [newContact, ...prev])
    // Also call external callback (e.g., to link contact to WhatsApp conversation)
    onContactCreated?.(newContact)
  }, [onContactCreated])

  const defaultValues: FormData = React.useMemo(() => {
    if (mode === 'edit' && order) {
      return {
        contact_id: order.contact_id,
        pipeline_id: order.pipeline_id,
        stage_id: order.stage_id,
        closing_date: order.closing_date,
        description: order.description,
        carrier: order.carrier,
        tracking_number: order.tracking_number,
        shipping_address: order.shipping_address,
        shipping_city: order.shipping_city,
        products: order.products.map((p) => ({
          product_id: p.product_id,
          sku: p.sku,
          title: p.title,
          unit_price: p.unit_price,
          quantity: p.quantity,
        })),
      }
    }
    // Default closing date to now (Colombia timezone)
    const now = new Date()
    const closingDate = now.toISOString()

    return {
      contact_id: defaultContactId || null,
      pipeline_id: defaultPipelineId || pipelines[0]?.id || '',
      stage_id: defaultStageId || pipelines[0]?.stages[0]?.id || '',
      closing_date: closingDate,
      description: null,
      carrier: null,
      tracking_number: null,
      shipping_address: null,
      shipping_city: null,
      products: [],
    }
  }, [mode, order, defaultPipelineId, defaultStageId, defaultContactId, pipelines])

  const form = useForm<FormData>({
    defaultValues,
  })

  const watchPipelineId = form.watch('pipeline_id')

  // Get stages for selected pipeline
  const selectedPipeline = React.useMemo(() => {
    return pipelines.find((p) => p.id === watchPipelineId)
  }, [pipelines, watchPipelineId])

  // Reset stage when pipeline changes (unless editing)
  React.useEffect(() => {
    if (mode === 'create' && selectedPipeline?.stages.length) {
      const currentStageId = form.getValues('stage_id')
      const stageInPipeline = selectedPipeline.stages.find((s) => s.id === currentStageId)
      if (!stageInPipeline) {
        form.setValue('stage_id', selectedPipeline.stages[0].id)
      }
    }
  }, [watchPipelineId, selectedPipeline, form, mode])

  const handleSubmit = async (data: FormData) => {
    setIsPending(true)
    setServerError(null)

    try {
      const formData: OrderFormData = {
        contact_id: data.contact_id ?? null,
        pipeline_id: data.pipeline_id,
        stage_id: data.stage_id,
        closing_date: data.closing_date ?? null,
        description: data.description ?? null,
        carrier: data.carrier ?? null,
        tracking_number: data.tracking_number ?? null,
        shipping_address: data.shipping_address ?? null,
        shipping_city: data.shipping_city ?? null,
        custom_fields: {},
        products: data.products ?? [],
      }

      const result =
        mode === 'edit' && order
          ? await updateOrder(order.id, formData)
          : await createOrder(formData)

      if ('error' in result) {
        if (result.field) {
          form.setError(result.field as keyof FormData, {
            message: result.error,
          })
        } else {
          setServerError(result.error)
        }
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

          {/* Contact Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Contacto</Label>
            <Controller
              control={form.control}
              name="contact_id"
              render={({ field }) => (
                <ContactSelector
                  contacts={contacts}
                  value={field.value ?? null}
                  onChange={field.onChange}
                  onContactCreated={handleContactCreated}
                  disabled={isPending}
                  defaultPhone={defaultPhone}
                />
              )}
            />
          </div>

          {/* Products Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Productos</Label>
            <Controller
              control={form.control}
              name="products"
              render={({ field }) => (
                <ProductPicker
                  products={products}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isPending}
                />
              )}
            />
          </div>

          {/* Details Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Detalles</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pipeline_id">Pipeline</Label>
                <Controller
                  control={form.control}
                  name="pipeline_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona pipeline" />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelines.map((pipeline) => (
                          <SelectItem key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.pipeline_id && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.pipeline_id.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="stage_id">Etapa</Label>
                <Controller
                  control={form.control}
                  name="stage_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending || !selectedPipeline}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedPipeline?.stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: stage.color }}
                              />
                              {stage.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.stage_id && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.stage_id.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="closing_date">Fecha de cierre</Label>
              <Controller
                control={form.control}
                name="closing_date"
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
                    </PopoverContent>
                  </Popover>
                )}
              />
            </div>
          </div>

          {/* Shipping Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Envio</Label>

            {/* Shipping Address */}
            <div className="space-y-2">
              <Label htmlFor="shipping_address">Direccion de envio</Label>
              <Input
                {...form.register('shipping_address')}
                placeholder="Calle 123 # 45-67, Apto 101"
                disabled={isPending}
              />
            </div>

            {/* Shipping City */}
            <Controller
              control={form.control}
              name="shipping_city"
              render={({ field }) => (
                <CityCombobox
                  id="shipping_city"
                  value={field.value || ''}
                  onChange={field.onChange}
                  disabled={isPending}
                />
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="carrier">Transportadora</Label>
                <Controller
                  control={form.control}
                  name="carrier"
                  render={({ field }) => (
                    <Select
                      value={field.value || ''}
                      onValueChange={(val) => field.onChange(val || null)}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="coordinadora">Coordinadora</SelectItem>
                        <SelectItem value="interrapidisimo">Interrapidisimo</SelectItem>
                        <SelectItem value="envia">Envia</SelectItem>
                        <SelectItem value="servientrega">Servientrega</SelectItem>
                        <SelectItem value="tcc">TCC</SelectItem>
                        <SelectItem value="deprisa">Deprisa</SelectItem>
                        <SelectItem value="otra">Otra</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tracking_number">Numero de guia</Label>
                <Input
                  {...form.register('tracking_number')}
                  placeholder="123456789"
                  disabled={isPending}
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="space-y-3">
            <Label htmlFor="description">Notas</Label>
            <Textarea
              {...form.register('description')}
              placeholder="Notas adicionales sobre el pedido..."
              disabled={isPending}
              rows={3}
            />
          </div>
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
          {mode === 'edit' ? 'Guardar cambios' : 'Crear pedido'}
        </Button>
      </div>
    </form>
  )
}
