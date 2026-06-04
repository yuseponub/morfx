# Standalone: Realtime Inbox Badge — Research (token-before-subscribe fix)

**Researched:** 2026-06-03
**Domain:** Supabase Realtime auth lifecycle in a Next.js 16 App Router + `@supabase/ssr` browser singleton
**Confidence:** HIGH (root cause + mechanism verified by reading installed package source; A/B repro already proven on disk)

## Summary

The confirmed root cause is **token-ordering**: the browser's Realtime channels (`use-conversations.ts` inbox + `use-messages.ts`) subscribe in a `useEffect` that runs at mount, BEFORE the user's JWT has been applied to the shared Realtime socket. RLS policies (`is_workspace_member(auth.uid())`) evaluate the socket's token; with the anon token, `auth.uid()` is null, so the server silently drops every `postgres_changes` event while the channel still reports `SUBSCRIBED`. This is continuous (every page load), not idle-death. Proven by `scripts/_diag-token-order.ts` Phase A (anon subscribe → 0/N events) and by the Node replica of the exact browser channel receiving everything <1s once `setAuth(userJWT)` ran first.

I read the **installed** package source to settle the fix. Two findings are decisive:

1. **`@supabase/supabase-js@2.95.3` already wires a callback-based token getter into Realtime.** In the `SupabaseClient` constructor (`node_modules/@supabase/supabase-js/dist/index.cjs:221-226`) `this.realtime = this._initRealtimeClient({ accessToken: this._getAccessToken.bind(this) })` is set **unconditionally**, and `_getAccessToken` reads `auth.getSession()` when no manual override exists. In `@supabase/realtime-js@2.95.2`, `_onConnOpen` (`RealtimeClient.js:551-566`) **awaits `this.setAuth()` (which invokes that callback) before `flushSendBuffer()`** — i.e. the socket fetches the freshest session token and stamps it into the channel join payload BEFORE the `phx_join` is sent, *as long as the socket connects after a session exists in cookie storage*. The bug is a race, not a missing feature: the channel's `subscribe()` runs before the session is hydrated/connected, so the first join goes out with the anon fallback.

2. **The `accessToken` option (Option 1) is INCOMPATIBLE with `@supabase/ssr` + this shared singleton.** When `accessToken` is provided, supabase-js replaces `supabase.auth` with a Proxy that **throws** `"Supabase Client is configured with the accessToken option, accessing supabase.auth.* is not possible"` (`index.cjs:215-219`) and skips cookie-based session management entirely (`if (!settings.accessToken) this._initSupabaseAuthClient(...)`, `index.cjs:211-219`). Our singleton is shared by `use-conversations.ts` (`supabase.auth.getUser()`) and all 4 auth forms (`signInWithPassword`, etc.) — every one would throw. Supabase's own docs confirm `accessToken` is the third-party-auth path and must not be combined with `@supabase/ssr` native auth.

**Primary recommendation:** **Option 2 — make the singleton self-prime its Realtime token before any channel subscribes, and gate the hooks' `subscribe()` behind an "auth-ready" signal.** Keep native `@supabase/ssr` cookie auth intact. Concretely: (a) on first creation of the browser singleton, kick off `realtime.setAuth()` (no-arg = read current session) and expose a `whenRealtimeAuthReady()` promise; (b) in each realtime hook, `await whenRealtimeAuthReady()` (or await a small "session present" check) before calling `.subscribe()`. This guarantees the socket connects/joins with the user JWT on the very first subscribe. Do NOT rely on Option 1 (`accessToken`) and do NOT rely on re-subscribe-after-setAuth (Option 3 — proven `TIMED_OUT`).

---

## User Constraints (from CONTEXT.md)

> Note: CONTEXT.md predates the confirmed "token-before-subscribe" root cause (it was written for the layered token-expiry/idle theory). Where the new root cause supersedes a decision, this research flags it explicitly. The locked anti-regression decisions (D-10..D-15) stand unchanged.

### Locked Decisions (still binding)
- **D-03:** `createClient()` is a memoized browser singleton mirroring `get-query-client.ts`. **ALREADY DONE** — `src/lib/supabase/client.ts` already implements `browserClient ??= makeBrowserClient()`. The fix builds ON this singleton (it is the single point where Realtime auth is primed).
- **D-04:** Auth-refresh wiring mounted ONCE globally (`RealtimeAuthProvider` in the dashboard layout). **PARTIALLY SUPERSEDED** — the `onAuthStateChange → setAuth` on `TOKEN_REFRESHED`/`SIGNED_IN` is still correct for the ~1h JWT-expiry case, but it is INSUFFICIENT for the real bug (it fires AFTER subscribe). See "Impact on existing fix" below: keep it, but it is no longer the primary mechanism.
- **D-05:** `setAuth(token?: string | null): Promise<void>` — async, token optional. **VERIFIED** against installed `@supabase/realtime-js@2.95.2` source (`RealtimeClient.js:330`). No-arg form reads the current token via the `accessToken` callback (`_performAuth`, `RealtimeClient.js:685-707`).
- **D-10:** Do NOT remove the `contact_tags` listener (`use-conversations.ts:371-396`). Regression guard from `f57386ef`.
- **D-11:** No DB migration / no publication or RLS mutation. DB verified clean (V1-V4).
- **D-12:** Capa 4 (double UPDATE in `messages.ts:428-437`) explicitly DEFERRED — do not touch.
- **D-13:** Frontend infra change, not agent behavior (Regla 6 N/A to agents). Affects all dashboard users; not per-workspace flaggable. Mitigation: additive, reversible via git, validate in preview before prod.
- **D-14:** KEEP the `[realtime:*]` + `New message received:` logging until the fix is confirmed in prod. It is the live evidence channel for verification. Remove only as a final cleanup.
- **D-15 (QA):** Validate with a **manager** account. `conversations_role_based_select` is role-based (`is_workspace_member AND (is_workspace_manager OR assigned_to = auth.uid() OR assigned_to IS NULL)`); a non-manager legitimately does NOT receive realtime for other agents' conversations. This is correct RLS, not the bug — do not confuse the two.

### Claude's Discretion
- Exact wave/plan structure, new file names, provider shape (component vs effect), watchdog params, and whether Capa 2 covers kanban/metricas in V1.

### Deferred Ideas (OUT OF SCOPE)
- Capa 4 double-UPDATE cleanup (`messages.ts:428-437`) — separate mini-plan.
- Extend `useRealtimeReconnect` to kanban + metricas if not in V1.
- Remove temporary `[realtime:*]` logging post-prod-confirmation.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RQ-1 | Token on socket BEFORE any channel subscribes | Option 2 (gate subscribe behind `whenRealtimeAuthReady`) — supabase-js `_onConnOpen` awaits setAuth before flushing joins (`RealtimeClient.js:551-566`); priming setAuth at singleton creation + awaiting it in hooks closes the race |
| RQ-2 | Decide fate of `RealtimeAuthProvider` + `useRealtimeReconnect` | RealtimeAuthProvider: KEEP (token-refresh ~1h still real), now secondary. `useRealtimeReconnect`: KEEP-SIMPLIFY (tab-sleep/network recovery still valuable; not the primary fix) |
| RQ-3 | React #418 hydration mismatch on `/whatsapp` | Verdict: INDEPENDENT of realtime; most likely a date-fns `format()` text node (timezone-sensitive) in an SSR'd subtree — NOT the already-hydration-safe `RelativeTime`. Diagnose source, fix with deterministic TZ formatting or client-only render |
| RQ-4 | Local verification harness with PASS criteria | Adapt `scripts/_diag-browser-repro2.ts` to point at `localhost:3020`; PASS = browser logs `[realtime:inbox]` within <2s of service-role ground-truth on a fresh load |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Realtime socket auth (token on socket) | Browser / Client (supabase-js singleton) | — | The WebSocket lives in the browser; only the client can call `realtime.setAuth` / gate `subscribe()` |
| Session/JWT source of truth | Frontend Server (SSR cookies via `@supabase/ssr`) | Browser (reads cookie storage) | `@supabase/ssr` persists the session in cookies; the browser client hydrates from them |
| RLS enforcement on realtime events | Database (Postgres RLS + `supabase_realtime` publication) | — | `is_workspace_member(auth.uid())` evaluated server-side against the socket's JWT |
| Reconnect on tab/network events | Browser / Client (`useRealtimeReconnect`) | — | Browser lifecycle events (visibilitychange/online) only exist client-side |
| SSR text rendering (#418) | Frontend Server (RSC) + Browser (hydration) | — | Mismatch is a server-render vs client-hydrate text divergence |

---

## Standard Stack

### Core (installed — verified)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | **2.95.3** `[VERIFIED: node_modules/.../package.json]` | Client + Realtime orchestration | Wires `accessToken` getter into Realtime unconditionally |
| `@supabase/realtime-js` | **2.95.2** `[VERIFIED]` | WebSocket/Phoenix channels | `setAuth` + `_onConnOpen` auth-before-join logic lives here |
| `@supabase/ssr` | **0.8.0** `[VERIFIED]` | Cookie-based session for App Router | `createBrowserClient` spreads options but FORCES `auth` config; incompatible with `accessToken` option |
| `next` | **16.1.6** `[VERIFIED: package.json:75]` | App Router (NOTE: 16, not 15) | RSC SSR boundary relevant to #418 |
| `react` / `react-dom` | **19.2.3** `[VERIFIED]` | Hydration | #418 = hydration text mismatch in React 19 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | 5.101.0 `[VERIFIED]` | Chat message cache (`use-messages.ts`) | The chat re-sync model; inbox uses `useState` instead |
| `date-fns` | 4.1.0 `[VERIFIED]` | `format`/`differenceIn*` | `format(...,'HH:mm')` is timezone-sensitive → #418 candidate |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Option 2 (gate subscribe behind setAuth-ready) | Option 1 `accessToken` callback | **REJECTED** — breaks `@supabase/ssr` native auth: `supabase.auth.*` becomes a throwing Proxy, killing the 4 auth forms + `use-conversations.ts:179` `getUser()`. Supabase docs: third-party-auth only, do not combine with ssr. |
| Option 2 | Option 3 re-subscribe after setAuth | **REJECTED as primary** — `_diag-token-order.ts` Phase C gave `TIMED_OUT`; re-subscribing on-the-fly is fragile. |

**Installation:** None — all packages already installed. No new dependencies. No migration (D-11).

**Version verification:**
```bash
# already run — confirmed:
cat node_modules/@supabase/supabase-js/package.json | grep version   # 2.95.3
cat node_modules/@supabase/realtime-js/package.json | grep version   # 2.95.2
cat node_modules/@supabase/ssr/package.json | grep version           # 0.8.0
```

---

## Architecture Patterns

### System Architecture Diagram (the race + the fix)

```
CURRENT (broken) — every page load:

  /whatsapp mount
       │
       ├─ useConversations useEffect ──> supabase.channel('inbox:..').subscribe()
       │        │                                  │
       │        │   socket not yet authed ─────────┘  phx_join carries ANON token
       │        ▼
       │   RLS: is_workspace_member(null) = false ──> server DROPS all events  ❌ (SUBSCRIBED but mute)
       │
       └─ RealtimeAuthProvider onAuthStateChange(SIGNED_IN) ──> realtime.setAuth()
                  │  (fires LATER, channel already joined with anon)
                  ▼
            setAuth pushes access_token to an already-joined channel — does NOT revive it (Phase B = 0)


FIXED (Option 2) — token primed before subscribe:

  browser singleton created
       │
       ├─ realtime.setAuth()  (no-arg: reads session from @supabase/ssr cookie storage)
       │        │
       │        ▼  resolves -> whenRealtimeAuthReady() ready
       │
  /whatsapp mount
       │
       ├─ useConversations useEffect:
       │        await whenRealtimeAuthReady()  ──> THEN channel('inbox:..').subscribe()
       │                                                  │
       │                                                  ▼  phx_join carries USER JWT
       │   RLS: is_workspace_member(auth.uid()) = true ──> events DELIVERED <1s  ✅
       │
       └─ RealtimeAuthProvider (kept): setAuth on TOKEN_REFRESHED keeps it fresh past ~1h
       └─ useRealtimeReconnect (kept): resync on tab-return / online — defense in depth
```

### Recommended Project Structure (touch list)
```
src/lib/supabase/client.ts          # add: prime setAuth at singleton creation + export whenRealtimeAuthReady()
src/hooks/use-conversations.ts      # await whenRealtimeAuthReady() before .subscribe()
src/hooks/use-messages.ts           # await whenRealtimeAuthReady() before .subscribe()
src/components/providers/realtime-auth-provider.tsx   # KEEP (secondary, token-refresh path)
src/hooks/use-realtime-reconnect.ts # KEEP (simplify optional) — tab/network recovery
src/app/(dashboard)/whatsapp/components/<the #418 source>  # deterministic TZ formatting / client-only
```

### Pattern 1: Prime Realtime auth at singleton creation + expose a readiness promise
**What:** When the browser singleton is first created, immediately call `realtime.setAuth()` (no-arg) so the socket holds the user JWT, and expose a promise consumers can await before subscribing.
**When to use:** Any client that has long-lived RLS-filtered Realtime channels subscribed in `useEffect`s at mount.
**Example (exact code for `src/lib/supabase/client.ts`):**
```ts
// Source: derived from @supabase/realtime-js@2.95.2 RealtimeClient.js:330 (setAuth)
//         + RealtimeClient.js:551-566 (_onConnOpen awaits setAuth before flushSendBuffer)
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
    // accessToken callback (which reads @supabase/ssr cookie storage). It is a
    // no-op-safe call if no session yet; whenRealtimeAuthReady() lets hooks wait
    // for it to resolve. We never log the token (threat: token leakage).
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

> **Open design point (Claude's discretion at plan time):** `setAuth()` at singleton-creation primes the token, but on a hard load the `@supabase/ssr` session may still be hydrating from cookies when `createClient()` first runs in a hook. Two robustness options to decide in planning:
> - (a) In `whenRealtimeAuthReady`, additionally `await supabase.auth.getSession()` (or a short retry) so priming uses a guaranteed-present session, then `setAuth()`.
> - (b) Have each hook do `await supabase.auth.getSession()` itself, then `await supabase.realtime.setAuth(session.access_token)` (explicit token), then `.subscribe()`. This is the most defensive and matches the proven Node repro exactly (explicit token → `phx_join` with user JWT → events <1s).
>
> Recommendation: prefer (b)'s explicit-token form inside the hooks for determinism, with `whenRealtimeAuthReady()` as a coarse gate. The plan should pick one and apply it identically in both hooks.

### Pattern 2: Gate `subscribe()` in the hook behind auth-ready
**What:** Wrap the existing realtime `useEffect` body so `.subscribe()` only runs after the token is on the socket.
**Example (shape for `use-conversations.ts` / `use-messages.ts`):**
```ts
// Source: pattern for the existing useEffect in use-conversations.ts:302-474
useEffect(() => {
  if (!workspaceId) return
  const supabase = createClient()
  let channel: ReturnType<typeof supabase.channel> | null = null
  let cancelled = false

  ;(async () => {
    // Token-before-subscribe: guarantee the socket holds the user JWT first.
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      await supabase.realtime.setAuth(session.access_token)
    }
    if (cancelled) return

    channel = supabase
      .channel(`inbox:${workspaceId}`)
      .on('postgres_changes', /* ...existing 4 bindings UNCHANGED (D-10 contact_tags stays)... */)
      .subscribe(/* ...existing status handler with [realtime:inbox] logging (D-14)... */)
  })()

  return () => {
    cancelled = true
    if (channel) supabase.removeChannel(channel)
    if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [workspaceId])
```

### Anti-Patterns to Avoid
- **Option 1 `accessToken` callback on the shared singleton:** throws on every `supabase.auth.*` call (auth forms + `getUser()`). Hard break.
- **Re-subscribe after setAuth as the primary mechanism:** `TIMED_OUT` in Phase C; fragile.
- **Removing the `contact_tags` listener** (regression of `f57386ef`, D-10).
- **Calling `realtime.setAuth(token)` while ALSO using the `accessToken` option:** they conflict — `_performAuth` treats an explicit token as a manual override and stops using the callback (`RealtimeClient.js:685-715`), and the `accessToken` Proxy already broke `auth`. Never combine.
- **Logging the access token** in any priming/setAuth path (token leakage).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fetch fresh token for the socket join | A manual token cache + expiry timer | supabase-js's built-in `accessToken` getter + `setAuth()` | `_onConnOpen` already awaits the callback before flushing joins (`RealtimeClient.js:551-566`); reinventing risks the same race |
| Keep token fresh past ~1h | Custom refresh loop | The KEPT `RealtimeAuthProvider` (`onAuthStateChange → setAuth` on `TOKEN_REFRESHED`) | Already correct for the expiry case; just no longer the primary fix |
| Reconnect on tab/network | Manual socket teardown/reconnect | The KEPT `useRealtimeReconnect` (visibilitychange/online + watchdog) | Already debounced/ref-stable; reconciles both `useState` (inbox) and React Query (chat) state models |

**Key insight:** The platform already ships every primitive needed. The bug is purely *ordering* — when the socket first joins relative to when the session token is available. The minimal correct fix is to enforce that ordering, not to add machinery.

---

## Common Pitfalls

### Pitfall 1: Priming setAuth before the cookie session is hydrated
**What goes wrong:** `createClient()` runs in a hook at mount; `@supabase/ssr` may not have hydrated the session from cookies yet, so `setAuth()` primes with no token and the first join is still anon.
**Why it happens:** Cookie → in-memory session hydration is async on hard loads.
**How to avoid:** Inside the hook, `await supabase.auth.getSession()` and pass `session.access_token` explicitly to `setAuth` before `.subscribe()` (Pattern 1 option (b)). Don't assume the no-arg prime already resolved with a token.
**Warning signs:** First `[realtime:inbox] status: SUBSCRIBED` arrives but zero `conversation` events follow on a fresh load.

### Pitfall 2: Removing RealtimeAuthProvider thinking Option 2 makes it redundant
**What goes wrong:** Past ~1h the JWT expires; without the `TOKEN_REFRESHED → setAuth` wiring the socket silently goes mute again (the original 2a).
**Why it happens:** Option 2 fixes the *initial* token; it does not refresh it hourly.
**How to avoid:** KEEP `RealtimeAuthProvider`. It is now the *secondary* (refresh) layer, not the primary.
**Warning signs:** Inbox works on load, dies after ~1h of an open tab.

### Pitfall 3: StrictMode/double-mount re-running the async subscribe
**What goes wrong:** Dev StrictMode mounts effects twice; the async IIFE can create two channels or subscribe after unmount.
**Why it happens:** React 19 dev double-invokes effects.
**How to avoid:** The `cancelled` flag + `removeChannel` in cleanup (Pattern 2) guards this. Verify in the harness that exactly one `inbox:` channel ends up subscribed.
**Warning signs:** Duplicate `[realtime:inbox] status` logs / duplicate events in dev.

### Pitfall 4: `setAuth(token)` flips the client to "manual token" mode and stops auto-refresh
**What goes wrong:** Passing an explicit token sets `_manuallySetToken = true` (`RealtimeClient.js:709-715`); subsequent no-arg refreshes are skipped by `_setAuthSafely` (`RealtimeClient.js:744-749`) until a no-arg `setAuth()` is called.
**Why it happens:** The library distinguishes manual vs callback tokens.
**How to avoid:** When `RealtimeAuthProvider` refreshes on `TOKEN_REFRESHED`, it currently passes `session?.access_token` (explicit). That is fine because it re-fires on every refresh. But the *initial* prime in `client.ts` should use **no-arg `setAuth()`** (callback mode) so the socket's own heartbeat/reconnect auth (`_setAuthSafely`) keeps working. The hook's defensive explicit `setAuth(session.access_token)` is acceptable since the provider re-asserts on every refresh — but document this interaction so a future edit doesn't break auto-refresh.
**Warning signs:** Token never refreshes after the first manual set; mute returns at ~1h.

---

## Code Examples

### Verify the auth-before-join behavior in installed source
```ts
// Source: node_modules/@supabase/realtime-js/dist/main/RealtimeClient.js:551-566
_onConnOpen() {
  this._setConnectionState('connected');
  // Wait for any pending auth operations before flushing send buffer
  // This ensures channel join messages include the correct access token
  const authPromise = this._authPromise ||
    (this.accessToken && !this.accessTokenValue ? this.setAuth() : Promise.resolve());
  authPromise.then(() => { this.flushSendBuffer(); }) // joins flushed AFTER auth
            .catch(() => { this.flushSendBuffer(); });
}
```

### The conflict that rules out Option 1
```ts
// Source: node_modules/@supabase/supabase-js/dist/index.cjs:211-219
if (!settings.accessToken) {
  this.auth = this._initSupabaseAuthClient(settings.auth, ...); // cookie auth path
} else {
  this.accessToken = settings.accessToken;
  this.auth = new Proxy({}, { get: (_, prop) => {
    throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(prop)} is not possible`);
  }});
}
```

---

## React #418 Diagnosis (RQ-3)

**Verdict: #418 is INDEPENDENT of the realtime bug.** Realtime delivery is a WebSocket concern; #418 is an SSR-vs-hydration text mismatch. Even with #418 present, the Node-replica + the proven token-order A/B show realtime works the instant the token is correct. #418 does not gate or kill the socket. Fix it for correctness/cleanliness, but it is not on the realtime critical path. `[CITED: react.dev — error #418 "Text content does not match server-rendered HTML"]`

**What it is NOT:** the inbox conversation-list timestamp. `src/components/ui/relative-time.tsx` is already hydration-safe — it renders `''` until `mounted` (`useEffect(() => setMounted(true))`) and uses `suppressHydrationWarning` (`relative-time.tsx:31-47`). Both `RelativeTime` usages in `conversation-item.tsx:219,222` are therefore clean.

**Most likely source (to confirm at plan time):** a timezone-sensitive `date-fns` text node rendered in an SSR'd subtree. The strongest concrete candidate is `src/app/(dashboard)/whatsapp/components/message-bubble.tsx:168` — `format(new Date(message.timestamp), 'HH:mm', { locale: es })`. `date-fns format` uses the **runtime local timezone**: Vercel server = UTC, client = America/Bogota (UTC-5) → the rendered `HH:mm` differs by one hour → text mismatch. (Caveat: messages are client-fetched via `useMessages`, so the bubble may not actually SSR; verify whether any message text SSRs. If not, look next at `view-order-sheet.tsx:515` `toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })` — that one IS TZ-pinned and safe — and at any server component rendering a date without a fixed `timeZone`.)

**Fix patterns (pick per the actual node):**
1. **Deterministic TZ formatting (preferred where a date must SSR):** always pass `{ timeZone: 'America/Bogota' }` to `Intl`/`toLocale*`, or use a TZ-aware formatter so server and client produce identical strings. This project mandates `America/Bogota` (CLAUDE.md Regla 2) — any unpinned `format`/`toLocale*` is a latent #418.
2. **Client-only render (where the value is inherently "now"-relative):** the `RelativeTime` pattern (render empty until mounted + `suppressHydrationWarning`). Reuse it for any other relative-time node.
3. **`suppressHydrationWarning`** on a single leaf text node only — never as a blanket silencer over a subtree.

**Plan-time action:** add a step to reproduce #418 locally (it appears on every `/whatsapp` load per the diagnosis), read the React error's component stack to pin the exact node, then apply pattern 1 or 2. Do not blanket-suppress.

---

## Impact on Existing Fix (RQ-2)

| Component | Decision | Rationale |
|-----------|----------|-----------|
| `src/lib/supabase/client.ts` singleton | **KEEP + EXTEND** | Already the single shared socket (D-03 done). Add the prime-setAuth + `whenRealtimeAuthReady()` (Pattern 1). |
| `RealtimeAuthProvider` (`realtime-auth-provider.tsx`) | **KEEP (now secondary)** | The `TOKEN_REFRESHED/SIGNED_IN → setAuth` wiring is still required for the ~1h JWT-expiry case (original 2a). It is NOT removed (it never conflicted — that conflict only exists with Option 1's `accessToken` option, which we are NOT adopting). It simply is no longer the primary mechanism. **If Option 1 had been chosen it would HAVE to be removed; since we choose Option 2, it stays.** |
| `useRealtimeReconnect` (`use-realtime-reconnect.ts`) | **KEEP (optionally simplify)** | Tab-sleep (visibilitychange) + network (online) recovery are still genuine holes the socket alone doesn't cover; the watchdog is cheap defense-in-depth for any residual mute. Once token-before-subscribe lands, its job shrinks to true tab/network recovery rather than masking the startup bug. Keep as-is for V1; consider reducing the 45s watchdog only after prod confirms the primary fix. |
| `use-conversations.ts` / `use-messages.ts` | **EDIT (gate subscribe)** | Add `await getSession()/setAuth` before `.subscribe()` (Pattern 2). Preserve all 4 bindings incl. `contact_tags` (D-10) and keep `[realtime:*]` logging (D-14). |

**Anti-regression preserved:** D-10 (contact_tags binding untouched), D-14 (logging stays until prod-confirmed), D-11 (no DB change).

---

## Verification Architecture (RQ-4)

> `workflow.nyquist_validation` is not configured for this standalone (frontend infra). There is no unit-test harness for WebSocket auth timing; verification is an integration harness against a real browser + service-role ground truth. The harness scripts already exist on disk.

### Local harness (MANDATORY before any deploy — user demand: no blind deploys)
1. Run the app locally: `pnpm dev` (port 3020). **pnpm only — never npm** (repo is pnpm-only; npm broke `pnpm-lock` and produced 4 broken deploys per MEMORY).
2. Adapt `scripts/_diag-browser-repro2.ts` to target local instead of the Vercel deploy:
   - Set `APP = 'http://localhost:3020'` (or `NEXT_PUBLIC_APP_URL=http://localhost:3020`).
   - Cookies: `secure: false` for localhost (the script currently hardcodes `secure: true` for the https deploy — localhost is http).
   - Keep the rest: admin-minted session via `generateLink` + `verifyOtp`, `@supabase/ssr` cookie chunks (`createChunks` + `stringToBase64URL`), `morfx_workspace` cookie = a **manager-visible** workspace (Somnio `a3843b3f-...`, high traffic), `/whatsapp` path.
3. The harness runs a service-role subscription as **ground truth** (server emits) and a headless Chromium with the injected session listening for `[realtime:inbox]` console logs (browser receives). D-14 logging MUST stay enabled for this to work.
4. Optionally drive deterministic traffic with `scripts/_diag-protocol.ts` (send p1..p6) instead of waiting for organic Somnio traffic.

### PASS criterion (exact)
> On a **fresh load** of `localhost:3020/whatsapp` with a manager session, the browser logs at least one `[realtime:inbox] conversation <eventType>` **within <2s** of the corresponding service-role ground-truth `conv.UPDATE` (`gtCount > 0 && browserRtCount > 0`, with the first browser event ≤2s after its matching GT event). The current broken state shows `gtCount > 0 && browserRtCount === 0`.

Secondary checks:
- Exactly one `inbox:<ws>` channel subscribes (no StrictMode double-subscribe leak).
- `[realtime:inbox] status: SUBSCRIBED` is followed by real events (not SUBSCRIBED-but-mute).
- Chat: `New message received:` fires for a message in the open conversation within <2s.

### Dev-mode caveat
Dev hydration + React 19 StrictMode double-render differ from prod (you may see #418 noise and double effect mounts in dev). **Realtime DELIVERY is identical** between dev and prod — the token-on-socket behavior does not depend on the bundler mode. So the harness is authoritative for the realtime PASS criterion even in dev. (The #418 fix should additionally be confirmed in a `pnpm build && pnpm start` run, where React surfaces the minified #418 with a component stack.)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `realtime.setAuth` on every auth event only | supabase-js wires `accessToken` getter into Realtime + `_onConnOpen` awaits it before join | supabase-js ≥2.x (present in 2.95) | The socket can self-prime IF it connects after a session exists — the fix is to enforce that ordering |
| `accessToken` option for everyone | `accessToken` reserved for third-party auth; native cookie auth uses `@supabase/ssr` | `@supabase/ssr` era | Combining the two throws — Option 1 ruled out |

**Deprecated/outdated:**
- The CONTEXT.md "idle/token-expiry only" theory is superseded by the confirmed "anon-token-at-subscribe (every load)" root cause. The layered fix (Capas 1-3) was deployed and proven insufficient (0 events) because it sets auth AFTER subscribe.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact #418 source is a TZ-sensitive `date-fns format` node (e.g. `message-bubble.tsx:168`) | React #418 Diagnosis | LOW — #418 is independent of realtime; the plan reproduces locally and reads the component stack to pin the node before fixing. Mis-guess only costs one diagnostic step. |
| A2 | `@supabase/ssr` session is reliably hydrated by the time the hook awaits `getSession()` on a fresh load | Pitfall 1 | MEDIUM — if hydration lags, priming may still miss; mitigated by the hook awaiting `getSession()` explicitly (Pattern 2) and the kept reconnect/watchdog nets. Harness PASS criterion catches this directly. |

---

## Open Questions

1. **No-arg vs explicit-token `setAuth` for the initial prime.**
   - What we know: no-arg keeps callback/auto-refresh mode (`_setAuthSafely` works); explicit token flips to manual mode (Pitfall 4).
   - What's unclear: whether on a hard load the no-arg prime resolves with a token before the hook subscribes.
   - Recommendation: prime with **no-arg** in `client.ts` (preserve auto-refresh), and in the hooks defensively `await getSession()` + `setAuth(session.access_token)` right before subscribe. The provider re-asserts on every `TOKEN_REFRESHED`, so the brief manual-mode window is harmless. Confirm via harness.

2. **Does any message text actually SSR on `/whatsapp`?**
   - What we know: `useMessages` client-fetches; `page.tsx` only SSRs `initialConversations`.
   - What's unclear: whether the open-conversation bubbles render server-side at all (they likely do not), which determines if `message-bubble.tsx:168` is the #418 node.
   - Recommendation: reproduce #418 locally and read the stack; do not pre-commit to a node.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `pnpm dev` (port 3020) | Local harness | Need user to run | — | — |
| Playwright (headless Chromium) | Browser repro | ✓ | playwright 1.58.2 (`package.json:83`) | — |
| Service-role key (`SUPABASE_SERVICE_ROLE_KEY`) | Ground-truth sub | ✓ (in `.env.local`, used by existing scripts) | — | — |
| Admin `generateLink` minting | Session injection | ✓ (used by `_diag-browser-repro2.ts`) | — | — |
| Harness scripts on disk | Verification | ✓ | `_diag-protocol.ts`, `_diag-browser-repro2.ts`, `_diag-token-order.ts` | — |

**Missing dependencies with no fallback:** none — all present; harness only needs the `APP=localhost:3020` + `secure:false` cookie tweak.

---

## Security Domain

> `security_enforcement` not explicitly disabled; included for completeness. This is frontend auth-token handling — high-sensitivity.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuse `@supabase/ssr` cookie session; do not introduce a second token store |
| V3 Session Management | yes | Token stays in `@supabase/ssr` cookie storage; `setAuth` only injects into the socket — never persist the JWT elsewhere |
| V6 Cryptography | no (consume) | Never hand-roll token handling; use supabase-js `setAuth` |
| V7 Error Handling/Logging | yes | NEVER log `access_token` in any priming/setAuth/diagnostic path (the existing provider comment already flags this) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token leakage via console/log | Information Disclosure | No token in logs; `[realtime:*]` logs status only, never the JWT |
| Cross-workspace event leak | Information Disclosure | RLS + `filter: workspace_id=eq.` already scope events; token-before-subscribe makes RLS actually evaluate (the fix HARDENS isolation — anon currently can't read anyway, but a correct token must still be the user's) |
| Stale token after refresh | Spoofing/elevation | Keep `RealtimeAuthProvider` refresh wiring (Pitfall 2/4) |

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@supabase/supabase-js@2.95.3/dist/index.cjs:211-226, 320-360` — `accessToken` Proxy throw + unconditional Realtime `accessToken` getter + `_getAccessToken`.
- `node_modules/@supabase/realtime-js@2.95.2/dist/main/RealtimeClient.js:330-338 (setAuth), 551-566 (_onConnOpen auth-before-flush), 685-749 (_performAuth / _setAuthSafely manual-token logic)`.
- `node_modules/@supabase/ssr@0.8.0/dist/main/createBrowserClient.js:9-58` — forced `auth` config (incompatible with `accessToken`).
- `.planning/debug/realtime-inbox-badge.md` — confirmed root cause + A/B repro (Phase A 0/N, Node replica <1s) + V1-V4 DB verification.
- `scripts/_diag-token-order.ts`, `scripts/_diag-browser-repro2.ts`, `scripts/_diag-protocol.ts` — working harness on disk.
- Codebase: `src/lib/supabase/client.ts`, `src/hooks/use-conversations.ts`, `src/hooks/use-messages.ts`, `src/components/providers/realtime-auth-provider.tsx`, `src/hooks/use-realtime-reconnect.ts`, `src/components/ui/relative-time.tsx`, `src/app/(dashboard)/whatsapp/components/message-bubble.tsx`.

### Secondary (MEDIUM confidence)
- [Supabase Docs — Avoid using `@supabase/ssr` with third-party authentication (Issue #103)](https://github.com/supabase/ssr/issues/103) — confirms `accessToken` option is third-party-auth-only; do not combine with `@supabase/ssr`.
- [Supabase Docs — auth.setAuth reference](https://supabase.com/docs/reference/javascript/auth-setauth)
- [Supabase Docs — Creating a Supabase client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)

---

## Metadata

**Confidence breakdown:**
- Token-before-subscribe fix (Option 2): HIGH — verified against installed source + existing A/B repro proves the mechanism.
- Option 1 rejection: HIGH — Proxy-throw is in the installed `index.cjs`; corroborated by Supabase docs.
- #418 diagnosis: MEDIUM — verdict (independent) is HIGH; exact node is a hypothesis pending local repro.
- Verification harness: HIGH — scripts exist; only env-target tweaks needed.

**Research date:** 2026-06-03
**Valid until:** ~2026-07-03 (stable; re-verify if `@supabase/*` is upgraded — the `_onConnOpen`/Proxy behavior is version-specific).
