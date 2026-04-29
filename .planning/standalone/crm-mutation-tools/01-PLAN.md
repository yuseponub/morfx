---
plan: 01
wave: 0
phase: standalone-crm-mutation-tools
depends_on: []
files_modified:
  - supabase/migrations/{ts}_crm_mutation_idempotency_keys.sql
  - supabase/migrations/{ts}_orders_closed_at.sql
  - src/lib/domain/crm-mutation-idempotency.ts
  - src/lib/domain/orders.ts
  - src/lib/domain/notes.ts
  - src/lib/domain/tasks.ts
  - src/inngest/functions/crm-mutation-idempotency-cleanup.ts
  - src/app/api/inngest/route.ts
autonomous: false  # Regla 5 PAUSE for SQL apply
requirements:
  - MUT-OR-05  # closeOrder gap closure (Resolution A)
---

<objective>
Wave 0 — Foundation: 2 SQL migrations + new `closeOrder` domain function (Resolution A locked, D-11) + 3 nuevos domain getters (`getContactNoteById`, `getOrderNoteById`, `getTaskById`) usados por Plan 04 para rehydrate veraz (D-09) + Inngest TTL cleanup cron + cron registration. Incluye Regla 5 PAUSE para que el usuario aplique ambas migraciones a producción Supabase ANTES de pushear el código que depende de ellas.

Purpose: cierra el gap arquitectónico identificado por research (closeOrder sin domain ni columna; A11 — getNoteById/getTaskById tampoco existen) y crea la tabla de idempotencia que Plan 02 consume.

Output: 8 archivos nuevos/editados. Tras este plan, la DB de producción tiene `crm_mutation_idempotency_keys` table + `orders.closed_at` column + cron Inngest registrado, y el domain layer expone getters por id para notes (contact + order) y tasks que Plan 04 consume en sus rehydrate callbacks (Pitfall 6 — NUNCA fabricar snapshot desde input).
</objective>

<context>
@./CLAUDE.md
@./.claude/rules/code-changes.md
@./.claude/rules/gsd-workflow.md
@.planning/standalone/crm-mutation-tools/CONTEXT.md
@.planning/standalone/crm-mutation-tools/RESEARCH.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1.1: Create migration `crm_mutation_idempotency_keys.sql`</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:593-644 (Idempotency Table Design § Migration SQL — exact verbatim)
    - supabase/migrations/20260429172905_crm_query_tools_config.sql (sibling template — RLS pattern + GRANTs)
  </read_first>
  <action>
    Generar timestamp Bogota: `TS=$(TZ=America/Bogota date +%Y%m%d%H%M%S)` y crear `supabase/migrations/${TS}_crm_mutation_idempotency_keys.sql` con el contenido EXACTO de RESEARCH § Idempotency Table Design § Migration SQL (líneas 595-644). Reglas:

    - Tabla `public.crm_mutation_idempotency_keys` con columnas `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`, `tool_name TEXT NOT NULL`, `key TEXT NOT NULL`, `result_id UUID NOT NULL` (polimórfico, sin FK — A10), `result_payload JSONB NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())`.
    - **PRIMARY KEY (workspace_id, tool_name, key)** — orden exacto.
    - Index `idx_crm_mutation_idempotency_keys_created_at ON public.crm_mutation_idempotency_keys(created_at)`.
    - `ENABLE ROW LEVEL SECURITY`.
    - Policy SELECT: `is_workspace_member(workspace_id)` — workspace members pueden leer (forensics).
    - **NO INSERT/UPDATE/DELETE policy** — service_role bypasses RLS para inserts/deletes; UPDATE prohibido (rows immutables).
    - GRANTs: `ALL ON TABLE ... TO service_role` + `SELECT ON TABLE ... TO authenticated`.
    - COMMENTs en tabla y `result_payload` con referencia a D-03/D-09.

    Verificar timestamp único (mayor al último `supabase/migrations/` existente).
  </action>
  <verify>
    <automated>ls supabase/migrations/*_crm_mutation_idempotency_keys.sql 2>&1 | head -1 && grep -c "PRIMARY KEY (workspace_id, tool_name, key)" supabase/migrations/*_crm_mutation_idempotency_keys.sql</automated>
  </verify>
  <acceptance_criteria>
    - File matches glob `supabase/migrations/*_crm_mutation_idempotency_keys.sql`.
    - `grep -c "PRIMARY KEY (workspace_id, tool_name, key)" supabase/migrations/*_crm_mutation_idempotency_keys.sql` ≥ 1.
    - `grep -c "result_id UUID NOT NULL" supabase/migrations/*_crm_mutation_idempotency_keys.sql` ≥ 1.
    - `grep -c "GRANT ALL    ON TABLE" supabase/migrations/*_crm_mutation_idempotency_keys.sql` ≥ 1.
    - `grep -c "is_workspace_member" supabase/migrations/*_crm_mutation_idempotency_keys.sql` ≥ 1.
    - NO `CREATE POLICY .* FOR UPDATE` en el archivo (rows immutables).
  </acceptance_criteria>
  <done>Migration file de idempotency lista para apply manual.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.2: Create migration `orders_closed_at.sql` (Resolution A locked, D-11)</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:545-571 (closeOrder Resolution Path — Resolution A locked)
    - .planning/standalone/crm-mutation-tools/CONTEXT.md:130-138 (D-11 — Resolución A locked)
    - src/lib/domain/orders.ts (consultar líneas 1606-1614 — doc-comment de archiveOrder)
  </read_first>
  <action>
    Generar timestamp Bogota un segundo después del de Task 1.1 (`TS2=$(TZ=America/Bogota date -d "+1 sec" +%Y%m%d%H%M%S)`) y crear `supabase/migrations/${TS2}_orders_closed_at.sql`:

    ```sql
    -- Standalone crm-mutation-tools — Wave 0 (D-11 Resolution A).
    -- Adds soft-close column for orders distinct from archived_at.
    -- Semantics:
    --   closed_at = pedido finalizado/entregado/cancelado por flujo de negocio (sigue visible en histórico)
    --   archived_at = soft-delete (oculto del UI por defecto)
    -- Both fields are independent. Tool closeOrder toggles closed_at; archiveOrder toggles archived_at.
    -- Regla 2: timezone('America/Bogota', NOW()) for any default timestamp use.

    ALTER TABLE public.orders
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL;

    -- Partial index for Kanban filter ("show only open" filters WHERE closed_at IS NULL fast).
    CREATE INDEX IF NOT EXISTS idx_orders_closed_at_not_null
      ON public.orders(closed_at)
      WHERE closed_at IS NOT NULL;

    COMMENT ON COLUMN public.orders.closed_at IS
      'Pedido cerrado por flujo de negocio (entregado/cancelado). NULL = abierto. Independent of archived_at. Set via domain.closeOrder. Standalone crm-mutation-tools D-11.';
    ```

    Verificar timestamp > Task 1.1 timestamp.
  </action>
  <verify>
    <automated>ls supabase/migrations/*_orders_closed_at.sql 2>&1 | head -1 && grep -c "ADD COLUMN IF NOT EXISTS closed_at" supabase/migrations/*_orders_closed_at.sql</automated>
  </verify>
  <acceptance_criteria>
    - File matches glob `supabase/migrations/*_orders_closed_at.sql`.
    - `grep -c "ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ" supabase/migrations/*_orders_closed_at.sql` == 1.
    - `grep -c "WHERE closed_at IS NOT NULL" supabase/migrations/*_orders_closed_at.sql` == 1.
    - Timestamp prefix > timestamp de migration de Task 1.1.
  </acceptance_criteria>
  <done>Migration file orders.closed_at lista para apply manual.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1.3: PAUSE — User applies BOTH migrations to production Supabase (Regla 5)</name>
  <what-built>
    Two migration SQL files staged but NOT pushed:
    1. `supabase/migrations/{ts1}_crm_mutation_idempotency_keys.sql` (Task 1.1)
    2. `supabase/migrations/{ts2}_orders_closed_at.sql` (Task 1.2)

    Subsequent tasks in this plan depend on `crm_mutation_idempotency_keys` table and `orders.closed_at` column existing in production. Per Regla 5, these MUST be applied to production BEFORE pushing the code that uses them.
  </what-built>
  <how-to-verify>
    Apply BOTH SQL files via Supabase SQL Editor (or `supabase db push` if linked) in production project, in order (idempotency first, closed_at second). Verify:

    1. `SELECT 1 FROM crm_mutation_idempotency_keys LIMIT 0;` → no error.
    2. `SELECT closed_at FROM orders LIMIT 0;` → no error.
    3. `SELECT indexname FROM pg_indexes WHERE tablename = 'orders' AND indexname = 'idx_orders_closed_at_not_null';` → returns 1 row.
    4. `SELECT policyname FROM pg_policies WHERE tablename = 'crm_mutation_idempotency_keys';` → 1 row (`crm_mutation_idempotency_keys_select`).

    Then type "approved" so executor can continue with domain function + cron + push.
  </how-to-verify>
  <action>STOP. Present both migration paths to user. Wait for explicit "approved" signal.</action>
  <verify>
    <automated>echo "blocked-on-user-approval"</automated>
  </verify>
  <acceptance_criteria>
    User has typed "approved" or equivalent confirming both migrations applied. NO push to main may occur before this signal.
  </acceptance_criteria>
  <done>User confirms both migrations applied to production Supabase.</done>
  <resume-signal>Type "approved" after applying both SQL files to production Supabase.</resume-signal>
</task>

<task type="auto" tdd="false">
  <name>Task 1.4: Create domain `src/lib/domain/crm-mutation-idempotency.ts`</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:646-678 (Domain layer skeleton)
    - src/lib/domain/types.ts (verify `DomainContext`, `DomainResult` types)
    - src/lib/domain/contacts.ts:1-50 (createAdminClient + DomainResult pattern)
  </read_first>
  <action>
    Crear `src/lib/domain/crm-mutation-idempotency.ts` con la implementación completa (no solo skeleton). Exports:

    ```typescript
    import { createAdminClient } from '@/lib/supabase/admin'
    import type { DomainContext, DomainResult } from './types'

    export interface IdempotencyRow {
      workspaceId: string
      toolName: string
      key: string
      resultId: string
      resultPayload: unknown
      createdAt: string
    }

    /**
     * Lookup an idempotency row by (workspace_id, tool_name, key).
     * Returns DomainResult with data: null if not found (success path).
     */
    export async function getIdempotencyRow(
      ctx: DomainContext,
      params: { toolName: string; key: string },
    ): Promise<DomainResult<IdempotencyRow | null>> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('crm_mutation_idempotency_keys')
        .select('workspace_id, tool_name, key, result_id, result_payload, created_at')
        .eq('workspace_id', ctx.workspaceId)
        .eq('tool_name', params.toolName)
        .eq('key', params.key)
        .maybeSingle()
      if (error) return { success: false, error: error.message }
      if (!data) return { success: true, data: null }
      return {
        success: true,
        data: {
          workspaceId: data.workspace_id,
          toolName: data.tool_name,
          key: data.key,
          resultId: data.result_id,
          resultPayload: data.result_payload,
          createdAt: data.created_at,
        },
      }
    }

    /**
     * Insert idempotency row with ON CONFLICT DO NOTHING.
     * Returns inserted=true if row was inserted (we won the race);
     * inserted=false if conflict (caller should re-fetch winner).
     */
    export async function insertIdempotencyRow(
      ctx: DomainContext,
      params: { toolName: string; key: string; resultId: string; resultPayload: unknown },
    ): Promise<DomainResult<{ inserted: boolean }>> {
      const supabase = createAdminClient()
      // Upsert with ignoreDuplicates=true effectively performs ON CONFLICT DO NOTHING.
      const { data, error } = await supabase
        .from('crm_mutation_idempotency_keys')
        .upsert(
          {
            workspace_id: ctx.workspaceId,
            tool_name: params.toolName,
            key: params.key,
            result_id: params.resultId,
            result_payload: params.resultPayload as never,
          },
          { onConflict: 'workspace_id,tool_name,key', ignoreDuplicates: true },
        )
        .select('workspace_id')
      if (error) return { success: false, error: error.message }
      // data is array of rows actually inserted; empty array = conflict.
      return { success: true, data: { inserted: Array.isArray(data) && data.length > 0 } }
    }

    /**
     * Delete idempotency rows older than `olderThanDays`. Workspace-agnostic
     * (cron sweeps globally). Returns count deleted.
     */
    export async function pruneIdempotencyRows(
      olderThanDays: number,
    ): Promise<DomainResult<{ deleted: number }>> {
      const supabase = createAdminClient()
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
      const { error, count } = await supabase
        .from('crm_mutation_idempotency_keys')
        .delete({ count: 'exact' })
        .lt('created_at', cutoff)
      if (error) return { success: false, error: error.message }
      return { success: true, data: { deleted: count ?? 0 } }
    }
    ```

    Confirmar que `DomainContext` (importado de `./types`) tiene shape `{ workspaceId: string }` o equivalente — leer `src/lib/domain/types.ts` antes de write si hay duda.
  </action>
  <verify>
    <automated>test -f src/lib/domain/crm-mutation-idempotency.ts && grep -c "export async function getIdempotencyRow\|export async function insertIdempotencyRow\|export async function pruneIdempotencyRows" src/lib/domain/crm-mutation-idempotency.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/domain/crm-mutation-idempotency.ts` exists.
    - Exports 3 functions: `getIdempotencyRow`, `insertIdempotencyRow`, `pruneIdempotencyRows`.
    - `grep -c "createAdminClient" src/lib/domain/crm-mutation-idempotency.ts` ≥ 1 (this IS the domain — admin client allowed here only).
    - `npx tsc --noEmit -p .` reports zero errors in this file.
  </acceptance_criteria>
  <done>Domain helpers para idempotencia listos.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.5: Add `closeOrder` to `src/lib/domain/orders.ts` (mirror archiveOrder)</name>
  <read_first>
    - src/lib/domain/orders.ts:1604-1700 (archiveOrder pattern — exact mirror target)
    - src/lib/domain/orders.ts:1-120 (imports + DomainContext + helpers in this file)
    - .planning/standalone/crm-mutation-tools/CONTEXT.md:130-138 (D-11 Resolution A spec)
  </read_first>
  <action>
    En `src/lib/domain/orders.ts`, agregar al final del archivo (o cerca de `archiveOrder`) la nueva función `closeOrder`:

    ```typescript
    /**
     * Close an order by setting `closed_at`. Soft-close — order remains visible in history.
     * Idempotent: if already closed, returns existing closed_at without re-mutating.
     *
     * Standalone crm-mutation-tools D-11 (Resolution A). Independent of archived_at.
     * Distinct semantics from archiveOrder:
     *   closeOrder  → "pedido finalizado/entregado/cancelado por flujo de negocio"
     *   archiveOrder → "soft-delete (oculto del UI por defecto)"
     */
    export async function closeOrder(
      ctx: DomainContext,
      params: { orderId: string },
    ): Promise<DomainResult<OrderDetail>> {
      const supabase = createAdminClient()

      // Pre-check existence within workspace (mirror archiveOrder pattern)
      const { data: existing, error: selectError } = await supabase
        .from('orders')
        .select('id, closed_at, workspace_id')
        .eq('id', params.orderId)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle()
      if (selectError) return { success: false, error: selectError.message }
      if (!existing) return { success: false, error: 'Pedido no encontrado en este workspace' }

      // Idempotent: only update if not already closed
      if (!existing.closed_at) {
        const { error: updateError } = await supabase
          .from('orders')
          .update({ closed_at: new Date().toISOString() })
          .eq('id', params.orderId)
          .eq('workspace_id', ctx.workspaceId)
        if (updateError) return { success: false, error: updateError.message }
      }

      // Re-hydrate via getOrderById (D-09 pattern)
      const detail = await getOrderById(ctx, { orderId: params.orderId })
      if (!detail.success || !detail.data) {
        return { success: false, error: detail.success ? 'Pedido no encontrado tras cerrar' : detail.error }
      }
      return { success: true, data: detail.data }
    }
    ```

    Si la función `getOrderById` no está exportada todavía, NO agregarla aquí (Plan 02 la usa). Solo asegurar que `closeOrder` la invoca correctamente. Si `OrderDetail` type necesita `closedAt: string | null`, agregar el campo a la interface (verificar primero si existe).

    No emit triggers automation por ahora — D-11 indica "no hay eventos triggers para 'closed' hoy", queda como nota TODO inline.
  </action>
  <verify>
    <automated>grep -c "export async function closeOrder" src/lib/domain/orders.ts && npx tsc --noEmit -p . 2>&1 | grep "src/lib/domain/orders.ts" | head -3</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export async function closeOrder" src/lib/domain/orders.ts` == 1.
    - `npx tsc --noEmit -p .` reports zero errors in `src/lib/domain/orders.ts`.
    - `grep -c "closed_at" src/lib/domain/orders.ts` ≥ 2 (used in select + update or referenced in interface).
  </acceptance_criteria>
  <done>Domain function closeOrder lista (mirror archiveOrder pattern).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.5-bis: Add domain getters `getContactNoteById` + `getOrderNoteById` + `getTaskById` (rehydrate prerequisite for Plan 04, A11 gap)</name>
  <read_first>
    - src/lib/domain/contacts.ts (find existing `getContactById` — exact shape reference para tipo del row + workspace filter pattern)
    - src/lib/domain/orders.ts (find `getOrderById` — interface + select shape mirror)
    - src/lib/domain/notes.ts:1-100 (top of file for imports + DomainResult/DomainContext usage + tabla names: `contact_notes` para createNote, `order_notes` para createOrderNote — verificar nombres exactos en queries existentes de archiveNote líneas ~606-680)
    - src/lib/domain/tasks.ts:1-100 (top of file — tabla `tasks`, verificar columns reales mediante archiveTask/completeTask/getTaskById ausente — ver completeTask:281-355)
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:1163-1166 (A11 — getNoteById/getTaskById no verificados)
    - .planning/standalone/crm-mutation-tools/CONTEXT.md (D-09 — rehydrate via getXxxById, NUNCA fabricar desde input)
  </read_first>
  <action>
    Plan 04 necesita rehydrate verídico de notes (contact + order) y tasks vía domain getter (Pitfall 6: NUNCA fabricar `{ noteId, body }` desde el input). Research A11 confirmó que estos getters NO existen aún. Agregar 3 getters al domain ahora — Wave 0 — para que Plan 04 los pueda importar. Verified (orchestrator): `notes.ts` tiene createNote/updateNote/deleteNote/createTaskNote/.../archiveNote/archiveOrderNote — sin getNoteById; `tasks.ts` tiene createTask/updateTask/completeTask/deleteTask — sin getTaskById.

    1. **Editar `src/lib/domain/notes.ts`** — agregar al final del archivo (o cerca de `archiveNote` / `archiveOrderNote` cuyo shape de retorno se mirroreará):

    ```typescript
    /**
     * Detail shape returned by getContactNoteById. Mirror style del row real de tabla `contact_notes`.
     * Exposed in camelCase para tools (consistente con CreateNoteResult).
     */
    export interface ContactNoteDetail {
      noteId: string
      contactId: string
      workspaceId: string
      body: string
      createdAt: string
      archivedAt: string | null
    }

    /**
     * Lookup a contact note by id. Filtered by workspace_id (Regla 3).
     * Returns DomainResult<ContactNoteDetail | null> — null = not found in this workspace.
     *
     * Standalone crm-mutation-tools Wave 0 (A11 gap closure for Plan 04 rehydrate, D-09).
     */
    export async function getContactNoteById(
      ctx: DomainContext,
      params: { noteId: string },
    ): Promise<DomainResult<ContactNoteDetail | null>> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('contact_notes')
        .select('id, contact_id, workspace_id, body, created_at, archived_at')
        .eq('id', params.noteId)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle()
      if (error) return { success: false, error: error.message }
      if (!data) return { success: true, data: null }
      return {
        success: true,
        data: {
          noteId: data.id as string,
          contactId: data.contact_id as string,
          workspaceId: data.workspace_id as string,
          body: data.body as string,
          createdAt: data.created_at as string,
          archivedAt: (data.archived_at as string | null) ?? null,
        },
      }
    }

    /**
     * Detail shape para order notes (tabla `order_notes`).
     */
    export interface OrderNoteDetail {
      noteId: string
      orderId: string
      workspaceId: string
      body: string
      createdAt: string
      archivedAt: string | null
    }

    /**
     * Lookup an order note by id. Filtered by workspace_id (Regla 3).
     * Returns DomainResult<OrderNoteDetail | null> — null = not found in this workspace.
     *
     * Standalone crm-mutation-tools Wave 0 (A11 gap closure for Plan 04 rehydrate, D-09).
     */
    export async function getOrderNoteById(
      ctx: DomainContext,
      params: { noteId: string },
    ): Promise<DomainResult<OrderNoteDetail | null>> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('order_notes')
        .select('id, order_id, workspace_id, body, created_at, archived_at')
        .eq('id', params.noteId)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle()
      if (error) return { success: false, error: error.message }
      if (!data) return { success: true, data: null }
      return {
        success: true,
        data: {
          noteId: data.id as string,
          orderId: data.order_id as string,
          workspaceId: data.workspace_id as string,
          body: data.body as string,
          createdAt: data.created_at as string,
          archivedAt: (data.archived_at as string | null) ?? null,
        },
      }
    }
    ```

    **IMPORTANTE — verificación previa:** Antes de escribir, leer las líneas de `archiveNote` y `archiveOrderNote` (~600-720 según las exports) para confirmar:
    - Nombres exactos de tablas (`contact_notes` vs `notes`; `order_notes`) — usar lo que las funciones existentes usan.
    - Nombre de columna body (probable `body`; si fuese `content`, ajustar el SELECT y el campo del interface a `body` keeping camelCase consistency).
    - Campo `archived_at` realmente existe (sí, según archiveNote/archiveOrderNote).

    Si alguna columna difiere (ej: la tabla contact_notes en realidad se llama `notes` con discriminator `parent_type`), AJUSTAR la query a la tabla real y re-shape el return — pero MANTENER el contract `ContactNoteDetail` / `OrderNoteDetail` exportado igual. La interface es el contract; el SELECT se adapta al schema real.

    2. **Editar `src/lib/domain/tasks.ts`** — agregar al final del archivo:

    ```typescript
    /**
     * Detail shape returned by getTaskById.
     * Espejo de columnas reales de tabla `tasks`, expuestas en camelCase.
     */
    export interface TaskDetail {
      taskId: string
      workspaceId: string
      title: string
      description: string | null
      status: string
      contactId: string | null
      orderId: string | null
      conversationId: string | null
      assignedTo: string | null
      dueAt: string | null
      completedAt: string | null
      archivedAt: string | null
      createdAt: string
    }

    /**
     * Lookup a task by id. Filtered by workspace_id (Regla 3).
     * Returns DomainResult<TaskDetail | null> — null = not found in this workspace.
     *
     * Standalone crm-mutation-tools Wave 0 (A11 gap closure for Plan 04 rehydrate, D-09).
     */
    export async function getTaskById(
      ctx: DomainContext,
      params: { taskId: string },
    ): Promise<DomainResult<TaskDetail | null>> {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('id, workspace_id, title, description, status, contact_id, order_id, conversation_id, assigned_to, due_at, completed_at, archived_at, created_at')
        .eq('id', params.taskId)
        .eq('workspace_id', ctx.workspaceId)
        .maybeSingle()
      if (error) return { success: false, error: error.message }
      if (!data) return { success: true, data: null }
      return {
        success: true,
        data: {
          taskId: data.id as string,
          workspaceId: data.workspace_id as string,
          title: data.title as string,
          description: (data.description as string | null) ?? null,
          status: data.status as string,
          contactId: (data.contact_id as string | null) ?? null,
          orderId: (data.order_id as string | null) ?? null,
          conversationId: (data.conversation_id as string | null) ?? null,
          assignedTo: (data.assigned_to as string | null) ?? null,
          dueAt: (data.due_at as string | null) ?? null,
          completedAt: (data.completed_at as string | null) ?? null,
          archivedAt: (data.archived_at as string | null) ?? null,
          createdAt: data.created_at as string,
        },
      }
    }
    ```

    Nuevamente: verificar nombres exactos de columnas leyendo `completeTask` (líneas ~281-355) y `updateTask` (~170-280). Si alguna columna no existe (ej: `archived_at` puede no existir en tasks — `tasks` usa `completed_at` como soft-delete según CLAUDE.md y A11), AJUSTAR el SELECT y el interface — pero seguir exponiendo `completedAt` siempre (es el field crítico para snapshot rehydrate de completeTask).

    3. **NO modificar imports de archivos consumidores** en este task — solo agregar las funciones al domain. Plan 04 las importa.
  </action>
  <verify>
    <automated>grep -c "^export async function getContactNoteById" src/lib/domain/notes.ts && grep -c "^export async function getOrderNoteById" src/lib/domain/notes.ts && grep -c "^export async function getTaskById" src/lib/domain/tasks.ts && npx tsc --noEmit -p . 2>&1 | grep -E "src/lib/domain/(notes|tasks)\.ts" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c '^export async function getContactNoteById' src/lib/domain/notes.ts` ≥ 1.
    - `grep -c '^export async function getOrderNoteById' src/lib/domain/notes.ts` ≥ 1.
    - `grep -c '^export async function getTaskById' src/lib/domain/tasks.ts` ≥ 1.
    - Las 3 funciones filtran por workspace_id en la query — verificable: `grep -A 20 "export async function getContactNoteById\|export async function getOrderNoteById" src/lib/domain/notes.ts | grep -c "\.eq('workspace_id'"` ≥ 2 (1 por función), y `grep -A 20 "export async function getTaskById" src/lib/domain/tasks.ts | grep -c "\.eq('workspace_id'"` ≥ 1.
    - Las 3 interfaces (`ContactNoteDetail`, `OrderNoteDetail`, `TaskDetail`) exportadas: `grep -c "^export interface ContactNoteDetail\|^export interface OrderNoteDetail" src/lib/domain/notes.ts` ≥ 2 + `grep -c "^export interface TaskDetail" src/lib/domain/tasks.ts` ≥ 1.
    - `npx tsc --noEmit -p . 2>&1 | grep -E 'src/lib/domain/(notes|tasks)\.ts' | wc -l` == 0 (cero errores TS en estos dos archivos).
  </acceptance_criteria>
  <done>Domain getters by-id listos para Plan 04. A11 gap cerrado.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.6: Create Inngest cron `crm-mutation-idempotency-cleanup` + register</name>
  <read_first>
    - .planning/standalone/crm-mutation-tools/RESEARCH.md:731-759 (cron skeleton)
    - src/inngest/functions/crm-bot-expire-proposals.ts:43-72 (cron pattern reference)
    - src/inngest/functions/close-stale-sessions.ts:35 (TZ=America/Bogota syntax verified)
    - src/app/api/inngest/route.ts (existing function registration list)
  </read_first>
  <action>
    1. Crear `src/inngest/functions/crm-mutation-idempotency-cleanup.ts`:

    ```typescript
    import { inngest } from '@/inngest/client'
    import { pruneIdempotencyRows } from '@/lib/domain/crm-mutation-idempotency'

    /**
     * Standalone crm-mutation-tools — Wave 0 (D-03).
     * Sweeps crm_mutation_idempotency_keys older than 30 days.
     * Cron: TZ=America/Bogota 0 3 * * *  (daily 03:00 Bogota — off-peak).
     */
    export const crmMutationIdempotencyCleanupCron = inngest.createFunction(
      { id: 'crm-mutation-idempotency-cleanup', name: 'CRM Mutation: Idempotency Cleanup' },
      { cron: 'TZ=America/Bogota 0 3 * * *' },
      async ({ step, logger }) => {
        const result = await step.run('prune-old-keys', () => pruneIdempotencyRows(30))
        logger.info(
          { result, cronRunAt: new Date().toISOString() },
          'crm-mutation-idempotency-cleanup complete',
        )
        return result
      },
    )
    ```

    2. **Commit ordering (WARNING #5 — Inngest registration safety):** `src/app/api/inngest/route.ts` es infraestructura compartida — un import roto silenciosamente rompe TODOS los crons del proyecto (Regla 5 referencia el incidente de 20h de mensajes perdidos). Por tanto:

       a. Stage + commit el archivo NUEVO `crm-mutation-idempotency-cleanup.ts` PRIMERO (puede ser parte del commit final de Task 1.7, pero NO editar `route.ts` antes de que el cron file exista on-disk).
       b. RECIÉN DESPUÉS, editar `src/app/api/inngest/route.ts`:
          - Agregar import: `import { crmMutationIdempotencyCleanupCron } from '@/inngest/functions/crm-mutation-idempotency-cleanup'`
          - Agregar al array `functions: [...]` el nuevo cron (al final, después de los existentes).
       c. Antes de pushear (en Task 1.7), correr `npx tsc --noEmit -p . 2>&1 | grep -E "src/app/api/inngest" | wc -l` y verificar == 0.
       d. **Smoke opcional dev** (solo si dev server corre en puerto 3020 — saltar limpiamente si no): `curl -fsS -X PUT http://localhost:3020/api/inngest 2>&1 | grep -c 'crm-mutation-idempotency-cleanup'` debe retornar ≥ 1. Si dev server no está disponible, OK skip — el `tsc` gate es el guardián real.
  </action>
  <verify>
    <automated>test -f src/inngest/functions/crm-mutation-idempotency-cleanup.ts && grep -c "crmMutationIdempotencyCleanupCron" src/app/api/inngest/route.ts && npx tsc --noEmit -p . 2>&1 | grep -E "src/app/api/inngest" | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - File `src/inngest/functions/crm-mutation-idempotency-cleanup.ts` exists.
    - `grep -c "TZ=America/Bogota 0 3 \\* \\* \\*" src/inngest/functions/crm-mutation-idempotency-cleanup.ts` == 1.
    - `grep -c "crmMutationIdempotencyCleanupCron" src/app/api/inngest/route.ts` ≥ 1 (registration).
    - **Cron file staged + committed BEFORE `route.ts` is edited** (verifiable in `git log --diff-filter=A` vs `git log --diff-filter=M` order if executor uses separate commits; OR if both in same commit, the file ordering in `git diff --cached --name-only` shows the cron file present alongside the route edit — never route.ts modified solo).
    - **TS gate before push:** `npx tsc --noEmit -p . 2>&1 | grep -E "src/app/api/inngest" | wc -l` == 0 (zero errors in route.ts and surrounding inngest infra).
    - **Optional dev smoke** (skip cleanly if dev server is not on port 3020): `curl -fsS -X PUT http://localhost:3020/api/inngest 2>&1 | grep -c 'crm-mutation-idempotency-cleanup'` ≥ 1. If `curl` fails connect, NOT a blocker — `tsc` gate suffices.
    - `npx tsc --noEmit -p .` reports zero new errors anywhere.
  </acceptance_criteria>
  <done>Cron diario registrado de forma segura — sin riesgo de romper infra Inngest compartida.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 1.7: Commit + push (Regla 1)</name>
  <read_first>
    - CLAUDE.md (Regla 1, Regla 5 — migrations already applied per Task 1.3)
  </read_first>
  <action>
    Stage + commit + push:

    ```
    git add supabase/migrations/*_crm_mutation_idempotency_keys.sql \
            supabase/migrations/*_orders_closed_at.sql \
            src/lib/domain/crm-mutation-idempotency.ts \
            src/lib/domain/orders.ts \
            src/lib/domain/notes.ts \
            src/lib/domain/tasks.ts \
            src/inngest/functions/crm-mutation-idempotency-cleanup.ts \
            src/app/api/inngest/route.ts

    git commit -m "$(cat <<'EOF'
    feat(crm-mutation-tools): wave 0 foundation — migrations + closeOrder + getters + cron

    - Migration crm_mutation_idempotency_keys (PK workspace_id+tool_name+key, RLS member SELECT, service_role ALL).
    - Migration orders.closed_at TIMESTAMPTZ NULL + partial index (D-11 Resolución A).
    - Domain crm-mutation-idempotency.ts (getIdempotencyRow + insertIdempotencyRow + pruneIdempotencyRows).
    - Domain orders.closeOrder mirror archiveOrder, idempotente, re-hidrata via getOrderById.
    - Domain notes.getContactNoteById + getOrderNoteById (rehydrate prerequisite for Plan 04, A11 gap, D-09).
    - Domain tasks.getTaskById (rehydrate prerequisite for Plan 04 completeTask, A11 gap, D-09).
    - Inngest cron crm-mutation-idempotency-cleanup TZ=America/Bogota 0 3 * * *.

    Standalone: crm-mutation-tools Plan 01 (Wave 0).
    Refs MUT-OR-05, D-03, D-09, D-11.

    Co-authored-by: Claude <noreply@anthropic.com>
    EOF
    )"

    git push origin main
    ```
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -i "crm-mutation-tools" && git status --short | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `git log -1 --oneline` includes "crm-mutation-tools" + "wave 0".
    - `git status` clean.
    - `git log origin/main..HEAD` empty (push succeeded).
  </acceptance_criteria>
  <done>Wave 0 cierra. Plan 02 unblocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Developer → Production Supabase | SQL migrations applied via Supabase SQL Editor (Regla 5 PAUSE) |
| Inngest cron → DB | Daily prune of old idempotency rows |
| Domain layer → Supabase admin client | createAdminClient bypasses RLS; filters by workspace_id |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-01-01 | Tampering | Migration applied incorrectly to wrong DB | LOW | mitigate | Regla 5 PAUSE — user manually applies in production Supabase Editor; verifies via 4 SELECT statements before signaling approved. |
| T-01-02 | Information Disclosure | RLS allows cross-workspace SELECT on idempotency keys | LOW | mitigate | Policy `is_workspace_member(workspace_id)` enforced. Cross-workspace integration test in Plan 05. |
| T-01-03 | Repudiation | Cron silently fails to prune | INFO | mitigate | logger.info captures result + cronRunAt; visible in Inngest dashboard. |
| T-01-04 | Tampering | UPDATE attempt on idempotency row | INFO | mitigate | NO UPDATE policy = denied for authenticated; service_role bypasses but domain layer never updates (only INSERT/DELETE). |
| T-01-05 | Elevation of Privilege | closeOrder mutating order outside workspace | LOW | mitigate | Pre-check `WHERE workspace_id = ctx.workspaceId` returns null for cross-workspace IDs → "Pedido no encontrado en este workspace". |
| T-01-06 | Elevation of Privilege | getContactNoteById/getOrderNoteById/getTaskById bypass workspace isolation | LOW | mitigate | Cada función filtra `.eq('workspace_id', ctx.workspaceId)` antes de retornar; cross-workspace IDs → `data: null` → caller maps a resource_not_found. Verificable por grep. |
| T-01-07 | Tampering | Inngest route.ts edit breaks unrelated crons (20h messages-lost incident class) | HIGH | mitigate | Task 1.6 acceptance enforces tsc gate over `src/app/api/inngest/**` antes de push; cron file committed antes/junto con route.ts edit; optional dev-server PUT smoke. |
</threat_model>

<must_haves>
truths:
  - "Production Supabase has crm_mutation_idempotency_keys table with PK (workspace_id, tool_name, key)."
  - "Production Supabase has orders.closed_at column."
  - "Domain function closeOrder mirrors archiveOrder pattern (idempotent, workspace-filtered)."
  - "Domain getters getContactNoteById, getOrderNoteById, getTaskById exist and filter by workspace_id (A11 gap closed; Plan 04 rehydrate prerequisite)."
  - "Inngest cron crm-mutation-idempotency-cleanup is registered and runs daily 03:00 Bogota."
  - "Inngest route.ts edit does NOT break existing cron registrations (tsc gate enforced)."
artifacts:
  - path: "supabase/migrations/*_crm_mutation_idempotency_keys.sql"
    provides: "Idempotency table DDL"
    contains: "PRIMARY KEY (workspace_id, tool_name, key)"
  - path: "supabase/migrations/*_orders_closed_at.sql"
    provides: "orders.closed_at column"
    contains: "ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ"
  - path: "src/lib/domain/crm-mutation-idempotency.ts"
    provides: "getIdempotencyRow + insertIdempotencyRow + pruneIdempotencyRows"
    exports: ["getIdempotencyRow", "insertIdempotencyRow", "pruneIdempotencyRows", "IdempotencyRow"]
  - path: "src/lib/domain/orders.ts"
    provides: "closeOrder domain function"
    contains: "export async function closeOrder"
  - path: "src/lib/domain/notes.ts"
    provides: "getContactNoteById + getOrderNoteById domain getters (Plan 04 rehydrate)"
    exports: ["getContactNoteById", "getOrderNoteById", "ContactNoteDetail", "OrderNoteDetail"]
  - path: "src/lib/domain/tasks.ts"
    provides: "getTaskById domain getter (Plan 04 rehydrate)"
    exports: ["getTaskById", "TaskDetail"]
  - path: "src/inngest/functions/crm-mutation-idempotency-cleanup.ts"
    provides: "Daily cron sweeping rows >30 days"
    exports: ["crmMutationIdempotencyCleanupCron"]
  - path: "src/app/api/inngest/route.ts"
    provides: "Cron registration in functions array"
    contains: "crmMutationIdempotencyCleanupCron"
key_links:
  - from: "src/lib/domain/crm-mutation-idempotency.ts"
    to: "crm_mutation_idempotency_keys table"
    via: "createAdminClient() + filter by workspace_id"
    pattern: "createAdminClient"
  - from: "src/inngest/functions/crm-mutation-idempotency-cleanup.ts"
    to: "src/lib/domain/crm-mutation-idempotency.ts"
    via: "imports pruneIdempotencyRows"
    pattern: "pruneIdempotencyRows"
  - from: "src/app/api/inngest/route.ts"
    to: "src/inngest/functions/crm-mutation-idempotency-cleanup.ts"
    via: "functions: [...] array"
    pattern: "crmMutationIdempotencyCleanupCron"
  - from: "src/lib/domain/notes.ts (Plan 04 will import these getters)"
    to: "contact_notes + order_notes tables"
    via: "createAdminClient() + .eq('workspace_id', ctx.workspaceId)"
    pattern: "getContactNoteById|getOrderNoteById"
  - from: "src/lib/domain/tasks.ts (Plan 04 will import this getter)"
    to: "tasks table"
    via: "createAdminClient() + .eq('workspace_id', ctx.workspaceId)"
    pattern: "getTaskById"
</must_haves>
</content>
