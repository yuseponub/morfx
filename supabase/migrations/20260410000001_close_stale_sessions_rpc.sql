-- Phase 42: RPC for nightly cron (close-stale-sessions Inngest function)
-- Keeps timezone math in SQL using native date_trunc + timezone
-- See .planning/phases/42-session-lifecycle/42-CONTEXT.md §3.3 for rule rationale
-- See .planning/phases/42-session-lifecycle/42-RESEARCH.md ## Code Examples (Example 1, RPC variant)
--
-- Rule (CONTEXT §3.3):
--   "Cierra las sesiones activas que no tuvieron actividad hoy" (America/Bogota).
--   A session whose last_activity_at is before midnight-today Bogota gets closed.
--   Sessions chatted past midnight survive (their last_activity_at is >= midnight-today).
--   Only touches status='active'. Never touches 'handed_off' (terminal state).
--
-- Return shape: TABLE(closed_count INTEGER). Inngest cron consumes the number
-- for observability logging. CREATE OR REPLACE is idempotent.

CREATE OR REPLACE FUNCTION close_stale_agent_sessions()
RETURNS TABLE(closed_count INTEGER) AS $$
  WITH closed AS (
    UPDATE agent_sessions
    SET status = 'closed',
        updated_at = timezone('America/Bogota', NOW())
    WHERE status = 'active'
      AND last_activity_at < date_trunc('day', timezone('America/Bogota', NOW()))
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER FROM closed;
$$ LANGUAGE SQL;
