# Standalone: Somnio Recompra + CRM Reader Integration - Context

**Gathered:** 2026-04-20
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Enriquecer la sesion del agente `somnio-recompra-v1` con contexto rico del cliente
(ultimo pedido con items, tags activos, total de pedidos, direccion mas reciente)
obtenido del agente `crm-reader`, **sin bloquear el saludo de apertura**.

El saludo del turno 0 sigue usando solo `contact.name` (query simple, <100ms). En
paralelo, una funcion Inngest dispara el reader y escribe el resultado en la
session state bajo la key `_v3:crm_context`. Cuando el cliente muestra intencion
de compra (turno 1+), el comprehension ya tiene el contexto rico disponible.

**Fuera de scope:**
- Invocacion mid-conversacion del reader (ej. "cual fue mi ultimo pedido?")
- TTL / invalidacion automatica de `_v3:crm_context` (se escribe 1 vez por sesion)
- Cambios al system-prompt del reader (scope ya locked en Phase 44)
- Exposicion HTTP del reader (Plan 07 de Phase 44, pendiente aparte)

</domain>

<decisions>
## Implementation Decisions

### Activacion y timing

- **D-01:** El reader se invoca **solo al crear sesion nueva** de recompra
  (`session.version === 0`). No se refresca mid-conversacion en esta fase.
- **D-02:** Turno 0 (saludo) **NO espera** al reader. El bot responde el saludo
  usando solo `contact.name` extraido del query simple actual. Latencia del
  saludo se mantiene <200ms.
- **D-03:** El reader corre en **paralelo** via Inngest mientras el bot saluda.
  Escribe `_v3:crm_context` al session state cuando termina.

### Mecanismo async — Inngest (no fire-and-forget)

- **D-04:** Nueva funcion Inngest: `recompra/preload-context` (nombre tentativo).
- **D-05:** webhook-processor dispara via `await inngest.send({ name: 'recompra/preload-context', data: { sessionId, contactId, workspaceId } })` ANTES de responder el saludo. El `await` es obligatorio (patron conocido Vercel + Inngest — ver MEMORY.md).
- **D-06:** La funcion Inngest encapsula: llamar `processReaderMessage` → guardar `result.text` al session state via `adapters.storage.saveState({ '_v3:crm_context': text })`. Sigue el patron de observability merge (encode output en step.run return — ver `inngest_observability_merge.md`).
- **D-07:** Invoker pasado al reader: `'somnio-recompra-v1'` (propagado a logs).

### Prompt al reader — estructurado fijo

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
- **D-09:** El prompt se envia como `messages: [{ role: 'user', content: <template> }]`. El system-prompt del reader ya esta locked internamente.

### Forma del output — blob de texto

- **D-10:** El `result.text` completo del reader se guarda en la key
  `_v3:crm_context` dentro de `datos_capturados` (session state).
- **D-11:** El comprehension-prompt del recompra lee `_v3:crm_context` al inicio
  como bloque de contexto adicional (implementacion exacta → plan-phase).
- **D-12:** NO se parsean los `toolCalls` del reader a keys estructuradas en esta
  fase (sales-track sigue usando los campos flat existentes como `direccion`,
  `ciudad`, etc.). YAGNI — si luego necesitamos logica determinista sobre
  `ultimo_pedido_items`, se agrega parseo entonces.

### Edge case — race con intencion de compra rapida

- **D-13:** Si el cliente manda un segundo mensaje (intencion de compra) antes
  de que el reader termine (`_v3:crm_context` aun no existe), el pipeline de
  recompra hace **poll con backoff corto**: lee session state cada 500ms hasta
  3 segundos totales.
- **D-14:** Si a los 3s no hay `_v3:crm_context`, el turno procede sin el
  contexto rico. El comprehension se comporta como hoy (pide direccion/datos
  desde cero si el sales-track los requiere).
- **D-15:** NUNCA se re-dispara el reader en el mismo session — una sola vez
  al crear, exito o falla.

### Observabilidad

- **D-16:** Eventos nuevos a emitir via `getCollector()?.recordEvent`:
  - `pipeline_decision:crm_reader_dispatched` (webhook-processor, al hacer `inngest.send`)
  - `pipeline_decision:crm_reader_completed` (dentro Inngest function, con `duration_ms`, `toolCallCount`, `steps`)
  - `pipeline_decision:crm_reader_failed` (si `processReaderMessage` throws)
  - `pipeline_decision:crm_context_used` (comprehension, cuando lee `_v3:crm_context`)
  - `pipeline_decision:crm_context_missing_after_wait` (race: turno 1+ salio sin contexto)

### Scope doc

- **D-17:** Actualizar `.claude/rules/agent-scope.md`:
  - Agregar `somnio-recompra-v1` a la lista de consumidores documentados del reader (seccion CRM Reader Bot).
  - Mencionar que el acceso es in-process (no HTTP), invoker propagado.

### Claude's Discretion

Downstream agents tienen libertad en:
- **Timeout del reader**: el default de AI SDK es ~1-2min. Razonable limitarlo
  a 10-15s en esta funcion Inngest. Plan-phase decide valor exacto.
- **Shape exacto del event `recompra/preload-context`**: nombre interno, payload
  schema (sessionId + contactId + workspaceId como minimo).
- **Implementacion del poll con backoff**: interval 500ms con max 3s esta
  decidido; mecanismo concreto (setInterval vs await sleep loop) lo decide plan.
- **Manejo si el reader retorna texto vacio o "no encontrado"**: guardar string
  vacio vs. marker especial vs. no guardar. Plan-phase decide.
- **Donde exactamente el comprehension inyecta `_v3:crm_context`** en el prompt
  (bloque al inicio vs. seccion dedicada). Researcher + planner definen.

### Constraints tecnicos heredados (no-negotiable)

- **Regla 0 (CLAUDE.md)**: GSD completo obligatorio — este fase debe pasar por research → plan → execute → verify.
- **Regla 3 (CLAUDE.md)**: reader solo accede via domain layer — ya cumplido por diseño del reader (tools importan solo de `@/lib/domain/*`).
- **Regla 5 (CLAUDE.md)**: si la fase requiere migracion DB, aplicar ANTES de push. En esta fase NO se esperan migraciones (solo nueva funcion Inngest + edits a TS). Planner confirma.
- **Regla 6 (CLAUDE.md)**: no se puede desconectar `somnio-recompra-v1` activo. El cambio debe ser compatible — feature flag recomendado para activar el dispatch del reader (ej. `USE_CRM_READER_PRELOAD` en config o env). Plan decide exactitud del flag.
- **Vercel serverless**: `inngest.send` SIEMPRE con `await` en webhook. Fire-and-forget muere.
- **Timezone**: cualquier fecha en el prompt del reader o output debe respetar `America/Bogota` (Regla 2). Aplicable si el reader devuelve "hace 45 dias" — lo calcula desde timestamps UTC, OK.
- **Testing**: el bot esta en produccion atendiendo clientes reales — no se puede pushear sin feature flag off por defecto.

### Contratos de integracion (shape concreto)

- **Inngest event:** 
  ```ts
  inngest.send({
    name: 'recompra/preload-context',  // nombre tentativo — planner confirma
    data: { sessionId, contactId, workspaceId, invoker: 'somnio-recompra-v1' },
  })
  ```
- **Reader input shape:**
  ```ts
  await processReaderMessage({
    workspaceId,
    invoker: 'somnio-recompra-v1',
    messages: [{ role: 'user', content: <prompt fijo de D-08> }],
  })
  ```
- **Session state write (dentro Inngest function):**
  ```ts
  await adapters.storage.saveState(sessionId, {
    '_v3:crm_context': result.text,
  })
  ```
  (`adapters` debe instanciarse dentro de la Inngest function — NO viene del runner original porque ese ya termino.)
- **Comprehension lee:** `datosCapturados['_v3:crm_context']` — si existe y no es string vacio, anteponer al bloque de analisis; si no existe, comportamiento actual.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Somnio Recompra (agente consumidor)
- `src/lib/agents/somnio-recompra/somnio-recompra-agent.ts` — pipeline principal (processMessage, processUserMessage, processSystemEvent)
- `src/lib/agents/somnio-recompra/comprehension-prompt.ts` — donde se inyecta `_v3:crm_context` (punto de integracion)
- `src/lib/agents/somnio-recompra/config.ts` — agente registrado `somnio-recompra-v1`
- `src/lib/agents/somnio-recompra/state.ts` §serializeState / §deserializeState — como se lee `datos_capturados`
- `.planning/standalone/somnio-recompra/CONTEXT.md` — decisiones previas del bot (is_client, timers, intents, escenarios)
- `.planning/standalone/somnio-recompra/somnio-recompra-VERIFICATION.md` — estado de cierre del bot base

### CRM Reader (agente proveedor)
- `src/lib/agents/crm-reader/index.ts` §processReaderMessage — API a invocar (MAX_STEPS=5, Sonnet 4.5, temperature 0)
- `src/lib/agents/crm-reader/system-prompt.ts` — scope locked (solo-lectura, español, PUEDE/NO PUEDE)
- `src/lib/agents/crm-reader/config.ts` — tools expuestos, tokenBudget 30_000
- `src/lib/agents/crm-reader/types.ts` — ReaderInput, ReaderOutput, ReaderMessage shapes
- `src/lib/agents/crm-reader/tools/contacts.ts` — contactsGet (tags + customFields)
- `src/lib/agents/crm-reader/tools/orders.ts` — ordersList (filter contactId), ordersGet (items)
- `src/lib/agents/crm-reader/tools/tags.ts` — tagsList
- `.planning/phases/44-crm-bots/44-CONTEXT.md` — decisiones de diseño del reader

### Infraestructura de integracion
- `src/lib/agents/production/webhook-processor.ts` §171-245 — routing a recompra, `loadLastOrderData`, construccion runner (lineas 660-688 = funcion actual a preservar para el saludo)
- `src/lib/agents/engine/v3-production-runner.ts` §119-127 — inyeccion `preloadedData` en `datos_capturados` cuando `session.version === 0`
- `src/lib/agents/engine-adapters/production.ts` — `adapters.storage.saveState` (donde Inngest function escribira `_v3:crm_context`)
- `src/inngest/functions/` — directorio de funciones Inngest existentes (patron a seguir)
- `src/inngest/` — `inngest` client, event registration, types

### Rules y patrones del proyecto
- `.claude/rules/agent-scope.md` §"CRM Reader Bot" — documentar nuevo consumidor (actualizar en esta fase)
- `.claude/rules/code-changes.md` — workflow obligatorio GSD antes de tocar codigo
- `CLAUDE.md` §"Regla 3: Domain Layer" — reader ya cumple (tools importan solo de `@/lib/domain/*`)
- MEMORY: "Vercel serverless + Inngest: NEVER fire-and-forget inngest.send in webhooks/API routes. Always await." — CRITICO para D-05
- MEMORY: "Inngest step.run observability merge pattern" → `inngest_observability_merge.md` — aplicar al encode de `result.text` y metrics en return de step.run

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`processReaderMessage(input)`** (`src/lib/agents/crm-reader/index.ts`) — API lista. Solo requiere `{ workspaceId, messages, invoker }`. Devuelve `{ text, toolCalls, steps, agentId }`.
- **`loadLastOrderData(contactId, workspaceId)`** (`webhook-processor.ts:660`) — query simple actual, se mantiene para el saludo (nombre/telefono/direccion/ciudad). NO se elimina en esta fase.
- **`adapters.storage.saveState(sessionId, partialState)`** — metodo ya existente para escribir parcialmente al session state desde Inngest.
- **`V3ProductionRunner` config `preloadedData: Record<string, string>`** (`engine/types.ts:160`) — ya soporta keys arbitrarias; se usara directamente para `_v3:crm_context` cuando el Inngest function guarde.
- **`getCollector()?.recordEvent(category, event, data)`** — patron consistente de observability en todos los agentes.

### Established Patterns
- **Inyeccion de `preloadedData` solo en `session.version === 0`** — cualquier cambio tiene que respetar eso (el Inngest function escribe durante la primera vez, pero el consumo es por `_v3:` prefix en todos los turnos).
- **Keys `_v3:` prefijadas** — existe un patron de auto-limpieza (`v3-production-runner.ts:62-64` limpia `_v3:accionesEjecutadas` stale). `_v3:crm_context` debe sobrevivir toda la sesion (no limpiar).
- **Inngest `step.run` returns encode observability data** — metrics, traces NO sobreviven a replays; codificar en return value.
- **Agent invoker propagado a logs** — `'somnio-recompra-v1'` visible en `logger.info` del reader.
- **Tools del reader devuelven `{status:'found'|'not_found_in_workspace'|'error'}`** — reader maneja internamente; `result.text` refleja esto en prosa.

### Integration Points
1. **webhook-processor.ts:~200** (justo despues de `loadLastOrderData`, antes de `V3ProductionRunner` constructor): insertar `await inngest.send({ name: 'recompra/preload-context', data: {...} })`. 
2. **Nueva funcion Inngest** en `src/inngest/functions/` que importa `processReaderMessage`, ejecuta, guarda al session state.
3. **comprehension-prompt.ts** (somnio-recompra): extender prompt para leer `datosCapturados['_v3:crm_context']` y anteponerlo al bloque de analisis (bajo un header tipo `## Contexto CRM del cliente`).
4. **somnio-recompra-agent.ts** (opcional, en turno 1+): agregar poll con backoff si `_v3:crm_context` no existe aun — implementacion exacta la decide plan.
5. **`.claude/rules/agent-scope.md` §CRM Reader Bot**: agregar consumidor.

</code_context>

<specifics>
## Specific Ideas

- El usuario construyo el `crm-reader` precisamente para centralizar lectura confiable del CRM. Usarlo en lugar de expandir queries directos es fidelidad al proposito de diseño, no solo una opcion tecnica.
- El saludo de recompra (turno 0) solo necesita el nombre — la infraestructura actual (`loadLastOrderData`) ya lo provee en <100ms. NO se puede sacrificar esa latencia.
- El cliente tipicamente tarda 3-5 segundos entre el saludo y el mensaje de intencion — tiempo suficiente para que el reader termine en la mayoria de casos.
- Prompt estructurado (no abierto) porque garantiza predictibilidad del output: siempre la misma forma de parrafo, cosas faciles de referenciar desde comprehension-prompt.

</specifics>

<deferred>
## Deferred Ideas

- **Invocacion mid-conversacion del reader** — cuando comprehension detecta intents como "cual fue mi ultimo pedido", "tengo pedido pendiente", etc. Requiere otra fase (somnio-recompra-crm-reader-midflow).
- **TTL / invalidacion automatica de `_v3:crm_context`** — hoy se escribe una sola vez al crear sesion, nunca se refresca. Si una sesion vive muchos dias y el cliente hace otro pedido afuera, el contexto queda stale. Tema para otra fase.
- **Parseo estructurado de toolCalls** — extraer `ultimo_pedido_items`, `tags`, `pedidos_count` a keys separadas de `datosCapturados` para logica determinista en sales-track (ej. "si tiene tag VIP, mostrar promo premium"). YAGNI hoy; se agrega cuando exista la necesidad.
- **Optimizacion de tokens** — el `result.text` del reader puede ser largo (parrafo con items + tags + historial). Puede inflar el prompt de comprehension. Monitorear con la observability nueva; si hace falta, truncar o comprimir.
- **Tests de integracion E2E** — cubrir happy path + race condition + reader falla. Plan-phase decide cobertura.
- **Precios especiales/descuentos para clientes recurrentes** — idea original diferida en `somnio-recompra/CONTEXT.md`, no vuelve aca.
- **Ofi Inter para recompra** — idem, diferida previamente.
- **Exposicion HTTP del reader** (`/api/v1/crm-bots/reader`) — Plan 07 de Phase 44, ortogonal a esta fase. Esta fase consume in-process.
- **HTTP route del recompra-preload-context como API externa** — no aplica; es interno, disparado desde webhook.

</deferred>

---

*Standalone: somnio-recompra-crm-reader*
*Context gathered: 2026-04-20*
