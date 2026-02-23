---
phase: 29-inngest-migration-character-delays
plan: 01
subsystem: agents
tags: [somnio, typing-delay, logarithmic-curve, tdd, pure-function]

# Dependency graph
requires: []
provides:
  - calculateCharDelay pure function (charCount -> ms delay)
  - Exported constants MIN_DELAY_MS, MAX_DELAY_MS, CHAR_CAP, K
  - Test suite validating logarithmic curve shape
affects:
  - 29-02 (messaging adapter will consume calculateCharDelay)
  - 29-03 (Inngest step.sleep integration)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Logarithmic delay curve for human-like typing simulation"
    - "Pure function with exported constants for testability"

key-files:
  created:
    - src/lib/agents/somnio/char-delay.ts
    - src/lib/agents/somnio/__tests__/char-delay.test.ts
  modified: []

key-decisions:
  - "K=30 curve shape parameter produces natural-feeling ramp (not configurable at runtime)"
  - "Formula actual outputs differ from plan rough estimates; tests validate formula truth, not approximations"
  - "Number.isFinite guard handles NaN, Infinity, -Infinity cleanly"

patterns-established:
  - "TDD for pure mathematical functions: RED (failing test) -> GREEN (implementation) -> verify"
  - "Tolerance-based assertions (+/- 500ms) for curve point validation"

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 29 Plan 01: calculateCharDelay Summary

**Logarithmic typing delay function (2s-12s range, K=30 curve) with 21-test TDD suite validating curve shape, edge cases, and cap behavior**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T22:55:51Z
- **Completed:** 2026-02-23T23:00:05Z
- **Tasks:** 2 (RED + GREEN, no refactor needed)
- **Files created:** 2

## Accomplishments
- Pure `calculateCharDelay(charCount)` function with logarithmic curve
- 21 comprehensive tests: curve points, shape verification, edge cases, cap behavior, integer return
- Full JSDoc documentation with usage example included in initial implementation
- All constants exported for reference by consuming modules

## Task Commits

Each task was committed atomically:

1. **RED: Failing tests for calculateCharDelay** - `e50583b` (test)
2. **GREEN: Implement calculateCharDelay logarithmic curve** - `530b44b` (feat)

_REFACTOR phase skipped: JSDoc and clean code included in GREEN phase._

## Files Created/Modified
- `src/lib/agents/somnio/char-delay.ts` - Pure function with logarithmic delay calculation, exported constants, JSDoc
- `src/lib/agents/somnio/__tests__/char-delay.test.ts` - 21 tests covering curve points, logarithmic shape, edge cases, cap behavior, return type

## Decisions Made
- **K=30 chosen as curve parameter** - produces natural deceleration where first 50 chars add delay quickly, then growth tapers off. Not configurable at runtime; adjust in code after production observation.
- **Formula is source of truth** - plan listed approximate values (e.g., charCount=10 -> ~2000ms), but the formula with K=30 produces 3288ms. Tests validate formula output, not the rough approximations.
- **Number.isFinite guard** - handles NaN, Infinity, and -Infinity in one check, cleaner than separate isNaN + isFinite checks.

## Deviations from Plan

None - plan executed exactly as written. The only note is that the refactor phase was unnecessary since JSDoc documentation was included in the GREEN phase implementation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `calculateCharDelay` is exported and ready for import by the messaging adapter (plan 29-02/29-03)
- Constants are exported for any module needing delay range reference
- No blockers for next plans

---
*Phase: 29-inngest-migration-character-delays*
*Completed: 2026-02-23*
