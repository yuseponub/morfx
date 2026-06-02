---
status: resolved
trigger: "duplicate_order missing name, closing_date, total_value. Audit all actions."
created: 2026-02-20T10:00:00-05:00
updated: 2026-02-20T10:10:00-05:00
---

## Current Focus

hypothesis: CONFIRMED - duplicateOrder insert omitted name and closing_date
test: Applied fix, TypeScript compilation passes with zero errors
expecting: N/A - resolved
next_action: Archive session

## Symptoms

expected: When duplicate_order action fires, new order has same name, closing_date, total_value as source. All actions pass complete data to domain.
actual: Duplicated order missing name, closing_date. total_value handled partially (only via products recalc or post-insert update). Other actions may have gaps.
errors: No errors - silent data loss on insert
reproduction: Trigger automation with tag assignment -> duplicate_order. New order appears without name.
started: Since duplicate_order was implemented. Never worked correctly for these fields.

## Eliminated

(none - root cause confirmed on first hypothesis)

## Evidence

- timestamp: 2026-02-20T10:01
  checked: domain/orders.ts duplicateOrder insert (lines 712-727)
  found: Insert copies description, shipping_address, shipping_city, shipping_department, carrier, tracking_number, custom_fields. MISSING: name, closing_date. total_value not in insert either (handled later only for products path).
  implication: CONFIRMED - name and closing_date are silently dropped during duplication.

- timestamp: 2026-02-20T10:02
  checked: shouldCopyValue flag (line 709)
  found: Flag is computed but only used AFTER insert for total_value. Name/closing_date have no corresponding flags - they should always be copied.
  implication: The total_value handling via post-insert update works for the products path, but name/closing_date are completely lost.

- timestamp: 2026-02-20T10:03
  checked: action-executor.ts all action functions (12 actions audited)
  found: AUDIT RESULTS:
  1. executeAssignTag - OK, delegates to domain correctly
  2. executeRemoveTag - OK, delegates to domain correctly
  3. executeChangeStage - OK, delegates to domain correctly
  4. executeUpdateField - OK, comprehensive field mapping with standard + custom fields
  5. executeCreateOrder - OK, passes all fields from params + context fallbacks
  6. executeDuplicateOrder - OK at action-executor level (passes copyContact/copyProducts/copyValue to domain)
  7. executeSendWhatsAppTemplate - OK, full template variable resolution
  8. executeSendWhatsAppText - OK, with 24h window check
  9. executeSendWhatsAppMedia - OK, with media type detection + 24h window
  10. executeCreateTask - MINOR GAP: conversationId from TriggerContext not passed to domainCreateTask
  11. executeSendSms - OK, Twilio integration with status callback
  12. executeWebhook - OK, POST with timeout
  implication: Primary bug is in domain/orders.ts duplicateOrder, not in action-executor.ts. Minor gap in createTask.

- timestamp: 2026-02-20T10:05
  checked: total_value handling in duplicateOrder
  found: total_value is NOT in the initial insert (by design). It is handled post-insert:
  - If copyProducts=true: products are inserted, DB trigger recalculates, then if copyValue=false it zeroes out
  - If copyProducts=false AND copyValue=true: explicit update with sourceOrder.total_value
  - If copyProducts=false AND copyValue=false: defaults to 0 (DB default)
  This logic is CORRECT. total_value was never the bug - name and closing_date were.
  implication: total_value handling is working as designed via post-insert updates.

- timestamp: 2026-02-20T10:08
  checked: TypeScript compilation after fix
  found: npx tsc --noEmit passes with zero errors
  implication: Fix is type-safe and compatible with Supabase schema

## Resolution

root_cause: In domain/orders.ts duplicateOrder(), the insert object at line 714-728 was missing `name` and `closing_date` fields. The sourceOrder was fetched with select('*') so all fields were available, but the insert only copied a subset of fields (description, shipping_*, carrier, tracking_number, custom_fields). The `name` and `closing_date` fields were simply never added to the insert when the function was originally written. total_value was NOT actually bugged - it's handled correctly via post-insert logic.

fix:
1. Added `name: sourceOrder.name` and `closing_date: sourceOrder.closing_date` to the insert in duplicateOrder (domain/orders.ts)
2. Added `conversationId: context.conversationId || undefined` to executeCreateTask call in action-executor.ts

verification: TypeScript compilation passes (0 errors). Code review confirms name/closing_date now flow from sourceOrder to insert. The emitOrderCreated call already passes orderName (sourceOrder.name) so downstream triggers will also have the correct data.

files_changed:
- src/lib/domain/orders.ts (added name + closing_date to duplicateOrder insert)
- src/lib/automations/action-executor.ts (added conversationId to createTask call)
