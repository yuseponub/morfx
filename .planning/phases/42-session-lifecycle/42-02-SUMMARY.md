---
phase: 42-session-lifecycle
plan: 02
wave: 2
subsystem: inngest-crons
tags: [inngest, cron, agent-sessions, cleanup, rpc]
requires:
  - 42-01 (close_stale_agent_sessions RPC + partial unique index)
provides:
  - nightly automatic closure of stale agent sessions (02:00 America/Bogota)
  - observability via structured pino logs (closedCount + cronRunAt)
affects:
  - 42-05 (deploy + verification of function in Inngest dashboard)
tech-stack:
  added: []
  patterns:
    - "Inngest cron with inline TZ prefix: 'TZ=America/Bogota 0 2 * * *'"
    - "Thin cron delegating to Postgres RPC (no business logic in JS)"
key-files:
  created:
    - src/inngest/functions/close-stale-sessions.ts
  modified:
    - src/app/api/inngest/route.ts
decisions:
  - "RPC variant over inline JS UPDATE: chosen per 42-RESEARCH open question #3 — keeps staleness definition co-located with schema and timezone-aware in Postgres"
  - "Inline TZ= cron prefix: Inngest v3.51.0 has no separate timezone option; TZ prefix is the Inngest-documented canonical form"
  - "retries: 1 with throw-on-error: matches task-overdue-cron precedent; a single retry is enough for a nightly idempotent cleanup"
  - "Used createModuleLogger('close-stale-sessions') instead of console.log: more structured than the older task-overdue-cron pattern, consistent with newer Inngest functions in the repo"
metrics:
  duration: "~4m"
  completed: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  commits: 2
---

# Phase 42 Plan 02: Close Stale Sessions Inngest Cron Summary

## One-liner

Nightly Inngest cron (`close-stale-sessions`) at 02:00 America/Bogota that invokes the `close_stale_agent_sessions()` RPC (from 42-01) and logs the closed count, activating automatic daily cleanup of agent sessions with no activity that day.

## What Was Built

Two small, surgical additions to the Inngest layer — no business logic, no new dependencies, no touch to agent runtime code (which belongs to the parallel 03/04 plans).

### Task 1: `src/inngest/functions/close-stale-sessions.ts` (new, 54 lines)

A single scheduled Inngest function, `closeStaleSessionsCron`, following the `task-overdue-cron.ts` precedent exactly:

- **Schedule:** `{ cron: 'TZ=America/Bogota 0 2 * * *' }` — daily 02:00 Colombia time, inline TZ prefix (Inngest v3.51.0 has no separate timezone option).
- **Body:** Single `step.run('close-stale', ...)` that:
  1. Instantiates `createAdminClient()` (bypass RLS — matches precedent).
  2. Calls `supabase.rpc('close_stale_agent_sessions')`.
  3. Throws on RPC error (so Inngest honors `retries: 1`).
  4. Returns `{ closedCount: data?.[0]?.closed_count ?? 0 }`.
- **Observability:** `createModuleLogger('close-stale-sessions')` from `@/lib/audit/logger` emits a structured `logger.info` with `closedCount` and `cronRunAt` after the step completes.
- **Retries:** `retries: 1` — same as `task-overdue-cron`; sufficient for an idempotent nightly job.

No cancellation events, no concurrency limits, no rate limits — intentionally thin, as mandated by the plan.

### Task 2: `src/app/api/inngest/route.ts` (modified, +2 lines)

- Added import alongside other cron imports: `import { closeStaleSessionsCron } from '@/inngest/functions/close-stale-sessions'` (line 23, directly after `taskOverdueCron` import).
- Added `closeStaleSessionsCron,` to the `functions: [...]` array in `serve({...})` directly after `taskOverdueCron` (line 58), keeping crons grouped at the bottom of the list per this file's convention.
- `grep -n 'closeStaleSessionsCron' src/app/api/inngest/route.ts` returns exactly 2 hits as required.

This addresses 42-RESEARCH.md Pitfall 3: without route.ts registration the cron is a silent no-op in production.

## Verification

- File `close-stale-sessions.ts` compiles cleanly: `npx tsc --noEmit` reports zero errors mentioning it.
- Modified `route.ts` compiles cleanly: `npx tsc --noEmit` reports zero errors mentioning it.
- `grep -n 'closeStaleSessionsCron' src/app/api/inngest/route.ts` → 2 hits (line 23 import, line 58 array entry).
- `closeStaleSessionsCron` is a named export of the new module.
- Cron string uses exact `TZ=America/Bogota 0 2 * * *` format per 42-RESEARCH Common Pitfalls.
- RPC name `close_stale_agent_sessions` matches the one created in 42-01.

Note: the repo has no `npm run typecheck` script (only `dev`, `build`, `start`, `lint`). Verification used `npx tsc --noEmit --project tsconfig.json` filtered to the two touched paths.

## Decisions Made

1. **RPC over inline JS UPDATE.** 42-RESEARCH open question #3 left this flexible. Chose the RPC variant because staleness is a DB concept ("no activity today in America/Bogota"), and Postgres can express that timezone-aware check more faithfully than JS can. Also avoids shipping the staleness definition in two places.
2. **Inline `TZ=` cron prefix, not a config option.** Inngest v3.51.0 `createFunction` has no `timezone` field; the TZ prefix is the officially documented approach. Verified against task-overdue-cron which only uses `*/15 * * * *` (no TZ needed), but Inngest docs confirm the prefix form for timezone-sensitive crons.
3. **Structured logger over console.log.** `task-overdue-cron` predates the `createModuleLogger` convention and still uses `console.log`. Newer Inngest functions (e.g. `agent-timers-v3`) use `createModuleLogger`. Chose the newer pattern — the plan explicitly calls for it and it gives better production observability for a low-frequency job we'll only look at when something's off.
4. **`retries: 1`.** Matches task-overdue-cron precedent. One retry is enough for an idempotent nightly RPC; more retries would just mask a real RPC problem.

## Deviations from Plan

None. The plan specified an exact code snippet and file layout; this execution matches it line-for-line. The only nuance worth noting is that `npm run typecheck` does not exist in this repo — the plan's `<verify>` section assumed it might. Verification fell back to `npx tsc --noEmit --project tsconfig.json` filtered to the touched files (zero errors).

## Authentication Gates

None.

## Commits

| Task | Commit    | Message                                                       |
| ---- | --------- | ------------------------------------------------------------- |
| 1    | `1c4b4c5` | feat(42-02): add close-stale-sessions inngest cron            |
| 2    | `2a35d16` | feat(42-02): register close-stale-sessions cron in inngest route |

## Next Phase Readiness

- Wave 2 plan 02 is complete and ready for 42-05 deploy/verification.
- Function will appear in the Inngest dashboard after `git push origin main` (to be done in 42-05 per phase orchestration).
- First production firing: next 02:00 America/Bogota after deploy.
- No blockers for parallel plans 03/04 — zero file overlap.
- Watch-item for 42-05 verification: confirm `closedCount` log appears after first run and that `stale_cron_rule=1906` from 42-01 Q3 (flagged backlog of stale sessions) is gradually drained.
