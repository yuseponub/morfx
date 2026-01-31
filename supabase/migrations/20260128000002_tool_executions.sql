-- Tool Executions Table (Forensic Audit Log)
-- Phase 3: Action DSL Core - Plan 01
-- Every tool invocation is logged for auditability and reversibility

CREATE TABLE tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Tool info
  tool_name TEXT NOT NULL,

  -- Inputs/Outputs (JSONB for flexibility)
  inputs JSONB NOT NULL DEFAULT '{}',
  outputs JSONB DEFAULT '{}',

  -- Status
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'dry_run')),
  error_message TEXT,
  error_stack TEXT,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,

  -- Context
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,

  -- Request context (forensic)
  request_context JSONB NOT NULL DEFAULT '{}',

  -- Snapshots for reversibility
  snapshot_before JSONB,
  snapshot_after JSONB,

  -- Batch relationships
  batch_id UUID,
  related_executions UUID[],

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Indexes for common queries
CREATE INDEX idx_tool_executions_workspace ON tool_executions(workspace_id);
CREATE INDEX idx_tool_executions_tool_name ON tool_executions(tool_name);
CREATE INDEX idx_tool_executions_status ON tool_executions(status);
CREATE INDEX idx_tool_executions_created_at ON tool_executions(created_at DESC);
CREATE INDEX idx_tool_executions_batch ON tool_executions(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_tool_executions_user ON tool_executions(user_id) WHERE user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;

-- Members can view executions in their workspace
CREATE POLICY "Members can view workspace tool executions"
  ON tool_executions FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role can insert executions (tools run server-side)
-- Using a permissive INSERT policy that allows service role
CREATE POLICY "Service role can insert tool executions"
  ON tool_executions FOR INSERT
  WITH CHECK (
    -- Only allow if the user is a member of the workspace
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
    -- OR service role (handled by Supabase automatically bypassing RLS)
  );

-- Comments for documentation
COMMENT ON TABLE tool_executions IS 'Forensic audit log of all tool invocations';
COMMENT ON COLUMN tool_executions.tool_name IS 'Tool identifier in format module.entity.action';
COMMENT ON COLUMN tool_executions.inputs IS 'Input parameters passed to the tool';
COMMENT ON COLUMN tool_executions.outputs IS 'Output returned by the tool';
COMMENT ON COLUMN tool_executions.status IS 'Execution status: success, error, or dry_run';
COMMENT ON COLUMN tool_executions.snapshot_before IS 'State before modification (for reversibility)';
COMMENT ON COLUMN tool_executions.snapshot_after IS 'State after modification (for verification)';
COMMENT ON COLUMN tool_executions.batch_id IS 'UUID linking executions in the same batch';
COMMENT ON COLUMN tool_executions.request_context IS 'Request metadata: ip, user_agent, source';
