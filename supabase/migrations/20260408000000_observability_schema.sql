-- =====================================================================
-- Migration: 20260408000000_observability_schema.sql
-- Phase 42.1: Agent observability (production bots) — Plan 01
-- Date: 2026-04-08
-- Purpose:
--   Crear el schema fundacional del sistema de observabilidad para bots
--   conversacionales en produccion (Somnio V3, GoDentist, Somnio Recompra).
--
--   1 tabla plana (agent_prompt_versions, deduplicada por hash) +
--   4 tablas particionadas por mes (turns, events, queries, ai_calls) +
--   12 particiones iniciales (mes actual + 2 futuros para cada tabla) +
--   2 funciones PL/pgSQL helper para crear/dropear particiones.
--
-- ADDITIVE ONLY: cero ALTER/DROP de tablas existentes.
--
-- REGLA 5: este archivo DEBE aplicarse manualmente en produccion ANTES
-- de que cualquier codigo que lo referencie sea pusheado a Vercel.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Table 1: agent_prompt_versions (NOT partitioned — deduplicated, small)
-- Cada system prompt unico se guarda una vez. Las llamadas IA referencian
-- por prompt_version_id (FK logico, no enforced cross-particion).
-- ---------------------------------------------------------------------
CREATE TABLE agent_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash TEXT NOT NULL UNIQUE,             -- sha256 hex del system_prompt
  system_prompt TEXT NOT NULL,                  -- full text, sin truncar (Decision #8 CONTEXT.md)
  model TEXT NOT NULL,                          -- e.g. 'claude-haiku-4-5-20251001'
  temperature DOUBLE PRECISION,
  max_tokens INTEGER,
  provider TEXT NOT NULL DEFAULT 'anthropic',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', now()),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', now())
);

CREATE INDEX idx_agent_prompt_versions_last_seen
  ON agent_prompt_versions (last_seen_at DESC);

-- ---------------------------------------------------------------------
-- Table 2: agent_observability_turns (partitioned monthly by started_at)
-- Cada turno del agente. Es el "padre" semantico de events/queries/ai_calls
-- via turn_id (FK logico, no enforced cross-particion).
-- ---------------------------------------------------------------------
CREATE TABLE agent_observability_turns (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,                       -- 'somnio-v3' | 'godentist' | 'somnio-recompra'
  turn_number INTEGER,                          -- opcional, si el agente lo trackea
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER GENERATED ALWAYS AS (
    (EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::INTEGER
  ) STORED,
  event_count INTEGER NOT NULL DEFAULT 0,
  query_count INTEGER NOT NULL DEFAULT 0,
  ai_call_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  error JSONB,                                  -- { name, message, stack } | null
  trigger_message_id UUID,                      -- FK-ish a whatsapp_messages
  trigger_kind TEXT,                            -- 'user_message' | 'timer' | 'system_event'
  current_mode TEXT,                            -- snapshot del agent state (entrada)
  new_mode TEXT,                                -- snapshot del agent state (salida)
  PRIMARY KEY (started_at, id)                  -- composite: la columna de particion debe estar en el PK
) PARTITION BY RANGE (started_at);

CREATE INDEX idx_turns_conversation
  ON agent_observability_turns (conversation_id, started_at DESC);
CREATE INDEX idx_turns_workspace_agent
  ON agent_observability_turns (workspace_id, agent_id, started_at DESC);

-- ---------------------------------------------------------------------
-- Table 3: agent_observability_events (partitioned monthly by recorded_at)
-- Timeline generico de eventos del pipeline (classifier, intent, mode,
-- template selection, no-rep, guard, etc.).
-- ---------------------------------------------------------------------
CREATE TABLE agent_observability_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  turn_id UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  sequence INTEGER NOT NULL,                    -- orden global dentro del turn (compartido con queries para timeline unificado)
  category TEXT NOT NULL,                       -- 'classifier' | 'intent' | 'mode_transition' | 'template_selection' | 'no_repetition' | 'guard' | 'block_composition' | 'pre_send_check' | 'timer_signal' | 'handoff' | 'tool_call' | 'error' | ...
  label TEXT,                                   -- short human label
  payload JSONB NOT NULL,                       -- category-specific
  duration_ms INTEGER,                          -- nullable (solo en eventos timed)
  PRIMARY KEY (recorded_at, id)
) PARTITION BY RANGE (recorded_at);

CREATE INDEX idx_events_turn
  ON agent_observability_events (turn_id, sequence);
CREATE INDEX idx_events_category
  ON agent_observability_events (category, recorded_at DESC);

-- ---------------------------------------------------------------------
-- Table 4: agent_observability_queries (partitioned monthly by recorded_at)
-- Queries SQL capturadas por el wrapper de fetch del cliente Supabase.
-- ---------------------------------------------------------------------
CREATE TABLE agent_observability_queries (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  turn_id UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  sequence INTEGER NOT NULL,                    -- secuencia global dentro del turn
  table_name TEXT NOT NULL,                     -- parsed del URL path
  operation TEXT NOT NULL,                      -- 'select' | 'insert' | 'update' | 'delete' | 'rpc'
  filters JSONB,                                -- parsed del query string ?id=eq.1&name=ilike.*foo*
  columns TEXT,                                 -- parsed del ?select=
  request_body JSONB,                           -- para insert/update
  duration_ms INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  row_count INTEGER,                            -- parsed del Content-Range header
  error TEXT,
  PRIMARY KEY (recorded_at, id)
) PARTITION BY RANGE (recorded_at);

CREATE INDEX idx_queries_turn
  ON agent_observability_queries (turn_id, sequence);
CREATE INDEX idx_queries_table
  ON agent_observability_queries (table_name, recorded_at DESC);

-- ---------------------------------------------------------------------
-- Table 5: agent_observability_ai_calls (partitioned monthly by recorded_at)
-- Cada llamada IA del turno (comprehension, classifier, no-rep L2/L3,
-- sticker vision, orchestrator, etc.). prompt_version_id deduplica el
-- system prompt contra agent_prompt_versions.
-- ---------------------------------------------------------------------
CREATE TABLE agent_observability_ai_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  turn_id UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  sequence INTEGER NOT NULL,
  prompt_version_id UUID NOT NULL,              -- FK-ish a agent_prompt_versions(id)
  purpose TEXT NOT NULL,                        -- 'comprehension' | 'classifier' | 'minifrase' | 'no_rep_l2' | 'no_rep_l3' | 'sticker_vision' | 'orchestrator' | ...
  model TEXT NOT NULL,
  messages JSONB NOT NULL,                      -- history + user message enviados
  response_content JSONB,                       -- content blocks de Claude
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (
    input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens
  ) STORED,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  error TEXT,
  PRIMARY KEY (recorded_at, id)
) PARTITION BY RANGE (recorded_at);

CREATE INDEX idx_ai_calls_turn
  ON agent_observability_ai_calls (turn_id, sequence);
CREATE INDEX idx_ai_calls_prompt_version
  ON agent_observability_ai_calls (prompt_version_id, recorded_at DESC);

-- ---------------------------------------------------------------------
-- Particiones iniciales: mes actual (2026-04) + siguientes 2 (2026-05, 2026-06)
-- 4 tablas x 3 meses = 12 particiones
-- ---------------------------------------------------------------------

-- agent_observability_turns
CREATE TABLE agent_observability_turns_202604
  PARTITION OF agent_observability_turns
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE agent_observability_turns_202605
  PARTITION OF agent_observability_turns
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE agent_observability_turns_202606
  PARTITION OF agent_observability_turns
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- agent_observability_events
CREATE TABLE agent_observability_events_202604
  PARTITION OF agent_observability_events
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE agent_observability_events_202605
  PARTITION OF agent_observability_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE agent_observability_events_202606
  PARTITION OF agent_observability_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- agent_observability_queries
CREATE TABLE agent_observability_queries_202604
  PARTITION OF agent_observability_queries
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE agent_observability_queries_202605
  PARTITION OF agent_observability_queries
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE agent_observability_queries_202606
  PARTITION OF agent_observability_queries
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- agent_observability_ai_calls
CREATE TABLE agent_observability_ai_calls_202604
  PARTITION OF agent_observability_ai_calls
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE agent_observability_ai_calls_202605
  PARTITION OF agent_observability_ai_calls
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE agent_observability_ai_calls_202606
  PARTITION OF agent_observability_ai_calls
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- ---------------------------------------------------------------------
-- Helper function: create_observability_partition(target_month DATE)
-- Crea (IF NOT EXISTS) las 4 particiones de un mes objetivo.
-- Llamada por cron mensual (Plan 02 / Plan 09 referenciaran esto).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_observability_partition(target_month DATE)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  suffix TEXT := to_char(target_month, 'YYYYMM');
  start_date DATE := date_trunc('month', target_month);
  end_date DATE := start_date + INTERVAL '1 month';
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS agent_observability_turns_%s PARTITION OF agent_observability_turns FOR VALUES FROM (%L) TO (%L)',
    suffix, start_date, end_date
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS agent_observability_events_%s PARTITION OF agent_observability_events FOR VALUES FROM (%L) TO (%L)',
    suffix, start_date, end_date
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS agent_observability_queries_%s PARTITION OF agent_observability_queries FOR VALUES FROM (%L) TO (%L)',
    suffix, start_date, end_date
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS agent_observability_ai_calls_%s PARTITION OF agent_observability_ai_calls FOR VALUES FROM (%L) TO (%L)',
    suffix, start_date, end_date
  );
END;
$$;

-- ---------------------------------------------------------------------
-- Helper function: drop_observability_partitions_older_than(cutoff DATE)
-- Itera pg_inherits y dropea las particiones cuyo suffix YYYYMM es menor
-- al cutoff. Llamada por cron diario de purga (retencion 30 dias, Decision #3).
-- Retorna la lista de tablas dropeadas para logging.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION drop_observability_partitions_older_than(cutoff DATE)
RETURNS TABLE(dropped_table TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT inhrelid::regclass AS tbl
    FROM pg_inherits
    WHERE inhparent::regclass::text IN (
      'agent_observability_turns',
      'agent_observability_events',
      'agent_observability_queries',
      'agent_observability_ai_calls'
    )
  LOOP
    -- Parsea YYYYMM del nombre de la tabla; dropea si es menor al cutoff
    IF substring(r.tbl::text from '(\d{6})$')::text <
       to_char(cutoff, 'YYYYMM') THEN
      EXECUTE format('DROP TABLE %s', r.tbl);
      dropped_table := r.tbl::text;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- =====================================================================
-- Fin de la migration. Verificacion post-aplicacion (correr a mano):
--
-- SELECT tablename FROM pg_tables
-- WHERE tablename LIKE 'agent_observability%' OR tablename = 'agent_prompt_versions'
-- ORDER BY tablename;
-- -- Debe retornar: agent_prompt_versions + 4 padres + 12 particiones = 17 filas.
--
-- SELECT proname FROM pg_proc
-- WHERE proname IN ('create_observability_partition','drop_observability_partitions_older_than');
-- -- Debe retornar 2 filas.
-- =====================================================================
