# Somnio Recompra v1

**Agent ID (observability):** `somnio-recompra-v1`
**Runtime module:** `src/lib/agents/somnio-recompra/`
**Workspace:** Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`)
**Last updated:** 2026-04-24 (Plan 03 agent-forensics-panel)

## Scope

### PUEDE

- Responder a clientes que **reagendan/recompran ELIXIR DEL SUEÑO** via WhatsApp inbound (entry via `webhook-processor.ts:174` branch `contactData?.is_client === true`).
- Emitir templates del catalogo propio bajo `agent_id='somnio-recompra-v1'`:
  - **INFORMATIONAL_INTENTS (10):** `saludo`, `precio`, `promociones`, `pago`, `envio`, `ubicacion`, `contraindicaciones`, `dependencia`, `tiempo_entrega`, `registro_sanitario` (ver `constants.ts:67-71`).
  - **Sales action templates:** `resumen_1x`/`resumen_2x`/`resumen_3x`, `confirmacion_orden_same_day` / `confirmacion_orden_transportadora`, `preguntar_direccion_recompra`, `pendiente_promo`, `pendiente_confirmacion`, `no_interesa`, `rechazar`, `retoma_inicial` (ver `response-track.ts:280-374` + `constants.ts:74-79`).
- Crear pedido en CRM Somnio via sales actions `crear_orden` / `crear_orden_sin_promo` / `crear_orden_sin_confirmar` (delegadas al domain — ver `CREATE_ORDER_ACTIONS` en `constants.ts:133-135`).
- **Preguntar confirmacion de direccion antes de promos** cuando el cliente dice "quiero comprar" (D-04 somnio-recompra-template-catalog — `transitions.ts:70-77`).
- Consumir `session_state.datos_capturados._v3:crm_context` poblado por Inngest `recompra-preload-context` (feature flag `platform_config.somnio_recompra_crm_reader_enabled`).

### NO PUEDE

- **Compartir catalogo con `somnio-sales-v3`.** Catalogo independiente bajo `agent_id='somnio-recompra-v1'` desde 2026-04-23 (phase `somnio-recompra-template-catalog`). Fix provisional commit `cdc06d9` revertido. Constante `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` (ver `response-track.ts:36`) — mutar esa linea apunta a otro catalogo y es un bug.
- **Auto-disparar promos en saludo inicial** (D-05). `saludo` en phase `initial` cae al fallback `null` de `resolveTransition` y response-track lo maneja como informational (texto CORE + imagen ELIXIR COMPLEMENTARIA). No hay entry `{ phase: 'initial', on: 'saludo', action: 'ofrecer_promos' }` en `transitions.ts:33-251`.
- **Acceder a templates de otros agentes** (sales-v3, godentist, config-builder) — `TEMPLATE_LOOKUP_AGENT_ID` es constante.
- **Escribir en tablas fuera del workspace Somnio** (domain layer filtra por `workspace_id` — Regla 3 CLAUDE.md).
- **Preguntar datos que no son criticos.** Campos criticos son `CRITICAL_FIELDS_NORMAL` (`constants.ts:86-93`): nombre, apellido, telefono, direccion, ciudad, departamento. NO barrio, NO correo (eran extras en v3 que recompra removio).

## Arquitectura

### Pipeline (orden esperado en un turn)

1. **Preload context async (upstream)** — Inngest function `recompra-preload-context` (`src/inngest/functions/recompra-preload-context.ts`) invoca `processReaderMessage(...)` desde `crm-reader` via agent-to-agent in-process al crear session_state nueva. Popula `session_state.datos_capturados._v3:crm_context` y `_v3:crm_context_status`. Timeout 12s, retries=1, concurrency=1 por sessionId.
2. **Comprehension** (Claude Haiku) — `comprehension.ts` — detecta intent + secondaryIntent + confidence + pack + datos capturados. Emite `comprehension.result` (`comprehension.ts:94`).
3. **Guards** — `guards.ts`:
   - R0 low-confidence (< `LOW_CONFIDENCE_THRESHOLD=80` — `constants.ts:99`).
   - R1 escape intents (`ESCAPE_INTENTS = { asesor, queja, cancelar }` — `constants.ts:56-60`).
   - Emite `guard.blocked` o `guard.passed` (`somnio-recompra-agent.ts:314, 356`).
4. **Sales Track** — `sales-track.ts` — state machine de acciones. Resuelve la accion via `resolveTransition(phase, on, state, gates, changes)` (lookup en `transitions.ts:33-251`, first-match-wins). Emite `pipeline_decision.timer_transition` (`sales-track.ts:48`) y `pipeline_decision.intent_transition` (`sales-track.ts:74`).
5. **Response Track** — `response-track.ts` — template engine que decide QUE DECIR. Combina `salesTemplateIntents` (del sales action) + `infoTemplateIntents` (de INFORMATIONAL_INTENTS). Emite `template_selection.block_composed` (`response-track.ts:191`).
6. **Block composition** — `composeBlock` de `@/lib/agents/somnio/block-composer` arma el mensaje final (texto + imagen opcional con `delaySeconds`).
7. **Order decision (si aplica)** — `somnio-recompra-agent.ts:392` emite `pipeline_decision.order_decision` cuando la accion es de `CREATE_ORDER_ACTIONS`.

### Archivos clave

- `src/lib/agents/somnio-recompra/response-track.ts` — `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` (linea 36). Branch `preguntar_direccion` usa `[direccion, ciudad, departamento].filter(Boolean).join(', ')` para `direccion_completa` (linea 344 — D-12 locked).
- `src/lib/agents/somnio-recompra/sales-track.ts` — state machine de acciones (82 lineas).
- `src/lib/agents/somnio-recompra/transitions.ts` — `resolveTransition(phase, on, state, gates, changes?)` (lineas 262-286). Tabla declarativa `TRANSITIONS[]` (lineas 33-251).
- `src/lib/agents/somnio-recompra/constants.ts` — `RECOMPRA_INTENTS` 19 total (linea 18-50), `INFORMATIONAL_INTENTS` 10 (linea 67-71), `ACTION_TEMPLATE_MAP` (linea 74-79), `CRITICAL_FIELDS_NORMAL` (linea 86-93), `SIGNIFICANT_ACTIONS` (linea 121-125), `CRM_ACTIONS` + `CREATE_ORDER_ACTIONS` (linea 128-135), `RECOMPRA_TIMER_DURATIONS` 3 levels L3/L4/L5 (linea 148-152), `PACK_PRICES` (linea 105-109).
- `src/lib/agents/somnio-recompra/comprehension.ts` — Haiku structured output + `comprehension.result` event.
- `src/lib/agents/somnio-recompra/comprehension-prompt.ts` — prompt Haiku (validado por test `comprehension-prompt.test.ts`).
- `src/lib/agents/somnio-recompra/somnio-recompra-agent.ts` — orquestador (452 lineas). 10 events observability.
- `src/lib/agents/somnio-recompra/state.ts` — `AgentState`, `Gates`, `StateChanges`, `buildResumenContext`, `camposFaltantes`.
- `src/lib/agents/somnio-recompra/guards.ts` — R0/R1.
- `src/lib/agents/somnio-recompra/__tests__/` — 4 suites (32 tests):
  - `transitions.test.ts` — cubre D-03/D-04/D-05/D-06.
  - `response-track.test.ts` — cubre D-12 direccion_completa concat.
  - `crm-context-poll.test.ts` — contrato con crm-reader.
  - `comprehension-prompt.test.ts` — shape del prompt.

## Intents habilitados

### Informational (10) — manejados via template directo, sin action de sales

`saludo`, `precio`, `promociones`, `pago`, `envio`, `ubicacion`, `contraindicaciones`, `dependencia`, `tiempo_entrega`, `registro_sanitario` (`constants.ts:67-71`).

### Client actions (6)

`datos`, `quiero_comprar`, `seleccion_pack`, `confirmar`, `confirmar_direccion`, `rechazar` (`constants.ts:31-37`).

### Escape (4) — guard R1 los blockea

`asesor`, `queja`, `cancelar`, `no_interesa` (`constants.ts:39-43`).

### Acknowledgment + Fallback

`acknowledgment`, `otro` (`constants.ts:45-49`).

### Sales actions (mutan estado o crean pedido)

`ofrecer_promos`, `preguntar_direccion`, `mostrar_confirmacion`, `cambio`, `crear_orden`, `crear_orden_sin_promo`, `crear_orden_sin_confirmar`, `retoma`, `no_interesa`, `rechazar`, `silence`, `handoff`. Ver `TipoAccion` en `types.ts`.

## Comportamiento esperado por intent

### `saludo`

- **Cuando:** primer mensaje del cliente o respuesta en phase `initial`.
- **Que responde:** template `saludo` (texto CORE `{{nombre_saludo}} 😊` + imagen ELIXIR COMPLEMENTARIA con URL + `Deseas adquirir tu ELIXIR DEL SUEÑO?`).
- **NO dispara promos automaticamente** (D-05). `resolveTransition('initial', 'saludo', ...)` devuelve `null` por ausencia de entry matching; `response-track.ts` lo procesa por `INFORMATIONAL_INTENTS.has('saludo')` en la rama informational.
- **Variable `nombre_saludo`:** `getGreeting(state.datos.nombre)` computed en Colombia TZ (`response-track.ts:233-259`) — formato `"Buenos dias Jose"` / `"Buenas tardes Jose"` / `"Buenas noches Jose"`.
- **Archivo:** `response-track.ts:65-81` (rama informational), `transitions.ts:64-68` (comentario D-05).

### `precio`

- **Cuando:** usuario pregunta "cuanto cuesta", "precio", etc.
- **Que responde (recompra especifico):** NO solo el template precio. Recompra manda `promociones` + `pago` (linea 72-73 response-track.ts — excluye `tiempo_efecto_1` que v3 si envia, porque cliente ya conoce el producto).
- **Si phase=`initial`:** ademas dispara action `ofrecer_promos` (`transitions.ts:113-119`).
- **Archivo:** `response-track.ts:70-73`, `transitions.ts:112-119`.

### `quiero_comprar` en initial

- **Que responde:** sales action `preguntar_direccion` → template `preguntar_direccion_recompra` con `direccion_completa = [direccion, ciudad, departamento].filter(Boolean).join(', ')` (D-12 locked).
- **Razon (D-04):** confirmar direccion ANTES de ofrecer promos — el cliente es recurrente y ya tiene data preloaded del last order.
- **Si faltan campos criticos** (`CRITICAL_FIELDS_NORMAL`): pide los faltantes con labels humanos (`response-track.ts:350-358`).
- **Archivo:** `transitions.ts:70-77`, `response-track.ts:333-359`.

### `confirmar_direccion`

- **Cuando:** cliente confirma la direccion mostrada tras `preguntar_direccion_recompra`.
- **Que responde:** sales action `ofrecer_promos` → template `promociones`.
- **Archivo:** `transitions.ts:102-109`.

### `seleccion_pack` (phase `promos_shown` o `*`)

- **Con datos criticos completos** (`gates.datosCriticos === true`): accion `mostrar_confirmacion` → template `resumen_{pack}` con tiempo L4.
- **Sin datos criticos:** accion `preguntar_direccion` con timer L5.
- **Archivo:** `transitions.ts:123-141` (phase-specific), `transitions.ts:194-212` (any-phase fallback).

### `confirmar` (phase `confirming` o `*`)

- **Con pack + datos:** accion `crear_orden` → template `confirmacion_orden_same_day` o `confirmacion_orden_transportadora` segun `lookupDeliveryZone(ciudad)` (`response-track.ts:296-319`).
- **Sin pack:** accion `ofrecer_promos` (timer L3).
- **Archivo:** `transitions.ts:154-172` (phase-specific), `transitions.ts:216-234` (any-phase fallback).

### `tiempo_entrega`

- **Que responde:** uno de 5 templates segun ciudad resuelta — `tiempo_entrega_same_day`, `tiempo_entrega_next_day`, `tiempo_entrega_1_3_days`, `tiempo_entrega_2_4_days`, `tiempo_entrega_sin_ciudad` (variantes agregadas en phase `somnio-recompra-template-catalog` 2026-04-23).
- **Archivo:** `response-track.ts:382-398` (helper `resolveDeliveryTimeTemplates`).

### Escape intents (`asesor`, `queja`, `cancelar`)

- Guard R1 los blockea ANTES del sales track (`somnio-recompra-agent.ts:~314`). Emite `guard.blocked`.

### `no_interesa` / `rechazar`

- Cualquier phase → accion homonima con `timerSignal: { type: 'cancel' }` (`transitions.ts:36-52`).

### Timers

- **L3** (promos sin respuesta) → `crear_orden_sin_promo` (`transitions.ts:144-150`).
- **L4** (pack sin confirmar) → `crear_orden_sin_confirmar` (`transitions.ts:184-190`).
- **L5** (silencio en initial) → `retoma` (`transitions.ts:237-242`).
- Duraciones en `RECOMPRA_TIMER_DURATIONS` (`constants.ts:148-152`) — preset `real` usa 600s/600s/90s, `rapido` 60s/60s/9s, `instantaneo` 2s/2s/1s.

## Transiciones clave

| Desde phase      | On intent/event       | Accion                      | Condicion                   | Archivo           |
| ---------------- | --------------------- | --------------------------- | --------------------------- | ----------------- |
| *                | no_interesa           | no_interesa                 | —                           | transitions.ts:37 |
| *                | rechazar              | rechazar                    | —                           | transitions.ts:47 |
| *                | acknowledgment        | silence + timer L5          | —                           | transitions.ts:56 |
| initial          | saludo                | (null fallback)             | informational via response-track (D-05) | transitions.ts:64-68 |
| initial          | quiero_comprar        | preguntar_direccion         | — (D-04)                    | transitions.ts:71 |
| initial          | datos                 | ofrecer_promos              | gates.datosCriticos         | transitions.ts:81 |
| initial          | datos                 | preguntar_direccion         | !gates.datosCriticos        | transitions.ts:92 |
| initial          | confirmar_direccion   | ofrecer_promos              | —                           | transitions.ts:103 |
| initial          | precio                | ofrecer_promos              | —                           | transitions.ts:113 |
| promos_shown     | seleccion_pack        | mostrar_confirmacion        | gates.datosCriticos         | transitions.ts:125 |
| promos_shown     | seleccion_pack        | preguntar_direccion         | !gates.datosCriticos        | transitions.ts:135 |
| promos_shown     | timer_expired:3       | crear_orden_sin_promo       | —                           | transitions.ts:145 |
| confirming       | confirmar             | crear_orden                 | datosCriticos && packElegido | transitions.ts:156 |
| confirmar        | confirmar             | ofrecer_promos              | !packElegido                | transitions.ts:166 |
| confirming       | datos                 | cambio                      | —                           | transitions.ts:176 |
| confirming       | timer_expired:4       | crear_orden_sin_confirmar   | —                           | transitions.ts:185 |
| initial          | timer_expired:5       | retoma                      | —                           | transitions.ts:238 |
| closed           | *                     | silence                     | —                           | transitions.ts:246 |

## Contratos con otros modulos

### CRM Reader Bot (`crm-reader`)

- **Flujo:** webhook → session_state nuevo → Inngest `recompra-preload-context` fire → `processReaderMessage(...)` in-process → escribe `_v3:crm_context` + `_v3:crm_context_status` en `session_state.datos_capturados` via `SessionManager.updateCapturedData`.
- **Invoker propagated:** `invoker: 'somnio-recompra-v1'` en el evento Inngest (`webhook-processor.ts:302`).
- **Feature flag:** `platform_config.somnio_recompra_crm_reader_enabled` (default `false`, flip manual via SQL — Regla 6).
- **Timeout interno:** 12s AbortController; reader fallo/timeout NO bloquea saludo (usuario recibe saludo sin context).
- **Events emitidos:** `pipeline_decision.crm_reader_dispatched/completed/failed` (Inngest function `recompra-preload-context.ts:240, 251`), `pipeline_decision.crm_context_used` y `pipeline_decision.crm_context_missing_after_wait` (`somnio-recompra-agent.ts:274, 283`).

### Templates

- TODAS las lookups pasan por `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` (`response-track.ts:36`). Cambiarla = apuntar a otro catalogo (regresion commit `cdc06d9` revertido). Test `transitions.test.ts` protege D-03.

### Domain layer (Regla 3 CLAUDE.md)

- `crear_orden` → llama `domain/orders.createOrder(...)` via el runner V3. NUNCA escribe directo a Supabase desde sales-track o response-track.
- Emite trigger de automatizacion correspondiente desde el domain.

## Observability events emitidos

| Categoria            | Label                              | Cuando                                            | Archivo                                  |
| -------------------- | ---------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `pipeline_decision`  | `recompra_routed`                  | webhook-processor detecta is_client=true          | `webhook-processor.ts:192`               |
| `pipeline_decision`  | `recompra_disabled_client_skip`    | is_client=true pero recompra_enabled=false        | `webhook-processor.ts:179`               |
| `pipeline_decision`  | `crm_reader_dispatched`            | Inngest fire                                      | `recompra-preload-context.ts` (upstream) |
| `pipeline_decision`  | `crm_reader_completed`             | Reader termino OK                                 | `recompra-preload-context.ts:240`        |
| `pipeline_decision`  | `crm_reader_failed`                | Reader timeout/fail                               | `recompra-preload-context.ts:251`        |
| `pipeline_decision`  | `crm_context_used`                 | Recompra consume preloaded context                | `somnio-recompra-agent.ts:274`           |
| `pipeline_decision`  | `crm_context_missing_after_wait`   | Recompra arranca sin context (feature flag off o timeout) | `somnio-recompra-agent.ts:283`   |
| `pipeline_decision`  | `system_event_routed`              | timer o system event entra al agent               | `somnio-recompra-agent.ts:152`           |
| `pipeline_decision`  | `sales_track_result`               | Tras sales track                                  | `somnio-recompra-agent.ts:376`           |
| `pipeline_decision`  | `order_decision`                   | Accion es `crear_orden*`                          | `somnio-recompra-agent.ts:392`           |
| `pipeline_decision`  | `response_track_result`            | Tras response track                               | `somnio-recompra-agent.ts:408`           |
| `pipeline_decision`  | `natural_silence`                  | No hay templates que enviar                       | `somnio-recompra-agent.ts:435`           |
| `pipeline_decision`  | `timer_transition`                 | Transition por timer expired                      | `sales-track.ts:48`                      |
| `pipeline_decision`  | `intent_transition`                | Transition por intent match                       | `sales-track.ts:74`                      |
| `comprehension`      | `result`                           | Tras Haiku call                                   | `comprehension.ts:94`                    |
| `guard`              | `blocked`                          | R0 low-conf o R1 escape                           | `somnio-recompra-agent.ts:314`           |
| `guard`              | `passed`                           | Ninguna guard activo                              | `somnio-recompra-agent.ts:356`           |
| `template_selection` | `empty_result`                     | Ningun intent matchea                             | `response-track.ts:99`                   |
| `template_selection` | `block_composed`                   | Block final listo                                 | `response-track.ts:191`                  |

## Tests que codifican el contrato

`src/lib/agents/somnio-recompra/__tests__/`:

- **`transitions.test.ts`** — Cubre D-03 (catalogo independiente), D-04 (direccion antes de promos), D-05 (saludo fallback null), D-06 (registro_sanitario), entries de phase `*`, conditions con gates.
- **`response-track.test.ts`** — Cubre D-12 (`direccion_completa` concat con departamento opcional), branches de `resolveSalesActionTemplates`, recompra-only behavior del `precio` intent.
- **`crm-context-poll.test.ts`** — Contrato con crm-reader (feature flag off, timeout, happy path, shape de `_v3:crm_context`).
- **`comprehension-prompt.test.ts`** — Shape y estabilidad del prompt Haiku.

32 tests total (reportado en agent-scope.md §Somnio Recompra Agent §Validacion).

## Rebuild notes para el auditor

Cuando diagnostiques este bot:

1. **Usa los archivos:lineas citados arriba como pointers validos.** El panel los pega a Claude Code literal.
2. **NO inventes archivos/lineas.** Si el evidence del timeline referencia algo que no esta aqui, di "no documentado en spec".
3. **`pipeline_decision.recompra_routed` + `responding_agent_id='somnio-recompra-v1'`** son la evidencia autoritativa del routing (D-10 Plan 01 agent-forensics-panel).
4. **Si `promo` o `ofrecer_promos` aparece en saludo inicial:** es regresion de D-05 — probablemente alguien agrego entry a `transitions.ts` entre `phase: 'initial'` y `on: 'saludo'` que dispara accion.
5. **Si templates de sales-v3 aparecen:** es regresion de D-03 — check `TEMPLATE_LOOKUP_AGENT_ID` en `response-track.ts:36`.
6. **Si `direccion_completa` sale vacia o mal formateada:** es regresion D-12 — check `response-track.ts:344`.
7. **Si no hay `crm_context_used` ni `crm_context_missing_after_wait` en el timeline:** probablemente `platform_config.somnio_recompra_crm_reader_enabled = false` en el workspace. Inocuo, es default.
8. **Si el turn tiene `responding_agent_id='somnio-v3'` Y hay evento `recompra_routed`:** bug critico en el collector merge (Pitfall 1 — ALS perdido en step.run). Mirar `agent-production.ts` __obs merge.

## Cambios recientes

- **2026-04-24:** Creado como parte de `agent-forensics-panel` Plan 03. Consolida agent-scope.md §Somnio Recompra Agent + `.planning/standalone/somnio-recompra-template-catalog/` + `.planning/standalone/somnio-recompra-crm-reader/` + runtime modules + __tests__/.
- **2026-04-22/23:** Phase `somnio-recompra-template-catalog` shipped (5 plans, 22 intents catalog + 3 templates nuevos saludo/preguntar_direccion_recompra/registro_sanitario). D-03/D-04/D-05/D-06/D-12 locked.
- **2026-04-21:** Phase `somnio-recompra-crm-reader` shipped (Inngest preload context + contrato in-process reader).
- **2026-04-24:** Plan 01 `agent-forensics-panel` — `responding_agent_id` persistido correctamente (fix del bug visual de label en el panel). Set-before-run en `webhook-processor.ts:245`.
