---
phase: somnio-sales-v3-pw-confirmation
plan: 12
type: execute
wave: 6
depends_on: [04, 05, 06, 07, 08, 10, 11]
files_modified:
  - src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts
  - src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts
  - src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts
  - src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts
  - src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts
autonomous: true

requirements: []

must_haves:
  truths:
    - "5 archivos de tests creados en `src/lib/agents/somnio-pw-confirmation/__tests__/` cubriendo: transitions, state (shippingComplete + extractActiveOrder), response-track, sales-track, crm-writer-adapter"
    - "transitions.test.ts cubre las 6 decisiones D-XX: D-09→D-26 (si en awaiting_confirmation con shipping complete → confirmar_compra), D-09→D-26 sin shipping → pedir_datos_envio, D-10 (confirmar_compra accion), D-11 (1er no → cancelar_con_agendar_pregunta + count=1; 2do no → cancelar_definitivo), D-12 (cambiar_direccion → actualizar_direccion), D-13 V1 (editar_items → handoff), D-14 (esperar → mover_a_falta_confirmar)"
    - "state.test.ts cubre: shippingComplete con todos los campos / faltando alguno / telefono mal formato; extractActiveOrder con JSON valido / JSON invalido (graceful null); createInitialState con preloadedActiveOrder vs sin"
    - "response-track.test.ts mockea TemplateManager + verifica template selection por accion: confirmar_compra → confirmacion_orden_same_day vs _transportadora segun lookupDeliveryZone; pedir_datos_envio → pedir_datos_post_compra con campos_faltantes; actualizar_direccion → confirmar_direccion_post_compra con direccion_completa que INCLUYE departamento (D-12)"
    - "sales-track.test.ts cubre el caso multi-turno D-11 cancellation: 1) primer 'no' → cancelar_con_agendar_pregunta + state.cancelacion_intent_count=1; 2) state pre-loaded con count=1 + intent='cancelar_pedido' en awaiting_schedule_decision → cancelar_definitivo + state.requires_human=true"
    - "crm-writer-adapter.test.ts mockea proposeAction + confirmAction; cubre: happy path (executed); error stage_changed_concurrently propagated verbatim; error generico (failed)"
    - "Todos los tests usan vitest (ya en package.json del repo per Phase 44.1)"
    - "`npm run test -- src/lib/agents/somnio-pw-confirmation` ejecuta los 5 suites y TODOS pasan"
    - "npm run typecheck no introduce errors nuevos"
  artifacts:
    - path: "src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts"
      provides: "Test suite para resolveTransition cubriendo D-09→D-26, D-10, D-11 multi-turn, D-12, D-13 V1, D-14"
      contains: "resolveTransition"
      min_lines: 150
    - path: "src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts"
      provides: "Test suite para shippingComplete + extractActiveOrder + createInitialState"
      contains: "shippingComplete"
      min_lines: 100
    - path: "src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts"
      provides: "Test suite para resolveSalesActionTemplates con TemplateManager mocked"
      contains: "resolveSalesActionTemplates"
      min_lines: 120
    - path: "src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts"
      provides: "Test suite para resolveSalesTrack — multi-turn D-11 cancellation flow"
      contains: "resolveSalesTrack"
      min_lines: 80
    - path: "src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts"
      provides: "Test suite para crm-writer-adapter — propose+confirm + stage_changed_concurrently propagation"
      contains: "stage_changed_concurrently"
      min_lines: 100
  key_links:
    - from: "src/lib/agents/somnio-pw-confirmation/__tests__/*.test.ts"
      to: "src/lib/agents/somnio-pw-confirmation/{transitions,state,response-track,sales-track}.ts"
      via: "import + invoke con fixtures puros"
      pattern: "from '../"
---

<objective>
Wave 6 — Crear el set de 5 test suites para el agente. Pattern espejo de recompra (`__tests__/` directory). Coverage minimo per D-23 + RESEARCH §I.3.

Purpose: D-23 lockea: test set abierto, research propone, plan-phase implementa. RESEARCH §I.3 propone 5+ suites. Tests son CRITICOS para regresiones futuras (cualquier cambio al state machine o a los templates puede romper el flujo).

Output: 5 archivos `.test.ts` en `src/lib/agents/somnio-pw-confirmation/__tests__/`.

Dependencias: Plans 04-11 (todos los archivos a testear).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-23 (test set abierto)
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §A.4 (testing pattern recompra), §I.3 (set definitivo)
@src/lib/agents/somnio-recompra/__tests__/transitions.test.ts LINEAS COMPLETAS (~143 lineas — patron exacto)
@src/lib/agents/somnio-recompra/__tests__/response-track.test.ts LINEAS COMPLETAS (~184 lineas — patron exacto)
@src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts LINEAS COMPLETAS (~128 lineas — referencia mocking)
@package.json — vitest disponible
@src/lib/agents/somnio-pw-confirmation/* (todos los modulos a testear)

<interfaces>
<!-- Helper factory comun en tests (clonar de recompra) -->
function createPreloadedState(overrides?: Partial<AgentState>): AgentState {
  return {
    phase: 'awaiting_confirmation',
    datos: { nombre: 'Jose', apellido: 'Romero', telefono: '573001234567', direccion: 'Cra 10 #20-30', ciudad: 'Bucaramanga', departamento: 'Santander' },
    active_order: { orderId: 'order-1', stageId: '<uuid>', stageName: 'NUEVO PAG WEB', pipelineId: '<uuid>', totalValue: 77900, items: [{titulo: 'ELIXIR DEL SUEÑO', cantidad: 1, unitPrice: 77900}], shippingAddress: 'Cra 10 #20-30', shippingCity: 'Bucaramanga', shippingDepartment: 'Santander', customerName: 'Jose Romero', customerPhone: '573001234567', customerEmail: null, tags: [] },
    intent_history: [],
    acciones: [],
    templatesMostrados: {},
    cancelacion_intent_count: 0,
    requires_human: false,
    crm_context_status: 'ok',
    ...overrides,
  }
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear `transitions.test.ts` cubriendo D-09→D-26, D-10, D-11 multi-turn, D-12, D-13 V1, D-14</name>
  <read_first>
    - src/lib/agents/somnio-recompra/__tests__/transitions.test.ts LINEAS COMPLETAS (patron a clonar)
    - src/lib/agents/somnio-pw-confirmation/transitions.ts (Plan 06)
    - src/lib/agents/somnio-pw-confirmation/state.ts (Plan 06 — createPreloadedState helper)
    - src/lib/agents/somnio-pw-confirmation/constants.ts (INITIAL_AWAITING_STATES)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts` con vitest. Cubrir minimo 8 tests:

    1. **D-09→D-26 happy path**: phase='awaiting_confirmation' + intent='confirmar_pedido' + shipping complete → accion='confirmar_compra'.
    2. **D-09→D-26 missing shipping**: phase='awaiting_confirmation' + intent='confirmar_pedido' + shipping incomplete → accion='pedir_datos_envio'.
    3. **D-10 alternate state**: phase='awaiting_confirmation_post_data_capture' + intent='confirmar_pedido' + shipping complete → accion='confirmar_compra'.
    4. **D-11 step 1**: phase='awaiting_confirmation' + intent='cancelar_pedido' + state.cancelacion_intent_count=0 → accion='cancelar_con_agendar_pregunta'.
    5. **D-11 step 2**: phase='awaiting_schedule_decision' + intent='cancelar_pedido' → accion='cancelar_definitivo'.
    6. **D-11 alt path**: phase='awaiting_schedule_decision' + intent='agendar' → accion='mover_a_falta_confirmar'.
    7. **D-12**: any phase + intent='cambiar_direccion' → accion='actualizar_direccion'.
    8. **D-13 V1**: any phase + intent='editar_items' → accion='handoff' (V1 — NO accion='editar_items' real).
    9. **D-14**: any phase + intent='esperar' → accion='mover_a_falta_confirmar'.
    10. **Default fallback**: any phase + intent='fallback' → accion='noop' (response-track maneja fallback template).
    11. **R1 already caught by transitions**: any phase + intent='pedir_humano' → accion='handoff' (entry 12 transitions table — clarificar que esto es defense-in-depth, guards.ts R1 tambien lo atrapa).

    Usar `createPreloadedState({...overrides})` como factory de fixture (clonar de recompra patron — agregar como helper en el test file mismo si no existe public en state.ts).

    Commit: `test(somnio-sales-v3-pw-confirmation): add transitions.test.ts (D-09→D-26 + D-10 + D-11 multi-turn + D-12 + D-13 V1 handoff + D-14)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts</automated>
    <automated>grep -c "^\\s*it(" src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts | awk '$1 >= 8 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "confirmar_compra" src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts</automated>
    <automated>grep -q "cancelar_con_agendar_pregunta" src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts</automated>
    <automated>grep -q "cancelar_definitivo" src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts</automated>
    <automated>grep -q "mover_a_falta_confirmar" src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts</automated>
    <automated>grep -q "actualizar_direccion" src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts</automated>
    <automated>grep -q "editar_items.*handoff\\|D-13 V1" src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts</automated>
    <automated>npm run test -- src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts 2>&1 | tee /tmp/test-12-1.log; grep -qE "([0-9]+ passed)" /tmp/test-12-1.log</automated>
  </verify>
  <acceptance_criteria>
    - >=8 tests `it(...)` que cubren las 6 decisiones D-XX.
    - Tests pasan: `npm run test` exit 0.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - transitions.test.ts validates state machine logic.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Crear `state.test.ts` (shippingComplete + extractActiveOrder + createInitialState)</name>
  <read_first>
    - src/lib/agents/somnio-pw-confirmation/state.ts (Plan 06)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §D.3 (shippingComplete algorithm tests)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts` con vitest. Cubrir minimo 8 tests:

    1. **shippingComplete all present**: state con todos los 6 campos → `{complete: true, missing: []}`.
    2. **shippingComplete missing apellido**: state con nombre='Jose' (single word, no space) + apellido=null → missing incluye 'apellido' o 'nombre_completo'.
    3. **shippingComplete telefono mal formato**: telefono='3001234567' (sin 57) → missing incluye 'telefono'.
    4. **shippingComplete telefono valido**: telefono='573001234567' → no missing.
    5. **shippingComplete missing direccion/ciudad/departamento**: faltan los 3 → missing 3 entries.
    6. **extractActiveOrder JSON valido**: JSON con orderId+items+shipping → retorna ActiveOrderPayload tipado.
    7. **extractActiveOrder JSON invalido**: JSON malformed o '{}' → retorna null SIN throw.
    8. **createInitialState con activeOrder + crmOk**: phase='awaiting_confirmation' (D-26).
    9. **createInitialState sin activeOrder**: phase='nuevo' (degradacion).
    10. **serialize/deserialize round-trip**: state → serialize → deserialize → equals.

    Commit: `test(somnio-sales-v3-pw-confirmation): add state.test.ts (shippingComplete algorithm + extractActiveOrder graceful + createInitialState D-26)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts</automated>
    <automated>grep -c "^\\s*it(" src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts | awk '$1 >= 8 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "shippingComplete" src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts</automated>
    <automated>grep -q "extractActiveOrder" src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts</automated>
    <automated>grep -q "createInitialState" src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts</automated>
    <automated>npm run test -- src/lib/agents/somnio-pw-confirmation/__tests__/state.test.ts 2>&1 | tee /tmp/test-12-2.log; grep -qE "([0-9]+ passed)" /tmp/test-12-2.log</automated>
  </verify>
  <acceptance_criteria>
    - >=8 tests.
    - Tests pasan.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - state.test.ts validates pure helpers.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Crear `response-track.test.ts` (TemplateManager mocked + selector logic)</name>
  <read_first>
    - src/lib/agents/somnio-recompra/__tests__/response-track.test.ts LINEAS COMPLETAS (~184 lineas — patron exacto a clonar)
    - src/lib/agents/somnio-pw-confirmation/response-track.ts (Plan 07)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts` con vitest. Cubrir minimo 8 tests:

    1. **intent informacional**: intent='precio' → infoTemplateIntents incluye 'precio'.
    2. **salesAction='confirmar_compra' + ciudad='Bucaramanga' (same_day)**: template selected = 'confirmacion_orden_same_day'. extraContext.tiempo_estimado contiene 'HOY' o 'MAÑANA' o equivalent.
    3. **salesAction='confirmar_compra' + ciudad='Medellin' (transportadora)**: template = 'confirmacion_orden_transportadora'.
    4. **salesAction='pedir_datos_envio'**: template = 'pedir_datos_post_compra'. extraContext.campos_faltantes contains the missing fields formatted.
    5. **salesAction='actualizar_direccion'**: template = 'confirmar_direccion_post_compra'. extraContext.direccion_completa = 'Cra 10 #20-30, Bucaramanga, Santander' (D-12 — INCLUYE departamento).
    6. **salesAction='cancelar_con_agendar_pregunta'**: template = 'agendar_pregunta'.
    7. **salesAction='mover_a_falta_confirmar'**: template = 'claro_que_si_esperamos'.
    8. **salesAction='handoff'**: template = 'cancelado_handoff'.

    Mock `TemplateManager.getTemplatesForIntents` y `lookupDeliveryZone` per pattern de recompra test.

    Commit: `test(somnio-sales-v3-pw-confirmation): add response-track.test.ts (template selection + delivery-zone variation D-10 + direccion_completa con departamento D-12)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts</automated>
    <automated>grep -c "^\\s*it(" src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts | awk '$1 >= 8 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "confirmacion_orden_same_day" src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts</automated>
    <automated>grep -q "confirmacion_orden_transportadora" src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts</automated>
    <automated>grep -q "direccion_completa" src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts</automated>
    <automated>grep -q "Santander" src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts</automated>
    <automated>npm run test -- src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts 2>&1 | tee /tmp/test-12-3.log; grep -qE "([0-9]+ passed)" /tmp/test-12-3.log</automated>
  </verify>
  <acceptance_criteria>
    - >=8 tests.
    - direccion_completa test verifica que INCLUYE departamento (D-12 lock).
    - Tests pasan. Commit atomico.
  </acceptance_criteria>
  <done>
    - response-track.test.ts validates template selection.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Crear `sales-track.test.ts` (multi-turn D-11 cancellation flow)</name>
  <read_first>
    - src/lib/agents/somnio-pw-confirmation/sales-track.ts (Plan 08)
    - src/lib/agents/somnio-pw-confirmation/state.ts (createPreloadedState)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts` con vitest. Cubrir minimo 5 tests:

    1. **D-11 turn 1**: state con cancelacion_intent_count=0 + intent='cancelar_pedido' + phase='awaiting_confirmation' → accion='cancelar_con_agendar_pregunta' + state.cancelacion_intent_count === 1 (mutation in place).
    2. **D-11 turn 2**: state con cancelacion_intent_count=1 + intent='cancelar_pedido' + phase='awaiting_schedule_decision' → accion='cancelar_definitivo' + state.requires_human === true.
    3. **D-09→D-26 + datos en mismo mensaje**: state con shipping incomplete + analysis.datos_extraidos contains shippingAddress/City/Department + intent='confirmar_pedido' → mergeAnalysis primero → shippingComplete tras merge → accion='confirmar_compra' (NO 'pedir_datos_envio').
    4. **enterCaptura marker**: intent='confirmar_pedido' + shipping incomplete → accion='pedir_datos_envio' + result.enterCaptura === true.
    5. **handoff sets requires_human**: intent='pedir_humano' → accion='handoff' + state.requires_human === true (D-21).

    Commit: `test(somnio-sales-v3-pw-confirmation): add sales-track.test.ts (D-11 multi-turn cancellation + D-09→D-26 datos+confirmacion mismo mensaje + D-21 requires_human flag)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts</automated>
    <automated>grep -c "^\\s*it(" src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts | awk '$1 >= 5 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "cancelacion_intent_count" src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts</automated>
    <automated>grep -q "requires_human" src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts</automated>
    <automated>npm run test -- src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts 2>&1 | tee /tmp/test-12-4.log; grep -qE "([0-9]+ passed)" /tmp/test-12-4.log</automated>
  </verify>
  <acceptance_criteria>
    - >=5 tests cubriendo D-11 multi-turn + D-09→D-26 + D-21.
    - Tests pasan. Commit atomico.
  </acceptance_criteria>
  <done>
    - sales-track.test.ts validates orchestration logic (pre/post processing).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Crear `crm-writer-adapter.test.ts` (mock proposeAction + confirmAction + stage_changed_concurrently)</name>
  <read_first>
    - src/lib/agents/engine-adapters/production/crm-writer-adapter.ts (Plan 10)
    - src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts (referencia mocking pattern)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts` con vitest. Cubrir minimo 6 tests:

    1. **updateOrderShipping happy path**: mock proposeAction returns {status:'proposed', action_id:'a1'}, mock confirmAction returns {status:'executed'} → adapter returns {status:'executed', actionId:'a1'}.
    2. **moveOrderToConfirmado happy path**: idem.
    3. **moveOrderToFaltaConfirmar happy path**: idem.
    4. **stage_changed_concurrently propagated verbatim**: mock confirmAction returns {status:'failed', error:{code:'stage_changed_concurrently', message:'...'}} → adapter returns {status:'failed', error:{code:'stage_changed_concurrently', ...}} **WITHOUT converting**.
    5. **propose fails**: mock proposeAction returns {status:'rejected'} → adapter returns {status:'failed', error:{code:'propose_failed', ...}}.
    6. **confirm expired**: mock confirmAction returns {status:'expired'} → adapter returns {status:'failed', error:{code:'expired_or_dup', ...}}.

    Mock pattern (vi.mock al top):
    ```typescript
    vi.mock('@/lib/agents/crm-writer/two-step', () => ({
      proposeAction: vi.fn(),
      confirmAction: vi.fn(),
    }))
    ```

    Commit: `test(somnio-sales-v3-pw-confirmation): add crm-writer-adapter.test.ts (propose+confirm happy paths + stage_changed_concurrently propagation verbatim + expired/rejected paths)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts</automated>
    <automated>grep -c "^\\s*it(" src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts | awk '$1 >= 6 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "stage_changed_concurrently" src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts</automated>
    <automated>grep -q "vi.mock.*crm-writer.*two-step" src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts</automated>
    <automated>npm run test -- src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts 2>&1 | tee /tmp/test-12-5.log; grep -qE "([0-9]+ passed)" /tmp/test-12-5.log</automated>
  </verify>
  <acceptance_criteria>
    - >=6 tests.
    - stage_changed_concurrently test verifica propagation verbatim (NO conversion).
    - Tests pasan. Commit atomico.
  </acceptance_criteria>
  <done>
    - crm-writer-adapter.test.ts validates 2-step + error contract.
  </done>
</task>

</tasks>

<verification>
- 5 archivos de tests creados.
- `npm run test -- src/lib/agents/somnio-pw-confirmation` ejecuta los 5 suites con TODOS pasando.
- Coverage minima: >=35 tests entre los 5 suites (~8+8+8+5+6).
- typecheck OK.
- 5 commits atomicos, NO pusheados.
</verification>

<success_criteria>
- Cualquier regresion futura del state machine, response-track, sales-track, o adapter se detecta en CI.
- Plan 13 puede pushear con confianza (typecheck + tests + build pasan localmente).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/12-SUMMARY.md` documenting:
- 5 commit hashes.
- Total de tests por suite.
- Output de `npm run test -- src/lib/agents/somnio-pw-confirmation` (verificar X passed, 0 failed).
- typecheck output.
</output>
</content>
</invoke>