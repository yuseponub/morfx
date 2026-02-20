'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Loader2,
  UserIcon,
  PhoneIcon,
  MapPinIcon,
  PackageIcon,
  TruckIcon,
  CalendarIcon,
  PencilIcon,
  ExternalLinkIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TagBadge } from '@/components/contacts/tag-badge'
import { OrderForm } from '@/app/(dashboard)/crm/pedidos/components/order-form'
import { getOrder, getPipelines, moveOrderToStage } from '@/app/actions/orders'
import { getActiveProducts } from '@/app/actions/products'
import { toast } from 'sonner'
import type { OrderWithDetails, PipelineWithStages, Product, PipelineStage } from '@/lib/orders/types'

// Format currency in COP
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)
}

// Format datetime
function formatDateTime(date: string): string {
  return format(new Date(date), "d MMM yyyy, HH:mm", { locale: es })
}

interface ViewOrderSheetProps {
  orderId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

/**
 * Sheet for viewing and editing an order from WhatsApp module.
 * Loads order data when opened.
 */
export function ViewOrderSheet({
  orderId,
  open,
  onOpenChange,
  onSuccess,
}: ViewOrderSheetProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = React.useState(true)
  const [isEditing, setIsEditing] = React.useState(false)
  const [isChangingStage, setIsChangingStage] = React.useState(false)
  const [order, setOrder] = React.useState<OrderWithDetails | null>(null)
  const [pipelines, setPipelines] = React.useState<PipelineWithStages[]>([])
  const [products, setProducts] = React.useState<Product[]>([])
  const [stages, setStages] = React.useState<PipelineStage[]>([])

  // Load order data when sheet opens
  React.useEffect(() => {
    if (!open || !orderId) return

    // Capture orderId for TypeScript narrowing
    const currentOrderId = orderId

    async function loadData() {
      setIsLoading(true)
      setIsEditing(false)
      try {
        const [orderData, pipelinesData, productsData] = await Promise.all([
          getOrder(currentOrderId),
          getPipelines(),
          getActiveProducts(),
        ])

        if (orderData) {
          setOrder(orderData)
          // Get stages for this order's pipeline
          const pipeline = pipelinesData.find(p => p.id === orderData.pipeline_id)
          setStages(pipeline?.stages || [])
        }
        setPipelines(pipelinesData)
        setProducts(productsData)
      } catch (error) {
        console.error('Error loading order:', error)
        toast.error('Error al cargar el pedido')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [open, orderId])

  const handleClose = () => {
    onOpenChange(false)
    setIsEditing(false)
  }

  const handleEditSuccess = () => {
    setIsEditing(false)
    // Reload order data
    if (orderId) {
      getOrder(orderId).then(setOrder)
    }
    router.refresh()
    onSuccess?.()
  }

  // Handle stage change
  const handleStageChange = async (newStageId: string) => {
    if (!order || newStageId === order.stage_id) return

    setIsChangingStage(true)
    try {
      const result = await moveOrderToStage(order.id, newStageId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        const newStage = stages.find(s => s.id === newStageId)
        toast.success(`Movido a ${newStage?.name || 'nueva etapa'}`)
        // Reload order
        const updatedOrder = await getOrder(order.id)
        if (updatedOrder) setOrder(updatedOrder)
        router.refresh()
      }
    } finally {
      setIsChangingStage(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="sm:max-w-[550px] p-0 flex flex-col h-full max-h-screen overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <SheetTitle className="sr-only">Cargando pedido</SheetTitle>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !order ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <SheetTitle className="sr-only">Pedido no encontrado</SheetTitle>
            <p className="text-muted-foreground">Pedido no encontrado</p>
          </div>
        ) : isEditing ? (
          // Edit mode
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b">
              <SheetTitle>Editar pedido</SheetTitle>
            </SheetHeader>
            <OrderForm
              mode="edit"
              order={order}
              pipelines={pipelines}
              products={products}
              onSuccess={handleEditSuccess}
              onCancel={() => setIsEditing(false)}
            />
          </>
        ) : (
          // View mode
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <SheetTitle className="text-xl">
                    {order.contact?.name || 'Pedido sin contacto'}
                  </SheetTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-primary">
                      {formatCurrency(order.total_value)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {order.pipeline.name}
                  </p>
                </div>
              </div>

              {/* Action buttons + Stage selector */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <PencilIcon className="h-4 w-4 mr-2" />
                  Editar
                </Button>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Stage selector */}
                <Select
                  value={order.stage_id}
                  onValueChange={handleStageChange}
                  disabled={isChangingStage}
                >
                  <SelectTrigger
                    className="w-[150px] h-9"
                    style={{
                      backgroundColor: `${order.stage.color}15`,
                      borderColor: order.stage.color,
                    }}
                  >
                    {isChangingStage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: order.stage.color }}
                        />
                        <span className="truncate">{order.stage.name}</span>
                      </div>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SheetHeader>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Contact info */}
                {order.contact && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Contacto
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                        <span>{order.contact.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <PhoneIcon className="h-4 w-4 text-muted-foreground" />
                        <span>{order.contact.phone}</span>
                      </div>
                      {order.contact.city && (
                        <div className="flex items-center gap-3">
                          <MapPinIcon className="h-4 w-4 text-muted-foreground" />
                          <span>{order.contact.city}</span>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <Separator />

                {/* Products */}
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <PackageIcon className="h-4 w-4" />
                    Productos ({order.products.length})
                  </h3>
                  {order.products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin productos</p>
                  ) : (
                    <div className="space-y-2">
                      {order.products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {product.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              SKU: {product.sku} x {product.quantity}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <div className="font-medium text-sm">
                              {formatCurrency(product.subtotal)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatCurrency(product.unit_price)} c/u
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Total */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="font-semibold">Total</span>
                        <span className="font-bold text-lg text-primary">
                          {formatCurrency(order.total_value)}
                        </span>
                      </div>
                    </div>
                  )}
                </section>

                <Separator />

                {/* Shipping */}
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <TruckIcon className="h-4 w-4" />
                    Envio
                  </h3>
                  {order.carrier || order.tracking_number || order.shipping_address ? (
                    <div className="space-y-2">
                      {order.shipping_address && (
                        <div className="flex items-start gap-3">
                          <MapPinIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <span>{order.shipping_address}</span>
                            {order.shipping_city && (
                              <span className="text-muted-foreground"> - {order.shipping_city}</span>
                            )}
                          </div>
                        </div>
                      )}
                      {order.carrier && (
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground text-sm w-24">Transportadora</span>
                          <span className="capitalize">{order.carrier}</span>
                        </div>
                      )}
                      {order.tracking_number && (
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground text-sm w-24">Guia</span>
                          <span className="font-mono">{order.tracking_number}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sin informacion de envio
                    </p>
                  )}
                </section>

                <Separator />

                {/* Tags */}
                {order.tags && order.tags.length > 0 && (
                  <>
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Etiquetas
                      </h3>
                      <div className="flex gap-2 flex-wrap">
                        {order.tags.map((tag) => (
                          <TagBadge key={tag.id} tag={tag} />
                        ))}
                      </div>
                    </section>
                    <Separator />
                  </>
                )}

                {/* Notes */}
                {order.description && (
                  <>
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Notas
                      </h3>
                      <p className="text-sm whitespace-pre-wrap">{order.description}</p>
                    </section>
                    <Separator />
                  </>
                )}

                {/* Timeline */}
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Fechas
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground w-24">Creado</span>
                      <span>{formatDateTime(order.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground w-24">Actualizado</span>
                      <span>{formatDateTime(order.updated_at)}</span>
                    </div>
                  </div>
                </section>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
