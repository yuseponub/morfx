# Hardening Plan 04: Callback Webhook Hardening Summary

## One-liner
Strict payload validation + idempotent batch_completed emission via atomic DB flag + 500 on inngest.send failure

## What Was Done

### Task 1: Strict payload validation
- Replaced minimal `!itemId || !status` check with comprehensive validation
- Body parsed as `Record<string, unknown>` with fields typed as `unknown` for safe validation
- `itemId`: must be non-empty string AND valid UUID format (regex)
- `status`: must be exactly `'success'` or `'error'`
- `trackingNumber`: validated as string, length 3-50 on success
- `errorType`: validated against enum `['validation', 'portal', 'timeout', 'unknown']`
- `errorMessage`: coerced to string, truncated to 500 chars max
- All validated values stored in `validated*` variables used downstream
- **Commit:** `f743d29`

### Task 2: Idempotent batch_completed emission + 500 on send failure
- **Replaced race-prone pattern:** Old code did `SELECT status FROM robot_jobs` after domain update, then checked `status === 'completed'`. Two concurrent final callbacks could both read `completed` and both emit `batch_completed`.
- **New atomic guard:** `UPDATE robot_jobs SET batch_completed_emitted = true WHERE id = ? AND status = 'completed' AND batch_completed_emitted = false` -- only one callback wins the UPDATE, only the winner emits.
- **Error propagation:** `inngest.send` failure now returns HTTP 500 (was silently returning 200). Robot service can retry the callback.
- **Flag reset on failure:** If `inngest.send` fails, `batch_completed_emitted` is reset to `false` so the retry callback can re-attempt emission.
- **Commit:** `dad430c`

## Bugs Fixed

| Bug | Severity | Fix |
|-----|----------|-----|
| P1 #5: Duplicate batch_completed events | P1 | Atomic `batch_completed_emitted` flag guard (only one UPDATE wins) |
| P1 #6: inngest.send failure silenced | P1 | Returns 500 + resets flag for retry |
| P2 #14: Callback payload validation | P2 | UUID regex, enum checks, length limits, type coercion |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `trackingNumber` type usage in section 5**
- **Found during:** Task 1
- **Issue:** After changing body destructuring to `unknown` types, the existing section 5 code still referenced raw `trackingNumber` (now `unknown` type) instead of `validatedTrackingNumber`. Would have caused TypeScript errors and incorrect type narrowing.
- **Fix:** Updated section 5 guard (`if (status === 'success' && validatedTrackingNumber && ...`) and `emitRobotCoordCompleted` call to use `validatedTrackingNumber`.
- **Files modified:** `src/app/api/webhooks/robot-callback/route.ts`
- **Commit:** `f743d29` (included in Task 1 commit)

## Key Files

| File | Action | Description |
|------|--------|-------------|
| `src/app/api/webhooks/robot-callback/route.ts` | Modified | All 3 fixes applied to single file |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Flag reset on inngest.send failure | Allows retry to re-attempt emission rather than permanently blocking the flag |
| 500 response on send failure | Robot service retries on 5xx; returning 200 caused silent data loss |
| UUID regex validation (not just truthy check) | Prevents DB lookup with garbage IDs, reduces unnecessary queries |
| `errorMessage` truncated to 500 chars | Prevents oversized payloads from being stored in DB |

## Verification

- [x] `UUID_REGEX` present in route.ts
- [x] `validErrorTypes` enum validation present
- [x] `slice(0, 500)` for error message truncation
- [x] `batch_completed_emitted` atomic guard (4 references)
- [x] `status: 500` on inngest.send failure
- [x] Old `updatedJob.status === 'completed'` pattern removed
- [x] TypeScript compiles without errors (no errors in robot-callback)

## Metrics

- **Duration:** ~5 minutes
- **Completed:** 2026-02-24
- **Tasks:** 2/2
- **Commits:** 2
