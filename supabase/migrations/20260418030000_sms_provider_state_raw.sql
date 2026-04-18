-- SMS Module: Persist raw provider state for observability
-- Adds provider_state_raw column to sms_messages so failed deliveries
-- keep the actual textual error returned by Onurix (e.g. "Error:1081 msg: Destino inaccesible")
-- instead of losing it behind a generic status='failed'.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sms_messages' AND column_name = 'provider_state_raw'
  ) THEN
    ALTER TABLE sms_messages ADD COLUMN provider_state_raw TEXT;
    COMMENT ON COLUMN sms_messages.provider_state_raw IS
      'Raw state string returned by provider (e.g. Onurix /messages-state). '
      'For Onurix: "Enviado", "Error:1081 msg: Destino inaccesible", etc. '
      'Persisted by sms-delivery-check inngest on each state check.';
  END IF;
END $$;
