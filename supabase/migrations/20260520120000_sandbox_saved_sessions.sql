-- Sandbox Saved Sessions
-- Mirror of localStorage `morfx:sandbox:sessions` for cross-browser access
-- and AI-assisted diagnosis. Populated by /api/sandbox/save-session,
-- deleted by /api/sandbox/delete-session. Fire-and-forget from UI — falla
-- silent si endpoint cae, localStorage queda como fallback.

CREATE TABLE IF NOT EXISTS sandbox_saved_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  messages JSONB NOT NULL,
  state JSONB NOT NULL,
  debug_turns JSONB NOT NULL,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_user_updated
  ON sandbox_saved_sessions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_agent
  ON sandbox_saved_sessions(agent_id);

-- RLS: cada user solo ve y modifica sus propias sessions
ALTER TABLE sandbox_saved_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sandbox_sessions_own_select" ON sandbox_saved_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "sandbox_sessions_own_insert" ON sandbox_saved_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sandbox_sessions_own_update" ON sandbox_saved_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "sandbox_sessions_own_delete" ON sandbox_saved_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger para updated_at automático en UPDATE
CREATE OR REPLACE FUNCTION update_sandbox_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('America/Bogota', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sandbox_sessions_updated_at
  BEFORE UPDATE ON sandbox_saved_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_sandbox_sessions_updated_at();

COMMENT ON TABLE sandbox_saved_sessions IS
  'Mirror de sessions guardadas en localStorage del sandbox. UPSERT desde /api/sandbox/save-session cuando user clickea Guardar. DELETE desde /api/sandbox/delete-session. Service-role bypassa RLS para diagnosis AI.';
