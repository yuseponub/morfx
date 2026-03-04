-- Formalize the settings JSONB column on workspaces table
-- This column already exists in production (added manually).
-- Using ADD COLUMN IF NOT EXISTS for idempotent re-run safety.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Index for webhook routing: lookup workspace by phone_number_id in settings
-- This enables fast lookup instead of full table scan
CREATE INDEX IF NOT EXISTS idx_workspaces_phone_number_id
  ON workspaces ((settings->>'whatsapp_phone_number_id'))
  WHERE settings->>'whatsapp_phone_number_id' IS NOT NULL;

COMMENT ON COLUMN workspaces.settings IS 'Per-workspace configuration. Keys: whatsapp_api_key, whatsapp_phone_number_id';
