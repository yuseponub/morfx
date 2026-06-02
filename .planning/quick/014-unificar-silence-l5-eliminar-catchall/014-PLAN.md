---
phase: quick-014
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/transitions.ts
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - src/lib/agents/somnio-v3/engine-v3.ts
  - src/lib/sandbox/ingest-timer.ts
  - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
autonomous: true

must_haves:
  truths:
    - "Default ack transition emits L5 timer signal instead of silence"
    - "timer_expired:5 in initial phase triggers retoma message"
    - "No catch-all in orchestrator — all silence is state-driven via transitions"
    - "silenceDetected field no longer exists anywhere in v3 pipeline"
  artifacts:
    - path: "src/lib/agents/somnio-v3/transitions.ts"
      contains: "level: 'L5'"
    - path: "src/lib/agents/somnio-v3/transitions.ts"
      contains: "timer_expired:5"
    - path: "src/lib/sandbox/ingest-timer.ts"
      contains: "5: 90"
  key_links:
    - from: "transitions.ts (default ack)"
      to: "ingest-timer.ts (L5 duration)"
      via: "TimerSignal level L5 -> sandbox processTimerSignal parses L5 -> startTimerForLevel(5) -> 90s countdown"
    - from: "transitions.ts (timer_expired:5)"
      to: "somnio-v3-agent.ts (sales track)"
      via: "SystemEvent timer_expired level 5 -> systemEventToKey -> timer_expired:5 -> transition match"
---

<objective>
Unify the ad-hoc "silence" timer level into L5 (90s), add timer_expired:5 transition for initial phase, and remove the catch-all from the orchestrator so ALL silence behavior is state-driven via the transition table.

Purpose: Eliminate non-declarative catch-all logic from somnio-v3-agent.ts. Every timer signal and response should originate from the transition table or guards, never from the orchestrator.
Output: Clean v3 pipeline where silence = L5, with timer_expired:5 handling retoma in initial phase.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/agents/somnio-v3/transitions.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/engine-v3.ts
@src/lib/sandbox/ingest-timer.ts
@src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace silence with L5 in types, transitions, and timer config</name>
  <files>
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/transitions.ts
    src/lib/sandbox/ingest-timer.ts
  </files>
  <action>
    1. **types.ts line 87**: Change TimerSignal.level from `'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'silence'` to `'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'`.

    2. **types.ts line 242**: Change SystemEvent timer_expired level from `0 | 1 | 2 | 3 | 4` to `0 | 1 | 2 | 3 | 4 | 5`.

    3. **transitions.ts line 84**: Change `level: 'silence'` to `level: 'L5'` in the default ack transition resolve function.

    4. **transitions.ts**: Add a new timer_expired:5 transition for `initial` phase AFTER the existing timer_expired entries (after line 305, before the Retroceso section). The transition:
       ```
       {
         phase: 'initial', on: 'timer_expired:5', action: 'retoma',
         resolve: () => ({
           templateIntents: ['retoma_inicial'],
           timerSignal: { type: 'cancel', reason: 'retoma L5 enviada' },
           reason: 'Timer L5 expired en initial -> retoma',
         }),
       },
       ```
       WAIT — 'retoma' is not in TipoAccion. Use 'pedir_datos' instead (closest action — it's a re-engagement). The template intent 'retoma_inicial' will carry the "te gustaria adquirir" message:
       ```
       {
         phase: 'initial', on: 'timer_expired:5', action: 'pedir_datos',
         resolve: () => ({
           templateIntents: ['retoma_inicial'],
           reason: 'Timer L5 expired en initial -> retoma inicial',
         }),
       },
       ```
       Note: No timerSignal here — after retoma, the conversation continues naturally. If the user doesn't respond, the default ack will fire again on next silence, creating another L5.

    5. **ingest-timer.ts**: Add level 5 = 90 seconds to all timer configs:
       - TIMER_DEFAULTS.levels: add `5: 90`
       - TIMER_PRESETS.real.levels: add `5: 90`
       - TIMER_PRESETS.rapido.levels: add `5: 9`
       - TIMER_PRESETS.instantaneo.levels: add `5: 1`

    6. **ingest-timer.ts**: LEVEL_NAMES already has `5: 'Silencio'` — leave as is.
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors related to 'silence' or TimerSignal level.
    Grep for `'silence'` in types.ts — should NOT appear in TimerSignal level type.
    Grep for `timer_expired:5` in transitions.ts — should find 1 match.
  </verify>
  <done>
    TimerSignal uses L5 instead of silence. timer_expired:5 transition exists for initial phase. Timer config includes 90s for level 5.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove catch-all and silenceDetected from orchestrator and engine</name>
  <files>
    src/lib/agents/somnio-v3/somnio-v3-agent.ts
    src/lib/agents/somnio-v3/engine-v3.ts
    src/lib/agents/somnio-v3/types.ts
    src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
  </files>
  <action>
    1. **somnio-v3-agent.ts lines 192-197**: Remove the entire catch-all block:
       ```
       if (responseResult.messages.length === 0 && timerSignals.length === 0) {
         timerSignals.push({ type: 'start', level: 'silence', reason: 'silencio sin timer activo' })
       }
       ```
       This is now handled by the transition table — the default ack transition (line 84) already emits `{ type: 'start', level: 'L5' }`.

    2. **somnio-v3-agent.ts**: Remove `silenceDetected` from ALL 3 return paths:
       - Line 119 (guard return): remove `silenceDetected: timerSignals.some(s => s.level === 'silence'),`
       - Line 221 (silence return): remove `silenceDetected: timerSignals.some(s => s.level === 'silence'),`
       - Line 271 (normal return): remove `silenceDetected: timerSignals.some(s => s.level === 'silence'),`
       - Line 321 (error return): remove `silenceDetected: false,`

    3. **types.ts V3AgentOutput (line 171)**: Remove `silenceDetected: boolean` field entirely.

    4. **engine-v3.ts**:
       - Line 31 (V3EngineOutput): Remove `silenceDetected?: boolean` field
       - Line 96: The `classification.category` check `output.silenceDetected ? 'SILENCIOSO'` — replace with a check on timerSignals containing L5: `output.timerSignals.some(s => s.level === 'L5') ? 'SILENCIOSO'`
       - Line 129: Remove `silenceDetected: output.silenceDetected,`

    5. **sandbox-layout.tsx lines 377-381**: Remove the entire step 9 block:
       ```
       // 9. Handle silence detection: start countdown at L0 via main timer
       if (result.silenceDetected && timerEnabledRef.current) {
         const silenceDuration = timerConfig.levels[0] ?? 600
         simulatorRef.current?.start(0, silenceDuration * 1000)
       }
       ```
       This is no longer needed because L5 comes through as a regular timerSignal, and `processTimerSignal` (step 8) already handles it: it parses 'L5' -> level 5 -> startTimerForLevel(5) -> uses timerConfig.levels[5] = 90s.

    6. **sandbox-layout.tsx**: Check if `silenceDetected` is referenced anywhere else in the file. If V3EngineOutput type was imported/used, the removal of the field should be clean since step 8 already handles L5 via processTimerSignal.

    7. Also remove the comment on line 11 of somnio-v3-agent.ts: `* Catch-all: retoma timer when 0 messages + 0 timers` — update the file header to remove this mention.
  </action>
  <verify>
    Run `npx tsc --noEmit` — no type errors.
    Grep for `silenceDetected` across ALL v3 files + sandbox — should return 0 matches.
    Grep for `'silence'` in somnio-v3-agent.ts — should return 0 matches.
    Grep for `catch-all` or `RETOMA CATCH-ALL` in somnio-v3-agent.ts — should return 0 matches.
  </verify>
  <done>
    Catch-all block removed from orchestrator. silenceDetected field removed from V3AgentOutput, engine-v3, and sandbox-layout. All silence behavior is now state-driven via the transition table (default ack -> L5 -> timer_expired:5).
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. Grep `'silence'` in all v3 files — only appears in TipoAccion (the action type, not timer level) and in template intents / string literals unrelated to timer
3. Grep `silenceDetected` across entire src/ — zero matches
4. Grep `catch-all` in somnio-v3-agent.ts — zero matches
5. Grep `timer_expired:5` in transitions.ts — exactly 1 match
6. Grep `5: 90` in ingest-timer.ts — appears in TIMER_DEFAULTS and TIMER_PRESETS.real
</verification>

<success_criteria>
- Default ack in transitions.ts emits L5 timer signal (not 'silence')
- timer_expired:5 transition exists for initial phase with retoma_inicial template
- Timer config has level 5 = 90 seconds in all presets
- Catch-all block removed from somnio-v3-agent.ts
- silenceDetected removed from V3AgentOutput, engine-v3, sandbox-layout
- TypeScript compiles with zero errors
</success_criteria>

<output>
After completion, create `.planning/quick/014-unificar-silence-l5-eliminar-catchall/014-SUMMARY.md`
</output>
