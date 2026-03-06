---
phase: v3-state-machine
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/somnio-v3/guards.ts
  - src/lib/agents/somnio-v3/phase.ts
  - src/lib/agents/somnio-v3/transitions.ts
autonomous: true

must_haves:
  truths:
    - "AccionRegistrada type has tipo, turno, origen fields"
    - "Phase type has 6 values: initial, capturing_data, promos_shown, confirming, order_created, closed"
    - "SystemEvent is a discriminated union with timer_expired, ingest_complete, readiness_check"
    - "derivePhase() returns correct phase for each significant action"
    - "Transition table maps every (phase, intent/event) pair from the old R0-R9 rules"
    - "Guards handle R0 (low confidence) and R1 (escape intents) cross-cutting concerns"
  artifacts:
    - path: "src/lib/agents/somnio-v3/types.ts"
      provides: "AccionRegistrada, TipoAccion, Phase, SystemEvent types"
      contains: "AccionRegistrada"
    - path: "src/lib/agents/somnio-v3/guards.ts"
      provides: "R0 and R1 guard functions"
      exports: ["checkGuards"]
    - path: "src/lib/agents/somnio-v3/phase.ts"
      provides: "Phase derivation from action history"
      exports: ["derivePhase"]
    - path: "src/lib/agents/somnio-v3/transitions.ts"
      provides: "Declarative transition table"
      exports: ["resolveTransition", "TRANSITIONS"]
    - path: "src/lib/agents/somnio-v3/constants.ts"
      provides: "TIPO_ACCION array, action metadata"
      contains: "TIPO_ACCION"
  key_links:
    - from: "src/lib/agents/somnio-v3/transitions.ts"
      to: "src/lib/agents/somnio-v3/types.ts"
      via: "imports Phase, TipoAccion, SystemEvent"
      pattern: "import.*Phase.*from.*types"
    - from: "src/lib/agents/somnio-v3/phase.ts"
      to: "src/lib/agents/somnio-v3/types.ts"
      via: "imports AccionRegistrada, Phase"
      pattern: "import.*AccionRegistrada.*from.*types"
---

<objective>
Create the foundation types and pure functions for the state machine migration.

Purpose: All subsequent plans depend on these types (AccionRegistrada, Phase, SystemEvent) and pure functions (guards, phase derivation, transition table). These are independent of behavior changes and can be built and verified in isolation.

Output: 3 new files (guards.ts, phase.ts, transitions.ts) + 2 modified files (types.ts, constants.ts) with all types and pure logic needed by the state machine.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-acciones-module/ANALYSIS.md
@.planning/standalone/v3-acciones-module/RESEARCH.md
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/decision.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add new types to types.ts and action constants to constants.ts</name>
  <files>src/lib/agents/somnio-v3/types.ts, src/lib/agents/somnio-v3/constants.ts</files>
  <action>
  **types.ts additions (ADD, do not remove existing types):**

  1. Add `TipoAccion` type:
  ```typescript
  export type TipoAccion =
    | 'ofrecer_promos'
    | 'mostrar_confirmacion'
    | 'pedir_datos'
    | 'crear_orden'
    | 'handoff'
    | 'ask_ofi_inter'
    | 'silence'
    | 'rechazar'
    | 'no_interesa'
    | 'cambio'
  ```

  2. Add `AccionRegistrada` interface:
  ```typescript
  export interface AccionRegistrada {
    tipo: TipoAccion
    turno: number
    origen: 'bot' | 'timer' | 'auto_trigger' | 'ingest'
  }
  ```

  3. Add `Phase` type:
  ```typescript
  export type Phase =
    | 'initial'
    | 'capturing_data'
    | 'promos_shown'
    | 'confirming'
    | 'order_created'
    | 'closed'
  ```

  4. Add `SystemEvent` discriminated union:
  ```typescript
  export type SystemEvent =
    | { type: 'timer_expired'; level: 2 | 3 | 4 }
    | { type: 'ingest_complete'; result: 'datos_completos' | 'ciudad_sin_direccion' }
    | { type: 'readiness_check'; ready_for: 'promos' | 'confirmacion' }
  ```

  5. Add `TransitionResult` interface (output of transition table lookup):
  ```typescript
  export interface TransitionResult {
    action: TipoAccion
    templateIntents?: string[]
    extraContext?: Record<string, string>
    timerSignal?: TimerSignal
    enterCaptura?: boolean
    reason: string
  }
  ```

  6. Add `GuardResult` type:
  ```typescript
  export type GuardResult =
    | { blocked: true; decision: Decision }
    | { blocked: false }
  ```

  IMPORTANT: Keep ALL existing types (AgentState, Decision, Gates, V3AgentInput, V3AgentOutput, etc.) untouched. The `accionesEjecutadas: string[]` in AgentState stays as `string[]` for now — Plan 03 will change it to `AccionRegistrada[]` when the pipeline is rewired.

  **constants.ts additions (ADD at end, no removals):**

  Add the `TIPO_ACCION` array and `SIGNIFICANT_ACTIONS` set:
  ```typescript
  export const TIPO_ACCION = [
    'ofrecer_promos', 'mostrar_confirmacion', 'pedir_datos', 'crear_orden',
    'handoff', 'ask_ofi_inter', 'silence', 'rechazar', 'no_interesa', 'cambio',
  ] as const

  export const SIGNIFICANT_ACTIONS: ReadonlySet<string> = new Set([
    'pedir_datos', 'ofrecer_promos', 'mostrar_confirmacion',
    'crear_orden', 'handoff', 'rechazar', 'no_interesa',
  ])
  ```
  </action>
  <verify>Run `npx tsc --noEmit` from project root — no new type errors. Existing code must still compile since we only added types, no changes.</verify>
  <done>New types exist in types.ts, TIPO_ACCION exists in constants.ts, project compiles clean.</done>
</task>

<task type="auto">
  <name>Task 2: Create guards.ts, phase.ts, and transitions.ts</name>
  <files>src/lib/agents/somnio-v3/guards.ts, src/lib/agents/somnio-v3/phase.ts, src/lib/agents/somnio-v3/transitions.ts</files>
  <action>
  **guards.ts — Extract R0 and R1 as cross-cutting guards:**

  ```typescript
  /**
   * Somnio v3 — Cross-cutting Guards
   *
   * Run BEFORE phase derivation and transition table.
   * R0: Low confidence + otro -> handoff
   * R1: Escape intents -> handoff
   */
  import type { MessageAnalysis } from './comprehension-schema'
  import type { Decision, GuardResult } from './types'
  import { ESCAPE_INTENTS, LOW_CONFIDENCE_THRESHOLD } from './constants'

  export function checkGuards(analysis: MessageAnalysis): GuardResult {
    const intent = analysis.intent.primary
    const confidence = analysis.intent.confidence

    // R0: Low confidence + otro -> handoff
    if (confidence < LOW_CONFIDENCE_THRESHOLD && intent === 'otro') {
      return {
        blocked: true,
        decision: {
          action: 'handoff',
          timerSignal: { type: 'cancel', reason: 'handoff por baja confianza' },
          reason: `Confidence ${confidence}% + intent=otro`,
        },
      }
    }

    // R1: Escape intents -> handoff
    if (ESCAPE_INTENTS.has(intent)) {
      return {
        blocked: true,
        decision: {
          action: 'handoff',
          timerSignal: { type: 'cancel', reason: `escape: ${intent}` },
          reason: `Escape intent: ${intent}`,
        },
      }
    }

    return { blocked: false }
  }
  ```

  **phase.ts — Derive phase from action history:**

  ```typescript
  /**
   * Somnio v3 — Phase Derivation
   *
   * Phase = last significant action. No separate mode field.
   * Works with BOTH old format (string[]) and new format (AccionRegistrada[]).
   */
  import type { Phase, AccionRegistrada } from './types'
  import { SIGNIFICANT_ACTIONS } from './constants'

  /**
   * Derive current phase from accionesEjecutadas.
   * Handles both old string[] format and new AccionRegistrada[] format.
   */
  export function derivePhase(acciones: (string | AccionRegistrada)[]): Phase {
    for (let i = acciones.length - 1; i >= 0; i--) {
      const a = acciones[i]
      const tipo = typeof a === 'string' ? a : a.tipo
      if (!SIGNIFICANT_ACTIONS.has(tipo)) continue

      switch (tipo) {
        case 'pedir_datos':          return 'capturing_data'
        case 'ofrecer_promos':       return 'promos_shown'
        case 'mostrar_confirmacion': return 'confirming'
        case 'crear_orden':          return 'order_created'
        case 'handoff':
        case 'rechazar':
        case 'no_interesa':          return 'closed'
      }
    }
    return 'initial'
  }
  ```

  NOTE: `derivePhase` accepts `(string | AccionRegistrada)[]` so it works with both old and new format during migration.

  **transitions.ts — Declarative transition table:**

  Create a transition table that replaces R2-R9. The table is an array of entries, each with `phase`, `on` (intent name or system event type string), `action`, optional `condition`, and metadata for the response.

  ```typescript
  /**
   * Somnio v3 — Declarative Transition Table
   *
   * Replaces R2-R9 waterfall. Each entry: (phase, on) -> action + response metadata.
   * Guards (R0, R1) run before this table in guards.ts.
   *
   * Lookup order: specific phase first, then '*' (any phase).
   * First match wins (array order matters for same phase+on with different conditions).
   */
  import type { AgentState, Gates, Phase, TipoAccion, TimerSignal } from './types'
  import { camposFaltantes, buildResumenContext } from './state'

  export interface TransitionEntry {
    phase: Phase | '*'
    on: string   // intent name OR system event type (e.g., 'timer_expired:2')
    action: TipoAccion
    condition?: (state: AgentState, gates: Gates) => boolean
    resolve: (state: AgentState, gates: Gates) => TransitionOutput
  }

  export interface TransitionOutput {
    templateIntents: string[]
    extraContext?: Record<string, string>
    timerSignal?: TimerSignal
    enterCaptura?: boolean
    reason: string
  }

  // Helper to build resumen intent from pack
  function getResumenIntent(pack: '1x' | '2x' | '3x'): string {
    return `resumen_${pack}`
  }

  export const TRANSITIONS: TransitionEntry[] = [
    // ======== ANY-phase transitions ========

    // R2: no_interesa
    {
      phase: '*', on: 'no_interesa', action: 'no_interesa',
      resolve: () => ({
        templateIntents: ['no_interesa'],
        timerSignal: { type: 'cancel', reason: 'no interesa' },
        reason: 'Cliente no interesado',
      }),
    },

    // R4: rechazar
    {
      phase: '*', on: 'rechazar', action: 'rechazar',
      resolve: () => ({
        templateIntents: ['rechazar'],
        timerSignal: { type: 'cancel', reason: 'rechazo' },
        reason: 'Cliente rechazo',
      }),
    },

    // R3: acknowledgment — phase-specific exceptions handled before this
    // Positive ack in confirming -> crear_orden (R3 exception 2)
    {
      phase: 'confirming', on: 'acknowledgment_positive', action: 'crear_orden',
      resolve: (state) => ({
        templateIntents: ['confirmacion_orden'],
        extraContext: buildResumenContext(state),
        timerSignal: { type: 'cancel', reason: 'ack positivo en confirming = orden' },
        reason: 'Ack positivo en fase confirming -> crear orden',
      }),
    },

    // Ack in promos_shown without pack -> fallback (R3 exception 1: keep conversation going)
    {
      phase: 'promos_shown', on: 'acknowledgment', action: 'silence',
      condition: (_, gates) => !gates.packElegido,
      resolve: () => ({
        templateIntents: [],  // fallback to R9-style response handled by caller
        reason: 'Ack en promos_shown sin pack -> fall through to default',
      }),
    },

    // Default acknowledgment -> silence
    {
      phase: '*', on: 'acknowledgment', action: 'silence',
      resolve: () => ({
        templateIntents: [],
        timerSignal: { type: 'start', level: 'silence', reason: 'ack sin contexto confirmatorio' },
        reason: 'Acknowledgment sin contexto confirmatorio',
      }),
    },

    // ======== Phase-specific transitions ========

    // initial + quiero_comprar -> pedir_datos (datos will be needed)
    {
      phase: 'initial', on: 'quiero_comprar', action: 'pedir_datos',
      condition: (_, gates) => !gates.datosOk,
      resolve: (state) => ({
        templateIntents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
        enterCaptura: true,
        timerSignal: { type: 'start', level: 'L0', reason: 'captura iniciada por quiero_comprar' },
        reason: 'Quiere comprar, faltan datos',
      }),
    },

    // initial + quiero_comprar + datosOk -> ofrecer_promos
    {
      phase: 'initial', on: 'quiero_comprar', action: 'ofrecer_promos',
      condition: (_, gates) => gates.datosOk,
      resolve: () => ({
        templateIntents: ['promociones'],
        timerSignal: { type: 'start', level: 'L3', reason: 'promos mostradas' },
        reason: 'Quiere comprar + datosOk -> promos',
      }),
    },

    // capturing_data + quiero_comprar + datosOk -> ofrecer_promos
    {
      phase: 'capturing_data', on: 'quiero_comprar', action: 'ofrecer_promos',
      condition: (_, gates) => gates.datosOk,
      resolve: () => ({
        templateIntents: ['promociones'],
        timerSignal: { type: 'start', level: 'L3', reason: 'promos mostradas' },
        reason: 'Quiere comprar + datosOk -> promos',
      }),
    },

    // capturing_data + quiero_comprar + !datosOk -> pedir_datos
    {
      phase: 'capturing_data', on: 'quiero_comprar', action: 'pedir_datos',
      condition: (_, gates) => !gates.datosOk,
      resolve: (state) => ({
        templateIntents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
        enterCaptura: true,
        timerSignal: { type: 'start', level: 'L0', reason: 'captura re-iniciada' },
        reason: 'Quiere comprar, aun faltan datos',
      }),
    },

    // seleccion_pack + datosOk -> mostrar_confirmacion
    {
      phase: '*', on: 'seleccion_pack', action: 'mostrar_confirmacion',
      condition: (_, gates) => gates.datosOk,
      resolve: (state) => ({
        templateIntents: [getResumenIntent(state.pack!)],
        extraContext: buildResumenContext(state),
        timerSignal: { type: 'start', level: 'L4', reason: 'pack elegido, esperando confirmacion' },
        reason: `Pack=${state.pack} + datosOk -> resumen`,
      }),
    },

    // seleccion_pack + !datosOk -> pedir_datos
    {
      phase: '*', on: 'seleccion_pack', action: 'pedir_datos',
      condition: (_, gates) => !gates.datosOk,
      resolve: (state) => ({
        templateIntents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
        enterCaptura: true,
        timerSignal: { type: 'start', level: 'L0', reason: 'captura iniciada (tiene pack, faltan datos)' },
        reason: `Pack=${state.pack} pero faltan: ${camposFaltantes(state).join(', ')}`,
      }),
    },

    // confirmar + datosOk + packElegido -> crear_orden (R5)
    {
      phase: '*', on: 'confirmar', action: 'crear_orden',
      condition: (_, gates) => gates.datosOk && gates.packElegido,
      resolve: (state) => ({
        templateIntents: ['confirmacion_orden'],
        extraContext: buildResumenContext(state),
        timerSignal: { type: 'cancel', reason: 'orden creada' },
        reason: 'Confirmacion con datos completos + pack',
      }),
    },

    // confirmar + !packElegido -> ofrecer_promos
    {
      phase: '*', on: 'confirmar', action: 'ofrecer_promos',
      condition: (_, gates) => !gates.packElegido,
      resolve: () => ({
        templateIntents: ['promociones'],
        timerSignal: { type: 'start', level: 'L3', reason: 'confirmo sin pack -> promos' },
        reason: 'Confirmo pero no ha elegido pack',
      }),
    },

    // confirmar + !datosOk -> pedir_datos
    {
      phase: '*', on: 'confirmar', action: 'pedir_datos',
      condition: (_, gates) => !gates.datosOk,
      resolve: (state) => ({
        templateIntents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
        enterCaptura: true,
        reason: 'Confirmo pero faltan datos',
      }),
    },

    // ======== System Event transitions ========

    // Ingest auto-trigger: datos completos, no pack -> ofrecer_promos
    {
      phase: 'capturing_data', on: 'ingest_complete:datos_completos', action: 'ofrecer_promos',
      condition: (_, gates) => !gates.packElegido,
      resolve: () => ({
        templateIntents: ['promociones'],
        timerSignal: { type: 'start', level: 'L3', reason: 'promos mostradas, esperando pack' },
        reason: 'Auto-trigger: datosOk -> ofrecer promos',
      }),
    },

    // Ingest auto-trigger: datos completos + pack -> mostrar_confirmacion
    {
      phase: 'capturing_data', on: 'ingest_complete:datos_completos', action: 'mostrar_confirmacion',
      condition: (_, gates) => gates.packElegido,
      resolve: (state) => ({
        templateIntents: [getResumenIntent(state.pack!)],
        extraContext: buildResumenContext(state),
        reason: 'Auto-trigger: datosOk + pack -> confirmacion',
      }),
    },

    // Ingest: ciudad sin direccion -> ask_ofi_inter
    {
      phase: '*', on: 'ingest_complete:ciudad_sin_direccion', action: 'ask_ofi_inter',
      resolve: () => ({
        templateIntents: ['ask_ofi_inter'],
        reason: 'Ciudad sin direccion -> preguntar ofi inter',
      }),
    },

    // Readiness check: ready for promos
    {
      phase: '*', on: 'readiness_check:promos', action: 'ofrecer_promos',
      resolve: () => ({
        templateIntents: ['promociones'],
        timerSignal: { type: 'start', level: 'L3', reason: 'readiness -> promos' },
        reason: 'Readiness check: datos ok -> ofrecer promos',
      }),
    },

    // Readiness check: ready for confirmacion
    {
      phase: '*', on: 'readiness_check:confirmacion', action: 'mostrar_confirmacion',
      resolve: (state) => ({
        templateIntents: [getResumenIntent(state.pack!)],
        extraContext: buildResumenContext(state),
        timerSignal: { type: 'start', level: 'L4', reason: 'readiness -> confirmacion' },
        reason: 'Readiness check: datos ok + pack -> confirmacion',
      }),
    },

    // Timer expired L2 -> ofrecer_promos
    {
      phase: 'capturing_data', on: 'timer_expired:2', action: 'ofrecer_promos',
      resolve: () => ({
        templateIntents: ['promociones'],
        timerSignal: { type: 'start', level: 'L3', reason: 'timer L2 -> promos' },
        enterCaptura: false,
        reason: 'Timer L2 expired -> ofrecer promos',
      }),
    },

    // Timer expired L3 -> crear_orden
    {
      phase: 'promos_shown', on: 'timer_expired:3', action: 'crear_orden',
      resolve: (state) => ({
        templateIntents: ['confirmacion_orden'],
        extraContext: buildResumenContext(state),
        timerSignal: { type: 'cancel', reason: 'timer L3 -> orden' },
        reason: 'Timer L3 expired -> crear orden',
      }),
    },

    // Timer expired L4 -> crear_orden
    {
      phase: 'confirming', on: 'timer_expired:4', action: 'crear_orden',
      resolve: (state) => ({
        templateIntents: ['confirmacion_orden'],
        extraContext: buildResumenContext(state),
        timerSignal: { type: 'cancel', reason: 'timer L4 -> orden' },
        reason: 'Timer L4 expired -> crear orden',
      }),
    },

    // ======== Retroceso (D7: cambio) ========
    {
      phase: 'confirming', on: 'seleccion_pack', action: 'cambio',
      resolve: (state) => ({
        templateIntents: [getResumenIntent(state.pack!)],
        extraContext: buildResumenContext(state),
        timerSignal: { type: 'start', level: 'L4', reason: 'cambio de pack en confirming' },
        reason: 'Cambio de pack en fase confirming',
      }),
    },

    {
      phase: 'confirming', on: 'datos', action: 'cambio',
      resolve: (state) => ({
        templateIntents: [getResumenIntent(state.pack!)],
        extraContext: buildResumenContext(state),
        timerSignal: { type: 'start', level: 'L4', reason: 'cambio de datos en confirming' },
        reason: 'Cambio de datos en fase confirming',
      }),
    },

    // ======== closed phase fallback (D8) ========
    {
      phase: 'closed', on: '*', action: 'silence',
      resolve: () => ({
        templateIntents: [],
        reason: 'Fase closed -> fallback (no action)',
      }),
    },
  ]

  /**
   * Resolve a transition from the table.
   *
   * @param phase - Current derived phase
   * @param on - Intent name OR system event key (e.g., 'timer_expired:2')
   * @param state - Current agent state
   * @param gates - Computed gates
   * @returns TransitionOutput or null if no match (caller falls back to R9-style default)
   */
  export function resolveTransition(
    phase: Phase,
    on: string,
    state: AgentState,
    gates: Gates,
  ): { action: TipoAccion; output: TransitionOutput } | null {
    for (const entry of TRANSITIONS) {
      // Phase match: specific phase or wildcard
      if (entry.phase !== '*' && entry.phase !== phase) continue

      // On match: specific on or wildcard
      if (entry.on !== '*' && entry.on !== on) continue

      // Condition check
      if (entry.condition && !entry.condition(state, gates)) continue

      return {
        action: entry.action,
        output: entry.resolve(state, gates),
      }
    }

    return null  // No match -> caller uses fallback (R9 equivalent)
  }

  /**
   * Convert a SystemEvent to the 'on' key used in the transition table.
   * E.g., { type: 'timer_expired', level: 2 } -> 'timer_expired:2'
   */
  export function systemEventToKey(event: { type: string; [k: string]: unknown }): string {
    switch (event.type) {
      case 'timer_expired':
        return `timer_expired:${event.level}`
      case 'ingest_complete':
        return `ingest_complete:${event.result}`
      case 'readiness_check':
        return `readiness_check:${event.ready_for}`
      default:
        return event.type
    }
  }
  ```

  IMPORTANT NOTES FOR transitions.ts:
  - The `confirmar` entries must be ordered: datosOk+packElegido first, then !packElegido, then !datosOk. First match wins.
  - The `acknowledgment_positive` entry for `confirming` phase must come BEFORE the generic `acknowledgment` entry.
  - The `promos_shown` ack exception (fall through to R9) returns empty templateIntents — the caller in Plan 03 will detect this and use the R9-style default.
  - System events use compound keys like `'timer_expired:2'` for clean lookup.
  </action>
  <verify>Run `npx tsc --noEmit` from project root — no type errors. The new files import from types.ts, constants.ts, and state.ts which all exist. Verify that `resolveTransition` is exported correctly.</verify>
  <done>
  - guards.ts exports `checkGuards(analysis)` returning `GuardResult`
  - phase.ts exports `derivePhase(acciones)` returning `Phase`, handles both string[] and AccionRegistrada[]
  - transitions.ts exports `resolveTransition(phase, on, state, gates)`, `systemEventToKey(event)`, and `TRANSITIONS` array
  - All transitions from R2-R9 are covered including acknowledgment exceptions, system events, cambio (D7), and closed fallback (D8)
  - Project compiles cleanly
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with zero errors
- New files exist: guards.ts, phase.ts, transitions.ts
- types.ts has AccionRegistrada, TipoAccion, Phase, SystemEvent, TransitionResult, GuardResult
- constants.ts has TIPO_ACCION and SIGNIFICANT_ACTIONS
- No existing behavior changed (all additions are additive)
</verification>

<success_criteria>
- All 6 new types exist and are properly typed
- derivePhase covers all 6 phases and handles backward-compat string[] input
- Transition table covers all R2-R9 rules plus system events and D7/D8
- Guards cover R0 and R1
- Project compiles without errors
</success_criteria>

<output>
After completion, create `.planning/standalone/v3-acciones-module/sm-01-SUMMARY.md`
</output>
