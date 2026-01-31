'use client'

import * as React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
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

  // Make column a drop target for orders
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: stage.id,
  })

  // Combine refs
  const setNodeRef = (node: HTMLDivElement | null) => {
    setSortableRef(node)
    setDroppableRef(node)
  }

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
        'flex flex-col w-72 min-w-72 bg-muted/30 rounded-lg border',
        isOver && 'ring-2 ring-primary/50',
        isAtLimit && !isOverLimit && 'border-amber-400/50',
        isOverLimit && 'border-destructive/50',
        isDragging && 'opacity-50'
      )}
    >
      {/* Column header */}
      <div className="group flex items-center gap-2 p-3 border-b bg-muted/50 rounded-t-lg">
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
          {orderCount}
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
      <SortableContext
        items={orders.map((o) => o.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]">
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
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}
