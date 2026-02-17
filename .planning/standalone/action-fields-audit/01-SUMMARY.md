# Phase standalone/action-fields-audit Plan 01: Executor Field Pass-Through Summary

Complete field pass-through in action-executor.ts so every domain-accepted field is reachable from automation params.

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~8 minutes |
| Tasks | 2/2 |
| Files modified | 1 |
| Deviations | 1 (duplicate_order toggle wiring from parallel process) |

## Accomplishments

1. **executeCreateOrder**: Added 5 missing field pass-throughs (name, closingDate, carrier, trackingNumber, customFields). carrier and trackingNumber fall back to trigger context values when not explicitly set.
2. **copyProducts toggle**: Products from trigger context now only copied when `copyProducts` is explicitly true. Was previously unconditional (always copied).
3. **executeUpdateField**: Added `name` and `shipping_department` to standardOrderFields + domainFieldMap for orders. Added `department` to standardContactFields for contacts.
4. **executeCreateTask**: Added `priority` pass-through (low/medium/high/urgent) to domainCreateTask.
5. **executeSendWhatsAppMedia**: Added `filename` pass-through to domainSendMediaMessage.
6. **executeDuplicateOrder**: copyContact, copyProducts, copyValue toggle flags now passed to domain (arrived via parallel process, included in commits).

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix executeCreateOrder field pass-through + copyProducts toggle | `7b8b271` | src/lib/automations/action-executor.ts |
| 2 | Fix executeUpdateField, executeCreateTask, executeSendWhatsAppMedia | `e2ca4d2` | src/lib/automations/action-executor.ts |

Note: Task 2 changes were included in commits `0502e41` and `e2ca4d2` due to a parallel process that also modified action-executor.ts (adding duplicate_order domain support).

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/automations/action-executor.ts` | All executor field pass-through fixes |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| carrier/trackingNumber fall back to trigger context | Shopify triggers provide these in context; explicit params override |
| copyProducts = opt-in only | Users must explicitly enable product copying; prevents unintended data duplication |
| customFields as object pass-through | Domain accepts Record<string,unknown>; only passed if params value is an object |
| priority as string cast | Domain expects union type; cast from string params to typed union |

## Deviations from Plan

### Additional Work (parallel process)

**1. [Rule 2 - Missing Critical] duplicate_order toggle flags wired to domain**
- **Found during:** Task 2 execution (linter/parallel process applied changes)
- **Issue:** copyContact, copyProducts, copyValue were identified as broken in research but not in Plan 01 scope
- **Fix:** Commits `0502e41` and `e2ca4d2` added copy flags to DuplicateOrderParams and wired them in executor
- **Files modified:** src/lib/automations/action-executor.ts, src/lib/domain/orders.ts

## Verification Results

- `npx tsc --noEmit`: Zero errors
- All 5 create_order fields (name, closingDate, carrier, trackingNumber, customFields) reachable
- copyProducts toggle guards product copying
- update_field maps name + shipping_department (orders), department (contacts)
- create_task passes priority
- send_whatsapp_media passes filename

## Next Phase Readiness

Plan 01 (executor fixes) complete. The following plans remain in this phase:
- Plan 02: UI catalog + constants (expose fields in ACTION_CATALOG)
- Plan 03: UI "Add field" UX pattern
- Plan 04: AI Builder system prompt update
