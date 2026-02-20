---
phase: quick
plan: 003
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/domain/orders.ts
  - src/lib/domain/contacts.ts
  - src/lib/domain/tasks.ts
autonomous: true

must_haves:
  truths:
    - "pipeline_stages lookup in createOrder verifies pipeline belongs to workspace"
    - "pipeline_stages lookup in duplicateOrder verifies pipeline belongs to workspace"
    - "All contacts enrichment queries filter by workspace_id"
  artifacts:
    - path: "src/lib/domain/orders.ts"
      provides: "Workspace-scoped pipeline validation and contact enrichment"
      contains: "eq('workspace_id', ctx.workspaceId)"
    - path: "src/lib/domain/contacts.ts"
      provides: "Workspace-scoped contact enrichment in updateContact"
      contains: "eq('workspace_id', ctx.workspaceId)"
    - path: "src/lib/domain/tasks.ts"
      provides: "Workspace-scoped contact enrichment in createTask, updateTask, completeTask"
      contains: "eq('workspace_id', ctx.workspaceId)"
  key_links:
    - from: "orders.ts createOrder"
      to: "pipelines table"
      via: "workspace_id check before pipeline_stages query"
      pattern: "from\\('pipelines'\\).*eq\\('workspace_id'"
    - from: "orders.ts duplicateOrder"
      to: "pipelines table"
      via: "workspace_id check before pipeline_stages query"
      pattern: "from\\('pipelines'\\).*eq\\('workspace_id'"
---

<objective>
Fix multi-tenancy security gaps in the domain layer where queries are missing workspace_id filtering.

Purpose: Close P0-4 audit finding — prevent cross-workspace data leakage through unscoped queries.
Output: All domain layer queries properly scoped to workspace_id.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/domain/orders.ts
@src/lib/domain/contacts.ts
@src/lib/domain/tasks.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix pipeline_stages lookups with workspace validation in orders.ts</name>
  <files>src/lib/domain/orders.ts</files>
  <action>
  Fix two locations where pipeline_stages is queried without verifying the pipeline belongs to the workspace.
  pipeline_stages does NOT have a workspace_id column — scoping comes from its parent pipeline.

  **createOrder (around line 159-172):**
  Before the existing pipeline_stages query, add a pipeline ownership check:
  ```typescript
  if (!stageId) {
    // Verify pipeline belongs to this workspace
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('id', params.pipelineId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (!pipeline) {
      return { success: false, error: 'Pipeline no encontrado en este workspace' }
    }

    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', params.pipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .single()

    if (!firstStage) {
      return { success: false, error: 'No hay etapas configuradas en el pipeline' }
    }
    stageId = firstStage.id
  }
  ```

  **duplicateOrder (around line 665-678):**
  Apply the same pattern — verify pipeline ownership before querying pipeline_stages:
  ```typescript
  if (!targetStageId) {
    // Verify target pipeline belongs to this workspace
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('id', params.targetPipelineId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (!pipeline) {
      return { success: false, error: 'Pipeline destino no encontrado en este workspace' }
    }

    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', params.targetPipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .single()

    if (!firstStage) {
      return { success: false, error: 'No hay etapas configuradas en el pipeline destino' }
    }
    targetStageId = firstStage.id
  }
  ```

  NOTE: Do NOT touch the pipeline_stages/pipelines enrichment in moveOrderToStage (lines 520-534) — those are read-only enrichment after the order was already workspace-verified.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Grep for `from('pipeline_stages')` in orders.ts and verify every occurrence either (a) is preceded by a pipeline workspace check, or (b) is in the moveOrderToStage enrichment block which is out of scope.</verify>
  <done>createOrder and duplicateOrder both verify pipeline ownership via workspace_id before querying pipeline_stages. A request with a pipelineId from another workspace returns an error instead of leaking data.</done>
</task>

<task type="auto">
  <name>Task 2: Add workspace_id filter to all contacts enrichment queries</name>
  <files>src/lib/domain/orders.ts, src/lib/domain/contacts.ts, src/lib/domain/tasks.ts</files>
  <action>
  Add `.eq('workspace_id', ctx.workspaceId)` to every contacts SELECT used for trigger enrichment. These are defense-in-depth fixes — the primary entity was already workspace-verified, but contacts queries should also be scoped.

  **contacts.ts — updateContact (line 256-260):**
  Change:
  ```typescript
  const { data: updatedContact } = await supabase
    .from('contacts')
    .select('name')
    .eq('id', params.contactId)
    .single()
  ```
  To:
  ```typescript
  const { data: updatedContact } = await supabase
    .from('contacts')
    .select('name')
    .eq('id', params.contactId)
    .eq('workspace_id', ctx.workspaceId)
    .single()
  ```

  **orders.ts — updateOrder (line 401-405):**
  Change the contacts query to add `.eq('workspace_id', ctx.workspaceId)`:
  ```typescript
  const { data: contactData } = await supabase
    .from('contacts')
    .select('name')
    .eq('id', orderContactId)
    .eq('workspace_id', ctx.workspaceId)
    .single()
  ```

  **orders.ts — moveOrderToStage (line 536-541):**
  Change the contacts query inside Promise.all to add workspace_id filter:
  ```typescript
  currentOrder.contact_id
    ? supabase
        .from('contacts')
        .select('name, phone, address, city, department')
        .eq('id', currentOrder.contact_id)
        .eq('workspace_id', ctx.workspaceId)
        .single()
    : Promise.resolve({ data: null }),
  ```

  **tasks.ts — createTask (line 135-139):**
  ```typescript
  const { data: contact } = await supabase2
    .from('contacts')
    .select('name')
    .eq('id', params.contactId)
    .eq('workspace_id', ctx.workspaceId)
    .single()
  ```
  NOTE: This uses `supabase2` (a separate admin client). Keep using the same client variable.

  **tasks.ts — updateTask (line 246-250):**
  ```typescript
  const { data: contact } = await supabase
    .from('contacts')
    .select('name')
    .eq('id', current.contact_id)
    .eq('workspace_id', ctx.workspaceId)
    .single()
  ```

  **tasks.ts — completeTask (line 321-325):**
  ```typescript
  const { data: contact } = await supabase
    .from('contacts')
    .select('name')
    .eq('id', current.contact_id)
    .eq('workspace_id', ctx.workspaceId)
    .single()
  ```

  Total: 6 contacts queries across 3 files. Each gets one additional `.eq('workspace_id', ctx.workspaceId)` line.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Grep for `from('contacts')` in orders.ts, contacts.ts, and tasks.ts — every occurrence should have a `workspace_id` filter (or be in a clearly scoped context like the initial fetch that already has it).</verify>
  <done>All 6 contacts enrichment queries now filter by workspace_id, providing defense-in-depth against cross-workspace contact data leakage.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. `grep -n "from('pipeline_stages')" src/lib/domain/orders.ts` — each occurrence preceded by pipeline workspace check (except moveOrderToStage enrichment)
3. `grep -n "from('contacts')" src/lib/domain/orders.ts src/lib/domain/contacts.ts src/lib/domain/tasks.ts` — every SELECT query includes workspace_id filter
4. No functional regression: enrichment queries return same data for valid workspace requests (workspace_id matches by definition for legitimate calls)
</verification>

<success_criteria>
- Zero pipeline_stages queries execute without prior workspace-scoped pipeline verification
- Zero contacts enrichment queries execute without workspace_id filter
- TypeScript compilation passes
- No changes to function signatures or return types (purely additive .eq() filters)
</success_criteria>

<output>
After completion, create `.planning/quick/003-fix-p0-4-workspace-id-missing-en-queries/003-SUMMARY.md`
</output>
