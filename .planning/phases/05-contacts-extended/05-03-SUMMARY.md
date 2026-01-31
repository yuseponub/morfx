---
phase: 05
plan: 03
subsystem: crm-contacts
tags: [notes, activity, timeline, crud, server-actions]
depends_on:
  requires: [05-01]
  provides: [notes-crud, activity-history, timeline-component]
  affects: [05-04, 06-whatsapp, 07-orders]
tech-stack:
  added: []
  patterns: [optimistic-updates, permission-checks, timeline-ui]
key-files:
  created:
    - src/app/actions/notes.ts
    - src/app/actions/activity.ts
    - src/components/ui/timeline.tsx
    - src/components/ui/tabs.tsx
    - src/app/(dashboard)/crm/contactos/[id]/components/notes-section.tsx
    - src/app/(dashboard)/crm/contactos/[id]/components/activity-timeline.tsx
  modified:
    - src/app/(dashboard)/crm/contactos/[id]/page.tsx
decisions:
  - id: notes-permission-model
    choice: "Author OR admin/owner can edit/delete notes"
    reason: "Flexibility for admins while respecting authorship"
  - id: activity-logging
    choice: "Note operations logged via application code"
    reason: "Trigger only handles contact changes, note activities need explicit logging"
  - id: timeline-title-type
    choice: "TimelineItem title accepts ReactNode not just string"
    reason: "Allow rich content like icons in timeline titles"
metrics:
  duration: ~10 minutes
  completed: 2026-01-29
---

# Phase 5 Plan 3: Notes and Activity Summary

Contact notes CRUD with timeline display and activity history with type filters.

## One-Liner

Notes timeline with author-based permissions and activity history with edit diffs.

## What Was Built

### 1. Server Actions for Notes (src/app/actions/notes.ts)

Four Server Actions for contact notes CRUD:

- **getContactNotes(contactId)**: Get all notes sorted by created_at DESC, includes user profile via profiles table
- **createNote(contactId, content)**: Create note + log activity with preview
- **updateNote(noteId, content)**: Update with author/admin permission check
- **deleteNote(noteId)**: Delete with author/admin permission check, logs deletion activity

### 2. Server Actions for Activity (src/app/actions/activity.ts)

- **getContactActivity(contactId, options)**: Get activity with optional type filter and limit
- **formatChanges()**: Format JSONB diff as readable strings
- **getActionDescription()**: Human-readable action descriptions in Spanish
- **FIELD_LABELS**: Map field keys to Spanish labels

### 3. Reusable Timeline Component (src/components/ui/timeline.tsx)

- **Timeline**: Container with vertical line connecting items
- **TimelineItem**: Individual event with icon, title, description, date, expandable content
- **formatRelativeDate**: Format dates as "hace 2 horas" or "29 ene 2026"

### 4. Notes Section (notes-section.tsx)

- Textarea + button for adding notes
- Timeline display of existing notes
- Inline edit mode with save/cancel
- Delete with confirmation
- Optimistic updates with revert on error
- Permission-aware edit/delete buttons

### 5. Activity Timeline (activity-timeline.tsx)

- Filter toggles: Todos, Ediciones, Notas, Tags
- Timeline display with action-specific icons
- Diff display for 'updated' actions
- Preview display for note events
- Tag badge display for tag events
- Load more indicator at 50 items

### 6. Contact Detail Page Update

- Added Tabs component (Informacion, Campos, Notas, Historial)
- Parallel data fetching for notes and activity
- Pass currentUserId and isAdminOrOwner to NotesSection

## Architecture Decisions

### Permission Model

Notes editable by:
1. Original author (user_id matches)
2. Workspace admin or owner

This balances:
- Respecting note authorship
- Admin oversight capability
- Simple permission check (no complex role hierarchy)

### Activity Logging for Notes

The contact_activity trigger only fires on contacts table changes. Note activities are logged explicitly in the Server Actions:
- note_added: On createNote()
- note_updated: On updateNote()
- note_deleted: On deleteNote()

This keeps the trigger simple while ensuring complete activity history.

### Timeline Component Design

Made title prop accept ReactNode instead of string to allow:
```tsx
<TimelineItem
  title={
    <span className="flex items-center gap-2">
      <UserIcon className="h-3 w-3" />
      {note.user.email}
    </span>
  }
/>
```

## Key Patterns

### Optimistic Updates with Revert

```typescript
// 1. Generate temp ID and add optimistically
const optimisticNote = { id: `temp-${Date.now()}`, ... }
setNotes(prev => [optimisticNote, ...prev])

// 2. On error, revert
if ('error' in result) {
  setNotes(prev => prev.filter(n => n.id !== optimisticNote.id))
}

// 3. On success, replace temp with real
setNotes(prev => prev.map(n => n.id === optimisticNote.id ? result.data : n))
```

### Parallel Data Fetching

```typescript
const [contact, tags, customFields, notes, activity] = await Promise.all([
  getContact(id),
  getTags(),
  getCustomFields(),
  getContactNotes(id),
  getContactActivity(id),
])
```

## Files Summary

| File | Purpose |
|------|---------|
| src/app/actions/notes.ts | CRUD for contact notes |
| src/app/actions/activity.ts | Activity fetch + formatting |
| src/components/ui/timeline.tsx | Reusable timeline component |
| src/components/ui/tabs.tsx | shadcn Tabs (added via CLI) |
| notes-section.tsx | Notes UI with add/edit/delete |
| activity-timeline.tsx | Activity history with filters |
| [id]/page.tsx | Updated with tabs layout |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Plan 03 provides:
- Notes system for contact collaboration
- Activity history for audit trail
- Timeline component reusable for other entities

Plan 04 (Search and Filters) can proceed.
