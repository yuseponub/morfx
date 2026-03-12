-- GoDentist Scheduled Reminders
-- Stores programmed WhatsApp reminder sends for appointments
CREATE TABLE IF NOT EXISTS godentist_scheduled_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scrape_history_id UUID REFERENCES godentist_scrape_history(id) ON DELETE SET NULL,
  -- Appointment data
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  hora_cita TEXT NOT NULL,
  sucursal TEXT NOT NULL,
  fecha_cita TEXT NOT NULL,
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  inngest_event_id TEXT,
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error TEXT,
  -- Timestamps
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

-- Index for listing pending reminders by workspace
CREATE INDEX IF NOT EXISTS idx_godentist_reminders_workspace_status
  ON godentist_scheduled_reminders(workspace_id, status)
  WHERE status = 'pending';

-- Index for Inngest function lookup by event ID
CREATE INDEX IF NOT EXISTS idx_godentist_reminders_inngest_event
  ON godentist_scheduled_reminders(inngest_event_id)
  WHERE inngest_event_id IS NOT NULL;
