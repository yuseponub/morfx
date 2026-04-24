# Somnio Sales v3

**Agent ID (observability):** `somnio-sales-v3`
**Runtime module:** `src/lib/agents/somnio-v3/`
**Workspace:** Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`)
**Last updated:** 2026-04-24 (Plan 03 agent-forensics-panel)

## Scope

### PUEDE

- Responder a **leads nuevos** (contactos NO clientes — `contactData?.is_client === false/null`) del workspace Somnio via WhatsApp inbound (entry via `webhook-processor.ts:444-453` branch `v3` por defecto cuando `resolveAgentIdForWorkspace` resuelve `'somnio-v3'`).
- Emitir templates del catalogo bajo `agent_id='somnio-sales-v3'` (via `SOMNIO_V3_AGENT_ID` constante en `config.ts:11`, usado en `response-track.ts` por `TemplateManager.getTemplatesForIntents`).
- Capturar datos criticos: nombre, apellido, telefono, direccion, ciudad, departamento (`CRITICAL_FIELDS_NORMAL` — `constants.ts:90-97`) o 5 campos sin direccion en modo ofi inter (`CRITICAL_FIELDS_OFI_INTER` — `constants.ts:100-106`).
- Crear pedido en CRM Somnio via sales actions `crear_orden` / `crear_orden_sin_promo` / `crear_orden_sin_confirmar` (`CREATE_ORDER_ACTIONS` — `constants.ts:189-191`). Productos Somnio 90 Caps x1/x2/x3 con precios fijos en `PACK_PRICES_NUMERIC` (`constants.ts:150-154`).
- Rutear a modo **ofi inter** (envio internacional / oficina externa) cuando el cliente esta en una ciudad no-capital o fuera del radio de delivery — emite eventos `ofi_inter.route_selected` (`sales-track.ts:144, 151, 159, 187`).
- Retomar conversaciones inactivas via timers L0/L1/L5/L6/L7 — acciones `retoma`, `retoma_datos`, `retoma_datos_parciales`, `retoma_datos_implicito`, `retoma_ofi_inter` (`transitions.ts:307-407`).

### NO PUEDE

- **Compartir catalogo con `somnio-recompra-v1`.** v3 usa su catalogo bajo `agent_id='somnio-sales-v3'`; recompra tiene el suyo (D-03 somnio-recompra-template-catalog). Si el lookup apunta al catalogo equivocado es regresion.
- **Responder a clientes recurrentes** (`contactData?.is_client === true`). Esos van a `somnio-recompra-v1` (`webhook-processor.ts:174-188`). Si un turn de v3 tiene `is_client=true` en el payload, es routing bug.
- **Acceder a templates de otros agentes** (recompra, godentist, config-builder).
- **Escribir en tablas fuera del workspace Somnio** (domain layer filtra por `workspace_id` — Regla 3 CLAUDE.md).
- **Pedir correo / barrio como criticos.** Esos son `EXTRAS_NORMAL` (`constants.ts:113`) — se piden despues de los 6 criticos, y pueden ser negados.

## Arquitectura

### Pipeline (orden esperado en un turn)

1. **Comprehension** (Claude Haiku structured output) — `comprehension.ts` — detecta intent + secondaryIntent + confidence + pack + datos capturados + ciudad + departamento + ofiInterJustSet + servicio. Emite `comprehension.result` (`comprehension.ts:90`).
2. **Guards** — `guards.ts`:
   - R0 low-confidence (< `LOW_CONFIDENCE_THRESHOLD=80` — `constants.ts:133`).
   - R1 escape intents (`ESCAPE_INTENTS = { asesor, queja, cancelar }` — `constants.ts:53-57`).
   - Emite `guard.blocked` o `guard.passed` (`somnio-v3-agent.ts:197, 239`).
3. **Sales Track** — `sales-track.ts` — state machine. Soporta dos tipos de eventos:
   - `timer_expired` (levels 0-8) → lookup en `resolveTransition(phase, 'timer_expired:N', ...)`.
   - `user_message` con intent + changes → lookup en `resolveTransition(phase, intent, state, gates, changes)`.
   - Emite `retake.decision` cuando la accion resuelta empieza con `retoma` (`sales-track.ts:52`) y `ofi_inter.route_selected` en tres branches de ruteo geografico (`sales-track.ts:144, 151, 159, 187`).
4. **Response Track** — `response-track.ts` — template engine. Combina `salesTemplateIntents` (del sales action) + `infoTemplateIntents` (de INFORMATIONAL_INTENTS). Soporta `secondarySalesAction` (p.ej. `ask_ofi_inter` junto con action principal — `response-track.ts:52-59`). Emite `template_selection.block_composed` (`response-track.ts:188`), `retake.template_selected` (`response-track.ts:248`) y `ofi_inter.template_selected` (`response-track.ts:255, 260`).
5. **Block composition** — `composeBlock` de `@/lib/agents/somnio/block-composer` arma el mensaje final (texto + imagen opcional con `delaySeconds`).
6. **Order decision (si aplica)** — `somnio-v3-agent.ts:282` emite `pipeline_decision.order_decision` cuando la accion es `crear_orden*`.

### Archivos clave

- `src/lib/agents/somnio-v3/config.ts` — `SOMNIO_V3_AGENT_ID = 'somnio-sales-v3'` (linea 11). Tools del AgentConfig (linea 38-44), states (linea 46-55), validTransitions (linea 57-65), confidenceThresholds (linea 68-73).
- `src/lib/agents/somnio-v3/response-track.ts` — importa `SOMNIO_V3_AGENT_ID` de config (linea 21), pasa a `templateManager.getTemplatesForIntents(SOMNIO_V3_AGENT_ID, ...)`. Branches sales action (`resolveSalesActionTemplates` — similar shape a recompra con mas casos).
- `src/lib/agents/somnio-v3/sales-track.ts` — dispatcher timer/user_message + emite eventos retake/ofi_inter.
- `src/lib/agents/somnio-v3/transitions.ts` — tabla `TRANSITIONS[]` declarativa (~30+ entries, vs ~15 de recompra). Secciones: ANY-phase (no_interesa, rechazar, acknowledgment), Ofi Inter, Capturing data, Promos shown, Confirming, Retakes por timer, Silence por L5/L6/L7/L8.
- `src/lib/agents/somnio-v3/constants.ts` — `V3_INTENTS` 22 total (linea 12-47), `INFORMATIONAL_INTENTS` 13 (linea 64-68), `ACTION_TEMPLATE_MAP` (linea 71-83), `CRITICAL_FIELDS_NORMAL` (linea 90-97), `CRITICAL_FIELDS_OFI_INTER` (linea 100-106), `EXTRAS_NORMAL` / `EXTRAS_OFI_INTER` (linea 113-116), `CAPITAL_CITIES` (linea 123-127), `PACK_PRICES` + `PACK_PRICES_NUMERIC` + `PACK_PRODUCTS` (linea 139-164), `SIGNIFICANT_ACTIONS` / `CRM_ACTIONS` / `CREATE_ORDER_ACTIONS` (linea 176-191), `V3_TIMER_DURATIONS` 9 levels (linea 213-217).
- `src/lib/agents/somnio-v3/comprehension.ts` — Haiku call + comprehension event.
- `src/lib/agents/somnio-v3/comprehension-prompt.ts` — prompt Haiku v3.
- `src/lib/agents/somnio-v3/somnio-v3-agent.ts` — orquestador (~340 lineas).
- `src/lib/agents/somnio-v3/state.ts` — `AgentState`, `Gates`, `StateChanges`, `camposFaltantes`, `buildResumenContext`.
- `src/lib/agents/somnio-v3/delivery-zones.ts` — `lookupDeliveryZone(ciudad)` + `formatDeliveryTime`.
- `src/lib/agents/somnio-v3/guards.ts` — R0/R1.
- `src/lib/agents/somnio-v3/types.ts` — `TipoAccion`, `Phase`, `TimerSignal`, `SalesEvent`.
- `src/lib/agents/somnio-v3/ARCHITECTURE.md` (46KB) — doc historico detallado del pipeline.
- **Tests dedicados:** (no hay `__tests__/` en el modulo v3 a 2026-04-24). Testing indirecto via tests de observability + agent-forensics.

## Intents habilitados

### Informational (13)

`saludo`, `precio`, `promociones`, `contenido`, `formula`, `como_se_toma`, `pago`, `envio`, `ubicacion`, `contraindicaciones`, `dependencia`, `efectividad`, `tiempo_entrega` (`constants.ts:64-68`). Incluye 3 informational mas que recompra: `contenido`, `formula`, `como_se_toma`, `efectividad` (el lead nuevo necesita info del producto que el cliente recurrente ya conoce).

### Client actions (5)

`datos`, `quiero_comprar`, `seleccion_pack`, `confirmar`, `rechazar` (`constants.ts:30-34`). NO incluye `confirmar_direccion` (ese es exclusivo recompra, donde se preloaded la direccion).

### Escape (4)

`asesor`, `queja`, `cancelar`, `no_interesa` (`constants.ts:36-40`).

### Acknowledgment + Fallback

`acknowledgment`, `otro` (`constants.ts:42-46`).

### Sales actions (mutan estado / crean pedido / retakes)

`pedir_datos`, `pedir_datos_quiero_comprar_implicito`, `ofrecer_promos`, `mostrar_confirmacion`, `cambio`, `crear_orden`, `crear_orden_sin_promo`, `crear_orden_sin_confirmar`, `ask_ofi_inter`, `confirmar_cambio_ofi_inter`, `retoma_ofi_inter`, `retoma`, `retoma_datos`, `retoma_datos_parciales`, `retoma_datos_implicito`, `handoff`, `rechazar`, `no_interesa`, `silence`. Ver `TipoAccion` en `types.ts`.

## Comportamiento esperado por intent

### `saludo` en initial

- **Que responde:** template `saludo` (texto CORE greeting + imagen producto COMPLEMENTARIA) sin action.
- **Archivo:** rama informational en response-track (similar a recompra pero con catalogo v3).

### `datos` en initial / capturing_data (ofi inter rules)

- **Ofi Inter ya detectado + sin direccion previa:** accion `silence` + `enterCaptura: true` + timer L7 (debounce 2min). Previene spamming preguntas antes de confirmar la oficina (`transitions.ts:74-82`).
- **Ofi Inter + direccion previa:** accion `confirmar_cambio_ofi_inter` (cambio tardio). Explicit en `transitions.ts:97-98` (capturing_data), 108-109 (promos_shown), 119-120 (confirming).
- **No ofi inter + ciudad no-capital detectada:** accion `ask_ofi_inter` — pregunta si quiere envio a oficina (`transitions.ts:130, 141`).
- **Capturing data, timer L1 expired:** `ask_ofi_inter` con condicion `!state.ofiInter && !alreadyAsked` (`transitions.ts:152-157`).

### `quiero_comprar`

- **Leads nuevos (v3):** accion `pedir_datos` o `pedir_datos_quiero_comprar_implicito` segun si tiene datos parciales. Diferencia vs recompra: v3 pide datos desde cero, recompra preload los tiene y solo confirma direccion.

### `seleccion_pack` en promos_shown

- Similar a recompra: con `gates.datosCriticos` → `mostrar_confirmacion`, sin → `pedir_datos`.

### `confirmar` en confirming

- Similar a recompra: con datos + pack → `crear_orden` → template `confirmacion_orden_same_day` / `confirmacion_orden_transportadora` segun `lookupDeliveryZone(ciudad)`.

### Timer retakes

| Timer | Cuando           | Action                        | Archivo          |
| ----- | ---------------- | ----------------------------- | ---------------- |
| L0    | Sin datos 10min  | `retoma_datos`                | transitions.ts:309 |
| L1    | Datos parciales  | `retoma_datos_parciales` o `ask_ofi_inter` | transitions.ts:316, 152 |
| L3    | Promos sin resp  | `crear_orden_sin_promo`       | (similar a recompra) |
| L4    | Pack sin confirm | `crear_orden_sin_confirmar`   | (similar a recompra) |
| L5    | Silencio initial | `retoma` (inicial)            | transitions.ts:405 |
| L6    | Implicito 6min   | `retoma_datos_implicito`      | transitions.ts:397 |
| L7    | Ofi inter 2min   | `retoma_ofi_inter` + L8 grace | transitions.ts:365 |
| L8    | Extras ofi inter | (pendiente — depende branch)  | — |

Duraciones en `V3_TIMER_DURATIONS` (`constants.ts:213-217`) — preset `real` usa valores prod, `rapido` / `instantaneo` para testing.

### Ofi Inter flow

1. Comprehension setea `changes.ofiInterJustSet = true` cuando detecta intent de envio a oficina.
2. Transition entry matching dispara `ask_ofi_inter` si no se habia preguntado.
3. Cliente confirma → `state.ofiInter = true`, switch a `CRITICAL_FIELDS_OFI_INTER` (sin direccion, con cedula).
4. Si cambia de opinion despues (direccion previa): `confirmar_cambio_ofi_inter`.

## Transiciones clave

Tabla con las transitions mas relevantes. Para lista completa ver `transitions.ts:30-407`.

| Desde phase      | On                    | Accion                        | Condicion                           | Archivo           |
| ---------------- | --------------------- | ----------------------------- | ----------------------------------- | ----------------- |
| *                | no_interesa           | no_interesa                   | —                                   | transitions.ts:34 |
| *                | rechazar              | rechazar                      | —                                   | transitions.ts:43 |
| promos_shown     | acknowledgment        | silence                       | !gates.packElegido                  | transitions.ts:54 |
| *                | acknowledgment        | silence + L5                  | —                                   | transitions.ts:62 |
| initial          | datos                 | silence + enterCaptura + L7   | ofiInterJustSet && !direccion       | transitions.ts:74 |
| capturing_data   | datos                 | silence + enterCaptura + L7   | ofiInterJustSet && !direccion       | transitions.ts:87 |
| capturing_data   | datos                 | confirmar_cambio_ofi_inter    | ofiInterJustSet && direccion        | transitions.ts:98 |
| promos_shown     | datos                 | confirmar_cambio_ofi_inter    | ofiInterJustSet && direccion        | transitions.ts:108 |
| confirming       | datos                 | confirmar_cambio_ofi_inter    | ofiInterJustSet && direccion        | transitions.ts:119 |
| initial          | datos                 | ask_ofi_inter                 | (logica de capital city + no ofi)   | transitions.ts:130 |
| capturing_data   | datos                 | ask_ofi_inter                 | idem                                | transitions.ts:141 |
| capturing_data   | timer_expired:1       | ask_ofi_inter                 | !ofiInter && !alreadyAsked          | transitions.ts:152 |
| capturing_data   | timer_expired:0       | retoma_datos                  | —                                   | transitions.ts:309 |
| capturing_data   | timer_expired:1       | retoma_datos_parciales        | —                                   | transitions.ts:316 |
| capturing_data   | timer_expired:7       | retoma_ofi_inter              | —                                   | transitions.ts:365 |
| capturing_data   | timer_expired:6       | retoma_datos_implicito        | —                                   | transitions.ts:397 |
| initial          | timer_expired:5       | retoma                        | —                                   | transitions.ts:405 |

**Diferencias clave vs recompra:**

- v3 tiene phase `capturing_data` dedicada (recompra no — preload elimina la fase de captura inicial).
- v3 tiene 9 timer levels (L0-L8), recompra solo 3 (L3, L4, L5).
- v3 tiene flow ofi_inter completo, recompra lo omite (clientes ya resolvieron eso en v1).
- v3 tiene 4+ variantes de retake, recompra solo `retoma` genérico (L5 → retoma_inicial).

## Contratos con otros modulos

### Templates

- TODAS las lookups pasan por `SOMNIO_V3_AGENT_ID = 'somnio-sales-v3'` (`config.ts:11`, importado en `response-track.ts:21`).
- `TemplateManager` y `composeBlock` son compartidos con recompra (viven en `src/lib/agents/somnio/`) pero el `agentId` parameter separa los catalogos.

### Domain layer (Regla 3 CLAUDE.md)

- `crear_orden*` → llama `domain/orders.createOrder(...)` via V3ProductionRunner. Productos + precios de `PACK_PRODUCTS` + `PACK_PRICES_NUMERIC` (single source of truth en `constants.ts`).

### Entry gate (webhook-processor)

- Entry path: `webhook-processor.ts:444-453` (branch v3 por defecto cuando `agentId === 'somnio-v3'`).
- Set-before-run: `getCollector()?.setRespondingAgentId('somnio-v3')` en `webhook-processor.ts:450` (D-10 Plan 01 agent-forensics-panel).

## Observability events emitidos

| Categoria            | Label                              | Cuando                                            | Archivo                                    |
| -------------------- | ---------------------------------- | ------------------------------------------------- | ------------------------------------------ |
| `pipeline_decision`  | `system_event_routed`              | Entry con system event (timer, etc.)              | `somnio-v3-agent.ts:73`                    |
| `pipeline_decision`  | `sales_track_result`               | Tras sales track                                  | `somnio-v3-agent.ts:259`                   |
| `pipeline_decision`  | `order_decision`                   | Accion es `crear_orden*`                          | `somnio-v3-agent.ts:282`                   |
| `pipeline_decision`  | `response_track_result`            | Tras response track                               | `somnio-v3-agent.ts:299`                   |
| `pipeline_decision`  | `natural_silence`                  | No hay templates que enviar                       | `somnio-v3-agent.ts:326`                   |
| `comprehension`      | `result`                           | Tras Haiku call                                   | `comprehension.ts:90`                      |
| `guard`              | `blocked`                          | R0 low-conf o R1 escape                           | `somnio-v3-agent.ts:197`                   |
| `guard`              | `passed`                           | Ninguna guard activo                              | `somnio-v3-agent.ts:239`                   |
| `template_selection` | `empty_result`                     | Ningun intent matchea                             | `response-track.ts:94`                     |
| `template_selection` | `block_composed`                   | Block final listo                                 | `response-track.ts:188`                    |
| `retake`             | `decision`                         | Action resuelta empieza con `retoma` (via timer)  | `sales-track.ts:52`                        |
| `retake`             | `decision`                         | Action retoma resuelta via user_message           | `sales-track.ts:168`                       |
| `retake`             | `template_selected`                | Template de retake elegido                        | `response-track.ts:248`                    |
| `ofi_inter`          | `route_selected`                   | Branch ofi_inter tomado (4 variantes)             | `sales-track.ts:144, 151, 159, 187`        |
| `ofi_inter`          | `template_selected`                | Template ofi_inter elegido                        | `response-track.ts:255, 260`               |

**Nota:** v3 emite ademas de los events comunes, `retake.*` y `ofi_inter.*` que son categorias propias que el whitelist del condensed timeline (Plan 02) debe reconocer. Confirmado en `CORE_CATEGORIES` de `src/lib/agent-forensics/condense-timeline.ts`.

## Tests que codifican el contrato

**(No hay tests dedicados en `src/lib/agents/somnio-v3/__tests__/` a 2026-04-24.)** El comportamiento se verifica via:

- Tests de observability (`src/lib/observability/__tests__/`) — cubren el collector + flush path que registra los events v3.
- Tests de agent-forensics (`src/lib/agent-forensics/__tests__/condense-timeline.test.ts`) — cubren que las categorias `retake` / `ofi_inter` pasan el whitelist del timeline condensado.
- Integracion E2E via sandbox UI (`/sandbox`) con preset `instantaneo` para runtime rapido.

**Gap conocido:** v3 tiene la logica mas compleja (ofi inter + 4 retake variants + 9 timers) pero menos coverage automatizado. Plan futuro podria portar el patron de `somnio-recompra/__tests__/` a v3.

## Rebuild notes para el auditor

Cuando diagnostiques este bot:

1. **`responding_agent_id='somnio-v3'`** (persistido en schema como string legacy — ver Plan 01 SUMMARY `AgentId` union) indica que el bot respondio v3 (NO recompra). Si ves `agent_id='somnio-v3' + responding_agent_id='somnio-recompra-v1'`: routing OK, el lead fue marcado is_client y ruteado.
2. **Si hay `retake.decision` + turn sin mensaje user inbound:** el turn fue disparado por un timer. Ver `system_event_routed` (linea 73) para el trigger.
3. **Si hay `ofi_inter.route_selected` N veces en un solo turn:** multiple branches tocaron el flow — probable bug de logica en `sales-track.ts`. Esperar al max 1.
4. **Si `pedir_datos` aparece pero el cliente ya dio todos los criticos:** probable regresion de `gates.datosCriticos` calculation — mirar `state.ts camposFaltantes()`.
5. **Si `crear_orden` sin `confirmar` precedente:** debe ser `crear_orden_sin_promo` (timer L3) o `crear_orden_sin_confirmar` (timer L4). Si es `crear_orden` a secas sin timer expired, es bug.
6. **Si template de sales-v3 aparece en un turn de `somnio-recompra-v1`:** regresion D-03. No aplica a este bot, pero lo menciono porque es el routing bug inverso.
7. **Si el turn tiene `is_client=true` en payload + `responding_agent_id='somnio-v3'`:** BUG — debia rutear a recompra. Ver `webhook-processor.ts:174-188`.

## Cambios recientes

- **2026-04-24:** Creado como parte de `agent-forensics-panel` Plan 03. Consolida `.claude/rules/agent-scope.md` (no tiene entry explicita de somnio-sales-v3 — derivado de runtime modules + config + constants), `src/lib/agents/somnio-v3/*.ts`, `ARCHITECTURE.md` (doc historico del modulo), y tests indirectos.
- **2026-04-24:** Plan 01 `agent-forensics-panel` — `setRespondingAgentId('somnio-v3')` en `webhook-processor.ts:450` (set-before-run) + backfill SQL que identifica historicamente 2045 turns con `('somnio-v3', 'somnio-v3')` (v3 respondio, non-client conversations).
- **Phase 42.1 (Phase 42.1):** observability collector instrumentado + `retake.decision` event agregado en `sales-track.ts:52` (canonical signal del retake mechanism firing en prod).

## Notas para el mantenedor

`somnio-sales-v3` no tiene entry explicita en `.claude/rules/agent-scope.md` a 2026-04-24. Cuando se haga la proxima revision del archivo, considerar agregar seccion `### Somnio Sales Agent v3` paralela a `### Somnio Recompra Agent`. Los campos a poblar ya estan en esta spec (scope PUEDE/NO PUEDE, observability events, ofi_inter flow). Esta spec es la fuente para esa actualizacion.
