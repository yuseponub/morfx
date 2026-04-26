-- =============================================================================
-- agent-lifecycle-router — schema migration (Wave 0)
-- Phase: agent-lifecycle-router (standalone)
--
-- Crea 3 tablas nuevas (routing_rules, routing_facts_catalog, routing_audit_log),
-- agrega columna lifecycle_routing_enabled a workspace_agent_config (Regla 6 default false),
-- seedea facts catalog con 11 facts iniciales documentados.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, INSERT ... ON CONFLICT DO UPDATE.
--
-- Regla 5: apply en Supabase SQL Editor BEFORE pushing Plans 02-06 (ocurre en Plan 07 Task 1).
-- Pitfall 1 (HIGH): UNIQUE INDEX uq_routing_rules_priority es defense critica vs same-priority parallel firing.
-- Pitfall 2 (HIGH): El JSON Schema (rule-v1.schema.json) rechaza el campo `path` en leaf conditions —
--                   este SQL no lo enforce a nivel DB, solo via app-layer validation Ajv.
-- =============================================================================

BEGIN;

-- ============================================================================
-- 1) TABLA routing_rules — reglas declarativas por workspace
-- ============================================================================
CREATE TABLE IF NOT EXISTS routing_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  schema_version  text NOT NULL DEFAULT 'v1',
  rule_type       text NOT NULL CHECK (rule_type IN ('lifecycle_classifier', 'agent_router')),
  name            text NOT NULL,
  priority        integer NOT NULL CHECK (priority BETWEEN 1 AND 100000),
  conditions      jsonb NOT NULL,
  event           jsonb NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at      timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  created_by_user_id  uuid NULL,
  created_by_agent_id text NULL
);

-- Pitfall 1 mitigation (HIGH severity)
CREATE UNIQUE INDEX IF NOT EXISTS uq_routing_rules_priority
  ON routing_rules (workspace_id, rule_type, priority)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_routing_rules_workspace_active
  ON routing_rules (workspace_id, active, priority DESC);

CREATE INDEX IF NOT EXISTS idx_routing_rules_updated_at
  ON routing_rules (workspace_id, updated_at DESC);

-- Trigger updated_at (reuse existing helper)
DROP TRIGGER IF EXISTS update_routing_rules_updated_at ON routing_rules;
CREATE TRIGGER update_routing_rules_updated_at
  BEFORE UPDATE ON routing_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2) TABLA routing_facts_catalog — vocabulario declarativo (D-08)
-- ============================================================================
CREATE TABLE IF NOT EXISTS routing_facts_catalog (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL UNIQUE,
  return_type          text NOT NULL CHECK (return_type IN ('string', 'number', 'boolean', 'string[]', 'null')),
  description          text NOT NULL,
  examples             jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- W-3 fix: gating per rule_type. lifecycle_state solo en agent_router; recompraEnabled solo en agent_router.
  valid_in_rule_types  text[] NOT NULL DEFAULT ARRAY['lifecycle_classifier','agent_router']::text[],
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- W-3 fix: idempotent column add for re-applies of older snapshot
ALTER TABLE routing_facts_catalog
  ADD COLUMN IF NOT EXISTS valid_in_rule_types text[] NOT NULL DEFAULT ARRAY['lifecycle_classifier','agent_router']::text[];

-- ============================================================================
-- 3) TABLA routing_audit_log — cada decision del router (D-06.5 + D-16)
-- ============================================================================
CREATE TABLE IF NOT EXISTS routing_audit_log (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL,
  contact_id               uuid NOT NULL,
  conversation_id          uuid NULL,
  inbound_message_id       uuid NULL,
  decided_at               timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  agent_id                 text NULL,
  reason                   text NOT NULL CHECK (reason IN ('matched', 'human_handoff', 'no_rule_matched', 'fallback_legacy')),
  lifecycle_state          text NOT NULL,
  fired_classifier_rule_id uuid NULL,
  fired_router_rule_id     uuid NULL,
  facts_snapshot           jsonb NOT NULL,
  rule_set_version_at_decision text NULL,
  latency_ms               integer NOT NULL,
  schema_version           text NOT NULL DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS idx_routing_audit_workspace_decided
  ON routing_audit_log (workspace_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_routing_audit_contact
  ON routing_audit_log (contact_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_routing_audit_reason
  ON routing_audit_log (workspace_id, reason, decided_at DESC);

-- ============================================================================
-- 4) ALTER workspace_agent_config — feature flag (D-15 + Regla 6)
-- ============================================================================
ALTER TABLE workspace_agent_config
  ADD COLUMN IF NOT EXISTS lifecycle_routing_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN workspace_agent_config.lifecycle_routing_enabled IS
  'Feature flag D-15. Default false (Regla 6). Cuando true, webhook-processor.ts:174-188 usa router engine; cuando false usa if/else legacy. Flip per-workspace solo despues de parity validation 100%.';

-- ============================================================================
-- 5) RLS — workspace_isolation pattern (siguiendo agent_templates)
-- ============================================================================
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "routing_rules_workspace_isolation" ON routing_rules;
CREATE POLICY "routing_rules_workspace_isolation" ON routing_rules
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

ALTER TABLE routing_facts_catalog ENABLE ROW LEVEL SECURITY;
-- routing_facts_catalog es global (no workspace-scoped) — todos los authenticated leen
DROP POLICY IF EXISTS "routing_facts_catalog_read_all_authenticated" ON routing_facts_catalog;
CREATE POLICY "routing_facts_catalog_read_all_authenticated" ON routing_facts_catalog
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE routing_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "routing_audit_log_workspace_select" ON routing_audit_log;
CREATE POLICY "routing_audit_log_workspace_select" ON routing_audit_log
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- service_role inserts (writer es Plan 02 src/lib/domain/routing.ts via createAdminClient)
DROP POLICY IF EXISTS "routing_audit_log_service_role_insert" ON routing_audit_log;
CREATE POLICY "routing_audit_log_service_role_insert" ON routing_audit_log
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- 6) GRANTs explicitos (LEARNING 1 Phase 44.1 — Studio SQL Editor no hereda grants)
-- ============================================================================
GRANT ALL    ON TABLE public.routing_rules         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.routing_rules TO authenticated;

GRANT ALL    ON TABLE public.routing_facts_catalog TO service_role;
GRANT SELECT ON TABLE public.routing_facts_catalog TO authenticated;

GRANT ALL    ON TABLE public.routing_audit_log    TO service_role;
GRANT SELECT ON TABLE public.routing_audit_log    TO authenticated;

-- ============================================================================
-- 7) SEED routing_facts_catalog — 11 facts iniciales documentados
--    (las funciones resolvers se implementan en Plan 02 src/lib/domain/routing.ts
--     + Plan 03 src/lib/agents/routing/facts.ts)
-- ============================================================================
INSERT INTO routing_facts_catalog (name, return_type, description, examples, valid_in_rule_types) VALUES
  ('activeOrderStage', 'string', 'Stage_kind del pedido activo del contacto. preparation = en preparacion/despacho. transit = carrier ya tiene el paquete. delivered = entregado. null = sin pedido activo.', '[{"value":"preparation","when":"pedido en stage tipo despacho"},{"value":"transit","when":"pedido en stage de transito"},{"value":"delivered","when":"pedido entregado"},{"value":null,"when":"sin pedido activo"}]'::jsonb, ARRAY['lifecycle_classifier','agent_router']),
  ('daysSinceLastDelivery', 'number', 'Dias desde la ultima entrega exitosa del cliente (timezone America/Bogota). null si nunca ha recibido pedido.', '[{"value":3,"when":"recien recibio paquete hace 3 dias"},{"value":45,"when":"compro hace mes y medio"},{"value":null,"when":"prospect sin pedidos"}]'::jsonb, ARRAY['lifecycle_classifier','agent_router']),
  ('daysSinceLastInteraction', 'number', 'Dias desde el ultimo mensaje inbound del contacto (timezone America/Bogota).', '[{"value":1,"when":"escribio ayer"},{"value":15,"when":"hace 15 dias sin interactuar"}]'::jsonb, ARRAY['lifecycle_classifier','agent_router']),
  ('isClient', 'boolean', 'Flag is_client de la tabla contacts. true = ya hizo al menos 1 pedido.', '[{"value":true,"when":"comprador recurrente"},{"value":false,"when":"prospect"}]'::jsonb, ARRAY['lifecycle_classifier','agent_router']),
  ('hasOrderInLastNDays', 'number', 'Cuenta de pedidos activos del contacto en los ultimos N dias (parametro de la regla via params.days).', '[{"value":2,"when":"2 pedidos en ultimos 7 dias"}]'::jsonb, ARRAY['lifecycle_classifier','agent_router']),
  ('tags', 'string[]', 'Array de nombres de tags asociadas al contacto. Combinable con operadores arrayContainsAny / arrayContainsAll / tagMatchesPattern.', '[{"value":["vip","forzar_humano"],"when":"cliente VIP en escalation manual"}]'::jsonb, ARRAY['lifecycle_classifier','agent_router']),
  ('hasPagoAnticipadoTag', 'boolean', 'Shorthand booleano: true si tags contiene exactamente pago_anticipado.', '[{"value":true,"when":"cliente con esquema de pago anticipado"}]'::jsonb, ARRAY['lifecycle_classifier','agent_router']),
  ('isInRecompraPipeline', 'boolean', 'true si el contacto tiene pedido(s) en el pipeline RECOMPRA del workspace.', '[{"value":true,"when":"flujo de recompra activo"}]'::jsonb, ARRAY['lifecycle_classifier','agent_router']),
  ('lastInteractionAt', 'string', 'Timestamp ISO del ultimo mensaje inbound. Combinable con operadores daysSinceAtMost / daysSinceAtLeast.', '[{"value":"2026-04-25T14:30:00-05:00","when":"timestamp del ultimo mensaje"}]'::jsonb, ARRAY['lifecycle_classifier','agent_router']),
  -- W-3 fix: lifecycle_state es runtime fact, solo aplica en Layer 2 (agent_router).
  ('lifecycle_state', 'string', 'Output de Layer 1 (classifier) — runtime fact agregado en Layer 2 (router). NO se computa desde DB; lo set el route.ts entre engines (RESEARCH §Pattern 1).', '[{"value":"in_transit","when":"set runtime por classifier"}]'::jsonb, ARRAY['agent_router']),
  -- B-1 fix: recompraEnabled para regla legacy parity (priority 900) que replica el branch is_client && !recompra_enabled del webhook-processor.ts:174-188. Resolver lee workspace_agent_config.recompra_enabled (Plan 02 domain extension getWorkspaceRecompraEnabled). Solo aplica en agent_router.
  ('recompraEnabled', 'boolean', 'Whether recompra-v1 agent is enabled for this workspace (from workspace_agent_config.recompra_enabled). Used in legacy parity rule (Somnio rollout Plan 07).', '[{"value":true,"when":"recompra agent active for clients"},{"value":false,"when":"recompra disabled — clients route to conversational_agent_id"}]'::jsonb, ARRAY['agent_router'])
ON CONFLICT (name) DO UPDATE SET
  -- W-3 fix: backfill valid_in_rule_types on re-apply (idempotent)
  valid_in_rule_types = EXCLUDED.valid_in_rule_types,
  description = EXCLUDED.description,
  examples = EXCLUDED.examples;

COMMIT;
