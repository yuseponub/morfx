-- ============================================================================
-- Robot Jobs + Robot Job Items
-- Batch robot execution tracking with per-order granularity.
-- robot_jobs tracks the overall batch (pending -> processing -> completed/failed).
-- robot_job_items tracks each order independently (status, tracking, errors, retries).
-- Used by Phase 22 (robot service) and Phase 23 (Inngest orchestrator).
-- ============================================================================

-- 1. Create robot_jobs table (batch-level tracking)
CREATE TABLE robot_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL DEFAULT 'coordinadora',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_items INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, idempotency_key)
);

-- 2. Create robot_job_items table (per-order tracking)
CREATE TABLE robot_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES robot_jobs(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'error')),
  tracking_number TEXT,
  validated_city TEXT,
  value_sent JSONB,
  error_type TEXT CHECK (error_type IS NULL OR error_type IN ('validation', 'portal', 'timeout', 'unknown')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(job_id, order_id)
);

-- 3. Indexes for robot_jobs
CREATE INDEX idx_robot_jobs_workspace ON robot_jobs(workspace_id);
CREATE INDEX idx_robot_jobs_status ON robot_jobs(workspace_id, status);
CREATE INDEX idx_robot_jobs_idempotency ON robot_jobs(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 4. Indexes for robot_job_items
CREATE INDEX idx_robot_job_items_job ON robot_job_items(job_id);
CREATE INDEX idx_robot_job_items_order ON robot_job_items(order_id);
CREATE INDEX idx_robot_job_items_status ON robot_job_items(job_id, status);

-- 5. RLS for robot_jobs
ALTER TABLE robot_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_robot_jobs" ON robot_jobs
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "insert_robot_jobs" ON robot_jobs
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "update_robot_jobs" ON robot_jobs
  FOR UPDATE USING (is_workspace_member(workspace_id));

-- 6. RLS for robot_job_items (workspace check through parent join)
ALTER TABLE robot_job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_robot_job_items" ON robot_job_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM robot_jobs rj
      WHERE rj.id = robot_job_items.job_id
      AND is_workspace_member(rj.workspace_id)
    )
  );

CREATE POLICY "insert_robot_job_items" ON robot_job_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM robot_jobs rj
      WHERE rj.id = robot_job_items.job_id
      AND is_workspace_member(rj.workspace_id)
    )
  );

CREATE POLICY "update_robot_job_items" ON robot_job_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM robot_jobs rj
      WHERE rj.id = robot_job_items.job_id
      AND is_workspace_member(rj.workspace_id)
    )
  );

-- 7. Grants
GRANT ALL ON robot_jobs TO authenticated;
GRANT ALL ON robot_jobs TO service_role;
GRANT ALL ON robot_job_items TO authenticated;
GRANT ALL ON robot_job_items TO service_role;

-- 8. Auto-update triggers
CREATE TRIGGER update_robot_jobs_updated_at
  BEFORE UPDATE ON robot_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_robot_job_items_updated_at
  BEFORE UPDATE ON robot_job_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 9. Enable Supabase Realtime on robot_job_items (for Chat de Comandos real-time progress)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE robot_job_items;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
