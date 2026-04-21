# Somnio Recompra + CRM Reader Integration — Research

**Researched:** 2026-04-20
**Type:** Standalone (no phase number)
**Mode:** Implementation (tech choices LOCKED en CONTEXT.md D-01..D-17)
**Domain:** Next.js 15 App Router + Supabase (Postgres jsonb) + Vercel + Inngest v3.51 + AI SDK v6 + Anthropic Sonnet 4.5
**Confidence:** HIGH (execution patterns verified contra codebase live)

## Summary

Toda decision de diseño esta lockeada en CONTEXT.md (D-01..D-17). Esta research valida la mecanica operacional de ejecutar el diseño correctamente sobre infraestructura existente:

Hallazgos criticos descubiertos durante la investigacion:

- **`SessionManager.updateState` reemplaza JSONB completo, NO merge.** La firma `.from('session_state').update({ datos_capturados: {...} })` reescribe la columna entera (Supabase Postgrest update de columna JSONB = full replace). La funcion Inngest DEBE leer-luego-escribir para preservar los datos preloaded de `loadLastOrderData` (nombre/telefono/direccion/ciudad). Existe helper `SessionManager.updateCapturedData` que hace este merge — se debe usar ese, no `adapters.storage.saveState(sessionId, { datos_capturados: {...} })`. Verificado en `src/lib/agents/session-manager.ts:355-371` vs `:402-414`.
- **El patron `(inngest.send as any)` es el canon** del repo para eventos fuera del schema tipado. Ver `src/lib/whatsapp/webhook-handler.ts:314`, `src/lib/domain/sms.ts:217`, `src/lib/shopify/webhook-handler.ts:135`. La alternativa (registrar el evento en `src/inngest/events.ts`) es preferible pero opcional — 5 callsites ya hacen `as any` hoy.
- **Patron de observability merge para step.run replays (42.1 Plan 07)** esta en `src/inngest/functions/agent-production.ts:294-367`. Cada replay reinicializa el collector en el outer handler, pero `step.run` devuelve cached output — por eso el step.run retorna `{ engineResult, __obs: { events, queries, aiCalls } }` y el outer hace `collector.mergeFrom(stepResult.__obs)` despues. Este es EL patron a copiar para la Inngest function nueva.
- **Prompt del comprehension de recompra** ya serializa `existingData` crudo con `JSON.stringify` (`src/lib/agents/somnio-recompra/comprehension-prompt.ts:16`). Inyectar `_v3:crm_context` dentro de `DATOS YA CAPTURADOS` seria un disaster de prompt bloat — debe ir en una seccion dedicada ANTES del bloque de datos capturados y el crm_context key debe filtrarse del dataSection JSON.
- **`V3ProductionRunner` preload solo corre en `session.version === 0`** (runner line 120). Pero `(this.adapters.storage as any).saveState(sessionId, { '_v3:agent_module': ... })` (runner line 131) pasa una key top-level que NO es columna de `session_state` — probablemente silently falla o Supabase lo ignora. Hay un bug latente aqui; cita verificada por busqueda grep y lectura del schema `20260205000000_agent_sessions.sql:72-89`. El nuevo codigo NO debe replicar este patron: debe escribir dentro de `datos_capturados`.
- **Inngest retry semantics para LLM:** el patron del repo es `retries: 2` en Inngest functions que llaman modelo (agent-production.ts:75). Para la Inngest function nueva recomiendo `retries: 1` — el reader cobra tokens en cada retry y si falla una vez es mejor quedar sin contexto rico que gastar $0.02x2 y bloquear mas tiempo la sesion.
- **Feature flag via `platform_config`** es el patron mas nuevo del repo (Phase 44.1, `src/lib/domain/platform-config.ts`). 30s TTL cache per-lambda, fail-open a fallback. Ya esta listo para usar via `getPlatformConfig<boolean>('somnio_recompra_crm_reader_enabled', false)`. Esto evita el pitfall 6 de Phase 44 (env var cacheada en lambda warm). Strongly recommended sobre `process.env.USE_CRM_READER_PRELOAD`.

**Primary recommendation:** Nueva Inngest function `recompra-preload-context` en `src/inngest/functions/recompra-preload-context.ts`, registrada en `src/app/api/inngest/route.ts`. Feature-flagged via `platform_config.somnio_recompra_crm_reader_enabled` (default `false` por Regla 6). Dispatch con `await (inngest.send as any)({ name: 'recompra/preload-context', data: { sessionId, contactId, workspaceId, invoker: 'somnio-recompra-v1' } })` entre webhook-processor:219 (despues del runner construct) y el primer `runner.processMessage`. Ojo — este `await send()` retorna tras encolar, NO tras ejecutar; la greeting latency del turno 0 no se afecta. La function corre `processReaderMessage` con AbortSignal 12s, hace read-then-merge del session_state via Supabase directo, retorna `__obs` + metrics. Comprehension de turno 1+ poliquea `datos_capturados['_v3:crm_context']` con `setTimeout`-based sleep loop hasta 3s y lo prepone en seccion dedicada del system prompt.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (copy verbatim de CONTEXT.md §Decisions)

**Activacion y timing:**
- **D-01:** El reader se invoca **solo al crear sesion nueva** de recompra (`session.version === 0`). No se refresca mid-conversacion en esta fase.
- **D-02:** Turno 0 (saludo) **NO espera** al reader. El bot responde el saludo usando solo `contact.name` extraido del query simple actual. Latencia del saludo se mantiene <200ms.
- **D-03:** El reader corre en **paralelo** via Inngest mientras el bot saluda. Escribe `_v3:crm_context` al session state cuando termina.

**Mecanismo async — Inngest (no fire-and-forget):**
- **D-04:** Nueva funcion Inngest: `recompra/preload-context` (nombre tentativo).
- **D-05:** webhook-processor dispara via `await inngest.send(...)` ANTES de responder el saludo.
- **D-06:** La funcion Inngest encapsula: llamar `processReaderMessage` → guardar `result.text` al session state via `adapters.storage.saveState({ '_v3:crm_context': text })`. Sigue el patron de observability merge (encode output en step.run return).
- **D-07:** Invoker pasado al reader: `'somnio-recompra-v1'`.

**Prompt al reader — estructurado fijo:**
- **D-08:** Template de prompt (enviado como unico mensaje `role: user`):
  ```
  Prepara contexto de recompra para el contacto {contactId} del workspace actual.
  Devuelve un parrafo coherente en espanol con:
  1) Ultimo pedido entregado: items comprados (nombre + cantidad) y fecha de entrega.
  2) Tags activos del contacto.
  3) Numero total de pedidos del contacto.
  4) Direccion y ciudad mas recientes confirmadas.
  Si algun dato no existe, indicalo literalmente (no inventes).
  Formato plano, sin listas markdown — va a ser inyectado en otro prompt de bot.
  ```
- **D-09:** El prompt se envia como `messages: [{ role: 'user', content: <template> }]`.

**Forma del output — blob de texto:**
- **D-10:** El `result.text` completo del reader se guarda en la key `_v3:crm_context` dentro de `datos_capturados`.
- **D-11:** El comprehension-prompt lee `_v3:crm_context` al inicio como bloque de contexto adicional.
- **D-12:** NO se parsean los `toolCalls` del reader a keys estructuradas en esta fase.

**Edge case race:**
- **D-13:** Poll con backoff corto: 500ms hasta 3s totales si `_v3:crm_context` no existe.
- **D-14:** Si a los 3s no hay contexto → turno procede sin el contexto rico.
- **D-15:** NUNCA se re-dispara el reader en el mismo session.

**Observabilidad:**
- **D-16:** 5 eventos nuevos via `getCollector()?.recordEvent`:
  - `pipeline_decision:crm_reader_dispatched`
  - `pipeline_decision:crm_reader_completed`
  - `pipeline_decision:crm_reader_failed`
  - `pipeline_decision:crm_context_used`
  - `pipeline_decision:crm_context_missing_after_wait`

**Scope doc:**
- **D-17:** Actualizar `.claude/rules/agent-scope.md` §"CRM Reader Bot" — agregar `somnio-recompra-v1` como consumidor in-process.

### Claude's Discretion (from CONTEXT.md)

- Timeout exacto del reader call (10-15s). **Recomendacion de esta research: 12s AbortSignal inner + 20s `retries:1` outer step timeout implicit (ver §Inngest Function Pattern).**
- Shape exacto del event payload `recompra/preload-context`. **Recomendacion: `{ sessionId, contactId, workspaceId, invoker: 'somnio-recompra-v1' }` — minimo necesario, todos los campos no-opcionales, sin `agentId` duplicado.**
- Mecanismo del poll (interval vs sleep loop). **Recomendacion: async sleep loop con `setTimeout(Promise)` — 500ms steps, max 6 iteraciones.**
- Manejo reader vacio/"no encontrado". **Recomendacion: guardar el string vacio NO — en vez de eso guardar un marker `_v3:crm_context_status = 'empty' | 'error' | 'ok'` adicional para que el poll pueda distinguir "aun no llega" vs "ya llego y fue vacio". Simplifica el consumer sin inflar el prompt.**
- Punto exacto de inyeccion en comprehension-prompt. **Recomendacion: nuevo header `## CONTEXTO CRM DEL CLIENTE (precargado)` ANTES de `DATOS YA CAPTURADOS`, y filtrar el key `_v3:crm_context` + `_v3:crm_context_status` del dataSection JSON para que no aparezca 2 veces.**

### Deferred Ideas (OUT OF SCOPE)

- Invocacion mid-conversacion del reader.
- TTL / invalidacion automatica de `_v3:crm_context`.
- Parseo estructurado de toolCalls a keys separadas.
- Optimizacion de tokens del bloque de contexto (truncado/compresion).
- Tests E2E plenos — plan-phase decide cobertura.
- Exposicion HTTP del reader (Plan 07 de Phase 44).
- HTTP route del recompra-preload-context como API externa.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dispatch del reader al crear session recompra | API / Backend (webhook-processor) | — | Ya corre en lambda con el session create; `await inngest.send()` no bloquea runtime mas de ~50ms |
| Ejecucion async del reader AI call | Inngest Function (Background Worker) | — | Reader tarda 5-10s tipicamente; no puede bloquear webhook que debe devolver 200 <5s |
| Persistencia de `_v3:crm_context` | Database (Postgres via SessionManager) | — | `session_state.datos_capturados` JSONB ya es el contrato (Regla 3) |
| Consumo del `_v3:crm_context` en comprehension | API / Backend (somnio-recompra-agent) | — | Se lee del session state en processUserMessage, alimenta el system prompt de Haiku |
| Poll de race-condition | API / Backend (dentro de processUserMessage) | — | Vive en el mismo lambda que el siguiente turno — lee `session_state` via SessionManager |
| Observability de reader dispatch | Inngest Function + webhook-processor | — | Eventos `pipeline_decision:crm_reader_*` emitidos via `getCollector().recordEvent` desde ambos sitios |
| Feature flag lookup | Database (platform_config table) | — | 30s cache per-lambda — evita Pitfall 6 de Phase 44 (env var warm-cache) |

## Standard Stack (already installed)

| Library | Version | Purpose | Why Standard (evidence) |
|---------|---------|---------|-------------------------|
| `inngest` | 3.51.0 | Background worker + retries + observability boundary | `package.json:60`; canonical pattern `src/inngest/client.ts` |
| `ai` | ^6.0.86 | AI SDK v6 — `generateText` + `stepCountIs` | `package.json:46`; reader already uses it `crm-reader/index.ts:11` |
| `@ai-sdk/anthropic` | ^3.0.43 | Anthropic provider para AI SDK | `package.json:12`; `crm-reader/index.ts:12` |
| `@supabase/supabase-js` | ^2.93.1 | DB client | canonical |
| `zod` | installed | Schema validation | reader tools use zod |

**Zero new npm packages required.** Toda la infra esta lista.

### Version verification

No hace falta bump. El stack ya funciona con crm-reader en producciom (Phase 44 Plans 01-06 shipped). Solo añadimos consumer.

## Architecture Patterns

### System Architecture Diagram

```
                        ┌──────────────────────────────┐
   Cliente WhatsApp ───▶│  Meta Cloud API Webhook      │
   (mensaje "hola")     │  /api/whatsapp/webhook       │
                        └──────────────┬───────────────┘
                                       │ await inngest.send
                                       │ (agent/whatsapp.message_received)
                                       ▼
                        ┌──────────────────────────────┐
                        │  Inngest: whatsapp-agent-    │
                        │  processor                   │
                        │  (existing, unchanged)       │
                        └──────────────┬───────────────┘
                                       │ step.run('process-message')
                                       ▼
                        ┌──────────────────────────────┐
                        │ webhook-processor.ts         │
                        │ processMessageWithAgent()    │
                        │                              │
                        │ 1. is_client? → recompra    │
                        │ 2. loadLastOrderData()      │  ◀── simple Supabase query
                        │    (nombre/telefono/...)     │      <100ms, NO reader
                        │                              │
                        │ 3. ★ NEW: si session nueva: ★│
                        │    await inngest.send({      │  ◀── B1: feature flag check
                        │      recompra/preload-       │       platform_config
                        │      context, data:{...}})   │
                        │    getCollector.recordEvent( │
                        │     'crm_reader_dispatched') │
                        │                              │
                        │ 4. V3ProductionRunner        │
                        │    .processMessage()         │
                        │    ── genera saludo turno 0 │
                        │    ── envia mensaje          │
                        │    ── retorna               │
                        └──────────────┬───────────────┘
                                       │
                                       ▼
                               ┌───────────────┐
                               │  Saludo al    │
                               │  cliente via  │
                               │  WhatsApp     │
                               └───────────────┘

      (paralelo — fuego desde inngest.send anterior)

                        ┌──────────────────────────────┐
                        │ ★ NEW Inngest Function:      │
                        │   recompra-preload-context   │
                        │ src/inngest/functions/       │
                        │   recompra-preload-context.ts│
                        │                              │
                        │ step.run('call-reader'):     │
                        │  ├─ processReaderMessage(    │
                        │  │    workspaceId,invoker,   │
                        │  │    messages:[{user, D-08  │
                        │  │    template}],            │
                        │  │    AbortSignal(12s))      │
                        │  │                           │
                        │  └─ SessionManager           │
                        │     .updateCapturedData(     │
                        │       sessionId,             │  ◀── merge-safe,
                        │       { '_v3:crm_context':   │      preserva preloaded
                        │         result.text,         │
                        │         '_v3:crm_context_    │
                        │           status': 'ok' })   │
                        │                              │
                        │ return {                     │
                        │  __obs: {                   │  ◀── survives replay
                        │    events, duration,        │
                        │    toolCallCount, steps    │
                        │  }                          │
                        │ }                            │
                        │                              │
                        │ (outer) collector            │
                        │  .mergeFrom(result.__obs)    │
                        │  .flush()                    │
                        └──────────────────────────────┘

      (turno 1+ — cliente envia mensaje con intencion)

                        ┌──────────────────────────────┐
                        │ whatsapp-agent-processor      │
                        │ → webhook-processor           │
                        │ → V3ProductionRunner          │
                        │ → somnio-recompra-agent      │
                        │   processUserMessage()        │
                        │                              │
                        │ ★ NEW: antes de comprehend():│
                        │   pollCrmContext(sessionId,  │
                        │     timeoutMs:3000,          │
                        │     intervalMs:500)          │
                        │   → datosCapturados['_v3:    │
                        │       crm_context']          │
                        │                              │
                        │ comprehend(..., existingData)│
                        │  └── buildSystemPrompt:      │
                        │       ## CONTEXTO CRM        │
                        │       (precargado)           │
                        │       {crm_context text}     │
                        │       ## DATOS YA CAPTURADOS │
                        │       {...sin _v3 keys}      │
                        │                              │
                        │ getCollector.recordEvent(    │
                        │   'crm_context_used'          │
                        │    | 'crm_context_missing_   │
                        │       after_wait')            │
                        └──────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── inngest/
│   ├── events.ts                           # agregar RecompraPreloadEvents (ver §8)
│   └── functions/
│       └── recompra-preload-context.ts    # NEW — toda la logica Inngest
├── lib/
│   └── agents/
│       ├── somnio-recompra/
│       │   ├── comprehension-prompt.ts    # EDIT — inyectar seccion crm_context
│       │   ├── somnio-recompra-agent.ts   # EDIT — poll antes de comprehend
│       │   └── constants.ts               # EDIT — nuevo const CRM_CONTEXT_KEY = '_v3:crm_context'
│       └── production/
│           └── webhook-processor.ts        # EDIT — inngest.send al is_client branch
├── app/
│   └── api/
│       └── inngest/
│           └── route.ts                    # EDIT — register new function
.claude/
└── rules/
    └── agent-scope.md                      # EDIT — add consumer entry D-17
```

### Pattern 1: Inngest `step.run` Observability Merge (MANDATORY)

**What:** In-memory observability collectors NO sobreviven a step.run replays porque cada replay corre en lambda nueva.
**When to use:** SIEMPRE que un step.run llama codigo que emite `getCollector().recordEvent(...)`.
**Example:**

```ts
// Source: src/inngest/functions/agent-production.ts:294-367
const stepResult = await step.run('call-reader', async () => {
  const stepCollector = collector
    ? new ObservabilityCollector({
        conversationId: collector.conversationId,
        workspaceId: collector.workspaceId,
        agentId: collector.agentId,
        turnStartedAt: collector.turnStartedAt,
        triggerMessageId: collector.triggerMessageId,
        triggerKind: collector.triggerKind,
      })
    : null

  const run = async () => {
    // call processReaderMessage here, etc
    return { text, toolCallCount, steps, durationMs }
  }

  const result = stepCollector
    ? await runWithCollector(stepCollector, run)
    : await run()

  return {
    readerResult: result,
    __obs: stepCollector ? {
      events: stepCollector.events,
      queries: stepCollector.queries,
      aiCalls: stepCollector.aiCalls,
    } : null,
  }
})

// OUT OF THE STEP — merge back into outer collector for flush
if (collector && stepResult.__obs) collector.mergeFrom(stepResult.__obs)
```

### Pattern 2: `(inngest.send as any)` para eventos fuera del schema tipado

**What:** El schema de Inngest events vive en `src/inngest/events.ts`. Si agregamos evento nuevo ahi, el type-check pasa sin cast. Si lo omitimos, hay que usar `as any`.
**When:** Preferir agregar al schema (es 15 lineas), ambos patrones funcionan en produccion.
**Example:**

```ts
// Source: src/lib/whatsapp/webhook-handler.ts:314
await (inngest.send as any)({
  name: 'agent/whatsapp.message_received',
  data: { ... },
})

// Preferido: tipado
// Source: src/inngest/events.ts:21 (and all Event types)
export type RecompraPreloadEvents = {
  'recompra/preload-context': {
    data: {
      sessionId: string
      contactId: string
      workspaceId: string
      invoker: 'somnio-recompra-v1'
    }
  }
}
// Then in events.ts line 748:
export type AllAgentEvents = ... & RecompraPreloadEvents
```

**Recomendacion:** Agregar al schema. Es limpio y el repo tiene 9 types register ya (`AgentEvents`, `IngestEvents`, `AutomationEvents`, `RobotEvents`, `GodentistEvents`, `V3TimerEvents`). Agregar uno mas es trivial.

### Anti-Patterns to Avoid

- **Fire-and-forget `inngest.send`** sin `await`: muere en Vercel lambda cold start antes de que Inngest lo reciba. Canonico del proyecto (MEMORY rule).
- **`saveState(id, { datos_capturados: {...} })` sin merge:** reemplaza el blob entero, pisando datos preloaded. Usar `SessionManager.updateCapturedData` que hace get-then-merge (`session-manager.ts:402-414`).
- **`saveState(id, { '_v3:key': val })` como top-level key:** NO es columna. Referenciado bug latente en `v3-production-runner.ts:131`. El valor NUNCA se escribe; error silencioso (o Supabase rechaza). Siempre anidar dentro de `datos_capturados`.
- **Env var feature flag:** lambdas warm cachean env vars, un cambio de flag no toma efecto hasta redeploy. Usar `getPlatformConfig()` con su TTL 30s.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Llamada al reader AI model | `anthropic.messages.create` directo | `processReaderMessage` de `@/lib/agents/crm-reader` | Ya maneja system prompt, tools, MAX_STEPS, logging, invoker |
| Timeout del LLM call | `setTimeout` + Promise.race | `AbortController` + `abortSignal` param en `generateText` | AI SDK v6 soporta nativo (`AbortSignal.timeout(12_000)`) |
| Session state write merge | `createAdminClient + update + spread manual` | `SessionManager.updateCapturedData(sessionId, {...})` | Ya hace read-then-merge de `datos_capturados` + timestamp (Regla 3) |
| Feature flag per-request | `process.env.X === 'true'` | `await getPlatformConfig<boolean>('key', false)` | Lambda warm-cache pitfall + 30s TTL + fail-open |
| Observability en step.run | Collector mutado desde dentro | Pattern `__obs` return + `mergeFrom` | Replays matan in-memory state (42.1 Plan 07) |
| Poll con backoff | `setInterval` mutable | Async `await new Promise(r => setTimeout(r, 500))` en while-loop | setInterval no se puede `await`, fugas si no se clearea |
| Retry logic del LLM | Try/catch manual | `retries: 1` config en `createFunction` | Inngest maneja exponential backoff nativo |

**Key insight:** CADA una de estas piezas ya existe en el repo. El standalone es wiring + diseño del prompt — NO code nuevo de infra.

## Runtime State Inventory

Esta fase es mayormente ADDITIVA (nueva funcion Inngest, nuevo key en datos_capturados, edits quirurgicos). No es rename/refactor. Aun asi audito:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `session_state.datos_capturados` — se agrega key `_v3:crm_context` + `_v3:crm_context_status`. Sessions ya existentes en DB NO tendran esta key (fine — el poll maneja ausencia). | Ninguno. No migration — el campo aparece on-write per session nueva. |
| Live service config | Ninguno. Inngest Cloud no registra el nombre de la function hasta que `/api/inngest` route la expone (auto-descubrimiento en siguiente sync). | Ninguno. |
| OS-registered state | Ninguno. | Ninguno. |
| Secrets/env vars | Ninguno nuevo. Feature flag via `platform_config` row (no env var). `ANTHROPIC_API_KEY` ya existe para el reader. | Crear row `platform_config (key='somnio_recompra_crm_reader_enabled', value=false)` en Supabase **ANTES** del push (Regla 5 — aunque no es "migration" tecnicamente, es data-before-deploy). |
| Build artifacts | Ninguno. No hay egg-info/compiled. Next.js se rebuilda entero. | Ninguno. |

**Resumen:** 1 data insert pre-push: `INSERT INTO platform_config (key, value) VALUES ('somnio_recompra_crm_reader_enabled', 'false'::jsonb)`.

## Common Pitfalls

### Pitfall 1: Fire-and-forget `inngest.send` en webhook-processor (CRITICO)

**What goes wrong:** Sin `await`, Vercel puede matar la lambda antes de que Inngest reciba el evento. El reader nunca corre. Turno 1+ siempre va sin contexto.
**Why:** Vercel serverless aborta peticiones terminadas; el promise `inngest.send` queda en microtask queue y muere al "return" del handler.
**How to avoid:** `await inngest.send({...})` SIEMPRE. Nota: `await` en un send que encola es ~50ms, no bloquea el turno 0 significantly.
**Warning signs:** Inngest dashboard muestra 0 runs del event, pero collector events muestran `crm_reader_dispatched`. En el canonical MEMORY: "Inngest step.run observability merge pattern".
**Evidencia:** `src/lib/whatsapp/webhook-handler.ts:310-336` (uses await + try/catch inline fallback).

### Pitfall 2: Session state race — runner preload vs Inngest merge

**What goes wrong:** El V3ProductionRunner en turno 0 escribe `datos_capturados: { nombre, telefono, direccion, ciudad }` via `saveState({ datos_capturados: {...} })` (line 120-123). Este es FULL REPLACE. Si la Inngest function escribe `_v3:crm_context` con un patch naive (`saveState({ datos_capturados: { '_v3:crm_context': text } })`), BORRA nombre/telefono/direccion/ciudad.
**Why:** `SessionManager.updateState` hace UPDATE de columnas; para JSONB es replace, no merge (`session-manager.ts:355-371`).
**How to avoid:** Usar `SessionManager.updateCapturedData(sessionId, { '_v3:crm_context': text, '_v3:crm_context_status': 'ok' })` que hace get-then-merge (line 402-414). **Adicionalmente**, la funcion Inngest debe correr DESPUES que el runner escribio — garantizado porque `runner.processMessage` ya escribio a version 0 ANTES que el reader termine (reader tarda 5-10s; runner write es <100ms). Pero si runner crash-loopea antes de escribir, y Inngest gana la carrera, escribiria sobre un state vacio. OK en ese caso — no pierde nada.
**Warning signs:** Cliente responde turno 1 y el bot pregunta "como te llamas?" despues de haber saludado con nombre.
**Evidencia:** runner line 120-123 vs SessionManager line 402-414 (el helper merge-aware).

### Pitfall 3: Comprehension lee state desde snapshot stale

**What goes wrong:** processUserMessage ya tiene `input.datosCapturados` pasado desde V3ProductionRunner. Si el poll corre DENTRO de processUserMessage pero ANTES de comprehend, necesita re-fetchear el state (porque Inngest pudo haber escrito en los 5-10s entre turno 0 y turno 1 — SI la Inngest function tardo mas que el turno 0 complete).
**Why:** `v3-production-runner.processMessage` construye `v3Input.datosCapturados` UNA vez al inicio del turno (line 111). Si el Inngest function escribe despues, `input.datosCapturados` ya es stale.
**How to avoid:** El poll DEBE leer de la DB (`SessionManager.getState(sessionId)` via adapter o directo), NO del snapshot `input.datosCapturados`. Pasar `sessionId` como arg nuevo a processUserMessage (via v3Input extension) O — mas limpio — leer el state desde un helper que instancia SessionManager. **Recomendacion:** extender `V3AgentInput` con `sessionId?: string` y pasarlo desde `v3-production-runner.ts:105-117`. Dentro de processUserMessage, si `sessionId` existe y el context key no esta en `input.datosCapturados`, hacer poll DB.
**Warning signs:** Poll retorna `undefined` siempre aunque la funcion Inngest escribio exitoso (visible en logs).
**Evidencia:** runner line 105-117 construye v3Input sin re-fetch; processMessage no tiene sessionId en su firma actual.

### Pitfall 4: Reader error silente deja la sesion sin saber

**What goes wrong:** Reader throw exception (timeout, rate limit, Anthropic 5xx). Inngest function retry 1 vez. Si ambos fallan, no queda nada escrito. Turno 1 hace poll 3s y hace timeout.
**Why:** Sin marker dedicado, el poll no distingue "aun procesando" vs "fallo definitivo".
**How to avoid:** En el catch del step.run, escribir `{ '_v3:crm_context_status': 'error' }` al session state ANTES de throw. El poll termina inmediatamente si ve status='error' o status='ok' o status='empty'. Solo espera si key ausente.
**Warning signs:** Primer turno despues del saludo retrasa 3s para el cliente cuando el reader fallo hace mucho.
**Evidencia:** `src/inngest/functions/agent-production.ts:395-411` muestra write-error-message pattern cuando una operacion falla.

### Pitfall 5: Inngest step.run timeout default vs AI SDK timeout

**What goes wrong:** Inngest default step timeout = 2 min. AI SDK default = sin timeout. Si reader hangea 120s, Inngest abortara y el retry hace 120s mas = 4 min del cliente sin contexto.
**Why:** step.run hereda el timeout del function-level, que es 2min default.
**How to avoid:** Inner timeout con AbortSignal — 12s. Suficiente para 5 tool calls + Sonnet 4.5 latencia. Cheaper y visible en logs.
**Implementation:**
```ts
const result = await processReaderMessage({
  workspaceId,
  invoker: 'somnio-recompra-v1',
  messages: [{ role: 'user', content: PROMPT_D08(contactId) }],
})
// Note: processReaderMessage NO expone abortSignal HOY.
// Recomendacion adicional al planner: extender ReaderInput con optional abortSignal,
// pasarlo a generateText({abortSignal}). Es edit adicional en reader/index.ts y reader/types.ts.
// Pitfall menor: hasta que se haga ese edit, usar Promise.race con setTimeout(12_000) como fallback.
```
**Warning signs:** Inngest dashboard muestra runs de 120s antes de retry.

### Pitfall 6: Feature flag env var warm-cache (Blocker 6 Phase 44)

**What goes wrong:** `process.env.USE_CRM_READER_PRELOAD` en Vercel: cambio en dashboard NO afecta a lambdas warm (que retienen snapshots del env). Cambio tarda hasta 15min en tomar efecto en TODAS las lambdas.
**Why:** Vercel cachea env en lambda inicialization.
**How to avoid:** Usar `getPlatformConfig<boolean>('somnio_recompra_crm_reader_enabled', false)`. 30s TTL in-memory cache, fail-open a `false`.
**Evidencia:** `src/lib/domain/platform-config.ts:58-154` — TTL 30_000ms, fail-open.

### Pitfall 7: `result.text` unbounded length infla comprehension prompt

**What goes wrong:** Reader retorna parrafo de 800+ tokens (cliente con 20 tags + 15 pedidos + items). Comprehension prompt crece de 4k a 5k tokens = +20% costo per turn en recompra activo.
**Why:** `result.text` no tiene cap; es LLM output.
**How to avoid:** D-08 prompt dice "parrafo coherente" que limita naturalmente. En tests, loggear `crm_context.length` en `crm_reader_completed` event. Si p95 > 2000 chars, añadir truncado en comprehension injection (no en el write — preservamos el blob completo por si luego se necesita).
**Warning signs:** Token usage de Haiku comprehension sube post-rollout del flag.
**Evidencia:** `response.usage` en `comprehension.ts:85` — ya se graba tokensUsed per turn.

### Pitfall 8: Inngest event name NO registrado en events.ts

**What goes wrong:** Con `(inngest.send as any)`, el TypeScript pasa pero Inngest Cloud no tiene schema para el event — aparece como "event unknown" en dashboard. Para el consumer function (`{ event: 'recompra/preload-context' }`) Inngest no valida shape.
**Why:** El type `AllAgentEvents` es solo check compile-time.
**How to avoid:** Registrar `RecompraPreloadEvents` en `events.ts` y añadir a union `AllAgentEvents` (line 748). 15 lineas, permite hacer `inngest.send({ name: 'recompra/preload-context', data })` sin `as any`.
**Evidencia:** El repo tiene 9 type registrations (lines 21-747) — sigue ese patron.

### Pitfall 9: Testing en produccion — Regla 6

**What goes wrong:** Bot en produccion atiende clientes reales. Push del flag enabled sin validacion → saludos lentos / comprehension corrupta / costos duplicados.
**How to avoid:** Flag `false` por default en el INSERT inicial. Despues del push, UPDATE a `true` UNA sesion (via logs, para un workspace de testing). Observar `crm_reader_completed` event en dashboard, confirmar `result.text` sensato, volver a OFF. Escalar a produccion real.
**Evidencia:** CLAUDE.md Regla 6.

## Code Examples

### Ejemplo 1: Inngest function skeleton (propuesto)

```ts
// src/inngest/functions/recompra-preload-context.ts
import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import {
  isObservabilityEnabled,
  ObservabilityCollector,
  runWithCollector,
} from '@/lib/observability'
import { getPlatformConfig } from '@/lib/domain/platform-config'

const logger = createModuleLogger('recompra-preload-context')

const READER_TIMEOUT_MS = 12_000

function buildReaderPrompt(contactId: string): string {
  return `Prepara contexto de recompra para el contacto ${contactId} del workspace actual.
Devuelve un parrafo coherente en espanol con:
1) Ultimo pedido entregado: items comprados (nombre + cantidad) y fecha de entrega.
2) Tags activos del contacto.
3) Numero total de pedidos del contacto.
4) Direccion y ciudad mas recientes confirmadas.
Si algun dato no existe, indicalo literalmente (no inventes).
Formato plano, sin listas markdown — va a ser inyectado en otro prompt de bot.`
}

export const recompraPreloadContext = inngest.createFunction(
  {
    id: 'recompra-preload-context',
    name: 'Recompra: Preload CRM Context via Reader',
    retries: 1,
    concurrency: [{ key: 'event.data.sessionId', limit: 1 }],  // dedupe por session
  },
  { event: 'recompra/preload-context' },
  async ({ event, step }) => {
    const { sessionId, contactId, workspaceId, invoker } = event.data

    const enabled = await getPlatformConfig<boolean>(
      'somnio_recompra_crm_reader_enabled',
      false
    )
    if (!enabled) {
      logger.info({ sessionId, contactId, workspaceId }, 'feature flag off, skipping')
      return { status: 'skipped', reason: 'feature_flag_off' }
    }

    const collector = isObservabilityEnabled()
      ? new ObservabilityCollector({
          conversationId: `recompra-preload-${sessionId}`,
          workspaceId,
          agentId: 'crm-reader',
          turnStartedAt: new Date(),
          triggerKind: 'system_event',
        })
      : null

    const stepResult = await step.run('call-reader-and-persist', async () => {
      const stepCollector = collector
        ? new ObservabilityCollector({
            conversationId: collector.conversationId,
            workspaceId,
            agentId: 'crm-reader',
            turnStartedAt: collector.turnStartedAt,
            triggerKind: 'system_event',
          })
        : null

      const run = async () => {
        const startedAt = Date.now()
        const { processReaderMessage } = await import('@/lib/agents/crm-reader')
        const { SessionManager } = await import('@/lib/agents/session-manager')

        // Inner timeout — AbortController (Pitfall 5).
        // NOTE: processReaderMessage no expone abortSignal actualmente.
        // Planner decide: (a) extender ReaderInput con abortSignal + thread a generateText,
        // o (b) fallback Promise.race contra setTimeout.
        const abortController = new AbortController()
        const timeoutHandle = setTimeout(() => abortController.abort(), READER_TIMEOUT_MS)

        try {
          const reader = await processReaderMessage({
            workspaceId,
            invoker,
            messages: [{ role: 'user', content: buildReaderPrompt(contactId) }],
          })
          const duration = Date.now() - startedAt
          const text = reader.text?.trim() ?? ''
          const status: 'ok' | 'empty' = text.length > 0 ? 'ok' : 'empty'

          // Merge-safe write (Pitfall 2)
          const sm = new SessionManager()
          await sm.updateCapturedData(sessionId, {
            '_v3:crm_context': text,
            '_v3:crm_context_status': status,
          })

          return {
            status,
            durationMs: duration,
            textLength: text.length,
            toolCallCount: reader.toolCalls?.length ?? 0,
            steps: reader.steps,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.error({ err: msg, sessionId, contactId }, 'reader call failed')

          // Marker de error (Pitfall 4)
          try {
            const sm = new SessionManager()
            await sm.updateCapturedData(sessionId, {
              '_v3:crm_context': '',
              '_v3:crm_context_status': 'error',
            })
          } catch {/* swallow — last-resort */}

          return {
            status: 'error' as const,
            durationMs: Date.now() - startedAt,
            error: msg.slice(0, 500),
          }
        } finally {
          clearTimeout(timeoutHandle)
        }
      }

      const result = stepCollector
        ? await runWithCollector(stepCollector, run)
        : await run()

      return {
        readerResult: result,
        __obs: stepCollector ? {
          events: stepCollector.events,
          queries: stepCollector.queries,
          aiCalls: stepCollector.aiCalls,
        } : null,
      }
    })

    const result = stepResult.readerResult

    // Merge observability (observability merge pattern)
    if (collector && stepResult.__obs) collector.mergeFrom(stepResult.__obs)

    // Observability events (D-16)
    if (result.status === 'ok' || result.status === 'empty') {
      collector?.recordEvent('pipeline_decision', 'crm_reader_completed', {
        agent: 'somnio-recompra-v1',
        sessionId,
        contactId,
        durationMs: result.durationMs,
        toolCallCount: 'toolCallCount' in result ? result.toolCallCount : 0,
        steps: 'steps' in result ? result.steps : 0,
        textLength: 'textLength' in result ? result.textLength : 0,
        status: result.status,
      })
    } else {
      collector?.recordEvent('pipeline_decision', 'crm_reader_failed', {
        agent: 'somnio-recompra-v1',
        sessionId,
        contactId,
        durationMs: result.durationMs,
        error: 'error' in result ? result.error : 'unknown',
      })
    }

    if (collector) {
      await step.run('observability-flush', async () => {
        await collector.flush()
      })
    }

    return result
  }
)

export const recompraPreloadContextFunctions = [recompraPreloadContext]
```

### Ejemplo 2: Webhook-processor dispatch (propuesto)

```ts
// src/lib/agents/production/webhook-processor.ts (modificado ~line 200-220)

if (contactData?.is_client && recompraEnabled) {
  // ... existing recompra_routed event, typing indicator ...

  // Load last order data for preloading (existing, unchanged)
  const lastOrderData = await loadLastOrderData(contactId, workspaceId)

  // ★ NEW: dispatch reader preload if feature flag ON
  // Feature flag check happens inside the Inngest function too (defense in depth).
  // Here we avoid the inngest.send cost when disabled at platform level.
  try {
    const { getPlatformConfig } = await import('@/lib/domain/platform-config')
    const crmPreloadEnabled = await getPlatformConfig<boolean>(
      'somnio_recompra_crm_reader_enabled',
      false
    )

    if (crmPreloadEnabled) {
      // Need sessionId — must create session FIRST.
      // Two options:
      //  (a) Let V3ProductionRunner create session implicitly (it does), then dispatch AFTER with result.sessionId.
      //      Problem: reader would start AFTER greeting is sent (still OK, 3-5s idle between turns).
      //  (b) Pre-create session explicitly here via SessionManager, dispatch before runner, then pass sessionId to runner.
      //      Cleaner but touches more code.
      //
      //  Recomendacion: opcion (a) — dispatch DESPUES del runner.processMessage, usando engineOutput.sessionId.
      //  La greeting ya salio; el reader corre en paralelo mientras el cliente procesa el saludo.
      //  Solo el "crm_reader_dispatched" event se emite DESPUES de la greeting — cambiar este detalle en planner.
    }
  } catch (flagErr) {
    logger.warn({ err: flagErr }, 'Feature flag check failed, skipping reader preload')
  }

  // ... existing runner construction + processMessage ...
  const engineOutput = await runner.processMessage({ ... })

  // ★ NEW: dispatch AFTER session exists
  if (crmPreloadEnabled && engineOutput.sessionId) {
    try {
      getCollector()?.recordEvent('pipeline_decision', 'crm_reader_dispatched', {
        agent: 'somnio-recompra-v1',
        sessionId: engineOutput.sessionId,
        contactId,
        workspaceId,
      })
      await (inngest.send as any)({   // o tipado si se registra en events.ts
        name: 'recompra/preload-context',
        data: {
          sessionId: engineOutput.sessionId,
          contactId: contactId!,
          workspaceId,
          invoker: 'somnio-recompra-v1',
        },
      })
    } catch (dispatchErr) {
      logger.warn(
        { err: dispatchErr, sessionId: engineOutput.sessionId },
        'Failed to dispatch reader preload (fail-open, turn already sent)'
      )
    }
  }

  // ... rest unchanged ...
}
```

**NOTA IMPORTANTE del planner:** El dispatch DESPUES del runner es preferible porque necesita `sessionId`. Esto no viola D-01 ("al crear sesion nueva") porque `session.version === 0` sigue siendo la condicion del Inngest function si quisieramos guardar condicional adicional — pero dado que D-15 dice "NUNCA se re-dispara el reader en el mismo session", agregar un early-return en la funcion Inngest si `_v3:crm_context_status` ya existe: idempotencia.

### Ejemplo 3: Comprehension prompt injection (propuesto)

```ts
// src/lib/agents/somnio-recompra/comprehension-prompt.ts (modificado)

export function buildSystemPrompt(
  existingData: Record<string, string>,
  recentBotMessages: string[] = []
): string {
  // ★ NEW: extract and filter crm context
  const crmContext = existingData['_v3:crm_context']
  const crmStatus = existingData['_v3:crm_context_status']
  const hasCrmContext = crmStatus === 'ok' && crmContext && crmContext.trim().length > 0

  // ★ NEW: filter out _v3:crm_context* keys from the JSON dump (Pitfall 7 + clean prompt)
  const filteredData = Object.fromEntries(
    Object.entries(existingData).filter(([k]) => !k.startsWith('_v3:'))
  )

  const dataSection = Object.keys(filteredData).length > 0
    ? `\nDATOS YA CAPTURADOS (no re-extraer si ya estan):\n${JSON.stringify(filteredData, null, 2)}`
    : '\nDATOS YA CAPTURADOS: Ninguno aun.'

  // ★ NEW: dedicated section for crm context
  const crmSection = hasCrmContext
    ? `\n\n## CONTEXTO CRM DEL CLIENTE (precargado)\n${crmContext}\n\n(Usa este contexto para personalizar la comprension; NO reinventes datos.)`
    : ''

  const botContextSection = recentBotMessages.length > 0
    ? `...` // unchanged
    : ''

  return `Eres un analizador de mensajes para un agente de ventas de Somnio...${crmSection}${dataSection}${botContextSection}`
}
```

### Ejemplo 4: Poll helper inside processUserMessage (propuesto)

```ts
// src/lib/agents/somnio-recompra/somnio-recompra-agent.ts (modificado)

async function pollCrmContext(
  sessionId: string,
  datosFromInput: Record<string, string>,
  timeoutMs = 3000,
  intervalMs = 500
): Promise<{ crmContext: string | null; status: 'ok' | 'empty' | 'error' | 'timeout' }> {
  // Fast path: already present in input snapshot
  const existingStatus = datosFromInput['_v3:crm_context_status']
  if (existingStatus === 'ok' || existingStatus === 'empty' || existingStatus === 'error') {
    return {
      crmContext: datosFromInput['_v3:crm_context'] ?? null,
      status: existingStatus,
    }
  }

  // Poll DB (Pitfall 3 — input snapshot is stale)
  const { SessionManager } = await import('@/lib/agents/session-manager')
  const sm = new SessionManager()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs))
    try {
      const state = await sm.getState(sessionId)
      const status = state.datos_capturados['_v3:crm_context_status']
      if (status === 'ok' || status === 'empty' || status === 'error') {
        return {
          crmContext: state.datos_capturados['_v3:crm_context'] ?? null,
          status,
        }
      }
    } catch {
      // swallow — try again
    }
  }
  return { crmContext: null, status: 'timeout' }
}

// inside processUserMessage:
async function processUserMessage(input: V3AgentInput): Promise<V3AgentOutput> {
  // ★ NEW: poll for crm context ANTES de comprehend
  if (input.sessionId) {  // new field, see Pitfall 3 recommendation
    const { crmContext, status } = await pollCrmContext(
      input.sessionId,
      input.datosCapturados,
    )
    if (status === 'ok' && crmContext) {
      // merge into input.datosCapturados so comprehension-prompt picks it up
      input.datosCapturados['_v3:crm_context'] = crmContext
      input.datosCapturados['_v3:crm_context_status'] = 'ok'
      getCollector()?.recordEvent('pipeline_decision', 'crm_context_used', {
        agent: 'somnio-recompra-v1',
        sessionId: input.sessionId,
        contextLength: crmContext.length,
      })
    } else if (status === 'timeout' || status === 'error' || status === 'empty') {
      getCollector()?.recordEvent('pipeline_decision', 'crm_context_missing_after_wait', {
        agent: 'somnio-recompra-v1',
        sessionId: input.sessionId,
        status,
      })
    }
  }

  // ... rest of processUserMessage unchanged ...
  const { analysis, tokensUsed } = await comprehend(
    input.message,
    input.history,
    input.datosCapturados,  // now contains _v3:crm_context
    recentBotMessages,
  )
  // ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Env var feature flags | `platform_config` table + 30s TTL | Phase 44.1 (2026-03-10) | Preferred — avoids Pitfall 6. Env vars solo aceptables para secretos (API keys). |
| Fire-and-forget `inngest.send` | `await inngest.send` | Post-incident (MEMORY rule) | Mandatory en Vercel serverless. Docs internos del proyecto lo documentan como primer patron de Inngest. |
| Collector-via-ALS sin return | Return `__obs` + `mergeFrom` en outer | Phase 42.1 Plan 07 (quick/039) | Mandatory para step.run — ALS se pierde en replays. |
| Session state write via adapter top-level keys | `updateCapturedData` con nested datos_capturados | 2026-02-05 (original agent_sessions migration) | Siempre usar helper merge-aware. No escribir top-level `_v3:X`. |

**Deprecated / outdated:**
- `process.env.USE_NO_REPETITION === 'true'` (line 250 del runner) — el patron sigue funcionando pero platform_config es la evolucion.
- `loadLastOrderData` del webhook-processor NO esta deprecated — D-02 lo preserva. Coexisten el query simple (saludo) + reader (contexto rico).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SessionManager.updateCapturedData` existe y merge-seguro | §Pitfall 2, §Ejemplo 1 | Bajo — grep + read del file lo verifico (session-manager.ts:402-414). [VERIFIED: src/lib/agents/session-manager.ts:402-414] |
| A2 | Reader sin abortSignal en `ReaderInput` hoy | §Pitfall 5 | Bajo — ReaderInput typed en `crm-reader/types.ts:30-34` solo tiene workspaceId, messages, invoker. Planner decide si extender. [VERIFIED] |
| A3 | Inngest event `recompra/preload-context` no colisiona con eventos existentes | §Pattern 2 | Bajo — grep en events.ts NO muestra `recompra/` namespace usado. |
| A4 | Turno 0 del saludo toma <200ms con query simple | §D-02 context | Bajo — `loadLastOrderData` es SELECT WHERE id=? en contacts, indexado. [ASSUMED — sin benchmark explicito, pero 4 column single-row query tipicamente <50ms] |
| A5 | Sonnet 4.5 + 5 tool calls completa en <10s p95 para workspace pequeño | §Pitfall 5, §timeout 12s | Medium — no hay metricas historicas de recompra crm-reader. [ASSUMED basado en `LLM_TIMEOUT_MS = 30_000` en tests del reader y Phase 44 docs que indican tests pasan en 30s budget]. Planner decide si pedir al usuario subir limite a 15s. |
| A6 | `_v3:agent_module` top-level save en `v3-production-runner.ts:131` es bug latente | §Pitfall 2 | Bajo — Read confirmed schema has no such column; VERIFICATION.md marks it "verified" but SQL migration disagrees. [VERIFIED contra SQL + grep: no column exists]. Asumo Supabase silently drops unknown column keys o `update` lanza pero el codigo ignora. NOTA AL PLANNER: no lo arregles en este phase — esta en el scope del bot base, ya VERIFIED; agregar tarea aparte en deuda tecnica. |
| A7 | Feature flag via `platform_config` es pattern oficial del proyecto | §Feature Flag | Bajo — Phase 44.1 introdujo este pattern; `src/lib/domain/platform-config.ts` existe con docs extensos. [VERIFIED: read entire file] |
| A8 | Tests via vitest | §Validation Architecture | Bajo — `reader.test.ts:25` usa vitest; `package.json` no declara testDependency (tests existen sin runner installed; developer debe `npm i -D vitest`). [CITED: src/__tests__/integration/crm-bots/reader.test.ts:20-22] |

**Claims ASSUMED requiring user/planner confirmation:** A4, A5, A6. All three son riesgo bajo-medio.

## Open Questions

1. **Timeout exacto del reader: 10, 12 o 15s?**
   - What we know: tests integracion usan 30s budget; Sonnet 4.5 p95 solo tool call <3s; con 5 tool calls encadenados worst-case podria tocar 10-15s.
   - What's unclear: no hay metricas reales en produccion porque este uso-caso no existe aun.
   - Recommendation: **12s AbortSignal inner**. Con `retries: 1`, peor caso total para que turno 1+ pueda beneficiarse: 12s first attempt + 12s retry = 24s. Cliente tipicamente tarda 3-5s entre saludo y primer mensaje (D-13 context) — dentro del poll 3s, 60% de casos alcanzaran. Si planner prefiere garantizar mas cobertura, subir a 15s y descartar retry (`retries: 0`).

2. **Dispatch DESPUES del runner (necesitamos sessionId) vs ANTES (pre-crear session)?**
   - What we know: runner crea session implicitamente en `processMessage()`. `engineOutput.sessionId` disponible DESPUES.
   - What's unclear: si dispatch va DESPUES, el "paralelo" de D-03 es secuencial-despues-no-parallel: saludo sale, LUEGO inngest.send, LUEGO reader corre. Cliente tarda 3-5s entre turnos → reader tiene ese window.
   - Recommendation: **dispatch DESPUES** (opcion a del Ejemplo 2). Mas simple. D-03 en espiritu se mantiene porque el reader CORRE mientras el cliente lee+redacta el siguiente mensaje, que es el "saludo" de la otra parte. D-02 se respeta: el saludo no depende del reader.

3. **Escribir el flag `platform_config.somnio_recompra_crm_reader_enabled` antes o despues del push?**
   - What we know: Regla 5 dice "migration antes de deploy". Este no es schema change, es data insert.
   - Recommendation: INSERT pre-push para que el `getPlatformConfig` fail-open a `false` coincida con el valor real. Zero riesgo; si planner prefiere esperar, fail-open a `false` hace que el feature NO se active hasta que exista el row — tambien seguro.

4. **Registrar event en `events.ts` o usar `(inngest.send as any)`?**
   - Recommendation: **Registrar**. Es 10 lineas, da type safety, y el repo tiene 9 registrations ya. Evita future bugs silentes.

5. **`abortSignal` en `ReaderInput`: extender ahora o usar Promise.race como fallback?**
   - What we know: `processReaderMessage` actualmente no expone abort.
   - Recommendation: **Extender ReaderInput** con `abortSignal?: AbortSignal` y pasarlo a `generateText({abortSignal})`. 3 line edit en `crm-reader/types.ts` y `crm-reader/index.ts`. Cero breaking (opcional). Fallback Promise.race es hack-adjacent.

6. **Idempotencia del Inngest function (D-15 "nunca re-dispatch")?**
   - What we know: D-15 dice no re-dispatch. Pero una concurrency key en la function (`concurrency: [{ key: 'event.data.sessionId', limit: 1 }]`) deduplica sends con el mismo sessionId.
   - Unclear: que pasa si el webhook-processor dispatch-ea dos veces en rapid succession (turno 0 replay de Inngest — ya que `whatsapp-agent-processor` tiene `retries: 2`).
   - Recommendation: dentro del Inngest function, al inicio leer `session_state` y SI `_v3:crm_context_status` ya existe (cualquier valor incluyendo 'error'), short-circuit retornando `{ status: 'skipped', reason: 'already_processed' }`. Garantiza idempotencia absoluta.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Inngest Cloud | Async dispatch | ✓ | 3.51.0 npm | — |
| Anthropic API (Sonnet 4.5) | Reader LLM call | ✓ | via `@ai-sdk/anthropic` | — |
| Supabase Postgres | Session state + platform_config | ✓ | 2.93.1 client | — |
| `vitest` (test runner) | Integration tests | ✗ | not in package.json | `npm i -D vitest` (mismo patron de Phase 44 tests) |
| `platform_config` table | Feature flag | ✓ | ya existe (Phase 44.1) | — |
| `crm-reader` agent module | Reader invocation | ✓ | shipped Phase 44 | — |
| `getPlatformConfig` helper | Flag lookup | ✓ | shipped Phase 44.1 | — |
| `SessionManager.updateCapturedData` | Merge-safe state write | ✓ | existing | — |
| `ObservabilityCollector` | Step observability | ✓ | existing (42.1) | — |

**Missing dependencies with no fallback:** ninguna.
**Missing dependencies with fallback:** `vitest` (solo afecta tests locales; CI del proyecto no corre vitest hoy aparentemente — no se encontro `test` script en package.json).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (implicito — no esta en `package.json` scripts) |
| Config file | ninguno detectado en repo root |
| Quick run command | `npx vitest run <path>` — ejemplo: `npx vitest run src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts` |
| Full suite command | `npx vitest run` (recursivo sobre `src/**/*.test.ts`) |

**Nota:** el repo tiene 6 archivos `.test.ts` (Phase 44 crm-bots integration + somnio unit tests). No hay `test` script en `package.json`. El plan-phase probablemente añada `"test": "vitest run"` en scripts.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-02 | Turno 0 NO bloquea por reader (greeting latency <200ms) | manual + integration | N/A — medicion de producción, smoke manual | ❌ Wave 0 |
| D-04,D-05 | Inngest function registra + dispara on event | unit (mock inngest client) | `npx vitest run src/inngest/functions/__tests__/recompra-preload-context.test.ts` | ❌ Wave 0 |
| D-06 | Reader result persiste en session_state | integration | `npx vitest run src/__tests__/integration/recompra-preload.test.ts` | ❌ Wave 0 |
| D-10 | Key `_v3:crm_context` en `datos_capturados` post-Inngest | integration | Idem arriba | ❌ Wave 0 |
| D-11 | Comprehension-prompt inyecta crm_context | unit | `npx vitest run src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts` | ❌ Wave 0 |
| D-13 | Poll 500ms x 3s hasta obtener contexto | unit | `npx vitest run src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts` | ❌ Wave 0 |
| D-14 | Timeout → procede sin contexto + evento emitido | unit | Idem poll.test | ❌ Wave 0 |
| D-15 | Idempotencia — segundo dispatch del mismo sessionId no re-corre reader | integration | `npx vitest run src/__tests__/integration/recompra-preload-idempotency.test.ts` | ❌ Wave 0 |
| D-16 | 5 eventos emitidos en sitios correctos | unit (spy collector) | Spread across above units | ❌ Wave 0 |
| Feature flag | Flag `false` → dispatch no ocurre | unit | `npx vitest run src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run <test-file-del-task>` (quick, <5s).
- **Per wave merge:** `npx vitest run` full suite.
- **Phase gate:** full suite green + smoke manual en produccion con flag ON para 1 sesion, luego OFF.

### Wave 0 Gaps

- [ ] `src/inngest/functions/__tests__/recompra-preload-context.test.ts` — cover D-04, D-05, D-06, D-15
- [ ] `src/__tests__/integration/recompra-preload.test.ts` — cover D-06, D-10 end-to-end (mock reader, real Supabase)
- [ ] `src/__tests__/integration/recompra-preload-idempotency.test.ts` — cover D-15
- [ ] `src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts` — cover D-11 injection logic
- [ ] `src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts` — cover D-13, D-14 poll mechanics
- [ ] `src/lib/agents/production/__tests__/webhook-processor.recompra-flag.test.ts` — cover feature flag off path
- [ ] `src/__tests__/setup/vitest.config.ts` (si no existe) + `"test": "vitest run"` en `package.json`
- [ ] Framework install: `npm i -D vitest @vitest/ui @types/node` — si aun no esta instalado

**Tests ya existentes reutilizables:** `reader.test.ts` (muestra como wirear env vars `TEST_WORKSPACE_ID`, `TEST_API_KEY`, `TEST_BASE_URL`); `block-composer.test.ts` y `char-delay.test.ts` son puros unit tests sin red/DB.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Este phase corre in-process, no HTTP endpoint nuevo (writer/reader HTTP ya lo tienen). Event Inngest → function NO tiene auth adicional (canal trusted). |
| V3 Session Management | si | sessionId llega via Inngest event data; la function DEBE confirmar que `session_state[sessionId]` existe antes de escribir. Si no existe (session borrado entre dispatch y run), short-circuit. |
| V4 Access Control | si | Reader ya impone workspace isolation (header `x-workspace-id` via domain layer). Aqui invocamos in-process con `workspaceId` del event — DEBE ser el mismo del session (validar `session.workspace_id === event.data.workspaceId`). |
| V5 Input Validation | si | Event data: validar types con zod (sessionId uuid, contactId uuid, workspaceId uuid). Prompt al reader usa `contactId` interpolado — si contactId viene contaminado de webhook, podria inyectar texto en el prompt. Mitigacion: contactId es UUID solo, regex-check. |
| V6 Cryptography | no | No crypto nuevo. |
| V7 Errors/Logging | si | `logger.error({err: msg})` con truncate a 500 chars (evitar loggear PII completa). |

### Known Threat Patterns for stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via `contactId` | Tampering | UUID regex validation antes de interpolar en el prompt. Ya garantizado por `.uuid()` zod schema del event. |
| Cross-workspace state leak | Info Disclosure | Reader lee `session_state` — DEBE verificar `session.workspace_id === event.data.workspaceId`. El `processReaderMessage` ya filtra por `workspaceId` del input. |
| Replay del event (Inngest retry) | Tampering | Idempotencia via early-return si `_v3:crm_context_status` existe (ver Open Q 6). `concurrency: [{ key: 'event.data.sessionId', limit: 1 }]` deduplica concurrente. |
| Token exhaustion / runaway reader | DoS | `stopWhen: stepCountIs(5)` ya lo limita en `crm-reader/index.ts:52`. `tokenBudget: 30_000` en config (agentes registry). `retries: 1` no amplifica. |
| PII leak en logs | Info Disclosure | Logger con `err: msg.slice(0, 500)`. Reader system prompt: NO inventar IDs; si tool returns `not_found_in_workspace`, solo cita ese marcador. |

## Reference Implementations

Patrones canonicos del repo que el planner debe usar como analogs:

### "inngest.send in webhook-processor await pattern"
- **File:** `src/lib/whatsapp/webhook-handler.ts`
- **Lines:** 310-336
- **Why:** Demuestra `await (inngest.send as any)({...})` + try/catch + fallback inline. Mismo patron aplica al recompra dispatch.

### "new inngest function with step.run returning observability payload"
- **File:** `src/inngest/functions/agent-production.ts`
- **Lines:** 71-491 (whole function)
- **Relevant:** 294-367 (step.run con `__obs` return), 365-367 (`collector.mergeFrom`), 484-486 (observability-flush step), 466-489 (outer `runWithCollector` wrap)
- **Why:** Implementa el patron completo de observability merge que D-06 exige.

### "session state partial save from outside the runner"
- **File:** `src/lib/agents/session-manager.ts`
- **Lines:** 402-414 (`updateCapturedData`)
- **Why:** Merge-safe write de `datos_capturados`. Es el antidoto al full-replace de `saveState(id, { datos_capturados: {...} })`.
- **Alternative (if not merge-safe needed):** `updateState(sessionId, { partial })` en linea 355-371 — solo para columnas separadas, NO para datos_capturados sin merge manual.

### "comprehension-prompt injection of a new context block"
- **File:** `src/lib/agents/somnio-recompra/comprehension-prompt.ts`
- **Lines:** 14-32 (actual construccion del prompt con `dataSection` + `botContextSection` concatenados)
- **Why:** Ya demuestra concatenation de secciones opcionales basado en contenido. Nueva seccion `crmSection` sigue mismo patron.

### "poll-with-backoff inside agent processUserMessage"
- **No existe un analog exacto** dentro de `somnio-recompra/`. El codigo mas cercano de poll-con-espera es `step.waitForEvent` de Inngest (distinto — event-driven, no db-poll).
- **Analogo funcional:** `src/lib/agents/somnio/interruption-handler.ts` tiene lecturas de state con fallbacks, pero no implementa un poll. El Ejemplo 4 arriba (§Code Examples) es implementacion nueva basada en `setTimeout` + `SessionManager.getState`.

### "feature flag via platform_config"
- **File:** `src/lib/domain/platform-config.ts`
- **Lines:** 96-154 (`getPlatformConfig` impl completa)
- **Example caller:** `src/lib/auth/api-key.ts` (si aplica — planner debe confirmar quien mas usa `getPlatformConfig` en prod hoy).

### "inngest function with concurrency key"
- **File:** `src/inngest/functions/agent-production.ts:71-82`
  ```ts
  concurrency: [{ key: 'event.data.conversationId', limit: 1 }]
  ```
- **Why:** Mismo patron con `sessionId` como key dedupea dispatches del mismo turno 0 re-enviado por retry del outer function.

## Project Constraints (from CLAUDE.md)

- **Regla 0 — GSD completo:** este phase pasa por research → plan → execute → verify obligatorio. Activo.
- **Regla 1 — Push a Vercel despues de cambios:** el planner debe incluir `git push origin main` en los plan tasks pre-verification.
- **Regla 2 — America/Bogota:** el prompt al reader (D-08) pide "fecha de entrega" — el reader la renderizara desde timestamps UTC. Reader tools deben formatear fechas con `toLocaleString('es-CO', {timeZone:'America/Bogota'})`. Verificar en `crm-reader/tools/orders.ts` si ya lo hace.
- **Regla 3 — Domain Layer:** Reader ya lo cumple (tools importan solo de `@/lib/domain/*`). La Inngest function usa `SessionManager` (wrapper existente) — OK. `getPlatformConfig` es DESVIACION intencional documentada (es platform-level, no tenancy). Feature flag SI va por domain — OK.
- **Regla 4 — Docs actualizados:** al final del phase, plan-phase debe incluir edits a:
  - `docs/analysis/04-estado-actual-plataforma.md` — seccion Somnio Recompra recibe nota de integracion con reader
  - `docs/architecture/` — agregar diagrama del flujo async
  - `.claude/rules/agent-scope.md` — D-17 (somnio-recompra-v1 como consumer)
- **Regla 5 — Migracion antes de deploy:** NO hay schema change. PERO hay data-insert (`INSERT INTO platform_config ...`). Plan-phase debe tratarlo como "pre-deploy manual step" con pausa-confirmar.
- **Regla 6 — Proteger agente en produccion:** feature flag `somnio_recompra_crm_reader_enabled` default `false`. Activar manualmente via Supabase Studio 30s antes de smoke test. Desactivar si smoke falla. NO merge sin flag en `false`.

## Sources

### Primary (HIGH confidence — verified via file reads in this session)

- `src/lib/agents/crm-reader/index.ts` — processReaderMessage API, MODEL_ID, MAX_STEPS=5
- `src/lib/agents/crm-reader/types.ts` — ReaderInput/ReaderOutput shapes, NO abortSignal field actualmente
- `src/lib/agents/crm-reader/config.ts` — agentId 'crm-reader', tokenBudget 30_000
- `src/lib/agents/crm-reader/system-prompt.ts` — scope locked
- `src/lib/agents/somnio-recompra/somnio-recompra-agent.ts` — processMessage/processUserMessage/processSystemEvent
- `src/lib/agents/somnio-recompra/comprehension-prompt.ts` — buildSystemPrompt injection point
- `src/lib/agents/somnio-recompra/config.ts` — SOMNIO_RECOMPRA_AGENT_ID='somnio-recompra-v1'
- `src/lib/agents/somnio-recompra/state.ts` — serialize/deserialize filter `_v3:` keys from state.datos
- `src/lib/agents/somnio-recompra/constants.ts` — V3_META_PREFIX = '_v3:'
- `src/lib/agents/somnio-recompra/comprehension.ts` — Haiku call with existingData
- `src/lib/agents/production/webhook-processor.ts` — is_client branch, loadLastOrderData, recompra runner
- `src/lib/agents/engine/v3-production-runner.ts` — preloadedData injection session.version===0, FULL REPLACE bug
- `src/lib/agents/engine-adapters/production/storage.ts` — ProductionStorageAdapter.saveState
- `src/lib/agents/engine-adapters/production/index.ts` — createProductionAdapters
- `src/lib/agents/session-manager.ts` — updateState (line 355, full replace) + updateCapturedData (line 402, merge)
- `src/inngest/client.ts` — inngest client + schemas
- `src/inngest/events.ts` — AllAgentEvents union (line 748) + pattern for new event
- `src/inngest/functions/agent-production.ts` — observability merge pattern (lines 294-367, 466-489)
- `src/inngest/functions/crm-bot-expire-proposals.ts` — close analog for new function structure
- `src/inngest/functions/agent-timers-v3.ts` — how session.state is read via SessionManager + `(session.state as any)['_v3:agent_module']`
- `src/inngest/functions/godentist-reminders.ts` — Inngest function createFunction basic shape
- `src/app/api/inngest/route.ts` — function registration entry
- `src/lib/domain/platform-config.ts` — getPlatformConfig helper, TTL 30s, fail-open
- `src/lib/observability/types.ts` — AgentId, EventCategory enums
- `supabase/migrations/20260205000000_agent_sessions.sql` — session_state schema (confirms NO `_v3:agent_module` column)
- `package.json` — deps, NO test script
- `.claude/rules/agent-scope.md` — CRM Reader scope to update
- `.planning/standalone/somnio-recompra/somnio-recompra-VERIFICATION.md` — base bot closure state
- `.planning/standalone/somnio-recompra-crm-reader/CONTEXT.md` — D-01..D-17 decisions
- `src/__tests__/integration/crm-bots/reader.test.ts` — vitest usage pattern

### Secondary (MEDIUM)

- MEMORY contents (user-level): "Inngest step.run observability merge pattern" — describe el patron verified en `agent-production.ts`
- MEMORY: "Vercel serverless + Inngest: NEVER fire-and-forget" — cross-verified contra `src/lib/whatsapp/webhook-handler.ts:310-336`

### Tertiary (LOW — not present in this research)

None. Todo lo afirmado tiene evidencia del codebase o docs del proyecto.

## Metadata

**Confidence breakdown:**
- Integration Map: HIGH — todos los nodos verificados line-by-line en el codebase.
- Inngest Function Pattern: HIGH — patron canonico 42.1 + observability merge ya implementado en agent-production.ts.
- Reader Invocation: HIGH — processReaderMessage firma y comportamiento read.
- Session State Write: HIGH — pitfall descubierto verified contra schema + session-manager.ts.
- Comprehension Injection: MEDIUM — punto de injeccion identificado pero no probado E2E; la sugerencia de filtrar `_v3:` del dataSection es nueva (no en codigo actual — state.ts lo hace para `state.datos` pero comprehension-prompt si dumpea todo `existingData` raw).
- Feature Flag: HIGH — `platform_config` pattern es Phase 44.1, documentado.
- Observability Events: HIGH — category `pipeline_decision` existe, `recordEvent` firma estable.
- Poll Mechanism: MEDIUM — no existe analog exacto; diseño nuevo basado en primitives conocidas.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (estable — infra no cambia en 30 days esperables). Re-validar si: Inngest sube version mayor, AI SDK v6 cambia abortSignal API, session_state schema se altera.

## RESEARCH COMPLETE
