---
phase: standalone/crm-orders-performance
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
  - src/app/actions/orders.ts
autonomous: true

must_haves:
  truths:
    - "Kanban columns scroll vertically when they have more cards than fit on screen"
    - "getOrdersForStage server action exists and returns paginated orders for a stage"
    - "getStageOrderCounts server action returns order count per stage for a pipeline"
    - "Existing getOrders() function is unchanged (backwards compatible)"
    - "Build passes without errors"
  artifacts:
    - path: "src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx"
      provides: "Fixed height constraint enabling column scroll"
      contains: "h-[calc("
    - path: "src/app/actions/orders.ts"
      provides: "Paginated server action for per-stage loading"
      contains: "getOrdersForStage"
  key_links:
    - from: "src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx"
      to: "src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx"
      via: "Board constrains height, column overflow-y-auto activates"
      pattern: "overflow-y-auto"
---

<objective>
Fix the broken Kanban scroll and add paginated server actions for per-stage order loading.

Purpose: The Kanban columns don't scroll because the board container has min-h without max-h, causing infinite growth. Additionally, we need server actions that support LIMIT/OFFSET pagination per stage for the infinite scroll feature in Plan 02.

Output: Working scroll in Kanban columns + getOrdersForStage(stageId, limit, offset) server action.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-orders-performance/PHASE.md
@.planning/standalone/crm-orders-performance/RESEARCH.md

Key files to read before implementing:
@src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
@src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
@src/app/actions/orders.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix Kanban board height constraint to enable column scroll</name>
  <files>src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx</files>
  <action>
  Fix line 308 in kanban-board.tsx.

  Change:
  ```tsx
  <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-280px)]">
  ```

  To:
  ```tsx
  <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-280px)]">
  ```

  This changes `min-h` to `h` (fixed height). The columns are already `flex flex-col` with `overflow-y-auto` on the cards container (kanban-column.tsx line 184). By constraining the parent height, the columns will have a fixed height and `overflow-y-auto` will activate, enabling vertical scrolling of cards within each column.

  Do NOT change kanban-column.tsx — its `overflow-y-auto` on line 184 is already correct. The issue was only that the parent board was unconstrained.
  </action>
  <verify>
  - Run `npx tsc --noEmit` — no type errors
  - Verify line 308 now has `h-[calc(100vh-280px)]` (not min-h)
  - Verify kanban-column.tsx line 184 still has `overflow-y-auto`
  </verify>
  <done>
  Kanban board has fixed height constraint. Columns now scroll vertically when cards exceed viewport.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add getOrdersForStage and getStageOrderCounts server actions</name>
  <files>src/app/actions/orders.ts</files>
  <action>
  Add two new server actions to orders.ts. Place them after the existing `getOrdersByPipeline` function (around line 307).

  **Action 1: getOrdersForStage**

  ```typescript
  /**
   * Get paginated orders for a specific pipeline stage.
   * Used by Kanban infinite scroll — loads `limit` orders at `offset`.
   */
  export async function getOrdersForStage(
    stageId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ orders: OrderWithDetails[]; hasMore: boolean }> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { orders: [], hasMore: false }

    const cookieStore = await cookies()
    const workspaceId = cookieStore.get('morfx_workspace')?.value
    if (!workspaceId) return { orders: [], hasMore: false }

    // Fetch limit+1 to determine if there are more
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        contact:contacts(id, name, phone, address, city),
        stage:pipeline_stages(id, name, color, is_closed),
        pipeline:pipelines(id, name),
        products:order_products(*),
        tags:order_tags(tag:tags(*))
      `)
      .eq('workspace_id', workspaceId)
      .eq('stage_id', stageId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit)

    if (error) {
      console.error('Error fetching orders for stage:', error)
      return { orders: [], hasMore: false }
    }

    const hasMore = (data || []).length > limit
    const sliced = hasMore ? data!.slice(0, limit) : (data || [])

    // Transform tags
    const orders = sliced.map(order => ({
      ...order,
      tags: order.tags?.map((t: { tag: { id: string; name: string; color: string } }) => t.tag) || [],
    }))

    return { orders, hasMore }
  }
  ```

  **Action 2: getStageOrderCounts**

  ```typescript
  /**
   * Get order counts per stage for a pipeline.
   * Used to show total count in column headers even when paginated.
   */
  export async function getStageOrderCounts(
    pipelineId: string
  ): Promise<Record<string, number>> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return {}

    const cookieStore = await cookies()
    const workspaceId = cookieStore.get('morfx_workspace')?.value
    if (!workspaceId) return {}

    const { data, error } = await supabase
      .from('orders')
      .select('stage_id')
      .eq('workspace_id', workspaceId)
      .eq('pipeline_id', pipelineId)

    if (error) {
      console.error('Error fetching stage counts:', error)
      return {}
    }

    const counts: Record<string, number> = {}
    for (const row of data || []) {
      counts[row.stage_id] = (counts[row.stage_id] || 0) + 1
    }
    return counts
  }
  ```

  **Important:** Do NOT modify the existing `getOrders()` or `getOrdersByPipeline()` functions. They remain for backwards compatibility (list view, search, exports).
  </action>
  <verify>
  - Run `npx tsc --noEmit` — no type errors
  - Verify getOrdersForStage exists and accepts stageId, limit, offset
  - Verify getStageOrderCounts exists and accepts pipelineId
  - Verify existing getOrders() function is unchanged
  - Run `npm run build` to verify no build errors
  </verify>
  <done>
  Two new server actions: getOrdersForStage (paginated per-stage) and getStageOrderCounts (counts for headers). Existing actions unchanged.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `npx tsc --noEmit` passes
2. `npm run build` succeeds
3. kanban-board.tsx has fixed height `h-[calc(100vh-280px)]`
4. orders.ts has getOrdersForStage and getStageOrderCounts
5. Existing getOrders() is unchanged
</verification>

<success_criteria>
- Kanban columns scroll vertically
- Paginated server actions ready for Plan 02
- Build passes
- Zero regressions
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-orders-performance/01-SUMMARY.md`
</output>
