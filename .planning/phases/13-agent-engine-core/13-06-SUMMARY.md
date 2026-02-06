---
phase: 13-agent-engine-core
plan: 06
subsystem: agents
tags: [inngest, timers, workflows, durable, events, whatsapp, proactive]

# Dependency graph
requires:
  - phase: 13-02
    provides: SessionManager for state queries
  - phase: 13-03
    provides: Claude client patterns
  - phase: 13-05
    provides: AgentEngine with event emission
  - phase: 12-03
    provides: whatsapp.message.send handler
provides:
  - Inngest client with typed event schemas
  - AgentEvents type for all agent events
  - dataCollectionTimer (6-min timeout)
  - promosTimer (10-min timeout)
  - /api/inngest route for Inngest Cloud
affects: [phase-14, phase-16]

# Tech tracking
tech-stack:
  added: [inngest@3.51.0]
  patterns: [event-driven-workflows, step.waitForEvent, step.sleep, lazy-initialization]

key-files:
  created:
    - src/inngest/client.ts
    - src/inngest/events.ts
    - src/inngest/functions/agent-timers.ts
    - src/app/api/inngest/route.ts
  modified:
    - src/lib/agents/index.ts
    - src/lib/agents/engine.ts
    - package.json

key-decisions:
  - "Event naming convention: agent/{entity}.{action}"
  - "waitForEvent match on data.sessionId for timer cancellation"
  - "Lazy SessionManager initialization to avoid circular dependencies"
  - "6-min data collection timeout, 10-min promos timeout"
  - "Auto-create order with default pack (1x) on promos timeout"

patterns-established:
  - "Inngest functions use step.waitForEvent for timeout-based flows"
  - "step.sleep for delays between mode transitions"
  - "Lazy singleton pattern for SessionManager in workflows"
  - "Re-export inngest client from @/lib/agents for convenience"

# Metrics
duration: 22min
completed: 2026-02-06
---

# Phase 13 Plan 06: Inngest Timer Workflows Summary

**Inngest integration for durable timer workflows: 6-min data collection, 10-min promos with step.waitForEvent and step.sleep**

## Performance

- **Duration:** 22 min
- **Started:** 2026-02-06T03:19:00Z
- **Completed:** 2026-02-06T03:41:35Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Inngest@3.51.0 installed for durable workflow orchestration
- AgentEvents type defines all agent-related events with strict typing
- dataCollectionTimer: 6-min timeout with data status check, proactive messages
- promosTimer: 10-min timeout with auto-order creation
- /api/inngest route serves all agent timer functions
- inngest client and AgentEvents re-exported from @/lib/agents

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Inngest and create client with events** - `d865747` (feat)
2. **Task 2: Create timer workflow functions** - `6c4e4a3` (feat)
3. **Task 3: Create Inngest API route and update exports** - `cebd81c` (feat)

## Files Created/Modified
- `src/inngest/client.ts` - Inngest client singleton with typed event schemas
- `src/inngest/events.ts` - AgentEvents type definitions
- `src/inngest/functions/agent-timers.ts` - dataCollectionTimer and promosTimer workflows
- `src/app/api/inngest/route.ts` - Inngest serve endpoint for Next.js
- `src/lib/agents/index.ts` - Re-exports inngest and AgentEvents
- `src/lib/agents/engine.ts` - Fixed customer.message event schema
- `package.json` - Added inngest dependency

## Decisions Made
1. **Event naming:** `agent/{entity}.{action}` convention for consistency
2. **waitForEvent matching:** Match on `data.sessionId` for timer cancellation
3. **Lazy initialization:** SessionManager created on first use to avoid circular deps
4. **Timeout values:** 6 min for data collection, 10 min for promos (from CONTEXT.md)
5. **Default pack:** Auto-create order with 1x pack on promos timeout

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed engine.ts customer.message event schema**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** engine.ts was sending fields not in AgentEvents schema (contactId, workspaceId, messageContent)
- **Fix:** Updated to match schema: messageId (generated UUID), content (instead of messageContent)
- **Files modified:** src/lib/agents/engine.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** 6c4e4a3 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for type safety. No scope creep.

## Issues Encountered
- npm install initially failed with "Cannot read properties of null (reading 'matches')" - resolved by clean reinstall with --legacy-peer-deps
- React 19 peer dependency conflict with some packages - resolved with --legacy-peer-deps

## User Setup Required

**External services require manual configuration.** Environment variables needed:
- `INNGEST_EVENT_KEY`: For sending events in production
  - Source: Inngest Dashboard -> Settings -> Event Keys -> Create Key
- `INNGEST_SIGNING_KEY`: For verifying webhook requests
  - Source: Inngest Dashboard -> Settings -> Signing Keys

**Dashboard configuration:**
1. Create Inngest account at https://www.inngest.com/
2. Create a new app for "morfx-agents"
3. Copy event key and signing key to .env.local

**Verification:**
- Start dev server and visit /api/inngest to see registered functions
- Inngest Dev Server: `npx inngest-cli dev` for local testing

## Next Phase Readiness
- Inngest infrastructure ready for timer-based agent behaviors
- Events can be emitted from AgentEngine on mode transitions
- Timer workflows will cancel on customer message via waitForEvent
- Ready for Phase 14 (Agente Ventas Somnio) to use timer workflows

---
*Phase: 13-agent-engine-core*
*Completed: 2026-02-06*
