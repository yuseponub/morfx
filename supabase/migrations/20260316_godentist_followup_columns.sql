-- GoDentist Followup Ultimatum: Add followup tracking columns
-- Standalone: godentist-followup-ultimatum, Plan 01, Task 1
--
-- Adds columns to track the 2pm followup check results:
-- - followup_results: JSONB with per-patient status (sent/skipped/failed)
-- - followup_sent_at: Timestamp of when followup was executed

ALTER TABLE godentist_scrape_history
  ADD COLUMN IF NOT EXISTS followup_results JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ DEFAULT NULL;
