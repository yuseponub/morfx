---
phase: robot-coordinadora-hardening
plan: 03
subsystem: logistics-robot
tags: [inngest, server-actions, domain-layer, error-handling, ocr]
dependency-graph:
  requires: ["hardening-01"]
  provides: ["hardened-server-actions", "createOcrRobotJob-domain-function"]
  affects: ["hardening-04"]
tech-stack:
  added: []
  patterns: ["try-catch-cleanup on inngest.send", "domain function for OCR jobs"]
key-files:
  created: []
  modified:
    - src/app/actions/comandos.ts
    - src/lib/domain/robot-jobs.ts
decisions:
  - id: soft-tracking-validation
    summary: "Tracking number validation is soft (warn, don't block) since formats vary by carrier"
  - id: safe-access-filter-pattern
    summary: "pedidoNumbers uses .map().filter(NonNullable) pattern instead of non-null assertions"
  - id: task2-merged-into-task1
    summary: "Task 2 changes were naturally part of the same code edits as Task 1, committed atomically"
metrics:
  duration: "8m"
  completed: "2026-02-24"
---

# Hardening Plan 03: Server Actions Hardening Summary

**One-liner:** Try-catch all inngest.send() with job cleanup, safe access patterns, domain layer for OCR jobs, soft tracking validation

## What Was Done

### Task 1: createOcrRobotJob domain function + try-catch all inngest.send

**Commit:** `f4947b7`

**Part A -- createOcrRobotJob domain function:**
- Added `createOcrRobotJob()` to `src/lib/domain/robot-jobs.ts`
- Creates robot_jobs row (carrier: 'multi', job_type: 'ocr_guide_read') with workspace_id
- Creates robot_job_items with order_id = NULL (OCR images, not orders)
- Includes rollback: deletes job if items insertion fails
- Exported with proper types: `CreateOcrRobotJobParams`, `CreateOcrRobotJobResult`

**Part B -- Try-catch all 6 inngest.send() calls:**
All 6 action functions now have:
```typescript
try {
  await (inngest.send as any)({ ... })
} catch (sendError) {
  console.error(`[comandos] Inngest send failed for job ${jobId}:`, sendError)
  try {
    await updateJobStatus(ctx, { jobId, status: 'failed' })
  } catch (cleanupError) {
    console.error(`[comandos] Job cleanup also failed:`, cleanupError)
  }
  return { success: false, error: 'Error iniciando el procesamiento...' }
}
```

Actions hardened:
1. `executeSubirOrdenesCoord` -- create_shipment dispatch
2. `executeBuscarGuiasCoord` -- guide_lookup dispatch
3. `executeLeerGuias` -- ocr_guide_read dispatch
4. `executeGenerarGuiasInter` -- pdf_guide_inter dispatch
5. `executeGenerarGuiasBogota` -- pdf_guide_bogota dispatch
6. `executeGenerarExcelEnvia` -- excel_guide_envia dispatch

### Task 2: Safe access, domain refactor, tracking validation

All Task 2 changes were part of the same commit (`f4947b7`) as they were in overlapping code sections:

**Bug #7 -- Safe access in executeBuscarGuiasCoord:**
- Replaced `jobResult.data!.items.find(...)!` with optional chaining `jobResult.data?.items.find(...)`
- Replaced `order.tracking_number` direct access with null check
- Uses `.map().filter(NonNullable)` pattern instead of non-null assertions
- Returns early if pedidoNumbers is empty: "Ninguna orden tiene numero de pedido asignado"

**Bug #10 -- executeLeerGuias domain layer refactor:**
- Replaced raw `supabase.from('robot_jobs').insert(...)` and `supabase.from('robot_job_items').insert(...)` with `createOcrRobotJob(ctx, { fileCount })`
- Removed `crypto.randomUUID()` calls (domain function handles ID generation)
- Storage upload still uses dynamic `createAdminClient` import (correct -- storage is not a domain concern)

**Bug #18 -- Tracking number format validation:**
- Added soft validation after pedidoNumbers filter
- Checks `length < 3 || length > 50` as suspicious
- Logs warning but does NOT block (carrier formats vary)

## Bugs Fixed

| Bug | Priority | Description | Fix |
|-----|----------|-------------|-----|
| #2 | P0 | Orphaned pending jobs when inngest.send fails | Try-catch + updateJobStatus('failed') on all 6 actions |
| #7 | P1 | Non-null assertion crash on null tracking_number/item match | Safe optional chaining + filter pattern |
| #10 | P1 | executeLeerGuias bypasses domain layer (raw inserts) | Uses createOcrRobotJob domain function |
| #18 | P2 | No tracking number format validation | Soft validation with console.warn |

## Deviations from Plan

### Task Merge

Task 2's code changes (safe access, domain refactor, tracking validation) were naturally included in Task 1's edits since they modified overlapping code sections in `executeBuscarGuiasCoord` and `executeLeerGuias`. Both tasks were committed as a single atomic commit. This is correct behavior -- the changes are logically grouped and the commit is still atomic at the feature level.

No other deviations from plan.

## Verification Results

| Check | Result |
|-------|--------|
| `catch (sendError)` count in comandos.ts | 6 (one per action) |
| `createOcrRobotJob` in robot-jobs.ts | Present, exported |
| `crypto.randomUUID()` in comandos.ts | Removed (0 matches) |
| TypeScript compilation (`npx tsc --noEmit`) | Clean (no errors in modified files) |
| NonNullable filter pattern | Present in executeBuscarGuiasCoord |
| Tracking validation warning | Present |

## Decisions Made

1. **Soft tracking validation** -- Warn on suspicious tracking numbers (length < 3 or > 50) but don't block, since tracking number formats vary by carrier
2. **Safe access filter pattern** -- Use `.map().filter(NonNullable)` instead of non-null assertions for pedidoNumbers mapping
3. **Tasks merged** -- Task 2 changes were committed with Task 1 since they modified overlapping code sections

## Files Changed

| File | Changes |
|------|---------|
| `src/lib/domain/robot-jobs.ts` | Added `createOcrRobotJob` function (+68 lines) |
| `src/app/actions/comandos.ts` | Added imports, try-catch wrappers on 6 actions, safe access pattern, domain refactor, tracking validation |
