---
standalone: somnio-sales-v3-pw-confirmation
phase: research
date: 2026-04-27
status: research-complete
upstream: CONTEXT.md (24 D-locked) + DISCUSSION-LOG.md
downstream: plan-phase
---

# RESEARCH — somnio-sales-v3-pw-confirmation

> **Mandate source:** CONTEXT.md D-24 (cobertura research) + D-22 (observability) + D-23 (tests) + D-05 (CRM reader bloqueante — patrón nuevo).
> **Read-only research.** No scaffolding, no migrations, no code changes.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-24, copy verbatim of relevant items)

- **D-01** `agent_id = somnio-sales-v3-pw-confirmation` (canónico para registry, sessions, observability, templates, rate-limit).
- **D-02** Routing controlado por usuario via `/agentes/routing-editor`. **Sin feature flag** (la sola ausencia de regla activa garantiza aislamiento). Scope técnico = aparecer como opción seleccionable.
- **D-03** Coexistencia con sales-v3 = el agente toma todo el turno cuando routing lo activa (informacionales + sales actions + confirmación). NO delega a sales-v3.
- **D-04** Pedido activo = más reciente por `created_at DESC` en stages `NUEVO PAG WEB` / `FALTA INFO` / `FALTA CONFIRMAR`.
- **D-05** ★ **CRM Reader BLOQUEANTE** (≠ recompra que es non-blocking). El agente espera (bloquea) hasta que reader termine antes de la primera respuesta.
- **D-06** Datos obligatorios para envío = mismos que sales-v3 hoy (research inventaría — ver §D.3).
- **D-07** Fuente = response del CRM reader; agente NO consulta DB directamente.
- **D-08** Mutaciones via crm-writer (two-step propose→confirm). NUNCA mutación directa al domain ni Supabase.
- **D-09** "Sí" sólo cuenta si el último template enviado fue `confirmar_compra` (asunción: pre-activación envió `pedido_recibido_v2` + `direccion_entrega` + `confirmar_compra`).
- **D-10** Confirmación → mover stage a `CONFIRMADO` + templates con variación municipal por tiempo de entrega.
- **D-11** "No" → primero `agendar_pregunta` ("¿deseas agendarlo para alguna fecha?"); si insiste no → cancelar sin mover stage + handoff stub.
- **D-12** "Cambiar dirección" → reabrir captura, actualizar `orders.shipping_address` via crm-writer.
- **D-13** "Editar promo" → editar items via crm-writer; si writer NO soporta → escala humano + gap doc.
- **D-14** "Espera lo pienso" → mover stage a `FALTA CONFIRMAR` + template `claro_que_si_esperamos`.
- **D-15** Catálogo propio bajo `agent_id='somnio-sales-v3-pw-confirmation'` (lección recompra-template-catalog 2026-04-23).
- **D-16** Variación municipal = replicar lógica sales-v3 (research mapea, ver §A.2).
- **D-17/D-18** Scope PUEDE/NO PUEDE definidos. NO crea pedidos, NO crea/edita tags/pipelines/stages/templates/users.
- **D-19** Workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`).
- **D-20** Tools draft: `crm_reader.*` (BLOQUEANTE), `crm_writer.propose+confirm`, `send_template`, `handoff_human` (stub). Excluir `crear_orden`.
- **D-21** Handoff = stub (sin materialización CRM). Solo registra evento + flag sesión.
- **D-22** Observability set abierto (research propone — ver §A.5 + §I).
- **D-23** Tests set abierto (research propone — ver §A.4 + §I).
- **D-24** Cobertura de research = todos los puntos de checklist (este documento).

### Claude's Discretion

- Diseño del CRM reader bloqueante (D-05) — opciones A/B/C documentadas en §B.1.
- Set definitivo de templates a clonar/reestructurar/crear — ver §I.
- Set definitivo de tools, tests, observability events — ver §I.

### Deferred Ideas (OUT OF SCOPE)

- Materialización técnica de `handoff_human` (D-21). Se construye en standalone futuro.
- Agregar tools de creación de pedidos al agente (D-20 explicit excluye).

---

## A. Análisis del agente fuente `somnio-sales-v3`

### A.1 Catálogo completo de templates de sales-v3

**Source de verdad:** `supabase/migrations/20260315150000_v3_independent_templates.sql:1-122` + migraciones complementarias.

**agent_id real:** `'somnio-sales-v3'` (NO `'somnio-v3'`). Verificado en `src/lib/agents/somnio-v3/config.ts:11` (`SOMNIO_V3_AGENT_ID = 'somnio-sales-v3'`).

#### Informacionales (sales-v3 — completos)

| Intent | Rows | Body resumen | Variables |
|--------|------|---------------|-----------|
| `saludo` | 2 (CORE texto + COMP imagen) | "Hola💁 Bienvenido a Somnio..." + imagen ELIXIR (URL same as recompra) | — |
| `precio` | 3 (CORE+COMP+OPC) | "$77,900..."  + ciclo bio + pago | — |
| `promociones` | 1 CORE | Bullets `1×$77,900 / 2×$109,900 / 3×$139,900` | — |
| `contenido` | 2 | "90 comprimidos melatonina+magnesio..." | — |
| `formula` | (existe en migration `20260315160000_v3_formula_intent_templates.sql`) | — | — |
| `como_se_toma` | 3 | "1 comprimido 30min antes de dormir..." | — |
| `pago` | 1 | "pago una vez recibes..." | — |
| `envio` | 2 | "envíos gratis Coordinadora/Inter..." | — |
| `tiempo_entrega_*` (4 variantes) | 4 (1 c/u: same_day, next_day, 1_3_days, 2_4_days, sin_ciudad) | "Para {{ciudad}} el tiempo es {{tiempo_estimado}}🚚" | `ciudad`, `tiempo_estimado` |
| `registro_sanitario` | 1 | "Registro Invima. PHARMA SOLUTIONS SAS" — **DIFERENTE de recompra** (recompra dice FDA/BDE Nutrition LLC) | — |
| `ubicacion` | 2 | "Bucaramanga, Santander, envíos contraentrega nacional" | — |
| `contraindicaciones` | (en seed inicial `20260206000001_seed_somnio_templates.sql`) — **PERO codificado como intent `efectos` en sales-v3** | — | — |
| `dependencia` | 1 (en seed inicial) | "No genera dependencia. La melatonina es hormona natural..." | — |
| `efectividad` | 3 | "Resultados desde primeros 3-7 días..." | — |
| `efectos` (alias deprecated de `contraindicaciones`) | 2 | "Compuestos seguros y bien tolerados..." | — |

> **Discrepancia importante:** sales-v3 expone el intent `efectos` (no `contraindicaciones`); recompra v1 expone `contraindicaciones`. La nueva agente PW-confirmation debe heredar `contraindicaciones` (el intent canónico) — el copy es idéntico.

#### Sales actions (sales-v3 — completos)

| Intent | Rows | Body | Notas para PW-confirmation |
|--------|------|------|------------------------------|
| `pedir_datos` | 2 (CORE+COMP) | Lista de 8 campos a llenar | NO heredar tal cual — PW asume datos parciales del pedido pre-existente (ver §C). Adaptación necesaria. |
| `pedir_datos_quiero_comprar_implicito` | 1 | "Por supuesto, nos haría falta:\n{{campos_faltantes}}" | Útil si reader detecta campos faltantes — adaptar a tono post-compra. |
| `ask_ofi_inter` | 1 | "¿domicilio o oficina Interrapidísimo?" | NO heredar (PW ya tiene dirección del pedido — fuera de scope). |
| `confirmar_ofi_inter` / `confirmar_cambio_ofi_inter` | 2 | Confirmación de cambio a oficina | NO heredar. |
| `resumen_1x` / `resumen_2x` / `resumen_3x` | 6 (2 c/u, CORE+COMP) | "Pedido recibido✅ NX ELIXIR DEL SUEÑO por $X" + "Deseas confirmar tu compra?" | **HEREDAR** — son la base del template `confirmar_compra` que el cliente vio pre-activación. Adaptar copy para post-compra: "Tu pedido es {{items}} por {{total}}" sin "Deseas confirmar?". |
| `confirmacion_orden_same_day` / `confirmacion_orden_transportadora` | 4 (2 c/u) | "Perfecto! Despacharemos lo antes posible..." + recordatorio efectivo | **HEREDAR + ADAPTAR D-10** — son los templates emitidos al confirmar. La selección por municipio sigue el mismo patrón (research §A.2). |
| `pendiente_promo` | 1 | "Quedamos pendientes a la promoción" | NO necesario en PW (no hay flujo de promo). |
| `pendiente_confirmacion` | 1 | "Quedamos pendientes a la confirmación" | Posible base para `claro_que_si_esperamos` (D-14) — comparar. |
| `retoma_inicial` / `retoma_datos` / `retoma_datos_implicito` / `retoma_datos_parciales` | 4 | Re-engage tras silencio | Adaptar al menos `retoma_inicial` y `retoma_datos_parciales` para PW (cuando cliente no responde tras pregunta de datos faltantes). |
| `no_interesa` | 1 | "Claro que sí 🤍 Esperamos tu mensaje..." | **HEREDAR** — copy idéntico al `claro_que_si_esperamos` deseado en D-14. Posible reuso. |
| `rechazar` | 1 | "¿Promociones de nuevo o asesor humano?" | Adaptar para post-compra (en lugar de promos, ofrecer agendar — ver D-11 `agendar_pregunta`). |
| `fallback` | 1 | "Regálame 1 minuto por favor" | Heredar tal cual. |

#### Templates NUEVOS a crear bajo `somnio-sales-v3-pw-confirmation` (no existen en sales-v3 ni recompra)

1. **`agendar_pregunta`** (D-11) — "¿Deseas agendarlo para alguna fecha?". Sin variables. CORE.
2. **`claro_que_si_esperamos`** (D-14) — "Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio 😴". CORE. Copy ya existe en sales-v3 `no_interesa` y recompra `no_interesa` → research recomienda **reuso de copy** bajo nuevo intent name.
3. **`pedir_datos_post_compra`** — adaptación de `pedir_datos_quiero_comprar_implicito` con framing post-compra: "Para despachar tu pedido nos haría falta:\n{{campos_faltantes}}". CORE.
4. **`confirmar_direccion_post_compra`** (opcional D-12 reuso) — variante de `preguntar_direccion_recompra` adaptada al flujo PW.
5. **(opcionalmente)** templates de cancelación: `cancelado_handoff` ("Te conectamos con un asesor para procesar tu cancelación") — usable en handoff stub D-21.

> **Recomendación research:** Los templates informacionales (saludo, precio, promociones, contenido, formula, como_se_toma, pago, envio, tiempo_entrega_*, registro_sanitario, ubicacion, contraindicaciones, dependencia, efectividad) clonarse bajo `agent_id='somnio-sales-v3-pw-confirmation'` con copy verbatim. Total estimado: ~40 rows nuevas en agent_templates (ver §I para set definitivo).

### A.2 Lógica de variación por municipio (tiempo de entrega)

**Fuente:** `src/lib/agents/somnio-v3/delivery-zones.ts:38-68`.

**Diseño actual (replicable tal cual):**

```typescript
// File: src/lib/agents/somnio-v3/delivery-zones.ts:38-68
export async function lookupDeliveryZone(ciudad: string): Promise<DeliveryZoneResult> {
  const normalized = normalizeCity(ciudad)        // src/lib/agents/somnio/normalizers.ts
  const dbKey = normalized.toUpperCase().normalize('NFD')...
  const { data } = await supabase.from('delivery_zones')
    .select('zone, cutoff_hour, cutoff_minutes')
    .eq('municipality_name_normalized', dbKey)
    .maybeSingle()
  // Returns: { zone: 'same_day'|'next_day'|'1_3_days'|'2_4_days', cutoffHour, cutoffMinutes, carrier }
  // Default if not found: '2_4_days' / 'transportadora'
}

export function formatDeliveryTime(zoneResult): string {
  // same_day → evaluates cutoff in America/Bogota timezone
  //   Sunday/Saturday-after-cutoff → "el LUNES"
  //   before cutoff → "HOY mismo"
  //   else → "MAÑANA"
  // next_day → "al dia siguiente de ser despachado"
  // 1_3_days → "en 1-3 dias habiles"
  // 2_4_days → "en 2-4 dias habiles"
}
```

**Pattern:** una sola función que lee tabla `delivery_zones` (DB) y retorna zona canónica. Templates están separados POR ZONA con variable `{{tiempo_estimado}}`:
- `confirmacion_orden_same_day` (cuando zona=same_day)
- `confirmacion_orden_transportadora` (cuando zona ∈ {next_day, 1_3_days, 2_4_days})
- `tiempo_entrega_same_day` / `tiempo_entrega_next_day` / `tiempo_entrega_1_3_days` / `tiempo_entrega_2_4_days` / `tiempo_entrega_sin_ciudad`

**Punto de uso:** `src/lib/agents/somnio-v3/response-track.ts:277-301` (al disparar `crear_orden`) y `:378-394` (al detectar intent `tiempo_entrega`).

**Recompra ya REUSA esta lógica:** `src/lib/agents/somnio-recompra/response-track.ts:25` importa `lookupDeliveryZone, formatDeliveryTime` de `somnio-v3/delivery-zones`. **PW-confirmation puede hacer lo mismo** — el helper es agnostic del agente.

**Recomendación:** importar `delivery-zones` desde `@/lib/agents/somnio-v3/delivery-zones` (no duplicar código). El único trabajo de PW-confirmation es:
1. Clonar templates `confirmacion_orden_*` y `tiempo_entrega_*` bajo `agent_id='somnio-sales-v3-pw-confirmation'` con copy adaptado a post-compra (ej. "Tu pedido llegará {{tiempo_estimado}}🚚" en vez de "Despacharemos lo antes posible").
2. En response-track del nuevo agente, replicar el switch `case 'crear_orden':` (adaptado a `case 'mover_a_confirmado':`) que:
   - Lee `state.datos.ciudad` (o `state.datos.shipping_city` proveniente del reader)
   - Llama `lookupDeliveryZone(ciudad)`
   - Selecciona template `confirmacion_orden_same_day` vs `confirmacion_orden_transportadora` según `zoneResult.zone`
   - Pasa `extraContext: { tiempo_estimado: formatDeliveryTime(zoneResult), ...buildResumenContext(state) }`

### A.3 Set de tools de sales-v3

**Fuente:** `src/lib/agents/somnio-v3/config.ts:38-44`.

```typescript
tools: [
  'crm.contact.create',
  'crm.contact.update',
  'crm.contact.get',
  'crm.order.create',           // ← EXCLUIR en PW-confirmation (D-20)
  'whatsapp.message.send',
],
```

**Realidad:** estos strings son nombres declarativos en el `AgentConfig`, NO tools de AI SDK. La pipeline v3 NO usa AI SDK tool-calling — usa `processMessage()` como función pura que produce `output.shouldCreateOrder=true` cuando se requiere crear pedido, y el v3-production-runner invoca el adapter de orders (`adapters.orders.createOrder()` desde `src/lib/agents/engine-adapters/production/`).

**Implicación crítica para PW-confirmation:**

- El nuevo agente **NO sigue el patrón sales-v3 de "shouldCreateOrder"** porque ya hay un pedido. En su lugar:
  - Necesita **invocar crm-writer tools como AI SDK tools reales** (D-08): `updateOrder`, `moveOrderToStage`, `updateContact`, posiblemente `archiveOrder` (cancelación).
  - El crm-writer tools están en `src/lib/agents/crm-writer/tools/` y son AI SDK tools (devuelven `proposeAction` o `ResourceNotFoundError`).
  - El crm-writer requiere two-step: tools `propose` desde el agente → second turn `confirmAction(actionId)` para ejecutar.
- **Esto es una diferencia arquitectónica MAYOR vs sales-v3 y recompra** (que usan el adapter pattern): PW-confirmation necesita un agente AI-SDK-driven (similar a config-builder o crm-reader) o bien un híbrido (state-machine para flujo estándar + AI SDK para mutaciones).

**Recomendación arquitectónica (Open Q1, ver §K):**

- **Opción 1 (full state-machine como sales-v3 + adapter pattern para crm-writer):** mantener arquitectura familiar. El agente NO usa AI SDK tools — produce decisiones (`accion='actualizar_direccion'`) y un nuevo adapter envuelve `processProposeMessage` + `processConfirmMessage` del crm-writer (similar al adapter de orders). Más predecible, más complejo de adaptar a flujos no-anticipados (ej. "agregar producto X" requiere UI dinámica).
- **Opción 2 (AI SDK con generateText + tools del crm-writer):** el agente es un loop AI SDK (como crm-reader/writer) con tools `crm-writer.updateOrder` etc. Más flexible para casos como "editar items" pero más caro (Sonnet vs Haiku) y más impredecible.
- **Opción 3 (híbrido):** state-machine para flujo principal (saludo, sí/no, espera) → cuando se detecta intent `actualizar_dato` o `editar_items`, dispara una sub-llamada AI SDK al crm-writer con scope acotado.

**Research recomienda Opción 3** por estas razones:
1. Flujos estándar (sí/no/espera) son determinísticos → state-machine adecuado, copy controlado.
2. Mutaciones (dirección, items) son raras y requieren razonamiento sobre lo que pidió el cliente → AI SDK adecuado (con scope estrecho, max 2-3 steps).
3. Permite migración incremental (V1 cubre flujos estándar + actualizar dirección via state-machine + adapter; V1.1 agrega editar items via AI SDK sub-call).

**Set definitivo de tools (recomendado):**

| Tool | Tipo | Uso |
|------|------|-----|
| (sin AI SDK tools en V1) | adapter | crm-writer adapter envuelve `proposeAction + confirmAction` (mismo patrón que `adapters.orders` actual). Acciones: `updateOrder(shippingAddress)`, `moveOrderToStage(CONFIRMADO|FALTA_CONFIRMAR)`. |
| `handoff_human` | stub | Solo registra evento `pipeline_decision:handoff_triggered` + flag `requires_human=true` en sesión. NO mutación CRM. |

V1.1: agregar AI SDK sub-call para `editar_items` (D-13).

### A.4 Patrón de testing en sales-v3

**Verificado:** `find /src/lib/agents/somnio-v3 -name "*.test.ts" -o -name "*.spec.ts"` retorna **0 archivos**. **NO hay tests para sales-v3.**

**Patrón disponible para imitar:** `src/lib/agents/somnio-recompra/__tests__/` (4 suites, post-template-catalog 2026-04-23).

| Suite | Cubre |
|-------|-------|
| `transitions.test.ts` | Estado→intent→accion table (D-04, D-05, regresión confirmar/no_interesa). Mock-free — testea `resolveTransition()` puro. Source: `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts`. |
| `response-track.test.ts` | Selección de templates por intent + sales action. Mockea `TemplateManager.getTemplatesForIntents` y `processTemplates`. Source: `:1-184`. |
| `comprehension-prompt.test.ts` | Pure-function string inspection del prompt builder. CRM context section conditional. |
| `crm-context-poll.test.ts` | `vi.useFakeTimers()` + mock `SessionManager.getState`. Test el helper poll con 6 escenarios (fast-path, poll-found, timeout, error, swallow). Source: `:1-128`. |

**Stack:** `vitest` (instalado en standalone `somnio-recompra-crm-reader` Wave 0). Disponible en repo como devDep.

**Anti-patterns observados:**
- Recompra usa `vi.mock(...)` ANTES de los imports (vi.mock hoists). Correctamente.
- Tests `transitions` usan `createPreloadedState({...})` factory para fixtures — replicar.

### A.5 Patrón de observability events en sales-v3

**Fuente:** `src/lib/agents/somnio-v3/somnio-v3-agent.ts` + `src/lib/agents/somnio-v3/sales-track.ts` + `response-track.ts`.

**Eventos emitidos por sales-v3 (grep `getCollector()?.recordEvent`):**

| Categoría | Evento | Origen |
|-----------|--------|--------|
| `pipeline_decision` | `system_event_routed` | timer event |
| `pipeline_decision` | `sales_track_result` | sales track resolved |
| `pipeline_decision` | `order_decision` | shouldCreateOrder gate |
| `pipeline_decision` | `response_track_result` | response track resolved |
| `pipeline_decision` | `natural_silence` | response track produced 0 messages |
| `guard` | `blocked` / `passed` | R0/R1 guards |
| `comprehension` | `result` | every Haiku call |
| `template_selection` | `block_composed` / `empty_result` | block composer |
| `retake` | `decision` / `template_selected` | retoma_* actions |
| `ofi_inter` | `route_selected` / `template_selected` | ofi inter routing |

**Eventos de recompra (5 nuevos para CRM context, set canon de standalone `somnio-recompra-crm-reader`):**

| Evento | Quién emite | Cuándo |
|--------|-------------|--------|
| `crm_reader_dispatched` | webhook-processor | inmediatamente antes de `inngest.send` |
| `crm_reader_completed` | recompra-preload-context Inngest function | tras `processReaderMessage` exitoso (status=ok\|empty) |
| `crm_reader_failed` | recompra-preload-context | tras error (status=error) |
| `crm_context_used` | recompra agent | tras poll exitoso (status=ok) |
| `crm_context_missing_after_wait` | recompra agent | tras timeout/error/empty |

**Recomendación research — set definitivo para PW-confirmation (~12 eventos):**

| Categoría | Evento | Cuándo |
|-----------|--------|--------|
| `pipeline_decision` | `pw_confirmation_routed` | webhook-processor invoca el agente |
| `pipeline_decision` | `crm_reader_dispatched` | reader bloqueante dispatch |
| `pipeline_decision` | `crm_reader_completed` | reader retorna ok\|empty |
| `pipeline_decision` | `crm_reader_failed` | reader error\|timeout |
| `pipeline_decision` | `last_template_resolved` | tras determinar último template (D-09) |
| `pipeline_decision` | `confirmation_detected` | "sí" + último=`confirmar_compra` → mover a CONFIRMADO |
| `pipeline_decision` | `cancellation_first_no` | primer "no" del cliente |
| `pipeline_decision` | `cancellation_confirmed` | segundo "no" → handoff |
| `pipeline_decision` | `wait_acknowledged` | "espera lo pienso" → mover a FALTA CONFIRMAR |
| `pipeline_decision` | `address_change_requested` | cliente pide cambiar dirección |
| `pipeline_decision` | `items_change_requested` | cliente pide editar items (V1.1 si gap) |
| `pipeline_decision` | `handoff_triggered` | handoff stub disparado (4 razones D-21) |
| `pipeline_decision` | `crm_writer_propose_emitted` / `crm_writer_confirm_emitted` | mutación via crm-writer |
| `pipeline_decision` | `stage_changed_concurrently_caught` | error contract de crm-stage-integrity |
| Existentes (heredados de sales-v3 pattern) | `comprehension:result`, `guard:blocked|passed`, `template_selection:*`, `pipeline_decision:sales_track_result|response_track_result|natural_silence` | flujo estándar |

### A.6 Estructura general del agente sales-v3

**Archivos principales (carpeta `src/lib/agents/somnio-v3/`):**

| Archivo | LoC | Rol |
|---------|-----|-----|
| `index.ts` | 17 | Self-register en agentRegistry, re-exporta API pública |
| `config.ts` | 76 | `AgentConfig` para registry (states, transitions, thresholds, tools declarativo) |
| `constants.ts` | 217 | V3_INTENTS, ACTION_TEMPLATE_MAP, CRITICAL_FIELDS_*, PACK_PRICES, V3_TIMER_DURATIONS, CRM_ACTIONS, etc. |
| `comprehension.ts` | 142 | Single Haiku call con structured output via Zod schema |
| `comprehension-prompt.ts` | 109 | System prompt con product info + extraction rules |
| `comprehension-schema.ts` | ~100 | Zod schema para `MessageAnalysis` |
| `state.ts` | ~440 | `mergeAnalysis`, `computeGates`, `serialize/deserializeState`, `createInitialState`, `buildResumenContext`, `camposFaltantes` |
| `transitions.ts` | 478 | Tabla declarativa (phase, on, action, condition, resolve). 30+ entries. `resolveTransition()` y `systemEventToKey()` |
| `sales-track.ts` | 221 | `resolveSalesTrack({phase, state, gates, event})` — pure state machine, returns `accion` |
| `response-track.ts` | 404 | `resolveResponseTrack({salesAction, intent, state, workspaceId})` — composes templates via TemplateManager + composeBlock |
| `phase.ts` | 51 | `derivePhase(acciones) → 'initial'\|'capturing_data'\|'promos_shown'\|'confirming'\|'closed'` |
| `guards.ts` | 35 | R0 (low confidence) + R1 (escape intents asesor/queja/cancelar) → handoff |
| `delivery-zones.ts` | 134 | `lookupDeliveryZone(ciudad)` + `formatDeliveryTime()` (timezone-aware) |
| `engine-v3.ts` | 165 | wrapper para sandbox (no usado en producción, runner usa `processMessage` directo) |
| `somnio-v3-agent.ts` | 467 | `processMessage()` orquestador completo (timer path + user message path) |
| `types.ts` | ~270 | TipoAccion, AgentState, V3AgentInput, V3AgentOutput, etc. |

**Flujo principal (processUserMessage):**

```
input → deserializeState(session)
     → comprehend(message, history) [Haiku, 512 tokens]
     → mergeAnalysis(state, analysis) → {state, changes}
     → computeGates(state)
     → checkGuards(analysis) → if blocked: return handoff
     → derivePhase(acciones)
     → resolveSalesTrack({phase, state, gates, event}) → {accion, secondarySalesAction, enterCaptura, timerSignal, reason}
     → resolveResponseTrack({salesAction, intent, state, workspaceId}) → {messages, templateIdsSent, ...}
     → push acciones, update templatesMostrados
     → serializeState(mergedState)
     → return V3AgentOutput
```

**Recomendación PW-confirmation: clonar la estructura completa** con adaptaciones:
- `constants.ts` → `PW_CONFIRMATION_INTENTS` (subset de RECOMPRA_INTENTS + nuevos: `confirmar_pedido`, `cancelar_pedido`, `agendar`, `cambiar_direccion`, `editar_items`, `esperar`).
- `transitions.ts` → ~10-15 entries (mucho más simple que sales-v3 que tiene ofi_inter complexity).
- `sales-track.ts` → adaptado: NO captura silenciosa, NO ofi_inter, NO crear_orden, SI mover_stage_*.
- `response-track.ts` → reusa `lookupDeliveryZone` de sales-v3, `TemplateManager` de somnio/, agent_id literal `'somnio-sales-v3-pw-confirmation'`.
- Helper nuevo: `resolveLastTemplate(conversationId)` que consulta `messages` table para D-09.
- Helper nuevo: `resolveActiveOrder(contactId, workspaceId)` que extrae el pedido activo del payload del crm-reader.

---

## B. CRM Reader bloqueante (PATRÓN NUEVO)

### B.1 Diseño recomendado

**Análisis de opciones D-05:**

| Opción | Descripción | Viabilidad | Recomendación |
|--------|-------------|-----------|---------------|
| **A** Reader inline en webhook handler ANTES de invocar el agente, con timeout | Misma request-response. AbortController 12s. Si timeout → procede sin contexto. | Viable — patrón `processReaderMessage` ya existe (`src/lib/agents/crm-reader/index.ts:36`). | **Vetada por arquitectura Vercel:** webhook DEBE responder 200 en <5s (ver `MEMORY.md` "Webhook must respond 200 in <5s"). Reader puede tomar 12-25s (ver `recompra-preload-context.ts:35` `READER_TIMEOUT_MS = 25_000`). |
| **B** Inngest function bloqueante (sync invoke con `await`) | webhook dispara y espera. | NO viable — Inngest no es sync; el patrón `await inngest.send(...)` solo confirma envío, NO ejecución. |
| **C** ★ **2-step: webhook responde 200 inmediato (200ms), dispatch async invoca reader, cuando reader termina dispara invocación del agente vía evento `agent/pw-confirmation.invoke`** | Latencia percibida = mismo que recompra (3-5s tras saludo silencioso o sin saludo). | Viable — patrón estándar Vercel + Inngest del proyecto. | **RECOMENDADA** — preserva SLAs Vercel. Ver §B.1.detailed abajo. |

**Diseño detallado Opción C (recommended):**

```
1. WhatsApp webhook → webhook-processor.ts
   ├─ Si routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation':
   │  └─ NEW BRANCH (similar a recompra branch:322 pero NO invoca runner inline)
   │     ├─ Crear sesión vacía via SessionManager.createSession (helper)
   │     ├─ inngest.send({ name: 'pw-confirmation/preload-and-invoke', data: {sessionId, contactId, workspaceId, conversationId, messageContent, messageId, messageTimestamp, phone} })
   │     └─ return { success: true } (200 OK rápido)

2. Inngest function `pw-confirmation-preload-and-invoke`:
   ├─ step.run('call-reader', async () => {
   │     const reader = await processReaderMessage({
   │       workspaceId,
   │       invoker: 'somnio-sales-v3-pw-confirmation',
   │       messages: [{ role: 'user', content: buildPwReaderPrompt(contactId, conversationId) }],
   │       abortSignal: timeoutController.signal,  // 25s timeout
   │     })
   │     await SessionManager.updateCapturedData(sessionId, {
   │       '_v3:crm_context': reader.text,
   │       '_v3:crm_context_status': reader.text.trim() ? 'ok' : 'empty',
   │       '_v3:active_order': JSON.stringify(extractActiveOrder(reader)),  // structured
   │     })
   │     return { __obs, status }
   │   })
   ├─ step.run('invoke-agent', async () => {
   │     // Now run the V3ProductionRunner with the populated session
   │     const runner = new V3ProductionRunner(adapters, {
   │       workspaceId,
   │       agentModule: 'somnio-pw-confirmation',
   │     })
   │     const output = await runner.processMessage({
   │       sessionId,                    // already created and populated
   │       conversationId,
   │       contactId,
   │       message: messageContent,
   │       workspaceId,
   │       history: [],
   │       phoneNumber: phone,
   │       messageTimestamp,
   │     })
   │     return { __obs, output }
   │   })
   ├─ collector.mergeFrom(...) per __obs survival pattern
   └─ step.run('observability-flush', async () => collector.flush())
```

**Ventajas de Opción C:**
- Webhook respeta <5s SLA Vercel.
- Reader corre con su timeout natural (25s).
- Agente arranca SOLO con contexto ya en sesión — no necesita `pollCrmContext` (a diferencia de recompra que tuvo que diseñar el helper).
- Idempotencia natural: si Inngest reintenta, `step.run('call-reader')` solo corre 1 vez (Inngest serializa returns).
- Observability: ambas fases (reader + agente) bajo el mismo `conversationId` collector.

**Riesgos/Pitfalls:**
- **Latencia:** desde inbound message hasta primera response del agente puede ser 5-30s (reader 3-25s + agente 1-3s). Cliente percibe "delay grande". Recompra mitigó esto enviando saludo INSTANTE (saludo_v1 sin esperar reader). **Opción para PW:** disparar template `procesando_v1` ("Un momento, estoy revisando tu pedido...") inmediatamente en el webhook, ANTES del dispatch. → Plan-phase decide si vale la pena (introduce complejidad).
- **Cold lambda:** primer turno tras periodo idle puede agregar 2-5s de cold start a Inngest function. Aceptable.
- **Reader timeout (25s):** si todos los reader timeouts → `_v3:crm_context_status='error'`. El agente debe degradar gracefully (pedir todos los datos al cliente como si no tuviera contexto).
- **Inngest retries:** `retries: 1`. Si reader falla 2 veces, agente nunca arranca. Necesario fallback: `step.run('invoke-agent')` con retry sin reader si `__obs.status === 'error'` tras retry final.

**Handshake:**
- El agente NO usa `pollCrmContext` (no necesita — Inngest garantiza que `step.run('invoke-agent')` corre DESPUÉS de `step.run('call-reader')` retorna).
- El agente lee `session.state.datos_capturados['_v3:crm_context']` y `'_v3:active_order'` directamente en `processUserMessage`.
- Si `_v3:crm_context_status === 'error'`: agente muestra mensaje genérico ("Hubo un problema cargando tu pedido. ¿Podrías indicarme tu número de pedido o nombre completo para ayudarte?") + emite evento `crm_context_missing_proceeding_blind`.

### B.2 Tools del reader a invocar (prompt para reader)

**Fuente:** `src/lib/agents/crm-reader/tools/` (verificado — todos existen):

| Tool | Para PW-confirmation usa |
|------|--------------------------|
| `contactsSearch` | NO necesario — contactId ya viene del webhook |
| `contactsGet` | ✓ tags + custom fields del contacto |
| `ordersList` | ✓ filtrar `contactId` para encontrar pedidos del contacto |
| `ordersGet` | ✓ pedido específico con items (después de identificar el activo) |
| `pipelinesList` / `stagesList` | ✓ resolver IDs de stages `NUEVO PAG WEB` / `FALTA INFO` / `FALTA CONFIRMAR` (reader puede inferir desde `ordersList` que ya devuelve `stage_id` + `stage_name`) |
| `tagsList` | NO necesario para PW (tags vienen en `contactsGet`) |

**Prompt sugerido para el reader (D-08 PW-confirmation):**

```
Prepara contexto del pedido activo del contacto ${contactId} en workspace.

Pasos:
1. Lee el contacto via contactsGet({contactId: '${contactId}'}). Captura nombre, telefono, email, tags, address, city, department.
2. Lista los pedidos del contacto via ordersList({contactId: '${contactId}', limit: 20}).
3. Filtra a los pedidos cuyo stage_name es uno de: 'NUEVO PAG WEB', 'FALTA INFO', 'FALTA CONFIRMAR'. Si hay 0: responde literalmente "SIN_PEDIDO_ACTIVO".
4. Si hay 1 o más: selecciona el más reciente por created_at DESC. Lee detalle via ordersGet({orderId: 'X'}).
5. Devuelve un parrafo en espanol con:
   - ID y nombre del pedido + stage_name + created_at.
   - Items (titulo + cantidad + unitPrice) y total_value.
   - shipping_address + shipping_city + shipping_department (si existen, indicar "FALTA" si no).
   - Datos del contacto (nombre, telefono, email).
   - Tags activos del contacto.
   - Lista de campos FALTANTES para envio: nombre, apellido, telefono, direccion, ciudad, departamento — indica cuales faltan.
Formato plano, sin listas markdown — va a ser inyectado en otro prompt de bot.
```

> **Nota:** el reader devuelve TEXTO, no JSON estructurado. Para el caso de PW, donde el agente necesita `shippingAddress` específico, **se recomienda persistir además un objeto JSON estructurado** (`_v3:active_order`) que el `step.run('call-reader')` extrae del `reader.toolCalls` (los tool outputs son objetos accesibles via `result.steps[*].toolResults`). Ver `src/lib/agents/crm-reader/index.ts:59-68`.

---

## C. CRM Writer support para mutaciones requeridas

### C.1 Tools disponibles

**Fuente:** `src/lib/agents/crm-writer/tools/` (verificado).

| Tool | Existe | Soporta D-08/12/13/14? |
|------|--------|---------------------------|
| `createContact` | ✓ `contacts.ts:27-61` | N/A (PW no crea contactos) |
| `updateContact` | ✓ `contacts.ts:63-108` | ✓ campos: name, phone, email, address, city, department |
| `archiveContact` | ✓ `contacts.ts:110-141` | N/A |
| `createOrder` | ✓ `orders.ts:31-101` | EXCLUIR (D-20) |
| `updateOrder` | ✓ `orders.ts:103-169` | ✓✓ **CRÍTICO** — campos: contactId, name, description, closingDate, carrier, trackingNumber, **shippingAddress, shippingCity, shippingDepartment**, email, **products** (replaces all). Todo lo necesario para D-12 y D-13. |
| `moveOrderToStage` | ✓ `orders.ts:171-217` | ✓✓ **CRÍTICO** — para D-10 (mover a CONFIRMADO) y D-14 (mover a FALTA CONFIRMAR). |
| `archiveOrder` | ✓ `orders.ts:219-254` | Posible para cancelación si se decide; D-11 dice "cancelar sin mover stage" → NO usar (preserva pedido visible para humano). |
| `createNote` / `archiveNote` | ✓ `notes.ts` | Opcional para registrar handoff/cancelación en nota del pedido (no requerido por D-21 stub). |
| `createTask` / `updateTask` | ✓ `tasks.ts` | NO requerido en V1. |

### C.2 Gaps identificados — TODOS CUBIERTOS

**D-13 verificación:** "editar items del pedido" → `updateOrder` acepta `products: z.array(productSchema).optional()` (`orders.ts:119`) y el domain `updateOrder` en `src/lib/domain/orders.ts:461-489` REEMPLAZA todos los productos cuando se pasa `params.products`. Funciona. **No hay gap.**

**Mecanismo two-step (verificado en `src/lib/agents/crm-writer/two-step.ts`):**
- Tool `execute()` llama `proposeAction(ctx, {tool, input, preview})` → INSERT en `crm_bot_actions` con `status='proposed'`, returns `{ status: 'proposed', action_id, preview, expires_at }`.
- Caller debe llamar `confirmAction(action_id)` en segundo request → UPDATE optimistic `WHERE status='proposed' AND id=?` → ejecuta domain func real → returns `{ status: 'executed' | 'expired' | 'already_executed' | 'failed' }`.
- TTL: 5 minutos. Cron `crm-bot-expire-proposals` marca expired.

**Implicación arquitectónica para PW:**

Si se elige Opción 1/3 (state-machine + adapter), el adapter en `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts` (NUEVO) debe:
1. Llamar `proposeAction(...)` directamente (importando `two-step.ts`) y obtener `action_id`.
2. Inmediatamente llamar `confirmAction(action_id)` (no dejar pendiente — el agente está en backend, no es UI human-in-loop).
3. Manejar errores `stage_changed_concurrently` (D-06 de standalone `crm-stage-integrity`) — emitir evento + retornar gracefully al loop del agente, que decide si re-fetch del reader y reintentar.

**Otra opción (más limpia):** invocar el crm-writer agent vía `processWriterMessage(...)` (similar a como recompra invoca crm-reader). Sin embargo, **NO existe `processWriterMessage`** — el crm-writer está diseñado como HTTP endpoints `/api/v1/crm-bots/writer/propose` y `/confirm`. Para invocación in-process, el path correcto es importar `proposeAction` + `confirmAction` desde `two-step.ts`.

**Recomendación:** crear adapter `crm-writer-adapter.ts` que envuelve `proposeAction + confirmAction` con scope acotado a las 2-3 operaciones que PW-confirmation necesita. Documentar como **consumidor in-process del crm-writer en `.claude/rules/agent-scope.md`** (paralelo al pattern recompra→reader).

---

## D. Schema de datos de envío

### D.1 Tabla `orders` (relevant fields)

**Fuente:** `supabase/migrations/20260129000003_orders_foundation.sql:70-85` + alters.

| Campo | Tipo | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `workspace_id` | UUID NOT NULL FK | |
| `contact_id` | UUID FK ON DELETE SET NULL | |
| `pipeline_id` | UUID NOT NULL FK | |
| `stage_id` | UUID NOT NULL FK | |
| `total_value` | DECIMAL(12,2) NOT NULL DEFAULT 0 | trigger recalcula desde order_products |
| `closing_date` | DATE | |
| `description` | TEXT | |
| `carrier` | TEXT | "Coordinadora", "Interrapidisimo", etc. |
| `tracking_number` | TEXT | |
| `linked_order_id` | UUID FK | |
| `custom_fields` | JSONB | |
| `created_at` / `updated_at` | TIMESTAMPTZ con default Bogota | |
| `shipping_address` | TEXT | added in `20260130000001_orders_shipping_address.sql:7` |
| `shipping_city` | TEXT | added same migration `:8` |
| `shipping_department` | TEXT | added in `20260217000000_real_fields.sql:12` |
| `archived_at` | TIMESTAMPTZ | (soft-delete) |
| `name` | TEXT | added in `20260217000000_real_fields.sql` |

> **No hay JSONB `shipping_address` blob** — son 3 columnas TEXT individuales. El crm-writer `updateOrder` tool acepta `shippingAddress`, `shippingCity`, `shippingDepartment` como opcionales (verificado en `orders.ts:115-117`).

### D.2 Tabla `contacts` (relevant fields)

**Fuente:** `src/lib/domain/contacts.ts` types + migrations.

| Campo | Tipo | Notes |
|-------|------|-------|
| `id` | UUID PK | |
| `workspace_id` | UUID FK NOT NULL | |
| `name` | TEXT | |
| `phone` | TEXT | normalizado a 573XXXXXXXXX (recompra y sales-v3 normalizan en mergeAnalysis) |
| `email` | TEXT | |
| `address` | TEXT | |
| `city` | TEXT | |
| `department` | TEXT | added in `20260217000000_real_fields.sql:9` |
| `custom_fields` | JSONB | |
| `is_client` | BOOLEAN | flag usado por router/legacy gate |
| `archived_at` | TIMESTAMPTZ | |

### D.3 Lógica de completitud para envío

**Definición canónica heredada de sales-v3 / recompra (`src/lib/agents/somnio-recompra/constants.ts:86-93`):**

```typescript
export const CRITICAL_FIELDS_NORMAL = [
  'nombre',
  'apellido',
  'telefono',
  'direccion',
  'ciudad',
  'departamento',
] as const
```

**Para PW-confirmation, definir `SHIPPING_REQUIRED_FIELDS`:**

```typescript
// Critical fields para post-compra (envío)
export const SHIPPING_REQUIRED_FIELDS = [
  'nombre',          // contacts.name (split nombre+apellido si no)
  'apellido',        // contacts.name fragment OR custom_field
  'telefono',        // contacts.phone (normalizado)
  'shippingAddress', // orders.shipping_address (FALLBACK contacts.address)
  'shippingCity',    // orders.shipping_city (FALLBACK contacts.city)
  'shippingDepartment', // orders.shipping_department (FALLBACK contacts.department)
] as const
```

**Algoritmo `shippingComplete(activeOrder, contact): boolean`:**

```typescript
function shippingComplete(order: ActiveOrderPayload, contact: ContactPayload): {
  complete: boolean
  missing: string[]
} {
  const missing: string[] = []

  const nameOk = (contact.name?.trim().split(/\s+/).length >= 2)  // requires both name+lastname
  if (!nameOk) missing.push('nombre_completo')

  const phoneOk = !!contact.phone && /^57\d{10}$/.test(contact.phone)
  if (!phoneOk) missing.push('telefono')

  const addressOk = !!(order.shippingAddress?.trim() || contact.address?.trim())
  if (!addressOk) missing.push('direccion')

  const cityOk = !!(order.shippingCity?.trim() || contact.city?.trim())
  if (!cityOk) missing.push('ciudad')

  const deptOk = !!(order.shippingDepartment?.trim() || contact.department?.trim())
  if (!deptOk) missing.push('departamento')

  return { complete: missing.length === 0, missing }
}
```

> **Decisión pendiente (Open Q3):** ¿el agente debe distinguir nombre vs apellido? Sales-v3 tiene `apellido` como campo separado (`CRITICAL_FIELDS_NORMAL`), pero `contacts.name` es un solo TEXT. Recompra usa `state.datos.nombre + state.datos.apellido` — vienen del último pedido (preloaded). Para PW, el split `name → nombre + apellido` debe hacerse en el helper `extractActiveOrder()` que parsea la respuesta del reader.

---

## E. Pipeline Somnio

### E.1 Stages oficiales

**Fuente:** stages no están seedeados en migrations (se crean via UI). Se conocen por código + comentarios:

- Pipeline name: **`Ventas Somnio Standard`** (verificado en `supabase/migrations/20260427160000_routing_facts_pipeline_stage_raw.sql:23` y otros).
- Pipeline UUID: NO está hardcoded en código — debe consultarse en runtime via `pipelinesList` del reader.

**Stages relevantes para PW (hipótesis basada en CONTEXT.md + grep código):**

| Stage Name | UUID | Uso |
|------------|------|-----|
| `NUEVO PAG WEB` | TBD (consultar prod) | Stage de entrada inicial — pedido recién creado desde web |
| `FALTA INFO` | TBD | Stage para pedidos con datos faltantes (dirección/teléfono) |
| `FALTA CONFIRMAR` | TBD | Stage donde se mueve cliente que dice "espera lo pienso" (D-14) |
| `CONFIRMADO` | TBD (citado en `routing_facts_pipeline_stage_raw.sql:16`) | Stage destino al confirmar (D-10) |
| `REPARTO`, `ENTREGADO`, `DEVOLUCION`, etc. | TBD | NO accesibles por PW (D-18 prohíbe) |

> **Acción para Plan-phase:** Wave 0 task SQL para resolver UUIDs reales de los 4 stages relevantes (NUEVO PAG WEB, FALTA INFO, FALTA CONFIRMAR, CONFIRMADO) en Somnio production. Esto desbloquea hardcoding como constantes en el agente o documentación en `.planning/standalone/somnio-sales-v3-pw-confirmation/E1-STAGES.md`.

> **Alternative:** el agente NO hardcodea UUIDs — los recibe del reader (que devuelve `stage_id` + `stage_name`). Solo necesita el UUID del stage destino (`CONFIRMADO`, `FALTA CONFIRMAR`) → resolver en cada turno via cache + `pipelinesList/stagesList`. **Más limpio.** Pero introduce 1 query extra por mutación. Recomendación: cachear stage_ids en `session_state.datos_capturados._v3:stage_ids` cuando el reader corre por primera vez.

### E.2 Automatizaciones disparadas por stage

**Fuente:** `src/lib/automations/triggers/stage-changed.ts` + tabla `automations` en producción.

**Verificado:**
- El sistema de automations soporta trigger `stage_changed` (with conditions on pipeline_id + stage_id from/to).
- Existe migration `20260326_pipeline_closure_tags.sql` que aplica tags al cerrar pedido en pipeline+tag combo.
- **NO se conocen las automatizaciones específicas de Somnio sin consultar prod** (están en `automations` table, no en migrations).

**Acción para Plan-phase Wave 0:** SQL audit query:
```sql
SELECT name, trigger_config, actions
FROM automations
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
AND (trigger_config->>'pipeline_id' IS NOT NULL OR trigger_config->>'trigger' = 'stage_changed')
ORDER BY name;
```

**Impacto en diseño:** si existen automations que disparan al mover a CONFIRMADO (e.g., enviar guía a logística, generar factura, asignar tag "PEDIDO_CONFIRMADO"), el agente NO debe duplicar esas acciones. Solo mover stage — las automations hacen el resto.

> **Asunción razonable:** existen automations Somnio que ya hacen logística/factura cuando un pedido entra a CONFIRMADO (de lo contrario el sistema legacy no funcionaría). Por tanto **PW-confirmation solo debe ejecutar `moveOrderToStage(orderId, CONFIRMADO_UUID)` — el resto es responsabilidad de las automations existentes.**

---

## F. Templates pre-activación (asunción del agente)

### F.1 Localización de `pedido_recibido_v2`, `direccion_entrega`, `confirmar_compra`

**Verificado:**
- `grep "pedido_recibido_v2\|direccion_entrega\|confirmar_compra"` en `/src` y `/supabase/migrations`: **0 resultados** (excepto el doc del intent name `confirmar_compra` en `intent-detector.ts:50` legacy, no relacionado).
- Estos NO son agent_templates (ese tipo es interno al sistema de bots y se almacena en `agent_templates`).
- Estos SÍ son `whatsapp_templates` (tabla Meta-side, schema en `supabase/migrations/20260131000002_whatsapp_extended_foundation.sql:11-39`).

**Conclusión:** los 3 templates son WhatsApp templates Meta-aprobados, almacenados en tabla `whatsapp_templates` con `workspace_id=a3843b3f...`. El agente PRE-activación (que probablemente es el sistema web/CRM Somnio externo, NO un agente AI) los envía via API Meta cuando se crea un pedido.

**Acción para Plan-phase Wave 0:** SQL audit query para confirmar existencia y obtener body real:
```sql
SELECT id, name, language, category, status, components, variable_mapping
FROM whatsapp_templates
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
AND name IN ('pedido_recibido_v2', 'direccion_entrega', 'confirmar_compra')
ORDER BY name;
```

**Por qué importa:**
- D-09 ("sí" sólo si último=`confirmar_compra`) requiere identificar el último template enviado al cliente.
- **Mecanismo de detección:** `messages` tiene columna `template_name` (`supabase/migrations/20260131000002_whatsapp_extended_foundation.sql:115-118`) que se rellena con el `name` del template Meta cuando se envía un template message.
- Helper sugerido: `getLastTemplateName(conversationId)` → SELECT template_name FROM messages WHERE conversation_id=? AND direction='outbound' AND template_name IS NOT NULL ORDER BY timestamp DESC LIMIT 1.

> **Riesgo:** si el sistema pre-activación NO setea `messages.template_name` (envía via API directa Meta sin pasar por el sender de morfx), el helper retorna `null`. **Acción Wave 0:** SQL query a `messages` para verificar:
```sql
SELECT template_name, COUNT(*) FROM messages
WHERE conversation_id IN (SELECT id FROM conversations WHERE workspace_id='a3843b3f...')
AND direction='outbound' AND template_name IS NOT NULL
GROUP BY template_name ORDER BY COUNT(*) DESC LIMIT 20;
```
Si los 3 templates aparecen → mecanismo viable. Si no → necesitamos solución alternativa (ver Open Q4).

---

## G. Estado del routing

### G.1 `lifecycle_routing_enabled` en Somnio

**Fuente:** `workspace_agent_config` table (`supabase/migrations/20260209000000_agent_production.sql:11`) + standalone agent-lifecycle-router.

**Estado conocido (07-SUMMARY.md de agent-lifecycle-router, 2026-04-27):**
- `lifecycle_routing_enabled` columna agregada por `supabase/migrations/20260425220000_agent_lifecycle_router.sql`.
- Flag flippeada para Somnio el 2026-04-27 09:09 UTC (ya está `true`).
- 3 reglas activas en Somnio: kill switch (priority 1000), recompra disabled fallback (900), is_client → recompra (800).
- `!is_client` cae a `no_rule_matched` → fallback a `conversational_agent_id = somnio-sales-v3`.

**Para PW-confirmation:**
- El usuario debe crear MANUALMENTE una regla nueva en `/agentes/routing-editor` (o vía SQL) con prioridad ~700 que matchee al pedido en stages NUEVO PAG WEB / FALTA INFO / FALTA CONFIRMAR.
- Conditions sugeridas:
  ```json
  { "all": [
    { "fact": "activeOrderStageRaw", "operator": "in", "value": ["NUEVO PAG WEB", "FALTA INFO", "FALTA CONFIRMAR"] },
    { "fact": "activeOrderPipeline", "operator": "equal", "value": "Ventas Somnio Standard" }
  ]}
  ```
  Event: `{ "type": "route", "params": { "agent_id": "somnio-sales-v3-pw-confirmation" } }`
- **El facts `activeOrderStageRaw` y `activeOrderPipeline` ya están registrados en `routing_facts_catalog`** (verificado en `supabase/migrations/20260427160000_routing_facts_pipeline_stage_raw.sql:11-29`). Soportan operadores `equal`, `in`, etc.
- **NO bloqueante para esta standalone** — la regla la crea el usuario después. Lo que SÍ bloquea es que el agente aparezca como opción en el dropdown del editor (D-02 scope técnico).

---

## H. Routing-editor UI integration

### H.1 Cómo registrar el agente nuevo

**Fuente:** `src/app/(dashboard)/agentes/routing/editor/page.tsx:14-29` (ya leído).

**Pattern actual:**

```typescript
// File: src/app/(dashboard)/agentes/routing/editor/page.tsx:23-29
// Trigger agentRegistry side-effects so the editor can populate a dropdown
// of valid agent_ids (instead of a free-text input that's typo-prone).
import '@/lib/agents/somnio-recompra'
import '@/lib/agents/somnio-v3'
import '@/lib/agents/somnio'
import '@/lib/agents/godentist'
import { agentRegistry } from '@/lib/agents/registry'
```

**Pasos atómicos para que aparezca como opción:**

1. **Crear módulo del agente** en `src/lib/agents/somnio-pw-confirmation/` con `index.ts` que self-registers:
   ```typescript
   // src/lib/agents/somnio-pw-confirmation/index.ts
   import { agentRegistry } from '../registry'
   import { somnioPwConfirmationConfig, SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'

   agentRegistry.register(somnioPwConfirmationConfig)

   export { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'
   export { processMessage } from './pw-confirmation-agent'
   export type { V3AgentInput, V3AgentOutput } from './types'
   ```

2. **Crear `config.ts`** análogo a `somnio-recompra/config.ts` con:
   ```typescript
   export const SOMNIO_PW_CONFIRMATION_AGENT_ID = 'somnio-sales-v3-pw-confirmation' as const

   export const somnioPwConfirmationConfig: AgentConfig = {
     id: SOMNIO_PW_CONFIRMATION_AGENT_ID,
     name: 'Somnio Sales v3 — PW Confirmation',
     description: '...',
     intentDetector: { ... },
     orchestrator: { ... },
     tools: [/* sin crear_orden */],
     states: ['nuevo', 'awaiting_response', 'awaiting_confirmation', 'confirmed', 'waiting_decision', 'handoff'],
     initialState: 'nuevo',
     validTransitions: { ... },
     ...
   }
   ```

3. **Agregar import en editor page:**
   ```typescript
   // src/app/(dashboard)/agentes/routing/editor/page.tsx (line ~28)
   import '@/lib/agents/somnio-pw-confirmation'
   ```

4. **Agregar pre-warm en webhook-processor** (CRITICAL — sin esto, fallback_legacy en cold lambdas, ver agent-lifecycle-router LEARNING B-001):
   ```typescript
   // src/lib/agents/production/webhook-processor.ts:225-230
   await Promise.all([
     import('../somnio-recompra'),
     import('../somnio-v3'),
     import('../somnio'),
     import('../godentist'),
     import('../somnio-pw-confirmation'),  // ← NEW
   ])
   ```

5. **Agregar branch en webhook-processor para invocar el agente** cuando `routerDecidedAgentId === 'somnio-sales-v3-pw-confirmation'`. Diseño detallado en §B.1 (Opción C — dispatch a Inngest function).

6. **Agregar branch en V3ProductionRunner** (`src/lib/agents/engine/v3-production-runner.ts:153-163`):
   ```typescript
   } else if (this.config.agentModule === 'somnio-pw-confirmation') {
     const { processMessage } = await import('../somnio-pw-confirmation/pw-confirmation-agent')
     output = await processMessage(v3Input as any) as unknown as V3AgentOutput
   }
   ```

---

## I. Recomendaciones para PLAN.md

### I.1 Set definitivo de templates (bajo `agent_id='somnio-sales-v3-pw-confirmation'`)

| # | Intent | Source | Acción | Prioridad/orden |
|---|--------|--------|--------|------------------|
| 1 | `saludo` | clonar de sales-v3 (CORE texto + COMP imagen ELIXIR) | clonar verbatim | CORE+COMP |
| 2 | `precio` | clonar de sales-v3 | clonar verbatim | CORE+COMP+OPC |
| 3 | `promociones` | clonar de sales-v3 | clonar verbatim | CORE |
| 4 | `contenido` | clonar de sales-v3 | clonar | CORE+COMP |
| 5 | `formula` | clonar de sales-v3 (`20260315160000_v3_formula_intent_templates.sql`) | clonar | CORE |
| 6 | `como_se_toma` | clonar de sales-v3 | clonar | CORE+COMP+OPC |
| 7 | `pago` | clonar de sales-v3 | clonar | CORE |
| 8 | `envio` | clonar de sales-v3 | clonar | CORE+COMP |
| 9 | `tiempo_entrega_same_day` | clonar de sales-v3 (post-compra: "Tu pedido llegará HOY mismo🚚") | clonar + adaptar copy a post-compra | CORE |
| 10 | `tiempo_entrega_next_day` | idem | clonar + adaptar | CORE |
| 11 | `tiempo_entrega_1_3_days` | idem | clonar + adaptar | CORE |
| 12 | `tiempo_entrega_2_4_days` | idem | clonar + adaptar | CORE |
| 13 | `tiempo_entrega_sin_ciudad` | clonar | clonar | CORE |
| 14 | `registro_sanitario` | clonar de sales-v3 OR recompra (chequear cuál es el copy oficial — sales-v3 dice INVIMA, recompra dice FDA) | **clarificar con usuario** | CORE |
| 15 | `ubicacion` | clonar de sales-v3 | clonar | CORE+COMP |
| 16 | `contraindicaciones` | clonar de recompra (intent canónico `contraindicaciones`) | clonar | CORE |
| 17 | `dependencia` | clonar de seed inicial 2026-02-06 | clonar | CORE |
| 18 | `efectividad` | clonar de sales-v3 | clonar | CORE+COMP+OPC |
| 19 | `confirmacion_orden_same_day` (post-compra) | adaptar de sales-v3 — copy nuevo: "Listo! Tu pedido está confirmado✅ Llegará {{tiempo_estimado}}" | crear NEW copy | CORE+COMP |
| 20 | `confirmacion_orden_transportadora` | adaptar | crear NEW copy | CORE+COMP |
| 21 | `pedir_datos_post_compra` | adaptar de `pedir_datos_quiero_comprar_implicito` con tono post-compra | crear NEW: "Para despachar tu pedido nos haría falta:\n{{campos_faltantes}}" | CORE |
| 22 | `confirmar_direccion_post_compra` | reuso de `preguntar_direccion_recompra` adaptado | crear NEW: "Confirmamos tu envío a 📍 {{direccion_completa}}?" | CORE |
| 23 | `agendar_pregunta` (D-11) | NUEVO | crear: "¿Deseas agendarlo para alguna fecha futura?" | CORE |
| 24 | `claro_que_si_esperamos` (D-14) | reuso de copy `no_interesa` de sales-v3/recompra | crear: "Claro que sí 🤍 Esperamos tu mensaje para brindarte la mejor solución a tus noches de insomnio 😴" | CORE |
| 25 | `cancelado_handoff` (D-21) | NUEVO | crear: "Te conectamos con un asesor para procesar tu cancelación 🤝" | CORE |
| 26 | `procesando_v1` (opcional, ver §B.1 latency) | NUEVO | crear: "Un momento, estoy revisando tu pedido... ⏳" | CORE |
| 27 | `fallback` | clonar de sales-v3 | clonar | CORE |
| 28 | `error_carga_pedido` (degradación) | NUEVO | crear: "Hubo un problema cargando tu pedido. ¿Podrías indicarme tu número de pedido o nombre completo para ayudarte? 🙏" | CORE |

**Total estimado:** ~35 rows en `agent_templates` (cuenta CORE+COMP+OPC variants).

**Migración SQL idempotente:** patrón análogo a `supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql` (DO $$ IF NOT EXISTS ... INSERT). Aplicarse en Plan 01 ANTES del push de código (Regla 5 strict).

### I.2 Set definitivo de tools del agente

V1: **Sin AI SDK tools.** Adapter pattern como sales-v3/recompra. Adapter nuevo:

| Adapter | Operaciones |
|---------|-------------|
| `crm-writer-adapter.ts` (NEW) | `updateOrderShipping(orderId, address, city, dept)`, `moveOrderToStage(orderId, stageId)`, `archiveOrder(orderId)` (no usado V1) |

Internamente: importa `proposeAction` + `confirmAction` de `src/lib/agents/crm-writer/two-step.ts`. Maneja error contract `stage_changed_concurrently` emitiendo evento + retornando gracefully.

V1.1 (deferred): AI SDK sub-call para editar items (D-13).

### I.3 Set definitivo de test suites

Patrón espejo de recompra (4 suites). Para PW-confirmation:

| Suite | Cubre |
|-------|-------|
| `transitions.test.ts` | máquina de estados: confirmar (con/sin último=confirmar_compra), no (primero/segundo), espera, cambiar dirección. Pure function. |
| `response-track.test.ts` | selección de templates por estado. Mock TemplateManager. Cubrir paths: confirmacion_orden_*, agendar_pregunta, claro_que_si_esperamos, etc. |
| `last-template-resolver.test.ts` | helper `getLastTemplateName(conversationId)`. Mock supabase. Verificar D-09. |
| `crm-writer-adapter.test.ts` | mock `proposeAction + confirmAction`. Verificar happy path + `stage_changed_concurrently` handling + idempotency. |
| `shipping-completeness.test.ts` | helper `shippingComplete(activeOrder, contact)`. Pure function. |
| `extract-active-order.test.ts` | helper que parsea reader.text (o reader.toolCalls) en estructura ActiveOrderPayload. Pure function. |
| `__tests__/integration/pw-confirmation-flow.test.ts` (opcional) | integration con Inngest mocked. Reader mock retorna ok → agente arranca. End-to-end happy path: cliente dice "sí" tras confirmar_compra → moveOrderToStage(CONFIRMADO) propose+confirm. |

### I.4 Set definitivo de observability events

Ya documentado en §A.5 (15+ events).

### I.5 Diseño técnico CRM Reader bloqueante

Documentado en §B.1 (Opción C — Inngest 2-step orchestration).

### I.6 Wave breakdown sugerido

> **Disclaimer:** El plan-phase tiene la última palabra. Esto es solo guía.

- **Wave 0** (prep + bloqueantes):
  - SQL audits: stages UUIDs, automations Somnio, `whatsapp_templates` pre-activación, `messages.template_name` viability check.
  - Migration de templates (idempotente).
  - Aplicar migration en prod (Regla 5 strict).
- **Wave 1** (foundation, paralelizable):
  - Crear módulo `src/lib/agents/somnio-pw-confirmation/` con `config.ts`, `index.ts`, `constants.ts`, `types.ts`, `state.ts`, `phase.ts`, `guards.ts`, `comprehension*.ts`.
  - Crear adapter `crm-writer-adapter.ts`.
  - Registrar evento Inngest `pw-confirmation/preload-and-invoke` en `src/inngest/events.ts`.
  - Agregar pre-warm import en webhook-processor (cold lambda mitigation).
- **Wave 2** (state machine):
  - `transitions.ts` + tests.
  - `sales-track.ts` + tests.
  - Helper `getLastTemplateName(conversationId)`.
  - Helper `extractActiveOrder(readerOutput)`.
  - Helper `shippingComplete(order, contact)`.
- **Wave 3** (response + integration):
  - `response-track.ts` con reuso de `delivery-zones`.
  - Crear Inngest function `pw-confirmation-preload-and-invoke`.
  - Branch nuevo en `webhook-processor.ts`.
  - Branch nuevo en `v3-production-runner.ts`.
  - Import en routing editor page.
- **Wave 4** (testing + integration):
  - Suites de unit tests completos.
  - Integration test (mocked Inngest + crm-reader + crm-writer).
- **Wave 5** (production rollout):
  - Push código a Vercel.
  - Crear regla manualmente en `/agentes/routing-editor` (o via SQL) — usuario lo hace.
  - Smoke test con conversación real.
  - Documentación per Regla 4 (`docs/architecture/`, `docs/analysis/04-estado-actual-plataforma.md`).
  - Update `.claude/rules/agent-scope.md` con scope del nuevo agente.

### I.7 Identificar gaps que requieren decisión adicional del usuario antes de planificar

Ver §K.

---

## J. Pitfalls / riesgos identificados

| # | Pitfall | Mitigación |
|---|---------|-----------|
| 1 | Latencia percibida (5-30s tras inbound) por reader bloqueante | Considerar template `procesando_v1` instant en webhook ANTES del dispatch. Plan-phase decide. |
| 2 | Reader timeout fallback degrada UX | Template `error_carga_pedido` + intent flow para pedir datos manualmente. |
| 3 | Cold lambda race en agentRegistry (LEARNING agent-lifecycle-router) | Pre-warm `import('../somnio-pw-confirmation')` en webhook-processor BEFORE routing decision. |
| 4 | `messages.template_name` no rellenado por sistema pre-activación | Wave 0 SQL audit. Si null → fallback heurístico (intent classifier reconoce "sí" + stage="FALTA CONFIRMAR" como confirmación válida). |
| 5 | Concurrent stage change (D-06 de crm-stage-integrity) | El crm-writer adapter detecta `stage_changed_concurrently` → emite evento + intenta re-fetch del reader (1 reintento) → si vuelve a fallar, handoff humano. |
| 6 | `_v3:active_order` JSON crece sin bound (acumula items grandes) | Bound size: si > 5KB, truncar a campos esenciales. Monitorear p95. |
| 7 | Routing rule mal configurada por usuario → loop entre PW y otro agente | Documentar en regla creation: prioridad debe ser >= 700 < 800 (recompra) y conditions excluyentes con recompra. |
| 8 | Pre-activación pudo NO mover el pedido a uno de los 3 stages — agente nunca se invoca | Routing rule + fallback. NO es scope del agente. |
| 9 | Cliente envía mensaje DURANTE reader bloqueante (segundo mensaje en <5s) | Inngest concurrency `[{key: 'event.data.conversationId', limit: 1}]` serializa. Mensajes encadenados en `pendingUserMessage` (patrón v3-production-runner ya existente `:62-69`). |
| 10 | Idempotency: webhook reintenta envío del mismo evento Inngest | `step.run('call-reader')` retorna serializado → segunda ejecución no re-llama reader. Inngest lo garantiza (canon `recompra-preload-context.ts:131-135`). |
| 11 | Sales-v3 NO tiene tests — patrón a importar es de recompra (4 suites recientes) | Documentado §A.4. |
| 12 | `efectos` vs `contraindicaciones` (sales-v3 vs recompra) — divergencia de intent name | PW usa `contraindicaciones` (canónico recompra). Excluir `efectos` del set. |
| 13 | `registro_sanitario` copy diverge entre sales-v3 (INVIMA / PHARMA SOLUTIONS) y recompra (FDA / BDE NUTRITION). El producto cambió. | **Clarificar con usuario cuál copy es vigente** (Open Q5). |
| 14 | Adapter crm-writer ejecuta propose+confirm en mismo turno → bypass del two-step propósito (audit human review) | Documentar como decisión arquitectónica: para agentes backend, propose+confirm en mismo flow es equivalente a write directo, pero deja trace en `crm_bot_actions` para auditoría. Es el mismo patrón que un eventual `processWriterMessage` haría internamente. |
| 15 | Si automations Somnio NO disparan al mover a CONFIRMADO (asunción no verificada) | Wave 0 SQL audit + clarificar con usuario. Si NO existe automation: PW debe dispararlas explícitamente (out of scope V1 — escalar). |

---

## K. Decisiones que quedan abiertas para el usuario tras research

### Open Q1: Arquitectura del agente — state-machine + adapter vs AI SDK

¿Confirmas Opción 1 o 3 (state-machine + adapter, similar a sales-v3/recompra) sobre Opción 2 (AI SDK con tools del crm-writer)?

- **Opción 1 (state-machine + adapter, V1 sin editar items):** flujo predecible, copy controlado. NO cubre D-13 (editar items) en V1 — diferir a V1.1.
- **Opción 3 (híbrido state-machine + AI SDK sub-call para D-13):** flexible para editar items, mantiene predictibilidad para flujo principal. Requiere Sonnet (~$0.01/sub-call), pocas instancias.

**Recomendación research:** Opción 1 en V1. Plan-phase decide si V1 incluye D-13 (gap → handoff humano si lo pide) o se difiere.

### Open Q2: Latencia percibida — ¿enviar `procesando_v1` instant?

¿El cliente debe ver "Un momento, revisando tu pedido..." mientras el reader corre (3-25s)?

- **Sí:** mejor UX, reduce ansiedad. Más complejidad (2 ramas de envío).
- **No:** simpler. Cliente espera en silencio (similar a recompra que envía saludo INSTANT pero NO espera reader — recompra es non-blocking).

**Recomendación research:** No para V1 (simplificar). Si feedback negativo en producción → agregar V1.1.

### Open Q3: Helper `extractActiveOrder` — texto vs JSON estructurado del reader

¿El reader devuelve solo `text` o también persistimos `_v3:active_order` JSON estructurado?

- **Solo text:** simple, agente parsea con regex/LLM. Frágil.
- **Text + JSON estructurado:** más robusto, agente lee JSON directamente para mutaciones. Step.run extrae JSON de `reader.toolCalls` (objects accesibles).

**Recomendación research:** Text + JSON estructurado. El step.run('call-reader') extrae `orderId`, `stage_id`, `pipeline_id`, `shippingAddress`, `shippingCity`, `shippingDepartment`, `total_value`, `items[]`, `customerName`, `customerPhone`, `customerEmail`, `tags[]` del último `ordersGet` toolCall en `reader.steps[*].toolResults`.

### Open Q4: D-09 fallback si `messages.template_name` está vacío

Si la audit Wave 0 muestra que `pedido_recibido_v2`/`direccion_entrega`/`confirmar_compra` NUNCA aparecen en `messages.template_name`, ¿cuál es el fallback para detectar "el cliente está respondiendo a `confirmar_compra`"?

Opciones:
- **A:** consider any "sí" en stage `FALTA CONFIRMAR` o `NUEVO PAG WEB` como confirmación válida (heurística por stage).
- **B:** preguntar explícitamente al cliente "¿confirmas tu pedido por X total?" antes de mover stage (sub-template `confirmar_pedido_explicito`).
- **C:** tratar TODO "sí" como ambiguo y SIEMPRE re-pedir confirmación con resumen.

**Recomendación research:** Opción C — más conservadora, evita confirmar pedidos no deseados. UX un poco más larga pero correctness > brevedad.

### Open Q5: Copy de `registro_sanitario` — INVIMA o FDA?

Sales-v3 dice INVIMA / PHARMA SOLUTIONS SAS. Recompra dice FDA / BDE NUTRITION LLC. **¿Cuál es vigente?**

**Recomendación research:** clarificar con usuario, posiblemente actualizar AMBOS (sales-v3 + recompra) si el copy de uno es desactualizado. Para PW-confirmation, usar el vigente.

### Open Q6: Routing rule — ¿la crea el plan-phase o el usuario manualmente?

D-02 dice "Routing es responsabilidad del usuario". Pero la regla DEBE existir para que el agente entre en producción. ¿El plan-phase incluye un Wave que SQL-inserts la regla (con confirmación del usuario), o se deja 100% manual?

**Recomendación research:** plan-phase incluye SQL template + instrucciones manual en SUMMARY de Wave 5. NO ejecuta automáticamente. Patrón de agent-lifecycle-router Plan 07 Task 4 (HUMAN flip).

### Open Q7: ¿Stage UUIDs como constantes hardcoded o resueltos en runtime?

- **Hardcoded:** SQL Wave 0 captura UUIDs reales, se exporta como `STAGE_IDS` en `constants.ts`. Más simple, riesgo si UUIDs cambian (no debería pasar — pipeline_stages es seed estático para Somnio).
- **Resueltos runtime:** cada turno consulta `pipelinesList/stagesList` o lo cachea en sesión. Más robusto, +1 query por turno.

**Recomendación research:** hardcoded en `constants.ts` con comentario "Stages Somnio production verified 2026-04-XX. Si cambian → actualizar." Resolver runtime es over-engineering.

### Open Q8: Handoff stub — ¿flag `requires_human` en sesión o en contacto?

D-21 dice "stub". ¿Dónde guardar la señal?

- **Session state (`session_state.datos_capturados._v3:requires_human`)**: efímero, scoped al turn-life de esta sesión. No visible al humano operador.
- **Contact custom_field**: persistente, visible en CRM, pero pollutes contact data.
- **Solo observability event `handoff_triggered`**: zero state, zero side-effects. Operador ve evento en debug panel.

**Recomendación research:** solo observability event para V1. Dueño del CRM decide cómo procesar handoffs (asignar agente humano, notificar en Slack, etc.) en standalone futuro.

---

## L. Confidence breakdown

| Área | Nivel | Razón |
|------|-------|-------|
| Catálogo sales-v3 templates | **HIGH** | verificado en migrations + grep codebase |
| Pre-activation templates en `whatsapp_templates` | **MEDIUM** | nombre coincide con D-09; existencia real depende de Wave 0 SQL audit |
| Schema orders/contacts | **HIGH** | verificado en migrations |
| Stages UUIDs | **LOW** | NO en migrations; depende de Wave 0 SQL audit en prod |
| Automations Somnio dispara stage_change | **MEDIUM** | razonable inferir que existe; verificación Wave 0 |
| CRM reader/writer tool inventory | **HIGH** | grep + read directo de `tools/` |
| `updateOrder.products` reemplaza items | **HIGH** | verificado en `domain/orders.ts:461-489` |
| `stage_changed_concurrently` contract | **HIGH** | usado en frontend kanban + actions/orders |
| Routing facts `activeOrderStageRaw`/Pipeline | **HIGH** | en migration 2026-04-27 |
| Diseño Inngest 2-step (Opción C) | **MEDIUM** | patrón nuevo (no implementado en otra parte). Análogo recompra es non-blocking. Riesgos identificados §J. |
| `messages.template_name` populated en pre-activación | **LOW** | NO verificable sin SQL en prod (Wave 0). |
| `registro_sanitario` copy vigente | **LOW** | divergencia entre sales-v3 y recompra; necesita clarificación humana |

---

## M. Sources

### Codebase (HIGH confidence)

- `src/lib/agents/registry.ts:1-118` — agent registry pattern
- `src/lib/agents/somnio-v3/somnio-v3-agent.ts:1-467` — agent orchestrator
- `src/lib/agents/somnio-v3/sales-track.ts:1-221` — pure state machine
- `src/lib/agents/somnio-v3/response-track.ts:1-404` — template engine
- `src/lib/agents/somnio-v3/transitions.ts:1-478` — declarative transition table
- `src/lib/agents/somnio-v3/constants.ts:1-217` — V3 constants + intents
- `src/lib/agents/somnio-v3/config.ts:1-76` — agent config
- `src/lib/agents/somnio-v3/delivery-zones.ts:1-134` — municipality lookup
- `src/lib/agents/somnio-v3/comprehension.ts:1-142` + `comprehension-prompt.ts:1-109` — Haiku call
- `src/lib/agents/somnio-recompra/somnio-recompra-agent.ts:1-572` — recompra fork
- `src/lib/agents/somnio-recompra/transitions.ts:1-300` — recompra transitions
- `src/lib/agents/somnio-recompra/response-track.ts:1-408` — recompra template engine (TEMPLATE_LOOKUP_AGENT_ID pattern)
- `src/lib/agents/somnio-recompra/constants.ts:1-153` — recompra constants
- `src/lib/agents/somnio-recompra/config.ts:1-72` — recompra config
- `src/lib/agents/somnio-recompra/state.ts:1-386` — state management (createPreloadedState)
- `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts:1-143` — test pattern
- `src/lib/agents/somnio-recompra/__tests__/response-track.test.ts:1-184` — test pattern
- `src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts:1-128` — poll test pattern
- `src/lib/agents/crm-reader/index.ts:1-91` — reader entry point
- `src/lib/agents/crm-reader/system-prompt.ts:1-46` — reader scope
- `src/lib/agents/crm-reader/config.ts:1-63` — reader config
- `src/lib/agents/crm-reader/tools/contacts.ts:1-78` + `orders.ts:1-74` + `pipelines.ts` + `tags.ts` — reader tools
- `src/lib/agents/crm-writer/two-step.ts` — propose+confirm primitives
- `src/lib/agents/crm-writer/tools/orders.ts:1-256` — writer tools (CRITICAL: updateOrder.products soporta replace)
- `src/lib/agents/crm-writer/tools/contacts.ts:1-142` — writer contact tools
- `src/lib/agents/production/webhook-processor.ts:200-550` — routing + recompra branch (template para PW branch)
- `src/lib/agents/engine/v3-production-runner.ts:1-200` — runner pattern (template para PW)
- `src/inngest/functions/recompra-preload-context.ts:1-275` — Inngest function pattern + step.run __obs merge
- `src/lib/agents/somnio/template-manager.ts:240-339` — agent_templates DB query pattern
- `src/app/(dashboard)/agentes/routing/editor/page.tsx:14-29` — agent dropdown registration
- `src/lib/agents/routing/route.ts:120-170` — routing engine + agentRegistry validation
- `src/lib/domain/orders.ts:461-489` — updateOrder replaces products
- `supabase/migrations/20260315150000_v3_independent_templates.sql:1-122` — sales-v3 template seed
- `supabase/migrations/20260423142420_recompra_template_catalog_gaps.sql` — idempotent template migration pattern
- `supabase/migrations/20260131000002_whatsapp_extended_foundation.sql:11-118` — whatsapp_templates + messages.template_name schema
- `supabase/migrations/20260129000003_orders_foundation.sql:70-128` — orders schema
- `supabase/migrations/20260130000001_orders_shipping_address.sql` + `20260217000000_real_fields.sql` — shipping fields
- `supabase/migrations/20260427160000_routing_facts_pipeline_stage_raw.sql:1-29` — activeOrderStageRaw fact

### Standalone precedents (HIGH confidence)

- `.planning/standalone/somnio-recompra-template-catalog/01-SNAPSHOT.md:1-119` — template snapshot pattern + 34 rows recompra
- `.planning/standalone/somnio-recompra-template-catalog/01-SUMMARY.md` — template clone lessons (verbatim copy + idempotent SQL)
- `.planning/standalone/somnio-recompra-crm-reader/PATTERNS.md:1-1005` — Inngest function + observability merge pattern + dispatch + step.run
- `.planning/standalone/agent-lifecycle-router/07-SUMMARY.md` — routing rules creation, B-001 cold lambda race, pre-warm fix
- `.planning/standalone/agent-lifecycle-router/07-SOMNIO-PARITY-RULES.md` — example of routing rule shape + SQL pattern
- `.claude/rules/agent-scope.md` (Reader Bot + Writer Bot + Recompra sections) — scope doc pattern + consumer documentation pattern

### MEMORY (HIGH confidence)

- "Vercel serverless + Inngest: NEVER fire-and-forget" — webhook → inngest.send must be `await`
- "Inngest step.run observability merge pattern" — __obs return + collector.mergeFrom + flush as last step
- "CLAUDE.md Regla 5: Migración Antes de Deploy" — SQL aplicado en prod ANTES del push
- "CLAUDE.md Regla 4: Documentación actualizada" — `.claude/rules/agent-scope.md`, `docs/architecture/`, `docs/analysis/04-estado-actual-plataforma.md`

### Items requiring Wave 0 production audit (LOW confidence until verified)

- Stage UUIDs for `NUEVO PAG WEB`, `FALTA INFO`, `FALTA CONFIRMAR`, `CONFIRMADO`
- Existence + body of `pedido_recibido_v2`, `direccion_entrega`, `confirmar_compra` in `whatsapp_templates`
- Whether `messages.template_name` is populated for those 3 templates
- Existing automations Somnio triggered by stage move
- Current value of `workspace_agent_config.lifecycle_routing_enabled` (likely true per agent-lifecycle-router 07-SUMMARY but verify)
- Current value of `workspace_agent_config.conversational_agent_id` for Somnio

---

## Metadata

**Research date:** 2026-04-27
**Valid until:** 2026-05-15 (sales-v3/recompra/crm-reader/crm-writer/routing engines mature; valid for ~3 weeks unless one of these refactors)
**Standalone slug:** `somnio-sales-v3-pw-confirmation`
**Workspace:** Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`)
**Upstream agents read:** somnio-sales-v3, somnio-recompra-v1, crm-reader, crm-writer, agent-lifecycle-router
**Files read line-by-line:** ~25 files (agents + tests + migrations + standalone summaries)
**Files searched via grep:** ~10
**Templates inventoried:** sales-v3 (~30 rows) + recompra (34 rows verified in SNAPSHOT.md) + new PW-confirmation set (~35 rows)

**Research-phase complete. Ready for plan-phase consumption.**
