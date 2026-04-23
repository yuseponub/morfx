'use client'

import * as React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon, MoreHorizontalIcon, PencilIcon, PaletteIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { KanbanCard } from './kanban-card'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { cn } from '@/lib/utils'
import type { OrderWithDetails, PipelineStage } from '@/lib/orders/types'

interface KanbanColumnProps {
  stage: PipelineStage
  orders: OrderWithDetails[]
  onOrderClick: (order: OrderWithDetails) => void
  onEditStage?: (stage: PipelineStage) => void
  onDeleteStage?: (stage: PipelineStage) => void
  onAddStage?: () => void
  selectedOrderIds?: Set<string>
  onOrderSelectChange?: (orderId: string, selected: boolean) => void
  onRecompra?: (order: OrderWithDetails) => void
  totalCount?: number
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
}

/**
 * Kanban column representing a pipeline stage.
 * Acts as a drop target for orders and is sortable for reordering.
 */
export function KanbanColumn({
  stage,
  orders,
  onOrderClick,
  onEditStage,
  onDeleteStage,
  onAddStage,
  selectedOrderIds,
  onOrderSelectChange,
  onRecompra,
  totalCount,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: KanbanColumnProps) {
  const v2 = useDashboardV2()

  // Make column sortable (for reordering stages)
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: stage.id,
    data: { type: 'stage', stage },
  })

  // Make column a drop target for order cards (useDraggable)
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: stage.id,
  })

  // Combine sortable + droppable refs
  const setNodeRef = React.useCallback(
    (node: HTMLElement | null) => {
      setSortableRef(node)
      setDroppableRef(node)
    },
    [setSortableRef, setDroppableRef]
  )

  // Infinite scroll sentinel
  const sentinelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore || !onLoadMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, onLoadMore])

  // Sortable styles
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Calculate WIP status
  const orderCount = orders.length
  const wipLimit = stage.wip_limit
  const isAtLimit = wipLimit !== null && orderCount >= wipLimit
  const isOverLimit = wipLimit !== null && orderCount > wipLimit

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-col w-72 min-w-72 rounded-[3px]',
        v2
          ? 'bg-[var(--paper-0)] border border-[var(--ink-1)]'
          : 'bg-muted/30 border',
        isOver && (v2 ? 'ring-2 ring-[var(--rubric-2)]/40' : 'ring-2 ring-primary/50'),
        isAtLimit && !isOverLimit && (v2 ? 'border-[var(--accent-gold)]' : 'border-amber-400/50'),
        isOverLimit && (v2 ? 'border-[var(--rubric-2)]' : 'border-destructive/50'),
        isDragging && 'opacity-50'
      )}
    >
      {/* Column header */}
      <div
        className={cn(
          'group flex items-center gap-2 p-3',
          v2
            ? 'border-b border-[var(--ink-1)] bg-[var(--paper-1)] rounded-t-[3px]'
            : 'border-b bg-muted/50 rounded-t-lg'
        )}
      >
        {/* Drag handle - suppressHydrationWarning for DndKit aria-describedby mismatch */}
        <button
          {...attributes}
          {...listeners}
          suppressHydrationWarning
          className={cn(
            'cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded opacity-50 hover:opacity-100 transition-opacity',
            v2 ? 'hover:bg-[var(--paper-3)]' : 'hover:bg-muted'
          )}
          title="Arrastrar para reordenar"
        >
          <GripVerticalIcon
            className={cn('h-4 w-4', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}
          />
        </button>

        {/* Stage color dot */}
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: stage.color }}
        />

        {/* Stage name */}
        <span
          className={cn(
            'flex-1 truncate',
            v2
              ? 'text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-1)]'
              : 'font-medium text-sm'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          {stage.name}
        </span>

        {/* Order count */}
        {v2 ? (
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border',
              isOverLimit
                ? 'bg-[var(--paper-3)] text-[var(--rubric-2)] border-[var(--rubric-2)]'
                : isAtLimit
                  ? 'bg-[var(--paper-3)] text-[var(--accent-gold)] border-[var(--accent-gold)]'
                  : 'bg-[var(--paper-3)] text-[var(--ink-3)] border-[var(--border)]'
            )}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {totalCount !== undefined ? totalCount : orderCount}
            {wipLimit !== null && (
              <span className="ml-0.5 text-[var(--ink-3)]">/ {wipLimit}</span>
            )}
          </span>
        ) : (
          <Badge
            variant={isOverLimit ? 'destructive' : isAtLimit ? 'secondary' : 'outline'}
            className="h-5 px-1.5 text-xs font-normal"
          >
            {totalCount !== undefined ? totalCount : orderCount}
            {wipLimit !== null && (
              <span className="text-muted-foreground ml-0.5">/ {wipLimit}</span>
            )}
          </Badge>
        )}

        {/* Closed stage indicator */}
        {stage.is_closed && (
          v2 ? (
            <span className="mx-tag mx-tag--ink">Cerrado</span>
          ) : (
            <Badge variant="outline" className="h-5 px-1.5 text-xs">
              Cerrado
            </Badge>
          )
        )}

        {/* Stage menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48"
            portalContainer={
              v2
                ? (typeof document !== 'undefined'
                    ? document.querySelector<HTMLElement>('[data-theme-scope="dashboard-editorial"]')
                    : undefined)
                : undefined
            }
          >
            <DropdownMenuItem onClick={() => onEditStage?.(stage)}>
              <PencilIcon className="h-4 w-4 mr-2" />
              Editar etapa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEditStage?.(stage)}>
              <PaletteIcon className="h-4 w-4 mr-2" />
              Cambiar color
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAddStage?.()}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Agregar etapa
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteStage?.(stage)}
              className="text-destructive focus:text-destructive"
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Eliminar etapa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* WIP warning */}
      {isOverLimit && (
        <div
          className={cn(
            'px-3 py-1.5 text-xs',
            v2
              ? 'bg-[var(--rubric-2)]/10 text-[var(--rubric-2)] border-b border-[var(--rubric-2)]/30'
              : 'bg-destructive/10 text-destructive'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          Limite WIP excedido ({orderCount}/{wipLimit})
        </div>
      )}

      {/* Cards container */}
      <div className="flex-1 p-2 space-y-1.5 overflow-y-auto min-h-[100px]">
        {orders.length === 0 ? (
          <div
            className={cn(
              'flex items-center justify-center h-full text-sm py-8',
              v2 ? 'text-[var(--ink-3)] italic' : 'text-muted-foreground'
            )}
            style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
          >
            Sin pedidos
          </div>
        ) : (
          orders.map((order) => (
            <KanbanCard
              key={order.id}
              order={order}
              onClick={() => onOrderClick(order)}
              isSelected={selectedOrderIds?.has(order.id) ?? false}
              onSelectChange={onOrderSelectChange ? (selected) => onOrderSelectChange(order.id, selected) : undefined}
              onRecompra={onRecompra}
            />
          ))
        )}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-2">
            {isLoadingMore ? (
              <div
                className={cn(
                  'text-xs',
                  v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'
                )}
                style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
              >
                Cargando...
              </div>
            ) : (
              <div className="h-4" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
