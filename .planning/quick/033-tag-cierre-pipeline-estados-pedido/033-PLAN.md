---
phase: 033-tag-cierre-pipeline
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260326_pipeline_closure_tags.sql
  - src/app/actions/order-states.ts
  - src/app/actions/whatsapp.ts
  - src/app/(dashboard)/crm/configuracion/estados-pedido/page.tsx
  - src/app/(dashboard)/crm/configuracion/estados-pedido/components/closure-tag-config.tsx
  - src/lib/orders/closure-tags.ts
autonomous: true

must_haves:
  truths:
    - "Usuario puede agregar reglas pipeline+tag de cierre en la pagina de estados de pedido"
    - "Usuario puede eliminar reglas de cierre existentes"
    - "Pedidos que matchean una regla de cierre no aparecen como pedidos activos del contacto"
    - "La lista de conversaciones WhatsApp refleja correctamente pedidos activos (sin los cerrados por tag)"
  artifacts:
    - path: "supabase/migrations/20260326_pipeline_closure_tags.sql"
      provides: "pipeline_closure_tags table"
      contains: "CREATE TABLE pipeline_closure_tags"
    - path: "src/lib/orders/closure-tags.ts"
      provides: "Closure tag checking logic (shared between frontend actions and webhook)"
      exports: ["getClosureTagRules", "isOrderClosedByTag"]
    - path: "src/app/(dashboard)/crm/configuracion/estados-pedido/components/closure-tag-config.tsx"
      provides: "UI component for managing closure tag rules"
  key_links:
    - from: "src/app/actions/whatsapp.ts"
      to: "src/lib/orders/closure-tags.ts"
      via: "import isOrderClosedByTag"
      pattern: "isOrderClosedByTag"
    - from: "src/app/actions/whatsapp.ts"
      to: "pipeline_closure_tags"
      via: "closure tag filtering in getActiveContactOrders and getOrdersForContacts"
---

<objective>
Agregar configuracion "Tag de cierre por pipeline" en la pagina de estados de pedido. Cuando un pedido esta en un pipeline especifico Y tiene un tag especifico, se considera cerrado (won) y no aparece como pedido activo del contacto en la lista de conversaciones WhatsApp.

Purpose: Permitir cerrar pedidos por tag sin moverlos de etapa. Esto es necesario cuando un pedido se considera terminado por un criterio de negocio (ej: tag "Entregado" en pipeline "Dropshipping") pero no se mueve a una etapa de cierre.
Output: Migration SQL, shared closure logic, server actions CRUD, UI de configuracion, filtrado en getActiveContactOrders y getOrdersForContacts.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/actions/order-states.ts
@src/app/actions/whatsapp.ts
@src/lib/orders/stage-phases.ts
@src/app/(dashboard)/crm/configuracion/estados-pedido/page.tsx
@src/app/(dashboard)/crm/configuracion/estados-pedido/components/order-state-list.tsx
@src/app/actions/tags.ts
@src/app/actions/pipelines.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration + shared closure logic + server actions</name>
  <files>
    supabase/migrations/20260326_pipeline_closure_tags.sql
    src/lib/orders/closure-tags.ts
    src/app/actions/order-states.ts
  </files>
  <action>
1. **Migration** (`supabase/migrations/20260326_pipeline_closure_tags.sql`):
   ```sql
   CREATE TABLE pipeline_closure_tags (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
     pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
     tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
     created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
     UNIQUE(workspace_id, pipeline_id, tag_id)
   );

   -- RLS
   ALTER TABLE pipeline_closure_tags ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can manage closure tags in their workspace"
     ON pipeline_closure_tags FOR ALL
     USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

   -- Index for lookup by workspace
   CREATE INDEX idx_pipeline_closure_tags_workspace ON pipeline_closure_tags(workspace_id);
   ```

2. **Shared closure logic** (`src/lib/orders/closure-tags.ts`):
   - `getClosureTagRules(supabase, workspaceId)`: Fetches all rules from `pipeline_closure_tags` for a workspace. Returns `Array<{ pipeline_id: string, tag_id: string }>`. Cache-friendly (called once per request).
   - `isOrderClosedByTag(order, closureRules)`: Pure function. Takes an order object (needs `pipeline.id` and `tags[]` with `id`) and the closure rules array. Returns `true` if the order's pipeline_id matches a rule AND the order has the matching tag_id. The order shape should accept: `{ pipeline?: { id: string } | null, tags?: Array<{ id: string }> }` to work with both OrderSummary (whatsapp.ts) and RecentOrder shapes.
   - Uses `createAdminClient()` in getClosureTagRules for server-side calls (bypass RLS, no auth needed since workspace_id is passed).

3. **Server actions** (append to `src/app/actions/order-states.ts`):
   - `getClosureTagConfigs()`: Returns all closure tag rules for current workspace, joining pipeline name and tag name/color. Returns `Array<{ id: string, pipeline_id: string, pipeline_name: string, tag_id: string, tag_name: string, tag_color: string }>`. Uses `createClient()` (same pattern as existing actions in this file).
   - `addClosureTagConfig(pipelineId: string, tagId: string)`: Inserts into `pipeline_closure_tags`. Validates auth + workspace. Revalidates `/crm/configuracion/estados-pedido`. Returns `ActionResult`.
   - `removeClosureTagConfig(id: string)`: Deletes from `pipeline_closure_tags` by id. Validates auth. Revalidates path. Returns `ActionResult`.
   - Follow exact same auth/workspace pattern as existing functions in this file (createClient, getUser, cookies for workspace_id).
  </action>
  <verify>
    ```bash
    cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit src/lib/orders/closure-tags.ts src/app/actions/order-states.ts
    ```
  </verify>
  <done>
    Migration file exists. closure-tags.ts exports getClosureTagRules and isOrderClosedByTag. order-states.ts exports getClosureTagConfigs, addClosureTagConfig, removeClosureTagConfig. TypeScript compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: UI de configuracion + integracion en filtrado de pedidos activos</name>
  <files>
    src/app/(dashboard)/crm/configuracion/estados-pedido/components/closure-tag-config.tsx
    src/app/(dashboard)/crm/configuracion/estados-pedido/page.tsx
    src/app/actions/whatsapp.ts
  </files>
  <action>
1. **UI Component** (`closure-tag-config.tsx`):
   - Client component that receives props: `configs` (existing rules), `pipelines` (PipelineWithStages[]), `tags` (Tag[]).
   - Renders a section with title "Tag de cierre por pipeline" and description "Cuando un pedido en un pipeline tiene un tag especifico, se considera cerrado y no aparece como pedido activo."
   - Shows existing rules as a list: each row shows "[Pipeline name] -> [Tag badge with color]" + delete button (Trash2Icon).
   - Below the list: two Select dropdowns side by side ("Pipeline" and "Tag") + "Agregar" button.
   - Pipeline dropdown: shows all pipelines from props. Tag dropdown: shows all order-scope tags from props (use `getTagsForScope('orders')` in the page).
   - On add: calls `addClosureTagConfig(pipelineId, tagId)`. On delete: calls `removeClosureTagConfig(id)`.
   - Uses toast (sonner) for success/error feedback.
   - Use Select from `@/components/ui/select` (SelectTrigger, SelectContent, SelectItem, SelectValue).
   - Style consistent with existing page (border rounded-md, p-3, same spacing).
   - If no rules configured, show muted text "No hay reglas de cierre configuradas".
   - Prevent duplicate: disable "Agregar" if selected pipeline+tag combo already exists in configs.

2. **Page integration** (`page.tsx`):
   - Import `getClosureTagConfigs` from order-states actions.
   - Import `getTagsForScope` from tags actions (already has `getTags` import pattern).
   - Add to Promise.all: `getClosureTagConfigs()` and `getTagsForScope('orders')`.
   - Render `<ClosureTagConfig>` below the existing `<OrderStateList>`, with a `<div className="mt-8">` separator and its own section header.

3. **Filtrado de pedidos activos** (`src/app/actions/whatsapp.ts`):
   - **getActiveContactOrders**: After fetching orders via `getContactOrders`, also fetch closure rules via `getClosureTagRules(supabase, workspaceId)` using `createAdminClient()`. But the orders from `getContactOrders` don't include order tags. Two approaches:
     - PREFERRED: Modify the filter to also query `order_tags` for matching orders. Since `getContactOrders` already returns `pipeline.id`, we need to also fetch order tags. Modify `getContactOrders` to also select `order_tags(tag_id:tags(id))` (just ids, lightweight). Add `tag_ids?: string[]` to OrderSummary type. Then in `getActiveContactOrders`, filter out orders where `isOrderClosedByTag(order, closureRules)` returns true.
     - Update OrderSummary in `src/lib/whatsapp/types.ts` to add optional `tag_ids?: string[]` field.
   - **getOrdersForContacts** (batch): Same logic. Fetch closure rules once, then filter each order. Also needs order tag ids in the query. Add `order_tags(tag_id:tags(id))` to the batch select query, extract tag_ids into OrderSummary.
   - Import `createAdminClient` from `@/lib/supabase/admin` (or wherever it's defined in the project — check existing imports).
   - IMPORTANT: `getClosureTagRules` needs a supabase client. Since whatsapp.ts uses `createClient()` (user-scoped), pass that client. The pipeline_closure_tags table has RLS that allows workspace members to read. So `createClient()` is fine here.

   **Concrete changes to whatsapp.ts:**
   - In `getContactOrders`: add `order_tags(tag:tags(id))` to the select. After mapping, add `tag_ids: extractedTagIds` to each OrderSummary.
   - In `getActiveContactOrders`: after getting orders, call `getClosureTagRules(supabase, workspaceId)` (create a new supabase client or reuse). Filter: `phase !== 'won' && !isOrderClosedByTag(order, closureRules)`.
   - In `getOrdersForContacts`: same — add `order_tags(tag:tags(id))` to select, fetch closure rules once before the loop, filter in the mapping.
   - In `getRecentOrders`: No change needed (this shows ALL orders, not just active).

   **Type update** (`src/lib/whatsapp/types.ts`):
   - Add `tag_ids?: string[]` to OrderSummary interface.
  </action>
  <verify>
    ```bash
    cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit src/app/actions/whatsapp.ts src/app/\(dashboard\)/crm/configuracion/estados-pedido/page.tsx src/lib/whatsapp/types.ts
    ```
  </verify>
  <done>
    1. Closure tag config UI renders in estados-pedido page with add/remove functionality.
    2. getActiveContactOrders filters out orders matching closure tag rules.
    3. getOrdersForContacts filters out orders matching closure tag rules.
    4. OrderSummary type includes optional tag_ids field.
    5. TypeScript compiles without errors.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes for all modified files.
2. Migration file exists at `supabase/migrations/20260326_pipeline_closure_tags.sql`.
3. The estados-pedido config page shows the new "Tag de cierre por pipeline" section.
4. Adding a closure rule (pipeline + tag) persists to DB.
5. An order in the matching pipeline with the matching tag does NOT appear in active orders (conversation list indicators).
6. Removing a closure rule makes those orders appear again as active.
</verification>

<success_criteria>
- Pipeline closure tags table created with proper constraints and RLS.
- UI allows CRUD of closure tag rules on the estados-pedido config page.
- getActiveContactOrders excludes orders matching any closure tag rule.
- getOrdersForContacts (batch, conversation list) excludes orders matching any closure tag rule.
- No TypeScript errors. No regressions in existing order state functionality.
</success_criteria>

<output>
After completion, create `.planning/quick/033-tag-cierre-pipeline-estados-pedido/033-SUMMARY.md`
</output>
