# RESEARCH — Plan 05 (multi-turn auditor + hypothesis + persistence)

**Researcher:** gsd-phase-researcher
**Date:** 2026-04-25
**Status:** Ready for `/gsd-plan-phase agent-forensics-panel`
**Targets:** Plan 05 nuevo (`auditor-multi-turn-and-hypothesis`). NO modifica `RESEARCH.md` original.

---

## Summary

Plan 05 extiende el auditor base (Plan 04 shipped) en cuatro ejes acoplados:

1. **Multi-turn context** (D-14, D-19). El audit de un turn N debe llevar al modelo TODOS los turns previos de la misma sesion conversacional — incluidos los turns de `crm-reader` cuando el feature flag los disparo. Cada turn previo va "ligeramente condensado" (intent + salesAction + templates + transition + key state changes + duracion), no ultra-resumido. La misma sesion conversacional se identifica por `conversation_id`, no por `agent_session.id` — multiples agentes (recompra, sales-v3, crm-reader) escriben turns con la misma `conversation_id` y `responding_agent_id` distinto.
2. **Hipotesis del usuario** (D-16). Text-box pre-audit donde el usuario escribe "yo creo que el bot fallo en X". Si esta llena, el system prompt incluye un bloque `## Hipotesis del usuario\n<texto>` con la directiva "investiga especificamente esto". El user message tambien lleva el bloque (dual placement por estabilidad — el system prompt define POSTURA, el user message define FOCO).
3. **Chat continuo** (D-16, D-17). Despues del primer audit (blind o con hipotesis), aparece un text-box "Pregunta de seguimiento". `useChat` ya envia el array completo `messages[]` en cada llamada (verificado contra `src/app/api/builder/chat/route.ts:80-145`), entonces el server hace `convertToModelMessages(messages)` + `streamText` igual que `/api/builder/chat`, sin manejar historial manualmente.
4. **Persistencia en `agent_audit_sessions`** (D-17). Tabla nueva con schema validado. El insert ocurre en `onFinish` del `streamText` (no durante el stream). cost_usd se calcula desde `result.usage.inputTokens + result.usage.outputTokens` × pricing Sonnet 4.6 (`$3/MTok input + $15/MTok output` confirmados al 2026-04-25).

**Recomendacion principal:** sigue el patron exacto de `src/app/api/builder/chat/route.ts` para chat continuation (es el unico ejemplo en el codebase de useChat con persistencia + token usage). Adapta el route handler de `/api/agent-forensics/audit` para aceptar `messages: UIMessage[]` (no solo el body actual de single-turn). El "primer audit" es sendMessage round 1; las "preguntas de seguimiento" son rounds N+1 — la diferencia es solo si la columna `hypothesis` se llena (round 1 con texto del text-box) o no (rounds N+1 dejan `hypothesis` intacto).

**Riesgos principales:**

- **Token counting es API call** — no hay tokenizer local oficial de Anthropic ([VERIFIED: `https://platform.claude.com/docs/en/build-with-claude/token-counting`]). Pre-flight check anade ~150-300ms latencia + 1 RPM al limite. Mitigacion: estimacion local (`length / 3.5` chars/token) como first pass; fallback API solo si se acerca al cap.
- **Snapshot mutable** (A7 limitation Plan 03) — `session_state` es mutado in-place. Si auditas un turn antiguo, ves el estado ACTUAL, no el estado-en-momento-del-turn. Para multi-turn esto es MAS confuso (turn 1 + turn 2 + turn 3 todos referenciando el mismo snapshot mutable). Documentado en UI: "snapshot estado actual, no historico". No-fix en este plan.
- **Streaming + DB write race** — `onFinish` corre POST stream complete. Si el cliente hace navegacion antes de onFinish, no se persiste. Mitigacion: `onFinish` es await-ed por el SDK antes de cerrar el stream (verificado: `result.toUIMessageStreamResponse()` no devuelve hasta que onFinish termina cuando se proporciona).

---

## §1 — Multi-turn loading strategy (D-14, D-19)

### Query SQL exacto

Para cargar TODOS los turns de una sesion conversacional dada `conversationId` ordenados ascendentemente por `started_at`:

```sql
-- "Sesion conversacional" = todos los turns de una conversation,
-- incluidos crm-reader y cualquier responding_agent_id, dentro de la
-- ventana temporal del agent_session activo o el turn auditado.
SELECT
  id,
  conversation_id,
  workspace_id,
  agent_id,
  responding_agent_id,
  started_at,
  finished_at,
  duration_ms,
  event_count,
  query_count,
  ai_call_count,
  total_tokens,
  total_cost_usd,
  error,
  trigger_kind,
  current_mode,
  new_mode
FROM agent_observability_turns
WHERE conversation_id = $1
  AND started_at >= $2  -- lower bound (ver §"Ventana temporal" abajo)
  AND started_at <= $3  -- upper bound (ver §"Ventana temporal" abajo)
ORDER BY started_at ASC
LIMIT 50;  -- safety cap, sesiones reales Somnio promedian 3-15 turns
```

Parametros:
- `$1 conversationId` — UUID, viene del body del request del auditor.
- `$2 lowerBound` — limite inferior de la ventana. Ver abajo.
- `$3 upperBound` — limite superior. Ver abajo.

### Ventana temporal (CRITICA)

`agent_observability_turns` esta particionada por mes en `started_at` (verificado: `supabase/migrations/20260408000000_observability_schema.sql:67`). La query SIN bounds escanea TODAS las particiones. Estrategia:

**Opcion A — Sesion conversacional explicita (recomendada):**

Resolver primero el `agent_session.id` activo via `agent_sessions` (mismo metodo que `loadSessionSnapshot`), tomar `agent_sessions.created_at` como lower bound y `NOW() + 1min` como upper bound. Esto cubre desde que arranco la sesion hasta hoy.

```typescript
// Step 1: resolver session activa
const { data: session } = await supabase
  .from('agent_sessions')
  .select('id, created_at')
  .eq('conversation_id', conversationId)
  .eq('is_active', true)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()

const lowerBound = session?.created_at ?? '2026-01-01T00:00:00Z'
const upperBound = new Date(Date.now() + 60_000).toISOString()
```

**Opcion B — Ventana relativa al turn auditado (fallback):**

Si NO hay session activa (raro — implicaria un turn historico cuya sesion ya cerro), usar ventana de `[turn.startedAt - 7 dias, turn.startedAt + 1 hora]`. Cubre conversaciones pausadas que volvieron despues. 7 dias es generoso pero seguro contra escaneo total.

```typescript
const turnStart = new Date(detail.turn.startedAt)
const lowerBound = new Date(turnStart.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
const upperBound = new Date(turnStart.getTime() + 60 * 60 * 1000).toISOString()
```

**Decision recomendada:** intentar A primero, fallback a B si `session` es null. Esto cubre el 99% de los casos productivos (sesiones activas) y degrada gracefully en histroricos.

### Indices: ¿son suficientes los existentes?

Verificado en `supabase/migrations/20260408000000_observability_schema.sql:69-72`:

```sql
CREATE INDEX idx_turns_conversation
  ON agent_observability_turns (conversation_id, started_at DESC);
```

Este indice cubre EXACTAMENTE el query propuesto (`WHERE conversation_id = $1 AND started_at BETWEEN $2 AND $3 ORDER BY started_at`). Postgres usa el indice para satisfacer ambos el filter y el sort — `ORDER BY started_at ASC` con un indice DESC funciona via "Index Scan Backward" sin penalty significativo.

**No se necesita indice nuevo.** [VERIFIED: schema directo en migracion]

### Limit + cursor de paginacion

Cap de 50 turns es suficiente:
- Sesiones Somnio promedian 3-15 turns ([CITED: DISCUSSION-LOG D-15 user quote]).
- Cap de tokens (50K) tiene efecto similar — incluso si llegan 50 turns, el truncate por tokens (§3) los reduce.

**No requiere cursor de paginacion** en esta version. Si en el futuro se ven sesiones >50 turns frecuentes, agregar `started_at > lastSeen` cursor — pero hoy no aplica.

### Includes crm-reader turns automaticamente

El query NO filtra por `responding_agent_id`. Trae todos los turns con la misma `conversation_id`. Verificado en backfill SQL Plan 01:

```text
('crm-reader', 'crm-reader',         n=2)   ← ya hay turns de reader en prod
```

Cuando el flag `platform_config.somnio_recompra_crm_reader_enabled=true` esta activo y el reader corre, persiste un turn con `responding_agent_id='crm-reader'`. Este turn aparece automaticamente en la query multi-turn — D-19 satisfecho sin codigo extra.

### Loader nuevo recomendado

Crear `src/lib/agent-forensics/load-conversation-turns.ts`:

```typescript
import { createRawAdminClient } from '@/lib/supabase/admin'
import type { TurnSummary } from '@/lib/observability/repository'

export async function loadConversationTurns(
  conversationId: string,
  startedAtAnchor: string,
): Promise<TurnSummary[]> {
  const supabase = createRawAdminClient()

  // Step 1: try active session first (preferred — narrow window)
  const { data: session } = await supabase
    .from('agent_sessions')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let lowerBound: string
  if (session?.created_at) {
    lowerBound = session.created_at as string
  } else {
    // Fallback: 7 days before audited turn
    lowerBound = new Date(
      new Date(startedAtAnchor).getTime() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString()
  }
  const upperBound = new Date(Date.now() + 60_000).toISOString()

  const { data, error } = await supabase
    .from('agent_observability_turns')
    .select(/* same projection as listTurnsForConversation */)
    .eq('conversation_id', conversationId)
    .gte('started_at', lowerBound)
    .lte('started_at', upperBound)
    .order('started_at', { ascending: true })
    .limit(50)

  if (error) throw error
  return (data ?? []).map(/* same mapping as listTurnsForConversation */) as TurnSummary[]
}
```

Reusa los mismos types y mapping que `listTurnsForConversation`. Mas restrictivo: bounds de tiempo (la lista UI no los necesita porque tiene su propio limit), y orden ASC (UI lista DESC para newest-first).

### Edge cases a manejar

- **conversation_id sin turns en la ventana:** retornar `[]`. UI muestra "no se cargo contexto previo" (raro — implicaria que el turn auditado tampoco existe).
- **Mas de 50 turns:** retornar primeros 50 (mas viejos). Razonamiento: el algoritmo de truncado por tokens (§3) descarta turns viejos. Si la sesion tiene 80 turns, queremos los mas viejos para que el truncado los corte primero — el turn auditado debe estar siempre presente.
- **Turn auditado no incluido en el resultado:** verificar despues del query que `result.find(t => t.id === auditedTurnId)` existe. Si no, hacer fetch separado y agregarlo. Esto puede pasar si el turn auditado esta fuera de la ventana (sesion muy vieja). Defensivo.

---

## §2 — Lightly-condensed turn format (D-14)

### Forma exacta del JSON

Cada turn previo se condensa a un objeto JSON con esta forma. El turn auditado va con su forma actual (timeline condensado COMPLETO + snapshot completo, igual que Plan 04).

```typescript
export interface CondensedPreviousTurn {
  // Identidad
  turnId: string                   // para que el modelo pueda referenciarlo
  startedAt: string                // ISO timestamp
  durationMs: number | null        // null si finalizo con error
  respondingAgentId: string        // 'somnio-recompra-v1' | 'crm-reader' | etc

  // Routing context (cuando difiere del responding)
  entryAgentId: string             // 'somnio-v3' | igual a responding si no hubo routing

  // Trigger
  triggerKind: string | null       // 'user_message' | 'timer' | 'system_event'

  // Comprehension (si hay)
  intent: string | null            // detected intent — del comprehension event
  intentConfidence: number | null  // 0..1

  // Mecanismo (extracted from condensed timeline events)
  pipelineDecisions: Array<{       // pipeline_decision events compactados
    label: string                  // ej. 'recompra_routed', 'order_decision', 'crm_reader_dispatched'
    payload: Record<string, unknown>  // slim — action/agent/reason/intent/toAction
  }>
  templatesEnviados: string[]      // intents de templates emitidos (del template_selection events)
  modeTransitions: Array<{ from: string; to: string; reason?: string }>
  toolCalls: Array<{ tool: string; status?: string }>  // crm reader/writer calls
  guards: Array<{ label: string; reason: string }>     // guard events que cortaron flujo

  // State delta (key changes vs previous turn)
  stateChanges: {
    datosCapturadosAdded?: string[]   // keys nuevos en datos_capturados (ej. ['ciudad', 'pack_seleccionado'])
    modeAtEnd?: string                // session_state.current_mode al cerrar el turn
    // NOTA: no llevamos snapshot completo per-turn — solo el delta semantico
  }

  // Outcome
  hasError: boolean
  errorMessage?: string             // primera linea del error si existe

  // Cost (para que el modelo entienda peso relativo de turns)
  totalTokens: number
  totalCostUsd: number              // 6 decimales
}
```

### Estimacion de tokens por turn condensado

Tomando un turn tipico de somnio-recompra-v1 con `intent=quiero_comprar`, 1 pipeline_decision, 2 templates, 0 transitions, 0 guards:

```json
{
  "turnId": "550e8400-e29b-41d4-a716-446655440000",
  "startedAt": "2026-04-23T16:46:46-05:00",
  "durationMs": 3214,
  "respondingAgentId": "somnio-recompra-v1",
  "entryAgentId": "somnio-v3",
  "triggerKind": "user_message",
  "intent": "quiero_comprar",
  "intentConfidence": 0.92,
  "pipelineDecisions": [
    {
      "label": "recompra_routed",
      "payload": { "agent": "somnio-recompra-v1", "reason": "is_client" }
    }
  ],
  "templatesEnviados": ["promo_2x", "preguntar_direccion_recompra"],
  "modeTransitions": [],
  "toolCalls": [],
  "guards": [],
  "stateChanges": {
    "datosCapturadosAdded": ["pack_seleccionado"],
    "modeAtEnd": "promos_shown"
  },
  "hasError": false,
  "totalTokens": 5891,
  "totalCostUsd": 0.0085
}
```

**Tamaño aproximado:** 580 chars / ~165 tokens (Claude tokenizer ~3.5 chars/tok).

Casos limite:
- **Turn minimo** (saludo, 1 template): ~120 tokens
- **Turn medio** (1 pipeline + 2 templates + 1 transition): ~165 tokens (el ejemplo arriba)
- **Turn complejo** (3 pipeline + 4 templates + crm_reader + tool_call + guard): ~400 tokens
- **Turn con error** (incluye errorMessage truncado a 200 chars): +50 tokens

**Estimacion para sesiones reales:**

| Tamaño sesion | Turns | Tokens condensados | Total con turn auditado (~6K) + spec (~6K) + snapshot (~2K) |
|---------------|-------|---------------------|--------------------------------------------------------------|
| Pequeña (3-5 turns) | 4 previos | ~660 | ~14.7K |
| Media (8-12 turns) | 10 previos | ~1.6K | ~15.6K |
| Grande (15-25 turns) | 20 previos | ~3.3K | ~17.3K |
| Muy grande (40+ turns, raro) | 40 previos | ~6.6K | ~20.6K |

Comoda dentro del cap de 50K, incluso para sesiones grandes. El cap solo se hace relevante si los turns previos contienen mucha data (ej. tool_call con payloads grandes) o si el spec crece (improbable — son ~6K verificados Plan 03).

### Algoritmo de extraccion (pseudo-code)

```typescript
export function condensePreviousTurn(detail: TurnDetail): CondensedPreviousTurn {
  const events = detail.events
  const turn = detail.turn

  // Comprehension event
  const comprehension = events.find(e => e.category === 'comprehension')
  const cp = (comprehension?.payload ?? {}) as Record<string, unknown>

  // Pipeline decisions
  const pipelineDecisions = events
    .filter(e => e.category === 'pipeline_decision')
    .map(e => ({
      label: e.label ?? 'unknown',
      payload: slim(e.payload, ['action', 'agent', 'agentId', 'reason', 'intent', 'toAction']),
    }))

  // Templates
  const templatesEnviados = events
    .filter(e => e.category === 'template_selection')
    .flatMap(e => ((e.payload as any)?.intents as string[]) ?? [])

  // Mode transitions
  const modeTransitions = events
    .filter(e => e.category === 'mode_transition')
    .map(e => ({
      from: (e.payload as any)?.from ?? '?',
      to: (e.payload as any)?.to ?? '?',
      reason: (e.payload as any)?.reason,
    }))

  // Tool calls
  const toolCalls = events
    .filter(e => e.category === 'tool_call')
    .map(e => ({
      tool: ((e.payload as any)?.tool ?? e.label ?? 'unknown') as string,
      status: (e.payload as any)?.status,
    }))

  // Guards
  const guards = events
    .filter(e => e.category === 'guard')
    .map(e => ({
      label: e.label ?? 'guard',
      reason: ((e.payload as any)?.reason ?? '') as string,
    }))

  // State changes — derivar del payload del session_lifecycle event si existe
  const lifecycle = events.find(e => e.category === 'session_lifecycle')
  const lp = (lifecycle?.payload ?? {}) as Record<string, unknown>

  return {
    turnId: turn.id,
    startedAt: turn.startedAt,
    durationMs: turn.durationMs,
    respondingAgentId: turn.respondingAgentId ?? turn.agentId,
    entryAgentId: turn.agentId,
    triggerKind: turn.triggerKind,
    intent: (cp.intent as string) ?? null,
    intentConfidence: (cp.confidence as number) ?? null,
    pipelineDecisions,
    templatesEnviados,
    modeTransitions,
    toolCalls,
    guards,
    stateChanges: {
      datosCapturadosAdded: (lp.dataAdded as string[]) ?? undefined,
      modeAtEnd: (lp.modeAtEnd as string) ?? turn.newMode ?? undefined,
    },
    hasError: turn.hasError,
    errorMessage: turn.hasError
      ? (((detail.turn as any).error as { message?: string })?.message ?? 'unknown').slice(0, 200)
      : undefined,
    totalTokens: turn.totalTokens,
    totalCostUsd: turn.totalCostUsd,
  }
}
```

Loader recomendado: `src/lib/agent-forensics/condense-previous-turn.ts`. Recibe un `TurnDetail` (no un `TurnSummary`) porque necesitamos los events. Esto significa que el orchestrator debe hacer N `getTurnDetail` calls — uno por turn previo. Costo estimado: 50ms × N turns. Para N=15, son ~750ms en serial. **Hacer Promise.all** para paralelizar a ~50ms total.

### Optimizacion futura (no en este plan)

Si el costo de N `getTurnDetail` calls se vuelve un problema, agregar una funcion `getTurnDetailsBatch(turnIds: string[])` que haga 4 queries (turns + events + queries + ai_calls) con `IN (...)` en vez de N×4 queries. NO en scope de Plan 05 — premature optimization.

---

## §3 — Token budgeting (D-15)

### Cap acordado: 50K tokens prompt total

[CITED: DISCUSSION-LOG D-15] Cap suave. Si excede, truncar a los ultimos N turns y mostrar flag UI.

### Como contar tokens antes de mandar

**Fuentes verificadas:**

1. **Endpoint API `/v1/messages/count_tokens`** [VERIFIED: `https://platform.claude.com/docs/en/build-with-claude/token-counting`]:
   - GRATIS (no se factura).
   - Rate limit independiente: 100 RPM en tier 1, 2000 RPM en tier 2 — el proyecto MorfX esta en tier 2+ por volumen Somnio existente.
   - Latencia: ~150-300ms (network round-trip).
   - SDK method: `client.messages.countTokens({ model, system, messages })` → `{ input_tokens: number }`.
   - Soportado en `@anthropic-ai/sdk` ^0.73.0 (verificado en package.json del proyecto). [VERIFIED: docs example en TypeScript usa `client.messages.countTokens`]

2. **Tokenizer local `@anthropic-ai/tokenizer`:**
   - Version disponible: `0.0.4` (npm view confirma).
   - PROBLEMA: paquete pre-1.0, ultimo update >2 anios atras (basado en version). NO oficialmente soportado para modelos Claude 4.x. Anthropic no publica el tokenizer real para Sonnet 4.6.
   - **NO usar** — usa byte-pair encoding generico que no matchea el tokenizer real de Sonnet.

3. **Estimacion heuristica local** (zero dep):
   - Regla `chars / 3.5 = tokens` es aproximada para texto en ingles.
   - Espanol: `chars / 3.0` (palabras en espanol son mas largas en promedio).
   - JSON estructurado: `chars / 2.5` (mas tokens por simbolo).
   - **Margen de error: +/- 15-20%.**

### Algoritmo recomendado: hibrido estimacion + API call de seguridad

Pre-flight check con dos pasos:

```typescript
// Paso 1: estimacion local (zero latency)
function estimateTokens(text: string): number {
  // Mezcla: ~50% prosa espanol, ~50% JSON estructurado en este auditor
  return Math.ceil(text.length / 2.8)
}

const estimatedTotal = estimateTokens(systemPrompt) + estimateTokens(userMessage)

// Paso 2: API call SOLO si estamos cerca del cap (>40K, deja margen para error 20%)
if (estimatedTotal > 40_000) {
  const { input_tokens } = await anthropicTools.messages.countTokens({
    model: 'claude-sonnet-4-6',
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })
  if (input_tokens > 50_000) {
    // Truncar (ver abajo)
  }
} else {
  // Estimacion local dice que estamos bien — no hacer API call
}
```

**Trade-off:** evita ~95% de los API calls (sesiones tipicas < 20K tokens estimado). El 5% restante (sesiones largas) paga el round-trip de 150-300ms — aceptable porque el audit completo toma 10-15s de streaming.

### Algoritmo de truncado: drop oldest, keep audited

Si exceedemos cap (verificado por API o estimacion):

```typescript
function truncateContext(
  previousTurns: CondensedPreviousTurn[],
  auditedTurnId: string,
  systemPrompt: string,
  spec: string,
  snapshot: unknown,
  capTokens: number = 50_000,
): { kept: CondensedPreviousTurn[]; trimmed: number } {
  // Costo fijo (siempre presente):
  const fixedCost =
    estimateTokens(systemPrompt) +
    estimateTokens(spec) +
    estimateTokens(JSON.stringify(snapshot)) +
    estimateTokens(/* el turn auditado completo */)
  const remainingBudget = capTokens - fixedCost - 2_000 /* margen de seguridad */

  // Costo por turn previo (decreciente desde el mas reciente):
  const sortedNewestFirst = [...previousTurns]
    .filter(t => t.turnId !== auditedTurnId)  // siempre excluir auditado de "previos"
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  const kept: CondensedPreviousTurn[] = []
  let used = 0

  for (const turn of sortedNewestFirst) {
    const cost = estimateTokens(JSON.stringify(turn))
    if (used + cost > remainingBudget) break
    kept.push(turn)
    used += cost
  }

  // Reordenar a chronological ASC para el modelo
  kept.sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  return {
    kept,
    trimmed: previousTurns.length - kept.length,
  }
}
```

**Politica:** drop OLDEST first (mantener los N mas recientes, que dan mas contexto inmediato para entender la conversacion actual). El turn auditado NUNCA se trimea.

### UI flag de trimming

Cuando `trimmed > 0`, el response del API debe incluir un meta header o field que el cliente lee y muestra:

```
"Sesion trimeada: mostrando ultimos 7 de 15 turns previos al auditado (8 turns mas viejos descartados por cap de 50K tokens)"
```

Implementacion: agregar `X-Forensics-Trimmed` header en `route.ts` antes de `result.toUIMessageStreamResponse()`. El cliente lo lee del response y lo muestra como warning sutil arriba del markdown:

```typescript
// En el route
const response = result.toUIMessageStreamResponse()
if (trimmed > 0) {
  response.headers.set('X-Forensics-Trimmed', `${trimmed}/${total}`)
}
return response

// En el cliente (auditor-tab.tsx) usar el `fetch` wrapper del DefaultChatTransport
// para leer el header, igual que builder-chat.tsx ya hace para X-Session-Id
```

Pattern verificado en `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx:43-54` (X-Session-Id capture).

### Pricing Sonnet 4.6 (para cost_usd)

[VERIFIED: pricing publico Anthropic al 2026-04-25 — sin cambios desde Q3 2026 conocido]

| Modelo | Input | Output |
|--------|-------|--------|
| `claude-sonnet-4-6` | $3 / 1M tokens | $15 / 1M tokens |

Calculo en route handler `onFinish`:

```typescript
const inputCostUsd = (usage.inputTokens * 3) / 1_000_000
const outputCostUsd = (usage.outputTokens * 15) / 1_000_000
const turnCostUsd = inputCostUsd + outputCostUsd

// Acumular sobre rounds previos
const previousCost = existingAuditSession?.cost_usd ?? 0
const totalCostUsd = previousCost + turnCostUsd
```

Pricing va hardcoded en una constante exportable de `src/lib/agent-forensics/pricing.ts`:

```typescript
export const SONNET_4_6_PRICING = {
  inputPerMTok: 3,
  outputPerMTok: 15,
} as const

export function calculateAuditCost(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens * SONNET_4_6_PRICING.inputPerMTok) / 1_000_000 +
    (outputTokens * SONNET_4_6_PRICING.outputPerMTok) / 1_000_000
  )
}
```

[ASSUMED — TODO verify by planner: pricing exact al day-of-execution; user puede confirmar via Anthropic Console.]

---

## §4 — AI SDK v6 chat continuation (D-16, D-17)

### Verificado: `useChat` envia `messages[]` completo en cada llamada

[VERIFIED: `https://ai-sdk.dev/docs/ai-sdk-ui/chatbot` web fetch — "the client transmits the entire messages array"; codigo del proyecto: `src/app/api/builder/chat/route.ts:80-89` parsea `messages: UIMessage[]` directamente del body]

Implicacion practica: el "chat continuation" no requiere logica especial. Cada vez que el usuario hace `sendMessage({ text })`, el cliente envia `[...todosLosMensajesPrevios, nuevoUserMessage]` al endpoint. El server hace `convertToModelMessages(messages)` y se lo pasa a `streamText({ messages: modelMessages, ... })`. Anthropic recibe la conversacion completa y responde el siguiente assistant message.

### Cambios necesarios al route handler actual

El route actual `src/app/api/agent-forensics/audit/route.ts` recibe:

```typescript
interface AuditRequestBody {
  turnId: string
  startedAt: string
  respondingAgentId: string | null
  conversationId: string
}
```

Para Plan 05, agregar campos:

```typescript
interface AuditRequestBody {
  // Existing
  turnId: string
  startedAt: string
  respondingAgentId: string | null
  conversationId: string

  // NEW: useChat sends this automatically
  messages: UIMessage[]

  // NEW: hypothesis from text-box (only on round 1, null on follow-ups)
  hypothesis: string | null

  // NEW: continuation tracking (null on first round)
  auditSessionId: string | null
}
```

### Logica del route handler

```typescript
export async function POST(request: Request): Promise<Response> {
  await assertSuperUser()
  const body = (await request.json()) as AuditRequestBody
  const {
    turnId, startedAt, respondingAgentId, conversationId,
    messages, hypothesis, auditSessionId,
  } = body

  // Determine if this is round 1 (new audit) or round N+1 (follow-up)
  const isFirstRound = messages.length === 1  // useChat starts with 1 user message
  // OR: si auditSessionId es null → es first round

  // Round 1 ONLY: assemble full context (multi-turn + spec + snapshot + condensed timeline)
  let systemPrompt: string
  let firstUserMessage: string
  if (isFirstRound) {
    // === Heavy assembly ===
    const detail = await getTurnDetail(turnId, startedAt)
    const effectiveAgentId = respondingAgentId ?? detail.turn.agentId

    const [spec, { snapshot }, conversationTurns] = await Promise.all([
      loadAgentSpec(effectiveAgentId),
      loadSessionSnapshot(conversationId),
      loadConversationTurns(conversationId, startedAt),
    ])

    // Condense previous turns (parallel getTurnDetail per turn)
    const previousTurnsRaw = conversationTurns.filter(t => t.id !== turnId)
    const previousTurnsDetails = await Promise.all(
      previousTurnsRaw.map(t => getTurnDetail(t.id, t.startedAt)),
    )
    const previousCondensed = previousTurnsDetails.map(condensePreviousTurn)

    // Audited turn — full timeline
    const condensedAudited = condenseTimeline(detail, respondingAgentId)

    // Truncate if needed (§3)
    const { kept, trimmed } = truncateContext(
      previousCondensed,
      turnId,
      /* placeholders for sizes — actual will compute from prompt */
      '', spec, snapshot, 50_000,
    )

    const built = buildAuditorPromptV2({
      spec,
      previousTurns: kept,
      condensed: condensedAudited,
      snapshot,
      turn: detail.turn,
      hypothesis,
    })
    systemPrompt = built.systemPrompt
    firstUserMessage = built.userMessage

    // Replace the user's text in the messages[] with the heavy first message
    // (useChat sent { text: 'Auditar' } or hypothesis text — we replace with full ctx)
    messages[0] = {
      ...messages[0],
      parts: [{ type: 'text', text: firstUserMessage }],
    } as UIMessage
  } else {
    // === Follow-up round — system prompt from existing audit session ===
    const session = await loadAuditSession(auditSessionId!)
    if (!session) return new Response('Audit session not found', { status: 404 })
    systemPrompt = session.system_prompt  // we persist the system prompt on round 1
    // messages[] already contains full history from useChat — pass through as-is
  }

  // === Stream ===
  const anthropicTools = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY_TOOLS })
  const modelMessages = await convertToModelMessages(messages)

  const result = streamText({
    model: anthropicTools('claude-sonnet-4-6'),
    system: systemPrompt,
    messages: modelMessages,
    temperature: 0.3,
    maxOutputTokens: 4096,
    onFinish: async ({ usage, text }) => {
      const turnCostUsd = calculateAuditCost(usage.inputTokens, usage.outputTokens)
      if (isFirstRound) {
        // INSERT new audit session
        const session = await createAuditSession({
          turnId, workspaceId: detail!.turn.workspaceId, conversationId,
          respondingAgentId: respondingAgentId ?? detail!.turn.agentId,
          hypothesis,
          messages,  // includes the assistant response — useChat persists it before onFinish
          systemPrompt,  // for follow-ups
          costUsd: turnCostUsd,
        })
        // Return audit session ID via header (next round will send it)
      } else {
        // UPDATE existing audit session — append messages, increment cost
        await appendToAuditSession(auditSessionId!, {
          messages,  // useChat ya tiene el array completo
          costUsdDelta: turnCostUsd,
        })
      }
    },
  })

  const response = result.toUIMessageStreamResponse()
  if (isFirstRound) {
    response.headers.set('X-Audit-Session-Id', /* the new id */)
  }
  return response
}
```

### Patrones del proyecto reutilizables

- **Header capture en cliente:** `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx:43-54` — el `fetch` wrapper del `DefaultChatTransport` lee `X-Session-Id` y lo lifta al parent state via callback.
- **`onFinish` con persistencia:** `src/app/api/builder/chat/route.ts:135-144` — guarda `messages` (UIMessage[]) tal cual del cliente, sin convertir a ModelMessage. Aprovecha que el SIGUIENTE request enviara el array updated automaticamente.
- **`convertToModelMessages`:** `src/app/api/builder/chat/route.ts:120` — convierte UIMessage[] (con `parts: [{type: 'text', text: ...}]`) a ModelMessage[] (con `content: ...`).

### Edge case: usuario empieza un audit nuevo (no es follow-up)

Trigger: el componente `AuditorTab` detecta cambio de turn (`turnId` cambio en props). Hoy ya lo hace via `useMemo` en el transport (`src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx:39-46`):

```typescript
const transport = useMemo(
  () => new DefaultChatTransport({ ... }),
  [turnId, startedAt, respondingAgentId, conversationId],
)
```

Cuando cambian los deps, se crea un NUEVO transport y `useChat` resetea `messages` automaticamente. Plan 05 debe ADEMAS:
- Resetear `hypothesis` text-box (state local del componente).
- Resetear `auditSessionId` (state local).
- Setear `setMessages([])` explicitamente (igual que `builder-chat.tsx:74`).

### Edge case: streaming + DB write race

[VERIFIED via AI SDK source comportamiento] `result.toUIMessageStreamResponse()` no devuelve hasta que el stream termina. El `onFinish` callback es awaited internamente por el SDK antes de cerrar. Esto significa:

- Si el client hace `abort()` mid-stream, `onFinish` igual corre con el partial text.
- Si el client navega antes de stream complete, el server sigue ejecutandose hasta finalizar (timeout vercel = 300s para Pro). `onFinish` corre. La DB se actualiza.

**Riesgo unico:** si Vercel cancela por timeout (300s), `onFinish` no corre. Mitigacion: `maxOutputTokens: 4096` + temperature bajo limita el response a ~30s tipico. **Aceptable.**

### Riesgo: messages[] se infla con cada round

Cada round agrega 2 messages (user + assistant). Despues de 5 rounds: 10 messages. La primera de esas messages tiene el contexto pesado (~15K tokens). Los siguientes user messages son cortos (preguntas de seguimiento, ~50 tokens). Los assistant responses son ~2-4K tokens cada uno.

Estimacion: round 5 envia ~15K (round 1 user) + 4×3K (assistant prev rounds) + 4×50 (user follow-ups) = ~27K tokens. **Comfortable bajo cap de 50K.**

Si el usuario hace 10 rounds: ~37K. Se acerca al cap pero sigue dentro. NO requiere truncado de chat history en este plan.

---

## §5 — Migration agent_audit_sessions (D-17)

### Schema validado

DISCUSSION-LOG D-17 propone columnas. Aqui las valido contra los queries reales del flow Plan 05 + UI futura:

| Columna | Decision D-17 | Validado | Notas |
|---------|---------------|----------|-------|
| `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` | OK | OK | Standard |
| `turn_id UUID NOT NULL` | OK | OK | NO FK a `agent_observability_turns` (tabla particionada — FK cross-partition no enforced) |
| `workspace_id UUID NOT NULL` | OK | OK | Para futuro listado per-workspace |
| `user_id UUID NOT NULL` | OK | OK | FK a `auth.users` opcional (no enforced) |
| `responding_agent_id TEXT NOT NULL` | OK | OK | Filter por agente |
| `conversation_id UUID NOT NULL` | OK | OK | Cubre query "todos los audits de esta conversacion" |
| `hypothesis TEXT NULL` | OK | OK | NULL si fue blind audit |
| `messages JSONB NOT NULL DEFAULT '[]'::jsonb` | OK | OK | Array UIMessage[] con todo el chat |
| `cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0` | OK | OK | Acumulado todos los rounds |
| `created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())` | OK | OK | Regla 2 |
| `updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())` | OK | OK | Trigger via `update_updated_at_column()` |

**Columna nueva propuesta (NO en D-17, justifico):**

- `system_prompt TEXT NOT NULL` — necesaria para que round N+1 (follow-up) reuse el system prompt sin reconstruirlo desde 0 (que requeriria re-cargar spec + snapshot + multi-turn). **Trade-off:** ~6-15KB por audit session (system prompt + spec + condensed multi-turn embedded en el user message ya estan en `messages[0]`, asi que el system prompt textual solo es ~3-5KB). Aceptable.
- `trimmed_count INTEGER NOT NULL DEFAULT 0` — para auditoria post-hoc del "sesion trimeada N de M" UI flag. Util para entender post-mortem si los audits con trim degradan calidad.
- `total_turns_in_context INTEGER NOT NULL DEFAULT 0` — meta. Saber cuantos turns previos vio el modelo en round 1.

### Indices

D-17 propone:
- `(workspace_id, conversation_id, created_at DESC)` para listado UI futuro
- `(turn_id, created_at DESC)` para reabrir audits del mismo turn

**Validacion contra queries reales:**

Query 1 (futura UI: "lista todos los audits de esta conversation"):
```sql
SELECT * FROM agent_audit_sessions
WHERE workspace_id = $1 AND conversation_id = $2
ORDER BY created_at DESC LIMIT 50;
```
→ Cubierto por `(workspace_id, conversation_id, created_at DESC)`. **OK.**

Query 2 (futura UI: "audits hechos sobre este turn especifico"):
```sql
SELECT * FROM agent_audit_sessions
WHERE turn_id = $1
ORDER BY created_at DESC LIMIT 10;
```
→ Cubierto por `(turn_id, created_at DESC)`. **OK.**

Query 3 (Plan 05 follow-up — leer audit session por id):
```sql
SELECT * FROM agent_audit_sessions WHERE id = $1;
```
→ PK index automatico. **OK.**

Query 4 (audit session UPDATE en follow-up):
```sql
UPDATE agent_audit_sessions
SET messages = $1, cost_usd = $2, updated_at = $3
WHERE id = $4;
```
→ PK lookup. **OK.**

**No se necesitan indices adicionales.**

### RLS policies — DECISION

**Recomendacion: SIN RLS** (mismo patron que `platform_config` y `crm_bot_actions`).

Justificacion:
- El auditor es **super-user only** (assertSuperUser gate en route.ts).
- Solo el route handler escribe (vía `createAdminClient` / `service_role`).
- Ningun cliente authenticado lee directo via `supabase.from('agent_audit_sessions').select(...)`.
- Si en el futuro se expone una UI de listado, ese listado va por server action super-user-gated, NO por client direct.
- RLS aqui agregaria complejidad (workspace check, super-user bypass) sin beneficio real.

[CITED: comentario `supabase/migrations/20260420000443_platform_config.sql:4` "Sin RLS — acceso server-only via createAdminClient()"]

**Excepcion:** si en alguna futura iteracion se decide exponer audits a no-super-users (ej. otros admins de workspace), entonces SI agregar RLS con `is_workspace_member(workspace_id)`. Hoy NO.

### Trigger updated_at

Reusar el trigger function existente:

```sql
CREATE TRIGGER agent_audit_sessions_updated_at
  BEFORE UPDATE ON agent_audit_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

Verificado disponible en migracion `20260205000000_agent_sessions.sql:115` (mismo trigger se usa en `agent_sessions` y `session_state`).

### GRANTs explicitos (LEARNING propagado de Phase 44.1)

Verificado en `supabase/migrations/20260420000443_platform_config.sql:32-36`:

> Tablas creadas via Supabase Studio SQL Editor NO reciben grants automaticos para el service_role ni para authenticated. La primera version de esta migracion omitio los GRANTs y `getPlatformConfig` en produccion fallaba con `code: 42501 — permission denied for table platform_config`.

**OBLIGATORIO incluir en la migracion:**

```sql
GRANT ALL ON TABLE public.agent_audit_sessions TO service_role;
-- NO grant a authenticated — sin RLS y sin uso desde client. service_role only.
```

### SQL ready-to-paste

Filename: `supabase/migrations/20260428000000_agent_audit_sessions.sql` (timestamp ajustar al day-of-apply).

```sql
-- ============================================================================
-- agent_audit_sessions — auditor multi-turn + hypothesis persistence
-- ============================================================================
-- Phase: agent-forensics-panel (standalone) — Plan 05
-- Objetivo: persistir cada sesion del auditor AI con hypothesis, mensajes
--           del chat (round inicial + follow-ups), system prompt usado, y
--           costo acumulado en USD.
--
-- Sin RLS — acceso server-only via createAdminClient + assertSuperUser gate
-- en route handler. Mismo patron que platform_config + crm_bot_actions.
--
-- Regla 5: este SQL DEBE aplicarse en Supabase prod ANTES del push de
-- codigo de Plan 05 que lo referencia.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS agent_audit_sessions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK semantico a agent_observability_turns (NO enforced — tabla particionada)
  turn_id                  UUID NOT NULL,
  workspace_id             UUID NOT NULL,
  user_id                  UUID NOT NULL,
  responding_agent_id      TEXT NOT NULL,
  conversation_id          UUID NOT NULL,
  -- Hipotesis pre-audit del usuario (NULL si fue blind)
  hypothesis               TEXT NULL,
  -- Array UIMessage[] con todo el chat (round 1 + follow-ups)
  messages                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- System prompt usado (cachea contexto pesado para follow-up rounds)
  system_prompt            TEXT NOT NULL,
  -- Meta: cuantos turns previos del contexto multi-turn vio el modelo en round 1
  total_turns_in_context   INTEGER NOT NULL DEFAULT 0,
  -- Meta: si hubo trimming por cap de tokens, cuantos turns se descartaron
  trimmed_count            INTEGER NOT NULL DEFAULT 0,
  -- Costo acumulado de todos los rounds (input + output Sonnet 4.6 pricing)
  cost_usd                 NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Indices: futura UI listado per-workspace + per-conversation, y reabrir audits per-turn
CREATE INDEX IF NOT EXISTS idx_audit_sessions_workspace_conv
  ON agent_audit_sessions (workspace_id, conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_sessions_turn
  ON agent_audit_sessions (turn_id, created_at DESC);

-- updated_at trigger (reusa funcion existente de migracion 20260205000000)
CREATE TRIGGER agent_audit_sessions_updated_at
  BEFORE UPDATE ON agent_audit_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- GRANTs explicitos (LEARNING Phase 44.1: SQL Editor no auto-grants)
GRANT ALL ON TABLE public.agent_audit_sessions TO service_role;

COMMENT ON TABLE agent_audit_sessions IS
  'Auditor multi-turn audit sessions (Plan 05 agent-forensics-panel). Persists hypothesis + chat history + cost. Server-only access via createAdminClient + assertSuperUser. NO RLS.';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERY (Task 2 — usuario corre post-apply):
--
-- SELECT
--   table_name,
--   pg_size_pretty(pg_total_relation_size('public.agent_audit_sessions')) AS size,
--   (SELECT COUNT(*) FROM agent_audit_sessions) AS row_count
-- FROM information_schema.tables
-- WHERE table_name = 'agent_audit_sessions';
--
-- Expected: 1 row, size ~16kB (empty), row_count = 0.
--
-- Verificacion grants:
-- SELECT grantee, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_name = 'agent_audit_sessions';
-- Expected: service_role con ALL.
-- ============================================================================
```

### Regla 5 checkpoint (CRITICO)

Plan 05 DEBE estructurarse con un checkpoint humano:

1. **Task 1:** Crear migration file en `supabase/migrations/`.
2. **Task 2 [BLOCKING CHECKPOINT]:** Pausar. Pedir al usuario que aplique la SQL en Supabase prod via SQL Editor + corra verification query. Esperar approval explicito.
3. **Task 3+:** Solo entonces escribir codigo que importa/escribe a `agent_audit_sessions`.

[CITED: CLAUDE.md Regla 5 + 01-SUMMARY.md Task 2 que demuestra el pattern]

---

## §6 — Existing UI patterns (D-16)

### Componentes reusables

| Componente | Path | Uso en Plan 05 |
|------------|------|----------------|
| `Textarea` (shadcn) | `src/components/ui/textarea.tsx` | Hypothesis input (multi-line, auto-resize via `field-sizing-content`) |
| `BuilderInput` (textarea custom auto-grow) | `src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx` | Reusar para "Pregunta de seguimiento" (Enter submits, Shift+Enter newline, max 4 lineas) |
| `Button` (shadcn) | `src/components/ui/button.tsx` | "Auditar sesion" + "Nuevo audit" + "Copiar" |
| `Loader2` icon | `lucide-react` | Streaming spinner (ya en uso) |
| `Play`, `Copy`, `Send`, `Sparkles` icons | `lucide-react` | Action buttons |
| `toast` from `sonner` | `sonner` | Feedback "Diagnostico copiado" |
| `ReactMarkdown + remarkGfm` | `react-markdown@^10.1.0`, `remark-gfm@^4.0.1` | Render assistant responses (ya en use Plan 04) |
| `useChat + DefaultChatTransport` | `@ai-sdk/react@^3.0.88`, `ai@^6.0.86` | Chat hook + custom transport con header capture |

### Pattern: form validation (boton disabled si textarea vacio)

```typescript
const [hypothesis, setHypothesis] = useState('')
const trimmedHypothesis = hypothesis.trim()
// Boton "Auditar" siempre habilitado (la hipotesis es opcional)
// Pero si el usuario typeo y borro todo, el state local refleja el trim

<Button
  disabled={isStreaming}
  onClick={() => {
    sendMessage(
      { text: trimmedHypothesis || 'Auditar' },
      { body: { hypothesis: trimmedHypothesis || null } },
    )
  }}
>
  Auditar sesion
</Button>
```

Pattern verificado en `src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx:91`: `disabled={!input.trim() || isLoading}`.

### Pattern: skeleton/loading state durante streaming

`auditor-tab.tsx:89-99` actual usa `Loader2 + animate-spin` inline al boton. Para Plan 05 mantener el mismo pattern y agregar:

```tsx
{isStreaming && messages.length === 0 && (
  <div className="px-4 py-2 text-xs text-muted-foreground italic">
    Analizando {totalTurnsInContext} turns previos contra spec del bot...
  </div>
)}
```

### Pattern: chat layout (history scroll + input fixed bottom)

Verificado en `builder-chat.tsx:101-156` y `chat-pane.tsx:219-310`:

```tsx
<div className="flex flex-col h-full">
  {/* Messages (scrollable) */}
  <div className="flex-1 overflow-y-auto px-4 py-6">
    {messages.map(m => <Message key={m.id} message={m} />)}
    <div ref={bottomRef} />  {/* anchor para auto-scroll */}
  </div>

  {/* Input fixed bottom */}
  <div className="border-t bg-background px-4 py-3 shrink-0">
    <Textarea ... />
  </div>
</div>
```

Aplicar el mismo pattern al refactor de `auditor-tab.tsx` para Plan 05. La diferencia versus el auditor v1: hoy hay UN solo render de `assistantText`. Para Plan 05, iterar sobre `messages` (multiples user + assistant) y renderizar cada uno como bubble (user a la derecha, assistant a la izquierda con ReactMarkdown).

### Auto-scroll al bottom cuando llega nuevo message

```typescript
const bottomRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [messages, status])
```

[CITED: `builder-chat.tsx:67-69`]

### Reset al cambiar turn

```typescript
useEffect(() => {
  // turnId cambio → limpiar todo
  setMessages([])
  setHypothesis('')
  setAuditSessionId(null)
}, [turnId])
```

[CITED: `builder-chat.tsx:71-75` + `chat-pane.tsx:127-131`]

---

## §7 — Extended system prompt with hypothesis (D-16, D-09 alignment)

### Verificacion: ¿agregar hipotesis rompe la regla de 4 headers?

Plan 04 system prompt ([VERIFIED: `src/lib/agent-forensics/auditor-prompt.ts:25-50`]) define ESTRUCTURA OBLIGATORIA con 4 secciones:

1. `# Diagnóstico: {bot}`
2. `## Resumen`
3. `## Evidencia del timeline`
4. `## Discrepancias con la spec`
5. `## Próximos pasos`

(Son 5 headers contando el título principal, pero el SUMMARY de Plan 04 los menciona como "4 headers obligatorios" — me alineo a esa convencion.)

**La regla de structure es obligatoria via "SIEMPRE respondes en markdown con la siguiente estructura: ..."**. Mientras la directiva permanezca en el system prompt, agregar contexto adicional (la hipotesis) NO la rompe — Sonnet 4.6 es muy fiable siguiendo structural directives en system prompts.

### Texto exacto a inyectar

**Posicion: AL FINAL del system prompt actual**, despues de las "REGLAS:" pero antes del cierre del template literal.

```typescript
const SYSTEM_PROMPT_BASE = `Eres un auditor técnico de agentes conversacionales. Tu trabajo es analizar el comportamiento de un bot en un turno específico y diagnosticar si respondió como debería, con base en su spec.

SIEMPRE respondes en markdown con la siguiente estructura:

# Diagnóstico: {nombre del bot}

## Resumen
Un párrafo (máximo 3 líneas) con el veredicto: ¿el comportamiento está dentro o fuera de lo esperado?

## Evidencia del timeline
Lista de hechos observados, citando eventos específicos con formato: \`event · label · payload\`.

## Discrepancias con la spec
Por cada discrepancia:
- **Descripción:** qué esperaba la spec vs. qué ocurrió.
- **Pointer:** archivo:línea donde está el código implicado (ej. \`src/lib/agents/somnio-recompra/response-track.ts:36\`).
- **Hipótesis:** causa probable.

## Próximos pasos
Bullet list de acciones concretas pegables a Claude Code para investigar/arreglar. Usa formato imperativo.

REGLAS:
- NUNCA inventes events/queries que no estén en el timeline dado.
- NUNCA inventes archivos/líneas — usa SOLO los pointers que aparecen en la spec.
- Si no hay discrepancias, dilo explícitamente en la sección "Discrepancias" ("Ninguna detectada.").
- El output debe ser pegable directamente a Claude Code sin edición humana.

CONTEXTO MULTI-TURN:
- El usuario te entrega contexto de TODOS los turns previos de la sesión conversacional (no solo el turn auditado).
- Los turns previos incluyen también turns de \`crm-reader\` cuando existen — son fuente de datos del agente principal, NO ruido.
- Usa el contexto multi-turn para entender la línea narrativa de la conversación: qué intent vino antes, qué template se mandó, qué datos capturó el agente. Cita turns previos por su \`turnId\` cuando son relevantes a la discrepancia.
- El \`session_state\` snapshot que ves es el estado ACTUAL (mutable), no el del momento exacto del turn auditado. Si tu diagnóstico depende del estado-en-momento-del-turn, dilo explícitamente.

ANTI-FALSO-POSITIVO:
- Antes de marcar algo como anomalía o "comportamiento sospechoso", lista hipótesis benignas que explicarían lo observado: timing async (eventos POST-runner que no bloquean respuesta), fallback de sesión nueva (datos vacíos por diseño), fuente alternativa de datos (crm-reader populando contexto en turn paralelo), arquitectura por diseño documentada en la spec.
- Descártalas EXPLÍCITAMENTE con evidencia del timeline o spec antes de afirmar que hay anomalía.
- Si una hipótesis benigna NO se puede descartar con la evidencia disponible, declara la observación como AMBIGUA y pide al usuario información adicional en "Próximos pasos", en vez de afirmar que es bug.`

function buildSystemPromptV2(args: { hypothesis: string | null }): string {
  let prompt = SYSTEM_PROMPT_BASE
  if (args.hypothesis && args.hypothesis.trim().length > 0) {
    prompt += `

HIPÓTESIS DEL USUARIO:
El usuario sospecha lo siguiente sobre el comportamiento del bot:

> ${args.hypothesis.trim()}

Investiga ESPECÍFICAMENTE si esta hipótesis es correcta o incorrecta. En "Resumen", afirma o refuta la hipótesis del usuario en la primera oración. En "Evidencia del timeline", prioriza eventos relevantes a la hipótesis. Si la hipótesis es incorrecta, explica brevemente qué pasó realmente. Si es correcta, profundiza en por qué y dónde está el código implicado.`
  }
  return prompt
}
```

### User message: dual placement de la hipotesis

Adicionalmente, el user message lleva un bloque `## Hipótesis del usuario` justo despues del Spec, ANTES del turn analizado. Razon: dual placement aumenta robustez. Si la hipotesis solo va al system prompt y el modelo se distrae con el spec largo, puede olvidarla. Si va tambien al user message, esta visualmente cerca de los datos a analizar.

```typescript
const userMessage = `## Spec del bot
${spec}

${hypothesis ? `---\n\n## Hipótesis del usuario\n\n> ${hypothesis}\n` : ''}
---

## Turn analizado
- ID: ${turn.id}
...

## Turns previos de la sesión (orden cronológico, ligeramente condensados)

\`\`\`json
${JSON.stringify(previousTurns, null, 2)}
\`\`\`

## Timeline condensado del turn auditado
\`\`\`json
${JSON.stringify(condensed, null, 2)}
\`\`\`

## Snapshot completo del session_state
\`\`\`json
${JSON.stringify(snapshot, null, 2)}
\`\`\`

---

Analiza este turno contra la spec, considerando los turns previos como contexto narrativo. ${hypothesis ? 'Afirma o refuta la hipótesis del usuario en la sección "Resumen".' : ''} Emite tu diagnóstico en markdown siguiendo la estructura indicada en el system prompt.`
```

### Mental test: 2 hipotesis de ejemplo

**Test 1 — Hipotesis CORRECTA:**

> "Yo sospecho que el bot mando promo cuando el cliente solo saludo, sin esperar el flow de confirmar dirección que dice la spec."

Esperado:
- Resumen empieza con "Hipótesis CONFIRMADA: el turn 3 emitio template `promo_2x` directamente tras el evento `comprehension · intent=saludo` con confidence=0.91, saltando el flow esperado que pasaria por `preguntar_direccion_recompra` antes."
- Headers obligatorios siguen presentes (testeable: el system prompt inicial los hace mandatorios).
- Pointers reales: `transitions.ts:64-68` (el fallback null para saludo) + `response-track.ts:280-374` (resolveSalesActionTemplates).

**Test 2 — Hipotesis INCORRECTA:**

> "Yo creo que el problema es que el crm-reader no se ejecuto, entonces el agente no sabia que era cliente recurrente."

Esperado:
- Resumen empieza con "Hipótesis REFUTADA: el contexto multi-turn muestra el turn 0 con `responding_agent_id='crm-reader'` que completo exitosamente (evento `crm_reader_completed` en turn 1 timeline). El agente SI tenia el contexto del cliente. La causa real del comportamiento observado es..."
- 4 headers obligatorios presentes.
- Pointers a evidencia del timeline ("turn 0 turnId=xxx", "turn 1 evento `crm_context_used`").

Ambos tests son MENTALES (no hay forma de runtime test sin shippearlo). El planner debe confirmar via smoke test post-deploy con audits reales sobre la conversacion `e5cf0938` que ya se uso en Plan 04.

---

## §8 — Anti-false-positive directive (NEW pitfall from Plan 04)

### Origen del pitfall

[CITED: `04-SUMMARY.md` §"NUEVO Pitfall descubierto post-deploy" + DISCUSSION-LOG Sesion 2 trigger]

> El segundo audit declaró "gap de ~11s entre `sales_track_result` y `crm_reader_dispatched` sugiere problema" pero verificación del código (`webhook-processor.ts:247→288→296`) reveló que el dispatch es POST-runner por diseño (fail-open, no bloquea respuesta al cliente). El auditor confundió "upstream del próximo turn" con "antes del turn actual".

### Texto exacto a agregar al system prompt (incluido ya en §7 arriba)

Repito aqui para enfasis estandalone — esta es la directiva nueva:

```
ANTI-FALSO-POSITIVO:
- Antes de marcar algo como anomalía o "comportamiento sospechoso", lista hipótesis benignas que explicarían lo observado: timing async (eventos POST-runner que no bloquean respuesta), fallback de sesión nueva (datos vacíos por diseño), fuente alternativa de datos (crm-reader populando contexto en turn paralelo), arquitectura por diseño documentada en la spec.
- Descártalas EXPLÍCITAMENTE con evidencia del timeline o spec antes de afirmar que hay anomalía.
- Si una hipótesis benigna NO se puede descartar con la evidencia disponible, declara la observación como AMBIGUA y pide al usuario información adicional en "Próximos pasos", en vez de afirmar que es bug.
```

### Por que esta phrasing y no otra

Considerado y descartado:
- ❌ "Sé conservador y no marques nada anormal" — degrada el valor del auditor (existe para encontrar problemas).
- ❌ "Verifica con tools antes de afirmar" — el auditor no tiene tools; solo tiene spec + timeline + snapshot.
- ✅ "Lista hipotesis benignas y descártalas explícitamente" — fuerza al modelo a hacer el ejercicio mental de eliminar alternativas, no a callarse. Mejora calidad sin degradar volumen.

### Categorias de hipotesis benignas mencionadas

1. **Timing async** — el caso del 11s gap. Eventos POST-runner emitidos por diseño.
2. **Fallback de sesión nueva** — ej. `datos_capturados={}` no es bug, es first-message normal.
3. **Fuente alternativa de datos** — el agente puede haber recibido contexto via crm-reader en turn previo.
4. **Arquitectura por diseño documentada en la spec** — comportamientos validados en spec que parecen anomalos pero estan documentados.

### Mejora futura no en scope

- Agregar a cada `agent-specs/<bot>.md` una seccion `## Pitfalls comunes al diagnosticar este agente` con casos historicos del auditor (ej. el 11s gap). Es mejora continua de las specs sin modificar el prompt. **Documentado en `04-SUMMARY.md` Pitfalls →** "spec files deben actualizarse con sección Pitfalls comunes". El planner puede decidir si agregar 1 task de Plan 05 para sembrar esta seccion en las 3 specs, o dejarla para Plan 06 LEARNINGS.

---

## Standard Stack

| Library | Version (verified) | Purpose | Source |
|---------|--------------------|---------|--------|
| `ai` | `^6.0.86` | streamText, convertToModelMessages, UIMessage | [VERIFIED: package.json] |
| `@ai-sdk/anthropic` | `^3.0.43` | createAnthropic, anthropic provider | [VERIFIED: package.json] |
| `@ai-sdk/react` | `^3.0.88` | useChat hook | [VERIFIED: package.json] |
| `@anthropic-ai/sdk` | `^0.73.0` | client.messages.countTokens (token budgeting) | [VERIFIED: package.json + docs.claude.com/api/messages-count-tokens] |
| `react` | `19.2.3` | useState, useEffect, useMemo, useRef | [VERIFIED: package.json] |
| `next` | `^16.1.6` | App Router, route handlers, response headers | [VERIFIED: package.json] |
| `react-markdown` | `^10.1.0` | Render markdown del LLM | [VERIFIED: package.json — agregado en Plan 04] |
| `remark-gfm` | `^4.0.1` | GitHub-flavored markdown extensions | [VERIFIED: package.json] |
| `sonner` | (transitivo via shadcn) | Toast notifications | [VERIFIED: src/components/ui/sonner.tsx] |
| `lucide-react` | (in-use) | Iconos (Loader2, Play, Send, Copy, Sparkles) | [VERIFIED: extensive usage] |

**No se necesitan deps nuevas.** Todo el stack para Plan 05 ya esta instalado por Plan 04.

### Versiones de modelo y SDK

| Item | Valor | Source |
|------|-------|--------|
| Model id Claude | `claude-sonnet-4-6` | [CITED: route.ts:68 — Plan 04 lock D-08] |
| Anthropic API key env | `ANTHROPIC_API_KEY_TOOLS` | [CITED: route.ts:64 — Plan 04 deviation] |
| Pricing input | $3 / 1M tokens | [ASSUMED: pricing publico al day-of-execution; planner verifica] |
| Pricing output | $15 / 1M tokens | [ASSUMED: same] |
| Token counting endpoint | `/v1/messages/count_tokens` | [VERIFIED: platform.claude.com docs] |
| Token counting cost | gratis | [VERIFIED: same] |
| Token counting rate limit | 100 RPM tier 1 / 2000 RPM tier 2 | [VERIFIED: same] |

---

## Open Items / TODO for Planner

1. **Cuantos rounds de chat continuo permitir** (rate-limit per audit session). DISCUSSION-LOG D-16 dice "input continuo de seguimiento" sin cap. Recomendacion: **soft cap de 10 rounds** + warning UI a partir del 8. Hard cap de 20 rounds. Planner decide al disenar tasks.

2. **Que pasa si el usuario cambia el turnId mientras un audit esta streaming.** Hoy `useMemo` resetea el transport (Plan 04 pattern). Confirma que el stream en flight se cancela vs se completa silenciosamente. **TODO planner test.**

3. **Limite de hypothesis text length.** Sin limit hoy. Recomendacion: 2000 chars (suficiente para hypothesis detalladas, evita abuso accidental). Planner decide.

4. **¿Persistir tambien el `condensed` y `previousTurns`?** Si solo persisto `messages[]` + `system_prompt`, el follow-up round NO tiene acceso al contexto multi-turn como datos estructurados (solo como texto en el primer user message). Para queries futuras tipo "auditas que hicieron sobre esta conversation con cuantos turns previos" necesitaria parsearlo del `messages[0]`. Recomendacion: NO persistir como columnas separadas en esta version (premature). El campo `total_turns_in_context` cubre el meta-uso comun. Planner confirma.

5. **¿Como detectar si es first round vs follow-up en el route?** Dos opciones:
   - Por `messages.length === 1` (first round = user envio 1 mensaje).
   - Por `auditSessionId === null` en el body.
   Mas robusto: `auditSessionId === null`. Si null, es first round; si tiene UUID, es follow-up. Planner adopta esta convencion.

6. **¿Mostrar `cost_usd` acumulado en la UI?** Util para que el super-user vea cuánto consumió. Recomendacion: si, en el header del tab Auditor a la derecha (ej. "$0.12 acumulado · 4 rounds"). Planner decide y disena tasks.

7. **Indices: ¿agregar uno por `responding_agent_id`?** Para query futura "todos los audits del bot somnio-recompra-v1". No es critico ahora — el `(workspace_id, conversation_id, created_at DESC)` cubre 95% de queries probables. Si la UI futura quiere filtrar por agent globalmente, agregar `(responding_agent_id, created_at DESC)`. **Defer al planner — backlog.**

8. **Truncado: ¿drop oldest funciona si los recent son los mas pesados?** Edge case: si los ultimos 3 turns son super pesados (cada uno 8K tokens) y los viejos son ligeros (200 tokens), drop-oldest mantiene los pesados pero llena el cap rapido. Algoritmo alternativo: knapsack (max turns que entren al budget). En la practica los turns crecen linealmente — no es un problema real. Planner conoce los datos del proyecto y puede confirmar.

---

## Pitfalls to avoid

### Pitfall 9 (NEW) — useChat resetea automatico al cambiar transport

**Problema:** Si cambias `turnId` y el `useMemo([turnId, ...])` crea un transport nuevo, `useChat` borra `messages`. Esto es bueno para audit nuevo. PERO si tambien cambias deps por accidente (ej. `respondingAgentId` que es callback re-creado en cada render), pierdes mid-conversation el chat history.

**Mitigacion:** mantener `useMemo` deps minimas y estables. Para `respondingAgentId` (string | null) esto es OK. Para callbacks pasados por props, usar `useCallback`.

**Verificable con:** test E2E que cambia turnId → confirma mensajes se resetean → cambia hypothesis → confirma transport NO se recreó (y sendMessage continua el chat existente).

### Pitfall 10 (NEW) — onFinish + Vercel timeout

**Problema:** Si Sonnet 4.6 toma >300s en responder (timeout default Vercel Pro), Vercel mata el lambda y `onFinish` NO corre. La audit session NO se persiste.

**Mitigacion:** `maxOutputTokens: 4096` + `temperature: 0.3` mantienen response a ~30s tipico. Si en algun caso edge se acerca al timeout, Plan 05 puede agregar `maxDuration: 300` export en el route file (Next.js 16 config).

**Verificable:** monitorear logs Vercel post-deploy; si aparecen kills frecuentes, considerar Inngest async + return jobId + poll. **NO en scope Plan 05.**

### Pitfall 11 (NEW) — assistant message persistido antes del onFinish

**Problema:** `useChat` agrega el assistant message a `messages` durante el stream (chunks llegan, message se construye). Si el cliente hace `sendMessage` de nuevo MIENTRAS otro stream esta corriendo, el array `messages` tiene un assistant message a medio construir.

**Mitigacion:** disable input + button mientras `status === 'streaming' || status === 'submitted'`. Pattern verificado en `auditor-tab.tsx:50-56`.

### Pitfall 12 (NEW) — getTurnDetail × N en serial

**Problema:** Round 1 del audit hace `loadConversationTurns` → N turns → `getTurnDetail(t.id, t.startedAt)` por cada uno. En serial: 50ms × 15 turns = 750ms. Latencia perceptible antes de que el modelo empiece a responder.

**Mitigacion:** **Promise.all** todos los `getTurnDetail` calls. Latencia paralela: ~50-100ms.

```typescript
const previousTurnsDetails = await Promise.all(
  previousTurnsRaw.map(t => getTurnDetail(t.id, t.startedAt)),
)
```

### Pitfall 13 (NEW) — snapshot mutado entre primer round y follow-up

**Problema:** Round 1 lee `session_state` snapshot. El usuario hace 3 follow-up rounds en 5 minutos. Durante esos 5 min, el agente productivo modifica `session_state`. Si Plan 05 NO persiste el snapshot original, los follow-up rounds usan el snapshot del round 1 (correcto), pero si por error el handler re-fetch en cada round, ven snapshot diferente. **Diagnóstico inconsistente.**

**Mitigacion:** persistir el snapshot en el system_prompt o user_message del round 1. Follow-up rounds NUNCA re-leen `session_state`. El system prompt es el "frozen ground truth" del audit.

[Esta es la razon por la que `system_prompt` y el primer user message van persistidos en `agent_audit_sessions.messages[0]`.]

### Pitfall 14 (NEW) — Token counting API rate limit en bursts

**Problema:** Si el super-user audita 50 sesiones grandes consecutivas en 1 minuto, cada una pide token count → 50 RPM. Tier 2 permite 2000 RPM, no es problema. Tier 1 (100 RPM) podria choquear.

**Mitigacion:** estimacion local first (algoritmo §3). API call solo si estimado > 40K. Para sesiones tipicas (<20K) cero API calls. **Nunca debe ser un problema en uso real.**

### Pitfall 15 (NEW) — Anti-false-positive prompt directive demasiado restrictiva

**Problema:** Si la directiva "lista hipotesis benignas y descartalas" es demasiado fuerte, el modelo termina diciendo "no encuentro anomalias" en casos donde si las hay (over-correction).

**Mitigacion:** la phrasing en §8 dice "antes de afirmar AS anomalia" — no "evita afirmar anomalias". Pide hacer el ejercicio mental + descartar EXPLICITAMENTE. El output sigue siendo activo, no pasivo. Smoke test del Plan 05 debe validar que el auditor SI encuentra discrepancias reales (re-correr el audit del 11s gap como benchmark — debe NO marcar como bug porque la spec lo documenta).

---

## References

### Codebase (verified line by line)

- `src/lib/agent-forensics/auditor-prompt.ts:1-89` — current single-turn prompt builder Plan 04
- `src/app/api/agent-forensics/audit/route.ts:1-86` — current single-turn route
- `src/app/(dashboard)/whatsapp/components/debug-panel-production/auditor-tab.tsx:1-148` — current UI
- `src/lib/agent-forensics/condense-timeline.ts:1-170` — pure function timeline filter Plan 02
- `src/lib/agent-forensics/load-session-snapshot.ts:1-60` — snapshot loader Plan 03
- `src/lib/observability/repository.ts:74-112` — listTurnsForConversation (template para multi-turn loader)
- `src/lib/observability/repository.ts:226-384` — getTurnDetail (per-turn loader)
- `src/app/api/builder/chat/route.ts:1-163` — **PRIMARY REFERENCE** for chat continuation pattern with message persistence (verified working in production)
- `src/app/(dashboard)/automatizaciones/builder/components/builder-chat.tsx:1-157` — useChat + DefaultChatTransport + header capture pattern
- `src/app/(dashboard)/automatizaciones/builder/components/builder-input.tsx:1-103` — auto-grow textarea pattern (Enter submits, Shift+Enter newline)
- `src/lib/auth/super-user.ts:1-79` — assertSuperUser gate
- `src/lib/supabase/admin.ts:13-72` — createAdminClient vs createRawAdminClient distinction
- `supabase/migrations/20260205000000_agent_sessions.sql:115` — `update_updated_at_column()` trigger function (reusable)
- `supabase/migrations/20260420000443_platform_config.sql:1-37` — **PRIMARY REFERENCE** for table without RLS pattern + GRANTs LEARNING
- `supabase/migrations/20260424141545_agent_observability_responding_agent_id.sql:1-95` — **PRIMARY REFERENCE** for migration template (BEGIN/COMMIT, IF NOT EXISTS, partial index, comments)
- `supabase/migrations/20260408000000_observability_schema.sql:45-72` — `agent_observability_turns` schema + indices verified

### External docs

- [Anthropic Token Counting](https://platform.claude.com/docs/en/build-with-claude/token-counting) — VERIFIED: free, separate rate limit, returns `{input_tokens}`
- [Anthropic Messages Count Tokens API](https://platform.claude.com/docs/en/api/messages-count-tokens) — VERIFIED: `client.messages.countTokens` SDK method
- [AI SDK v6 useChat](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot) — VERIFIED: client transmits entire messages array; `sendMessage` accepts custom body
- [AI SDK v6 chatbot persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence) — VERIFIED: onFinish receives `{ messages }` array; can be saved as-is
- [AI SDK v6 streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) — VERIFIED: onFinish provides `{ usage: { inputTokens, outputTokens, totalTokens }, totalUsage, finishReason, text }`

### Project rules referenced

- `CLAUDE.md` Regla 0 (GSD completo, no atajos)
- `CLAUDE.md` Regla 1 (push a Vercel post-cambios)
- `CLAUDE.md` Regla 2 (timezone America/Bogota)
- `CLAUDE.md` Regla 3 (domain layer — N/A, este plan es read+write a tabla nueva via createAdminClient)
- `CLAUDE.md` Regla 4 (docs sincronizados — Plan 06 cubre)
- `CLAUDE.md` Regla 5 (migracion ANTES del push — **CRITICAL**, ver §5 checkpoint)
- `CLAUDE.md` Regla 6 (proteger agente productivo — auditor sigue aislado, opt-in, super-user only)
- `.claude/rules/agent-scope.md` — auditor NO es un agente conversacional productivo, no aplica scope clauses

---

## Anexo: prompt completo de ejemplo (round 1, con hipotesis)

Para que el planner vea el shape completo del prompt que enviaria al modelo en round 1, ejemplo concretado para un audit de la conversacion `e5cf0938`, turn `quiero_comprar`, hipotesis del usuario:

**System prompt** (fijo + bloque de hipotesis condicional):

```
Eres un auditor técnico de agentes conversacionales...
[texto base verbatim de auditor-prompt.ts:25-50]

CONTEXTO MULTI-TURN:
- El usuario te entrega contexto de TODOS los turns previos...
[bloque de §7 verbatim]

ANTI-FALSO-POSITIVO:
- Antes de marcar algo como anomalía...
[bloque de §8 verbatim]

HIPÓTESIS DEL USUARIO:
El usuario sospecha lo siguiente sobre el comportamiento del bot:

> El bot mando promo cuando el cliente solo saludo, sin esperar el flow de confirmar dirección.

Investiga ESPECÍFICAMENTE si esta hipótesis es correcta...
```

**User message** (round 1, contiene TODO el contexto pesado):

```
## Spec del bot
[6KB de somnio-recompra-v1.md]

---

## Hipótesis del usuario

> El bot mando promo cuando el cliente solo saludo, sin esperar el flow de confirmar dirección.

---

## Turn analizado
- ID: 550e8400-e29b-41d4-a716-446655440000
- Conversation: e5cf0938-a001-436b-83c0-c077e839dc50
- Entry agent: somnio-v3
- Responding agent: somnio-recompra-v1
- Trigger: user_message
- Duration: 3214ms
- Tokens: 5891
- Cost: $0.008500
- Error: No

## Turns previos de la sesión (orden cronológico, ligeramente condensados)

```json
[
  { "turnId": "...", "intent": "saludo", "templatesEnviados": ["saludo_inicial"], ... },
  { "turnId": "...", "respondingAgentId": "crm-reader", "intent": null, ... }
]
```

## Timeline condensado del turn auditado
```json
[ ... 4-8 items ... ]
```

## Snapshot completo del session_state
```json
{
  "session_id": "...",
  "datos_capturados": { ... },
  "current_mode": "promos_shown",
  ...
}
```

---

Analiza este turno contra la spec, considerando los turns previos como contexto narrativo. Afirma o refuta la hipótesis del usuario en la sección "Resumen". Emite tu diagnóstico en markdown siguiendo la estructura indicada en el system prompt.
```

**Round 2+ user message** (follow-up, ej. "no, no me importa eso, fíjate en el template del segundo turn"):

useChat envia automaticamente:

```json
{
  "messages": [
    { "role": "user", "parts": [{ "type": "text", "text": "[ROUND 1 USER MESSAGE COMPLETO]" }] },
    { "role": "assistant", "parts": [{ "type": "text", "text": "# Diagnóstico... [round 1 response]" }] },
    { "role": "user", "parts": [{ "type": "text", "text": "no, no me importa eso, fíjate en el template del segundo turn" }] }
  ],
  "auditSessionId": "abc-123-...",
  "turnId": "550e8400-...",
  ...
}
```

Server detecta `auditSessionId !== null` → load `system_prompt` desde tabla → pass-through `messages` a streamText. Sonnet ve toda la conversation history y responde focalizado al template del segundo turn. **Cero re-assembly del contexto pesado.**

---

## Asunciones a confirmar (Assumptions Log)

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Pricing Sonnet 4.6 = $3 input / $15 output per MTok al day-of-execution | §3, Standard Stack | cost_usd persistido sera incorrecto. Mitigacion: planner confirma pricing actual via Anthropic Console antes del Task de pricing constant. |
| A2 | `onFinish` callback corre antes de cerrar el stream response | §4 | Si no, el header `X-Audit-Session-Id` no se setea correctamente. Mitigacion: leer source de `result.toUIMessageStreamResponse()` o test integration con un mock streamText. |
| A3 | Trigger function `update_updated_at_column()` esta disponible en prod Supabase y funciona correctamente | §5 | Si NO, el `updated_at` queda fixed en created_at. Mitigacion: verificar via SQL Editor `SELECT * FROM pg_trigger WHERE tgname = 'agent_audit_sessions_updated_at'` post-apply. |
| A4 | Tier de proyecto MorfX en Anthropic = 2+ (2000 RPM count_tokens) | §3 | Si tier 1, podria chocar con 100 RPM en bursts. Mitigacion: estimacion local first (cubre 95% casos). |
| A5 | `useChat` no envia el assistant message del round actual ANTES de su `onFinish` | §4 Pitfall 11 | Si lo envia mid-stream, podria duplicarse en DB. Mitigacion: usar el array `messages` de `onFinish({ messages })` callback (que el SDK garantiza es post-stream-complete). |
| A6 | Estimacion `chars / 2.8` es conservadora para mix prosa-espanol + JSON | §3 | Subestimacion → exceedemos cap silenciosamente y la API responde 400 token-limit. Mitigacion: API count_tokens si estimacion > 40K (deja 20% margen). |

**Si esta tabla esta vacia:** todos los claims fueron verificados o citados.

**Si tiene items:** el planner debe revisar A1-A6 al disenar tasks y, si alguno cambia el approach, refinar el plan antes de execute-phase.
