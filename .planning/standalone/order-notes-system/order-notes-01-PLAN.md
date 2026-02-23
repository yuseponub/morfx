---
phase: order-notes-system
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260225000000_order_notes.sql
  - src/lib/orders/types.ts
  - src/lib/domain/notes.ts
autonomous: true

must_haves:
  truths:
    - "order_notes table exists with correct schema (id, order_id, workspace_id, user_id, content, timestamps)"
    - "Domain functions createOrderNote, updateOrderNote, deleteOrderNote exist and follow the exact pattern of task note equivalents"
    - "OrderNote and OrderNoteWithUser types are exported from orders/types.ts"
  artifacts:
    - path: "supabase/migrations/20260225000000_order_notes.sql"
      provides: "order_notes table, indexes, updated_at trigger"
      contains: "CREATE TABLE order_notes"
    - path: "src/lib/orders/types.ts"
      provides: "OrderNote and OrderNoteWithUser interfaces"
      contains: "OrderNoteWithUser"
    - path: "src/lib/domain/notes.ts"
      provides: "createOrderNote, updateOrderNote, deleteOrderNote domain functions"
      exports: ["createOrderNote", "updateOrderNote", "deleteOrderNote"]
  key_links:
    - from: "src/lib/domain/notes.ts"
      to: "order_notes table"
      via: "supabase.from('order_notes')"
      pattern: "from\\('order_notes'\\)"
    - from: "src/lib/domain/notes.ts"
      to: "src/lib/domain/types.ts"
      via: "DomainContext and DomainResult imports"
      pattern: "DomainContext.*DomainResult"
---

<objective>
Create the data foundation for order notes: database table, TypeScript types, and domain layer CRUD functions.

Purpose: Establish the data layer so that server actions and UI can be built on top in Plan 02.
Output: Migration file, extended types, and three new domain functions.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/order-notes-system/RESEARCH.md

Key source files to reference:
@src/lib/domain/notes.ts — Existing domain layer for contact_notes + task_notes (replicate pattern exactly)
@src/lib/orders/types.ts — Add OrderNote + OrderNoteWithUser types here
@src/lib/domain/types.ts — DomainContext and DomainResult types
@src/lib/tasks/types.ts — TaskNote + TaskNoteWithUser as pattern reference (lines 245-263)
@supabase/migrations/20260129000002_custom_fields_notes_activity.sql — Migration pattern reference for contact_notes
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create order_notes migration and add OrderNote types</name>
  <files>
    supabase/migrations/20260225000000_order_notes.sql
    src/lib/orders/types.ts
  </files>
  <action>
    **Migration file** (`supabase/migrations/20260225000000_order_notes.sql`):

    Create the `order_notes` table following the exact same schema as `contact_notes` and `task_notes`:

    ```sql
    CREATE TABLE order_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
      updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
    );

    CREATE INDEX idx_order_notes_order ON order_notes(order_id);
    CREATE INDEX idx_order_notes_workspace ON order_notes(workspace_id);
    CREATE INDEX idx_order_notes_created ON order_notes(created_at DESC);

    CREATE TRIGGER order_notes_updated_at
      BEFORE UPDATE ON order_notes
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    ```

    Note: `update_updated_at_column()` function already exists (used by contact_notes and task_notes triggers). No RLS needed — domain layer uses `createAdminClient()`.

    **Types** (`src/lib/orders/types.ts`):

    Add at the END of the file, after the existing `ReorderStagesPayload` interface, a new section:

    ```typescript
    // ============================================================================
    // ORDER NOTE TYPES
    // ============================================================================

    /**
     * Note attached to an order.
     */
    export interface OrderNote {
      id: string
      order_id: string
      workspace_id: string
      user_id: string
      content: string
      created_at: string
      updated_at: string
    }

    /**
     * Note with user profile info for display.
     */
    export interface OrderNoteWithUser extends OrderNote {
      user: {
        id: string
        email: string
      }
    }
    ```

    Follow the exact same pattern as `TaskNote` / `TaskNoteWithUser` in `src/lib/tasks/types.ts` (lines 245-263).
  </action>
  <verify>
    1. File `supabase/migrations/20260225000000_order_notes.sql` exists and contains CREATE TABLE, 3 indexes, and trigger
    2. `src/lib/orders/types.ts` exports `OrderNote` and `OrderNoteWithUser` interfaces
    3. `npx tsc --noEmit` passes (no type errors)
  </verify>
  <done>
    Migration file creates order_notes table with correct schema, indexes, and auto-update trigger. OrderNote and OrderNoteWithUser types are defined and exported.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add order note CRUD to domain layer</name>
  <files>
    src/lib/domain/notes.ts
  </files>
  <action>
    Extend `src/lib/domain/notes.ts` with three new functions following the **exact** pattern of the existing task note functions. Add them at the END of the file, after `deleteTaskNote`.

    **1. Add param and result types** (after existing DeleteTaskNoteResult):

    ```typescript
    // Order note params
    export interface CreateOrderNoteParams {
      orderId: string
      content: string
      /** user.id from auth */
      createdBy: string
    }

    export interface UpdateOrderNoteParams {
      noteId: string
      content: string
    }

    export interface DeleteOrderNoteParams {
      noteId: string
    }

    // Order note results
    export interface CreateOrderNoteResult {
      noteId: string
    }

    export interface UpdateOrderNoteResult {
      noteId: string
    }

    export interface DeleteOrderNoteResult {
      noteId: string
    }
    ```

    **2. Add createOrderNote function:**

    Copy the exact pattern from `createTaskNote` (lines 259-309) but:
    - Table: `order_notes` instead of `task_notes`
    - FK field: `order_id: params.orderId` instead of `task_id: params.taskId`
    - **No activity logging** — there is no `order_activity` table, so skip the fire-and-forget activity insert entirely
    - Error messages: use "nota de pedido" instead of "nota de tarea"
    - Console log prefix: `[domain/notes] createOrderNote`

    **3. Add updateOrderNote function:**

    Copy the exact pattern from `updateTaskNote` (lines 318-359) but:
    - Table: `order_notes` instead of `task_notes`
    - Select fields: `id, order_id, workspace_id` (instead of `id, task_id, workspace_id`)
    - Error messages: use "nota de pedido"
    - Console log prefix: `[domain/notes] updateOrderNote`

    **4. Add deleteOrderNote function:**

    Copy the exact pattern from `deleteTaskNote` (lines 369-415) but:
    - Table: `order_notes` instead of `task_notes`
    - Select fields: `id, order_id, workspace_id, user_id, content`
    - **No activity logging** before deletion — skip the `order_activity` insert entirely (no such table exists)
    - Error messages: use "nota de pedido"
    - Console log prefix: `[domain/notes] deleteOrderNote`

    **Important:** Keep the file header comment updated to say "Domain Layer — Notes (Contact Notes + Task Notes + Order Notes)".
  </action>
  <verify>
    1. `src/lib/domain/notes.ts` exports `createOrderNote`, `updateOrderNote`, `deleteOrderNote`
    2. Each function uses `createAdminClient()`, filters by `ctx.workspaceId`, returns `DomainResult<T>`
    3. No activity logging in order note functions (no order_activity table)
    4. `npx tsc --noEmit` passes
  </verify>
  <done>
    Three domain functions (createOrderNote, updateOrderNote, deleteOrderNote) exist with correct table references, workspace filtering, and no activity logging. File header updated.
  </done>
</task>

</tasks>

<verification>
1. Migration file exists at `supabase/migrations/20260225000000_order_notes.sql` with correct schema
2. `OrderNote` and `OrderNoteWithUser` types exported from `src/lib/orders/types.ts`
3. `createOrderNote`, `updateOrderNote`, `deleteOrderNote` exported from `src/lib/domain/notes.ts`
4. All three domain functions follow the task_notes pattern (createAdminClient, workspace filter, DomainResult)
5. No activity logging in order note domain functions
6. `npx tsc --noEmit` passes with no errors
</verification>

<success_criteria>
- order_notes migration creates table with 7 columns, 3 indexes, and updated_at trigger
- Domain functions are functional and type-safe
- Types mirror the TaskNote/TaskNoteWithUser pattern exactly
- TypeScript compilation succeeds
</success_criteria>

<output>
After completion, create `.planning/standalone/order-notes-system/order-notes-01-SUMMARY.md`
</output>
