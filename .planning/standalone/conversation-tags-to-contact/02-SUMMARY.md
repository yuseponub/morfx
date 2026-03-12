---
phase: standalone-conversation-tags-to-contact
plan: 02
subsystem: ui
tags: [whatsapp, realtime, supabase, tags, contacts]

# Dependency graph
requires:
  - phase: standalone-conversation-tags-to-contact-01
    provides: "Backend unified tags (ConversationWithDetails.tags from contact, server actions delegating to contact)"
provides:
  - "Unified tag UI in WhatsApp inbox — single tag set per conversation from contact"
  - "Realtime subscription on contact_tags table"
  - "Disabled tag input when conversation has no linked contact"
  - "getTagsForContact server action for realtime hook"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "contactId prop for tag components to control enabled state"
    - "contact_tags realtime subscription updates all conversations for affected contact"

key-files:
  created: []
  modified:
    - "src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx"
    - "src/app/(dashboard)/whatsapp/components/chat-header.tsx"
    - "src/hooks/use-conversations.ts"
    - "src/app/actions/conversations.ts"

key-decisions:
  - "contactId prop controls disabled state (not separate boolean)"
  - "Show 'Vincular contacto primero' message in compact mode when no contact"
  - "contact_tags realtime updates all conversations sharing same contact_id"
  - "ALTER PUBLICATION requirement documented in code comment (not applied here)"

patterns-established:
  - "Tag components receive contactId to gracefully handle no-contact state"

# Metrics
duration: 8min
completed: 2026-03-12
---

# Phase standalone-conversation-tags-to-contact Plan 02: UI + Realtime Summary

**Unified tag experience in WhatsApp inbox: single tag set from contact, realtime via contact_tags subscription, disabled state when no contact linked**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-12T01:24:04Z
- **Completed:** 2026-03-12T01:32:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ConversationTagInput now accepts contactId prop and disables when no contact is linked
- Chat header passes contactId to tag input component
- Realtime hook subscribes to contact_tags instead of conversation_tags
- Zero references to contactTags or conversation_tags in any WhatsApp UI file or hook
- getTagsForContact server action created for efficient realtime tag fetching

## Task Commits

Each task was committed atomically:

1. **Task 1: Update UI components to use unified tags** - `fb3bcdd` (feat)
2. **Task 2: Switch realtime hook from conversation_tags to contact_tags** - `52b23ea` (feat)

## Files Created/Modified
- `src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx` - Added contactId prop, disabled state, "Vincular contacto primero" message
- `src/app/(dashboard)/whatsapp/components/chat-header.tsx` - Passes contactId to ConversationTagInput
- `src/hooks/use-conversations.ts` - Replaced conversation_tags subscription with contact_tags
- `src/app/actions/conversations.ts` - Added getTagsForContact server action

## Decisions Made
- contactId prop on ConversationTagInput controls disabled state (rather than a separate disabled-reason prop)
- "Vincular contacto primero" message only shows in compact mode when no tags and no contact (avoids visual noise)
- contact_tags realtime handler updates ALL conversations sharing the same contact_id (one contact can have multiple conversations)
- ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags is required for realtime to fire — documented in code comment, not applied (migration concern)

## Deviations from Plan

None - plan executed exactly as written. Plan 01 had already fixed contact-panel.tsx and conversation-item.tsx as noted in context.

## Issues Encountered
None

## User Setup Required

**Database publication change required for realtime:** Run `ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags;` in Supabase SQL editor to enable realtime events for contact tag changes. Without this, tags still work but realtime updates won't fire (safety-net refetch at 30s handles eventual consistency).

## Next Phase Readiness
- Standalone conversation-tags-to-contact is fully complete (2/2 plans)
- All WhatsApp UI and backend use contact_tags as single source of truth
- Only pending: ALTER PUBLICATION for realtime (optional, not blocking)

---
*Phase: standalone-conversation-tags-to-contact*
*Completed: 2026-03-12*
