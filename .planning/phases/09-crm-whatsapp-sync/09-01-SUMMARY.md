---
phase: 09-crm-whatsapp-sync
plan: 01
subsystem: database
tags: [postgresql, rls, triggers, typescript, whatsapp, crm]

# Dependency graph
requires:
  - phase: 04-contacts-base
    provides: tags table structure and contact_tags pattern
  - phase: 07-whatsapp-core
    provides: conversations table for foreign key
  - phase: 06-orders
    provides: orders table and pipeline_stages for trigger
provides:
  - conversation_tags junction table with RLS policies
  - tags.applies_to field for tag scoping
  - auto_tag_cliente_on_ganado trigger
  - stage-to-phase mapping utility for UI
  - TagScope type for TypeScript
affects:
  - 09-02 (uses conversation_tags for bidirectional sync)
  - 09-03 (uses stage-phases for order indicators in WhatsApp)
  - 09-04 (uses TagScope for filtering)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RLS via parent table lookup (conversation_tags -> conversations)"
    - "SECURITY DEFINER trigger for cross-table insert"
    - "Stage-to-phase mapping with fallback default"

key-files:
  created:
    - supabase/migrations/20260203000001_crm_whatsapp_sync.sql
    - src/lib/orders/stage-phases.ts
  modified:
    - src/lib/types/database.ts

key-decisions:
  - "applies_to column defaults to 'both' for backward compatibility"
  - "Auto-tag trigger only fires on UPDATE (not INSERT) for explicit stage transitions"
  - "Stage-to-phase mapping falls back to 'pending' for unknown stages"
  - "Won orders show no indicator (success = no visual noise)"

patterns-established:
  - "Conversation tags follow same RLS pattern as contact_tags"
  - "Stage name normalization: lowercase + trim for lookup"

# Metrics
duration: 3min
completed: 2026-02-03
---

# Phase 9 Plan 01: Database Foundation Summary

**Database schema for conversation tags with RLS, auto-tag trigger for Ganado->Cliente, and stage-to-phase mapping utility**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-03T15:11:31Z
- **Completed:** 2026-02-03T15:14:26Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- conversation_tags table with RLS policies for workspace isolation
- tags.applies_to field for scoping tags to whatsapp/orders/both
- Auto-tag trigger adds "Cliente" tag when order reaches "Ganado" stage
- Stage-to-phase mapping for order status display in WhatsApp UI
- TagScope type added to TypeScript definitions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration for conversation_tags and tag scope** - `825d3d3` (feat)
2. **Task 2: Create stage-to-phase mapping utility** - `2932aae` (feat)
3. **Task 3: Update Tag type in database types** - `6e056ab` (feat)

## Files Created/Modified

- `supabase/migrations/20260203000001_crm_whatsapp_sync.sql` - Migration with conversation_tags, applies_to, auto-tag trigger
- `src/lib/orders/stage-phases.ts` - OrderPhase type and STAGE_TO_PHASE mapping
- `src/lib/types/database.ts` - Added TagScope type and applies_to to Tag interface

## Decisions Made

- **applies_to defaults to 'both':** Ensures backward compatibility - existing tags work everywhere
- **Trigger fires on UPDATE only:** Auto-tag only happens on explicit stage transitions, not order creation
- **Stage name normalization:** Lowercase + trim ensures case-insensitive matching
- **Won orders show no indicator:** Success state is the default, no need for visual clutter

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- conversation_tags table ready for Server Actions (Plan 02)
- Stage-phase mapping ready for conversation list UI (Plan 03)
- TagScope type available for filtering logic (Plan 04)
- Migration needs to be applied to Supabase before testing

---
*Phase: 09-crm-whatsapp-sync*
*Completed: 2026-02-03*
