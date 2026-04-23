'use client'

import * as React from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  PackageIcon,
  TruckIcon,
  MessageCircleIcon,
  Link2Icon,
  RefreshCwIcon,
  ClockAlertIcon,
  StarIcon,
  WarehouseIcon,
} from 'lucide-react'
import Link from 'next/link'
import { TagBadge } from '@/components/contacts/tag-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { cn } from '@/lib/utils'
import {
  detectOrderProductTypes,
  PRODUCT_TYPE_COLORS,
} from '@/lib/orders/product-types'
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
  const v2 = useDashboardV2()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: isDraggableActive,
  } = useDraggable({ id: order.id })

  const baseStyle: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  }

  const dragging = isDragging || isDraggableActive

  const style: React.CSSProperties = v2
    ? {
        ...baseStyle,
        boxShadow: isSelected
          ? '0 1px 0 var(--ink-1), 0 4px 10px -4px rgba(0,0,0,0.18)'
          : '0 1px 0 var(--border)',
      }
    : baseStyle

  const productTypes = React.useMemo(
    () => detectOrderProductTypes(order.products),
    [order.products]
  )

  const handleClick = (e: React.MouseEvent) => {
    // Only trigger click if not dragging (prevent clicks during drag)
    if (!dragging && onClick) {
      onClick()
    }
  }

  // v2 flag derivations — visual-only sugar (no business rules)
  const isLate = Boolean(
    order.closing_date &&
    new Date(order.closing_date) < new Date() &&
    !order.stage?.is_closed
  )
  const isVip = Boolean(order.tags?.some((t) => t.name?.toLowerCase() === 'vip'))
  const isMayor = order.total_value > 1_000_000

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      suppressHydrationWarning
      onClick={handleClick}
      className={cn(
        'group relative rounded-[3px] cursor-grab active:cursor-grabbing transition-all',
        v2
          ? cn(
              'p-3',
              isSelected
                ? 'bg-[var(--paper-0)] border border-[var(--ink-1)]'
                : 'bg-[var(--paper-1)] border border-[var(--border)] hover:bg-[var(--paper-2)] hover:border-[var(--ink-2)]'
            )
          : cn(
              'bg-background border p-2.5 shadow-sm',
              'hover:border-foreground/20 hover:shadow-md',
              isSelected && 'ring-2 ring-primary border-primary'
            ),
        dragging && (v2 ? 'opacity-50' : 'opacity-50 shadow-lg ring-2 ring-primary/50'),
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
      <div
        className={cn(
          'flex gap-2 mb-2',
          v2 ? 'items-baseline justify-between' : 'items-start justify-between',
          onSelectChange && 'pl-5'
        )}
      >
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
            <PackageIcon
              className={cn(
                'shrink-0',
                v2 ? 'h-3.5 w-3.5 text-[var(--ink-3)]' : 'h-4 w-4 text-muted-foreground'
              )}
            />
          )}
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                'truncate block',
                v2
                  ? 'text-[13.5px] font-semibold tracking-[-0.005em] text-[var(--ink-1)]'
                  : 'font-semibold text-sm'
              )}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            >
              {order.name || 'Sin nombre'}
            </span>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0',
            v2
              ? 'text-[12px] font-semibold text-[var(--ink-1)]'
              : 'font-semibold text-sm text-primary'
          )}
          style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
        >
          {formatCurrency(order.total_value)}
        </span>
      </div>

      {/* Products summary */}
      {order.products.length > 0 && (
        <div
          className={cn(
            'flex items-center gap-2 mb-1.5',
            v2
              ? 'text-[12px] text-[var(--ink-2)] leading-[1.4]'
              : 'text-xs text-muted-foreground'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          <PackageIcon
            className={cn(v2 ? 'h-3 w-3 text-[var(--ink-3)] shrink-0' : 'h-3.5 w-3.5')}
          />
          <span className="truncate">
            {order.products.length === 1
              ? order.products[0].title
              : `${order.products[0].title} +${order.products.length - 1}`}
          </span>
        </div>
      )}

      {/* Tracking info */}
      {order.tracking_number && (
        <div
          className={cn(
            'flex items-center gap-2 mb-1.5',
            v2
              ? 'text-[11px] text-[var(--ink-3)]'
              : 'text-xs text-muted-foreground'
          )}
          style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
        >
          <TruckIcon className={cn(v2 ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          <span className={cn('truncate', !v2 && 'font-mono')}>{order.tracking_number}</span>
          {order.carrier && (
            <span className={cn('text-[10px] uppercase', v2 && 'text-[var(--ink-3)]')}>
              {order.carrier}
            </span>
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
            v2 ? (
              <span className="mx-tag mx-tag--ink">+{order.tags.length - 2}</span>
            ) : (
              <span className="text-[10px] text-muted-foreground px-1 py-0.5">
                +{order.tags.length - 2}
              </span>
            )
          )}
        </div>
      )}

      {/* Footer: Date + WhatsApp + flag pills */}
      <div
        className={cn(
          'flex items-center justify-between pt-2 mt-2',
          v2
            ? 'border-t border-dashed border-[var(--border)] text-[11px] text-[var(--ink-3)]'
            : 'text-[11px] text-muted-foreground pt-1 border-t'
        )}
        style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {(order.source_order_id || order.has_derived_orders) && (
            <span title="Orden conectada">
              <Link2Icon
                className={cn('h-3 w-3', v2 ? 'text-[var(--accent-indigo)]' : 'text-blue-500')}
              />
            </span>
          )}
          <span>{formatRelativeTime(order.created_at)}</span>
          {/* Flag pills — only when v2 */}
          {v2 && isLate && (
            <span className="mx-tag mx-tag--rubric inline-flex items-center gap-1">
              <ClockAlertIcon className="h-2.5 w-2.5" />atrasado
            </span>
          )}
          {v2 && isVip && (
            <span className="mx-tag mx-tag--gold inline-flex items-center gap-1">
              <StarIcon className="h-2.5 w-2.5" />vip
            </span>
          )}
          {v2 && isMayor && (
            <span className="mx-tag mx-tag--indigo inline-flex items-center gap-1">
              <WarehouseIcon className="h-2.5 w-2.5" />mayor
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRecompra && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRecompra(order)
              }}
              className={cn(
                'p-1 rounded transition-colors',
                v2
                  ? 'hover:bg-[var(--paper-3)] text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  : 'hover:bg-blue-100 hover:text-blue-600'
              )}
              title="Recompra"
              aria-label="Crear recompra"
            >
              <RefreshCwIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {order.contact?.phone && (
            <Link
              href={`/whatsapp?phone=${encodeURIComponent(order.contact.phone)}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'p-1 rounded transition-colors',
                v2
                  ? 'hover:bg-[var(--paper-3)] text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  : 'hover:bg-green-100 hover:text-green-600'
              )}
              title="Ver en WhatsApp"
              aria-label="Ver conversación de WhatsApp"
            >
              <MessageCircleIcon className="h-3.5 w-3.5" />
            </Link>
          )}
          {order.contact?.city && (
            <span className={cn('truncate', v2 && 'text-[var(--ink-3)]')}>
              {order.contact.city}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
