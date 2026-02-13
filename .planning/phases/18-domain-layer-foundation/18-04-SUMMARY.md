---
phase: 18-domain-layer-foundation
plan: 04
subsystem: domain
tags: [typescript, contacts, tags, domain-layer, trigger-emitter, phone-normalization]

# Dependency graph
requires:
  - phase: 18-domain-layer-foundation
    provides: DomainContext/DomainResult types (Plan 01), orders domain with addOrderTag/removeOrderTag (Plan 02)
provides:
  - 4 contact domain functions (createContact, updateContact, deleteContact, bulkCreateContacts)
  - 2 shared tag domain functions (assignTag, removeTag) handling both contact and order tags
  - orders.ts tag functions delegate to shared tags.ts (single source of truth)
affects: [18-05, 18-06, 18-07, 18-08, 18-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared entity module pattern: tags.ts handles both contact and order entity types via entityType param"
    - "Delegation pattern: orders.ts addOrderTag/removeOrderTag delegate to tags.ts"
    - "Per-key custom_fields change tracking: updateContact emits field.changed per changed custom field key"

key-files:
  created:
    - src/lib/domain/contacts.ts
    - src/lib/domain/tags.ts
  modified:
    - src/lib/domain/orders.ts
    - src/lib/domain/index.ts

key-decisions:
  - "departamento stored in custom_fields (not a standard contacts table column)"
  - "createContact tags param is best-effort: skips silently if tag not found (no auto-create per domain design)"
  - "orders.ts addOrderTag/removeOrderTag delegate to tags.ts for single source of truth"
  - "updateContact emits per-key field.changed for custom_fields with custom_fields.{key} as fieldName"
  - "bulkCreateContacts does not attempt individual inserts on batch failure (simpler than server action; callers can handle)"

patterns-established:
  - "Shared entity module: tags.ts as single source for tag ops across all entity types"
  - "Delegation from specialized to shared: domain entity modules delegate to shared modules"
  - "Phone normalization in domain: normalizePhone called in domain layer for all contact creation paths"

# Metrics
duration: 8min
completed: 2026-02-13
---

# Phase 18 Plan 04: Contacts & Tags Domain Functions Summary

**4 contact domain functions with phone normalization and per-field triggers, plus 2 shared tag functions handling both contact and order entities with orders.ts delegation**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-13T17:15:04Z
- **Completed:** 2026-02-13T17:23:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Contact domain functions cover all CRUD operations with proper trigger emission
- Tags module is a shared entity handling both contact and order tag operations through a single code path
- orders.ts tag functions simplified from ~120 lines of duplicated logic to ~20 lines delegating to tags.ts
- updateContact tracks custom_fields changes per-key (not as a single blob), enabling granular automation triggers

## Task Commits

Each task was committed atomically:

1. **Task 1: Create contacts domain functions** - `caf428a` (feat)
2. **Task 2: Create tags domain functions + update barrel + orders delegation** - `dbe5c6b` (feat)

## Files Created/Modified
- `src/lib/domain/contacts.ts` - 4 contact domain functions: createContact, updateContact, deleteContact, bulkCreateContacts
- `src/lib/domain/tags.ts` - 2 shared tag domain functions: assignTag, removeTag (both entity types)
- `src/lib/domain/orders.ts` - addOrderTag/removeOrderTag simplified to delegate to tags.ts
- `src/lib/domain/index.ts` - Barrel export now includes contacts and tags modules

## Decisions Made
- **departamento in custom_fields:** The contacts table has no `departamento` column. It is stored as a key in the `custom_fields` JSONB column, matching how the Somnio agent handles it.
- **Tags best-effort on createContact:** When `tags` param is provided to createContact, each tag is looked up by name. If not found, it's skipped silently (consistent with domain design: no auto-create tags).
- **orders.ts delegates to tags.ts:** Rather than keeping duplicate tag logic in orders.ts, addOrderTag/removeOrderTag now call assignTag/removeTag from tags.ts. This ensures a single code path for tag lookup, junction table insert, contact context resolution, and trigger emission.
- **Per-key custom_fields tracking:** updateContact compares each custom field key individually and emits field.changed with fieldName `custom_fields.{key}`, enabling automations to trigger on specific custom field changes rather than any custom field change.
- **bulkCreateContacts simplified:** Unlike the server action which falls back to individual inserts on batch failure, the domain function lets the batch fail and returns the error. Callers that need per-row error handling can call createContact in a loop.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Orders delegation to shared tags**
- **Found during:** Task 2 (tags domain creation)
- **Issue:** Plan mentioned delegation as optional ("Claude's discretion"). Having two separate tag implementations (orders.ts and tags.ts) would risk trigger duplication and divergent behavior over time.
- **Fix:** Refactored orders.ts addOrderTag/removeOrderTag to delegate to tags.ts, removed now-unused emitTagAssigned/emitTagRemoved imports from orders.ts.
- **Files modified:** src/lib/domain/orders.ts
- **Verification:** `npx tsc --noEmit` passes, trigger emission happens exactly once (in tags.ts)
- **Committed in:** dbe5c6b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for single-source-of-truth principle. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Contact and tag domain functions ready for Plan 05 (contact callers migration)
- Tags module ready for any caller to use directly for both entity types
- Barrel export complete: `import { createContact, assignTag } from '@/lib/domain'` works

---
*Phase: 18-domain-layer-foundation*
*Completed: 2026-02-13*
