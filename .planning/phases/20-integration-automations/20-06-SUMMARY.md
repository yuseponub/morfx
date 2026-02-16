---
phase: 20-integration-automations
plan: 06
subsystem: wizard-ui
tags: [shopify, twilio, wizard, trigger-step, actions-step, sms]
dependency-graph:
  requires: ["20-01"]
  provides: ["Shopify trigger category in wizard", "Twilio action category in wizard", "send_sms param UI", "Twilio config validation"]
  affects: ["20-07"]
tech-stack:
  added: []
  patterns: ["ACTION_CATEGORY_CONFIG for action card icons/colors", "PARAM_HELP_TEXT for per-action param hints", "Server action integration check from client component via useEffect"]
key-files:
  created: []
  modified:
    - src/app/(dashboard)/automatizaciones/components/trigger-step.tsx
    - src/app/(dashboard)/automatizaciones/components/actions-step.tsx
    - src/app/actions/automations.ts
decisions:
  - id: "20-06-01"
    decision: "ACTION_CATEGORY_CONFIG with icons and colors for all action categories, not just Twilio"
    reason: "Consistent visual hierarchy across all action types in selector and cards"
  - id: "20-06-02"
    decision: "checkTwilioConfigured server action in automations.ts instead of separate twilio actions file"
    reason: "Reuses existing getAuthContext helper and keeps wizard-related server actions co-located"
  - id: "20-06-03"
    decision: "Twilio warning is non-blocking (user can save automation, fails at runtime)"
    reason: "Matches CONTEXT.md guidance and allows automation setup before integration configuration"
metrics:
  duration: ~6 minutes
  completed: 2026-02-16
---

# Phase 20 Plan 06: Wizard UI Extension Summary

Shopify trigger category and Twilio action category added to automation builder wizard with full parameter UI and configuration validation.

## What Was Done

### Task 1: Add Shopify category to trigger step wizard
- Imported `ShoppingBag` icon from lucide-react
- Added Shopify entry to `CATEGORY_CONFIG` with purple color (`text-purple-600 bg-purple-50`)
- Extended `CATEGORIES` array to include `'Shopify'`
- Type `TriggerCategory` auto-extends via `keyof typeof CATEGORY_CONFIG`
- 3 Shopify triggers from TRIGGER_CATALOG (Plan 01) auto-render under the Shopify category

### Task 2: Add Twilio category and send_sms params to actions step wizard
- Imported `Phone` icon from lucide-react plus additional category icons
- Created `ACTION_CATEGORY_CONFIG` with icons and colors for all 6 action categories (CRM, Ordenes, WhatsApp, Tareas, Integraciones, Twilio)
- Added category icons to ActionSelector popover headers and ActionCard headers
- Created `PARAM_HELP_TEXT` system for per-action-type, per-param help text
- Added help text rendering to text and textarea param fields
- send_sms `to` field shows: "Dejar vacio para usar el telefono del contacto del trigger"
- send_sms `mediaUrl` field shows: "MMS solo disponible para numeros de US/Canada"
- Added variable resolution hint below textarea fields: "Variables como {{contacto.nombre}} se resuelven al ejecutarse"
- Created `checkTwilioConfigured` server action in automations.ts
- Added `useEffect` in ActionsStep to check Twilio config when a Twilio action is present
- Shows amber warning banner when Twilio not configured (non-blocking)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added checkTwilioConfigured server action to automations.ts**
- **Found during:** Task 2
- **Issue:** Plan required Twilio config validation but no server action existed to check integration status from client component
- **Fix:** Added `checkTwilioConfigured()` to existing `src/app/actions/automations.ts` using existing `getAuthContext()` helper
- **Files modified:** `src/app/actions/automations.ts`
- **Commit:** e4f6ab3

**2. [Rule 2 - Missing Critical] Added ACTION_CATEGORY_CONFIG for all categories**
- **Found during:** Task 2
- **Issue:** Trigger step had CATEGORY_CONFIG with icons/colors but actions step had no equivalent. Adding Twilio icon only without other categories would be inconsistent.
- **Fix:** Created comprehensive ACTION_CATEGORY_CONFIG for all 6 action categories with appropriate icons and colors
- **Files modified:** `src/app/(dashboard)/automatizaciones/components/actions-step.tsx`
- **Commit:** e4f6ab3

## Commits

| Hash | Message |
|------|---------|
| 351bb18 | feat(20-06): add Shopify category to trigger step wizard |
| e4f6ab3 | feat(20-06): add Twilio category and send_sms params to actions step wizard |

## Verification Results

- `npx tsc --noEmit` -- no type errors for trigger-step.tsx or actions-step.tsx
- `grep Shopify trigger-step.tsx` -- category present in CATEGORY_CONFIG and CATEGORIES
- `grep Twilio actions-step.tsx` -- category present in ACTION_CATEGORY_CONFIG, warning banner, and config check
- `grep ShoppingBag trigger-step.tsx` -- icon imported and used
- `grep Phone actions-step.tsx` -- icon imported and used in Twilio config

## Next Phase Readiness

Plan 20-07 (Settings UI for Twilio + Shopify configuration) can proceed. This plan provides:
- Twilio action in wizard with non-blocking warning when not configured
- The warning references "Configuracion > Integraciones" which Plan 20-07 will create
