---
phase: order-notes-system
plan: 02
type: execute
wave: 2
depends_on: ["order-notes-01"]
files_modified:
  - src/app/actions/order-notes.ts
  - src/app/(dashboard)/crm/pedidos/components/order-notes-section.tsx
  - src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
  - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
  - src/app/(dashboard)/crm/pedidos/components/order-form.tsx
  - src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx
  - src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx
  - src/app/actions/orders.ts
  - src/app/(dashboard)/crm/pedidos/page.tsx
autonomous: true

must_haves:
  truths:
    - "User can add a note to an order and see it appear immediately in the order sheet"
    - "User can edit their own notes (or any note if admin/owner)"
    - "User can delete their own notes (or any note if admin/owner)"
    - "Notes show author email, relative creation time, and content"
    - "Notes are ordered most recent first"
    - "All 6 former 'Notas' labels now say 'Descripcion' for the order.description field"
    - "WhatsApp view-order-sheet shows notes in read-only mode"
  artifacts:
    - path: "src/app/actions/order-notes.ts"
      provides: "Server actions for getOrderNotes, createOrderNote, updateOrderNote, deleteOrderNote"
      exports: ["getOrderNotes", "createOrderNote", "updateOrderNote", "deleteOrderNote"]
    - path: "src/app/(dashboard)/crm/pedidos/components/order-notes-section.tsx"
      provides: "Client component for notes CRUD UI with optimistic updates"
      exports: ["OrderNotesSection"]
    - path: "src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx"
      provides: "Order detail sheet with integrated notes section and 'Descripcion' label"
      contains: "OrderNotesSection"
  key_links:
    - from: "src/app/actions/order-notes.ts"
      to: "src/lib/domain/notes.ts"
      via: "domain function imports"
      pattern: "import.*createOrderNote.*from.*domain/notes"
    - from: "src/app/(dashboard)/crm/pedidos/components/order-notes-section.tsx"
      to: "src/app/actions/order-notes.ts"
      via: "server action calls"
      pattern: "import.*from.*actions/order-notes"
    - from: "src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx"
      to: "src/app/(dashboard)/crm/pedidos/components/order-notes-section.tsx"
      via: "component embedding"
      pattern: "<OrderNotesSection"
---

<objective>
Build the full server actions, UI component, and integrate the notes system into the order sheet. Also rename "Notas" to "Descripcion" across all 6 UI locations.

Purpose: Complete the order notes feature so users can add, edit, and delete notes on orders.
Output: Working notes CRUD in order sheet, read-only notes in WhatsApp view, and consistent "Descripcion" labeling.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/order-notes-system/RESEARCH.md
@.planning/standalone/order-notes-system/order-notes-01-SUMMARY.md

Key source files to reference:
@src/app/actions/task-notes.ts — Server action pattern to replicate exactly
@src/components/tasks/task-notes.tsx — UI component pattern to replicate exactly (TaskNotesSection)
@src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx — Integration target (add notes section + rename Notas)
@src/app/(dashboard)/crm/pedidos/components/orders-view.tsx — Parent component (pass currentUserId + isAdminOrOwner)
@src/app/(dashboard)/crm/pedidos/page.tsx — Page component (fetch membership for isAdminOrOwner)
@src/app/(dashboard)/crm/pedidos/components/order-form.tsx — Rename "Notas" label
@src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx — Rename "Notas" + add read-only notes
@src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx — Rename "Notas / descripcion"
@src/app/actions/orders.ts — Rename CSV header "Notas" to "Descripcion"
@src/components/ui/timeline.tsx — Timeline + TimelineItem + formatRelativeDate imports
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create server actions for order notes</name>
  <files>
    src/app/actions/order-notes.ts
  </files>
  <action>
    Create `src/app/actions/order-notes.ts` following the **exact** pattern from `src/app/actions/task-notes.ts`.

    The file must be a `'use server'` module exporting 4 functions:

    **1. getOrderNotes(orderId: string): Promise&lt;OrderNoteWithUser[]&gt;**
    - Auth check via `createClient()` + `supabase.auth.getUser()`
    - Query `order_notes` table filtered by `order_id`, ordered by `created_at DESC`
    - Get unique user_ids, query `profiles` table for email
    - Build profileMap, return notes with user info attached
    - Same pattern as `getTaskNotes` in task-notes.ts

    **2. createOrderNote(orderId: string, content: string): Promise&lt;ActionResult&lt;OrderNoteWithUser&gt;&gt;**
    - Auth check + content validation
    - Get `workspaceId` from cookie (`morfx_workspace`)
    - Delegate to `domainCreateOrderNote(ctx, { orderId, content, createdBy: user.id })`
    - On success: re-read the note from DB with profile info
    - `revalidatePath('/crm/pedidos')`
    - Same pattern as `createTaskNote` in task-notes.ts

    **3. updateOrderNote(noteId: string, content: string): Promise&lt;ActionResult&lt;void&gt;&gt;**
    - Auth check + content validation
    - Fetch note to check permissions: is author OR admin/owner (query `workspace_members`)
    - Delegate to `domainUpdateOrderNote(ctx, { noteId, content })`
    - `revalidatePath('/crm/pedidos')`
    - Same pattern as `updateTaskNote` in task-notes.ts

    **4. deleteOrderNote(noteId: string): Promise&lt;ActionResult&lt;void&gt;&gt;**
    - Auth check
    - Fetch note to check permissions: is author OR admin/owner
    - Delegate to `domainDeleteOrderNote(ctx, { noteId })`
    - `revalidatePath('/crm/pedidos')`
    - Same pattern as `deleteTaskNote` in task-notes.ts

    **Imports needed:**
    ```typescript
    import { createClient } from '@/lib/supabase/server'
    import { revalidatePath } from 'next/cache'
    import { cookies } from 'next/headers'
    import type { OrderNoteWithUser } from '@/lib/orders/types'
    import {
      createOrderNote as domainCreateOrderNote,
      updateOrderNote as domainUpdateOrderNote,
      deleteOrderNote as domainDeleteOrderNote,
    } from '@/lib/domain/notes'
    import type { DomainContext } from '@/lib/domain/types'
    ```

    **Key difference from task-notes:** `revalidatePath('/crm/pedidos')` instead of `revalidatePath('/tareas')`.
  </action>
  <verify>
    1. File exists at `src/app/actions/order-notes.ts` with `'use server'` directive
    2. Exports getOrderNotes, createOrderNote, updateOrderNote, deleteOrderNote
    3. Permission checks use workspace_members query (same pattern as task-notes.ts)
    4. `npx tsc --noEmit` passes
  </verify>
  <done>
    Server actions for order notes CRUD exist with auth checks, permission validation, domain delegation, and path revalidation.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create OrderNotesSection component and integrate into order sheet</name>
  <files>
    src/app/(dashboard)/crm/pedidos/components/order-notes-section.tsx
    src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
    src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
    src/app/(dashboard)/crm/pedidos/page.tsx
  </files>
  <action>
    **A. Create `OrderNotesSection` component:**

    Create `src/app/(dashboard)/crm/pedidos/components/order-notes-section.tsx` as a near-exact copy of `src/components/tasks/task-notes.tsx` (TaskNotesSection), with these changes:

    1. Props interface:
    ```typescript
    interface OrderNotesSectionProps {
      orderId: string
      initialNotes: OrderNoteWithUser[]
      currentUserId?: string
      isAdminOrOwner?: boolean
      loading?: boolean  // new: show skeleton while loading
    }
    ```

    2. Import from `@/app/actions/order-notes` instead of `@/app/actions/task-notes`
    3. Import `OrderNoteWithUser` from `@/lib/orders/types` instead of TaskNoteWithUser
    4. Optimistic note: use `order_id: orderId` instead of `task_id: taskId`
    5. Empty state text: "Agrega notas para recordar detalles importantes sobre este pedido." (instead of "tarea")
    6. Add loading state: if `loading` prop is true, show a simple "Cargando notas..." text with a LoaderIcon spinner
    7. Update `useEffect` to sync `initialNotes` when they change:
    ```typescript
    React.useEffect(() => {
      setNotes(initialNotes)
    }, [initialNotes])
    ```
    8. `router.refresh()` after successful create/update/delete (same as TaskNotesSection)

    Everything else (Timeline, TimelineItem, formatRelativeDate, edit/delete UI, optimistic updates, canModify logic) is identical to TaskNotesSection.

    **B. Integrate into `order-sheet.tsx`:**

    1. Add new props to `OrderSheetProps`:
    ```typescript
    currentUserId?: string
    isAdminOrOwner?: boolean
    ```

    2. Add state for notes loading:
    ```typescript
    const [orderNotes, setOrderNotes] = React.useState<OrderNoteWithUser[]>([])
    const [notesLoading, setNotesLoading] = React.useState(false)
    ```

    3. Add useEffect to load notes when order sheet opens (after the existing relatedOrders useEffect):
    ```typescript
    React.useEffect(() => {
      if (order?.id && open) {
        setNotesLoading(true)
        getOrderNotes(order.id)
          .then(setOrderNotes)
          .catch(() => setOrderNotes([]))
          .finally(() => setNotesLoading(false))
      } else {
        setOrderNotes([])
      }
    }, [order?.id, open])
    ```

    4. Add imports:
    ```typescript
    import { OrderNotesSection } from './order-notes-section'
    import { getOrderNotes } from '@/app/actions/order-notes'
    import type { OrderNoteWithUser } from '@/lib/orders/types'
    ```

    5. In the ScrollArea, AFTER the description section (currently "Notas" section around line 475-486) and BEFORE the "Fechas" section (line 488-512), add:
    ```tsx
    {/* Order Notes */}
    <Separator />
    <OrderNotesSection
      orderId={order.id}
      initialNotes={orderNotes}
      currentUserId={currentUserId}
      isAdminOrOwner={isAdminOrOwner}
      loading={notesLoading}
    />
    ```

    6. Rename the "Notas" section header (line 481) from `Notas` to `Descripcion`.

    **C. Pass props through `orders-view.tsx`:**

    1. Add `currentUserId` and `isAdminOrOwner` to OrdersView props:
    ```typescript
    interface OrdersViewProps {
      // ... existing props ...
      currentUserId?: string
      isAdminOrOwner?: boolean
    }
    ```

    2. Destructure them in the component function.

    3. Pass them to `<OrderSheet>`:
    ```tsx
    <OrderSheet
      order={viewingOrder}
      open={!!viewingOrder}
      stages={stages}
      allOrders={orders}
      onClose={() => setViewingOrder(null)}
      onEdit={handleEditFromSheet}
      onDelete={handleDeleteFromSheet}
      onViewOrder={setViewingOrder}
      currentUserId={currentUserId}
      isAdminOrOwner={isAdminOrOwner}
    />
    ```

    **D. Fetch membership in `page.tsx`:**

    In `src/app/(dashboard)/crm/pedidos/page.tsx`:

    1. After getting the user, fetch their workspace membership role:
    ```typescript
    const cookieStore = await cookies()
    const workspaceId = cookieStore.get('morfx_workspace')?.value

    let isAdminOrOwner = false
    if (user && workspaceId) {
      const { data: membership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .single()
      isAdminOrOwner = membership?.role === 'admin' || membership?.role === 'owner'
    }
    ```

    2. Add `import { cookies } from 'next/headers'`

    3. Pass to OrdersView:
    ```tsx
    <OrdersView
      orders={orders}
      pipelines={pipelines}
      products={products}
      tags={tags}
      defaultPipelineId={defaultPipeline?.id}
      defaultStageId={defaultPipeline?.stages[0]?.id}
      user={user}
      currentUserId={user?.id}
      isAdminOrOwner={isAdminOrOwner}
    />
    ```
  </action>
  <verify>
    1. `OrderNotesSection` component renders correctly with Timeline, edit/delete buttons, and empty state
    2. Order sheet shows notes section below description, loads notes on open
    3. Creating a note shows it immediately (optimistic), persists on refresh
    4. Edit/delete only visible for author or admin/owner
    5. `npx tsc --noEmit` passes
  </verify>
  <done>
    OrderNotesSection component is fully functional with optimistic updates, integrated into order-sheet with notes loading on open, and permission props flow from page through orders-view to order-sheet.
  </done>
</task>

<task type="auto">
  <name>Task 3: Rename "Notas" to "Descripcion" in all 6 locations + WhatsApp read-only notes</name>
  <files>
    src/app/(dashboard)/crm/pedidos/components/order-form.tsx
    src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx
    src/app/(dashboard)/crm/pedidos/components/bulk-edit-dialog.tsx
    src/app/actions/orders.ts
  </files>
  <action>
    **Rename "Notas" to "Descripcion" in these 5 remaining locations** (order-sheet.tsx was already renamed in Task 2):

    1. **`order-form.tsx` line 425:** Change `<Label htmlFor="description">Notas</Label>` to `<Label htmlFor="description">Descripcion</Label>`

    2. **`order-form.tsx` line 428:** Change `placeholder="Notas adicionales sobre el pedido..."` to `placeholder="Descripcion del pedido..."`

    3. **`view-order-sheet.tsx` line 397:** Change `Notas` section header to `Descripcion`

    4. **`bulk-edit-dialog.tsx` line 22:** Change `'Notas / descripcion'` to `'Descripcion'`

    5. **`orders.ts` (actions) line 718:** Change `'Notas'` CSV header to `'Descripcion'`

    **WhatsApp view-order-sheet read-only notes:**

    In `src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx`, after the renamed "Descripcion" section, add a read-only notes display:

    1. Import `getOrderNotes` from `@/app/actions/order-notes`
    2. Import `type { OrderNoteWithUser }` from `@/lib/orders/types`
    3. Import `MessageSquareIcon` from `lucide-react` (if not already imported)
    4. Add state for notes + useEffect to load when sheet opens (same pattern as order-sheet):
    ```typescript
    const [orderNotes, setOrderNotes] = React.useState<OrderNoteWithUser[]>([])

    React.useEffect(() => {
      if (order?.id) {
        getOrderNotes(order.id).then(setOrderNotes).catch(() => setOrderNotes([]))
      }
    }, [order?.id])
    ```
    5. After the "Descripcion" section, add a read-only notes display:
    ```tsx
    {/* Order Notes (read-only) */}
    {orderNotes.length > 0 && (
      <>
        <Separator />
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <MessageSquareIcon className="h-4 w-4" />
            Notas
          </h3>
          <div className="space-y-3">
            {orderNotes.map(note => (
              <div key={note.id} className="text-sm space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-medium">{note.user.email}</span>
                  <span>·</span>
                  <span>{new Date(note.created_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</span>
                </div>
                <p className="whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        </section>
      </>
    )}
    ```

    This is intentionally read-only — no edit/delete buttons. The WhatsApp view is a reference view; full CRUD happens in the CRM order sheet.
  </action>
  <verify>
    1. Search for "Notas" in all 6 files — only the WhatsApp read-only section header should still say "Notas" (for the notes entity, not the description)
    2. `grep -r '"Notas"' src/app/(dashboard)/crm/pedidos/` returns NO results (all renamed to Descripcion)
    3. CSV export header says "Descripcion" not "Notas"
    4. WhatsApp view shows read-only notes list when notes exist
    5. `npx tsc --noEmit` passes
  </verify>
  <done>
    All 6 "Notas" labels for description are renamed to "Descripcion". WhatsApp view shows read-only notes. The term "Notas" is now reserved exclusively for the new notes system.
  </done>
</task>

</tasks>

<verification>
1. **Create flow:** Open order sheet -> type note -> click "Agregar nota" -> note appears immediately with author email and timestamp
2. **Edit flow:** Click edit on own note -> textarea appears -> modify content -> save -> updated content visible
3. **Delete flow:** Click delete on own note -> confirm dialog -> note removed
4. **Permissions:** Notes by other users show no edit/delete buttons (unless current user is admin/owner)
5. **Label rename:** All 6 locations now show "Descripcion" instead of "Notas" for order.description
6. **WhatsApp:** view-order-sheet shows "Descripcion" for description field, read-only notes list below
7. **CSV export:** Header says "Descripcion"
8. **TypeScript:** `npx tsc --noEmit` passes with no errors
</verification>

<success_criteria>
- Full notes CRUD works in order sheet (create, read, edit, delete)
- Optimistic updates provide instant feedback
- Permission model enforced (author OR admin/owner for edit/delete)
- Notes loaded on-demand when sheet opens (not in initial query)
- All "Notas" labels renamed to "Descripcion" for the description field
- WhatsApp view shows read-only notes
- TypeScript compilation succeeds
</success_criteria>

<output>
After completion, create `.planning/standalone/order-notes-system/order-notes-02-SUMMARY.md`
</output>
