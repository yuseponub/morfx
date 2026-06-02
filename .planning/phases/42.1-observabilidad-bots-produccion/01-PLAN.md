---
phase: 42.1-observabilidad-bots-produccion
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260408000000_observability_schema.sql
  - .planning/phases/42.1-observabilidad-bots-produccion/baseline-volume.md
autonomous: false

must_haves:
  truths:
    - "Las 5 tablas del schema de observabilidad existen en produccion (agent_prompt_versions + 4 particionadas por mes)"
    - "Las funciones PL/pgSQL create_observability_partition y drop_observability_partitions_older_than existen en produccion"
    - "Las particiones iniciales (mes actual + 2 futuros) existen para las 4 tablas particionadas"
    - "Existe medicion real de volumen baseline (turns/dia) de los 3 bots documentada"
  artifacts:
    - path: "supabase/migrations/20260408000000_observability_schema.sql"
      provides: "DDL completo del schema particionado + helpers"
      contains: "PARTITION BY RANGE (started_at)"
    - path: ".planning/phases/42.1-observabilidad-bots-produccion/baseline-volume.md"
      provides: "Medicion real de turns/dia por bot antes de activar captura"
  key_links:
    - from: "agent_observability_ai_calls.prompt_version_id"
      to: "agent_prompt_versions.id"
      via: "FK logico (no enforced cross-particion)"
      pattern: "prompt_version_id"
---

<objective>
Crear y aplicar en produccion el schema completo de observabilidad: 1 tabla plana (prompt versions) + 4 tablas particionadas por mes (turns, events, queries, ai_calls), mas helpers PL/pgSQL para crear/purgar particiones. Medir baseline de volumen real antes de migrar para validar que la estrategia mensual es suficiente.

Purpose: El schema es la fundacion de todo el sistema. Debe aplicarse en produccion ANTES de cualquier codigo que lo referencie (REGLA 5).
Output: Migration SQL aplicado en produccion + baseline medido + particiones iniciales listas para recibir writes.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-CONTEXT.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md
@supabase/migrations/
@src/inngest/functions/close-stale-sessions.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Medir baseline de volumen real en produccion</name>
  <files>.planning/phases/42.1-observabilidad-bots-produccion/baseline-volume.md</files>
  <action>
Consultar produccion (Supabase SQL editor o via MCP) para medir volumen real actual de los 3 bots antes de migrar. Ejecutar para cada workspace de Somnio V3, GoDentist y Somnio Recompra:

1. Turns/dia estimado (proxy: mensajes entrantes del cliente procesados por el agente):
   SELECT workspace_id, DATE(timezone('America/Bogota', created_at)) AS dia, COUNT(*)
   FROM whatsapp_messages
   WHERE created_at > now() - interval '7 days'
     AND direction = 'inbound'
   GROUP BY workspace_id, dia
   ORDER BY dia DESC;

2. Identificar workspace_id de cada bot (Somnio V3, GoDentist, Recompra) via `agents` o config de workspace.

3. Promedio y pico de turns/dia por bot sobre 7 dias.

Documentar en baseline-volume.md:
- Tabla con workspace_id, bot_name, turns/dia promedio, turns/dia pico
- Proyeccion mensual estimada (turns * 30)
- Proyeccion de filas/mes en cada tabla del schema (usar multiplicadores: ~12 events/turn, ~8 queries/turn, ~3 ai_calls/turn)
- Veredicto: "monthly partition OK" o "escalar a daily partition si >5x estimate de RESEARCH.md (3K-12K turns/dia)"

Si volumen >5x estimate, PARAR y reportar al usuario antes de migrar — la decision de granularidad de particion debe revisarse.
  </action>
  <verify>
baseline-volume.md existe con tabla de medicion por bot y veredicto explicito sobre estrategia mensual vs daily.
  </verify>
  <done>
Baseline documentado; usuario puede decidir si proceder con particionado mensual (default) o escalar a daily.
  </done>
</task>

<task type="auto">
  <name>Task 2: Crear migration SQL con schema completo</name>
  <files>supabase/migrations/20260408000000_observability_schema.sql</files>
  <action>
Crear archivo de migration siguiendo EXACTAMENTE el schema prescrito en 42.1-RESEARCH.md seccion "Schema Recommendations" (lineas ~395-585). NO inventar variaciones; copiar literal con los siguientes ajustes si aplican:

1. Tabla `agent_prompt_versions` (no particionada): id UUID PK, prompt_hash TEXT UNIQUE, system_prompt TEXT, model, temperature, max_tokens, provider, first_seen_at, last_seen_at. Indice en last_seen_at DESC.

2. Tabla `agent_observability_turns` (PARTITION BY RANGE (started_at)): PK compuesta (started_at, id), campos exactos del research: conversation_id, workspace_id, agent_id, turn_number, started_at, finished_at, duration_ms GENERATED, event_count, query_count, ai_call_count, total_tokens, total_cost_usd NUMERIC(10,6), error JSONB, trigger_message_id, trigger_kind, current_mode, new_mode. Indices: (conversation_id, started_at DESC), (workspace_id, agent_id, started_at DESC).

3. Tabla `agent_observability_events` (PARTITION BY RANGE (recorded_at)): id, turn_id, recorded_at, sequence, category, label, payload JSONB NOT NULL, duration_ms. PK (recorded_at, id). Indices: (turn_id, sequence), (category, recorded_at DESC).

4. Tabla `agent_observability_queries` (PARTITION BY RANGE (recorded_at)): id, turn_id, recorded_at, sequence, table_name, operation, filters JSONB, columns TEXT, request_body JSONB, duration_ms, status_code, row_count, error. PK (recorded_at, id). Indices: (turn_id, sequence), (table_name, recorded_at DESC).

5. Tabla `agent_observability_ai_calls` (PARTITION BY RANGE (recorded_at)): id, turn_id, recorded_at, sequence, prompt_version_id, purpose, model, messages JSONB, response_content JSONB, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, total_tokens GENERATED STORED, cost_usd NUMERIC(10,6), duration_ms, status_code, error. PK (recorded_at, id). Indices: (turn_id, sequence), (prompt_version_id, recorded_at DESC).

6. Particiones iniciales: crear para mes actual (2026-04) + siguientes 2 meses (2026-05, 2026-06) para las 4 tablas particionadas.

7. Funcion PL/pgSQL `create_observability_partition(target_month DATE)` que crea IF NOT EXISTS las 4 particiones para ese mes (copiar literal del research linea 533-559).

8. Funcion PL/pgSQL `drop_observability_partitions_older_than(cutoff DATE)` que itera pg_inherits y dropea las particiones con suffix YYYYMM menor al cutoff (copiar literal del research linea 561-585).

Formato del archivo: comentarios de cabecera indicando Phase 42.1, fecha, proposito. Todas las timestamps default: timezone('America/Bogota', now()). Sin RLS por ahora (Decision #6: solo super-user accede via server action que usa admin client).

IMPORTANTE: NO incluir ningun ALTER/DROP de tablas existentes. Es migration ADDITIVE solamente.
  </action>
  <verify>
Migration file existe, sintaxis SQL valida (validar con `psql --no-psqlrc -f <file> --dry-run` via sqlfluff o lectura manual), contiene las 5 tablas, ambas funciones PL/pgSQL, y 12 particiones iniciales (4 tablas x 3 meses).
  </verify>
  <done>
Archivo listo para aplicar en produccion — pero NO aplicado todavia (ver checkpoint siguiente).
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: CHECKPOINT — Usuario aplica migration en produccion (REGLA 5)</name>
  <what-built>
Migration file `supabase/migrations/20260408000000_observability_schema.sql` listo con 5 tablas + helpers + 12 particiones iniciales. Baseline de volumen medido y documentado.
  </what-built>
  <how-to-verify>
REGLA 5 es BLOQUEANTE: NO se puede mergear ni pushear codigo que referencie este schema hasta que el usuario aplique la migration manualmente en produccion.

Pasos para el usuario:
1. Abrir Supabase Dashboard → SQL Editor del proyecto de morfx en produccion.
2. Copiar el contenido completo de `supabase/migrations/20260408000000_observability_schema.sql`.
3. Ejecutar en una transaccion. Esperar confirmacion "Success".
4. Verificar con:
   ```sql
   SELECT tablename FROM pg_tables
   WHERE tablename LIKE 'agent_observability%' OR tablename = 'agent_prompt_versions'
   ORDER BY tablename;
   ```
   Debe listar: agent_prompt_versions + agent_observability_{turns,events,queries,ai_calls} + 12 particiones `_2026MM`.
5. Verificar funciones:
   ```sql
   SELECT proname FROM pg_proc
   WHERE proname IN ('create_observability_partition','drop_observability_partitions_older_than');
   ```
   Debe retornar 2 filas.
6. Confirmar en el chat: "Migration aplicada en produccion" o describir cualquier error.
  </how-to-verify>
  <resume-signal>Usuario confirma "migration aplicada" o reporta error especifico.</resume-signal>
</task>

</tasks>

<verification>
- Migration SQL file existe y es sintacticamente valido
- Baseline de volumen documentado en baseline-volume.md
- Usuario confirma que migration fue aplicada en produccion
- Queries de verificacion de tablas retornan las 5 tablas esperadas + 12 particiones
</verification>

<success_criteria>
Schema de observabilidad existe en produccion. Fundacion lista para que plans posteriores puedan referenciar las tablas desde codigo sin violar REGLA 5.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-01-SUMMARY.md` con: tabla de baseline, lista de tablas creadas, confirmacion de aplicacion en produccion.
</output>
