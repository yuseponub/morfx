---
phase: 42.1-observabilidad-bots-produccion
plan: 07
type: execute
wave: 4
depends_on: [01, 05, 06]
files_modified:
  - src/lib/observability/flush.ts
  - src/lib/observability/collector.ts
  - src/inngest/functions/agent-production.ts
  - src/lib/audit/logger.ts
autonomous: true

must_haves:
  truths:
    - "collector.flush() persiste turn + eventos + queries + ai_calls en una sola batch con createRawAdminClient (no recursion)"
    - "Prompt versions se deduplican via upsert con ON CONFLICT antes de insertar ai_calls"
    - "Si events/queries/ai_calls > 100 items, se chunkean en batches de 100 (Pitfall 6)"
    - "El Inngest handler llama step.run('observability-flush', () => collector.flush()) como ultimo paso del turno"
    - "El flush se ejecuta incluso cuando el run() throws (try/finally pattern) con error registrado"
    - "El flush loguea p50/p95 duracion via pino con module 'observability-flush' para monitoreo"
  artifacts:
    - path: "src/lib/observability/flush.ts"
      provides: "Implementacion de ObservabilityCollector.flush() como funcion helper"
      contains: "createRawAdminClient"
    - path: "src/inngest/functions/agent-production.ts"
      provides: "step.run('observability-flush', ...) ejecutado al final de cada turno"
      contains: "observability-flush"
  key_links:
    - from: "src/lib/observability/flush.ts"
      to: "src/lib/supabase/admin.ts"
      via: "createRawAdminClient (non-instrumented)"
      pattern: "createRawAdminClient"
    - from: "src/inngest/functions/agent-production.ts"
      to: "src/lib/observability/collector.ts"
      via: "step.run('observability-flush', () => collector.flush())"
      pattern: "observability-flush"
---

<objective>
Implementar `flush()` del collector: batch INSERT de todos los eventos del turno en un solo round-trip por tabla, usando `createRawAdminClient()` para evitar recursion. Instrumentar el flush con pino timing logs. Conectar el flush al handler Inngest como ultimo step.

Purpose: Persistencia atomica por turno (Pattern 3 del research, Pitfall 1 anti-recursion). Sin esto, los datos capturados en memoria se pierden al terminar el turno.
Output: Turnos con flag ON producen filas en las 5 tablas del schema.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-01-SUMMARY.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-05-SUMMARY.md
@src/lib/observability/collector.ts
@src/lib/observability/prompt-version.ts
@src/lib/supabase/admin.ts
@src/inngest/functions/agent-production.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implementar flush() con dedup de prompts, chunking y pino timing</name>
  <files>
src/lib/observability/flush.ts
src/lib/observability/collector.ts
  </files>
  <action>
1. Crear `src/lib/observability/flush.ts`:

```typescript
import { createRawAdminClient } from '@/lib/supabase/admin'
import { resolvePromptVersions } from './prompt-version'
import { createModuleLogger } from '@/lib/audit/logger'
import type { ObservabilityCollector } from './collector'
import { randomUUID } from 'node:crypto'

const logger = createModuleLogger('observability-flush')
const CHUNK_SIZE = 100

export async function flushCollector(collector: ObservabilityCollector): Promise<void> {
  const startedAt = performance.now()

  if (
    collector.events.length === 0 &&
    collector.queries.length === 0 &&
    collector.aiCalls.length === 0
  ) {
    logger.info({ conversationId: collector.conversationId }, 'empty turn, skipping flush')
    return
  }

  const supabase = createRawAdminClient() // CRITICAL: non-instrumented
  const turnId = randomUUID()

  try {
    // 1. Dedup prompt versions — build Map<hash, promptMeta>
    const promptMeta = new Map<string, { systemPrompt: string; model: string; temperature?: number; maxTokens?: number; provider: string }>()
    for (const call of collector.aiCalls) {
      if (!promptMeta.has(call.promptHash)) {
        promptMeta.set(call.promptHash, {
          systemPrompt: call.systemPrompt,
          model: call.model,
          temperature: call.temperature,
          maxTokens: call.maxTokens,
          provider: call.provider,
        })
      }
    }
    const promptVersionIds = await resolvePromptVersions(supabase, promptMeta)

    // 2. Insert turn row
    const finishedAt = new Date()
    const { error: turnError } = await supabase.from('agent_observability_turns').insert({
      id: turnId,
      conversation_id: collector.conversationId,
      workspace_id: collector.workspaceId,
      agent_id: collector.agentId,
      turn_number: collector.turnNumber ?? null,
      started_at: collector.turnStartedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      event_count: collector.events.length,
      query_count: collector.queries.length,
      ai_call_count: collector.aiCalls.length,
      total_tokens: collector.totalTokens,
      total_cost_usd: collector.totalCostUsd,
      error: collector.error,
      trigger_message_id: collector.triggerMessageId ?? null,
      trigger_kind: collector.triggerKind,
      current_mode: collector.currentMode ?? null,
      new_mode: collector.newMode ?? null,
    })
    if (turnError) throw turnError

    // 3. Chunked batch inserts for children
    await Promise.all([
      insertChunked(supabase, 'agent_observability_events', collector.events.map(e => ({
        turn_id: turnId,
        recorded_at: e.recordedAt.toISOString(),
        sequence: e.sequence,
        category: e.category,
        label: e.label ?? null,
        payload: e.payload,
        duration_ms: e.durationMs ?? null,
      }))),
      insertChunked(supabase, 'agent_observability_queries', collector.queries.map(q => ({
        turn_id: turnId,
        recorded_at: q.recordedAt.toISOString(),
        sequence: q.sequence,
        table_name: q.tableName,
        operation: q.operation,
        filters: q.filters,
        columns: q.columns,
        request_body: q.requestBody,
        duration_ms: q.durationMs,
        status_code: q.statusCode,
        row_count: q.rowCount ?? null,
        error: q.error ?? null,
      }))),
      insertChunked(supabase, 'agent_observability_ai_calls', collector.aiCalls.map(a => ({
        turn_id: turnId,
        recorded_at: a.recordedAt.toISOString(),
        sequence: a.sequence,
        prompt_version_id: promptVersionIds.get(a.promptHash)!,
        purpose: a.purpose,
        model: a.model,
        messages: a.messages,
        response_content: a.responseContent,
        input_tokens: a.inputTokens,
        output_tokens: a.outputTokens,
        cache_creation_input_tokens: a.cacheCreationInputTokens,
        cache_read_input_tokens: a.cacheReadInputTokens,
        cost_usd: a.costUsd,
        duration_ms: a.durationMs,
        status_code: a.statusCode,
        error: a.error ?? null,
      }))),
    ])

    const durationMs = performance.now() - startedAt
    logger.info({
      turnId,
      conversationId: collector.conversationId,
      agentId: collector.agentId,
      events: collector.events.length,
      queries: collector.queries.length,
      aiCalls: collector.aiCalls.length,
      durationMs,
    }, 'observability flush complete')

    // Warn on soft caps
    if (collector.events.length > CHUNK_SIZE || collector.queries.length > CHUNK_SIZE || collector.aiCalls.length > CHUNK_SIZE) {
      logger.warn({ turnId, conversationId: collector.conversationId, events: collector.events.length, queries: collector.queries.length, aiCalls: collector.aiCalls.length }, 'turn exceeded soft cap — chunked inserts')
    }
    if (durationMs > 200) {
      logger.warn({ turnId, durationMs }, 'observability flush p95 breach (>200ms)')
    }
  } catch (err) {
    logger.error({ err, turnId, conversationId: collector.conversationId }, 'observability flush failed — events dropped')
    // Re-throw so the Inngest step retries — but the step is the LAST one and non-critical.
    // Alternative: swallow to not affect the turn result. DECISION: swallow on error, because
    // failing observability must NEVER break a production turn (Regla 6).
    return
  }
}

async function insertChunked<T>(supabase: ReturnType<typeof createRawAdminClient>, table: string, rows: T[]): Promise<void> {
  if (rows.length === 0) return
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) throw error
  }
}
```

2. Modificar `src/lib/observability/collector.ts`:
   - Reemplazar el placeholder `async flush()` por: `async flush(): Promise<void> { const { flushCollector } = await import('./flush'); return flushCollector(this) }` (dynamic import para romper un potencial ciclo si existe).
   - Asegurar que `turnNumber`, `currentMode`, `newMode` son asignables post-construccion: agregar setters o campos publicos.
   - Exponer las props como `public readonly` para que flush las lea.

3. Verificar que `@/lib/audit/logger.ts` exporta `createModuleLogger`. Si no existe, crearlo como wrapper thin sobre pino con `name` field.
  </action>
  <verify>
- `npx tsc --noEmit` pasa
- `grep "createRawAdminClient" src/lib/observability/flush.ts` → 1 match (anti-recursion)
- `grep "createAdminClient\b" src/lib/observability/flush.ts` → 0 matches (NO usar el instrumentado)
- Trace mental: un turno con 5 events + 3 queries + 2 ai_calls produce 4 INSERTs (prompts upsert + turns + events + queries + ai_calls = 5 round-trips paralelizados 3+1)
  </verify>
  <done>
flush() funcional. Escribe en las 5 tablas con dedup de prompts, sin recursion, con logging de timing.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire flush step en agent-production.ts con try/finally + error recording</name>
  <files>src/inngest/functions/agent-production.ts</files>
  <action>
Modificar el handler agregado en Plan 05:

1. Reemplazar el placeholder comentado `// Plan 07 añade el flush step aqui.` por la llamada real:

```typescript
if (collector) {
  await step.run('observability-flush', async () => {
    await collector.flush()
  })
}
```

2. Wrap el inner `run()` con try/finally para capturar errores y asegurar que el flush ve el error:

```typescript
const runWithErrorCapture = async () => {
  try {
    return await run()
  } catch (err) {
    if (collector && err instanceof Error) {
      collector.recordError({
        name: err.name,
        message: err.message,
        stack: err.stack,
      })
    }
    throw err
  }
}

const result = collector
  ? await runWithCollector(collector, runWithErrorCapture)
  : await run()
```

3. Si el `run()` throws, queremos que el flush TODAVIA se ejecute (con el error registrado). Para eso, mover el flush a un finally:

```typescript
let turnResult: unknown
let turnError: unknown = null
try {
  turnResult = collector
    ? await runWithCollector(collector, runWithErrorCapture)
    : await run()
} catch (err) {
  turnError = err
}

if (collector) {
  await step.run('observability-flush', () => collector.flush())
}

if (turnError) throw turnError
return turnResult
```

**NOTA:** si `flush()` internamente swallowea errores (lo hace, ver Plan 07 Task 1), el `step.run` no reintentara y el turno seguira su curso normal.

4. Verificar que el `step.run('observability-flush', ...)` esta DESPUES del ultimo step productivo del handler, para que los events de ese step esten incluidos.

5. Re-ejecutar build.
  </action>
  <verify>
- Build pasa
- Con flag OFF → comportamiento identico, el step observability-flush nunca se registra (porque `collector` es null)
- Con flag ON (simulacion): el Inngest step list incluye `observability-flush` como ultimo step
- Si run() throws, el flush SIGUE ejecutandose (verificable por trace manual de la logica)
  </verify>
  <done>
Turnos flushean al final. Errores del turno se persisten en el campo `error` de agent_observability_turns.
</done>
</task>

</tasks>

<verification>
- Build pasa
- `grep "createRawAdminClient" src/lib/observability/` solo matchea en flush.ts (el unico consumidor interno por ahora)
- Pino logs aparecen con nombre `observability-flush`
- flush() nunca puede lanzar un error hacia el handler (swallow) — el turno no puede caer por observabilidad
</verification>

<success_criteria>
Con feature flag ON, cada turno de los 3 bots genera:
- 1 fila en agent_observability_turns
- N filas en agent_observability_events
- M filas en agent_observability_queries
- K filas en agent_observability_ai_calls
- 0-K filas nuevas en agent_prompt_versions (dedup)

Con flag OFF, 0 escrituras adicionales.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-07-SUMMARY.md` con: flujo del flush, decision de swallow-on-error, metrica de timing esperada.
</output>
