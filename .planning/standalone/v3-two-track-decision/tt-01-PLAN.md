---
phase: standalone/v3-two-track-decision
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/somnio-v3/ingest.ts
  - src/lib/agents/somnio-v3/sales-track.ts
  - src/lib/agents/somnio-v3/response-track.ts
autonomous: true

must_haves:
  truths:
    - "Sales track receives (phase, intent, state, gates, systemEvent) and returns only accion + flags, never templateIntents"
    - "Response track maps sales action to templates AND maps informational intents to templates independently"
    - "Ingest never returns action='silent' — always returns 'respond'"
    - "NEVER_SILENCE_INTENTS is removed, replaced by INFORMATIONAL_INTENTS set"
    - "Silence is the natural absence of output (no action + non-informational intent = 0 templates)"
  artifacts:
    - path: "src/lib/agents/somnio-v3/sales-track.ts"
      provides: "Pure state machine — resolves transitions without templateIntents"
      exports: ["resolveSalesTrack"]
    - path: "src/lib/agents/somnio-v3/response-track.ts"
      provides: "Template engine combining sales action templates + informational intent templates"
      exports: ["resolveResponseTrack"]
    - path: "src/lib/agents/somnio-v3/types.ts"
      provides: "SalesTrackOutput type, updated IngestAction without 'silent'"
      contains: "SalesTrackOutput"
    - path: "src/lib/agents/somnio-v3/constants.ts"
      provides: "INFORMATIONAL_INTENTS set replacing NEVER_SILENCE_INTENTS"
      contains: "INFORMATIONAL_INTENTS"
  key_links:
    - from: "src/lib/agents/somnio-v3/sales-track.ts"
      to: "src/lib/agents/somnio-v3/transitions.ts"
      via: "resolveTransition call"
      pattern: "resolveTransition"
    - from: "src/lib/agents/somnio-v3/response-track.ts"
      to: "src/lib/agents/somnio-v3/constants.ts"
      via: "INFORMATIONAL_INTENTS + ACTION_TEMPLATE_MAP"
      pattern: "INFORMATIONAL_INTENTS|ACTION_TEMPLATE_MAP"
---

<objective>
Create the two-track foundation: types, constants, ingest simplification, sales-track.ts (pure state machine), and response-track.ts (template engine).

Purpose: Build the core modules that separate "what to do" (sales track) from "what to say" (response track), eliminating the premature silence cut and NEVER_SILENCE_INTENTS fragility.

Output: 2 new files (sales-track.ts, response-track.ts) + 3 modified files (types.ts, constants.ts, ingest.ts) ready for Plan 02 to wire into the pipeline.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-two-track-decision/CONTEXT.md
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/ingest.ts
@src/lib/agents/somnio-v3/decision.ts
@src/lib/agents/somnio-v3/response.ts
@src/lib/agents/somnio-v3/transitions.ts
@src/lib/agents/somnio-v3/guards.ts
@src/lib/agents/somnio-v3/phase.ts
@src/lib/agents/somnio-v3/state.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Types + Constants + Ingest simplification</name>
  <files>
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/constants.ts
    src/lib/agents/somnio-v3/ingest.ts
  </files>
  <action>
**types.ts changes:**

1. Add `SalesTrackOutput` interface:
```typescript
export interface SalesTrackOutput {
  accion?: TipoAccion
  enterCaptura?: boolean
  timerSignal?: TimerSignal
  reason: string
}
```

2. Add `ResponseTrackOutput` interface:
```typescript
export interface ResponseTrackOutput {
  messages: ProcessedMessage[]
  templateIdsSent: string[]
  salesTemplateIntents: string[]   // templates from sales action
  infoTemplateIntents: string[]    // templates from informational intent
}
```

3. Remove `'silent'` from `IngestAction` type — it becomes just `'respond'`. Keep the type alias for backward compat during transition but only allow `'respond'`:
```typescript
export type IngestAction = 'respond'
```

4. Keep `Decision` type AS-IS for now (Plan 02 will handle cleanup). The old decision.ts still needs to compile until Plan 02 replaces it.

**constants.ts changes:**

1. Add `INFORMATIONAL_INTENTS` set (replaces NEVER_SILENCE_INTENTS conceptually):
```typescript
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'saludo', 'precio', 'promociones', 'contenido', 'como_se_toma',
  'pago', 'envio', 'registro_sanitario', 'ubicacion', 'efectos', 'efectividad',
])
```

2. Add `ACTION_TEMPLATE_MAP` — maps sales track accion to template intents:
```typescript
export const ACTION_TEMPLATE_MAP: Record<string, string[]> = {
  ofrecer_promos: ['promociones'],
  pedir_datos: ['pedir_datos'],
  crear_orden: ['confirmacion_orden'],
  no_interesa: ['no_interesa'],
  rechazar: ['rechazar'],
  ask_ofi_inter: ['ask_ofi_inter'],
  // mostrar_confirmacion and cambio use dynamic resumen_{pack} — handled in response-track
}
```

3. Keep `NEVER_SILENCE_INTENTS` export for now (decision.ts still imports it until Plan 02). Add a `@deprecated` JSDoc tag.

**ingest.ts changes:**

1. Remove the `case 'datos': return { action: 'silent', ... }` branch. Change it to return `{ action: 'respond', timerSignal }`.

2. Remove the `case 'irrelevante': return { action: 'silent' }` branch. Change it to return `{ action: 'respond' }`.

3. All paths now return `action: 'respond'`. The ingest function's role becomes: emit system events + timer signals only.

4. Keep the function signature and return type identical (IngestResult). The `action` field just always equals `'respond'` now.
  </action>
  <verify>
Run `npx tsc --noEmit` from the project root. All files in `src/lib/agents/somnio-v3/` should compile without errors. The existing `decision.ts` and `somnio-v3-agent.ts` should still compile because we kept backward-compat types.
  </verify>
  <done>
- SalesTrackOutput and ResponseTrackOutput types exist in types.ts
- INFORMATIONAL_INTENTS and ACTION_TEMPLATE_MAP exist in constants.ts
- IngestAction is `'respond'` only
- ingest.ts never returns `action: 'silent'`
- All existing files still compile (backward compat preserved)
  </done>
</task>

<task type="auto">
  <name>Task 2: Create sales-track.ts (pure state machine)</name>
  <files>src/lib/agents/somnio-v3/sales-track.ts</files>
  <action>
Create `src/lib/agents/somnio-v3/sales-track.ts` — a pure state machine that determines WHAT TO DO without producing templates.

**Function signature:**
```typescript
export function resolveSalesTrack(input: {
  phase: Phase
  intent: string
  isAcknowledgment: boolean
  sentiment: string
  state: AgentState
  gates: Gates
  systemEvent?: SystemEvent
  ingestSystemEvent?: SystemEvent
}): SalesTrackOutput
```

**Logic flow (mirrors current decision.ts but outputs SalesTrackOutput, not Decision):**

1. **System event from input** (timer expired): Call `resolveTransition(phase, systemEventToKey(systemEvent), state, gates)`. If match, return `{ accion: match.action, enterCaptura: match.output.enterCaptura, timerSignal: match.output.timerSignal, reason: match.output.reason }`. Ignore `templateIntents` from match.output.

2. **System event from ingest** (datos_completos, ciudad_sin_direccion): Same pattern — resolveTransition with the ingest system event key.

3. **Acknowledgment routing:**
   - `confirming` + positive ack → resolveTransition with `'acknowledgment_positive'`
   - `promos_shown` + !packElegido → return `{ reason: 'Ack en promos sin pack — fall through' }` (no accion = response track handles it)
   - Other ack → return `{ reason: 'Ack sin contexto confirmatorio' }` (no accion = natural silence if intent is not informational)

4. **Intent → transition lookup**: Call `resolveTransition(phase, intent, state, gates)`. If match, extract accion + flags.

5. **No match (fallback)**: Return `{ reason: 'No transition — response track handles informational' }` (no accion).

**Key difference from decision.ts:**
- Does NOT call `checkGuards()` — guards run BEFORE sales track in the pipeline (Plan 02).
- Does NOT produce `templateIntents` or `extraContext`. Only `accion`, `enterCaptura`, `timerSignal`, `reason`.
- Does NOT return 'silence'/'handoff'/'respond' actions. Returns `accion?: TipoAccion` (undefined = no sales action).

**Import `isPositiveAck` helper** — copy the 4-line helper from decision.ts into sales-track.ts (it's trivial, no need to share).

**Import from transitions.ts:** `resolveTransition`, `systemEventToKey`.
**Import from types.ts:** `SalesTrackOutput`, `Phase`, `AgentState`, `Gates`, `SystemEvent`.
  </action>
  <verify>
Run `npx tsc --noEmit`. The new file should compile. Verify the function signature matches SalesTrackOutput type.
  </verify>
  <done>
- sales-track.ts exists with `resolveSalesTrack()` exported
- Function takes phase, intent, state, gates, systemEvent, ingestSystemEvent
- Returns SalesTrackOutput (accion?, enterCaptura?, timerSignal?, reason)
- Does NOT produce templateIntents or extraContext
- Handles system events, acknowledgments, intent transitions, and fallback
  </done>
</task>

<task type="auto">
  <name>Task 3: Create response-track.ts (template engine)</name>
  <files>src/lib/agents/somnio-v3/response-track.ts</files>
  <action>
Create `src/lib/agents/somnio-v3/response-track.ts` — the template engine that decides WHAT TO SAY based on two independent sources.

**Function signature:**
```typescript
export async function resolveResponseTrack(input: {
  salesAction?: TipoAccion
  intent: string
  secondaryIntent?: string
  state: AgentState
  workspaceId: string
}): Promise<ResponseTrackOutput>
```

**Logic:**

1. **Sales action templates** — If `salesAction` is provided:
   - For `mostrar_confirmacion` and `cambio`: use `resumen_{pack}` with `buildResumenContext(state)` as extraContext
   - For `crear_orden`: use `confirmacion_orden` with `buildResumenContext(state)`
   - For `pedir_datos`: use `pedir_datos` with `{ campos_faltantes }` from `camposFaltantes(state)`
   - For others: lookup from `ACTION_TEMPLATE_MAP` in constants.ts
   - Collect all intents into `salesTemplateIntents: string[]`

2. **Informational intent templates** — Check if `intent` is in `INFORMATIONAL_INTENTS`:
   - If yes: map via `V3_TO_V1_INTENT_MAP` to get template intents
   - If secondaryIntent also informational: add its templates too
   - Collect into `infoTemplateIntents: string[]`

3. **Combine both sources** — Merge `salesTemplateIntents` + `infoTemplateIntents` into a single list. Sales templates are CORE priority, informational are COMPLEMENTARIA.

4. **Load and process templates** — Reuse the same pattern from current `response.ts`:
   - Map v3 intents to v1 DB names via `V3_TO_V1_INTENT_MAP`
   - Load via `TemplateManager.getTemplatesForIntents()` (v3 agent first, fallback v1)
   - Process with variable substitution (state.datos + extraContext from sales action)
   - Compose block via `composeBlock()` (max 3)

5. **Return:** `{ messages, templateIdsSent, salesTemplateIntents, infoTemplateIntents }`

6. **Empty case:** If both sources produce 0 intents → return empty result. This is natural silence.

**Import from existing code:**
- `TemplateManager` from `@/lib/agents/somnio/template-manager`
- `composeBlock` from `@/lib/agents/somnio/block-composer`
- `V3_TO_V1_INTENT_MAP`, `INFORMATIONAL_INTENTS`, `ACTION_TEMPLATE_MAP` from `./constants`
- `buildResumenContext`, `camposFaltantes` from `./state`
- `SOMNIO_V3_AGENT_ID` from `./config`

**NOTE:** The `extraContext` for resumen/orden/pedir_datos is computed INSIDE response-track, not passed from sales-track. Sales track has no knowledge of templates or context builders.
  </action>
  <verify>
Run `npx tsc --noEmit`. The new file should compile. Verify it exports `resolveResponseTrack` with the correct signature.
  </verify>
  <done>
- response-track.ts exists with `resolveResponseTrack()` exported
- Combines two independent template sources: sales action + informational intent
- Sales templates are CORE priority, informational are COMPLEMENTARIA
- Empty output when no action AND non-informational intent (natural silence)
- Uses existing TemplateManager + composeBlock infrastructure
- Does NOT import from decision.ts or response.ts (fully independent)
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes — all files compile
2. `sales-track.ts` exports `resolveSalesTrack` with `SalesTrackOutput` return type
3. `response-track.ts` exports `resolveResponseTrack` with `ResponseTrackOutput` return type
4. `ingest.ts` has zero `'silent'` return values
5. `constants.ts` has `INFORMATIONAL_INTENTS` and `ACTION_TEMPLATE_MAP`
6. Existing `somnio-v3-agent.ts` and `decision.ts` still compile (backward compat)
</verification>

<success_criteria>
- Two new modules exist that cleanly separate sales logic from response logic
- Types support the new two-track architecture
- Ingest no longer makes silence decisions
- All existing code still compiles (no breaking changes yet)
- Ready for Plan 02 to wire into the pipeline
</success_criteria>

<output>
After completion, create `.planning/standalone/v3-two-track-decision/tt-01-SUMMARY.md`
</output>
