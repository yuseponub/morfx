---
phase: standalone-conversation-tags-to-contact
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx
  - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
  - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
  - src/app/(dashboard)/whatsapp/components/chat-header.tsx
  - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
  - src/hooks/use-conversations.ts
autonomous: true

must_haves:
  truths:
    - "User sees one unified set of tags per conversation (from contact)"
    - "User can add/remove tags from WhatsApp header and they affect the contact"
    - "Conversation without contact shows disabled tag input with message"
    - "Tag filter in inbox filters by contact tags"
    - "Inbox badge shows contact tags (not conversation_tags)"
    - "Contact panel shows one Etiquetas section (not two)"
    - "Realtime subscription reacts to contact_tags changes (not conversation_tags)"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx"
      provides: "Tag input that operates on contactId via addTagToConversation"
      contains: "contactId"
    - path: "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
      provides: "Single tags section labeled Etiquetas"
    - path: "src/app/(dashboard)/whatsapp/components/conversation-item.tsx"
      provides: "Tag badges from conversation.tags (now contact-sourced)"
    - path: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      provides: "Tag filter using conversation.tags (now contact-sourced)"
    - path: "src/hooks/use-conversations.ts"
      provides: "Realtime subscription on contact_tags instead of conversation_tags"
  key_links:
    - from: "conversation-tag-input.tsx"
      to: "addTagToConversation"
      via: "server action call with conversationId"
      pattern: "addTagToConversation"
    - from: "conversation-item.tsx"
      to: "conversation.tags"
      via: "direct property access"
      pattern: "conversation\\.tags"
    - from: "use-conversations.ts"
      to: "contact_tags"
      via: "realtime subscription table"
      pattern: "table: 'contact_tags'"
---

<objective>
Update all WhatsApp UI components and the realtime hook to use the unified contact-sourced tags.

Purpose: With Plan 01 having moved all backend queries to contact_tags, the frontend must stop referencing `contactTags` (removed) and use the single `tags` field. The realtime hook must subscribe to contact_tags instead of conversation_tags.
Output: Unified tag experience in WhatsApp inbox — one set of tags per conversation, sourced from contact.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/conversation-tags-to-contact/CONTEXT.md
@.planning/standalone/conversation-tags-to-contact/01-SUMMARY.md
@src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx
@src/app/(dashboard)/whatsapp/components/contact-panel.tsx
@src/app/(dashboard)/whatsapp/components/conversation-item.tsx
@src/app/(dashboard)/whatsapp/components/chat-header.tsx
@src/app/(dashboard)/whatsapp/components/conversation-list.tsx
@src/hooks/use-conversations.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update UI components to use unified tags</name>
  <files>
    src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx
    src/app/(dashboard)/whatsapp/components/contact-panel.tsx
    src/app/(dashboard)/whatsapp/components/conversation-item.tsx
    src/app/(dashboard)/whatsapp/components/chat-header.tsx
    src/app/(dashboard)/whatsapp/components/conversation-list.tsx
  </files>
  <action>
  **conversation-tag-input.tsx:**
  - The component already calls `addTagToConversation(conversationId, tagId)` which Plan 01 rewired to contact_tags. No signature change needed.
  - BUT: if the conversation has no contact_id, the server action will return an error. Add a prop `contactId: string | null` to the component.
  - When `contactId` is null, render a muted message "Vincular contacto primero" instead of the add button, and hide remove buttons.
  - Update the `disabled` logic: `disabled || !contactId`
  - Keep calling addTagToConversation/removeTagFromConversation (they delegate to contact internally).
  - Update JSDoc from "conversation-specific tags" to "contact tags via conversation".

  **chat-header.tsx (line 210-216):**
  - Change the ConversationTagInput props:
    - Keep `conversationId={conversation.id}` (still used by the server action for contact_id lookup)
    - Add `contactId={conversation.contact_id}`
    - Change `currentTags={conversation.tags || []}` — this stays the same since Plan 01 made `.tags` = contact tags
  - No other changes needed.

  **conversation-item.tsx (line 51-53, 150-170):**
  - Remove the dual-tag logic. Currently:
    ```
    const conversationTags = conversation.tags || []
    const contactTags = conversation.contactTags || []
    ```
  - Replace with single: `const tags = conversation.tags || []`
  - In the JSX rendering section (~line 150+), simplify to render just `tags` (no "Etiquetas de chat" vs "Etiquetas de contacto" distinction)
  - Remove all references to `contactTags`
  - Render tags as a single flat list of TagBadge components

  **contact-panel.tsx (line 162-188):**
  - Replace the dual tags section with a single "Etiquetas" section
  - Remove the "Etiquetas de chat" subsection (conversation.tags was conversation_tags)
  - Remove the "Etiquetas de contacto" subsection (conversation.contactTags)
  - New section: single `<div>` with label "Etiquetas" that renders `conversation.tags.map(tag => <TagBadge ... />)`
  - Condition: `conversation.tags.length > 0` to show the section
  - Remove all references to `conversation.contactTags`

  **conversation-list.tsx (line 126):**
  - The tag filter already uses `c.tags?.some(t => t.id === tagFilter)` — since Plan 01 made `.tags` = contact tags, this automatically works.
  - No code change needed here unless `contactTags` is referenced anywhere. Verify and remove any `contactTags` references.
  </action>
  <verify>
  Run `npx tsc --noEmit` — no type errors.
  Grep for `contactTags` across all 5 files — should find ZERO references.
  Grep for `conversation_tags` across all 5 files — should find ZERO references.
  </verify>
  <done>
  - conversation-tag-input accepts contactId prop, shows disabled state when no contact
  - chat-header passes contactId to tag input
  - conversation-item renders single tags array (no dual tags)
  - contact-panel shows one "Etiquetas" section
  - conversation-list filter works on unified tags (no change needed)
  - Zero references to contactTags or conversation_tags in any UI file
  </done>
</task>

<task type="auto">
  <name>Task 2: Switch realtime hook from conversation_tags to contact_tags</name>
  <files>
    src/hooks/use-conversations.ts
  </files>
  <action>
  **use-conversations.ts (line 353-377):**
  The current subscription listens to `conversation_tags` table and calls `getConversationTags(convId)` on change.

  Replace the conversation_tags subscription (line 353-377) with a contact_tags subscription:

  ```typescript
  // ---- contact_tags table: update conversation tags when contact tags change ----
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'contact_tags',
    },
    async (payload) => {
      const contactId = (payload.new as any)?.contact_id || (payload.old as any)?.contact_id
      if (!contactId) return

      // Find conversations linked to this contact
      const affected = conversationsRef.current.filter(c => c.contact_id === contactId)
      if (affected.length === 0) return

      // Fetch updated tags for this contact
      const tags = await getContactTagsForRealtime(contactId)

      // Update all conversations linked to this contact
      setConversations(prev =>
        prev.map(c => c.contact_id === contactId ? { ...c, tags } : c)
      )
      scheduleSafetyRefetchRef.current()
    }
  )
  ```

  **IMPORTANT:** contact_tags may not be in the supabase_realtime publication yet. There's a comment at line 378-382 about this:
  ```
  // To restore: first run ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags;
  ```

  Add a code comment noting this requirement. The subscription will silently not fire if the table isn't in the publication, which is a safe degradation (tags still load on initial fetch and conversation selection).

  **New helper function `getContactTagsForRealtime`:**
  Either:
  - a) Use the existing `getConversationTags(convId)` which Plan 01 already rewired to fetch contact_tags via conversation. BUT this requires a conversation ID, and we have multiple conversations per contact.
  - b) Create a small inline fetch: query `contact_tags` with inner join on `tags`, filter by contact_id, return `Array<{id, name, color}>`.

  Use option (b) — add a new server action `getContactTags(contactId)` in conversations.ts that queries contact_tags directly. This is simpler and avoids N calls for N conversations sharing a contact.

  Actually, since `getConversationTags` in Plan 01 was rewritten to look up contact_id then query contact_tags, and we already have the contactId here, just add a lightweight helper in use-conversations.ts that does a direct supabase query, OR better: add an exported `getTagsForContact(contactId)` to conversations.ts that takes a contactId directly.

  Simplest approach: create a new server action in conversations.ts:
  ```typescript
  export async function getTagsForContact(
    contactId: string
  ): Promise<Array<{ id: string; name: string; color: string }>> {
    // Auth check, then query contact_tags with tag join
  }
  ```
  Import and use this in the realtime handler.

  **Also:** Remove the old `getConversationTags` import if it was only used by the realtime handler. Check all usages first — if `getConversationTags` is used elsewhere, keep it.

  **Remove line 328 filtering:** The line `key !== 'contactTags' && key !== 'conversation_tags'` in the conversations update handler (line 328) — remove `'contactTags'` and `'conversation_tags'` from the exclusion list since these fields no longer exist. Just keep `key !== 'contact' && key !== 'tags'`.
  </action>
  <verify>
  Run `npx tsc --noEmit` — no type errors.
  Grep for `conversation_tags` in use-conversations.ts — should find ZERO (except possibly the removed comment).
  Grep for `contactTags` in use-conversations.ts — should find ZERO.
  Verify the contact_tags subscription is registered in the channel.
  </verify>
  <done>
  - Realtime hook subscribes to contact_tags table (not conversation_tags)
  - When contact_tags change, all conversations with that contact_id get updated tags
  - getTagsForContact helper exists for efficient contact tag fetch
  - No references to conversation_tags or contactTags in the hook
  - Code comment notes ALTER PUBLICATION requirement for realtime to fire
  </done>
</task>

</tasks>

<verification>
```bash
# No type errors
npx tsc --noEmit

# Zero conversation_tags references in ALL project frontend files
grep -r "conversation_tags" src/app/\(dashboard\)/whatsapp/ src/hooks/use-conversations.ts

# Zero contactTags references (field removed from type)
grep -r "contactTags" src/app/\(dashboard\)/whatsapp/ src/hooks/use-conversations.ts

# Verify build succeeds
npm run build
```
</verification>

<success_criteria>
- TypeScript compiles with zero errors
- Build succeeds
- No references to conversation_tags in any WhatsApp UI file or hook
- No references to contactTags in any WhatsApp UI file or hook
- Tag input shows disabled state when conversation has no contact
- Contact panel shows single "Etiquetas" section
- Conversation item shows single tag list
- Realtime hook subscribes to contact_tags
</success_criteria>

<output>
After completion, create `.planning/standalone/conversation-tags-to-contact/02-SUMMARY.md`
</output>
