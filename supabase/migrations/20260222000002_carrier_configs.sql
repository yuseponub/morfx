-- ============================================================================
-- Carrier Configs
-- Workspace-scoped portal credentials for carrier integrations (Coordinadora, etc.)
-- Each workspace can store one config per carrier with username/password.
-- ============================================================================

-- 1. Create carrier_configs table
CREATE TABLE carrier_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL DEFAULT 'coordinadora',
  portal_username TEXT,
  portal_password TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, carrier)
);

-- Document plaintext storage decision
COMMENT ON COLUMN carrier_configs.portal_password IS 'Portal password stored in plaintext (v3.0). Not payment credentials. Encryption deferred to v4.0+.';

-- 2. RLS
ALTER TABLE carrier_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_carrier_configs" ON carrier_configs
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "insert_carrier_configs" ON carrier_configs
  FOR INSERT WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "update_carrier_configs" ON carrier_configs
  FOR UPDATE USING (is_workspace_admin(workspace_id));

CREATE POLICY "delete_carrier_configs" ON carrier_configs
  FOR DELETE USING (is_workspace_admin(workspace_id));

-- 3. Grants
GRANT ALL ON carrier_configs TO authenticated;
GRANT ALL ON carrier_configs TO service_role;

-- 4. Auto-update updated_at
CREATE TRIGGER update_carrier_configs_updated_at
  BEFORE UPDATE ON carrier_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Index for workspace lookup
CREATE INDEX idx_carrier_configs_workspace ON carrier_configs(workspace_id);
