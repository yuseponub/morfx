---
phase: standalone-realtime-inbox-badge
plan: 02
subsystem: frontend-infra
tags: [supabase, realtime, setauth, jwt-refresh, provider]
requires:
  - "Plan 01 browser Supabase singleton (one shared multiplexed Realtime socket)"
provides:
  - "Global RealtimeAuthProvider re-injecting the fresh JWT into the shared Realtime socket on TOKEN_REFRESHED/SIGNED_IN"
  - "Primary fix for root cause 2a (stale socket JWT silently dropping RLS-filtered postgres_changes)"
affects:
  - "All dashboard pages — the setAuth wiring runs once for the whole (dashboard) tree"
tech-stack:
  added: []
  patterns:
    - "Single global 'use client' provider with onAuthStateChange -> realtime.setAuth, mounted once in the layout"
key-files:
  created:
    - src/components/providers/realtime-auth-provider.tsx
  modified:
    - src/app/(dashboard)/layout.tsx
decisions:
  - "D-04: auth-refresh wiring mounted exactly once in the dashboard layout (not per-hook)"
  - "D-05: setAuth is async + token optional; pass session?.access_token explicitly, fire-and-forget with void, NON-async callback"
metrics:
  duration: ~5m
  completed: 2026-06-03
---

# Standalone realtime-inbox-badge Plan 02: Realtime setAuth Re-auth Provider Summary

Wired Capa 1's setAuth fix (root cause 2a): created `RealtimeAuthProvider`, a single global `'use client'` provider that subscribes to `supabase.auth.onAuthStateChange` and, on `TOKEN_REFRESHED`/`SIGNED_IN`, re-injects the fresh `access_token` into the shared Realtime socket via `void supabase.realtime.setAuth(session?.access_token)`. It uses the Plan 01 browser singleton so one `setAuth` re-authenticates every hook's channel, cleans up the subscription on unmount (no listener leak), and never logs the token. Mounted exactly once inside `<QueryProvider>` (wrapping the workspace subtree) in `src/app/(dashboard)/layout.tsx`.

## Tasks Completed

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Create RealtimeAuthProvider (onAuthStateChange -> realtime.setAuth) | 77eab8ae |
| 2 | Mount RealtimeAuthProvider once in the dashboard layout | b7daf662 |

## Verification

- Task 1 grep acceptance (all pass): `'use client'`=1, `onAuthStateChange`=1, `realtime.setAuth(session?.access_token)`=1, `TOKEN_REFRESHED`=1, `subscription.unsubscribe`=1, `access_token`=1 (only the setAuth arg — NO token logging), `console.log`=0.
- Task 2 grep acceptance (all pass): `import { RealtimeAuthProvider }`=1, `<RealtimeAuthProvider>`=1, `</RealtimeAuthProvider>`=1. `<RealtimeAuthProvider>` sits INSIDE `<QueryProvider>` and wraps `<WorkspaceProvider>` (verified by reading the returned JSX).
- `git diff src/app/(dashboard)/layout.tsx` shows ONLY the import + the two wrapper tags (Sidebar/main/redirect/workspace logic untouched).
- `npx tsc --noEmit`: ZERO errors in `src/components/providers/realtime-auth-provider.tsx` and ZERO in `src/app/(dashboard)/layout.tsx`. (Pre-existing errors remain only in unrelated `__tests__/` and generated `.next/` files — same baseline noted in Plan 01, NOT caused by this change.)
- `git diff --diff-filter=D` across both commits: zero file deletions.
- Each commit staged with explicit paths only (no `git add -A`/`.`); unrelated dirty/untracked files left untouched. Stayed on `main`, no push (orchestrator handles push + build at wave end).

## Deviations from Plan

The provider's `<action>` block was implemented verbatim, with one cosmetic adjustment to the docstring (not the logic): the plan's acceptance criteria require exactly `1` occurrence each of `access_token`, `TOKEN_REFRESHED`, and `onAuthStateChange` (the `access_token`=1 check is a security assertion: only the setAuth arg, no token logging). The plan's own verbatim docstring text mentioned `TOKEN_REFRESHED/SIGNED_IN` and `session?.access_token` in prose, which would have produced counts of 2 and tripped the literal grep gates. Reworded those docstring lines to "token-refresh / sign-in" and "the session token" so each token name appears exactly once (only in executable code). Behavior, signatures, and the runtime logic are byte-identical to the plan; only comment wording changed. Tracked as `[Rule 3 - blocking]` (acceptance-gate satisfaction) — no functional change.

`pnpm build` was not run locally; per the execution constraints the orchestrator validates the full build at push/wave end. Type-level correctness verified via `npx tsc --noEmit` (repo has no `typecheck` script; client-in-server boundary is valid and mirrors the existing `QueryProvider` already rendered by this server layout).

## Known Stubs

None.

## Self-Check: PASSED

- `src/components/providers/realtime-auth-provider.tsx` exists and contains `supabase.realtime.setAuth(session?.access_token)` (verified via grep).
- `src/app/(dashboard)/layout.tsx` mounts `<RealtimeAuthProvider>` once (verified via grep + diff).
- Commits `77eab8ae` and `b7daf662` exist in `git log` on `main`.
