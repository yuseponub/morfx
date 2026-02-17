---
phase: standalone/action-fields-audit
plan: 04
subsystem: automations
tags: [ai-builder, system-prompt, dynamic-catalog, param-reference]
depends_on: ["03"]
provides:
  - Dynamic param quick reference in AI builder system prompt
  - Complete field documentation for all action types
  - Usage notes for entityType, optional create_order fields, priority, language, filename
affects:
  - AI builder can now suggest all available fields when creating automations
  - Future ACTION_CATALOG changes automatically reflected in system prompt
tech-stack:
  patterns:
    - "formatParamQuickReference() generates quick reference from ACTION_CATALOG at runtime"
    - "Usage notes section documents field semantics and valid values"
key-files:
  modified:
    - src/lib/builder/system-prompt.ts
decisions:
  - id: dynamic-over-hardcoded
    description: "Replaced hardcoded param reference with dynamically generated one from ACTION_CATALOG to prevent drift"
  - id: usage-notes-section
    description: "Added structured 'Notas importantes' section for fields that need context beyond just name/type"
metrics:
  duration: "~4 min"
  completed: 2026-02-17
---

# Phase action-fields-audit Plan 04: AI Builder System Prompt Summary

**Dynamic param quick reference from ACTION_CATALOG + structured usage notes for entityType, create_order optional fields, priority, language, and filename.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~4 minutes |
| Tasks | 1/1 |
| Files modified | 1 |
| Deviations | 0 |

## Accomplishments

1. **Dynamic param quick reference:** Replaced the hardcoded 11-line param reference with `formatParamQuickReference()` that generates it from `ACTION_CATALOG` at runtime. This eliminates the drift problem -- any future changes to the catalog are automatically reflected in the builder's system prompt.

2. **Complete field visibility for the builder:** The generated reference now includes ALL params for all 12 action types:
   - `remove_tag` now shows `entityType` (was completely missing before)
   - `update_field` now shows `entityType` as required, `fieldName`, `value`
   - `create_order` shows all 12 params including `name`, `closingDate`, `carrier`, `trackingNumber`
   - `create_task` shows `priority`
   - `send_whatsapp_template` shows `language`
   - `send_whatsapp_media` shows `filename`

3. **Structured usage notes:** Added a "Notas importantes sobre parametros especificos" section that provides:
   - entityType semantics for assign_tag, remove_tag, and update_field
   - Valid contact fields vs order fields for update_field
   - All create_order optional fields with descriptions
   - Valid values for priority (low/medium/high/urgent)
   - Valid values for language (es/en/pt)
   - filename recommendation for document media

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Dynamic param reference + usage notes | `9e057e1` | `src/lib/builder/system-prompt.ts` |

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/builder/system-prompt.ts` | Added `formatParamQuickReference()` function, replaced hardcoded param list with dynamic call, added "Notas importantes" section with field-specific documentation |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Dynamic generation over hardcoded | Single source of truth (ACTION_CATALOG) prevents future drift between catalog and prompt |
| Usage notes as separate section | Param names alone are not enough -- the builder needs to understand valid values, defaults, and relationships between fields |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification Results

- `npx tsc --noEmit`: Zero errors
- Dynamic reference includes all 6 key fields: carrier, trackingNumber, priority, language, filename, entityType
- Hardcoded param list removed, replaced with `${formatParamQuickReference()}` call
- Usage notes document field semantics, valid values, and defaults
- All 12 action types have complete param listings

## Next Phase Readiness

- All 4 plans in action-fields-audit are now complete:
  - Plan 01: Executor field pass-through fixes
  - Plan 02: Duplicate order toggle fixes
  - Plan 03: UI catalog + wizard ("Agregar campo" dropdown, field_select, OPTION_LABELS)
  - Plan 04: AI builder system prompt (dynamic reference + usage notes)
- The full 4-layer audit is closed: Domain -> Executor -> Wizard UI -> AI Builder
- Every field the system accepts is now reachable and documented at every layer
