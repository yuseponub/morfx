---
phase: 31
plan: 04
subsystem: agent-engine
tags: [block-composer, pending-templates, interruption, silence-timer, unified-engine]
depends_on:
  requires: ["31-01", "31-02", "31-03"]
  provides: ["Full block composition pipeline with interruption handling and pending merge"]
  affects: ["32", "34"]
tech_stack:
  added: []
  patterns: ["Block composition pipeline", "Pending template storage via JSONB column"]
key_files:
  created: []
  modified:
    - src/lib/agents/engine/unified-engine.ts
    - src/lib/agents/engine-adapters/production/storage.ts
    - src/lib/agents/engine/types.ts
    - src/inngest/functions/agent-timers.ts
    - src/lib/agents/somnio/interruption-handler.ts
    - src/lib/agents/somnio/message-sequencer.ts
decisions:
  - "Block composition activates when templates exist AND no forceIntent (sandbox + timer bypass)"
  - "sentMessageContents tracks actually-sent template content for accurate assistant turn recording"
  - "Silence timer sends up to 3 pending templates with char-delay before retake message"
  - "Retake message is separate from template cap (system message, not a template)"
  - "Dynamic import for calculateCharDelay in silence timer (lazy load)"
metrics:
  duration: "8m"
  completed: "2026-02-24"
---

# Phase 31 Plan 04: BlockComposer Integration + Pending Storage Summary

Full block composition pipeline wired into production: compose -> send -> interrupt -> save pending -> merge on next message.

## What Was Done

### Task 1: Pending storage methods + StorageAdapter interface
- Added `savePendingTemplates`, `getPendingTemplates`, `clearPendingTemplates` to ProductionStorageAdapter
- Methods operate on `session_state.pending_templates` JSONB column (from Plan 02 migration)
- Added optional pending methods to StorageAdapter interface (sandbox adapter unaffected)
- Imports PrioritizedTemplate type from block-composer.ts for type safety

### Task 2: UnifiedEngine block composition pipeline
- Replaced simple `messaging.send()` with full block composition pipeline
- Pipeline flow: get pending -> compose block (new + pending) -> send -> handle interruption -> save/clear pending
- **Interruption at sentCount=0:** All templates discarded, pending cleared (fresh recalculation)
- **Interruption at sentCount>0:** Unsent templates + overflow saved as new pending
- **Successful send:** Overflow saved as pending, or stale pending cleared if no overflow
- **HANDOFF:** Explicitly clears pending_templates after session handoff
- Block composition only activates when templates exist AND no forceIntent
- Assistant turn recording uses actually-sent template content (not all templates)
- Deprecated old InterruptionHandler and MessageSequencer with @deprecated JSDoc

### Task 3: Silence timer sends pending + retake
- Silence timer retrieves `pending_templates` from session_state on 90s timeout
- Sends up to 3 pending templates with calculateCharDelay between each
- Clears pending_templates after sending to prevent re-sends
- Sends retake message AFTER pending (separate from template cap)
- Agent-enabled guard preserved before any sending

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Block composition guard: `hasTemplates && !forceIntent` | forceIntent is used by timer-triggered calls and sandbox; these don't need block composition |
| 2 | sentMessageContents tracks actual sent content | When interrupted, assistant turn should only include what was actually sent to the customer |
| 3 | Retake message separate from 3-template cap | Retake is a system message, not a business template; it should always be sent |
| 4 | Dynamic import for calculateCharDelay in timer | Silence timer is an Inngest function; lazy import reduces cold start bundle |
| 5 | clearPendingTemplates on sentCount=0 interruption | If nothing was sent, the entire block should be discarded for fresh recalculation on next message |

## Deviations from Plan

None - plan executed exactly as written.

## Phase 31 Complete

All 4 plans delivered:
1. **31-01:** BlockComposer pure function with 21 tests
2. **31-02:** DB infrastructure (priority column, pending_templates column, TypeScript types)
3. **31-03:** Pre-send check with lightweight inbound message query
4. **31-04:** Full pipeline integration (this plan)

The end-to-end flow is now:
1. Customer sends message -> Inngest triggers agent processing
2. SomnioAgent produces templates with priority (CORE/COMP/OPC)
3. UnifiedEngine composes block: merges new templates + pending from previous cycle
4. ProductionMessagingAdapter sends each template with char-delay + pre-send check
5. If interrupted: unsent templates saved to session_state.pending_templates
6. On next RESPONDIBLE message: BlockComposer merges pending into new block
7. On silence timeout: pending templates sent with char-delay before retake message
8. On HANDOFF: all pending cleared

## Next Phase Readiness

No blockers. Phase 32 (Media Processing) and Phase 34 (No-Repetition System) can proceed independently.
