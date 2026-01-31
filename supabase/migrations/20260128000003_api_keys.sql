-- API Keys Table (External Authentication)
-- Phase 3: Action DSL Core - Plan 01
-- API keys for external agents (IA, n8n, webhooks) to invoke tools

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Key info
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE, -- bcrypt hash, NOT plaintext
  key_prefix TEXT NOT NULL, -- First 8 chars for identification (mfx_xxxx...)

  -- Permissions
  permissions TEXT[] NOT NULL DEFAULT '{}',

  -- Status
  revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),

  -- Metadata
  last_used_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  expires_at TIMESTAMPTZ -- NULL = never expires
);

-- Indexes
CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE revoked = false;
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Admins+ can view API keys in their workspace
CREATE POLICY "Admins can view workspace API keys"
  ON api_keys FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Admins+ can create API keys in their workspace
CREATE POLICY "Admins can create workspace API keys"
  ON api_keys FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
    AND created_by = auth.uid()
  );

-- Admins+ can update (revoke) API keys in their workspace
CREATE POLICY "Admins can update workspace API keys"
  ON api_keys FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Admins+ can delete API keys in their workspace
CREATE POLICY "Admins can delete workspace API keys"
  ON api_keys FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Function to validate API key and return workspace context
-- This runs with SECURITY DEFINER to bypass RLS when validating keys
CREATE OR REPLACE FUNCTION validate_api_key(p_key_hash TEXT)
RETURNS TABLE (
  workspace_id UUID,
  key_id UUID,
  permissions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ak.workspace_id,
    ak.id as key_id,
    ak.permissions
  FROM api_keys ak
  WHERE ak.key_hash = p_key_hash
    AND ak.revoked = false
    AND (ak.expires_at IS NULL OR ak.expires_at > NOW());

  -- Update last_used_at (fire and forget)
  UPDATE api_keys
  SET last_used_at = NOW()
  WHERE key_hash = p_key_hash;
END;
$$;

-- Comments for documentation
COMMENT ON TABLE api_keys IS 'API keys for external tool invocation (agents, webhooks)';
COMMENT ON COLUMN api_keys.key_hash IS 'bcrypt hash of the API key (never store plaintext)';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 chars (e.g., mfx_abc1) for user identification';
COMMENT ON COLUMN api_keys.permissions IS 'Array of permission strings this key grants';
COMMENT ON COLUMN api_keys.revoked IS 'Whether this key has been revoked';
COMMENT ON FUNCTION validate_api_key IS 'Validates API key and returns workspace context';
