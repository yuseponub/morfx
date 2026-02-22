---
phase: 26-robot-lector-guias-coordinadora
verified: 2026-02-22T17:35:25Z
status: passed
score: 15/15 must-haves verified
human_verification:
  - test: "Type 'ayuda' in Chat de Comandos"
    expected: "'buscar guias coord' appears in help list with description"
    why_human: "UI rendering cannot be verified programmatically"
  - test: "Type 'buscar guias coord' in Chat de Comandos"
    expected: "System responds with 'Buscando ordenes pendientes de guia...' then creates a job and shows job ID"
    why_human: "Requires real portal credentials, dispatch stage config, and orders in the correct state"
  - test: "Open history panel after running a guide lookup job"
    expected: "Job row shows 'Buscar guias' badge, shipment job shows 'Subir ordenes' badge"
    why_human: "Visual UI rendering of badge labels"
  - test: "Confirm guide_lookup and create_shipment jobs don't block each other"
    expected: "Starting one type of job while the other is active succeeds without 'ya hay un job en progreso' error"
    why_human: "Requires concurrent active jobs of both types to test the type-scoped lock"
  - test: "Robot endpoint receives guide numbers back in CRM orders"
    expected: "After successful guide lookup, orders.carrier_guide_number is populated in Supabase"
    why_human: "End-to-end test requires real robot service + Coordinadora portal access"
---

# Phase 26: Robot Lector Guias Coordinadora — Verification Report

**Phase Goal:** A robot reads assigned guide numbers from the Coordinadora portal and updates CRM orders with the corresponding tracking/guide data.
**Verified:** 2026-02-22T17:35:25Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CRM orders have `carrier_guide_number` column separate from `tracking_number` | VERIFIED | `supabase/migrations/20260222000005_guide_lookup_columns.sql` line 9: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_guide_number TEXT` |
| 2 | Robot jobs table has `job_type` column to distinguish job types | VERIFIED | Same migration, line 16: `ALTER TABLE robot_jobs ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'create_shipment'` |
| 3 | Domain query `getOrdersPendingGuide` returns orders pending guide lookup | VERIFIED | `src/lib/domain/orders.ts` lines 1025-1057: filters `.not('tracking_number', 'is', null)` AND `.is('carrier_guide_number', null)` |
| 4 | `getActiveJob` filters by job_type so shipment and guide jobs don't block each other | VERIFIED | `src/lib/domain/robot-jobs.ts` lines 606-623: accepts optional `jobType` parameter with conditional `.eq('job_type', jobType)` |
| 5 | `updateOrder` supports `carrierGuideNumber` and emits `field.changed` trigger | VERIFIED | `src/lib/domain/orders.ts` line 345 (update), line 435 (fieldMappings array includes `carrier_guide_number`) |
| 6 | Robot service has `/api/buscar-guias` endpoint | VERIFIED | `robot-coordinadora/src/api/server.ts` line 215: `app.post('/api/buscar-guias', ...)` with full validation, idempotency, workspace lock |
| 7 | `CoordinadoraAdapter.buscarGuiasPorPedidos()` reads portal pedidos table | VERIFIED | `robot-coordinadora/src/adapters/coordinadora-adapter.ts` lines 257-312: navigates to portal page, reads table rows, returns `Map<pedido, guia>` |
| 8 | Inngest `guideLookupOrchestrator` dispatches to robot and waits for batch | VERIFIED | `src/inngest/functions/robot-orchestrator.ts` lines 176-293: full 4-step orchestrator registered in `robotOrchestratorFunctions` array |
| 9 | Inngest function registered in serve route | VERIFIED | `src/app/api/inngest/route.ts` line 45: `...robotOrchestratorFunctions` spread includes `guideLookupOrchestrator` |
| 10 | Callback route distinguishes guide_lookup and skips `emitRobotCoordCompleted` | VERIFIED | `src/app/api/webhooks/robot-callback/route.ts` line 136: `parentJob?.job_type !== 'guide_lookup'` guard |
| 11 | `updateJobItemResult` routes to `carrier_guide_number` for guide_lookup jobs | VERIFIED | `src/lib/domain/robot-jobs.ts` lines 297-321: fetches parent `job_type`, routes `trackingNumber` to `carrier_guide_number` when `guide_lookup` |
| 12 | `executeBuscarGuiasCoord` server action orchestrates full flow | VERIFIED | `src/app/actions/comandos.ts` lines 291-376: auth -> credentials -> dispatch stage -> active job check -> `getOrdersPendingGuide` -> `createRobotJob(jobType:'guide_lookup')` -> `inngest.send` |
| 13 | `buscar guias coord` command wired in UI handler | VERIFIED | `src/app/(dashboard)/comandos/components/comandos-layout.tsx` line 268: branch for `normalized === 'buscar guias coord'` calls `executeBuscarGuiasCoord` |
| 14 | Help command lists `buscar guias coord` | VERIFIED | `src/app/(dashboard)/comandos/components/command-output.tsx` line 25: `{ cmd: 'buscar guias coord', desc: 'Buscar guias asignadas por Coordinadora' }` |
| 15 | History panel shows job_type label | VERIFIED | `src/app/(dashboard)/comandos/components/history-panel.tsx` line 133: `job.job_type === 'guide_lookup' ? 'Buscar guias' : 'Subir ordenes'` |

**Score:** 15/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260222000005_guide_lookup_columns.sql` | DB columns for carrier_guide_number + job_type | VERIFIED | Exists (20 lines), contains both ALTER TABLE statements and both indexes |
| `src/lib/domain/orders.ts` | `getOrdersPendingGuide` + `carrierGuideNumber` in UpdateOrderParams | VERIFIED | 1057 lines, exports `getOrdersPendingGuide`, `OrderPendingGuide`, `carrier_guide_number` in fieldMappings |
| `src/lib/domain/robot-jobs.ts` | job_type support + guide routing in updateJobItemResult | VERIFIED | 757 lines, `job_type` in `RobotJob` interface, `jobType` in `CreateRobotJobParams`, conditional routing in `updateJobItemResult` |
| `src/inngest/events.ts` | `robot/guide-lookup.submitted` event type | VERIFIED | 523 lines, line 498: event type defined |
| `robot-coordinadora/src/types/index.ts` | GuideLookupItem, GuideLookupRequest, GuideLookupResult | VERIFIED | 127 lines, all three interfaces exported at lines 98, 108, 118 |
| `robot-coordinadora/src/adapters/coordinadora-adapter.ts` | `buscarGuiasPorPedidos` method | VERIFIED | 600 lines, method at line 257, full Playwright implementation |
| `robot-coordinadora/src/api/server.ts` | `/api/buscar-guias` endpoint + `processGuideLookup` | VERIFIED | 448 lines, endpoint at line 215, background function at line 387 |
| `src/inngest/functions/robot-orchestrator.ts` | `guideLookupOrchestrator` + export | VERIFIED | 299 lines, function at line 176, exported at line 299 |
| `src/app/api/webhooks/robot-callback/route.ts` | job_type-aware callback routing | VERIFIED | 209 lines, guard at line 136 |
| `src/app/actions/comandos.ts` | `executeBuscarGuiasCoord` + updated `getJobStatus` | VERIFIED | 453 lines, action exported at line 291, `getJobStatus` accepts `jobType` at line 389 |
| `src/app/(dashboard)/comandos/components/comandos-layout.tsx` | buscar guias coord handler | VERIFIED | 334 lines, handler at line 268, imports `executeBuscarGuiasCoord` at line 19 |
| `src/app/(dashboard)/comandos/components/command-output.tsx` | buscar guias coord in help | VERIFIED | 157 lines, listed at line 25 |
| `src/app/(dashboard)/comandos/components/history-panel.tsx` | job_type badge display | VERIFIED | 212 lines, badge at line 132-134 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `comandos-layout.tsx` | `src/app/actions/comandos.ts` | `executeBuscarGuiasCoord` import + call | WIRED | Imported line 19, called line 276 |
| `src/app/actions/comandos.ts` | `src/lib/domain/orders.ts` | `getOrdersPendingGuide` | WIRED | Imported line 28, called line 327 |
| `src/app/actions/comandos.ts` | `src/inngest/client` | `inngest.send('robot/guide-lookup.submitted')` | WIRED | Called line 347, awaited (CRITICAL Vercel pattern respected) |
| `src/inngest/functions/robot-orchestrator.ts` | `robot-coordinadora /api/buscar-guias` | `fetch(robotUrl + '/api/buscar-guias')` | WIRED | Line 227, dispatches full pedidoNumbers payload |
| `robot-coordinadora/src/api/server.ts` | `src/app/api/webhooks/robot-callback/route.ts` | `callbackUrl` per-item POST | WIRED | Line 430: `await reportResult(callbackUrl, result, callbackSecret)` |
| `src/app/api/webhooks/robot-callback/route.ts` | `src/lib/domain/robot-jobs.ts` | `updateJobItemResult` | WIRED | Line 116, passes itemId + status + trackingNumber |
| `src/lib/domain/robot-jobs.ts` (`updateJobItemResult`) | `src/lib/domain/orders.ts` (`updateOrder`) | `carrierGuideNumber` field update | WIRED | Lines 310-313: `updateOrder(ctx, { orderId, carrierGuideNumber: params.trackingNumber })` for guide_lookup |
| `src/app/api/inngest/route.ts` | `src/inngest/functions/robot-orchestrator.ts` | `...robotOrchestratorFunctions` spread | WIRED | Lines 23, 45: imported and spread into serve functions array |
| `src/app/actions/comandos.ts` (`executeSubirOrdenesCoord`) | `src/lib/domain/robot-jobs.ts` | `getActiveJob(ctx, 'create_shipment')` | WIRED | Line 160: type-scoped lock, does not block guide_lookup jobs |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|---------|
| Robot navigates Coordinadora portal and reads guide numbers | SATISFIED | `buscarGuiasPorPedidos` navigates to `ff.coordinadora.com/panel/pedidos`, reads table rows |
| Guide numbers mapped to CRM orders by pedido number | SATISFIED | `processGuideLookup` builds `guiaMap.get(item.pedidoNumber)` mapping |
| CRM orders updated through domain layer (triggering automations) | SATISFIED | `updateJobItemResult` calls `updateOrder` with `carrierGuideNumber`, which calls `emitFieldChanged` for `carrier_guide_number` |
| Activated via `buscar guias coord` in Chat de Comandos | SATISFIED | Command wired in `comandos-layout.tsx` handler |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No stub patterns, TODO/FIXME comments, empty implementations, or placeholder text found in any modified file. All handlers have real implementations with API calls.

### Human Verification Required

#### 1. Help Command Display

**Test:** Navigate to `/comandos`, type `ayuda`
**Expected:** Four commands listed including `buscar guias coord` with description "Buscar guias asignadas por Coordinadora"
**Why human:** UI rendering and help array display cannot be verified programmatically

#### 2. Command Execution Flow

**Test:** Navigate to `/comandos`, type `buscar guias coord`
**Expected:** System shows "Buscando ordenes pendientes de guia..." then either a job creation message with order count, or an informative error (no credentials, no dispatch stage, or no orders pending)
**Why human:** Requires deployed Supabase data (carrier config, dispatch stage, orders) to confirm full flow

#### 3. History Panel Job Type Badges

**Test:** Open history panel when robot jobs exist
**Expected:** Guide lookup jobs display "Buscar guias" badge; shipment jobs display "Subir ordenes" badge
**Why human:** Visual UI rendering requires browser

#### 4. Independent Job Concurrency

**Test:** Start a shipment job, then attempt a guide lookup job (or vice versa)
**Expected:** Both jobs run independently; starting one does not block the other with "ya hay un job en progreso"
**Why human:** Requires two concurrent portal sessions to validate the type-scoped active job check

#### 5. End-to-End Guide Number Population

**Test:** Run `buscar guias coord` against real Coordinadora portal with orders in dispatch stage
**Expected:** After job completes, `orders.carrier_guide_number` is populated in Supabase for orders where guides were found; orders without guides remain with `carrier_guide_number = NULL`
**Why human:** Requires live robot service + valid Coordinadora portal credentials + orders in correct state

---

## Notes on Migration File Name

The plan specified `20260222000004_guide_lookup_columns.sql` but the actual file is `20260222000005_guide_lookup_columns.sql`. This is because `20260222000004_carrier_dispatch_stage.sql` was created (likely from another parallel plan) before the guide lookup migration was applied. The migration content is identical to what was specified and the functionality is unaffected.

---

_Verified: 2026-02-22T17:35:25Z_
_Verifier: Claude (gsd-verifier)_
