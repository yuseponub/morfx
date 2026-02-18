---
phase: standalone/whatsapp-phone-resilience
plan: 02
subsystem: api
tags: [whatsapp, automation, phone-fallback, action-executor, custom-fields]

# Dependency graph
requires:
  - phase: standalone/whatsapp-phone-resilience plan 01
    provides: Secondary phone extraction from Shopify note_attributes stored in contacts.custom_fields.secondary_phone
  - phase: v2.0 (phase 05)
    provides: Automation action executor with resolveWhatsAppContext helper
provides:
  - Phone fallback chain in resolveWhatsAppContext (contact_id -> secondary phone -> create new)
  - WhatsApp automation actions that reach customers via their Releasit COD form phone when primary phone has no conversation
affects: [whatsapp-actions, automation-executor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phone fallback chain: try contact_id conversation, then secondary phone conversation, then create new with primary phone"

key-files:
  created: []
  modified:
    - src/lib/automations/action-executor.ts

key-decisions:
  - "Secondary phone lookup does NOT auto-link contact to conversation (per research v1 recommendation)"
  - "Secondary phone lookup does NOT create new conversation with secondary phone -- falls through to primary phone creation"
  - "Fallback is purely additive -- contacts without secondary_phone follow exact same path as before"

patterns-established:
  - "Phone fallback chain: multi-phone conversation resolution in action executor"

# Metrics
duration: 3min
completed: 2026-02-17
---

# Plan 02: Phone Fallback Chain Summary

**3-step phone fallback chain in resolveWhatsAppContext: contact_id conversation -> secondary phone conversation -> create new with primary phone**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T01:16:44Z
- **Completed:** 2026-02-18T01:19:44Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added secondary phone fallback to resolveWhatsAppContext so WhatsApp automation actions find conversations via secondary phone when primary has none
- Expanded contact query to include custom_fields for secondary phone data access
- All three WhatsApp action types (template, text, media) benefit from the same fallback chain with no signature changes
- Contacts without secondary_phone or with existing conversations are completely unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Add phone fallback chain to resolveWhatsAppContext** - `f20cee9` (feat)
2. **Task 2: Verify end-to-end type safety and build** - no commit (verification-only, no code changes)

## Files Created/Modified
- `src/lib/automations/action-executor.ts` - Added secondary phone fallback chain to resolveWhatsAppContext function; expanded contact query to include custom_fields

## Decisions Made
- Secondary phone lookup does NOT auto-link contact to the secondary conversation (avoids inbox confusion in v1, per research recommendation)
- Secondary phone lookup does NOT create a new conversation with the secondary phone -- if no conversation found for either phone, falls through to create with primary phone (existing behavior)
- The fallback is purely additive -- zero behavioral change for contacts without custom_fields.secondary_phone

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- WhatsApp phone resilience feature is complete across both plans
- Plan 01 extracts secondary phone from Shopify note_attributes at webhook ingestion time
- Plan 02 consumes that secondary phone in the action executor fallback chain
- No blockers -- feature is ready for production use once Shopify webhooks start populating secondary_phone data

---
*Phase: standalone/whatsapp-phone-resilience*
*Completed: 2026-02-17*
