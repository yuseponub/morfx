---
phase: 18-domain-layer-foundation
plan: 06
subsystem: api, whatsapp
tags: [domain-layer, whatsapp, 360dialog, messages, keyword-match, trigger-emitter]

# Dependency graph
requires:
  - phase: 18-01
    provides: DomainContext/DomainResult types, mutation_audit, domain pattern
  - phase: 17-04
    provides: trigger-emitter with emitWhatsAppMessageReceived and emitWhatsAppKeywordMatch
provides:
  - 4 message domain functions (sendTextMessage, sendMediaMessage, sendTemplateMessage, receiveMessage)
  - keyword_match trigger activation (was dead, now fires on matching incoming messages)
  - all 5 message callers wired to domain
affects: [18-09, 18-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain message functions receive apiKey from caller (adapter resolves credentials)"
    - "receiveMessage handles both message storage + trigger emission in one call"
    - "Keyword match queries active automations and emits per-match triggers"
    - "resolveWhatsAppContext helper in action-executor for shared contact→conversation→apiKey lookup"

key-files:
  created:
    - src/lib/domain/messages.ts
  modified:
    - src/lib/domain/index.ts
    - src/app/actions/messages.ts
    - src/lib/tools/handlers/whatsapp/index.ts
    - src/lib/automations/action-executor.ts
    - src/lib/whatsapp/webhook-handler.ts
    - src/lib/agents/engine-adapters/production/messaging.ts

key-decisions:
  - "apiKey passed as param (not resolved inside domain) — each caller has different credential resolution"
  - "receiveMessage returns empty messageId for duplicates (dedup via wamid constraint)"
  - "Keyword match emits once per automation (first matching keyword wins, no duplicate triggers)"
  - "Unarchive logic stays in callers as adapter concern (not in domain)"
  - "Action executor removed tool executor + whatsapp/api direct imports — fully domain-powered"

patterns-established:
  - "Message domain: caller resolves apiKey + validates 24h window, domain handles API+DB+triggers"
  - "resolveWhatsAppContext: shared helper for contact→conversation→apiKey in action executor"
  - "Duplicate dedup: domain returns success with empty messageId, caller can detect and skip"

# Metrics
duration: 38min
completed: 2026-02-13
---

# Phase 18 Plan 06: Messages Domain + Keyword Match Summary

**4 message domain functions with keyword_match trigger activation, 5 callers wired through domain (server actions, tool handlers, action executor, webhook handler, engine adapter)**

## Performance

- **Duration:** 38 min
- **Started:** 2026-02-13T17:37:10Z
- **Completed:** 2026-02-13T18:15:10Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created `src/lib/domain/messages.ts` with 4 functions: sendTextMessage, sendMediaMessage, sendTemplateMessage, receiveMessage
- Activated the dead `whatsapp.keyword_match` trigger: receiveMessage queries active automations, checks keywords case-insensitively, emits per-match
- Wired all 5 message callers to domain: server actions, tool handlers, action executor, webhook handler, production messaging adapter
- Removed action executor dependency on tool executor and whatsapp/api for WhatsApp actions
- Net code reduction: -514 lines added / +345 lines = 169 fewer lines of duplication

## Task Commits

Each task was committed atomically:

1. **Task 1: Create messages domain functions + keyword match** - `a67bb87` (feat)
2. **Task 2: Wire all message callers to domain** - `24977fa` (feat)

## Files Created/Modified

- `src/lib/domain/messages.ts` - 4 domain functions: sendText, sendMedia, sendTemplate, receive + keyword match checker
- `src/lib/domain/index.ts` - Barrel export updated to include messages
- `src/app/actions/messages.ts` - sendMessage/sendMediaMessage/sendTemplateMessage delegate to domain
- `src/lib/tools/handlers/whatsapp/index.ts` - whatsapp.message.send + whatsapp.template.send via domain
- `src/lib/automations/action-executor.ts` - All 3 WhatsApp actions via domain, removed tool executor imports
- `src/lib/whatsapp/webhook-handler.ts` - processIncomingMessage uses domain.receiveMessage
- `src/lib/agents/engine-adapters/production/messaging.ts` - Send via domain.sendTextMessage

## Decisions Made

1. **apiKey as caller param:** Each caller resolves API key differently (server actions from user client, tool handlers from admin client, webhook from workspace config). Domain receives pre-resolved key rather than doing its own lookup.
2. **Dedup pattern:** receiveMessage returns `{ messageId: '' }` for duplicate wamid, allowing webhook handler to detect and skip agent routing.
3. **Keyword match: first match per automation:** When a message matches multiple keywords in one automation, only the first match emits a trigger. This prevents duplicate automation runs.
4. **Unarchive as adapter concern:** The conversation unarchive (archived -> active on send) stays in server actions/tool handlers since it's UI-level state management, not a message concern.
5. **resolveWhatsAppContext helper:** Extracted shared contact->conversation->apiKey lookup for all 3 WhatsApp action types in action executor.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Messages entity 100% domain-powered
- keyword_match trigger now live (was dead since Phase 17)
- Ready for Plan 07 (tasks domain) and Plan 09 (conversations domain)
- All CRM + WhatsApp entities now through domain layer

---
*Phase: 18-domain-layer-foundation*
*Completed: 2026-02-13*
