---
phase: standalone/real-fields-fix
plan: 02
subsystem: api, database
tags: shopify, server-actions, zod, inngest, enrichment, domain-layer

# Dependency graph
requires:
  - phase: standalone/real-fields-fix plan 01
    provides: DB columns (orders.name, orders.shipping_department, contacts.department) + TypeScript types
provides:
  - name field flows from Shopify webhook through domain to DB
  - shipping_department flows from Shopify webhook through domain to DB
  - department flows from contact server actions through domain to DB
  - Enrichment resolves orderName from real orders.name column
affects:
  - standalone/real-fields-fix plan 03 (UI forms need to read/write these fields)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fallback chain for orderName: name -> description -> truncated ID"

key-files:
  created: []
  modified:
    - src/lib/shopify/order-mapper.ts
    - src/lib/shopify/webhook-handler.ts
    - src/app/actions/orders.ts
    - src/app/actions/contacts.ts
    - src/inngest/functions/automation-runner.ts

key-decisions:
  - "Keep description as metadata (payment status, notes) — name holds the real reference"
  - "Enrichment fallback chain: order.name -> order.description -> truncated ID (backward compat for old orders)"
  - "Contact department passed through all three form paths (createContact, createContactFromForm, updateContactFromForm)"

patterns-established:
  - "All new DB fields must flow through: mapper -> webhook handler -> domain call (for Shopify path)"
  - "All new DB fields must flow through: Zod schema -> server action -> domain call (for UI path)"

# Metrics
duration: 5min
completed: 2026-02-17
---

# Plan 02: Backend Pipeline Summary

**Wired orders.name and shipping_department through Shopify webhook, server actions, and enrichment with safe backward-compatible fallbacks**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-17T22:23:11Z
- **Completed:** 2026-02-17T22:28:06Z
- **Tasks:** 5
- **Files modified:** 5

## Accomplishments
- Shopify order-mapper now maps shopifyOrder.name to OrderFormData.name
- Webhook handler passes both name and shippingDepartment to domain (were being silently dropped)
- Server action Zod schemas validate name and shipping_department fields
- Contact server actions pass department through all three create/update paths
- Enrichment queries orders.name and uses it as primary source for orderName variable

## Task Commits

Each task was committed atomically:

1. **Task 02.1: Update Shopify order-mapper** - `2b74a74` (feat)
2. **Task 02.2: Update Shopify webhook handler** - `1fa98e1` (feat)
3. **Task 02.3: Update server action Zod schemas + domain calls** - `0a8a77b` (feat)
4. **Task 02.4: Update contacts server action** - `0c078da` (feat)
5. **Task 02.5: Fix enrichment to use real orders.name** - `33de8e3` (fix)

## Files Created/Modified
- `src/lib/shopify/order-mapper.ts` - Added name field to OrderFormData output
- `src/lib/shopify/webhook-handler.ts` - Added name + shippingDepartment to domainCreateOrder call
- `src/app/actions/orders.ts` - Added name + shipping_department to Zod schema and both create/update domain calls
- `src/app/actions/contacts.ts` - Added department to schema, ContactInput, and all 3 form handler paths
- `src/inngest/functions/automation-runner.ts` - Added name to enrichment select, fixed orderName resolution

## Decisions Made
- Kept description field as-is in order-mapper (stores payment status, notes metadata) while name now holds the actual order reference
- Used fallback chain for enrichment orderName: order.name -> order.description -> truncated UUID (ensures backward compatibility with orders created before the name column existed)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compilation passed cleanly after all changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All backend paths now pass name, shipping_department, and department to domain
- Ready for Plan 03 (UI form updates) to add input fields for these columns
- Existing orders without name will gracefully fall back to description or truncated ID

---
*Phase: standalone/real-fields-fix*
*Completed: 2026-02-17*
