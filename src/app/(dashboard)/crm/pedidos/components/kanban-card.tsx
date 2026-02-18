'use client'

import * as React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { PackageIcon, TruckIcon, MessageCircleIcon, Link2Icon } from 'lucide-react'
import Link from 'next/link'
import { TagBadge } from '@/components/contacts/tag-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { OrderWithDetails } from '@/lib/orders/types'

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
      {...attributes}
      {...listeners}
      suppressHydrationWarning
      onClick={handleClick}
      className={cn(
        'group relative bg-background border rounded-lg p-2.5 shadow-sm cursor-grab active:cursor-grabbing',
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
          <PackageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
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
