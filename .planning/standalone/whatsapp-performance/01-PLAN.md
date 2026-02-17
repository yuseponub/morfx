---
phase: standalone/whatsapp-performance
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/actions/conversations.ts
  - src/hooks/use-conversations.ts
autonomous: true

must_haves:
  truths:
    - "Conversation list loads with the same data as before (name, phone, tags, preview, unread count, timestamps)"
    - "When a new message arrives, the conversation moves to the top of the list without a full page refetch"
    - "When a conversation tag is added/removed, only that conversation's tags update (no full list refetch)"
    - "When contact tags change, the affected conversation reflects the change"
    - "Only 1 Supabase realtime channel is created for the conversation list (down from 4)"
    - "Search and filters still work identically"
    - "Orders emoji indicators in the list still update on new orders"
  artifacts:
    - path: "src/app/actions/conversations.ts"
      provides: "Lighter conversation list query (no address/city in list query)"
      contains: "getConversations"
    - path: "src/hooks/use-conversations.ts"
      provides: "Consolidated realtime channel with surgical state updates"
      contains: "inbox:"
  key_links:
    - from: "src/hooks/use-conversations.ts"
      to: "src/app/actions/conversations.ts"
      via: "getConversations server action for initial load and INSERT fallback"
      pattern: "getConversations"
    - from: "src/hooks/use-conversations.ts"
      to: "supabase.channel"
      via: "Single consolidated inbox channel with 4 .on() listeners"
      pattern: "channel\\(`inbox:"
---

<objective>
Eliminate cascade realtime refetches and consolidate channels in the WhatsApp conversation list.

Purpose: This is the highest-impact optimization. Currently, every realtime event on ANY of 4 tables triggers a full `getConversations()` server action (auth + cookie + heavy Supabase query with 3-level nested joins). A single new message triggers at minimum 1 full refetch. This plan replaces all full refetches with surgical state updates and consolidates 4 channels into 1.

Output: Modified `use-conversations.ts` with 1 consolidated channel and surgical updates, lighter `getConversations()` query.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-performance/PHASE.md
@.planning/standalone/whatsapp-performance/RESEARCH.md
@.planning/standalone/whatsapp-performance/CONTEXT.md

Key files to read before implementing:
@src/app/actions/conversations.ts
@src/hooks/use-conversations.ts
@src/app/(dashboard)/whatsapp/components/conversation-item.tsx
@src/app/(dashboard)/whatsapp/components/conversation-list.tsx
@src/app/(dashboard)/whatsapp/components/chat-header.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Lighten getConversations() query and add getConversation() for single fetch</name>
  <files>src/app/actions/conversations.ts</files>
  <action>
  Modify `getConversations()` (the LIST query, lines 44-52) to remove `address` and `city` from the contact join since they are ONLY used in the ContactPanel (not in conversation-item.tsx or chat-header.tsx).

  Change the select from:
  ```
  contact:contacts(id, name, phone, address, city, tags:contact_tags(tag:tags(*)))
  ```
  To:
  ```
  contact:contacts!left(id, name, phone, tags:contact_tags(tag:tags(id, name, color)))
  ```

  Also change `conversation_tags:conversation_tags(tag:tags(*))` to `conversation_tags:conversation_tags(tag:tags(id, name, color))` to only fetch the 3 fields actually used (id, name, color).

  The `getConversation()` function (single conversation fetch, lines 126-170) should keep its current full query INCLUDING address, city, and email — this is used for panel detail views.

  Do NOT change any of the data transformation logic (lines 79-99). The shapes remain identical; we just fetch less data per row.

  Important: Keep the `!left` join hint on contacts to avoid missing conversations that have no linked contact (null contact_id).
  </action>
  <verify>
  - Run `npx tsc --noEmit` — no type errors
  - Verify the transformation logic still works by reading the code and confirming all accessed fields (id, name, phone, tags) are still in the select
  - `getConversation()` still has address, city, email in its select
  </verify>
  <done>
  getConversations() list query fetches only id, name, phone from contacts (no address/city) and only id, name, color from tags (not full tag objects). getConversation() single-fetch query is unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Consolidate 4 realtime channels into 1 and replace cascade refetches with surgical state updates</name>
  <files>src/hooks/use-conversations.ts</files>
  <action>
  This is the core optimization. Rewrite the realtime subscription section (lines 206-304) of `useConversations()`.

  **Step A: Add a conversations ref to avoid stale closures**

  Add a ref that tracks the latest conversations state:
  ```typescript
  const conversationsRef = useRef<ConversationWithDetails[]>(conversations)
  useEffect(() => { conversationsRef.current = conversations }, [conversations])
  ```

  Also add a ref for contact IDs (used by orders handler):
  ```typescript
  const contactIdsRef = useRef<string[]>([])
  useEffect(() => {
    contactIdsRef.current = conversations
      .map(c => c.contact?.id)
      .filter((id): id is string => !!id)
  }, [conversations])
  ```

  **Step B: Replace the 4-channel useEffect with a single consolidated channel**

  Replace the entire realtime useEffect (lines 206-304) with a new one that:

  1. Creates a SINGLE channel: `supabase.channel(`inbox:${workspaceId}`)`
  2. Chains 4 `.on()` listeners on it (one per table)
  3. Uses surgical state updates instead of full refetches
  4. Has a debounced safety-net full refetch (30s, resets on each surgical update)

  The dependency array should be `[workspaceId]` ONLY — no `fetchConversations` or `conversations` dependency. This is critical to avoid constant re-subscriptions.

  **Detailed handler logic for each table:**

  **conversations table (event: '*'):**
  - `UPDATE`: Spread `payload.new` onto the existing conversation object, preserving `contact`, `tags`, `contactTags` (which are join data not in the payload). Re-sort by `last_message_at` descending.
  - `INSERT`: Fetch the single new conversation via `getConversation(newRow.id)` and prepend to the list. This is the ONLY case where we hit the server (needed for contact join data).
  - `DELETE`: Filter out the deleted conversation by id.

  **conversation_tags table (event: '*'):**
  - Extract `conversation_id` from `payload.new` or `payload.old`
  - Check if this conversation is in our local list using `conversationsRef.current`
  - If yes, fetch ONLY the tags for this conversation using `getConversationTags(conversationId)` (already exists in conversations.ts)
  - Update the specific conversation's `tags` field in state

  **contact_tags table (event: '*'):**
  - Extract `contact_id` from `payload.new` or `payload.old`
  - Check if any conversation in `conversationsRef.current` has this contact
  - If yes, trigger the debounced safety-net refetch (contact tag changes are rare — full refetch is acceptable here as a simple solution)

  **orders table (event: 'INSERT', filter: workspace_id):**
  - Call `refreshOrdersFn()` to re-fetch orders for emoji indicators
  - Use the same pattern as current but via ref to avoid stale closure

  **Step C: Add debounced safety-net refetch**

  Add a debounced refetch mechanism that fires 30 seconds after the last surgical update. This ensures eventual consistency if any surgical update was incomplete or if an edge case was missed.

  ```typescript
  const safetyRefetchTimer = useRef<ReturnType<typeof setTimeout>>()

  const scheduleSafetyRefetch = useCallback(() => {
    if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current)
    safetyRefetchTimer.current = setTimeout(() => {
      fetchConversations()
    }, 30_000)
  }, [fetchConversations])
  ```

  Call `scheduleSafetyRefetch()` after each surgical update. Clear the timer on unmount.

  **Step D: Remove the `conversations` dependency from the realtime useEffect**

  The current code has `conversations` in the dependency array of the realtime useEffect (line 304), which causes the entire subscription to re-create on every state change. This is a major source of overhead. The new code uses refs instead, so the dependency array is ONLY `[workspaceId]`.

  **Step E: Fix the orders useEffect (lines 173-204)**

  The current `loadOrders` useEffect has `conversations` in its dependency array and fires on every conversation update. This is wasteful. Move the orders loading to only fire:
  1. On initial conversations load (when `isLoading` transitions from true to false)
  2. When refreshOrders is explicitly called (realtime order INSERT, stage change callback)

  To do this, track a `hasInitiallyLoaded` ref and only run loadOrders when transitioning from loading to loaded, not on every conversations change. The key insight: orders don't change when conversations update (they're separate data). Orders should only refresh when explicitly triggered.

  **What NOT to change:**
  - Fuse.js search logic (untouched)
  - Filter logic (untouched)
  - `fetchConversations()` function itself (still used for initial load and safety-net)
  - Return value shape (same API)
  - `getConversationById` callback
  - `refreshOrders` callback (but fix stale closure by using ref)

  **Important pitfall avoidance:**
  - When spreading `payload.new` onto existing conversation, cast it appropriately: `{ ...existingConv, ...(payload.new as Record<string, unknown>) }` — but be careful NOT to overwrite `contact`, `tags`, `contactTags` with undefined. The payload only has flat columns.
  - After surgical UPDATE, ALWAYS re-sort by `last_message_at` descending
  - For the consolidated channel, the `conversation_tags` and `contact_tags` listeners have NO filter (these tables lack workspace_id) — this is expected and handled client-side
  </action>
  <verify>
  - Run `npx tsc --noEmit` — no type errors
  - Read the final file and verify:
    - Only 1 `supabase.channel()` call (named `inbox:${workspaceId}`)
    - 4 `.on()` chained on it
    - No `await fetchConversations()` inside any realtime handler (except INSERT for new conversations, which uses `getConversation()` for single fetch, and contact_tags which triggers debounced refetch)
    - Dependency array is `[workspaceId]` only
    - `conversationsRef` is used in handlers instead of direct `conversations` state
    - Safety-net timer is cleared on cleanup
  - Run `npm run build` to verify no build errors
  </verify>
  <done>
  use-conversations.ts has 1 consolidated realtime channel (down from 4). Conversation UPDATEs are handled surgically (spread payload.new, re-sort). Tag changes fetch only affected conversation's tags. Orders refresh uses ref. Safety-net debounced full refetch exists as backup. No cascade refetches on any realtime event.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `npx tsc --noEmit` passes
2. `npm run build` succeeds
3. Only 1 Supabase channel created for conversation list (grep for `.channel(` in use-conversations.ts shows exactly 1)
4. No `fetchConversations()` call inside realtime handlers except in safety-net timer and INSERT case
5. `getConversations()` query no longer includes `address` or `city`
6. All conversation-item.tsx data needs are still satisfied (name, phone, tags, contactTags, timestamps, preview, unread, assigned_to, agent_conversational)
</verification>

<success_criteria>
- Conversation list channel count reduced from 4 to 1
- Zero full refetches on conversation UPDATE events (surgical updates instead)
- Zero full refetches on tag change events (targeted tag fetch instead)
- Query payload reduced (no address/city in list)
- Build passes without errors
- All existing functionality preserved
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-performance/01-SUMMARY.md`
</output>
