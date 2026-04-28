-- ============================================================================
-- agent_audit_sessions — auditor multi-turn + hypothesis persistence
-- ============================================================================
-- Phase: agent-forensics-panel (standalone) — Plan 05
-- Objetivo: persistir cada sesion del auditor AI con hypothesis, mensajes
--           del chat (round inicial + follow-ups), system prompt usado, y
--           costo acumulado en USD.
--
-- Sin RLS — acceso server-only via createAdminClient + assertSuperUser gate
-- en route handler. Mismo patron que platform_config + crm_bot_actions.
--
-- Regla 5 (CLAUDE.md): este SQL DEBE aplicarse en Supabase prod ANTES del
-- push de codigo de Plan 05 que lo referencia (Tasks 3+ importan/escriben
-- contra esta tabla — `audit-session-store.ts`, `route.ts`, etc.).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS agent_audit_sessions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK semantico a agent_observability_turns (NO enforced — tabla particionada,
  -- FK cross-partition no se enforce; documentado en RESEARCH §5).
  turn_id                  UUID NOT NULL,
  workspace_id             UUID NOT NULL,
  user_id                  UUID NOT NULL,
  responding_agent_id      TEXT NOT NULL,
  conversation_id          UUID NOT NULL,
  -- Hipotesis pre-audit del usuario (NULL si fue blind audit).
  hypothesis               TEXT NULL,
  -- Array UIMessage[] con todo el chat (round 1 + follow-ups).
  messages                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- System prompt usado en round 1 (cachea contexto pesado para que los
  -- follow-up rounds reusen sin re-cargar spec + snapshot + multi-turn).
  system_prompt            TEXT NOT NULL,
  -- Meta: cuantos turns previos del contexto multi-turn vio el modelo en round 1.
  total_turns_in_context   INTEGER NOT NULL DEFAULT 0,
  -- Meta: si hubo trimming por cap de tokens, cuantos turns se descartaron.
  trimmed_count            INTEGER NOT NULL DEFAULT 0,
  -- Costo acumulado de todos los rounds (input + output Sonnet 4.6 pricing).
  cost_usd                 NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Indices: futura UI listado per-workspace + per-conversation, y reabrir audits per-turn.
CREATE INDEX IF NOT EXISTS idx_audit_sessions_workspace_conv
  ON agent_audit_sessions (workspace_id, conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_sessions_turn
  ON agent_audit_sessions (turn_id, created_at DESC);

-- updated_at trigger (reusa funcion existente de migracion
-- 20260128000001_workspaces_and_roles.sql — misma funcion usada por
-- agent_sessions, session_state, etc.).
CREATE TRIGGER agent_audit_sessions_updated_at
  BEFORE UPDATE ON agent_audit_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- GRANTs explicitos (LEARNING Phase 44.1: tablas creadas via SQL Editor NO
-- reciben grants automaticos para service_role; sin esto fallaria con
-- `code: 42501 — permission denied` en runtime).
GRANT ALL ON TABLE public.agent_audit_sessions TO service_role;
-- NO grant a authenticated — sin RLS y sin uso desde client. service_role only.

COMMENT ON TABLE agent_audit_sessions IS
  'Auditor multi-turn audit sessions (Plan 05 agent-forensics-panel). Persists hypothesis + chat history + cost. Server-only access via createAdminClient + assertSuperUser. NO RLS.';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Task 2 — usuario corre post-apply en SQL Editor):
-- ============================================================================
--
-- Query 1 — tabla creada + size + row_count:
--
-- SELECT
--   table_name,
--   pg_size_pretty(pg_total_relation_size('public.agent_audit_sessions')) AS size,
--   (SELECT COUNT(*) FROM agent_audit_sessions) AS row_count
-- FROM information_schema.tables
-- WHERE table_name = 'agent_audit_sessions';
--
-- Expected: 1 row, size ~16 kB (empty), row_count = 0.
--
-- ----------------------------------------------------------------------------
-- Query 2 — verificar GRANTs:
--
-- SELECT grantee, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_name = 'agent_audit_sessions';
--
-- Expected: al menos 1 row con grantee='service_role' y privilege_type
-- incluyendo INSERT, UPDATE, SELECT, DELETE (ALL = 4 privileges minimo).
--
-- ----------------------------------------------------------------------------
-- Query 3 — verificar trigger updated_at:
--
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid = 'public.agent_audit_sessions'::regclass
--   AND NOT tgisinternal;
--
-- Expected: 1 row con tgname='agent_audit_sessions_updated_at'.
--
-- ----------------------------------------------------------------------------
-- Query 4 — verificar indices:
--
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'agent_audit_sessions'
-- ORDER BY indexname;
--
-- Expected: 3 rows minimo:
--   - agent_audit_sessions_pkey       (PK auto)
--   - idx_audit_sessions_turn
--   - idx_audit_sessions_workspace_conv
-- ============================================================================
