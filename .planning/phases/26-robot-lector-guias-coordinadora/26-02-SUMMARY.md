---
phase: 26-robot-lector-guias-coordinadora
plan: 02
subsystem: robot-service, inngest, webhooks
tags: [playwright, inngest, robot, guide-lookup, callback, express]
depends_on:
  requires: [26-01]
  provides: [/api/buscar-guias endpoint, guideLookupOrchestrator function, job_type-aware callback routing]
  affects: [26-03]
tech_stack:
  added: []
  patterns: [parallel orchestrator function for guide lookup, batch table reading with Map]
key_files:
  created: []
  modified:
    - robot-coordinadora/src/types/index.ts
    - robot-coordinadora/src/adapters/coordinadora-adapter.ts
    - robot-coordinadora/src/api/server.ts
    - src/inngest/functions/robot-orchestrator.ts
    - src/app/api/inngest/route.ts
    - src/app/api/webhooks/robot-callback/route.ts
decisions:
  - GuideLookupResult reuses trackingNumber field for guide number (same callback contract as create_shipment)
  - reportResult accepts union type (BatchItemResult | GuideLookupResult) for type safety
  - guideLookupOrchestrator uses shorter timeout (10s/pedido + 3min vs 30s/order + 5min) since guide lookup reads one page
  - emitRobotCoordCompleted skipped for guide_lookup jobs (field.changed fires from domain updateOrder)
  - parentJob.job_type lookup added to callback route for trigger emission guard only (domain handles field routing)
metrics:
  duration: ~6 minutes
  completed: 2026-02-22
---

# Phase 26 Plan 02: Inngest Orchestrator + Robot Endpoint Summary

Robot service guide lookup endpoint, Inngest orchestrator function, and callback route extension for guide results.

## One-Liner

Added /api/buscar-guias robot endpoint with batch table reading, guideLookupOrchestrator Inngest function with dynamic timeout, and job_type-aware callback routing that skips robot.coord.completed for guide lookups.

## What Was Done

### Task 1: Robot service -- guide lookup endpoint and adapter method

**Types (robot-coordinadora/src/types/index.ts):**
- Added `GuideLookupItem` interface (itemId, orderId, pedidoNumber)
- Added `GuideLookupRequest` interface (workspaceId, credentials, callbackUrl, jobId, pedidoNumbers)
- Added `GuideLookupResult` interface (itemId, status, trackingNumber, guideFound, errorType, errorMessage)

**Adapter (robot-coordinadora/src/adapters/coordinadora-adapter.ts):**
- Added `buscarGuiasPorPedidos(pedidoNumbers)` public method
- Navigates to `ff.coordinadora.com/panel/pedidos`, waits for table render
- Reads all rows, builds Map of pedidoNumber -> guideNumber
- Batch optimized: loads page once, reads all rows, filters by target pedidos
- Excludes empty, "-", and "N/A" guide values

**Server (robot-coordinadora/src/api/server.ts):**
- Added separate `completedGuideLookups` idempotency cache
- Added `POST /api/buscar-guias` endpoint with full validation
- Added `processGuideLookup` background function with workspace lock
- Updated `reportResult` to accept `BatchItemResult | GuideLookupResult` union
- Pendiente results (no guide found) use `status: 'success'` with undefined trackingNumber
- Login failure reports all items as portal error

### Task 2: Inngest guide-lookup orchestrator + callback route extension

**Orchestrator (src/inngest/functions/robot-orchestrator.ts):**
- Added `guideLookupOrchestrator` Inngest function
- Event: `robot/guide-lookup.submitted`
- Steps: mark-processing -> dispatch-to-robot -> settle sleep -> waitForEvent
- Timeout: (N pedidos x 10s) + 3 min margin (shorter than shipment creation)
- retries: 0 (fail-fast, consistent with robot-orchestrator)
- onFailure handler marks job as failed (same pattern)
- Added to `robotOrchestratorFunctions` array (auto-registered via spread)

**Inngest route (src/app/api/inngest/route.ts):**
- Updated JSDoc comment to list guide-lookup-orchestrator
- No code changes needed (spread already includes new function)

**Callback route (src/app/api/webhooks/robot-callback/route.ts):**
- Added parentJob.job_type lookup after item lookup (minimal query)
- Updated trigger emission guard: `parentJob?.job_type !== 'guide_lookup'`
- For guide_lookup: field.changed fires automatically via domain layer (updateOrder -> emitFieldChanged)
- For create_shipment: robot.coord.completed fires as before (no change)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | reportResult accepts union type | GuideLookupResult has extra `guideFound` field; union type is cleaner than casting |
| 2 | Shorter timeout for guide lookup (10s + 3min) | Guide lookup reads one page for all pedidos, much faster than per-order form navigation |
| 3 | parentJob query is minimal (job_type only) | Domain layer handles all field routing; callback only needs job_type for trigger guard |

## Commit Log

| # | Hash | Message |
|---|------|---------|
| 1 | 62d0e58 | feat(26-02): robot service guide lookup endpoint and adapter method |
| 2 | d3f680f | feat(26-02): inngest guide-lookup orchestrator and callback route extension |

## Next Phase Readiness

Plan 26-03 (Chat de Comandos Command + UI) can proceed immediately:
- `/api/buscar-guias` robot endpoint is ready to receive dispatches
- `guideLookupOrchestrator` is registered and will process `robot/guide-lookup.submitted` events
- Callback route correctly handles guide lookup results (routes to carrier_guide_number via domain)
- `getOrdersPendingGuide` (from Plan 01) provides the preview/dispatch data
- `createRobotJob` (from Plan 01) accepts `jobType: 'guide_lookup'`
- `getActiveJob('guide_lookup')` (from Plan 01) supports concurrent job type checking
