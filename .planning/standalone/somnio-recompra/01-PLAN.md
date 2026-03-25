---
phase: somnio-recompra
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-recompra/constants.ts
  - src/lib/agents/somnio-recompra/types.ts
  - src/lib/agents/somnio-recompra/comprehension-schema.ts
  - src/lib/agents/somnio-recompra/state.ts
  - src/lib/agents/somnio-recompra/phase.ts
  - src/lib/agents/somnio-recompra/guards.ts
autonomous: true

must_haves:
  truths:
    - "Recompra module has its own constants with ZERO imports from other project files"
    - "Recompra types define simplified phases (no capturing_data) and only 3 timer levels"
    - "Recompra comprehension schema excludes contenido, formula, como_se_toma, efectividad intents"
    - "State management preloads datos from last order instead of starting empty"
    - "Gates compute datosCriticos with all 6 fields (datos come preloaded so always true initially)"
    - "Phase derivation has 5 phases: initial, promos_shown, confirming, order_created, closed"
  artifacts:
    - path: "src/lib/agents/somnio-recompra/constants.ts"
      provides: "Intent list, timer durations, pack prices, critical fields"
      contains: "RECOMPRA_INTENTS"
    - path: "src/lib/agents/somnio-recompra/types.ts"
      provides: "RecompraPhase, TipoAccion, V3AgentInput/Output, SystemEvent, AgentState"
      contains: "RecompraPhase"
    - path: "src/lib/agents/somnio-recompra/comprehension-schema.ts"
      provides: "Zod schema for Claude Haiku structured output"
      contains: "MessageAnalysisSchema"
    - path: "src/lib/agents/somnio-recompra/state.ts"
      provides: "mergeAnalysis, computeGates, serialize/deserialize, createInitialState"
      contains: "computeGates"
    - path: "src/lib/agents/somnio-recompra/phase.ts"
      provides: "derivePhase from acciones ejecutadas"
      contains: "derivePhase"
    - path: "src/lib/agents/somnio-recompra/guards.ts"
      provides: "R0 (low confidence) + R1 (escape intents) guards"
      contains: "checkGuards"
  key_links:
    - from: "constants.ts"
      to: "types.ts"
      via: "constants has ZERO imports, types imports nothing from constants"
      pattern: "RECOMPRA_INTENTS"
    - from: "comprehension-schema.ts"
      to: "constants.ts"
      via: "import RECOMPRA_INTENTS for z.enum"
      pattern: "import.*RECOMPRA_INTENTS.*from.*constants"
    - from: "state.ts"
      to: "types.ts"
      via: "imports AgentState, Gates, DatosCliente"
      pattern: "import.*AgentState.*from.*types"
---

<objective>
Create the foundation data layer for the somnio-recompra agent module: constants, types, comprehension schema, state management, phase derivation, and guards.

Purpose: These files define the data structures, intents, state shape, and computed gates that all business logic files will depend on. They are the fork foundation — diverging from v3 where recompra differs (fewer intents, simplified phases, preloaded data, only 3 timers).

Output: 6 new files in src/lib/agents/somnio-recompra/ forming the complete data layer.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra/CONTEXT.md
@.planning/standalone/somnio-recompra/RESEARCH.md

# Source files to fork from (READ these, do NOT modify them):
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/comprehension-schema.ts
@src/lib/agents/somnio-v3/state.ts
@src/lib/agents/somnio-v3/phase.ts
@src/lib/agents/somnio-v3/guards.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Constants, Types, and Comprehension Schema</name>
  <files>
    src/lib/agents/somnio-recompra/constants.ts
    src/lib/agents/somnio-recompra/types.ts
    src/lib/agents/somnio-recompra/comprehension-schema.ts
  </files>
  <action>
    **constants.ts** — Fork from somnio-v3/constants.ts with these changes:
    - ZERO imports from any other project file (project rule)
    - `RECOMPRA_INTENTS`: Remove 'contenido', 'formula', 'como_se_toma', 'efectividad' from V3_INTENTS. Keep all 18 remaining intents plus add 'confirmar_direccion' (new intent for address confirmation). Total ~19 intents.
    - `ESCAPE_INTENTS`: Same as v3 (asesor, queja, cancelar)
    - `INFORMATIONAL_INTENTS`: Same as v3 MINUS the 4 excluded. Remove 'contenido', 'formula', 'como_se_toma', 'efectividad'. Keep 10 informational.
    - `ACTION_TEMPLATE_MAP`: Simplified — keep ofrecer_promos, no_interesa, rechazar, retoma. Remove ofi inter entries (ask_ofi_inter, confirmar_cambio_ofi_inter, confirmar_ofi_inter, retoma_ofi_inter), remove retoma_datos, retoma_datos_parciales, retoma_datos_implicito, pedir_datos_quiero_comprar_implicito. Add 'confirmar_direccion_template' if needed.
    - `CRITICAL_FIELDS_NORMAL`: Same 6 fields (nombre, apellido, telefono, direccion, ciudad, departamento)
    - Remove CRITICAL_FIELDS_OFI_INTER, EXTRAS_NORMAL, EXTRAS_OFI_INTER, CAPITAL_CITIES (no ofi inter in recompra)
    - `LOW_CONFIDENCE_THRESHOLD`: 80 (same)
    - `PACK_PRICES`: Same as v3
    - `V3_META_PREFIX`: Same '_v3:' (reuses same session state prefix)
    - `SIGNIFICANT_ACTIONS`: Simplified — ofrecer_promos, mostrar_confirmacion, crear_orden, crear_orden_sin_promo, crear_orden_sin_confirmar, handoff, rechazar, no_interesa. Remove pedir_datos, pedir_datos_quiero_comprar_implicito, confirmar_cambio_ofi_inter.
    - `CRM_ACTIONS`: Same (crear_orden, crear_orden_sin_promo, crear_orden_sin_confirmar)
    - `CREATE_ORDER_ACTIONS`: Same
    - `RECOMPRA_TIMER_DURATIONS`: Only L3 (600s), L4 (600s), L5 (90s) per preset (real, rapido, instantaneo). Same ratio as v3 for those levels.

    **types.ts** — Fork from somnio-v3/types.ts with these changes:
    - `DatosCliente`: Same shape (all 10 fields including cedula_recoge, indicaciones_extra)
    - `Negaciones`: Same shape
    - `AgentState`: Same but remove `enCapturaSilenciosa` field (no silent capture mode in recompra). Add `direccionConfirmada: boolean` field to track if client confirmed their preloaded address.
    - `Gates`: Same (datosCriticos, datosCompletos, packElegido)
    - `RecompraPhase` (renamed from Phase): 'initial' | 'promos_shown' | 'confirming' | 'order_created' | 'closed'. NO 'capturing_data'.
    - `TipoAccion`: Simplified — 'ofrecer_promos' | 'mostrar_confirmacion' | 'crear_orden' | 'crear_orden_sin_promo' | 'crear_orden_sin_confirmar' | 'handoff' | 'silence' | 'rechazar' | 'no_interesa' | 'cambio' | 'retoma' | 'preguntar_direccion'. Remove pedir_datos, ask_ofi_inter, confirmar_ofi_inter, confirmar_cambio_ofi_inter, retoma_datos, retoma_datos_parciales, retoma_ofi_inter, pedir_datos_quiero_comprar_implicito, retoma_datos_implicito.
    - `AccionRegistrada`: Same shape (tipo, turno, origen, crmAction)
    - `SystemEvent`: Only timer_expired with levels 3|4|5. No 'auto' event (no silent capture).
    - `SalesEvent`: Same structure but with simplified TipoAccion
    - `TimerSignal`: Same, but levels only L3|L4|L5
    - `V3AgentInput`, `V3AgentOutput`: Same shape — reuse interface names for compatibility with V3ProductionRunner. Import StateChanges from local ./state.
    - `Decision`, `SalesTrackOutput`, `ResponseTrackOutput`, `ProcessedMessage`, `ResponseResult`: Same shape.
    - `GuardResult`: Same shape.

    **comprehension-schema.ts** — Fork from somnio-v3/comprehension-schema.ts:
    - Import `RECOMPRA_INTENTS` from local constants
    - `MessageAnalysisSchema`: Same Zod shape BUT:
      - `intent.primary`: Use `RECOMPRA_INTENTS` enum (includes confirmar_direccion, excludes 4 product-info intents)
      - `intent.secondary`: Same but with RECOMPRA_INTENTS
      - `extracted_fields`: Same 12 fields (nombre through menciona_inter). Keep entrega_oficina and menciona_inter fields in schema even though ofi inter flow is deferred — comprehension might still detect them.
      - `classification`: Same shape
      - `negations`: Same shape
    - Export `MessageAnalysis` type
  </action>
  <verify>
    Run `npx tsc --noEmit src/lib/agents/somnio-recompra/constants.ts src/lib/agents/somnio-recompra/types.ts src/lib/agents/somnio-recompra/comprehension-schema.ts` and confirm no type errors.
    Verify constants.ts has zero import statements.
    Verify RECOMPRA_INTENTS does NOT contain 'contenido', 'formula', 'como_se_toma', 'efectividad'.
  </verify>
  <done>
    Three files exist with correct types. Constants has zero imports. Intents exclude the 4 product-info intents. Types have simplified RecompraPhase and TipoAccion. Schema uses RECOMPRA_INTENTS.
  </done>
</task>

<task type="auto">
  <name>Task 2: State Management, Phase Derivation, and Guards</name>
  <files>
    src/lib/agents/somnio-recompra/state.ts
    src/lib/agents/somnio-recompra/phase.ts
    src/lib/agents/somnio-recompra/guards.ts
  </files>
  <action>
    **state.ts** — Fork from somnio-v3/state.ts with these changes:
    - Import normalizers from `@/lib/agents/somnio/normalizers` (same as v3 — shared utility)
    - Import constants from local `./constants`
    - Import types from local `./types`
    - `StateChanges`: Simplified — keep newFields, filled, hasNewData, datosCriticosJustCompleted, datosCompletosJustCompleted. REMOVE ofiInterJustSet and mencionaInter (no ofi inter in recompra).
    - `createInitialState()`: Same structure but `enCapturaSilenciosa` removed. Add `direccionConfirmada: false`.
    - `createPreloadedState(lastOrderData: Partial<DatosCliente>)`: NEW function. Creates initial state with datos pre-populated from last order. Sets nombre, apellido, telefono, direccion, ciudad, departamento from lastOrderData. Other fields remain null.
    - `mergeAnalysis()`: Simplified — remove ofi inter detection logic (ofiInterJustSet, mencionaInter computation). Keep data merging, normalization, negation handling. Remove ofiInter state update. The merge still processes extracted_fields the same way, just without ofi inter signals.
    - `computeGates()`: Same logic — check CRITICAL_FIELDS_NORMAL only (no ofi inter mode). Since datos come preloaded, gates.datosCriticos will be true from the start for most cases.
    - `serializeState()` / `deserializeState()`: Same pattern with _v3: prefix. Remove `_v3:en_captura_silenciosa`. Add `_v3:direccion_confirmada`.
    - `camposFaltantes()`: Only checks CRITICAL_FIELDS_NORMAL (no ofi inter variant).
    - `hasAction()`: Same helper.

    **phase.ts** — Fork from somnio-v3/phase.ts:
    - `derivePhase(acciones: AccionRegistrada[]): RecompraPhase`: Iterate acciones from end to start.
      - 'ofrecer_promos' -> 'promos_shown'
      - 'mostrar_confirmacion' -> 'confirming'
      - 'crear_orden' | 'crear_orden_sin_promo' | 'crear_orden_sin_confirmar' -> 'order_created'
      - 'handoff' | 'rechazar' | 'no_interesa' -> 'closed'
      - Default: 'initial'
    - NO 'capturing_data' phase. NO pedir_datos action check.

    **guards.ts** — Fork from somnio-v3/guards.ts:
    - `checkGuards()`: Same structure.
    - R0 (low confidence): Same — if confidence < 80, return handoff decision.
    - R1 (escape intents): Same — asesor/queja/cancelar -> handoff. no_interesa -> no_interesa action.
    - Import types from local `./types`, constants from local `./constants`.
  </action>
  <verify>
    Run `npx tsc --noEmit src/lib/agents/somnio-recompra/state.ts src/lib/agents/somnio-recompra/phase.ts src/lib/agents/somnio-recompra/guards.ts` and confirm no type errors.
    Verify state.ts imports normalizers from somnio/ (shared), NOT from somnio-v3/.
    Verify phase.ts does NOT reference 'capturing_data'.
  </verify>
  <done>
    State management creates preloaded state from last order data. Phase derivation has 5 phases (no capturing_data). Guards handle low confidence and escape intents. All compile without errors.
  </done>
</task>

</tasks>

<verification>
- All 6 files in src/lib/agents/somnio-recompra/ compile with `npx tsc --noEmit`
- constants.ts has ZERO import statements
- RECOMPRA_INTENTS array has ~19 entries (v3's 22 minus contenido/formula/como_se_toma/efectividad plus confirmar_direccion)
- RecompraPhase type has exactly 5 variants
- RECOMPRA_TIMER_DURATIONS only has keys 3, 4, 5
- createPreloadedState() exists and accepts Partial<DatosCliente>
</verification>

<success_criteria>
Foundation data layer complete. All 6 files type-check cleanly. No imports from somnio-v3 (complete fork). Shared normalizers imported from somnio/ utility. Ready for business logic layer (Plan 02).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra/01-SUMMARY.md`
</output>
