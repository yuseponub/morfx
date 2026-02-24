-- ============================================================================
-- Resilience v2: Retry tracking columns + expanded status flow
-- Adds retry_count and reprocessed_at to whatsapp_webhook_events
-- Expands status CHECK to include 'reprocessed' and 'dead_letter'
-- ============================================================================

-- Add retry tracking columns
ALTER TABLE whatsapp_webhook_events
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reprocessed_at TIMESTAMPTZ;

-- Drop existing CHECK constraint (inline CHECK auto-named by PostgreSQL)
ALTER TABLE whatsapp_webhook_events
  DROP CONSTRAINT IF EXISTS whatsapp_webhook_events_status_check;

-- Create new CHECK constraint with expanded status values
ALTER TABLE whatsapp_webhook_events
  ADD CONSTRAINT whatsapp_webhook_events_status_check
  CHECK (status IN ('pending', 'processed', 'failed', 'reprocessed', 'dead_letter'));

-- Partial index for efficient replay queries (failed events with retries remaining)
CREATE INDEX IF NOT EXISTS idx_wa_webhook_events_replayable
  ON whatsapp_webhook_events(status, retry_count, created_at ASC)
  WHERE status = 'failed' AND retry_count < 3;
