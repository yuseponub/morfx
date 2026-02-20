-- ============================================================================
-- Resiliencia Webhook WhatsApp: Store-Before-Process
-- Persiste el raw payload ANTES de procesar para recovery/replay si falla
-- ============================================================================

CREATE TABLE whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Clasificacion del evento
  event_type TEXT NOT NULL CHECK (event_type IN ('message', 'status', 'mixed')),

  -- Identificadores WhatsApp para correlacion
  phone_number_id TEXT NOT NULL,
  wa_message_ids TEXT[],

  -- Payload completo para replay
  payload JSONB NOT NULL,

  -- Estado de procesamiento
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,

  -- Timestamps (America/Bogota timezone)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Indices
CREATE INDEX idx_wa_webhook_events_workspace ON whatsapp_webhook_events(workspace_id);
CREATE INDEX idx_wa_webhook_events_status ON whatsapp_webhook_events(status);
CREATE INDEX idx_wa_webhook_events_created ON whatsapp_webhook_events(created_at DESC);
CREATE INDEX idx_wa_webhook_events_failed ON whatsapp_webhook_events(status, created_at DESC)
  WHERE status = 'failed';

-- RLS
ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Solo lectura para miembros del workspace (debugging UI futuro)
CREATE POLICY "wa_webhook_events_member_select"
  ON whatsapp_webhook_events FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT/UPDATE via service role (admin client desde webhook handler)

COMMENT ON TABLE whatsapp_webhook_events IS 'Raw WhatsApp webhook payloads stored before processing for resilience and replay';
