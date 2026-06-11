---
phase: standalone-whatsapp-inbox-reliability
plan: 02
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, revalidate, markAsRead, rsc]

requires:
  - phase: standalone-whatsapp-inbox-reliability
    provides: DIAGNOSIS H-4b (markAsRead revalidatePath waterfall), CONTEXT D-13 contract
provides:
  - "markAsRead without revalidatePath('/whatsapp')"
  - "Documented read-state reconciliation contract (D-13) in conversations.ts"
affects: [whatsapp-inbox-reliability-04 (F-4 softRefetch safety-net), whatsapp-inbox-reliability-03 (Wave 1 push gate)]

tech-stack:
  added: []
  patterns:
    - "D-13: read-state mutations do NOT invalidate routes — reconcile via optimistic local + realtime"

key-files:
  created: []
  modified:
    - src/app/actions/conversations.ts

key-decisions:
  - "markAsRead loses revalidatePath; UPDATE of is_read/unread_count server-side stays (RESEARCH Q10)"
  - "archive/unarchive keep revalidatePath — they change the visible conversation set"

patterns-established:
  - "Read-state mutation contract: optimistic local update + realtime UPDATE, no route invalidation"

requirements-completed: [F-3, D-13]

duration: 4min
completed: 2026-06-11
---

# Phase standalone-whatsapp-inbox-reliability Plan 02: markAsRead revalidate removal Summary

**Removed `revalidatePath('/whatsapp')` from `markAsRead` so per-click read-state mutations no longer force a full /whatsapp RSC re-render (re-fetch of ~1000 rows, ~4.3s); reconciliation now runs purely via optimistic local update + realtime UPDATE (contract D-13).**

## Performance

- **Duration:** ~4 min
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- `markAsRead` no longer invalidates the `/whatsapp` route — the post-click waterfall that contributed to case-3 "conversations never load" is structurally eliminated
- The durable server-side UPDATE (`is_read=true`, `unread_count=0`) is preserved (RESEARCH Q10 — no behavior loss)
- The D-13 contract ("read-state mutations do NOT invalidate routes; they reconcile via optimistic local state + realtime") is documented at the former revalidatePath location
- `archive` / `unarchive` are byte-identical — they keep `revalidatePath('/whatsapp')` because they change the visible set

## Task Commits

1. **Task 1: Remove revalidatePath from markAsRead + document the contract** - `81d5f755` (fix)

## Files Created/Modified
- `src/app/actions/conversations.ts` - Deleted `revalidatePath('/whatsapp')` inside `markAsRead`, replaced with a 4-line D-13 contract comment; archive/unarchive untouched

## Decisions Made
None - followed plan as specified. archive/unarchive retain revalidatePath per D-13 / plan instruction; `revalidatePath` import left in place (still used by 11 other call sites).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Verification
- `npx tsc --noEmit` → 0 errors (no NEW errors introduced)
- `grep -c "revalidatePath" src/app/actions/conversations.ts` → 12 (>= 2; archive + unarchive + 9 unrelated mutations still present)
- Manual read confirmed: `markAsRead` (L282) body has no revalidatePath (only D-13 comment at L302-305); `archiveConversation` keeps revalidatePath (L328); `unarchiveConversation` keeps revalidatePath (L354)

## Next Phase Readiness
- Wave 1 F-3 done. The robot `flow` regression (per-click page-1 RSC re-render gone) is verified at the Wave 1 push gate in plan 03 — NOT pushed here per sequential-executor instructions.
- F-4 (Wave 3) softRefetch safety-net builds on this contract (markAsRead no longer competes with a full route re-render).

## Self-Check: PASSED
- FOUND: src/app/actions/conversations.ts (D-13 comment present, markAsRead has no revalidatePath)
- FOUND: commit 81d5f755

---
*Phase: standalone-whatsapp-inbox-reliability*
*Completed: 2026-06-11*
