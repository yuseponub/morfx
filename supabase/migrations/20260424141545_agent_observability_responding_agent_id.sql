-- ============================================================================
-- agent_observability_turns — responding_agent_id column + backfill
-- ============================================================================
-- Phase: agent-forensics-panel (standalone)
-- Origen: sub-bug descubierto en discovery — turns de recompra se etiquetan
--         como 'somnio-v3' porque el collector se crea con conversational_agent_id
--         del workspace y nunca se actualiza cuando webhook-processor rutea a
--         un runner de recompra-v1 / godentist.
--
-- Cambios:
--   1. ADD COLUMN responding_agent_id TEXT NULL (cascada a todas las particiones via PG 12+)
--   2. CREATE INDEX partial WHERE responding_agent_id IS NOT NULL (Pitfall 8 RESEARCH)
--   3. 4 UPDATEs cascading (D-11 backfill): recompra_routed → B godentist → C v3 → D fallback agent_id
--
-- Idempotencia:
--   - ADD COLUMN IF NOT EXISTS (PG 15 supported)
--   - CREATE INDEX IF NOT EXISTS
--   - UPDATEs usan AND responding_agent_id IS NULL guard para no revertir backfills previos
--
-- Regla 5: este SQL se aplica en Supabase SQL Editor production durante Task 2
-- de este plan, ANTES del push de codigo de Tasks 3-8.

BEGIN;

-- 1) ADD COLUMN (cascada a todas las particiones automatica en PG 12+)
ALTER TABLE agent_observability_turns
  ADD COLUMN IF NOT EXISTS responding_agent_id TEXT NULL;

-- 2) Partial index — solo rows con responding_agent_id poblado (Pitfall 8: keep small)
CREATE INDEX IF NOT EXISTS idx_turns_responding_agent
  ON agent_observability_turns (responding_agent_id, started_at DESC)
  WHERE responding_agent_id IS NOT NULL;

-- 3) BACKFILL cascading (D-11 — criterios en orden de confianza)

-- Criterion A: recompra routing (explicit event)
-- Source: webhook-processor.ts:192 emite pipeline_decision · recompra_routed
UPDATE agent_observability_turns AS t
SET responding_agent_id = 'somnio-recompra-v1'
WHERE EXISTS (
  SELECT 1 FROM agent_observability_events e
  WHERE e.turn_id = t.id
    AND e.category = 'pipeline_decision'
    AND e.label = 'recompra_routed'
);

-- Criterion B: godentist routing
-- Source: webhook-processor.ts:476 emite pipeline_decision · webhook_agent_routed con payload.agentId='godentist'
UPDATE agent_observability_turns AS t
SET responding_agent_id = 'godentist'
WHERE responding_agent_id IS NULL
  AND EXISTS (
    SELECT 1 FROM agent_observability_events e
    WHERE e.turn_id = t.id
      AND e.category = 'pipeline_decision'
      AND e.label = 'webhook_agent_routed'
      AND e.payload->>'agentId' = 'godentist'
  );

-- Criterion C: v3 routing
-- Source: webhook-processor.ts:453 emite pipeline_decision · webhook_agent_routed con payload.agentId='somnio-sales-v3'
UPDATE agent_observability_turns AS t
SET responding_agent_id = 'somnio-v3'
WHERE responding_agent_id IS NULL
  AND EXISTS (
    SELECT 1 FROM agent_observability_events e
    WHERE e.turn_id = t.id
      AND e.category = 'pipeline_decision'
      AND e.label = 'webhook_agent_routed'
      AND e.payload->>'agentId' = 'somnio-sales-v3'
  );

-- Criterion D (fallback): no routing event — use entry agent_id
-- Rationale: Pitfall 2 — turns pre-Phase-42.1 / media-gate-ignored / early-handoff
UPDATE agent_observability_turns
SET responding_agent_id = agent_id
WHERE responding_agent_id IS NULL;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERY (Task 2 — usuario la corre post-apply):
--
-- SELECT agent_id, responding_agent_id, COUNT(*)
-- FROM agent_observability_turns
-- GROUP BY 1, 2
-- ORDER BY 1, 2;
--
-- Expected patterns (RESEARCH.md §Open Items §4):
--   ('somnio-v3',        'somnio-v3')            -- non-client conversations
--   ('somnio-v3',        'somnio-recompra-v1')   -- client conversations (BUG FIXED)
--   ('somnio-v2',        'somnio-v2')            -- legacy workspaces
--   ('godentist',        'godentist')            -- godentist workspace
-- Any other pattern = investigate BEFORE continuing.
-- ============================================================================
