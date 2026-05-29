# Somnio Sales v4 — Arquitectura

> **Audiencia:** un dev que nunca vio v4 y necesita entender cómo entra un mensaje,
> cómo se procesa un turno, cómo se genera y envía la respuesta, y qué falta para
> activarlo en producción.
>
> **Estado al 2026-05-28:** v4 está **DORMANT** en producción (0 workspaces). Toda
> la infraestructura está cableada (runner, timers, crons, observabilidad,
> interrupción) pero ningún workspace lo tiene activo. Se activa por workspace con
> un solo `UPDATE` (§13).
>
> **Cómo verificar este doc:** cada afirmación tiene su `archivo:línea`. Si algo no
> cuadra con el código, el código manda — abrí el archivo y avisá.
>
> **Documentos hermanos:**
> - `INTERRUPTION-PARITY.md` (este directorio) — sistema de interrupción prod↔sandbox.
>   Este doc lo **referencia**, no lo repite (§11).
> - `../somnio-v3/ARCHITECTURE.md` — el agente v3 del que v4 clonó la state machine.

---

## 0. TL;DR — qué es v4 y en qué se diferencia de v3

v4 es el sucesor de `somnio-sales-v3`: el mismo agente de ventas de Somnio (ELIXIR
DEL SUEÑO) por WhatsApp, con **tres cosas nuevas**:

1. **Sub-loop RAG generativo** — cuando la state machine determinista no sabe qué
   responder (baja confianza, divagación, mutación CRM), escala a un sub-loop que
   busca en una **knowledge base vectorial** y **redacta** una respuesta con un LLM
   (no enlatada). Reemplaza el catálogo de templates "respuesta canónica verbatim".
2. **Sistema de interrupción atómico** (Redis lock + checkpoints) — si el cliente
   manda varios mensajes seguidos mientras el bot responde, se combinan/reprocesan
   sin pisarse. v3 usa el polling de Phase 31; v4 usa `interruption-system-v2`.
3. **Observation loop** — los casos que el sub-loop no resuelve se capturan en
   `agent_unknown_cases`, se clusterizan a diario, y alimentan mejoras de la KB.

| Aspecto | v3 | v4 |
|---|---|---|
| Comprehension | Claude Haiku | **Gemini 2.5 Flash** (`comprehension.ts:86`) |
| Respuesta "no template" | catálogo verbatim | **RAG generativo** (sub-loop, §2.4) |
| Interrupción | Phase 31 DB-poll | **Redis lock + 8 checkpoints** (§11) |
| Registry mapping | `'somnio-sales-v3'` → bucket `'somnio-v3'` | `'somnio-sales-v4'` → bucket propio (`registry-helpers.ts:47`) |
| Runner de prod | `v3-production-runner.ts` (compartido) | `engine/v4-production-runner.ts` (dedicado) |
| Prefijo de sesión | `_v3:` | **`_v4:`** (`constants.ts:179`) |
| Mutations CRM | adapters legacy | **crm-mutation-tools** inline (`invocations.ts`) |
| Scope | configurable por workspace | **hardcodeado** a Somnio (`config.ts:12`) |

v4 hereda **verbatim** de v3 (clone mecánico, D-24): la state machine
(`transitions.ts`), state merge (`state.ts`), sales-track / response-track, gates,
timers. Lo nuevo vive en `sub-loop/`, `knowledge*/`, `unknown-cases/`,
`comprehension.ts` (cambio de modelo) y el runner.

---

## 1. Mapa de archivos

### `src/lib/agents/somnio-v4/`

| Archivo | Responsabilidad |
|---|---|
| `somnio-v4-agent.ts` (1008) | **Orquestador del turno.** `processMessage` → `processUserMessage` / `processSystemEvent`. 15 pasos. CKPT-1/CKPT-2. `mapOutcomeToAgentOutput`. |
| `comprehension.ts` (203) | Capa 2. `comprehend()` — Gemini 2.5 Flash + `Output.object` + parser resiliente. |
| `comprehension-prompt.ts` (290) | System prompt de comprehension. |
| `comprehension-schema.ts` (109) | `MessageAnalysisSchema` (Zod): intent + extracted_fields + classification + negations + `intent_confidence`. |
| `state.ts` (401) | Capa 3+5. `mergeAnalysis`, `computeGates`, `serializeState`/`deserializeState` (prefijo `_v4:`). |
| `transitions.ts` (483) | State machine determinista (`resolveTransition`, `systemEventToKey`). |
| `sales-track.ts` (223) | `resolveSalesTrack` — QUÉ hacer (acción + flags). |
| `response-track.ts` (416) | `resolveResponseTrack` — QUÉ decir (resuelve templates vía `TemplateManager`). |
| `guards.ts` | Guards R0/R1 (escape intents → handoff). |
| `escalation.ts` (65) | `decideSubLoopReason` — decide si escalar al sub-loop y con qué reason. |
| `threshold.ts` | `getLowConfidenceThreshold` — lee `platform_config`. |
| `phase.ts` | `derivePhase` — fase desde acciones ejecutadas. |
| `invocations.ts` (283) | `executeInvocations` — 4 mutations CRM no-createOrder inline vía crm-mutation-tools. |
| `delivery-zones.ts` (139) | Lookup de zona de entrega por ciudad (tiempo estimado). |
| `config.ts` (93) | `somnioV4Config`, `SOMNIO_V4_AGENT_ID`, `SOMNIO_WORKSPACE_ID`. |
| `constants.ts` (226) | Intents (22), fields críticos, ACTION_TEMPLATE_MAP, timers, prefijo `_v4:`. |
| `types.ts` (403) | `AgentState`, `V4AgentInput/Output`, `TipoAccion`, `Invocation`. |
| `engine-v4.ts` (730) | **Engine del sandbox.** `SomnioV4Engine.processMessage` + restart loop + CKPT sintéticos + stream `onMessage`. |
| `index.ts` (29) | Self-registra `somnioV4Config` en `agentRegistry` al importar. |
| `INTERRUPTION-PARITY.md` | Contrato de paridad del sistema de interrupción (§11). |

### `src/lib/agents/somnio-v4/sub-loop/`

| Archivo | Responsabilidad |
|---|---|
| `index.ts` (914) | `runSubLoop` → `runRagSubLoop` (3 calls) o `runLegacySubLoop` (1 call). CKPT-3/4/5. |
| `tooling-call.ts` (250) | RAG **Call 1** — GPT-4.1-mini + `kb_search` → selecciona topic + material. 1 retry transitorio. |
| `generation-call.ts` (84) | RAG **Call 2** — Gemini 2.5 Flash temp 0.3, SIN tools → redacta `responseText` + `responseConfidence` + `binary`. |
| `compliance-check.ts` (216) | RAG **Call 3** — Gemini 2.5 Flash verifier (nunca-decir + escalation). |
| `kb-search-tool.ts` (139) | Tool `kb_search` → RPC `match_knowledge_base` (pgvector, top-3). |
| `output-schema.ts` (154) | `LoopOutcomeSchema` (flat) + `validateLoopOutcomeInvariants` + `SubLoopReason`. |
| `prompt.ts` (283) | `buildToolingPrompt`, `buildGenerationPrompt`. |
| `tools.ts` | `buildSubLoopTools` — tool dict por reason (path legacy). |
| `tone-base.ts` | Tono Somnio base para la generación. |
| `few-shots.ts` (184) | Few-shots de calibración de `responseConfidence` + `binary`. |
| `safe-output.ts` | `safeAccessOutput` — wrapper anti `AI_NoOutputGeneratedError`. |
| `debug-payload.ts` (125) | `SubLoopDebugPayload` — telemetría para el Sub-Loop tab del sandbox. |

### `src/lib/agents/somnio-v4/knowledge-base/` (infra) + `knowledge/` (contenido)

| Archivo | Responsabilidad |
|---|---|
| `knowledge-base/parser.ts` (174) | Parsea `.md` → frontmatter (Zod) + 5 secciones. |
| `knowledge-base/sync.ts` (102) | `syncKbDoc` → upsert a `agent_knowledge_base` (hash SHA-256 skip). |
| `knowledge-base/embed.ts` (43) | `generateEmbedding` — OpenAI `text-embedding-3-small` 1536-dim. |
| `knowledge-base/coherence-check.ts` | Valida coherencia frontmatter↔secciones por categoría. |
| `knowledge/{product,policies,edge-cases,faqs-no-templated}/*.md` (18 docs) | Material fuente del RAG. |

### `src/lib/agents/somnio-v4/unknown-cases/`

| Archivo | Responsabilidad |
|---|---|
| `capture.ts` (91) | `captureUnknownCase` → insert en `agent_unknown_cases` con PII-redaction + embedding. Fire-and-forget. |
| `cluster.ts` | `clusterUnknownCases` — agrupa casos pendientes (cron diario). |
| `redact.ts` | `redactPii` — redacta PII antes de embedding/persistencia. |

### Fuera del directorio (parte del runtime de v4)

| Archivo | Rol |
|---|---|
| `engine/v4-production-runner.ts` (~59KB) | **Runner de producción.** `V4ProductionRunner.processMessage`: restart loop + CKPT-0/6a/6b + envío + release del lock. |
| `engine-adapters/production/v4-messaging-adapter.ts` (185) | `V4MessagingAdapter extends ProductionMessagingAdapter`. CKPT-7.N + `onFirstSendCompleted` + `LostLockError`. |
| `engine-adapters/production/messaging.ts` | Adapter base. `send()` envía templates; **dropea si no hay templates** (`:159-161`). |
| `inngest/functions/agent-production.ts` | `whatsappAgentProcessor` — consume el evento, llama al runner. |
| `inngest/functions/agent-timers-v4.ts` | Timers v4 (evento `agent/v4.timer.started`). |
| `inngest/functions/unknown-cases-cluster-v4.ts` | Cron diario 04:00 Bogota (flag `somnio_v4_kb_sync_enabled`). |
| `inngest/functions/knowledge-sync-v4.ts` | Sync de la KB post-deploy (mismo flag). |
| `whatsapp/webhook-handler.ts` | Entrada WhatsApp + resolución de agente + adquisición de lock + dispatch. |
| `agents/registry-helpers.ts` | `resolveAgentIdForWorkspace`. |

---

## 2. Pipeline del turno

### 2.0 Diagrama de alto nivel

```
WhatsApp inbound (360dialog / Onurix)
 │
 ▼ webhook-handler.ts: processIncomingMessage
 ├─ resolveAgentIdForWorkspace(workspaceId) === 'somnio-sales-v4'   [registry-helpers.ts:47]
 ├─ v4Path = true → acquireLock (HOLDER | FOLLOWER) + pushToPending  [§11]
 │     FOLLOWER → set interrupt key + RETURN (sin Inngest)
 └─ HOLDER → inngest.send('agent/whatsapp.message_received', { …+6 lock fields })
       │
       ▼ agent-production.ts: whatsappAgentProcessor (concurrency 1 por conversationId)
       └─ V4ProductionRunner.processMessage(EngineInput)               [v4-production-runner.ts]
            │
            ▼ while (shouldRestart):                                    ← restart loop (§11)
            │   CKPT-0  ── post-acquire
            │   processMessage(V4AgentInput)  ───────────────────────►  somnio-v4-agent.ts
            │   │   1. deserializeState
            │   │   2. comprehend()            (Gemini 2.5 Flash)
            │   │      CKPT-1  ── post-comprehension
            │   │   3. mergeAnalysis → 4. computeGates → 5. threshold
            │   │   6. decideSubLoopReason()
            │   │        low_confidence | razonamiento_libre → runSubLoop ──► §2.4 (RAG)
            │   │   7. checkGuards()  (R0/R1 → handoff)
            │   │      CKPT-2  ── post-state-machine
            │   │   8. resolveSalesTrack()     (state machine — QUÉ hacer)
            │   │   9. executeInvocations()    (4 mutations CRM; CAS reject → runSubLoop)
            │   │  10. createOrder inline (shouldCreateOrder)
            │   │  11. resolveResponseTrack()  (templates — QUÉ decir)
            │   │  → V4AgentOutput { messages[], templates?[], … }
            │   │
            │   CKPT-6a / CKPT-6b ── pre-send
            │   ── ENVÍO ──
            │      output.templates? → messaging.send(templates)  ✅ enviado
            │      else output.messages → messaging.send(SIN templates) → ⚠️ DROP (§10, §4)
            └─ finally: releaseLockIfOwner
```

### 2.1 Entrada y orquestación

`processUserMessage` (`somnio-v4-agent.ts:92`) corre dentro de un `try/catch` que,
ante cualquier excepción, devuelve `success:false` + `errorMessage` con stack
(`:689-710`) preservando el estado de entrada (no se pierde sesión).

Timers entran por `processSystemEvent` (`:717`) — **sin comprehension, sin
mergeAnalysis, sin guards**: van directo a `resolveSalesTrack` con el evento
`timer_expired` (§6).

### 2.2 Comprehension (Capa 2)

`comprehend()` (`comprehension.ts:64`) hace **una** llamada a
`google('gemini-2.5-flash')` (`:86`) con `Output.object({ schema: MessageAnalysisSchema })`
y `safetySettings: BLOCK_NONE x4` (`:90-99`) — sin BLOCK_NONE, Gemini bloquea
silenciosamente menciones de "alcohol"/"embarazo"/"anticoagulantes" y tira
`NoOutputGeneratedError` con `finishReason='SAFETY'`.

Salida (`comprehension-schema.ts`): `intent` (primary/secondary + `confidence` 0-100
legacy + **`intent_confidence` 0..1**), `extracted_fields` (10 campos de cliente +
pack + flags), `classification` (category/sentiment), `negations`.

Parser resiliente (`parseAnalysis`, `:169`): si Gemini emite un intent fuera del
enum de 22 (`constants.ts:16`), lo mapea a `'otro'` (sumidero D-69) en vez de fallar.

> **Deuda P1-3** (§12): comprehension NO tiene fallback de modelo. Si Gemini está
> saturado ("high demand"), los 3 retries del AI SDK fallan → el turno muere con
> `AI_RetryError`. No impacta hoy porque v4 está DORMANT.

### 2.3 State machine determinista (sales-track / response-track)

Patrón **two-track** heredado de v3: la state machine decide **QUÉ hacer** (acción)
y un motor de templates decide separadamente **QUÉ decir**.

- **`mergeAnalysis`** (`state.ts:87`) mergea los datos extraídos en `AgentState`
  (nunca pisa un valor con null), normaliza teléfono/ciudad, infiere departamento,
  incrementa `turnCount`, y computa `StateChanges` (campos nuevos, "datos críticos
  recién completados", señales ofi-inter).
- **`computeGates`** (`state.ts:204`) calcula `datosCriticos` / `datosCompletos` /
  `packElegido` — recalculados cada turno, nunca persistidos.
- **`resolveSalesTrack`** (`sales-track.ts:37`): 1) timer event → tabla de
  transición; 2) auto-trigger por datos completos → `ofrecer_promos`; 3) intent →
  tabla de transición; 4) fallback → sin acción (response-track maneja informational).
  Devuelve `{ accion, secondarySalesAction, enterCaptura, timerSignal, reason }`.
- **`resolveResponseTrack`** (`response-track.ts:43`): combina dos fuentes de
  templates — los de la acción de venta (CORE) y los informacionales del intent
  (COMPLEMENTARIA) — vía `TemplateManager` filtrado por `SOMNIO_V4_AGENT_ID`
  (`:129`). Catálogo de templates aislado por `agent_id='somnio-sales-v4'`.
  **Output vacío = silencio natural** (`:114`).

Acciones posibles: `TipoAccion` en `types.ts:292` (ofrecer_promos,
mostrar_confirmacion, pedir_datos, crear_orden*, ask_ofi_inter, retoma*, etc.).

### 2.4 Sub-loop RAG generativo

El sub-loop es el corazón nuevo de v4. Se dispara cuando `decideSubLoopReason`
(`escalation.ts:49`) devuelve un reason (orden de prioridad):

1. `cas_reject` — `moveOrderToStage` devolvió `stage_changed_concurrently`.
2. `crm_mutation` — **MUERTO HOY (D-10).** El reason existe en `decideSubLoopReason`,
   pero su disparador `isCrmMutation` está **hardcoded `false`** en
   `somnio-v4-agent.ts:225`, así que esta rama NUNCA se alcanza en V1. El CRM real de
   v4 hoy es **determinista inline** (`shouldCreateOrder` → runner; invocations
   come-back skipeadas, §12 deferred). Consolidar el CRM al sub-loop (que la transición
   produzca mutaciones grounded vía el orquestador) es el **standalone #2** del roadmap
   v4 — el Turn Ledger (§5.3) ya anticipa su shape (`CrmActionRegistrada` con
   `args`/`result`/`origen`, D-04/D-08) para recibirlo sin re-trabajo.
3. `razonamiento_libre` — `intent === 'razonamiento_libre' || 'otro'`.
4. `low_confidence` — `intent_confidence < threshold` (de `platform_config`).

`runSubLoop` (`sub-loop/index.ts:250`) hace **switch por reason**:

- **`crm_mutation` / `cas_reject` → `runLegacySubLoop`** (`:724`): UNA llamada
  `generateText` con **GPT-4o-mini** (`:734`) + tools + `Output.object(LoopOutcomeSchema)`.
  Outcomes: `template` (apunta a un intent del catálogo) o `no_match` (handoff).
  En la práctica solo `cas_reject` entra aquí hoy — `crm_mutation` está muerto
  (`isCrmMutation=false`, ver arriba).
- **`low_confidence` / `razonamiento_libre` → `runRagSubLoop`** (`:264`): pipeline
  de **3 llamadas**:

```
runRagSubLoop
 │
 ├─ CALL 1 — Tooling  (tooling-call.ts)
 │    Modelo: GPT-4.1-mini  [tooling-call.ts:157]   (swap desde gpt-4o-mini, Plan 09 iter 3)
 │    Tool:   kb_search → RPC match_knowledge_base (pgvector top-3)
 │    Salida: { should_handoff, topic_seleccionado, material_del_topic, handoff_reason }
 │    1 retry automático en errores transitorios (429/503/NoOutputGenerated)
 │    CKPT-3 ── post-tooling
 │    si should_handoff || sin material → no_match (handoff)
 │
 ├─ CALL 2 — Generation  (generation-call.ts)
 │    Modelo: Gemini 2.5 Flash, temp 0.3, SIN tools  [generation-call.ts:57]
 │    Insumo: SOLO material_del_topic (hechos/posición/debe-contener)
 │    Salida: { responseText, responseConfidence (0..1), confidenceRationale, binary }
 │    CKPT-4 ── post-generation
 │    si responseConfidence < 0.70 (D-19)         → handoff  [index.ts:413]
 │    si binary ∈ {FALTA_INFO, FUERA_SCOPE} (M3)  → handoff  [index.ts:426]
 │
 ├─ CALL 3 — Compliance  (compliance-check.ts)
 │    Modelo: Gemini 2.5 Flash (verifier independiente)  [compliance-check.ts:91]
 │    Evalúa 2 dimensiones sobre responseText:
 │      D1 nunca-decir (polarity-aware: AFFIRMS/NEGATES/REDIRECTS/NEUTRAL)
 │      D2 escalation  (direct match + "escalation evasion")
 │    early-return sin tokens si ambos arrays vacíos  [compliance-check.ts:73]
 │    CKPT-5 ── post-compliance
 │    si nunca_decir violado || escalation trigger  → handoff
 │
 └─ SUCCESS → LoopOutcome { status:'generated', responseText, sourceTopic, responseConfidence }
```

**Threshold de confianza = 0.70** (`RESPONSE_CONFIDENCE_THRESHOLD`, `index.ts:42`).
El **M3 binary backstop** es un enum auto-reportado (`RESPONDE_BIEN | FALTA_INFO |
FUERA_SCOPE`) que dispara handoff independiente del número, porque el modelo a
veces reporta confianza alta sobre material incompleto.

**Handoff silencioso:** todo handoff devuelve `status:'no_match'` +
`requiresHuman:true` (`output-schema.ts:142` invariantes). El orquestador lo mapea a
`newMode:'handoff'` + `requiresHuman:true` (`somnio-v4-agent.ts:919`), **sin mensaje
al cliente** — un operador toma la conversación. Antes de eso, se captura el caso en
`agent_unknown_cases` (§8) para mejorar la KB.

**Aislamiento de keys OpenAI:** el sub-loop usa `OPENAI_API_KEY_SALESV4`
(`tooling-call.ts:67`), separada de la `OPENAI_API_KEY` legacy (KB sync, scopes
restringidos). El embed (`embed.ts:21`) prueba `_SALESV4` primero, luego la legacy.

#### Tabla de modelos (código real)

| Etapa | Modelo | Archivo:línea |
|---|---|---|
| Comprehension | `gemini-2.5-flash` | `comprehension.ts:86` |
| Sub-loop RAG · tooling (Call 1) | `gpt-4.1-mini` | `tooling-call.ts:157` |
| Sub-loop RAG · generation (Call 2) | `gemini-2.5-flash` (temp 0.3) | `generation-call.ts:57` |
| Sub-loop RAG · compliance (Call 3) | `gemini-2.5-flash` | `compliance-check.ts:91` |
| Sub-loop **legacy** (crm_mutation/cas_reject) | `gpt-4o-mini` | `index.ts:734` |
| Embeddings (KB + unknown-cases) | `text-embedding-3-small` (1536) | `embed.ts:38` |

> **Nota de consistencia:** el path RAG usa `gpt-4.1-mini` (swap empírico Plan 09
> iter 3 — `gpt-4o-mini` fallaba 78.7% el combo tools+Output.object, `gpt-4.1-mini`
> 0%); el path **legacy** sigue en `gpt-4o-mini`. Son dos paths reales y distintos.
> Estos modelos son los que el código usa hoy; los docstrings se alinearon a esto.

---

## 3. Knowledge base / RAG

### 3.1 Estructura del contenido

18 documentos `.md` en `knowledge/` organizados en 4 categorías:
`product/` (7), `policies/` (3), `edge-cases/` (5), `faqs-no-templated/` (3).

Cada doc tiene **frontmatter** (Zod `FrontmatterSchema`, `parser.ts:18`) con `topic`,
`keywords`, `category`, `last_reviewed`, `reviewed_by`, `scope_summary` opcional,
`tone_override` opcional — y un **body con 5 secciones** (`parser.ts:96`):

| Header markdown | Campo | Uso |
|---|---|---|
| `## Hechos del producto` | `hechosDelProducto` (string) | material verbatim para la generación |
| `## Posición del negocio` | `posicionDelNegocio` (string) | postura comercial |
| `## Debe contener la respuesta` | `debeContener` (string[]) | checklist de cobertura |
| `## NUNCA decir` | `nuncaDecir` (string[]) | reglas para el compliance-check D1 |
| `## Cuándo escalar a humano` | `cuandoEscalar` (string[]) | triggers para compliance-check D2 |

Headers viejos (`Respuesta canónica`, `Si el cliente insiste`, `Sources`) se ignoran
silenciosamente — **el modo canonical-verbatim quedó deprecado** (RAG-generative).

### 3.2 Sync e indexado

`syncKbDoc` (`sync.ts:31`) parsea, corre `coherenceCheck`, y hace upsert en
`agent_knowledge_base` con `onConflict: 'topic,agent_id,workspace_id'`. Computa
SHA-256 del contenido (`scope_summary` + body) y **salta regenerar el embedding** si
el hash no cambió (`:58`). `canonical_response = null` para v4 (`:75` — la columna
queda por backwards-compat con otros agentes).

El embedding se genera sobre `scope_summary + body` (`:42`) — prependear el
`scope_summary` sube el match cuando el cliente usa términos que están en el resumen
pero no en el body literal.

Disparado por la Inngest function `knowledge-sync-v4` (post-deploy, gated por flag
`somnio_v4_kb_sync_enabled`).

### 3.3 kb_search (retrieval)

`kbSearchTool` (`kb-search-tool.ts:67`) es el tool que el Call 1 del sub-loop invoca:

1. `generateEmbedding(query)` (1536-dim).
2. `supabase.rpc('match_knowledge_base', { p_workspace_id, p_agent_id, p_query_embedding, p_category: null, p_limit: 3 })` (`:88`).
3. Mapea filas → `KbHit[]` con `similarity = 1 - distance` (cosine) (`:116`).

`p_category` siempre `null` (`:92`) — escanea **todas** las categorías; el ranking
top-3 por similarity filtra. (Iter 7i: pasar categoría confundía al modelo, que
filtraba topics relevantes de otra categoría.)

Si la RPC falla, **propaga el error** (`:104`) — el sub-loop lo convierte en
`no_match` (handoff). No hay fallback a SELECT directo (el índice HNSW se usa vía RPC).

### 3.4 Material → respuesta redactada

La clave del RAG generativo: el Call 1 selecciona **un** topic ganador y emite su
`material_del_topic` (hechos + posición + debe-contener + nunca-decir +
cuándo-escalar). El Call 2 (Gemini Flash) **redacta** `responseText` usando **solo**
ese material como insumo — no copia verbatim, adapta al mensaje del cliente — y
auto-reporta `responseConfidence`. El Call 3 verifica que no violó nunca-decir y que
el caso no requería escalación. Si pasa los tres gates, `responseText` es la respuesta.

---

## 4. Respuesta y envío

v4 produce respuestas por **dos vías distintas**:

1. **Templates** (path determinista): `resolveResponseTrack` devuelve
   `ProcessedMessage[]`; el orquestador los pone en `V4AgentOutput.templates`
   (`somnio-v4-agent.ts:632`) y también su contenido en `messages` (`:631`).
2. **Texto generativo** (path RAG): `mapOutcomeToAgentOutput` pone el
   `responseText` en `messages: [outcome.responseText]` **sin** `templates`
   (`somnio-v4-agent.ts:947-949`).

### 4.1 Envío en producción

`V4ProductionRunner` envía vía `this.adapters.messaging.send(...)`:

- **Con templates** (`v4-production-runner.ts:720-903`): pasa `templates:[...]`,
  aplica el filtro no-repetición opcional (`USE_NO_REPETITION_V4`), y maneja la
  interrupción per-template (CKPT-7.N vía `V4MessagingAdapter`, §11).
- **Sin templates** (`v4-production-runner.ts:904-916`): fallback que llama
  `messaging.send({ messages: output.messages })` **sin** `templates`.

`V4MessagingAdapter` extiende `ProductionMessagingAdapter`
(`v4-messaging-adapter.ts:53`) y override:
- `shouldAbortBeforeTemplate` → checkpoint Redis `ckpt_7_pre_template` (`:78`).
- `onFirstSendCompleted` → LREM-self del pending + flip `has_sent_anything` (`:129`).
- `LostLockError` → zombie defense (propaga al outer catch del runner).

### 4.2 ⚠️ GAP CRÍTICO — el texto generativo no se envía en producción

**El path RAG generativo funciona end-to-end pero su respuesta NO se entrega a
WhatsApp en producción.** Es el **último cable que falta para activar v4 con RAG**
(standalone `somnio-v4-rag-generative`, en progreso).

Cadena del gap (verificada en código):

1. El sub-loop exitoso devuelve `messages:[responseText]`, `templates:undefined`
   (`somnio-v4-agent.ts:947-949`).
2. El runner cae al fallback sin-templates y llama `messaging.send({ messages })`
   sin campo `templates` (`v4-production-runner.ts:904-916`).
3. `ProductionMessagingAdapter.send` tiene el gate:
   `if (!templates || templates.length === 0) { return { messagesSent: 0 } }`
   (`messaging.ts:159-161`) → **nada se envía**.
4. Peor: `sentMessageContents.push(...output.messages)` (`v4-production-runner.ts:915`)
   → el texto **queda registrado** en el turno de la sesión aunque el cliente nunca
   lo recibió (el log de la conversación miente).
5. El fallback además **no tiene CKPT-6b ni manejo de interrupción** (a diferencia
   del path de templates).

**Asimetría con el sandbox:** el engine del sandbox SÍ muestra el texto generativo —
itera `output.messages` y los stremea con `onMessage` (`engine-v4.ts:385-484`). Por
eso un smoke en `/sandbox` parece funcionar mientras producción quedaría muda.

Esto también está documentado como caveat en `INTERRUPTION-PARITY.md §6`.

**Para cerrar el gap** (dos opciones de diseño):
- (a) Convertir el `responseText` generativo en un `ProcessedMessage` a nivel del
  agente para que viaje por el path de templates (gana CKPT-6b + interrupción), o
- (b) Wirear un envío real en el fallback (`messaging.ts` aceptaría `messages`
  cuando no hay `templates`) + replicar el manejo de interrupción.

---

## 5. Estado y persistencia

`AgentState` (`types.ts:42`): `datos` (10 campos), `pack`, `ofiInter`, `negaciones`,
`intentsVistos`, `accionesEjecutadas`, `templatesMostrados`, `enCapturaSilenciosa`,
`turnCount`.

### 5.1 Serialización a `session_state` (producción)

`serializeState` (`state.ts:287`) aplana a `datosCapturados: Record<string,string>`:
- Campos de cliente directos (`nombre`, `ciudad`, …).
- Metadata v4 con **prefijo `_v4:`** (`constants.ts:179`):
  `_v4:ofiInter`, `_v4:enCaptura`, `_v4:turnCount`, `_v4:neg_*`.
- `pack` → `packSeleccionado`; `templatesMostrados` → `templatesEnviados`;
  `accionesEjecutadas` como campo first-class (quick-009).

`deserializeState` (`state.ts:326`) hace lo inverso, **filtrando** las claves `_v4:`
de `datos` (`:337`) y con backward-compat para `accionesEjecutadas` que antes vivía
dentro de `datosCapturados` (`:362`).

> **Aislamiento v3↔v4 (D-30):** v3 usa `_v3:`, v4 usa `_v4:`. Ambos prefijos pueden
> coexistir en la misma `session_state.datos_capturados` sin colisión. Esto importa
> porque la tabla de sesiones es compartida.

### 5.2 SandboxState (sandbox)

El sandbox no persiste en DB: `engine-v4.ts` devuelve `SandboxState` en memoria
(`engine-v4.ts:494`) — `currentMode`, `intentsVistos`, `templatesEnviados`,
`datosCapturados`, `packSeleccionado`, `accionesEjecutadas`, `turnLedgerDims`. El
mapeo conceptual es idéntico, solo cambia el sink (memoria vs Supabase).

### 5.3 Turn Ledger (standalone `somnio-v4-turn-ledger`)

El **Unified Turn Ledger** registra de forma estructurada TODO lo que un turno
"atendió" y todo efecto CRM, para que turnos FUTUROS tengan coherencia (D-06) y para
que la observabilidad sea queryable cross-sesión (D-13). Tipos en `types.ts:351-407`.

**`TurnLedger` (registro COMPLETO, en memoria):** lo construye el agente DESPUÉS de
decidir (D-12) y contiene:

- `comprehension` — `{intent, secondary?, confidence}`.
- `atendido: Atendido[]` — discriminated union por `kind` (5 variantes:
  `template_intent` / `sales_action` / `kb_topic` / `handoff` / `silence`; D-15: un
  silencio deliberado SÍ se registra).
- `crmActions: CrmActionRegistrada[]` — `{tool, args, result, code?, origen, stageAtTime?}`.
- `modeTransition?: {from, to}` y `messagesSent` — campos del turno NO persistidos.

**`TurnLedgerDims` (subset PERSISTIDO):** SOLO `{atendido, crmActions}` (D-17). Es la
distinción central: el ledger completo vive en memoria, pero a `session_state.
turn_ledger_dims` (columna `jsonb`, migración Plan 02) solo va el subset que el turno
siguiente necesita para coherencia. `modeTransition`/`confidence`/`messagesSent`/`intent`
NO se persisten — se EMITEN a observability (ver abajo). Ningún campo queda fantasma.

**Commit único (D-11/D-17):** `commitTurn(workingState, ledger)` (`state.ts:468`) es
el ÚNICO punto que funde el working state final con las dims persistibles. Envuelve
`serializeState` (NO lo reimplementa) y añade `turnLedgerDims` con defensas: texto de
`kb_topic` truncado a 500 chars (T-ledger-01) + phone/email en `crmActions.args`
redactados (T-ledger-02). El agente lo invoca en los **7 commit-paths reales**
(R1 guard / R2 silence / R3 happy / R4 no_match / R5 generated = FIX D-05 que registra
el `kb_topic` atendido / R6 template / R10 timer). Los **3 no-commit paths**
(R7/R8/R9 — interrupt/error, D-07) descartan el turno y NO commitean: hacen passthrough
de `input.turnLedgerDims` para no perder el ledger del turno previo.

**Wiring runner + sandbox (Plan 04, paridad P4):** `v4-production-runner.ts` y
`engine-v4.ts` restauran `turn_ledger_dims` al construir el input, lo arrastran en
`carryState` para que un reprocess Path B no pierda ni re-registre efectos (P3,
verificado en `state.test.ts` + precedente E10 en `engine-v4-lock.test.ts:746`), y lo
persisten SOLO en PATH B (Path A descarta el turno, P6).

**Emisión a observability (D-17b):** post-commit (PATH B) el runner emite 3 eventos
que consumen los campos NO persistidos del ledger completo:
`kb_topic_registered` (`{topic, confidence, turno}`), `crm_action_recorded`
(`{tool, result, origen, code?}` — args redactados, D-08) y `turn_ledger_committed`
(`{intent, confidence, modeTransition, messagesSent}` desde `V4AgentOutput.turnLedgerSummary`,
runtime-only). Sin esta emisión `modeTransition`/`messagesSent`/`confidence` quedarían
muertos — la emisión es el espejo del split D-17 (persistir subset, emitir completo).

**Surface visual:** el `state-tab` del debug panel (§9.3) renderiza "KB Topics
Atendidos" + "CRM Actions" leyendo `SandboxState.turnLedgerDims` (tipado FUERTE, W-3 —
narrowing `a.kind === 'kb_topic'` sin `unknown`).

---

## 6. Timers (retomas)

v4 hereda los timers de v3 (D-21) con **evento Inngest separado**
(`agent/v4.timer.started`) y función dedicada `agent-timers-v4.ts` para no compartir
runtime con v3 (Regla 6). 9 niveles L0–L8 con duraciones por preset
(`V4_TIMER_DURATIONS`, `constants.ts:222`): `real` / `rapido` / `instantaneo`.

Cuando un timer expira, entra por `processSystemEvent` (`somnio-v4-agent.ts:717`),
que salta comprehension/guards y va directo a `resolveSalesTrack` con
`{ type:'timer_expired', level }`. Las acciones `retoma*` emiten eventos de
observabilidad `retake:decision` (`sales-track.ts:55`).

---

## 7. Producción vs Sandbox

Mismo **mecanismo**, distinto **código** (no comparten el runner; sí comparten
`somnio-v4/` y `interruption-system-v2/`).

| Etapa | Producción | Sandbox |
|---|---|---|
| Entrada / lock | `webhook-handler.ts` → Inngest | `app/api/sandbox/process/route.ts` → NDJSON |
| Orquestación + restart loop | `engine/v4-production-runner.ts` | `somnio-v4/engine-v4.ts` |
| Lógica del agente | `somnio-v4/` (mismo código) | `somnio-v4/` (mismo código) |
| Envío | `V4MessagingAdapter` → dominio → WhatsApp | loop sintético + `onMessage` → browser |
| Persistencia | Supabase (`session_state`) | memoria (`SandboxState`) |
| Timing | real (latencia LLM + envío) | simulado (`simulateProdTimingMs`) |

**Diferencias intencionales** (no son divergencias de mecanismo): envío real vs
stream, DB vs memoria, timing real vs simulado, CKPT-6a (templates pendientes
cross-turn) que el sandbox no necesita. Detalle completo en
`INTERRUPTION-PARITY.md §3`.

> **Importante:** el sandbox SÍ muestra el texto RAG generativo; producción NO lo
> envía (§4.2). Esa es la única divergencia de comportamiento observable hoy, y es
> el gap conocido — no un bug del sistema de interrupción.

---

## 8. Observation loop (unknown_cases)

Cuando el sub-loop hace handoff (`no_match`), el orquestador captura el caso
**antes** de devolver (`somnio-v4-agent.ts:222-247` y `:438-464`):

`captureUnknownCase` (`unknown-cases/capture.ts:45`) — fire-and-forget — redacta PII
(`redact.ts`), genera embedding, e inserta en `agent_unknown_cases`
(`status:'pending'`, `cluster_id:null`). Un fallo no rompe el turno.

El cron `unknown-cases-cluster-v4` (diario 04:00 Bogota, gated por
`somnio_v4_kb_sync_enabled`) llama `clusterUnknownCases` — agrupa casos pendientes;
cuando se forma un cluster ≥10 en ventana de 30 días, marca
`status:'ready_for_promotion'` para review humano y eventual mejora de la KB.

---

## 9. Observabilidad

Toda la observabilidad fluye por el `collector` (`getCollector()?.recordEvent(...)`)
y se vuelca a tablas `agent_observability_*` vía `flushCollector()` al cierre del
turno (Inngest-safe).

### 9.1 Eventos emitidos (selección, todos con `agent:'somnio-sales-v4'`)

| Evento | Dónde |
|---|---|
| `comprehension_completed` / `comprehension_completed_v4` | `comprehension.ts:145`, `somnio-v4-agent.ts:177` |
| `subloop_low_confidence_invoked` | `somnio-v4-agent.ts:190` |
| `subloop_completed` | `sub-loop/index.ts:336/544/615/892` |
| `subloop_nunca_decir_violation` / `subloop_escalation_trigger_match` | `sub-loop/index.ts:471/496` |
| `subloop_cas_reject_invoked` | `somnio-v4-agent.ts:412` |
| `handoff_low_confidence_fallback` | `somnio-v4-agent.ts:237/452` |
| `sales_track_result` / `response_track_result` / `order_decision` | `somnio-v4-agent.ts:370/542/504` |
| `guard:blocked` / `guard:passed` | `somnio-v4-agent.ts:264/312` |
| `natural_silence` / `system_event_routed` | `somnio-v4-agent.ts:569/744` |
| `unknown_case_captured` / `unknown_case_capture_failed` | `unknown-cases/capture.ts:69/81` |
| `updateOrder_failed` / `moveOrderToStage_failed` / `updateContact_*` | `invocations.ts` |
| `retake:*` / `ofi_inter:*` | `sales-track.ts`, `response-track.ts` |
| **Lock lifecycle** (14 labels: `lock_acquired`, `msg_aborted_path_a_combined`, …) | `interruption-system-v2/observability` (§11) |

### 9.2 Tablas

- `agent_observability_turns` — 1 fila por turno.
- `agent_observability_events` — N filas por turno (pipeline_decision + lock).
- `agent_observability_queries` / `agent_observability_ai_calls` — queries y llamadas LLM.

Lectura: `GET /api/observability/events?session_id=…` (filtrable por labels).

### 9.3 Debug panel (`/sandbox`)

Tabs relevantes a v4 (off por defecto): **Sub-Loop** (renderea
`SubLoopDebugPayload` — toolingCall/generationCall/complianceCheck, KB hits con
similarity, outcome, violations, latencias) e **Interruption** (timeline de los 14
labels de lock). El `SubLoopDebugPayload` (`sub-loop/debug-payload.ts`) es
**runtime-only, nunca persistido**.

---

## 10. Entrada y ruteo (detalle)

1. **Webhook** (`webhook-handler.ts:338`): `resolveAgentIdForWorkspace(workspaceId)`.
2. **Resolución** (`registry-helpers.ts:36-53`): lee
   `workspace_agent_config.conversational_agent_id`; si `'somnio-sales-v4'` →
   devuelve `'somnio-sales-v4'` (bucket propio, no mapea — `:47`).
3. **Lock** (solo si `v4Path`, `webhook-handler.ts:350-407`): `acquireLock` →
   HOLDER hace push a pending + dispatch; FOLLOWER hace push + set interrupt key + RETURN.
4. **Dispatch** (`:421-453`): `inngest.send('agent/whatsapp.message_received', {…})`
   con 6 campos de correlación de lock (`lockHolderUuid`, `lockKey`,
   `ownPendingEntryJson`, `lockChannel`, `lockIdentifier`, `agentId`).
5. **Inngest** (`agent-production.ts:51`): `whatsappAgentProcessor`, concurrency 1
   por `conversationId`; prefiere el `agentId` resuelto en webhook.
6. **Runner** (`V4ProductionRunner.processMessage`) — dedicado a v4 (no toca
   godentist/recompra/pw — esos siguen en `v3-production-runner.ts`).

**Lifecycle router (Plan 04):** si `workspace_agent_config.lifecycle_routing_enabled
= true`, el `webhook-processor.ts` corre `routeAgent` (clasificador + reglas
`routing_rules`) que puede emitir `agent_id`. Si no hay regla, cae a
`conversational_agent_id`. v4 está registrado en el pre-warm del router
(`webhook-processor.ts:251`).

**Sandbox:** entra por `app/api/sandbox/process/route.ts`, mismo HOLDER/FOLLOWER,
respuesta NDJSON streaming a `SomnioV4Engine`.

---

## 11. Sistema de interrupción

**No se repite aquí — ver `INTERRUPTION-PARITY.md` (este directorio).**

Resumen de una línea: Redis `SET NX` lock (HOLDER/FOLLOWER) + lista pending + 8
checkpoints (CKPT-0…CKPT-7.N) + restart loop in-lambda. **Path A** (combinar antes
de enviar) y **Path B** (reprocesar limpio tras enviar ≥1). Mecanismo idéntico en
prod y sandbox; solo difieren envío/persistencia/timing. Solo aplica a v4 (Regla 6 —
v3/godentist/recompra/pw intactos).

Distribución de checkpoints en v4:
- CKPT-0 / CKPT-6a / CKPT-6b — `v4-production-runner.ts`.
- CKPT-1 / CKPT-2 — `somnio-v4-agent.ts:129/327`.
- CKPT-3 / CKPT-4 / CKPT-5 — `sub-loop/index.ts:291/396/454`.
- CKPT-7.N — `v4-messaging-adapter.ts:78` (prod) / `engine-v4.ts:405` (sandbox).

Scope completo del módulo en `CLAUDE.md` §"Module Scope: interruption-system-v2".

---

## 12. Deuda, gaps y estado actual

### Gaps abiertos

| # | Gap | Ubicación | Severidad |
|---|---|---|---|
| G-1 | **Texto RAG generativo no se envía en producción** (§4.2) | `v4-production-runner.ts:904-916` + `messaging.ts:159-161` | 🔴 bloquea activación RAG |
| G-2 | El fallback sin-templates no tiene CKPT-6b ni manejo de interrupción | `v4-production-runner.ts:904-916` | 🟠 (vive bajo G-1) |
| G-3 | El turno registra texto que no se envió (log miente) | `v4-production-runner.ts:915` | 🟠 |
| P1-3 | **Comprehension sin fallback ante saturación de Gemini** | `comprehension.ts:86` | 🟡 diferido |

**P1-3** (`docs/analysis/04-estado-actual-plataforma.md` §P1-3): comprehension usa
solo `gemini-2.5-flash` con los retries default del AI SDK (3, sin backoff custom) y
**sin modelo de fallback**. Si Google responde "high demand" (saturación transitoria),
los 3 intentos fallan → el turno muere con `AI_RetryError` (aparece como Intent="error").
Observado en sandbox 2026-05-28. No impacta producción hoy (v4 DORMANT). Decisión:
implementar fallback (Haiku/GPT-4o-mini o más retries con backoff) **cuando ocurra en
prod**, no antes. El sub-loop RAG también usa Gemini Flash en Call 2/3.

### Deferred a V1.1 (documentado, no-bloqueante)

- `activeContactId` / `activeOrderId` no se resuelven en el orquestador V1
  (`somnio-v4-agent.ts:403/407`) → `updateContact` y las mutations come-back se
  skipean silenciosamente (fire-and-forget). `invocations.ts:225`.
- `createOrder` se ejecuta vía el runner (`shouldCreateOrder=true`) en vez de
  `crm-mutation-tools.createOrder` directo — la resolución de UUIDs
  contactId/pipeline/stage no es trivial inline (`somnio-v4-agent.ts:511-529`).
- Sync de cédula al contacto no soportado por el tool (`invocations.ts:223`).

### Standalones relacionados

| Standalone | Estado | Qué construyó |
|---|---|---|
| `somnio-v4-rag-generative` | **LIVE / en progreso** | Rediseño a RAG generativo (KB 5 secciones, 3-call sub-loop). Cierra G-1 al terminar. |
| `somnio-sales-v4-runtime-wiring` | superseded | Wiring inicial (Gemini comprehension, runner). Plan 07/08 obsoletos por el RAG. |
| `debounce-interruption-system-v2` | shipped | Lock + 8 checkpoints + 14 labels + cron sweep. |
| `debounce-v2-interrupt-reprocess` | shipped | Restart in-lambda Path A. |
| `debounce-v2-sandbox-integration` | shipped | Paridad sandbox (mismo lock + checkpoints). |
| `v4-subloop-debug-view` | shipped | Sub-Loop tab del debug panel. |
| `somnio-v4-turn-ledger` | shipped | Unified Turn Ledger (§5.3): `commitTurn` + `turn_ledger_dims` + emisión a observability + state-tab. Anticipa el shape CRM para el standalone #2. |

### Estado: qué está completo vs qué falta

**Completo y cableado:** pipeline del turno (comprehension → guards → sales-track →
sub-loop → invocations → response-track), KB pgvector + sync + kb_search, sub-loop
RAG de 3 calls con thresholds + compliance, observation loop, sistema de
interrupción (prod + sandbox), observabilidad + debug tabs, timers v4, registro en
agentRegistry. Tests verdes en `__tests__/` (comprehension, transitions, sub-loop,
engine-v4-lock, escalation, smoke-rag-a/b) + `engine/__tests__/v4-production-runner-*`.

**Falta para activar v4 con RAG en producción:**
1. **Cerrar G-1** — wirear el envío del `output.messages` generativo (§4.2). Es el
   bloqueante real.
2. Smoke E2E en WhatsApp real (diferido a activation-time — `INTERRUPTION-PARITY.md`
   §5 da el guion Path A / Path B).
3. (Recomendado) mitigar P1-3 antes de tráfico real.
4. Activar por workspace (§13).

---

## 13. Cómo activar v4 (cuando esté listo)

```sql
-- Activación per-workspace (sin migración, sin feature flag).
UPDATE workspace_agent_config
SET conversational_agent_id = 'somnio-sales-v4'
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'; -- Somnio (D-23)

-- Observation loop + KB sync (opcional, default OFF — Regla 6):
-- UPDATE platform_config SET somnio_v4_kb_sync_enabled = true;
```

Rollback: volver `conversational_agent_id` al valor anterior (recovery <10s tras TTL
de cache). v4 está **hardcodeado** al workspace Somnio (`config.ts:12`), así que
ningún otro workspace puede activarlo por accidente.

---

## Referencias

- `INTERRUPTION-PARITY.md` — sistema de interrupción (no repetido aquí).
- `CLAUDE.md` §"Module Scope: interruption-system-v2" — scope del módulo de lock.
- `.claude/rules/agent-scope.md` — scope de agentes (PUEDE / NO PUEDE).
- `docs/analysis/04-estado-actual-plataforma.md` §P1-3 — deuda Gemini saturación.
- `../somnio-v3/ARCHITECTURE.md` — el agente del que v4 clonó la state machine.
