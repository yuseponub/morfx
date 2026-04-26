---
phase: agent-lifecycle-router
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/<ts>_agent_lifecycle_router.sql
  - src/lib/agents/routing/schema/rule-v1.schema.json
  - .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md
autonomous: false  # Task 1 require user runs SQL audit/snapshot in Supabase Studio
requirements_addressed: [ROUTER-REQ-01, ROUTER-REQ-07, ROUTER-REQ-09, ROUTER-REQ-10]
user_setup: []  # zero new external services — purely Supabase + npm install handled in Plan 03

must_haves:
  truths:
    - "Archivo de migracion SQL existe en git con: tabla `routing_rules` (con UNIQUE(workspace_id, rule_type, priority) WHERE active=true), `routing_facts_catalog`, `routing_audit_log` (con indice idx_routing_audit_workspace_decided), columna `lifecycle_routing_enabled boolean DEFAULT false` agregada a `workspace_agent_config`, RLS workspace_isolation + GRANTs explicitos a service_role/authenticated."
    - "JSON Schema `rule-v1.schema.json` checked-in y referenciable: schema_version='v1', rule_type enum [lifecycle_classifier|agent_router], lifecycle_state enum con los 8 estados D-03 (new_prospect, order_in_progress, in_transit, just_received, dormant_buyer, abandoned_cart, reactivation_window, blocked), `additionalProperties: false` en leafCondition (rechaza `path` field — Pitfall 2 mitigation)."
    - "Snapshot SQL pre-migracion capturado: total rows en `workspace_agent_config` por workspace + count de tags productivas que el router consumira (forzar_humano, pausar_agente, forzar_sales_v3, forzar_recompra, vip, pago_anticipado) + count de pedidos activos por stage_kind (preparation/transit/delivered) — usado como baseline para parity validation Plan 07."
    - "Migracion NO aplicada en produccion (Regla 5 — apply en Plan 07 Task 1, ANTES del push de Plans 02-06)."
    - "routing_facts_catalog seedeada con minimo 11 facts iniciales documentados (activeOrderStage, daysSinceLastDelivery, daysSinceLastInteraction, isClient, hasOrderInLastNDays, tags, hasPagoAnticipadoTag, isInRecompraPipeline, lastInteractionAt, lifecycle_state, recompraEnabled) — payload `INSERT INTO routing_facts_catalog` literal en la migracion. Cada fact tiene `valid_in_rule_types TEXT[]` indicando en que rule_type puede usarse (lifecycle_classifier, agent_router o ambos) — gating en admin form Plan 06 (W-3 fix)."
    - "Retention policy implementada — rows de `routing_audit_log` con reason='matched' y `created_at < NOW() - INTERVAL '30 days'` se borran automaticamente via Inngest cron `routing-audit-cleanup` (W-7 fix). human_handoff y no_rule_matched se preservan indefinidamente para auditoria."
  artifacts:
    - path: "supabase/migrations/<YYYYMMDDHHMMSS>_agent_lifecycle_router.sql"
      provides: "Schema completo: 3 tablas nuevas (routing_rules, routing_facts_catalog, routing_audit_log) + columna lifecycle_routing_enabled en workspace_agent_config + RLS + GRANTs + seed 11 facts catalog (con valid_in_rule_types) + retention cleanup function"
      contains: "CREATE TABLE routing_rules"
    - path: "src/lib/agents/routing/schema/rule-v1.schema.json"
      provides: "JSON Schema draft 2020-12 para validar rules en write (admin form) y on-load (engine cache reload)"
      contains: "$id"
    - path: ".planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md"
      provides: "Baseline pre-migracion: distribucion actual de tags + pedidos por stage + workspace_agent_config rows. Reusable para parity validation Plan 07 (Somnio rollout)."
      contains: "Snapshot Pre-Migracion"
  key_links:
    - from: "supabase/migrations/<ts>_agent_lifecycle_router.sql"
      to: "schema producido (routing_rules, routing_facts_catalog, routing_audit_log + workspace_agent_config.lifecycle_routing_enabled)"
      via: "CREATE TABLE + ALTER TABLE + INSERT seed"
      pattern: "routing_rules|routing_facts_catalog|routing_audit_log|lifecycle_routing_enabled"
    - from: "src/lib/agents/routing/schema/rule-v1.schema.json"
      to: "Plan 02 src/lib/domain/routing.ts (validacion en write) + Plan 03 src/lib/agents/routing/cache.ts (validacion on-load)"
      via: "Ajv compile import"
      pattern: "rule-v1.schema.json"
    - from: "01-SNAPSHOT.md"
      to: "Plan 07 parity validation Somnio (compara distribucion actual vs router output)"
      via: "Reference baseline para dry-run"
      pattern: "baseline"
---

<objective>
Wave 0 — Schema migration file + JSON Schema + snapshot pre-migracion. Toda la infraestructura SQL y de validacion para que las Waves 1-3 puedan compilar y testear sin tocar produccion. **NO aplica la migracion en prod** (Regla 5: apply en Plan 07 Task 1).

Purpose: (1) Crear las 3 tablas nuevas + columna feature flag + seed catalog en una sola migracion idempotente (siguiendo patron canonico de `20260422142336_crm_stage_integrity.sql`). (2) Materializar el JSON Schema rule-v1 que es el contrato compartido entre domain layer (Plan 02), engine (Plan 03) y admin form (Plan 06). (3) Capturar snapshot baseline para usar como referencia en parity validation Plan 07.

Output: 1 archivo SQL de migracion en `supabase/migrations/`, 1 archivo `rule-v1.schema.json` en `src/lib/agents/routing/schema/`, 1 archivo `01-SNAPSHOT.md` con baseline.

**CRITICAL — Regla 5 strict ordering:** Este plan SOLO crea archivos en git. La aplicacion en prod ocurre en Plan 07 Task 1, antes del push de codigo de Plans 02-06.

**CRITICAL — Pitfall 1 (HIGH severity, RESEARCH §Pitfall 1):** El UNIQUE constraint en `routing_rules` es la primera linea de defensa contra el bug de "same-priority rules both fire" verificado empiricamente en json-rules-engine. NO omitir, NO debilitar (no `WHERE active=true` opcional — incluirlo literal).

**CRITICAL — Pitfall 2 (HIGH severity, CVE-2025-1302):** El `additionalProperties: false` en `leafCondition` del JSON Schema es la enforcement layer contra RCE via `jsonpath-plus`. NO omitir.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-lifecycle-router/CONTEXT.md  # decisiones D-01..D-16 (especialmente D-03 los 8 lifecycle states, D-04 tags, D-08 facts catalog, D-12 schema versionado, D-13 LRU 10s, D-15 feature flag, D-16 3 outputs)
@.planning/standalone/agent-lifecycle-router/RESEARCH.md  # §Standard Stack lineas 74-117 (versions), §Architecture Patterns Pattern 5 lineas 488-517 (audit log shape canonica), §Pitfalls 1-2 lineas 547-583 (UNIQUE constraint + jsonpath-plus CVE), §Code Examples lineas 841-897 (rule-v1.schema.json shape canonica)
@CLAUDE.md  # Regla 5 (migracion antes de deploy — split task), Regla 6 (proteger agente prod — feature flag default false)
@supabase/migrations/20260422142336_crm_stage_integrity.sql  # patron canonico mas reciente: CREATE TABLE + RLS + GRANTs + DO $$ + INSERT seed
@supabase/migrations/20260206000000_agent_templates.sql  # patron simple workspace-scoped table con RLS
@supabase/migrations/20260420000443_platform_config.sql  # patron platform_config si en algun momento se prefiere flag global vs per-workspace
@src/lib/agents/production/agent-config.ts  # tabla workspace_agent_config existente — el ALTER TABLE ADD COLUMN aqui

<interfaces>
<!-- Schema canonico de las 3 tablas nuevas — copiar literal en la migracion -->

<!-- Tabla 1: routing_rules — almacena las reglas declarativas por workspace -->
<!-- Source-of-truth: RESEARCH.md §Architecture Patterns Pattern 5 + §Pitfall 1 + D-12 -->
CREATE TABLE routing_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,                          -- FK conceptual a workspaces (no constraint para evitar coupling)
  schema_version  text NOT NULL DEFAULT 'v1',
  rule_type       text NOT NULL CHECK (rule_type IN ('lifecycle_classifier', 'agent_router')),
  name            text NOT NULL,
  priority        integer NOT NULL CHECK (priority BETWEEN 1 AND 100000),
  -- conditions: top-level all/any/not group con leaf = {fact, operator, value}
  conditions      jsonb NOT NULL,
  -- event: { type: 'route', params: { lifecycle_state | agent_id } }
  event           jsonb NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at      timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  created_by_user_id  uuid NULL,
  created_by_agent_id text NULL                            -- futuro v2 routing-builder
);

-- CRITICAL Pitfall 1 mitigation — same-priority FIRST-hit ambiguity
-- Sin esto, dos reglas con priority=100 ambas disparan onSuccess en paralelo (verified live).
CREATE UNIQUE INDEX uq_routing_rules_priority
  ON routing_rules (workspace_id, rule_type, priority)
  WHERE active = true;

CREATE INDEX idx_routing_rules_workspace_active
  ON routing_rules (workspace_id, active, priority DESC);

CREATE INDEX idx_routing_rules_updated_at
  ON routing_rules (workspace_id, updated_at DESC);  -- para version-column revalidation Plan 03 cache.ts

<!-- Tabla 2: routing_facts_catalog — vocabulario declarativo (D-08) + W-3 valid_in_rule_types -->
CREATE TABLE routing_facts_catalog (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL UNIQUE,                    -- 'activeOrderStage', 'daysSinceLastDelivery', etc.
  return_type          text NOT NULL CHECK (return_type IN ('string', 'number', 'boolean', 'string[]', 'null')),
  description          text NOT NULL,                            -- visible en admin form fact picker
  examples             jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{value: 'transit', when: 'pedido en stage tipo transito'}]
  -- W-3 fix: gating per rule_type. Some facts solo aplican en agent_router (ej: lifecycle_state es runtime fact que solo Layer 2 consume; recompraEnabled solo es input de la regla legacy parity de Layer 2).
  valid_in_rule_types  text[] NOT NULL DEFAULT ARRAY['lifecycle_classifier','agent_router']::text[],
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

<!-- Tabla 3: routing_audit_log — D-06.5 + D-16 audit (cada decision del router) -->
<!-- Source-of-truth: RESEARCH.md §Architecture Patterns Pattern 5 (lineas 488-517) -->
CREATE TABLE routing_audit_log (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL,
  contact_id               uuid NOT NULL,
  conversation_id          uuid NULL,
  inbound_message_id       uuid NULL,
  decided_at               timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  -- Decision (D-16: 3 outputs distintos)
  agent_id                 text NULL,                       -- null = human_handoff o fallback
  reason                   text NOT NULL CHECK (reason IN ('matched', 'human_handoff', 'no_rule_matched', 'fallback_legacy')),
  lifecycle_state          text NOT NULL,
  fired_classifier_rule_id uuid NULL,
  fired_router_rule_id     uuid NULL,
  -- Forensics (RESEARCH §Pattern 5 rationale)
  facts_snapshot           jsonb NOT NULL,                  -- {activeOrderStage: 'transit', tags: [...], isClient: true, ...}
  rule_set_version_at_decision text NULL,                  -- max(updated_at) at decision time
  -- Performance
  latency_ms               integer NOT NULL,
  -- Schema versioning (D-12)
  schema_version           text NOT NULL DEFAULT 'v1'
);

CREATE INDEX idx_routing_audit_workspace_decided
  ON routing_audit_log (workspace_id, decided_at DESC);

CREATE INDEX idx_routing_audit_contact
  ON routing_audit_log (contact_id, decided_at DESC);

CREATE INDEX idx_routing_audit_reason
  ON routing_audit_log (workspace_id, reason, decided_at DESC);  -- para metricas D-16 admin

<!-- Feature flag — D-15 + Regla 6 -->
ALTER TABLE workspace_agent_config
  ADD COLUMN IF NOT EXISTS lifecycle_routing_enabled boolean NOT NULL DEFAULT false;

<!-- Seed inicial del facts catalog — minimo 10 facts (los que Plan 02 implementara como resolvers) -->
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
  -- W-3 fix: lifecycle_state es runtime fact (set por route.ts entre Layer 1 y Layer 2). Solo Layer 2 (agent_router) lo consume — Layer 1 NO debe usarlo en sus conditions porque aun no esta computado.
  ('lifecycle_state', 'string', 'Output de Layer 1 (classifier) — runtime fact agregado en Layer 2 (router). NO se computa desde DB; lo set el route.ts entre engines (RESEARCH §Pattern 1).', '[{"value":"in_transit","when":"set runtime por classifier"}]'::jsonb, ARRAY['agent_router']),
  -- B-1 fix: recompraEnabled es input para la regla legacy parity (priority 900) que replica el if/else `is_client && !recompra_enabled` de webhook-processor.ts:174-188. Solo aplica en agent_router (Layer 2 decision). Resolver lee `workspace_agent_config.recompra_enabled` via domain getWorkspaceRecompraEnabled (Plan 02 extension).
  ('recompraEnabled', 'boolean', 'Whether recompra-v1 agent is enabled for this workspace (from workspace_agent_config.recompra_enabled). Used in legacy parity rule (Somnio rollout Plan 07).', '[{"value":true,"when":"recompra agent active for clients"},{"value":false,"when":"recompra disabled — clients route to conversational_agent_id"}]'::jsonb, ARRAY['agent_router']);
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear archivo de migracion SQL (3 tablas + ALTER + RLS + GRANTs + seed catalog)</name>
  <read_first>
    - .planning/standalone/agent-lifecycle-router/CONTEXT.md §Decisiones D-03 (8 lifecycle states), §D-04 (override tags), §D-08 (facts catalog), §D-12 (schema versionado), §D-15 (feature flag), §D-16 (3 outputs reason field)
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Architecture Patterns Pattern 5 (audit log shape lineas 488-517), §Pitfalls 1-2 (UNIQUE + jsonpath-plus CVE)
    - supabase/migrations/20260422142336_crm_stage_integrity.sql (patron canonico mas reciente: CREATE TABLE + RLS + GRANTs + DO $$ + INSERT seed)
    - supabase/migrations/20260206000000_agent_templates.sql (patron RLS workspace_isolation simple)
    - src/lib/agents/production/agent-config.ts:17-28 (interface AgentConfig — confirmar nombre exacto de columna `workspace_agent_config`)
  </read_first>
  <action>
    **Paso 1 — Generar timestamp** mayor a la ultima migracion verificada (`20260424141545_agent_observability_responding_agent_id.sql`). Usar:
    ```bash
    date -u +%Y%m%d%H%M%S
    ```
    O timestamp fijo `20260425143000` (asegura orden y human-readable).

    **Paso 2 — Crear archivo `supabase/migrations/<ts>_agent_lifecycle_router.sql`** con el contenido literal siguiente. NO paraphrase, NO reordenar, NO "optimizar". Estructura sigue patron `20260422142336_crm_stage_integrity.sql`:

    ```sql
    -- =============================================================================
    -- agent-lifecycle-router — schema migration (Wave 0)
    -- Phase: agent-lifecycle-router (standalone)
    --
    -- Crea 3 tablas nuevas (routing_rules, routing_facts_catalog, routing_audit_log),
    -- agrega columna lifecycle_routing_enabled a workspace_agent_config (Regla 6 default false),
    -- seedea facts catalog con 10 facts iniciales documentados.
    --
    -- Idempotente: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING.
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
    -- 7) SEED routing_facts_catalog — 10 facts iniciales documentados
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
    ```

    **Paso 3 — Verificacion local del SQL** (sintaxis solamente, sin aplicar):
    ```bash
    grep -c "CREATE TABLE IF NOT EXISTS routing_" supabase/migrations/<ts>_agent_lifecycle_router.sql
    # Esperado: 3 (routing_rules, routing_facts_catalog, routing_audit_log)
    grep -c "valid_in_rule_types" supabase/migrations/<ts>_agent_lifecycle_router.sql
    # W-3 fix: esperado >= 13 (1 column def + 1 ALTER + 11 fact rows)
    grep -c "GRANT" supabase/migrations/<ts>_agent_lifecycle_router.sql
    # Esperado: 6 (3 service_role + 3 authenticated)
    grep -q "uq_routing_rules_priority" supabase/migrations/<ts>_agent_lifecycle_router.sql
    # Pitfall 1 mitigation
    grep -q "lifecycle_routing_enabled" supabase/migrations/<ts>_agent_lifecycle_router.sql
    # D-15 feature flag
    ```

    **Paso 4 — Commit local** (NO push):
    ```bash
    git add supabase/migrations/<ts>_agent_lifecycle_router.sql
    git commit -m "migration(agent-lifecycle-router): Wave 0 — schema (routing_rules, routing_facts_catalog, routing_audit_log) + lifecycle_routing_enabled + seed facts"
    ```
  </action>
  <verify>
    <automated>test -f supabase/migrations/*_agent_lifecycle_router.sql</automated>
    <automated>grep -q "CREATE TABLE IF NOT EXISTS routing_rules" supabase/migrations/*_agent_lifecycle_router.sql</automated>
    <automated>grep -q "CREATE TABLE IF NOT EXISTS routing_facts_catalog" supabase/migrations/*_agent_lifecycle_router.sql</automated>
    <automated>grep -q "CREATE TABLE IF NOT EXISTS routing_audit_log" supabase/migrations/*_agent_lifecycle_router.sql</automated>
    <automated>grep -q "uq_routing_rules_priority" supabase/migrations/*_agent_lifecycle_router.sql</automated>
    <automated>grep -q "ADD COLUMN IF NOT EXISTS lifecycle_routing_enabled" supabase/migrations/*_agent_lifecycle_router.sql</automated>
    <automated>grep -q "INSERT INTO routing_facts_catalog" supabase/migrations/*_agent_lifecycle_router.sql</automated>
    <automated>grep -q "GRANT ALL    ON TABLE public.routing_rules         TO service_role" supabase/migrations/*_agent_lifecycle_router.sql</automated>
    <automated>grep -c "ENABLE ROW LEVEL SECURITY" supabase/migrations/*_agent_lifecycle_router.sql | grep -q "3"</automated>
    <automated>git log --oneline -1 | grep -q "Wave 0 — schema"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `supabase/migrations/<ts>_agent_lifecycle_router.sql` existe en git con timestamp posterior a `20260424141545`.
    - Contiene 3 `CREATE TABLE IF NOT EXISTS routing_*` literal.
    - Contiene `CREATE UNIQUE INDEX IF NOT EXISTS uq_routing_rules_priority` con `WHERE active = true` (Pitfall 1 mitigation).
    - Contiene `ALTER TABLE workspace_agent_config ADD COLUMN IF NOT EXISTS lifecycle_routing_enabled boolean NOT NULL DEFAULT false`.
    - Contiene 3 `ENABLE ROW LEVEL SECURITY` (uno por tabla).
    - Contiene 6 GRANT statements (2 por tabla: service_role + authenticated).
    - Contiene `INSERT INTO routing_facts_catalog` con 11 rows minimo (incluye `recompraEnabled` por B-1 fix), todas con `ON CONFLICT (name) DO UPDATE SET valid_in_rule_types = EXCLUDED.valid_in_rule_types, description = EXCLUDED.description, examples = EXCLUDED.examples` para idempotencia + backfill (W-3).
    - Contiene `valid_in_rule_types text[]` column en `routing_facts_catalog` (W-3 fix). `lifecycle_state` y `recompraEnabled` con `ARRAY['agent_router']`; los demas con `ARRAY['lifecycle_classifier','agent_router']`.
    - NO contiene la palabra `apply` (migracion no se aplica en este task).
    - Commit atomico con mensaje exacto.
  </acceptance_criteria>
  <done>
    - Archivo SQL en git, NO aplicado en prod, NO pusheado.
    - Verificacion grep pasa todos los counts.
  </done>
</task>

<task type="auto">
  <name>Task 2: Crear JSON Schema rule-v1.schema.json</name>
  <read_first>
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Code Examples lineas 841-897 (rule-v1.schema.json shape canonica)
    - .planning/standalone/agent-lifecycle-router/RESEARCH.md §Pitfalls 2 lineas 565-583 (jsonpath-plus CVE — additionalProperties:false en leafCondition)
    - .planning/standalone/agent-lifecycle-router/CONTEXT.md §Decisiones D-03 (8 lifecycle states), §D-12 (schema versionado)
  </read_first>
  <action>
    **Paso 1 — Crear directorio** `src/lib/agents/routing/schema/`:
    ```bash
    mkdir -p src/lib/agents/routing/schema
    ```

    **Paso 2 — Crear `src/lib/agents/routing/schema/rule-v1.schema.json`** con el contenido literal siguiente. NOTA: el `additionalProperties: false` en `leafCondition` rechaza el campo `path` (Pitfall 2 mitigation — CVE-2025-1302 RCE surface). NO eliminar.

    ```json
    {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "https://morfx.app/schemas/routing/rule-v1.json",
      "title": "Routing Rule v1",
      "description": "Schema for agent-lifecycle-router rules. Validated on write (admin form) and on-load (engine cache reload). Pitfall 2 mitigation: leafCondition disallows `path` field via additionalProperties:false (jsonpath-plus CVE-2025-1302 RCE surface).",
      "type": "object",
      "required": ["schema_version", "rule_type", "name", "priority", "conditions", "event"],
      "additionalProperties": true,
      "properties": {
        "schema_version": { "const": "v1" },
        "rule_type": { "enum": ["lifecycle_classifier", "agent_router"] },
        "name": { "type": "string", "minLength": 1, "maxLength": 100 },
        "priority": { "type": "integer", "minimum": 1, "maximum": 100000 },
        "conditions": { "$ref": "#/$defs/topLevelCondition" },
        "event": {
          "type": "object",
          "required": ["type", "params"],
          "properties": {
            "type": { "const": "route" },
            "params": {
              "oneOf": [
                {
                  "type": "object",
                  "required": ["lifecycle_state"],
                  "additionalProperties": false,
                  "properties": {
                    "lifecycle_state": {
                      "enum": [
                        "new_prospect",
                        "order_in_progress",
                        "in_transit",
                        "just_received",
                        "dormant_buyer",
                        "abandoned_cart",
                        "reactivation_window",
                        "blocked"
                      ]
                    }
                  }
                },
                {
                  "type": "object",
                  "required": ["agent_id"],
                  "additionalProperties": false,
                  "properties": {
                    "agent_id": { "type": ["string", "null"] }
                  }
                }
              ]
            }
          }
        },
        "active": { "type": "boolean" }
      },
      "$defs": {
        "topLevelCondition": {
          "oneOf": [
            { "type": "object", "required": ["all"], "additionalProperties": false, "properties": { "all": { "type": "array", "items": { "$ref": "#/$defs/anyCondition" } } } },
            { "type": "object", "required": ["any"], "additionalProperties": false, "properties": { "any": { "type": "array", "items": { "$ref": "#/$defs/anyCondition" } } } },
            { "type": "object", "required": ["not"], "additionalProperties": false, "properties": { "not": { "$ref": "#/$defs/anyCondition" } } }
          ]
        },
        "anyCondition": {
          "oneOf": [
            { "$ref": "#/$defs/topLevelCondition" },
            { "$ref": "#/$defs/leafCondition" }
          ]
        },
        "leafCondition": {
          "type": "object",
          "required": ["fact", "operator", "value"],
          "additionalProperties": false,
          "properties": {
            "fact": { "type": "string", "minLength": 1 },
            "operator": {
              "type": "string",
              "enum": [
                "equal", "notEqual",
                "lessThan", "lessThanInclusive",
                "greaterThan", "greaterThanInclusive",
                "in", "notIn",
                "contains", "doesNotContain",
                "daysSinceAtMost", "daysSinceAtLeast",
                "tagMatchesPattern",
                "arrayContainsAny", "arrayContainsAll"
              ]
            },
            "value": {}
          }
        }
      }
    }
    ```

    **Paso 3 — Verificacion local sintaxis JSON**:
    ```bash
    node -e "JSON.parse(require('fs').readFileSync('src/lib/agents/routing/schema/rule-v1.schema.json', 'utf-8'))"
    # Si no hay output, JSON es valido. Si hay error, archivo malformado.
    ```

    **Paso 4 — Commit local** (NO push):
    ```bash
    git add src/lib/agents/routing/schema/rule-v1.schema.json
    git commit -m "schema(agent-lifecycle-router): Wave 0 — JSON Schema rule-v1 (8 lifecycle states + 15 operators + Pitfall 2 mitigation)"
    ```
  </action>
  <verify>
    <automated>test -f src/lib/agents/routing/schema/rule-v1.schema.json</automated>
    <automated>node -e "JSON.parse(require('fs').readFileSync('src/lib/agents/routing/schema/rule-v1.schema.json','utf-8'))"</automated>
    <automated>grep -q "additionalProperties.*false" src/lib/agents/routing/schema/rule-v1.schema.json</automated>
    <automated>grep -q "new_prospect" src/lib/agents/routing/schema/rule-v1.schema.json</automated>
    <automated>grep -q "reactivation_window" src/lib/agents/routing/schema/rule-v1.schema.json</automated>
    <automated>grep -q "blocked" src/lib/agents/routing/schema/rule-v1.schema.json</automated>
    <automated>grep -q "daysSinceAtMost" src/lib/agents/routing/schema/rule-v1.schema.json</automated>
    <automated>grep -q "tagMatchesPattern" src/lib/agents/routing/schema/rule-v1.schema.json</automated>
    <automated>! grep -q '"path"' src/lib/agents/routing/schema/rule-v1.schema.json</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `src/lib/agents/routing/schema/rule-v1.schema.json` existe y es JSON parseable.
    - `$id: "https://morfx.app/schemas/routing/rule-v1.json"` presente.
    - `leafCondition` tiene `additionalProperties: false` (Pitfall 2 mitigation — rechaza campo `path`).
    - `schema_version` es `const: "v1"` (no enum, no string).
    - `rule_type` enum tiene exactamente `["lifecycle_classifier", "agent_router"]`.
    - `lifecycle_state` enum tiene los 8 estados D-03 textual: new_prospect, order_in_progress, in_transit, just_received, dormant_buyer, abandoned_cart, reactivation_window, blocked.
    - `operator` enum incluye los custom operators que registrara Plan 03 (daysSinceAtMost, daysSinceAtLeast, tagMatchesPattern, arrayContainsAny, arrayContainsAll) ademas de los stock json-rules-engine.
    - El string `"path"` NO aparece en el schema (defensa explicita Pitfall 2).
    - Commit atomico con mensaje exacto.
  </acceptance_criteria>
  <done>
    - JSON Schema en git, parseable, contiene los 8 lifecycle states + Pitfall 2 mitigation.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Snapshot pre-migracion + audit baseline (HUMAN runs SQL)</name>
  <read_first>
    - .planning/standalone/agent-lifecycle-router/CONTEXT.md §code_context Reusable Assets (workspace_agent_config existe, tags productivas existen)
    - supabase/migrations/<ts>_agent_lifecycle_router.sql (creado en Task 1 — ya esta en git)
  </read_first>
  <what-built>
    Las queries SQL para capturar baseline pre-migracion. Claude crea el archivo `01-audit.sql` en el directorio del phase (NO commit, archivo de trabajo) y el template `01-SNAPSHOT.md`. El humano corre las queries en Supabase SQL Editor de produccion y pega los outputs en `01-SNAPSHOT.md`.
  </what-built>
  <action>
    **Paso 1 — Crear `.planning/standalone/agent-lifecycle-router/01-audit.sql`** (archivo NO commiteado, solo trabajo):

    ```sql
    -- ============================================================================
    -- agent-lifecycle-router — Snapshot pre-migracion + audit baseline
    -- Run en Supabase SQL Editor de PRODUCCION antes de aplicar la migracion (Plan 07 Task 1).
    -- Outputs se pegan verbatim en .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md
    -- ============================================================================

    -- Query 1: workspace_agent_config baseline (cuantos workspaces, recompra_enabled distribution)
    SELECT
      COUNT(*) AS total_workspaces_with_config,
      SUM(CASE WHEN agent_enabled THEN 1 ELSE 0 END) AS agent_enabled_count,
      SUM(CASE WHEN recompra_enabled THEN 1 ELSE 0 END) AS recompra_enabled_count,
      array_agg(DISTINCT conversational_agent_id) AS conversational_agents_in_use
    FROM workspace_agent_config;

    -- Query 2: tags productivas que el router consumira (contar quantos contactos tiene cada una)
    SELECT
      t.name AS tag_name,
      COUNT(DISTINCT ct.contact_id) AS contacts_with_tag
    FROM tags t
    LEFT JOIN contact_tags ct ON ct.tag_id = t.id
    WHERE t.name IN (
      'forzar_humano', 'pausar_agente', 'forzar_sales_v3', 'forzar_recompra',
      'vip', 'pago_anticipado',
      'WPP', 'P/W', 'RECO'  -- skip-tags actuales del webhook-handler.ts:91 (referencia)
    )
    GROUP BY t.name, t.workspace_id
    ORDER BY contacts_with_tag DESC;

    -- Query 3: distribucion actual de pedidos activos por stage_kind (baseline para parity)
    SELECT
      s.kind AS stage_kind,
      COUNT(*) AS active_orders
    FROM orders o
    JOIN stages s ON s.id = o.stage_id
    WHERE o.archived_at IS NULL
      AND o.created_at > NOW() - INTERVAL '30 days'
    GROUP BY s.kind
    ORDER BY active_orders DESC;

    -- Query 4: contactos is_client en Somnio workspace (D-15 parity reference)
    -- Reemplaza con tu workspace ID; Somnio = a3843b3f-c337-4836-92b5-89c58bb98490
    SELECT
      workspace_id,
      COUNT(*) AS total_contacts,
      SUM(CASE WHEN is_client THEN 1 ELSE 0 END) AS clients,
      SUM(CASE WHEN NOT is_client OR is_client IS NULL THEN 1 ELSE 0 END) AS prospects
    FROM contacts
    WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
    GROUP BY workspace_id;

    -- Query 5: ultimos 30 dias de mensajes inbound de Somnio (input para dry-run Plan 07)
    SELECT
      DATE_TRUNC('day', m.created_at AT TIME ZONE 'America/Bogota') AS day,
      COUNT(*) AS inbound_messages,
      COUNT(DISTINCT m.conversation_id) AS distinct_conversations
    FROM whatsapp_messages m
    WHERE m.workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
      AND m.direction = 'inbound'
      AND m.created_at > NOW() - INTERVAL '30 days'
    GROUP BY DATE_TRUNC('day', m.created_at AT TIME ZONE 'America/Bogota')
    ORDER BY day DESC;
    ```

    **Paso 2 — Crear `.planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md`** con el template:

    ```markdown
    # Snapshot Pre-Migracion — agent-lifecycle-router

    **Fecha captura:** <YYYY-MM-DD HH:MM:SS America/Bogota>
    **Proposito:** Baseline para parity validation Plan 07 (Somnio rollout) + evidencia de estado pre-router.

    ## Query 1: workspace_agent_config baseline

    | total_workspaces_with_config | agent_enabled_count | recompra_enabled_count | conversational_agents_in_use |
    |------------------------------|---------------------|------------------------|------------------------------|
    | <pegar output exacto> | | | |

    ## Query 2: tags productivas

    | tag_name | contacts_with_tag |
    |----------|-------------------|
    | <pegar output exacto> | |

    ## Query 3: distribucion pedidos activos por stage_kind

    | stage_kind | active_orders |
    |------------|---------------|
    | <pegar output exacto> | |

    ## Query 4: contactos is_client Somnio

    | workspace_id | total_contacts | clients | prospects |
    |--------------|----------------|---------|-----------|
    | <pegar output exacto> | | | |

    ## Query 5: ultimos 30 dias inbound Somnio

    | day | inbound_messages | distinct_conversations |
    |-----|------------------|------------------------|
    | <pegar output exacto> | | |

    ## Decision

    - [ ] Snapshot capturado, todas las queries devolvieron data esperada — proceder a Wave 1.
    - [ ] FALLA: queries devolvieron data inesperada (workspace_agent_config vacia, contacts sin tags, etc.) — escalar a usuario, NO proceder.
    ```

    **Paso 3 — Pedir al usuario:**
    > Necesito que corras las 5 queries en `.planning/standalone/agent-lifecycle-router/01-audit.sql` en Supabase SQL Editor de PRODUCCION (no staging). Pega los outputs verbatim en `01-SNAPSHOT.md` y marca la checkbox de Decision. Esto es baseline necesario para Plan 07 (parity validation Somnio antes de flip flag ON).

    **Paso 4 — Commit el SNAPSHOT.md** (con outputs ya pegados; el `01-audit.sql` queda local, no commit):
    ```bash
    git add .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md
    git commit -m "docs(agent-lifecycle-router): Wave 0 — snapshot baseline pre-migracion (Plan 07 reference)"
    ```
  </action>
  <how-to-verify>
    1. Verificar que `01-audit.sql` existe en el directorio del phase con las 5 queries.
    2. Verificar que `01-SNAPSHOT.md` existe con outputs reales (no placeholders).
    3. Confirmar que la seccion "Decision" tiene la checkbox marcada.
    4. Si Decision = FALLA, escalar al usuario antes de Wave 1.
  </how-to-verify>
  <verify>
    <automated>test -f .planning/standalone/agent-lifecycle-router/01-audit.sql</automated>
    <automated>test -f .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md</automated>
    <automated>grep -q "workspace_agent_config" .planning/standalone/agent-lifecycle-router/01-audit.sql</automated>
    <automated>grep -q "Snapshot Pre-Migracion" .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md</automated>
    <automated>! grep -q "<pegar output exacto>" .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md</automated>
  </verify>
  <acceptance_criteria>
    - `01-audit.sql` existe con 5 queries (workspace_agent_config, tags, orders by stage_kind, Somnio contacts, Somnio inbound 30d).
    - `01-SNAPSHOT.md` committed con outputs pegados (no quedan placeholders `<pegar output exacto>`).
    - La seccion "Decision" tiene una de las 2 checkboxes marcada.
    - Si Decision = FALLA: parar Wave 0, NO avanzar a Wave 1.
  </acceptance_criteria>
  <resume-signal>
    Type "approved — proceed to Wave 1" o describir issues encontrados.
  </resume-signal>
  <done>
    - Baseline capturado y commiteado.
    - Wave 0 termina sin aplicar nada en prod (Regla 5).
  </done>
</task>

<task type="auto">
  <name>Task 4: Add Inngest cron retention cleanup for routing_audit_log (W-7 fix)</name>
  <read_first>
    - .claude/rules/agent-scope.md (busca `crm-bot-expire-proposals` — patron Inngest cron usado por crm-writer; replicar mismo patron)
    - src/inngest/functions/ (verificar archivos existentes — confirmar nombre del export pattern, ej: `crm-bot-expire-proposals`)
    - src/inngest/client.ts (confirmar como se registran inngest functions)
  </read_first>
  <action>
    **Paso 1 — Ubicar el patron Inngest cron del proyecto.** Buscar archivos que tengan `cron:` en su definicion:
    ```bash
    grep -rn "cron:" src/inngest/functions/ | head -20
    ```
    Usar como template el archivo cron mas reciente (ej: `crm-bot-expire-proposals` referenciado en `.claude/rules/agent-scope.md`).

    **Paso 2 — Crear `src/inngest/functions/routing-audit-cleanup.ts`** siguiendo ese patron:

    ```typescript
    /**
     * Inngest cron — routing-audit-cleanup (W-7 fix, agent-lifecycle-router)
     *
     * Daily cleanup of `routing_audit_log` rows that are older than 30 days
     * AND have reason = 'matched'. Other reasons (human_handoff, no_rule_matched,
     * fallback_legacy) are preserved indefinitely for audit/forensics.
     *
     * Schedule: daily at 03:00 America/Bogota (08:00 UTC).
     */

    import { inngest } from '@/inngest/client'
    import { createAdminClient } from '@/lib/supabase/admin'

    export const routingAuditCleanup = inngest.createFunction(
      { id: 'routing-audit-cleanup', name: 'Routing audit log retention (30d for matched)' },
      { cron: 'TZ=America/Bogota 0 3 * * *' },
      async ({ step }) => {
        const deleted = await step.run('delete-old-matched-rows', async () => {
          const supabase = createAdminClient()
          const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString()
          const { count, error } = await supabase
            .from('routing_audit_log')
            .delete({ count: 'exact' })
            .eq('reason', 'matched')
            .lt('created_at', cutoff)
          if (error) throw error
          return count ?? 0
        })

        return { deleted, retentionPolicyDays: 30, scope: "reason='matched'" }
      },
    )
    ```

    **Paso 3 — Registrar la function en el array de functions** que Inngest serve handler exporta. Ubicar el archivo (probablemente `src/inngest/index.ts` o `src/app/api/inngest/route.ts`) y agregar `routingAuditCleanup` al array.

    **Paso 4 — Documentar la retention policy** en `01-SNAPSHOT.md` agregando una seccion al final:

    ```markdown
    ## Retention Policy (W-7 fix)

    - **Tabla:** routing_audit_log
    - **Cleanup function:** Inngest cron `routing-audit-cleanup` (daily 03:00 Bogota)
    - **Borra:** rows con `reason='matched'` AND `created_at < NOW() - INTERVAL '30 days'`
    - **Preserva indefinidamente:** `human_handoff`, `no_rule_matched`, `fallback_legacy` (audit forensics)
    ```

    **Paso 5 — Commit:**
    ```bash
    git add src/inngest/functions/routing-audit-cleanup.ts <archivo de registro de inngest functions> .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md
    git commit -m "chore(agent-lifecycle-router): Wave 0 Task 4 — Inngest cron routing-audit-cleanup (W-7 retention 30d matched only)"
    ```
  </action>
  <verify>
    <automated>test -f src/inngest/functions/routing-audit-cleanup.ts</automated>
    <automated>grep -q "routing-audit-cleanup" src/inngest/functions/routing-audit-cleanup.ts</automated>
    <automated>grep -q "cron: 'TZ=America/Bogota" src/inngest/functions/routing-audit-cleanup.ts</automated>
    <automated>grep -q "reason.*matched" src/inngest/functions/routing-audit-cleanup.ts</automated>
    <automated>grep -q "30 \* 86_400_000\|INTERVAL '30 days'\|30 \* 86400000" src/inngest/functions/routing-audit-cleanup.ts</automated>
    <automated>grep -q "routingAuditCleanup" $(grep -rln "inngest.createFunction\|serve" src/app/api/inngest/ src/inngest/index.ts 2>/dev/null | head -1)</automated>
    <automated>grep -q "Retention Policy" .planning/standalone/agent-lifecycle-router/01-SNAPSHOT.md</automated>
    <automated>npx tsc --noEmit src/inngest/functions/routing-audit-cleanup.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/inngest/functions/routing-audit-cleanup.ts` existe con Inngest createFunction.
    - cron: `TZ=America/Bogota 0 3 * * *` (daily 3am Bogota).
    - DELETE filtra `reason='matched'` AND `created_at < NOW() - INTERVAL '30 days'` exclusivamente.
    - Function registrada en el handler de Inngest del proyecto.
    - `01-SNAPSHOT.md` documenta la retention policy bajo seccion "Retention Policy (W-7 fix)".
    - tsc compila.
  </acceptance_criteria>
  <done>
    - Retention policy implementada via Inngest cron — Plan 07 truths puede afirmar "matched rows >30d auto-deleted".
  </done>
</task>

</tasks>

<verification>
- Migracion file en git con timestamp posterior al ultimo aplicado en prod.
- JSON Schema parseable, con Pitfall 2 mitigation explicita.
- Snapshot baseline capturado para uso en Plan 07.
- NADA aplicado en produccion en Wave 0.
</verification>

<success_criteria>
- 3 archivos creados y committed: SQL migration, JSON schema, SNAPSHOT.md.
- Wave 1 puede empezar (Plans 02 + 03 referencian rule-v1.schema.json y conocen el shape de las tablas).
- Plan 07 tiene baseline para parity validation.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-lifecycle-router/01-SUMMARY.md` documentando:
- Timestamp exacto del archivo de migracion creado.
- Total facts seedeados (esperado: 10).
- Resultado del snapshot baseline (workspaces totales, distribucion tags, orders por stage_kind).
- Confirmacion de que Wave 1 puede empezar.
</output>
