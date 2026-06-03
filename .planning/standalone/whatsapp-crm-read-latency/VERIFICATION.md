---
phase: whatsapp-crm-read-latency
verified: 2026-06-03T14:25:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: "Initial verification. Standalone (no roadmap phase). gsd-sdk not available — verified via git/grep/Read."
---

# Phase whatsapp-crm-read-latency Verification Report

**Phase Goal:** Arreglo ESTRUCTURAL de la latencia de lectura del módulo WhatsApp/CRM — atacar el patrón raíz (~190 `auth.getUser()` redundantes a GoTrue + serialización de Server Actions + sin caché), NO parchear síntomas.
**Verified:** 2026-06-03
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (the 8 verification-focus criteria)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | `getRequestAuth()` exists, uses `getClaims` (local), React `cache()`, returns null on missing claims/cookie | ✓ VERIFIED | `src/lib/auth/request-auth.ts:23` `export const getRequestAuth = cache(async ...)`; L26 `supabase.auth.getClaims()`; L28 `if (!claims?.sub) return null`; L32 `if (!workspaceId) return null`. Contract `{userId,email,workspaceId}` (L5-9). 6/6 unit tests pass. |
| 2 | The 5 hot-path actions + `getOrderDetailBundle` deliver the latency win (1 auth + Promise.all; no per-click re-fetch) | ✓ VERIFIED | `src/app/actions/order-detail.ts:23-35` — 1 `await getRequestAuth()` + 1 `Promise.all` of the 5 reads. view-order-sheet.tsx: `getOrderDetailBundle`×3, direct `getActiveProducts/getTagsForScope/getOrderNotes`=0. Hot-path actions (conversations/orders/products/tags/order-notes) all 0 `auth.getUser()`. |
| 3 | `useMessages` uses React Query with Realtime via `setQueryData` (not refetch) | ✓ VERIFIED | `src/hooks/use-messages.ts`: `useQuery`×3, `setQueryData`×7, `refetch()`=0, `setMessages`=0, `invalidateQueries`×2 (reserved for safety/reconnect per Pitfall 7). |
| 4 | Reference-data cache wired + invalidated via revalidateTag/updateTag on mutations | ✓ VERIFIED | `reference-data.ts` 3 `unstable_cache` wrappers (products/tags/pipelines), `workspaceId` as arg (Pitfall 5). Wired: getCachedActiveProducts (products.ts)=2, getCachedTagsForScope (tags.ts)=2, getCachedPipelines (orders.ts)=2. Invalidation: ref:products=5, ref:tags=4, ref:pipelines=8 (via updateTag — Next 16 deprecated 1-arg revalidateTag, same internal mechanism). |
| 5 | GLOBAL: `grep -rc "auth.getUser()" src/app/actions/` == 0 | ✓ VERIFIED | `grep -rc "auth.getUser()" src/app/actions/ \| grep -v ":0"` → EMPTY. Zero across all 42 files. |
| 6 | Regla 3 intact (mutations via domain) + Regla 6 intact (middleware byte-identical; getRequestAuth absent from agents/inngest/api/robot) | ✓ VERIFIED | `getRequestAuth` outside `src/lib/auth/` + `src/app/actions/` → NONE. In `src/lib/agents`/`src/inngest`/`src/app/api` → NONE. In `godentist/robot-godentist` → NONE. Middleware NOT in any phase commit (last touch `5157d8b7`, pre-phase); still has `getUser`×2 (refresh/revocation gate, D-04). reference-data `createAdminClient` is intentional (D-07, RLS-via-explicit-workspace-filter). |
| 7 | Bootstrap-context fns (workspace.ts getActiveWorkspaceId, invitations.ts acceptInvitation) did NOT naively swap to getRequestAuth (would break first-login) — local getClaims helper preserving fallback | ✓ VERIFIED | Both files have a local `getAuthUserId(supabase)` helper using `supabase.auth.getClaims()` WITHOUT requiring the workspace cookie. workspace.ts: `getActiveWorkspaceId` fallback `cookieStore.set('morfx_workspace',...)` from `workspace_members` preserved. The 2 `getRequestAuth` mentions in each file are doc-comments, NOT calls. |
| 8 | Build passes (local pnpm build exit 0 per execution; tsc new-error count) | ✓ VERIFIED | `npx tsc --noEmit` → only 2 PRE-EXISTING error classes (`.next/dev/types/validator.ts` Next-generated stale cache + `domain/__tests__/conversations.test.ts` eqMock implicit any). ZERO new errors in any phase-touched file. pnpm-lock.yaml contains react-query (lockfile fix `b2457077`). |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/auth/request-auth.ts` | getRequestAuth helper (Capa 1) | ✓ VERIFIED | cache() + getClaims + null branches + cookie. 6/6 tests. |
| `src/app/actions/order-detail.ts` | getOrderDetailBundle 5→1 (Capa 2) | ✓ VERIFIED | 1 auth + Promise.all of 5 reads. |
| `src/lib/cache/reference-data.ts` | 3 unstable_cache wrappers (Capa 3) | ✓ VERIFIED | products/tags/pipelines, per-workspace tags, revalidate 300. |
| `src/app/get-query-client.ts` + `src/components/providers/query-provider.tsx` | QueryClient singleton + provider (Capa 4) | ✓ VERIFIED | QueryProvider mounted in `(dashboard)/layout.tsx:43-67` (outermost wrapper). |
| `src/hooks/use-messages.ts` | useMessages → React Query | ✓ VERIFIED | useQuery + setQueryData bridge, 0 refetch/setMessages. |
| 42 `src/app/actions/*.ts` files | 0 auth.getUser() global | ✓ VERIFIED | 43 files use getRequestAuth; 2 bootstrap files use local getClaims; global getUser=0. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| view-order-sheet.tsx | order-detail.ts | getOrderDetailBundle (single useEffect) | ✓ WIRED | 3 refs; 0 direct calls to the 5 collapsed actions. |
| order-detail.ts | getRequestAuth (cache dedup) | single await | ✓ WIRED | 1 auth resolution shared by the 5 reads via React cache(). |
| use-messages.ts | React Query cache | useQuery + setQueryData | ✓ WIRED | Realtime bridges via setQueryData, not refetch. |
| products/tags/orders actions | reference-data cache | getCachedX(auth.workspaceId) | ✓ WIRED | 2 refs each. |
| mutations | cache invalidation | updateTag('ref:*:'+ws) | ✓ WIRED | products=5, tags=4, pipelines=8. |
| middleware.ts | (untouched, D-04) | getUser refresh gate | ✓ WIRED | byte-identical, not in phase commits. |

### Anti-Patterns Found

None. Documented deviations are sound: Next 16 `revalidateTag(tag)` → `updateTag(tag)` (same internal mechanism, read-your-own-writes); bootstrap files use local getClaims to preserve first-login. Pre-existing test failures (somnio-v4 sub-loop wording asserts, DB-connection-refused integration tests) are unrelated to this phase — no phase-touched file is imported by any failing test.

### Human Verification Required

None outstanding. All 3 human-verify checkpoints (Plans 03, 04, 07) were APPROVED by the user in production:
- Plan 03 (ojito 5→1 + cache invalidation) — APPROVED, deploy `b2457077` green.
- Plan 04 (useMessages React Query revisits) — APPROVED.
- Plan 07 (5 sensitive files + bootstrap + Regla 6 agents/robot identical) — APPROVED, deploy `078598fd` green.

### Gaps Summary

No gaps. The phase delivers the structural latency fix it promised: the ~190 redundant per-action GoTrue round-trips are eliminated (0 `auth.getUser()` global in actions, replaced by local ES256 `getClaims()` deduped per-request via React `cache()`); the ojito's 5 serialized Server Actions collapse to one with real server-side `Promise.all`; reference data is cached with per-workspace tag invalidation; and inbox revisits are instant via React Query bridged to existing Realtime. Security boundary (middleware refresh/revocation gate, D-04) and Regla 3/Regla 6 are intact — the helper never leaked into agent/webhook/robot paths, and the production agents were verified operating identically.

---

_Verified: 2026-06-03T14:25:00Z_
_Verifier: Claude (gsd-verifier)_
