---
phase: standalone-realtime-inbox-badge
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/components/providers/realtime-auth-provider.tsx
  - src/app/(dashboard)/layout.tsx
autonomous: true
requirements:
  - CAPA1-SETAUTH
user_setup: []

must_haves:
  truths:
    - "When the JWT is refreshed (TOKEN_REFRESHED) or the user signs in (SIGNED_IN), the new access_token is re-injected into the Realtime socket via supabase.realtime.setAuth(session?.access_token)"
    - "The auth-refresh wiring is mounted exactly once for the whole dashboard (not per-hook)"
    - "The onAuthStateChange subscription is cleaned up on unmount (no listener leak)"
  artifacts:
    - path: "src/components/providers/realtime-auth-provider.tsx"
      provides: "Single global client component wiring onAuthStateChange -> realtime.setAuth"
      contains: "supabase.realtime.setAuth(session?.access_token)"
    - path: "src/app/(dashboard)/layout.tsx"
      provides: "Mounts RealtimeAuthProvider once inside the dashboard tree"
      contains: "RealtimeAuthProvider"
  key_links:
    - from: "src/components/providers/realtime-auth-provider.tsx"
      to: "supabase.realtime.setAuth"
      via: "onAuthStateChange TOKEN_REFRESHED/SIGNED_IN"
      pattern: "realtime\\.setAuth"
    - from: "src/app/(dashboard)/layout.tsx"
      to: "RealtimeAuthProvider"
      via: "mounted once in the dashboard layout tree"
      pattern: "<RealtimeAuthProvider"
---

<objective>
Wire Capa 1's setAuth fix (D-04/D-05): when `@supabase/ssr` refreshes the JWT (every ~1h, the `TOKEN_REFRESHED` event) or the user signs in (`SIGNED_IN`), re-inject the fresh `access_token` into the shared Realtime socket so the server keeps delivering RLS-filtered `postgres_changes` events. Today this never happens — the HTTP token refreshes but the socket keeps the stale JWT, the server silently drops filtered events, and the channel stays `SUBSCRIBED`-dead (root cause 2a, confirmed by V3 RLS using `is_workspace_member(...)`).

Purpose: fix the PRIMARY cause (2a). Mount the wiring ONCE globally (not per-hook) so a single `setAuth` call re-authenticates the one shared socket from Plan 01.

Output: a new client provider `src/components/providers/realtime-auth-provider.tsx` mounted once in `src/app/(dashboard)/layout.tsx`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/realtime-inbox-badge/CONTEXT.md
@.planning/debug/realtime-inbox-badge.md
@.planning/standalone/realtime-inbox-badge/01-SUMMARY.md

<interfaces>
<!-- Browser singleton from Plan 01 (must be used so setAuth hits the shared socket): -->
```ts
// src/lib/supabase/client.ts
export function createClient(): SupabaseClient
```

<!-- Confirmed library signatures (CONTEXT.md D-05 + node_modules verified 2026-06-03): -->
<!-- supabase.realtime.setAuth(token?: string | null): Promise<void>   (ASYNC, optional token) -->
<!-- supabase.auth.onAuthStateChange(cb): { data: { subscription: { unsubscribe(): void } } } -->
<!-- IMPORTANT: use the NON-async callback form (deadlock warning in auth-js docs). -->
<!-- Use `void supabase.realtime.setAuth(...)`, do NOT make the callback async. -->

<!-- Pattern to mirror for a client provider — from src/components/providers/query-provider.tsx: -->
```tsx
'use client'
export function QueryProvider({ children }: { children: React.ReactNode }) { ... }
```

<!-- AuthChangeEvent values relevant here: 'TOKEN_REFRESHED' | 'SIGNED_IN' (others ignored). -->

<!-- Dashboard layout (server component) provider nesting today:
  <QueryProvider><WorkspaceProvider><DashboardV2Provider>...children...</></></>
  Mount RealtimeAuthProvider INSIDE this tree (it renders no UI; can wrap children or sit as a sibling that renders null). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create RealtimeAuthProvider (onAuthStateChange -> realtime.setAuth)</name>
  <read_first>
    - src/components/providers/query-provider.tsx (source-of-truth for a minimal 'use client' provider shape)
    - src/lib/supabase/client.ts (Plan 01 singleton — must call createClient() so setAuth hits the shared socket)
    - .planning/standalone/realtime-inbox-badge/CONTEXT.md (D-04/D-05 exact pattern + signature)
  </read_first>
  <files>src/components/providers/realtime-auth-provider.tsx</files>
  <action>
Create a new `'use client'` provider that mounts the global auth-refresh wiring ONCE and renders its children unchanged (it adds no DOM, just an effect).

Concrete implementation:

```tsx
'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Capa 1 — Realtime auth refresh (root cause 2a).
 *
 * @supabase/ssr refreshes the JWT (~hourly) for HTTP/PostgREST but does NOT
 * re-inject the new token into the Realtime WebSocket. Once the socket's JWT
 * expires, the server silently drops RLS-filtered postgres_changes events
 * (V3: policies use is_workspace_member(...) which evaluates the JWT) while the
 * channel still reports SUBSCRIBED — so the existing status-transition auto-heal
 * never fires (hole 2d). Re-injecting the fresh token on TOKEN_REFRESHED/SIGNED_IN
 * keeps the shared socket authenticated.
 *
 * Mounted ONCE in the dashboard layout (D-04). Uses the browser-client singleton
 * (Plan 01) so this single setAuth re-authenticates every hook's channel.
 *
 * setAuth is async + token optional (D-05, @supabase/realtime-js@2.95.2):
 *   setAuth(token?: string | null): Promise<void>
 * We pass session?.access_token explicitly and fire-and-forget with `void`.
 * The onAuthStateChange callback is intentionally NON-async (auth-js deadlock
 * warning) — do not await inside it.
 */
export function RealtimeAuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        // Re-inject the fresh JWT into the shared Realtime socket. Fire-and-forget.
        void supabase.realtime.setAuth(session?.access_token)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return <>{children}</>
}
```

Constraints:
- MUST use `createClient()` from `@/lib/supabase/client` (the Plan 01 singleton) — NOT a fresh client — otherwise setAuth would target a throwaway socket.
- Do NOT make the onAuthStateChange callback `async`. Use `void supabase.realtime.setAuth(...)` (D-05).
- Do NOT log `session.access_token` or any token (threat T-rib-03). No `console.log` of the session.
- The effect deps array is `[]` (mount once). `createClient()` is a stable singleton so this is safe.
- Provider renders `<>{children}</>` so it can wrap part of the tree without adding DOM.
  </action>
  <acceptance_criteria>
    - File `src/components/providers/realtime-auth-provider.tsx` exists
    - `grep -c "'use client'" src/components/providers/realtime-auth-provider.tsx` returns `1`
    - `grep -c "onAuthStateChange" src/components/providers/realtime-auth-provider.tsx` returns `1`
    - `grep -c "realtime.setAuth(session?.access_token)" src/components/providers/realtime-auth-provider.tsx` returns `1`
    - `grep -c "TOKEN_REFRESHED" src/components/providers/realtime-auth-provider.tsx` returns `1`
    - `grep -c "subscription.unsubscribe" src/components/providers/realtime-auth-provider.tsx` returns `1`
    - `grep -c "access_token" src/components/providers/realtime-auth-provider.tsx` returns exactly `1` (only the setAuth arg — NO token logging)
    - `grep -ci "console.log" src/components/providers/realtime-auth-provider.tsx` returns `0`
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -i "realtime-auth-provider" || echo "no provider type errors"</automated>
  </verify>
  <done>Provider exists, wires onAuthStateChange→realtime.setAuth with the singleton, cleans up the subscription, logs no token, typechecks.</done>
</task>

<task type="auto">
  <name>Task 2: Mount RealtimeAuthProvider once in the dashboard layout</name>
  <read_first>
    - src/app/(dashboard)/layout.tsx (the file being modified — server component, current provider nesting QueryProvider > WorkspaceProvider > DashboardV2Provider)
    - src/components/providers/realtime-auth-provider.tsx (just created in Task 1)
  </read_first>
  <files>src/app/(dashboard)/layout.tsx</files>
  <action>
Mount `RealtimeAuthProvider` exactly once inside the dashboard tree so the setAuth wiring runs for every authenticated dashboard page.

Steps:
1. Add the import near the other provider imports:
   `import { RealtimeAuthProvider } from '@/components/providers/realtime-auth-provider'`
2. Wrap the existing dashboard subtree with `<RealtimeAuthProvider>`. Place it just INSIDE `<QueryProvider>` (so it has access to the same React tree) and around `<WorkspaceProvider>...</WorkspaceProvider>`. Resulting nesting:

```tsx
return (
  <QueryProvider>
    <RealtimeAuthProvider>
      <WorkspaceProvider workspace={currentWorkspace} workspaces={workspaces}>
        <DashboardV2Provider v2={isDashboardV2}>
          {/* ...existing flex container + Sidebar + main... */}
        </DashboardV2Provider>
      </WorkspaceProvider>
    </RealtimeAuthProvider>
  </QueryProvider>
)
```

Constraints:
- The layout stays a server component; `RealtimeAuthProvider` is the `'use client'` boundary — a client component rendered by a server component is valid (same as QueryProvider already does here).
- Mount it exactly ONCE (D-04). Do NOT add it to any individual hook or page.
- Do not alter the existing `Sidebar`/`main`/`flex h-screen` markup, the auth `redirect('/login')`, or the workspace resolution logic.
  </action>
  <acceptance_criteria>
    - `grep -c "import { RealtimeAuthProvider }" src/app/(dashboard)/layout.tsx` returns `1`
    - `grep -c "<RealtimeAuthProvider>" src/app/(dashboard)/layout.tsx` returns `1`
    - `grep -c "</RealtimeAuthProvider>" src/app/(dashboard)/layout.tsx` returns `1`
    - `<RealtimeAuthProvider>` appears INSIDE `<QueryProvider>` and wraps `<WorkspaceProvider>` (verify by reading the returned JSX)
    - `pnpm build` completes successfully (server/client component boundary valid)
    - `git diff src/app/(dashboard)/layout.tsx` shows ONLY the import + the two wrapper tags added (no other logic touched)
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && echo "TYPECHECK OK"</automated>
  </verify>
  <done>RealtimeAuthProvider mounted once inside QueryProvider, wrapping the workspace subtree; build green; layout logic otherwise untouched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → Realtime socket | JWT re-injected via setAuth authenticates the socket; RLS still evaluated server-side |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rib-03 | Information Disclosure | RealtimeAuthProvider | mitigate | Never `console.log` the session/access_token. setAuth receives `session?.access_token` only; acceptance criteria assert zero console.log and exactly one `access_token` occurrence (the setAuth arg). |
| T-rib-04 | Elevation of Privilege | realtime.setAuth | accept | setAuth injects the CURRENT user's session token only — it cannot widen access. RLS re-evaluates the token server-side (V3). No privilege change. |
| T-rib-05 | Denial of Service | onAuthStateChange listener | mitigate | Subscription cleaned up via `subscription.unsubscribe()` on unmount; mounted once → no listener accumulation/leak. |
</threat_model>

<verification>
- `pnpm typecheck` / `npx tsc --noEmit` exits 0.
- `pnpm build` green (client-in-server boundary valid).
- grep acceptance criteria above all pass.
- No token logging (`console.log` count 0 in the provider).
</verification>

<success_criteria>
- TOKEN_REFRESHED/SIGNED_IN re-injects the fresh access_token into the shared socket via `realtime.setAuth(session?.access_token)`.
- Wiring mounted exactly once in the dashboard layout.
- Subscription cleaned up; no token logged.
- This is the primary fix for root cause 2a; live validation deferred to Plan 04 MANUAL UAT (scenario 1, 65-min JWT expiry).
</success_criteria>

<output>
After completion, create `.planning/standalone/realtime-inbox-badge/02-SUMMARY.md`.
After code changes, commit atomically and push to Vercel (Regla 1):
`git add src/components/providers/realtime-auth-provider.tsx "src/app/(dashboard)/layout.tsx" && git commit && git push origin main`
Co-author: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
</output>
