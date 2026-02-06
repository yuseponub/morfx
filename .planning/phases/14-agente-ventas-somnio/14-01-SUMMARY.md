---
phase: 14-agente-ventas-somnio
plan: 01
subsystem: agents
tags: [claude, agent-registry, state-machine, intents, somnio, whatsapp-sales]

# Dependency graph
requires:
  - phase: 13-agent-engine-core
    provides: AgentRegistry, AgentConfig types, ClaudeClient, SessionManager
provides:
  - agent_templates database schema for intent-to-template mapping
  - Somnio sales agent registered in AgentRegistry as somnio-sales-v1
  - 22 base intents + 11 hola+X combinations (33 total)
  - Intent Detector and Orchestrator system prompts
  - State machine: conversacion -> collecting_data -> ofrecer_promos -> resumen -> confirmado -> handoff
affects: [14-02-data-extractor, 14-03-template-manager, 14-04-conversation-handler, 14-05-agent-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Intent definitions with category, examples, triggers
    - State machine transitions as Record<string, string[]>
    - System prompts with JSON output format specification

key-files:
  created:
    - supabase/migrations/20260206_agent_templates.sql
    - src/lib/agents/somnio/intents.ts
    - src/lib/agents/somnio/prompts.ts
    - src/lib/agents/somnio/config.ts
    - src/lib/agents/somnio/index.ts
  modified:
    - src/lib/agents/types.ts
    - src/lib/agents/index.ts

key-decisions:
  - "Using claude-sonnet-4-5 for both Intent Detector and Orchestrator until Haiku 4.5 available (per decision 13-03)"
  - "22 base intents plus 11 hola+X combinations = 33 total intent definitions"
  - "Intent categories: informativo (13), flujo_compra (8), escape (1), combinacion (11)"
  - "6 agent states with explicit valid transitions defined"

patterns-established:
  - "IntentDefinition type: { name, description, examples, triggers?, category }"
  - "State transitions as StateTransitions = Record<string, string[]>"
  - "Agent registration on module import via agentRegistry.register()"

# Metrics
duration: 10min
completed: 2026-02-06
---

# Phase 14 Plan 01: Agent Templates Schema & Somnio Configuration Summary

**Database schema for agent templates and Somnio sales agent with 33 intents, 6 states, and Claude system prompts registered in AgentRegistry**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-06T16:41:23Z
- **Completed:** 2026-02-06T16:51:41Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created agent_templates table with RLS, indexes, and workspace isolation
- Defined 22 base intents for Somnio agent (13 informativo, 8 flujo_compra, 1 escape)
- Added 11 hola+X combination intents for greeting+question detection
- Created Intent Detector prompt with confidence scoring and JSON output format
- Created Orchestrator prompt with state transition rules and tool usage patterns
- Registered somnio-sales-v1 agent in AgentRegistry on module load

## Task Commits

Each task was committed atomically:

1. **Task 1: Create agent_templates database schema** - `b5a4810` (feat)
2. **Task 2: Create Somnio agent configuration with intents and prompts** - `cb52536` (feat)

## Files Created/Modified

- `supabase/migrations/20260206_agent_templates.sql` - Agent templates table with RLS and workspace isolation
- `src/lib/agents/types.ts` - Added AgentTemplate, TemplateContentType, TemplateVisitType types
- `src/lib/agents/somnio/intents.ts` - 33 intent definitions with examples and triggers
- `src/lib/agents/somnio/prompts.ts` - Intent Detector, Orchestrator, and Data Extractor prompts
- `src/lib/agents/somnio/config.ts` - AgentConfig with states, transitions, tools, thresholds
- `src/lib/agents/somnio/index.ts` - Module exports and agent registration
- `src/lib/agents/index.ts` - Re-exports somnio module

## Decisions Made

1. **Claude model selection:** Using claude-sonnet-4-5 for both Intent Detector and Orchestrator until Haiku 4.5 is available (per accumulated decision 13-03)
2. **Intent count:** 22 base intents (13+8+1) plus 11 combinations = 33 total, matching CONTEXT.md specification
3. **Prompt format:** JSON output format with confidence scoring for intent detection, structured action/response for orchestration
4. **Template storage:** Database-based templates for runtime configurability without code deployment

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - execution proceeded smoothly.

## User Setup Required

None - no external service configuration required. Migration applies with `supabase db push`.

## Next Phase Readiness

- Somnio agent registered and retrievable via `agentRegistry.get('somnio-sales-v1')`
- Intent definitions ready for Intent Detector component
- State machine ready for Orchestrator state management
- agent_templates table ready for template seeding (Plan 14-03)
- Ready for Plan 14-02: Data Extractor implementation

---
*Phase: 14-agente-ventas-somnio*
*Completed: 2026-02-06*
