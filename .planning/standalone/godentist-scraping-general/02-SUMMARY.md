---
phase: standalone/godentist-scraping-general
plan: 02
subsystem: godentist
tags: [server-actions, inngest, scheduled-reminders, timezone]
dependency-graph:
  requires: [standalone/godentist-scraping-general-01]
  provides: [scheduleReminders, getScheduledReminders, cancelScheduledReminder, targetDate-passthrough]
  affects: [standalone/godentist-scraping-general-03]
tech-stack:
  added: []
  patterns: [inngest-send-from-server-action, colombia-tz-utc-conversion]
key-files:
  created: []
  modified:
    - src/app/actions/godentist.ts
decisions:
  - id: gsg02-d1
    decision: "Skip cancelled appointments and appointments < 15min from now"
    reason: "Cancelled appointments should not receive reminders; too-close appointments would fire immediately defeating the purpose"
  - id: gsg02-d2
    decision: "Store scrape_history_id on reminder rows when available"
    reason: "Links reminders to their source scrape for traceability"
metrics:
  duration: ~5min
  completed: 2026-03-12
---

# Standalone GoDentist Scraping General - Plan 02: Server Actions Summary

Server actions for scheduling WhatsApp reminders 1 hour before GoDentist appointments, with Colombia timezone math, listing, and cancellation.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Server actions for reminder scheduling, listing, and cancellation | `afcb233` | src/app/actions/godentist.ts |

## What Was Built

### scrapeAppointments Update
- Added optional `targetDate?: string` parameter
- Passes targetDate to robot in fetch body

### Timezone Helpers (file-level, not exported)
- `parseHora()`: Parses "8:00 AM", "2:30 PM", "14:30" formats
- `calculateScheduledAt()`: Converts Colombia appointment time to UTC reminder time (1h before)
  - Adds 5 hours (UTC-5 to UTC), then subtracts 1 hour for reminder offset

### scheduleReminders Action
- Auth + workspace check (same pattern as sendConfirmations)
- For each appointment: calculates scheduledAt, validates not too close, inserts DB row, sends Inngest event
- Skips cancelled appointments and those with scheduledAt < now + 15min
- Returns ScheduleResult with total/scheduled/skipped counts and per-appointment details
- Uses `(inngest as any).send()` pattern for type assertion

### getScheduledReminders Action
- Returns up to 50 reminders for workspace, ordered by scheduled_at DESC
- All fields exposed: id, nombre, telefono, hora_cita, sucursal, fecha_cita, scheduled_at, status, error, sent_at, created_at

### cancelScheduledReminder Action
- Updates status to 'cancelled' WHERE id AND workspace_id AND status = 'pending'
- Inngest function checks status before sending, so marking cancelled is sufficient

## Decisions Made

1. **Skip threshold at 15 minutes** -- Appointments too close to now are skipped because the Inngest sleepUntil would fire almost immediately, potentially before the user reviews the schedule.
2. **scrape_history_id link** -- Reminder rows optionally link to their source scrape history for audit trail.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (only pre-existing vitest test file errors)
- All 3 new server actions exported: scheduleReminders, getScheduledReminders, cancelScheduledReminder
- Both new types exported: ScheduleResult, ScheduledReminderEntry
- scrapeAppointments accepts optional targetDate

## Next Steps (Plan 03)

- Frontend UI: date picker, action choice (confirm/remind), Programacion tab
- Wire server actions to UI components
