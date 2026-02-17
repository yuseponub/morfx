---
phase: standalone/whatsapp-performance
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
  - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
autonomous: true

must_haves:
  truths:
    - "When entering a conversation, the right panel is CLOSED by default (no panel visible)"
    - "Clicking the panel toggle button opens the contact panel with correct data"
    - "When panel is closed, ContactPanel component is NOT mounted (no hooks, no effects, no channels)"
    - "Switching conversations while panel is open resets panel state (no stale data flash)"
    - "Agent config slider still works when opened from chat header"
    - "Creating orders and contacts from the panel still works"
    - "Panel shows address, city, and all contact details when opened"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      provides: "Panel closed by default, conditional rendering, key-based remount"
      contains: "isPanelOpen"
    - path: "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
      provides: "Consolidated realtime channels (2 merged to 1)"
      contains: "panel-realtime:"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
      to: "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
      via: "Conditional render when isPanelOpen && rightPanel === 'contact'"
      pattern: "isPanelOpen &&"
---

<objective>
Make the contact panel lazy-load (closed by default, unmounted when hidden) and consolidate its realtime channels.

Purpose: Currently the ContactPanel is ALWAYS mounted (even when hidden via `w-0 overflow-hidden`), running 2 realtime channels, 3 server action fetches (orders + tags + pipelines), and a 30s polling interval. By closing the panel by default and only mounting it when open, we eliminate all this overhead for the common case of just reading/sending messages.

Output: Modified `inbox-layout.tsx` with panel closed by default + conditional rendering. Modified `contact-panel.tsx` with 2 channels consolidated into 1.
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
@src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
@src/app/(dashboard)/whatsapp/components/contact-panel.tsx
@src/app/(dashboard)/whatsapp/components/chat-view.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Panel closed by default with conditional rendering and key-based remount</name>
  <files>src/app/(dashboard)/whatsapp/components/inbox-layout.tsx</files>
  <action>
  Make three changes to `inbox-layout.tsx`:

  **Change 1: Default panel to closed**

  Change line 42:
  ```typescript
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  ```
  To:
  ```typescript
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  ```

  This is the user's explicit decision: panel closed by default.

  **Change 2: Conditional rendering instead of width-0 hiding**

  Replace the right column JSX (lines 109-128) from:
  ```tsx
  <div
    className={cn(
      'flex-shrink-0 border-l bg-background transition-all duration-200',
      isPanelOpen ? 'w-80' : 'w-0 overflow-hidden'
    )}
  >
    {rightPanel === 'agent-config' ? (
      <AgentConfigSlider ... />
    ) : (
      <ContactPanel ... />
    )}
  </div>
  ```

  To conditional rendering that only mounts the panel component when open:
  ```tsx
  {isPanelOpen && (
    <div className="w-80 flex-shrink-0 border-l bg-background">
      {rightPanel === 'agent-config' ? (
        <AgentConfigSlider
          workspaceId={workspaceId}
          onClose={handleCloseAgentConfig}
        />
      ) : (
        <ContactPanel
          key={selectedConversationId || 'none'}
          conversation={selectedConversation}
          onClose={() => setIsPanelOpen(false)}
          onConversationUpdated={refreshSelectedConversation}
          onOrdersChanged={refreshOrdersFn}
        />
      )}
    </div>
  )}
  ```

  Key changes:
  - `{isPanelOpen && (...)}` — component is NOT mounted when closed. No hooks, no effects, no channels.
  - `key={selectedConversationId || 'none'}` on ContactPanel — forces full remount when switching conversations. Prevents stale data flash (Pitfall 5 from research).
  - Removed `transition-all duration-200` since we're toggling render, not animating width. The panel appears/disappears instantly which is fine.
  - Kept `w-80` and `border-l` on the wrapper div (only rendered when open).

  **Change 3: Close panel when switching conversations (optional UX improvement)**

  Do NOT close the panel on conversation switch. If user opened the panel, keep it open when switching. The `key={selectedConversationId}` handles the data freshness. This preserves the user's intent — if they want the panel open, it stays open.

  **What NOT to change:**
  - `handleOpenAgentConfig` — still sets rightPanel and opens panel
  - `handleCloseAgentConfig` — still returns to contact panel
  - `refreshSelectedConversation` — still works the same
  - The `handleSelectConversation` callback — unchanged
  </action>
  <verify>
  - Run `npx tsc --noEmit` — no type errors
  - Verify `isPanelOpen` defaults to `false`
  - Verify ContactPanel is inside `{isPanelOpen && (...)}` conditional
  - Verify `key={selectedConversationId || 'none'}` is on ContactPanel
  - Verify AgentConfigSlider is also inside the conditional (it should be — both are in the same isPanelOpen block)
  </verify>
  <done>
  Panel is closed by default. ContactPanel and AgentConfigSlider are only mounted when panel is open. Key-based remount prevents stale data when switching conversations.
  </done>
</task>

<task type="auto">
  <name>Task 2: Consolidate ContactPanel's 2 realtime channels into 1</name>
  <files>src/app/(dashboard)/whatsapp/components/contact-panel.tsx</files>
  <action>
  Merge the 2 realtime channels in ContactPanel (lines 56-109) into 1 consolidated channel.

  **Current state (2 channels):**
  1. `conv-order-refresh:${conversationId}` — listens to conversations UPDATE, triggers order refresh after 1s delay
  2. `orders-direct:${contactId}` — listens to orders INSERT for this contact, triggers order refresh

  **New state (1 channel):**
  Replace the entire useEffect (lines 56-109) with:

  ```typescript
  useEffect(() => {
    const conversationId = conversation?.id
    if (!conversationId || !contactId) return

    const supabase = createClient()

    const channel = supabase
      .channel(`panel-realtime:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`,
        },
        () => {
          console.log('[ContactPanel] Realtime: conversations UPDATE, refreshing orders in 1s')
          setTimeout(() => {
            setOrdersRefreshKey(k => k + 1)
          }, 1000)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          console.log('[ContactPanel] Realtime: orders INSERT, refreshing orders')
          setOrdersRefreshKey(k => k + 1)
        }
      )
      .subscribe((status) => {
        console.log('[ContactPanel] panel-realtime channel status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversation?.id, contactId])
  ```

  This consolidates 2 channels into 1 while preserving identical behavior:
  - Conversation UPDATE still triggers order refresh with 1s delay
  - Orders INSERT still triggers immediate order refresh
  - Same cleanup on unmount
  - Same dependency array

  **What NOT to change:**
  - The RecentOrdersList component — unchanged
  - The polling interval in RecentOrdersList — keep it as is (it's already set to 30s and serves as a reliability fallback)
  - All other ContactPanel functionality (create order, create contact, view order, tags display, etc.)
  - The orderSheetOpen/contactSheetOpen state and handlers
  </action>
  <verify>
  - Run `npx tsc --noEmit` — no type errors
  - Grep for `.channel(` in contact-panel.tsx — should show exactly 1 channel creation
  - Verify channel name is `panel-realtime:${conversationId}`
  - Verify both listeners (conversations UPDATE + orders INSERT) are chained on the same channel
  - Verify cleanup still calls `supabase.removeChannel(channel)`
  - Run `npm run build` to verify no build errors
  </verify>
  <done>
  ContactPanel has 1 realtime channel (down from 2). Both listeners (conversation UPDATE for delayed order refresh, orders INSERT for immediate refresh) are on a single consolidated channel. Cleanup is handled properly.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `npx tsc --noEmit` passes
2. `npm run build` succeeds
3. `isPanelOpen` defaults to `false` in inbox-layout.tsx
4. ContactPanel is inside a conditional render block (`isPanelOpen && ...`)
5. ContactPanel has `key={selectedConversationId}` for remount on switch
6. ContactPanel has exactly 1 `.channel()` call (down from 2)
7. Total channel reduction for this plan: 2 channels eliminated (panel default closed) + 1 channel consolidated = significant reduction
</verification>

<success_criteria>
- Panel closed by default when entering a conversation
- ContactPanel unmounted when panel is closed (zero overhead)
- ContactPanel channels consolidated from 2 to 1
- Key-based remount prevents stale data when switching conversations
- All panel functionality preserved (create order, create contact, tags, orders list, CRM link)
- Agent config slider still accessible
- Build passes without errors
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-performance/02-SUMMARY.md`
</output>
