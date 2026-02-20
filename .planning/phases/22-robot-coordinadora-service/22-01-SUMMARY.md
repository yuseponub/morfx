---
phase: 22-robot-coordinadora-service
plan: 01
subsystem: infra
tags: [playwright, express, typescript, docker, microservice, coordinadora]

# Dependency graph
requires:
  - phase: 21-db-domain-foundation
    provides: PedidoInput type contract, robot_jobs/robot_job_items tables, RobotEvents Inngest types
provides:
  - Compilable TypeScript standalone project (robot-coordinadora/)
  - Shared types mirroring MorfX PedidoInput contract
  - In-memory workspace mutex and per-order locking primitives
  - BatchRequest/BatchItemResult HTTP API contract types
affects: [22-02 CoordinadoraAdapter, 22-03 Express server, 23 Inngest orchestrator]

# Tech tracking
tech-stack:
  added: [playwright ^1.52.0, express ^4.21.0, tsx ^4.19.0]
  patterns: [standalone microservice scaffold, in-memory mutex with Map/Promise, per-order skip-lock with Set]

key-files:
  created:
    - robot-coordinadora/package.json
    - robot-coordinadora/tsconfig.json
    - robot-coordinadora/.dockerignore
    - robot-coordinadora/.gitignore
    - robot-coordinadora/src/types/index.ts
    - robot-coordinadora/src/middleware/locks.ts
  modified: []

key-decisions:
  - "Playwright ^1.52.0 range (resolves to 1.58.2 latest)"
  - "In-memory locks (Map + Set) -- single-instance service, no Redis needed"
  - "Separate standalone project at repo root, not inside src/"

patterns-established:
  - "Workspace mutex: Map<string, Promise<void>> with while-loop wait"
  - "Per-order skip lock: Set<string> with tryLockOrder/unlockOrder"
  - "Type mirroring: PedidoInput copied (not imported) between projects"

# Metrics
duration: 4min
completed: 2026-02-20
---

# Phase 22 Plan 01: Project Scaffold + Types + Locks Summary

**Standalone Express+Playwright microservice scaffold with MorfX-mirrored PedidoInput types and in-memory workspace/order locking primitives**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-20T23:11:55Z
- **Completed:** 2026-02-20T23:15:28Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created standalone robot-coordinadora project with Playwright, Express, TypeScript
- Defined all shared types (PedidoInput, BatchRequest, BatchItemResult, Credentials, OrderInput, GuiaResult)
- Implemented workspace mutex (withWorkspaceLock) and per-order skip lock (tryLockOrder/unlockOrder)
- Project compiles cleanly with `npx tsc --noEmit`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create project scaffold** - `0597605` (chore)
2. **Task 2: Create shared types and locking middleware** - `e1c3379` (feat)

## Files Created/Modified
- `robot-coordinadora/package.json` - Project dependencies (Playwright, Express, TypeScript)
- `robot-coordinadora/tsconfig.json` - Strict TS config, ES2022, NodeNext modules
- `robot-coordinadora/.dockerignore` - Docker build exclusions
- `robot-coordinadora/.gitignore` - Git exclusions (node_modules, dist, sessions)
- `robot-coordinadora/src/types/index.ts` - All shared types mirroring MorfX contracts
- `robot-coordinadora/src/middleware/locks.ts` - Workspace mutex + per-order skip lock

## Decisions Made
- Used `^1.52.0` version range for Playwright (resolves to 1.58.2 which is the latest stable)
- Chromium installed without `--with-deps` (system deps not available in dev WSL; Docker image will have them)
- In-memory locking with native Map/Set -- no external state needed for single-instance service

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx playwright install chromium --with-deps` failed in WSL due to sudo requirement for system dependencies. Installed without `--with-deps` successfully. The production Docker image (`mcr.microsoft.com/playwright`) includes all system dependencies pre-installed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Types and locks are ready for Plan 02 (CoordinadoraAdapter) and Plan 03 (Express server)
- All exports verified: PedidoInput, BatchRequest, BatchItemResult, OrderInput, Credentials, GuiaResult
- All lock exports verified: withWorkspaceLock, isWorkspaceLocked, tryLockOrder, unlockOrder
- No blockers

---
*Phase: 22-robot-coordinadora-service*
*Completed: 2026-02-20*
