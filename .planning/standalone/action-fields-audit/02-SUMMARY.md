---
phase: standalone/action-fields-audit
plan: 02
subsystem: automations
tags: [duplicate-order, domain-layer, copy-flags, toggles]
depends_on: []
provides:
  - DuplicateOrderParams with copyContact, copyProducts, copyValue flags
  - Executor passes copy flags through to domain
affects:
  - Wizard UI (toggles now functional)
  - AI Builder (can configure copy behavior)
tech-stack:
  patterns:
    - "Default-true optional flags (param !== false) for backward compat"
key-files:
  modified:
    - src/lib/domain/orders.ts
    - src/lib/automations/action-executor.ts
decisions:
  - id: default-true-flags
    description: "Copy flags default to true when undefined, preserving backward compatibility for all callers"
metrics:
  duration: "~6 min"
  completed: 2026-02-17
---

# Phase action-fields-audit Plan 02: Duplicate Order Toggle Fixes Summary

**Domain duplicateOrder now respects copyContact/copyProducts/copyValue flags with backward-compatible defaults (true when undefined).**

## Performance

- **Duration:** ~6 minutes
- **Tasks completed:** 2/2
- **Files modified:** 2

## Accomplishments

1. Added `copyContact`, `copyProducts`, `copyValue` optional boolean flags to `DuplicateOrderParams` interface
2. Updated `duplicateOrder` domain function to conditionally copy contact, products, and value based on flags
3. Updated `executeDuplicateOrder` in action-executor to pass copy flags from automation params to domain
4. Default behavior preserved: when flags are undefined (old callers), everything is copied as before

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add copy flags to DuplicateOrderParams and respect them in domain | `0502e41` | `src/lib/domain/orders.ts` |
| 2 | Pass copy flags from executor to domain | `e2ca4d2` | `src/lib/automations/action-executor.ts` |

## Files Modified

- `src/lib/domain/orders.ts` — Added 3 optional fields to DuplicateOrderParams, rewrote duplicateOrder to conditionally copy contact/products/value
- `src/lib/automations/action-executor.ts` — executeDuplicateOrder now passes copyContact/copyProducts/copyValue to domain

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Default-true via `!== false` | All existing callers (server actions, tool handlers) that don't pass these flags get the same behavior as before |
| Boolean coercion in executor with `!!` | Ensures UI values (which may be strings/numbers) are properly converted to booleans before domain |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing shipping_department to duplicated order insert**
- **Found during:** Task 1
- **Issue:** The original order insert in duplicateOrder did not copy `shipping_department` from the source order
- **Fix:** Added `shipping_department: sourceOrder.shipping_department` to the insert object
- **Files modified:** `src/lib/domain/orders.ts`
- **Commit:** `0502e41`

## Issues Encountered

None.

## Next Phase Readiness

- Copy toggles for duplicate_order are now functional end-to-end (UI toggle -> executor -> domain)
- Ready for Wave 3 (UI catalog updates) and Wave 4 (Add field UX) in the action-fields-audit phase
