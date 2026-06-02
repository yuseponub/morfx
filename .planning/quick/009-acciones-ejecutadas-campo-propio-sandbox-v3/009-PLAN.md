---
phase: quick-009
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/sandbox/types.ts
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/state.ts
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - src/lib/agents/somnio-v3/engine-v3.ts
  - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx
autonomous: true

must_haves:
  truths:
    - "accionesEjecutadas fluye como campo propio en el pipeline sandbox, igual que intentsVistos"
    - "accionesEjecutadas NO se duplica dentro de datosCapturados (limpio de _v3:accionesEjecutadas)"
    - "Backward compat: deserializeState lee de datosCapturados si el campo propio no existe"
    - "Debug panel muestra seccion dedicada Acciones Ejecutadas con tipo, turno, origen"
    - "Produccion (engine-adapter) sigue funcionando sin cambios"
  artifacts:
    - path: "src/lib/sandbox/types.ts"
      provides: "SandboxState.accionesEjecutadas field"
      contains: "accionesEjecutadas"
    - path: "src/lib/agents/somnio-v3/types.ts"
      provides: "V3AgentInput.accionesEjecutadas and V3AgentOutput.accionesEjecutadas"
    - path: "src/lib/agents/somnio-v3/state.ts"
      provides: "serializeState returns accionesEjecutadas as own field, deserializeState accepts it as parameter"
  key_links:
    - from: "engine-v3.ts"
      to: "V3AgentInput"
      via: "passes state.accionesEjecutadas to processMessage input"
      pattern: "accionesEjecutadas.*state\\.accionesEjecutadas"
    - from: "engine-v3.ts"
      to: "SandboxState"
      via: "reads output.accionesEjecutadas into newState"
      pattern: "accionesEjecutadas.*output\\.accionesEjecutadas"
    - from: "somnio-v3-agent.ts"
      to: "deserializeState"
      via: "passes input.accionesEjecutadas as parameter"
---

<objective>
Migrate `accionesEjecutadas` from being serialized inside `datosCapturados` (with `_v3:` prefix hack) to being a proper top-level field in the sandbox pipeline, following exactly the same pattern as `intentsVistos`.

Purpose: Clean up the data flow so accionesEjecutadas is a first-class field throughout the sandbox pipeline, eliminating JSON serialization inside datosCapturados.
Output: All 8 files updated, accionesEjecutadas flows as own field, debug panel shows dedicated section.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/sandbox/types.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/state.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/engine-v3.ts
@src/lib/agents/somnio-v3/engine-adapter.ts
@src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
@src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
@src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pipeline types + serialization (types, state, agent, engine-adapter)</name>
  <files>
    src/lib/sandbox/types.ts
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/state.ts
    src/lib/agents/somnio-v3/somnio-v3-agent.ts
    src/lib/agents/somnio-v3/engine-adapter.ts
  </files>
  <action>
    **1. SandboxState (sandbox/types.ts):**
    - Add `accionesEjecutadas: AccionRegistrada[]` to SandboxState interface (import AccionRegistrada from somnio-v3/types)
    - Add optional `systemEvent` field to DebugIngestDetails: `systemEvent?: { type: string; [k: string]: unknown }` (currently cast with `as` in engine-v3, make it proper)

    **2. V3AgentInput + V3AgentOutput (somnio-v3/types.ts):**
    - Add `accionesEjecutadas: AccionRegistrada[]` to V3AgentInput interface
    - Add `accionesEjecutadas: AccionRegistrada[]` to V3AgentOutput interface

    **3. serializeState (somnio-v3/state.ts):**
    - Add `accionesEjecutadas: AccionRegistrada[]` to the return type of serializeState
    - Return `state.accionesEjecutadas` as its own field
    - REMOVE the line `datosCapturados[V3_META_PREFIX + 'accionesEjecutadas'] = JSON.stringify(state.accionesEjecutadas)` — no longer stored in datosCapturados
    - Also remove the `_v3:templatesMostrados` line from serializeState (templates already flow via templatesEnviados)

    **4. deserializeState (somnio-v3/state.ts):**
    - Add `accionesEjecutadas: AccionRegistrada[]` as a NEW 5th parameter (default `[]`)
    - Use the parameter as primary source: `state.accionesEjecutadas = accionesEjecutadas`
    - BACKWARD COMPAT: If `accionesEjecutadas.length === 0`, fallback to parsing from `datosCapturados[_v3:accionesEjecutadas]` (the existing try/catch block). This handles production sessions that still have the old format.

    **5. somnio-v3-agent.ts processMessage:**
    - Pass `input.accionesEjecutadas` (new field) as the 5th arg to deserializeState
    - In ALL return paths (silent ingest, silence decision, handoff, normal response, error catch), add `accionesEjecutadas` to the output object:
      - For success paths: use `serialized.accionesEjecutadas` (from serializeState which now returns it)
      - NOTE: serializeState is called before return in success paths, so use `serialized.accionesEjecutadas`
      - For the error catch path: return `input.accionesEjecutadas ?? []`

    **6. engine-adapter.ts — NO CHANGES needed.**
    Production still uses datosCapturados for persistence. The engine-adapter calls processMessage which internally does deserializeState. Since we kept backward compat in deserializeState (fallback to datosCapturados), production continues working. The adapter does NOT pass accionesEjecutadas in V3AgentInput — the field will be undefined, deserializeState gets `[]` as default, then falls back to datosCapturados parsing. Perfect backward compat.
  </action>
  <verify>
    `npx tsc --noEmit` passes without errors. Check that AccionRegistrada import in sandbox/types.ts resolves correctly. Verify engine-adapter.ts still compiles (it constructs V3AgentInput without accionesEjecutadas — must be optional or have default).

    IMPORTANT: If tsc fails because engine-adapter constructs V3AgentInput without accionesEjecutadas, make the field optional in V3AgentInput: `accionesEjecutadas?: AccionRegistrada[]`. Then in somnio-v3-agent.ts, use `input.accionesEjecutadas ?? []` when passing to deserializeState.
  </verify>
  <done>
    - SandboxState has accionesEjecutadas as own field
    - V3AgentInput/Output carry accionesEjecutadas
    - serializeState returns accionesEjecutadas as own field, NOT in datosCapturados
    - deserializeState accepts accionesEjecutadas param with backward compat fallback
    - All return paths in processMessage include accionesEjecutadas
    - engine-adapter compiles without changes
    - `npx tsc --noEmit` passes
  </done>
</task>

<task type="auto">
  <name>Task 2: Sandbox engine + UI (engine-v3, sandbox-layout, debug panels)</name>
  <files>
    src/lib/agents/somnio-v3/engine-v3.ts
    src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
    src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
    src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx
  </files>
  <action>
    **1. engine-v3.ts SomnioV3Engine.processMessage:**
    - Pass `input.state.accionesEjecutadas ?? []` in the V3AgentInput object sent to processMessage
    - In newState construction, add: `accionesEjecutadas: output.accionesEjecutadas`
    - Clean up `_v3:accionesEjecutadas` from datosCapturados in newState: after building newState, delete `newState.datosCapturados['_v3:accionesEjecutadas']` and `newState.datosCapturados['_v3:templatesMostrados']` to avoid stale data
    - Fix the `ingestDetails` type assertion hack: remove `as DebugIngestDetails & { systemEvent?: ... }`. Since we added `systemEvent` to DebugIngestDetails in Task 1, the cast is unnecessary. Just use: `ingestDetails: output.ingestInfo ? { action: output.ingestInfo.action as DebugIngestDetails['action'], systemEvent: output.ingestInfo.systemEvent } : undefined`

    **2. sandbox-layout.tsx INITIAL_STATE:**
    - Add `accionesEjecutadas: []` to the INITIAL_STATE constant

    **3. debug-v3.tsx StateSection:**
    - After the "Templates mostrados / Intents vistos" line, add a new line showing accionesEjecutadas count: `Acciones ejecutadas: {state.accionesEjecutadas?.length ?? 0}`
    - Add a dedicated subsection below showing each AccionRegistrada if any exist: a small table/list with columns tipo | turno | origen. Use Badges for tipo values. Only show if accionesEjecutadas.length > 0.

    **4. debug-v3.tsx PipelineSection:**
    - In the C4 Ingest layer detail, replace `autoTrigger` reference with `systemEvent`: change `${(turn.ingestDetails as any).autoTrigger ? ... : ''}` to `${(turn.ingestDetails as any).systemEvent ? ` → ${(turn.ingestDetails as any).systemEvent.type}` : ''}`

    **5. debug-v3.tsx IngestTimersSection:**
    - Replace the `autoTrigger` badge display with systemEvent: change `{ingest?.autoTrigger && (` to `{ingest?.systemEvent && (` and display `{ingest.systemEvent.type}` instead of `{ingest.autoTrigger}`

    **6. state-tab.tsx LegibleState:**
    - Add a third section "Acciones Ejecutadas" after "Templates Enviados"
    - Show each AccionRegistrada as a Badge with format: `{tipo} (T{turno}, {origen})`
    - If empty, show "Ninguna accion ejecutada"
  </action>
  <verify>
    `npx tsc --noEmit` passes. Open sandbox at localhost:3020/sandbox, select Somnio v3 agent, run a conversation. Verify:
    1. State tab shows "Acciones Ejecutadas" section
    2. Debug v3 Estado section shows acciones count
    3. After a few turns, acciones appear with tipo/turno/origen
    4. datosCapturados in Contexto Raw does NOT contain `_v3:accionesEjecutadas`
    5. Pipeline C4 shows systemEvent instead of autoTrigger
  </verify>
  <done>
    - engine-v3 passes accionesEjecutadas through the pipeline as own field
    - Stale _v3: keys cleaned from datosCapturados
    - INITIAL_STATE includes accionesEjecutadas: []
    - Debug panel shows acciones in State section and State tab
    - Pipeline/Ingest displays use systemEvent instead of autoTrigger
    - `npx tsc --noEmit` passes
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero type errors
2. Open sandbox, select v3 agent, send messages through a full sales flow
3. Verify accionesEjecutadas appears in State tab as own section
4. Verify Contexto Raw JSON does NOT have `_v3:accionesEjecutadas` key in datosCapturados
5. Reset session, verify INITIAL_STATE has accionesEjecutadas: []
6. engine-adapter.ts unchanged, production path unaffected
</verification>

<success_criteria>
- accionesEjecutadas flows as a first-class field like intentsVistos through: SandboxState -> V3AgentInput -> AgentState -> V3AgentOutput -> SandboxState
- No duplication in datosCapturados
- Backward compat: old sessions with _v3:accionesEjecutadas in datosCapturados still deserialize correctly
- Debug panel shows dedicated Acciones Ejecutadas UI
- Production (engine-adapter) compiles and works without changes
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/009-acciones-ejecutadas-campo-propio-sandbox-v3/009-SUMMARY.md`
</output>
