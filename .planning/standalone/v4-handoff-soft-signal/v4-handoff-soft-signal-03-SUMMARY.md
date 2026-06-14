---
phase: v4-handoff-soft-signal
plan: "03"
subsystem: api
tags: [somnio-v4, interruption-system-v2, zombie, error-handling, inngest]

# Dependency graph
requires:
  - phase: v4-handoff-soft-signal
    provides: "Plan 01 (soft signal + executeHandoff suppression) + Plan 02 (inbox note) — same standalone"
provides:
  - "Zombie V4_ZOMBIE_LAMBDA_EXIT at ckpt_0_post_acquire no longer writes [ERROR AGENTE] in inbox (Inngest path)"
  - "Zombie V4_ZOMBIE_LAMBDA_EXIT at ckpt_0_post_acquire no longer writes [ERROR AGENTE] in inbox (inline path)"
  - "Benign zombie suppression: isZombieAtCkpt0 guard in both write-error-message paths"
affects: [v4-handoff-soft-signal, somnio-v4, interruption-system-v2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isZombieAtCkpt0 guard pattern: check error.code + error.message string before writing inbox note"
    - "Pitfall 4 two-path guard: same guard applied to both Inngest path (agent-production.ts) and inline path (webhook-handler.ts)"

key-files:
  created: []
  modified:
    - src/inngest/functions/agent-production.ts
    - src/lib/whatsapp/webhook-handler.ts

key-decisions:
  - "Guard condition: error.code === 'V4_ZOMBIE_LAMBDA_EXIT' && error.message includes 'ckpt_0_post_acquire' (D-06)"
  - "isZombieAtCkpt0 declared OUTSIDE step.run callback so Inngest skips the entire step (not just the insert)"
  - "Exception-path catch block in webhook-handler.ts (~line 560) left untouched — different error path"
  - "Pre-existing restart-loop.test.ts failure confirmed as out-of-scope (fails without changes)"

patterns-established:
  - "Two-path zombie guard: always check BOTH agent-production.ts (Inngest) AND webhook-handler.ts (inline) for error inserts"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-06-14
---

# v4-handoff-soft-signal Plan 03 Summary

**Zombie V4_ZOMBIE_LAMBDA_EXIT at ckpt_0_post_acquire suppressed from inbox [ERROR AGENTE] in both Inngest and inline paths, while zombie_lambda_exit observability event and all other error paths remain unchanged**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-14T04:13:47Z
- **Completed:** 2026-06-14T04:20:08Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `isZombieAtCkpt0` guard in `agent-production.ts` step.run block (Inngest path) — benign zombie at ckpt_0 skips the entire write-error-message step
- Added `isZombieAtCkpt0` guard in `webhook-handler.ts` processAgentInline (inline/fallback path) — same condition, same suppression
- zombie_lambda_exit observability event in `interruption-system-v2/checkpoints.ts:117` left untouched — the detection mechanism is unmodified
- Later-checkpoint zombies (ckpt_1 through ckpt_7) and all non-zombie errors continue to write [ERROR AGENTE] as before

## Task Commits

Each task was committed atomically:

1. **Task 1: Guard the Inngest path [ERROR AGENTE] insert in agent-production.ts** - `f5d27632` (feat)
2. **Task 2: Guard the inline path [ERROR AGENTE] insert in webhook-handler.ts** - `f336180f` (feat)

## Files Created/Modified
- `src/inngest/functions/agent-production.ts` - Added isZombieAtCkpt0 guard before write-error-message step.run (Inngest path)
- `src/lib/whatsapp/webhook-handler.ts` - Added isZombieAtCkpt0 guard before messages insert in processAgentInline (inline path)

## Decisions Made
- Guard declared OUTSIDE `step.run` callback in agent-production.ts so Inngest skips the entire step checkpoint when it's a benign zombie (not just skips inside the step)
- Exception-path catch block at webhook-handler.ts ~line 560 intentionally NOT modified — that handles processMessageWithAgent throws, not V4_ZOMBIE_LAMBDA_EXIT path
- guard condition uses `error.message?.includes('ckpt_0_post_acquire')` rather than structured field (string check is simpler and sufficient per D-06)

## Deviations from Plan

### Minor: ERROR AGENTE grep count includes comment line

The plan's `<done>` criterion for Task 2 says `grep -c "ERROR AGENTE" webhook-handler.ts` should return 2. The actual count is 3 because our guard comment on line 547 contains the text "ERROR AGENTE" (in the comment "suppress [ERROR AGENTE] for V4_ZOMBIE_LAMBDA_EXIT..."). This is cosmetic — the actual insert count (1 guarded + 1 unguarded exception path) is exactly as specified. No code fix needed.

### Pre-existing test failure (out of scope)

`src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` has 1 failing test (`expect(restartEvents).toHaveLength(0)` — restart_iteration event count). Verified: this failure exists WITHOUT our changes (via `git stash` + re-run). The 5 other test suites in interruption-system-v2 pass. This is a pre-existing issue unrelated to Plan 03 scope.

---

**Total deviations:** 0 auto-fixed (no code changes beyond plan)
**Impact on plan:** No scope creep. Plan executed exactly as written.

## Issues Encountered
- Pre-existing restart-loop.test.ts failure confirmed as out-of-scope by stash verification

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 plans in v4-handoff-soft-signal standalone complete
- v4 remains DORMANT in production (Regla 6 — no activation change)
- Operator inbox will no longer show false-positive [ERROR AGENTE] zombie notes when v4 is activated
- zombie_lambda_exit observability events still fire for monitoring/alerting

## Self-Check

### Files exist:
- `src/inngest/functions/agent-production.ts` — exists, modified (guard added)
- `src/lib/whatsapp/webhook-handler.ts` — exists, modified (guard added)

### Commits exist:
- f5d27632 — Task 1 (Inngest path)
- f336180f — Task 2 (inline path)

## Self-Check: PASSED

---
*Phase: v4-handoff-soft-signal*
*Completed: 2026-06-14*
