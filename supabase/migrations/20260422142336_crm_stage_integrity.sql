-- =============================================================================
-- crm-stage-integrity — composite migration (Wave 0)
-- Creates order_stage_history (append-only audit ledger — D-10 schema, D-11 indices, D-13 RLS).
-- Adds orders to supabase_realtime publication (D-14 — first time orders joins the publication).
-- Seeds 2 feature flags (D-17 cas_enabled, D-20 killswitch_enabled) both default false (Regla 6).
-- Idempotent: safe to replay (CREATE TABLE IF NOT EXISTS via separate convention, ON CONFLICT DO NOTHING on seed, DO $$ guard on publication ADD).
-- Regla 5: apply in Supabase SQL Editor BEFORE pushing Plans 02-05.
-- =============================================================================

-- 0) ALTER platform_config — agregar columna `description` idempotentemente (Rule 3 deviation)
-- Motivo: el schema actual de platform_config (migration 20260420000443_platform_config.sql)
-- tiene solo 3 columnas: key, value, updated_at. El INSERT de esta migracion usa (key, value, description)
-- per Example 5 RESEARCH. Agregar la columna aqui preserva el patron del plan y deja
-- descripciones como first-class data accesible desde cualquier query (util para UI futura).
-- IF NOT EXISTS garantiza que el replay no falle.
ALTER TABLE platform_config ADD COLUMN IF NOT EXISTS description text NULL;

-- 1) CREATE TABLE order_stage_history (13 columns, source CHECK with 7 values, D-10)
CREATE TABLE IF NOT EXISTS order_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  previous_stage_id uuid NULL,
  new_stage_id uuid NOT NULL,
  source text NOT NULL CHECK (
    source IN ('manual', 'automation', 'webhook', 'agent', 'robot', 'cascade_capped', 'system')
  ),
  actor_id uuid NULL,
  actor_label text NULL,
  cascade_depth smallint NOT NULL DEFAULT 0,
  trigger_event text NULL,
  changed_at timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  metadata jsonb NULL
);

-- 2) INDICES (D-11, 3 indices incluyendo parcial para kill-switch hot path)
CREATE INDEX IF NOT EXISTS idx_osh_order_changed
  ON order_stage_history (order_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_osh_workspace_changed
  ON order_stage_history (workspace_id, changed_at DESC);

-- Partial index: kill-switch query filters source != 'manual' (Pitfall 8 RESEARCH)
-- Without this, the runtime kill-switch does full table scan → 50ms latency.
CREATE INDEX IF NOT EXISTS idx_osh_kill_switch
  ON order_stage_history (order_id, changed_at DESC)
  WHERE source != 'manual';

-- 3) RLS (D-13 — workspace-scoped SELECT, append-only for everyone else)
ALTER TABLE order_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see history for own workspace orders" ON order_stage_history;
CREATE POLICY "Users see history for own workspace orders"
  ON order_stage_history FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role inserts history" ON order_stage_history;
CREATE POLICY "Service role inserts history"
  ON order_stage_history FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "No updates on history" ON order_stage_history;
CREATE POLICY "No updates on history"
  ON order_stage_history FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No deletes on history" ON order_stage_history;
CREATE POLICY "No deletes on history"
  ON order_stage_history FOR DELETE
  USING (false);

-- 4) TRIGGER plpgsql — defense-in-depth against service_role bypass
-- (createAdminClient() uses service_role which bypasses RLS; trigger fires for ALL roles)
CREATE OR REPLACE FUNCTION prevent_order_stage_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'order_stage_history is append-only (TG_OP=%)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_order_stage_history_no_update ON order_stage_history;
CREATE TRIGGER guard_order_stage_history_no_update
  BEFORE UPDATE ON order_stage_history
  FOR EACH ROW EXECUTE FUNCTION prevent_order_stage_history_mutation();

DROP TRIGGER IF EXISTS guard_order_stage_history_no_delete ON order_stage_history;
CREATE TRIGGER guard_order_stage_history_no_delete
  BEFORE DELETE ON order_stage_history
  FOR EACH ROW EXECUTE FUNCTION prevent_order_stage_history_mutation();

-- 5) GRANTs explicitos (LEARNING 1 Phase 44.1 — Studio SQL Editor no hereda grants)
GRANT ALL    ON TABLE public.order_stage_history TO service_role;
GRANT SELECT ON TABLE public.order_stage_history TO authenticated;

-- 6) REALTIME publication — agregar orders idempotentemente (Example 6 RESEARCH)
-- orders NO esta en supabase_realtime hoy (verified 2026-04-21, grep en migrations dir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;

-- NOTA: NO activamos REPLICA IDENTITY FULL (Pitfall 6 RESEARCH — cliente no necesita payload.old).

-- 7) SEED feature flags (Example 5 RESEARCH, ambos default false por D-17 y D-20 + Regla 6)
INSERT INTO platform_config (key, value, description)
VALUES
  (
    'crm_stage_integrity_cas_enabled',
    'false'::jsonb,
    'Optimistic compare-and-swap en moveOrderToStage. Activar per-workspace tras observar telemetria. See .planning/standalone/crm-stage-integrity/CONTEXT.md D-17.'
  ),
  (
    'crm_stage_integrity_killswitch_enabled',
    'false'::jsonb,
    'Runtime kill-switch: skip automation si >5 cambios no-manuales en 60s. See D-20.'
  )
ON CONFLICT (key) DO NOTHING;

-- 8) COMMENTs (documentacion in-DB)
COMMENT ON TABLE order_stage_history IS
  'Append-only ledger de cambios de stage_id en orders. Escrito por domain.moveOrderToStage.';
COMMENT ON COLUMN order_stage_history.source IS
  'Origen: manual (UI), automation (Inngest), webhook, agent (CRM bot), robot (Coordinadora/Inter), cascade_capped (MAX_CASCADE_DEPTH hit), system.';
COMMENT ON COLUMN order_stage_history.actor_id IS
  'user_id si manual; automation_id si automation; NULL para agent/webhook/robot/system (actor_label lleva el hint).';
COMMENT ON COLUMN order_stage_history.previous_stage_id IS
  'NULL solo en creacion de pedido. Siempre presente en cambios subsecuentes.';

-- =============================================================================
-- FIN migracion. Aplicar en Supabase SQL Editor production antes de Plan 02 push.
-- =============================================================================
