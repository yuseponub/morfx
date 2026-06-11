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
  /** Editorial v3 render branch (standalone ui-redesign-editorial-core, Plan 03). */
  v3?: boolean
  /** Dot color class (.agend/.web/.nuevo/.info/.conf/.ok) for the v3 stage head. */
  v3DotClass?: string
}

/**
 * Editorial dot color classes cycled by stage position (UI-SPEC §6.3). Stages
 * are workspace-configurable so there is no fixed slug — cycle the mock's
 * stage colors in declared order. The real `stage.color` still drives the
 * legacy path; v3 uses these token-built classes. (Vivificación v3 2026-06:
 * 7th class `cancel` added; color resolution moved to `--stage-c` on
 * `.kcol-head.s-*` in globals.css.)
 */
const V3_DOT_CLASSES = ['agend', 'web', 'nuevo', 'info', 'conf', 'ok', 'cancel'] as const

export function v3DotClassForIndex(index: number): string {
  return V3_DOT_CLASSES[index % V3_DOT_CLASSES.length]
}

/**
 * Map well-known stage NAMES to a stable dot class so "Confirmado" is always
 * salvia and "Cancelado" always red even if the operator reorders columns
 * (Vivificación v3 2026-06). Unknown names fall back to the position cycle.
 */
const V3_STAGE_NAME_CLASS: Record<string, string> = {
  'agendado': 'agend', 'nuevo pag web': 'web', 'nuevo pedido': 'nuevo', 'nuevo': 'nuevo',
  'falta info': 'info', 'falta confirmar': 'conf', 'por confirmar': 'conf',
  'confirmado': 'ok', 'entregado': 'ok', 'ganado': 'ok',
  'cancelado': 'cancel', 'perdido': 'cancel', 'devuelto': 'cancel', 'rechazado': 'cancel',
}

export function v3StageClass(stageName: string, index: number): string {
  return V3_STAGE_NAME_CLASS[stageName.trim().toLowerCase()] ?? v3DotClassForIndex(index)
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
  v3 = false,
  v3DotClass = 'nuevo',
}: KanbanColumnProps) {
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

  // ==========================================================================
  // Editorial v3 render branch (standalone ui-redesign-editorial-core, Plan 03).
  // Hairline-separated `.kcol` (flex-basis 246px, border-left, first-child no
  // border) + `.kcol-head` (stage dot + uppercase title + mono count) + loose
  // `.kcard` cards + serif-italic "Sin pedidos" `.kempty` for empty columns
  // (UI-SPEC §6.3). The drop-target ref + sortable wiring + infinite-scroll
  // sentinel are the SAME as the legacy path — only markup/className changes.
  // Columns are NOT wrapped in bordered card boxes — that is the signature.
  // ==========================================================================
  if (v3) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn('kcol', isOver && 'ring-1 ring-primary/40', isDragging && 'opacity-50')}
      >
        {/* Column head — drag handle is the whole head via attributes/listeners.
            `s-${v3DotClass}` sets --stage-c (dot + contador + línea superior). */}
        <div className={cn('kcol-head', `s-${v3DotClass}`)} {...attributes} {...listeners} suppressHydrationWarning>
          <span className={cn('dot', v3DotClass)} />
          <span className="t" title={stage.name}>{stage.name}</span>
          <span className="c">{totalCount !== undefined ? totalCount : orderCount}</span>
        </div>

        {/* Cards container */}
        <div className="kcol-body">
          {orders.length === 0 ? (
            <div className="kempty">Sin pedidos</div>
          ) : (
            orders.map((order) => (
              <KanbanCard
                key={order.id}
                order={order}
                v3
                onClick={() => onOrderClick(order)}
                isSelected={selectedOrderIds?.has(order.id) ?? false}
                onSelectChange={
                  onOrderSelectChange ? (selected) => onOrderSelectChange(order.id, selected) : undefined
                }
                onRecompra={onRecompra}
              />
            ))
          )}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-2">
              {isLoadingMore ? (
                <div className="kempty" style={{ padding: '8px 0' }}>Cargando…</div>
              ) : (
                <div className="h-4" />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, backgroundColor: '#fafaf5' }}
      className={cn(
        'flex flex-col w-72 min-w-72 rounded-lg border',
        isOver && 'ring-2 ring-primary/50',
        isAtLimit && !isOverLimit && 'border-amber-400/50',
        isOverLimit && 'border-destructive/50',
        isDragging && 'opacity-50'
      )}
    >
      {/* Column header */}
      <div
        className="group flex items-center gap-2 p-3 border-b rounded-t-lg"
        style={{ backgroundColor: '#fafaf5' }}
      >
        {/* Drag handle - suppressHydrationWarning for DndKit aria-describedby mismatch */}
        <button
          {...attributes}
          {...listeners}
          suppressHydrationWarning
          className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 hover:bg-muted rounded opacity-50 hover:opacity-100 transition-opacity"
          title="Arrastrar para reordenar"
        >
          <GripVerticalIcon className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Stage color dot */}
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: stage.color }}
        />

        {/* Stage name */}
        <span className="font-medium text-sm flex-1 truncate">{stage.name}</span>

        {/* Order count */}
        <Badge
          variant={isOverLimit ? 'destructive' : isAtLimit ? 'secondary' : 'outline'}
          className="h-5 px-1.5 text-xs font-normal"
        >
          {totalCount !== undefined ? totalCount : orderCount}
          {wipLimit !== null && (
            <span className="text-muted-foreground ml-0.5">/ {wipLimit}</span>
          )}
        </Badge>

        {/* Closed stage indicator */}
        {stage.is_closed && (
          <Badge variant="outline" className="h-5 px-1.5 text-xs">
            Cerrado
          </Badge>
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
          <DropdownMenuContent align="end" className="w-48">
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
        <div className="px-3 py-1.5 bg-destructive/10 text-destructive text-xs">
          Limite WIP excedido ({orderCount}/{wipLimit})
        </div>
      )}

      {/* Cards container */}
      <div className="flex-1 p-2 space-y-1.5 overflow-y-auto min-h-[100px] scrollbar-overlay">
        {orders.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-8">
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
              <div className="text-xs text-muted-foreground">Cargando...</div>
            ) : (
              <div className="h-4" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
