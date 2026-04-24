# GoDentist Appointment Agent

**Agent ID (observability):** `godentist`
**Runtime module:** `src/lib/agents/godentist/`
**Workspace:** GoDentist Valoraciones (`godentist-valoraciones` en el robot, workspace Supabase separado)
**Last updated:** 2026-04-24 (Plan 03 agent-forensics-panel)

## Scope

### PUEDE

- Responder a clientes que **agendan valoraciones GRATIS** en una de las 4 sedes GoDentist via WhatsApp inbound (entry via `webhook-processor.ts:469-476` branch `agentId === 'godentist'`).
- Emitir templates del catalogo bajo `agent_id='godentist'` (`GODENTIST_AGENT_ID = 'godentist'` en `config.ts:11`, usado en `response-track.ts:25` + `TemplateManager`).
- Capturar datos criticos: nombre, telefono, sede_preferida (`CRITICAL_FIELDS = ['nombre', 'telefono', 'sede_preferida']` — `constants.ts:126`).
- Consultar disponibilidad real en **Dentos** (sistema del cliente) via el **Robot GoDentist** en Railway (`godentist-production.up.railway.app`) — ver `dentos-availability.ts`.
- Agendar cita final (accion `agendar_cita` → template `cita_agendada`). `SCHEDULE_APPOINTMENT_ACTIONS = { 'agendar_cita' }` — `constants.ts:168-170`.
- Detectar y responder en ingles via template `english_response` (branch dedicada en `response-track.ts:114`, emite `pipeline_decision.english_detected` — `godentist-agent.ts:246`).
- Retomar conversaciones inactivas via timers L1-L6 (diferentes etapas del funnel).

### NO PUEDE

- **Acceder a templates de otros agentes** (somnio-sales-v3, somnio-recompra-v1, config-builder).
- **Agendar sin verificar disponibilidad real** — la accion `mostrar_disponibilidad` DEBE llamar al robot Railway (`checkDentosAvailability`). Si el robot esta down, response-track usa fallback a `HORARIOS_GENERALES_SEDE` (`constants.ts:203-208`).
- **Escribir en tablas fuera del workspace GoDentist** (domain layer filtra por `workspace_id` — Regla 3 CLAUDE.md).
- **Crear pedidos** — el universo de mutaciones del CRM GoDentist es distinto: no hay `orders.create`, solo appointment scheduling (ver `config.ts:38-43` tools: `crm.contact.*` + `whatsapp.message.send`, sin `crm.order.*`).
- **Agendar en sedes que no existen.** Sedes validas: `cabecera`, `mejoras_publicas`, `floridablanca`, `canaveral` (`SEDES` — `constants.ts:107-112`). Aliases `jumbo`/`bosque` → `canaveral`; `centro` → `mejoras_publicas` (`SEDE_ALIASES` — `constants.ts:115-120`).
- **Agendar en domingos o festivos Colombia 2026** — `isNonWorkingDay(fecha)` bloquea (`constants.ts:243-251` + `FESTIVOS_COLOMBIA_2026` 18 fechas).

## Arquitectura

### Pipeline (orden esperado en un turn)

1. **Comprehension** (Claude Haiku structured output) — `comprehension.ts` — detecta intent + secondaryIntent + confidence + datos capturados + sede + servicioDetectado + fechaPreferida + englishDetected. Emite `comprehension.result` (`comprehension.ts:91`).
2. **Guards** — `guards.ts`:
   - R0 low-confidence (< `LOW_CONFIDENCE_THRESHOLD=80` — `constants.ts:176`).
   - R1 escape intents (`ESCAPE_INTENTS = { asesor, reagendamiento, queja, cancelar_cita }` — `constants.ts:51-56`).
   - Emite `guard.blocked` o `guard.passed` (`godentist-agent.ts:197, 238`).
3. **English detection** — si `analysis.englishDetected === true`, bypass del pipeline normal: response-track emite `english_response` template y termina (`godentist-agent.ts:246`, `response-track.ts:114`).
4. **Sales Track** — `sales-track.ts` — state machine. Emite `pipeline_decision.timer_transition` (`sales-track.ts:51`), `pipeline_decision.auto_trigger` (`sales-track.ts:90`) y `pipeline_decision.intent_transition` (`sales-track.ts:111`).
5. **Availability lookup (si aplica)** — cuando accion es `mostrar_disponibilidad`, el agent llama `checkDentosAvailability(fecha, sede)` (robot Railway, timeout 120s) y emite `pipeline_decision.availability_lookup` (`godentist-agent.ts:347`).
6. **Response Track** — `response-track.ts` — template engine. Emite `template_selection.empty_result` (`response-track.ts:180`) y `template_selection.block_composed` (`response-track.ts:276`).
7. **Appointment decision (si aplica)** — `godentist-agent.ts:318` emite `pipeline_decision.appointment_decision` cuando la accion es `agendar_cita` (`SCHEDULE_APPOINTMENT_ACTIONS`).
8. **Natural silence** — si no hay templates que enviar, emite `pipeline_decision.natural_silence` (`godentist-agent.ts:402`).

### Archivos clave

- `src/lib/agents/godentist/config.ts` — `GODENTIST_AGENT_ID = 'godentist'` (linea 11). Tools: `crm.contact.create/update/get`, `whatsapp.message.send` (linea 38-43). States (linea 46-55), validTransitions (linea 57-65).
- `src/lib/agents/godentist/godentist-agent.ts` — orquestador (~430 lineas). 9 events observability (system_event_routed, guard.blocked/passed, english_detected, sales_track_result, appointment_decision, availability_lookup, response_track_result, natural_silence).
- `src/lib/agents/godentist/response-track.ts` — template engine con english branch (`response-track.ts:104-114`). Maps `servicioDetectado` → template intent via `SERVICE_TEMPLATE_MAP` (23 servicios). Display names de sedes en `SEDE_DISPLAY_NAMES` (`response-track.ts:33-38`).
- `src/lib/agents/godentist/transitions.ts` — tabla `TRANSITIONS[]` declarativa (37KB — 51 rules del design doc). Rules 20, 46, 47, 50-53 en guards.ts (escapes + low confidence). Rules 1-19, 21 para `initial`, rules 22+ para phases siguientes.
- `src/lib/agents/godentist/sales-track.ts` — dispatcher timer/user_message + 3 events.
- `src/lib/agents/godentist/constants.ts` — `GD_INTENTS` 23 total (linea 12-45), `INFORMATIONAL_INTENTS` 11 (linea 59-71), `ACTION_TEMPLATE_MAP` 15 entries (linea 133-149), `CRITICAL_FIELDS` (linea 126), `SERVICIOS` 23 (linea 77-101), `SEDES` 4 (linea 107-112), `SEDE_ALIASES` (linea 115-120), `SIGNIFICANT_ACTIONS` (linea 155-165), `HORARIOS_GENERALES_SEDE` (linea 203-208), `FESTIVOS_COLOMBIA_2026` (linea 218-237), `isNonWorkingDay` (linea 243-251), `GD_TIMER_DURATIONS` 7 levels (linea 253-257).
- `src/lib/agents/godentist/comprehension.ts` — Haiku call + event.
- `src/lib/agents/godentist/comprehension-prompt.ts` — prompt Haiku godentist (9KB).
- `src/lib/agents/godentist/state.ts` — `AgentState`, `computeGates`, `mergeAnalysis`, `deserializeState`, `serializeState`, `hasAction`.
- `src/lib/agents/godentist/phase.ts` — `derivePhase(accionesEjecutadas)` — deriva phase desde historial.
- `src/lib/agents/godentist/dentos-availability.ts` — `checkDentosAvailability(date, sede)` via robot Railway (`godentist-production.up.railway.app/api/check-availability`). Timeout 120s. Map `SEDE_TO_SUCURSAL` para nombres que el robot espera.
- `src/lib/agents/godentist/guards.ts` — R0/R1.
- `src/lib/agents/godentist/comprehension-schema.ts` — schema Zod para Haiku output.
- **Tests dedicados:** (no hay `__tests__/` en el modulo godentist a 2026-04-24). Igual que v3, test coverage indirecto.

## Intents habilitados

### Informational (11)

`saludo`, `precio_servicio`, `valoracion_costo`, `financiacion`, `ubicacion`, `horarios`, `materiales`, `menores`, `seguros_eps`, `urgencia`, `garantia` (`constants.ts:59-71`).

### Client actions (6)

`quiero_agendar`, `datos`, `seleccion_sede`, `seleccion_horario`, `confirmar`, `rechazar` (`constants.ts:27-32`).

### Escape (4) — guard R1 los blockea

`asesor`, `reagendamiento`, `queja`, `cancelar_cita` (`constants.ts:35-38`).

### Acknowledgment + Fallback

`acknowledgment`, `otro` (`constants.ts:41-44`).

### Sales actions (mutan estado / agendan cita / retakes)

`pedir_datos`, `pedir_datos_con_sede`, `pedir_datos_parcial`, `pedir_fecha`, `mostrar_disponibilidad`, `mostrar_confirmacion`, `agendar_cita`, `invitar_agendar`, `handoff`, `no_interesa`, `retoma_inicial`, `retoma_datos`, `retoma_fecha`, `retoma_horario`, `retoma_confirmacion` (`ACTION_TEMPLATE_MAP` — `constants.ts:133-149`).

## Sedes, horarios y servicios

### 4 sedes validas

| Internal key       | Display name              | Aliases             |
| ------------------ | ------------------------- | ------------------- |
| `cabecera`         | Cabecera                  | —                   |
| `mejoras_publicas` | Mejoras Publicas          | `centro`            |
| `floridablanca`    | Floridablanca             | —                   |
| `canaveral`        | Canaveral (CC Jumbo El Bosque) | `jumbo`, `bosque`, `cañaveral` |

Source: `constants.ts:107-120`, display names en `response-track.ts:33-38`.

### Horarios generales por sede (fallback cuando Dentos no devuelve slots)

Source: `HORARIOS_GENERALES_SEDE` — `constants.ts:203-208`.

- **Cabecera:** Manana 8:00-12:00, Tarde 2:00-7:00, Sabado 8:00-5:00 (jornada continua).
- **Mejoras Publicas:** Manana 8:30-12:00, Tarde 2:00-6:30, Sabado 8:00-12:00.
- **Floridablanca:** Manana 8:00-12:00, Tarde 2:00-6:00, Sabado 8:00-12:00.
- **Canaveral:** Manana 8:30-12:00, Tarde 2:00-6:30, Sabado 8:00-12:00.

### Servicios (23)

Ver `SERVICIOS` (`constants.ts:77-101`). Mapean a templates `precio_*` via `SERVICE_TEMPLATE_MAP` (`response-track.ts:55+`). Incluye: corona, protesis, alineadores, brackets (convencional/zafiro), autoligado (clasico/pro/ceramico), implante, blanqueamiento, limpieza, extracciones, diseno_sonrisa, placa_ronquidos, calza_resina, rehabilitacion, radiografia, endodoncia, carillas, ortopedia_maxilar, ortodoncia_general, otro_servicio.

### Festivos Colombia 2026

18 fechas locked en `FESTIVOS_COLOMBIA_2026` (`constants.ts:218-237`). Funcion `isNonWorkingDay(fecha)` tambien bloquea domingos (`constants.ts:243-251`). La comprehension y sales-track DEBEN consultar esto antes de proponer `mostrar_disponibilidad`.

## Comportamiento esperado por intent

### `saludo` en initial

- **Action:** `silence` (Rule 1 — `transitions.ts:57-62`).
- **Razon:** saludo no dispara captura ni invitacion. Espera al cliente a expresar quiero_agendar o preguntar por un servicio.
- **Archivo:** `transitions.ts:57-62`.

### `quiero_agendar` en initial

- **Sin datos criticos:** `pedir_datos` + timer L0 (8 min — Rule 2, `transitions.ts:68-75`).
- **Con datos criticos + sin fecha:** `pedir_fecha` + timer L3 (Rule 3).
- **Con datos criticos + fecha:** `mostrar_disponibilidad` (consulta Dentos).

### `seleccion_sede`

- Cliente elige sede. Si datos criticos completos → `pedir_fecha`. Sino → `pedir_datos_con_sede` (variante que ya sabe la sede).

### `seleccion_horario` post `mostrar_disponibilidad`

- **Con horario valido de los mostrados:** accion `mostrar_confirmacion` → template `confirmar_cita`.
- **Horario fuera de la lista:** re-mostrar `mostrar_disponibilidad` o volver a `pedir_fecha`.

### `confirmar` en confirming

- **Accion `agendar_cita`** → template `cita_agendada` con 5 variables: nombre, sucursal, fecha, hora, direccion.
- **Integra con robot:** el robot real es quien agenda en Dentos tras el response track. Ver `dentos-availability.ts` + llamada externa a Railway.

### `precio_servicio` / `valoracion_costo` / `financiacion` / `materiales` / etc.

- Informational — template directo via `INFORMATIONAL_INTENTS`.
- `precio_servicio` tiene mapping especial: `servicioDetectado` de comprehension → template `precio_<servicio>` (23 servicios). Ver `SERVICE_TEMPLATE_MAP` (`response-track.ts:55+`).

### Escape intents

- Guard R1 blockea. `reagendamiento` y `cancelar_cita` son especificos godentist (no en v3 ni recompra) — el cliente quiere cambiar o cancelar una cita ya agendada, requiere handoff humano.

### English detection

- **Bypass total del pipeline.** Si `analysis.englishDetected === true`, response-track carga `english_response` template y retorna (`response-track.ts:114`).
- **Evento:** `pipeline_decision.english_detected` (`godentist-agent.ts:246`).

### Timer retakes

| Timer | Cuando                           | Razon                        | Duracion real | Archivo               |
| ----- | -------------------------------- | ---------------------------- | ------------- | --------------------- |
| L0    | Sin datos 8 min                  | `retoma_datos`               | 480s          | constants.ts:254      |
| L1    | Info respondida, invitar a agendar | `invitar_agendar`          | 180s (3 min)  | constants.ts:254      |
| L2    | Info + ack, 5 min                | (retake variant)             | 300s          | constants.ts:254      |
| L3    | Esperando fecha                  | `retoma_fecha`               | 300s          | constants.ts:254      |
| L4    | Esperando seleccion horario      | `retoma_horario`             | 360s (6 min)  | constants.ts:254      |
| L5    | Esperando confirmacion           | `retoma_confirmacion`        | 180s (3 min)  | constants.ts:254      |
| L6    | Ack/silencio                     | fallback                     | 90s           | constants.ts:254      |

Duraciones en `GD_TIMER_DURATIONS` (`constants.ts:253-257`). Presets `rapido`/`instantaneo` para testing.

## Contratos con otros modulos

### Robot GoDentist (Railway — `godentist-production.up.railway.app`)

- **Endpoint:** `POST /api/check-availability` con body `{ workspaceId: 'godentist-valoraciones', username, password, sucursal, date }`. Timeout 120s (robot scrapea multiples doctores en Dentos).
- **Credentials:** JROMERO / 123456 (hardcoded en `dentos-availability.ts:9`).
- **Response:** `{ success, slots: { manana, tarde }, error? }`. Si `success=false` o response.status != 200, fallback a `HORARIOS_GENERALES_SEDE`.
- **Deploy:** Railway deploy desde `godentist/robot-godentist/` root del morfx repo (NO separate repo).
- **Dentos agenda horizon:** ~1 semana adelante. Mas alla → 0 slots → response-track usa horarios generales de sede.

### Templates

- Lookup por `GODENTIST_AGENT_ID = 'godentist'` (`config.ts:11`, importado en `response-track.ts:25`).
- Template productivo clave: `confirmacion_asist_godentist` con 5 vars (nombre, sucursal, fecha, hora, direccion).

### Domain layer (Regla 3 CLAUDE.md)

- Godentist NO crea pedidos. Solo `crm.contact.create/update/get` + `whatsapp.message.send` (config tools).
- El "agendamiento" final va al robot — no hay insert en `orders` del CRM Morfx.

### Entry gate (webhook-processor)

- Entry path: `webhook-processor.ts:469-476` (branch `agentId === 'godentist'`).
- Set-before-run: `getCollector()?.setRespondingAgentId('godentist')` en `webhook-processor.ts:476` (D-10 Plan 01 agent-forensics-panel).

## Observability events emitidos

| Categoria            | Label                              | Cuando                                            | Archivo                                  |
| -------------------- | ---------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `pipeline_decision`  | `system_event_routed`              | Entry con timer event                             | `godentist-agent.ts:74`                  |
| `pipeline_decision`  | `english_detected`                 | Comprehension detecto ingles — bypass             | `godentist-agent.ts:246`                 |
| `pipeline_decision`  | `sales_track_result`               | Tras sales track                                  | `godentist-agent.ts:302`                 |
| `pipeline_decision`  | `appointment_decision`             | Accion es `agendar_cita` (SCHEDULE_*)             | `godentist-agent.ts:318`                 |
| `pipeline_decision`  | `availability_lookup`              | Llamada al robot Railway                          | `godentist-agent.ts:347`                 |
| `pipeline_decision`  | `response_track_result`            | Tras response track                               | `godentist-agent.ts:371`                 |
| `pipeline_decision`  | `natural_silence`                  | No hay templates que enviar                       | `godentist-agent.ts:402`                 |
| `pipeline_decision`  | `timer_transition`                 | Transition por timer expired                      | `sales-track.ts:51`                      |
| `pipeline_decision`  | `auto_trigger`                     | Auto-trigger (e.g., fecha-just-set sin datos)     | `sales-track.ts:90`                      |
| `pipeline_decision`  | `intent_transition`                | Transition por intent match                       | `sales-track.ts:111`                     |
| `comprehension`      | `result`                           | Tras Haiku call                                   | `comprehension.ts:91`                    |
| `guard`              | `blocked`                          | R0 low-conf o R1 escape                           | `godentist-agent.ts:197`                 |
| `guard`              | `passed`                           | Ninguna guard activo                              | `godentist-agent.ts:238`                 |
| `template_selection` | `empty_result`                     | Ningun intent matchea                             | `response-track.ts:180`                  |
| `template_selection` | `block_composed`                   | Block final listo                                 | `response-track.ts:276`                  |

## Tests que codifican el contrato

**(No hay tests dedicados en `src/lib/agents/godentist/__tests__/` a 2026-04-24.)** Como v3, testing indirecto:

- Tests de observability (`src/lib/observability/__tests__/`) — collector + flush path.
- Tests de agent-forensics — condense-timeline reconoce categorias.
- Backfill SQL (Plan 01 `agent-forensics-panel`) reporta 5775 turns historicos con `('godentist', 'godentist')` — validacion empirica de que el agente respondio en prod durante semanas sin regression del routing.
- Integracion manual via bot en prod (workspace GoDentist).

## Rebuild notes para el auditor

Cuando diagnostiques este bot:

1. **`responding_agent_id='godentist'`** indica que godentist respondio. Si hay `agent_id='godentist'` pero `responding_agent_id=null` en turns viejos: pre-backfill row. Plan 01 SQL resolvio esto.
2. **Si `pipeline_decision.english_detected`:** el response se truncó al template `english_response` y no hubo captura. Esperado.
3. **Si `pipeline_decision.availability_lookup` aparece + tarda mucho:** el robot Railway esta lento (timeout 120s). Si el turn durationMs > 60s, mirar latency del robot.
4. **Si `mostrar_disponibilidad` NO tiene `availability_lookup` precedente:** regresion — el agent deberia consultar Dentos antes de mostrar slots. Mirar `godentist-agent.ts:347`.
5. **Si `agendar_cita` se emite y NO hay `appointment_decision` event:** regresion del instrumentation — el agent debe emitir el event cuando SCHEDULE_APPOINTMENT_ACTIONS matchea.
6. **Si el template usa una sede que no esta en SEDES:** comprehension devolvio algo invalido o el SEDE_ALIAS no se resolvio. Mirar `response-track.ts:325-330`.
7. **Si el turn es un sabado tarde o domingo + hay `mostrar_disponibilidad`:** 0 slots esperado para sabado tarde (solo Cabecera tiene jornada continua); domingo bloqueado por `isNonWorkingDay`.
8. **Si hay `ofi_inter.*` o `retake.decision` event:** BUG — esos son categorias de `somnio-v3`, no de godentist. Posible collision de collector entre turns.

## Cambios recientes

- **2026-04-24:** Creado como parte de `agent-forensics-panel` Plan 03. Consolida `.claude/rules/agent-scope.md` (no tiene entry explicita de godentist — derivado de runtime modules + config + constants + MEMORY.md `godentist_horarios_sedes`), `src/lib/agents/godentist/*.ts`, robot integration docs en MEMORY.md, y 5775 turns historicos (backfill Plan 01).
- **2026-04-24:** Plan 01 `agent-forensics-panel` — `setRespondingAgentId('godentist')` en `webhook-processor.ts:476` (set-before-run) + backfill SQL que confirma 5775 turns historicos de godentist sin routing ambiguity.
- **Phase 42.1:** observability collector instrumentado — 15 events propios del agent documentados arriba.
- **Historico:** godentist agente shipped hace ~1 mes (march 2026), mature pipeline. 4 sedes + 23 servicios en catalogo.

## Notas para el mantenedor

`godentist` no tiene entry explicita en `.claude/rules/agent-scope.md` a 2026-04-24. Cuando se haga la proxima revision, considerar agregar seccion `### GoDentist Appointment Agent` paralela a las existentes. Los campos a poblar (scope PUEDE/NO PUEDE, integration con robot Railway, restricciones de sedes/festivos) estan en esta spec. Esta spec es la fuente para esa actualizacion.

Robot GoDentist docs adicionales:
- `godentist/robot-godentist/` (root del proyecto Morfx — Railway deploy target).
- MEMORY.md "Robot GoDentist (Railway)" section.
- `.planning/debug/resolved/robot-coordinadora-deployment.md` — patrones generales de debugging Playwright robots (aplicables al de godentist).
