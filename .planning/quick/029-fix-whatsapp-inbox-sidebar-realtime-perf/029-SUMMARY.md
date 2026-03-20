---
phase: quick
plan: "029"
subsystem: whatsapp-inbox
tags: [sidebar, realtime, performance, postgrest, indexes]
key-files:
  modified:
    - src/components/layout/sidebar.tsx
    - src/hooks/use-conversations.ts
    - src/app/actions/conversations.ts
  created:
    - supabase/migrations/20260319100000_composite_indexes_conversations.sql
metrics:
  completed: 2026-03-19
  tasks: 3/3
---

# Quick 029: Fix WhatsApp Inbox — Sidebar Nav, Realtime Consistency, Query Performance

**One-liner:** Removed Tooltip event interception from sidebar nav links, added 10s safety refetch + reconnect recovery, split 4-level PostgREST join into 2 fast queries with composite indexes.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Remove redundant Tooltip wrappers from sidebar nav links | 9afe5d4 | Unwrapped main nav Links from Tooltip/TooltipTrigger/TooltipContent; preserved tooltips on icon-only subLink buttons and logout |
| 2 | Improve realtime consistency with faster refetch and reconnect | 9f5c170 | Reduced safety refetch from 30s to 10s; added fetchConversationsRef; CHANNEL_ERROR schedules safety refetch, reconnect (SUBSCRIBED after drop) triggers immediate full refetch |
| 3 | Optimize conversation query — split nested join + add indexes | 0d68c56 | Split conversations->contacts->contact_tags->tags into 2 queries; batch tag fetch by contact IDs; 5 composite indexes for inbox sort modes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript type error on Supabase join tag cast**
- **Found during:** Task 3
- **Issue:** `ct.tag as { id: string; name: string; color: string }` failed because Supabase infers the join return as an array type, not a single object
- **Fix:** Used `any` intermediate cast with explicit property extraction (`{ id: tag.id, name: tag.name, color: tag.color }`)
- **Files modified:** src/app/actions/conversations.ts
- **Commit:** 0d68c56

## Pending Actions

- **Migration required:** Apply `supabase/migrations/20260319100000_composite_indexes_conversations.sql` in production before deploying code (Regla 5)
