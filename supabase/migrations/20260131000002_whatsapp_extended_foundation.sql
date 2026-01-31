-- ============================================================================
-- Phase 8: WhatsApp Extended Foundation
-- Templates, Teams, Quick Replies, Cost Tracking, Workspace Limits
-- ============================================================================

-- ============================================================================
-- WHATSAPP TEMPLATES TABLE
-- Stores template definitions with Meta approval status
-- ============================================================================

CREATE TABLE whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Template identity
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'es',
  category TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),

  -- Meta approval status
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED')),
  quality_rating TEXT CHECK (quality_rating IN ('HIGH', 'MEDIUM', 'LOW', 'PENDING')),
  rejected_reason TEXT,

  -- Template content (header, body, footer, buttons)
  components JSONB NOT NULL,

  -- Variable mapping: {"1": "contact.name", "2": "order.total"}
  variable_mapping JSONB NOT NULL DEFAULT '{}',

  -- Timestamps (America/Bogota timezone)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,

  -- Unique constraint: one template name per workspace
  UNIQUE(workspace_id, name)
);

-- Indexes for templates
CREATE INDEX idx_whatsapp_templates_workspace ON whatsapp_templates(workspace_id);
CREATE INDEX idx_whatsapp_templates_status ON whatsapp_templates(workspace_id, status);
CREATE INDEX idx_whatsapp_templates_category ON whatsapp_templates(workspace_id, category);

-- ============================================================================
-- TEAMS TABLE
-- Agent teams for conversation assignment
-- ============================================================================

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Team identity
  name TEXT NOT NULL,

  -- Default team receives new conversations
  is_default BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps (America/Bogota timezone)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- Unique constraint: one team name per workspace
  UNIQUE(workspace_id, name)
);

-- Indexes for teams
CREATE INDEX idx_teams_workspace ON teams(workspace_id);
CREATE INDEX idx_teams_default ON teams(workspace_id, is_default) WHERE is_default = true;

-- ============================================================================
-- TEAM MEMBERS TABLE
-- Junction table for team assignments
-- ============================================================================

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Availability toggle (manual online/offline)
  is_online BOOLEAN NOT NULL DEFAULT false,

  -- Round-robin tracking
  last_assigned_at TIMESTAMPTZ,

  -- Timestamps (America/Bogota timezone)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- Unique constraint: one user per team
  UNIQUE(team_id, user_id)
);

-- Indexes for team members
CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_team_members_online ON team_members(team_id, is_online) WHERE is_online = true;

-- ============================================================================
-- ALTER CONVERSATIONS TABLE
-- Add team_id for team assignment
-- ============================================================================

ALTER TABLE conversations
  ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX idx_conversations_team ON conversations(team_id) WHERE team_id IS NOT NULL;

-- ============================================================================
-- ALTER MESSAGES TABLE
-- Add template_name for template message tracking
-- ============================================================================

ALTER TABLE messages
  ADD COLUMN template_name TEXT;

CREATE INDEX idx_messages_template ON messages(template_name) WHERE template_name IS NOT NULL;

-- ============================================================================
-- QUICK REPLIES TABLE
-- Shortcut responses for agents
-- ============================================================================

CREATE TABLE quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Quick reply identity
  shortcut TEXT NOT NULL,
  content TEXT NOT NULL,

  -- Optional category (future feature, enabled by Super Admin)
  category TEXT,

  -- Timestamps (America/Bogota timezone)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- Unique constraint: one shortcut per workspace
  UNIQUE(workspace_id, shortcut)
);

-- Indexes for quick replies
CREATE INDEX idx_quick_replies_workspace ON quick_replies(workspace_id);
CREATE INDEX idx_quick_replies_category ON quick_replies(workspace_id, category) WHERE category IS NOT NULL;

-- ============================================================================
-- MESSAGE COSTS TABLE
-- Track message costs for billing
-- ============================================================================

CREATE TABLE message_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- WhatsApp message ID (unique for deduplication from webhook retries)
  wamid TEXT NOT NULL UNIQUE,

  -- Cost details
  category TEXT NOT NULL CHECK (category IN ('marketing', 'utility', 'authentication', 'service')),
  pricing_model TEXT NOT NULL DEFAULT 'PMP',
  recipient_country TEXT,
  cost_usd DECIMAL(10, 6),

  -- Timestamps (America/Bogota timezone)
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Indexes for message costs
CREATE INDEX idx_message_costs_workspace ON message_costs(workspace_id);
CREATE INDEX idx_message_costs_recorded ON message_costs(workspace_id, recorded_at DESC);
CREATE INDEX idx_message_costs_category ON message_costs(workspace_id, category);
CREATE INDEX idx_message_costs_wamid ON message_costs(wamid);

-- ============================================================================
-- WORKSPACE LIMITS TABLE
-- Super Admin configurable limits per workspace
-- ============================================================================

CREATE TABLE workspace_limits (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Template category restrictions
  allowed_categories JSONB NOT NULL DEFAULT '["MARKETING", "UTILITY", "AUTHENTICATION"]',

  -- Quick reply features
  quick_replies_with_variables BOOLEAN NOT NULL DEFAULT false,
  quick_replies_with_categories BOOLEAN NOT NULL DEFAULT false,

  -- Spending limits
  monthly_spend_limit_usd DECIMAL(10, 2),  -- NULL = unlimited
  alert_threshold_percent INTEGER NOT NULL DEFAULT 80,

  -- Timestamps (America/Bogota timezone)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================================
-- HELPER FUNCTION: Get workspace_id from team_id
-- ============================================================================

CREATE OR REPLACE FUNCTION get_workspace_from_team(team_uuid UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT workspace_id FROM teams WHERE id = team_uuid
$$;

-- ============================================================================
-- TRIGGERS: Auto-update updated_at
-- ============================================================================

CREATE TRIGGER whatsapp_templates_updated_at
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER quick_replies_updated_at
  BEFORE UPDATE ON quick_replies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER workspace_limits_updated_at
  BEFORE UPDATE ON workspace_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- WHATSAPP TEMPLATES POLICIES
-- Only Owner/Admin can manage templates
-- ============================================================================

CREATE POLICY "whatsapp_templates_admin_select"
  ON whatsapp_templates FOR SELECT
  USING (is_workspace_admin(workspace_id));

CREATE POLICY "whatsapp_templates_admin_insert"
  ON whatsapp_templates FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "whatsapp_templates_admin_update"
  ON whatsapp_templates FOR UPDATE
  USING (is_workspace_admin(workspace_id));

CREATE POLICY "whatsapp_templates_admin_delete"
  ON whatsapp_templates FOR DELETE
  USING (is_workspace_admin(workspace_id));

-- Agents can view approved templates (for sending)
CREATE POLICY "whatsapp_templates_member_view_approved"
  ON whatsapp_templates FOR SELECT
  USING (
    is_workspace_member(workspace_id)
    AND status = 'APPROVED'
  );

-- ============================================================================
-- TEAMS POLICIES
-- Members can view, Admin can manage
-- ============================================================================

CREATE POLICY "teams_member_select"
  ON teams FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "teams_admin_insert"
  ON teams FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "teams_admin_update"
  ON teams FOR UPDATE
  USING (is_workspace_admin(workspace_id));

CREATE POLICY "teams_admin_delete"
  ON teams FOR DELETE
  USING (is_workspace_admin(workspace_id));

-- ============================================================================
-- TEAM MEMBERS POLICIES
-- Access via parent team workspace
-- ============================================================================

CREATE POLICY "team_members_member_select"
  ON team_members FOR SELECT
  USING (
    is_workspace_member(get_workspace_from_team(team_id))
  );

CREATE POLICY "team_members_admin_insert"
  ON team_members FOR INSERT
  WITH CHECK (
    is_workspace_admin(get_workspace_from_team(team_id))
  );

CREATE POLICY "team_members_admin_update"
  ON team_members FOR UPDATE
  USING (
    is_workspace_admin(get_workspace_from_team(team_id))
  );

-- Allow users to update their own online status
CREATE POLICY "team_members_self_update_status"
  ON team_members FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "team_members_admin_delete"
  ON team_members FOR DELETE
  USING (
    is_workspace_admin(get_workspace_from_team(team_id))
  );

-- ============================================================================
-- QUICK REPLIES POLICIES
-- All members can use quick replies
-- ============================================================================

CREATE POLICY "quick_replies_member_select"
  ON quick_replies FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "quick_replies_admin_insert"
  ON quick_replies FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "quick_replies_admin_update"
  ON quick_replies FOR UPDATE
  USING (is_workspace_admin(workspace_id));

CREATE POLICY "quick_replies_admin_delete"
  ON quick_replies FOR DELETE
  USING (is_workspace_admin(workspace_id));

-- ============================================================================
-- MESSAGE COSTS POLICIES
-- Admin can view costs (insert via service role from webhook)
-- ============================================================================

CREATE POLICY "message_costs_admin_select"
  ON message_costs FOR SELECT
  USING (is_workspace_admin(workspace_id));

-- Note: INSERT is done via service role in webhook handler, no RLS policy needed

-- ============================================================================
-- WORKSPACE LIMITS POLICIES
-- No policies - accessed via admin client only (Super Admin)
-- ============================================================================

-- Note: workspace_limits has RLS enabled but no policies
-- This means only service role can access it (Super Admin panel)

-- ============================================================================
-- ENABLE REALTIME FOR RELEVANT TABLES
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
