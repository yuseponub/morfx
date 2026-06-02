---
phase: 42.1-observabilidad-bots-produccion
plan: 10
type: execute
wave: 6
depends_on: [07, 09]
files_modified:
  - src/lib/observability/repository.ts
  - src/app/actions/observability.ts
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/event-row.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/ai-call-view.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/query-view.tsx
  - src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx
autonomous: true

must_haves:
  truths:
    - "getTurnDetail(turnId, startedAt) retorna { turn, events, queries, aiCalls, promptVersionsById }"
    - "El server action getTurnDetailAction valida super-user y llama al repository"
    - "TurnDetail renderiza un timeline ordenado por sequence entrelazando events + queries + aiCalls"
    - "Cada row tiene 'expandable' detail: event payload JSON, query filters/body, ai call messages/response/prompt"
    - "La vista de ai-call muestra el system prompt (dereferenciado via prompt_version_id) con diff opcional si hay versiones anteriores"
    - "La vista de query muestra table, operation, filters, columns, body, timing, status"
    - "El turn-detail NO auto-refresca (turno inmutable despues de flush — Pitfall 7)"
    - "JSON payloads se renderizan via @uiw/react-json-view (ya en package.json)"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx"
      provides: "Vista timeline de un turno completo"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/event-row.tsx"
      provides: "Renderer de una fila del timeline"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/ai-call-view.tsx"
      provides: "Vista expandida de una ai call (prompt + messages + response + tokens)"
    - path: "src/app/(dashboard)/whatsapp/components/debug-panel-production/query-view.tsx"
      provides: "Vista expandida de una query SQL"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx"
      to: "src/app/actions/observability.ts"
      via: "getTurnDetailAction(turnId, startedAt)"
      pattern: "getTurnDetailAction"
    - from: "src/app/(dashboard)/whatsapp/components/debug-panel-production/ai-call-view.tsx"
      to: "agent_prompt_versions (via join in getTurnDetail)"
      via: "promptVersionsById map lookup"
      pattern: "promptVersionsById"
---

<objective>
Implementar el detalle del turno: completar el repository.getTurnDetail, server action, y las vistas timeline + rows expandibles (events, queries, ai_calls con prompt dereferenciado). Esto completa el panel UI de observabilidad.

Purpose: Sin el detalle, la lista del Plan 09 es solo una vista incompleta. Este plan cierra el loop UI: ver QUE paso paso-a-paso en un turno especifico.
Output: Panel debug funcional end-to-end para lectura de turnos.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-09-SUMMARY.md
@src/lib/observability/repository.ts
@src/app/actions/observability.ts
@src/lib/observability/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Repository getTurnDetail + server action + tipos de retorno</name>
  <files>
src/lib/observability/repository.ts
src/app/actions/observability.ts
  </files>
  <action>
1. Extender `src/lib/observability/repository.ts` con:

```typescript
export interface TurnDetail {
  turn: TurnSummary & {
    error: { name: string; message: string; stack?: string } | null
  }
  events: Array<{
    id: string
    sequence: number
    recordedAt: string
    category: string
    label: string | null
    payload: unknown
    durationMs: number | null
  }>
  queries: Array<{
    id: string
    sequence: number
    recordedAt: string
    tableName: string
    operation: string
    filters: Record<string, string> | null
    columns: string | null
    requestBody: unknown
    durationMs: number
    statusCode: number
    rowCount: number | null
    error: string | null
  }>
  aiCalls: Array<{
    id: string
    sequence: number
    recordedAt: string
    promptVersionId: string
    purpose: string
    model: string
    messages: unknown
    responseContent: unknown
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens: number
    cacheReadInputTokens: number
    totalTokens: number
    costUsd: number
    durationMs: number
    statusCode: number
    error: string | null
  }>
  promptVersionsById: Record<string, {
    id: string
    promptHash: string
    systemPrompt: string
    model: string
    temperature: number | null
    maxTokens: number | null
    provider: string
    firstSeenAt: string
  }>
}

export async function getTurnDetail(turnId: string, startedAt: string): Promise<TurnDetail> {
  const supabase = createRawAdminClient()

  // startedAt needed for partition pruning on the parent table
  // Alternative: use turnId alone if PK is (id) — but PK is (started_at, id), so we must filter by started_at range.
  // STEP A: fetch the turn row first so we can use its real `finished_at` as the upper bound for child queries.
  // This avoids hardcoding a 10-minute window (which would silently lose data for any turn that legitimately ran longer).
  const turnStart = new Date(startedAt)
  const turnRangeStart = new Date(turnStart.getTime() - 60_000).toISOString() // 1min buffer for turn lookup
  const turnRangeEnd = new Date(turnStart.getTime() + 60_000).toISOString()

  const [turnRes, eventsRes, queriesRes, aiCallsRes] = await Promise.all([
    supabase
      .from('agent_observability_turns')
      .select('*')
      .eq('id', turnId)
      .gte('started_at', turnRangeStart)
      .lte('started_at', turnRangeEnd)
      .single(),
    supabase
      .from('agent_observability_events')
      .select('*')
      .eq('turn_id', turnId)
      .order('sequence', { ascending: true }),
    supabase
      .from('agent_observability_queries')
      .select('*')
      .eq('turn_id', turnId)
      .order('sequence', { ascending: true }),
    supabase
      .from('agent_observability_ai_calls')
      .select('*')
      .eq('turn_id', turnId)
      .order('sequence', { ascending: true }),
  ])

  // OPTIMIZATION (post-MVP): for partition pruning on child tables, do a 2-step fetch:
  // STEP A above already fetched the turn row → use turnRes.data.finished_at as the recorded_at upper bound
  // for events/queries/aiCalls. This narrows the partition scan to the actual turn lifetime (typically <30s)
  // instead of scanning the full month partition. Add the .gte/.lte filters here once perf becomes a concern.
  // Comment kept inline so the optimization is discoverable when needed.
  // Example (post-MVP):
  //   const finishedAt = turnRes.data?.finished_at ?? new Date(turnStart.getTime() + 10 * 60_000).toISOString()
  //   .gte('recorded_at', turnRangeStart).lte('recorded_at', finishedAt)

  if (turnRes.error) throw turnRes.error
  if (eventsRes.error) throw eventsRes.error
  if (queriesRes.error) throw queriesRes.error
  if (aiCallsRes.error) throw aiCallsRes.error

  // Fetch referenced prompt versions
  const promptVersionIds = Array.from(new Set((aiCallsRes.data ?? []).map(a => a.prompt_version_id)))
  const promptsRes = promptVersionIds.length > 0
    ? await supabase.from('agent_prompt_versions').select('*').in('id', promptVersionIds)
    : { data: [], error: null }
  if (promptsRes.error) throw promptsRes.error

  const promptVersionsById: TurnDetail['promptVersionsById'] = {}
  for (const p of promptsRes.data ?? []) {
    promptVersionsById[p.id] = {
      id: p.id,
      promptHash: p.prompt_hash,
      systemPrompt: p.system_prompt,
      model: p.model,
      temperature: p.temperature,
      maxTokens: p.max_tokens,
      provider: p.provider,
      firstSeenAt: p.first_seen_at,
    }
  }

  // Map rows to TurnDetail shape (camelCase)
  const t = turnRes.data
  return {
    turn: {
      id: t.id,
      conversationId: t.conversation_id,
      workspaceId: t.workspace_id,
      agentId: t.agent_id,
      startedAt: t.started_at,
      finishedAt: t.finished_at,
      durationMs: t.duration_ms,
      eventCount: t.event_count,
      queryCount: t.query_count,
      aiCallCount: t.ai_call_count,
      totalTokens: t.total_tokens,
      totalCostUsd: Number(t.total_cost_usd),
      hasError: t.error !== null,
      triggerKind: t.trigger_kind,
      currentMode: t.current_mode,
      newMode: t.new_mode,
      error: t.error,
    },
    events: (eventsRes.data ?? []).map(e => ({
      id: e.id,
      sequence: e.sequence,
      recordedAt: e.recorded_at,
      category: e.category,
      label: e.label,
      payload: e.payload,
      durationMs: e.duration_ms,
    })),
    queries: (queriesRes.data ?? []).map(q => ({
      id: q.id,
      sequence: q.sequence,
      recordedAt: q.recorded_at,
      tableName: q.table_name,
      operation: q.operation,
      filters: q.filters,
      columns: q.columns,
      requestBody: q.request_body,
      durationMs: q.duration_ms,
      statusCode: q.status_code,
      rowCount: q.row_count,
      error: q.error,
    })),
    aiCalls: (aiCallsRes.data ?? []).map(a => ({
      id: a.id,
      sequence: a.sequence,
      recordedAt: a.recorded_at,
      promptVersionId: a.prompt_version_id,
      purpose: a.purpose,
      model: a.model,
      messages: a.messages,
      responseContent: a.response_content,
      inputTokens: a.input_tokens,
      outputTokens: a.output_tokens,
      cacheCreationInputTokens: a.cache_creation_input_tokens,
      cacheReadInputTokens: a.cache_read_input_tokens,
      totalTokens: a.total_tokens,
      costUsd: Number(a.cost_usd),
      durationMs: a.duration_ms,
      statusCode: a.status_code,
      error: a.error,
    })),
    promptVersionsById,
  }
}
```

2. Extender `src/app/actions/observability.ts`:

```typescript
export async function getTurnDetailAction(turnId: string, startedAt: string): Promise<TurnDetail> {
  await assertSuperUser()
  return getTurnDetail(turnId, startedAt)
}
```

Exportar tipos necesarios.
  </action>
  <verify>
- Build pasa
- Tipado: el consumer recibe TurnDetail totalmente tipado
- Query performance: el filtro por (started_at range + id) permite partition pruning al planner de Postgres
  </verify>
  <done>
Repository + server action listos para servir el detalle.
  </done>
</task>

<task type="auto">
  <name>Task 2: UI components — turn-detail, event-row, ai-call-view, query-view + wire en index</name>
  <files>
src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx
src/app/(dashboard)/whatsapp/components/debug-panel-production/event-row.tsx
src/app/(dashboard)/whatsapp/components/debug-panel-production/ai-call-view.tsx
src/app/(dashboard)/whatsapp/components/debug-panel-production/query-view.tsx
src/app/(dashboard)/whatsapp/components/debug-panel-production/index.tsx
  </files>
  <action>
1. `turn-detail.tsx` (Client Component):

```typescript
'use client'
import useSWR from 'swr'
import { getTurnDetailAction } from '@/app/actions/observability'
import type { TurnDetail } from '@/lib/observability/repository'
import { EventRow } from './event-row'

interface Props {
  turnId: string
  startedAt: string
}

export function TurnDetailView({ turnId, startedAt }: Props) {
  // NO auto-refresh — turnos son inmutables post-flush (Pitfall 7)
  const { data, error, isLoading } = useSWR<TurnDetail>(
    ['obs-turn-detail', turnId],
    () => getTurnDetailAction(turnId, startedAt),
    { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: Infinity },
  )

  if (error) return <div className="p-4 text-red-500 text-sm">Error: {error.message}</div>
  if (isLoading || !data) return <div className="p-4 text-zinc-500 text-sm">Cargando...</div>

  // Merge events + queries + aiCalls into a single sequence-ordered timeline
  type TimelineItem =
    | { kind: 'event'; sequence: number; data: TurnDetail['events'][number] }
    | { kind: 'query'; sequence: number; data: TurnDetail['queries'][number] }
    | { kind: 'ai'; sequence: number; data: TurnDetail['aiCalls'][number] }

  const timeline: TimelineItem[] = [
    ...data.events.map(e => ({ kind: 'event' as const, sequence: e.sequence, data: e })),
    ...data.queries.map(q => ({ kind: 'query' as const, sequence: q.sequence, data: q })),
    ...data.aiCalls.map(a => ({ kind: 'ai' as const, sequence: a.sequence, data: a })),
  ].sort((a, b) => a.sequence - b.sequence)

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-zinc-800 text-xs text-zinc-400">
        <div className="text-zinc-100 text-sm">{data.turn.agentId} · {data.turn.triggerKind}</div>
        <div>{data.turn.durationMs}ms · {data.turn.totalTokens}tok · ${data.turn.totalCostUsd.toFixed(4)}</div>
        {data.turn.error && (
          <div className="mt-2 p-2 bg-red-950/40 text-red-300 text-xs rounded">
            {data.turn.error.name}: {data.turn.error.message}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
        {timeline.map((item, i) => (
          <EventRow key={`${item.kind}-${item.data.id}`} item={item} promptVersionsById={data.promptVersionsById} />
        ))}
      </div>
    </div>
  )
}
```

2. `event-row.tsx`:

```typescript
'use client'
import { useState } from 'react'
import type { TurnDetail } from '@/lib/observability/repository'
import { AiCallView } from './ai-call-view'
import { QueryView } from './query-view'
import JsonView from '@uiw/react-json-view'

type TimelineItem =
  | { kind: 'event'; sequence: number; data: TurnDetail['events'][number] }
  | { kind: 'query'; sequence: number; data: TurnDetail['queries'][number] }
  | { kind: 'ai'; sequence: number; data: TurnDetail['aiCalls'][number] }

interface Props {
  item: TimelineItem
  promptVersionsById: TurnDetail['promptVersionsById']
}

export function EventRow({ item, promptVersionsById }: Props) {
  const [expanded, setExpanded] = useState(false)

  const header = (() => {
    if (item.kind === 'event') {
      return (
        <>
          <span className="text-cyan-400">EVT</span> · {item.data.category}
          {item.data.label && <span className="text-zinc-400"> · {item.data.label}</span>}
          {item.data.durationMs != null && <span className="text-zinc-600 ml-2">{item.data.durationMs}ms</span>}
        </>
      )
    }
    if (item.kind === 'query') {
      return (
        <>
          <span className="text-amber-400">SQL</span> · {item.data.operation} {item.data.tableName}
          <span className="text-zinc-600 ml-2">{item.data.durationMs}ms · {item.data.rowCount ?? '-'} rows · {item.data.statusCode}</span>
          {item.data.error && <span className="text-red-400 ml-2">ERROR</span>}
        </>
      )
    }
    return (
      <>
        <span className="text-violet-400">AI</span> · {item.data.purpose} · {item.data.model}
        <span className="text-zinc-600 ml-2">{item.data.durationMs}ms · {item.data.totalTokens}tok · ${item.data.costUsd.toFixed(4)}</span>
      </>
    )
  })()

  return (
    <div className="text-xs">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left p-2 hover:bg-zinc-900/50 flex items-center gap-2"
      >
        <span className="text-zinc-600 w-8 text-right">{item.sequence}</span>
        <span>{header}</span>
      </button>
      {expanded && (
        <div className="bg-zinc-950 p-3 border-l-2 border-zinc-800">
          {item.kind === 'event' && (
            <JsonView value={item.data.payload as object} collapsed={2} style={{ backgroundColor: 'transparent' }} />
          )}
          {item.kind === 'query' && <QueryView query={item.data} />}
          {item.kind === 'ai' && (
            <AiCallView call={item.data} promptVersion={promptVersionsById[item.data.promptVersionId]} />
          )}
        </div>
      )}
    </div>
  )
}
```

3. `query-view.tsx`: renderiza filters, columns, requestBody con JsonView. Incluye tabla, operation, status, rowCount, duration, error.

4. `ai-call-view.tsx`: renderiza:
   - Header: purpose, model, temperature, maxTokens
   - Tokens: input/output/cacheCreation/cacheRead breakdown
   - Cost
   - Tabs o secciones colapsables: "System Prompt" (promptVersion.systemPrompt — text block con monospace), "Messages" (JsonView del array messages), "Response" (JsonView del array responseContent)
   - Prompt hash (corto: primeros 8 chars) + tooltip con firstSeenAt de la promptVersion

5. Modificar `debug-panel-production/index.tsx`:
   - Importar `TurnDetailView` y reemplazar el placeholder "implementado en Plan 10" por `<TurnDetailView turnId={selectedTurn.id} startedAt={selectedTurn.startedAt} />`.
  </action>
  <verify>
- Build pasa
- `grep "@uiw/react-json-view" src/app/(dashboard)/whatsapp/components/debug-panel-production/` → al menos 2 matches
- Componentes renderizan con TurnDetail mock (puede hacerse con un test story manual o scratch)
- Timeline ordenado por sequence merged entre events+queries+aiCalls
  </verify>
  <done>
Panel debug completo. Usuario puede seleccionar turno → ver timeline → expandir cada evento para detalle completo.
  </done>
</task>

</tasks>

<verification>
- Build pasa
- Sin regresion del inbox WhatsApp
- Panel se ve bien en 1440x900 (tamaño dev habitual) y no rompe en viewports mas angostos
</verification>

<success_criteria>
Con feature flag ON (a activar en Plan 11), el super-user puede abrir cualquier conversacion del inbox, toggle el panel debug, ver la lista de turnos del dia, hacer click en uno y ver timeline completo con JSON expandible.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-10-SUMMARY.md` con: arbol de componentes UI, shape de TurnDetail, estrategia de partition pruning en getTurnDetail.
</output>
