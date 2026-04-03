-- Add recompra_enabled toggle to workspace agent config
-- Default true to not break existing workspaces that use recompra
ALTER TABLE workspace_agent_config
ADD COLUMN IF NOT EXISTS recompra_enabled BOOLEAN NOT NULL DEFAULT true;
