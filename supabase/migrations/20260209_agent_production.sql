-- ============================================================================
-- Phase 16, Plan 01: Agent Production Foundation
-- Creates workspace_agent_config table, adds agent columns to conversations
-- and messages tables.
-- ============================================================================

-- ============================================================================
-- 1. WORKSPACE AGENT CONFIG TABLE
-- ============================================================================

CREATE TABLE workspace_agent_config (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_enabled BOOLEAN NOT NULL DEFAULT false,
  conversational_agent_id TEXT NOT NULL DEFAULT 'somnio-sales-v1',
  crm_agents_enabled JSONB NOT NULL DEFAULT '{"order-manager": true}'::jsonb,
  handoff_message TEXT NOT NULL DEFAULT 'Regalame 1 min, ya te comunico con un asesor',
  timer_preset TEXT NOT NULL DEFAULT 'real' CHECK (timer_preset IN ('real', 'rapido', 'instantaneo')),
  response_speed NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Enable RLS
ALTER TABLE workspace_agent_config ENABLE ROW LEVEL SECURITY;

-- SELECT: Any workspace member can read agent config
CREATE POLICY "workspace_agent_config_select"
  ON workspace_agent_config FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: Only owner/admin can create agent config
CREATE POLICY "workspace_agent_config_insert"
  ON workspace_agent_config FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

-- UPDATE: Only owner/admin can modify agent config
CREATE POLICY "workspace_agent_config_update"
  ON workspace_agent_config FOR UPDATE
  USING (is_workspace_admin(workspace_id));

-- ============================================================================
-- 2. CONVERSATIONS: Agent override columns
-- ============================================================================

-- NULL = inherit global setting, true = explicitly enabled, false = explicitly disabled
ALTER TABLE conversations
  ADD COLUMN agent_conversational BOOLEAN DEFAULT NULL,
  ADD COLUMN agent_crm BOOLEAN DEFAULT NULL;

-- Partial index for conversations with explicit agent overrides
-- Optimizes queries that filter by agent settings
CREATE INDEX idx_conversations_agent
  ON conversations(workspace_id)
  WHERE agent_conversational IS NOT NULL OR agent_crm IS NOT NULL;

-- ============================================================================
-- 3. MESSAGES: Agent attribution column
-- ============================================================================

ALTER TABLE messages
  ADD COLUMN sent_by_agent BOOLEAN NOT NULL DEFAULT false;
