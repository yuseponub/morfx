---
phase: somnio-sales-v3-pw-confirmation
plan: 07
status: complete
wave: 3
completed: 2026-04-28
duration_minutes: 18
---

# Plan 07 SUMMARY — Wave 3 Response Track (template selector)

## Decision agregada

**GO** — `response-track.ts` creado en `src/lib/agents/somnio-pw-confirmation/`. typecheck limpio (0 errores TS introducidos en todo el repo). 1 atomic commit, NO push (Plans 07-12 quedan locales hasta Plan 13 per orchestrator standalone parallel mode).

## Commit (atomic)

| Task | Hash      | Message |
|------|-----------|---------|
| 1    | `b4fb49f` | `feat(somnio-sales-v3-pw-confirmation): add response-track.ts (template selector — D-10 zone-based confirmation, D-12 direccion_completa con departamento, D-15 catalog lookup, D-16 delivery-zones reuse)` |

## Archivo creado

| Path | LoC | Rol |
|------|-----|-----|
| `src/lib/agents/somnio-pw-confirmation/response-track.ts` | 516 | Selector de templates por (salesAction, intent, state) — invoca TemplateManager + composeBlock + delivery-zones REUSE |

## Exports publicos (3)

| Export | Tipo | Rol |
|--------|------|-----|
| `resolveResponseTrack` | `async function` | Entry point — input `{salesAction?, intent?, state, workspaceId}` → `Promise<ResponseTrackOutput>` |
| `resolveSalesActionTemplates` | `async function` | Switch sobre 9 TipoAccion → `{intents, extraContext?}`. Exportada explicitamente para tests Plan 12 (mockean TemplateManager + delivery-zones). |
| `ResponseMessage` / `ResponseTrackOutput` | `interface` | Output shapes (locales — `types.ts` Plan 03 es minimal stub). |

## Imports — boundary check

`response-track.ts` importa de:

| From | Import | Pattern |
|------|--------|---------|
| `@/lib/observability` | `getCollector` | observability events (template_selection block_composed / empty_result) |
| `@/lib/agents/somnio/template-manager` | `TemplateManager` | DB template lookup scoped por agent_id + workspace_id |
| `@/lib/agents/somnio/block-composer` | `composeBlock`, `PrioritizedTemplate` | block composition (3 templates max, intent cap) |
| `@/lib/agents/somnio-v3/delivery-zones` | `lookupDeliveryZone`, `formatDeliveryTime` | **REUSE D-16** — zone resolution + tiempo formatting (NO duplicacion) |
| `@/lib/agents/types` | `IntentRecord` | shape para `getTemplatesForIntents` |
| `./constants` | `INFORMATIONAL_INTENTS`, `TEMPLATE_LOOKUP_AGENT_ID` | catalog scope key + informational dispatcher |
| `./state` | `shippingComplete`, `AgentState`, `ActiveOrderPayload` | data + helper para `formatMissingFields` |
| `./types` | `TipoAccion` | union tipada del switch |

ZERO imports a otros agentes (`somnio-recompra/*`, `somnio-v3/*` excepto delivery-zones que es agnostic per RESEARCH §A.2). Pattern anti-circular dependencies clonado de recompra/v3.

## D-locks implementados

### D-10: Zone-based confirmation template selection

`case 'confirmar_compra'` invoca `lookupDeliveryZone(state.datos.ciudad)` → si `zone === 'same_day'` emite `confirmacion_orden_same_day`, else `confirmacion_orden_transportadora`. `extraContext` incluye `tiempo_estimado` (formatDeliveryTime), `items` (bullet list desde `state.active_order.items`) y `total` (formatPrice colombiano "$77,900").

Fallback safe: si `state.datos.ciudad` es null → default a `confirmacion_orden_transportadora` con `tiempo_estimado: 'en 2-4 dias habiles'` (no crash).

### D-12: direccion_completa con departamento

`case 'actualizar_direccion'` emite template `confirmar_direccion_post_compra` con:

```ts
direccion_completa: [direccion, ciudad, departamento].filter(Boolean).join(', ')
```

Departamento explicitamente incluido (leccion recompra-template-catalog 2026-04-23 — se shippea correcto desde dia 1 aqui, no en patch posterior).

### D-15: Catalog lookup independiente

`TemplateManager.getTemplatesForIntents(TEMPLATE_LOOKUP_AGENT_ID, ...)` donde `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-sales-v3-pw-confirmation'` (literal en `constants.ts`). NO comparte catalogo con `somnio-sales-v3` ni `somnio-recompra-v1`. Templates eliminados post-checkpoint Plan 02 (`confirmar_direccion_post_compra`, `cancelado_handoff`) son referenciados literalmente per plan must_haves — TemplateManager retorna empty si no estan en catalog (degradacion graceful via `templates_not_found_in_catalog` empty reason).

### D-16: Delivery-zones REUSE (NO duplicacion)

`lookupDeliveryZone` y `formatDeliveryTime` son importados directo de `@/lib/agents/somnio-v3/delivery-zones`. Zero duplicacion de logica de:
- Normalizacion de ciudad (`normalizeCity`).
- DB lookup contra `delivery_zones` table.
- Cutoff time evaluation en America/Bogota timezone (CLAUDE.md Regla 2).
- Edge cases: domingo → "el LUNES", sabado after cutoff → "el LUNES", viernes after cutoff → "MAÑANA".

Patron validado RESEARCH §A.2: las funciones son agent-agnostic; recompra ya las reusa desde 2026-04-23.

## Switch sobre 9 TipoAccion (cobertura completa)

| TipoAccion | Template intent emitido | extraContext | Notas |
|------------|--------------------------|--------------|-------|
| `confirmar_compra` | `confirmacion_orden_same_day` \| `_transportadora` | tiempo_estimado, items, total | D-10 zone-based dynamic selection |
| `pedir_datos_envio` | `pedir_datos_post_compra` | campos_faltantes (bullet list) | D-12 — invoca shippingComplete().missing → FIELD_LABELS |
| `actualizar_direccion` | `confirmar_direccion_post_compra` | direccion_completa | D-12 — incluye departamento |
| `cancelar_con_agendar_pregunta` | `agendar_pregunta` | — | D-11 paso 1 |
| `cancelar_definitivo` | `cancelado_handoff` | — | D-11 paso 2 |
| `editar_items` | `cancelado_handoff` | — | V1 D-13 → handoff (mismo template) |
| `mover_a_falta_confirmar` | `claro_que_si_esperamos` | — | D-14 |
| `handoff` | `cancelado_handoff` | — | D-21 stub |
| `noop` | `[]` | — | engine cae a informational fallthrough |

Default branch: TypeScript exhaustiveness check (`const _exhaustive: never = action`) para futuras extensiones de TipoAccion.

## Templates referenciados por response-track.ts (cobertura del Plan 02 catalog — 22 intents)

| Categoria | Templates referenciados | Cobertura |
|-----------|--------------------------|-----------|
| **Informacionales (14)** — passthrough en `INFORMATIONAL_INTENTS` | saludo, precio, promociones, contenido, formula, como_se_toma, pago, envio, ubicacion, contraindicaciones, dependencia, efectividad, registro_sanitario | 13/13 directo (intent → template intent name) |
| **Tiempo entrega zone-specific (5)** — branch `intent === 'tiempo_entrega'` | tiempo_entrega_same_day, tiempo_entrega_next_day, tiempo_entrega_1_3_days, tiempo_entrega_2_4_days, tiempo_entrega_sin_ciudad | 5/5 via `tiempo_entrega_${zoneResult.zone}` interpolation + `_sin_ciudad` fallback |
| **Sales actions confirmados (2)** — branch `salesAction === 'confirmar_compra'` | confirmacion_orden_same_day, confirmacion_orden_transportadora | 2/2 zone-based |
| **Sales actions data capture (1)** — branch `pedir_datos_envio` | pedir_datos_post_compra | 1/1 |
| **Sales actions referenciadas pero gap en catalog (3)** — referenciados literalmente per plan must_haves; template manager retorna empty graceful | confirmar_direccion_post_compra, cancelado_handoff, agendar_pregunta | 1/3 en catalog (`agendar_pregunta` SI; los otros 2 NO — eliminados post-checkpoint Plan 02) |
| **Sales actions D-14 (1)** — branch `mover_a_falta_confirmar` | claro_que_si_esperamos | 1/1 |
| **Fallback (1)** — engine Plan 11 emite via response-track cuando intent='fallback' (no manejado en este file directamente) | fallback | 0/1 — fallback es responsabilidad de Plan 11 engine, no de response-track (intent='fallback' no esta en INFORMATIONAL_INTENTS) |

**Resumen catalog vs response-track:**
- 19 templates del catalog Plan 02 son emitibles directo por response-track.ts (informacionales 13 + zone variants 5 + 1 confirmacion data capture).
- 5 templates sales actions (confirmacion_orden_*, pedir_datos_post_compra, agendar_pregunta, claro_que_si_esperamos) emitidos en branches dedicadas.
- 2 templates referenciados pero ausentes del catalog actual (confirmar_direccion_post_compra, cancelado_handoff) — degradacion graceful via `emptyReason: 'templates_not_found_in_catalog'`.
- `fallback` template del catalog se emite en Plan 11 engine, NO desde response-track.

## Helpers privados (3)

| Helper | Rol |
|--------|-----|
| `formatMissingFields(state)` | Itera `shippingComplete(state).missing` → mapea a labels humanos via `FIELD_LABELS` (Nombre, Apellido, Telefono, Direccion completa, Ciudad, Departamento) → bullet list `- Label\n- Label`. Retorna empty string si no hay missing (defensive, no debe llamarse en este caso). |
| `formatItemsList(activeOrder)` | Itera `activeOrder.items` → bullet `- {cantidad} × {titulo}`. Retorna empty string si activeOrder null o items=[]. |
| `formatPrice(value)` | Format COP "$77,900" via regex thousands separator (manual — evita Intl.NumberFormat locale quirks). Retorna empty string si value=0 o non-finite. |

`resolveDeliveryTimeTemplates(state)` es helper interno (no exported) que delega a `lookupDeliveryZone + formatDeliveryTime` para `intent === 'tiempo_entrega'` informacional + para `salesAction === 'confirmar_compra'` (mismo patron que recompra).

## Observability events emitidos (2)

| Event | Channel | Action | Payload |
|-------|---------|--------|---------|
| Empty result | `template_selection` | `empty_result` | `{ agent: 'pw-confirmation', salesAction, intent, reason }` — reasons posibles: `silent_action_handoff`, `silent_action_cancelar_definitivo`, `silent_action_editar_items`, `non_informational_intent_*`, `no_action_no_intent`, `templates_not_found_in_catalog` |
| Block composed | `template_selection` | `block_composed` | `{ agent: 'pw-confirmation', salesTemplateCount, infoTemplateCount, allIntents, finalBlockSize }` |

Pattern alineado con recompra (mismo channel, mismo action names, distinto agent label). Plan 11 engine emitira eventos adicionales (`crm_context_used`, `crm_writer_*`).

## ResponseTrackOutput shape

```ts
interface ResponseTrackOutput {
  messages: ResponseMessage[]      // [] cuando empty
  templateIdsSent: string[]        // [] cuando empty
  intent_emitted: string | null    // sales emitted intent ?? info intent ?? first allIntent ?? null
  emptyReason?: string             // solo presente cuando messages.length === 0
}
```

`intent_emitted` es prioritized: prefer sales action's first emitted intent (semantic), fallback a informational intent, fallback al primer allIntent. Plan 11 engine usa este valor para incrementar `state.templatesMostrados` + push a `intent_history`.

## Diferencias claves vs recompra/response-track.ts

| Aspecto | Recompra | PW-Confirmation |
|---------|----------|------------------|
| `agent_id` lookup | `'somnio-recompra-v1'` (constante local) | `'somnio-sales-v3-pw-confirmation'` (importado de constants.ts) |
| Sales actions | mostrar_confirmacion, crear_orden, preguntar_direccion, ofrecer_promos, cambio (prospect-flow) | confirmar_compra, pedir_datos_envio, actualizar_direccion, cancelar_*, mover_a_falta_confirmar, editar_items, handoff (post-purchase) |
| `pack` selection | Si — buildResumenContext usa state.pack | NO (D-18 no crea pedidos — pack es prospect concept) |
| `getGreeting` | Si — `Buenos dias/tardes/noches Nombre` con Intl.DateTimeFormat tz=America/Bogota | NO usado en sales actions (puede agregarse a Plan 11 engine si templates lo requieren) |
| Anti-loop | `state.templatesMostrados` array de IDs | `state.templatesMostrados` Record<intent, count> — pasamos `[]` a TemplateManager (anti-loop upstream en Plan 08 sales-track via intent_history) |
| Paraphrase | `processTemplates(..., true)` cuando intent visto antes | `processTemplates(..., false)` siempre — PW no usa paraphrase feature flag |
| `precio` special | Recompra emite `promociones + pago` (sin tiempo_efecto_1) | PW emite `precio` directo (catalog tiene su propio template) |
| `intent_emitted` | NO en output (recompra usa `salesTemplateIntents` + `infoTemplateIntents` arrays) | SI en output (Plan 11 engine lo usa para `state.templatesMostrados` increment) |
| Combine saludo CORE | `hasSaludoCombined` branch (saludo CORE first, resto pool) | NO — composeBlock estandar (saludo es just-another-intent) |

## Desviaciones del plan

1. **`secondaryIntent` parametro omitido del input.** El plan signature dice `{salesAction, intent, state, workspaceId}` (sin secondaryIntent). Recompra tiene `secondaryIntent` opcional para combinar dos intents en un turn. PW lo omite para Wave 3 — comprehension Plan 05 emite UN solo intent (no `intent.secondary` como sales-v3); si se necesita combinar en V1.1 se agrega.

2. **`getGreeting` helper NO clonado.** Recompra lo expone como public function para uso en preguntar_direccion + ofrecer_promos. PW no tiene esos cases (post-compra no necesita time-of-day greeting en sales actions). Si Plan 11 engine necesita el helper para algun template informacional, puede importarlo de recompra (es agnostic) o re-clonarlo en su modulo. Documentado en file header.

3. **`intent_emitted` field no estaba explicitamente en interfaces del plan** — agregado para compatibilidad con Plan 11 engine que necesita saber que template intent fue el "principal" para anti-loop tracking. Recompra usa los arrays separados; PW prefiere el field normalizado.

4. **`templatesMostrados` Record vs array — pasamos `[]` a TemplateManager.** State PW tiene `templatesMostrados: Record<string, number>` (count por intent), NO `string[]` de IDs como recompra. TemplateManager.getTemplatesForIntents espera `string[]` de IDs ya enviados — pasamos array vacio porque el anti-loop upstream se hace en Plan 08 sales-track via `intent_history` (cap 6 FIFO) + Plan 11 engine via `templatesMostrados` count check antes de invocar response-track. Si llegamos a response-track, ya se decidio que es legitimo emitir el template aunque sea repetido.

5. **`emptyReason: 'templates_not_found_in_catalog'`** — branch agregada para detectar cuando TemplateManager retorna selectionMap empty (e.g. confirmar_direccion_post_compra y cancelado_handoff fueron eliminados del catalog post-checkpoint Plan 02 pero el plan must_haves los referencia literalmente). Engine Plan 11 puede degradar a texto natural o silent.

6. **Plan 02 grep verification (`'confirmar_direccion_post_compra'`, `'cancelado_handoff'`) cumplido literalmente.** Aunque Plan 04 SUMMARY documenta que estos templates fueron eliminados del catalog (mapeados a `[]` en ACTION_TEMPLATE_MAP), Plan 07 must_haves explicitamente exige que response-track los referencie. Compromiso: response-track los pide al TemplateManager — si el catalog los tiene los emite, si no retorna empty graceful (no crash). Esto satisface ambos plans (07 grep + 04 catalog reality) y deja la puerta abierta para que un plan futuro agregue estos 2 templates al catalog si se decide.

## typecheck output

```bash
$ npx tsc --noEmit 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/" | wc -l
0

$ npx tsc --noEmit 2>&1 | grep -c "error TS"
0
```

**0 errores TS** introducidos. typecheck global del repo paso clean.

## Verify checklist (acceptance_criteria del Plan 07)

- [x] `response-track.ts` existe con 516 LoC (excede min_lines=200 del plan).
- [x] `resolveResponseTrack` exportada como async function.
- [x] `resolveSalesActionTemplates` exportada como async function (para tests Plan 12).
- [x] `TEMPLATE_LOOKUP_AGENT_ID` importado de `./constants` (NO hardcoded literal).
- [x] `lookupDeliveryZone` + `formatDeliveryTime` importados de `@/lib/agents/somnio-v3/delivery-zones` (REUSE D-16).
- [x] Switch cubre los 9 TipoAccion del union (incluido `noop` y default exhaustive).
- [x] `direccion_completa` concat incluye `state.datos.departamento` (D-12).
- [x] `confirmar_compra` branch invoca delivery-zones para zone-based template selection (D-10, D-16).
- [x] `pedir_datos_envio` branch incluye `campos_faltantes` interpolado.
- [x] `mover_a_falta_confirmar` branch emite `claro_que_si_esperamos` (D-14).
- [x] `cancelar_con_agendar_pregunta` branch emite `agendar_pregunta` (D-11).
- [x] `noop` branch retorna `[]` (engine handles fallthrough).
- [x] All 17 grep automated checks PASS (verified manually + run).
- [x] typecheck OK (0 errores).
- [x] Commit atomico (`b4fb49f`), NO pusheado.

## Implicancias para Plans subsiguientes

### Plan 08 (sales-track.ts)
- NO consume directamente response-track (separation of concerns: sales-track decide WHAT; response-track decide HOW TO SAY).
- Plan 08 retorna `{ accion: TipoAccion, reason: string }` — Plan 11 engine pasa el `accion` como `salesAction` parametro de `resolveResponseTrack`.

### Plan 11 (engine-pw-confirmation.ts)
- Pipeline: `analyzeMessage(Plan 05) → checkGuards(Plan 06) → mergeAnalysis(Plan 06) → resolveTransition(Plan 06 transitions) → if accion='handoff' return early else resolveResponseTrack(Plan 07) + crmWriterAdapter(Plan 10)`.
- Engine pasa: `{ salesAction: transitionResult.accion, intent: analysis.intent, state: mergedState, workspaceId }`.
- Engine consume: `result.messages` (envia via WhatsApp), `result.templateIdsSent` (push a state.templatesMostrados[intent]++), `result.intent_emitted` (push a state.intent_history).
- Si `result.messages.length === 0`:
  - Si `result.emptyReason === 'silent_action_handoff'` → fire `pipeline_decision:handoff_triggered` event + set `requires_human=true` + return early.
  - Si `result.emptyReason === 'templates_not_found_in_catalog'` → degradar a texto natural ("Recibido, un asesor te ayudara") o silent dependiendo del intent_emitted.
  - Si `result.emptyReason === 'no_action_no_intent'` → log warning + emit fallback template (Plan 11 owns this).

### Plan 12 (response-track.test.ts)
- Test fixtures puros: `state` mock + `salesAction` + `intent` → expect `messages`, `templateIdsSent`, `intent_emitted`, `emptyReason`.
- Mock `TemplateManager.getTemplatesForIntents` (return Map vacio o populated).
- Mock `lookupDeliveryZone` (return zone fixtures: same_day / next_day / 1_3_days / 2_4_days / sin_ciudad).
- Mock `formatDeliveryTime` (return strings fixtures).
- 9 happy-path tests (1 por TipoAccion) + edge cases:
  - confirmar_compra sin ciudad → fallback transportadora.
  - actualizar_direccion sin departamento → direccion_completa truncado.
  - pedir_datos_envio con shippingComplete().missing=[] → campos_faltantes='' (defensive).
  - intent='tiempo_entrega' sin ciudad → tiempo_entrega_sin_ciudad.
  - intent='precio' (informational direct) → INFORMATIONAL_INTENTS branch.
  - salesAction='handoff' → emptyReason='templates_not_found_in_catalog' (cancelado_handoff no en catalog).

## Self-Check

```bash
=== Files exist ===
FOUND: src/lib/agents/somnio-pw-confirmation/response-track.ts (516 LoC)

=== Commits exist ===
FOUND: b4fb49f (response-track.ts)

=== typecheck ===
$ npx tsc --noEmit
exit: 0 (zero TS errors)

=== grep checks (17/17 PASS) ===
OK: export async function resolveResponseTrack
OK: export async function resolveSalesActionTemplates
OK: TEMPLATE_LOOKUP_AGENT_ID
OK: lookupDeliveryZone
OK: formatDeliveryTime
OK: from '@/lib/agents/somnio-v3/delivery-zones'
OK: 'confirmacion_orden_same_day'
OK: 'confirmacion_orden_transportadora'
OK: 'pedir_datos_post_compra'
OK: 'confirmar_direccion_post_compra'
OK: 'agendar_pregunta'
OK: 'claro_que_si_esperamos'
OK: 'cancelado_handoff'
OK: direccion_completa
OK: state.datos.departamento
OK: campos_faltantes
OK: INFORMATIONAL_INTENTS
```

- [x] response-track.ts existe (516 LoC, excede min_lines=200).
- [x] 2 funciones publicas exportadas (resolveResponseTrack + resolveSalesActionTemplates).
- [x] D-10 (zone-based confirmacion_orden_*) implementado.
- [x] D-12 (direccion_completa con departamento) implementado.
- [x] D-15 (TEMPLATE_LOOKUP_AGENT_ID = somnio-sales-v3-pw-confirmation, catalog independiente) implementado.
- [x] D-16 (delivery-zones REUSE, NO duplicacion) implementado.
- [x] Switch cubre los 9 TipoAccion (con default exhaustive).
- [x] formatMissingFields, formatItemsList, formatPrice helpers privados implementados.
- [x] composeBlock + processTemplates + TemplateManager reusados (NO duplicacion).
- [x] Observability events emitidos (template_selection block_composed / empty_result).
- [x] typecheck OK (0 errores TS introducidos).
- [x] 1 commit atomico (`b4fb49f`), NO pusheado.
- [x] ZERO imports a otros agentes excepto delivery-zones REUSE (agnostic per RESEARCH §A.2).

**Self-Check: PASSED**
