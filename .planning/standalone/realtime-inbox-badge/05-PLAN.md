---
phase: standalone-realtime-inbox-badge
plan: 05
type: execute
wave: 1
depends_on: [01, 02, 03]
files_modified:
  - src/lib/supabase/client.ts
  - src/hooks/use-conversations.ts
  - src/hooks/use-messages.ts
autonomous: true
requirements:
  - RQ-1
  - RQ-2
user_setup: []

must_haves:
  truths:
    - "On a fresh /whatsapp load with a manager session, the first phx_join on the inbox channel carries the USER JWT (not anon) — RLS evaluates is_workspace_member(auth.uid()) = true, events delivered <2s"
    - "The chat (use-messages) channel also subscribes only after the user token is on the socket"
    - "RealtimeAuthProvider + useRealtimeReconnect remain mounted/wired (kept, now secondary) — no plan deletes them (RQ-2)"
    - "The access_token is never logged in any prime/setAuth/subscribe path"
  artifacts:
    - path: "src/lib/supabase/client.ts"
      provides: "Primed realtime.setAuth() (no-arg) at singleton creation + exported whenRealtimeAuthReady()"
      contains: "whenRealtimeAuthReady"
    - path: "src/hooks/use-conversations.ts"
      provides: "Inbox channel subscribe gated behind getSession()+setAuth(token) (token-before-subscribe)"
      contains: "getSession"
    - path: "src/hooks/use-messages.ts"
      provides: "Chat channel subscribe gated behind getSession()+setAuth(token) (token-before-subscribe)"
      contains: "getSession"
  key_links:
    - from: "src/hooks/use-conversations.ts"
      to: "supabase.realtime.setAuth(session.access_token)"
      via: "await getSession() then setAuth before .subscribe()"
      pattern: "setAuth\\(session"
    - from: "src/hooks/use-messages.ts"
      to: "supabase.realtime.setAuth(session.access_token)"
      via: "await getSession() then setAuth before .subscribe()"
      pattern: "setAuth\\(session"
---

<objective>
Implement the CONFIRMED PRIMARY fix (Option 2, token-before-subscribe) for the realtime inbox/chat bug.

Root cause (RESEARCH.md, HIGH confidence, verified against installed `@supabase/realtime-js@2.95.2` source + on-disk A/B repro): `use-conversations.ts` (inbox) and `use-messages.ts` (chat) call `.subscribe()` in a mount `useEffect` BEFORE the user JWT is on the shared Realtime socket. The first `phx_join` carries the ANON token → RLS `is_workspace_member(auth.uid()=null)=false` → the server silently DROPS every `postgres_changes` event while the channel still reports `SUBSCRIBED`. Continuous, every load. The layered fix (Plans 01-03) sets auth AFTER subscribe, so it never repaired the initial join — it is KEPT as a secondary net but proven insufficient alone.

Fix = two parts: (1) prime the singleton's Realtime token at creation with a NO-ARG `setAuth()` and export `whenRealtimeAuthReady()`; (2) in BOTH realtime hooks, before `.subscribe()`, `await supabase.auth.getSession()` then `await supabase.realtime.setAuth(session.access_token)` (the defensive explicit-token form — Pattern 2 option (b), applied IDENTICALLY in both hooks), wrapped in an async IIFE with a `cancelled` flag + `removeChannel` cleanup (StrictMode guard).

Purpose: make realtime NEVER fail to deliver on a fresh load — the user mandate "que NUNCA falle de actualizarse en tiempo real".
Output: edited `client.ts` + both hooks; all existing bindings and logging preserved verbatim.

RQ-2 note: this plan does NOT delete `RealtimeAuthProvider` or `useRealtimeReconnect` — it depends on Plans 01-03 having shipped them and leaves them in place (token-refresh ~1h + tab/network recovery, now secondary).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/realtime-inbox-badge/RESEARCH.md
@.planning/standalone/realtime-inbox-badge/CONTEXT.md
@.planning/standalone/realtime-inbox-badge/01-SUMMARY.md

<interfaces>
<!-- Current state of the files being edited. Executor must NOT re-derive — patterns are copied verbatim into each task's <action>. -->

src/lib/supabase/client.ts (CURRENT — Plan 01 singleton, NO prime, NO whenRealtimeAuthReady yet):
```ts
'use client'
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
function makeBrowserClient(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
let browserClient: SupabaseClient | undefined
export function createClient(): SupabaseClient {
  return (browserClient ??= makeBrowserClient())
}
```

use-conversations.ts — the realtime useEffect is at lines 302-474. It does:
`const channel = supabase.channel(\`inbox:${workspaceId}\`).on(...4 bindings...).subscribe(...)` then cleanup `return () => { supabase.removeChannel(channel); if (safetyRefetchTimer.current) clearTimeout(...) }`. The 4 .on() bindings (conversations, **contact_tags** D-10, contacts, orders) and the `[realtime:inbox]` logging in the subscribe handler MUST be preserved VERBATIM.

use-messages.ts — the realtime useEffect is at lines 230-319, gated `if (!conversationId) return`. It does:
`const channel = supabase.channel(\`messages:${conversationId}\`).on(INSERT...).on(UPDATE...).subscribe(...)` then cleanup `return () => { supabase.removeChannel(channel) }`. The `New message received:` + `[realtime:messages]` logging MUST be preserved VERBATIM. Keep the `!!conversationId` gating semantics.

setAuth signature (D-05, VERIFIED): `setAuth(token?: string | null): Promise<void>` — async. No-arg = callback mode (preserves auto-refresh, Pitfall 4). Explicit token = defensive form for the hooks.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Prime realtime.setAuth at singleton creation + export whenRealtimeAuthReady()</name>
  <read_first>
- src/lib/supabase/client.ts (the file being modified — current singleton above)
- RESEARCH.md "Pattern 1: Prime Realtime auth at singleton creation" (lines 155-207) — copy this code verbatim
- RESEARCH.md Pitfall 4 (no-arg setAuth preserves auto-refresh) + Security Domain V7 (never log token)
- 01-SUMMARY.md (Plan 01 made createClient() a singleton — this extends it)
  </read_first>
  <action>
Rewrite `src/lib/supabase/client.ts` to prime the Realtime token ONCE at singleton creation and export a readiness promise. Use the EXACT Pattern 1 code from RESEARCH.md:

```ts
'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

function makeBrowserClient(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

let browserClient: SupabaseClient | undefined

// Resolves once the shared Realtime socket has been primed with the current
// user JWT. Realtime hooks MUST await this before .subscribe() so the first
// phx_join carries the user token (not the anon fallback) — otherwise RLS
// (is_workspace_member(auth.uid())) drops every event silently while the
// channel still reports SUBSCRIBED (confirmed root cause; scripts/_diag-token-order.ts Phase A).
let realtimeAuthReady: Promise<void> | undefined

export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = makeBrowserClient()

    // Prime the Realtime socket token ONCE, at creation, before any hook subscribes.
    // No-arg setAuth() reads the current session via supabase-js's internal
    // accessToken callback (which reads @supabase/ssr cookie storage). It keeps
    // CALLBACK/auto-refresh mode (Pitfall 4): a no-arg prime does NOT flip the
    // socket to manual-token mode, so the heartbeat/reconnect auth keeps working
    // and the kept RealtimeAuthProvider re-asserts on every TOKEN_REFRESHED.
    // whenRealtimeAuthReady() lets hooks wait for it to resolve.
    // We NEVER log the token (threat: token leakage — Security V7).
    realtimeAuthReady = browserClient.realtime
      .setAuth()
      .catch((e) => {
        // Fail-open: do not block subscribe forever if priming errors.
        // The kept RealtimeAuthProvider + useRealtimeReconnect remain as nets.
        console.warn('[realtime] initial setAuth failed', e)
      })
  }
  return browserClient
}

/** Await before subscribing any RLS-filtered Realtime channel (token-before-subscribe). */
export function whenRealtimeAuthReady(): Promise<void> {
  return realtimeAuthReady ?? Promise.resolve()
}
```

Do NOT introduce the `accessToken` option (Option 1 — REJECTED, throws on every supabase.auth.*). Do NOT change the `createClient()` signature (12 call-sites depend on it).
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | grep -c "src/lib/supabase/client.ts" | grep -qx 0 && echo TS-CLEAN</automated>
  </verify>
  <acceptance_criteria>
- `grep -c "whenRealtimeAuthReady" src/lib/supabase/client.ts` returns 2 (export decl + the JSDoc/body reference — at minimum the `export function whenRealtimeAuthReady` line must be present once).
- `grep -c "export function whenRealtimeAuthReady" src/lib/supabase/client.ts` = 1.
- `grep -c "\.setAuth()" src/lib/supabase/client.ts` = 1 (NO-ARG prime form — Pitfall 4; must NOT pass a token here).
- `grep -c "realtimeAuthReady" src/lib/supabase/client.ts` >= 3.
- `grep -c "accessToken" src/lib/supabase/client.ts` = 0 (Option 1 rejected).
- NO token in logs: `grep -nE "console\.(log|warn|error|info)" src/lib/supabase/client.ts` shows only the `'[realtime] initial setAuth failed'` warn (an Error object, never a token); `grep -c "access_token" src/lib/supabase/client.ts` = 0.
- `npx tsc --noEmit` reports ZERO errors for `src/lib/supabase/client.ts`.
- `export function createClient` still present exactly once (`grep -c "export function createClient" src/lib/supabase/client.ts` = 1) — signature unchanged.
  </acceptance_criteria>
  <done>client.ts primes a no-arg setAuth at first singleton creation, exports whenRealtimeAuthReady(), never logs a token, never uses the accessToken option, and typechecks clean. createClient() signature preserved.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Gate inbox subscribe behind getSession()+setAuth(token) in use-conversations.ts</name>
  <read_first>
- src/hooks/use-conversations.ts (the file being modified — realtime useEffect lines 302-474 above)
- RESEARCH.md "Pattern 2: Gate subscribe() in the hook behind auth-ready" (lines 215-247) + Open design point option (b) (lines 209-213) — explicit-token form
- RESEARCH.md Pitfall 1 (await getSession explicitly), Pitfall 3 (cancelled flag + removeChannel), Pitfall 4 (document the no-arg-prime interaction)
- 03-SUMMARY.md (D-10 contact_tags + D-14 logging baseline counts that MUST hold)
  </read_first>
  <action>
Wrap the EXISTING realtime `useEffect` body (lines 302-474) so `.subscribe()` only runs AFTER the user token is on the socket. Do NOT rewrite any `.on()` binding or the subscribe status handler — move the EXISTING `const channel = supabase.channel(\`inbox:${workspaceId}\`)...subscribe(...)` expression UNCHANGED inside an async IIFE that first awaits the token. Final shape:

```ts
  useEffect(() => {
    if (!workspaceId) return

    const supabase = createClient()
    // channel is assigned inside the async IIFE below
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    ;(async () => {
      // Token-before-subscribe (CONFIRMED primary fix): guarantee the shared
      // Realtime socket holds the USER JWT before the first phx_join, else RLS
      // (is_workspace_member(auth.uid())) drops every event while the channel
      // still reports SUBSCRIBED. The singleton already primes a NO-ARG setAuth
      // at creation (client.ts, callback/auto-refresh mode); this explicit
      // setAuth(token) is the defensive form for a hard load where the cookie
      // session is still hydrating (Pitfall 1). RealtimeAuthProvider re-asserts
      // a no-arg refresh on every TOKEN_REFRESHED, so the brief manual-token
      // window here is harmless (Pitfall 4). NEVER log the token.
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token)
      }
      if (cancelled) return

      channel = supabase
        .channel(`inbox:${workspaceId}`)
        // ... ALL EXISTING .on() BINDINGS UNCHANGED (conversations, contact_tags D-10, contacts, orders) ...
        .subscribe(/* ... EXISTING status handler with [realtime:inbox] logging UNCHANGED (D-14) ... */)
    })()

    // Cleanup on unmount or workspaceId change only
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
      if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])
```

CRITICAL preservation:
- The 4 `.on()` bindings stay byte-identical — especially the `contact_tags` `.on()` (D-10 regression guard from f57386ef). Do NOT touch its body.
- The `[realtime:inbox]` console.log lines (status + conversation events) stay (D-14 — live oracle).
- Keep the existing `[workspaceId]` dep array + the eslint-disable comment.
- Do NOT touch `useRealtimeReconnect(fetchConversations)` (Plan 03) or any other part of the hook.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | grep -c "src/hooks/use-conversations.ts" | grep -qx 0 && echo TS-CLEAN</automated>
  </verify>
  <acceptance_criteria>
- `grep -c "getSession" src/hooks/use-conversations.ts` >= 1 (the new token-before-subscribe await).
- `grep -c "setAuth(session.access_token)" src/hooks/use-conversations.ts` = 1 (explicit-token form before subscribe).
- `grep -c "let cancelled = false" src/hooks/use-conversations.ts` = 1 AND `grep -c "if (cancelled) return" src/hooks/use-conversations.ts` >= 1 AND `grep -c "cancelled = true" src/hooks/use-conversations.ts` = 1 (StrictMode guard — Pitfall 3).
- D-10 ANTI-REGRESSION (MANDATORY): `grep -c "table: 'contact_tags'" src/hooks/use-conversations.ts` = 1.
- D-14 ANTI-REGRESSION (MANDATORY): `grep -c "\[realtime:inbox\]" src/hooks/use-conversations.ts` = 4 (unchanged from Plan 03 baseline).
- SECURITY (MANDATORY): the access_token is never logged — `grep -nE "console\.(log|warn|error|info).*access_token" src/hooks/use-conversations.ts` returns 0 matches.
- `grep -c "removeChannel" src/hooks/use-conversations.ts` >= 1 (cleanup preserved).
- `grep -c "useRealtimeReconnect(fetchConversations)" src/hooks/use-conversations.ts` = 1 (Plan 03 untouched).
- `grep -c "accessToken" src/hooks/use-conversations.ts` = 0 (Option 1 not introduced).
- `npx tsc --noEmit` reports ZERO errors for `src/hooks/use-conversations.ts`.
  </acceptance_criteria>
  <done>Inbox channel subscribes only after getSession()+setAuth(token); contact_tags binding (D-10) and [realtime:inbox] logging (D-14) intact; cancelled-flag StrictMode guard present; no token logged; typechecks clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Gate chat subscribe behind getSession()+setAuth(token) in use-messages.ts</name>
  <read_first>
- src/hooks/use-messages.ts (the file being modified — realtime useEffect lines 230-319 above)
- RESEARCH.md "Pattern 2" (lines 215-247) — apply the SAME explicit-token form as Task 2, identically
- RESEARCH.md Pitfall 1 + Pitfall 3 + Pitfall 4
- 03-SUMMARY.md (D-14 message logging baseline counts)
  </read_first>
  <action>
Apply the IDENTICAL token-before-subscribe wrapper to the EXISTING realtime `useEffect` (lines 230-319). The effect is already gated `if (!conversationId) return` — keep that. Move the existing `const channel = supabase.channel(\`messages:${conversationId}\`)...subscribe(...)` expression UNCHANGED inside an async IIFE that first awaits the token. Final shape:

```ts
  useEffect(() => {
    if (!conversationId) return

    const supabase = createClient()
    let previousStatus = ''  // keep existing (used by subscribe handler)
    const channelKey = messagesKey(workspaceId, conversationId)  // keep existing
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    ;(async () => {
      // Token-before-subscribe (CONFIRMED primary fix) — same as use-conversations.ts.
      // Guarantee the USER JWT is on the shared socket before the first phx_join,
      // else RLS drops every message event while the channel reports SUBSCRIBED.
      // Explicit setAuth(token) is the defensive form for a hydrating cookie
      // session (Pitfall 1); the singleton's no-arg prime + RealtimeAuthProvider
      // keep auto-refresh intact (Pitfall 4). NEVER log the token.
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token)
      }
      if (cancelled) return

      channel = supabase
        .channel(`messages:${conversationId}`)
        // ... EXISTING INSERT .on() + UPDATE .on() UNCHANGED (incl. 'New message received:' log) ...
        .subscribe(/* ... EXISTING [realtime:messages] status handler UNCHANGED (D-14) ... */)
    })()

    // Cleanup on unmount
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [conversationId, workspaceId, softRefetch, queryClient])
```

CRITICAL preservation:
- Both `.on()` bodies (INSERT optimistic-replace logic + UPDATE status logic) stay byte-identical.
- `console.log('New message received:', payload)` stays (D-14). The `[realtime:messages]` status logs stay (D-14).
- Keep the existing dep array `[conversationId, workspaceId, softRefetch, queryClient]` + the `!!conversationId` gate semantics (`if (!conversationId) return` at the top).
- Do NOT touch `useRealtimeReconnect(softRefetch, !!conversationId)` (Plan 03) or any other part of the hook.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | grep -c "src/hooks/use-messages.ts" | grep -qx 0 && echo TS-CLEAN</automated>
  </verify>
  <acceptance_criteria>
- `grep -c "getSession" src/hooks/use-messages.ts` >= 1 (the new token-before-subscribe await).
- `grep -c "setAuth(session.access_token)" src/hooks/use-messages.ts` = 1 (explicit-token form before subscribe).
- `grep -c "let cancelled = false" src/hooks/use-messages.ts` = 1 AND `grep -c "if (cancelled) return" src/hooks/use-messages.ts` >= 1 AND `grep -c "cancelled = true" src/hooks/use-messages.ts` = 1 (StrictMode guard — Pitfall 3).
- D-14 ANTI-REGRESSION (MANDATORY): `grep -c "New message received:" src/hooks/use-messages.ts` = 1 AND `grep -c "\[realtime:messages\]" src/hooks/use-messages.ts` = 3 (unchanged from Plan 03 baseline).
- `!!conversationId` gate preserved: `grep -c "if (!conversationId) return" src/hooks/use-messages.ts` >= 1.
- SECURITY (MANDATORY): `grep -nE "console\.(log|warn|error|info).*access_token" src/hooks/use-messages.ts` returns 0 matches.
- `grep -c "removeChannel" src/hooks/use-messages.ts` >= 1 (cleanup preserved).
- `grep -c "useRealtimeReconnect(softRefetch, !!conversationId)" src/hooks/use-messages.ts` = 1 (Plan 03 untouched).
- `grep -c "accessToken" src/hooks/use-messages.ts` = 0 (Option 1 not introduced).
- `npx tsc --noEmit` reports ZERO errors for `src/hooks/use-messages.ts`.
  </acceptance_criteria>
  <done>Chat channel subscribes only after getSession()+setAuth(token), identically to the inbox; 'New message received:' + [realtime:messages] logging (D-14) intact; !!conversationId gate + cancelled guard present; no token logged; typechecks clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → Supabase Realtime socket | The user JWT is injected into the WebSocket join payload; RLS on the server evaluates it. Untrusted client controls timing of subscribe. |
| cookie storage → in-memory session | `@supabase/ssr` hydrates the JWT from cookies; a race here is the root cause. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rib05-01 | Information Disclosure | setAuth/prime/subscribe paths | mitigate | NEVER log `access_token`; acceptance criteria grep `console.*access_token` = 0 in client.ts + both hooks. |
| T-rib05-02 | Information Disclosure (cross-workspace) | inbox/chat channels | mitigate | Token-before-subscribe makes RLS actually evaluate the USER's JWT; existing `filter: workspace_id=eq.` + `is_workspace_member` scope events. The fix HARDENS isolation (anon currently reads nothing; a correct user token is now required). |
| T-rib05-03 | Spoofing/Elevation (stale token) | hourly JWT expiry | accept (covered) | Out of this plan's scope to fix; the KEPT RealtimeAuthProvider re-asserts setAuth on TOKEN_REFRESHED (RQ-2). No-arg prime in client.ts preserves auto-refresh (Pitfall 4). |
</threat_model>

<verification>
- `npx tsc --noEmit` reports ZERO errors in the 3 modified files (pre-existing unrelated `__tests__/` + `.next/` errors are out of scope, same baseline as Plans 01-03).
- All grep acceptance criteria across the 3 tasks pass (token-before-subscribe present in both hooks; D-10 + D-14 intact; no token logged; no accessToken option).
- `git diff --diff-filter=D` across this plan's commits: zero file deletions (RQ-2 — RealtimeAuthProvider + useRealtimeReconnect untouched).
- This plan does NOT push to Vercel (Regla 1 push is sequenced in Plan 06 after the local harness PASSES — no blind deploy).
</verification>

<success_criteria>
- Both realtime hooks apply the user JWT to the socket BEFORE `.subscribe()` (RQ-1 satisfied).
- RealtimeAuthProvider + useRealtimeReconnect remain (RQ-2 satisfied — no deletion).
- D-10 (contact_tags) + D-14 (logging) anti-regression hold.
- No `accessToken` option anywhere; no token in any log.
- Ready for the Plan 06 local harness to prove `gtCount>0 && browserRtCount>0` on a fresh load.
</success_criteria>

<output>
After completion, create `.planning/standalone/realtime-inbox-badge/05-SUMMARY.md` recording: the 3 commits, all grep acceptance results (incl. D-10/D-14/security gates), the typecheck result, and confirmation that no file was deleted (RQ-2). Note that Vercel push is deferred to Plan 06 (after local harness PASS).
</output>
