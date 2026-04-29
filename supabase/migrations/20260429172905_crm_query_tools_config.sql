-- Standalone crm-query-tools — Wave 1 (Plan 02).
-- Creates workspace-scoped config for crm-query-tools module:
--   1. crm_query_tools_config (singleton per workspace, scalar pipeline_id).
--   2. crm_query_tools_active_stages (junction for multi-select active stages).
--
-- D-11 / D-12: one config per workspace, NOT hardcoded, NOT JSONB.
-- D-13: stages by UUID; FK CASCADE on junction so stage deletion auto-cleans config.
-- D-16: pipeline_id NULL = all pipelines (default).
-- Regla 2: timestamps use timezone('America/Bogota', NOW()).
-- LEARNING (platform_config 20260420000443): mandatory GRANTs for service_role + authenticated.

-- ─────────────────────────────────────────────────────────────────────
-- Table 1: crm_query_tools_config (singleton per workspace)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_query_tools_config (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pipeline_id  UUID NULL REFERENCES public.pipelines(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

ALTER TABLE public.crm_query_tools_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_query_tools_config_select"
  ON public.crm_query_tools_config FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "crm_query_tools_config_insert"
  ON public.crm_query_tools_config FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "crm_query_tools_config_update"
  ON public.crm_query_tools_config FOR UPDATE
  USING (is_workspace_admin(workspace_id));

CREATE POLICY "crm_query_tools_config_delete"
  ON public.crm_query_tools_config FOR DELETE
  USING (is_workspace_admin(workspace_id));

-- LEARNING propagado (platform_config 20260420000443): toda migración futura que crea
-- una tabla debe incluir GRANTs explícitos — no asumir que tablas creadas en prod via
-- SQL Editor hereden privileges que habrían tenido vía `supabase db push`.
GRANT ALL    ON TABLE public.crm_query_tools_config TO service_role;
GRANT SELECT ON TABLE public.crm_query_tools_config TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- Table 2: crm_query_tools_active_stages (junction)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_query_tools_active_stages (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage_id     UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  PRIMARY KEY (workspace_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_query_tools_active_stages_ws
  ON public.crm_query_tools_active_stages(workspace_id);

ALTER TABLE public.crm_query_tools_active_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_query_tools_active_stages_select"
  ON public.crm_query_tools_active_stages FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "crm_query_tools_active_stages_insert"
  ON public.crm_query_tools_active_stages FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "crm_query_tools_active_stages_delete"
  ON public.crm_query_tools_active_stages FOR DELETE
  USING (is_workspace_admin(workspace_id));

GRANT ALL    ON TABLE public.crm_query_tools_active_stages TO service_role;
GRANT SELECT ON TABLE public.crm_query_tools_active_stages TO authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- Trigger: bump updated_at on UPDATE (Regla 2 — Bogota timezone)
-- ─────────────────────────────────────────────────────────────────────
-- Rationale: Domain layer must NOT set updated_at client-side (would write UTC).
-- DB trigger guarantees Bogota timezone on every mutation.
CREATE OR REPLACE FUNCTION public.bump_crm_query_tools_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := timezone('America/Bogota', NOW());
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_query_tools_config_updated_at
  BEFORE UPDATE ON public.crm_query_tools_config
  FOR EACH ROW EXECUTE FUNCTION public.bump_crm_query_tools_config_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- Comments (developer hint)
-- ─────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.crm_query_tools_config IS 'Singleton config per workspace for crm-query-tools shared module. NULL pipeline_id = all pipelines (D-16). See standalone crm-query-tools.';
COMMENT ON TABLE public.crm_query_tools_active_stages IS 'Junction: stages considered "active" for getActiveOrderByPhone. Empty = config_not_set (D-27). FK CASCADE auto-cleans on stage deletion (D-13).';
COMMENT ON FUNCTION public.bump_crm_query_tools_config_updated_at IS 'BEFORE UPDATE trigger function — bumps updated_at to timezone(America/Bogota, NOW()). Domain layer must NOT set updated_at in payload (Regla 2).';
