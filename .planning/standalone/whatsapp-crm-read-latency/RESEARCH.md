# Standalone: whatsapp-crm-read-latency — Research

**Researched:** 2026-06-02
**Domain:** Next.js 16 App Router read-path latency — Supabase auth (getClaims vs getUser), React per-request memoization, Server Action serialization, Next Data Cache, TanStack Query + Supabase Realtime coexistence
**Confidence:** HIGH (call-site audit + installed `.d.ts` + official Supabase/Next/TanStack docs all cross-verified)
**Mode:** Implementation (prescriptive) — root cause already confirmed; this defines the exact APIs/patterns/contract for the fix.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Create `getRequestAuth()` — single per-request helper wrapped in React `cache()` using `supabase.auth.getClaims()` (LOCAL JWT verification, no network). Replaces 190 `auth.getUser()` across 41 Server Action files.
- **D-02:** Helper MUST preserve the call-site contract: expose `userId` (= `claims.sub`, used in 22 sites per CONTEXT / 93 `user.id` reads per this audit), `workspaceId` (from cookie `morfx_workspace`), plus whatever the audit determines (this audit: also `email`).
- **D-03:** Centralize the `getAuthContext` DUPLICATED in 6 files (orders, agent-config, agent-content-editor, automations, comandos, sms) into the helper.
- **D-04 (NON-NEGOTIABLE):** Do NOT touch `getUser()` in `src/lib/supabase/middleware.ts` — it remains the refresh + revocation gate per request. Revocation downgrade (getClaims validates signature locally, won't catch revocation until token expiry ~1h) is covered by middleware.
- **D-05:** ✅ RESOLVED — project `expslvzsszymljafhppi` uses ASYMMETRIC ES256 (EC P-256). `getClaims()` is local. No JWT migration needed.
- **D-06:** Collapse the ~5 serialized Server Actions of `view-order-sheet.tsx` (getOrder + getPipelines + getActiveProducts + getTagsForScope + getOrderNotes) into ONE that does a real server-side `Promise.all` (1 auth + real DB-side parallelism).
- **D-07:** Cache reference data (pipelines / active products / order tags) with Next Data Cache (`unstable_cache` / `'use cache'`) + per-workspace tag invalidation.
- **D-08:** Use **TanStack React Query** for client cache (instant revisits in inbox + ojito). New dependency accepted.
- **D-09:** Incremental verifiable migration, NO feature flag. Helper is drop-in (preserves contract), TypeScript catches mismatches at compile time, middleware untouched. Atomic commits per file/group with typecheck each. Start with hot-path (conversations + orders + ojito), verify, then sweep the rest.
- **D-10:** Move the `[perf]` timer in `getConversationMessages` (and similar) to WRAP the auth, not start after it — so instrumentation stops being blind to the slow part.

### Claude's Discretion
- Internal helper structure, exact names, Route Handler vs Server Action shape for the ojito, Next Data Cache TTL/tags, fine React Query ↔ `use-messages` (Realtime) integration.

### Deferred Ideas (OUT OF SCOPE)
- Sweep of the ~33 remaining (non-hot-path) action files — follow-up waves WITHIN this standalone, after hot-path verified. Not scope creep — sequencing.
- Redis cross-instance cache — discarded (Upstash REST is HTTP-per-command).
- Agent/LLM hot-path optimization — separate problem (LLM dominates, not the DB).
- Touching `src/lib/supabase/middleware.ts` getUser.
</user_constraints>

---

## Summary

The root cause is confirmed by code: every read-path Server Action re-validates the session with `supabase.auth.getUser()` — a network round-trip to GoTrue (~150-300ms) — even though the middleware already validated+refreshed the session in the edge on every request. There are **190 such calls across 41 files**. The "ojito" multiplies this by firing 5 Server Actions that Next.js serializes (the React Action queue processes one at a time, even under `Promise.all`), stacking 5 auth round-trips + 5 queries ≈ 1-2s.

The fix is fully de-risked because the **call-site audit shows the auth `user` object is consumed in only two ways**: `user.id` (93 reads) and `user.email` (3 reads). Zero reads of `app_metadata`, `user_metadata`, `aud`, or the JWT `role` (every `.role` in the codebase is `member.role` / `membership.role` from a `workspace_members` DB query, never the JWT). This means the `getRequestAuth()` helper has a tiny, exact contract: `{ userId, email, workspaceId }`. `getClaims()` (verified in installed `@supabase/auth-js@2.95.2`) returns `{ data: { claims: JwtPayload }, error }` where `claims.sub` = userId and `claims.email` = email — a clean 1:1 swap. With asymmetric ES256 keys (D-05), `getClaims()` verifies locally via WebCrypto against a cached JWKS; network happens only on cache miss / key rotation.

**Primary recommendation:** Build `getRequestAuth()` in `src/lib/auth/request-auth.ts` wrapped in React `cache()`, returning `{ userId, email, workspaceId }` resolved via `getClaims()` + the `morfx_workspace` cookie. Migrate hot-path files first (conversations.ts, orders.ts, products.ts, tags.ts, order-notes.ts) with atomic typecheck'd commits. Collapse the ojito into ONE Server Action doing real `Promise.all`. Wrap reference data (pipelines/products/tags) in `unstable_cache` with per-workspace tags (matching the existing `bold.ts` pattern). Add TanStack Query v5 in a client Providers wrapper at the dashboard layout for instant revisits, bridged to the existing Supabase Realtime via `queryClient.setQueryData`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session refresh + revocation | Frontend Server (middleware) | — | Already the auth boundary (D-04). Untouched. |
| Per-action identity resolution | Frontend Server (Server Action) | — | `getClaims()` local verify + React `cache()` dedupe per request. The debt being removed. |
| RLS enforcement | Database (Postgres policies) | API (anon client sends JWT) | RLS comes from the JWT in the cookie sent by the anon client per query — NOT from `getUser()`. Unchanged. |
| Reference data caching | Frontend Server (Next Data Cache) | — | `unstable_cache` per-workspace tag; cross-request, server-side. |
| Revisit cache (instant UI) | Browser / Client (TanStack Query) | — | Client-side stale-while-revalidate; coexists with Realtime deltas. |
| Realtime message deltas | Browser / Client (Supabase Realtime) | — | Existing `use-messages.ts` / `use-conversations.ts` subscriptions. React Query bridges via `setQueryData`. |

**Key distinction (do not confuse):** React `cache()` (Layer 1) dedupes WITHIN one request only. Next Data Cache `unstable_cache` (Layer 3) persists ACROSS requests. They are different tools for different layers.

---

## Phase Requirements → Research Support

| Layer | Requirement | Research Support |
|-------|-------------|------------------|
| L1 | `getRequestAuth()` per-request cached helper | Call-Site Audit (contract = `{userId, email, workspaceId}`); getClaims API (`data.claims.sub`/`.email`); React `cache()` works in Server Actions |
| L2 | Collapse ojito 5→1 | Server Action serialization confirmed; single-action `Promise.all` pattern (Code Example 3) |
| L3 | Reference data Next Data Cache | `unstable_cache` + `revalidateTag` per-workspace; existing `bold.ts` pattern; `'use cache'` NOT enabled in config |
| L4 | TanStack Query client cache | v5.101.0; App Router Providers + `get-query-client.ts` singleton; `setQueryData` Realtime bridge |
| Instr. | Move `[perf]` timer to wrap auth | D-10; current timer starts L233 after auth L228 |

---

## Standard Stack

### Core (already installed — verified)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/auth-js` | 2.95.2 (installed) | `getClaims()` local JWT verify | Official replacement for `getUser()` in server contexts; verifies signature (unlike `getSession`) |
| `@supabase/ssr` | 0.8.0 (installed) | `createServerClient` cookie wiring | Already in `server.ts`; `getClaims()` lives on `supabase.auth` |
| `react` | 19.2.3 (installed) | `cache()` per-request memoization | Canonical RSC/Server Action dedupe; React-native, no dep |
| `next` | 16.1.6 (installed) | `unstable_cache` + `revalidateTag` | Data Cache; `'use cache'` requires `experimental.useCache`/`dynamicIO` which are NOT enabled — so `unstable_cache` is the stable choice here |

### Supporting (NEW dependency to add)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | **5.101.0** | Client cache, stale-while-revalidate, revisits | L4 — inbox conversation switches + ojito revisits |
| `@tanstack/react-query-devtools` | 5.101.0 (match) | Dev-only cache inspector | Optional; dev DX. Lazy-load so it's tree-shaken in prod |

**Installation:**
```bash
npm install @tanstack/react-query@5.101.0
npm install -D @tanstack/react-query-devtools@5.101.0   # optional
```

**Version verification (2026-06-02):**
- `@tanstack/react-query` latest = `5.101.0` `[VERIFIED: npm view @tanstack/react-query version]`
- `next` installed = `16.1.6` `[VERIFIED: node_modules/next/package.json]`
- `@supabase/auth-js` installed = `2.95.2` `[VERIFIED: node_modules/@supabase/auth-js .d.ts]`
- `react` = `19.2.3` `[VERIFIED: package.json]`

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `unstable_cache` | `'use cache'` directive | `'use cache'` requires `experimental: { useCache: true }` or `dynamicIO`, NEITHER enabled in `next.config.ts`. Enabling them is a config-wide behavioral change (Regla 6 risk). `unstable_cache` matches the existing shipped `bold.ts` pattern → lower risk. **Use `unstable_cache`.** `[VERIFIED: next.config.ts has no useCache/dynamicIO]` |
| TanStack Query | SWR | User delegated choice ("the best in performance, you pick"). React Query: devtools, finer `setQueryData`/`gcTime` control, cleaner Realtime bridge. **Use React Query** (D-08). |
| `getClaims()` | `getSession()` | `getSession()` does NOT verify the signature → insecure for authorization. `getClaims()` verifies. **Use `getClaims()`.** |

---

## Call-Site Audit

**The most important section — this defines the EXACT `getRequestAuth()` contract and the migration order.**

### Auth user-object field usage (across `src/app/actions/**`)
`[VERIFIED: grep -rno "user\.[a-zA-Z_]*" src/app/actions/]`

| Field read off auth `user` | Count | Notes |
|----------------------------|-------|-------|
| `user.id` | **93** | = `claims.sub`. The only universally-needed field. |
| `user.email` | **3** | `notes.ts:131`, `order-notes.ts:131`, `task-notes.ts:131` — fallback display name `{ id, email }` when profile row missing. = `claims.email`. |
| `user.app_metadata` | 0 | Never read. |
| `user.user_metadata` | 0 | Never read. |
| `user.aud` | 0 | Never read. |
| JWT `user.role` | **0** | Every `.role` in code is `member.role` / `membership.role` from `workspace_members` DB query — NOT the JWT role claim. `[VERIFIED: grep -rn "\.role" src/app/actions/]` |

**→ `getRequestAuth()` contract = `{ userId: string; email: string | null; workspaceId: string }`.** Nothing else is consumed. This is why D-09 (no feature flag, TypeScript-as-safety-net) is sound: any call site reading a field not in this shape will fail to compile.

### Whole-`user`-object returns (helpers that must be refactored, not naive-swapped)
`[VERIFIED: grep -rnE "return \{.*user" src/app/actions/]`

These local helpers return the FULL `user` object; their consumers only ever use `user.id` (and downstream queries). Refactor them to consume `getRequestAuth()` and expose `userId`:

| File | Returns today | Consumers use | Migration |
|------|---------------|---------------|-----------|
| `orders.ts:88` | `{ workspaceId, userId }` | `userId`, `workspaceId` | Drop-in: replace body with `getRequestAuth()`. **Already the target shape.** |
| `agent-config.ts:36` | `{ user, workspaceId, supabase }` | `user.id`, `workspaceId`, `supabase` | Return `{ userId, workspaceId, supabase }`; update `user.id`→`userId` callers |
| `agent-content-editor.ts:78` | `{ user, workspaceId, supabase }` | `user.id`, `workspaceId`, `supabase` | Same |
| `automations.ts:102` | `{ supabase, user, workspaceId }` | `user.id` (L95 filter), `workspaceId` | Same |
| `comandos.ts:112` | `{ workspaceId }` | `workspaceId` only | Drop-in |
| `sms.ts:21` | `{ workspaceId }` | `workspaceId` only | Drop-in |
| `integrations.ts:45` | `{ supabase, user, workspaceId, role }` | `user.id` (L38), `role` (membership) | Return `{ supabase, userId, workspaceId, role }`; `role` stays from membership query |
| `super-admin.ts:17` / `sms-admin.ts:19` | `user` | `user.id === MORFX_OWNER_ID` | Return `userId`; compare `userId === MORFX_OWNER_ID`. **NOT hot-path — defer to a later wave.** |

### Hot-path files (migrate FIRST per D-09 + D-06)
| File | getUser count | Reads | Workspace from cookie |
|------|---------------|-------|------------------------|
| `conversations.ts` | 17 | `user.id` | some |
| `orders.ts` | (getAuthContext + inline) | `user.id` | yes (`morfx_workspace`) |
| `products.ts` | — | `user.id` | yes |
| `tags.ts` | — | `user.id` | yes |
| `order-notes.ts` | 4 | `user.id`, `user.email` | partial |

### Blast radius totals
- 190 `auth.getUser()` calls / 41 files `[VERIFIED: grep -rn "auth.getUser()" src/app/actions/]`
- 38 of 41 files read `morfx_workspace` cookie `[VERIFIED: grep -rln "morfx_workspace" src/app/actions/]`
- 0 existing `getClaims` usages, 0 existing React `cache()` over auth `[VERIFIED: grep]`

---

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────────┐
   HTTP request ───▶│ MIDDLEWARE (src/lib/supabase/middleware.ts)      │
                    │  getUser() → validate + REFRESH cookie + redirect│  ◀── UNTOUCHED (D-04)
                    │  (the real auth boundary, runs every request)    │      revocation gate
                    └───────────────────────┬─────────────────────────┘
                                            │ fresh session cookie
                            ┌───────────────┴───────────────┐
                            ▼                                ▼
            ┌───────────────────────────┐      ┌──────────────────────────────┐
            │ SERVER ACTION (read)      │      │ SERVER ACTION: ojito bundle   │
            │  getRequestAuth()  ◀──────┼──┐   │  getRequestAuth()  (1×)       │
            │   React cache() dedupe    │  │   │  await Promise.all([          │
            │   getClaims() LOCAL verify│  │   │    order, pipelines,products, │ ◀─ REAL DB
            │   (WebCrypto, JWKS cache) │  │   │    tags, notes ])             │   parallelism
            │   + morfx_workspace cookie│  │   └──────────────┬───────────────┘   (1 process)
            └──────────┬────────────────┘  │                  │
                       │ supabase query     │ shared          ▼
                       ▼ (anon client       │ cache()  ┌─────────────────────┐
            ┌──────────────────────┐ sends  │ scope    │ unstable_cache(...)  │ ◀─ Layer 3
            │ POSTGRES + RLS       │ JWT)   │          │ pipelines/products/  │   per-workspace
            │ (policies unchanged) │◀───────┘          │ tags  tag-invalidate │   tag
            └──────────────────────┘                   └─────────────────────┘
                       │ data
                       ▼
            ┌─────────────────────────────────────────────────────────┐
            │ CLIENT: TanStack Query cache (Layer 4)                   │
            │   useQuery(['messages', convId])  ── instant revisit     │
            │            ▲ setQueryData                                │
            │   Supabase Realtime (use-messages.ts) ── INSERT/UPDATE   │ ◀─ deltas bridge
            └─────────────────────────────────────────────────────────┘
```

### Pattern 1: `getRequestAuth()` — per-request cached auth helper (Layer 1)
**What:** One helper, wrapped in React `cache()`, that resolves identity + workspace once per request using local JWT verification.
**Contract (locked by Call-Site Audit):** `{ userId: string; email: string | null; workspaceId: string }`.
**When to use:** Every read Server Action (and, in follow-up waves, mutation actions that today call `getAuthContext`/`getUser`).
**Source:** `data.claims` shape from installed `@supabase/auth-js@2.95.2/dist/module/GoTrueClient.d.ts:601-613` + `lib/types.d.ts:1207-1244`. `[VERIFIED]`

See Code Example 1.

**`cache()` scope caveat:** React `cache()` memoizes per-request, scoped to the React rendering/request context. Server Actions execute within that context, so `cache()` dedupes correctly across multiple actions in the same request. It does NOT persist across requests (that's Layer 3). `cookies()` is itself request-scoped, so reading the cookie inside the cached function is consistent. `[VERIFIED: React docs + Next.js request memoization docs]`

### Pattern 2: Collapse the ojito (Layer 2)
**What:** Replace the 5 client-invoked Server Actions with ONE `getOrderDetailBundle(orderId)` Server Action that runs `Promise.all` of the 5 reads server-side.
**Why a single Server Action (not 5, not a Route Handler):**
- 5 client-invoked Server Actions serialize — React Action queue processes one at a time even under `Promise.all` on the client. `[VERIFIED: debug doc + Next.js Server Action behavior]`
- ONE Server Action = ONE client↔server round-trip + ONE `getRequestAuth()` + REAL `Promise.all` inside a single Node process (independent reads truly parallelize there).
- **Server Action vs Route Handler:** prefer a **Server Action** — keeps the existing `import { ... } from '@/app/actions/...'` ergonomics, no new fetch/URL/serialization boilerplate, and it's a read-on-click (no caching/HTTP-semantics benefit from a Route Handler). A Route Handler would only help if you wanted HTTP-level caching or to call it from non-React clients; neither applies. **Use a single Server Action.**

See Code Example 3.

### Pattern 3: Reference data Next Data Cache (Layer 3)
**What:** Wrap pipelines/products/tags reads in `unstable_cache` keyed + tagged per workspace; invalidate with `revalidateTag` on mutation.
**When to use:** Inside the ojito bundle (and anywhere these are fetched on click). Reference data is near-static per workspace.
**Tags (recommendation):** `ref:pipelines:${workspaceId}`, `ref:products:${workspaceId}`, `ref:tags:${workspaceId}`. TTL `revalidate: 300` (5 min) as a safety net; correctness comes from `revalidateTag` on mutation.
**Invalidation points:** any action that mutates pipelines/stages → `revalidateTag('ref:pipelines:'+ws)`; products create/update/archive → `ref:products`; tags → `ref:tags`. Match the `bold.ts` shape (`unstable_cache(fn, keyParts, { revalidate, tags })`).

> **Caveat:** `unstable_cache`'d functions canNOT read `cookies()` (dynamic data) inside the cached callback. Resolve `workspaceId` OUTSIDE and pass it as an argument into the cached function (it becomes part of the cache key). See Code Example 4.

See Code Example 4.

### Pattern 4: TanStack Query + Supabase Realtime bridge (Layer 4)
**What:** React Query owns initial-load + revisit cache; the existing Realtime subscriptions push deltas into the cache via `queryClient.setQueryData` (immutably) instead of calling `setMessages` local state.
**Provider placement:** a `'use client'` `Providers` component wrapping `{children}` inside `src/app/(dashboard)/layout.tsx` (the layout is a Server Component; the provider is its client child).
**QueryClient:** singleton via `get-query-client.ts` (server makes a fresh client per request; browser reuses one). `staleTime: 60_000`, `gcTime: 5 * 60_000` for this chat/CRM use case (fresh enough for revisits, GC'd after 5 min idle).
**Hydration:** client-only fetching is acceptable here (these are click-triggered reads, not initial SSR payloads) — no `HydrationBoundary`/`dehydrate` needed for v1. Keep it simple.
**Coexistence rule:** Realtime is the source of deltas; React Query is the cache. The Realtime handler calls `setQueryData(['messages', convId], updater)` — it does NOT trigger a refetch (avoids double-fetching/fighting). On channel error/reconnect, `invalidateQueries(['messages', convId])` for a single reconciling refetch.

See Code Example 5.

### Recommended file layout
```
src/lib/auth/request-auth.ts          # NEW — getRequestAuth() (Layer 1, D-01/D-02/D-03)
src/app/actions/order-detail.ts       # NEW — getOrderDetailBundle() (Layer 2, D-06)
src/lib/cache/reference-data.ts       # NEW — unstable_cache'd pipelines/products/tags (Layer 3, D-07)
src/app/get-query-client.ts           # NEW — QueryClient singleton (Layer 4)
src/components/providers/query-provider.tsx  # NEW — 'use client' QueryClientProvider (Layer 4)
```

### Anti-Patterns to Avoid
- **Calling N Server Actions from the client under `Promise.all` expecting parallelism** — they serialize. Collapse to ONE action (D-06).
- **Using React `cache()` for cross-request reference data** — it's per-request only. Use `unstable_cache` (Layer 3).
- **Reading `cookies()` inside an `unstable_cache` callback** — throws/breaks caching. Resolve workspaceId outside, pass as arg.
- **Calling `getUser()` per action for "security"** — RLS comes from the JWT the anon client sends to Postgres, not from `getUser()`. The middleware is the refresh/revocation gate.
- **Triggering `refetch()` from the Realtime handler** — fights React Query and double-fetches. Use `setQueryData`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verify the session JWT cheaply | Custom `jwtDecode` + manual JWKS fetch | `supabase.auth.getClaims()` | Verifies ES256 signature via WebCrypto against cached JWKS; handles key rotation, expiry, `allowExpired`. Hand-rolled decode = no signature check = insecure. |
| Dedupe auth per request | Module-level `let cached` or a `Map` | React `cache()` | Request-scoped automatically; no cross-request leakage (a manual Map would leak across requests in a serverless container). |
| Client revisit cache | Custom `Map<key, data>` + manual staleness | TanStack Query | stale-while-revalidate, gc, devtools, `setQueryData`, dedupe — all battle-tested. |
| Cross-request reference cache | In-memory object | `unstable_cache` + `revalidateTag` | Survives across requests within Fluid Compute, tag invalidation, TTL. |

**Key insight:** Every piece of this fix has a first-party primitive (Supabase `getClaims`, React `cache`, Next `unstable_cache`, TanStack `useQuery`/`setQueryData`). The bug was hand-rolling auth-per-action; the fix is to stop hand-rolling and compose the primitives.

---

## Common Pitfalls

### Pitfall 1: `getClaims()` return-shape mismatch
**What goes wrong:** Treating the return like `getUser()` (`data.user`) → `data.claims` is undefined.
**Why:** `getClaims()` returns `{ data: { claims: JwtPayload, header, signature }, error }` — userId is `data.claims.sub`, email is `data.claims.email`. `[VERIFIED: GoTrueClient.d.ts:601-613]`
**How to avoid:** In the helper, destructure `const { data, error } = await supabase.auth.getClaims(); const claims = data?.claims;` then map `claims.sub` / `claims.email`. Centralizing in ONE helper means this mapping exists once.
**Warning signs:** `undefined` userId at runtime despite a valid session.

### Pitfall 2: `getClaims()` returns `{ data: null, error: null }` (no session)
**What goes wrong:** Assuming `error` is always set when unauthenticated.
**Why:** The type has THREE branches: success, `{data:null, error:AuthError}`, AND `{data:null, error:null}` (no JWT present). `[VERIFIED: .d.ts union]`
**How to avoid:** Treat `!data?.claims?.sub` as unauthenticated regardless of `error`. Return a sentinel (e.g. `null` or `{ error: 'No autenticado' }`) preserving each call site's existing not-authed behavior (most return `[]` / `null` / `{ error }`).

### Pitfall 3: Cookie-write side-effect of `getUser()` (refresh) — does any action depend on it?
**What goes wrong:** Fear that removing per-action `getUser()` removes a needed token refresh.
**Why it's NOT a problem:** `server.ts` `createClient().cookies.setAll` is wrapped in `try/catch` that **swallows the write** ("called from a Server Component… ignored if you have middleware refreshing user sessions"). So per-action `getUser()` already cannot persist a refreshed cookie. Refresh happens ONLY in middleware (which CAN write the response cookie). `[VERIFIED: server.ts:18-28 + middleware.ts:17-30]`
**How to avoid:** Nothing to do — confirmed safe. Middleware (D-04) is the sole refresh point. Document this so reviewers don't re-introduce per-action `getUser()`.

### Pitfall 4: Revocation latency downgrade
**What goes wrong:** A revoked/banned user could keep acting until their token expires (~1h), because `getClaims()` validates signature locally and doesn't ask GoTrue "is this still valid?".
**Why:** Local verification trades a network call for not seeing server-side revocation immediately.
**How to avoid:** Accepted by D-04 — the middleware still calls `getUser()` every request (matcher covers all app routes), so revocation IS caught at the request boundary on the next navigation. Per-action checks were never the revocation gate. No change needed; just don't move the gate.

### Pitfall 5: `unstable_cache` + `cookies()`
**What goes wrong:** Reading `cookies()`/`headers()` inside the cached callback throws ("Route used `cookies` inside `unstable_cache`").
**How to avoid:** Resolve `workspaceId` via `getRequestAuth()` OUTSIDE the cached fn and pass it as an argument (it joins the cache key). See Code Example 4.

### Pitfall 6: React Query in App Router — client discarding QueryClient
**What goes wrong:** Initializing the QueryClient with `useState` when there's no suspense boundary, or making a new client per render, loses cache.
**How to avoid:** Use the official `get-query-client.ts` singleton (browser reuses one instance; server makes one per request). Don't `useState`-init without a suspense boundary below. `[CITED: tanstack.com/query advanced-ssr]`

### Pitfall 7: Realtime handler fighting React Query
**What goes wrong:** Realtime calls `refetch()` → double network round-trips; or mutates cache non-immutably → stale renders.
**How to avoid:** Realtime handler uses `queryClient.setQueryData(key, (old) => immutably-merged)`. Reserve `invalidateQueries` for channel-error/reconnect reconciliation only.

### Pitfall 8 (Regla 6): Auth helper leaking into agent runtime
**What goes wrong:** Importing `getRequestAuth()` into agent/webhook paths that rely on a different identity semantic (admin client, no cookie).
**How to avoid:** `getRequestAuth()` is for cookie-backed UI Server Actions ONLY. Agent/webhook paths use `createAdminClient()` + explicit workspaceId (Regla 3) — do NOT migrate them. Grep-verify the helper is imported only under `src/app/actions/**`.

---

## Code Examples

### Example 1: `getRequestAuth()` (Layer 1) — `src/lib/auth/request-auth.ts`
```typescript
// Source: getClaims shape from @supabase/auth-js@2.95.2 GoTrueClient.d.ts:601-613
//         React cache() per-request memoization (react.dev)
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export interface RequestAuth {
  userId: string
  email: string | null
  workspaceId: string
}

/**
 * Per-request auth resolution. Wrapped in React cache() so multiple Server
 * Actions in the SAME request share ONE local JWT verification + cookie read.
 * Uses getClaims() (local ES256 verify against cached JWKS — no network round-trip)
 * instead of getUser() (network round-trip to GoTrue).
 *
 * Refresh + revocation remain the middleware's job (D-04). RLS is enforced by
 * the JWT the anon client sends to Postgres, not by this helper.
 *
 * Returns null when unauthenticated OR no workspace selected — callers preserve
 * their existing not-authed behavior ([] / null / { error }).
 */
export const getRequestAuth = cache(async (): Promise<RequestAuth | null> => {
  const supabase = await createClient()

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null // covers {data:null,error:null} AND error branches (Pitfall 2)

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return null

  return {
    userId: claims.sub,
    email: claims.email ?? null,
    workspaceId,
  }
})
```

### Example 2: Migrating a hot-path action — before / after (`conversations.ts`)
```typescript
// BEFORE — network round-trip per call, blind perf timer (auth before startTime)
export async function getConversationMessages(conversationId: string, limit = 50, before?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()   // ~150-300ms NETWORK
  if (!user) return []
  const startTime = Date.now()                                // ⬅ timer starts AFTER auth (blind)
  // ...query...
}

// AFTER — local verify, deduped per request, timer wraps auth (D-10)
import { getRequestAuth } from '@/lib/auth/request-auth'

export async function getConversationMessages(conversationId: string, limit = 50, before?: string) {
  const startTime = Date.now()                                // ⬅ D-10: timer now includes auth
  const auth = await getRequestAuth()                         // local, cached per request
  if (!auth) return []
  const supabase = await createClient()
  // ...query (workspace filtering / RLS unchanged)...
  const elapsed = Date.now() - startTime
  if (elapsed > 3000) console.warn(`[perf] getConversationMessages ${conversationId}: ${elapsed}ms`)
}
```
> Note: `getRequestAuth()` and `createClient()` both `await cookies()` internally — both are request-scoped and cheap after the first call (cache() dedupes the auth path).

### Example 3: Collapse the ojito (Layer 2) — `src/app/actions/order-detail.ts`
```typescript
'use server'
import { getRequestAuth } from '@/lib/auth/request-auth'
import { getOrder, getPipelines } from '@/app/actions/orders'
import { getActiveProducts } from '@/app/actions/products'
import { getTagsForScope } from '@/app/actions/tags'
import { getOrderNotes } from '@/app/actions/order-notes'

/**
 * ONE Server Action replacing the 5 serialized client-invoked actions in
 * view-order-sheet.tsx. Real Promise.all server-side (single Node process →
 * independent reads truly parallelize). Single auth resolution via cache().
 */
export async function getOrderDetailBundle(orderId: string) {
  const auth = await getRequestAuth()
  if (!auth) return null

  const [order, pipelines, products, tags, notes] = await Promise.all([
    getOrder(orderId),
    getPipelines(),
    getActiveProducts(),     // ← Layer 3 cached internally (Example 4)
    getTagsForScope('orders'),
    getOrderNotes(orderId),
  ])
  return { order, pipelines, products, tags, notes }
}
```
```tsx
// view-order-sheet.tsx — 5 awaits → 1 (or wrapped in useQuery for Layer 4)
const data = await getOrderDetailBundle(currentOrderId)
if (data?.order) { setOrder(data.order); /* ...setPipelines/setProducts/setAllTags/setOrderNotes... */ }
```

### Example 4: Reference data Next Data Cache (Layer 3) — `src/lib/cache/reference-data.ts`
```typescript
// Source: matches existing src/app/actions/bold.ts:208 unstable_cache pattern
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

// workspaceId passed as ARG (NOT cookies() inside — Pitfall 5). It joins the cache key.
export const getCachedActiveProducts = (workspaceId: string) =>
  unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('products').select('*')
        .eq('workspace_id', workspaceId).eq('is_active', true)
        .order('title', { ascending: true })
      return data ?? []
    },
    ['active-products', workspaceId],
    { revalidate: 300, tags: [`ref:products:${workspaceId}`] },
  )()

// On mutation (createProduct/updateProduct/archive):
//   import { revalidateTag } from 'next/cache'
//   revalidateTag(`ref:products:${workspaceId}`)
```
> The public `getActiveProducts()` action: `getRequestAuth()` → then `return getCachedActiveProducts(auth.workspaceId)`. RLS-via-admin is acceptable here because the workspace filter is explicit and workspaceId is server-derived (never from body).

### Example 5: TanStack Query provider + Realtime bridge (Layer 4)
```typescript
// src/app/get-query-client.ts — Source: tanstack.com/query advanced-ssr
import { isServer, QueryClient } from '@tanstack/react-query'
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, gcTime: 5 * 60_000 } },
  })
}
let browserQueryClient: QueryClient | undefined
export function getQueryClient() {
  if (isServer) return makeQueryClient()
  return (browserQueryClient ??= makeQueryClient())
}
```
```tsx
// src/components/providers/query-provider.tsx
'use client'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/app/get-query-client'
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
// → wrap {children} with <QueryProvider> inside src/app/(dashboard)/layout.tsx (Server Component → client child).
```
```tsx
// Bridging existing Realtime into React Query (use-messages.ts refactor sketch)
const queryClient = useQueryClient()
const { data: messages = [] } = useQuery({
  queryKey: ['messages', conversationId],
  queryFn: () => getConversationMessages(conversationId!, limit),
  enabled: !!conversationId,
})
// Realtime INSERT handler — setQueryData (NOT refetch):
channel.on('postgres_changes', { event: 'INSERT', /* ...filter... */ }, (payload) => {
  queryClient.setQueryData<Message[]>(['messages', conversationId], (old = []) =>
    [...old, payload.new as Message])   // immutable
})
// On channel error/reconnect: queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
```

---

## Migration Strategy

**Order (D-09 — incremental, no flag, typecheck-per-commit):**

1. **Wave 0 — Foundation (1 commit each):**
   - `src/lib/auth/request-auth.ts` (`getRequestAuth()`). Typecheck. (No call sites yet → zero risk.)
   - `src/app/get-query-client.ts` + `src/components/providers/query-provider.tsx` + wire into dashboard layout. Install `@tanstack/react-query`.
   - `src/lib/cache/reference-data.ts` (cached pipelines/products/tags, not yet wired).

2. **Wave 1 — Hot path (the user-visible win; one commit per file):**
   - `conversations.ts` — migrate `getConversationMessages` + the other 16 getUser sites; move `[perf]` timer to wrap auth (D-10).
   - `orders.ts` — replace `getAuthContext` body with `getRequestAuth()` (shape already `{workspaceId,userId}`); migrate `getOrder`, `getPipelines`.
   - `products.ts`, `tags.ts`, `order-notes.ts` — migrate; wire products/tags to Layer 3 cache.
   - `src/app/actions/order-detail.ts` — NEW `getOrderDetailBundle` (D-06).
   - `view-order-sheet.tsx` — 5 actions → `getOrderDetailBundle` (optionally via `useQuery`).
   - `use-messages.ts` / `use-conversations.ts` — bridge Realtime → `setQueryData`.
   - **Verify in prod** (Vercel) — confirm magnitude with the now-honest `[perf]` timer before sweeping.

3. **Wave 2+ — Sweep remaining ~33 files** (deferred-but-in-scope): migrate the other `getAuthContext` duplicates (agent-config, agent-content-editor, automations, comandos, sms, integrations) and the remaining getUser sites, one group per commit. `super-admin.ts`/`sms-admin.ts` (owner-check) last.

**How TypeScript guarantees safety (the answer to the user's blast-radius fear):**
- The Call-Site Audit proves the only consumed fields are `userId`/`email`/`workspaceId` — all present in `RequestAuth`.
- Any site that destructured something else off `user` (none found) would fail `tsc`.
- Each commit runs `tsc --noEmit`; a mismatch breaks the build, never prod.
- Helpers returning the whole `user` object (8 files, table above) are refactored explicitly, their `user.id` consumers updated to `userId` — caught by the compiler if missed.

**Regla 6 / verification gates per commit:**
- `grep -rn "getRequestAuth" src/` returns matches ONLY under `src/app/actions/**` + the helper (never agent/webhook paths).
- `src/lib/supabase/middleware.ts` byte-unchanged (D-04).
- `tsc --noEmit` green.
- Existing tests green (no auth-semantic test should change).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getUser()` per server call | `getClaims()` (local verify w/ asymmetric keys) | Supabase 2025 (asymmetric keys default for new projects post-2025-05-01; SSR guides updated Oct 2025) | No GoTrue round-trip per action |
| Symmetric HS256 JWT | Asymmetric ES256/RSA | This project already on ES256 (D-05) | `getClaims` is local — gate cleared |
| `'use cache'` directive | Still experimental in 16.x (needs `useCache`/`dynamicIO`) | Not enabled here | Use stable `unstable_cache` |

**Deprecated/outdated:**
- `getSession()` for authorization — never verified the signature; superseded by `getClaims()`.
- SSR guides that show `getUser()` everywhere — Supabase issue #39947 (Oct 2025) acknowledges they should recommend `getClaims()` in server contexts.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `'use cache'`/`dynamicIO` are NOT enabled → `unstable_cache` is the right tool | Standard Stack / L3 | LOW — verified `next.config.ts` has no such flags; if a future config enables them, both still work |
| A2 | Client-only React Query (no SSR `HydrationBoundary`) is sufficient for v1 | Pattern 4 | LOW — these are click-triggered reads, not initial SSR payloads; SSR hydration can be added later if needed |

**Everything else is VERIFIED (installed `.d.ts`, codebase grep) or CITED (official docs).** The two assumptions are low-risk implementation-style choices, not factual claims needing user confirmation.

---

## Open Questions

1. **Should `getOrderDetailBundle` reads be wrapped in `useQuery` immediately (L4) or land as a plain `await` first?**
   - What we know: D-06 requires the single-action collapse; D-08 wants React Query for revisits.
   - Recommendation: ship the single-action collapse first (instant win, lower risk), then wrap in `useQuery` in the same wave for revisit caching. Both fit Wave 1.

2. **TTL value for reference data `revalidate`.**
   - What we know: correctness comes from `revalidateTag` on mutation; `revalidate` is a safety net.
   - Recommendation: 300s (5 min). Planner may tune; not load-bearing given tag invalidation.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/auth-js` `getClaims` | L1 | ✓ | 2.95.2 | — |
| Asymmetric ES256 JWT keys | L1 local verify | ✓ | ES256 (D-05) | — (without it getClaims falls back to network) |
| React `cache()` | L1 | ✓ | react 19.2.3 | — |
| `unstable_cache` | L3 | ✓ | next 16.1.6 | — |
| `@tanstack/react-query` | L4 | ✗ (install) | 5.101.0 | — (must `npm install`) |

**Missing dependencies with no fallback:** none block — `@tanstack/react-query` is a simple `npm install` (D-08 accepts the new dep).

---

## Validation Architecture

> Test framework: detected `vitest` (used across `src/lib/agents/**/__tests__/`). No config-file path surfaced in scope; confirm in Wave 0.

### Phase Requirements → Test Map
| Behavior | Test Type | Command | File Exists? |
|----------|-----------|---------|-------------|
| `getRequestAuth()` returns `{userId,email,workspaceId}` from claims | unit | `npx vitest run src/lib/auth/__tests__/request-auth.test.ts` | ❌ Wave 0 |
| `getRequestAuth()` returns null when no claims / no workspace cookie | unit | same | ❌ Wave 0 |
| Cross-workspace isolation (workspace from cookie, never body) | unit/integration | new test | ❌ Wave 0 (security gate per CONTEXT) |
| `getOrderDetailBundle` returns all 5 shapes, one auth | integration | new test | ❌ Wave 0 |
| Realtime → `setQueryData` (no refetch) | unit (hook) | new test | ❌ optional |

### Sampling Rate
- **Per task commit:** `tsc --noEmit` + targeted vitest for the migrated file.
- **Per wave merge:** full `npx vitest run` + manual prod smoke (inbox switch + ojito with the honest `[perf]` timer).
- **Phase gate:** prod latency measurably down (<300ms perceived) confirmed by the moved `[perf]` log.

### Wave 0 Gaps
- [ ] `src/lib/auth/__tests__/request-auth.test.ts` — helper contract + null branches + cross-workspace isolation
- [ ] Confirm vitest config path / add if missing
- [ ] (optional) hook test for Realtime→setQueryData bridge

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `getClaims()` verifies ES256 signature locally (NOT `getSession`); middleware `getUser()` stays as refresh/revocation gate (D-04) |
| V3 Session Management | yes | Refresh + revocation remain in middleware; per-action checks are identity-only, not the gate |
| V4 Access Control | yes | RLS unchanged (JWT → Postgres policies); `workspaceId` server-derived from cookie, never from request body |
| V5 Input Validation | partial | No new user input introduced; existing zod schemas unchanged |
| V6 Cryptography | yes | JWT verification delegated to Supabase WebCrypto — never hand-roll JWT decode/verify |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged/tampered JWT | Tampering/Spoofing | `getClaims()` signature verification (rejects invalid sig) |
| Workspace spoofing via body | Elevation of Privilege | `workspaceId` from `morfx_workspace` cookie only (D-02), never from action args |
| Stale revocation (local verify) | Spoofing | Middleware `getUser()` catches revocation at next request (D-04, accepted ~≤token-expiry window) |
| Cross-request cache leak | Info Disclosure | React `cache()` is per-request; `unstable_cache` keyed by workspaceId |

---

## Sources

### Primary (HIGH confidence)
- Installed `@supabase/auth-js@2.95.2` — `dist/module/GoTrueClient.d.ts:575-613` (getClaims signature + return union), `dist/module/lib/types.d.ts:1207-1244` (RequiredClaims + JwtPayload: `sub`, `email`, `role`, `app_metadata`, `aud`). `[VERIFIED]`
- Codebase grep audit — field usage (`user.id`×93, `user.email`×3, 0 JWT-role), 190 getUser / 41 files, 38 cookie readers, 8 whole-user-return helpers, `bold.ts` `unstable_cache` pattern, `server.ts` swallowed setAll, `middleware.ts` refresh gate. `[VERIFIED]`
- `next.config.ts` — no `useCache`/`dynamicIO` → `unstable_cache` is the stable path. `[VERIFIED]`
- [Supabase docs — getClaims reference](https://supabase.com/docs/reference/javascript/auth-getclaims) — prefer over getUser; JWKS-cached local verify. `[CITED]`
- [TanStack Query — Advanced SSR (App Router)](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) — `get-query-client.ts` singleton, Providers, staleTime. `[CITED]`

### Secondary (MEDIUM confidence)
- [Supabase JWT signing keys discussion #29289](https://github.com/orgs/supabase/discussions/29289) — asymmetric keys verify locally via WebCrypto; network only on JWKS cache miss.
- [Supabase issue #39947](https://github.com/supabase/supabase/issues/39947) — SSR guides should use getClaims over getUser (Oct 2025).
- [Next.js — Request Memoization / Caching](https://nextjs.org/docs/app/building-your-application/caching) — React `cache()` is per-request, works in Server Components/Actions.

### Tertiary (LOW confidence — directional only)
- Community posts on TanStack Query + Supabase Realtime (`setQueryData` over `refetch`) — pattern corroborated, not load-bearing.

---

## Metadata

**Confidence breakdown:**
- Call-Site Audit / helper contract: HIGH — direct grep over the exact tree.
- getClaims API / return shape: HIGH — installed `.d.ts` is authoritative.
- React `cache()` in Server Actions: HIGH — official docs + per-request scope confirmed.
- Server Action serialization: HIGH — debug doc + Next behavior.
- `unstable_cache` choice over `'use cache'`: HIGH — config inspected.
- TanStack Query + Realtime bridge: MEDIUM-HIGH — official setup HIGH; Realtime bridge pattern MEDIUM (community-corroborated, idiomatic).

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (stable stack; re-verify TanStack/Next minor if >30 days)
