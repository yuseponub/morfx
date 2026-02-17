# Standalone: WhatsApp Performance Optimization - Research

**Researched:** 2026-02-16
**Domain:** Supabase Realtime + React state management + Query optimization
**Confidence:** HIGH (based on codebase analysis — all findings are from actual code)

## Summary

Researched all 6 key files of the WhatsApp module to understand the exact nature of 4 identified performance problems. The primary findings are:

1. **Cascade refetch is the #1 bottleneck** — Every realtime event on ANY of 4 tables triggers a full `getConversations()` refetch (server action with auth + cookie + heavy Supabase query with 3-level nested joins). A single new message triggers at minimum 1 full refetch, and tag changes trigger 2 (conversation_tags + contact_tags channels both fire).

2. **Channel consolidation is straightforward** — Supabase supports multiple `.on()` listeners chained on a single channel. The 4 channels in `use-conversations.ts` can be merged into 1, and the 2 channels in `contact-panel.tsx` can be merged into 1.

3. **The query itself is moderately heavy but not the biggest issue** — `getConversations()` joins `contacts + contact_tags + tags + conversation_tags + tags`, but the real cost is that it runs on EVERY realtime event. Making the query lighter helps, but eliminating redundant refetches has higher impact.

4. **Panel lazy-loading is the simplest win** — Changing `isPanelOpen` from `true` to `false` default + conditionally rendering `ContactPanel` eliminates 2 realtime channels, 1 fetch of orders + tags + pipelines, and a 30s polling interval per open conversation.

**Primary recommendation:** Fix cascade refetches with surgical state updates (not full refetches), consolidate channels, lazy-load the panel, and lighten the conversation list query.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.93.1 | DB + Realtime | Already used, Realtime channels API |
| `@supabase/ssr` | ^0.8.0 | SSR client singleton | `createBrowserClient` reuses same instance |
| `@tanstack/react-virtual` | ^3.13.18 | Virtualized message list | Already used in `chat-view.tsx` |
| `fuse.js` | ^7.1.0 | Fuzzy search | Already used in `use-conversations.ts` |

### Not Needed
| Library | Why Not |
|---------|---------|
| TanStack Query / SWR | Project uses server actions + manual state. Adding a cache layer would be a large refactor with no immediate payoff for this scope. |
| Zustand / Jotai | Overkill for this optimization. Local React state is fine. |

**Installation:** No new dependencies needed.

## Architecture Patterns

### Current Architecture (Problem Map)

```
WhatsApp Page (SSR)
└── InboxLayout (client)
    ├── ConversationList
    │   └── useConversations()
    │       ├── 4 Supabase Realtime channels:
    │       │   ├── conversations:${workspaceId}    → fetchConversations() [FULL REFETCH]
    │       │   ├── conversation_tags:${workspaceId} → fetchConversations() [FULL REFETCH]
    │       │   ├── contact_tags:${workspaceId}      → fetchConversations() [FULL REFETCH]
    │       │   └── orders:${workspaceId}            → getOrdersForContacts() [orders only]
    │       ├── getConversations() server action:
    │       │   SELECT *, contact:contacts(id,name,phone,address,city,
    │       │     tags:contact_tags(tag:tags(*))),
    │       │     conversation_tags:conversation_tags(tag:tags(*))
    │       │   + client-side filter + Fuse.js search
    │       └── getOrdersForContacts() for all contacts in list
    │
    ├── ChatView
    │   └── useMessages()
    │       ├── 1 channel: messages:${conversationId} (INSERT+UPDATE)
    │       └── 1 channel: conversation:${conversationId} (broadcast/typing)
    │
    └── ContactPanel (ALWAYS MOUNTED, even when hidden)
        ├── 1 channel: conv-order-refresh:${conversationId}
        ├── 1 channel: orders-direct:${contactId}
        ├── RecentOrdersList:
        │   ├── getRecentOrders(contactId) — initial fetch
        │   ├── getTagsForScope('orders') — initial fetch
        │   ├── getPipelines() — initial fetch
        │   └── 30s polling interval for orders
        └── Total: 2 channels + 3 fetches + polling
```

### Pattern 1: Surgical State Update (Replace Full Refetch)

**What:** When a realtime event arrives with the changed row in `payload.new`, update the local state array directly instead of refetching everything from the server.

**When to use:** For `conversations` table changes where the payload contains the full updated row.

**Example:**
```typescript
// CURRENT (bad): Every event refetches all conversations
async (payload) => {
  await fetchConversations() // Heavy server action
}

// OPTIMIZED: Surgical update from payload
(payload) => {
  const { eventType, new: newRow, old: oldRow } = payload

  switch (eventType) {
    case 'UPDATE':
      setConversations(prev =>
        prev.map(c => c.id === newRow.id
          ? { ...c, ...newRow, contact: c.contact, tags: c.tags, contactTags: c.contactTags }
          : c
        ).sort((a, b) =>
          new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
        )
      )
      break
    case 'INSERT':
      // New conversation — need contact data, so refetch just this one
      fetchSingleConversation(newRow.id).then(conv => {
        if (conv) setConversations(prev => [conv, ...prev])
      })
      break
    case 'DELETE':
      setConversations(prev => prev.filter(c => c.id !== oldRow.id))
      break
  }
}
```

**Limitation:** `conversations` UPDATE payload has the flat row (no joins). For fields like `last_message_at`, `is_read`, `unread_count`, `status`, `assigned_to`, `last_message_preview` — the payload is sufficient. For tag changes, a different strategy is needed (see Pattern 2).

### Pattern 2: Targeted Refetch for Tag Changes

**What:** When `conversation_tags` or `contact_tags` change, only refetch the affected conversation's tags, not the entire list.

**When to use:** For junction table changes where the payload has the foreign key.

**Example:**
```typescript
// conversation_tags change → only update tags for that conversation
async (payload) => {
  const conversationId = payload.new?.conversation_id || payload.old?.conversation_id
  if (!conversationId) return

  // Fetch only the tags for this conversation
  const tags = await getConversationTags(conversationId)
  setConversations(prev =>
    prev.map(c => c.id === conversationId ? { ...c, tags } : c)
  )
}
```

**Note:** `conversation_tags` table does NOT have a `workspace_id` column, so it currently subscribes without a filter (receives ALL workspace events). This is fine because the handler checks `conversationId` against local state.

### Pattern 3: Channel Consolidation

**What:** Merge multiple `.on()` listeners into a single `.channel()` call to reduce overhead.

**When to use:** Whenever multiple channels listen to the same or related tables.

**Example:**
```typescript
// CURRENT: 4 separate channels
const ch1 = supabase.channel(`conversations:${wid}`).on(...).subscribe()
const ch2 = supabase.channel(`conversation_tags:${wid}`).on(...).subscribe()
const ch3 = supabase.channel(`contact_tags:${wid}`).on(...).subscribe()
const ch4 = supabase.channel(`orders:${wid}`).on(...).subscribe()

// OPTIMIZED: 1 consolidated channel
const channel = supabase
  .channel(`inbox:${workspaceId}`)
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'conversations',
    filter: `workspace_id=eq.${workspaceId}`,
  }, handleConversationChange)
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'conversation_tags',
  }, handleConversationTagChange)
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'contact_tags',
  }, handleContactTagChange)
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'orders',
    filter: `workspace_id=eq.${workspaceId}`,
  }, handleOrderInsert)
  .subscribe()
```

**Source:** [Supabase Postgres Changes docs](https://supabase.com/docs/guides/realtime/postgres-changes) and [GitHub discussion #10980](https://github.com/orgs/supabase/discussions/10980) confirm multiple `.on()` per channel is supported.

### Pattern 4: Conditional Panel Rendering (Lazy Load)

**What:** Only mount `ContactPanel` when `isPanelOpen === true`, and default to closed.

**When to use:** For expensive components that the user doesn't always need.

**Example:**
```typescript
// CURRENT: Always mounted (even when width=0)
const [isPanelOpen, setIsPanelOpen] = useState(true) // <-- always open

// OPTIMIZED: Default closed + conditional render
const [isPanelOpen, setIsPanelOpen] = useState(false) // <-- closed by default

// In JSX: don't render at all when closed
{isPanelOpen && rightPanel === 'contact' && (
  <ContactPanel ... />
)}
```

**Impact:** When closed, eliminates 2 realtime channels, 3 server action calls (getRecentOrders + getTagsForScope + getPipelines), and a 30s polling interval.

### Pattern 5: Debounced Refetch as Safety Net

**What:** If surgical updates handle 90% of cases, keep a debounced full refetch as a safety net that coalesces rapid events.

**When to use:** When you still want eventual consistency but don't want to refetch on every event.

**Example:**
```typescript
const debouncedRefetch = useRef<ReturnType<typeof setTimeout>>()

const scheduleRefetch = useCallback(() => {
  if (debouncedRefetch.current) clearTimeout(debouncedRefetch.current)
  debouncedRefetch.current = setTimeout(() => {
    fetchConversations()
  }, 5000) // 5s debounce — only fires if no events for 5s
}, [fetchConversations])
```

### Anti-Patterns to Avoid

- **Full list refetch on every realtime event:** The current approach. A single `conversations` UPDATE triggers `fetchConversations()` which re-authenticates, re-queries with joins, and re-renders the entire list.
- **Listening to tables without filters when filters are possible:** `conversation_tags` and `contact_tags` channels have no filter, meaning they fire for ALL workspaces. However, these junction tables lack `workspace_id`, so this is unavoidable — just handle it client-side by checking if the affected conversation is in the local list.
- **Always-mounted hidden components:** The panel with `w-0 overflow-hidden` still runs all hooks, effects, and subscriptions.
- **Polling as primary refresh mechanism:** The 30s polling in `RecentOrdersList` is a reliability fallback but adds unnecessary server load when realtime is working.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debounce logic | Custom debounce function | `setTimeout` / `clearTimeout` pattern (already used in codebase) | Project already uses this pattern in `quick-reply-autocomplete.tsx` |
| Fuzzy search | Custom search | `fuse.js` (already in project) | Already integrated and working well |
| Virtualized lists | Custom virtualization | `@tanstack/react-virtual` (already in project) | Already used in `chat-view.tsx` |
| State management library | Zustand/Jotai for this | React state + callback props | Project convention; adding state lib for one module is overkill |

**Key insight:** This phase doesn't need new libraries. The optimizations are all about using existing tools more efficiently — smarter event handlers, fewer redundant network calls, and conditional rendering.

## Common Pitfalls

### Pitfall 1: Stale Closures in Realtime Callbacks
**What goes wrong:** Realtime callbacks capture stale `conversations` state because the `useEffect` dependency array doesn't include `conversations`.
**Why it happens:** The current code already has this issue — `ordersChannel` callback reads `conversations` but only re-subscribes when `[workspaceId, fetchConversations, conversations]` changes, which means the channel re-subscribes on EVERY conversations change. That's wasteful.
**How to avoid:** Use a `ref` to hold the latest conversations, or use the `payload` data directly instead of reading from state.
**Warning signs:** Console shows "Realtime conversations status: SUBSCRIBED" repeatedly, or stale data appears briefly.

### Pitfall 2: Race Condition Between Surgical Update and Refetch
**What goes wrong:** If a surgical update and a debounced full refetch overlap, the refetch overwrites the surgical update with slightly older data.
**Why it happens:** The server action takes time to execute, and during that time, more surgical updates may have been applied.
**How to avoid:** Cancel the debounced refetch when a surgical update is applied. Or use a version counter — if the local version is higher than what the refetch started from, discard the refetch result.
**Warning signs:** Data briefly reverts to older state after being updated.

### Pitfall 3: Realtime Payload Missing Join Data
**What goes wrong:** `payload.new` for a `conversations` UPDATE only contains flat columns (no `contact`, `tags`, `contactTags`). Blindly replacing the entire conversation object loses this data.
**Why it happens:** Supabase realtime sends the raw row, not the joined result.
**How to avoid:** When doing surgical UPDATE, spread the payload onto the existing object: `{ ...existingConv, ...payloadNew }` — this preserves the joined data while updating the flat fields.
**Warning signs:** Contact name, tags disappear from conversation items momentarily.

### Pitfall 4: Lost Re-sort After Surgical Update
**What goes wrong:** After updating `last_message_at` surgically, the conversation doesn't move to the top of the list.
**Why it happens:** The list is sorted by `last_message_at` descending, but the surgical update only mutates the object without re-sorting.
**How to avoid:** Always re-sort after a surgical UPDATE that touches `last_message_at`.
**Warning signs:** New messages appear in conversations but they don't float to the top.

### Pitfall 5: Panel State Persistence Across Conversation Switches
**What goes wrong:** If user opens panel for conv A, switches to conv B, panel state may carry over or flash stale data.
**Why it happens:** The panel component may keep state from the previous conversation.
**How to avoid:** Use `key={conversationId}` on `ContactPanel` to force remount on conversation switch. Or keep panel closed by default when switching.
**Warning signs:** Panel shows contact/orders from previous conversation briefly.

### Pitfall 6: conversation_tags Channel Without Filter Fires for All Workspaces
**What goes wrong:** The `conversation_tags` channel fires for ALL changes in the table across all workspaces, not just the current one.
**Why it happens:** The `conversation_tags` junction table has no `workspace_id` column, so no Supabase filter can be applied.
**How to avoid:** In the handler, check if the `conversation_id` from the payload exists in the current local conversations list before doing any work. This is already the implicit behavior (tag update targets a specific conversation_id that must be in local state).
**Warning signs:** Unnecessary tag refetches when other workspaces change tags.

## Code Examples

### Example 1: Consolidated Channel with Surgical Updates (use-conversations.ts)

```typescript
// Source: Codebase analysis + Supabase docs
useEffect(() => {
  if (!workspaceId) return

  const supabase = createClient()
  const conversationsRef = { current: conversations }

  const channel = supabase
    .channel(`inbox:${workspaceId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'conversations',
      filter: `workspace_id=eq.${workspaceId}`,
    }, (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload

      if (eventType === 'UPDATE') {
        setConversations(prev => {
          const updated = prev.map(c =>
            c.id === (newRow as any).id
              ? { ...c, ...(newRow as any) } // Preserves contact/tags
              : c
          )
          // Re-sort by last_message_at
          return updated.sort((a, b) =>
            new Date(b.last_message_at || 0).getTime() -
            new Date(a.last_message_at || 0).getTime()
          )
        })
      } else if (eventType === 'INSERT') {
        // New conversation needs contact data — fetch just this one
        getConversation((newRow as any).id).then(conv => {
          if (conv) setConversations(prev => [conv, ...prev])
        })
      } else if (eventType === 'DELETE') {
        setConversations(prev =>
          prev.filter(c => c.id !== (oldRow as any).id)
        )
      }
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'conversation_tags',
    }, async (payload) => {
      const convId = (payload.new as any)?.conversation_id ||
                     (payload.old as any)?.conversation_id
      if (!convId) return

      // Only process if this conversation is in our list
      const isOurs = conversationsRef.current.some(c => c.id === convId)
      if (!isOurs) return

      const tags = await getConversationTags(convId)
      setConversations(prev =>
        prev.map(c => c.id === convId ? { ...c, tags } : c)
      )
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'contact_tags',
    }, async (payload) => {
      // contact_tags has contact_id — find conversations with this contact
      const contactId = (payload.new as any)?.contact_id ||
                        (payload.old as any)?.contact_id
      if (!contactId) return

      const affectedConvs = conversationsRef.current.filter(
        c => c.contact?.id === contactId
      )
      if (affectedConvs.length === 0) return

      // Refetch only these conversations' contact tags
      // Could use a dedicated server action for efficiency
      fetchConversations() // Fallback: full refetch for contact tags (rare event)
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'orders',
      filter: `workspace_id=eq.${workspaceId}`,
    }, async () => {
      // Refresh order emojis
      refreshOrders()
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [workspaceId]) // Minimal dependency — no conversations dependency!
```

### Example 2: Lazy Panel Rendering (inbox-layout.tsx)

```typescript
// Source: Codebase analysis
// Key change: isPanelOpen defaults to false + conditional render
const [isPanelOpen, setIsPanelOpen] = useState(false)

// In JSX:
{isPanelOpen && (
  <div className="w-80 flex-shrink-0 border-l bg-background">
    {rightPanel === 'agent-config' ? (
      <AgentConfigSlider ... />
    ) : (
      <ContactPanel
        key={selectedConversationId} // Force remount on conversation switch
        ...
      />
    )}
  </div>
)}
```

### Example 3: Lighter Conversation List Query

```typescript
// Source: Codebase analysis of conversations.ts line 44-52
// CURRENT (heavy):
.select(`
  *,
  contact:contacts(id, name, phone, address, city, tags:contact_tags(tag:tags(*))),
  conversation_tags:conversation_tags(tag:tags(*))
`)

// OPTIMIZED (lighter for list — address/city not needed in list):
.select(`
  id, workspace_id, phone, phone_number_id, profile_name, status,
  is_read, unread_count, last_customer_message_at, last_message_at,
  last_message_preview, assigned_to, agent_conversational, contact_id,
  contact:contacts!left(id, name, phone),
  conversation_tags:conversation_tags(tag:tags(id, name, color))
`)
// NOTE: contact_tags (inherited from contact) could be deferred to panel only
```

**Data fields analysis for conversation list rendering:**

| Field | Used in ConversationItem? | Used in ChatHeader? | Source |
|-------|---------------------------|---------------------|--------|
| `contact.name` | YES (display name) | YES | contacts join |
| `contact.phone` | YES (fallback display) | YES | contacts join |
| `contact.address` | NO | NO (panel only) | contacts join |
| `contact.city` | NO | NO (panel only) | contacts join |
| `contact.id` | YES (order lookup) | YES (CRM link) | contacts join |
| `contactTags` (inherited) | YES (shows 2 max) | NO | contact_tags join |
| `tags` (conversation) | YES (shows 2 max) | YES (tag input) | conversation_tags join |

**Verdict:** `address` and `city` can be removed from the list query. `contactTags` are used in the list but are a 3-level deep join — could be deferred as a lower priority optimization.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full refetch on every event | Surgical state updates | Pattern established in React ecosystem | Eliminates N server actions per event |
| One channel per table | Consolidated multi-table channel | Supabase docs (current) | Fewer subscriptions, same functionality |
| Always-mounted hidden panels | Lazy mount on demand | React best practice | Eliminates unused subscriptions/fetches |
| Polling as primary | Realtime as primary, polling as backup | Supabase ecosystem standard | Reduces server load |

## Open Questions

1. **contact_tags refetch strategy**
   - What we know: `contact_tags` junction table has no `workspace_id`, fires for all workspaces. The payload has `contact_id` and `tag_id`.
   - What's unclear: Whether we can fetch just the contact's tags from the client without a dedicated server action (current `getConversationTags` is for conversation_tags, not contact_tags).
   - Recommendation: For contact_tags changes (rare — someone editing a contact's tags in CRM while WhatsApp is open), a full `fetchConversations()` is acceptable as a fallback. Optimize later if metrics show it's a problem.

2. **Orders refresh after surgical update**
   - What we know: The `ordersChannel` currently reads `conversations` from closure to get contact IDs. With surgical updates, we need to be careful about stale closures.
   - What's unclear: Whether orders need to be part of the consolidated channel or can be handled separately.
   - Recommendation: Keep orders refresh in the same consolidated channel but use a ref for contact IDs to avoid stale closures.

3. **Fuse.js index rebuild frequency**
   - What we know: `useMemo(() => new Fuse(conversations, ...), [conversations])` rebuilds the index on every conversations state change.
   - What's unclear: Whether this is a measurable bottleneck for typical list sizes (10-200 conversations).
   - Recommendation: LOW priority. Only optimize if profiling shows it as a bottleneck. For typical CRM usage (< 200 conversations), Fuse.js indexing is fast.

## Sources

### Primary (HIGH confidence)
- Codebase analysis of 6 key files (conversations.ts, use-conversations.ts, use-messages.ts, contact-panel.tsx, chat-view.tsx, inbox-layout.tsx) + supporting files (conversation-list.tsx, conversation-item.tsx, chat-header.tsx, whatsapp types)
- [Supabase Postgres Changes docs](https://supabase.com/docs/guides/realtime/postgres-changes) — confirmed multi `.on()` per channel
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits) — 100 channels/connection limit

### Secondary (MEDIUM confidence)
- [Supabase GitHub Discussion #10980](https://github.com/orgs/supabase/discussions/10980) — confirmed channel consolidation pattern
- [Supabase Realtime Concepts](https://supabase.com/docs/guides/realtime/concepts) — channels share single WebSocket connection
- [Supabase Benchmarks](https://supabase.com/docs/guides/realtime/benchmarks) — postgres_changes processed on single thread

### Tertiary (LOW confidence)
- Community patterns for optimistic updates with Supabase (Medium article, various blog posts) — patterns match what we'd implement but not project-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all verified in package.json
- Architecture: HIGH — all patterns derived from actual codebase analysis + Supabase official docs
- Pitfalls: HIGH — identified from real code patterns and known Supabase realtime behavior

**Research scope:** CODE-LEVEL only. Infrastructure optimizations (RLS policies, DB indexes, Supabase plan) handled by separate researcher.

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (30 days — stable libraries, no major version changes expected)
