---
phase: standalone-realtime-inbox-badge
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/hooks/use-realtime-reconnect.ts
  - src/hooks/use-conversations.ts
  - src/hooks/use-messages.ts
autonomous: true
requirements:
  - CAPA2-RECONNECT
  - CAPA3-WATCHDOG
user_setup: []

must_haves:
  truths:
    - "Returning to a previously-hidden tab (visibilitychange when !document.hidden) re-syncs both the inbox (fetchConversations) and the open chat (softRefetch)"
    - "Regaining network (window 'online') re-syncs both the inbox and the open chat"
    - "A visible tab whose channel has been idle > N seconds auto re-syncs (watchdog, Capa 3) without waiting for a status transition"
    - "Re-sync does NOT depend on a Supabase channel status transition (closes hole 2d)"
    - "The contact_tags listener in use-conversations.ts is untouched (D-10 anti-regression)"
  artifacts:
    - path: "src/hooks/use-realtime-reconnect.ts"
      provides: "Shared hook: visibilitychange + online + staleness watchdog -> registered re-sync callbacks"
      contains: "visibilitychange"
    - path: "src/hooks/use-conversations.ts"
      provides: "Registers fetchConversations as a re-sync callback"
      contains: "useRealtimeReconnect"
    - path: "src/hooks/use-messages.ts"
      provides: "Registers softRefetch as a re-sync callback"
      contains: "useRealtimeReconnect"
  key_links:
    - from: "src/hooks/use-realtime-reconnect.ts"
      to: "document visibilitychange + window online"
      via: "addEventListener firing registered callbacks"
      pattern: "addEventListener\\('(visibilitychange|online)'"
    - from: "src/hooks/use-conversations.ts"
      to: "use-realtime-reconnect"
      via: "useRealtimeReconnect(fetchConversations)"
      pattern: "useRealtimeReconnect\\("
    - from: "src/hooks/use-messages.ts"
      to: "use-realtime-reconnect"
      via: "useRealtimeReconnect(softRefetch)"
      pattern: "useRealtimeReconnect\\("
---

<objective>
Build Capa 2 + Capa 3: a shared hook `src/hooks/use-realtime-reconnect.ts` that re-synchronizes realtime state on the browser events that actually fire when a socket dies — `visibilitychange` (returning from a slept tab, 2b), `online` (network recovered, 2c) — plus a lightweight staleness watchdog (Capa 3, D-09) that re-syncs a visible-but-idle channel. This closes hole 2d (the existing auto-heal only fires on a channel status TRANSITION, which never happens for a silently-dead `SUBSCRIBED` socket). Per D-08 the reconciliation depends on browser/timer events, not channel status.

Each consumer registers its existing re-sync function (D-07): `use-messages.ts` → `softRefetch` (line 144-147, `invalidateQueries`), `use-conversations.ts` → `fetchConversations` (the function behind `fetchConversationsRef`, line 173/186). Uses the existing ref pattern to avoid stale closures.

Purpose: best-effort realtime + reliable reconciliation = "NUNCA falle" (D-02). Re-hydrates BOTH state models — React Query cache (chat) and the `useState` inbox (badge).

Output: new shared hook + 2 consumer registrations. Anti-regression: do NOT touch the `contact_tags` listener (D-10); KEEP the temporary `[realtime:*]` logging (D-14).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/realtime-inbox-badge/CONTEXT.md
@.planning/debug/realtime-inbox-badge.md

<interfaces>
<!-- Browser singleton from Plan 01 (the watchdog may use it to check the shared socket): -->
```ts
// src/lib/supabase/client.ts
export function createClient(): SupabaseClient
```

<!-- EXISTING re-sync functions to register (already implemented — DO NOT rewrite their bodies): -->

<!-- use-conversations.ts (useState owner, badge): -->
```ts
// line 186: const fetchConversations = useCallback(async () => { ... setConversations(data) }, [filter, currentUserId, sortMode])
// line 173: const fetchConversationsRef = useRef<() => void>(() => {})
// line 290: useEffect(() => { fetchConversationsRef.current = fetchConversations }, [fetchConversations])
```

<!-- use-messages.ts (React Query owner, chat): -->
```ts
// line 144-147:
// const softRefetch = useCallback(() => {
//   if (!conversationIdRef.current) return
//   queryClient.invalidateQueries({ queryKey: queryKeyRef.current })
// }, [queryClient])
```

<!-- Existing ref-to-avoid-stale-closure pattern to mirror (use-conversations.ts:288-290):
  const xRef = useRef<() => void>(() => {})
  useEffect(() => { xRef.current = x }, [x]) -->

<!-- Reference (visibilitychange→refetch, NO reconnect — same blind spot, do NOT import):
  src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts:86-89 -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create the shared useRealtimeReconnect hook (Capa 2 events + Capa 3 watchdog)</name>
  <read_first>
    - src/hooks/use-conversations.ts (lines 288-290 — the ref-to-avoid-stale-closure pattern to mirror; lines 281-286 scheduleSafetyRefetch as the "cheap re-sync" reference)
    - src/app/(dashboard)/metricas/hooks/use-metricas-realtime.ts (lines 86-89 — visibilitychange→refetch reference, NOTE it lacks reconnect/watchdog: the gap we are filling)
    - .planning/standalone/realtime-inbox-badge/CONTEXT.md (D-06/D-08/D-09)
  </read_first>
  <files>src/hooks/use-realtime-reconnect.ts</files>
  <action>
Create a NEW shared hook. It is a per-consumer hook (each consumer calls it with its own re-sync callback) — NOT a global singleton registry. Each call wires its own listeners + watchdog scoped to that consumer and cleans them up on unmount. This keeps it simple, avoids a cross-consumer registry, and matches how `useMetricasRealtime` already attaches per-hook listeners.

Concrete implementation:

```ts
'use client'

import { useEffect, useRef } from 'react'

/**
 * Capa 2 + Capa 3 — realtime reconnection safety net.
 *
 * The Supabase Realtime socket can die SILENTLY while the channel still reports
 * SUBSCRIBED (root causes 2a token-expiry, 2b tab sleep, 2c network drop). The
 * existing auto-heal only fires on a channel status TRANSITION (CHANNEL_ERROR ->
 * SUBSCRIBED), which never happens for a silently-dead socket (hole 2d). So we
 * reconcile on browser/timer events that DO fire instead of on channel status:
 *
 *   - visibilitychange (when !document.hidden) — returning from a slept tab (2b)
 *   - window 'online'                          — network recovered (2c)
 *   - staleness watchdog (every WATCHDOG_INTERVAL_MS, when the tab is visible) —
 *     safety net for 2a even if setAuth (Plan 02) failed (D-09)
 *
 * Each consumer registers ITS existing cheap re-sync function (D-07):
 *   - use-messages.ts  -> softRefetch (invalidateQueries)
 *   - use-conversations.ts -> fetchConversations
 *
 * The callback is kept in a ref so listeners never tear down on a new closure
 * (mirrors the fetchConversationsRef/scheduleSafetyRefetchRef pattern in
 * use-conversations.ts:288-290).
 *
 * @param onResync  cheap re-sync function (no-op if the consumer has nothing to sync)
 * @param enabled   skip wiring while there is nothing to sync (e.g. no conversation selected)
 */

// Watchdog cadence (D-09): re-sync a visible tab roughly once a minute as a
// defense-in-depth net. Cheap (a single invalidate/server-action) so the
// interval can be aggressive without cost concern.
const WATCHDOG_INTERVAL_MS = 45_000

export function useRealtimeReconnect(onResync: () => void, enabled = true) {
  const onResyncRef = useRef(onResync)
  onResyncRef.current = onResync

  useEffect(() => {
    if (!enabled) return
    if (typeof document === 'undefined') return

    const resync = () => {
      onResyncRef.current()
    }

    // Capa 2 / hole 2b — returning to a previously-hidden tab.
    const onVisibility = () => {
      if (!document.hidden) resync()
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Capa 2 / hole 2c — network recovered.
    window.addEventListener('online', resync)

    // Capa 3 — staleness watchdog (auto-re-arming, unlike the on-event-only
    // scheduleSafetyRefetch). Only fires while the tab is visible to avoid
    // background churn; the visibilitychange handler covers the hidden->visible
    // catch-up.
    const watchdog = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      resync()
    }, WATCHDOG_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', resync)
      clearInterval(watchdog)
    }
  }, [enabled])
}
```

Constraints / design notes:
- The hook does NOT force a socket disconnect/reconnect; it triggers the consumer's cheap reconciliation (re-fetch / invalidate). This is intentional (D-02 best-effort socket + reliable reconciliation). A `setAuth` re-arm is handled globally in Plan 02; the watchdog here is the safety net if that failed (D-09).
- `WATCHDOG_INTERVAL_MS = 45_000` (within the D-09 30-60s band). The watchdog skips while `document.hidden` (no point + saves work); `visibilitychange` handles the return.
- Use the ref pattern for `onResync` so a new closure each render does NOT re-attach listeners.
- `enabled` lets `use-messages.ts` skip wiring when no conversation is selected (its `softRefetch` is a no-op then anyway, but skipping avoids needless timers).
- Do NOT add any token logging. Do NOT import `@/lib/supabase/client` unless actually used (this implementation does not need it — reconciliation goes through the consumer's callback).
  </action>
  <acceptance_criteria>
    - File `src/hooks/use-realtime-reconnect.ts` exists
    - `grep -c "'use client'" src/hooks/use-realtime-reconnect.ts` returns `1`
    - `grep -c "addEventListener('visibilitychange'" src/hooks/use-realtime-reconnect.ts` returns `1`
    - `grep -c "addEventListener('online'" src/hooks/use-realtime-reconnect.ts` returns `1`
    - `grep -c "setInterval" src/hooks/use-realtime-reconnect.ts` returns `1`
    - `grep -c "removeEventListener('visibilitychange'" src/hooks/use-realtime-reconnect.ts` returns `1`
    - `grep -c "removeEventListener('online'" src/hooks/use-realtime-reconnect.ts` returns `1`
    - `grep -c "clearInterval" src/hooks/use-realtime-reconnect.ts` returns `1`
    - `grep -c "export function useRealtimeReconnect" src/hooks/use-realtime-reconnect.ts` returns `1`
    - `npx tsc --noEmit` passes
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -i "use-realtime-reconnect" || echo "no reconnect hook type errors"</automated>
  </verify>
  <done>Shared hook exists with visibilitychange + online listeners + watchdog interval, all cleaned up; ref pattern for the callback; typechecks. Re-sync independent of channel status (closes 2d).</done>
</task>

<task type="auto">
  <name>Task 2: Register fetchConversations in use-conversations.ts (badge re-sync)</name>
  <read_first>
    - src/hooks/use-conversations.ts (the file being modified — line 22 imports, line 186 fetchConversations, lines 288-290 ref wiring, lines 363-390 contact_tags listener that MUST stay untouched per D-10, line 448 the [realtime:inbox] logging that MUST stay per D-14)
    - src/hooks/use-realtime-reconnect.ts (Task 1)
  </read_first>
  <files>src/hooks/use-conversations.ts</files>
  <action>
Register the existing `fetchConversations` as the re-sync callback so the inbox/badge (`useState` model) reconciles on visibilitychange/online/watchdog.

Steps:
1. Add import near line 22 (with the other imports):
   `import { useRealtimeReconnect } from '@/hooks/use-realtime-reconnect'`
2. After `fetchConversations` is defined (it is a `useCallback`, line 186-231) and is in scope, add ONE call inside the hook body:
   `useRealtimeReconnect(fetchConversations)`
   Place it after the existing ref-sync effects (around line 290, after `useEffect(() => { fetchConversationsRef.current = fetchConversations }, [fetchConversations])`). `fetchConversations` is a stable `useCallback`; the hook's own ref pattern absorbs identity changes, so passing it directly is fine.

HARD CONSTRAINTS (anti-regression):
- D-10: do NOT remove, reorder, or modify the `contact_tags` `.on()` listener at lines 363-390. It must remain byte-identical.
- D-14: do NOT remove the temporary `[realtime:inbox]` logging (lines 319, 448, 452, 455) or the surrounding subscribe-status reconnect handler (lines 445-460). KEEP all of it — it confirms hole 2d live during validation.
- Do NOT change the realtime channel `useEffect` deps (`[workspaceId]`, line 468) or its cleanup.
- The ONLY additions are the import + the single `useRealtimeReconnect(fetchConversations)` call.
  </action>
  <acceptance_criteria>
    - `grep -c "import { useRealtimeReconnect }" src/hooks/use-conversations.ts` returns `1`
    - `grep -c "useRealtimeReconnect(fetchConversations)" src/hooks/use-conversations.ts` returns `1`
    - `grep -c "table: 'contact_tags'" src/hooks/use-conversations.ts` returns `1` (D-10: listener still present)
    - `grep -c "\[realtime:inbox\]" src/hooks/use-conversations.ts` returns `4` (D-14: logging intact — lines 319,448,452,455)
    - `git diff src/hooks/use-conversations.ts` shows ONLY the import line + the single useRealtimeReconnect call added (no deletions in the contact_tags or logging regions)
    - `npx tsc --noEmit` passes
  </acceptance_criteria>
  <verify>
    <automated>grep -c "\[realtime:inbox\]" src/hooks/use-conversations.ts</automated>
  </verify>
  <done>fetchConversations registered for re-sync; contact_tags listener + [realtime:inbox] logging fully intact; typechecks.</done>
</task>

<task type="auto">
  <name>Task 3: Register softRefetch in use-messages.ts (chat re-sync)</name>
  <read_first>
    - src/hooks/use-messages.ts (the file being modified — line 26 imports, lines 144-147 softRefetch, line 242 the "New message received:" log + line 294 [realtime:messages] log that MUST stay per D-14, line 224 the conversationId null-guard)
    - src/hooks/use-realtime-reconnect.ts (Task 1)
  </read_first>
  <files>src/hooks/use-messages.ts</files>
  <action>
Register the existing `softRefetch` as the re-sync callback so the chat (React Query cache) reconciles on visibilitychange/online/watchdog. `softRefetch` already no-ops when `conversationIdRef.current` is null, so it is safe; pass `enabled = !!conversationId` to avoid wiring listeners/watchdog when no conversation is open.

Steps:
1. Add import near line 26:
   `import { useRealtimeReconnect } from '@/hooks/use-realtime-reconnect'`
2. After `softRefetch` is defined (lines 144-147) and is in scope, add ONE call inside the hook body:
   `useRealtimeReconnect(softRefetch, !!conversationId)`
   `softRefetch` is a stable `useCallback`; the shared hook's ref pattern handles identity. `!!conversationId` gates the listeners to when a chat is actually open.

HARD CONSTRAINTS (anti-regression):
- D-14: do NOT remove the `console.log('New message received:', payload)` (line 242) or the `[realtime:messages]` logging (lines 294, 298, 302) or the subscribe-status reconnect handler (lines 293-306). KEEP all of it.
- Do NOT change the React Query `setQueryData` delta handlers (lines 248,266,284) or the channel `useEffect` deps.
- The ONLY additions are the import + the single `useRealtimeReconnect(softRefetch, !!conversationId)` call.
  </action>
  <acceptance_criteria>
    - `grep -c "import { useRealtimeReconnect }" src/hooks/use-messages.ts` returns `1`
    - `grep -c "useRealtimeReconnect(softRefetch, !!conversationId)" src/hooks/use-messages.ts` returns `1`
    - `grep -c "New message received:" src/hooks/use-messages.ts` returns `1` (D-14: log intact)
    - `grep -c "\[realtime:messages\]" src/hooks/use-messages.ts` returns `3` (D-14: logging intact — lines 294,298,302)
    - `git diff src/hooks/use-messages.ts` shows ONLY the import + the single useRealtimeReconnect call added
    - `npx tsc --noEmit` passes
    - `pnpm build` completes successfully
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && echo "TYPECHECK OK"</automated>
  </verify>
  <done>softRefetch registered for re-sync (gated on conversationId); chat logging intact; full typecheck + build green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser events → re-sync callbacks | visibilitychange/online/timer trigger workspace-scoped server actions / cache invalidation |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rib-06 | Denial of Service | watchdog interval | mitigate | Watchdog skips while `document.hidden` and triggers only the consumer's CHEAP re-sync (one invalidate / one workspace-scoped server action) at 45s cadence; cleared on unmount via clearInterval. No unbounded work. |
| T-rib-07 | Tampering | re-sync data path | accept | Re-sync calls existing workspace-scoped server actions / React Query keys (getConversations, invalidateQueries on a workspace-scoped key) — same RLS + workspace scoping as today. No new data path. |
</threat_model>

<verification>
- `npx tsc --noEmit` exits 0; `pnpm build` green.
- D-10: `grep -c "table: 'contact_tags'" src/hooks/use-conversations.ts` = 1.
- D-14: `[realtime:inbox]` count = 4, `[realtime:messages]` count = 3, `New message received:` count = 1.
- Both consumers contain exactly one `useRealtimeReconnect(...)` call.
</verification>

<success_criteria>
- visibilitychange + online + watchdog re-sync BOTH the inbox (fetchConversations) and the open chat (softRefetch), independent of channel status (closes 2d).
- contact_tags listener untouched (D-10); temporary logging kept (D-14).
- Live validation deferred to Plan 04 MANUAL UAT (scenarios 2 + 3, tab-switch + wifi toggle).
</success_criteria>

<output>
After completion, create `.planning/standalone/realtime-inbox-badge/03-SUMMARY.md`.
After code changes, commit atomically and push to Vercel (Regla 1):
`git add src/hooks/use-realtime-reconnect.ts src/hooks/use-conversations.ts src/hooks/use-messages.ts && git commit && git push origin main`
Co-author: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
</output>
