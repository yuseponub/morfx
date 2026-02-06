---
phase: 13-agent-engine-core
plan: 05
subsystem: agents
tags: [agent-engine, claude, orchestration, intent-detection, inngest]

# Dependency graph
requires:
  - phase: 13-02
    provides: SessionManager with optimistic locking
  - phase: 13-03
    provides: ClaudeClient and TokenBudgetManager
  - phase: 13-04
    provides: IntentDetector and Orchestrator components
  - phase: 12
    provides: executeToolFromAgent for Action DSL tool execution
provides:
  - AgentEngine class with processMessage method
  - Full message processing flow with retry logic
  - Session management (create/get/close/handoff)
  - Inngest event emission for timer workflows
affects: [13-06, 14-agent-ventas-somnio, 16-whatsapp-agent-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Retry pattern: max 3 retries for VersionConflictError"
    - "Token budget pre-check before Claude calls"
    - "Dynamic import for inngest to avoid circular deps"
    - "Non-blocking event emission (failures don't stop processing)"

key-files:
  created:
    - src/lib/agents/engine.ts
  modified:
    - src/lib/agents/index.ts

key-decisions:
  - "Dynamic import for inngest client to avoid circular dependencies"
  - "Inngest event emission is non-blocking (failures logged but don't fail message processing)"
  - "Version conflict retry uses same processMessageWithRetry pattern"
  - "Token budget checked before any Claude call (estimated 4000 tokens for intent + orchestrator)"

patterns-established:
  - "AgentEngine as main entry point: all message processing goes through processMessage"
  - "Two-phase tool execution: orchestrator decides tools, engine executes via executeToolFromAgent"
  - "State updates computed from tool results (datos_capturados extracted from CRM operations)"

# Metrics
duration: 12min
completed: 2026-02-06
---

# Phase 13 Plan 05: Agent Engine Summary

**AgentEngine class orchestrating intent detection, orchestration, tool execution with version conflict retry and inngest event emission for timer workflows**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-06T12:00:00Z
- **Completed:** 2026-02-06T12:12:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- AgentEngine class with processMessage as main entry point
- Full flow: intent detection -> orchestration -> tool execution -> response
- Version conflict retry logic (max 3 retries)
- Token budget checking before Claude calls
- Session management: createSession, getOrCreateSession, closeSession, handoffSession
- Inngest event emission for timer workflows (customer.message, collecting_data.started, promos.offered)
- Clean module exports from @/lib/agents

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Agent Engine** - `22346e5` (feat)
2. **Task 2: Update index.ts exports** - `13e3db5` (feat)

## Files Created/Modified

- `src/lib/agents/engine.ts` - Main AgentEngine class with processMessage, session management, tool execution, and inngest event emission (727 lines)
- `src/lib/agents/index.ts` - Added AgentEngine and related type exports

## Decisions Made

1. **Dynamic inngest import**: Used dynamic import `await import('@/inngest/client')` to avoid circular dependencies and allow graceful failure until Plan 13-06 creates the client
2. **Non-blocking events**: Inngest event emission failures are logged but don't stop message processing - these are non-critical for the conversation
3. **Estimated token budget**: Pre-check uses 4000 tokens (2000 x 2) as estimate for intent + orchestrator calls
4. **State computation from tools**: datos_capturados extracted from crm.contact.create and crm.contact.update tool results

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all components from prior plans (SessionManager, ClaudeClient, TokenBudgetManager, IntentDetector, Orchestrator) integrated smoothly.

## User Setup Required

None - no external service configuration required. The inngest client (Plan 13-06) will complete the event emission integration.

## Next Phase Readiness

- AgentEngine ready for API route integration in Plan 13-06
- All agent components now available via `import { AgentEngine, agentRegistry } from '@/lib/agents'`
- Inngest client needed (Plan 13-06) for timer workflow events to actually emit

---
*Phase: 13-agent-engine-core*
*Completed: 2026-02-06*
