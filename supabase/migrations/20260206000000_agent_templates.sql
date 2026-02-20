-- ============================================================================
-- Agent Templates Migration
-- Phase 14: Agente Ventas Somnio - Plan 01
--
-- Creates agent_templates table for storing intent-to-template mappings.
-- Templates are editable in Supabase Studio without code deployment.
-- ============================================================================

-- ============================================================================
-- Agent Templates Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Agent and intent identification
  agent_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  visit_type TEXT NOT NULL CHECK (visit_type IN ('primera_vez', 'siguientes')),

  -- Template ordering (0-indexed within intent+visit_type group)
  orden INTEGER NOT NULL DEFAULT 0,

  -- Content
  content_type TEXT NOT NULL CHECK (content_type IN ('texto', 'template', 'imagen')),
  content TEXT NOT NULL,

  -- Delay before sending this template (seconds)
  delay_s INTEGER NOT NULL DEFAULT 0,

  -- Workspace isolation (NULL = global default templates)
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one template per agent+intent+visit_type+orden+workspace
  UNIQUE(agent_id, intent, visit_type, orden, workspace_id)
);

-- Index for fast lookups by agent, intent, and visit type
CREATE INDEX IF NOT EXISTS idx_agent_templates_lookup
  ON agent_templates(agent_id, intent, visit_type);

-- Index for workspace-specific queries
CREATE INDEX IF NOT EXISTS idx_agent_templates_workspace
  ON agent_templates(workspace_id) WHERE workspace_id IS NOT NULL;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE agent_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can access templates from their workspaces OR global templates (NULL workspace)
DROP POLICY IF EXISTS "agent_templates_workspace_isolation" ON agent_templates;
CREATE POLICY "agent_templates_workspace_isolation" ON agent_templates
  FOR ALL USING (
    workspace_id IS NULL
    OR is_workspace_member(workspace_id)
  );

-- ============================================================================
-- Updated At Trigger
-- ============================================================================

-- Reuse existing update_updated_at_column function (from prior migrations)
CREATE TRIGGER update_agent_templates_updated_at
  BEFORE UPDATE ON agent_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE agent_templates IS 'Templates for agent responses mapped to intents. Editable in Supabase Studio.';
COMMENT ON COLUMN agent_templates.agent_id IS 'Agent identifier (e.g., somnio-sales-v1)';
COMMENT ON COLUMN agent_templates.intent IS 'Intent name this template responds to';
COMMENT ON COLUMN agent_templates.visit_type IS 'primera_vez = first time seeing intent, siguientes = repeat';
COMMENT ON COLUMN agent_templates.orden IS 'Order within the template sequence (0-indexed)';
COMMENT ON COLUMN agent_templates.content_type IS 'texto = plain text, template = WhatsApp template, imagen = image URL';
COMMENT ON COLUMN agent_templates.content IS 'Template content (text message or URL)';
COMMENT ON COLUMN agent_templates.delay_s IS 'Seconds to wait before sending this template';
COMMENT ON COLUMN agent_templates.workspace_id IS 'NULL = global template, UUID = workspace-specific override';
