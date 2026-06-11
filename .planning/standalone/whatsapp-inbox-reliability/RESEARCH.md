# WhatsApp Inbox Reliability — Research

**Researched:** 2026-06-11
**Domain:** Next.js 15 App Router + React 19 + Supabase (PostgREST/Realtime) + @tanstack/react-query v5 + @tanstack/react-virtual v3
**Confidence:** HIGH (codebase grounded; PostgREST keyset/NULL behavior cross-verified against Supabase docs + discussions)

> This file is the planner's input. CONTEXT.md (D-01..D-25) holds the locked decisions — this
> research validates HOW to implement them, never revisits them. Every recommendation is grounded
> in code actually read this session (file:line cited).

---

## Summary

The inbox's entire bug class traces to ONE root: `getConversations` (`conversations.ts:28`) runs an
unbounded `select *` + join, which PostgREST silently caps at 1000 rows — making 1559 of Somnio's
2559 conversations invisible, moving ~1000 joined rows per fetch (~4.3s), and SSR-rendering 1000
`<ConversationItem>` into the RSC payload. Every other symptom (the #418 hydration crash, the
dead-click window, the scroll-shift, the "autorefresh" storm, the zombie cross-module fetches) is a
second-order consequence of that volume plus three local defects: UTF-16 indexing in `getInitials`
(`conversation-item.tsx:18`), `revalidatePath('/whatsapp')` on every `markAsRead`, and a
re-arming 10s full-refetch timer.

**Primary recommendation:** Keep the `use-conversations` manual hook (NOT a React Query migration —
Q5) because it already owns realtime/optimistic/orders wiring that is hard-won and prod-validated;
extend it with explicit page state + a keyset cursor. Implement keyset via a **Postgres RPC**
(`get_conversations_page`) rather than a chained `.or()` filter, because the `.or()` keyset pattern
**silently drops rows whose sort column is NULL** (confirmed below) and the active default sort is
`last_customer_message_at`, which is NULL for every outbound-only conversation. The RPC also lets
filters + search + tie-breaker live in one indexed, analyzable query. Waves exactly as D-22: W1
(grapheme + revalidatePath + error state) ships with zero migration; W2 (the keyset RPC + index +
virtualization) is the surgery and the only wave needing the Regla 5 migration pause.

---

## User Constraints (from CONTEXT.md — verbatim authority)

### Locked Decisions (research-gated items, resolved here)
- D-01 keyset cursor shape → **Q1** (RPC, not `.or()` — NULL-safety)
- D-08 index design + migration SQL → **Q2**
- D-05 server-side search ILIKE vs trgm → **Q3** (ILIKE, no trgm at this scale)
- D-06 filters server-side → **Q4** (all expressible; `unanswered`/`tag`/`mine` notes)
- List-state architecture (Claude discretion) → **Q5** (keep manual hook)
- D-07 realtime + pages merge-by-id → **Q6**
- D-03 virtualization → **Q7**
- D-10 Intl.Segmenter grapheme util → **Q8**
- D-09/D-16/D-17 orders scoping + cancellation → **Q9**
- D-04 count aggregate + SSR hydration + must-not-change → **Q10**

### Deferred (OUT OF SCOPE — do not touch)
- /agentes TTFB, dedicated case-2 diagnose, avatar audit of non-listed modules.

### Project rules in force
- **Regla 5 (migrations before deploy):** D-08 index + RPC must be applied to prod by the user BEFORE pushing W2 code. Plan must include an explicit PAUSE.
- **Regla 1 (push after changes):** each wave = independent verified push.
- **Regla 2 (TZ Bogotá):** any new date formatting uses `America/Bogota`. (No new formatting needed here — `RelativeTime` already client-only suppressed; the banner/count are numeric.)
- **Regla 3 (domain layer for mutations):** READS stay on `createClient()` (RLS) in server actions — do NOT route reads through domain. Confirmed: `getConversations` already reads via `createClient()`.

---

## Q1 — Keyset pagination (D-01)

### What the current query is (the shape the cursor must preserve)
`conversations.ts:49-56`:
```ts
supabase.from('conversations').select(`
  *,
  contact:contacts!left(id, name, phone, is_client, tags:contact_tags(tag:tags(id, name, color)))
`)
.eq('workspace_id', workspaceId)
.order(sortColumn, { ascending: false, nullsFirst: false })   // sortColumn = last_message_at | last_customer_message_at
```
Sort is DESC with **NULLs last**. `last_customer_message_at` is the DEFAULT sort (`use-conversations.ts:142`) and is **NULL for every conversation where the customer never replied** (outbound-only). `last_message_at` is non-null once any message exists.

### The decisive finding: `.or()` keyset silently drops NULL-sorted rows
The canonical supabase-js keyset predicate (verified, Supabase discussion #21330) for DESC is:
```ts
.or(`and(${col}.eq.${v},id.lt.${cursorId}),${col}.lt.${v}`)
.order(col, { ascending: false, nullsFirst: false }).order('id', { ascending: false })
```
This expresses `(col, id) < (cursorVal, cursorId)`. **But every branch requires `col` to satisfy a comparison.** A row with `col IS NULL` matches neither `col.eq.X` nor `col.lt.X` (NULL comparisons are UNKNOWN in SQL), so it is **excluded from every page after page 1**. With NULLs sorted last by `nullsFirst:false`, the tail of the list (outbound-only conversations) becomes unreachable through the cursor — re-introducing an invisibility bug of the same class we are fixing. PostgREST has no row-value-comparison operator and no NULL-aware keyset sugar; the discussion thread explicitly leaves NULL handling unanswered. **This rules out the chained `.or()` approach for the `last_customer_message_at` sort.**

### Recommendation: Postgres RPC `get_conversations_page` (SECURITY INVOKER)
A SQL function expresses NULL-correct keyset cleanly with a row-value comparison and `COALESCE`-free NULL ordering, returns the SAME joined shape, and keeps filters + search in one indexed plan. Use **SECURITY INVOKER** (default) so RLS `is_workspace_member()` still applies (do NOT use SECURITY DEFINER here — the read must remain workspace-isolated by RLS, matching the current `createClient()` path).

Cursor encodes `(sortValue | null, id)`. The keyset predicate, NULL-aware for DESC + NULLs-last:
```sql
-- For a row to come AFTER the cursor in (sort DESC NULLS LAST, id DESC) order:
--   either sort_val is "less than" cursor (with NULL treated as the smallest = last),
--   or sort_val ties the cursor and id < cursor_id.
WHERE c.workspace_id = p_workspace_id
  AND (p_cursor_sort IS NULL AND p_cursor_id IS NULL  -- first page
       OR
       -- subsequent pages: row is strictly after cursor in the composite order
       ( (c.sort_col IS NOT DISTINCT FROM p_cursor_sort AND c.id < p_cursor_id)
         OR (c.sort_col < p_cursor_sort)
         OR (c.sort_col IS NULL AND p_cursor_sort IS NOT NULL AND <cursor not already in null-band>) ))
ORDER BY c.sort_col DESC NULLS LAST, c.id DESC
LIMIT p_limit;
```
The cleanest, provably-correct form uses Postgres row-value comparison with a NULLS-LAST sentinel. Because row-value comparison `(a,b) < (c,d)` does NOT honor `NULLS LAST`, the planner should implement the band explicitly. Recommended canonical body (two-sort-column variants via a `p_sort` param so one function serves both `last_message_at` and `last_customer_message_at`):

```sql
CREATE OR REPLACE FUNCTION public.get_conversations_page(
  p_workspace_id  uuid,
  p_sort          text DEFAULT 'last_customer_message_at',  -- or 'last_message_at'
  p_status        text DEFAULT 'active',
  p_is_read       boolean DEFAULT NULL,        -- unread filter
  p_assigned_to   uuid DEFAULT NULL,           -- 'mine'
  p_unassigned    boolean DEFAULT false,       -- assigned_to IS NULL
  p_unanswered    boolean DEFAULT false,       -- last_customer_message_at IS NULL
  p_search        text DEFAULT NULL,           -- ILIKE name/phone
  p_cursor_sort   timestamptz DEFAULT NULL,    -- decoded cursor sort value (may be NULL)
  p_cursor_is_null boolean DEFAULT false,      -- whether cursor row's sort was NULL
  p_cursor_id     uuid DEFAULT NULL,
  p_limit         int DEFAULT 50
)
RETURNS SETOF conversations  -- return base rows; the action re-joins contact/tags (see note)
LANGUAGE sql STABLE
AS $$
  SELECT c.*
  FROM conversations c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.workspace_id = p_workspace_id
    AND (p_status IS NULL OR c.status = p_status)
    AND (p_is_read IS NULL OR c.is_read = p_is_read)
    AND (p_assigned_to IS NULL OR c.assigned_to = p_assigned_to)
    AND (NOT p_unassigned OR c.assigned_to IS NULL)
    AND (NOT p_unanswered OR c.last_customer_message_at IS NULL)
    AND (p_search IS NULL OR ct.name ILIKE '%'||p_search||'%' OR c.phone ILIKE '%'||p_search||'%')
    -- keyset on (sort DESC NULLS LAST, id DESC):
    AND (
      p_cursor_id IS NULL  -- first page
      OR CASE p_sort
           WHEN 'last_message_at' THEN
             (c.last_message_at < p_cursor_sort)
             OR (c.last_message_at IS NOT DISTINCT FROM p_cursor_sort AND c.id < p_cursor_id)
             OR (p_cursor_is_null AND c.last_message_at IS NULL AND c.id < p_cursor_id)
             OR (NOT p_cursor_is_null AND c.last_message_at IS NULL) -- null-band after any non-null cursor
           ELSE
             (c.last_customer_message_at < p_cursor_sort)
             OR (c.last_customer_message_at IS NOT DISTINCT FROM p_cursor_sort AND c.id < p_cursor_id)
             OR (p_cursor_is_null AND c.last_customer_message_at IS NULL AND c.id < p_cursor_id)
             OR (NOT p_cursor_is_null AND c.last_customer_message_at IS NULL)
         END
    )
  ORDER BY
    CASE WHEN p_sort = 'last_message_at' THEN c.last_message_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'last_customer_message_at' THEN c.last_customer_message_at END DESC NULLS LAST,
    c.id DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_conversations_page TO authenticated;
```

**The join question.** `RETURNS SETOF conversations` returns base columns only; the action would then need a second round-trip to fetch `contact + tags`. Two viable shapes — planner picks one and locks it:
- **(A) RPC returns base rows; action re-hydrates the joins** with a single `.in('id', pageIds)` `select` reusing the existing nested-join select string. Two queries, both indexed; keeps the join logic in TS (where it already lives, `conversations.ts:88-102`). Simpler to reason about; recommended.
- **(B) RPC returns `RETURNS TABLE(... , contact jsonb, tags jsonb)`** building the nested JSON in SQL (`jsonb_build_object` + `jsonb_agg` over `contact_tags→tags`). One round-trip, but reimplements the join in SQL and must stay byte-compatible with `ConversationWithDetails`. Faster but more migration surface.

Recommend **(A)**: RPC for the NULL-correct keyset window (returns ≤50 ids in sorted order), then one `.in()` re-join + re-apply the existing TS transform, re-sorted to the RPC's id order. This keeps `ConversationWithDetails` construction in exactly one place and limits the SQL to the hard part (the cursor).

**Cursor encoding (client):** opaque base64 of `{ sort: ISOstring|null, id: uuid }` taken from the LAST row of the current page. Page 1 passes a null cursor. `hasMore = (rows.length === limit)`. Confidence: **HIGH** (NULL-drop verified; RPC is standard Postgres).

---

## Q2 — Index design + migration SQL (D-08)

### Existing indexes (read from `20260130000002_whatsapp_conversations.sql:89-95`)
```
idx_conversations_updated  ON conversations(workspace_id, last_message_at DESC)   -- exists, partial-covers one sort
idx_conversations_status   ON conversations(workspace_id, status)
idx_conversations_unread   ON conversations(workspace_id, is_read) WHERE is_read=false
```
None has the `id` tie-breaker, and there is NO index on `last_customer_message_at` (the DEFAULT sort) — today's default-sort scan is unindexed on the ordering column, part of why it's slow.

### Required indexes for the keyset (composite, matching ORDER BY exactly)
The index column order MUST mirror `ORDER BY sort DESC NULLS LAST, id DESC` and lead with the equality-filtered `workspace_id` + `status` (both fixed per page). Two indexes (one per sort mode):
```sql
-- Migration: 20260611_xxxxxx_conversations_keyset_indexes.sql
-- whatsapp-inbox-reliability D-08. Regla 5: APPLY IN PROD BEFORE PUSHING W2 CODE.

-- Default sort (last_customer_message_at): the hot path.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_keyset_lcm
  ON conversations (workspace_id, status, last_customer_message_at DESC NULLS LAST, id DESC);

-- Alternate sort (last_message_at) toggle.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_keyset_lm
  ON conversations (workspace_id, status, last_message_at DESC NULLS LAST, id DESC);
```
Notes:
- **`CONCURRENTLY`** so the build does not lock the live Somnio table (2559 rows is small, but the table is hot with realtime writes; CONCURRENTLY is the safe default). CONCURRENTLY cannot run inside a transaction block — the migration file must not wrap it in BEGIN/COMMIT.
- `NULLS LAST` in the index matches the query's `NULLS LAST` ordering so Postgres can satisfy the ORDER BY from the index without a sort node. (Default for DESC is NULLS FIRST — must be explicit.)
- The nested `contact`/`tags` join does NOT change this index: those are separate lookups by `contact_id` / `contact_tags.contact_id` already covered by `idx_conversations_contact` and the `contact_tags` PK. The keyset window is computed on `conversations` alone (approach A above).
- The existing `idx_conversations_updated` becomes redundant with `idx_conversations_keyset_lm` (latter is a strict superset for the keyset). Leave it (cheap; dropping is out of scope and risks other callers like `findConversationByPhone` ordering).
- Search adds an ILIKE on `contacts.name` — see Q3 for whether that needs its own index (conclusion: no, at this scale).

**Migration header convention** (matches repo style, e.g. `20260513120100_*`): leading `--` comment block stating the standalone, the decision id, and the Regla 5 apply-before-push note + a `-- ROLLBACK:` footer with `DROP INDEX`. Confidence: **HIGH**.

---

## Q3 — Server-side search (D-05)

Current search is client-side over the in-memory ≤1000 rows: Fuse (`use-conversations.ts:498-512`) plus an ILIKE-style server filter that ALSO only runs over the fetched page (`conversations.ts:104-112`). Both miss the 1559 tail. D-05 moves it server-side over ALL conversations, joined through `contacts`.

**ILIKE vs pg_trgm — recommend plain ILIKE, no trigram index, at this scale.**
- 2559 rows/workspace is tiny. A two-predicate `ct.name ILIKE '%q%' OR c.phone ILIKE '%q%'` is a sub-millisecond seq-scan-of-filtered-workspace even without a trigram index. A `gin_trgm_ops` index only pays off at 6–7 figure row counts and adds write amplification on a hot table.
- Leading-wildcard `'%q%'` cannot use a btree index anyway; only a trigram GIN would — and it's not warranted here. Document this as a deliberate scale decision, revisit only if a workspace exceeds ~100k conversations.

**Query shape.** Fold search INTO the keyset RPC (Q1) as the `p_search` param via a `LEFT JOIN contacts` (NOT `!inner` — conversations without a linked contact must still match by phone, and must still appear when no search). The LEFT JOIN + `(ct.name ILIKE … OR c.phone ILIKE …)` preserves contactless conversations. The existing PostgREST `!inner` trick (`findConversationByPhone`, `conversations.ts:159`) is for a different one-row lookup and is not the model here.

**Interaction with keyset.** Search defines its own window: the cursor is still `(sort, id)` but the predicate set now includes the ILIKE, so paging through search results is the same keyset, just a narrower WHERE. Debounce client-side (~250–300ms) before issuing; resetting search resets to page 1 (null cursor). Confidence: **HIGH**.

---

## Q4 — Filters server-side (D-06)

Mapping each current client filter to a WHERE clause. Source of current semantics: `use-conversations.ts:200-223` (filter→params) + `conversations.ts:59-126` (server + client-side filters) + `conversation-list.tsx:169-178` (agent + tag client filters).

| UI filter | Current impl | Server WHERE (in RPC) | Notes |
|-----------|--------------|------------------------|-------|
| `all` | `status='active'` | `status = 'active'` | default |
| `unread` | `status='active', is_read=false` | `status='active' AND is_read=false` | covered by `idx_conversations_unread` |
| `mine` | `status='active', assigned_to=currentUserId` | `assigned_to = p_assigned_to` | `currentUserId` resolved client-side today (`use-conversations.ts:177-182`); pass it into the RPC param |
| `unassigned` | `assigned_to IS NULL` | `assigned_to IS NULL` | |
| `unanswered` | client-side `!last_customer_message_at` (`conversations.ts:116`) | `last_customer_message_at IS NULL` | **was client-only because "PostgREST can't compare column vs column"** — but it's actually a NULL test, fully expressible server-side. Move it in. |
| `archived` | `status='archived'` | `status='archived'` | changes visible set |
| `status` | `eq('status', …)` | `status = p_status` | |
| **tag filter** | client-side `tags.some(id)` (`conversation-list.tsx:174`, `conversations.ts:120-126`) | `EXISTS (contact_tags ct2 JOIN … WHERE ct2.contact_id=c.contact_id AND ct2.tag_id = p_tag_id)` | **expressible but adds a join**; tags live on the linked contact (source of truth). Single-tag filter is cheap. |
| **agentFilter** `agent-attended` | client-side `agent_conversational !== false` (`conversation-list.tsx:171`) | `agent_conversational IS DISTINCT FROM false` | tri-state column (NULL/true/false), `idx_conversations_agent` exists. Expressible. |
| **sortMode** | `sortBy` param picks column | `p_sort` param | already server-driven |

**Flags / decisions for the planner:**
- The `unanswered` comment claiming server-side is impossible is **wrong** — it's a NULL test. Fix the comment and move the filter into the RPC. No column-vs-column comparison is involved.
- **Tag + agent filters are currently applied in a SECOND client-side pass in `conversation-list.tsx` (`filteredConversations` useMemo), layered on top of the hook.** With server-side paging, a client-only tag/agent filter would filter only the loaded pages → same invisibility class. Both MUST move into the RPC window (add `p_tag_id uuid` and `p_agent_attended boolean`). This is the one place where the current architecture has filtering split across two files; consolidating it server-side is structural, not a patch.
- Each distinct filter combination is its own keyset window → changing any filter resets to page 1 (null cursor) and clears loaded pages. The hook already re-fetches on filter change (`use-conversations.ts:235-237`); the new version resets page state there.

Confidence: **HIGH**.

---

## Q5 — List state architecture (Claude discretion): keep the manual hook

**Recommendation: KEEP `use-conversations` as a manual hook with added page state. Do NOT migrate the list to React Query `useInfiniteQuery`.**

Rationale (bias to lowest-risk structural change):
- The hook already concentrates four hard, prod-validated behaviors that `useInfiniteQuery` does not give for free and would have to be re-threaded through its cache: (1) the consolidated realtime channel with surgical UPDATE/INSERT/DELETE merges + re-sort (`use-conversations.ts:326-485`); (2) optimistic `markAsReadLocally` (`:520-524`); (3) orders enrichment keyed by contact (`:242-273, 449-469`); (4) the reconnect/visibility re-sync (`:296`). Re-expressing realtime deltas as `queryClient.setQueryData` over an infinite-query's `pages[]` structure is **more** code and a new bug surface (page-boundary dedupe, which page a prepended row lands in), exactly the kind of gratuitous rewrite the mandate warns against.
- `use-messages.ts` IS on React Query — but that's a single-list cache with simple prepend pagination and no cross-row re-sort. The conversation list's defining operation (a single UPDATE re-sorts the whole window to the top) maps poorly onto `useInfiniteQuery`'s append-only page model.
- The manual hook already holds `conversations` in `useState`; adding `pages`/`cursor`/`hasMore`/`isLoadingMore` refs is a localized extension, not a paradigm change. The merge-by-id contract F-4 needs (D-14) is literally the `use-messages` `softRefetch` pattern (`use-messages.ts:167-217`) ported to the list — which is a function inside the SAME hook, trivial to add.

What changes inside the hook for F-1:
- `fetchConversations()` becomes `fetchPage(cursor)` calling the RPC-backed action; first call (cursor=null) replaces state, subsequent appends.
- Add `loadMore()` exposed to the list, triggered by the virtualizer's bottom sentinel.
- Realtime INSERT/UPDATE merge stays, but "not in loaded pages" is handled per Q6.
- Drop Fuse entirely (search is server-side now, Q3) — removes the `useMemo(new Fuse(...))` rebuild-on-every-update cost (`:498`).

Confidence: **HIGH** (judgment grounded in the four wirings read in-file).

---

## Q6 — Realtime + pages (D-07)

D-07: an INSERT/UPDATE for a conversation NOT in loaded pages → fetch that row by id + merge by id at the sort-dictated position; never full refetch.

Current handlers (`use-conversations.ts:346-385`):
- **UPDATE**: `findIndex` by id; if `-1` (not loaded) it `return prev` (drops the event). With paging this is the common case for tail conversations. **New behavior:** when `idx===-1` AND the updated row would sort ABOVE the current window's last-loaded cursor (i.e., it belongs on an already-loaded page), fetch it via `getConversation(id)` and insert by sort. If it sorts BELOW the loaded window, ignore (it lives in an unloaded page; it'll appear when the user scrolls there). Use the F-5 freeze (D-18): while the user is scrolled down, accumulate these into the banner count instead of inserting.
- **INSERT**: already does `getConversation(newRow.id)` then `sortConversations([conv, ...prev])` (`:372-380`). Keep — but gate the visible reorder behind the F-5 freeze: a brand-new conversation while scrolled down increments the banner, not the live list.

**Keyset cursor consistency when prepending.** Prepending a realtime row to page 1 does NOT invalidate the cursor: the cursor is the LAST loaded row's `(sort, id)`, and `loadMore` pages strictly DOWNWARD from it. A new row at the top changes the head of the array but not the tail cursor, so the next `loadMore` is still correct. The only hazard is a DUPLICATE if `loadMore` later re-fetches a row that realtime already prepended — guard with the existing `prev.some(c => c.id === conv.id)` dedupe (`:377`) applied to the merge of every page append, not just INSERT.

**F-4 safety-net (D-14):** mirror `use-messages.softRefetch` — re-fetch ONLY page 1 (cursor=null, limit=50) and merge-by-id into the loaded array (latest wins for flat columns; preserve `contact`/`tags` joins like the UPDATE handler does at `:360-366`). No `isLoading=true`, no array replacement. This reconciles missed deltas without shrinking the loaded history or yanking scroll.

**F-5 freeze interaction (D-18):** while `scrollTop > threshold`, realtime UPDATEs mutate row data IN PLACE (preview/unread/timestamps) but do NOT re-sort; reordered/new rows increment a banner counter. On return-to-top or banner click, apply the real sort once (a single `sortConversations` + optional page-1 softRefetch). This is the standard Gmail/Slack "N new" pattern and eliminates the under-viewport content shift (case 4) by construction. Confidence: **HIGH**.

---

## Q7 — Virtualization (D-03)

**In-repo precedent: `chat-view.tsx:5,97-103` already uses `@tanstack/react-virtual` `useVirtualizer`** for the message list — copy that pattern exactly:
```ts
const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 80,
  measureElement: (el) => el.getBoundingClientRect().height,  // dynamic height
  overscan: 5,
})
```
and the absolute-positioned `transform: translateY(${virtualItem.start}px)` rows under a spacer div sized to `virtualizer.getTotalSize()` (`chat-view.tsx:301-349`), with `ref={virtualizer.measureElement}` + `data-index` on each row for dynamic measurement.

**For the conversation list specifically:**
- **Dynamic height, not fixed.** `ConversationItem` height varies: tags row (0/1/2/+N tags), "Sin asignar" badge, channel icon, preview length. Use `measureElement` (dynamic) with `estimateSize` ≈ 76px (v3 `.conv` grid) / ~88px (v2). Fixed height would clip multi-tag rows. The v3 path renders a CSS-grid `.conv` row (`conversation-item.tsx:79-167`); the v2/legacy path a taller button — `estimateSize` can read the `v2`/`v3` flag.
- **Scroll container.** Today the list scrolls inside a Radix `ScrollArea` (`conversation-list.tsx:686`) in v2/legacy and a plain `.conv-list` div in v3. The virtualizer needs a single, stable scroll element via `getScrollElement`. **Replace `ScrollArea` with a plain `overflow-auto` div** for the virtualized list (Radix ScrollArea's nested viewport div complicates `getScrollElement` and its `[&_[data-radix-scroll-area-viewport]>div]:!block` override hack at `:686` exists precisely to fight that). v3's `.conv-list` is already a plain scrollable div — good.
- **Infinite-scroll trigger.** Watch the last virtual item: when `virtualItems.at(-1)?.index >= rows.length - 1 - overscan` and `hasMore && !isLoadingMore`, call `loadMore()`. This is the documented react-virtual infinite pattern (no IntersectionObserver needed — derive from `getVirtualItems()`).
- **Scroll position preservation (F-5).** With virtualization, appended rows at the BOTTOM (loadMore) don't move the viewport. Prepended rows at the TOP (realtime) WOULD shift content — which is exactly what F-5's freeze prevents by not reordering while scrolled. So the virtualizer handles geometry, F-5 handles policy (D-19 confirms this division). No manual scroll-anchor math needed beyond not-reordering-while-scrolled.
- **`React.memo` on `ConversationItem` (D-03).** It is currently a plain function (`conversation-item.tsx:41`), re-rendered for all rows on any list change. Wrap in `React.memo` with a comparator keyed on `conversation.id`, the mutable display fields (`last_message_preview`, `last_message_at`, `last_customer_message_at`, `is_read`, `unread_count`, `assigned_to`, `agent_conversational`, `tags` ref, `contact?.is_client`), `isSelected`, and `orders` ref. This is what makes virtualization + frequent realtime updates cheap.

Confidence: **HIGH** (direct in-repo precedent).

---

## Q8 — Intl.Segmenter grapheme util (D-10)

**Where:** new file `src/lib/utils/initials.ts` (sibling of existing `src/lib/utils/phone.ts`; note `src/lib/utils.ts` holds only `cn` — keep that untouched). Import as `@/lib/utils/initials`.

**Runtime availability (verified):** `Intl.Segmenter` is supported in Node 16+ (Vercel runs Node 20/22 — SSR safe) and all modern browsers (Chrome 87+, Safari 14.1+, Firefox 125+). For the long-tail/older-Firefox case use an `Array.from` fallback (which is code-point-correct: it splits on UTF-16 code points, so it never yields a lone surrogate — it just won't merge ZWJ/combining sequences into one grapheme, which is acceptable for a single initial).

**Implementation:**
```ts
// src/lib/utils/initials.ts
// Grapheme-safe initials. NEVER index UTF-16 (n[0]/charAt(0)) over names — a lone
// surrogate (emoji/astral first char) streamed in SSR becomes U+FFFD on the client →
// React #418 hydration mismatch (whatsapp-inbox-reliability F-2).

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
  // Fallback: code-point split (never a lone surrogate, unlike s[0]).
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
Edge cases covered: empty/null/whitespace → `''` (each call site keeps its own visual fallback for an empty avatar — D-11 preserves per-site fallback semantics); combining marks & ZWJ emoji (👨‍👩‍👧) → one grapheme via Segmenter; astral first char (`😎`, `𝙴`) → full grapheme, never a half-surrogate. `.toUpperCase()` on an emoji is a no-op (safe).

**Module-scope `segmenter` singleton** avoids re-allocating per render (constructing `Intl.Segmenter` is non-trivial).

**Migrate the 9 D-11 call sites** to import `getInitials`/`firstGrapheme`, deleting each local copy. The #418-active one is `conversation-item.tsx:18`; `chat-header.tsx:496` uses `charAt(0)`. Keep each site's existing empty-name visual fallback. Gate (D-12): `grep -rn "charAt(0)\|\[0\]" src` over avatar components returns 0; robot `probe418` → 0 hydration pageerrors in 3 loads.

Confidence: **HIGH**.

---

## Q9 — getOrdersForContacts scoping + effect cancellation (D-09 / D-16 / D-17)

**Function read:** `src/app/actions/whatsapp.ts:192-280`. Takes `contactIds[]`, batches by 200, queries `orders` with stage/pipeline/tag joins, returns `Map<contactId, OrderSummary[]>`. Today it's called with ~1000 ids on mount AND re-run in full on every workspace `orders` INSERT/UPDATE (`use-conversations.ts:457-468`) — for avatar emojis only.

**D-09 scoping:** call it with ONLY the contact ids of LOADED pages (≈50–150). The hook already derives `contactIdsRef` from `conversations` (`:156-161`); after paging, `conversations` holds only loaded rows, so passing `contactIdsRef.current` is automatically page-scoped. On `loadMore`, fetch orders for the NEW page's contact ids only and MERGE into `ordersByContact` (don't refetch the whole map).

**D-16 surgical orders realtime:** the current handler refetches ALL loaded contacts on any `orders` event (`:457-468`). Replace with a targeted update: the payload carries the changed order's `contact_id` (and `id`). On `orders` INSERT/UPDATE, refetch orders for THAT ONE `contact_id` only (a single-id `getOrdersForContacts([contactId])` or a lighter `getOrdersForContact`), then `setOrdersByContact(prev => new Map(prev).set(contactId, next))`. If the contact isn't in the loaded window, ignore. This kills the 4.5s storm.

**D-17 effect cancellation (zombie fetches):** server actions are plain async RPCs — **`AbortController` does NOT cancel a server action's in-flight network request** (Next wraps it; there's no fetch signal exposed). The correct pattern is a **mounted-ref guard / stale-response token**, not abort:
```ts
const mountedRef = useRef(true)
useEffect(() => () => { mountedRef.current = false }, [])
// after every await in an effect/handler before setState:
const orders = await getOrdersForContacts(ids)
if (!mountedRef.current) return        // dropped on unmount → no setState on /tareas
setOrdersByContact(orders)
```
For "latest wins" within a mounted component (rapid filter switches), add a per-call token:
```ts
const reqIdRef = useRef(0)
const myId = ++reqIdRef.current
const orders = await getOrdersForContacts(ids)
if (!mountedRef.current || myId !== reqIdRef.current) return
```
Apply the mounted guard to EVERY `await … then setState` in the inbox hooks (orders load `:249-272`, refreshOrders `:528-539`, realtime async handlers, the page-1 softRefetch). This stops the zombie `getOrdersForContacts` that currently lands on `/tareas` and `/crm` (the 11s SPA contamination). The fetch still RUNS to completion server-side (can't cancel), but its result is discarded and never triggers a re-render in the new module — which is what the user actually perceives. Combined with D-09 scoping (≈50 ids not 1000), the zombie fetch is now also ~10× cheaper.

Confidence: **HIGH** (AbortController-vs-server-action limitation is a known Next constraint; mounted-ref is the established workaround).

---

## Q10 — Pitfalls (SSR hydration, count, React 19, must-not-change)

### SSR first page + client hydration (D-02)
`page.tsx:34-35` SSRs `getConversations({status:'active', sortBy:'last_customer_message'})` (today 1000 rows) and passes as `initialConversations` to the hook (`use-conversations.ts:136` seeds `useState`). **F-1 changes this to the first 50-row page.** Keep the seed-from-initial pattern (it's the `initialData` equivalent for a manual hook) so the SSR page renders the first 50 immediately and the client does NOT re-fetch page 1 on mount — **this also fixes H-2 (the mount double-fetch at `:235-237`)**: gate the mount fetch on `if (initialConversations.length) skip page-1 refetch`. The hook must treat `initialConversations` as page 1 already loaded (set cursor from its last row).

**#418 root (H-3) is Q8, not here** — but note the SSR/client text must match: with the grapheme fix, SSR and client both emit the same grapheme, so the avatar node stops diverging. `RelativeTime` is already client-only suppressed (DIAGNOSIS confirms topbar + first 60 items identical modulo RelativeTime) — do NOT change that.

### Count for the topbar (D-04)
Use a SEPARATE `count` query, not `data.length`. `getConversationStats` (`conversations.ts:471-522`) ALREADY does exactly this with `{ count: 'exact', head: true }` per filter — reuse/extend it. `count: 'exact'` is correct and cheap at 2559 rows (no need for `'estimated'`/`'planned'`, which are for million-row tables and can be wildly off right after writes). The v3 topbar currently derives `openCount`/`unreadCount` from `initialConversations.length` (`inbox-layout.tsx:184-185`) — that's now only the first 50 and would UNDERCOUNT. Wire it to the `count` query instead. This is a real correctness bug the planner must fix as part of F-1.

### React 19 memo gotchas
- `React.memo` comparator (Q7) must compare the `tags` and `orders` array REFERENCES plus the scalar fields; the hook already produces new array refs on tag/order change (`:411`, `setOrdersByContact(new Map…)`) so reference equality is a valid change signal. Don't deep-compare.
- React 19's automatic batching means multiple `setConversations` in one realtime handler batch — fine. Do NOT rely on synchronous state reads after setState; the hook already uses refs (`conversationsRef`, `sortModeRef`) for that.
- Don't introduce `useMemo` over the whole conversation array for filtering (the old Fuse pattern) — server-side filtering removes that need; an accidental re-add reintroduces the rebuild-on-every-update cost.

### Prod behaviors that MUST NOT change (Somnio, real customers)
| Behavior | Where | Must stay |
|----------|-------|-----------|
| Filter semantics (unread/mine/unassigned/unanswered/archived/tag/agent) | Q4 mapping | identical visible results, just server-side |
| Sort toggle (last_customer_message ↔ last_message) | `use-conversations.ts:142`, `:509` | same default (`last_customer_message`), same toggle |
| Unread badge counts + optimistic markAsRead | `:520`, `conversation-item.tsx:146,283` | optimistic local + realtime reconcile unchanged |
| Realtime message arrival into open chat | `use-messages.ts` | UNTOUCHED by this standalone (separate hook) |
| `markAsRead` still resets unread server-side | `conversations.ts:282-305` | only the `revalidatePath` line is removed (D-13); the UPDATE stays |
| `archive`/`unarchive` keep `revalidatePath` | `conversations.ts:325,351` | they change the visible set — KEEP revalidate (D-13) |
| `[`/`]`/`/` keyboard nav over the visible list | `conversation-list.tsx:185-222` | now navigates loaded pages; semantics preserved |
| New-conversation flow `handleConversationCreated` | `conversation-list.tsx:161-166` | currently `await refresh()` then select — with paging, refresh = re-fetch page 1; the new conv (newest) lands on page 1 so it's visible. F-7 also fixes the null-object case. |
| Channel icons (FB/IG), client badge, agent bot overlay | `conversation-item.tsx` | unchanged |

Confidence: **HIGH**.

---

## Validation Architecture

Test framework: **Vitest** (in-repo, e.g. `src/lib/agents/**/__tests__`, `whatsapp/components/__tests__`). Robot harness: **`scripts/_robot-inbox-nav.ts`** (Playwright, phases `probe418 / case1 / case3 / case4 / case4b / flow / sidebar / ssrdiff`), baselines in `.planning/standalone/whatsapp-inbox-reliability/robot/`. Robot is run via tsx (gotcha D-25: inline functions inside `page.evaluate`).

### Per-wave gate map (D-23 + D-12/D-15)
| Wave | Fix | Automated gate | Robot phase | Pass criterion |
|------|-----|----------------|-------------|----------------|
| W1 | F-2 grapheme | `vitest` unit on `getInitials` (emoji `😎`, astral `𝙴`, ZWJ 👨‍👩‍👧, empty, `null`, whitespace, 2-word) + `grep -rn "charAt(0)\|n\[0\]" src/**/avatar*,conversation-item,chat-header` = 0 | `probe418` ×3 | 0 hydration pageerrors in 3 loads (D-12) |
| W1 | F-3 revalidatePath | grep: `markAsRead` body has no `revalidatePath`; `archive/unarchive` still do | `flow` | click→bubbles waterfall drops (no page-1 RSC re-render per click) |
| W1 | F-6 error state | `vitest` on chat-view 3-state branch (loading/error+retry/empty) — mock `useMessages` `isError` | `case3` | a forced message-fetch failure renders error+Reintentar, not "chat vacío" |
| W2 | F-1 keyset+virtual | `vitest` on cursor encode/decode + NULL-band predicate (unit on the action: page 2 of a NULL-`lcm` tail returns the tail, not []) ; DB sanity `SELECT count(*)` reachable across pages = 2559 | `case1`, `ssrdiff`, `sidebar` | all 2559 reachable by paging; SSR DOM `[role=listitem]` ≈50 not 1000; `/whatsapp` HTML KB + node count drop sharply vs baseline |
| W3 | F-4 no-storm | re-run `case4`-A: N no-op updates → **0 full-refetches >2s** (D-15) | `case4` | coalesced single timer; page-1 softRefetch merge only |
| W3 | F-5 scroll freeze | re-run `case4b`: under-viewport bump → **0 content shift** under the sentinel; banner count increments | `case4b` | "José Elver" stays put; banner shows N |
| W4 | F-7 derived selection | `vitest` on selection derivation (id set, object absent → fetch-by-id effect with correct deps) | `flow`, full re-run | header/content never diverge; `handleConversationCreated` no longer leaves null object |
| W4 | regression | full robot re-run vs baselines | all phases | no regression on case1/case3/case4/flow/sidebar |

### Wave 0 gaps (test infra to create)
- `src/lib/utils/__tests__/initials.test.ts` — covers F-2 (Wave 0 of W1).
- Action-level unit for the keyset cursor (mock supabase RPC) — covers F-1 NULL-band.
- Robot baselines are already captured (`robot/`) — re-capture after each wave to update the regression baseline (D-23).

---

## Pitfalls / Risks table

| # | Risk | Likelihood | Mitigation |
|---|------|-----------|------------|
| P1 | `.or()` keyset drops NULL-`last_customer_message_at` rows (the default sort) → tail invisible again | HIGH if `.or()` used | Use the RPC (Q1) with explicit NULL-band; NEVER the chained `.or()` for `last_customer_message_at` |
| P2 | Index `NULLS LAST` omitted → Postgres can't satisfy ORDER BY from index, falls back to sort node | MED | Index DDL specifies `DESC NULLS LAST` matching the query (Q2) |
| P3 | `CREATE INDEX` without `CONCURRENTLY` locks the hot conversations table | MED | `CONCURRENTLY` + no transaction wrapper; apply in prod first (Regla 5) |
| P4 | Tag/agent filters left client-side → only filter loaded pages (same invisibility class) | HIGH | Move BOTH into the RPC window (Q4); they currently live in `conversation-list.tsx` |
| P5 | Topbar count derived from `initialConversations.length` (now 50) → undercount | HIGH | Separate `count:'exact'` query (Q10, reuse `getConversationStats`) |
| P6 | Mount double-fetch persists after paging (re-fetches page 1) | MED | Seed hook from `initialConversations` as page 1; skip mount refetch (Q10) |
| P7 | Zombie `getOrdersForContacts` setState after unmount on /tareas /crm | HIGH (today) | Mounted-ref guard before every setState; AbortController does NOT work for server actions (Q9) |
| P8 | Virtualizer `getScrollElement` fights Radix `ScrollArea` nested viewport | MED | Use a plain `overflow-auto` div for the virtualized list (Q7) |
| P9 | Fixed-height virtualization clips multi-tag / badge rows | MED | Dynamic `measureElement` (Q7) |
| P10 | Realtime prepend creates duplicate vs later `loadMore` | LOW | id-dedupe on every page merge (Q6) |
| P11 | Removing `revalidatePath` from a mutation that DOES change visible set | LOW | Only `markAsRead` loses it; archive/unarchive keep it (D-13, Q10) |
| P12 | Robot named-fn-in-`page.evaluate` breaks under tsx (`__name is not defined`) | known | inline all evaluate fns (D-25) |
| P13 | RPC as SECURITY DEFINER would bypass workspace RLS | LOW | SECURITY INVOKER (default); read stays RLS-isolated (Q1) |

---

## Open Questions

**None blocking.** Two minor planner-discretion items already delegated by CONTEXT.md "Claude's Discretion":
1. RPC return shape A (base rows + TS re-join) vs B (JSON-in-SQL). Research recommends **A** (Q1); planner locks.
2. F-5 freeze threshold value and banner wording — explicitly Claude's discretion per D-18/D-60. Suggest threshold ≈ 1 viewport height (`clientHeight`), wording "N conversaciones con actividad — volver arriba".

---

## Sources

### Primary (HIGH confidence) — codebase
- `src/app/actions/conversations.ts` (getConversations:28, markAsRead:282, getConversationStats:471), `src/hooks/use-conversations.ts`, `src/hooks/use-messages.ts` (softRefetch:167), `src/app/(dashboard)/whatsapp/page.tsx`, `components/{conversation-item,conversation-list,chat-view,inbox-layout}.tsx`, `src/app/actions/whatsapp.ts:192`, `supabase/migrations/20260130000002_whatsapp_conversations.sql`, `20260501100400_*_rpc.sql`, `scripts/_robot-inbox-nav.ts`.

### Secondary (verified) — PostgREST/Supabase
- [Supabase JS select / order / filter / or docs](https://supabase.com/docs/reference/javascript/select) — `.or()` raw PostgREST syntax, `nullsFirst`.
- [Multi-column cursor pagination · Discussion #21330](https://github.com/orgs/supabase/discussions/21330) — `.or('and(col.eq.V,id.lt.ID),col.lt.V')` keyset form; **NULL handling explicitly unanswered** (basis for RPC recommendation).
- [Cursor-based pagination · Discussion #3938](https://github.com/orgs/supabase/discussions/3938), [SupaExplorer keyset best-practice](https://supaexplorer.com/best-practices/supabase-postgres/data-pagination/) — keyset > OFFSET under continuous reorder.

### Training knowledge (standard, not session-verified)
- `Intl.Segmenter` Node 16+/modern-browser support; `React.memo`/React 19 batching; AbortController not applicable to Next server actions.

## Metadata
- Confidence: stack HIGH; keyset/NULL HIGH (verified); virtualization HIGH (in-repo precedent); orders/cancellation HIGH.
- Valid until: ~30 days (stable stack).
