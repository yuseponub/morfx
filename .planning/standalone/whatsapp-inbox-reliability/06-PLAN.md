---
phase: standalone-whatsapp-inbox-reliability
plan: 06
type: execute
wave: 3
depends_on: [05]
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, reconciliation, softRefetch, coalesce, scroll-freeze, banner]
requirements: [F-4, F-5, D-14, D-15, D-16, D-18, D-19]
files_modified:
  - src/hooks/use-conversations.ts
  - src/app/(dashboard)/whatsapp/components/conversation-list.tsx
autonomous: false

must_haves:
  truths:
    - "N no-op conversation UPDATEs trigger 0 full-refetches >2s (coalesced single timer; page-1 softRefetch merge only)"
    - "While the user is scrolled down (scrollTop > 1 viewport), incoming reorders do NOT shift content under the viewport — they accumulate in a 'N conversaciones con actividad' banner"
    - "An orders event updates only the affected contact's orders, not a full getOrdersForContacts refetch"
  artifacts:
    - path: "src/hooks/use-conversations.ts"
      provides: "softRefetchPage1 merge-by-id, coalescing safety timer, surgical orders handler"
      contains: "softRefetchPage1"
    - path: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      provides: "scroll-freeze policy + activity banner"
      contains: "conversaciones con actividad"
  key_links:
    - from: "src/hooks/use-conversations.ts (realtime handlers)"
      to: "softRefetchPage1"
      via: "coalesced single timer (no re-arm)"
      pattern: "softRefetchPage1"
    - from: "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"
      to: "scrollTopRef freeze"
      via: "scrollTop > clientHeight gates the re-sort, banner accumulates"
      pattern: "scrollTopRef"
---

<objective>
Wave 3 builds on F-1. Two fixes that share `use-conversations.ts` + `conversation-list.tsx`:
- F-4 (DIAGNOSIS H-4 "autorefresh"): replace the global 10s full-refetch storm with a page-1 softRefetch merge-by-id (mirror `use-messages.softRefetch`) + a COALESCING timer that fires once and does not re-arm while live (today every event re-arms → with continuous Somnio traffic it runs ~always). Plus the surgical orders realtime handler (D-16) if not fully landed in plan 05.
- F-5 (DIAGNOSIS case 4 "scroll se sube solo"): while scrolled down, FREEZE the re-sort — UPDATEs mutate row data in place; reordered/new rows accumulate in a banner "N conversaciones con actividad — volver arriba". On return-to-top or banner click, apply the real sort once. The virtualizer (F-1) handles geometry; F-5 is the policy of WHEN to reorder (D-19).

Purpose: Eliminate the perceptible autorefresh (F-4) and the under-viewport content shift (F-5) by construction. Honors D-14..D-19.
Output: softRefetchPage1 + coalescing timer + surgical orders in the hook; scroll-freeze + banner in the list.
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
@src/hooks/use-messages.ts

<interfaces>
<!-- The merge contract F-4 mirrors, and the freeze policy F-5 implements -->
softRefetchPage1(): fetch getConversationsPage(filters, null) → merge-by-id into loaded array
  (NO isLoading=true, NO array replacement; latest wins for flat columns; re-sort by current mode).
Coalescing timer (D-15): if a safety timer is already armed, DO NOT re-arm (return early).
Freeze (D-18): isFrozen = scrollTop > container.clientHeight (1 viewport).
  Frozen → UPDATEs mutate in place; reordered/new rows → bannerCount++ ; banner: "N conversaciones con actividad — volver arriba".
softRefetch precedent: src/hooks/use-messages.ts:167-222 (merge-by-id Map, latest wins).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: F-4 — softRefetchPage1 merge + coalescing timer + surgical orders handler</name>
  <files>src/hooks/use-conversations.ts</files>
  <read_first>
    - src/hooks/use-conversations.ts (read current safety refetch :280-287, sort :368, orders handler :449-469 — confirm what plan 05 already changed)
    - src/hooks/use-messages.ts:167-222 (softRefetch merge-by-id — the exact pattern to mirror)
    - PATTERNS.md sections "softRefetch pattern" (lines 277-319), "Coalescing timer" (lines 322-338), "Surgical orders realtime handler for D-16" (lines 359-379)
    - RESEARCH.md Q6 (F-4 safety-net), Q9 (D-16 surgical orders)
  </read_first>
  <action>
1. Add `softRefetchPage1` (PATTERNS lines 302-319): call `getConversationsPage({...currentFilters, sortBy: sortModeRef.current}, null)`; merge result into `conversations` via a `new Map(prev)` overlay (latest wins for flat columns; PRESERVE `contact`/`tags` joins like the existing UPDATE handler does); re-sort by current mode with `sortConversations`. NO `isLoading=true`, NO array replacement. Guard with `mountedRef` (from plan 05) before setState. On error: silent (realtime is the primary path).
2. Replace the safety timer with the COALESCING version (PATTERNS lines 331-338): if `safetyRefetchTimer.current` is already set, `return` (do NOT clear+re-arm); otherwise arm a single `setTimeout` that clears itself and calls `softRefetchPage1()`. This converts the per-event re-arm (runs ~always under traffic) into one fire per quiet window (D-15).
3. Surgical orders handler (D-16, if plan 05 left it as a full refetch): on an `orders` INSERT/UPDATE, read `contact_id` from `payload.new`/`payload.old`; if not in `contactIdsRef.current` (loaded window) → ignore; else `getOrdersForContacts([contactId])` and `setOrdersByContact(prev => new Map(prev).set(contactId, next))`, guarded by `mountedRef`. PATTERNS lines 369-378.

Do NOT reintroduce a full-array refetch anywhere. Do NOT touch markAsReadLocally or the realtime token pattern.
  </action>
  <verify>
    <automated>grep -n "softRefetchPage1\|safetyRefetchTimer.current" src/hooks/use-conversations.ts | head; npx tsc --noEmit 2>&1 | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "softRefetchPage1" src/hooks/use-conversations.ts` returns >= 2 (defined + called).
    - The safety timer early-returns when already armed (coalescing): the schedule fn contains `if (safetyRefetchTimer.current) return`.
    - No full-list `fetchConversations()`/full refetch remains in realtime handlers: `grep -c "fetchConversations()" src/hooks/use-conversations.ts` returns 0 (replaced by softRefetchPage1/loadMore).
    - Orders handler updates a single contact (`new Map(prev).set(contactId`), not a full refetch.
    - `npx tsc --noEmit` → 0 errors.
  </acceptance_criteria>
  <done>Safety-net is a coalesced single-fire page-1 softRefetch merge; orders realtime is surgical per-contact; no full refetch storm.</done>
</task>

<task type="auto">
  <name>Task 2: F-5 — scroll-freeze policy + activity banner in conversation-list</name>
  <files>src/app/(dashboard)/whatsapp/components/conversation-list.tsx, src/hooks/use-conversations.ts</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/conversation-list.tsx (the virtualizer + parentRef from plan 05; existing scroll handling)
    - PATTERNS.md section "F-5 scroll state tracking" (lines 538-553) and "No Analog Found" banner note (lines 791)
    - RESEARCH.md Q6 "F-5 freeze interaction (D-18)" (lines 272) and Q7 scroll-position (line 294), D-18/D-19 in CONTEXT.md
  </read_first>
  <action>
Implement the freeze policy (D-18). The hook owns the data; the list owns scroll position — coordinate via a frozen flag + a pending-reorder buffer.

In `conversation-list.tsx`:
1. Track scroll: `const scrollTopRef = useRef(0)` + a `scroll` listener on `parentRef` (passive), and a state `isFrozen` derived from `scrollTop > container.clientHeight` (1 viewport threshold per D-18; this is Claude's-discretion exact value — 1×clientHeight).
2. Add `bannerCount` state. While `isFrozen`, realtime reorders/new-conversations do NOT re-sort the visible list — instead they increment `bannerCount` (the hook signals "a reorder is pending" while frozen; in-place data mutations like preview/unread/timestamp still apply).
3. Render a banner at the TOP of the list when `bannerCount > 0`: `"{bannerCount} conversaciones con actividad — volver arriba"` (exact wording per CONTEXT.md specifics). Clicking it (or scrolling back to top) scrolls to top, applies the real sort once (`sortConversations`), optionally triggers `softRefetchPage1`, and resets `bannerCount` to 0.

In `use-conversations.ts`:
4. Expose a `frozenRef` (set by the list) the realtime handlers read: when `frozenRef.current` is true, a reorder UPDATE/INSERT applies the in-place data merge but SKIPS the re-sort and instead calls an `onPendingReorder()` callback (increments bannerCount in the list); when false, behaves as today (sort to top). This is the single place where the freeze gates "WHEN to reorder" (D-19) — geometry is already the virtualizer's job (F-1).

Keep it minimal and additive: the un-frozen path (scrolled to top) must behave exactly like plan 05's behavior. Do not add scroll-anchor math (the virtualizer handles it — RESEARCH Q7).
  </action>
  <verify>
    <automated>grep -n "conversaciones con actividad\|isFrozen\|bannerCount\|frozenRef" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx src/hooks/use-conversations.ts | head; npx tsc --noEmit 2>&1 | head -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "conversaciones con actividad" src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx` returns >= 1 (banner wording).
    - Freeze threshold uses `clientHeight` (1 viewport): grep shows `clientHeight` in the freeze derivation.
    - While frozen, reorders increment a banner counter (not a live re-sort): the realtime handler branches on the frozen flag.
    - Returning to top / banner click applies the sort once and resets the counter.
    - `npx tsc --noEmit` → 0 errors.
  </acceptance_criteria>
  <done>While scrolled down, content does not shift under the viewport; reorders accumulate in the activity banner; returning to top applies the real order once.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Wave 3 robot gates (case4 + case4b) + commit + push</name>
  <what-built>F-4 coalesced page-1 softRefetch + surgical orders (no autorefresh storm) and F-5 scroll-freeze + activity banner (no under-viewport content shift). Ships Wave 3.</what-built>
  <how-to-verify>
Run the Wave 3 robot gates against dev:3020 (Somnio LIVE — mandatory pre-push):
1. F-4 gate (D-15): `ROBOT_APP_URL=http://localhost:3020 npx tsx scripts/_robot-inbox-nav.ts case4` → inspect `robot/*-case4.json`: N no-op `conv.UPDATE` events trigger **0 full-refetches >2s** (baseline was 3 full-refetches of 4.3-4.6s in 20s). Confirm a single coalesced page-1 softRefetch at most, no `getConversations`/full-array refetch.
2. F-5 gate (case 4-B): `ROBOT_APP_URL=http://localhost:3020 npx tsx scripts/_robot-inbox-nav.ts case4b` → inspect `robot/*-case4b.json`: with scrollTop fixed mid-list and an under-viewport bump, the sentinel ("José Elver Jiménez Cruz") stays put — **0 content shift** under the viewport; the activity banner count increments instead (baseline corrida B was 2/2 shifts).
3. `npx tsc --noEmit` → 0 errors.
Gotcha (D-25): keep robot `page.evaluate` inlined.

After gates pass, commit + push (Regla 1):
```bash
git add src/hooks/use-conversations.ts src/app/\(dashboard\)/whatsapp/components/conversation-list.tsx
git commit -m "feat(whatsapp-inbox-reliability W3): F-4 softRefetch pagina-1 coalescido + orders quirurgico, F-5 freeze de scroll + banner de actividad"
git push origin main
```
No migration in Wave 3 → no Regla 5 pause.
  </how-to-verify>
  <resume-signal>Type "approved" once case4 shows 0 full-refetches >2s, case4b shows 0 under-viewport shift (banner increments), tsc clean, and the push succeeded. Otherwise describe the failure.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| realtime event stream → list state | continuous Somnio realtime events drive reconciliation and reordering |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wir-12 | DoS (self-inflicted refetch storm) | safety timer | mitigate | Coalescing single-fire timer + page-1 merge replaces the per-event full-refetch storm; surgical per-contact orders update |
| T-wir-13 | Consistency (missed deltas while frozen) | freeze policy | mitigate | In-place data merge still applies while frozen; banner + return-to-top softRefetch reconciles order; no delta is lost, only deferred |
</threat_model>

<verification>
- robot `case4`: 0 full-refetches >2s after N no-op updates (D-15).
- robot `case4b`: 0 under-viewport content shift; banner increments (D-18).
- `npx tsc --noEmit` → 0 errors.
- Push to origin/main succeeded.
</verification>

<success_criteria>
- The perceptible autorefresh is gone (coalesced page-1 merge, surgical orders).
- The list does not shift under the user's viewport while scrolled (banner pattern).
- Wave 3 pushed as one revert-able unit.
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-inbox-reliability/06-SUMMARY.md`
</output>
