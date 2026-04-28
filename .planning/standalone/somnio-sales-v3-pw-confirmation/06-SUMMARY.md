---
phase: somnio-sales-v3-pw-confirmation
plan: 06
status: complete
wave: 3
completed: 2026-04-28
duration_minutes: 14
---

# Plan 06 SUMMARY — Wave 3 State Machine Core (state + phase + guards + transitions)

## Decision agregada

**GO** — 4 archivos creados en `src/lib/agents/somnio-pw-confirmation/`. typecheck limpio (0 errores TS introducidos). 4 atomic commits, NO push (Wave 0..6 quedan locales hasta Plan 13 per orchestrator standalone).

## Commits (4 atomic)

| Task | Hash      | Message |
|------|-----------|---------|
| 1    | `b90738e` | `feat(somnio-sales-v3-pw-confirmation): add state.ts (AgentState + createInitialState + mergeAnalysis + shippingComplete + extractActiveOrder)` |
| 2    | `a77f690` | `feat(somnio-sales-v3-pw-confirmation): add phase.ts (derivePhase reducer)` |
| 3    | `88978ff` | `feat(somnio-sales-v3-pw-confirmation): add guards.ts (R0 confidence + R1 escape intent)` |
| 4    | `3e6652b` | `feat(somnio-sales-v3-pw-confirmation): add transitions.ts (declarative table — D-09→D-26, D-10, D-11, D-12, D-13 V1 handoff, D-14)` |

## Archivos creados

| Path | LoC | Rol |
|------|-----|-----|
| `src/lib/agents/somnio-pw-confirmation/state.ts` | 557 | AgentState/DatosCliente/ActiveOrderPayload + 6 helpers (createInitialState, mergeAnalysis, shippingComplete, extractActiveOrder, serializeState, deserializeState) |
| `src/lib/agents/somnio-pw-confirmation/phase.ts` | 84 | derivePhase reducer (8 phases canonicas + 'initial') |
| `src/lib/agents/somnio-pw-confirmation/guards.ts` | 91 | R0 (low confidence < 0.5) + R1 (escape intent pedir_humano) |
| `src/lib/agents/somnio-pw-confirmation/transitions.ts` | 309 | TRANSITIONS array (12 entries) + resolveTransition + isInitialAwaiting helper |

**Total: 1041 LoC** across 4 files.

## D-26 implementado en createInitialState (state.ts)

`createInitialState({activeOrder, contact, crmContextStatus})` honra D-26:

```typescript
const phase = activeOrder !== null && crmContextStatus === 'ok'
  ? 'awaiting_confirmation'
  : 'nuevo'
```

- Cuando el reader devuelve un `activeOrder` y status='ok' → phase inicial = `awaiting_confirmation`. El primer "si" del cliente cuenta como confirmacion (D-26 + entry #1 de TRANSITIONS).
- Cuando reader fallo o no hay pedido → phase='nuevo' (degradacion graceful).
- Datos preloaded: split `contact.name` en nombre+apellido (si tiene espacio); fallback `activeOrder.customerName`. Shipping fields preferred from `activeOrder.shipping*`, fallback a `contact.address/city/department`.

## shippingComplete (RESEARCH §D.3 verbatim)

```
nombreOk: state.datos.nombre + state.datos.apellido ambos non-null
          OR state.datos.nombre con 2+ palabras (split implicito)
phoneOk:  state.datos.telefono matches /^57\d{10}$/
addressOk: state.datos.direccion non-empty (trim)
cityOk:   state.datos.ciudad non-empty (trim)
deptOk:   state.datos.departamento non-empty (trim)
```

Apellido NO se considera missing si nombre tiene 2+ palabras. Retorna `{complete, missing[]}` donde `missing` es subset de `SHIPPING_REQUIRED_FIELDS`.

## TRANSITIONS table (12 entries)

| # | when.phase | when.intent | when.condition | then.accion | reason | D-Lock |
|---|------------|-------------|----------------|-------------|--------|--------|
| 1 | INITIAL_AWAITING_STATES | confirmar_pedido | shippingComplete.complete | `confirmar_compra` | confirmation_with_complete_shipping | **D-09→D-26 + D-10** |
| 2 | INITIAL_AWAITING_STATES | confirmar_pedido | !shippingComplete.complete | `pedir_datos_envio` | confirmation_blocked_missing_shipping | D-12 + D-26 |
| 3 | awaiting_address_confirmation | confirmar_pedido | — | `confirmar_compra` | address_confirmed | **D-12** alt path |
| 4 | awaiting_address_confirmation | cambiar_direccion | — | `actualizar_direccion` | address_re_change_requested | D-12 loop |
| 5 | * | cambiar_direccion | — | `actualizar_direccion` | address_change_requested | **D-12** |
| 6 | awaiting_schedule_decision | cancelar_pedido | — | `cancelar_definitivo` | second_no_handoff | **D-11** paso 2 |
| 7 | INITIAL_AWAITING_STATES + awaiting_address_confirmation | cancelar_pedido | cancelacion_intent_count===0 | `cancelar_con_agendar_pregunta` | first_no_offer_schedule | **D-11** paso 1 |
| 8 | awaiting_schedule_decision | agendar | — | `mover_a_falta_confirmar` | schedule_accepted | D-11 alt path |
| 9 | * | esperar | — | `mover_a_falta_confirmar` | wait_acknowledged | **D-14** |
| 10 | * | editar_items | — | `handoff` | edit_items_v1_handoff | **D-13 V1** |
| 11 | * | pedir_humano | — | `handoff` | human_requested | D-21 (también guards.ts R1) |
| 12 | capturing_data | fallback | shippingComplete.complete | `confirmar_compra` | data_captured_now_complete | derived |

**Default:** informational intents → `noop` (`informational_query_response_track_handles`); cualquier otro intent no mapeado → `noop` (`no_matching_transition`).

**First-match wins:** entry #6 (awaiting_schedule_decision + cancelar) DEBE ir antes que #7 (INITIAL_AWAITING_STATES + cancelar) porque las phases son disjuntas; pero entry #4 (awaiting_address_confirmation + cambiar) DEBE ir antes que #5 (* + cambiar) porque #5 capturaria a #4 con su wildcard.

## Decisiones lockeadas implementadas

- **D-09 → D-26:** entry #1 — el guard del "si" es `state.phase IN INITIAL_AWAITING_STATES`, NO `messages.template_name`. La columna `template_name` puede consultarse pero NO es autoritativa (per CONTEXT.md §D-26).
- **D-10:** entry #1 → `confirmar_compra` action (engine Plan 10 invoca `crm-writer.moveOrderToStage(orderId, CONFIRMADO)`). Templates dinamicos por zona se eligen en Plan 07 response-track desde `ACTION_TEMPLATE_MAP['confirmar_compra'] = ['confirmacion_orden_same_day', 'confirmacion_orden_transportadora']` (constants.ts).
- **D-11:** entries #6-8 — flujo cancelacion 2 pasos. Engine Plan 11 incrementa `state.cancelacion_intent_count` cada vez que `accion='cancelar_con_agendar_pregunta'` se emite.
- **D-12:** entries #3-5 — `cambiar_direccion` → `actualizar_direccion` (sin template lookup; engine llama crm-writer en Plan 10/11). Plan 07 decide si emite `direccion_entrega` workspace template post-update o silencio.
- **D-13 V1:** entry #10 — `editar_items` → `handoff` (escala humano por agent-scope.md). V1.1 implementaria edicion real.
- **D-14:** entry #9 — `esperar` → `mover_a_falta_confirmar` (template `claro_que_si_esperamos` via ACTION_TEMPLATE_MAP). Engine Plan 11 mueve order a stage `FALTA_CONFIRMAR`.
- **D-21:** entry #11 + guards.ts R1 — `pedir_humano` capturado en doble layer (guard antes de transitions, transition por safety). Plan 11 engine retorna `messages: []` para action='handoff' (handoff silencioso, no template lookup).
- **D-25:** state machine PURE — ninguno de los 4 archivos hace I/O (no DB, no LLM, no HTTP). Solo data transformations sobre AgentState/MessageAnalysis. Las mutaciones CRM (crm-writer.moveOrderToStage / updateOrderShipping) viven en Plan 10 y se invocan desde Plan 11 engine.

## guards.ts — Threshold note

El plan pidio "threshold 0.5 literal". El Zod schema de Plan 05 lockea `confidence: z.number().min(0).max(1)` (rango 0..1, NO 0..100). Por tanto guards.ts usa la constante interna `LOW_CONFIDENCE_GUARD_THRESHOLD = 0.5` (no importa de constants.ts donde `LOW_CONFIDENCE_THRESHOLD = 80` — ese se aplica en escala 0..100 desde sales-track Plan 08, contexto distinto).

R0 NO bloquea cuando intent='fallback' con confidence=0 (es la degradacion esperada del comprehension cuando Haiku falla — no necesita escalation).

## phase.ts — derivePhase reducer

Mapea `acciones[]` (cronologicamente ordenado, oldest first) a phase canonica:

- Acciones terminales (priority): `handoff` → 'handoff'; `cancelar_definitivo` → 'closed'; `confirmar_compra` → 'confirmed'.
- Acciones intermedias (last-wins, scan en reverse): `mover_a_falta_confirmar` → 'waiting_decision'; `cancelar_con_agendar_pregunta` → 'awaiting_schedule_decision'; `actualizar_direccion` → 'awaiting_address'; `pedir_datos_envio` → 'capturing_data'; `editar_items` → 'handoff' (safety, V1 deferred).
- Si `acciones=[]` → 'initial'. Si solo hay `noop` → 'awaiting_confirmation' (estado post-reader D-26).

`createInitialState` (state.ts) NO usa derivePhase — setea `phase='awaiting_confirmation'` directo cuando hay activeOrder + reader OK. derivePhase es para observability + tests + visualizacion del flujo.

## extractActiveOrder — Open Q3 resuelto

Parsea el `_v3:active_order` JSON estructurado (Plan 09 Inngest function persistira esto via `JSON.stringify` desde tool outputs del reader).

**Defensive parsing:**
- Si `activeOrderJsonString` es null/undefined/empty → return null (no crash).
- Si `JSON.parse` lanza → console.warn + return null (NO throw — degradacion graceful).
- Si shape no incluye los required fields (orderId, stageId, pipelineId como strings non-empty) → return null.
- Items array filtrado: solo objetos con campos parseables; defaults seguros (titulo='', cantidad=0, unitPrice=0).
- Tags array: solo strings.

El parametro `crmContextText` se acepta por futurabilidad pero por ahora no se parsea (si JSON falla, retornamos null directo).

## Serialization symmetric

`serializeState(state)` → `Record<string, string>` con prefijo `_v3:` para metadata + nombres directos para datos del cliente (compatibilidad con otros agentes que leen `nombre`, `telefono`, etc. directo).

`deserializeState(datosCapturados)` reverso: defaults seguros si keys faltan (phase='nuevo', datos vacios, intent_history=[], acciones=[], cancelacion_intent_count=0, requires_human=false, crm_context_status='missing').

Tested mentalmente: `deserializeState(serializeState(s))` ≡ `s` para todos los campos (modulo trim de strings que ya estan trim por construccion en createInitialState/mergeAnalysis).

## typecheck output

```bash
$ npx tsc --noEmit 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/" | wc -l
0

$ npx tsc --noEmit 2>&1 | grep -c "error TS"
0
```

**0 errores TS** introducidos por los 4 archivos. typecheck global del repo paso clean (incluyendo modules upstream).

## Imports — boundary check

Los 4 archivos importan **SOLO** del propio modulo del agente:

| Archivo | Imports |
|---------|---------|
| `state.ts` | `./constants` (SHIPPING_REQUIRED_FIELDS, ShippingFieldName), `./types` (TipoAccion), `./comprehension-schema` (MessageAnalysis) |
| `phase.ts` | `./types` (TipoAccion) |
| `guards.ts` | `./comprehension-schema` (MessageAnalysis) |
| `transitions.ts` | `./constants` (INITIAL_AWAITING_STATES, INFORMATIONAL_INTENTS), `./types` (TipoAccion), `./state` (shippingComplete, AgentState) |

ZERO imports a otros modulos del proyecto (`@/lib/...`). Patron anti-circular dependencies clonado de somnio-recompra/.

## Desviaciones del plan

**Ninguna desviación material.** Todas las assertions del plan pasaron en primera ejecución. Notas menores:

1. **`derivePhase` en phase.ts**: el plan dice "Si acciones esta vacio → 'initial'". Implementado como early return. El plan tambien menciona "else → 'awaiting_confirmation' (estado inicial post-reader)" para acciones solo-noop — implementado como fallback al final del reverse scan.

2. **`editar_items` en derivePhase**: el plan no especifica pero la accion existe. Como en V1 editar_items siempre escala (entry #10 de transitions emite handoff inmediato), su presencia en `acciones[]` se trata como handoff. Documentado en el switch case con safety comment.

3. **transitions.ts `lastTemplate` parametro**: el plan lo menciona en signature pero NO se usa como guard (D-26 explicito: NO consultar messages.template_name). Aceptado en `ResolveTransitionInput` por futurabilidad; documentado como "informativo, NO usado como guard (D-26)".

4. **Threshold de confidence en guards.ts**: el plan dice "0.5 literal". Use `0.5` en escala 0..1 (matching el Zod schema de Plan 05). NO use `LOW_CONFIDENCE_THRESHOLD=80` de constants.ts porque ese aplica en escala 0..100 (sales-track Plan 08, distinto contexto). Documentado in-file.

5. **Entry #12 (capturing_data + fallback + shippingComplete)**: derived per spec del plan ("data_captured_now_complete"). Trigger es `intent='fallback'` porque cuando el cliente provee datos espontaneos, comprehension typicamente los extrae a `datos_extraidos` con intent='fallback' (no es ninguna de las 22 categorias claras). Si el cliente respondiera con un intent claro (e.g. 'envio'), eso ya cae al noop default y response-track lo maneja.

## Implicancias para Plans subsiguientes

### Plan 07 (response-track.ts)
- Importa: `INFORMATIONAL_INTENTS`, `ACTION_TEMPLATE_MAP`, `TEMPLATE_LOOKUP_AGENT_ID` (todos de constants.ts).
- Para `accion='confirmar_compra'` → leer `ACTION_TEMPLATE_MAP['confirmar_compra']` (ambos templates) y elegir zone-specific dinamicamente per `crm_context.zone`.
- Para `accion='handoff' | 'cancelar_definitivo' | 'editar_items'` → return `{ messages: [] }` (silent handoff).
- Para `accion='actualizar_direccion'` → decidir aqui si emitir `direccion_entrega` (template productivo workspace-level, agent_id NULL) o texto natural confirmando el update.
- Puede consumir `state.crm_context_status` para fallback messages cuando reader fallo.

### Plan 08 (sales-track.ts)
- Importa: `resolveTransition` (de transitions.ts), `checkGuards` (de guards.ts), `derivePhase` (de phase.ts), `mergeAnalysis` (de state.ts).
- Pipeline sales-track: `comprehension(message) → checkGuards(analysis) → if blocked: emit handoff; else mergeAnalysis(state, analysis) → resolveTransition({phase, intent, state})`.
- Importa `LOW_CONFIDENCE_THRESHOLD=80` (escala 0..100) de constants.ts para fallback message a usuario (NO confundir con guards.ts threshold).

### Plan 11 (engine-pw-confirmation.ts)
- Compone: `analyzeMessage` (Plan 05) → `checkGuards` (Plan 06) → `mergeAnalysis` (Plan 06) → `resolveTransition` (Plan 06) → `responseTrack` (Plan 07) + `crmWriterAdapter` (Plan 10).
- Increment `state.cancelacion_intent_count` cuando se emite `accion='cancelar_con_agendar_pregunta'`.
- Set `state.requires_human=true` cuando `accion='handoff'` o `accion='cancelar_definitivo'`.
- Push `accion` a `state.acciones` antes de serializeState.
- Usa `derivePhase(state.acciones)` para observability events (NO para tomar decisiones — solo display).
- Persistir state via `SessionManager.updateCapturedData(serializeState(state))`.

### Plan 12 (tests)
- Test fixtures puros (sin mocks de I/O):
  - `transitions.test.ts`: 12 entries × happy path + edge cases. D-26 critico: phase='awaiting_confirmation' + intent='confirmar_pedido' + shippingComplete=true → 'confirmar_compra'. D-11: count=0 vs count=1 produce decisiones distintas.
  - `state.test.ts`: createInitialState con/sin activeOrder; mergeAnalysis con campos null/non-null; shippingComplete edge cases (nombre con 2 palabras, telefono mal formateado, etc.); extractActiveOrder defensive parsing (JSON invalido, shape parcial); serialize/deserialize roundtrip.
  - `phase.test.ts`: derivePhase con arrays vacios, terminales, intermedias mixtas.
  - `guards.test.ts`: R0 con confidence=0.49/0.5/0.51; R1 con intent='pedir_humano' vs otros; intent='fallback' con confidence=0 NO bloquea.

## Self-Check

```bash
=== Files exist ===
FOUND: src/lib/agents/somnio-pw-confirmation/state.ts (557 LoC)
FOUND: src/lib/agents/somnio-pw-confirmation/phase.ts (84 LoC)
FOUND: src/lib/agents/somnio-pw-confirmation/guards.ts (91 LoC)
FOUND: src/lib/agents/somnio-pw-confirmation/transitions.ts (309 LoC)

=== Commits exist ===
FOUND: b90738e (state.ts)
FOUND: a77f690 (phase.ts)
FOUND: 88978ff (guards.ts)
FOUND: 3e6652b (transitions.ts)

=== typecheck ===
$ npx tsc --noEmit
exit: 0 (zero TS errors)
```

- [x] 4 archivos creados (state + phase + guards + transitions).
- [x] 9 funciones/types exportados en state.ts (3 interfaces + 6 helpers).
- [x] D-26 implementado en createInitialState (initial='awaiting_confirmation' tras reader).
- [x] D-09→D-26 implementado en TRANSITIONS entry #1 (state.phase guard, NO messages.template_name).
- [x] D-11 cancellation flow implementado (entries 6 + 7 + 8).
- [x] D-12 address change implementado (entries 3 + 4 + 5).
- [x] D-13 V1 handoff implementado (entry 10).
- [x] D-14 espera implementado (entry 9).
- [x] D-10 confirmacion implementado (entry 1 → confirmar_compra).
- [x] shippingComplete usa exactamente RESEARCH §D.3 algoritmo.
- [x] extractActiveOrder NO throwea en JSON invalido — retorna null.
- [x] serializeState/deserializeState symmetric.
- [x] R0 (low confidence < 0.5) + R1 (escape pedir_humano) en guards.ts.
- [x] derivePhase reducer con 8 phases canonicas + 'initial'.
- [x] typecheck OK (0 errores TS introducidos).
- [x] 4 commits atomicos, NO pusheados.
- [x] ZERO imports a otros modulos del proyecto (solo `./constants`, `./types`, `./comprehension-schema`, `./state`).

**Self-Check: PASSED**
