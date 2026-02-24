---
phase: robot-coordinadora-hardening
plan: 05
subsystem: comandos-ui
tags: [realtime, disconnect-detection, async-race, supabase, react-hooks]
dependency_graph:
  requires: []
  provides: [realtime-disconnect-detection, document-url-race-fix]
  affects: [comandos-ui]
tech_stack:
  added: []
  patterns: [supabase-realtime-status-callback, async-state-management]
key_files:
  created: []
  modified:
    - src/hooks/use-robot-job-progress.ts
    - src/app/(dashboard)/comandos/components/comandos-layout.tsx
decisions:
  - Subscribe callback status values (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED) used for disconnect detection
  - setIsExecuting(false) moved into .then() with .catch() fallback for resilient input state management
  - Yellow warning banner conditionally shown only when activeJobId exists (no false positives on idle state)
metrics:
  duration: 6m
  completed: 2026-02-24
---

# Hardening Plan 05: Realtime Disconnect Detection + Document URL Race Fix Summary

**One-liner:** Supabase Realtime disconnect detection via status callback with yellow warning banner, plus async race fix for PDF/Excel document URL completion.

## Performance

| Metric | Value |
|--------|-------|
| Duration | 6 minutes |
| Start | 2026-02-24T15:48:14Z |
| End | 2026-02-24T15:54:16Z |
| Tasks | 2/2 |
| Files modified | 2 |

## Accomplishments

1. **Realtime disconnect detection** -- `useRobotJobProgress` now exposes `isDisconnected` boolean that tracks Supabase Realtime subscription status via the `.subscribe()` callback. Becomes `true` on CHANNEL_ERROR, TIMED_OUT, or CLOSED; resets to `false` on SUBSCRIBED or jobId reset.

2. **Document URL async race fix** -- Moved `setIsExecuting(false)` from the immediate reset section into the `.then()` callback of `getJobItemsForHistory()`, ensuring the command input stays disabled until the document result message is actually added. Added `.catch()` fallback to always re-enable input on fetch failure.

3. **Disconnect warning banner** -- Yellow animated banner appears between the header and split panel when Realtime is disconnected during an active job, informing the user that progress may not update.

## Task Commits

| # | Task | Commit | Type |
|---|------|--------|------|
| 1 | Add disconnect detection to useRobotJobProgress | ad3c2c9 | feat |
| 2 | Fix async race in document URL + show disconnect warning | a4cfcd2 | fix |

## Files Modified

| File | Changes |
|------|---------|
| `src/hooks/use-robot-job-progress.ts` | Added isDisconnected state, status callback tracking, return type update |
| `src/app/(dashboard)/comandos/components/comandos-layout.tsx` | Moved setIsExecuting(false) into .then(), added .catch() fallback, destructured isDisconnected, added warning banner JSX |

## Decisions Made

1. **Status callback values** -- Used Supabase Realtime's documented status values (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED) for disconnect detection rather than polling or heartbeat approach.
2. **Async race fix strategy** -- Moved only `setIsExecuting(false)` into `.then()` while keeping `setActiveJobId(null)` and `setActiveJobType(null)` in the immediate section. This stops the Realtime subscription immediately while keeping input locked until the result message renders.
3. **Warning banner placement** -- Placed between header bar and split panel for visibility. Only shown when `isDisconnected && activeJobId` to avoid false positives when no job is running.

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- **Git HEAD lock conflict** -- Concurrent hardening plan execution (hardening-01/02) caused a HEAD reference mismatch on Task 2 commit. Resolved by retrying the commit after HEAD stabilized.
- **Pre-existing TypeScript errors** -- 6 errors in unrelated files (validator.ts, test files). No errors in modified files.

## Bugs Fixed

- **P2 Bug #11** -- No Realtime disconnect detection: Users now see a yellow warning banner when the subscription drops.
- **P2 Bug #17** -- Async race in document URL: Input stays disabled until document result message is rendered.
