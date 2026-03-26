-- Pipeline Closure Tags: When an order is in a specific pipeline AND has a specific tag,
-- it is considered "closed" (won) and won't appear as an active order in WhatsApp conversation list.

CREATE TABLE pipeline_closure_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, pipeline_id, tag_id)
);

-- RLS
ALTER TABLE pipeline_closure_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage closure tags in their workspace"
  ON pipeline_closure_tags FOR ALL
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- Index for lookup by workspace
CREATE INDEX idx_pipeline_closure_tags_workspace ON pipeline_closure_tags(workspace_id);
