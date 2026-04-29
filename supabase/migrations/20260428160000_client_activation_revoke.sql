-- =============================================================================
-- client-activation-auto-revoke — bidirectional is_client trigger + global backfill
-- =============================================================================
-- Reemplaza el cuerpo de mark_client_on_stage_change() (creado en 20260221000000)
-- para que tambien revoque is_client=false cuando un contacto ya no tiene ordenes
-- en activation_stage_ids. Drop dead-code Cliente tag block (D-05). Anade composite
-- index idx_orders_contact_stage para acelerar EXISTS hot path. Ejecuta backfill
-- global automatico al final.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + CREATE INDEX IF NOT EXISTS + ON CONFLICT
-- + DO $$ con WHERE gates. Replay safe.
--
-- Trigger binding `orders_mark_client_on_stage` (creado el 2026-02-21) sigue VALIDO —
-- esta migracion NO ejecuta DROP TRIGGER ni CREATE TRIGGER, solo reemplaza el cuerpo
-- de la funcion a la que el trigger ya apunta.
--
-- Regla 5: aplicar en Supabase SQL Editor production ANTES del push de este commit.
-- Regla 3: EXENTA por D-03 — la logica de is_client vive en DB por diseno.
-- Regla 6: NO aplica — es bug-fix, no cambio de comportamiento de agente. CONTEXT.md
--          prohibe feature flag explicitamente.
-- =============================================================================

-- 1) CREATE OR REPLACE FUNCTION — bidirectional IN/OUT logic, dead-code Cliente tag dropped
CREATE OR REPLACE FUNCTION mark_client_on_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_workspace_id UUID;
  v_old_in_set BOOLEAN;
  v_new_in_set BOOLEAN;
  v_other_exists BOOLEAN;
BEGIN
  -- Skip if no contact linked
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only fire if stage_id actually changed (Pitfall 1: IS NOT DISTINCT FROM handles NULL)
  IF TG_OP = 'UPDATE' AND OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
    RETURN NEW;
  END IF;

  v_workspace_id := NEW.workspace_id;

  -- Load config; skip if missing or disabled
  SELECT enabled, activation_stage_ids
  INTO v_config
  FROM client_activation_config
  WHERE workspace_id = v_workspace_id;

  IF NOT FOUND OR NOT v_config.enabled THEN
    RETURN NEW;
  END IF;

  -- D-02: classify boundary crossing
  v_new_in_set := NEW.stage_id = ANY(v_config.activation_stage_ids);

  IF TG_OP = 'INSERT' THEN
    -- INSERT to activator => IN; INSERT outside => skip
    IF v_new_in_set THEN
      UPDATE contacts
      SET is_client = true
      WHERE id = NEW.contact_id
        AND workspace_id = v_workspace_id
        AND is_client = false;
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE' from here on
  v_old_in_set := OLD.stage_id = ANY(v_config.activation_stage_ids);

  -- Skip internal transitions (both inside or both outside the set)
  IF v_old_in_set = v_new_in_set THEN
    RETURN NEW;
  END IF;

  IF v_new_in_set AND NOT v_old_in_set THEN
    -- IN: order entered the activator set
    UPDATE contacts
    SET is_client = true
    WHERE id = NEW.contact_id
      AND workspace_id = v_workspace_id
      AND is_client = false;
    RETURN NEW;
  END IF;

  -- OUT: v_old_in_set AND NOT v_new_in_set
  -- D-03 edge case: only flip false if NO OTHER order of this contact remains in the set.
  -- Use OLD.contact_id (RQ-2.a RESEARCH) when checking "other orders" so a same-TX contact
  -- reassignment doesn't leave the previous owner falsely marked as client.
  SELECT EXISTS (
    SELECT 1 FROM orders
    WHERE contact_id = OLD.contact_id
      AND workspace_id = v_workspace_id
      AND stage_id = ANY(v_config.activation_stage_ids)
      AND id <> NEW.id
  ) INTO v_other_exists;

  IF NOT v_other_exists THEN
    UPDATE contacts
    SET is_client = false
    WHERE id = OLD.contact_id
      AND workspace_id = v_workspace_id
      AND is_client = true;
  END IF;

  -- Defensive: if contact_id was reassigned (OLD.contact_id <> NEW.contact_id) AND new
  -- contact now has its first order in an activator stage, also mark new contact.
  IF NEW.contact_id IS DISTINCT FROM OLD.contact_id AND v_new_in_set THEN
    UPDATE contacts
    SET is_client = true
    WHERE id = NEW.contact_id
      AND workspace_id = v_workspace_id
      AND is_client = false;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger binding `orders_mark_client_on_stage` (created 2026-02-21) stays valid —
-- CREATE OR REPLACE FUNCTION above replaces only the body that the existing trigger
-- already references. NO DROP TRIGGER / CREATE TRIGGER needed.

-- 2) Composite index — accelerates the OUT-branch EXISTS check (RQ-2.d RESEARCH)
-- Matches the WHERE clause: contact_id + stage_id = ANY(uuid[]).
-- Existing idx_orders_contact (single column) still works but scans more rows for
-- contacts with many orders.
CREATE INDEX IF NOT EXISTS idx_orders_contact_stage
  ON orders (contact_id, stage_id);

-- 3) Defensive realtime publication guard (Pitfall 5 RESEARCH)
-- The 2026-02-21 migration already added contacts to supabase_realtime (line 121).
-- This block is a no-op in prod but ensures fresh dev DBs have it.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 4) Backfill — recalcula is_client en TODOS los workspaces con config habilitada.
-- D-04 + Refinement RESEARCH: filtra array_length>0 (skip configs vacios), GET DIAGNOSTICS
-- + RAISE NOTICE para observabilidad por-workspace en SQL Editor output, gates idempotentes
-- (WHERE is_client = X) para que replay sea cheap no-op.
-- D-01: archivadas SI cuentan (no filtramos archived_at). Espeja behavior de
-- backfillIsClient en src/lib/domain/client-activation.ts.
DO $$
DECLARE
  v_workspace_id UUID;
  v_stage_ids UUID[];
  v_reset_count INTEGER;
  v_set_count INTEGER;
BEGIN
  FOR v_workspace_id, v_stage_ids IN
    SELECT workspace_id, activation_stage_ids
    FROM client_activation_config
    WHERE enabled = true
      AND array_length(activation_stage_ids, 1) > 0
  LOOP
    -- 1) Reset all is_client=true contacts in this workspace
    UPDATE contacts
    SET is_client = false
    WHERE workspace_id = v_workspace_id
      AND is_client = true;
    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    -- 2) Set true for contacts that have >=1 order in activation stages
    WITH client_contact_ids AS (
      SELECT DISTINCT o.contact_id
      FROM orders o
      WHERE o.workspace_id = v_workspace_id
        AND o.contact_id IS NOT NULL
        AND o.stage_id = ANY(v_stage_ids)
    )
    UPDATE contacts c
    SET is_client = true
    FROM client_contact_ids cci
    WHERE c.id = cci.contact_id
      AND c.workspace_id = v_workspace_id
      AND c.is_client = false;
    GET DIAGNOSTICS v_set_count = ROW_COUNT;

    RAISE NOTICE 'client_activation backfill: workspace=% reset=% set=%',
      v_workspace_id, v_reset_count, v_set_count;
  END LOOP;
END $$;

-- =============================================================================
-- FIN. Aplicar en Supabase SQL Editor production antes de pushear este commit.
-- =============================================================================
