---
phase: somnio-sales-v3-pw-confirmation
plan: 08
type: execute
wave: 3
depends_on: [03, 04, 06]
files_modified:
  - src/lib/agents/somnio-pw-confirmation/sales-track.ts
autonomous: true

requirements: []

must_haves:
  truths:
    - "sales-track.ts exporta `resolveSalesTrack({phase, intent, state, analysis, lastTemplate})` (clonar signature de v3 sales-track)"
    - "resolveSalesTrack invoca `resolveTransition(...)` (de transitions.ts Plan 06) para obtener accion candidata"
    - "Pre-procesa state ANTES de transition: si analysis.datos_extraidos contiene shipping fields, mergeAnalysis los incorpora antes de evaluar shippingComplete (importante para D-09→D-26: cliente provee datos + dice 'si' en mismo mensaje → DEBE confirmar)"
    - "Post-procesa accion: si accion='cancelar_con_agendar_pregunta', incrementa state.cancelacion_intent_count a 1 (para que el siguiente 'no' sea 'cancelar_definitivo' per D-11)"
    - "Si accion='handoff' (R1 escape o D-13 V1), set state.requires_human=true (D-21 stub)"
    - "Returns `{accion, secondarySalesAction?: TipoAccion, reason}` shape canonico (mismo que v3) para que engine.ts lo orqueste"
    - "NO mutaciones reales — sales-track es pura state machine. Las mutaciones CRM las hace engine.ts (Plan 11) invocando crm-writer-adapter (Plan 10) tras leer la accion."
    - "npm run typecheck no introduce errors nuevos"
  artifacts:
    - path: "src/lib/agents/somnio-pw-confirmation/sales-track.ts"
      provides: "resolveSalesTrack — orquesta transitions + state pre/post processing"
      contains: "resolveSalesTrack"
      min_lines: 80
  key_links:
    - from: "src/lib/agents/somnio-pw-confirmation/sales-track.ts"
      to: "src/lib/agents/somnio-pw-confirmation/transitions.ts (resolveTransition)"
      via: "delegation a tabla declarativa"
      pattern: "resolveTransition"
    - from: "src/lib/agents/somnio-pw-confirmation/sales-track.ts"
      to: "src/lib/agents/somnio-pw-confirmation/state.ts (mergeAnalysis, shippingComplete)"
      via: "pre-processing del state antes de transition"
      pattern: "mergeAnalysis"
---

<objective>
Wave 3 — Crear `sales-track.ts` (orquestador de la state machine). Toma input `(phase, intent, state, analysis, lastTemplate)` y retorna `{accion, reason}` invocando transitions.ts pero con pre/post processing del state.

Purpose: D-25 lockea state-machine pura. sales-track es el wrapper que:
1. **Pre-process**: incorpora datos del analysis al state ANTES de evaluar transitions (importante para D-09 + D-26: cliente puede decir "si, mi direccion es X" en mismo mensaje, y la maquina DEBE confirmar — pero solo si shippingComplete tras el merge).
2. **Delega**: invoca `resolveTransition(...)` de Plan 06.
3. **Post-process**: actualiza counters en state (cancelacion_intent_count para D-11) + flags (requires_human para D-21).

Output: 1 archivo `sales-track.ts` (~80-150 lineas).

Dependencias: Plans 03, 04 (TipoAccion, INITIAL_AWAITING_STATES), 06 (transitions, state).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-09, §D-11, §D-21, §D-25, §D-26
@.planning/standalone/somnio-sales-v3-pw-confirmation/RESEARCH.md §A.6 (sales-track v3 patron)
@src/lib/agents/somnio-v3/sales-track.ts LINEAS COMPLETAS (~221 lineas — patron exacto a clonar, simplificado para PW)
@src/lib/agents/somnio-recompra/sales-track.ts LINEAS COMPLETAS (~100 lineas — referencia mas simple)
@src/lib/agents/somnio-pw-confirmation/transitions.ts (Plan 06)
@src/lib/agents/somnio-pw-confirmation/state.ts (Plan 06)
@src/lib/agents/somnio-pw-confirmation/types.ts (TipoAccion)

<interfaces>
<!-- resolveSalesTrack signature -->
function resolveSalesTrack(input: {
  phase: string
  intent: string
  state: AgentState  // mutable — sales-track puede actualizar counters
  analysis: MessageAnalysis  // del comprehension
  lastTemplate?: string | null  // opcional, NO usado en V1 per D-26 — pero queda en signature por compat
}): {
  accion: TipoAccion
  secondarySalesAction?: TipoAccion
  reason: string
  enterCaptura?: boolean  // marker para engine si entramos en captura de datos
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear `sales-track.ts` con resolveSalesTrack</name>
  <read_first>
    - src/lib/agents/somnio-v3/sales-track.ts LINEAS COMPLETAS (~221 lineas — patron de orquestracion)
    - src/lib/agents/somnio-recompra/sales-track.ts LINEAS COMPLETAS (~100 lineas — referencia mas simple, mas cercana a PW)
    - src/lib/agents/somnio-pw-confirmation/transitions.ts (Plan 06 — resolveTransition)
    - src/lib/agents/somnio-pw-confirmation/state.ts (Plan 06 — mergeAnalysis, shippingComplete)
    - src/lib/agents/somnio-pw-confirmation/types.ts (TipoAccion)
    - src/lib/agents/somnio-pw-confirmation/comprehension-schema.ts (Plan 05 — MessageAnalysis)
    - .planning/standalone/somnio-sales-v3-pw-confirmation/CONTEXT.md §D-11 (cancelacion_intent_count flow)
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-pw-confirmation/sales-track.ts` con `resolveSalesTrack({phase, intent, state, analysis, lastTemplate})`. Pasos en orden:

    1. **Pre-process state**: si `analysis.datos_extraidos` contiene campos non-null, llamar `const {state: mergedState, changes} = mergeAnalysis(state, analysis)`. Usar `mergedState` para el resto del flow. Esto es CRITICO para el caso "cliente provee datos + confirma en mismo mensaje" (D-09→D-26: la confirmacion solo cuenta si shippingComplete tras merge).

    2. **Resolve transition**: `const transition = resolveTransition({ phase, intent, state: mergedState })`.

    3. **Post-process**: 
       - Si `transition.accion === 'cancelar_con_agendar_pregunta'`: incrementar `state.cancelacion_intent_count` a `1` (mutate in place — el caller pasa state mutable per signature).
       - Si `transition.accion === 'handoff'` O `transition.accion === 'cancelar_definitivo'`: set `state.requires_human = true` (D-21 stub).
       - Si `transition.accion === 'pedir_datos_envio'`: marcar `enterCaptura = true` para que el engine sepa que el siguiente turn debera estar en `awaiting_data_capture`.

    4. **Emit observability event** `pipeline_decision:sales_track_result` con metrics (phase, intent, accion, reason). Clonar el patron de v3 sales-track.

    5. **Return** `{accion: transition.accion, secondarySalesAction: undefined, reason: transition.reason, enterCaptura}`. (PW V1 NO usa secondarySalesAction — campo queda undefined por compat con engine signature.)

    Edge case `enterCaptura` semantics: cuando el engine recibe `enterCaptura: true` (Plan 11), debe transicionar phase a `'awaiting_data_capture'` para el proximo turn, de modo que cuando el cliente provea los datos, transitions.ts entry #8 (`'awaiting_data_capture' + cualquier intent + shippingComplete tras merge`) emita `confirmar_compra`.

    Commit: `feat(somnio-sales-v3-pw-confirmation): add sales-track.ts (resolveSalesTrack — pre-process mergeAnalysis + delegate to transitions + post-process counters/flags D-11/D-21)`. NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-pw-confirmation/sales-track.ts</automated>
    <automated>grep -q "export function resolveSalesTrack\\|export async function resolveSalesTrack" src/lib/agents/somnio-pw-confirmation/sales-track.ts</automated>
    <automated>grep -q "mergeAnalysis" src/lib/agents/somnio-pw-confirmation/sales-track.ts</automated>
    <automated>grep -q "resolveTransition" src/lib/agents/somnio-pw-confirmation/sales-track.ts</automated>
    <automated>grep -q "cancelacion_intent_count" src/lib/agents/somnio-pw-confirmation/sales-track.ts</automated>
    <automated>grep -q "requires_human" src/lib/agents/somnio-pw-confirmation/sales-track.ts</automated>
    <automated>grep -q "enterCaptura" src/lib/agents/somnio-pw-confirmation/sales-track.ts</automated>
    <automated>grep -q "sales_track_result" src/lib/agents/somnio-pw-confirmation/sales-track.ts</automated>
    <automated>npm run typecheck 2>&1 | grep -E "src/lib/agents/somnio-pw-confirmation/sales-track\\.ts" | grep -q "error TS" && exit 1 || exit 0</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(somnio-sales-v3-pw-confirmation): add sales-track.ts"</automated>
  </verify>
  <acceptance_criteria>
    - resolveSalesTrack exportada con signature documentada.
    - Pre-process invoca mergeAnalysis si datos_extraidos presentes.
    - Post-process actualiza cancelacion_intent_count para D-11 + requires_human para D-21.
    - enterCaptura marker para flow de captura de datos.
    - Observability event emitido.
    - typecheck OK.
    - Commit atomico.
  </acceptance_criteria>
  <done>
    - sales-track.ts listo para Plan 11 (engine).
    - Plan 12 puede testear D-11 multi-turn cancellation flow (1er no → cancelar_con_agendar_pregunta + count=1; 2do no en awaiting_schedule_decision → cancelar_definitivo).
  </done>
</task>

</tasks>

<verification>
- 1 archivo creado.
- D-09→D-26 honrado (mergeAnalysis ANTES de transition).
- D-11 cancellation flow (cancelacion_intent_count counter).
- D-21 handoff stub (requires_human flag).
- typecheck OK.
- 1 commit atomico, NO pusheado.
</verification>

<success_criteria>
- Plan 11 (engine) puede componer: comprehension → guards → sales-track (pre/post processing) → response-track + crm-writer-adapter.
- Plan 12 puede testear D-09→D-26 con caso "cliente provee datos + 'si' en mismo mensaje".
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-sales-v3-pw-confirmation/08-SUMMARY.md` documenting:
- Commit hash.
- LoC.
- Quote del bloque post-process (verificar D-11 + D-21).
- typecheck output.
</output>
</content>
</invoke>