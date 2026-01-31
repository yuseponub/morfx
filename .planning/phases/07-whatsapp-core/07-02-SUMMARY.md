---
phase: 07-whatsapp-core
plan: 02
subsystem: whatsapp
tags: ["whatsapp", "inbox", "conversations", "realtime", "fuse.js"]
dependency-graph:
  requires: ["07-01"]
  provides: ["inbox-ui", "conversation-list", "contact-panel", "realtime-hooks"]
  affects: ["07-03"]
tech-stack:
  added: []
  patterns: ["realtime-subscription", "fuzzy-search", "debounced-input"]
key-files:
  created:
    - src/hooks/use-conversations.ts
    - src/hooks/use-messages.ts
    - src/app/(dashboard)/whatsapp/layout.tsx
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
    - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
    - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
    - src/app/(dashboard)/whatsapp/components/window-indicator.tsx
    - src/app/(dashboard)/whatsapp/components/filters/inbox-filters.tsx
    - src/app/(dashboard)/whatsapp/components/filters/search-input.tsx
  modified:
    - src/app/(dashboard)/whatsapp/page.tsx
    - src/app/actions/conversations.ts
    - src/app/actions/whatsapp.ts
decisions:
  - id: "07-02-01"
    summary: "Fuse.js weighted search for conversations"
    rationale: "Same pattern as Phase 6 orders search, threshold 0.4 for fuzzy/precision balance"
  - id: "07-02-02"
    summary: "Supabase Realtime subscription per workspace"
    rationale: "Channel filter by workspace_id prevents cross-workspace data leaks"
  - id: "07-02-03"
    summary: "WindowIndicator shows warning only when <2h remaining"
    rationale: "Per CONTEXT.md - don't saturate UI, only alert when action needed"
  - id: "07-02-04"
    summary: "RecentOrders inlined in ContactPanel as separate component"
    rationale: "Keeps ContactPanel focused, RecentOrdersList handles its own data fetching"
metrics:
  duration: "~9 minutes"
  completed: "2026-01-30"
---

# Phase 7 Plan 02: Inbox UI Summary

**One-liner:** 3-column inbox layout with conversation list, fuzzy search, filters, and contact panel showing order history and 24h window status.

## What Was Built

### Real-time Hooks (src/hooks/)

**use-conversations.ts:**
- useConversations hook with workspace filtering
- Fuse.js fuzzy search with weighted keys (contact.name: 2, phone: 1.5, preview: 1, tags: 0.8)
- Supabase Realtime subscription for INSERT/UPDATE/DELETE events
- Filter support: all, unread, archived
- Returns: conversations, query, setQuery, filter, setFilter, isLoading, refresh

**use-messages.ts:**
- useMessages hook with conversation filtering
- Supabase Realtime subscription for INSERT (new messages) and UPDATE (status changes)
- Pagination support via loadMore() and hasMore flag
- Returns: messages, isLoading, loadMore, hasMore

### Inbox Layout (src/app/(dashboard)/whatsapp/)

**layout.tsx:**
- Simple wrapper with h-full for proper height

**page.tsx (Server Component):**
- Fetches initial conversations via getConversations()
- Passes workspaceId and initialConversations to InboxLayout

**components/inbox-layout.tsx:**
- 3-column flex layout: conversation list (w-80), chat (flex-1), contact panel (w-80)
- State: selectedConversationId, isPanelOpen
- Contact panel collapsible via toggle button in chat header

### Conversation List

**components/conversation-list.tsx:**
- Uses useConversations hook for real-time data
- Renders InboxFilters and SearchInput
- ScrollArea for conversation list
- Empty state handling per filter type

**components/conversation-item.tsx:**
- Displays contact name or phone
- Last message preview (truncated)
- Relative timestamp in Spanish (date-fns formatDistanceToNow, locale es)
- Unread count badge (99+ if over 99)
- Tags (max 3 with +N indicator)
- Highlight when selected

### Filters

**components/filters/inbox-filters.tsx:**
- Tab-style toggle: Todos | No leidos | Archivados
- Uses muted background with active state styling

**components/filters/search-input.tsx:**
- Input with search icon
- 300ms debounce via useEffect timer
- Controlled local state synced with parent

### Contact Panel

**components/contact-panel.tsx:**
- Header with close button
- WindowIndicator at top
- Contact info section:
  - If linked: name, phone, city, tags, "Ver en CRM" link
  - If unknown: phone only, "Crear contacto" button
- Separator
- Recent orders section with RecentOrdersList component
- "Crear pedido" button (passes contact_id or phone)

**components/window-indicator.tsx:**
- Calculates window status from last_customer_message_at
- Open (>2h remaining): returns null (shows nothing)
- Closing (<2h remaining): yellow warning with countdown
- Closed (>24h): red alert "Ventana cerrada - Solo templates"

### Server Actions

**actions/conversations.ts (modified):**
- Fixed return type of getConversationMessages to Message[]

**actions/whatsapp.ts:**
- getRecentOrders(contactId, limit) - fetches last N orders for contact panel

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 07-02-01 | Fuse.js weighted search | Same pattern as Phase 6, threshold 0.4 for balance |
| 07-02-02 | Realtime subscription per workspace | Channel filter prevents cross-workspace data |
| 07-02-03 | Window warning only when <2h | Per CONTEXT.md, don't saturate UI |
| 07-02-04 | RecentOrdersList as separate component | Keeps ContactPanel focused |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed conversations action return type**
- **Found during:** Task 1
- **Issue:** getConversationMessages returned generic type, caused type errors in hook
- **Fix:** Updated return type to Message[] with proper import
- **Files modified:** src/app/actions/conversations.ts
- **Commit:** 6c02774

## Commits

| Hash | Message |
|------|---------|
| 6c02774 | feat(07-02): create real-time hooks for conversations and messages |
| 55af7ac | feat(07-02): create inbox layout and conversation list components |
| 1c23f7c | feat(07-02): create contact panel and window indicator |

## Files Created

```
src/hooks/use-conversations.ts (148 lines)
src/hooks/use-messages.ts (116 lines)
src/app/(dashboard)/whatsapp/layout.tsx (11 lines)
src/app/(dashboard)/whatsapp/components/inbox-layout.tsx (108 lines)
src/app/(dashboard)/whatsapp/components/conversation-list.tsx (89 lines)
src/app/(dashboard)/whatsapp/components/conversation-item.tsx (83 lines)
src/app/(dashboard)/whatsapp/components/contact-panel.tsx (261 lines)
src/app/(dashboard)/whatsapp/components/window-indicator.tsx (91 lines)
src/app/(dashboard)/whatsapp/components/filters/inbox-filters.tsx (38 lines)
src/app/(dashboard)/whatsapp/components/filters/search-input.tsx (50 lines)
```

## Next Phase Readiness

**Ready for 07-03 (Chat View):**
- [x] useMessages hook ready for chat display
- [x] InboxLayout provides chat area placeholder
- [x] Selected conversation state available
- [x] Window indicator available for chat header

**Verification items from plan:**
- [x] /whatsapp page loads with 3-column layout
- [x] Conversation list displays (empty if no data)
- [x] Search filters by contact name, phone, preview
- [x] Filter tabs work (all, unread, archived)
- [x] Selecting conversation shows contact panel
- [x] Contact panel shows info or unknown state
- [x] Recent orders appear in panel
- [x] Window indicator shows warning when <2h or closed
- [x] Real-time hooks configured for subscription
