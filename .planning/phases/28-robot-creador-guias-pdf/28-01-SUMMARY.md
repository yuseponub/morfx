---
phase: 28-robot-creador-guias-pdf
plan: 01
subsystem: database, api
tags: [supabase, inngest, carrier-configs, guide-generation, domain-layer]

# Dependency graph
requires:
  - phase: 21-db-domain-foundation
    provides: "carrier_configs table, robot_jobs domain"
  - phase: 27-robot-ocr-guias
    provides: "ocr_pipeline_id/ocr_stage_id columns on carrier_configs"
provides:
  - "9 new carrier_configs columns for guide generation stage config (inter, bogota, envia)"
  - "getGuideGenStage() domain helper for reading per-carrier pipeline/stage/dest-stage"
  - "getOrdersForGuideGeneration() domain query with tags (2-query batch pattern)"
  - "robot/pdf-guide.submitted and robot/excel-guide.submitted Inngest event types"
affects: [28-02-PLAN, 28-03-PLAN, 28-04-PLAN, 28-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-carrier column prefix pattern (pdf_inter_*, pdf_bogota_*, pdf_envia_*) for independent config"
    - "2-query batch tag fetching (orders then order_tags) for N+1 avoidance"

key-files:
  created:
    - "supabase/migrations/20260224000000_guide_gen_config.sql"
  modified:
    - "src/lib/domain/carrier-configs.ts"
    - "src/lib/domain/orders.ts"
    - "src/inngest/events.ts"

key-decisions:
  - "Guide gen config stored on same carrier_configs row (carrier='coordinadora') alongside dispatch/OCR config"
  - "Non-fatal tag fetch: getOrdersForGuideGeneration proceeds without tags on error rather than failing"
  - "destStageId nullable (optional post-generation stage move)"

patterns-established:
  - "getGuideGenStage carrier type switch pattern for column prefix mapping"
  - "Order tags batch-fetch pattern reusable for any order query needing tags"

# Metrics
duration: 5min
completed: 2026-02-23
---

# Phase 28 Plan 01: Guide Generation Data Foundation Summary

**9 carrier_configs columns for inter/bogota/envia stage config, getGuideGenStage + getOrdersForGuideGeneration domain helpers, and PDF/Excel Inngest event types**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-23T22:24:06Z
- **Completed:** 2026-02-23T22:29:49Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments
- DB migration adds 9 nullable UUID columns to carrier_configs (3 per carrier: pipeline, stage, dest_stage)
- Domain getGuideGenStage() reads per-carrier config with switch on 'inter' | 'bogota' | 'envia'
- Domain getOrdersForGuideGeneration() fetches orders with shipping data, products, and tag names using 2-query batch pattern
- Inngest events robot/pdf-guide.submitted and robot/excel-guide.submitted defined with full type safety

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration + domain carrier-configs + events** - `ff174c7` (feat)
2. **Task 2: Domain orders query for guide generation** - `174a659` (feat)

## Files Created/Modified
- `supabase/migrations/20260224000000_guide_gen_config.sql` - 9 new columns on carrier_configs with FK references and comments
- `src/lib/domain/carrier-configs.ts` - Extended CarrierConfig/UpsertCarrierConfigParams, added getGuideGenStage()
- `src/lib/domain/orders.ts` - Added OrderForGuideGen interface and getOrdersForGuideGeneration() with tag batching
- `src/inngest/events.ts` - Added robot/pdf-guide.submitted and robot/excel-guide.submitted to RobotEvents

## Decisions Made
- Guide gen config stored on same carrier_configs row (carrier='coordinadora') alongside dispatch/OCR config -- no need for separate rows per carrier type since all configs are per-workspace
- Non-fatal tag fetch: if tags query fails, orders are returned without tags rather than failing the entire operation
- destStageId is nullable: post-generation stage move is optional per carrier type

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 (PDF orchestrator + normalization) can now use getGuideGenStage() and getOrdersForGuideGeneration()
- Plan 03 (Excel Envia) can reuse same domain infrastructure
- Plan 04 (chat commands) can dispatch robot/pdf-guide.submitted and robot/excel-guide.submitted events
- Plan 05 (settings UI) can read/write the 9 new carrier_configs columns via upsertCarrierConfig()

---
*Phase: 28-robot-creador-guias-pdf*
*Completed: 2026-02-23*
