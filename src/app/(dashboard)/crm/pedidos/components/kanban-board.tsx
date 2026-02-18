'use client'

import * as React from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import { moveOrderToStage } from '@/app/actions/orders'
import { updateStageOrder } from '@/app/actions/pipelines'
import { toast } from 'sonner'
import type { OrderWithDetails, PipelineStage, OrdersByStage } from '@/lib/orders/types'

interface KanbanBoardProps {
  stages: PipelineStage[]
  ordersByStage: OrdersByStage
  pipelineId: string
  onOrderClick: (order: OrderWithDetails) => void
  onEditStage?: (stage: PipelineStage) => void
  onDeleteStage?: (stage: PipelineStage) => void
  onAddStage?: () => void
  selectedOrderIds?: Set<string>
  onOrderSelectChange?: (orderId: string, selected: boolean) => void
  onStagesReorder?: (stages: PipelineStage[]) => void
  stageCounts?: Record<string, number>
  stageHasMore?: Record<string, boolean>
  stageLoading?: Record<string, boolean>
  onLoadMore?: (stageId: string) => void
  onOrderMoved?: (orderId: string, fromStageId: string, toStageId: string) => void
}

/**
 * Custom collision detection that uses different strategies
 * depending on whether we're dragging a stage or an order.
 */
function createCustomCollisionDetection(
  stageIds: Set<string>
): CollisionDetection {
  return (args) => {
    const { active } = args
    const activeData = active.data.current

    // If dragging a stage, use closestCenter for smooth horizontal sorting
    if (activeData?.type === 'stage') {
      // Filter to only consider other stages as drop targets
      const stageContainers = args.droppableContainers.filter(
        (container) => stageIds.has(container.id as string)
      )
      return closestCenter({
        ...args,
        droppableContainers: stageContainers,
      })
    }

    // If dragging an order, use pointerWithin for better column detection
    // Fall back to rectIntersection if pointerWithin finds nothing
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) {
      // Filter to only stage columns (not other orders)
      const stageCollisions = pointerCollisions.filter(
        (collision) => stageIds.has(collision.id as string)
      )
      if (stageCollisions.length > 0) {
        return stageCollisions
      }
    }

    // Fallback to rectIntersection
    const rectCollisions = rectIntersection(args)
    return rectCollisions.filter(
      (collision) => stageIds.has(collision.id as string)
    )
  }
}

/**
 * Kanban board with drag-and-drop between columns.
 * Uses @dnd-kit for accessible drag behavior.
 * Supports dragging both orders (cards) and stages (columns).
 */
export function KanbanBoard({
  stages,
  ordersByStage,
  pipelineId,
  onOrderClick,
  onEditStage,
  onDeleteStage,
  onAddStage,
  selectedOrderIds,
  onOrderSelectChange,
  onStagesReorder,
  stageCounts,
  stageHasMore,
  stageLoading,
  onLoadMore,
  onOrderMoved,
}: KanbanBoardProps) {
  // Track the order being dragged for overlay
  const [activeOrder, setActiveOrder] = React.useState<OrderWithDetails | null>(null)
  // Track the stage being dragged for overlay
  const [activeStage, setActiveStage] = React.useState<PipelineStage | null>(null)
  // Track pending moves to prevent double-moves
  const [pendingMoveId, setPendingMoveId] = React.useState<string | null>(null)
  // Local state for optimistic updates
  const [localOrdersByStage, setLocalOrdersByStage] = React.useState(ordersByStage)
  // Local state for stages order (optimistic)
  const [localStages, setLocalStages] = React.useState(stages)

  // Sync local state when prop changes
  React.useEffect(() => {
    setLocalOrdersByStage(ordersByStage)
  }, [ordersByStage])

  // Sync local stages when prop changes
  React.useEffect(() => {
    setLocalStages(stages)
  }, [stages])

  // Create stage IDs set for collision detection
  const stageIds = React.useMemo(
    () => new Set(localStages.map((s) => s.id)),
    [localStages]
  )

  // Memoized custom collision detection
  const collisionDetection = React.useMemo(
    () => createCustomCollisionDetection(stageIds),
    [stageIds]
  )

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags on click
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  /**
   * Handle drag start - determine if dragging order or stage
   */
  const handleDragStart = (event: DragStartEvent) => {
    const activeId = event.active.id as string
    const activeData = event.active.data.current

    // Check if dragging a stage (column)
    if (activeData?.type === 'stage') {
      const stage = localStages.find((s) => s.id === activeId)
      if (stage) {
        setActiveStage(stage)
        return
      }
    }

    // Otherwise, dragging an order (card)
    for (const orders of Object.values(localOrdersByStage)) {
      const order = orders.find((o) => o.id === activeId)
      if (order) {
        setActiveOrder(order)
        break
      }
    }
  }

  /**
   * Handle drag over - update local state for visual feedback
   */
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    const activeData = active.data.current

    if (!over) return

    // Only handle stage reordering during drag over for smooth visual feedback
    if (activeData?.type === 'stage') {
      const activeId = active.id as string
      const overId = over.id as string

      if (activeId !== overId && stageIds.has(overId)) {
        setLocalStages((prev) => {
          const oldIndex = prev.findIndex((s) => s.id === activeId)
          const newIndex = prev.findIndex((s) => s.id === overId)

          if (oldIndex !== -1 && newIndex !== -1) {
            return arrayMove(prev, oldIndex, newIndex)
          }
          return prev
        })
      }
    }
  }

  /**
   * Handle drag end - persist changes to server
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const activeData = active.data.current

    // Clear active items
    setActiveOrder(null)
    setActiveStage(null)

    // No drop target
    if (!over) return

    // Handle stage reordering
    if (activeData?.type === 'stage') {
      // localStages is already updated by handleDragOver
      // Now persist to server
      const hasChanged = localStages.some((s, i) => s.id !== stages[i]?.id)

      if (hasChanged) {
        onStagesReorder?.(localStages)

        // Persist to server
        const stageIdsList = localStages.map((s) => s.id)
        const result = await updateStageOrder(pipelineId, stageIdsList)

        if ('error' in result) {
          // Revert on error
          setLocalStages(stages)
          toast.error(result.error)
        }
      }
      return
    }

    // Handle order movement between stages
    const orderId = active.id as string
    const newStageId = over.id as string

    // Prevent multiple moves of same order
    if (pendingMoveId === orderId) return

    // Find current stage
    let currentStageId: string | null = null
    for (const [stageId, orders] of Object.entries(localOrdersByStage)) {
      if (orders.some((o) => o.id === orderId)) {
        currentStageId = stageId
        break
      }
    }

    // No change if same stage
    if (currentStageId === newStageId) return

    // Optimistic update
    const activeOrderItem = Object.values(localOrdersByStage)
      .flat()
      .find((o) => o.id === orderId)

    if (!activeOrderItem || !currentStageId) return

    // Update local state optimistically
    setLocalOrdersByStage((prev) => {
      const newState = { ...prev }

      // Remove from old stage
      newState[currentStageId!] = (prev[currentStageId!] || []).filter((o) => o.id !== orderId)

      // Add to new stage
      const updatedOrder = { ...activeOrderItem, stage_id: newStageId }
      newState[newStageId] = [...(prev[newStageId] || []), updatedOrder]

      return newState
    })

    // Persist to server
    setPendingMoveId(orderId)
    const result = await moveOrderToStage(orderId, newStageId)
    setPendingMoveId(null)

    if ('error' in result) {
      // Revert on error
      setLocalOrdersByStage(ordersByStage)
      toast.error(result.error)
    } else {
      // Notify parent so it updates kanbanOrders (prevents bounce-back on revalidate)
      onOrderMoved?.(orderId, currentStageId, newStageId)
      if (result.data?.warning) {
        toast.warning(result.data.warning)
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={localStages.map((s) => s.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-280px)]">
          {localStages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              orders={localOrdersByStage[stage.id] || []}
              onOrderClick={onOrderClick}
              onEditStage={onEditStage}
              onDeleteStage={onDeleteStage}
              onAddStage={onAddStage}
              selectedOrderIds={selectedOrderIds}
              onOrderSelectChange={onOrderSelectChange}
              totalCount={stageCounts?.[stage.id]}
              hasMore={stageHasMore?.[stage.id] ?? false}
              isLoadingMore={stageLoading?.[stage.id] ?? false}
              onLoadMore={onLoadMore ? () => onLoadMore(stage.id) : undefined}
            />
          ))}
        </div>
      </SortableContext>

      {/* Drag overlay - shows card or column being dragged */}
      <DragOverlay>
        {activeOrder ? (
          <KanbanCard order={activeOrder} isDragging />
        ) : activeStage ? (
          <div className="w-72 min-w-72 bg-muted/50 rounded-lg border-2 border-primary opacity-80 shadow-lg">
            <div className="flex items-center gap-2 p-3 border-b bg-muted/50 rounded-t-lg">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: activeStage.color }}
              />
              <span className="font-medium text-sm">{activeStage.name}</span>
            </div>
            <div className="p-4 text-center text-muted-foreground text-sm">
              {localOrdersByStage[activeStage.id]?.length || 0} pedidos
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
