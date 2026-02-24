---
phase: 33-confidence-routing-disambiguation-log
plan: 01
subsystem: agents
tags: [somnio, classifier, confidence, disambiguation, migration, rls]

# Dependency graph
requires:
  - phase: 30-message-classification-silence-timer
    provides: classifyMessage function, HANDOFF_INTENTS, CONFIRMATORY_MODES, ACKNOWLEDGMENT_PATTERNS
provides:
  - disambiguation_log table with workspace isolation and RLS
  - LOW_CONFIDENCE_THRESHOLD constant (80)
  - Rule 1.5 confidence routing in classifyMessage
affects:
  - 33-02 (disambiguation logging in somnio-agent, writes to disambiguation_log)
  - 34-no-repetition-system (classifier behavior unchanged for high-confidence)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Confidence routing: 2-band threshold (respond >= 80, handoff < 80)"
    - "Reason string format: low_confidence:N for downstream parsing"

key-files:
  created:
    - supabase/migrations/20260302000000_disambiguation_log.sql
  modified:
    - src/lib/agents/somnio/constants.ts
    - src/lib/agents/somnio/message-category-classifier.ts

key-decisions:
  - "LOW_CONFIDENCE_THRESHOLD = 80 as simple numeric constant (not configurable per workspace yet)"
  - "Rule 1.5 placed after HANDOFF_INTENTS check: explicit handoff intents bypass confidence check"
  - "Reason string format low_confidence:N enables Plan 02 to parse confidence value for logging"
  - "contact_id nullable with ON DELETE SET NULL (contact may be deleted after log entry)"

patterns-established:
  - "Confidence routing: threshold-based branching in deterministic classifier"
  - "Disambiguation log: structured review table for human-in-the-loop learning"

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 33 Plan 01: Confidence Routing Foundation Summary

**disambiguation_log migration with workspace-isolated RLS and Rule 1.5 confidence check routing <80% detections to HANDOFF**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T18:50:58Z
- **Completed:** 2026-02-24T18:55:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created disambiguation_log table with full schema for human review workflow
- Activated Rule 1.5 in classifyMessage: confidence < 80 returns HANDOFF with parseable reason
- LOW_CONFIDENCE_THRESHOLD = 80 constant exported from constants.ts
- Migration ready for production application (Regla 5: apply before deploying Plan 02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create disambiguation_log migration** - `7ff25b5` (feat)
2. **Task 2: Add LOW_CONFIDENCE_THRESHOLD constant and activate Rule 1.5** - `6e71abd` (feat)

## Files Created/Modified
- `supabase/migrations/20260302000000_disambiguation_log.sql` - disambiguation_log table, 4 indexes, 3 RLS policies
- `src/lib/agents/somnio/constants.ts` - LOW_CONFIDENCE_THRESHOLD = 80 constant
- `src/lib/agents/somnio/message-category-classifier.ts` - Rule 1.5 confidence routing between HANDOFF_INTENTS and SILENCIOSO

## Decisions Made
- LOW_CONFIDENCE_THRESHOLD = 80 as simple numeric constant (not configurable per workspace yet)
- Rule 1.5 placed after HANDOFF_INTENTS check: explicit handoff intents bypass confidence check regardless of confidence level
- Reason string format `low_confidence:N` enables Plan 02 to parse confidence value for disambiguation logging
- contact_id nullable with ON DELETE SET NULL (contact may be deleted after log entry created)
- No updated_at column on disambiguation_log (records are immutable once reviewed; reviewed_at suffices)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

**Migration must be applied to production before deploying Plan 02 code** (Regla 5).

Apply: `supabase/migrations/20260302000000_disambiguation_log.sql`

## Next Phase Readiness
- Migration file ready for production application
- Classifier active with Rule 1.5 -- Plan 02 can now implement disambiguation logging in somnio-agent.ts
- LOW_CONFIDENCE_THRESHOLD importable from constants.ts for any module that needs it

---
*Phase: 33-confidence-routing-disambiguation-log*
*Completed: 2026-02-24*
