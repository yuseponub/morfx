---
phase: standalone/whatsapp-phone-resilience
plan: 01
subsystem: api
tags: [shopify, whatsapp, phone-normalization, webhook, custom-fields]

# Dependency graph
requires:
  - phase: v1.0 (phase 11)
    provides: Shopify integration types, phone-normalizer, webhook-handler
  - phase: v2.0 (phase 05)
    provides: Domain layer custom-fields with JSONB merge + field.changed trigger
provides:
  - note_attributes type support on ShopifyOrderWebhook and ShopifyDraftOrderWebhook
  - extractSecondaryPhoneFromNoteAttributes extraction function with broad pattern matching
  - Secondary phone storage in contacts.custom_fields.secondary_phone at webhook ingestion time
affects: [wp-resilience-02, action-executor phone fallback chain]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extract-at-ingestion: capture Shopify note_attributes phone data at webhook time, store in custom_fields"
    - "Broad phone attribute matching: case-insensitive substring matching against known COD form patterns"

key-files:
  created: []
  modified:
    - src/lib/shopify/types.ts
    - src/lib/shopify/phone-normalizer.ts
    - src/lib/shopify/webhook-handler.ts

key-decisions:
  - "Secondary phone stored in custom_fields JSONB (not a new column) -- plugin-specific metadata"
  - "Extraction at webhook ingestion time (not at action execution time) -- decouples action executor from Shopify"
  - "Broad pattern matching with 14 phone-related attribute name patterns for Releasit/CodMonster compatibility"
  - "Only applied in AUTO-SYNC block (not trigger-only or draft orders) -- v1 scope"

patterns-established:
  - "Extract-at-ingestion: capture third-party plugin metadata at webhook time, not action time"

# Metrics
duration: 4min
completed: 2026-02-17
---

# Plan 01: Secondary Phone Extraction Summary

**Shopify note_attributes phone extraction with E.164 normalization and custom_fields storage at webhook ingestion time**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T01:09:58Z
- **Completed:** 2026-02-18T01:14:09Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended ShopifyOrderWebhook and ShopifyDraftOrderWebhook types with note_attributes field
- Created extractSecondaryPhoneFromNoteAttributes function with 14 phone-related attribute name patterns (phone, telefono, celular, whatsapp, movil, mobile, etc.)
- Wired secondary phone extraction into processShopifyWebhook AUTO-SYNC block -- stores on contact's custom_fields.secondary_phone via domainUpdateCustomFieldValues
- Function skips phones matching the primary phone to avoid storing duplicates

## Task Commits

Each task was committed atomically:

1. **Task 1: Add note_attributes type + extraction function** - `29f6b0e` (feat)
2. **Task 2: Wire secondary phone extraction into webhook handler** - `058d369` (feat)

## Files Created/Modified
- `src/lib/shopify/types.ts` - Added note_attributes field to ShopifyOrderWebhook and ShopifyDraftOrderWebhook
- `src/lib/shopify/phone-normalizer.ts` - Added extractSecondaryPhoneFromNoteAttributes function with broad pattern matching
- `src/lib/shopify/webhook-handler.ts` - Import extraction + domain custom fields, extract and store secondary phone after resolveContact()

## Decisions Made
- Secondary phone stored in `custom_fields.secondary_phone` (JSONB) rather than a new column -- consistent with existing custom_fields pattern, no migration needed, GIN indexed
- Extraction happens at webhook ingestion time, not at action execution time -- decouples action executor from Shopify knowledge
- 14 phone-related attribute name patterns cover Spanish (telefono, celular, numero, movil) and English (phone, whatsapp, mobile, tel) COD form conventions
- Only applied in AUTO-SYNC block where contacts are created/resolved; trigger-only mode and draft orders are skipped in v1

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- secondary_phone is now available on contacts from Shopify orders with COD form data
- Plan 02 can implement the phone fallback chain in resolveWhatsAppContext (action-executor.ts)
- No blockers

---
*Phase: standalone/whatsapp-phone-resilience*
*Completed: 2026-02-17*
