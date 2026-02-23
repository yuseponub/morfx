---
phase: 28-robot-creador-guias-pdf
plan: 04
subsystem: orchestration
tags: [inngest, pdf-generation, excel-generation, claude-ai, supabase-storage, durable-workflow]

# Dependency graph
requires:
  - phase: 28-01
    provides: "getOrdersForGuideGeneration, moveOrderToStage domain helpers, Inngest event types"
  - phase: 28-02
    provides: "generateGuidesPdf, generateEnviaExcel, normalizeOrdersForGuide, normalizedToEnvia library functions"
provides:
  - "pdfGuideOrchestrator Inngest function (robot/pdf-guide.submitted)"
  - "excelGuideOrchestrator Inngest function (robot/excel-guide.submitted)"
  - "robotOrchestratorFunctions array with 5 orchestrators"
affects:
  - 28-05 (chat commands dispatch these orchestrators via Inngest events)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generate + upload in same step.run to avoid Inngest 4MB step output limit"
    - "Logo read from filesystem with graceful fallback (undefined if missing)"
    - "getPublicUrl for permanent download links (not signed URLs)"

key-files:
  created: []
  modified:
    - src/inngest/functions/robot-orchestrator.ts

key-decisions:
  - "Generate and upload in same Inngest step to avoid 4MB step output limit for buffers"
  - "Logo read via fs.readFileSync with try/catch -- logoBuffer can be undefined without failing the PDF"
  - "Stage move errors are logged but do not fail the job (non-fatal)"

patterns-established:
  - "Internal orchestrator pattern: fetch orders, normalize via Claude, generate document, upload to Storage, update items, move orders"
  - "Inngest onFailure handler pattern reused for 5th time in robot-orchestrator.ts"

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 28 Plan 04: Inngest Orchestrators for PDF + Excel Guide Generation Summary

**Two durable Inngest orchestrators (PDF + Excel) coordinating fetch-normalize-generate-upload-update-move workflow for shipping guide generation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T22:49:38Z
- **Completed:** 2026-02-23T22:54:00Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- PDF guide orchestrator: 6-step durable workflow (mark-processing, fetch-orders, normalize-data, generate-and-upload, update-items, move-orders) for Inter Rapidisimo / Bogota carriers
- Excel guide orchestrator: same 6-step pattern but generates Envia-format .xlsx using normalizedToEnvia() conversion
- Both orchestrators: fail-fast (retries: 0), onFailure handler marks job as failed, generate+upload in single step to avoid 4MB limit
- robotOrchestratorFunctions array now exports all 5 orchestrators (auto-registered via Inngest route spread)

## Task Commits

Each task was committed atomically:

1. **Task 1: PDF Guide Orchestrator** - `23464ef` (feat)
2. **Task 2: Excel Guide Orchestrator + export array update** - `603e6e7` (feat)

## Files Created/Modified

- `src/inngest/functions/robot-orchestrator.ts` - Added pdfGuideOrchestrator + excelGuideOrchestrator functions, updated imports, expanded robotOrchestratorFunctions to 5 entries

## Decisions Made

- Generate + upload in same step.run: Inngest serializes step return values, and PDF/Excel buffers can exceed 4MB. Returning only the download URL (string) keeps it well within limits.
- Logo read with graceful fallback: fs.readFileSync in try/catch means the PDF generates even if logo-light.png is missing (e.g., edge runtime without bundled public assets).
- Stage move errors are non-fatal: if moveOrderToStage fails for one order, the rest still proceed and the job completes successfully. Logged for debugging.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. ANTHROPIC_API_KEY is already configured for Claude AI normalization.

## Next Phase Readiness

- Both orchestrators are registered and ready to receive events
- Plan 05 (chat commands + settings UI) can now dispatch `robot/pdf-guide.submitted` and `robot/excel-guide.submitted` events
- The Inngest route at `/api/inngest` already spreads `robotOrchestratorFunctions`, so new functions are auto-registered

---
*Phase: 28-robot-creador-guias-pdf*
*Completed: 2026-02-23*
