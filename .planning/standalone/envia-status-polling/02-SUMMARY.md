---
phase: envia-status-polling
plan: 02
subsystem: logistics
tags: [envia, carrier, polling, inngest, cron, domain]
dependency-graph:
  requires: ["envia-status-polling-01"]
  provides: ["envia-api-client", "carrier-events-domain", "envia-polling-cron"]
  affects: ["envia-status-polling-03"]
tech-stack:
  added: []
  patterns: ["inngest-cron-batched-polling", "carrier-event-sourcing"]
key-files:
  created:
    - src/lib/carriers/envia-api.ts
    - src/lib/domain/carrier-events.ts
    - src/inngest/functions/envia-status-polling.ts
  modified:
    - src/lib/domain/carrier-configs.ts
    - src/app/api/inngest/route.ts
metrics:
  duration: ~4min
  completed: 2026-04-10
---

# Envia Status Polling Plan 02 Summary

Native fetch client for Envia status API + carrier events domain layer + Inngest cron polling every 2h Colombia time with batched API calls and change detection.

## Tasks Completed

### Task 1: Envia API client + carrier events domain layer
- **envia-api.ts**: Thin fetch wrapper for `ConsultaEstadoGuia` endpoint, 10s AbortSignal timeout, returns typed `EnviaStatusResponse` or null on any error
- **carrier-events.ts**: Domain layer for `order_carrier_events` table with `insertCarrierEvent`, `getLastCarrierEvent`, `getCarrierEventsByOrder` — all using createAdminClient + workspace_id filter
- **carrier-configs.ts**: Extended CarrierConfig interface with `status_polling_pipeline_id` (string|null) and `status_polling_stage_ids` (string[]|null). Added to UpsertCarrierConfigParams, insert path, update path. New `getStatusPollingStages()` convenience function returns `{ pipelineId, stageIds }` array pattern
- Commit: `e39f9c8`

### Task 2: Inngest cron function + registration
- **envia-status-polling.ts**: 3-step Inngest cron function:
  - Step 1 (`get-active-guides`): Queries across all workspaces, respects configured stage filters or falls back to observation mode (all envia orders)
  - Step 2 (`poll-batch-N`): Batches of 20 guides per step.run to avoid serverless timeouts, each batch calls fetchEnviaStatus
  - Step 3 (`process-changes`): Compares cod_estadog with last known cod_estado via domain layer, inserts new events on change detection
- Feature flag `ENVIA_AUTO_STAGE_MOVE` (OFF by default) for future stage automation
- Cron: `TZ=America/Bogota 0 5,7,9,11,13,15,17,19 * * *` (every 2h 5am-7pm)
- Registered in Inngest serve route with JSDoc update
- Commit: `3317981`

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| maybeSingle() for getLastCarrierEvent | Avoids PGRST116 error when no events exist, returns null cleanly |
| Observation mode fallback | When no carrier_configs have polling configured, polls ALL envia orders — allows testing before configuring stages |
| Batched step.run per 20 guides | Each step.run is a separate lambda invocation in Inngest; avoids 10min serverless timeout on large guide sets |

## Verification

- `npx tsc --noEmit` passes (only pre-existing vitest errors in somnio tests, out of scope)
- All exports correct and imported properly
- Cron expression validated (TZ= prefix pattern from close-stale-sessions.ts)

## Next Plan Readiness

Plan 03 (DB migration + env vars + UI config) is unblocked. Requires:
- Migration for `order_carrier_events` table
- Migration for `status_polling_pipeline_id` and `status_polling_stage_ids` columns on `carrier_configs`
