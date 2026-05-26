---
phase: crm-duplicate-order-products-integrity
plan: "01"
subsystem: domain/orders
tags: [bug-fix, domain-layer, jsonb-marker, error-capture]
one_liner: "Capture INSERT error in duplicateOrder + persist duplicate_error marker to custom_fields JSONB + add clearOrderDuplicateError idempotent helper"
status: complete
completed_at: 2026-05-26
duration_minutes: 12
tasks_completed: 4
tasks_total: 4
files_created: 0
files_modified: 2
commits: [3c6faadf]

dependency_graph:
  requires: []
  provides:
    - "DuplicateError interface (consumed by Plan 05 UI badge)"
    - "getDuplicateError accessor (consumed by Plan 05 UI badge)"
    - "duplicateOrder fail-fast behavior with marker (consumed by Plan 02 unit tests + Plan 04 integration test)"
    - "clearOrderDuplicateError domain helper (consumed by Plan 03 server action)"
  affects:
    - "src/lib/automations/action-executor.ts:executeDuplicateOrder (now sees success:false + throws → automation_executions.error_message populated)"
    - "Any caller of duplicateOrder that previously got false-success (now correctly gets {success:false, error})"

tech_stack:
  added: []
  patterns:
    - "S-1 Domain mutation contract (deleteOrder skeleton)"
    - "S-3 JSONB read-merge-write in JS (custom-fields.ts canonical — NO jsonb_set RPC)"
    - "Pattern A: destructure-and-check {error} from Supabase insert (mirror of updateOrder:484-490)"
    - "Idempotent destructure-rest for JSONB key removal"

key_files:
  created: []
  modified:
    - path: src/lib/orders/types.ts
      change: "Added DuplicateError interface + getDuplicateError accessor (+53 lines, between OrderProductFormData and ORDER TAG TYPES sections)"
    - path: src/lib/domain/orders.ts
      change: "Added DuplicateError import (line 24). Replaced buggy line 959 with destructure-and-check + JSONB marker write + fail-fast return (Task 2). Added clearOrderDuplicateError export at end of file before addOrderTag (Task 3). Total +119 lines, -1 line. recompraOrder UNCHANGED (D-pre-04)."

decisions:
  - "D-01 honored: NO rollback of newOrder on INSERT failure — leaves destination order visible+empty with marker"
  - "D-02 honored: fail-fast — no retry logic, propagates error directly"
  - "D-pre-04 honored: recompraOrder UNTOUCHED (0 lines in diff)"
  - "D-pre-05 honored: NO feature flag — new behavior is strictly better"
  - "D-pre-06 honored: NO migration DB — uses existing custom_fields JSONB"
  - "Marker shape: 5 keys (errorCode, errorMessage, failedAt, sourceOrderId, attemptedProducts) — locked per CONTEXT"

metrics:
  duration: 12m
  completed: 2026-05-26
  task_count: 4
  file_count: 2
---

# Phase crm-duplicate-order-products-integrity Plan 01: Domain fix - INSERT error capture + DuplicateError type + clearOrderDuplicateError helper

## Summary

Surgical fix for the silent-INSERT-discard bug at `src/lib/domain/orders.ts:959`. The `duplicateOrder` function now destructures `{error}` from the `order_products.insert(...)` call (mirroring the canonical pattern in `updateOrder` lines 484-490). On error, it persists a 5-key marker to `orders.custom_fields.duplicate_error` via read-merge-write JSONB pattern, then returns `{success:false}` so the existing `executeDuplicateOrder` wrapper throws and `automation_executions.error_message` gets populated end-to-end.

Also added the `DuplicateError` TypeScript interface + `getDuplicateError` runtime accessor in `src/lib/orders/types.ts` (consumed by Plan 05 Kanban badge), and a new exported domain helper `clearOrderDuplicateError(ctx, {orderId})` that the UI server action (Plan 03) will invoke to remove the marker idempotently.

`recompraOrder` was NOT modified (D-pre-04 read-only constraint locked).

## What was built

### Task 1 — DuplicateError interface + getDuplicateError accessor
- **File:** `src/lib/orders/types.ts`
- **Where:** After `OrderProductFormData` block, before `ORDER TAG TYPES` section header
- **Adds:**
  - `interface DuplicateError` with 5 fields: `errorCode`, `errorMessage`, `failedAt`, `sourceOrderId`, `attemptedProducts[]`
  - `function getDuplicateError(order)` — type-safe accessor that returns `DuplicateError | null` with minimal shape validation (5-field check)
- **Lines added:** ~53

### Task 2 — Fix duplicateOrder error capture + persist marker
- **File:** `src/lib/domain/orders.ts`
- **Import added:** `import type { DuplicateError } from '@/lib/orders/types'` (line 24)
- **Old line 959:** `await supabase.from('order_products').insert(productsToInsert)` (no destructure → silent discard)
- **New behavior:**
  - Destructure `{ error: productsError }` (canonical pattern matching updateOrder:484-490)
  - On `productsError`: read `newOrder.custom_fields`, build `DuplicateError` marker with all 5 keys, write `custom_fields: { ...existing, duplicate_error }` back via update filtered by workspace_id
  - If marker write itself fails: `console.error` but don't shadow the original `productsError` (best-effort)
  - Return `{ success: false, error: 'Error al copiar productos al duplicar: {code} - {message}' }` (fail-fast per D-02)
  - **No rollback of newOrder** (D-01 — leave visible+empty for operator action)
- **Lines added:** ~52 (in the duplicateOrder body)

### Task 3 — clearOrderDuplicateError domain helper
- **File:** `src/lib/domain/orders.ts`
- **Where:** Inserted at end of file just before `// addOrderTag` section
- **Signature:** `export async function clearOrderDuplicateError(ctx: DomainContext, params: { orderId: string }): Promise<DomainResult<{ orderId: string }>>`
- **Behavior:**
  - Read `orders.custom_fields` filtered by `id + workspace_id` (Regla 3)
  - Returns `{success:false, error:'Pedido no encontrado'}` if row missing
  - Destructure `{ duplicate_error: _dropped, ...rest }` to remove key cleanly (vs leaving stale `null`)
  - Idempotent: when the key is already absent, the write is still issued (no-op semantically, bumps `updated_at`)
  - Returns `{success:true, data:{orderId}}` on success

### Task 4 — Typecheck + atomic commit
- `npx tsc --noEmit` — pre-existing errors only (`.next/dev/types/validator.ts` + `conversations.test.ts:16` — both unrelated to this change; verified via stash-toggle that they exist on HEAD before edits).
- Commit: `3c6faadf` — 2 files modified, +171/-1 lines.

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan acceptance criteria deviation (informational, not auto-fix)

**[Plan acceptance count mismatch — informational only]**

- **Plan said (Task 2):** `grep -c "const { error: productsError } = await supabase" src/lib/domain/orders.ts` returns exactly **2** hits (updateOrder + new duplicateOrder block).
- **Actual count after edit:** **4** hits.
- **Reason:** The plan's pre-condition was incorrect. The codebase already had 4 matches once mine is included: line 299 (`createOrder`), line 485 (`updateOrder`), line 960 (new in `duplicateOrder`), line 1223 (`recompraOrder` existing — not modified). The plan author counted only updateOrder + duplicateOrder.
- **Impact:** Zero. The functional invariant (destructure-and-check pattern correctly applied inside `duplicateOrder`) is satisfied. Verified by `grep -n "Error al copiar productos al duplicar"` returning the expected 1 hit and `git diff` showing the new block bounded inside `duplicateOrder`.
- **No correction needed** — this is a counting bug in the plan's acceptance assertion, not a code defect.

## Auth gates encountered

None.

## Deferred Issues

None.

## Self-Check: PASSED

### Files exist + commit verified

- `src/lib/orders/types.ts` — FOUND (modified +53 lines)
- `src/lib/domain/orders.ts` — FOUND (modified +119/-1 lines)
- Commit `3c6faadf` — FOUND in `git log`

### Success criteria from prompt

- [x] `src/lib/orders/types.ts` exports `DuplicateError` interface + `getDuplicateError` accessor
- [x] `src/lib/domain/orders.ts` `duplicateOrder`: captures `insertError`, persists JSONB marker with 5 keys, returns `{success:false, error}` on failure
- [x] Happy path unchanged — no marker write, returns `{success:true, orderId}` (existing code path at lines 990-1057 untouched)
- [x] `src/lib/domain/orders.ts` exports `clearOrderDuplicateError(ctx, {orderId})` — idempotent JSONB read-omit-write
- [x] `recompraOrder` NOT modified (D-pre-04) — `git diff HEAD~1 HEAD -- src/lib/domain/orders.ts | grep -E "^[+-].*recompraOrder" | wc -l` = 0
- [x] All tasks committed individually — single atomic commit per plan instructions (Task 4 is the single commit task for all 3 prior tasks per plan spec)
- [x] SUMMARY.md created at `.planning/standalone/crm-duplicate-order-products-integrity/01-SUMMARY.md`
- [x] Self-Check section confirms PASS
- [x] No modifications to STATE.md or ROADMAP.md (standalone is not in roadmap)
- [x] `grep -c "duplicate_error" src/lib/domain/orders.ts` returns 6 (>= 3) — write path + marker structure + clear helper + comment
- [x] `grep -c "recompraOrder" src/lib/domain/orders.ts` matches pre-execution count (4 occurrences — only existing references in comments/calls)

### Invariant grep summary

```
DuplicateError interface (types.ts):           1
getDuplicateError func (types.ts):             1
attemptedProducts (types.ts):                  2
Error al copiar productos al duplicar:         1
clearOrderDuplicateError export:               1
duplicate_error mentions (orders.ts):          6
duplicate_error: _dropped (idempotent rest):   1
recompraOrder lines in diff:                   0
jsonb_set RPC usage:                           0
retryWithBackoff / for-attempt in diff:        0
getPlatformConfig in diff:                     0
orders.delete() rollback in diff:              0
addOrderTag still exported:                    1
```

All invariants PASS. Plan 01 ready for handoff to Wave 1 (Plans 02 unit tests, 03 server action, 04 integration test — runnable in parallel).
