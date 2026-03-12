---
phase: standalone-conversation-tags-to-contact
plan: 01
subsystem: whatsapp-tags
tags: [tags, conversation_tags, contact_tags, domain-layer, server-actions]
requires: []
provides:
  - Contact as single source of truth for conversation tags
  - Simplified ConversationWithDetails type (single tags field)
  - Domain layer without conversation entity type
  - Webhook processor checking only contact_tags
affects:
  - standalone-conversation-tags-to-contact-02 (UI components)
tech-stack:
  added: []
  patterns:
    - Delegation pattern (addTagToConversation delegates to addTagToContact)
    - Contact as tag source of truth (no more conversation_tags reads/writes)
key-files:
  created: []
  modified:
    - src/lib/whatsapp/types.ts
    - src/lib/domain/tags.ts
    - src/lib/agents/production/webhook-processor.ts
    - src/app/actions/conversations.ts
    - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
    - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
    - src/app/actions/godentist.ts
decisions:
  - id: ctc-01-delegation
    decision: "addTagToConversation/removeTagFromConversation delegate to contact actions via dynamic import"
    rationale: "Preserves function signatures for backward compat while routing all writes to contact_tags"
  - id: ctc-01-godentist-fix
    decision: "godentist.ts tag assignment changed from conversation to contact entity type"
    rationale: "Was the only remaining caller using entityType conversation in domain tags"
metrics:
  duration: ~10min
  completed: 2026-03-12
---

# Standalone Plan 01: Eliminate conversation_tags from Backend Summary

Backend layer now treats contact as the single source of truth for tags in conversations.

**One-liner:** Removed all conversation_tags reads/writes from types, domain, webhook processor, and server actions -- contact is now the sole tag source.

## What Was Done

### Task 1: Simplify types + domain layer + webhook processor (3b3bbc2)

- **types.ts**: ConversationWithDetails now has a single `tags` field (from contact). Removed `contactTags` field.
- **domain/tags.ts**: Removed `'conversation'` from `entityType` union in AssignTagParams/RemoveTagParams. Removed conversation entries from junctionMap in both assignTag() and removeTag(). Removed early-return blocks for conversation entity type.
- **webhook-processor.ts**: Simplified `conversationHasAnyTag()` to only check contact_tags via conversation.contact_id. Removed the parallel conversation_tags query entirely.

### Task 2: Rewrite conversation server actions (d6e1339)

- **getConversations()**: Removed `conversation_tags` join from select query. Tags now come from contact_tags via the contact join. Single `tags` field in result.
- **getConversation()**: Same simplification -- removed conversation_tags join, single tags source.
- **addTagToConversation()**: Rewrote to look up contact_id from conversation, then delegate to `addTagToContact()`. Returns error if conversation has no linked contact.
- **removeTagFromConversation()**: Same delegation pattern to `removeTagFromContact()`.
- **getConversationTags()**: Rewrote to fetch contact_tags via conversation's contact_id.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed contactTags references in UI components**
- **Found during:** Task 1 (tsc verification)
- **Issue:** Removing `contactTags` from ConversationWithDetails broke contact-panel.tsx and conversation-item.tsx
- **Fix:** Simplified contact-panel.tsx to single tags section, removed unused contactTags extraction from conversation-item.tsx
- **Files modified:** contact-panel.tsx, conversation-item.tsx
- **Commit:** 3b3bbc2

**2. [Rule 3 - Blocking] Fixed godentist.ts using entityType 'conversation'**
- **Found during:** Task 1 (tsc verification)
- **Issue:** godentist.ts used `entityType: 'conversation'` which was removed from the union type
- **Fix:** Changed to `entityType: 'contact'` with `contactId` instead of `conversationId`
- **Files modified:** src/app/actions/godentist.ts
- **Commit:** 3b3bbc2

## Verification Results

- TypeScript compiles with zero errors
- Zero `conversation_tags` references in any of the modified files
- ConversationWithDetails has single `tags` field sourced from contact
- addTagToConversation/removeTagFromConversation route through contact
- conversationHasAnyTag checks only contact_tags
- Domain layer has no 'conversation' entity type

## Remaining Work (Plan 02)

- UI components: conversation-tag-input.tsx, chat-header.tsx need to pass contactId
- Realtime hook: use-conversations.ts still subscribes to conversation_tags table
- contacts.ts: getContactConversations still references conversation_tags (separate concern)
