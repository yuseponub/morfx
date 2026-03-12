-- Fix missing GRANT permissions for GoDentist tables
-- service_role needs explicit GRANT to INSERT/UPDATE/SELECT
-- Without this, createAdminClient() gets "permission denied for table"

-- godentist_scrape_history
ALTER TABLE godentist_scrape_history ENABLE ROW LEVEL SECURITY;
GRANT ALL ON godentist_scrape_history TO service_role;
GRANT ALL ON godentist_scrape_history TO authenticated;

-- godentist_scheduled_reminders
ALTER TABLE godentist_scheduled_reminders ENABLE ROW LEVEL SECURITY;
GRANT ALL ON godentist_scheduled_reminders TO service_role;
GRANT ALL ON godentist_scheduled_reminders TO authenticated;

-- RLS policies: service_role bypasses RLS automatically
-- For authenticated users, restrict to their workspace
CREATE POLICY "Users can view own workspace scrape history"
  ON godentist_scrape_history FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own workspace scrape history"
  ON godentist_scrape_history FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own workspace scrape history"
  ON godentist_scrape_history FOR UPDATE TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view own workspace reminders"
  ON godentist_scheduled_reminders FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own workspace reminders"
  ON godentist_scheduled_reminders FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own workspace reminders"
  ON godentist_scheduled_reminders FOR UPDATE TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
