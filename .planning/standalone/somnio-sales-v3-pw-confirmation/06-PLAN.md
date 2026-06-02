---
phase: somnio-sales-v3-pw-confirmation
plan: 06
type: execute
wave: 3
depends_on: [03, 04, 05]
files_modified:
  - src/lib/agents/somnio-pw-confirmation/state.ts
  - src/lib/agents/somnio-pw-confirmation/phase.ts
  - src/lib/agents/somnio-pw-confirmation/guards.ts
  - src/lib/agents/somnio-pw-confirmation/transitions.ts
autonomous: true

requirements: []

must_haves:
  truths:
    - "state.ts exporta `AgentState` interface (phase, datos, intent_history, acciones, etc.) + `createInitialState({preloadedActiveOrder, preloadedContact, crmContextStatus})` que crea el estado inicial con phase='awaiting_confirmation' (D-26) cuando hay pedido + reader OK"
    - "state.ts exporta helper `mergeAnalysis(state, analysis)` que actualiza datos del cliente desde MessageAnalysis.datos_extraidos + helper `shippingComplete(state)` que retorna {complete, missing[]} per RESEARCH §D.3 algoritmo + helper `serializeState(state)` y `deserializeState(session)` (clonar de recompra)"
    - "state.ts exporta helper `extractActiveOrder(crmContext, activeOrderJson)` que parsea el `_v3:active_order` JSON estructurado (Open Q3 resuelto: text + JSON) y retorna ActiveOrderPayload tipado"
    - "phase.ts exporta `derivePhase(acciones)` que mapea acciones recientes a phase canonica: 'initial' / 'awaiting_confirmation' / 'capturing_data' / 'awaiting_address' / 'awaiting_schedule_decision' / 'confirmed' / 'waiting_decision' / 'handoff' / 'closed'"
    - "guards.ts exporta `checkGuards(analysis, state)` con R0 (low confidence <0.5 → handoff) + R1 (escape intent pedir_humano → handoff) — clonado de v3 guards"
    - "transitions.ts exporta `resolveTransition({phase, intent, state, lastTemplate})` que retorna {accion: TipoAccion, reason: string} via tabla declarativa (~15 entries) — incluye D-26 regla: state in INITIAL_AWAITING_STATES + intent='confirmar_pedido' → accion='confirmar_compra'"
    - "transitions.ts implementa D-11 cancellation flow: 1er 'cancelar_pedido' → 'cancelar_con_agendar_pregunta'; 2do 'cancelar_pedido' (post agendar_pregunta enviado) → 'cancelar_definitivo' (handoff)"
    - "transitions.ts implementa D-14: intent='esperar' → 'mover_a_falta_confirmar'"
    - "transitions.ts implementa D-12: intent='cambiar_direccion' → 'actualizar_direccion'"
    - "transitions.ts implementa D-13 V1: intent='editar_items' → 'handoff' (NO 'editar_items' real — V1 escala a humano per CONTEXT.md y agent-scope.md)"
    - "npm run typecheck no introduce errors nuevos"
  artifacts:
    - path: "src/lib/agents/somnio-pw-confirmation/state.ts"
      provides: "AgentState shape + createInitialState + mergeAnalysis + shippingComplete + extractActiveOrder + serialize/deserialize"
      contains: "createInitialState"
      min_lines: 200
    - path: "src/lib/agents/somnio-pw-confirmation/phase.ts"
      provides: "derivePhase reducer"
      contains: "derivePhase"
      min_lines: 30
    - path: "src/lib/agents/somnio-pw-confirmation/guards.ts"
      provides: "R0 (confidence) + R1 (escape intents) guards"
      contains: "checkGuards"
      min_lines: 20
    - path: "src/lib/agents/somnio-pw-confirmation/transitions.ts"
      provides: "Declarative transition table + resolveTransition function (~15 entries)"
      contains: "resolveTransition"
      min_lines: 150
  key_links:
    - from: "src/lib/agents/somnio-pw-confirmation/transitions.ts"
      to: "src/lib/agents/somnio-pw-confirmation/constants.ts INITIAL_AWAITING_STATES"
      via: "guard del 'si' (D-26)"
      pattern: "INITIAL_AWAITING_STATES"
    - from: "src/lib/agents/somnio-pw-confirmation/state.ts"
      to: "src/lib/agents/somnio-pw-confirmation/constants.ts SHIPPING_REQUIRED_FIELDS"
      via: "shippingComplete algorithm"
      pattern: "SHIPPING_REQUIRED_FIELDS"
---

<objective>
Wave 3 — Crear el corazon del state machine: state, phase, guards, transitions. Estos 4 archivos implementan toda la logica de decision (D-09 reinterpretada por D-26, D-10, D-11, D-12, D-13 V1, D-14).

Purpose: D-25 lockea state-machine pura. La maquina recibe (phase + intent + state + lastTemplate) y produce una accion (TipoAccion). Las 4 piezas:

- **state.ts**: estado serializable + helpers (createInitialState, mergeAnalysis, shippingComplete, extractActiveOrder, serialize/deserialize). El `createInitialState` resuelve D-26 (initial='awaiting_confirmation' cuando hay pedido pre-loaded del reader).
- **phase.ts**: reducer puro `derivePhase(acciones)` para visualizacion / observability (mismo patron que v3/recompra).
- **guards.ts**: R0 (low confidence) + R1 (escape intents) → corto-circuita a handoff antes de transitions.
- **transitions.ts**: tabla declarativa con ~15 entries que cubre las decisiones D-09→D-26, D-10, D-11, D-12, D-13 V1 (handoff), D-14.

Output: 4 archivos en `src/lib/agents/somnio-pw-confirmation/`.

Dependencias: Plans 03 (config + types), 04 (constants — INITIAL_AWAITING_STATES + KEYWORDS + SHIPPING_REQUIRED_FIELDS + PW_CONFIRMATION_STAGES), 05 (MessageAnalysis type).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-09, §D-10, §D-11, §D-12, §D-13, §D-14, §D-25, §D-26
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §A.6 (estructura), §D.3 (shippingComplete algorithm), §I.6 Wave 2 (helpers list)
@src/lib/agents/somnio-recompra/state.ts — patron AgentState + createInitialState + createPreloadedState
@src/lib/agents/somnio-recompra/transitions.ts — patron tabla declarativa
@src/lib/agents/somnio-recompra/phase.ts — patron derivePhase
@src/lib/agents/somnio-recompra/guards.ts — patron R0/R1
@src/lib/agents/somnio-v3/transitions.ts — referencia adicional (478 lineas — tabla compleja, NO clonar tal cual; PW es mas simple)
@src/lib/agents/somnio-pw-confirmation/constants.ts (Plan 04 — INITIAL_AWAITING_STATES, SHIPPING_REQUIRED_FIELDS, AFFIRMATIVE_KEYWORDS, etc.)
@src/lib/agents/somnio-pw-confirmation/types.ts (Plan 03 — TipoAccion union)
@src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts (Plan 05 — MessageAnalysis type)

<interfaces>
<!-- AgentState (extender V3AgentInput de types.ts) -->
interface AgentState {
  phase: string  // values from config.ts states[]
  datos: DatosCliente  // nombre, apellido, telefono, direccion, ciudad, departamento
  active_order: ActiveOrderPayload | null  // del reader (D-05)
  intent_history: string[]  // last 6 intents
  acciones: TipoAccion[]  // chronological actions taken
  templatesMostrados: Record<string, number>  // intent → count
  cancelacion_intent_count: number  // 0 = no, 1 = primera vez "no", 2 = post-agendar_pregunta "no"
  requires_human: boolean  // handoff stub flag (D-21)
  crm_context_status: 'ok' | 'empty' | 'error' | 'missing'  // del reader
}

interface DatosCliente {
  nombre: string | null
  apellido: string | null
  telefono: string | null
  direccion: string | null  // shippingAddress
  ciudad: string | null     // shippingCity
  departamento: string | null  // shippingDepartment
}

interface ActiveOrderPayload {
  orderId: string
  stageId: string
  stageName: string
  pipelineId: string
  totalValue: number
  items: Array<{ titulo: string; cantidad: number; unitPrice: number }>
  shippingAddress: string | null
  shippingCity: string | null
  shippingDepartment: string | null
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  tags: string[]
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear `state.ts` con AgentState + createInitialState + mergeAnalysis + shippingComplete + extractActiveOrder</name>
  <read_first>
    - src/lib/agents/somnio-recompra/state.ts LINEAS COMPLETAS (~440 lineas — patron de createPreloadedState es CRITICO para D-26)
    - src/lib/agents/somnio-pw-confirmation/constants.ts (Plan 04 — SHIPPING_REQUIRED_FIELDS, INITIAL_AWAITING_STATES)
    - src/lib/agents/somnio-pw-confirmation/types.ts (Plan 03 — TipoAccion)
    - src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts (Plan 05 — DatosExtraidos)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §D.3 (shippingComplete algorithm verbatim)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-26 (initial='awaiting_confirmation')
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/state.ts` con:

    1. **Type exports**: `DatosCliente`, `ActiveOrderPayload`, `AgentState` (shape arriba en interfaces).

    2. **createInitialState({ activeOrder, contact, crmContextStatus })**: factory que crea el estado inicial. Si `activeOrder !== null && crmContextStatus === 'ok'`, phase = 'awaiting_confirmation' (D-26). Si activeOrder === null, phase = 'nuevo' (degradacion). `datos` se preloadea desde `contact` (nombre, telefono) + `activeOrder` (shippingAddress, shippingCity, shippingDepartment).

    3. **mergeAnalysis(state, analysis)**: clonar el patron exacto de recompra/state.ts. Para cada campo en analysis.datos_extraidos que es non-null, merge en state.datos. Tambien push intent al intent_history (cap 6). Retorna `{state, changes}` donde `changes` lista los campos modificados.

    4. **shippingComplete(state)**: implementar el algoritmo VERBATIM de RESEARCH §D.3. Retorna `{complete: boolean, missing: ShippingFieldName[]}`. Reglas:
       - `nombreOk` = `state.datos.nombre + state.datos.apellido` ambos non-null OR `state.datos.nombre` contiene espacio (split nombre+apellido).
       - `phoneOk` = `state.datos.telefono` matches `/^57\d{10}$/`.
       - `addressOk` = `state.datos.direccion` non-empty.
       - `cityOk` = `state.datos.ciudad` non-empty.
       - `deptOk` = `state.datos.departamento` non-empty.
       - Apellido no aplica si nombre ya tiene 2+ palabras.

    5. **extractActiveOrder(crmContextText, activeOrderJsonString)**: parsea el `_v3:active_order` JSON estructurado (Open Q3 — text + JSON). Si activeOrderJsonString es non-empty, hace `JSON.parse` y retorna ActiveOrderPayload tipado. Si fail, fallback a parsing del text con regex (best-effort) — retorna `null` si no se puede determinar nada. **El parser NO debe throwar — siempre retornar null en caso de error y loggear**.

    6. **serializeState(state)**: convierte AgentState a `Record<string, string>` para `SessionManager.updateCapturedData`. Usar prefijos `_v3:`:
       - `_v3:phase`, `_v3:datos_nombre`, `_v3:datos_telefono`, etc.
       - `_v3:active_order` = JSON.stringify(state.active_order)
       - `_v3:intent_history` = JSON.stringify(state.intent_history)
       - `_v3:cancelacion_intent_count` = String(state.cancelacion_intent_count)
       - `_v3:requires_human` = String(state.requires_human)
       - `_v3:crm_context_status` = state.crm_context_status

    7. **deserializeState(sessionDatosCapturados)**: reverso de serializeState. Si keys faltan, usar defaults (phase='nuevo', datos vacios, etc.).

    Commit: `feat(somnio-sales-v3-pw-confirmation): add state.ts (AgentState + createInitialState + mergeAnalysis + shippingComplete + extractActiveOrder)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "export interface AgentState" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "export interface DatosCliente" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "export interface ActiveOrderPayload" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "export function createInitialState" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "export function mergeAnalysis" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "export function shippingComplete" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "export function extractActiveOrder" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "export function serializeState" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "export function deserializeState" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "awaiting_confirmation" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -qE "/\\^57\\\\d\\{10\\}\\\$/" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "_v3:active_order" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>grep -q "SHIPPING_REQUIRED_FIELDS" src/lib/agents/somnio-pw-confirmation/state.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/state\\.ts" | grep -q "error TS" && exit 1 || exit 0</automated>
  </verify>
  <acceptance_criteria>
    - 9 funciones/types exportados (3 interfaces + 6 helpers).
    - createInitialState retorna phase='awaiting_confirmation' cuando activeOrder presente + crmContextStatus='ok' (D-26).
    - shippingComplete usa exactamente el algoritmo de RESEARCH §D.3.
    - extractActiveOrder NO throwea — retorna null en error.
    - serializeState/deserializeState symmetric.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - state.ts listo para que transitions.ts (Task 4) y engine (Plan 11) lo consuman.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Crear `phase.ts` con derivePhase reducer</name>
  <read_first>
    - src/lib/agents/somnio-recompra/phase.ts LINEAS COMPLETAS (~50 lineas — patron exacto)
    - src/lib/agents/somnio-v3/phase.ts (referencia)
    - src/lib/agents/somnio-pw-confirmation/types.ts (TipoAccion)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/phase.ts` que exporte `derivePhase(acciones: TipoAccion[]): string`. Reglas (priorizar la accion mas reciente):

    - `acciones.includes('handoff')` → `'handoff'` (terminal)
    - `acciones.includes('cancelar_definitivo')` → `'closed'` (terminal cancelado)
    - `acciones.includes('confirmar_compra')` → `'confirmed'` (terminal happy path)
    - `acciones.includes('mover_a_falta_confirmar')` → `'waiting_decision'`
    - `acciones.includes('cancelar_con_agendar_pregunta')` → `'awaiting_schedule_decision'`
    - `acciones.includes('actualizar_direccion')` → `'awaiting_address'`
    - `acciones.includes('pedir_datos_envio')` → `'capturing_data'`
    - else → `'awaiting_confirmation'` (estado inicial post-reader, D-26)
    - Si acciones esta vacio → `'initial'`

    Commit: `feat(somnio-sales-v3-pw-confirmation): add phase.ts (derivePhase reducer)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/phase.ts</automated>
    <automated>grep -q "export function derivePhase" src/lib/agents/somnio-pw-confirmation/phase.ts</automated>
    <automated>grep -q "'handoff'" src/lib/agents/somnio-pw-confirmation/phase.ts</automated>
    <automated>grep -q "'confirmed'" src/lib/agents/somnio-pw-confirmation/phase.ts</automated>
    <automated>grep -q "'waiting_decision'" src/lib/agents/somnio-pw-confirmation/phase.ts</automated>
    <automated>grep -q "'capturing_data'" src/lib/agents/somnio-pw-confirmation/phase.ts</automated>
    <automated>grep -q "'awaiting_confirmation'" src/lib/agents/somnio-pw-confirmation/phase.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/phase\\.ts" | grep -q "error TS" && exit 1 || exit 0</automated>
  </verify>
  <acceptance_criteria>
    - derivePhase exportada con reducer de 8 estados + initial.
    - Prioriza acciones terminales (handoff > closed > confirmed) sobre intermedias.
    - typecheck OK. Commit atomico.
  </acceptance_criteria>
  <done>
    - phase.ts listo para engine (Plan 11) y observability events.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Crear `guards.ts` con R0 (confidence) + R1 (escape intents)</name>
  <read_first>
    - src/lib/agents/somnio-recompra/guards.ts LINEAS COMPLETAS
    - src/lib/agents/somnio-v3/guards.ts LINEAS COMPLETAS
    - src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts (MessageAnalysis)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/guards.ts` que exporte `checkGuards(analysis: MessageAnalysis): { blocked: boolean; reason: string | null }`. Reglas:

    - **R0 (low confidence)**: si `analysis.confidence < 0.5` AND `analysis.intent !== 'fallback'` → `{blocked: true, reason: 'low_confidence'}` (deja que fallback handler emite template fallback). NOTA: `intent='fallback'` con confidence=0 es OK (ya es la degradacion esperada).

    - **R1 (escape intent)**: si `analysis.intent === 'pedir_humano'` → `{blocked: true, reason: 'escape_intent_pedir_humano'}` (handoff inmediato per D-21 trigger d).

    - **else**: `{blocked: false, reason: null}`.

    Emitir observability event `guard:blocked` o `guard:passed` (clonar de v3 patron — opcional, pero util para debugging).

    Commit: `feat(somnio-sales-v3-pw-confirmation): add guards.ts (R0 confidence + R1 escape intent)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/guards.ts</automated>
    <automated>grep -q "export function checkGuards" src/lib/agents/somnio-pw-confirmation/guards.ts</automated>
    <automated>grep -q "low_confidence" src/lib/agents/somnio-pw-confirmation/guards.ts</automated>
    <automated>grep -q "pedir_humano" src/lib/agents/somnio-pw-confirmation/guards.ts</automated>
    <automated>grep -q "0.5" src/lib/agents/somnio-pw-confirmation/guards.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/guards\\.ts" | grep -q "error TS" && exit 1 || exit 0</automated>
  </verify>
  <acceptance_criteria>
    - checkGuards exportada con R0 + R1.
    - Threshold 0.5 literal.
    - typecheck OK. Commit atomico.
  </acceptance_criteria>
  <done>
    - guards.ts listo para engine (Plan 11) que invoca checkGuards ANTES de transitions.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Crear `transitions.ts` con tabla declarativa + resolveTransition (~15 entries — D-09→D-26, D-10, D-11, D-12, D-13 V1, D-14)</name>
  <read_first>
    - src/lib/agents/somnio-recompra/transitions.ts LINEAS COMPLETAS (~300 lineas — patron tabla)
    - src/lib/agents/somnio-v3/transitions.ts LINEAS COMPLETAS (478 lineas — referencia, mas compleja, NO clonar tal cual)
    - src/lib/agents/somnio-pw-confirmation/state.ts (Task 1 — AgentState)
    - src/lib/agents/somnio-pw-confirmation/constants.ts (Plan 04 — INITIAL_AWAITING_STATES)
    - src/lib/agents/somnio-pw-confirmation/types.ts (TipoAccion)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-09, §D-10, §D-11, §D-12, §D-13, §D-14, §D-26
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/transitions.ts` con:

    1. **TransitionEntry interface**:
       ```typescript
       interface TransitionEntry {
         when: { phase?: string | string[]; intent: string; condition?: (state: AgentState) => boolean }
         then: { accion: TipoAccion; reason: string }
       }
       ```

    2. **TRANSITIONS array** con ~15 entries:

       | # | when.phase | when.intent | when.condition | then.accion | reason | Lock |
       |---|------------|-------------|----------------|-------------|--------|------|
       | 1 | INITIAL_AWAITING_STATES (array) | confirmar_pedido | shippingComplete(state).complete === true | confirmar_compra | 'confirmation_with_complete_shipping' | D-09→D-26, D-10 |
       | 2 | INITIAL_AWAITING_STATES | confirmar_pedido | shippingComplete(state).complete === false | pedir_datos_envio | 'confirmation_blocked_missing_shipping' | D-12 |
       | 3 | * | esperar | — | mover_a_falta_confirmar | 'wait_acknowledged' | D-14 |
       | 4 | INITIAL_AWAITING_STATES + 'awaiting_address_confirmation' | cancelar_pedido | state.cancelacion_intent_count === 0 | cancelar_con_agendar_pregunta | 'first_no_offer_schedule' | D-11 paso 1 |
       | 5 | 'awaiting_schedule_decision' | cancelar_pedido | — | cancelar_definitivo | 'second_no_handoff' | D-11 paso 2 |
       | 6 | 'awaiting_schedule_decision' | agendar | — | mover_a_falta_confirmar | 'schedule_accepted' | D-11 alt path (schedule = move to FALTA CONFIRMAR) |
       | 7 | * | cambiar_direccion | — | actualizar_direccion | 'address_change_requested' | D-12 |
       | 8 | 'awaiting_data_capture' | * (any informational/sales except confirmar_pedido) | shippingComplete(mergeAnalysis(state, intent's data)).complete | confirmar_compra | 'data_captured_now_complete' | derived |
       | 9 | 'awaiting_address_confirmation' | confirmar_pedido | — | confirmar_compra | 'address_confirmed' | D-12 alt path |
       | 10 | 'awaiting_address_confirmation' | cambiar_direccion | — | actualizar_direccion | 'address_re_change_requested' | D-12 loop |
       | 11 | * | editar_items | — | handoff | 'edit_items_v1_handoff' | D-13 V1 |
       | 12 | * | pedir_humano | — | handoff | 'human_requested' | D-21 d (also caught by guards.ts R1) |
       | 13 | * | (informational intent) | — | noop | 'informational_query_response_track_handles' | (sales-track returns noop, response-track emits template) |
       | 14 | * | fallback | — | noop | 'fallback_response_track_handles' | (response-track emits fallback template) |
       | 15 | (default) | (any unmatched) | — | noop | 'no_matching_transition' | safety |

    3. **resolveTransition({phase, intent, state})**: itera TRANSITIONS, primer match (phase + intent + condition opcional) gana. Retorna `{accion, reason}`.

    4. **Helper `isInitialAwaiting(phase: string): boolean`** para evitar repetir el `INITIAL_AWAITING_STATES.includes(...)` check inline.

    Commit: `feat(somnio-sales-v3-pw-confirmation): add transitions.ts (declarative table — D-09→D-26, D-10, D-11, D-12, D-13 V1 handoff, D-14)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "export function resolveTransition" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "INITIAL_AWAITING_STATES" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "shippingComplete" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "'confirmar_compra'" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "'mover_a_falta_confirmar'" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "'cancelar_con_agendar_pregunta'" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "'cancelar_definitivo'" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "'actualizar_direccion'" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "'editar_items'" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "edit_items_v1_handoff\|D-13 V1" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>grep -q "cancelacion_intent_count" src/lib/agents/somnio-pw-confirmation/transitions.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/transitions\\.ts" | grep -q "error TS" && exit 1 || exit 0</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): add transitions.ts"</automated>
  </verify>
  <acceptance_criteria>
    - transitions.ts existe con TRANSITIONS array de ~15 entries.
    - Las 6 decisiones (D-09→D-26, D-10, D-11, D-12, D-13 V1, D-14) tienen entries dedicadas.
    - resolveTransition exportada.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - transitions.ts listo para Plan 08 (sales-track) y Plan 11 (engine).
  </done>
</task>

</tasks>

<verification>
- 4 archivos creados (state + phase + guards + transitions).
- D-26 implementado en createInitialState (initial='awaiting_confirmation' tras reader).
- D-09→D-26 implementado en TRANSITIONS entry #1.
- D-11 cancellation flow implementado (entries 4 + 5 + 6).
- D-12 address change implementado (entries 7 + 9 + 10).
- D-13 V1 handoff implementado (entry 11).
- D-14 espera implementado (entry 3).
- D-10 confirmacion implementado (entry 1 → confirmar_compra accion).
- typecheck OK.
- 4 commits atomicos, NO pusheados.
</verification>

<success_criteria>
- Plan 08 (sales-track) puede llamar `resolveTransition({phase, intent, state})` y obtener TipoAccion.
- Plan 11 (engine) puede componer: comprehension → guards.checkGuards → transitions.resolveTransition → response-track + crm-writer-adapter.
- Plan 12 (tests) puede testear resolveTransition con fixtures puras (sin mocks).
- D-26 honrado: transitions usa state.phase + INITIAL_AWAITING_STATES, NO consulta messages.template_name.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/06-SUMMARY.md` documenting:
- 4 commit hashes.
- LoC de cada archivo (state, phase, guards, transitions).
- Tabla de TRANSITIONS entries con (when, accion, D-XX lock).
- typecheck output.
</output>
</content>
</invoke>