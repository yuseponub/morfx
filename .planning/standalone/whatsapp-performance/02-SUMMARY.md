---
phase: standalone/whatsapp-performance
plan: 02
subsystem: ui
tags: [react, supabase-realtime, lazy-loading, conditional-rendering, performance]

# Dependency graph
requires:
  - phase: none
    provides: existing inbox-layout and contact-panel components
provides:
  - ContactPanel lazy-loaded (closed by default, unmounted when hidden)
  - Consolidated realtime channel (2 merged to 1) in ContactPanel
  - Key-based remount for stale data prevention on conversation switch
affects: [standalone/whatsapp-performance/03 (verification checkpoint)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional render for lazy panels: {isOpen && <Component key={id} />} instead of width-0 hiding"
    - "Supabase channel consolidation: chain multiple .on() listeners on single channel"
    - "Key-based remount: key={selectedId} forces fresh mount on selection change"

key-files:
  created: []
  modified:
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
    - src/app/(dashboard)/whatsapp/components/contact-panel.tsx

key-decisions:
  - "Panel closed by default (user decision) - eliminates all panel overhead for common read/send flow"
  - "Conditional render over CSS hiding - unmounts component tree, stops hooks/effects/channels"
  - "Key-based remount over useEffect reset - simpler, guarantees no stale state"
  - "Removed unused imports (cn, useEffect, useRef) from inbox-layout"

patterns-established:
  - "Lazy panel pattern: conditional render + key-based remount for data freshness"
  - "Channel consolidation: multiple postgres_changes listeners on one Supabase channel"

# Metrics
duration: 20min
completed: 2026-02-17
---

# Plan 02: Panel Lazy-Loading Summary

**ContactPanel lazy-loaded via conditional render (closed by default), 2 realtime channels consolidated into 1, key-based remount prevents stale data on conversation switch**

## Performance

- **Duration:** 20 min
- **Started:** 2026-02-17T03:06:39Z
- **Completed:** 2026-02-17T03:27:20Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- ContactPanel is now closed by default when entering any conversation (zero overhead for read/send flow)
- ContactPanel fully unmounted when panel is closed (no hooks, effects, channels, fetches, or polling)
- 2 realtime channels (conv-order-refresh + orders-direct) consolidated into 1 (panel-realtime)
- Key-based remount (`key={selectedConversationId}`) prevents stale data flash when switching conversations
- Removed unused imports (cn, useEffect, useRef) from inbox-layout.tsx

## Task Commits

Each task was committed atomically:

1. **Task 1: Panel closed by default with conditional rendering and key-based remount** - `39e0e7d` (perf)
2. **Task 2: Consolidate ContactPanel's 2 realtime channels into 1** - `c8c4053` (perf)

## Files Created/Modified
- `src/app/(dashboard)/whatsapp/components/inbox-layout.tsx` - Panel closed by default, conditional render, key-based remount, cleaned unused imports
- `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` - 2 channels merged into 1 consolidated panel-realtime channel

## Decisions Made
- **Panel closed by default** - User's explicit decision. Eliminates 2 channels + 3 server action fetches + 30s polling for the common case of just reading/sending messages.
- **Conditional render over CSS width-0** - Component tree fully unmounts when hidden. No hooks, no effects, no channels. More efficient than CSS hiding which keeps everything running.
- **Key-based remount over manual reset** - `key={selectedConversationId || 'none'}` forces React to destroy and recreate the component when switching conversations. Simpler than manually resetting state in useEffect, and guarantees no stale data.
- **Kept panel open on conversation switch** - If user opened the panel, it stays open when switching conversations. The key-based remount handles data freshness. This preserves user intent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed unused imports from inbox-layout.tsx**
- **Found during:** Task 1
- **Issue:** After removing `cn()` usage and the width-based CSS approach, the `cn` import was unused. Also `useEffect` and `useRef` were imported but never used in the component.
- **Fix:** Cleaned import to `import { useState, useCallback } from 'react'` only
- **Files modified:** src/app/(dashboard)/whatsapp/components/inbox-layout.tsx
- **Verification:** `npx tsc --noEmit` passes, `npm run build` succeeds
- **Committed in:** 39e0e7d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking - unused imports would cause lint warnings)
**Impact on plan:** Minor cleanup, no scope creep.

## Issues Encountered
- Linter/formatter reverted contact-panel.tsx changes after first edit during build verification. Re-applied the channel consolidation successfully on second attempt.
- Build initially failed due to stale `.next/lock` file from previous interrupted build. Resolved by cleaning `.next` directory.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Panel lazy-loading complete, ready for Plan 03 verification checkpoint
- User should test: toggle panel open/close, switch conversations, create orders from panel, agent config slider
- Performance impact: 2 fewer channels per conversation (when panel closed) + 1 fewer channel (when panel open)

---
*Phase: standalone/whatsapp-performance*
*Completed: 2026-02-17*
