---
phase: standalone-robot-godentist
plan: 04
subsystem: godentist-confirm-appointment
tags: [godentist, whatsapp, server-action, ui-button]
depends_on: ["03"]
provides: ["confirm-appointment-ui", "confirm-appointment-action"]
affects: []
tech_stack:
  added: []
  patterns: ["workspace-conditional-ui", "phone-normalization"]
key_files:
  created: []
  modified:
    - src/app/actions/godentist.ts
    - src/app/(dashboard)/whatsapp/components/chat-header.tsx
metrics:
  tasks: 2/2
  duration: ~8min
  completed: 2026-03-11
---

# Standalone Robot GoDentist Plan 04: Confirm Appointment UI Summary

Server actions and WhatsApp chat header button for confirming GoDentist appointments from the CRM.

## What Was Done

### Task 1: Server Actions (51520eb)
Added two server actions to `src/app/actions/godentist.ts`:

- **`getAppointmentForContact(contactPhone)`**: Looks up latest scrape history, matches contact by normalized phone, returns appointment info (nombre, hora, sucursal, estado, scraped_date) or null.
- **`confirmAppointment(contactPhone, contactName)`**: Validates auth, looks up latest scrape, validates estado (rejects already confirmed/cancelled), converts date YYYY-MM-DD to DD-MM-YYYY, calls robot `/api/confirm-appointment` endpoint, returns structured result.

Phone normalization: strips leading "+" to handle mismatch between conversation phone (+573005090030) and scrape data (573005090030).

### Task 2: Chat Header Button (f64b200)
Added "Confirmar cita" button to `src/app/(dashboard)/whatsapp/components/chat-header.tsx`:

- Only renders when `workspace_id === GODENTIST_WORKSPACE_ID` (hardcoded)
- Loads appointment info via `getAppointmentForContact` on conversation change
- Button states: hidden (no appointment), active (sin confirmar), disabled (already confirmed), loading (confirming)
- Calls `confirmAppointment` server action on click
- Toast feedback on success/failure
- Optimistic local state update after successful confirmation

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Hardcoded GoDentist workspace ID | Only one GoDentist workspace exists; no need for dynamic config |
| Button before AssignDropdown | Prominent placement without disrupting existing action flow |
| Phone normalization via strip "+" | Simplest approach that handles the known format mismatch |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (only pre-existing vitest errors unrelated to changes)
- Button only visible for GoDentist workspace ID
- Button hidden when no appointment found
- Button disabled when already confirmed
- Phone normalization handles +57 vs 57 format

## Next Steps

- Test end-to-end: open GoDentist workspace conversation, verify button appears, click to confirm
- Monitor robot confirm-appointment endpoint for successful estado changes
