-- V3 Production Integration: acciones_ejecutadas column
-- Stores the array of AccionRegistrada objects for v3 agent sessions.
-- Used by V3ProductionRunner to persist/restore acciones between turns.
-- Idempotent: safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'session_state'
    AND column_name = 'acciones_ejecutadas'
  ) THEN
    ALTER TABLE session_state ADD COLUMN acciones_ejecutadas JSONB DEFAULT '[]';
  END IF;
END $$;
