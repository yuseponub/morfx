# Shopify Contact Resolution Plan 02: Action Executor Integration Summary

**One-liner:** Close-phone detection in resolveOrCreateContact with template blocking, review creation after order, and host WhatsApp notification via 360dialog.

## What Was Done

### Task 1: Extend TriggerContext type
- Added `pendingContactReview`, `_reviewToken`, and `_reviewData` fields to TriggerContext interface
- `_reviewData` carries contactNewId, contactExistingId, existingPhone, existingContactName, shopifyPhone
- Commit: `cc6521c`

### Task 2a: Modify resolveOrCreateContact + call-site mutation
- Changed return type from `string | null` to `ResolveContactResult | null` (enriched with pendingReview + reviewData)
- New flow: exact phone match (unchanged) -> email match (unchanged) -> close phone search -> create contact
- Close phone detection queries up to 2000 contacts, calls `findClosePhone` from phone-distance.ts
- Call-site uses direct property mutation on context object (NOT spread) to persist across action calls
- Commit: `a91e105`

### Task 2b: Template blocking + handlePendingContactReview helper
- Template/text/SMS actions check `pendingContactReview` and skip when true
- Skipped template data stored via `addPendingTemplate` for later replay
- Safety net: console.warn if `_reviewToken` is missing during template blocking
- Post-`create_order` hook calls `handlePendingContactReview` which:
  1. Creates contact_review record (now has orderId)
  2. Tags order with REVISAR-CONTACTO
  3. Updates order description with duplicate info
  4. Sends host WhatsApp notification at +573137549286 via direct 360dialog API
- Host notification uses `informacion_general` template with MERGE/IGNORE URLs
- Commit: `0b2cfa9`

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Direct property mutation on context (not spread) | Context is same JS object reference across all actions in automation-runner; spread creates local copy that doesn't persist |
| Post-create_order hook for review creation | Review needs orderId which only exists after create_order executes |
| Direct 360dialog API for host notification | Avoids needing a contact/conversation for the host phone |
| Template `informacion_general` with 2 body vars | Already approved template; var 1 = name, var 2 = message body with MERGE/IGNORE links |
| Safety net console.warn for missing _reviewToken | Should never happen due to cascade ordering, but logs a warning for debugging |

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/automations/types.ts` | Added 3 fields to TriggerContext |
| `src/lib/automations/action-executor.ts` | Imports, resolveOrCreateContact rewrite, executeByType blocking, post-order hook, handlePendingContactReview helper |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (only pre-existing unrelated errors in vitest/agent files)
- Mental test: close phone (1 digit diff + similar name) -> new contact created, pendingReview=true, order tagged, host notified, templates blocked and stored
- Mental test: exact phone match -> unchanged behavior, no review
- Mental test: no close match -> new contact created normally, no review

## Duration

~9 minutes

## Next

Plan 03: Contact review resolution page (MERGE/IGNORE UI) + pending template replay.
