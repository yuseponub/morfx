'use client'

import * as React from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  PackageIcon,
  TruckIcon,
  MessageCircleIcon,
  Link2Icon,
  RefreshCwIcon,
  AlertTriangleIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { TagBadge } from '@/components/contacts/tag-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
import {
  type OrderWithDetails,
  getDuplicateError,
} from '@/lib/orders/types'
import { clearOrderDuplicateError } from '@/app/actions/orders'

// Format currency in COP
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)
}

// Format relative time
function formatRelativeTime(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Ahora'
  if (diffMins < 60) return `Hace ${diffMins}m`
  if (diffHours < 24) return `Hace ${diffHours}h`
  if (diffDays < 7) return `Hace ${diffDays}d`

  return then.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  })
}

interface KanbanCardProps {
  order: OrderWithDetails
  isDragging?: boolean
  onClick?: () => void
  isSelected?: boolean
  onSelectChange?: (selected: boolean) => void
  onRecompra?: (order: OrderWithDetails) => void
}

/**
 * Kanban card representing an order.
 * Draggable with useSortable hook.
 */
export function KanbanCard({
  order,
  isDragging = false,
  onClick,
  isSelected = false,
  onSelectChange,
  onRecompra,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: isDraggableActive,
  } = useDraggable({ id: order.id })

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  }

  const dragging = isDragging || isDraggableActive

  const productTypes = React.useMemo(
    () => detectOrderProductTypes(order.products),
    [order.products]
  )

  // Standalone crm-duplicate-order-products-integrity — D-05 + D-06 badge state
  const duplicateError = React.useMemo(() => getDuplicateError(order), [order])
  const router = useRouter()
  const [isClearing, setIsClearing] = React.useState(false)

  async function handleResolveDuplicateError() {
    setIsClearing(true)
    try {
      const result = await clearOrderDuplicateError(order.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Marca de error eliminada')
      router.refresh()
    } catch {
      toast.error('Error al limpiar la marca de error')
    } finally {
      setIsClearing(false)
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    // Only trigger click if not dragging (prevent clicks during drag)
    if (!dragging && onClick) {
      onClick()
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-selected={isSelected ? 'true' : undefined}
      {...attributes}
      {...listeners}
      suppressHydrationWarning
      onClick={handleClick}
      className={cn(
        'kcard group relative border rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing',
        'hover:border-foreground/20 hover:shadow-md transition-all',
        dragging && 'opacity-50 shadow-lg ring-2 ring-primary/50',
        isSelected && 'ring-2 ring-primary border-primary',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Selection checkbox */}
      {onSelectChange && (
        <div
          className={cn(
            'absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity',
            isSelected && 'opacity-100'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelectChange(checked === true)}
            className="h-4 w-4 bg-background"
          />
        </div>
      )}

      {/* Header: Order name + value */}
      <div className={cn('flex items-start justify-between gap-2 mb-1.5', onSelectChange && 'pl-5')}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {productTypes.length > 0 ? (
            <div className="flex items-center gap-1 shrink-0">
              {productTypes.map((type) => {
                const { label, dotColor } = PRODUCT_TYPE_COLORS[type]
                return (
                  <span
                    key={type}
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: dotColor }}
                    title={label}
                    aria-label={`Tipo de producto: ${label}`}
                    role="img"
                  />
                )
              })}
            </div>
          ) : (
            <PackageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-sm truncate block">
              {order.name || 'Sin nombre'}
            </span>
          </div>
        </div>
        <span className="font-semibold text-sm text-primary shrink-0">
          {formatCurrency(order.total_value)}
        </span>
      </div>

      {/* Duplicate error badge — Standalone crm-duplicate-order-products-integrity */}
      {/* D-05 + D-06: badge permanente + Popover con productos + link source + AlertDialog */}
      {/* P-8/P-9: stopPropagation en TODOS los interactives para no entrar drag mode */}
      {duplicateError && (
        <div
          className="mb-1.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
                  'text-[10px] font-medium',
                  'bg-destructive/10 text-destructive border border-destructive/30',
                  'hover:bg-destructive/15 transition-colors'
                )}
                aria-label="Pedido sin productos — error al duplicar"
              >
                <AlertTriangleIcon className="h-3 w-3" />
                <span>Sin productos</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-80 p-0"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="p-3 border-b">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangleIcon className="h-4 w-4 text-destructive" />
                  Productos no se copiaron al duplicar
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatRelativeTime(duplicateError.failedAt)}
                </p>
              </div>
              <div className="p-3 border-b space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                    {duplicateError.errorCode}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {duplicateError.errorMessage.length > 80
                    ? duplicateError.errorMessage.slice(0, 80) + '…'
                    : duplicateError.errorMessage}
                </p>
              </div>
              <div className="p-3 border-b">
                <p className="text-xs font-medium mb-1.5">
                  Productos que el origen tenia:
                </p>
                <ul className="space-y-1">
                  {duplicateError.attemptedProducts.map((p, i) => (
                    <li
                      key={`${p.sku}-${i}`}
                      className="text-xs text-muted-foreground flex justify-between gap-2"
                    >
                      <span className="truncate">
                        {p.quantity}× {p.title}
                      </span>
                      <span className="shrink-0 font-mono">
                        {formatCurrency(p.unit_price)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-3 border-b">
                <Link
                  href={`/crm/pedidos/${duplicateError.sourceOrderId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Ver pedido origen →
                </Link>
              </div>
              <div className="p-3 flex justify-end">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      disabled={isClearing}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Marcar resuelto
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Marcar como resuelto?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esto eliminara la marca de error del pedido. Asegurate de
                        haber agregado los productos correctos antes de continuar.
                        La accion no se puede deshacer (pero puedes volver a
                        editar productos del pedido normalmente).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                        Cancelar
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.stopPropagation()
                          handleResolveDuplicateError()
                        }}
                        disabled={isClearing}
                      >
                        Marcar resuelto
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Products summary */}
      {order.products.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
          <PackageIcon className="h-3.5 w-3.5" />
          <span className="truncate">
            {order.products.length === 1
              ? order.products[0].title
              : `${order.products[0].title} +${order.products.length - 1}`}
          </span>
        </div>
      )}

      {/* Tracking info */}
      {order.tracking_number && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
          <TruckIcon className="h-3.5 w-3.5" />
          <span className="font-mono truncate">{order.tracking_number}</span>
          {order.carrier && (
            <span className="text-[10px] uppercase">{order.carrier}</span>
          )}
        </div>
      )}

      {/* Tags */}
      {order.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-1.5">
          {order.tags.slice(0, 2).map((tag) => (
            <TagBadge key={tag.id} tag={tag} size="sm" />
          ))}
          {order.tags.length > 2 && (
            <span className="text-[10px] text-muted-foreground px-1 py-0.5">
              +{order.tags.length - 2}
            </span>
          )}
        </div>
      )}

      {/* Footer: Date + WhatsApp */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
        <div className="flex items-center gap-1">
          {(order.source_order_id || order.has_derived_orders) && (
            <span title="Orden conectada">
              <Link2Icon className="h-3 w-3 text-blue-500" />
            </span>
          )}
          <span>{formatRelativeTime(order.created_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          {onRecompra && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRecompra(order)
              }}
              className="p-1 rounded hover:bg-blue-100 hover:text-blue-600 transition-colors"
              title="Recompra"
            >
              <RefreshCwIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {order.contact?.phone && (
            <Link
              href={`/whatsapp?phone=${encodeURIComponent(order.contact.phone)}`}
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded hover:bg-green-100 hover:text-green-600 transition-colors"
              title="Ver en WhatsApp"
            >
              <MessageCircleIcon className="h-3.5 w-3.5" />
            </Link>
          )}
          {order.contact?.city && (
            <span className="truncate">{order.contact.city}</span>
          )}
        </div>
      </div>
    </div>
  )
}
