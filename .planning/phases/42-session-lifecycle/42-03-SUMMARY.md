---
phase: 42-session-lifecycle
plan: 03
subsystem: inngest-timers
tags: [inngest, timer, session, defensive-check, phase-42]
completed: 2026-04-06
requires: [42-01]
provides:
  - shared-timer-guard-helper
  - zombie-timer-protection
affects:
  - all-future-inngest-timer-handlers
tech-stack:
  added: []
  patterns:
    - defensive-read-before-act
    - shared-helper-across-handlers
key-files:
  created:
    - src/lib/agents/timer-guard.ts
  modified:
    - src/inngest/functions/agent-timers.ts
    - src/inngest/functions/agent-timers-v3.ts
---

# Phase 42 Plan 03: Defensive Timer-Guard Helper Summary

**One-liner:** Shared `checkSessionActive()` helper plus 6 defensive insertions across all Inngest timer handlers, preventing zombie timers from firing after session closure.

## What was built

1. **`src/lib/agents/timer-guard.ts`** — shared helper exposing:
   - `checkSessionActive(sessionId)` — read-only PK lookup on `agent_sessions.status`, returns discriminated union `{ ok: true } | { ok: false, status }`.
   - `guardTimerHandler(sessionId, logger, handlerName)` — convenience wrapper that logs + returns boolean.
   - Uses `createAdminClient()` (no domain layer — Regla 3 applies to mutations only; this is read-only).

2. **5 V1 timer handlers guarded** in `src/inngest/functions/agent-timers.ts` at the start of their terminal `step.run` callbacks.

3. **1 V3 timer handler guarded** in `src/inngest/functions/agent-timers-v3.ts`, inserted between the `is_agent_enabled` check and the `SessionManager` dynamic import. Includes the `level` field in the log context for L0-L8 observability.

## Final insertion line numbers (post-edit)

| # | Handler | File | Import line | Guard call line | Abort log |
|---|---|---|---|---|---|
| 1 | `ingestTimer` | `src/inngest/functions/agent-timers.ts` | 22 | 289 | `'Timer handler aborted: session no longer active'` (handlerName: `ingestTimer`) |
| 2 | `dataCollectionTimer` | `src/inngest/functions/agent-timers.ts` | 22 | 375 | same log, handlerName: `dataCollectionTimer` |
| 3 | `promosTimer` | `src/inngest/functions/agent-timers.ts` | 22 | 453 | same log, handlerName: `promosTimer` |
| 4 | `resumenTimer` | `src/inngest/functions/agent-timers.ts` | 22 | 531 | same log, handlerName: `resumenTimer` |
| 5 | `silenceTimer` | `src/inngest/functions/agent-timers.ts` | 22 | 628 | same log, handlerName: `silenceTimer` — inserted AFTER the agent-enabled check |
| 6 | `v3Timer` | `src/inngest/functions/agent-timers-v3.ts` | 20 | 261 | `'V3 timer aborted: session no longer active'` (handlerName: `v3Timer`, includes `level`) |

## Return shapes per handler

Handlers 1-4 (ingest / dataCollection / promos / resumen) return:
```ts
{ status: 'aborted' as const, reason: 'session_not_active' }
```
matching the existing abort-path convention in those handlers.

Handler 5 (silenceTimer) returns:
```ts
{ status: 'skipped', action: 'session_not_active' }
```
aligned with silenceTimer's other skip branches (`agent_disabled`, `already_sent`).

Handler 6 (v3Timer) returns:
```ts
{ status: 'skipped' as const, action: 'session_not_active' }
```
matching v3Timer's other skip branch (`agent_disabled`).

## Verification

- `grep -c 'checkSessionActive' src/inngest/functions/agent-timers.ts` → 6 (1 import + 5 calls)
- `grep -c 'Timer handler aborted' src/inngest/functions/agent-timers.ts` → 5
- `grep -c 'checkSessionActive' src/inngest/functions/agent-timers-v3.ts` → 2 (1 import + 1 call)
- `grep -c 'V3 timer aborted' src/inngest/functions/agent-timers-v3.ts` → 1
- `npx tsc --noEmit -p tsconfig.json` → clean on all 3 modified files (only pre-existing `vitest`/`__tests__` errors remain, unrelated).

## Decisions Made

- **Why `createAdminClient()` inside helper instead of passing the client:** keeps call sites to a single line; minor overhead (client creation) is negligible vs. the Inngest step runtime.
- **Why `.single()` not `.maybeSingle()`:** by-PK query should have exactly 1 row; missing row is abnormal and correctly treated as "abort" (returned as `status: 'not_found'`).
- **Why not use `guardTimerHandler()` (the convenience wrapper) in the handlers:** the handlers need to return a handler-specific shape (`aborted`/`reason` vs `skipped`/`action`), so they call `checkSessionActive()` directly and build their own return object. `guardTimerHandler()` is kept for future handlers that can use a boolean.
- **silenceTimer insertion placement:** AFTER the `is_agent_enabled` check (as specified in 03-PLAN.md) because the agent-enabled check is cheaper and the common path on disabled conversations.
- **v3Timer insertion placement:** AFTER the `is_agent_enabled` check and BEFORE the dynamic `SessionManager` import, so we skip the import entirely on aborted sessions.

## Deviations from Plan

None — plan executed exactly as written. The 03-PLAN.md specified approximate line numbers (~286, ~362, ~430, ~498, ~572 for V1 and ~245 for V3); after insertion, the final line numbers shifted downward due to the inserted blocks, as expected.

## Commits

- `6353038` feat(42-03): add timer-guard defensive check helper
- `1f71b5b` feat(42-03): add defensive check to V1 timer handlers
- `645838a` feat(42-03): add defensive check to V3 timer handler

## Next Phase Readiness

- **Plan 04** (session-manager hardening) is running concurrently on different files — no conflict.
- **Plan 05** will update STATE.md for the whole Phase 42.
- Once all waves land, a future `agent/v3.timer.started` event fired against a session that was closed between emission and handler run will now silently abort with an info log, preserving invariants even if Inngest's cancel-by-reference never lands.
