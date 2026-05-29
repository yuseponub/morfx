-- v4-turn-ledger (D-13): columna dedicada JSONB para las dims del Turn Ledger.
-- UNA columna objeto (no N columnas) → cero migraciones futuras para #2/#3 (solo código).
-- Patrón first-class deliberado (= acciones_ejecutadas, quick-009). v4-only (DORMANT).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='session_state' AND column_name='turn_ledger_dims'
  ) THEN
    ALTER TABLE session_state ADD COLUMN turn_ledger_dims JSONB DEFAULT '{}';
  END IF;
END $$;
