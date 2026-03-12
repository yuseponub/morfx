---
phase: standalone/godentist-scraping-general
plan: 01
subsystem: godentist
tags: [inngest, whatsapp-template, scheduled-reminders, robot, scraping]
dependency-graph:
  requires: [standalone/robot-godentist-integration]
  provides: [targetDate-scraping, scheduled-reminders-table, inngest-reminder-function]
  affects: [standalone/godentist-scraping-general-02]
tech-stack:
  added: []
  patterns: [inngest-sleepUntil, domain-layer-from-inngest]
key-files:
  created:
    - godentist/robot-godentist/src/types/index.ts (modified - targetDate field)
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts (modified - targetDate param)
    - godentist/robot-godentist/src/api/server.ts (modified - pass targetDate)
    - supabase/migrations/20260312100000_godentist_scheduled_reminders.sql
    - src/inngest/functions/godentist-reminders.ts
  modified:
    - src/inngest/events.ts (GodentistEvents type)
    - src/app/api/inngest/route.ts (register godentistReminderFunctions)
decisions:
  - id: gsg01-d1
    decision: "Use step.sleepUntil + DB status check pattern for cancellation (not Inngest cancel events)"
    reason: "Simpler, DB is source of truth, no need for Inngest cancel event plumbing"
  - id: gsg01-d2
    decision: "Template name recordatorio_cita_godentist as placeholder"
    reason: "Template not yet created in WhatsApp Business, will be updated when ready"
metrics:
  duration: ~20min
  completed: 2026-03-12
---

# Standalone GoDentist Scraping General - Plan 01: Backend Foundation

Robot targetDate support, DB migration for scheduled reminders, Inngest sleep-until-send reminder function with WhatsApp template delivery.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1a | Robot targetDate support | `40b2b2d` | godentist adapter, types, server |
| 1b | DB migration + Inngest event type | `c28d3f4` | migration SQL, events.ts |
| -- | Checkpoint: migration applied | -- | User confirmed |
| 2 | Inngest reminder function + route | `d26f151` | godentist-reminders.ts, route.ts |

## What Was Built

### Robot targetDate Support (Task 1a)
- `ScrapeAppointmentsRequest.targetDate?: string` (YYYY-MM-DD)
- `scrapeAppointments()` accepts optional targetDate, falls back to getNextWorkingDay()
- Server endpoint passes body.targetDate through to adapter

### DB Migration (Task 1b)
- `godentist_scheduled_reminders` table with columns: nombre, telefono, hora_cita, sucursal, fecha_cita, scheduled_at, inngest_event_id, status, error, sent_at
- Partial index on (workspace_id, status) WHERE status = 'pending'
- Index on inngest_event_id for function lookup

### Inngest Event Type (Task 1b)
- `GodentistEvents` type with `godentist/reminder.send` event
- Added to `AllAgentEvents` union for type safety

### Inngest Reminder Function (Task 2)
- `godentist-reminder-send`: sleepUntil(scheduledAt), checks pending status, sends template
- Contact creation via `createContact` domain function (handles "Ya existe" gracefully)
- Conversation find/create via `findOrCreateConversation`
- Tag assignment per sucursal (CAB, FLO, JUM, MEJ)
- WhatsApp template with 5 body params: nombre, sucursal, fecha, hora, direccion
- DB status update to 'sent' or 'failed' with error tracking
- Helper functions: toTitleCase, formatDateSpanish

## Decisions Made

1. **sleepUntil + DB check pattern** — Instead of using Inngest cancel events, the function sleeps until scheduledAt then checks if status is still 'pending'. Simpler and DB remains source of truth.
2. **Template placeholder** — Using `recordatorio_cita_godentist` as template name (not yet created in WA Business).

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (only pre-existing vitest test file errors)
- godentistReminderFunctions registered in serve() route
- Migration applied in production before code deployment (Regla 5 compliant)

## Next Steps (Plan 02)

- Server actions: scheduleReminders, getScheduledReminders, cancelScheduledReminder
- Frontend: date picker, action choice UI, Programacion tab
- Timezone fixes across existing GoDentist UI
