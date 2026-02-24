---
phase: 31-pre-send-check-interruption-pending-merge
plan: 02
subsystem: database, agents
tags: [migration, priority, templates, inngest, session-state]

# Dependency graph
requires:
  - phase: 14-agente-ventas-somnio
    provides: TemplateManager, AgentTemplate types, agent_templates table
  - phase: 29-inngest-migration-character-delays
    provides: Inngest event infrastructure, webhook-handler agent routing
provides:
  - priority column on agent_templates (CORE/COMPLEMENTARIA/OPCIONAL)
  - pending_templates JSONB column on session_state
  - AgentTemplate.priority and ProcessedTemplate.priority typed fields
  - isValidTemplatePriority type guard
  - messageTimestamp on agent/whatsapp.message_received event
affects:
  - 31-03 (BlockComposer uses priority from ProcessedTemplate)
  - 31-04 (pre-send check uses messageTimestamp from event, pending_templates from session_state)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Priority enum as CHECK constraint with type guard validation"
    - "JSONB default empty array for pending state storage"

key-files:
  created:
    - supabase/migrations/20260226000000_block_priorities.sql
  modified:
    - src/lib/agents/types.ts
    - src/lib/agents/somnio/template-manager.ts
    - src/inngest/events.ts
    - src/lib/whatsapp/webhook-handler.ts

key-decisions:
  - "Priority as TEXT with CHECK constraint (not enum type) for flexibility"
  - "Default priority CORE ensures backward compatibility for existing templates"
  - "Seed priorities by orden (0=CORE, 1=COMP, 2+=OPC) matching existing intent ordering"
  - "isValidTemplatePriority standalone type guard (not re-exporting from block-composer.ts which may not exist yet)"

patterns-established:
  - "Priority fallback to CORE: all validation paths default to CORE if unknown value"

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 31 Plan 02: Block Priorities DB Infrastructure Summary

**DB migration adding CORE/COMPLEMENTARIA/OPCIONAL priority to agent_templates, pending_templates JSONB to session_state, with full TypeScript type propagation through TemplateManager and messageTimestamp on Inngest event**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T03:16:54Z
- **Completed:** 2026-02-24T03:21:40Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Migration adds priority column with CHECK constraint and seeds existing templates by orden
- Migration adds pending_templates JSONB column for interruption-deferred template storage
- Full TypeScript type chain: DB -> AgentTemplateRow -> AgentTemplate -> ProcessedTemplate
- messageTimestamp propagated from webhook handler through Inngest event for pre-send check

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration -- priority column + pending_templates + seed** - `0e7b87b` (feat)
2. **Task 2: Update TypeScript types + TemplateManager + Inngest events** - `9860fcf` (feat)

## Files Created/Modified
- `supabase/migrations/20260226000000_block_priorities.sql` - Migration for priority column, seed, and pending_templates
- `src/lib/agents/types.ts` - Added priority to AgentTemplate/AgentTemplateRow, isValidTemplatePriority guard
- `src/lib/agents/somnio/template-manager.ts` - ProcessedTemplate.priority, rowToTemplate maps priority, processTemplates passes it
- `src/inngest/events.ts` - Added messageTimestamp to agent/whatsapp.message_received event
- `src/lib/whatsapp/webhook-handler.ts` - Passes messageTimestamp when emitting Inngest event

## Decisions Made
- Priority as TEXT with CHECK constraint (not Postgres enum) for flexibility and simpler migrations
- Default priority CORE ensures backward compatibility -- existing templates without explicit priority are safe
- Seed priorities by orden (0=CORE, 1=COMP, 2+=OPC) matching existing intent ordering convention
- isValidTemplatePriority defined as standalone type guard in types.ts (not importing from block-composer.ts which is Plan 01 territory and may run in parallel)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Migration must be applied to Supabase when deploying.

## Next Phase Readiness
- Priority data available in DB and flowing through TemplateManager for BlockComposer (Plan 03)
- pending_templates column ready for pre-send check to persist deferred templates (Plan 04)
- messageTimestamp available in Inngest event for pre-send check query window (Plan 04)
- No blockers for Plan 03 or Plan 04

---
*Phase: 31-pre-send-check-interruption-pending-merge*
*Completed: 2026-02-24*
