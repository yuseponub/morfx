---
phase: godentist-followup-ultimatum
plan: 01
subsystem: messaging
tags: [inngest, whatsapp, godentist, cron, supabase]

requires:
  - phase: godentist-scraping-general
    provides: "godentist_scrape_history table, godentistReminderFunctions, sendTemplateMessage domain"
provides:
  - "godentist/followup.check Inngest event type"
  - "godentistFollowupCheck Inngest function (2pm ultimatum)"
  - "followup_results + followup_sent_at columns on godentist_scrape_history"
affects: [godentist-followup-ultimatum-02, godentist-followup-ultimatum-03]

tech-stack:
  added: []
  patterns:
    - "Inngest sleepUntil for scheduled followup checks"
    - "Inbound message detection to skip responded patients"

key-files:
  created:
    - supabase/migrations/20260316_godentist_followup_columns.sql
  modified:
    - src/inngest/events.ts
    - src/inngest/functions/godentist-reminders.ts

key-decisions:
  - "Local SendResult interface instead of importing from server action (avoids coupling)"
  - "Fetch sent_at and appointments ONCE outside patient loop (optimized)"
  - "Skip cancelled appointments by checking estado field"

patterns-established:
  - "Followup pattern: load sent patients, check inbound messages, send template to non-responders"

duration: 8min
completed: 2026-03-16
---

# Plan 01: GoDentist Followup Ultimatum - Migration + Inngest Function Summary

**Inngest followup function that sleeps until 2pm, checks patient responses since morning confirmation, and sends conservacion_cita template to non-responders**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T15:43:12Z
- **Completed:** 2026-03-16T15:51:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Migration adding followup_results JSONB and followup_sent_at columns to godentist_scrape_history
- godentist/followup.check event type in GodentistEvents
- godentistFollowupCheck Inngest function: sleepUntil 2pm, loads patients with status='sent', checks for inbound messages after sent_at, sends conservacion_cita to non-responders, skips responded and cancelled, saves results

## Task Commits

1. **Task 1: Migration + Event Type** - `191c709` (feat)
2. **Task 2: Inngest Followup Function** - `48222ca` (feat)

## Files Created/Modified
- `supabase/migrations/20260316_godentist_followup_columns.sql` - Adds followup_results and followup_sent_at columns
- `src/inngest/events.ts` - Added godentist/followup.check event to GodentistEvents
- `src/inngest/functions/godentist-reminders.ts` - Added godentistFollowupCheck function and updated exports

## Decisions Made
- Used local SendResult and ScrapedAppointment interfaces to avoid importing from server action files
- Fetched sent_at and appointments once outside the patient loop for optimization
- Cancelled appointments (estado includes 'cancelada') are skipped, not failed

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
**Migration must be applied in production before deploying code:**
```sql
-- Run in Supabase SQL editor:
ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS followup_results JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ DEFAULT NULL;
```

## Next Phase Readiness
- Inngest function ready, event type defined
- Plan 02 will wire the event emission from the scrape+send flow
- Plan 03 will add the conservacion_cita WhatsApp template approval

---
*Phase: godentist-followup-ultimatum*
*Completed: 2026-03-16*
