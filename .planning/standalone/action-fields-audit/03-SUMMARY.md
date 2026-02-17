---
phase: standalone/action-fields-audit
plan: 03
subsystem: automations
tags: [action-catalog, wizard-ui, field-select, optional-fields, add-field-dropdown]
depends_on: ["01", "02"]
provides:
  - Complete ACTION_CATALOG with all domain-supported params
  - "Agregar campo" dropdown UX for optional fields
  - field_select type for entityType-aware field picker
  - Generic OPTION_LABELS handler for select options
affects:
  - AI Builder system prompt (plan 04 will reference new catalog entries)
  - Any future action type additions follow same optional/field_select patterns
tech-stack:
  patterns:
    - "optional: true flag on catalog params for 'Agregar campo' dropdown grouping"
    - "field_select param type for entity-aware dynamic field selection"
    - "OPTION_LABELS constant for humanized select option rendering"
key-files:
  modified:
    - src/lib/automations/constants.ts
    - src/app/(dashboard)/automatizaciones/components/actions-step.tsx
decisions:
  - id: optional-flag-pattern
    description: "Params with optional: true are hidden behind 'Agregar campo' dropdown; always-visible params omit the flag"
  - id: generic-options-handler
    description: "Single select handler with OPTION_LABELS replaces per-param entityType handler; works for entityType, priority, language"
  - id: field-select-custom-fallback
    description: "field_select includes '__custom' option for fields not in the predefined list"
metrics:
  duration: "~7 min"
  completed: 2026-02-17
---

# Phase action-fields-audit Plan 03: UI Catalog and Wizard Summary

**Complete ACTION_CATALOG with all missing params + "Agregar campo" dropdown UX for optional fields + entityType-aware field_select for update_field.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~7 minutes |
| Tasks | 2/2 |
| Files modified | 2 |
| Deviations | 0 |

## Accomplishments

1. **ACTION_CATALOG completeness:** All 6 action types updated with missing params:
   - `remove_tag`: entityType selector (contact/order)
   - `update_field`: entityType (required), fieldName as field_select, value with supportsVariables
   - `create_order`: 9 optional params (name, closingDate, shipping*, carrier, trackingNumber, copyProducts, copyTags)
   - `create_task`: priority dropdown (low/medium/high/urgent)
   - `send_whatsapp_template`: language selector (es/en/pt)
   - `send_whatsapp_media`: filename field

2. **"Agregar campo" dropdown:** Optional params (marked `optional: true`) are hidden behind a clean dropdown button. Users click "Agregar campo" to pick which optional fields to configure. Active optional fields can be removed with a trash button, which also clears their value.

3. **field_select type:** New param type for update_field that shows a dynamic dropdown of valid fields based on the selected entityType. Contact fields: name, phone, email, address, city, department. Order fields: name, description, shipping_address, shipping_city, shipping_department, carrier, tracking_number, closing_date, contact_id. Includes a "__custom" fallback for user-defined fields.

4. **Generic OPTION_LABELS handler:** Replaced the entityType-specific select handler with a generic one that maps option values to human-readable labels (Contacto, Orden, Baja, Media, Alta, Urgente, Espanol, Ingles, Portugues). Works for any select param with options.

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Update ACTION_CATALOG with all missing params | `64bc4cb` | `src/lib/automations/constants.ts` |
| 2 | Implement "Add field" dropdown + field_select type | `ce2b31c` | `src/app/(dashboard)/automatizaciones/components/actions-step.tsx` |

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/automations/constants.ts` | Added entityType to remove_tag, entityType+field_select to update_field, 9 optional params to create_order, priority to create_task, language to send_whatsapp_template, filename to send_whatsapp_media |
| `src/app/(dashboard)/automatizaciones/components/actions-step.tsx` | Added OPTION_LABELS constant, field_select handler, activeOptionals state in ActionCard, "Agregar campo" Popover dropdown, generic options select handler |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `optional: true` flag pattern | Clean separation: required params always visible, optional behind dropdown. Keeps UI uncluttered for simple cases while making all fields accessible. |
| Generic OPTION_LABELS handler | Single handler for all select-with-options params (entityType, priority, language) eliminates repeated per-param code |
| field_select with __custom fallback | Predefined field list covers common fields; custom option handles edge cases and future fields without code changes |
| create_order description not optional | Description and stageId kept always-visible as they're commonly used; only truly optional shipping/copy fields hidden behind dropdown |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification Results

- `npx tsc --noEmit`: Zero errors
- ACTION_CATALOG has all previously missing params (entityType, field_select, priority, language, filename, optional fields)
- "Agregar campo" renders for create_order optional fields
- update_field shows entityType-aware field dropdown via field_select
- remove_tag shows entityType selector via generic options handler
- All new fields render correctly through existing param type handlers

## Next Phase Readiness

- Plans 01-03 complete: executor field pass-through, duplicate_order toggles, UI catalog + wizard
- Plan 04 remaining: AI Builder system prompt update with complete field knowledge
- All field gaps from research are now closed at the executor + UI layers
