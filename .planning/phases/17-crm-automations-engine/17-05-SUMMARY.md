---
phase: 17-crm-automations-engine
plan: 05
subsystem: ui
tags: [react, wizard, forms, shadcn, tailwind, automation-builder]

# Dependency graph
requires:
  - phase: 17-01
    provides: Type system, catalogs (TRIGGER_CATALOG, ACTION_CATALOG, VARIABLE_CATALOG), constants
  - phase: 17-03
    provides: Server actions (createAutomation, updateAutomation, getAutomation)
provides:
  - 3-step automation wizard UI (trigger, conditions, actions)
  - Page routes for creating and editing automations
  - Variable picker with trigger-aware variable insertion
  - AND/OR condition group builder with 1 level nesting
  - Sequential action builder with all 11 action types and dynamic params
affects: [17-06, 17-07, 17-08, 17-10]

# Tech tracking
tech-stack:
  added: []
  patterns: [wizard-step-pattern, catalog-driven-forms, dynamic-param-rendering]

key-files:
  created:
    - src/app/(dashboard)/automatizaciones/components/automation-wizard.tsx
    - src/app/(dashboard)/automatizaciones/components/trigger-step.tsx
    - src/app/(dashboard)/automatizaciones/components/conditions-step.tsx
    - src/app/(dashboard)/automatizaciones/components/actions-step.tsx
    - src/app/(dashboard)/automatizaciones/components/variable-picker.tsx
    - src/app/(dashboard)/automatizaciones/nueva/page.tsx
    - src/app/(dashboard)/automatizaciones/[id]/editar/page.tsx
  modified: []

key-decisions:
  - "Wizard state managed via useState in container, passed down as props to step components"
  - "Trigger selection resets conditions when trigger type changes (variables differ per trigger)"
  - "KeywordsInput component for tags-type config fields with Enter-to-add and click-to-remove"
  - "ConditionGroupEditor supports 1 level of nesting (depth < 1 check)"
  - "ActionSelector uses Popover grouped by category for selecting action types"
  - "KeyValueEditor sub-component for headers and WhatsApp template variables"
  - "readonly string[] cast for as-const options to avoid TypeScript mutable/readonly mismatch"

patterns-established:
  - "Catalog-driven forms: UI components read from TRIGGER_CATALOG and ACTION_CATALOG to dynamically render options"
  - "Dynamic param field rendering: ActionParamField maps param.type to appropriate UI control"
  - "Wizard step pattern: container manages state+navigation, step components receive formData+onChange"

# Metrics
duration: 10min
completed: 2026-02-13
---

# Phase 17 Plan 05: Automation Builder Wizard UI Summary

**3-step wizard (trigger, conditions, actions) with catalog-driven forms, AND/OR condition groups, and all 11 action types with dynamic params and variable picker**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-13T02:39:25Z
- **Completed:** 2026-02-13T02:49:25Z
- **Tasks:** 2
- **Files created:** 7

## Accomplishments
- Complete 3-step wizard for creating/editing automations with step navigation and state preservation
- Trigger step renders all 10 triggers from TRIGGER_CATALOG with config fields (pipeline, stage, tag, keywords, text)
- Conditions step with AND/OR group builder, 12 operators, nested sub-groups, and field picker from VARIABLE_CATALOG
- Actions step supporting all 11 action types with dynamic param forms (select, text, textarea, boolean, delay, key_value, json)
- Variable picker popover showing trigger-specific variables with click-to-insert
- Page routes for /nueva (create) and /[id]/editar (edit) loading pipelines and tags server-side

## Task Commits

Each task was committed atomically:

1. **Task 1: Wizard container, trigger step, variable picker, page routes** - `d8fa899` (feat)
2. **Task 2: Conditions step and actions step** - `df51599` (feat)

## Files Created
- `src/app/(dashboard)/automatizaciones/components/automation-wizard.tsx` - Multi-step wizard container with step indicator, name/description inputs, back/next/save navigation
- `src/app/(dashboard)/automatizaciones/components/trigger-step.tsx` - Step 1: 10 triggers grouped by CRM/WhatsApp/Tareas as selectable cards with config fields
- `src/app/(dashboard)/automatizaciones/components/conditions-step.tsx` - Step 2: AND/OR condition group builder with 12 operators, 1-level nesting, field selector
- `src/app/(dashboard)/automatizaciones/components/actions-step.tsx` - Step 3: 11 action types with dynamic params, delays, reorder, variable picker integration
- `src/app/(dashboard)/automatizaciones/components/variable-picker.tsx` - Popover showing trigger-aware variables from VARIABLE_CATALOG
- `src/app/(dashboard)/automatizaciones/nueva/page.tsx` - Server component loading pipelines + tags for create wizard
- `src/app/(dashboard)/automatizaciones/[id]/editar/page.tsx` - Server component loading automation data for edit wizard

## Decisions Made
- Wizard state managed via useState in container, passed as props (not context) since only 3 components deep
- Trigger type change resets conditions to null because variables differ per trigger
- KeywordsInput as standalone sub-component with Enter-to-add for whatsapp.keyword_match config
- 1 level of condition group nesting enforced (depth < 1 check) matching plan spec
- ActionSelector popover instead of dropdown for better UX showing description per action
- readonly string[] cast for as-const tuple options to satisfy TypeScript strictness

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript TS2367: VARIABLE_CATALOG arrays are `as const` with known non-zero lengths, making `length === 0` comparison flagged as impossible. Fixed by typing variable as `readonly { path: string; label: string }[]` to widen the type.
- TypeScript TS2352: `param.options` from `as const` ACTION_CATALOG is `readonly ["contact", "order"]` which cannot be assigned to mutable `string[]`. Fixed with `as readonly string[]`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wizard UI complete, ready for Plan 06 (Inngest Runner) and Plan 07 (List page)
- The list page (Plan 07/08) can link to /automatizaciones/nueva and /automatizaciones/[id]/editar
- No blockers

---
*Phase: 17-crm-automations-engine*
*Completed: 2026-02-13*
