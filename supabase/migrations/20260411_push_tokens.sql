-- Push notification tokens for mobile app (Phase 43, Plan 13)
-- Each user can have one active token per workspace+platform+device combo.
-- Revoked tokens are kept for audit; active tokens filtered by revoked_at IS NULL.

CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android','ios')),
  token text NOT NULL,
  device_name text,
  updated_at timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  revoked_at timestamptz,
  UNIQUE (user_id, workspace_id, platform, token)
);

CREATE INDEX IF NOT EXISTS push_tokens_workspace_active_idx
  ON push_tokens (workspace_id, platform) WHERE revoked_at IS NULL;
