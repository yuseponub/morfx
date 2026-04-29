-- Standalone crm-mutation-tools — Wave 0.
-- Creates idempotency-key dedup table for creation mutation tools.
--
-- D-03: opt-in idempotency via caller-provided string key.
-- D-pre-02: NO admin client in module — domain layer file
--   src/lib/domain/crm-mutation-idempotency.ts is the SOLE writer of this table.
-- D-09: callers should ALWAYS re-hydrate fresh via result_id; result_payload
--   column is fallback for orphaned rows only.
-- Regla 2: timestamps use timezone('America/Bogota', NOW()).
-- LEARNING propagado (platform_config 20260420000443): mandatory GRANTs for
--   service_role + authenticated.

-- ─────────────────────────────────────────────────────────────────────
-- Table: crm_mutation_idempotency_keys
-- Purpose: dedup creation mutations across retries within TTL.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_mutation_idempotency_keys (
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tool_name      TEXT NOT NULL,
  key            TEXT NOT NULL,
  result_id      UUID NOT NULL,           -- FK varies by tool_name; not enforced (polymorphic)
  result_payload JSONB NOT NULL,          -- tombstone for crash-recovery; D-09 says always re-hydrate via result_id
  created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  PRIMARY KEY (workspace_id, tool_name, key)
);

-- Index for TTL cleanup cron (sweeps by created_at)
CREATE INDEX IF NOT EXISTS idx_crm_mutation_idempotency_keys_created_at
  ON public.crm_mutation_idempotency_keys(created_at);

ALTER TABLE public.crm_mutation_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- RLS: workspace members can SELECT (forensics / audit UI future-use); only
-- service_role inserts/deletes (domain layer + Inngest cron). NO UPDATE policy
-- — idempotency rows are immutable post-insert.
CREATE POLICY "crm_mutation_idempotency_keys_select"
  ON public.crm_mutation_idempotency_keys FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: service_role only (no policy = denies authenticated path; service_role bypasses RLS)
-- DELETE: service_role only (cron sweeps)
-- NO UPDATE policy intentionally — rows are write-once.

GRANT ALL    ON TABLE public.crm_mutation_idempotency_keys TO service_role;
GRANT SELECT ON TABLE public.crm_mutation_idempotency_keys TO authenticated;

COMMENT ON TABLE public.crm_mutation_idempotency_keys IS
  'Dedup table for crm-mutation-tools creation operations. PK (workspace_id, tool_name, key). Rows are immutable; TTL 30 days swept by Inngest cron crm-mutation-idempotency-cleanup. Standalone crm-mutation-tools D-03.';
COMMENT ON COLUMN public.crm_mutation_idempotency_keys.result_payload IS
  'Tombstone snapshot of executed mutation result. D-09 says callers should ALWAYS re-hydrate fresh via result_id; this column is fallback for orphaned rows only.';
