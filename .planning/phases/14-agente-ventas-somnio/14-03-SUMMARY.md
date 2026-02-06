---
phase: 14-agente-ventas-somnio
plan: 03
subsystem: agents
tags: [templates, variable-substitution, somnio, message-templates]

# Dependency graph
requires:
  - phase: 14-01
    provides: AgentTemplate type, agent_templates table schema
provides:
  - TemplateManager class for loading/selecting templates
  - Variable substitution utility with {{pattern}} replacement
  - SOMNIO_PRICES constant with hardcoded prices
affects: [14-04-message-sequencer, 14-05-conversation-handler]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Template caching with 5-minute expiry
    - primera_vez vs siguientes visit type selection
    - Fallback to primera_vez when siguientes unavailable

key-files:
  created:
    - src/lib/agents/somnio/variable-substitutor.ts
    - src/lib/agents/somnio/template-manager.ts
  modified:
    - src/lib/agents/somnio/index.ts

key-decisions:
  - "Hardcoded SOMNIO_PRICES constant ($77,900 / $109,900 / $139,900) - configurable prices deferred to post-MVP"
  - "Template cache expiry at 5 minutes to balance freshness vs performance"
  - "Fallback from siguientes to primera_vez if no siguientes templates exist"
  - "Price variables auto-populated in substituteVariables regardless of context"

patterns-established:
  - "VariableContext interface for template substitution"
  - "TemplateSelection type with templates, visitType, alreadySent"
  - "ProcessedTemplate type with substituted content and delay info"

# Metrics
duration: 3min
completed: 2026-02-06
---

# Phase 14 Plan 03: Template Manager Summary

**Template loading, selection, and variable substitution for Somnio agent message responses**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-06T16:54:24Z
- **Completed:** 2026-02-06T16:57:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created SOMNIO_PRICES constant with hardcoded prices (1x: $77,900, 2x: $109,900, 3x: $139,900)
- Implemented substituteVariables function for {{variable}} pattern replacement
- Added extractVariables, hasUnsubstitutedVariables, getMissingVariables utilities
- Created TemplateManager class with 5-minute template caching
- Implemented primera_vez vs siguientes visit type detection
- Added fallback logic when siguientes templates don't exist
- Template tracking to prevent re-sending same templates
- Exported all utilities from somnio module index

## Task Commits

Each task was committed atomically:

1. **Task 1: Create variable substitution utility** - `7b807a4` (feat)
2. **Task 2: Create Template Manager component** - `28875bc` (feat)

## Files Created/Modified

- `src/lib/agents/somnio/variable-substitutor.ts` - SOMNIO_PRICES, substituteVariables, extractVariables, utility functions
- `src/lib/agents/somnio/template-manager.ts` - TemplateManager class with caching, selection, processing
- `src/lib/agents/somnio/index.ts` - Export variable and template modules

## Decisions Made

1. **Hardcoded prices:** SOMNIO_PRICES constant with 3 tiers - configurable prices explicitly deferred to post-MVP per CONTEXT.md
2. **Cache duration:** 5-minute expiry balances template freshness vs database load
3. **Fallback strategy:** If no 'siguientes' templates exist for an intent, use 'primera_vez' templates
4. **Price auto-population:** Price variables (precio_1x, precio_2x, precio_3x) always available in substitution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - execution proceeded smoothly.

## User Setup Required

None - templates seeded separately (migration from Plan 14-01 already applied).

## Next Phase Readiness

- TemplateManager ready for MessageSequencer to fetch and process templates
- Variable substitution ready for personalizing messages with customer data
- Price constants available for pack selection displays
- Ready for Plan 14-04: Message Sequencer implementation

---
*Phase: 14-agente-ventas-somnio*
*Completed: 2026-02-06*
