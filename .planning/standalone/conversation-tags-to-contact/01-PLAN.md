---
phase: standalone-conversation-tags-to-contact
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/whatsapp/types.ts
  - src/app/actions/conversations.ts
  - src/lib/domain/tags.ts
  - src/lib/agents/production/webhook-processor.ts
autonomous: true

must_haves:
  truths:
    - "getConversations() returns contact tags as the primary tags field"
    - "getConversation() returns contact tags as the primary tags field"
    - "addTagToConversation/removeTagFromConversation operate on contact_tags not conversation_tags"
    - "conversationHasAnyTag only checks contact_tags (not conversation_tags)"
    - "Domain layer no longer has entityType conversation"
  artifacts:
    - path: "src/lib/whatsapp/types.ts"
      provides: "Simplified ConversationWithDetails with single tags array from contact"
      contains: "tags:"
    - path: "src/app/actions/conversations.ts"
      provides: "Queries that read from contact_tags, write actions that delegate to contacts.ts"
      exports: ["addTagToConversation", "removeTagFromConversation", "getConversationTags"]
    - path: "src/lib/domain/tags.ts"
      provides: "AssignTagParams/RemoveTagParams without conversation entity type"
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "conversationHasAnyTag that only checks contact_tags"
  key_links:
    - from: "src/app/actions/conversations.ts"
      to: "src/app/actions/contacts.ts"
      via: "addTagToConversation delegates to addTagToContact"
      pattern: "addTagToContact"
    - from: "src/app/actions/conversations.ts"
      to: "contact_tags"
      via: "getConversations/getConversation queries"
      pattern: "contact_tags"
---

<objective>
Eliminate all conversation_tags reads and writes from the backend layer.

Purpose: conversation_tags is deprecated. Contact is the source of truth for tags. All queries, mutations, and checks must use contact_tags instead.
Output: Server actions read contact tags, write actions delegate to contact, domain layer drops conversation entity type, webhook processor simplified.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/conversation-tags-to-contact/CONTEXT.md
@src/lib/whatsapp/types.ts
@src/app/actions/conversations.ts
@src/lib/domain/tags.ts
@src/lib/agents/production/webhook-processor.ts
@src/app/actions/contacts.ts (has addTagToContact/removeTagFromContact already)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Simplify types + domain layer + webhook processor</name>
  <files>
    src/lib/whatsapp/types.ts
    src/lib/domain/tags.ts
    src/lib/agents/production/webhook-processor.ts
  </files>
  <action>
  **types.ts — ConversationWithDetails (line ~225):**
  - Remove the `tags` field (was conversation_tags)
  - Remove the `contactTags` field
  - Add a single `tags` field: `Array<{ id: string; name: string; color: string }>` with JSDoc "Tags from linked contact (source of truth)"
  - This means the type shape stays the same externally (still `.tags`), but semantically it now represents contact tags

  **domain/tags.ts:**
  - Remove `'conversation'` from the `entityType` union in `AssignTagParams` and `RemoveTagParams` (line 27, line 35). New type: `'contact' | 'order'`
  - Remove the `conversation` entry from `junctionMap` in both `assignTag()` (line 84) and `removeTag()` (line 207)
  - Remove the early-return blocks for `params.entityType === 'conversation'` in both functions (line 98-99 in assignTag, line 222-224 in removeTag)

  **webhook-processor.ts — conversationHasAnyTag() (line 427-467):**
  - Simplify to ONLY check contact_tags via conversation.contact_id
  - New logic:
    1. Fetch contact_id from conversations table (single query)
    2. If no contact_id, return false
    3. Query contact_tags with inner join on tags, filter by workspace_id and tagNames, limit 1
    4. Return (data?.length ?? 0) > 0
  - Remove the parallel conversation_tags query entirely
  - Keep the function signature identical
  </action>
  <verify>
  Run `npx tsc --noEmit` — no type errors.
  Grep for `conversation_tags` in modified files to confirm removal.
  </verify>
  <done>
  - ConversationWithDetails has one `tags` field (from contact)
  - Domain tags.ts has no 'conversation' entity type
  - conversationHasAnyTag only queries contact_tags
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewrite conversation server actions to use contact_tags</name>
  <files>
    src/app/actions/conversations.ts
  </files>
  <action>
  **getConversations() (line 43-106):**
  - Remove `conversation_tags:conversation_tags(tag:tags(id, name, color))` from select query (line 56)
  - In the map transformation (line 86-106):
    - Remove convTagsData/conversationTags extraction (lines 92-93)
    - Set `tags: inheritedTags` (contact tags become the primary tags)
    - Remove `contactTags` field entirely (no longer dual)
    - Remove `conversation_tags: undefined` cleanup
  - Final shape: `{ ...conv, contact, tags: inheritedTags, assigned_name: null }`

  **getConversation() (line 133-177):**
  - Remove `conversation_tags:conversation_tags(tag:tags(*))` from select (line 148)
  - In transformation (line 158-176):
    - Remove convTagsData/conversationTags extraction (lines 163-164)
    - Set `tags: inheritedTags`
    - Remove `contactTags` field
    - Remove `conversation_tags: undefined`

  **addTagToConversation() (line 622-665):**
  - Rewrite to delegate to contact:
    1. Auth check (keep)
    2. Fetch conversation to get contact_id: `supabase.from('conversations').select('contact_id').eq('id', conversationId).single()`
    3. If no contact_id, return `{ error: 'Esta conversacion no tiene contacto vinculado' }`
    4. Import and call `addTagToContact(contactId, tagId)` from `@/app/actions/contacts`
    5. Return the result
  - Keep function signature `addTagToConversation(conversationId, tagId)` for backward compat
  - Keep revalidatePath('/whatsapp')

  **removeTagFromConversation() (line 670-694):**
  - Same pattern: fetch contact_id from conversation, delegate to `removeTagFromContact(contactId, tagId)`
  - If no contact_id, return error

  **getConversationTags() (line 699-723):**
  - Rewrite to fetch contact tags via conversation's contact_id:
    1. Auth check
    2. Fetch contact_id from conversations table
    3. If no contact_id, return []
    4. Query contact_tags with inner join on tags, filter by contact_id
    5. Return mapped tag array
  - Keep function signature and return type identical
  </action>
  <verify>
  Run `npx tsc --noEmit` — no type errors.
  Grep for `conversation_tags` in conversations.ts — should find ZERO references.
  Verify `addTagToContact` import exists.
  </verify>
  <done>
  - getConversations/getConversation return only contact-sourced tags
  - addTagToConversation delegates to addTagToContact via contact_id lookup
  - removeTagFromConversation delegates to removeTagFromContact
  - getConversationTags reads from contact_tags
  - Zero references to conversation_tags table in conversations.ts
  </done>
</task>

</tasks>

<verification>
```bash
# No type errors
npx tsc --noEmit

# Zero conversation_tags references in modified files
grep -r "conversation_tags" src/lib/whatsapp/types.ts src/app/actions/conversations.ts src/lib/domain/tags.ts src/lib/agents/production/webhook-processor.ts

# Confirm domain layer dropped conversation type
grep "'conversation'" src/lib/domain/tags.ts  # should find nothing

# Confirm addTagToContact import in conversations.ts
grep "addTagToContact" src/app/actions/conversations.ts
```
</verification>

<success_criteria>
- TypeScript compiles with zero errors
- conversation_tags table is not referenced in any of the 4 modified files
- ConversationWithDetails has a single `tags` field sourced from contact
- addTagToConversation/removeTagFromConversation route through contact
- conversationHasAnyTag checks only contact_tags
</success_criteria>

<output>
After completion, create `.planning/standalone/conversation-tags-to-contact/01-SUMMARY.md`
</output>
