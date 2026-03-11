---
phase: quick-020
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - src/lib/agents/somnio-v3/sales-track.ts
  - src/lib/agents/somnio-v3/response-track.ts
  - src/lib/agents/somnio-v3/engine-v3.ts
  - src/lib/agents/somnio-v3/state.ts
autonomous: true

must_haves:
  truths:
    - "Timer expiration does NOT push 'otro' to intentsVistos"
    - "Timer expiration does NOT increment turnCount"
    - "Timer expiration does NOT produce intentInfo in output"
    - "L1 timer with barrio missing shows 'Barrio' in campos_faltantes (not empty)"
    - "User messages still produce real intents, increment turns, and show intentInfo"
  artifacts:
    - path: "src/lib/agents/somnio-v3/types.ts"
      provides: "SalesEvent discriminated union, optional intentInfo"
      contains: "SalesEvent"
    - path: "src/lib/agents/somnio-v3/somnio-v3-agent.ts"
      provides: "Split processSystemEvent + processUserMessage paths"
      contains: "processSystemEvent"
    - path: "src/lib/agents/somnio-v3/state.ts"
      provides: "camposFaltantes includes barrio when missing and not negated"
      contains: "barrio"
  key_links:
    - from: "somnio-v3-agent.ts processSystemEvent"
      to: "sales-track resolveSalesTrack"
      via: "event: { type: 'timer_expired', level }"
      pattern: "type: 'timer_expired'"
    - from: "somnio-v3-agent.ts processUserMessage"
      to: "sales-track resolveSalesTrack"
      via: "event: { type: 'user_message', intent, category, changes }"
      pattern: "type: 'user_message'"
---

<objective>
Separate system events (timer expirations) from user message pipeline to eliminate fake analysis hack.

Purpose: Timer expirations currently fabricate a fake analysis with `intent: 'otro'` which contaminates intentsVistos, inflates turnCount, and produces misleading debug data. This refactor uses a TypeScript discriminated union (SalesEvent) to enforce correct behavior at compile time.

Secondary fix: `camposFaltantes()` must include `barrio` when missing and not negated, fixing empty retoma_datos_parciales templates.

Output: Clean two-path pipeline where system events skip comprehension, mergeAnalysis, guards, and intentInfo entirely.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/system-event-separation/CONTEXT.md
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/sales-track.ts
@src/lib/agents/somnio-v3/response-track.ts
@src/lib/agents/somnio-v3/engine-v3.ts
@src/lib/agents/somnio-v3/state.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Types + Sales Track + State bug fix</name>
  <files>
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/sales-track.ts
    src/lib/agents/somnio-v3/state.ts
  </files>
  <action>
    **types.ts:**
    1. Add `SalesEvent` discriminated union type:
       ```ts
       export type SalesEvent =
         | { type: 'user_message'; intent: string; category: string; changes: StateChanges }
         | { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 | 5 }
       ```
       Note: `StateChanges` is exported from `state.ts`, add the import.

    2. Make `intentInfo` optional in `V3AgentOutput`:
       Change `intentInfo: { ... }` to `intentInfo?: { ... }` (add `?`)

    **sales-track.ts:**
    1. Change `resolveSalesTrack` input signature to use `event: SalesEvent` instead of separate `intent`, `changes`, `category`, `systemEvent` params:
       ```ts
       export function resolveSalesTrack(input: {
         phase: Phase
         state: AgentState
         gates: Gates
         event: SalesEvent
       }): SalesTrackOutput
       ```
    2. Import `SalesEvent` from types (remove `SystemEvent` import). Import `StateChanges` from state.
    3. At top of function body, handle the discriminated union:
       - If `event.type === 'timer_expired'`: use `systemEventToKey({ type: 'timer_expired', level: event.level })` for transition lookup, return early.
       - If `event.type === 'user_message'`: destructure `{ intent, category, changes }` from event, proceed with existing logic (dataTimerSignal, auto-triggers, intent lookup, fallback).
    4. Remove the old `systemEvent` handling block (lines 55-67) and the old destructuring of `intent`, `changes`, `category`, `systemEvent` from input.

    **state.ts — camposFaltantes bug fix:**
    1. After the critical fields filter, add barrio inclusion for non-ofi-inter mode:
       ```ts
       export function camposFaltantes(state: AgentState): string[] {
         const fields = state.ofiInter ? CRITICAL_FIELDS_OFI_INTER : CRITICAL_FIELDS_NORMAL
         const missing = fields.filter(f => {
           const val = state.datos[f as keyof DatosCliente]
           return !val || val.trim() === ''
         })

         // Include barrio if missing and not negated (required for datosExtrasOk)
         if (!state.ofiInter) {
           const barrioPresent = state.datos.barrio !== null && state.datos.barrio?.trim() !== ''
           if (!barrioPresent && !state.negaciones.barrio) {
             missing.push('barrio')
           }
         }

         return missing
       }
       ```
  </action>
  <verify>
    `npx tsc --noEmit 2>&1 | head -30` — may show errors in somnio-v3-agent.ts and engine-v3.ts (fixed in Task 2). types.ts, sales-track.ts, state.ts should have zero errors among themselves.
  </verify>
  <done>
    - SalesEvent type exists with discriminated union
    - intentInfo is optional in V3AgentOutput
    - sales-track accepts `event: SalesEvent` and handles both branches
    - camposFaltantes includes barrio when missing and not negated in normal mode
  </done>
</task>

<task type="auto">
  <name>Task 2: Split processMessage + fix engine-v3</name>
  <files>
    src/lib/agents/somnio-v3/somnio-v3-agent.ts
    src/lib/agents/somnio-v3/response-track.ts
    src/lib/agents/somnio-v3/engine-v3.ts
  </files>
  <action>
    **somnio-v3-agent.ts — Split processMessage into two paths:**

    1. Keep `processMessage` as router:
       ```ts
       export async function processMessage(input: V3AgentInput): Promise<V3AgentOutput> {
         if (input.systemEvent) {
           return processSystemEvent(input, input.systemEvent)
         }
         return processUserMessage(input)
       }
       ```

    2. Create `processSystemEvent(input, systemEvent)`:
       - `deserializeState()` from input fields (same as current)
       - `const phase = derivePhase(state.accionesEjecutadas)`
       - `const gates = computeGates(state)` — NO mergeAnalysis, NO turnCount++, NO intentsVistos push
       - `resolveSalesTrack({ phase, state, gates, event: { type: 'timer_expired', level: systemEvent.level } })` — only timer_expired events come from systemEvent input
       - Handle timerSignals from salesResult
       - Apply enterCaptura from salesResult
       - `resolveResponseTrack({ salesAction: salesResult.accion, state, workspaceId: input.workspaceId })` — NO intent param
       - Register action with `origen: 'timer'` (same as current)
       - Update templatesMostrados (same as current)
       - Serialize state
       - Return V3AgentOutput with:
         - **NO intentInfo** (field omitted entirely — it's optional now)
         - intentsVistos unchanged (no 'otro' pushed)
         - turnCount unchanged (no increment)
         - shouldCreateOrder: false
         - timerSignals, decisionInfo, salesTrackInfo, responseTrackInfo as usual
         - **NO classificationInfo** (no analysis ran)

    3. Create `processUserMessage(input)`:
       - This is the existing processMessage logic minus the systemEvent hack
       - Remove the `if (systemEvent) { analysis = {...fake...} }` block
       - Always run comprehension (no conditional)
       - mergeAnalysis as usual (pushes real intent, increments turnCount)
       - Guards as usual (no `if (!systemEvent)` wrapper needed — it's always a user message)
       - `resolveSalesTrack({ phase, state: mergedState, gates, event: { type: 'user_message', intent: analysis.intent.primary, category: analysis.classification.category, changes } })`
       - resolveResponseTrack with intent as usual
       - intentInfo always present (real intent from comprehension)
       - Rest identical to current

    4. In the catch block, make intentInfo optional too (remove the fake 'otro' intentInfo):
       Remove the `intentInfo: { intent: 'otro', ... }` from the error return. Since intentInfo is now optional, just omit it.

    5. Remove `SystemEvent` from the type import (no longer needed in the function body — it's accessed via input.systemEvent which is typed from V3AgentInput).

    **response-track.ts — Make intent optional:**
    1. Change input signature: `intent: string` to `intent?: string`
    2. Guard informational intent check: `if (intent && INFORMATIONAL_INTENTS.has(intent))`
    3. Guard secondary intent check: already behind `secondaryIntent &&` so no change needed
    4. No other changes needed — sales action templates resolve independently of intent

    **engine-v3.ts — Fix debugTurn.intent construction:**
    1. Line 76-81: Wrap in conditional:
       ```ts
       intent: output.intentInfo ? {
         intent: output.intentInfo.intent,
         confidence: output.intentInfo.confidence,
         reasoning: output.intentInfo.reasoning,
         timestamp: output.intentInfo.timestamp,
       } : {
         intent: 'system_event',
         confidence: 0,
         reasoning: 'Timer event - no comprehension',
         timestamp,
       },
       ```
       Use a fallback object rather than undefined because DebugTurn.intent is required (used by debug panel).
  </action>
  <verify>
    1. `npx tsc --noEmit` — zero errors
    2. `grep -c "'otro'" src/lib/agents/somnio-v3/somnio-v3-agent.ts` — should be 0 (no fake 'otro' anywhere, including catch block)
    3. `grep "processSystemEvent\|processUserMessage" src/lib/agents/somnio-v3/somnio-v3-agent.ts` — both functions exist
  </verify>
  <done>
    - processMessage routes to processSystemEvent or processUserMessage
    - System events skip comprehension, mergeAnalysis, guards, and intentInfo
    - User messages work identically to before (real intent, turnCount++, intentsVistos updated)
    - engine-v3 handles optional intentInfo gracefully
    - response-track accepts optional intent
    - `npx tsc --noEmit` passes with zero errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero TypeScript errors
2. `grep -rn "'otro'" src/lib/agents/somnio-v3/somnio-v3-agent.ts` — zero matches (fake analysis eliminated)
3. `grep "intentInfo?" src/lib/agents/somnio-v3/types.ts` — confirms optional
4. `grep "barrio" src/lib/agents/somnio-v3/state.ts` — confirms barrio inclusion in camposFaltantes
5. Manual sandbox test: send user message, verify intent appears in debug panel
6. Manual sandbox test: let timer L0/L1 expire, verify NO 'otro' in intentsVistos and turnCount unchanged
7. Manual sandbox test: let timer L1 expire with barrio missing, verify "Barrio" appears in campos_faltantes list
</verification>

<success_criteria>
- Zero TypeScript errors
- System events (timers) no longer contaminate intentsVistos or turnCount
- intentInfo is absent from system event outputs (not filled with fake data)
- camposFaltantes includes barrio when missing and not negated
- User message pipeline unchanged in behavior
</success_criteria>

<output>
After completion, create `.planning/quick/020-system-event-separation/020-SUMMARY.md`
</output>
