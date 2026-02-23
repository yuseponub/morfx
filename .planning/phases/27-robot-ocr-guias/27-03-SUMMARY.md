---
phase: 27-robot-ocr-guias
plan: 03
subsystem: inngest
tags: [inngest, ocr, claude-vision, orchestrator, matching, domain-layer, robot-jobs]

# Dependency graph
requires:
  - phase: 27-01
    provides: automation trigger registration, Inngest event types, nullable order_id migration
  - phase: 27-02
    provides: extractGuideData, matchGuideToOrder, OCR types and normalization
  - phase: 23
    provides: robot-orchestrator pattern, callback route, domain robot-jobs
provides:
  - ocrGuideOrchestrator Inngest function (processes OCR images as durable steps)
  - getOrdersForOcrMatching domain query (eligible orders without guide number)
  - ocr_guide_read guard in updateJobItemResult (prevents double-write)
  - Explicit create_shipment guard in callback route trigger emission
affects: [27-04-chat-ui-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-process OCR orchestrator (Inngest steps, no external service dispatch)"
    - "Per-image step.run for durability (one failure doesn't kill batch)"
    - "matchedOrderIds Set prevents double-assignment across images"
    - "Structured value_sent JSONB with ocrCategory discriminator for UI rendering"

key-files:
  created: []
  modified:
    - src/inngest/functions/robot-orchestrator.ts
    - src/lib/domain/orders.ts
    - src/lib/domain/robot-jobs.ts
    - src/app/api/webhooks/robot-callback/route.ts
    - src/app/api/inngest/route.ts

key-decisions:
  - "OCR orchestrator runs OCR+matching as Inngest steps (not external service dispatch)"
  - "Eligible orders fetched once and shared across all images in batch"
  - "matchedOrderIds prevents same order being matched to multiple guides in one batch"
  - "4 outcome categories: auto_assigned, low_confidence, no_match, ocr_failed"
  - "Auto-assigned threshold: confidence >= 70%"
  - "updateJobItemResult skips updateOrder for ocr_guide_read (orchestrator handles directly)"
  - "Callback route trigger guard changed from negative (not guide_lookup) to positive (create_shipment only)"
  - "All outcomes store structured metadata in value_sent JSONB (ocrCategory field discriminates)"

patterns-established:
  - "In-process orchestrator pattern: OCR + matching as Inngest steps within MorfX (vs external dispatch)"
  - "Structured value_sent metadata: ocrCategory discriminator for categorized UI rendering"

# Metrics
duration: 8min
completed: 2026-02-23
---

# Phase 27 Plan 03: Inngest OCR Orchestrator + Trigger Summary

**Inngest OCR orchestrator processing guide images through Claude Vision with cascading matching, auto-assignment at >=70% confidence, and structured value_sent metadata for categorized UI rendering**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-23T16:07:40Z
- **Completed:** 2026-02-23T16:15:27Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Built ocrGuideOrchestrator Inngest function that processes each image as individual durable step (one failure doesn't kill batch)
- Domain query getOrdersForOcrMatching fetches eligible orders (no guide number) with flattened contact data for matching
- Added ocr_guide_read guard in updateJobItemResult to prevent double-write (orchestrator calls updateOrder directly)
- Changed callback route trigger guard to explicit create_shipment check (future-proof for new job types)
- All 4 outcome categories (auto_assigned, low_confidence, no_match, ocr_failed) store structured metadata in value_sent JSONB

## Task Commits

Each task was committed atomically:

1. **Task 1: Domain query for eligible orders + robot-jobs job type extension** - `f142b1b` (feat)
2. **Task 2: OCR Guide Orchestrator Inngest function + callback route extension** - `d6b0225` (feat)

## Files Created/Modified
- `src/lib/domain/orders.ts` - Added getOrdersForOcrMatching() and OrderForOcrMatching type
- `src/lib/domain/robot-jobs.ts` - Added ocr_guide_read guard in updateJobItemResult
- `src/inngest/functions/robot-orchestrator.ts` - Added ocrGuideOrchestrator function and OCR imports
- `src/app/api/webhooks/robot-callback/route.ts` - Changed trigger guard to explicit create_shipment check
- `src/app/api/inngest/route.ts` - Updated comment to document ocr-guide-orchestrator

## Decisions Made
- OCR orchestrator runs extraction+matching as Inngest steps within MorfX (unlike create_shipment/guide_lookup which dispatch to external robot service)
- Eligible orders fetched once per batch and shared across all images (efficiency)
- matchedOrderIds Set tracks auto-assigned orders to prevent double-assignment within a single batch
- Auto-assignment threshold: confidence >= 70% (phone=95, name=80 are auto-assigned; city=55, address=50 are low-confidence)
- Callback route guard changed from negative check (`!== 'guide_lookup'`) to positive check (`=== 'create_shipment'`) -- more explicit and future-proof

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. ANTHROPIC_API_KEY is already configured from previous phases.

## Next Phase Readiness
- OCR orchestrator complete and registered in Inngest serve route
- Ready for Chat de Comandos UI integration (Plan 04)
- All domain functions (getOrdersForOcrMatching, updateJobItemResult guard) in place
- Structured value_sent metadata ready for categorized UI rendering

---
*Phase: 27-robot-ocr-guias*
*Completed: 2026-02-23*
