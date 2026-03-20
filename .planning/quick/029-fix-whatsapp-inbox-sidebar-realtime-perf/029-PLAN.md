---
id: "029"
type: quick
title: "Fix WhatsApp inbox: sidebar nav, realtime consistency, query performance"
files_modified:
  - src/components/layout/sidebar.tsx
  - src/hooks/use-conversations.ts
  - src/app/actions/conversations.ts
  - supabase/migrations/20260319100000_composite_indexes_conversations.sql
autonomous: true

must_haves:
  truths:
    - "Sidebar nav links respond to clicks immediately without tooltip interference"
    - "Realtime updates recover within 10s after connection drops"
    - "Conversation list loads faster with optimized query (no 4-level nested join)"
  artifacts:
    - path: "src/components/layout/sidebar.tsx"
      provides: "Nav links without Tooltip wrappers"
    - path: "src/hooks/use-conversations.ts"
      provides: "10s safety refetch + reconnect refetch"
    - path: "src/app/actions/conversations.ts"
      provides: "Split query: conversations+contacts then batch tags"
    - path: "supabase/migrations/20260319100000_composite_indexes_conversations.sql"
      provides: "Composite indexes for inbox query"
---

<objective>
Fix 3 WhatsApp inbox bugs: sidebar navigation broken by Tooltip event interception, realtime updates lost during WebSocket reconnection, and slow conversation loading from nested 4-level PostgREST join.

Purpose: The inbox is the primary user interface — these bugs directly impact daily usability.
Output: 3 atomic commits fixing each bug independently.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/layout/sidebar.tsx
@src/hooks/use-conversations.ts
@src/app/actions/conversations.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove redundant Tooltip wrappers from sidebar nav links</name>
  <files>src/components/layout/sidebar.tsx</files>
  <action>
    In the main nav items loop (lines 169-192), remove the `<Tooltip>`, `<TooltipTrigger asChild>`, and `<TooltipContent>` wrappers from the primary nav `<Link>` elements. The sidebar is always expanded (w-64) and labels are always visible, so tooltips are redundant and their Radix event handlers (`onPointerDown`, `onPointerUp`, `type="button"`) intercept Link click events.

    Keep the `<Link>` and its contents (icon, label, badge) exactly as-is. Just unwrap it from the Tooltip.

    KEEP Tooltip wrappers on:
    - `item.subLink` icon buttons (lines 194-211) — these are icon-only and benefit from tooltips
    - The logout/collapse buttons at the bottom — icon-only elements

    After removing Tooltip from main links, check if the Tooltip/TooltipTrigger/TooltipContent imports are still needed (they will be, for subLink tooltips). Keep imports.
  </action>
  <verify>
    1. `npx tsc --noEmit` passes
    2. Visual check: sidebar renders, links are clickable, subLink tooltips still work
  </verify>
  <done>Main nav links navigate on click without tooltip interference. SubLink icon tooltips preserved.</done>
</task>

<task type="auto">
  <name>Task 2: Improve realtime consistency with faster refetch and reconnect handling</name>
  <files>src/hooks/use-conversations.ts</files>
  <action>
    Two changes in `use-conversations.ts`:

    1. **Reduce safety refetch interval** (line 278): Change `30_000` to `10_000`. This narrows the window where missed realtime events go undetected.

    2. **Add reconnect refetch in subscribe callback** (lines 437-439): Replace the simple status log with logic that refetches on reconnection. Track previous status to detect reconnection:

    ```typescript
    let previousStatus = ''
    // ... in .subscribe():
    .subscribe((status, err) => {
      console.log(`[realtime:inbox] status: ${status}`, err || '')

      // Refetch on reconnection (SUBSCRIBED after a drop) or on error
      if (status === 'CHANNEL_ERROR') {
        console.log('[realtime:inbox] channel error — scheduling safety refetch')
        scheduleSafetyRefetchRef.current()
      } else if (status === 'SUBSCRIBED' && previousStatus && previousStatus !== 'SUBSCRIBED') {
        console.log('[realtime:inbox] reconnected — refetching all conversations')
        fetchConversationsRef.current()
      }
      previousStatus = status
    })
    ```

    Use `fetchConversationsRef` (which should already exist as a ref — if not, create one like `scheduleSafetyRefetchRef`). The key insight: on reconnect (SUBSCRIBED after CLOSED/CHANNEL_ERROR), do a full immediate refetch, not just schedule a safety refetch. On CHANNEL_ERROR, schedule the safety refetch to avoid hammering.

    Check if `fetchConversationsRef` exists. If not, add it following the same pattern as `scheduleSafetyRefetchRef` (a ref that stays in sync via useEffect).
  </action>
  <verify>
    1. `npx tsc --noEmit` passes
    2. Console shows `[realtime:inbox] status: SUBSCRIBED` on load
    3. Logic review: CHANNEL_ERROR triggers safety refetch, reconnect triggers immediate refetch
  </verify>
  <done>Safety refetch reduced to 10s. Reconnection triggers immediate full refetch. CHANNEL_ERROR triggers safety refetch.</done>
</task>

<task type="auto">
  <name>Task 3: Optimize conversation query — split nested join + add composite indexes</name>
  <files>src/app/actions/conversations.ts, supabase/migrations/20260319100000_composite_indexes_conversations.sql</files>
  <action>
    **Part A: Split the query in `getConversations()`**

    Replace the single 4-level nested query (conversations -> contacts -> contact_tags -> tags) with a 2-step approach:

    Step 1 — Fetch conversations with contacts (no tags):
    ```typescript
    let query = supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts!left(id, name, phone, is_client)
      `)
      .eq('workspace_id', workspaceId)
      .order(sortColumn, { ascending: false, nullsFirst: false })
    ```

    Step 2 — After getting conversation data, batch fetch tags for all contact IDs:
    ```typescript
    // Collect unique contact IDs
    const contactIds = [...new Set(
      (data || []).map(c => c.contact?.id).filter(Boolean)
    )] as string[]

    // Batch fetch tags for all contacts in one query
    let tagsByContact: Record<string, Array<{ id: string; name: string; color: string }>> = {}
    if (contactIds.length > 0) {
      const { data: contactTags } = await supabase
        .from('contact_tags')
        .select('contact_id, tag:tags(id, name, color)')
        .in('contact_id', contactIds)

      // Group by contact_id
      for (const ct of contactTags || []) {
        if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = []
        if (ct.tag) tagsByContact[ct.contact_id].push(ct.tag as { id: string; name: string; color: string })
      }
    }
    ```

    Step 3 — In the transform/map, use `tagsByContact` instead of `conv.contact?.tags`:
    ```typescript
    const inheritedTags = conv.contact ? (tagsByContact[conv.contact.id] || []) : []
    ```

    Remove the old `contactTagsData` / nested tags extraction logic.

    **Part B: Create migration file**

    Create `supabase/migrations/20260319100000_composite_indexes_conversations.sql`:
    ```sql
    -- Composite indexes for inbox conversation queries
    -- Covers both sort modes: last_message_at and last_customer_message_at

    CREATE INDEX IF NOT EXISTS idx_conversations_workspace_status_last_msg
      ON conversations (workspace_id, status, last_message_at DESC NULLS LAST);

    CREATE INDEX IF NOT EXISTS idx_conversations_workspace_status_last_customer_msg
      ON conversations (workspace_id, status, last_customer_message_at DESC NULLS LAST);

    CREATE INDEX IF NOT EXISTS idx_conversations_workspace_last_msg
      ON conversations (workspace_id, last_message_at DESC NULLS LAST);

    CREATE INDEX IF NOT EXISTS idx_conversations_workspace_last_customer_msg
      ON conversations (workspace_id, last_customer_message_at DESC NULLS LAST);

    -- Index for batch tag fetch by contact IDs
    CREATE INDEX IF NOT EXISTS idx_contact_tags_contact_id
      ON contact_tags (contact_id);
    ```

    **IMPORTANT:** Do NOT push code after this task. The migration must be applied to production FIRST (Regla 5). The code change is safe to deploy since it produces identical results — but follow the rule.
  </action>
  <verify>
    1. `npx tsc --noEmit` passes
    2. Migration SQL is syntactically valid
    3. Query returns same shape: conversations with `contact` (no nested tags) and `tags` array
    4. Tag filtering still works (client-side filter on `conv.tags`)
  </verify>
  <done>Conversation query split into 2 fast queries instead of 1 nested join. Composite indexes created. Same data shape returned to consumers.</done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `npx tsc --noEmit`
2. Sidebar links clickable without delay
3. Realtime reconnect logs visible in console
4. Conversation list loads with contacts and tags correctly
5. Migration file exists and is valid SQL
</verification>

<success_criteria>
- All 3 bugs fixed with atomic commits
- No TypeScript errors
- Migration file ready for production application
- Identical data shape returned from getConversations (no breaking changes to consumers)
</success_criteria>

<output>
After completion, create `.planning/quick/029-fix-whatsapp-inbox-sidebar-realtime-perf/029-SUMMARY.md`
</output>
