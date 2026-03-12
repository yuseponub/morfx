-- Fix double timezone conversion bug
-- created_at used timezone('America/Bogota', NOW()) which produces a naive timestamp
-- that TIMESTAMPTZ then interprets as UTC, causing -5h double offset on display.
-- Fix: use NOW() directly (TIMESTAMPTZ stores absolute moment, frontend handles display)

-- Fix defaults for future rows
ALTER TABLE godentist_scrape_history
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE godentist_scheduled_reminders
  ALTER COLUMN created_at SET DEFAULT NOW();

-- Fix existing rows: add 5 hours to correct the double-offset
UPDATE godentist_scrape_history
  SET created_at = created_at + INTERVAL '5 hours'
  WHERE created_at IS NOT NULL;

UPDATE godentist_scheduled_reminders
  SET created_at = created_at + INTERVAL '5 hours'
  WHERE created_at IS NOT NULL;
