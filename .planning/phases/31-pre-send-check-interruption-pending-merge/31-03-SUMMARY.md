---
phase: 31-pre-send-check-interruption-pending-merge
plan: 03
subsystem: agents
tags: [inngest, whatsapp, supabase, interruption-detection, pre-send-check]

# Dependency graph
requires:
  - phase: 31-02
    provides: "messageTimestamp field in Inngest events, priority column in agent_templates"
  - phase: 29
    provides: "Character-based typing delays in ProductionMessagingAdapter"
provides:
  - "Pre-send DB check before every template in ProductionMessagingAdapter"
  - "hasNewInboundMessage() lightweight count query"
  - "MessagingAdapter interface with triggerTimestamp param and interrupted return"
  - "messageTimestamp plumbed from Inngest event through entire pipeline to adapter"
affects:
  - "31-04 (pending storage logic uses sendResult.interrupted)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-send check: DB query between delay and send for each template"
    - "Lightweight existence check: select with count:exact + head:true"

key-files:
  created: []
  modified:
    - "src/lib/agents/engine-adapters/production/messaging.ts"
    - "src/lib/agents/engine/types.ts"
    - "src/lib/agents/engine-adapters/sandbox/messaging.ts"
    - "src/inngest/functions/agent-production.ts"
    - "src/lib/agents/production/webhook-processor.ts"
    - "src/lib/agents/engine/unified-engine.ts"

key-decisions:
  - "Pre-send check runs AFTER char delay and BEFORE send (customer types during delay)"
  - "Check applies to every template including index 0 (first one)"
  - "Lightweight count query with head:true (no row data fetched)"
  - "Interrupted result captured but NOT acted upon yet (Plan 04 handles pending storage)"

patterns-established:
  - "Pre-send interruption detection: query inbound messages with gt(triggerTimestamp) before each send"
  - "Pipeline timestamp threading: event -> inngest function -> processor -> engine -> adapter"

# Metrics
duration: 4min
completed: 2026-02-24
---

# Phase 31 Plan 03: Pre-Send Check + Interruption Detection Summary

**Per-template DB check in ProductionMessagingAdapter detects new inbound messages before each send, with messageTimestamp threaded from Inngest event through entire pipeline**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-24T03:27:13Z
- **Completed:** 2026-02-24T03:31:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Pre-send check queries messages table before every template send (including first), breaking the loop if customer replied
- hasNewInboundMessage() uses lightweight count query (head:true) on existing idx_messages_conversation index
- MessagingAdapter interface updated with triggerTimestamp input and interrupted/interruptedAtIndex output
- messageTimestamp flows end-to-end: Inngest event.data -> agent-production -> webhook-processor -> UnifiedEngine -> messaging.send()

## Task Commits

Each task was committed atomically:

1. **Task 1: Pre-send check in ProductionMessagingAdapter** - `c9bafe3` (feat)
2. **Task 2: Wire messageTimestamp through Inngest to processor** - `65bcfde` (feat)

## Files Created/Modified
- `src/lib/agents/engine-adapters/production/messaging.ts` - Added hasNewInboundMessage() private method and pre-send check in send loop
- `src/lib/agents/engine/types.ts` - Updated MessagingAdapter interface (triggerTimestamp, interrupted) and EngineInput (messageTimestamp)
- `src/lib/agents/engine-adapters/sandbox/messaging.ts` - Updated signature for interface compatibility (no behavioral change)
- `src/inngest/functions/agent-production.ts` - Destructure and pass messageTimestamp from event.data
- `src/lib/agents/production/webhook-processor.ts` - Added messageTimestamp to ProcessMessageInput, pass to engine
- `src/lib/agents/engine/unified-engine.ts` - Pass triggerTimestamp to messaging.send(), comment placeholder for Plan 04

## Decisions Made
- Pre-send check runs AFTER the character delay (so customer has time to type during delay) and BEFORE the actual domain send call
- Check applies to EVERY template including i=0 (first one) -- CONTEXT.md is explicit about this
- If triggerTimestamp is not provided (sandbox, timer-triggered calls), the check is skipped entirely for backward compatibility
- Used lightweight count query with `{ count: 'exact', head: true }` to avoid fetching any row data
- The interrupted result is captured in UnifiedEngine but NOT acted upon -- Plan 04 will add the pending storage logic based on sendResult.interrupted

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Pre-send check is functional: adapter detects interruptions and returns interrupted=true with interruptedAtIndex
- Plan 04 will integrate BlockComposer + pending template storage, using the interrupted result from this adapter
- No blockers

---
*Phase: 31-pre-send-check-interruption-pending-merge*
*Completed: 2026-02-24*
