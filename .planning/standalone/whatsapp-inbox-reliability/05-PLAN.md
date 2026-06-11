---
phase: standalone-whatsapp-inbox-reliability
plan: 05
type: execute
wave: 2
depends_on: [04]
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, pagination, virtualization, keyset, orders, count]
requirements: [F-1, D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-09]
files_modified:
  - src/app/actions/conversations.ts
  - src/hooks/use-conversations.ts
  - src/app/(dashboard)/whatsapp/page.tsx
  - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
  - src/app/(dashboard)/whatsapp/components/conversation-item.tsx
  - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
  - src/app/actions/__tests__/conversations-page.test.ts
autonomous: false

must_haves:
  truths:
    - "All 2559 active Somnio conversations are reachable by scrolling/searching (not just the first 1000)"
    - "/whatsapp SSR renders ~50 conversation items, not 1000 (HTML payload drops from ~1.8MB to <300KB)"
    - "The topbar count shows the true total via a count:'exact' query, not the loaded array length"
    - "Search and every filter (unread/mine/unassigned/unanswered/tag/agent) operate server-side over ALL conversations"
    - "getOrdersForContacts is called only with loaded-page contact ids (~50-150), not 1000"
  artifacts:
    - path: "src/app/actions/conversations.ts"
      provides: "getConversationsPage (RPC + re-join + cursor) and count query"
      contains: "getConversationsPage"
    - path: "src/hooks/use-conversations.ts"
      provides: "page state, loadMore, SSR-seed (skip mount double-fetch), page-scoped orders"
      contains: "loadMore"
    - path: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      provides: "virtualized list + infinite-scroll trigger"
      contains: "useVirtualizer"
  key_links:
    - from: "src/app/actions/conversations.ts (getConversationsPage)"
      to: "get_conversations_page RPC"
      via: "supabase.rpc(...) then .in('id', pageIds) re-join"
      pattern: "rpc\\('get_conversations_page'"
    - from: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      to: "use-conversations loadMore"
      via: "virtualizer last-item sentinel"
      pattern: "loadMore"
---

<objective>
The surgery (F-1). Replace the unbounded `getConversations` (silently capped at 1000 rows by PostgREST → 1559 Somnio conversations INVISIBLE, ~4.3s fetches, 1.8MB RSC payload, 1000-item SSR hydration) with keyset pagination over the `get_conversations_page` RPC (plan 04), a virtualized infinite-scroll list, a separate `count:'exact'` topbar counter, server-side search + filters, and page-scoped orders enrichment. This also fixes the mount double-fetch (H-2) by seeding the hook from the SSR first page.

Purpose: Eliminate the root cause (H-1) that every other symptom descends from. Make the full conversation history reachable (correctness) and the page cheap to render (perf). Honors D-01..D-09.
Output: paginated action + count, paginated hook, virtualized list with React.memo items, SSR first-page-only page.tsx, server-side filters/search, page-scoped orders.

Depends on plan 04 being APPLIED IN PROD (Regla 5). This plan ships application code → its push is gated on the migration being live.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-inbox-reliability/CONTEXT.md
@.planning/standalone/whatsapp-inbox-reliability/RESEARCH.md
@.planning/standalone/whatsapp-inbox-reliability/PATTERNS.md
@.planning/standalone/whatsapp-inbox-reliability/DIAGNOSIS.md
@CLAUDE.md
@src/app/actions/conversations.ts
@src/hooks/use-conversations.ts

<interfaces>
<!-- The RPC (plan 04, already in prod) and the action shape plan 05 produces -->
RPC: get_conversations_page(p_workspace_id, p_sort, p_status, p_is_read, p_assigned_to,
     p_unassigned, p_unanswered, p_search, p_tag_id, p_agent_attended,
     p_cursor_sort, p_cursor_is_null, p_cursor_id, p_limit) RETURNS SETOF conversations

New action:
getConversationsPage(filters, cursor: string|null): Promise<{
  conversations: ConversationWithDetails[]
  hasMore: boolean
  nextCursor: string | null   // opaque base64 of { sort: ISO|null, sortIsNull: boolean, id: uuid }
}>

Virtualization precedent (copy exactly): src/app/(dashboard)/whatsapp/components/chat-view.tsx useVirtualizer (lines 97-103, rows 300-348).
softRefetch/merge precedent: src/hooks/use-messages.ts:167-222.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: getConversationsPage action (RPC + re-join + cursor) + count + unit test</name>
  <files>src/app/actions/conversations.ts, src/app/actions/__tests__/conversations-page.test.ts</files>
  <read_first>
    - src/app/actions/conversations.ts (getConversations lines 28-126 for the nested-join select string and filter mapping; getConversationStats lines 471-522 for the count:'exact' pattern; auth guard lines 34-41)
    - RESEARCH.md Q1 approach A (lines 156-162), Q3 (search), Q4 (filter→param mapping table), Q10 count (lines 390-391)
    - PATTERNS.md section "conversations.ts — new getConversationsPage" (lines 128-219) — RPC call, re-join, cursor encoding, count pattern (verbatim)
    - src/app/actions/metricas-conversaciones.ts (.rpc() call analog, lines 120-131)
  </read_first>
  <behavior>
    - getConversationsPage(default filters, null cursor) returns up to 50 rows + hasMore=(rows.length===50) + a non-null nextCursor when full.
    - Paging the NULL-`last_customer_message_at` tail (outbound-only convs) returns the tail rows on later pages, NOT [] (the P1 bug the RPC fixes).
    - nextCursor round-trips: decode(encode({sort,sortIsNull,id})) === original.
    - A page whose last row has `last_customer_message_at === null` produces a cursor with `sortIsNull: true`.
    - Empty result → { conversations: [], hasMore: false, nextCursor: null }.
  </behavior>
  <action>
Add `getConversationsPage(filters, cursor)` to `src/app/actions/conversations.ts` (keep the old `getConversations` for any other callers; the inbox switches to the new one). Implementation (PATTERNS lines 153-201):
1. Auth: `const auth = await getRequestAuth(); if (!auth) return { conversations: [], hasMore: false, nextCursor: null }; const { workspaceId } = auth;` then `const supabase = await createClient()` (RLS client, Regla 3 reads).
2. Decode the incoming opaque cursor (base64 JSON `{ sort, sortIsNull, id }`) → `p_cursor_sort`, `p_cursor_is_null`, `p_cursor_id`. Null cursor → all three null/false (page 1).
3. Map filters → RPC params and call `supabase.rpc('get_conversations_page', {...})` with all 14 params (PATTERNS lines 155-168, plus `p_tag_id` and `p_agent_attended` from the filter set). On error: console.error + return empty page.
4. Re-hydrate joins (approach A): take `pageIds = data.map(r => r.id)`; if empty return empty page; else `supabase.from('conversations').select(<existing nested-join string from conversations.ts:51-54>).in('id', pageIds)`. Re-sort the joined rows to match the RPC's `pageIds` order (the RPC order is authoritative — `.in()` does not preserve order).
5. Build `ConversationWithDetails[]` reusing the EXISTING transform in `getConversations` (conversations.ts ~:88-102) — do not reimplement it; extract/share it so the shape is byte-identical.
6. Encode `nextCursor` from the LAST row (PATTERNS lines 191-201): `{ sort: lastRow[sortColumn] ?? null, sortIsNull: lastRow[sortColumn] === null, id: lastRow.id }` base64. `hasMore = rows.length === limit (50)`. If 0 rows → nextCursor null.
7. Add the perf-warn wrapper (PATTERNS lines 772-781): warn if elapsed > 2000ms tagged `[perf] getConversationsPage`.

Also add (or extend) a count helper for the topbar: reuse `getConversationStats`' `{ count: 'exact', head: true }` pattern to return the true total + unread counts for the active filter (D-04). If `getConversationStats` already returns these, just ensure page.tsx can consume them (Task 3).

Write `src/app/actions/__tests__/conversations-page.test.ts` covering the cursor encode/decode round-trip and the NULL-band behavior by mocking `supabase.rpc` (assert the params passed for page 2 of a NULL-`lcm` tail include `p_cursor_is_null: true`, and that the action returns the mocked tail rows, not []). Use vitest mocking consistent with existing action tests in the repo.

SECURITY: never interpolate `filters.search` into any string sent as SQL — it goes ONLY as the typed `p_search` RPC param (the RPC does the ILIKE on a bound value). workspaceId comes from `getRequestAuth`, NEVER from the client filters object.
  </action>
  <verify>
    <automated>npx vitest run src/app/actions/__tests__/conversations-page.test.ts; npx tsc --noEmit 2>&1 | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "rpc('get_conversations_page'" src/app/actions/conversations.ts` returns >= 1.
    - `grep -c "count: 'exact'" src/app/actions/conversations.ts` returns >= 1 (topbar count source).
    - cursor encode/decode + NULL-band unit tests pass.
    - The action passes `workspaceId` from `getRequestAuth` to `p_workspace_id` (not from filters).
    - `npx tsc --noEmit` → 0 errors.
  </acceptance_criteria>
  <done>getConversationsPage returns a NULL-correct keyset page with opaque cursor + hasMore; count:'exact' available for the topbar; unit tests green.</done>
</task>

<task type="auto">
  <name>Task 2: Paginate use-conversations — page state, loadMore, SSR seed, page-scoped orders, server-side filters/search</name>
  <files>src/hooks/use-conversations.ts</files>
  <read_first>
    - src/hooks/use-conversations.ts (read in full: mount fetch :235-237, sort :368, orders handler :449-469, Fuse :498-512, initial seed :136, currentUserId resolve :177-182, filter→params :200-223, contactIdsRef :156-161)
    - RESEARCH.md Q5 (keep manual hook + what changes), Q6 (realtime + pages), Q9 (orders scoping + mounted-ref), Q10 (SSR seed kills mount double-fetch)
    - PATTERNS.md section "use-conversations.ts" (lines 273-433 — page-state additions, loadMore, mounted-ref, surgical orders, server-side filter reset)
    - src/hooks/use-messages.ts:167-222 (softRefetch merge-by-id — referenced by F-4 in plan 06 but the merge contract is established here)
  </read_first>
  <action>
Extend `use-conversations.ts` (KEEP the manual hook — do NOT migrate to useInfiniteQuery, RESEARCH Q5). Changes:
1. Replace `fetchConversations()` calls with `fetchPage(cursor)` calling `getConversationsPage`. cursor=null replaces state (page 1); subsequent appends + dedupe by id (PATTERNS lines 388-413 `loadMore`).
2. Add page state: `const [hasMore, setHasMore] = useState(true); const [isLoadingMore, setIsLoadingMore] = useState(false); const cursorRef = useRef<string|null>(null)`. Expose `loadMore`, `hasMore`, `isLoadingMore`.
3. SSR seed (kills H-2 mount double-fetch, RESEARCH Q10): treat `initialConversations` as page 1 already loaded — set `cursorRef` from its last row and SKIP the mount fetch when `initialConversations.length > 0`. The page.tsx will pass `initialCursor`/`initialHasMore` (Task 3) — consume them.
4. Move search + filters server-side: pass `filters.search` (debounced ~250-300ms client-side before issuing) + tag + agent + unanswered into `getConversationsPage` params. DELETE the Fuse useMemo (:498-512) entirely (search is server-side now). Changing ANY filter resets to page 1 (null cursor) + clears loaded pages (the hook already re-fetches on filter change at :235-237 — reset cursor/hasMore there).
5. Page-scoped orders (D-09): on `loadMore`, fetch `getOrdersForContacts(newPageContactIds)` only and MERGE into `ordersByContact` (don't refetch the whole map). PATTERNS lines 402-409.
6. Mounted-ref guard (D-17, RESEARCH Q9 — AbortController does NOT work for server actions): add `const mountedRef = useRef(true); useEffect(() => () => { mountedRef.current = false }, [])` and gate EVERY `setState` after an `await` with `if (!mountedRef.current) return`. Apply to the orders load, page fetch, and any realtime async handler. (This stops the zombie `getOrdersForContacts` setState landing on /tareas /crm.)
7. Realtime INSERT/UPDATE for unloaded pages (D-07, RESEARCH Q6): when an UPDATE's id is not in loaded pages, if it would sort ABOVE the loaded window's tail cursor, fetch via `getConversation(id)` + insert by sort; if below, ignore. Keep the existing INSERT path's `getConversation` + dedupe (`prev.some(c => c.id===conv.id)`). NOTE: the F-5 freeze gating (D-18) is added in plan 06 — here, just make the merge-by-id + dedupe correct; do not yet add the banner.

Do NOT change the realtime token-before-subscribe pattern (PATTERNS lines 426-433) or markAsReadLocally. Do NOT add the F-4 coalescing timer or F-5 banner — those are plan 06.
  </action>
  <verify>
    <automated>grep -n "loadMore\|cursorRef\|mountedRef\|getConversationsPage" src/hooks/use-conversations.ts | head; npx tsc --noEmit 2>&1 | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "getConversationsPage" src/hooks/use-conversations.ts` returns >= 1; `grep -c "new Fuse\|fuse" src/hooks/use-conversations.ts` returns 0 (Fuse removed).
    - `loadMore`, `hasMore`, `isLoadingMore` are exposed from the hook return.
    - `mountedRef` guard present: `grep -c "mountedRef.current" src/hooks/use-conversations.ts` returns >= 3 (before setStates after awaits).
    - The mount fetch is skipped when `initialConversations.length > 0` (SSR seed) — verify by reading the mount effect.
    - `npx tsc --noEmit` → 0 errors.
  </acceptance_criteria>
  <done>The hook pages via keyset, seeds from SSR (no mount double-fetch), filters/search server-side (Fuse gone), scopes orders to loaded pages, and guards setStates with a mounted-ref.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Virtualize the list + memo items + SSR first-page page.tsx + topbar count; robot gate + push (Wave 2)</name>
  <what-built>Virtualized infinite-scroll conversation list with React.memo'd items, page.tsx SSR'ing only the first 50-row page + true count, and inbox-layout wiring loadMore/cursor through. Completes F-1 and ships Wave 2.</what-built>
  <how-to-verify>
First implement the remaining UI wiring (the executor does this before the gate):

A. `conversation-list.tsx` — virtualize per `chat-view.tsx` precedent (PATTERNS lines 465-553): `useVirtualizer({ count, getScrollElement: () => parentRef.current, estimateSize: () => 76, measureElement: el => el.getBoundingClientRect().height, overscan: 5 })`; replace the Radix `ScrollArea` with a plain `overflow-auto` div for the virtualized list (RESEARCH Q7/P8 — v3 `.conv-list` is already plain); absolute-positioned rows under a `getTotalSize()` spacer with `ref={virtualizer.measureElement}` + `data-index`. Infinite trigger derived from `getVirtualItems().at(-1).index >= conversations.length - 1 - overscan && hasMore && !isLoadingMore → loadMore()` (no IntersectionObserver). MOVE the tag + agent filters out of the `filteredConversations` client useMemo (RESEARCH Q4/P4 — they now live in the RPC); the list renders the hook's already-filtered rows.
B. `conversation-item.tsx` — wrap export in `React.memo` with the comparator from PATTERNS lines 588-604 (id + mutable display fields + isSelected + orders/tags ref equality). (The F-2 initials import from plan 01 stays.)
C. `page.tsx` — replace `getConversations({status,sortBy})` with `getConversationsPage({status:'active', sortBy:'last_customer_message_at'}, null)`; add `getConversationStats()` (or the count helper) to the `Promise.all`; pass `initialConversations` (50), `initialCursor`, `initialHasMore`, and the true `count`/`unread` to `InboxLayout` (PATTERNS lines 437-461). Do NOT derive the topbar count from `initialConversations.length` anymore (now 50 — would undercount; RESEARCH P5).
D. `inbox-layout.tsx` — thread `initialCursor`/`initialHasMore`/`count` props into the hook + topbar; topbar `openCount`/`unreadCount` read the count query, not `initialConversations.length`.

Then run the Wave 2 robot gates against dev:3020 (Somnio is LIVE — mandatory pre-push):
1. `ROBOT_APP_URL=http://localhost:3020 npx tsx scripts/_robot-inbox-nav.ts case1` → list loads first page; nombres correct vs ground truth.
2. `npx tsx scripts/_robot-inbox-nav.ts ssrdiff` → SSR DOM `[role=listitem]` count ≈ 50 (not 1000).
3. `npx tsx scripts/_robot-inbox-nav.ts sidebar` → `/whatsapp` HTML KB drops from ~1.8MB toward <300KB and DOM node count drops sharply vs the `robot/*-sidebar.json` baseline.
4. Reachability sanity (all 2559 reachable): scroll/paginate or query — confirm the keyset tail (NULL `last_customer_message_at` convs) is reachable, count:'exact' topbar shows the true total.
5. `npx vitest run src/app/actions/__tests__/conversations-page.test.ts` green.
6. `npx tsc --noEmit` → 0 errors.
Gotcha (D-25): keep robot `page.evaluate` functions inlined.

REGLA 5 GATE: confirm plan 04's migration is APPLIED IN PROD (pg_proc shows get_conversations_page, both indexes exist) BEFORE pushing — pushed code calls the RPC. If not applied, STOP and return to plan 04 Task 2.

After gates pass AND migration confirmed live, commit + push (Regla 1):
```bash
git add src/app/actions/conversations.ts src/hooks/use-conversations.ts \
  src/app/\(dashboard\)/whatsapp/page.tsx \
  src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx \
  src/app/\(dashboard\)/whatsapp/components/conversation-item.tsx \
  src/app/\(dashboard\)/whatsapp/components/inbox-layout.tsx \
  src/app/actions/__tests__/conversations-page.test.ts
git commit -m "feat(whatsapp-inbox-reliability W2): F-1 paginacion keyset + virtualizacion + busqueda/filtros server-side + count exact + orders por pagina"
git push origin main
```
  </how-to-verify>
  <resume-signal>Type "approved" once: migration confirmed live in prod, all Wave 2 robot gates pass (SSR ≈50 items, all 2559 reachable, HTML payload dropped), tsc clean, and the push to origin/main succeeded. Otherwise describe the failure.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| client filters/search/cursor → action → RPC | search/tag/cursor cross from browser into the server action then the RPC |
| SSR payload → client hydration | first-page rows are serialized into the RSC payload |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wir-09 | Tampering (SQLi) | getConversationsPage params | mitigate | filters.search/tag/cursor pass ONLY as typed RPC params; no string interpolation in any SQL; RPC does the ILIKE on a bound value (plan 04 T-wir-06) |
| T-wir-10 | Information disclosure (cross-workspace) | getConversationsPage | mitigate | workspaceId from getRequestAuth (never client); RLS via SECURITY INVOKER RPC; `.in('id', pageIds)` re-join is workspace-RLS-gated by createClient() |
| T-wir-11 | DoS (payload size) | SSR page | mitigate | SSR limited to 50 rows (D-02); virtualization caps DOM nodes; count is a head:true query (no row transfer) |
</threat_model>

<verification>
- robot `case1`/`ssrdiff`/`sidebar`: first page loads, SSR ≈50 items, HTML KB + DOM nodes drop sharply vs baseline.
- All 2559 active conversations reachable; topbar count = true total (count:'exact').
- Filter semantics unchanged (RESEARCH Q10 must-not-change table) — visible results identical, just server-side.
- `npx vitest run src/app/actions/__tests__/conversations-page.test.ts` green; `npx tsc --noEmit` → 0.
- Migration live in prod before push (Regla 5).
</verification>

<success_criteria>
- The 1559 previously-invisible conversations are reachable (correctness).
- /whatsapp SSR payload and DOM node count drop ~6-15× toward parity with other modules.
- Search + all filters operate over the full history server-side; orders scoped to loaded pages.
- Wave 2 pushed as one revert-able unit, gated on the prod migration.
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-inbox-reliability/05-SUMMARY.md`
</output>
