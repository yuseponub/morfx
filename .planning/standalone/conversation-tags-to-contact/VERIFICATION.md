---
phase: standalone-conversation-tags-to-contact
verified: 2026-03-12T01:36:50Z
status: passed
score: 12/12 must-haves verified
---

# Phase: conversation-tags-to-contact Verification Report

**Phase Goal:** Eliminar la tabla conversation_tags y hacer que las conversaciones de WhatsApp muestren los tags del contacto asociado. Cuando el usuario agrega un tag desde WhatsApp, se agrega al contacto, no a la conversacion.
**Verified:** 2026-03-12T01:36:50Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths — Plan 01 (Backend Layer)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `getConversations()` returns contact tags as the primary tags field | VERIFIED | `src/app/actions/conversations.ts` line 55: select uses `contact_tags(tag:tags(...))` via contact join; line 96: `tags: inheritedTags` |
| 2 | `getConversation()` returns contact tags as the primary tags field | VERIFIED | Same file line 141: select uses `contact_tags(tag:tags(*))` via contact join; line 160: `tags: inheritedTags` |
| 3 | `addTagToConversation/removeTagFromConversation` operate on contact_tags not conversation_tags | VERIFIED | Lines 638-639, 677-678: both functions delegate to `addTagToContact` / `removeTagFromContact` via dynamic import; contact_id fetched from conversation first |
| 4 | `conversationHasAnyTag` only checks contact_tags (not conversation_tags) | VERIFIED | `src/lib/agents/production/webhook-processor.ts` line 445: queries `contact_tags` with tag join; no parallel conversation_tags query |
| 5 | Domain layer no longer has entityType conversation | VERIFIED | `src/lib/domain/tags.ts` line 27: `entityType: 'contact' \| 'order'` — no 'conversation'; junctionMap has only contact and order entries |

### Observable Truths — Plan 02 (Frontend Layer)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | User sees one unified set of tags per conversation (from contact) | VERIFIED | `conversation-item.tsx` line 52: `const conversationTags = conversation.tags \|\| []` — single array, comment says "source of truth"; no dual-tag logic |
| 7 | User can add/remove tags from WhatsApp header and they affect the contact | VERIFIED | `chat-header.tsx` line 212-218: passes `contactId={conversation.contact_id}` to ConversationTagInput; actions delegate to contact internally |
| 8 | Conversation without contact shows disabled tag input with message | VERIFIED | `conversation-tag-input.tsx` line 52: `const isDisabled = disabled \|\| !contactId`; line 113: renders "Vincular contacto primero" when `!contactId && currentTags.length === 0` |
| 9 | Tag filter in inbox filters by contact tags | VERIFIED | `conversation-list.tsx` line 126: `result.filter(c => c.tags?.some(t => t.id === tagFilter))` — `c.tags` is now contact-sourced |
| 10 | Inbox badge shows contact tags (not conversation_tags) | VERIFIED | `conversation-item.tsx` renders `conversationTags` which comes from `conversation.tags` (contact-sourced); zero conversation_tags references in whatsapp/ directory |
| 11 | Contact panel shows one Etiquetas section (not two) | VERIFIED | `contact-panel.tsx` line 162-172: single block labeled "Etiquetas" renders `conversation.tags`; no dual sections, no contactTags references |
| 12 | Realtime subscription reacts to contact_tags changes (not conversation_tags) | VERIFIED | `use-conversations.ts` line 356-381: subscribes to `table: 'contact_tags'`; uses `getTagsForContact(contactId)` imported from conversations.ts; comment notes ALTER PUBLICATION requirement |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/lib/whatsapp/types.ts` | VERIFIED | ConversationWithDetails has single `tags` field with JSDoc "Tags from linked contact (source of truth)"; no contactTags field; no conversation_tags |
| `src/app/actions/conversations.ts` | VERIFIED | Exports addTagToConversation, removeTagFromConversation, getConversationTags, getTagsForContact; all operate on contact_tags; zero conversation_tags table references |
| `src/lib/domain/tags.ts` | VERIFIED | AssignTagParams/RemoveTagParams: entityType is `'contact' \| 'order'`; junctionMap has no conversation entry; no conversation_tags table |
| `src/lib/agents/production/webhook-processor.ts` | VERIFIED | conversationHasAnyTag queries contact_tags only via 2-step: get contact_id from conversation, then check contact_tags |
| `src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx` | VERIFIED | Has contactId prop; isDisabled = disabled \|\| !contactId; shows "Vincular contacto primero" when no contact |
| `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` | VERIFIED | Single "Etiquetas" section; renders conversation.tags; no contactTags or conversation_tags |
| `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` | VERIFIED | Single `conversationTags = conversation.tags \|\| []`; renders as flat list; no dual-tag logic |
| `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` | VERIFIED | Tag filter uses `c.tags?.some(t => t.id === tagFilter)`; no contactTags or conversation_tags |
| `src/hooks/use-conversations.ts` | VERIFIED | Subscribes to contact_tags table; imports getTagsForContact; no conversation_tags or contactTags |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `conversations.ts` addTagToConversation | `contacts.ts` addTagToContact | dynamic import + contact_id lookup | WIRED | Line 638: `const { addTagToContact } = await import('@/app/actions/contacts')` |
| `conversations.ts` getConversations | contact_tags table | Supabase join `contact_tags(tag:tags(...))` | WIRED | Line 55: nested select through contact join |
| `chat-header.tsx` | ConversationTagInput | contactId={conversation.contact_id} | WIRED | Line 214: passes contact_id from base Conversation type |
| `conversation-item.tsx` | conversation.tags | direct property access | WIRED | Line 52: `conversation.tags \|\| []` |
| `use-conversations.ts` | contact_tags | realtime subscription + getTagsForContact | WIRED | Lines 356-381: table: 'contact_tags', getTagsForContact imported from conversations.ts |

---

## Anti-Patterns Found

No blockers or warnings found in modified files.

**Note — Out-of-scope residual:** `src/app/actions/contacts.ts` `getContactConversations()` (line 934) still queries `conversation_tags` table. This function is used only by the CRM contact detail page (`/crm/contactos/[id]`), not by the WhatsApp inbox. It was NOT in the scope of this phase (files_modified in both plans do not include contacts.ts). This does not block the phase goal but is flagged as future cleanup debt.

---

## Human Verification Required

The following behaviors cannot be verified structurally:

### 1. Tag add from WhatsApp header persists to contact

**Test:** Open a WhatsApp conversation with a linked contact. Click the tag add button in the chat header. Add a tag. Navigate to CRM > Contactos > [contact]. Verify the tag appears on the contact.
**Expected:** Tag is visible on the contact in CRM.
**Why human:** Requires live DB interaction through both server actions.

### 2. Realtime tag update propagation

**Test:** In one tab, open the WhatsApp inbox. In another tab (or directly via Supabase dashboard), add a tag to a contact linked to a visible conversation. Check if the tag badge appears in the inbox without refresh.
**Expected:** Tag badge appears within a few seconds.
**Why human:** Requires ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags to have been applied; cannot verify DB publication state from code.

### 3. "Vincular contacto primero" disabled state

**Test:** Open a WhatsApp conversation that has no linked contact (unknown number). Check the tag area in the chat header.
**Expected:** No add tag button; "Vincular contacto primero" message appears instead.
**Why human:** Requires a conversation with contact_id = null in the actual DB.

---

## Summary

All 12 must-have truths are verified in the codebase. The backend (Plan 01) and frontend (Plan 02) are both fully implemented:

- Domain layer has dropped `'conversation'` from entityType — only `'contact' | 'order'` remain.
- Server actions route all tag reads through contact_tags and all writes through addTagToContact/removeTagFromContact.
- The webhook processor's conversationHasAnyTag checks only contact_tags via contact_id.
- All WhatsApp UI components use the unified `conversation.tags` field sourced from contact.
- The realtime hook subscribes to contact_tags (not conversation_tags).
- Zero references to `contactTags` (old dual-field) or `conversation_tags` in any WhatsApp UI file or hook.

The only residual `conversation_tags` reference in the codebase is in `contacts.ts:getContactConversations()`, which is outside this phase's scope and serves the CRM contact detail view, not the WhatsApp inbox.

---

_Verified: 2026-03-12T01:36:50Z_
_Verifier: Claude (gsd-verifier)_
