---
phase: standalone-realtime-inbox-badge
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/supabase/client.ts
autonomous: true
requirements:
  - CAPA1-SINGLETON
user_setup: []

must_haves:
  truths:
    - "All 12 consumers of @/lib/supabase/client share one browser Supabase client (one multiplexed WebSocket)"
    - "Calling createClient() twice in the browser returns the exact same instance"
    - "The createClient() signature is unchanged so all existing call-sites keep compiling"
  artifacts:
    - path: "src/lib/supabase/client.ts"
      provides: "Memoized browser-client singleton mirroring get-query-client.ts"
      contains: "browserClient ??="
  key_links:
    - from: "src/lib/supabase/client.ts"
      to: "@supabase/ssr createBrowserClient"
      via: "single memoized instance"
      pattern: "browserClient \\?\\?="
---

<objective>
Convert `createClient()` in `src/lib/supabase/client.ts` into a memoized browser-client singleton (D-03), mirroring the exact pattern of `src/app/get-query-client.ts`. This is the prerequisite for Capa 1 setAuth (Plan 02): a single `supabase.realtime.setAuth()` call can only re-authenticate every hook's socket if all hooks share ONE Supabase client / ONE multiplexed WebSocket.

Purpose: today each of the 12 consumers calls `createClient()` and gets its OWN client + OWN WebSocket. A global setAuth wiring (Plan 02) would only affect one of them. The singleton makes the realtime socket shared and gives Plan 02 a single point of auth re-injection.

Output: `src/lib/supabase/client.ts` returning a memoized singleton in the browser, signature unchanged (`createClient()` → `SupabaseClient`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/realtime-inbox-badge/CONTEXT.md
@.planning/debug/realtime-inbox-badge.md

<interfaces>
<!-- The singleton pattern to mirror — from src/app/get-query-client.ts -->
```ts
let browserQueryClient: QueryClient | undefined
export function getQueryClient() {
  if (isServer) return makeQueryClient()
  return (browserQueryClient ??= makeQueryClient())
}
```

<!-- Current (non-singleton) client — from src/lib/supabase/client.ts -->
```ts
'use client'
import { createBrowserClient } from '@supabase/ssr'
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

<!-- Confirmed library facts (CONTEXT.md D-05, debug file): -->
<!-- @supabase/supabase-js@2.95.3 + @supabase/realtime-js@2.95.2 -->
<!-- supabase.realtime.setAuth(token?: string | null): Promise<void>  — async, optional token -->
<!-- The SupabaseClient type comes from @supabase/supabase-js -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Convert createClient() into a memoized browser singleton</name>
  <read_first>
    - src/lib/supabase/client.ts (the file being modified — current 10-line non-singleton version)
    - src/app/get-query-client.ts (source-of-truth singleton memoization pattern to mirror EXACTLY)
  </read_first>
  <files>src/lib/supabase/client.ts</files>
  <action>
Rewrite `src/lib/supabase/client.ts` to memoize the browser client. Keep the `'use client'` directive and the EXACT exported signature `export function createClient()` so all 12 call-sites keep working with zero changes.

Concrete shape (mirror get-query-client.ts `browserQueryClient ??= ...`):

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

// Browser-client singleton (mirrors get-query-client.ts).
// All consumers of @/lib/supabase/client share ONE Supabase client and thus
// ONE multiplexed Realtime WebSocket. This is the prerequisite for Capa 1:
// a single supabase.realtime.setAuth() (Plan 02) re-authenticates every hook's
// socket at once. This module is 'use client', so the singleton is per-browser
// (never shared across users) and per-tab (browser-scoped) — safe.
let browserClient: SupabaseClient | undefined

export function createClient(): SupabaseClient {
  return (browserClient ??= makeBrowserClient())
}
```

Notes / constraints:
- Do NOT add realtime config params (heartbeat/reconnect overrides) — out of scope; defaults are fine. The fix is setAuth (Plan 02) + browser-event reconnect (Plan 03), NOT socket tuning.
- Do NOT change the function name or add required parameters — the 12 call-sites call `createClient()` with no args.
- This module is `'use client'`; it only ever runs in the browser. No `isServer` branch is needed here (unlike get-query-client.ts which can run on the server). A single module-level `let` is the correct browser singleton.
- Import `SupabaseClient` as a type from `@supabase/supabase-js` (it is a transitive dep of @supabase/ssr and a direct dep `^2.93.1` per package.json) so the return type is explicit and downstream `supabase.realtime` / `supabase.auth` are typed.
  </action>
  <acceptance_criteria>
    - `grep -c "browserClient ??=" src/lib/supabase/client.ts` returns `1`
    - `grep -c "export function createClient" src/lib/supabase/client.ts` returns `1`
    - `grep -c "'use client'" src/lib/supabase/client.ts` returns `1`
    - `grep -c "import type { SupabaseClient }" src/lib/supabase/client.ts` returns `1`
    - `grep -c "let browserClient" src/lib/supabase/client.ts` returns `1`
    - `pnpm typecheck` (or `npx tsc --noEmit` if no typecheck script) passes with no new errors
    - `pnpm lint` passes (no new lint errors in client.ts)
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -i "src/lib/supabase/client.ts" || echo "no client.ts type errors"</automated>
  </verify>
  <done>createClient() returns a memoized singleton in the browser; signature unchanged; typecheck + lint clean.</done>
</task>

<task type="auto">
  <name>Task 2: Verify all 12 consumers still compile against the singleton (no call-site changes)</name>
  <read_first>
    - src/lib/supabase/client.ts (post-Task-1 singleton)
    - src/hooks/use-conversations.ts (a representative realtime consumer — line 22 import, line 299 createClient())
    - src/hooks/use-messages.ts (React Query consumer — line 26 import, line 226 createClient())
  </read_first>
  <files>(verification only — no source edits expected)</files>
  <action>
No code changes. This task is a build-wide regression gate confirming the singleton swap broke nothing across the 12 call-sites (4-5 realtime hooks + auth forms + toggles). The contract is: signature unchanged → every existing `createClient()` call still type-checks and behaves identically except that the returned client is now shared.

Run a full typecheck + build. If any consumer fails to compile, the singleton change introduced a regression — fix it in this task (the expected outcome is ZERO consumer edits, because the signature is preserved).

Sanity-confirm the consumer list is exactly the 12 expected files:
`grep -rln "from '@/lib/supabase/client'" src/`
Expected: use-conversations.ts, use-messages.ts, use-kanban-realtime.ts, use-robot-job-progress.ts, use-metricas-realtime.ts, chat-view.tsx, contact-panel.tsx, availability-toggle.tsx, login-form.tsx, signup-form.tsx, forgot-password-form.tsx, reset-password-form.tsx.
  </action>
  <acceptance_criteria>
    - `grep -rln "from '@/lib/supabase/client'" src/ | wc -l` returns `12`
    - `pnpm typecheck` (or `npx tsc --noEmit`) exits 0
    - `pnpm build` completes successfully (Next.js build green)
    - `git diff --name-only` shows ONLY `src/lib/supabase/client.ts` changed (no consumer file edits needed)
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && echo "TYPECHECK OK"</automated>
  </verify>
  <done>Full typecheck + build green; the only changed source file is client.ts; consumer list is exactly 12.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → Supabase Realtime socket | JWT carried in phx_join authenticates the socket; RLS evaluated server-side per V3 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rib-01 | Information Disclosure | browser-client singleton | accept | Singleton is module-level in a `'use client'` file → per-browser, per-tab. One user per browser; no cross-user auth leakage. No new secrets, no token logged. |
| T-rib-02 | Elevation of Privilege | shared Realtime socket | accept | Sharing the socket does NOT widen access — RLS still evaluates the current JWT server-side (V3). The singleton changes transport multiplexing only, not authorization. |
</threat_model>

<verification>
- `pnpm typecheck` / `npx tsc --noEmit` exits 0.
- `pnpm build` green.
- `pnpm lint` clean for client.ts.
- `git diff --name-only` = `src/lib/supabase/client.ts` only.
</verification>

<success_criteria>
- createClient() returns a single memoized browser instance (`browserClient ??=`).
- Signature `createClient(): SupabaseClient` unchanged; 12 consumers compile unchanged.
- Foundation in place for Plan 02 setAuth wiring (single shared socket).
</success_criteria>

<output>
After completion, create `.planning/standalone/realtime-inbox-badge/01-SUMMARY.md`.
After code changes, commit atomically and push to Vercel (Regla 1):
`git add src/lib/supabase/client.ts && git commit && git push origin main`
Co-author: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
</output>
