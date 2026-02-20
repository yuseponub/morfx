---
phase: 22-robot-coordinadora-service
plan: 02
subsystem: infra
tags: [playwright, coordinadora, browser-automation, form-fill, sweetalert2, mui-autocomplete]

# Dependency graph
requires:
  - phase: 22-01
    provides: Project scaffold, PedidoInput/Credentials/GuiaResult types, tsconfig, package.json
provides:
  - Complete CoordinadoraAdapter class with Playwright automation for ff.coordinadora.com
  - Login with cookie session persistence per workspace
  - Form fill for all 15+ fields including MUI Autocomplete city selection
  - SweetAlert2 result detection (success/error) with pedido number extraction
affects: [22-03 Express server, 23 Inngest orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns: [adapter isolation (all Playwright in single class), MUI Autocomplete type-wait-ArrowDown-Enter, SweetAlert2 modal detection, per-workspace cookie persistence]

key-files:
  created:
    - robot-coordinadora/src/adapters/coordinadora-adapter.ts
  modified: []

key-decisions:
  - "fillField helper clears before fill (supports form reuse for multiple orders)"
  - "City autocomplete uses locator('input[id^=\"mui-\"]').first() for dynamic MUI IDs"
  - "COD toggle uses multi-selector fallback (checkbox, label, button) for portal resilience"
  - "Pedido number extraction uses cascading regex patterns (Pedido N, No. N, fallback 5+ digits)"
  - "takeScreenshot on all error paths for debugging in Docker/Railway"

patterns-established:
  - "fillField: clear-then-fill pattern for React SPA form fields with 200ms state sync delay"
  - "MUI Autocomplete: click -> fill('') -> fill(city) -> 1500ms wait -> ArrowDown -> 300ms -> Enter -> 500ms"
  - "SweetAlert2: waitForSelector('.swal2-popup') -> check .swal2-success/.swal2-error -> extract text -> click .swal2-confirm"
  - "Error resilience: field-level try/catch so optional fields don't abort entire form fill"

# Metrics
duration: 3min
completed: 2026-02-20
---

# Phase 22 Plan 02: CoordinadoraAdapter Summary

**Complete Playwright automation adapter for ff.coordinadora.com with login, cookie session persistence, 15+ form field fill (including MUI Autocomplete city), COD toggle, submit, and SweetAlert2 success/error detection returning GuiaResult with numeroPedido**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-20T23:18:53Z
- **Completed:** 2026-02-20T23:21:39Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Ported CoordinadoraAdapter class from existing proven robot to new microservice
- Implemented login flow with session cookie reuse per workspace (avoids re-login)
- Implemented createGuia with all form fields: personal data, city MUI Autocomplete, shipment data, COD
- SweetAlert2 result detection for success (extracts numeroPedido) and error (extracts error message)
- 534 lines of battle-tested Playwright automation code

## Task Commits

Each task was committed atomically:

1. **Task 1: CoordinadoraAdapter scaffold (init, login, cookies, close, helpers)** - `4e137d8` (feat)
2. **Task 2: createGuia with form fill, MUI autocomplete, SweetAlert2 detection** - `34bf722` (feat)

## Files Created/Modified
- `robot-coordinadora/src/adapters/coordinadora-adapter.ts` - Complete Playwright automation adapter (534 lines)

## Decisions Made
- Used `fill('')` before `fill(value)` on every field to clear previous values (important for form reuse in batch processing)
- MUI Autocomplete city selector uses `input[id^="mui-"]` prefix pattern since MUI generates dynamic IDs
- COD toggle uses multi-selector fallback (checkbox by name, then label by text) for portal resilience
- Pedido number extraction uses cascading regex patterns: "Pedido N" -> "No. N" -> "Numero N" -> any 5+ digit number
- Screenshot on every error path (login-failed, login-error, createGuia-error, swal-timeout) for debugging in Docker/Railway
- SweetAlert2 timeout set to 10 seconds (portal does server-side validation which takes variable time)
- 200ms delay after each field fill for React state sync; 1500ms after city type for autocomplete dropdown

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CoordinadoraAdapter is complete and ready for Plan 03 (Express server endpoints)
- The adapter exports `CoordinadoraAdapter` class with `init()`, `login()`, `createGuia()`, `close()`
- Express server (Plan 03) will instantiate the adapter per batch request
- No blockers

---
*Phase: 22-robot-coordinadora-service*
*Completed: 2026-02-20*
