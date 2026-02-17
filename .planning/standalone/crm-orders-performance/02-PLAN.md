---
phase: standalone/crm-orders-performance
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/app/(dashboard)/crm/pedidos/page.tsx
  - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
autonomous: true

must_haves:
  truths:
    - "Initial page load fetches only 20 orders per stage (not all 30,000)"
    - "Each Kanban column shows a 'load more' trigger at the bottom when there are more orders"
    - "Scrolling to the bottom of a column automatically loads 20 more orders"
    - "Column header shows total count (e.g., '156') not just loaded count"
    - "Drag and drop between columns still works"
    - "Search still works on loaded orders"
    - "List view still works (uses full getOrders)"
    - "Creating a new order appears in the correct column"
    - "Moving an order via drag updates both columns correctly"
  artifacts:
    - path: "src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx"
      provides: "IntersectionObserver for infinite scroll"
      contains: "IntersectionObserver"
    - path: "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"
      provides: "Per-stage order state management with pagination"
      contains: "getOrdersForStage"
  key_links:
    - from: "src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx"
      to: "src/app/actions/orders.ts"
      via: "onLoadMore callback triggers getOrdersForStage"
      pattern: "onLoadMore"
---

<objective>
Wire up infinite scroll pagination in the Kanban view so each column loads 20 orders at a time.

Purpose: With 30,000+ orders, loading all of them at once is unusable. Each Kanban column should independently load 20 orders initially, then load 20 more when the user scrolls to the bottom. Column headers show the real total count.

Output: Kanban with per-column infinite scroll pagination. Initial page load fetches ~120 orders (20 × 6 stages) instead of 30,000.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-orders-performance/PHASE.md
@.planning/standalone/crm-orders-performance/RESEARCH.md
@.planning/standalone/crm-orders-performance/01-SUMMARY.md

Key files to read before implementing:
@src/app/(dashboard)/crm/pedidos/page.tsx
@src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
@src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
@src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
@src/app/actions/orders.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add per-stage loading logic to OrdersView for Kanban mode</name>
  <files>src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</files>
  <action>
  Modify OrdersView to manage per-stage paginated order loading for Kanban mode.

  **Step A: Add imports**
  Add to imports:
  ```typescript
  import { getOrdersForStage, getStageOrderCounts } from '@/app/actions/orders'
  ```

  **Step B: Add per-stage pagination state**

  After the existing state declarations (around line 104), add:

  ```typescript
  // Per-stage paginated orders for Kanban
  const [kanbanOrders, setKanbanOrders] = React.useState<Record<string, OrderWithDetails[]>>({})
  const [kanbanHasMore, setKanbanHasMore] = React.useState<Record<string, boolean>>({})
  const [kanbanCounts, setKanbanCounts] = React.useState<Record<string, number>>({})
  const [kanbanLoading, setKanbanLoading] = React.useState<Record<string, boolean>>({})
  const [kanbanInitialized, setKanbanInitialized] = React.useState(false)
  ```

  **Step C: Load initial orders per stage when pipeline changes**

  Add a useEffect that fires when `activePipelineId` changes:

  ```typescript
  React.useEffect(() => {
    if (!activePipelineId || viewMode !== 'kanban') return

    const activePipeline = pipelines.find(p => p.id === activePipelineId)
    if (!activePipeline) return

    setKanbanInitialized(false)

    // Load counts + first 20 per stage in parallel
    const loadInitial = async () => {
      const stageIds = activePipeline.stages.map(s => s.id)

      const [counts, ...stageResults] = await Promise.all([
        getStageOrderCounts(activePipelineId),
        ...stageIds.map(stageId => getOrdersForStage(stageId, 20, 0))
      ])

      const newOrders: Record<string, OrderWithDetails[]> = {}
      const newHasMore: Record<string, boolean> = {}

      stageIds.forEach((stageId, i) => {
        newOrders[stageId] = stageResults[i].orders
        newHasMore[stageId] = stageResults[i].hasMore
      })

      setKanbanOrders(newOrders)
      setKanbanHasMore(newHasMore)
      setKanbanCounts(counts)
      setKanbanInitialized(true)
    }

    loadInitial()
  }, [activePipelineId, viewMode, pipelines])
  ```

  **Step D: Add loadMore callback**

  ```typescript
  const handleLoadMore = React.useCallback(async (stageId: string) => {
    if (kanbanLoading[stageId] || !kanbanHasMore[stageId]) return

    setKanbanLoading(prev => ({ ...prev, [stageId]: true }))

    const currentCount = kanbanOrders[stageId]?.length || 0
    const result = await getOrdersForStage(stageId, 20, currentCount)

    setKanbanOrders(prev => ({
      ...prev,
      [stageId]: [...(prev[stageId] || []), ...result.orders]
    }))
    setKanbanHasMore(prev => ({ ...prev, [stageId]: result.hasMore }))
    setKanbanLoading(prev => ({ ...prev, [stageId]: false }))
  }, [kanbanOrders, kanbanHasMore, kanbanLoading])
  ```

  **Step E: Update the ordersByStage memo for Kanban**

  Change the existing `ordersByStage` memo (lines 288-294) to use kanbanOrders when in Kanban mode, but still apply search/tag filters:

  ```typescript
  const ordersByStage: OrdersByStage = React.useMemo(() => {
    if (viewMode === 'kanban' && kanbanInitialized) {
      // Use paginated per-stage data
      const grouped: OrdersByStage = {}
      for (const stage of stages) {
        let stageOrders = kanbanOrders[stage.id] || []

        // Apply client-side filters on loaded orders
        if (searchQuery.trim()) {
          const lowerQuery = searchQuery.toLowerCase()
          stageOrders = stageOrders.filter(o =>
            o.contact?.name?.toLowerCase().includes(lowerQuery) ||
            o.contact?.phone?.includes(lowerQuery) ||
            o.products?.some(p => p.title.toLowerCase().includes(lowerQuery)) ||
            o.tracking_number?.toLowerCase().includes(lowerQuery) ||
            o.description?.toLowerCase().includes(lowerQuery)
          )
        }
        if (selectedTagIds.length > 0) {
          stageOrders = stageOrders.filter(o => {
            const orderTagIds = o.tags.map(t => t.id)
            return selectedTagIds.some(tagId => orderTagIds.includes(tagId))
          })
        }

        grouped[stage.id] = stageOrders
      }
      return grouped
    }

    // Fallback: use full orders (list view or before kanban initialized)
    const grouped: OrdersByStage = {}
    for (const stage of stages) {
      grouped[stage.id] = filteredOrders.filter((o) => o.stage_id === stage.id)
    }
    return grouped
  }, [viewMode, kanbanInitialized, kanbanOrders, stages, searchQuery, selectedTagIds, filteredOrders])
  ```

  **Step F: Refresh kanban on order create/move/delete**

  In `handleFormSuccess` (line 364-370), after `router.refresh()`, also reload the affected stage:
  ```typescript
  const handleFormSuccess = () => {
    setFormSheetOpen(false)
    setEditingOrder(null)
    toast.success(editingOrder ? 'Pedido actualizado' : 'Pedido creado')
    router.refresh()
    // Reload kanban data for affected pipeline
    if (viewMode === 'kanban' && activePipelineId) {
      // Re-trigger the initial load effect
      setKanbanInitialized(false)
    }
  }
  ```

  Similarly update `handleDeleteConfirm` and `handleBulkDelete` to set `setKanbanInitialized(false)` after success.

  **Step G: Pass new props to KanbanBoard**

  In the KanbanBoard JSX (lines 567-577), add new props:
  ```tsx
  <KanbanBoard
    stages={stages}
    ordersByStage={ordersByStage}
    pipelineId={activePipelineId || ''}
    onOrderClick={handleOrderClick}
    onEditStage={handleEditStage}
    onDeleteStage={handleDeleteStage}
    onAddStage={handleAddStage}
    selectedOrderIds={selectedOrderIds}
    onOrderSelectChange={handleOrderSelectChange}
    stageCounts={kanbanCounts}
    stageHasMore={kanbanHasMore}
    stageLoading={kanbanLoading}
    onLoadMore={handleLoadMore}
  />
  ```

  **What NOT to change:**
  - List view uses full `filteredOrders` from the existing prop — unchanged
  - Search/filter UI — unchanged
  - Export — uses existing getOrders (full data) — unchanged
  - DataTable view — unchanged
  </action>
  <verify>
  - Run `npx tsc --noEmit` — no type errors
  - Verify kanbanOrders state exists
  - Verify loadMore callback exists
  - Verify ordersByStage switches between kanban and list mode
  - Verify new props passed to KanbanBoard
  </verify>
  <done>
  OrdersView manages per-stage paginated state for Kanban. Initial load fetches 20 per stage. LoadMore callback available for infinite scroll.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update KanbanBoard to pass pagination props to columns</name>
  <files>src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx</files>
  <action>
  Add pagination props to KanbanBoard interface and pass them through to KanbanColumn.

  **Step A: Update KanbanBoardProps interface (around line 32)**

  Add these optional props:
  ```typescript
  stageCounts?: Record<string, number>
  stageHasMore?: Record<string, boolean>
  stageLoading?: Record<string, boolean>
  onLoadMore?: (stageId: string) => void
  ```

  **Step B: Destructure new props in component function**

  Add to the destructuring (around line 94):
  ```typescript
  stageCounts,
  stageHasMore,
  stageLoading,
  onLoadMore,
  ```

  **Step C: Pass props to KanbanColumn (around line 310-320)**

  Add to each KanbanColumn:
  ```tsx
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
  ```
  </action>
  <verify>
  - Run `npx tsc --noEmit` — no type errors
  - Verify KanbanBoardProps has stageCounts, stageHasMore, stageLoading, onLoadMore
  - Verify KanbanColumn receives totalCount, hasMore, isLoadingMore, onLoadMore
  </verify>
  <done>
  KanbanBoard passes pagination props through to each column.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add infinite scroll to KanbanColumn with IntersectionObserver</name>
  <files>src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx</files>
  <action>
  Add IntersectionObserver-based infinite scroll and total count to KanbanColumn.

  **Step A: Update KanbanColumnProps interface (around line 22)**

  Add:
  ```typescript
  totalCount?: number
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  ```

  **Step B: Destructure new props**

  Add to the destructuring:
  ```typescript
  totalCount,
  hasMore,
  isLoadingMore,
  onLoadMore,
  ```

  **Step C: Add IntersectionObserver ref**

  Add inside the component, after the existing hooks:

  ```typescript
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
  ```

  **Step D: Update column header count badge**

  Change the Badge (line 118-126) to show totalCount when available:
  ```tsx
  <Badge
    variant={isOverLimit ? 'destructive' : isAtLimit ? 'secondary' : 'outline'}
    className="h-5 px-1.5 text-xs font-normal"
  >
    {totalCount !== undefined ? totalCount : orderCount}
    {wipLimit !== null && (
      <span className="text-muted-foreground ml-0.5">/ {wipLimit}</span>
    )}
  </Badge>
  ```

  **Step E: Add sentinel div and loading indicator at bottom of cards container**

  After the orders.map block (around line 199), before the closing `</div>` of the cards container, add:

  ```tsx
  {hasMore && (
    <div ref={sentinelRef} className="flex items-center justify-center py-2">
      {isLoadingMore ? (
        <div className="text-xs text-muted-foreground">Cargando...</div>
      ) : (
        <div className="h-4" /> {/* Invisible sentinel */}
      )}
    </div>
  )}
  ```

  This places a sentinel div at the bottom of the scrollable cards area. When it becomes visible (user scrolled to bottom), the IntersectionObserver fires and loads more orders.

  **What NOT to change:**
  - DnD functionality (useSortable, useDroppable) — unchanged
  - Stage menu — unchanged
  - WIP limit logic — unchanged (still uses orders.length for WIP, totalCount only for display)
  </action>
  <verify>
  - Run `npx tsc --noEmit` — no type errors
  - Verify IntersectionObserver is created in a useEffect
  - Verify sentinel div is inside the scrollable cards container
  - Verify totalCount is displayed in the header badge
  - Verify loading indicator shows when isLoadingMore is true
  - Run `npm run build` to verify no build errors
  </verify>
  <done>
  KanbanColumn has IntersectionObserver-based infinite scroll. Sentinel at bottom of cards triggers onLoadMore. Header shows total count. Loading indicator visible during fetch.
  </done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `npx tsc --noEmit` passes
2. `npm run build` succeeds
3. Kanban loads 20 orders per stage initially
4. Scrolling to bottom of a column loads 20 more
5. Column header shows total count (from getStageOrderCounts)
6. Drag and drop still works between columns
7. List view still works with full data
8. Search filters loaded orders client-side
</verification>

<success_criteria>
- Initial load: ~120 orders (20 × stages) instead of 30,000
- Infinite scroll loads 20 more per column on scroll
- Total count visible in column headers
- DnD preserved
- List view unchanged
- Build passes
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-orders-performance/02-SUMMARY.md`
</output>
