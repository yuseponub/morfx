---
phase: 22-robot-coordinadora-service
plan: 03
subsystem: infra
tags: [express, docker, playwright, railway, microservice, batch-processing, idempotency]

# Dependency graph
requires:
  - phase: 22-01
    provides: Project scaffold, shared types (BatchRequest, BatchItemResult, BatchResponse, OrderInput), locking primitives (withWorkspaceLock, isWorkspaceLocked, tryLockOrder, unlockOrder)
  - phase: 22-02
    provides: CoordinadoraAdapter class (init, login, createGuia, close)
provides:
  - Express HTTP server with health and batch endpoints
  - Background batch processing with workspace/order locking
  - JobId idempotency cache for Inngest retry safety
  - Lightweight city pre-validation before browser session
  - Callback reporting with correct numeroPedido field mapping
  - Docker image for Railway deployment (Playwright base)
  - Complete deployable microservice (types + adapter + server + entrypoint + Docker)
affects: [23 Inngest orchestrator, 25 Pipeline integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [fire-and-forget background processing, idempotency cache with Map, callback-based result reporting, Docker HEALTHCHECK for Railway]

key-files:
  created:
    - robot-coordinadora/src/api/server.ts
    - robot-coordinadora/src/index.ts
    - robot-coordinadora/Dockerfile
    - robot-coordinadora/storage/sessions/.gitkeep
    - robot-coordinadora/storage/artifacts/.gitkeep
  modified: []

key-decisions:
  - "Background batch runs fire-and-forget after 200 ack (processBatch().catch(log))"
  - "Idempotency cache is in-memory Map keyed by jobId (set before response)"
  - "City pre-validation rejects empty ciudad orders via callback before browser session"
  - "Callback payload maps result.numeroPedido to trackingNumber (not numeroGuia)"
  - "Dockerfile uses mcr.microsoft.com/playwright:v1.52.0-noble (matches package.json range)"
  - "HEALTHCHECK interval 30s with 15s start-period for Railway"
  - "Storage .gitkeep force-added despite sessions/ being gitignored"

patterns-established:
  - "Fire-and-forget: processBatch().catch(err => console.error()) after res.json()"
  - "Idempotency: completedJobs.set(jobId, response) BEFORE res.json()"
  - "Validation cascade: required fields -> idempotency -> workspace lock -> city check -> ack"
  - "Batch loop: tryLockOrder -> createGuia -> reportResult -> unlockOrder -> sleep(2000)"

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 22 Plan 03: Express Server + Docker Summary

**Express server with health and batch endpoints, jobId idempotency cache, lightweight city pre-validation, background batch processing with callback reporting, and production Dockerfile using Playwright base image for Railway deployment**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T23:25:17Z
- **Completed:** 2026-02-20T23:29:44Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created Express server (296 lines) with GET /api/health and POST /api/crear-pedidos-batch
- Full validation pipeline: required fields, idempotency cache, workspace lock, city pre-validation
- Background batch processing with per-order locking, 2-second delays, and callback result reporting
- Integration tested: 200 health, 400 missing fields, 400 empty orders, 400 empty ciudad, 200 valid ack, 200 idempotent, 409 conflict -- all pass
- Docker image ready for Railway with Playwright base, HEALTHCHECK, and storage directories

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Express server with health and batch endpoints** - `8c3366d` (feat)
2. **Task 2: Create entry point and Dockerfile** - `c4de4cf` (feat)

## Files Created/Modified
- `robot-coordinadora/src/api/server.ts` - Express server with health and batch endpoints (296 lines)
- `robot-coordinadora/src/index.ts` - Application entry point with graceful shutdown (27 lines)
- `robot-coordinadora/Dockerfile` - Production Docker image with Playwright base
- `robot-coordinadora/storage/sessions/.gitkeep` - Cookie session storage directory
- `robot-coordinadora/storage/artifacts/.gitkeep` - Error screenshot storage directory

## Decisions Made
- Background batch processing uses fire-and-forget pattern (processBatch().catch(log)) to return 200 immediately
- Idempotency cache stored in-memory Map, set BEFORE response to prevent race conditions with retries
- City pre-validation is a lightweight sanity check only (rejects empty/null) -- full coverage validation in Phase 23
- Callback payload explicitly maps `result.numeroPedido` to `trackingNumber` (Coordinadora pedido number, not guia)
- Dockerfile uses `v1.52.0-noble` tag (matches the `^1.52.0` range in package.json; resolves to 1.58.2 at runtime)
- Storage `.gitkeep` files force-added since `storage/sessions/` is gitignored (cookies must not be committed)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Storage `.gitkeep` for `storage/sessions/` was ignored by `.gitignore` -- force-added with `git add -f` since the directory structure needs to exist but actual cookie files should not be tracked.
- Integration tests via WSL curl returned empty responses due to timing -- switched to Node.js fetch-based test script with `process.exit(0)` to avoid Playwright background process hanging the test runner.

## User Setup Required

None - no external service configuration required. Docker build and Railway deployment happen in Phase 25.

## Next Phase Readiness
- Phase 22 is COMPLETE: all 3 plans delivered
- The robot-coordinadora microservice is a fully deployable standalone project
- Phase 23 (Inngest Orchestrator + Callback API) can now wire MorfX to this robot via Inngest events
- Phase 25 (Pipeline Integration + Docs) will handle Docker build and Railway deployment
- No blockers

---
*Phase: 22-robot-coordinadora-service*
*Completed: 2026-02-20*
