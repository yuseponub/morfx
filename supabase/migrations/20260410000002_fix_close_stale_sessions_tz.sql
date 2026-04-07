-- Phase 42 — TZ correctness fix for close_stale_agent_sessions()
--
-- Bug discovered during 05-PLAN UAT (2026-04-07):
--   The original RPC (migration 20260410000001) compared `last_activity_at`
--   (timestamptz) against `date_trunc('day', timezone('America/Bogota', NOW()))`,
--   which is a `timestamp WITHOUT time zone` (Bogota wall-clock at midnight).
--   Postgres implicitly casts the naive timestamp using the SESSION timezone
--   (UTC in Supabase by default), not Bogota — so the cutoff ended up 5 hours
--   earlier than intended. Result: 26 active sessions that should have been
--   closed (verified empirically) survived each cron run.
--
-- Fix: wrap the naive midnight back into Bogota timezone using `AT TIME ZONE`,
-- producing a correct timestamptz that compares apples-to-apples against
-- `last_activity_at`.
--
-- Lesson: when mixing timestamp/timestamptz in Postgres, always anchor naive
-- timestamps with an explicit `AT TIME ZONE 'X'` before comparing against
-- timestamptz columns. Never trust the implicit session-timezone cast.

CREATE OR REPLACE FUNCTION close_stale_agent_sessions()
RETURNS TABLE(closed_count INTEGER) AS $$
  WITH closed AS (
    UPDATE agent_sessions
    SET status = 'closed',
        updated_at = timezone('America/Bogota', NOW())
    WHERE status = 'active'
      AND last_activity_at < (
        date_trunc('day', timezone('America/Bogota', NOW()))
          AT TIME ZONE 'America/Bogota'
      )
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER FROM closed;
$$ LANGUAGE SQL;
