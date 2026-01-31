'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  UserIcon,
  PhoneIcon,
  MapPinIcon,
  PackageIcon,
  TruckIcon,
  CalendarIcon,
  PencilIcon,
  Trash2Icon,
  ExternalLinkIcon,
  LoaderIcon,
  MessageCircleIcon,
} from 'lucide-react'
import Link from 'next/link'
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
import { moveOrderToStage } from '@/app/actions/orders'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { OrderWithDetails, PipelineStage } from '@/lib/orders/types'

// Format currency in COP
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)
}

// Format date
function formatDate(date: string): string {
  return format(new Date(date), "d 'de' MMMM, yyyy", { locale: es })
}

// Format datetime
function formatDateTime(date: string): string {
  return format(new Date(date), "d MMM yyyy, HH:mm", { locale: es })
}

// Check if tracking number is a valid URL
function isValidTrackingUrl(tracking: string): boolean {
  try {
    new URL(tracking)
    return true
  } catch {
    return false
  }
}

interface OrderSheetProps {
  order: OrderWithDetails | null
  open: boolean
  stages: PipelineStage[]
  onClose: () => void
  onEdit: (order: OrderWithDetails) => void
  onDelete: (order: OrderWithDetails) => void
}

/**
 * Side sheet showing full order details.
 * Opens when clicking a card in Kanban or table.
 */
export function OrderSheet({
  order,
  open,
  stages,
  onClose,
  onEdit,
  onDelete,
}: OrderSheetProps) {
  const router = useRouter()
  const [isChangingStage, setIsChangingStage] = React.useState(false)

  if (!order) return null

  const contact = order.contact
  const stage = order.stage
  const pipeline = order.pipeline
  const products = order.products
  const tags = order.tags

  // Handle stage change
  const handleStageChange = async (newStageId: string) => {
    if (newStageId === order.stage_id) return

    setIsChangingStage(true)
    try {
      const result = await moveOrderToStage(order.id, newStageId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        const newStage = stages.find(s => s.id === newStageId)
        if (result.data?.warning) {
          toast.warning(result.data.warning)
        } else {
          toast.success(`Movido a ${newStage?.name || 'nueva etapa'}`)
        }
        router.refresh()
      }
    } finally {
      setIsChangingStage(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="sm:max-w-[500px] p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <SheetTitle className="text-xl">
                {contact?.name || 'Pedido sin contacto'}
              </SheetTitle>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">
                  {formatCurrency(order.total_value)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {pipeline.name}
              </p>
            </div>
          </div>

          {/* Action buttons + Stage selector */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose()
                onEdit(order)
              }}
            >
              <PencilIcon className="h-4 w-4 mr-2" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                onClose()
                onDelete(order)
              }}
            >
              <Trash2Icon className="h-4 w-4 mr-2" />
              Eliminar
            </Button>
            {contact?.phone && (
              <Button
                variant="outline"
                size="sm"
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                asChild
              >
                <Link href={`/whatsapp?phone=${encodeURIComponent(contact.phone)}`}>
                  <MessageCircleIcon className="h-4 w-4 mr-2" />
                  WhatsApp
                </Link>
              </Button>
            )}

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
                  backgroundColor: `${stage.color}15`,
                  borderColor: stage.color,
                }}
              >
                {isChangingStage ? (
                  <LoaderIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="truncate">{stage.name}</span>
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
            {contact && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Contacto
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <PhoneIcon className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`tel:${contact.phone}`}
                      className="text-primary hover:underline"
                    >
                      {contact.phone}
                    </a>
                  </div>
                  {contact.address && (
                    <div className="flex items-start gap-3">
                      <MapPinIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span>{contact.address}</span>
                    </div>
                  )}
                  {contact.city && (
                    <div className="flex items-center gap-3">
                      <MapPinIcon className="h-4 w-4 text-muted-foreground" />
                      <span>{contact.city}</span>
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
                Productos ({products.length})
              </h3>
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin productos</p>
              ) : (
                <div className="space-y-2">
                  {products.map((product) => (
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
              {order.shipping_address || order.shipping_city || order.carrier || order.tracking_number ? (
                <div className="space-y-2">
                  {(order.shipping_address || order.shipping_city) && (
                    <div className="flex items-start gap-3">
                      <MapPinIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        {order.shipping_address && <p>{order.shipping_address}</p>}
                        {order.shipping_city && <p className="text-muted-foreground">{order.shipping_city}</p>}
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
                      {isValidTrackingUrl(order.tracking_number) ? (
                        <a
                          href={order.tracking_number}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-primary hover:underline flex items-center gap-1"
                        >
                          {order.tracking_number.length > 40
                            ? `${order.tracking_number.substring(0, 40)}...`
                            : order.tracking_number}
                          <ExternalLinkIcon className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="font-mono">{order.tracking_number}</span>
                      )}
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
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Etiquetas
              </h3>
              {tags.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {tags.map((tag) => (
                    <TagBadge key={tag.id} tag={tag} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin etiquetas</p>
              )}
            </section>

            {/* Notes */}
            {order.description && (
              <>
                <Separator />
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Notas
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">{order.description}</p>
                </section>
              </>
            )}

            <Separator />

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
                {order.closing_date && (
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground w-24">Cierre</span>
                    <span>{formatDate(order.closing_date)}</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
