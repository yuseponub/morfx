# Standalone: WhatsApp Inbox Reliability — Pattern Map

**Mapped:** 2026-06-11
**Files analyzed:** 15 new/modified files
**Analogs found:** 13 / 15

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/utils/initials.ts` | utility | transform | `src/lib/utils/phone.ts` | role-match |
| `src/lib/utils/__tests__/initials.test.ts` | test | transform | `src/app/(dashboard)/whatsapp/components/__tests__/meta-upload-guard.test.ts` | exact |
| `src/app/actions/conversations.ts` (getConversations → getConversationsPage) | server-action | request-response | self (existing file) + `src/app/actions/metricas-conversaciones.ts` RPC pattern | exact |
| `supabase/migrations/20260611_conversations_keyset.sql` | migration | batch | `supabase/migrations/20260605200000_relax_uq_meta_page_facebook_only.sql` | role-match |
| `src/hooks/use-conversations.ts` (extend with pages + softRefetch) | hook | CRUD + event-driven | `src/hooks/use-messages.ts` (softRefetch + merge-by-id) | exact |
| `src/app/(dashboard)/whatsapp/page.tsx` | server-component | request-response | self (existing file) | exact |
| `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` (virtualizer) | component | event-driven | `src/app/(dashboard)/whatsapp/components/chat-view.tsx` (useVirtualizer) | exact |
| `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` (memo + initials) | component | event-driven | `src/app/(dashboard)/whatsapp/components/chat-view.tsx` (virtualizer row pattern) | role-match |
| `src/app/(dashboard)/whatsapp/components/chat-view.tsx` (3-state error) | component | request-response | self (existing file) | exact |
| `src/app/(dashboard)/whatsapp/components/chat-header.tsx` (initials) | component | transform | `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` L18-24 (call site) | exact |
| `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` (initials) | component | transform | same as chat-header.tsx | exact |
| `src/app/(dashboard)/tareas/components/task-card.tsx` (initials) | component | transform | same pattern | exact |
| `src/app/(dashboard)/settings/workspace/members/members-content.tsx` (initials) | component | transform | same pattern | exact |
| `src/components/layout/sidebar.tsx` (initials) | component | transform | same pattern | exact |
| `src/components/layout/user-menu.tsx` + `src/components/workspace/workspace-switcher.tsx` (initials) | component | transform | same pattern | exact |

---

## Pattern Assignments

### `src/lib/utils/initials.ts` (utility, transform)

**Analog:** `src/lib/utils/phone.ts`

**Imports pattern** (`phone.ts` lines 1-16):
```typescript
// Sibling util in the same directory. Single-responsibility module.
// No default export — only named exports (same as phone.ts convention).
// Import alias: @/lib/utils/initials
```

**File layout pattern** (`phone.ts` lines 1-6 + function JSDoc):
```typescript
/**
 * Grapheme-safe initials.
 *
 * Uses Intl.Segmenter for the first user-perceived grapheme per word.
 * Falls back to Array.from (code-point split — never a lone surrogate) when
 * Intl.Segmenter is unavailable (old Firefox).
 * NEVER use n[0] / charAt(0) over names — a surrogate at position 0 streamed
 * in SSR becomes U+FFFD on the client → React #418 hydration mismatch.
 */
```

**Core implementation** (from RESEARCH.md Q8, verbatim-canonical):
```typescript
// src/lib/utils/initials.ts
const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('es', { granularity: 'grapheme' })
    : null

/** First user-perceived grapheme of a string, or '' for empty/whitespace-only. */
export function firstGrapheme(input: string): string {
  const s = (input ?? '').trim()
  if (!s) return ''
  if (segmenter) {
    for (const { segment } of segmenter.segment(s)) return segment
    return ''
  }
  return Array.from(s)[0] ?? ''
}

/** Up to 2 initials from the first two whitespace-separated words, uppercased. */
export function getInitials(name: string | null | undefined): string {
  const s = (name ?? '').trim()
  if (!s) return ''
  return s
    .split(/\s+/)
    .slice(0, 2)
    .map(firstGrapheme)
    .join('')
    .toUpperCase()
}
```

**Error handling pattern** (`phone.ts` lines 83-86): wrap in try/catch returning fallback — `initials.ts` uses early-return instead (cleaner for pure transforms; no exceptions possible).

---

### `src/lib/utils/__tests__/initials.test.ts` (test, transform)

**Analog:** `src/app/(dashboard)/whatsapp/components/__tests__/meta-upload-guard.test.ts`

**Test file layout** (lines 1-5):
```typescript
import { describe, it, expect } from 'vitest'
import { getInitials, firstGrapheme } from '../initials'
```

**Test structure pattern** (meta-upload-guard.test.ts lines 15-35 — describe/it/expect, no beforeEach, no mocks):
```typescript
describe('getInitials (F-2 grapheme-safe, whatsapp-inbox-reliability)', () => {
  it('returns empty string for null', () => expect(getInitials(null)).toBe(''))
  it('returns empty string for empty string', () => expect(getInitials('')).toBe(''))
  it('returns empty string for whitespace-only', () => expect(getInitials('   ')).toBe(''))
  it('emoji first char — never a lone surrogate', () => expect(getInitials('😎 Test')).toBe('😎T'))
  it('astral char (𝙴)', () => expect(getInitials('𝙴lizar')).toBe('𝙴'))
  it('ZWJ emoji (👨‍👩‍👧) — one grapheme', () => {
    const r = getInitials('👨‍👩‍👧 Family')
    expect(r.length).toBeGreaterThanOrEqual(1)   // ZWJ sequence = 1 grapheme
  })
  it('two-word name returns 2 initials', () => expect(getInitials('Sandra Perez')).toBe('SP'))
  it('single word returns 1 initial', () => expect(getInitials('Sandra')).toBe('S'))
  it('more than 2 words returns only 2 initials', () => expect(getInitials('A B C')).toBe('AB'))
})
```

**Runner command** (from RESEARCH.md §Validation Architecture):
```bash
npx vitest run src/lib/utils/__tests__/initials.test.ts
```

---

### `src/app/actions/conversations.ts` — new `getConversationsPage` + remove `revalidatePath` from `markAsRead` (server-action, request-response)

**Analog:** `src/app/actions/metricas-conversaciones.ts` (`.rpc()` call pattern, lines 120-131)

**Imports pattern** (existing file, lines 1-18):
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getRequestAuth } from '@/lib/auth/request-auth'
// ... domain imports
```

**Auth + workspace guard pattern** (existing `getConversations`, lines 34-41):
```typescript
const auth = await getRequestAuth()
if (!auth) {
  return []          // or appropriate zero-value for the return type
}
const { workspaceId } = auth

const supabase = await createClient()
```

**RPC call pattern** (`metricas-conversaciones.ts` lines 120-131):
```typescript
const { data, error } = await supabase.rpc('get_conversations_page', {
  p_workspace_id: workspaceId,
  p_sort:         params.sortBy ?? 'last_customer_message_at',
  p_status:       params.status ?? 'active',
  p_is_read:      params.is_read ?? null,
  p_assigned_to:  params.assigned_to ?? null,
  p_unassigned:   params.unassigned ?? false,
  p_unanswered:   params.unanswered ?? false,
  p_search:       params.search ?? null,
  p_cursor_sort:  cursor?.sort ?? null,
  p_cursor_is_null: cursor?.sortIsNull ?? false,
  p_cursor_id:    cursor?.id ?? null,
  p_limit:        50,
})

if (error) {
  console.error('[getConversationsPage] RPC error:', error)
  return { conversations: [], hasMore: false, nextCursor: null }
}
```

**Re-join pattern** (existing `getConversations` lines 49-101 — approach A from RESEARCH Q1): after RPC returns base row ids, re-hydrate with a single `.in()` + the existing nested-join select string already at `conversations.ts:51-54`:
```typescript
// Re-hydrate join data for the page ids (approach A, RESEARCH Q1)
const pageIds = (data ?? []).map((r: { id: string }) => r.id)
if (pageIds.length === 0) return { conversations: [], hasMore: false, nextCursor: null }

const { data: joined, error: joinError } = await supabase
  .from('conversations')
  .select(`
    *,
    contact:contacts!left(id, name, phone, is_client, tags:contact_tags(tag:tags(id, name, color)))
  `)
  .in('id', pageIds)
```

**Cursor encoding** (client opaque base64, from RESEARCH Q1):
```typescript
// Encode: last row of the page
const lastRow = conversations[conversations.length - 1]
const nextCursor = lastRow
  ? Buffer.from(JSON.stringify({
      sort: lastRow[sortColumn] ?? null,
      sortIsNull: lastRow[sortColumn] === null,
      id: lastRow.id,
    })).toString('base64')
  : null
```

**F-3: remove revalidatePath from markAsRead** (lines 303-304):
```typescript
// REMOVE THIS LINE (D-13: markAsRead does NOT revalidate — reconcile via optimistic + realtime)
// revalidatePath('/whatsapp')  ← DELETE
// archive/unarchive KEEP their revalidatePath (they change the visible set)
return { success: true, data: undefined }
```

**Count pattern** (existing `getConversationStats`, lines 486-514): reuse `{ count: 'exact', head: true }` for the topbar counter — not `conversations.length` (D-04):
```typescript
const { count: total } = await supabase
  .from('conversations')
  .select('*', { count: 'exact', head: true })
  .eq('workspace_id', workspaceId)
  .eq('status', 'active')
```

---

### `supabase/migrations/20260611_conversations_keyset.sql` (migration, batch)

**Analog:** `supabase/migrations/20260605200000_relax_uq_meta_page_facebook_only.sql` + `supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql`

**Header comment convention** (`relax_uq_meta_page...sql` lines 1-31):
```sql
-- Migration: <title>
-- Purpose: <standalone name>, <decision id>.
--          <one-sentence rationale>
-- Phase: <standalone-name>
--
-- Fix: <description>
--
-- REGLA 5: apply in prod BEFORE pushing the code that uses this.
```

**CONCURRENTLY index convention** (from RESEARCH Q2 — no transaction wrapper, because CONCURRENTLY cannot run inside BEGIN/COMMIT):
```sql
-- DO NOT wrap in BEGIN/COMMIT — CREATE INDEX CONCURRENTLY cannot run in a transaction.
-- whatsapp-inbox-reliability D-08. REGLA 5: APPLY IN PROD BEFORE PUSHING W2 CODE.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_keyset_lcm
  ON conversations (workspace_id, status, last_customer_message_at DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_keyset_lm
  ON conversations (workspace_id, status, last_message_at DESC NULLS LAST, id DESC);
```

**RPC function convention** (`match_knowledge_base_rpc.sql` lines 7-44): `CREATE OR REPLACE FUNCTION`, `LANGUAGE sql STABLE` (for read-only), `SECURITY INVOKER` (NOT DEFINER — RLS must apply, per RESEARCH Q1), `GRANT EXECUTE ... TO authenticated`:
```sql
CREATE OR REPLACE FUNCTION public.get_conversations_page(
  p_workspace_id  uuid,
  ...
)
RETURNS SETOF conversations   -- approach A: base rows only; TS re-joins
LANGUAGE sql STABLE           -- read-only, allows query planner optimizations
-- NOTE: SECURITY INVOKER (default) — RLS is_workspace_member() must apply.
-- Do NOT use SECURITY DEFINER here (unlike match_knowledge_base which uses service_role).
AS $$ ... $$;

GRANT EXECUTE ON FUNCTION public.get_conversations_page(...) TO authenticated;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.get_conversations_page(...);
-- DROP INDEX IF EXISTS idx_conversations_keyset_lcm;
-- DROP INDEX IF EXISTS idx_conversations_keyset_lm;
```

---

### `src/hooks/use-conversations.ts` (hook, CRUD + event-driven)

**Primary analog:** `src/hooks/use-messages.ts` — especially `softRefetch` (lines 167-222) and the page/cursor/hasMore pattern.

**softRefetch pattern to mirror for F-4** (`use-messages.ts` lines 167-222):
```typescript
// Mirror this EXACTLY for the conversation list.
// Key contract: NO isLoading=true, NO array replacement — merge-by-id (latest wins).
const softRefetch = useCallback(async () => {
  const convId = conversationIdRef.current   // ← for lists: no convId needed; just fetch page 1
  if (!convId) return
  try {
    const latest = await getConversationMessages(convId, limit)
    queryClient.setQueryData<Message[]>(queryKeyRef.current, (prev = []) => {
      if (prev.length === 0) return latest
      const byId = new Map<string, Message>()
      for (const m of prev) byId.set(m.id, m)
      for (const m of latest) byId.set(m.id, m)       // latest wins
      return Array.from(byId.values()).sort(/* by timestamp */)
    })
  } catch {
    queryClient.invalidateQueries({ queryKey: queryKeyRef.current })
  }
}, [queryClient, limit])
```

**For the conversation list (F-4), the analog is:**
```typescript
// src/hooks/use-conversations.ts — new softRefetchPage1
const softRefetchPage1 = useCallback(async () => {
  try {
    const { conversations: latest } = await getConversationsPage(
      { ...currentFilters, sortBy: sortModeRef.current },
      null,  // cursor=null → page 1
    )
    setConversations(prev => {
      if (prev.length === 0) return latest
      const byId = new Map<string, ConversationWithDetails>()
      for (const c of prev) byId.set(c.id, c)
      for (const c of latest) byId.set(c.id, c)       // latest wins for flat columns
      // Re-sort merged result by current sort mode
      return sortConversations(Array.from(byId.values()), sortModeRef.current)
    })
  } catch {
    // silent — eventually consistent; realtime bridge is the primary path
  }
}, [/* currentFilters */])
```

**Coalescing timer pattern for F-4/D-15** (`use-messages.ts` lines 231-236 + `use-conversations.ts` lines 282-287):
```typescript
// CURRENT (broken — re-arms on every event, runs continuously):
const scheduleSafetyRefetch = useCallback(() => {
  if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current)
  safetyRefetchTimer.current = setTimeout(() => { fetchConversations() }, 10_000)
}, [fetchConversations])

// NEW (D-15 — coalescing: fire once, don't re-arm while timer is live):
const scheduleSafetyRefetch = useCallback(() => {
  if (safetyRefetchTimer.current) return   // ← already armed — do NOT re-arm
  safetyRefetchTimer.current = setTimeout(() => {
    safetyRefetchTimer.current = null
    softRefetchPage1()
  }, 10_000)
}, [softRefetchPage1])
```

**Mounted-ref guard for D-17** (from RESEARCH Q9 — pattern NOT currently in the codebase; must be added):
```typescript
// Add at top of hook body:
const mountedRef = useRef(true)
useEffect(() => () => { mountedRef.current = false }, [])

// Add BEFORE every setState call following an await inside the hook:
const orders = await getOrdersForContacts(ids)
if (!mountedRef.current) return        // zombie: user navigated away → discard
setOrdersByContact(orders)

// For "latest wins" within a mounted component (rapid filter changes):
const reqIdRef = useRef(0)
const myId = ++reqIdRef.current
const result = await getConversationsPage(...)
if (!mountedRef.current || myId !== reqIdRef.current) return
setConversations(result.conversations)
```

**Surgical orders realtime handler for D-16** (replacing `use-conversations.ts` lines 449-468):
```typescript
// OLD (full refetch of all contacts on any orders event):
async () => {
  const ids = contactIdsRef.current
  const orders = await getOrdersForContacts([...new Set(ids)])
  setOrdersByContact(orders)
}

// NEW (D-16 surgical — update only the affected contact):
async (payload) => {
  const contactId = (payload.new as { contact_id?: string })?.contact_id
                 || (payload.old as { contact_id?: string })?.contact_id
  if (!contactId) return
  // Only refetch if the contact is actually in the loaded window
  if (!contactIdsRef.current.includes(contactId)) return
  const orders = await getOrdersForContacts([contactId])
  if (!mountedRef.current) return
  setOrdersByContact(prev => new Map(prev).set(contactId, orders.get(contactId) ?? []))
}
```

**Page state additions** (new fields to add to hook state, compatible with existing `useState` shape at lines 136-144):
```typescript
// Add to hook state (after existing state declarations):
const [hasMore, setHasMore] = useState(true)
const [isLoadingMore, setIsLoadingMore] = useState(false)
const cursorRef = useRef<string | null>(null)   // opaque base64 cursor for loadMore

// loadMore function exposed to the list:
const loadMore = useCallback(async () => {
  if (!hasMore || isLoadingMore) return
  setIsLoadingMore(true)
  try {
    const { conversations: page, nextCursor, hasMore: more } =
      await getConversationsPage(currentFilters, cursorRef.current)
    cursorRef.current = nextCursor
    setHasMore(more)
    setConversations(prev => {
      const byId = new Map(prev.map(c => [c.id, c]))
      for (const c of page) if (!byId.has(c.id)) byId.set(c.id, c)  // dedupe
      return Array.from(byId.values())  // sort preserved from prev + appended tail
    })
    // Load orders for new page's contacts only (D-09):
    const newContactIds = page.map(c => c.contact?.id).filter((id): id is string => !!id)
    if (newContactIds.length > 0) {
      const orders = await getOrdersForContacts(newContactIds)
      if (mountedRef.current) {
        setOrdersByContact(prev => new Map([...prev, ...orders]))
      }
    }
  } finally {
    setIsLoadingMore(false)
  }
}, [hasMore, isLoadingMore, /* currentFilters */])
```

**Realtime INSERT/UPDATE for unloaded pages (D-07 / RESEARCH Q6)**:
```typescript
// For a conversation UPDATE with idx === -1 (not in loaded pages):
// Determine if the updated row belongs on an already-loaded page
// (sort value ABOVE the current window's last-loaded cursor)
// If yes: fetch it via getConversation(id) and insert by sort.
// If no: ignore — it lives in an unloaded page, visible when scrolled there.
// Both cases are gated behind the F-5 freeze while scrollTop > threshold.
```

**Realtime channel token pattern** (existing `use-conversations.ts` lines 318-324 — KEEP as-is):
```typescript
const { data: { session } } = await supabase.auth.getSession()
if (session?.access_token) {
  await supabase.realtime.setAuth(session.access_token)
}
if (cancelled) return
```

---

### `src/app/(dashboard)/whatsapp/page.tsx` (server-component, request-response)

**Analog:** self — existing file pattern (lines 34-40):
```typescript
// CURRENT: fetches unbounded 1000 rows
getConversations({ status: 'active', sortBy: 'last_customer_message' })

// NEW (F-1 D-02): only the first 50-row page; cursor=null
getConversationsPage({ status: 'active', sortBy: 'last_customer_message_at' }, null)
// Returns: { conversations: ConversationWithDetails[], hasMore: boolean, nextCursor: string|null }
```

**Pass-through to hook** (existing lines 60-79 — shape preserved): the new `initialConversations` prop type stays `ConversationWithDetails[]`. Add `initialCursor` and `initialHasMore` as additional props to `InboxLayout`.

**Topbar count pattern** (from `getConversationStats`, lines 471-522): instead of deriving from `initialConversations.length` (now just 50), pass the `count: 'exact'` result:
```typescript
// Fetch count independently in the parallel Promise.all:
const [initialPage, clientConfig, stats, ...] = await Promise.all([
  getConversationsPage({ status: 'active', sortBy: 'last_customer_message_at' }, null),
  getClientActivationSettings(),
  getConversationStats(),
  ...
])
// Pass stats.total / stats.unread to InboxLayout (not initialConversations.length)
```

---

### `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` (component, event-driven)

**Primary analog for virtualization:** `src/app/(dashboard)/whatsapp/components/chat-view.tsx`

**useVirtualizer setup** (`chat-view.tsx` lines 97-103):
```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 80,             // for conversation list: ~76px (v3 .conv grid), ~88px (v2)
  measureElement: (el) => el.getBoundingClientRect().height,  // dynamic — tags vary height
  overscan: 5,
})
```

**Scroll container** (`chat-view.tsx` line 232 — `overflow-auto` div, NOT Radix ScrollArea per RESEARCH Q7):
```typescript
<div
  ref={parentRef}
  className="flex-1 overflow-auto"  // plain div — Radix ScrollArea's nested viewport fights getScrollElement
>
```

**Virtual rows render** (`chat-view.tsx` lines 300-348):
```typescript
<div
  style={{
    height: `${virtualizer.getTotalSize()}px`,
    width: '100%',
    position: 'relative',
  }}
>
  {virtualizer.getVirtualItems().map((virtualItem) => (
    <div
      key={virtualItem.key}
      data-index={virtualItem.index}
      ref={virtualizer.measureElement}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        transform: `translateY(${virtualItem.start}px)`,
      }}
    >
      <ConversationItem
        conversation={conversations[virtualItem.index]}
        isSelected={...}
        onSelect={...}
        orders={...}
      />
    </div>
  ))}
</div>
```

**Infinite scroll trigger** (from RESEARCH Q7 — derived from virtualizer state, no IntersectionObserver):
```typescript
// Inside the component, after virtualItems are computed:
const virtualItems = virtualizer.getVirtualItems()
const lastItem = virtualItems.at(-1)
useEffect(() => {
  if (!lastItem) return
  if (lastItem.index >= conversations.length - 1 - virtualizer.options.overscan
      && hasMore
      && !isLoadingMore) {
    loadMore()
  }
}, [lastItem?.index, conversations.length, hasMore, isLoadingMore, loadMore])
```

**F-5 scroll state tracking** (pattern from `chat-view.tsx` lines 143-157 — scroll listener on the container div):
```typescript
// Track scrollTop for F-5 freeze policy
const scrollTopRef = useRef(0)
useEffect(() => {
  const container = parentRef.current
  if (!container) return
  const handleScroll = () => { scrollTopRef.current = container.scrollTop }
  container.addEventListener('scroll', handleScroll, { passive: true })
  return () => container.removeEventListener('scroll', handleScroll)
}, [])

// isFrozen = scrollTop > container.clientHeight (1 viewport threshold per D-18)
// While frozen: UPDATEs mutate data in-place, reordered rows increment bannerCount
// On banner click or return-to-top: apply real sort + reset bannerCount
```

---

### `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` (component, event-driven)

**Current getInitials** (lines 18-25 — the bug source):
```typescript
// DELETE THIS LOCAL COPY:
function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0] || '')    // ← UTF-16 indexing: n[0] = lone surrogate for emoji/astral names → #418
    .join('')
    .toUpperCase()
}
```

**Replace with** (F-2):
```typescript
import { getInitials } from '@/lib/utils/initials'
// Delete the local function above entirely.
// Usage (lines 90 and 217) is unchanged: {getInitials(displayName)}
```

**React.memo wrapper** (D-03 — no existing analog; first use in codebase):
```typescript
// Wrap the export:
import { memo } from 'react'

function ConversationItemBase({ conversation, isSelected, onSelect, orders }: ConversationItemProps) {
  // ... existing body unchanged
}

export const ConversationItem = memo(ConversationItemBase, (prev, next) => {
  // Custom comparator: return true (skip re-render) when nothing display-relevant changed.
  return (
    prev.conversation.id === next.conversation.id &&
    prev.conversation.last_message_preview === next.conversation.last_message_preview &&
    prev.conversation.last_message_at === next.conversation.last_message_at &&
    prev.conversation.last_customer_message_at === next.conversation.last_customer_message_at &&
    prev.conversation.is_read === next.conversation.is_read &&
    prev.conversation.unread_count === next.conversation.unread_count &&
    prev.conversation.assigned_to === next.conversation.assigned_to &&
    prev.conversation.agent_conversational === next.conversation.agent_conversational &&
    prev.conversation.tags === next.conversation.tags &&      // ref equality — hook produces new ref on change
    prev.conversation.contact?.is_client === next.conversation.contact?.is_client &&
    prev.isSelected === next.isSelected &&
    prev.orders === next.orders                               // ref equality — Map produces new ref on change
  )
})
```

---

### `src/app/(dashboard)/whatsapp/components/chat-view.tsx` — F-6 three-state error (component, request-response)

**Analog:** self (existing loading/empty states, lines 258-298 + 351-358)

**Current two-state pattern** (chat-view.tsx lines 258-298):
```typescript
{/* Loading state */}
{isLoading && messages.length === 0 && (
  v2 ? <SkeletonBubbles /> : <LoaderSpinner />
)}
{/* Empty state */}
{messages.length === 0 && !isLoading && (
  <div>No hay mensajes aun</div>
)}
```

**New three-state pattern for F-6** (hook must expose `isError` + `refetch`):
```typescript
// In useMessages return type (add to UseMessagesReturn):
isError: boolean
refetch: () => void

// In chat-view.tsx — replace the two conditions above with three:
{isLoading && messages.length === 0 && <LoadingState v2={v2} v3={v3} />}

{isError && messages.length === 0 && (
  <div className="flex flex-col items-center gap-3 py-20 text-center">
    <p className="mx-caption">No se pudieron cargar los mensajes.</p>
    <button
      className="mx-btn-ghost text-sm"
      onClick={refetch}
    >
      Reintentar
    </button>
  </div>
)}

{messages.length === 0 && !isLoading && !isError && (
  <div className="flex-1 flex items-center justify-center py-20">
    <p className="text-sm text-muted-foreground">No hay mensajes aun</p>
  </div>
)}
```

**React Query `isError` + `refetch` wiring** (in `use-messages.ts`, `useQuery` return, line 115):
```typescript
const { data: messages = [], isLoading, isError, refetch } = useQuery({
  queryKey,
  queryFn: () => getConversationMessages(conversationId!, limit),
  enabled: !!conversationId,
  retry: 1,   // keep existing — already caps at 1 (not 3)
})
// Expose: return { ..., isError, refetch }
```

---

### F-7: `selectedConversation` derived selection — touches `inbox-layout.tsx` (component, event-driven)

**No direct codebase analog for the derived-selection pattern.** Apply from CONTEXT.md D-21:

```typescript
// In inbox-layout.tsx — REMOVE the parallel state:
// const [selectedConversation, setSelectedConversation] = useState<ConversationWithDetails | null>(null)

// REPLACE with derived + fetch-by-id effect:
const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialSelectedId ?? null)

// Derived: lookup in the loaded list; fetch by id if not found (e.g., from URL param)
const [fetchedConversation, setFetchedConversation] = useState<ConversationWithDetails | null>(null)
const selectedConversation = getConversationById(selectedConversationId ?? '') ?? fetchedConversation

useEffect(() => {
  if (!selectedConversationId) { setFetchedConversation(null); return }
  if (getConversationById(selectedConversationId)) { setFetchedConversation(null); return }
  // Not in loaded pages — fetch it
  getConversation(selectedConversationId).then(conv => {
    setFetchedConversation(conv)
  })
}, [selectedConversationId, conversations])   // ← deps include conversations (not [])
// This CORRECTLY re-derives when: id changes, or when the conversation arrives in a page load
```

---

## F-2 Call Site Inventory (D-11)

Each of the 9 sites to migrate. Current implementation (one-line excerpt) → replacement import.

| File | Line | Current pattern | Replace with |
|---|---|---|---|
| `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` | 18-24 | `function getInitials(name){return name.split(' ').slice(0,2).map(n=>n[0]||'')...}` | `import { getInitials } from '@/lib/utils/initials'` — delete local fn |
| `src/app/(dashboard)/whatsapp/components/chat-header.tsx` | 302, 496 | `displayName.charAt(0).toUpperCase()` | `getInitials(displayName)` (or `firstGrapheme(displayName).toUpperCase()` for single-char sites) |
| `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` | 244-248 | `.split(' ').slice(0,2).map((n)=>n[0]||'')` inline | `getInitials(fichaName)` |
| `src/app/(dashboard)/tareas/components/task-card.tsx` | 35-39 | `function getInitials(name){...parts[0]![0]!...}` local fn | `import { getInitials } from '@/lib/utils/initials'` — delete local fn |
| `src/app/(dashboard)/settings/workspace/members/members-content.tsx` | 78 | `function getInitials(email){...}` local fn (email-based) | `import { firstGrapheme } from '@/lib/utils/initials'`; keep email-parse logic, replace `email.split('@')[0][0]` with `firstGrapheme(email.split('@')[0])` |
| `src/components/layout/sidebar.tsx` | 363, 547, 749 | `user.email?.charAt(0).toUpperCase() \|\| 'U'` | `firstGrapheme(user.email ?? '') \|\| 'U'` |
| `src/components/layout/user-menu.tsx` | 23 | `user.email.charAt(0).toUpperCase()` | `firstGrapheme(user.email) \|\| ''` |
| `src/components/workspace/workspace-switcher.tsx` | 68 | `displayWorkspace.name?.charAt(0).toUpperCase() \|\| 'W'` | `firstGrapheme(displayWorkspace.name ?? '') \|\| 'W'` |
| `src/app/(dashboard)/configuracion/whatsapp/equipos/components/team-members-manager.tsx` | 148 | `(member.user_name \|\| member.user_email \|\| 'A').charAt(0).toUpperCase()` | `firstGrapheme(member.user_name \|\| member.user_email \|\| 'A') \|\| 'A'` |

**Verification gate** (D-12):
```bash
# Must return 0 after Wave 1:
grep -rn "charAt(0)\|\.name\[0\]\|\bn\[0\]" src/app src/components --include="*.tsx" --include="*.ts"
```

---

## Shared Patterns

### getRequestAuth + RLS client (all server actions)
**Source:** `src/app/actions/conversations.ts` lines 34-41
**Apply to:** `getConversationsPage` (new action)
```typescript
const auth = await getRequestAuth()
if (!auth) return /* zero value */
const { workspaceId } = auth
const supabase = await createClient()   // RLS client — NOT createAdminClient (Regla 3 reads)
```

### softRefetch merge-by-id (no spinner, no array replacement)
**Source:** `src/hooks/use-messages.ts` lines 167-222
**Apply to:** new `softRefetchPage1` in `use-conversations.ts` (F-4)
Core contract: `new Map` over `prev` then overlay `latest` (latest wins), Array.from + sort.

### Realtime token-before-subscribe
**Source:** `src/hooks/use-conversations.ts` lines 318-324 + `src/hooks/use-messages.ts` lines 329-333
**Apply to:** ANY new realtime channel. Pattern must stay unchanged in `use-conversations.ts`.
```typescript
const { data: { session } } = await supabase.auth.getSession()
if (session?.access_token) {
  await supabase.realtime.setAuth(session.access_token)
}
if (cancelled) return
```

### Async IIFE + cancelled guard (realtime effects)
**Source:** `src/hooks/use-conversations.ts` lines 310-326 + `src/hooks/use-messages.ts` lines 322-334
**Apply to:** all realtime `useEffect` blocks
```typescript
let channel: ReturnType<typeof supabase.channel> | null = null
let cancelled = false
;(async () => {
  // ... async setup ...
  if (cancelled) return
  channel = supabase.channel(...)
    .on(...)
    .subscribe(...)
})()
return () => {
  cancelled = true
  if (channel) supabase.removeChannel(channel)
}
```

### Migration file naming + ROLLBACK footer
**Source:** `supabase/migrations/20260605200000_relax_uq_meta_page_facebook_only.sql` + `supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql`
**Apply to:** D-08 migration
- Filename: `YYYYMMDDHHMMSS_description.sql`
- Leading `--` comment block: standalone + decision id + Regla 5 note
- `-- ROLLBACK:` footer with the inverse DDL

### perf warn pattern
**Source:** `src/app/actions/conversations.ts` lines 32-83
**Apply to:** `getConversationsPage`
```typescript
const startTime = Date.now()
// ... query ...
const elapsed = Date.now() - startTime
if (elapsed > 2000) {
  console.warn(`[perf] getConversationsPage: ${elapsed}ms`)
}
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `React.memo` wrapper on `ConversationItem` | component optimization | event-driven | No `React.memo` exists anywhere in the codebase — first use. Pattern is standard React; RESEARCH Q7 documents the comparator fields to use. |
| F-5 banner "N conversaciones con actividad" | component | event-driven | No scroll-freeze + banner pattern exists in codebase. Implement as a `useState<number>(0)` bannerCount + conditional banner div above the virtualizer container. Wording: "N conversaciones con actividad — volver arriba". |

---

## Metadata

**Analog search scope:** `src/hooks/`, `src/app/actions/conversations.ts`, `src/app/(dashboard)/whatsapp/`, `src/components/layout/`, `src/lib/utils/`, `supabase/migrations/`
**Files scanned:** ~22 files read; ~15 grep searches
**Pattern extraction date:** 2026-06-11
