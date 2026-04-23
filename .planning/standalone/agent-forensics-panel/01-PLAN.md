---
phase: agent-forensics-panel
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/<ts>_agent_observability_responding_agent_id.sql
  - src/lib/observability/collector.ts
  - src/lib/observability/flush.ts
  - src/lib/observability/repository.ts
  - src/inngest/functions/agent-production.ts
  - src/lib/agents/production/webhook-processor.ts
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx
  - next.config.ts
  - src/lib/observability/__tests__/collector.responding.test.ts
  - src/lib/observability/__tests__/flush.responding.test.ts
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/__tests__/get-display-agent-id.test.ts
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/get-display-agent-id.ts
autonomous: false

decisions_addressed: [D-10, D-11, D-12]

must_haves:
  truths:
    - "Archivo de migracion SQL existe en git con ALTER TABLE ADD COLUMN responding_agent_id TEXT NULL + indice parcial + 4 UPDATE backfills cascading segun RESEARCH.md §Open Items §4 (literal)"
    - "Migracion aplicada en Supabase production ANTES del push de codigo (Regla 5). Usuario confirma via checkpoint humano bloqueante ejecutando query de verificacion SELECT agent_id, responding_agent_id, COUNT(*) GROUP BY y reportando ausencia de patrones sospechosos"
    - "ObservabilityCollector expone setter mutable `respondingAgentId: AgentId | null` + `setRespondingAgentId(id)` idempotente-sobre-misma-valor, defensive try/catch swallow (Regla 6 never-throw)"
    - "flush.ts INSERT incluye `responding_agent_id: collector.respondingAgentId ?? null` preservando el shape existente (Pitfall 1 addressed via __obs merge en agent-production.ts)"
    - "TurnSummary + TurnDetail.turn types exponen `respondingAgentId: string | null` + repository SELECT incluye la columna"
    - "agent-production.ts propaga `respondingAgentId` a traves de step.run via __obs return payload (fix Pitfall 1 — ALS no sobrevive replay)"
    - "webhook-processor.ts llama `getCollector()?.setRespondingAgentId(...)` ANTES de cada `runner.processMessage(...)` en los 3 branches (recompra / v3 / godentist) — set-before-run asegura captura aun con throw (Anti-Pattern RESEARCH.md line 470)"
    - "turn-list.tsx renderiza `getDisplayAgentId(turn)` que devuelve `respondingAgentId ?? agentId` (bug visual resuelto)"
    - "next.config.ts incluye `outputFileTracingIncludes` para `/api/agent-forensics/audit` apuntando a `./src/lib/agent-specs/**/*.md` (Pitfall 3 — pre-registrado para Plans 03/04 aunque los archivos aun no existen)"
    - "Tests en vitest verifican: collector setter idempotency + second-value-ignore, flush INSERT incluye responding_agent_id, getDisplayAgentId fallback logic"
    - "Push a Vercel ocurre SOLO despues del checkpoint humano (Regla 5 strict)"
  artifacts:
    - path: "supabase/migrations/<YYYYMMDDHHMMSS>_agent_observability_responding_agent_id.sql"
      provides: "DDL + backfill idempotente: ALTER TABLE ADD COLUMN IF NOT EXISTS + partial index + 4 UPDATE criterios cascading"
      contains: "responding_agent_id"
    - path: "src/lib/observability/collector.ts"
      provides: "setRespondingAgentId setter mutable con defensive swallow"
      contains: "setRespondingAgentId"
    - path: "src/lib/observability/flush.ts"
      provides: "INSERT extendido con responding_agent_id"
      contains: "responding_agent_id: collector.respondingAgentId"
    - path: "src/lib/observability/repository.ts"
      provides: "TurnSummary.respondingAgentId + select projection"
      contains: "respondingAgentId"
    - path: "src/inngest/functions/agent-production.ts"
      provides: "__obs step-boundary merge extendido con respondingAgentId (fix Pitfall 1)"
      contains: "respondingAgentId: stepCollector.respondingAgentId"
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "3 setRespondingAgentId calls antes de runner.processMessage"
      contains: "setRespondingAgentId"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx"
      provides: "Render actualizado: respondingAgentId ?? agentId"
      contains: "getDisplayAgentId"
    - path: "next.config.ts"
      provides: "outputFileTracingIncludes entry para bundle agent-specs .md files"
      contains: "outputFileTracingIncludes"
  key_links:
    - from: "src/lib/agents/production/webhook-processor.ts (3 branches)"
      to: "src/lib/observability/collector.ts setRespondingAgentId"
      via: "getCollector()?.setRespondingAgentId(agentId) BEFORE runner.processMessage"
      pattern: "setRespondingAgentId\\('(somnio-recompra-v1|somnio-v3|godentist)'\\)"
    - from: "src/inngest/functions/agent-production.ts step.run"
      to: "outer collector.setRespondingAgentId (post-step merge)"
      via: "__obs return payload encodes stepCollector.respondingAgentId"
      pattern: "stepResult.__obs\\?\\.respondingAgentId"
    - from: "src/lib/observability/flush.ts INSERT"
      to: "agent_observability_turns.responding_agent_id column"
      via: "supabase.from('agent_observability_turns').insert({ ..., responding_agent_id: collector.respondingAgentId ?? null })"
      pattern: "responding_agent_id:"
    - from: "src/app/.../turn-list.tsx render"
      to: "TurnSummary.respondingAgentId field"
      via: "getDisplayAgentId(turn) = turn.respondingAgentId ?? turn.agentId"
      pattern: "respondingAgentId \\?\\? .*agentId"
---

<objective>
Wave 0 — Fix del bug de etiquetado (D-12 pre-requisito bloqueante del resto de la fase). Agrega columna `responding_agent_id` a `agent_observability_turns` (D-10 Opcion B), backfillea rows historicas con criterios cascading (D-11), expone setter en el collector, persiste el valor via Inngest step-boundary merge (fix Pitfall 1 — ALS no sobrevive replays), captura el routing en los 3 branches de webhook-processor (recompra / v3 / godentist), renderiza `respondingAgentId ?? agentId` en turn-list, y pre-registra `outputFileTracingIncludes` en next.config para que Plans 03/04 puedan bundle los spec files.

Purpose: resolver el sub-bug descubierto durante discovery (todos los turns de recompra se muestran como `somnio-v3` en el panel) ANTES de construir el panel forensics encima — el panel y el auditor dependen de que `responding_agent_id` este poblado correctamente. D-12 lo marca como primer plan.

Output: 1 migracion SQL aplicada en prod + 7 archivos de codigo modificados + 3 archivos de test nuevos + commit atomico + push ATRASADO hasta despues del checkpoint humano.

**CRITICAL — Regla 5 strict:** La migracion SQL se aplica en Supabase SQL Editor de produccion en Task 2 (checkpoint humano bloqueante). SOLO despues de confirmacion explicita del usuario se ejecutan Tasks 3-8 que modifican codigo runtime. Task 9 hace `git push` — hasta entonces todo queda en commits locales.

**CRITICAL — Regla 6:** Ningun cambio altera el COMPORTAMIENTO conversacional de los 3 bots. La columna `responding_agent_id` es aditiva (NULL default). Los setters se llaman antes de `runner.processMessage` — si fallan, el runner sigue corriendo; el collector swallowea (Pitfall 1 never-throw). El fallback `responding_agent_id ?? agent_id` preserva visual anterior.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-forensics-panel/CONTEXT.md — sub-bug diagnosis + open-questions §Bug de etiquetado
@.planning/standalone/agent-forensics-panel/DISCUSSION-LOG.md — D-10, D-11, D-12 locked
@.planning/standalone/agent-forensics-panel/RESEARCH.md §Summary, §Pattern 1 (Partitioned-table ALTER + backfill), §Pattern 2 (Collector setter for mid-turn mutation), §Pitfall 1 (ALS context lost across step.run), §Pitfall 2 (Backfill criterion false-negatives), §Pitfall 3 (Spec file bundling), §Pitfall 8 (Partial index), §Open Items §3 (Column spec), §Open Items §4 (Backfill criterion with verification query)
@.planning/standalone/agent-forensics-panel/PATTERNS.md §Migration (Plan 01), §Observability writeback (Plan 01), §Shared Patterns (Inngest step-boundary merge, Regla 6 defensive)
@CLAUDE.md §Regla 5 (migracion antes de deploy), §Regla 6 (proteger agente en produccion), §Regla 2 (timezone America/Bogota — N/A aqui pero relevante si se tocan timestamps)
@supabase/migrations/20260408000000_observability_schema.sql — canonica del table + partitions
@supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql — patron header + idempotencia + Regla 5 reminder
@src/lib/observability/collector.ts — clase a modificar (lineas 71-102 identity, 108-126 recordEvent defensive, 209-283 mergeFrom)
@src/lib/observability/flush.ts — INSERT shape lineas 110-133
@src/lib/observability/repository.ts — TurnSummary lineas 28-45, listTurnsForConversation lineas 63-98, getTurnDetail lineas 220-322
@src/inngest/functions/agent-production.ts — collector lineas 106-115, __obs merge lineas 313-366
@src/lib/agents/production/webhook-processor.ts — branch recompra line 220-240 (before runner.processMessage line 240), V3 line 439-442, godentist line 462-465
@src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx — render line 156

<interfaces>
<!-- Current schema (VERIFIED supabase/migrations/20260408000000_observability_schema.sql:41-72) -->
CREATE TABLE agent_observability_turns (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  turn_number INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  event_count INTEGER NOT NULL DEFAULT 0,
  query_count INTEGER NOT NULL DEFAULT 0,
  ai_call_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  error JSONB,
  trigger_message_id TEXT,
  trigger_kind TEXT,
  current_mode TEXT,
  new_mode TEXT,
  PRIMARY KEY (started_at, id)
) PARTITION BY RANGE (started_at);

<!-- DELTA (Plan 01 adds): -->
ALTER TABLE agent_observability_turns ADD COLUMN IF NOT EXISTS responding_agent_id TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_turns_responding_agent
  ON agent_observability_turns (responding_agent_id, started_at DESC)
  WHERE responding_agent_id IS NOT NULL;

<!-- TurnSummary type (BEFORE — repository.ts:28-45) -->
export interface TurnSummary {
  id: string
  conversationId: string
  workspaceId: string
  agentId: string
  // ... (existing fields unchanged)
}

<!-- TurnSummary type (AFTER) -->
export interface TurnSummary {
  id: string
  conversationId: string
  workspaceId: string
  agentId: string
  respondingAgentId: string | null  // NEW
  // ... (rest unchanged)
}

<!-- ObservabilityCollector delta -->
export class ObservabilityCollector {
  readonly agentId: AgentId           // unchanged — entry agent
  respondingAgentId: AgentId | null   // NEW — mutable, set by routing branches

  setRespondingAgentId(id: AgentId): void {
    try {
      if (this.respondingAgentId && this.respondingAgentId !== id) return  // idempotent-same, ignore-different
      this.respondingAgentId = id
    } catch {
      // Regla 6: defensive never-throw
    }
  }
}

<!-- webhook-processor.ts insertion points (VERIFIED via grep) -->
// Recompra branch: BEFORE line 240 runner.processMessage (after recordEvent recompra_routed at line 192)
// V3 branch:       BEFORE line 442 runner.processMessage
// GoDentist branch: BEFORE line 465 runner.processMessage
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear archivo de migracion SQL `supabase/migrations/<ts>_agent_observability_responding_agent_id.sql` (NO aplicar aun)</name>
  <read_first>
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Pattern 1 (SQL canonico lineas 243-298), §Open Items §3 (Column spec), §Open Items §4 (Backfill criterion cascading), §Pitfall 2 (false-negative fallback), §Pitfall 8 (partial index)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §Migration (header convention, idempotency, backfill pattern)
    - supabase/migrations/20260408000000_observability_schema.sql (schema canonico a extender — lineas 41-72)
    - supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql (header + idempotencia + Regla 5 reminder — template a copiar)
    - CLAUDE.md §Regla 5
    - ls -t supabase/migrations/ (ultima aplicada: 20260423152233_recompra_saludo_hotfix.sql — timestamp nuevo DEBE ser mayor)
  </read_first>
  <action>
    **Paso 1 — Generar timestamp mayor al ultimo aplicado** (`20260423152233`). Usar `date -u +%Y%m%d%H%M%S` o fijar `20260424100000`.

    **Paso 2 — Crear archivo** `supabase/migrations/<ts>_agent_observability_responding_agent_id.sql` con el siguiente contenido **literal** (copia de RESEARCH.md §Pattern 1 + §Open Items §4, NO paraphrase, NO reordenar):

    ```sql
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
    ```

    **Paso 3 — Commit atomico** (NO push, NO apply):

    ```bash
    git add supabase/migrations/<ts>_agent_observability_responding_agent_id.sql
    git commit -m "feat(agent-forensics-panel): Plan 01 Task 1 — migracion SQL responding_agent_id + backfill (D-10, D-11)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```

    NO hay push — Task 2 es checkpoint humano que aplica el SQL en prod antes de avanzar.
  </action>
  <verify>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_agent_observability_responding_agent_id\.sql$' | head -1); test -n "$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_agent_observability_responding_agent_id\.sql$' | head -1); grep -q "ADD COLUMN IF NOT EXISTS responding_agent_id TEXT NULL" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_agent_observability_responding_agent_id\.sql$' | head -1); grep -q "idx_turns_responding_agent" "supabase/migrations/$MIG" && grep -q "WHERE responding_agent_id IS NOT NULL" "supabase/migrations/$MIG"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_agent_observability_responding_agent_id\.sql$' | head -1); grep -c "UPDATE agent_observability_turns" "supabase/migrations/$MIG" | grep -q "^4$"</automated>
    <automated>MIG=$(ls supabase/migrations/ | grep -E '^[0-9]{14}_agent_observability_responding_agent_id\.sql$' | head -1); grep -q "recompra_routed" "supabase/migrations/$MIG" && grep -q "webhook_agent_routed" "supabase/migrations/$MIG"</automated>
    <automated>git log --oneline -1 | grep -q "Plan 01 Task 1"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `supabase/migrations/<YYYYMMDDHHMMSS>_agent_observability_responding_agent_id.sql` existe con timestamp > 20260423152233.
    - Contiene BEGIN/COMMIT wrapper + ALTER ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS partial + exactamente 4 UPDATEs (criterios A/B/C/D).
    - Los 3 primeros UPDATEs filtran por `responding_agent_id IS NULL` (excepto Criterion A que es el primero). El 4to UPDATE es el fallback `SET responding_agent_id = agent_id`.
    - Commit local existe con mensaje `feat(agent-forensics-panel): Plan 01 Task 1 — migracion SQL responding_agent_id + backfill (D-10, D-11)`.
    - NO se hizo push a origin main.
    - NO se aplico SQL en produccion todavia.
  </acceptance_criteria>
  <done>
    - Archivo SQL en git local, commit atomico, NO pusheado.
    - Task 2 checkpoint listo para ejecutar.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Checkpoint humano — aplicar migracion en Supabase production + verificar backfill (Regla 5 strict)</name>
  <what-built>
    Archivo SQL de migracion commited localmente en Task 1 (`supabase/migrations/<ts>_agent_observability_responding_agent_id.sql`). El SQL hace: (1) ADD COLUMN responding_agent_id TEXT NULL (cascada a particiones), (2) CREATE INDEX parcial, (3) 4 UPDATEs cascading backfill, (4) COMMIT.
  </what-built>
  <how-to-verify>
    **PASO 1 — Aplicar el SQL en Supabase production:**

    1. Abrir Supabase Dashboard del proyecto morfx-new de produccion → SQL Editor.
    2. Abrir el archivo local `supabase/migrations/<ts>_agent_observability_responding_agent_id.sql` (el que Task 1 creo).
    3. Copiar su contenido COMPLETO (desde `-- =====` hasta `COMMIT;` — NO incluir los comentarios de VERIFICATION QUERY que estan despues de COMMIT, esos se corren en el PASO 2).
    4. Pegar en SQL Editor de Supabase production y ejecutar.
    5. Verificar que la respuesta dice `Success. No rows returned` (o similar — ALTER + CREATE INDEX + 4 UPDATEs son DDL + DML).

    **PASO 2 — Correr la query de verificacion (RESEARCH.md §Open Items §4):**

    Pegar y ejecutar en SQL Editor:

    ```sql
    SELECT agent_id, responding_agent_id, COUNT(*) AS n
    FROM agent_observability_turns
    GROUP BY 1, 2
    ORDER BY 1, 2;
    ```

    **PASO 3 — Inspeccionar el output:**

    Los patrones esperados son (RESEARCH.md §Open Items §4):
    - `('somnio-v3',        'somnio-v3')`            → non-client conversations
    - `('somnio-v3',        'somnio-recompra-v1')`   → client conversations (EL BUG QUE ARREGLAMOS)
    - `('somnio-v2',        'somnio-v2')`            → v1/v2 workspaces legacy
    - `('godentist',        'godentist')`            → godentist workspace
    - Cualquier fila con `responding_agent_id = NULL` → investigar (NO debe haber ninguna, Criterion D llena todo).

    **PASO 4 — Reportar al executor:**

    Pegar el output de la query verbatim en la respuesta al checkpoint. Incluir:
    - ¿Cuantas filas hay en total?
    - ¿Cuantas tienen pattern sospechoso (fuera de los 4 esperados)?
    - ¿Hay filas con `responding_agent_id IS NULL`? Debe ser 0.
    - ¿Cuantas filas `('somnio-v3', 'somnio-recompra-v1')`? Esa es la evidencia del bug historico resuelto.

    **PASO 5 — Decidir:**

    - ✅ **Aprobar** si todos los patterns son esperados y no hay NULLs. El executor procede a Tasks 3-8.
    - ❌ **Rechazar** si hay patterns sospechosos o NULLs. El executor investiga (probablemente un UPDATE criterion fallo o un event label cambio historicamente). Escalar a usuario para analisis.

    **PASO 6 (si se aprobo) — NO pushear todavia:**

    Recordar al executor: las Tasks 3-8 modifican codigo runtime. Se committean localmente. El push solo ocurre en Task 9 DESPUES de que todo el codigo este listo (NOT piecemeal — un solo push atomico al final).
  </how-to-verify>
  <resume-signal>
    Pegar el output de la query de verificacion. Escribir "aprobado" si los patterns son validos, o describir los issues encontrados para debugging. El executor NO avanza a Task 3 sin aprobacion explicita.
  </resume-signal>
  <acceptance_criteria>
    - Usuario corrio el SQL de migracion en Supabase production.
    - Respuesta del SQL Editor indica `Success` (sin errores).
    - Usuario corrio la query de verificacion.
    - Usuario pego el output de la query en la respuesta del checkpoint.
    - Usuario dio aprobacion explicita "aprobado" o documento los issues.
    - NO hay filas con `responding_agent_id IS NULL` (Criterion D fallback debe cubrir todo).
    - Executor recibe signal y queda habilitado para avanzar a Task 3.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extender ObservabilityCollector con setRespondingAgentId (mutable field + setter defensivo) + unit tests</name>
  <read_first>
    - src/lib/observability/collector.ts (clase completa — fields 71-102, recordEvent defensive 108-126, mergeFrom 209-283)
    - src/lib/observability/types.ts (AgentId union type)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Pattern 2 (lineas 306-337 — signature recomendada)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §collector.ts MOD (lineas 144-191)
    - src/lib/agents/somnio-recompra/__tests__/transitions.test.ts (vitest describe/it shape)
  </read_first>
  <behavior>
    - Test 1: `new ObservabilityCollector(init)` con init.respondingAgentId undefined inicializa field a `null`.
    - Test 2: `setRespondingAgentId('somnio-recompra-v1')` poblando null → field = 'somnio-recompra-v1'.
    - Test 3: Idempotencia same-value — llamar setter dos veces con mismo id no cambia nada, no throws.
    - Test 4: Second-value-ignore — setter ya tiene 'somnio-recompra-v1', llamada con 'godentist' es ignorada (field sigue siendo 'somnio-recompra-v1'), no throws.
    - Test 5: Defensive never-throw (Regla 6) — aunque simulemos un error interno, el setter no propaga excepcion.
    - Test 6: `mergeFrom({ respondingAgentId: 'somnio-v3' })` poblando null → field = 'somnio-v3' (respeta la misma idempotencia).
    - Test 7: `mergeFrom` ignorado cuando outer collector ya tiene un `respondingAgentId` distinto — `collector.setRespondingAgentId('A'); collector.mergeFrom({ respondingAgentId: 'B' })` deja `collector.respondingAgentId === 'A'` (no warn-throw, invariante first-setter-wins).
  </behavior>
  <action>
    **Paso 1 — Escribir el test PRIMERO** (RED phase):

    Crear `src/lib/observability/__tests__/collector.responding.test.ts`:

    ```typescript
    import { describe, it, expect, beforeEach } from 'vitest'
    import { ObservabilityCollector } from '../collector'
    import type { ObservabilityCollectorInit } from '../collector'

    function makeInit(overrides: Partial<ObservabilityCollectorInit> = {}): ObservabilityCollectorInit {
      return {
        conversationId: '00000000-0000-0000-0000-000000000001',
        workspaceId: '00000000-0000-0000-0000-000000000002',
        agentId: 'somnio-v3',
        turnStartedAt: new Date('2026-04-24T10:00:00Z'),
        triggerKind: 'user_message',
        ...overrides,
      }
    }

    describe('ObservabilityCollector — respondingAgentId setter (D-10, D-12)', () => {
      let c: ObservabilityCollector

      beforeEach(() => {
        c = new ObservabilityCollector(makeInit())
      })

      it('initializes respondingAgentId to null when init.respondingAgentId is undefined', () => {
        expect(c.respondingAgentId).toBeNull()
      })

      it('setRespondingAgentId from null sets the field', () => {
        c.setRespondingAgentId('somnio-recompra-v1')
        expect(c.respondingAgentId).toBe('somnio-recompra-v1')
      })

      it('is idempotent on same value', () => {
        c.setRespondingAgentId('somnio-recompra-v1')
        c.setRespondingAgentId('somnio-recompra-v1')
        expect(c.respondingAgentId).toBe('somnio-recompra-v1')
      })

      it('ignores second-different-value (preserves routing audit trail)', () => {
        c.setRespondingAgentId('somnio-recompra-v1')
        c.setRespondingAgentId('godentist')
        expect(c.respondingAgentId).toBe('somnio-recompra-v1')
      })

      it('never throws (Regla 6 defensive)', () => {
        expect(() => c.setRespondingAgentId('somnio-recompra-v1')).not.toThrow()
        // @ts-expect-error — simulate garbage input
        expect(() => c.setRespondingAgentId(null)).not.toThrow()
      })

      it('mergeFrom propagates respondingAgentId when outer is null', () => {
        c.mergeFrom({
          events: [],
          queries: [],
          aiCalls: [],
          respondingAgentId: 'somnio-v3',
        } as any)
        expect(c.respondingAgentId).toBe('somnio-v3')
      })

      it('mergeFrom ignores respondingAgentId when outer already has a different value', () => {
        c.setRespondingAgentId('somnio-recompra-v1')
        c.mergeFrom({
          events: [],
          queries: [],
          aiCalls: [],
          respondingAgentId: 'somnio-v3',
        } as any)
        expect(c.respondingAgentId).toBe('somnio-recompra-v1')
      })
    })
    ```

    Correr el test — DEBE fallar (RED):
    ```bash
    npx vitest run src/lib/observability/__tests__/collector.responding.test.ts
    ```

    **Paso 2 — Implementar collector.ts delta** (GREEN phase):

    Modificar `src/lib/observability/collector.ts`:

    1. En el `ObservabilityCollectorInit` interface (buscar su definicion antes de la clase), agregar:
       ```typescript
       respondingAgentId?: AgentId | null
       ```

    2. En la clase `ObservabilityCollector` (line ~71), agregar el field DESPUES de `newMode?: string` (line 80):
       ```typescript
       respondingAgentId: AgentId | null
       ```

    3. En el constructor (line ~101), agregar DESPUES de `this.newMode = init.newMode`:
       ```typescript
       this.respondingAgentId = init.respondingAgentId ?? null
       ```

    4. Despues de `recordEvent(...)` (line ~126), agregar el metodo:
       ```typescript
       /**
        * Set the agent that actually produced the response. Called by the
        * recompra / godentist / somnio-v3 branches of webhook-processor.ts
        * once routing is resolved.
        *
        * Intentionally idempotent on the same value. Silently ignores attempts
        * to set a DIFFERENT value mid-turn (preserves routing audit trail).
        * Never throws (Regla 6 — observability must never break prod).
        */
       setRespondingAgentId(id: AgentId): void {
         try {
           if (this.respondingAgentId && this.respondingAgentId !== id) {
             // Preserve first-write-wins semantics
             return
           }
           this.respondingAgentId = id
         } catch {
           // Defensive: never throw (REGLA 6)
         }
       }
       ```

    5. En `mergeFrom(other)` (line ~209), extender el shape del parametro:
       ```typescript
       mergeFrom(other: {
         events: typeof this.events
         queries: typeof this.queries
         aiCalls: typeof this.aiCalls
         respondingAgentId?: AgentId | null  // NEW
       }): void
       ```

       Al final del body del metodo (antes del cierre `}`), agregar:
       ```typescript
       if (other.respondingAgentId) {
         this.setRespondingAgentId(other.respondingAgentId)
       }
       ```

    **Paso 3 — Correr test de nuevo** (debe pasar — GREEN):
    ```bash
    npx vitest run src/lib/observability/__tests__/collector.responding.test.ts
    ```

    **Paso 4 — Commit local (NO push):**
    ```bash
    git add src/lib/observability/collector.ts src/lib/observability/__tests__/collector.responding.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 01 Task 3 — ObservabilityCollector.setRespondingAgentId + tests (D-10)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>npx vitest run src/lib/observability/__tests__/collector.responding.test.ts 2>&1 | grep -qE "Test Files.*1 passed|1 passed"</automated>
    <automated>grep -q "setRespondingAgentId" src/lib/observability/collector.ts</automated>
    <automated>grep -q "respondingAgentId: AgentId | null" src/lib/observability/collector.ts</automated>
    <automated>grep -q "if (other.respondingAgentId)" src/lib/observability/collector.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -q "collector.ts" && exit 1 || exit 0</automated>
  </verify>
  <acceptance_criteria>
    - 7 tests pasan en `collector.responding.test.ts` (init null, set-from-null, idempotent, ignore-different, never-throws, mergeFrom-when-null, mergeFrom-ignored-when-set).
    - `collector.ts` declara `respondingAgentId: AgentId | null` como field mutable publico.
    - `setRespondingAgentId(id)` existe, es idempotente same-value, silent-ignores different-value, defensive try/catch.
    - `mergeFrom` extendido para propagar respondingAgentId.
    - TypeScript compile limpio (`npx tsc --noEmit` no errores en collector.ts).
    - Commit atomico local, NO pusheado.
  </acceptance_criteria>
  <done>
    - Collector extendido, tests verde, commit local.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Extender flush.ts + repository.ts (INSERT + SELECT + TurnSummary/TurnDetail types con responding_agent_id)</name>
  <read_first>
    - src/lib/observability/flush.ts (INSERT shape lineas 110-133, swallow-on-error 234-253)
    - src/lib/observability/repository.ts (TurnSummary 28-45, listTurnsForConversation 63-98, getTurnDetail 220-322)
    - src/lib/observability/collector.ts (POST Task 3 — respondingAgentId field disponible)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §flush.ts MOD, §repository.ts MOD (lineas 193-286)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Pattern 2 (line 337 — flush includes responding_agent_id)
  </read_first>
  <behavior>
    - Test 1: `flushCollector` con collector que tiene respondingAgentId='somnio-recompra-v1' llama supabase.insert con payload que incluye `responding_agent_id: 'somnio-recompra-v1'`.
    - Test 2: `flushCollector` con collector.respondingAgentId=null envia `responding_agent_id: null` (no undefined).
    - Test 3: El shape existente del INSERT no se altera (agent_id, turn_number, started_at, etc. siguen presentes).
  </behavior>
  <action>
    **Paso 1 — Escribir test de flush primero:**

    Crear `src/lib/observability/__tests__/flush.responding.test.ts`:

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest'

    // Mock supabase admin client BEFORE importing flush
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = vi.fn(() => ({ insert: mockInsert }))
    vi.mock('@/lib/supabase/admin', () => ({
      createRawAdminClient: () => ({ from: mockFrom }),
    }))

    // Mock the events/queries/aiCalls child tables too — flush also writes them.
    // The repository under test only cares about the `agent_observability_turns` insert.

    import { flushCollector } from '../flush'
    import { ObservabilityCollector } from '../collector'

    describe('flushCollector — responding_agent_id INSERT (D-10)', () => {
      beforeEach(() => {
        vi.clearAllMocks()
      })

      it('includes responding_agent_id when set', async () => {
        const c = new ObservabilityCollector({
          conversationId: '00000000-0000-0000-0000-000000000001',
          workspaceId: '00000000-0000-0000-0000-000000000002',
          agentId: 'somnio-v3',
          turnStartedAt: new Date('2026-04-24T10:00:00Z'),
          triggerKind: 'user_message',
        })
        c.setRespondingAgentId('somnio-recompra-v1')

        await flushCollector(c)

        // Find the insert call that went to `agent_observability_turns`
        const turnsCall = mockFrom.mock.calls.find((args) => args[0] === 'agent_observability_turns')
        expect(turnsCall).toBeDefined()
        const insertPayload = mockInsert.mock.calls.find((args) => args[0]?.responding_agent_id !== undefined)?.[0]
        expect(insertPayload).toBeDefined()
        expect(insertPayload.responding_agent_id).toBe('somnio-recompra-v1')
        expect(insertPayload.agent_id).toBe('somnio-v3') // entry unchanged
      })

      it('sends null when respondingAgentId is null', async () => {
        const c = new ObservabilityCollector({
          conversationId: '00000000-0000-0000-0000-000000000001',
          workspaceId: '00000000-0000-0000-0000-000000000002',
          agentId: 'somnio-v3',
          turnStartedAt: new Date('2026-04-24T10:00:00Z'),
          triggerKind: 'user_message',
        })
        // Don't call setRespondingAgentId — stays null

        await flushCollector(c)

        const insertPayload = mockInsert.mock.calls.find((args) => 'responding_agent_id' in (args[0] ?? {}))?.[0]
        expect(insertPayload).toBeDefined()
        expect(insertPayload.responding_agent_id).toBeNull()
      })
    })
    ```

    Correr test (debe fallar — RED):
    ```bash
    npx vitest run src/lib/observability/__tests__/flush.responding.test.ts
    ```

    **Paso 2 — Modificar flush.ts:**

    Abrir `src/lib/observability/flush.ts`. Localizar el `.insert({...})` de `agent_observability_turns` (line ~110-133). Insertar UNA linea entre `agent_id: collector.agentId,` y `turn_number: null,`:

    ```typescript
        agent_id: collector.agentId,
        responding_agent_id: collector.respondingAgentId ?? null,  // NEW D-10
        turn_number: null,
    ```

    NO tocar el resto del INSERT shape. NO tocar el catch/swallow del Regla 6 (line 234-253).

    **Paso 3 — Modificar repository.ts (types + SELECT + mapping):**

    1. En `TurnSummary` interface (line 28-45), agregar DESPUES de `agentId: string`:
       ```typescript
       respondingAgentId: string | null  // NEW D-10
       ```

    2. En `listTurnsForConversation` (line ~67-97), en el SELECT string, agregar `responding_agent_id` DESPUES de `agent_id`:
       ```typescript
       .select(
         'id, conversation_id, workspace_id, agent_id, responding_agent_id, started_at, finished_at, duration_ms, event_count, query_count, ai_call_count, total_tokens, total_cost_usd, error, trigger_kind, current_mode, new_mode',
       )
       ```

    3. En el `rows.map(...)`, agregar en el objeto retornado DESPUES de `agentId: r.agent_id as string`:
       ```typescript
       respondingAgentId: (r.responding_agent_id as string | null) ?? null,
       ```

    4. En `getTurnDetail` (line ~220-322), la proyeccion usa `select('*')` asi que el campo viene automatico. Pero el shape retornado (line ~304-322) tiene que propagar `respondingAgentId`. Agregar al objeto `turn`:
       ```typescript
       respondingAgentId: (data.responding_agent_id as string | null) ?? null,
       ```

    **Paso 4 — Correr tests y tsc:**
    ```bash
    npx vitest run src/lib/observability/__tests__/flush.responding.test.ts
    npx tsc --noEmit
    ```

    **Paso 5 — Commit local:**
    ```bash
    git add src/lib/observability/flush.ts src/lib/observability/repository.ts src/lib/observability/__tests__/flush.responding.test.ts
    git commit -m "feat(agent-forensics-panel): Plan 01 Task 4 — flush+repository propagan responding_agent_id (D-10)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>npx vitest run src/lib/observability/__tests__/flush.responding.test.ts 2>&1 | grep -qE "2 passed|Test Files.*1 passed"</automated>
    <automated>grep -q "responding_agent_id: collector.respondingAgentId" src/lib/observability/flush.ts</automated>
    <automated>grep -q "respondingAgentId: string | null" src/lib/observability/repository.ts</automated>
    <automated>grep -q "responding_agent_id" src/lib/observability/repository.ts</automated>
    <automated>grep -q "respondingAgentId: (r.responding_agent_id" src/lib/observability/repository.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -E "(flush|repository)\.ts" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - 2 tests pasan en `flush.responding.test.ts`.
    - `flush.ts` incluye `responding_agent_id: collector.respondingAgentId ?? null` en el INSERT.
    - `repository.ts` `TurnSummary` expone `respondingAgentId: string | null`.
    - `listTurnsForConversation` select string incluye `responding_agent_id`.
    - `listTurnsForConversation` mapping incluye `respondingAgentId: (r.responding_agent_id as string | null) ?? null`.
    - `getTurnDetail` turn shape incluye `respondingAgentId`.
    - TypeScript compile limpio.
    - Commit local, NO pusheado.
  </acceptance_criteria>
  <done>
    - flush+repository extendidos, tests verde, commit local.
  </done>
</task>

<task type="auto">
  <name>Task 5: Fix Pitfall 1 — agent-production.ts propaga respondingAgentId via __obs step-boundary merge</name>
  <read_first>
    - src/inngest/functions/agent-production.ts (collector create 106-115, step.run pattern 300-366, __obs merge 313-366)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Pitfall 1 (lineas 509-534 — fix canonico)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §agent-production.ts MOD (lineas 290-344), §Shared Patterns §Inngest step-boundary merge (lineas 1008-1026)
    - src/lib/observability/collector.ts (POST Task 3 — setRespondingAgentId disponible)
  </read_first>
  <action>
    **Critical context (RESEARCH.md Pitfall 1):** Inngest `step.run` callbacks run in disposable lambdas; in-memory state (incluyendo `collector.respondingAgentId` mutado dentro del step) se PIERDE en replays porque cada replay usa el output cached. El fix es serializar el valor en el return del step y mergearlo en el outer collector post-step.

    **Paso 1 — Identificar la estructura en agent-production.ts:**

    ```bash
    grep -n "stepCollector\|__obs\|mergeFrom\|step.run" src/inngest/functions/agent-production.ts | head -30
    ```

    Se esperan ver:
    - `const stepCollector = collector ? new ObservabilityCollector({ ... }) : null` (~line 300-310)
    - `return { engineResult, __obs: stepCollector ? { events: stepCollector.events, queries: stepCollector.queries, aiCalls: stepCollector.aiCalls } : null }` (~line 340-360)
    - Post-step: `if (collector && stepResult.__obs) { collector.mergeFrom(stepResult.__obs) }` (~line 360-366)

    **Paso 2 — Extender el __obs return:**

    En el `return { ... __obs: stepCollector ? { ... } : null }`, agregar `respondingAgentId`:

    ```typescript
    return {
      engineResult,
      __obs: stepCollector
        ? {
            events: stepCollector.events,
            queries: stepCollector.queries,
            aiCalls: stepCollector.aiCalls,
            respondingAgentId: stepCollector.respondingAgentId,  // NEW — survives replay
          }
        : null,
    }
    ```

    **Paso 3 — Ajustar el merge post-step:**

    El `collector.mergeFrom(stepResult.__obs)` ya funciona gracias al delta de Task 3 (mergeFrom propaga respondingAgentId si viene en el shape). Verificar que no haya una ruta alternativa que use `collector.setRespondingAgentId(...)` directamente sin pasar por mergeFrom — si existe, asegurar que ambas rutas esten cubiertas.

    **ALTERNATIVA explicita (si el mergeFrom no es la ruta usada):** agregar un bloque adicional despues del merge:

    ```typescript
    if (collector && stepResult.__obs?.respondingAgentId) {
      collector.setRespondingAgentId(stepResult.__obs.respondingAgentId)
    }
    ```

    Esto es redundante-seguro si mergeFrom ya propaga (el setter es idempotente same-value).

    **Paso 4 — Propagar `respondingAgentId` a la creacion del stepCollector** (para que si el stepCollector se crea con un seed previo de recompra detection, lo herede):

    Buscar donde se crea el stepCollector (~line 310) y asegurar que pasa `respondingAgentId: collector.respondingAgentId` al init (en caso de que un turno previo ya haya capturado el valor — edge case). Ejemplo:

    ```typescript
    const stepCollector = collector
      ? new ObservabilityCollector({
          conversationId: collector.conversationId,
          workspaceId: collector.workspaceId,
          agentId: collector.agentId,
          respondingAgentId: collector.respondingAgentId,  // NEW — seed from outer if already set
          turnStartedAt: collector.turnStartedAt,
          triggerMessageId: collector.triggerMessageId,
          triggerKind: collector.triggerKind,
        })
      : null
    ```

    **Paso 5 — Verificar tests del agent-production si existen:**

    ```bash
    npx vitest run src/inngest/functions/__tests__/
    ```

    No deben romperse. Si algun test fallaba por shape mismatch del __obs, actualizar el expected.

    **Paso 6 — Commit local:**
    ```bash
    git add src/inngest/functions/agent-production.ts
    git commit -m "fix(agent-forensics-panel): Plan 01 Task 5 — propagar respondingAgentId via __obs step-boundary merge (Pitfall 1, D-10)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>grep -q "respondingAgentId: stepCollector.respondingAgentId" src/inngest/functions/agent-production.ts</automated>
    <automated>grep -q "respondingAgentId: collector.respondingAgentId" src/inngest/functions/agent-production.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -E "agent-production\.ts" | wc -l | grep -q "^0$"</automated>
    <automated>npx vitest run src/inngest/functions/__tests__/ 2>&1 | tail -10 | grep -qE "passed|No test files"</automated>
  </verify>
  <acceptance_criteria>
    - `agent-production.ts` el `__obs` return del step.run incluye `respondingAgentId: stepCollector.respondingAgentId`.
    - `stepCollector` se crea con `respondingAgentId: collector.respondingAgentId` (seed).
    - Post-step, `collector.mergeFrom(stepResult.__obs)` OR `collector.setRespondingAgentId(stepResult.__obs.respondingAgentId)` propaga al outer.
    - TypeScript compile limpio.
    - Tests existentes del agent-production pasan (si hay).
    - Commit local, NO pusheado.
  </acceptance_criteria>
  <done>
    - Pitfall 1 addressed. El valor mutado dentro de step.run sobrevive replay gracias a estar en el return payload.
  </done>
</task>

<task type="auto">
  <name>Task 6: webhook-processor.ts — 3 setRespondingAgentId calls ANTES de cada runner.processMessage</name>
  <read_first>
    - src/lib/agents/production/webhook-processor.ts (branches: recompra 174-398 con runner en line 240, V3 436-458 con runner en line 442, godentist 459-481 con runner en line 465)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Architecture Diagram (line 167-185 — write-path), §Anti-Patterns line 470 (set-before-run critical)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §webhook-processor.ts MOD (lineas 346-384)
    - src/lib/observability/collector.ts (POST Task 3)
  </read_first>
  <action>
    **Principio Anti-Pattern (RESEARCH.md line 470):** Set BEFORE `runner.processMessage` — asi el schema registra el routing AUN SI el runner tira excepcion. El collector captura "entro a X → intento ejecutar Y → Y fallo" en lugar de "entro a X → silencio".

    **Paso 1 — Identificar las 3 lineas exactas:**

    ```bash
    grep -n "runner.processMessage\|getCollector()?.recordEvent" src/lib/agents/production/webhook-processor.ts | head -20
    ```

    Se esperan:
    - Branch recompra: `runner.processMessage(...)` en line ~240. Evento `recompra_routed` ya existe en line ~192.
    - Branch V3: `runner.processMessage(...)` en line ~442. Evento `webhook_agent_routed` ya en line ~453.
    - Branch godentist: `runner.processMessage(...)` en line ~465. Evento `webhook_agent_routed` ya en line ~476.

    **Paso 2 — Recompra branch (BEFORE line ~240):**

    Localizar el bloque donde se instancia `V3ProductionRunner` para recompra (line ~221-238). Inmediatamente DESPUES del recordEvent `recompra_routed` (line ~192) y ANTES de `const engineOutput = await runner.processMessage(...)` (line ~240), insertar:

    ```typescript
    getCollector()?.setRespondingAgentId('somnio-recompra-v1')
    ```

    Si el recordEvent esta lejos (>30 lineas), insertar justo ANTES de `await runner.processMessage(...)` de recompra. El objetivo es que la ultima cosa antes de invocar el runner sea el setter.

    **Paso 3 — V3 branch (BEFORE line ~442):**

    En el bloque V3 (line 437-458). ANTES de `engineOutput = await runner.processMessage(...)` (line ~442), insertar:

    ```typescript
    getCollector()?.setRespondingAgentId('somnio-v3')
    ```

    **Paso 4 — GoDentist branch (BEFORE line ~465):**

    En el bloque godentist (line 460-481). ANTES de `engineOutput = await runner.processMessage(...)` (line ~465), insertar:

    ```typescript
    getCollector()?.setRespondingAgentId('godentist')
    ```

    **NOTA sobre IDs:** usar exactamente los 3 valores esperados por el schema/tipos:
    - `'somnio-recompra-v1'` (no 'recompra', no 'somnio-recompra')
    - `'somnio-v3'` (no 'somnio-sales-v3' aunque el workspace-config lo diga — el AgentId type usa 'somnio-v3')
    - `'godentist'` (no 'godentist-valoraciones')

    Verificar con `grep "type AgentId\|AgentId =" src/lib/observability/types.ts` si hay duda.

    **Paso 5 — Verify tipa + grep:**
    ```bash
    npx tsc --noEmit 2>&1 | grep webhook-processor
    grep -c "setRespondingAgentId" src/lib/agents/production/webhook-processor.ts  # expect 3
    ```

    **Paso 6 — Verify tests existentes no rompen:**
    ```bash
    npx vitest run src/lib/agents/production/__tests__/
    ```

    Si algun test mock `getCollector` de forma stricta, extender el mock para incluir el nuevo metodo:
    ```typescript
    vi.mock('@/lib/observability', () => ({
      getCollector: () => ({
        recordEvent: mockRecordEvent,
        setRespondingAgentId: vi.fn(),  // NEW — add if missing
      }),
    }))
    ```

    **Paso 7 — Commit local:**
    ```bash
    git add src/lib/agents/production/webhook-processor.ts
    git commit -m "fix(agent-forensics-panel): Plan 01 Task 6 — webhook-processor setRespondingAgentId en 3 branches (D-10, D-12)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>grep -c "setRespondingAgentId" src/lib/agents/production/webhook-processor.ts | grep -q "^3$"</automated>
    <automated>grep -q "setRespondingAgentId('somnio-recompra-v1')" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "setRespondingAgentId('somnio-v3')" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "setRespondingAgentId('godentist')" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -E "webhook-processor\.ts" | wc -l | grep -q "^0$"</automated>
    <automated>npx vitest run src/lib/agents/production/__tests__/ 2>&1 | tail -15 | grep -qE "passed|No test files"</automated>
  </verify>
  <acceptance_criteria>
    - Exactamente 3 llamadas a `setRespondingAgentId` en webhook-processor.ts, una por branch (recompra / v3 / godentist).
    - Cada llamada esta ANTES de `runner.processMessage` del branch respectivo (set-before-run para survive throw).
    - Los 3 IDs son los correctos: `'somnio-recompra-v1'`, `'somnio-v3'`, `'godentist'`.
    - TypeScript compile limpio.
    - Tests existentes del webhook-processor pasan (mocks actualizados si necesario).
    - Commit local, NO pusheado.
  </acceptance_criteria>
  <done>
    - Las 3 branches capturan el responding agent. Set-before-run preserva data en caso de throw.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 7: turn-list.tsx — render getDisplayAgentId helper + unit test (bug visual resuelto)</name>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx (render line 155-159 — fuente del bug visual)
    - src/lib/observability/repository.ts (POST Task 4 — TurnSummary.respondingAgentId disponible)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §turn-list.tsx MOD (lineas 878-896), §No Analog Found (recomendacion extraer helper pure para test DOM-free)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §State of the Art (line 839 — "always prefer respondingAgentId ?? agentId")
  </read_first>
  <behavior>
    - Test 1: `getDisplayAgentId({ agentId: 'somnio-v3', respondingAgentId: null })` → `'somnio-v3'`.
    - Test 2: `getDisplayAgentId({ agentId: 'somnio-v3', respondingAgentId: 'somnio-recompra-v1' })` → `'somnio-recompra-v1'` (bug fix case).
    - Test 3: `getDisplayAgentId({ agentId: 'godentist', respondingAgentId: 'godentist' })` → `'godentist'` (same value, no visual change).
    - Test 4: `getDisplayAgentId({ agentId: 'somnio-v3', respondingAgentId: undefined })` → `'somnio-v3'` (robust to undefined).
  </behavior>
  <action>
    **Paso 1 — Extraer helper puro (DOM-free, testeable sin RTL):**

    Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/get-display-agent-id.ts`:

    ```typescript
    /**
     * Returns the agent ID to display in the turn list / header.
     * Prefers responding_agent_id (actual responder) over agent_id (entry/routing).
     *
     * Source: D-10 Opcion B — post Phase agent-forensics-panel, the responding
     * agent is the one that produced the response; the entry agent is only the
     * initial routing target.
     */
    export function getDisplayAgentId(turn: {
      agentId: string
      respondingAgentId?: string | null
    }): string {
      return turn.respondingAgentId ?? turn.agentId
    }
    ```

    **Paso 2 — Crear test DOM-free (evita dependencia RTL — no existe en repo todavia):**

    Crear `src/app/(dashboard)/whatsapp/components/debug-panel-production/__tests__/get-display-agent-id.test.ts`:

    ```typescript
    import { describe, it, expect } from 'vitest'
    import { getDisplayAgentId } from '../get-display-agent-id'

    describe('getDisplayAgentId — bug visual resuelto D-10/D-12', () => {
      it('uses agentId when respondingAgentId is null (non-client turn)', () => {
        expect(getDisplayAgentId({ agentId: 'somnio-v3', respondingAgentId: null })).toBe('somnio-v3')
      })

      it('uses respondingAgentId when different (client recompra turn — BUG FIXED)', () => {
        expect(
          getDisplayAgentId({ agentId: 'somnio-v3', respondingAgentId: 'somnio-recompra-v1' }),
        ).toBe('somnio-recompra-v1')
      })

      it('returns same value when entry==responding (godentist, non-routed)', () => {
        expect(getDisplayAgentId({ agentId: 'godentist', respondingAgentId: 'godentist' })).toBe('godentist')
      })

      it('falls back to agentId when respondingAgentId is undefined (robust)', () => {
        expect(getDisplayAgentId({ agentId: 'somnio-v3' })).toBe('somnio-v3')
      })

      it('falls back to agentId when respondingAgentId is empty string', () => {
        // Edge: DB column might return '' (unlikely but defensive)
        expect(getDisplayAgentId({ agentId: 'somnio-v3', respondingAgentId: '' as string })).toBe('somnio-v3')
      })
    })
    ```

    NOTA: El 5to test falla si el helper usa solo `??` (empty string es falsy-pero-no-nullish). Aceptar ese fallo O cambiar el helper a `|| turn.agentId`. Usar `??` (coalesce nullish) es correcto aqui — los valores que vienen de DB son `string | null`, no `''`. Remover el 5to test si el helper usa `??` strict — mantener tests 1-4.

    Decision tomada: **usar `??`** (matches `responding_agent_id ?? agent_id` del SELECT). Eliminar test 5.

    **Paso 3 — Modificar turn-list.tsx:**

    Abrir `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx`. Al top, agregar import:

    ```typescript
    import { getDisplayAgentId } from './get-display-agent-id'
    ```

    Localizar line ~156 con `{turn.agentId} · {turn.triggerKind ?? 'event'}`. Reemplazar con:

    ```typescript
    {getDisplayAgentId(turn)} · {turn.triggerKind ?? 'event'}
    ```

    **Paso 4 — Verify tests y tsc:**
    ```bash
    npx vitest run src/app/(dashboard)/whatsapp/components/debug-panel-production/__tests__/get-display-agent-id.test.ts
    npx tsc --noEmit
    ```

    **Paso 5 — Commit local:**
    ```bash
    git add src/app/\(dashboard\)/whatsapp/components/debug-panel-production/get-display-agent-id.ts \
            src/app/\(dashboard\)/whatsapp/components/debug-panel-production/__tests__/get-display-agent-id.test.ts \
            src/app/\(dashboard\)/whatsapp/components/debug-panel-production/turn-list.tsx
    git commit -m "fix(agent-forensics-panel): Plan 01 Task 7 — turn-list renderiza respondingAgentId ?? agentId (D-12)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>npx vitest run "src/app/(dashboard)/whatsapp/components/debug-panel-production/__tests__/get-display-agent-id.test.ts" 2>&1 | grep -qE "4 passed|Test Files.*1 passed"</automated>
    <automated>test -f "src/app/(dashboard)/whatsapp/components/debug-panel-production/get-display-agent-id.ts"</automated>
    <automated>grep -q "getDisplayAgentId(turn)" "src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx"</automated>
    <automated>grep -q "import { getDisplayAgentId }" "src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-list.tsx"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -E "turn-list\.tsx|get-display-agent-id" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `get-display-agent-id.ts` existe con helper puro `getDisplayAgentId(turn) = turn.respondingAgentId ?? turn.agentId`.
    - 4 tests pasan (null fallback, respondingAgentId wins, same-value, undefined fallback).
    - `turn-list.tsx` importa el helper y renderiza `{getDisplayAgentId(turn)}` en vez de `{turn.agentId}`.
    - TypeScript compile limpio.
    - Commit local, NO pusheado.
  </acceptance_criteria>
  <done>
    - Bug visual resuelto. Turns de recompra ahora muestran 'somnio-recompra-v1' en lugar de 'somnio-v3'.
  </done>
</task>

<task type="auto">
  <name>Task 8: next.config.ts — agregar outputFileTracingIncludes para bundle agent-specs .md files (pre-registro Plan 03/04)</name>
  <read_first>
    - next.config.ts (estructura actual lineas 1-27)
    - .planning/standalone/agent-forensics-panel/RESEARCH.md §Pitfall 3 (lineas 543-558 — ENOENT en lambda sin outputFileTracingIncludes)
    - .planning/standalone/agent-forensics-panel/PATTERNS.md §next.config.ts MOD (lineas 898-924)
  </read_first>
  <action>
    **Rationale (Pitfall 3):** Los archivos `.md` en `src/lib/agent-specs/` que Plan 03 va a crear NO seran bundled en Vercel lambdas por default — Next.js 15 solo incluye files que son `import`-ed. `fs.readFile` en `/api/agent-forensics/audit` tira `ENOENT` en prod sin esto.

    **Pre-registramos el include AHORA** (Plan 01) para que cuando Plans 03/04 hagan deploy, el include ya este activo. Incluir antes de tiempo es safe — el glob `**/*.md` simplemente no matchea nada hasta que Plan 03 cree los archivos.

    **Paso 1 — Abrir `next.config.ts`.**

    **Paso 2 — Agregar `outputFileTracingIncludes` al nextConfig object.** El archivo actual tiene:

    ```typescript
    const nextConfig: NextConfig = {
      turbopack: { root: process.cwd() },
      serverExternalPackages: ['pdfkit', 'bwip-js'],
      experimental: {
        serverActions: { bodySizeLimit: '20mb' },
      },
      images: { remotePatterns: [ /* ... */ ] },
    };
    ```

    Agregar la clave DESPUES de `serverExternalPackages` y ANTES de `experimental`:

    ```typescript
      serverExternalPackages: ['pdfkit', 'bwip-js'],
      outputFileTracingIncludes: {
        '/api/agent-forensics/audit': ['./src/lib/agent-specs/**/*.md'],
      },
      experimental: {
    ```

    **Paso 3 — Verify typecheck + build dry-run NO requerido (solo shape):**
    ```bash
    npx tsc --noEmit
    ```

    El build completo lo corre Plan 05. Aqui solo verify tipos.

    **Paso 4 — Commit local:**
    ```bash
    git add next.config.ts
    git commit -m "chore(agent-forensics-panel): Plan 01 Task 8 — next.config outputFileTracingIncludes para agent-specs .md (Pitfall 3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
    ```
  </action>
  <verify>
    <automated>grep -q "outputFileTracingIncludes" next.config.ts</automated>
    <automated>grep -q "'/api/agent-forensics/audit'" next.config.ts</automated>
    <automated>grep -q "src/lib/agent-specs/\*\*/\*\.md" next.config.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -E "next\.config\.ts" | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `next.config.ts` tiene key `outputFileTracingIncludes` con entry `'/api/agent-forensics/audit': ['./src/lib/agent-specs/**/*.md']`.
    - TypeScript compile limpio.
    - El orden en el nextConfig es: turbopack → serverExternalPackages → outputFileTracingIncludes → experimental → images.
    - Commit local, NO pusheado.
  </acceptance_criteria>
  <done>
    - Pre-registro listo. Plan 04 deploy no fallara con ENOENT cuando Plan 03 agregue los .md files.
  </done>
</task>

<task type="auto">
  <name>Task 9: Push atomico final — git push origin main con todos los commits de Plan 01</name>
  <read_first>
    - CLAUDE.md §Regla 5 (push solo DESPUES de migracion aplicada — confirmada en Task 2)
    - CLAUDE.md §Regla 1 (siempre pushear a Vercel despues de code changes ANTES de pedir tests)
    - git log --oneline desde el ultimo push (debe mostrar 7 commits: Tasks 1, 3, 4, 5, 6, 7, 8 — Task 2 es checkpoint, no commit)
  </read_first>
  <action>
    **Pre-check — Regla 5 strict:**

    Verificar via el usuario o Task 2 resume-signal que la migracion YA fue aplicada en prod. Si hay duda, re-preguntar antes de pushear.

    **Paso 1 — Listar commits pendientes:**
    ```bash
    git log origin/main..HEAD --oneline
    ```

    Debe mostrar 7 commits (Tasks 1, 3, 4, 5, 6, 7, 8).

    **Paso 2 — Correr test suite completa antes del push:**
    ```bash
    npm test -- --run 2>&1 | tail -30
    ```

    Si hay failures no relacionadas a Plan 01, documentarlas pero proceder (pueden ser preexistentes). Si hay failures en archivos de Plan 01, detener y arreglar.

    **Paso 3 — Typecheck full:**
    ```bash
    npx tsc --noEmit 2>&1 | tail -20
    ```

    Debe estar limpio.

    **Paso 4 — Push:**
    ```bash
    git push origin main
    ```

    **Paso 5 — Verificar deploy en Vercel:**

    Dar ~2-3 minutos para que Vercel construya. Luego verificar:
    - `curl -s https://morfx.app/api/health` → 200 OK (o el equivalente).
    - Revisar Vercel dashboard — deploy status = Ready.

    Si el build falla (probablemente por algo no relacionado con Plan 01), documentar y escalar. Si el build pasa, Plan 01 queda CERRADO.

    **Paso 6 — Smoke test en prod (opcional pero recomendado):**

    1. Abrir un conversation inbox de un workspace Somnio con cliente (is_client=true).
    2. Abrir "Debug bot" panel.
    3. Seleccionar un turn reciente (post-push).
    4. Verificar que turn-list muestra `somnio-recompra-v1` para ese turn (antes mostraria `somnio-v3`).

    Si verify pasa, reportar evidencia al usuario: screenshot de turn-list con el agent ID correcto.

    **NO crear SUMMARY.md todavia — Plan 05 lo hace al final de la fase.**
  </action>
  <verify>
    <automated>git log origin/main..HEAD --oneline 2>&1 | wc -l | grep -qE "^0$"</automated>
    <automated>npm test -- --run 2>&1 | tail -10 | grep -qE "passed|Test Suites"</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -c "error TS" | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - Regla 5 verified: migracion aplicada en prod (Task 2 aprobado) ANTES del push.
    - Todos los 7 commits de Plan 01 pusheados a origin/main.
    - `git log origin/main..HEAD` devuelve vacio (no commits pendientes).
    - `npm test` suite completa verde (o solo failures preexistentes no relacionadas).
    - `npx tsc --noEmit` sin errores.
    - Vercel deploy status = Ready (verificar dashboard o curl).
    - Smoke test en prod muestra `somnio-recompra-v1` en turn-list para turns de recompra (antes era `somnio-v3`).
  </acceptance_criteria>
  <done>
    - Plan 01 shipped a prod. Bug visual resuelto. Columna + backfill + runtime capture confirmados end-to-end.
    - Plans 02-05 pueden proceder; dependencia D-12 satisfecha.
  </done>
</task>

</tasks>

<verification>
## Plan 01 — Verificacion goal-backward

**Truths que deben ser observables post-plan:**

1. **Schema:** `SELECT column_name FROM information_schema.columns WHERE table_name='agent_observability_turns' AND column_name='responding_agent_id'` en prod → devuelve 1 fila.
2. **Backfill:** `SELECT COUNT(*) FROM agent_observability_turns WHERE responding_agent_id IS NULL` → devuelve 0.
3. **Distribucion:** `SELECT agent_id, responding_agent_id, COUNT(*) FROM agent_observability_turns GROUP BY 1,2` → muestra fila `('somnio-v3', 'somnio-recompra-v1')` con n > 0 (evidencia historica del bug).
4. **Runtime:** un turn NEW post-deploy en workspace Somnio con cliente debe tener `responding_agent_id = 'somnio-recompra-v1'` en DB y el panel debe mostrarlo en turn-list.
5. **Runtime godentist:** un turn NEW post-deploy en workspace godentist debe tener `responding_agent_id = 'godentist'` y mostrarse asi.
6. **Tests verdes:** `npx vitest run src/lib/observability/__tests__/` + `src/app/(dashboard)/whatsapp/components/debug-panel-production/__tests__/` todos pasan.
7. **Typecheck limpio:** `npx tsc --noEmit` sin errores en archivos modificados.

**Verificaciones automaticas de pre-requisitos para Plans siguientes:**

- `next.config.ts` tiene `outputFileTracingIncludes` para `/api/agent-forensics/audit` → Plan 04 puede hacer `fs.readFile` en lambda sin ENOENT.
- `TurnSummary.respondingAgentId` disponible como field → Plan 02 puede usarlo en condensed timeline + Plan 04 auditor puede pasarlo en request body.
- `collector.setRespondingAgentId` disponible → Plans futuros (si hay) pueden extender a mas bots sin re-modificar el collector.
</verification>

<success_criteria>
- Migracion SQL aplicada en Supabase prod + usuario confirmo verificacion (checkpoint Task 2).
- 7 commits de Tasks 1, 3, 4, 5, 6, 7, 8 pusheados atomicamente en Task 9.
- Tests verdes para collector responding + flush responding + getDisplayAgentId helper (>=13 tests suma).
- `git push origin main` exitoso + Vercel deploy Ready.
- Smoke test en prod confirma bug visual resuelto (turn de recompra muestra `somnio-recompra-v1`).
- Plan 02 desbloqueado para arrancar en Wave 1; Plan 03 sigue en Wave 2 (depende de Plan 02 por el placeholder en `forensics-tab.tsx` y por `observability.ts`). Plan 04 en Wave 3, Plan 05 en Wave 4.
</success_criteria>

<output>
Al cerrar este plan, crear `.planning/standalone/agent-forensics-panel/01-SUMMARY.md` documentando:
- Timestamp de la migracion aplicada + distribucion (agent_id, responding_agent_id, COUNT) pre y post backfill.
- Cualquier turn historico con pattern fuera de lo esperado (deben ser cero; si aparecen, documentar).
- Screenshot o descripcion del panel mostrando el bug visual resuelto.
- Lista de archivos modificados.
- Notas para Plans 02/03/04: confirmar que `TurnSummary.respondingAgentId` ya existe + que `next.config` esta listo para `src/lib/agent-specs/**/*.md`.
</output>
