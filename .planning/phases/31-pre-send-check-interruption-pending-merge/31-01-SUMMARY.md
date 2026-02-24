---
phase: 31-pre-send-check-interruption-pending-merge
plan: 01
subsystem: agents
tags: [block-composer, priority-merge, tdd, pure-function, somnio]

# Dependency graph
requires:
  - phase: 30-message-classification-silence-timer
    provides: "Message classification (RESPONDIBLE/SILENCIOSO/HANDOFF) that determines when blocks are sent"
provides:
  - "composeBlock() pure function for block composition with priority merge"
  - "TemplatePriority, PrioritizedTemplate, BlockCompositionResult types"
  - "PRIORITY_RANK constant for priority ordering"
  - "BLOCK_MAX_TEMPLATES=3, BLOCK_MAX_INTENTS=3 constants"
affects:
  - "31-02 (block priorities DB infrastructure imports TemplatePriority)"
  - "31-03 (pre-send check uses composeBlock in orchestrator pipeline)"
  - "31-04 (interruption handler feeds pending templates to composeBlock)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure function composition with Map<string, T[]> input for intent grouping"
    - "Priority-based merge algorithm with dedup and tiebreaker rules"
    - "Overflow routing: OPC -> dropped (permanent), CORE/COMP -> pending (next cycle)"

key-files:
  created:
    - "src/lib/agents/somnio/block-composer.ts"
    - "src/lib/agents/somnio/__tests__/block-composer.test.ts"
  modified:
    - "src/lib/agents/somnio/constants.ts"

key-decisions:
  - "Dedup across block and pool: when same templateId appears in both CORE selection (block) and pending pool, pending version replaces block entry via shouldReplace()"
  - "Intent cap overflow routes CORE/COMP to pending and OPC to dropped (excess intents never silently vanish)"
  - "Pool sorting: PRIORITY_RANK first, then isNew tiebreaker (pending wins), then orden"

patterns-established:
  - "Block composition algorithm: intent cap -> CORE extraction -> pool dedup -> priority sort -> fill -> overflow routing"
  - "shouldReplace helper for in-place block dedup when pool template is preferred over existing block entry"

# Metrics
duration: 7min
completed: 2026-02-24
---

# Phase 31 Plan 01: BlockComposer Summary

**Pure composeBlock() function with 3-intent cap, CORE-first selection, priority-ranked pool merge, dedup, and overflow routing (CORE/COMP to pending, OPC dropped) -- 21 tests via TDD**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-24T03:16:11Z
- **Completed:** 2026-02-24T03:24:07Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 3

## Accomplishments
- composeBlock pure function implementing full block composition + merge algorithm
- 21 tests covering all 11 plan-specified cases plus 6 edge cases plus 4 constant validations
- Types and constants exported as single source of truth for downstream plans
- Zero external dependencies -- pure algorithm with no DB/side-effect coupling

## Task Commits

Each task was committed atomically (TDD RED-GREEN):

1. **RED: Failing tests + constants** - `2fd7f01` (test)
2. **GREEN: Implementation passes all tests** - `dc15226` (feat)

_No REFACTOR commit needed -- code was clean after GREEN phase._

## Files Created/Modified
- `src/lib/agents/somnio/block-composer.ts` - composeBlock pure function, types (TemplatePriority, PrioritizedTemplate, BlockCompositionResult), PRIORITY_RANK constant
- `src/lib/agents/somnio/__tests__/block-composer.test.ts` - 21 tests (454 lines) covering all composition scenarios
- `src/lib/agents/somnio/constants.ts` - Added BLOCK_MAX_TEMPLATES=3 and BLOCK_MAX_INTENTS=3

## Decisions Made
- **Block-level dedup via shouldReplace**: When the same templateId appears in both the CORE selection (added to block at Step 3) and the pending pool, the pool version can replace the block entry if it's the preferred version (pending at same priority). This ensures Case 8 (dedup across new+pending) works correctly.
- **Excess intent overflow classification**: Templates from excess intents (beyond BLOCK_MAX_INTENTS) are classified individually -- OPC goes to dropped (permanent), CORE/COMP goes to pending (recoverable next cycle).
- **Pool sort order**: PRIORITY_RANK (CORE=0 > COMP=1 > OPC=2) as primary sort, isNew tiebreaker (pending first), then orden as final tiebreaker.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **Case 8 dedup across block/pool**: Initial implementation skipped pool templates already in block (from CORE selection) without checking if the pool version was preferred. Fixed by adding shouldReplace() check that replaces block entries when the pool candidate is pending at same priority. Discovered during GREEN phase, fixed before commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- composeBlock() ready for integration into pre-send check pipeline (Plan 03)
- Types exported for Plan 02 to re-export from types.ts (key_link documented in plan)
- Constants in zero-import constants.ts, safe for any module to import

---
*Phase: 31-pre-send-check-interruption-pending-merge*
*Plan: 01*
*Completed: 2026-02-24*
