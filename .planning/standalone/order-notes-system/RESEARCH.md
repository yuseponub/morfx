# Order Notes System - Research

**Researched:** 2026-02-23
**Domain:** Order notes CRUD with existing project patterns
**Confidence:** HIGH

## Summary

This feature adds a notes system to orders, following the exact same pattern already established in the codebase for **contact notes** and **task notes**. The project has a well-defined 3-layer architecture (DB migration -> domain layer -> server actions -> UI component) that has been implemented twice for notes already, making this a straightforward pattern replication.

The secondary task is renaming the current "Notas" label (which maps to `order.description`) to "Descripcion" across all UI touchpoints.

**Primary recommendation:** Follow the established contact_notes/task_notes pattern exactly. Create `order_notes` table, extend `src/lib/domain/notes.ts` with order note functions, create `src/app/actions/order-notes.ts` server actions, and build an `OrderNotesSection` component modeled on `NotesSection` / `TaskNotesSection`. The notes section should be embedded directly in the order-sheet ScrollArea, not in a tab system, since the order sheet is a side panel (not a full page like contact detail).

## Standard Stack

### Core

No new libraries needed. Everything uses existing project stack.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase | existing | DB + RLS bypass via admin client | Already used for all domain operations |
| shadcn/ui | existing | Textarea, Button, Timeline components | Already used for notes UI in contacts/tasks |
| sonner | existing | Toast notifications | Already used across the app |
| date-fns | existing | Date formatting | Already imported in order-sheet |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | existing | Icons (MessageSquareIcon, PencilIcon, TrashIcon, UserIcon) | Same icons as contact/task notes |

### Alternatives Considered

None needed. This is pure pattern replication.

**Installation:** No new packages required.

## Architecture Patterns

### Existing 3-Layer Notes Pattern (contact_notes, task_notes)

The project has implemented notes twice already. The pattern is:

```
DB Migration (order_notes table)
    |
Domain Layer (src/lib/domain/notes.ts) — createAdminClient, workspace_id filter, DomainResult<T>
    |
Server Actions (src/app/actions/order-notes.ts) — auth check, delegate to domain, revalidatePath
    |
UI Component (OrderNotesSection) — optimistic updates, edit/delete with permission checks
```

### Recommended File Structure

```
supabase/migrations/
  20260225000000_order_notes.sql         # New table + indexes + trigger

src/lib/domain/
  notes.ts                               # EXTEND with createOrderNote, updateOrderNote, deleteOrderNote

src/lib/orders/
  types.ts                               # ADD OrderNote, OrderNoteWithUser interfaces

src/app/actions/
  order-notes.ts                         # NEW: getOrderNotes, createOrderNote, updateOrderNote, deleteOrderNote

src/app/(dashboard)/crm/pedidos/components/
  order-notes-section.tsx                # NEW: client component (based on TaskNotesSection pattern)
  order-sheet.tsx                        # MODIFY: add notes section, rename "Notas" to "Descripcion"
  order-form.tsx                         # MODIFY: rename "Notas" label to "Descripcion"

src/app/(dashboard)/whatsapp/components/
  view-order-sheet.tsx                   # MODIFY: rename "Notas" to "Descripcion"

src/app/(dashboard)/crm/pedidos/components/
  bulk-edit-dialog.tsx                   # MODIFY: rename "Notas / descripcion" to "Descripcion"

src/app/actions/
  orders.ts                              # MODIFY: CSV export header "Notas" -> "Descripcion"
```

### Pattern 1: DB Migration (from contact_notes)

**What:** `order_notes` table follows exact same schema as `contact_notes` and `task_notes`.
**When to use:** Always — this is the established pattern.
**Source:** `supabase/migrations/20260129000002_custom_fields_notes_activity.sql`

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

-- Auto-update updated_at on update
CREATE TRIGGER order_notes_updated_at
  BEFORE UPDATE ON order_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Key:** The `update_updated_at_column()` function already exists (used by contact_notes trigger).

**RLS:** No RLS needed because domain layer uses `createAdminClient()` (service role key, bypasses RLS). This is the established pattern — all domain functions use admin client and manually filter by `workspace_id`.

### Pattern 2: Domain Layer (from domain/notes.ts)

**What:** Extend `src/lib/domain/notes.ts` with order note CRUD following exact same structure as contact/task notes.
**Source:** `src/lib/domain/notes.ts`

```typescript
// Param types
export interface CreateOrderNoteParams {
  orderId: string
  content: string
  createdBy: string  // user.id from auth
}

export interface UpdateOrderNoteParams {
  noteId: string
  content: string
}

export interface DeleteOrderNoteParams {
  noteId: string
}

// Result types
export interface CreateOrderNoteResult { noteId: string }
export interface UpdateOrderNoteResult { noteId: string }
export interface DeleteOrderNoteResult { noteId: string }

// Functions follow exact same pattern as createNote/updateNote/deleteNote
// Key: insert into 'order_notes' instead of 'contact_notes'
// Key: No activity logging table needed (orders don't have order_activity table)
// But could optionally log — see Open Questions
```

**Key differences from contact_notes:**
- Table is `order_notes` not `contact_notes`
- Foreign key is `order_id` not `contact_id`
- No `contact_activity` logging (orders don't have an activity table — skip this for now)

### Pattern 3: Server Actions (from actions/notes.ts and actions/task-notes.ts)

**What:** Create `src/app/actions/order-notes.ts` following exact same structure.
**Source:** `src/app/actions/notes.ts`, `src/app/actions/task-notes.ts`

Key points from existing pattern:
- `getOrderNotes(orderId)` — auth check, query from DB, join with profiles table for author email
- `createOrderNote(orderId, content)` — auth + workspace check, delegate to domain, re-read with profile, revalidatePath
- `updateOrderNote(noteId, content)` — auth + permission check (author OR admin/owner), delegate to domain
- `deleteOrderNote(noteId)` — auth + permission check, delegate to domain

**Profile lookup pattern:** Server actions query `profiles` table (not `auth.users`) for author display info. The `profiles` table has `id` and `email` columns. Notes display the email as author identifier.

### Pattern 4: UI Component (from NotesSection / TaskNotesSection)

**What:** Create `OrderNotesSection` component following existing pattern.
**Source:** `src/app/(dashboard)/crm/contactos/[id]/components/notes-section.tsx`, `src/components/tasks/task-notes.tsx`

Key UI features from existing pattern:
1. **Add note form** — Textarea + "Agregar nota" button
2. **Notes list** — Timeline component with author email, relative date, content
3. **Optimistic updates** — Immediately show new notes, revert on error
4. **Edit mode** — Inline textarea replacement with Save/Cancel buttons
5. **Delete** — confirm() dialog then optimistic removal
6. **Permission check** — `canModify(note)` checks if user is author or admin/owner

**Integration into order-sheet.tsx:**

The order sheet is a `Sheet` (side panel) with a `ScrollArea`. Currently the "Notas" section just shows `order.description`. The new notes system should be a separate section BELOW the description (now renamed to "Descripcion").

The notes section needs to be loaded dynamically when the order sheet opens, similar to how `TaskDetailSheet` loads notes via `useEffect` + `getTaskNotes(task.id)`.

**Props needed:**
```typescript
interface OrderNotesSectionProps {
  orderId: string
  currentUserId?: string
  isAdminOrOwner?: boolean
}
```

**Key challenge:** The current `OrderSheet` doesn't receive `currentUserId` or `isAdminOrOwner`. These need to be passed down from the parent. The `TaskDetailSheet` receives them as props from the page component. For the order sheet, the parent page fetches this info already (for other purposes).

### Pattern 5: Renaming "Notas" to "Descripcion"

All places where `order.description` is currently labeled "Notas":

| File | Line | Current | New |
|------|------|---------|-----|
| `order-sheet.tsx` | 481 | `Notas` (section header) | `Descripcion` |
| `order-form.tsx` | 425 | `<Label htmlFor="description">Notas</Label>` | `<Label htmlFor="description">Descripcion</Label>` |
| `order-form.tsx` | 428 | `placeholder="Notas adicionales sobre el pedido..."` | `placeholder="Descripcion del pedido..."` |
| `view-order-sheet.tsx` | 397 | `Notas` (section header) | `Descripcion` |
| `bulk-edit-dialog.tsx` | 22 | `'Notas / descripcion'` | `'Descripcion'` |
| `orders.ts` (actions) | 718 | `'Notas'` (CSV header) | `'Descripcion'` |

### Anti-Patterns to Avoid

- **Don't create a new domain file** — Extend `src/lib/domain/notes.ts` which already handles contact_notes and task_notes
- **Don't use RLS** — Domain layer uses `createAdminClient()` with manual workspace_id filtering
- **Don't add tabs to order-sheet** — Order sheet is a simple ScrollArea, not tabbed like TaskDetailSheet. Add notes as a section inline.
- **Don't fetch notes in initial getOrders query** — Notes should be loaded on-demand when order sheet opens (like task notes in TaskDetailSheet)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relative date formatting | Custom date formatter | `formatRelativeDate` from `@/components/ui/timeline` | Already exists, handles Colombian timezone |
| Notes timeline UI | Custom list | `Timeline` + `TimelineItem` components | Already exists, consistent with contact/task notes |
| Optimistic updates | Custom state management | Copy pattern from `NotesSection` component | Battle-tested pattern with rollback on error |
| Permission checking | Custom RBAC | Copy `canModify()` pattern from existing notes | Author OR admin/owner check, already proven |

## Common Pitfalls

### Pitfall 1: Not passing currentUserId and isAdminOrOwner to OrderSheet

**What goes wrong:** The OrderSheet component doesn't currently receive user identity props. Without these, the notes section can't determine edit/delete permissions.
**Why it happens:** OrderSheet was designed as a read-only detail view.
**How to avoid:** Add `currentUserId` and `isAdminOrOwner` props to `OrderSheetProps`. The parent page component already fetches the auth user and workspace membership (see how contact detail page does it).
**Warning signs:** All notes show as non-editable even for the author.

### Pitfall 2: Order sheet notes loading on every order change

**What goes wrong:** Notes fetch fires too often if orderId changes rapidly (clicking multiple orders).
**Why it happens:** useEffect with orderId dependency.
**How to avoid:** Follow `TaskDetailSheet` pattern — only fetch when `open && task?.id` changes. Add loading state to prevent stale data display.

### Pitfall 3: Forgetting the description visibility condition change

**What goes wrong:** The current "Notas" section (description) is conditional: `{order.description && (...)}`. When renaming to "Descripcion", this condition should remain. But the new Notes section should ALWAYS be visible (with empty state message).
**Why it happens:** Confusing the two concepts during rename.
**How to avoid:** Keep description conditional display. Make order notes section always visible with "Sin notas" empty state.

### Pitfall 4: Migration number collision

**What goes wrong:** Using a migration timestamp that already exists.
**Why it happens:** Latest migration is `20260224000000_guide_gen_config.sql`.
**How to avoid:** Use `20260225000000` or later. Check `supabase/migrations/` directory before creating.

### Pitfall 5: Not updating view-order-sheet.tsx (WhatsApp)

**What goes wrong:** WhatsApp order view still shows "Notas" while CRM shows "Descripcion".
**Why it happens:** Forgetting the secondary location.
**How to avoid:** All 6 locations listed in Pattern 5 must be updated.

## Code Examples

### DB Migration

```sql
-- Source: Pattern from 20260129000002_custom_fields_notes_activity.sql
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

### Domain Layer Functions

```typescript
// Source: Exact pattern from domain/notes.ts createNote/updateNote/deleteNote

export async function createOrderNote(
  ctx: DomainContext,
  params: CreateOrderNoteParams
): Promise<DomainResult<CreateOrderNoteResult>> {
  try {
    const supabase = createAdminClient()
    const trimmed = params.content.trim()
    if (!trimmed) {
      return { success: false, error: 'El contenido de la nota es requerido' }
    }

    const { data: note, error: noteError } = await supabase
      .from('order_notes')
      .insert({
        order_id: params.orderId,
        workspace_id: ctx.workspaceId,
        user_id: params.createdBy,
        content: trimmed,
      })
      .select('id')
      .single()

    if (noteError) {
      return { success: false, error: 'Error al crear la nota' }
    }

    // No activity logging for orders (no order_activity table)
    return { success: true, data: { noteId: note.id } }
  } catch (err) {
    return { success: false, error: 'Error inesperado al crear la nota' }
  }
}
```

### Server Action (getOrderNotes)

```typescript
// Source: Pattern from actions/task-notes.ts getTaskNotes

export async function getOrderNotes(orderId: string): Promise<OrderNoteWithUser[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: notes, error } = await supabase
    .from('order_notes')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  if (error || !notes?.length) return []

  // Get user profiles for note authors
  const userIds = [...new Set(notes.map(n => n.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds)

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

  return notes.map(note => ({
    ...note,
    user: profileMap.get(note.user_id) || { id: note.user_id, email: 'Usuario desconocido' }
  }))
}
```

### OrderSheet Integration

```typescript
// Source: Pattern from TaskDetailSheet useEffect loading

// Inside OrderSheet component:
const [orderNotes, setOrderNotes] = React.useState<OrderNoteWithUser[]>([])
const [notesLoading, setNotesLoading] = React.useState(false)

React.useEffect(() => {
  if (order?.id && open) {
    setNotesLoading(true)
    getOrderNotes(order.id)
      .then(setOrderNotes)
      .catch(() => setOrderNotes([]))
      .finally(() => setNotesLoading(false))
  }
}, [order?.id, open])

// In the ScrollArea, after Tags section:
<Separator />
<OrderNotesSection
  orderId={order.id}
  initialNotes={orderNotes}
  currentUserId={currentUserId}
  isAdminOrOwner={isAdminOrOwner}
  loading={notesLoading}
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Notes as order.description TEXT field | Separate order_notes table with CRUD | This feature | Enables multiple notes per order with authorship tracking |

## Open Questions

1. **Activity logging for order notes?**
   - What we know: Contact notes log to `contact_activity`. Task notes log to `task_activity`. There is no `order_activity` table.
   - What's unclear: Should we create `order_activity` table or skip activity logging?
   - Recommendation: **Skip activity logging for now**. It can be added later if needed. The existing pattern is optional (contact_notes and task_notes fire-and-forget their activity log inserts), and an `order_activity` table is out of scope for this feature.

2. **Should notes also show in view-order-sheet.tsx (WhatsApp)?**
   - What we know: The WhatsApp order view is read-only with an edit toggle (switches to OrderForm)
   - What's unclear: Should WhatsApp view also support reading/writing notes?
   - Recommendation: **Add read-only notes display to WhatsApp view initially**. It shows the order detail, so showing notes there too makes sense. Full CRUD can come later.

3. **Should order notes be deletable via CASCADE when order is deleted?**
   - What we know: `ON DELETE CASCADE` on the FK to orders means yes by default.
   - Recommendation: **Yes, use CASCADE**. Same pattern as contact_notes (CASCADE on contact deletion) and task_notes.

## Sources

### Primary (HIGH confidence)
- `src/lib/domain/notes.ts` — Complete domain layer pattern for contact + task notes
- `src/app/actions/notes.ts` — Server action pattern for contact notes
- `src/app/actions/task-notes.ts` — Server action pattern for task notes
- `src/app/(dashboard)/crm/contactos/[id]/components/notes-section.tsx` — Full UI component for contact notes
- `src/components/tasks/task-notes.tsx` — Full UI component for task notes
- `src/app/(dashboard)/tareas/components/task-detail-sheet.tsx` — Sheet-based notes loading pattern
- `supabase/migrations/20260129000002_custom_fields_notes_activity.sql` — Migration pattern for contact_notes
- `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx` — Current order detail layout
- `src/app/(dashboard)/crm/pedidos/components/order-form.tsx` — Current "Notas" label location
- `src/app/(dashboard)/whatsapp/components/view-order-sheet.tsx` — WhatsApp "Notas" label location
- `src/lib/orders/types.ts` — Order type definitions
- `src/lib/domain/orders.ts` — Order domain layer pattern
- `src/lib/domain/types.ts` — DomainContext and DomainResult types
- `src/lib/supabase/admin.ts` — createAdminClient pattern
- `src/lib/custom-fields/types.ts` — ContactNote, ContactNoteWithUser type definitions

### Secondary (MEDIUM confidence)
None needed — everything is verified via codebase inspection.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new libraries, pure pattern replication from existing codebase
- Architecture: HIGH — Three identical implementations already exist (contact_notes, task_notes); this is a third
- Pitfalls: HIGH — All identified from direct codebase analysis of existing patterns and current code structure

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable domain, no external dependencies)

## RESEARCH COMPLETE

**Feature:** Order Notes System
**Confidence:** HIGH

### Key Findings

- The project already has **two complete notes implementations** (contact_notes and task_notes) with identical architecture: DB table -> domain layer -> server actions -> UI component
- The order-notes feature is pure **pattern replication** — no new libraries, no new architectural decisions
- **6 UI locations** need "Notas" renamed to "Descripcion" for the order.description field
- The `order-sheet.tsx` needs new props (`currentUserId`, `isAdminOrOwner`) to support notes permission checks
- Latest migration is `20260224000000`, so use `20260225000000` for the new migration
- No activity logging table exists for orders, so skip that concern

### File Created

`.planning/standalone/order-notes-system/RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new libraries needed, all existing |
| Architecture | HIGH | Exact pattern replicated from 2 existing implementations |
| Pitfalls | HIGH | All identified from direct codebase analysis |

### Open Questions

1. Whether to add activity logging for order notes (recommendation: skip for now, no order_activity table exists)
2. Whether WhatsApp view-order-sheet should show notes (recommendation: read-only initially)

### Ready for Planning

Research complete. Planner can now create PLAN.md files.
