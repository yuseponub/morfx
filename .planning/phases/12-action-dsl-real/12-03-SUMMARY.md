---
phase: 12-action-dsl-real
plan: 03
subsystem: whatsapp
tags: [typescript, whatsapp, 360dialog, supabase, tool-handlers]

# Dependency graph
requires:
  - phase: 03-action-dsl-core
    provides: Tool registry, executor, schemas, WhatsApp handler placeholders
  - phase: 12-01
    provides: ToolResult<T> types, createAdminClient pattern, rate limiter
provides:
  - 7 real WhatsApp tool handlers replacing all placeholders
  - 360dialog API integration for message and template sending
  - 24h window enforcement for free-form messages
  - Template approval verification before sending
affects: [12-04-PLAN, 13-agent-engine-core, 14-agente-ventas-somnio]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-step handler: contact -> conversation -> 24h check -> API call -> DB persist"
    - "Status mapping: schema 'open'/'closed' -> DB 'active'/'archived'"
    - "Template lookup by name (not ID) for agent-friendly interface"

key-files:
  created: []
  modified:
    - src/lib/tools/handlers/whatsapp/index.ts

key-decisions:
  - "All 7 handlers in single file (preserves init.ts import contract)"
  - "toolError<T> generic helper for consistent error responses"
  - "Conversation close stores resolution in last_message_preview (no dedicated column)"
  - "Template params built dynamically from BODY/HEADER component variable extraction"

patterns-established:
  - "WhatsApp handlers use multi-step lookup: contactId -> contact.phone -> conversation -> API"
  - "24h window check uses simple arithmetic, not date-fns (avoids import dependency in tools module)"
  - "Status mapping layer: tool schema vocabulary -> database vocabulary"
  - "getWhatsAppApiKey() helper: workspace settings -> env var fallback -> null"

# Metrics
duration: 5min
completed: 2026-02-05
---

# Phase 12 Plan 03: WhatsApp Real Handlers Summary

**7 WhatsApp tool handlers replacing all placeholders with real 360dialog API integration, 24h window enforcement, template approval checks, and Supabase persistence**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-05T19:49:00Z
- **Completed:** 2026-02-05T19:54:26Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Replaced all 7 WhatsApp placeholder handlers with real implementations (901 lines replacing 87 lines of placeholder code)
- `whatsapp.message.send`: Multi-step handler with contact lookup, conversation resolution, 24h window enforcement, sendTextMessage via 360dialog, message DB persist, and conversation metadata update
- `whatsapp.template.send`: Template lookup by name, APPROVED status verification, dynamic component building from templateParams, send360Template, DB persist (works outside 24h window)
- `whatsapp.message.list`: Conversation ownership verification, cursor-based pagination, chronological ordering, hasMore detection
- `whatsapp.template.list`: Workspace-scoped query with optional status filter (normalized to uppercase)
- `whatsapp.conversation.list`: Contact join, status vocabulary mapping (open->active, closed->archived), assignment filters, count-based pagination
- `whatsapp.conversation.assign`: Previous agent tracking, workspace-scoped update with timestamp
- `whatsapp.conversation.close`: Maps to status='archived' (DB constraint), resolution note stored in last_message_preview

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement all WhatsApp handlers with 360dialog integration** - `fa40a8b` (feat)
2. **Task 2: Verify all 7 handlers exported** - verification only, no code changes needed

## Files Created/Modified

- `src/lib/tools/handlers/whatsapp/index.ts` - Complete rewrite: 87 lines of placeholders replaced with 901 lines of real handler implementations

## Decisions Made

- **All 7 handlers in single index.ts file:** Preserves the import contract with init.ts (`import { whatsappHandlers } from './handlers/whatsapp'`). File is well-structured with clear section separators.
- **toolError<T> generic helper:** Provides type-safe error construction without boilerplate. Used across all handlers for consistent error format.
- **Resolution stored in last_message_preview:** The conversations table has no dedicated resolution column. The close handler stores `[Cerrada] {resolution}` in last_message_preview, preserving the information without schema changes.
- **Template params built from component text regex:** Extracts `{{N}}` patterns from BODY and HEADER components, maps to templateParams record by position number. Same proven pattern used in src/app/actions/messages.ts.
- **Status vocabulary mapping in conversation.list:** Tool schema uses 'open'/'closed'/'all' (agent-friendly vocabulary), handler maps to DB's 'active'/'archived'. Transparent to the agent.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **TypeScript overload issue with toolError helper:** Initial implementation used function overloads with `never` types that confused TypeScript. Fixed by using a simple generic `toolError<T>` function signature instead. No impact on functionality.

## User Setup Required

None - no external service configuration required. WhatsApp API key must be configured in workspace settings or WHATSAPP_API_KEY env var (existing requirement from Phase 7).

## Next Phase Readiness

- All 7 WhatsApp handlers are real and ready for agent invocation
- Combined with CRM handlers (12-02), this provides the complete tool set for the sales agent
- Rate limiter (12-01) and executor integration (12-04) are the remaining pieces
- Agent engine (Phase 13) can now invoke WhatsApp tools with real effects

---
*Phase: 12-action-dsl-real*
*Completed: 2026-02-05*
