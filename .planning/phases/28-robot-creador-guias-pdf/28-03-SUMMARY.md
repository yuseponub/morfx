---
phase: 28-robot-creador-guias-pdf
plan: 03
subsystem: ui
tags: [settings, carrier-config, pipeline-stages, server-actions, logistics]

# Dependency graph
requires:
  - phase: 28-01
    provides: "carrier_configs DB columns + domain layer extensions for pdf_*_pipeline_id/stage_id/dest_stage_id"
provides:
  - "updateGuideGenConfig server action for Inter/Bogota/Envia config"
  - "Real carrier config cards in /settings/logistica for all 3 new carriers"
  - "GuideGenCard reusable sub-component with pipeline/source-stage/dest-stage selectors"
affects: ["28-04", "28-05"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GuideGenCard reusable sub-component pattern for carrier config cards"
    - "handleSaveGuideGen factory function returning carrier-specific save handlers"

key-files:
  created: []
  modified:
    - "src/app/actions/logistics-config.ts"
    - "src/app/(dashboard)/settings/logistica/components/logistics-config-form.tsx"

key-decisions:
  - "Extracted GuideGenCard sub-component to avoid duplicating 3 identical card structures"
  - "Pipeline change resets both source stage AND dest stage for that carrier"
  - "Removed Badge import since Proximamente badges no longer exist"

patterns-established:
  - "GuideGenCard: reusable card with icon/title/description + 3 selects (pipeline, source stage, dest stage) + save button"
  - "handleSaveGuideGen factory: single function creates save handlers for all 3 carrier types"

# Metrics
duration: 6min
completed: 2026-02-23
---

# Phase 28 Plan 03: Settings UI Config Cards Summary

**Real carrier config cards (Inter Rapidisimo, Bogota, Envia) replacing Proximamente placeholders with pipeline/stage/dest-stage selectors via GuideGenCard sub-component**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-23T22:48:40Z
- **Completed:** 2026-02-23T22:54:42Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `updateGuideGenConfig` server action that maps carrier types to column-specific domain params
- Replaced 3 disabled placeholder cards with fully functional config forms
- Extracted reusable `GuideGenCard` sub-component to keep code DRY across 3 carriers
- Each card has pipeline select, source stage select, and destination stage select
- Config reads existing values on page load and persists through domain layer

## Task Commits

Each task was committed atomically:

1. **Task 1: Server action for guide generation config** - `d948b56` (feat)
2. **Task 2: Replace placeholder cards with real config forms** - `d214766` (feat)

## Files Created/Modified
- `src/app/actions/logistics-config.ts` - Added updateGuideGenConfig server action with carrierType-to-column mapping
- `src/app/(dashboard)/settings/logistica/components/logistics-config-form.tsx` - Replaced placeholder cards with 3 real GuideGenCard instances + removed KNOWN_CARRIERS constant

## Decisions Made
- Extracted GuideGenCard sub-component: 3 cards with identical structure benefits from DRY extraction, reducing ~150 lines of duplication
- Pipeline change resets both source and dest stage: prevents stale stage references when pipeline changes
- Removed unused Badge import: cleanup since Proximamente badges no longer needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 carrier configs can now be set via UI, ready for plan 04 (Inngest orchestrators) to read these configs when generating guides
- Domain layer getGuideGenStage() already exists from plan 01 to read these configs at runtime

---
*Phase: 28-robot-creador-guias-pdf*
*Completed: 2026-02-23*
