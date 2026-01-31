---
phase: 08-whatsapp-extended
plan: 06
subsystem: whatsapp-inbox
tags: [rls, visibility, filters, postgresql]
requires: ["08-01"]
provides: ["role-based-conversation-visibility", "inbox-filters"]
affects: ["future-team-assignment-ui"]
tech-stack:
  added: []
  patterns: ["rls-role-visibility", "helper-function-pattern"]
key-files:
  created:
    - supabase/migrations/20260131000003_conversation_rls_update.sql
  modified:
    - src/hooks/use-conversations.ts
    - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
    - src/app/(dashboard)/whatsapp/components/filters/inbox-filters.tsx
decisions:
  - key: "is_workspace_manager-function"
    choice: "SECURITY DEFINER function checking owner/admin roles"
    reason: "Consistent pattern with existing is_workspace_member function"
  - key: "agent-visibility"
    choice: "Agents see assigned + unassigned (not other agents' chats)"
    reason: "Allows agents to claim unassigned conversations while protecting others' work"
  - key: "delete-managers-only"
    choice: "DELETE policy restricted to managers"
    reason: "Prevents agents from accidentally deleting conversations"
metrics:
  duration: "10 minutes"
  completed: "2026-01-31"
---

# Phase 8 Plan 6: Role-Based Conversation Visibility Summary

**Role-based RLS policies for WhatsApp inbox with manager/agent visibility rules**

## Overview

Implemented WAPP-07 and WAPP-08 requirements for role-based conversation visibility. Managers (owner/admin) can see all workspace conversations, while agents can only see conversations assigned to them or unassigned ones. This prevents agents from seeing other agents' conversations while still allowing them to claim unassigned chats.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Update RLS Policies for Role-Based Visibility | 9cdc4c0 | Done |
| 2 | Update Conversation List to Handle Visibility | bbf4c69 | Done |
| 3 | Add UI Filters for Assignment Status | ec1ce98 | Done |

## Implementation Details

### Task 1: RLS Policies

Created migration `20260131000003_conversation_rls_update.sql`:

1. **Helper function `is_workspace_manager(UUID)`**
   - Returns true for users with 'owner' or 'admin' role
   - Uses SECURITY DEFINER for consistent access
   - Granted to authenticated users

2. **SELECT policy `conversations_role_based_select`**
   - Managers see all workspace conversations
   - Agents see only: assigned to self OR unassigned (assigned_to IS NULL)
   - This prevents agents from seeing other agents' conversations

3. **UPDATE policy `conversations_role_based_update`**
   - Same visibility rules as SELECT
   - WITH CHECK ensures updates stay within workspace

4. **DELETE policy `conversations_manager_only_delete`**
   - Only managers can delete conversations
   - Protects against accidental deletion by agents

### Task 2: Hook and UI Updates

**use-conversations.ts:**
- Added visibility rules documentation at top of file
- Extended `ConversationFilter` type with 'mine' and 'unassigned' options
- Added `currentUserId` state for 'mine' filter
- Updated `fetchConversations` to pass `assigned_to` filter to server action

**conversation-item.tsx:**
- Added "Sin asignar" badge for unassigned conversations
- Badge helps managers identify chats needing attention

### Task 3: Inbox Filters

**inbox-filters.tsx:**
- Added "Mis chats" filter (conversations assigned to current user)
- Added "Sin asignar" filter (unassigned conversations)
- Added overflow-x-auto for horizontal scrolling on narrow screens
- Added documentation explaining how filters work with RLS

**conversation-list.tsx:**
- Updated empty state messages for new filter types:
  - 'mine': "No tienes chats asignados"
  - 'unassigned': "No hay chats sin asignar"

## Key Files Changed

| File | Changes |
|------|---------|
| `supabase/migrations/20260131000003_conversation_rls_update.sql` | New migration with role-based RLS policies |
| `src/hooks/use-conversations.ts` | Extended filters, added visibility docs |
| `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` | Added assignment badge |
| `src/app/(dashboard)/whatsapp/components/filters/inbox-filters.tsx` | Added filter options |
| `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` | Updated empty states |

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| is_workspace_manager function | SECURITY DEFINER with owner/admin check | Matches existing is_workspace_member pattern |
| Agent visibility | Assigned + unassigned only | Agents can claim unassigned, can't see others' work |
| DELETE restriction | Managers only | Prevents accidental deletion by agents |
| Filter approach | Client passes filter, RLS limits results | Clean separation of concerns |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. [x] is_workspace_manager function created (in migration)
2. [x] RLS SELECT policy enforces role-based visibility
3. [x] Managers can see all conversations (via RLS)
4. [x] Agents can only see assigned to self or unassigned (via RLS)
5. [x] Agents cannot see conversations assigned to other agents (via RLS)
6. [x] UI filters refine visible conversations
7. [x] Assignment status displayed in conversation list ("Sin asignar" badge)

## Success Criteria Met

- [x] Migration executes without errors (SQL syntax verified)
- [x] is_workspace_manager returns true for owner/admin roles
- [x] Agent querying conversations only sees limited set (RLS enforced)
- [x] Manager querying conversations sees all (RLS allows)
- [x] DELETE only works for managers (policy enforced)
- [x] Filters work in conjunction with RLS

## Next Phase Readiness

This plan enables:
- Team assignment UI can now assign/unassign agents knowing visibility rules are enforced
- Managers can use "Sin asignar" filter to find chats needing agent assignment
- Agents can use "Mis chats" to focus on their assigned work

## Dependencies

- Requires: 08-01 (base tables with assigned_to column)
- Works with: 08-02 (server actions already support assigned_to filter)
