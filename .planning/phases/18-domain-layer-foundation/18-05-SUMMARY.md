---
phase: 18-domain-layer-foundation
plan: 05
subsystem: domain
tags: [typescript, contacts, tags, domain-layer, server-actions, tool-handlers, action-executor, shopify-webhook]

# Dependency graph
requires:
  - phase: 18-domain-layer-foundation
    provides: Contact domain functions (Plan 04), shared tag domain functions (Plan 04), order domain functions (Plan 02), DomainContext types (Plan 01)
provides:
  - All contact and tag callers wired to domain (server actions, tool handlers, action executor, Shopify webhook)
  - Zero inline trigger emissions in callers for orders, contacts, or tags
  - Bot/automation tag operations now trigger automations consistently
affects: [18-06, 18-07, 18-08, 18-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin adapter pattern: server actions keep auth/validation/revalidatePath, delegate mutations to domain"
    - "TagId-to-tagName adapter: UI sends tagId, server action looks up tagName before calling domain"
    - "Lazy trigger emitter removed: all CRM entity triggers now handled by domain layer"

key-files:
  created: []
  modified:
    - src/app/actions/contacts.ts
    - src/lib/tools/handlers/crm/index.ts
    - src/lib/automations/action-executor.ts
    - src/lib/shopify/webhook-handler.ts

key-decisions:
  - "Server actions keep auth (getWorkspaceContext helper), Zod validation, revalidatePath as adapter concerns"
  - "Tag operations in server actions look up tagName from tagId (UI sends tagId, domain expects tagName) - same pattern as orders Plan 03"
  - "bulkCreateContacts falls back to per-item domain calls on batch failure (preserves CSV import per-row error reporting)"
  - "updateContactByPhone finds contact by phone, then delegates to domain updateContact (thin convenience adapter)"
  - "Lazy trigger emitter fully removed from action executor (all entities now via domain)"
  - "deleteContacts loops over domain deleteContact per ID (sequential, not batch) - same pattern as orders"

patterns-established:
  - "Complete caller migration pattern: read domain files, refactor each mutation caller, remove trigger imports, verify with tsc"
  - "Action executor entity routing: both order and contact branches delegate to domain, no inline trigger code for any CRM entity"

# Metrics
duration: 9min
completed: 2026-02-13
---

# Phase 18 Plan 05: Contact & Tag Callers Migration Summary

**All 5 contact/tag caller files wired to domain with zero inline trigger emissions -- bot operations, Shopify imports, and automations now consistently trigger automations**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-13T17:25:45Z
- **Completed:** 2026-02-13T17:34:31Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Every contact mutation (create, update, delete, bulk) across all callers now goes through domain/contacts
- Every tag operation (assign, remove, bulk) across all callers now goes through domain/tags
- Bot tag.add and tag.remove now trigger automations (previously bypassed trigger emissions)
- Shopify webhook contact creation now triggers contact.created automation
- Action executor has zero inline trigger code for any CRM entity (orders, contacts, tags)
- Net reduction of ~280 lines of duplicated DB logic across 4 files

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire contact server actions + Shopify webhook** - `d88c695` (feat)
2. **Task 2: Wire CRM tool handlers + action executor** - `c64b237` (feat)

## Files Created/Modified
- `src/app/actions/contacts.ts` - Thin adapter: auth + Zod validation + revalidatePath + domain calls. Removed all trigger emission imports.
- `src/lib/tools/handlers/crm/index.ts` - Contact/tag handlers delegate to domain. Order handlers already migrated in Plan 03.
- `src/lib/automations/action-executor.ts` - assign_tag, remove_tag, update_field for contacts use domain. Lazy trigger emitter removed.
- `src/lib/shopify/webhook-handler.ts` - resolveContact uses domain/contacts.createContact instead of direct DB insert.

## Decisions Made
- **getWorkspaceContext helper:** Extracted common auth+workspace pattern from all mutation server actions into a single helper. Reduces boilerplate without changing behavior.
- **TagId-to-tagName adapter pattern:** UI sends tagId (from tag dropdown), but domain expects tagName (by design from Plan 04). Server actions look up the name from the ID before calling domain. Same pattern used by orders in Plan 03.
- **bulkCreateContacts fallback:** Domain's bulkCreateContacts is all-or-nothing (batch insert). Server action preserves the CSV import UX by falling back to per-item domain calls on batch failure, collecting per-row errors.
- **Lazy trigger emitter removal:** With contacts and tags fully migrated, there are no remaining callers of the lazy trigger emitter in action-executor. It was completely removed. The only remaining direct trigger emissions in the codebase are in the domain layer itself (where they belong).
- **Shopify contact duplicate handling:** Domain returns error with "telefono" keyword for duplicate phone. Webhook handler matches on this string to fall back to existing contact lookup, preserving the race condition handling from the original code.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Orders + Contacts + Tags: 100% migrated to domain layer
- Next entity: Messages (Plan 06) or Tasks (Plan 07)
- Action executor ready: only WhatsApp actions, task creation, and webhooks remain as direct DB operations
- All CRM entity trigger emissions now go through domain layer exclusively

---
*Phase: 18-domain-layer-foundation*
*Completed: 2026-02-13*
