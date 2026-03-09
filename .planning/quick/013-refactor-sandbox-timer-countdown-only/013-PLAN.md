---
phase: quick-013
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/types.ts
  - src/lib/agents/somnio-v3/transitions.ts
  - src/lib/sandbox/ingest-timer.ts
  - src/lib/sandbox/types.ts
  - src/lib/agents/somnio-v3/engine-v3.ts
  - src/app/api/sandbox/process/route.ts
  - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
autonomous: true

must_haves:
  truths:
    - "Timer countdown runs in sandbox and fires systemEvent to pipeline on expire"
    - "Pipeline (sales track + response track) decides what to do and say on timer_expired"
    - "Silence retake flows through pipeline via systemEvent, not hardcoded messages"
    - "No forceIntent used — sandbox sends systemEvent directly"
    - "No hardcoded messages injected from frontend on timer expiry"
  artifacts:
    - path: "src/lib/sandbox/ingest-timer.ts"
      provides: "Pure countdown timer (no evaluate/buildAction)"
    - path: "src/lib/agents/somnio-v3/transitions.ts"
      provides: "timer_expired:0 and timer_expired:1 transitions"
    - path: "src/lib/agents/somnio-v3/types.ts"
      provides: "SystemEvent with level 0|1|2|3|4"
  key_links:
    - from: "sandbox-layout.tsx"
      to: "/api/sandbox/process"
      via: "systemEvent in request body"
      pattern: "systemEvent.*timer_expired"
    - from: "/api/sandbox/process"
      to: "engine-v3.ts"
      via: "systemEvent passed to V3EngineInput"
      pattern: "systemEvent"
    - from: "engine-v3.ts"
      to: "somnio-v3-agent.ts processMessage"
      via: "systemEvent in input"
      pattern: "input\\.systemEvent"
---

<objective>
Refactor sandbox timer system from decision-making engine to pure countdown.

Purpose: The sandbox timer (IngestTimerSimulator) currently evaluates levels, builds actions,
injects hardcoded messages, and changes modes directly. This contradicts the v3 state-driven
architecture where sales track decides WHAT TO DO and response track decides WHAT TO SAY.
After this refactor, the sandbox timer is countdown-only: start, tick, expire. On expiration,
it sends a systemEvent to the pipeline, which handles everything.

Output: Simplified timer, unified silence timer, no forceIntent adapter, no hardcoded messages.
</objective>

<execution_context>
@.planning/quick/013-refactor-sandbox-timer-countdown-only/013-CONTEXT.md
</execution_context>

<context>
@src/lib/sandbox/ingest-timer.ts
@src/lib/sandbox/types.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/transitions.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/engine-v3.ts
@src/app/api/sandbox/process/route.ts
@src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand SystemEvent types + add L0/L1 transitions</name>
  <files>
    src/lib/agents/somnio-v3/types.ts
    src/lib/agents/somnio-v3/transitions.ts
  </files>
  <action>
1. In `types.ts`, expand the SystemEvent timer_expired level union from `2 | 3 | 4` to `0 | 1 | 2 | 3 | 4`:
   ```
   | { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 }
   ```

2. In `transitions.ts`, add two new transition entries BEFORE the existing timer_expired:2 entry:
   ```
   // Timer expired L0 -> pedir_datos (retoma sin datos)
   {
     phase: 'capturing_data', on: 'timer_expired:0', action: 'pedir_datos',
     resolve: (state) => ({
       templateIntents: ['retoma_datos'],
       timerSignal: { type: 'start', level: 'L0', reason: 'retoma L0 -> re-pedir datos' },
       reason: 'Timer L0 expired -> retoma sin datos',
     }),
   },
   // Timer expired L1 -> pedir_datos (retoma datos parciales)
   {
     phase: 'capturing_data', on: 'timer_expired:1', action: 'pedir_datos',
     resolve: (state) => {
       // Build missing fields list for extraContext
       const MINIMUM_FIELDS = ['nombre', 'apellido', 'telefono', 'ciudad', 'departamento', 'direccion']
       const collected = Object.keys(state.datosCapturados).filter(k => state.datosCapturados[k])
       const missing = MINIMUM_FIELDS.filter(f => !collected.includes(f))
       return {
         templateIntents: ['retoma_datos_parciales'],
         extraContext: { campos_faltantes: missing.join(', ') },
         timerSignal: { type: 'start', level: 'L1', reason: 'retoma L1 -> re-pedir datos parciales' },
         reason: 'Timer L1 expired -> retoma datos parciales',
       }
     },
   },
   ```

Note: The `retoma_datos` and `retoma_datos_parciales` template intents should match existing retake templates in the workspace. If they don't exist yet, response track will gracefully return 0 messages (which is fine — the pipeline handles it). These template names can be adjusted later when templates are configured.
  </action>
  <verify>Run `npx tsc --noEmit` — no type errors. Grep for `timer_expired:0` and `timer_expired:1` in transitions.ts to confirm entries exist.</verify>
  <done>SystemEvent accepts levels 0-4. Transitions table has entries for all 5 timer_expired levels.</done>
</task>

<task type="auto">
  <name>Task 2: API route + engine accept systemEvent directly</name>
  <files>
    src/app/api/sandbox/process/route.ts
    src/lib/agents/somnio-v3/engine-v3.ts
  </files>
  <action>
1. In `route.ts`, add `systemEvent` to the body destructuring and type annotation:
   ```typescript
   const { message, state, history, turnNumber, crmAgents, workspaceId, forceIntent, agentId, systemEvent } = body as {
     // ... existing fields ...
     systemEvent?: { type: string; level?: number; result?: string; ready_for?: string }
   }
   ```
   Pass `systemEvent` to V3Engine:
   ```typescript
   const v3Result = await v3Engine.processMessage({
     // ... existing fields ...
     systemEvent,
   })
   ```

2. In `engine-v3.ts`, add `systemEvent` to `V3EngineInput`:
   ```typescript
   systemEvent?: { type: string; level?: number; result?: string; ready_for?: string }
   ```
   Pass it through to processMessage:
   ```typescript
   const output = await processMessage({
     // ... existing fields ...
     systemEvent: input.systemEvent,
   })
   ```

Do NOT remove `forceIntent` yet from these files — it stays as backward compat until sandbox-layout stops sending it (Task 4). The agent already has the forceIntent->systemEvent adapter which will simply not trigger when systemEvent is provided directly.
  </action>
  <verify>Run `npx tsc --noEmit` — no type errors.</verify>
  <done>API route accepts systemEvent in request body and passes it through V3Engine to processMessage. forceIntent still works as fallback.</done>
</task>

<task type="auto">
  <name>Task 3: Simplify IngestTimerSimulator to pure countdown + clean types</name>
  <files>
    src/lib/sandbox/ingest-timer.ts
    src/lib/sandbox/types.ts
  </files>
  <action>
1. **Rewrite `ingest-timer.ts`** to a pure countdown class (~100 lines):

   **KEEP:**
   - `TIMER_DEFAULTS` and `TIMER_PRESETS` (sandbox needs duration config)
   - Class name `IngestTimerSimulator` (avoid renaming to minimize import changes)
   - `start(level: number, durationMs: number)` — starts countdown
   - `stop()` — stops countdown
   - `pause()` / `resume()` — pauses/resumes
   - `getState(): TimerState` — current state snapshot
   - `destroy()` — cleanup

   **REMOVE entirely:**
   - `TIMER_LEVELS` array (all 5 level definitions with evaluate/buildAction)
   - `TIMER_ALL_FIELDS`, `FIELD_LABELS` (hardcoded message data)
   - `evaluateLevel()` method
   - `reevaluateLevel()` method
   - `setContextProvider()` and `contextProvider` property
   - Import of `TIMER_MINIMUM_FIELDS`
   - Import of `TimerAction`, `TimerEvalContext`, `TimerLevelConfig` types

   **CHANGE callbacks:**
   - `onTick` stays: `(remainingMs: number, level: number) => void`
   - `onExpire` changes from `(level: number, action: TimerAction) => void` to `(level: number) => void`
     (No action — sandbox-layout will send systemEvent to pipeline instead)

   **In `startCountdown()`:** On expire timeout, just call `this.onExpire(level)` — no buildAction, no contextProvider.

   **In `getState()`:** Remove TIMER_LEVELS.find() for levelName. Use a simple map:
   ```typescript
   const LEVEL_NAMES: Record<number, string> = {
     0: 'Sin datos', 1: 'Datos parciales', 2: 'Datos minimos',
     3: 'Promos sin respuesta', 4: 'Pack sin confirmar', 5: 'Silencio',
   }
   ```
   Return `LEVEL_NAMES[this.currentLevel ?? -1] ?? ''` for levelName.

2. **Clean `types.ts`** timer section:

   **REMOVE:**
   - `TimerAction` interface (no more client-side actions)
   - `TimerEvalContext` interface (no more client-side evaluation)
   - `TimerLevelConfig` interface (no more client-side level definitions)
   - `SilenceTimerState` interface (silence unified with main timer)

   **KEEP:**
   - `TimerSignal` (used by pipeline response)
   - `TimerState` (UI display)
   - `TimerConfig` (duration config)
   - `TimerPreset` (speed presets)

   Also remove `silenceDetected` from `SandboxEngineResult` — silence now flows through pipeline as systemEvent. WAIT: Actually keep `silenceDetected` for now since production silence detection may still need it. Only remove `SilenceTimerState`.
  </action>
  <verify>Run `npx tsc --noEmit` — expect errors ONLY in sandbox-layout.tsx (which still references removed types/methods). That's expected and fixed in Task 4.</verify>
  <done>IngestTimerSimulator is a pure countdown (~100 lines). No evaluate, no buildAction, no hardcoded messages. Types cleaned: TimerAction, TimerEvalContext, TimerLevelConfig, SilenceTimerState removed.</done>
</task>

<task type="auto">
  <name>Task 4: Refactor sandbox-layout — timer expiry sends systemEvent, unify silence timer</name>
  <files>
    src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
  </files>
  <action>
This is the main refactor. Replace the complex timer handling in sandbox-layout with a simple pattern:
timer expires -> send systemEvent to pipeline -> display result.

**4a. Clean imports:**
- Remove: `TimerEvalContext`, `TimerAction`, `SilenceTimerState` from type import
- Remove: `TIMER_LEVELS` from ingest-timer import
- Remove: `SILENCE_RETAKE_FULL`, `SILENCE_RETAKE_SHORT`, `SILENCE_RETAKE_DETECT`, `SILENCE_RETAKE_DURATION_MS` from constants import
- Keep: `IngestTimerSimulator`, `TIMER_DEFAULTS` from ingest-timer

**4b. Remove silence timer state entirely:**
- Remove: `silenceTimerState` useState
- Remove: `silenceIntervalRef`, `silenceTimeoutRef` refs
- Remove: `silenceDurationMs` useState, `silenceDurationRef` ref
- Remove: `retakeTemplateRef` ref
- Remove: `cancelSilenceTimer()` callback
- Remove: `startSilenceTimer()` callback
- Remove: silence timer cleanup useEffect
- Remove: fetch to `/api/sandbox/retake-template` useEffect

**4c. Rewrite handleTimerExpire — the core change:**
Replace the entire `handleTimerExpire` callback. New version:
```typescript
const handleTimerExpire = useCallback(async (level: number) => {
  // Reset timer display immediately
  setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })

  // Send systemEvent to pipeline — pipeline decides what to do and say
  const currentMessages = messagesRef.current
  const currentDebugTurns = debugTurnsRef.current
  const currentState = stateRef.current
  const history = currentMessages.map(m => ({ role: m.role, content: m.content }))
  const enabledCrmAgents = crmAgentsRef.current
    .filter(a => a.enabled)
    .map(a => ({ agentId: a.agentId, mode: a.mode }))

  try {
    setIsTyping(true)
    const response = await fetch('/api/sandbox/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `[timer expired: level ${level}]`,
        state: currentState,
        history,
        turnNumber: currentDebugTurns.length + 1,
        systemEvent: { type: 'timer_expired', level },
        agentId: agentIdRef.current,
        crmAgents: enabledCrmAgents,
        workspaceId: workspaceRef.current?.id,
      }),
    })
    const result = await response.json()
    setIsTyping(false)

    // Display messages from pipeline
    if (result.success && result.messages?.length > 0) {
      for (const msg of result.messages) {
        const assistantMsg: SandboxMessage = {
          id: `msg-${Date.now()}-timer-${Math.random().toString(36).slice(2, 7)}`,
          role: 'assistant' as const,
          content: msg,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, assistantMsg])
        if (result.messages.length > 1) {
          await new Promise(r => setTimeout(r, 2000))
        }
      }
    }

    // Update state and debug from pipeline response
    if (result.newState) setState(result.newState)
    if (result.debugTurn) {
      setDebugTurns(prev => [...prev, result.debugTurn])
      setTotalTokens(prev => prev + (result.debugTurn.tokens?.tokensUsed ?? 0))
    }

    // Process next timer signal from pipeline (e.g., L2 -> start L3)
    if (timerEnabledRef.current && result.timerSignal) {
      processTimerSignal(result.timerSignal)
    }
  } catch (err) {
    setIsTyping(false)
    console.error(`[Timer L${level}] Failed to process timer expiry:`, err)
  }
}, [])
```

**4d. Create processTimerSignal helper:**
```typescript
const processTimerSignal = useCallback((signal: { type: string; level?: string; reason?: string }) => {
  if (signal.type === 'start' && signal.level) {
    const levelNum = parseInt(signal.level.replace('L', ''), 10)
    if (!isNaN(levelNum)) {
      startTimerForLevel(levelNum)
    }
  } else if (signal.type === 'reevaluate' && signal.level) {
    // Reevaluate = restart at the specified level (pipeline already decided the level)
    const levelNum = parseInt(signal.level.replace('L', ''), 10)
    if (!isNaN(levelNum)) {
      startTimerForLevel(levelNum)
    }
  } else if (signal.type === 'cancel') {
    simulatorRef.current?.stop()
    setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })
  }
}, [startTimerForLevel])
```

**4e. Simplify simulator initialization:**
```typescript
useEffect(() => {
  const simulator = new IngestTimerSimulator(
    (remainingMs, level) => {
      setTimerState(prev => ({
        active: true,
        level,
        levelName: '', // levelName comes from getState() now
        remainingMs,
        paused: prev.paused,
      }))
    },
    (level) => {
      timerExpireRef.current(level)
    }
  )
  simulatorRef.current = simulator
  return () => simulator.destroy()
}, [])
```
Remove `simulator.setContextProvider(...)` entirely.

**4f. Simplify timer signal processing in handleSendMessage:**
Replace the current block (lines 562-598) with:
```typescript
if (timerEnabledRef.current && result.timerSignal) {
  processTimerSignal(result.timerSignal)
}
```
Remove all the `TimerEvalContext` construction and `evaluateLevel`/`reevaluateLevel` calls.

**4g. Simplify handleTimerToggle:**
Remove the `evaluateLevel` call when re-enabling. When timer is toggled on, just let the next pipeline response start the timer via timerSignal. No retroactive evaluation needed.
```typescript
const handleTimerToggle = useCallback((enabled: boolean) => {
  setTimerEnabled(enabled)
  if (!enabled) {
    simulatorRef.current?.stop()
    setTimerState({ active: false, level: null, levelName: '', remainingMs: 0, paused: false })
  }
}, [])
```

**4h. Handle silence via pipeline systemEvent:**
In handleSendMessage, where `result.silenceDetected` currently calls `startSilenceTimer()`, instead start a countdown at a special "silence" level. Use level 5 for silence (or reuse level 0 per the CONTEXT doc — use level 0 since the CONTEXT says "Silence countdown expires -> systemEvent: timer_expired level 0 (reuses retoma)").

Actually, looking at the CONTEXT table more carefully: when `silenceDetected` is true, the pipeline should emit a timerSignal `{ start, silence }`. But the current pipeline emits `silenceDetected: boolean` separately. For now, handle it in sandbox-layout:

```typescript
// After processing timer signals from result:
if (result.silenceDetected && timerEnabledRef.current) {
  // Start a silence countdown — on expire, sends timer_expired:0 (reuses retoma)
  const silenceDuration = timerConfig.levels[0] ?? 600 // Use L0 duration for silence
  simulatorRef.current?.start(0, silenceDuration * 1000)
}
```

This reuses the main countdown timer for silence, eliminating the separate silence timer system entirely.

**4i. Update DebugV3 and DebugTabs props:**
Remove `silenceTimerState` and `silenceDurationMs` / `onSilenceDurationChange` props since the separate silence timer is gone. The main timer display already shows the countdown. Check DebugV3 and DebugTabs components for these props — remove them and update the components to not render the separate silence timer section. If the prop removal causes issues in those components, comment them out with a `// TODO: removed silence timer` note.

**4j. Remove forceIntent from handleSendMessage timer trigger calls:**
The old handleTimerExpire used `forceIntent: 'ofrecer_promos'` etc. The new version uses `systemEvent` instead. Verify no remaining `forceIntent` usage in sandbox-layout.

**4k. Update timerExpireRef type:**
Change from `useRef<(level: number, action: TimerAction) => void>` to `useRef<(level: number) => void>` to match new callback signature.
  </action>
  <verify>
1. Run `npx tsc --noEmit` — zero type errors
2. Run `npm run build` — successful build
3. Start dev server (`npm run dev`) and open sandbox with v3 agent. Verify:
   - Timer countdown appears in debug panel
   - Sending customer data triggers timer countdown via pipeline signal
   - Timer expiring sends systemEvent (check network tab: request body has `systemEvent`)
   - Pipeline response includes messages (templates) and new state
   - No hardcoded retake messages from frontend
  </verify>
  <done>
- sandbox-layout sends systemEvent on timer expiry (not forceIntent)
- No hardcoded messages injected from frontend
- Silence timer unified with main countdown (no separate SilenceTimerState)
- Pipeline controls all timer-driven behavior
- Build passes with zero errors
  </done>
</task>

<task type="auto">
  <name>Task 5: Cleanup — remove forceIntent adapter from agent, final verification</name>
  <files>
    src/lib/agents/somnio-v3/somnio-v3-agent.ts
    src/lib/agents/somnio-v3/engine-v3.ts
    src/app/api/sandbox/process/route.ts
  </files>
  <action>
1. In `somnio-v3-agent.ts`, remove the forceIntent -> systemEvent translation block (lines 54-71):
   ```typescript
   // DELETE: Translate forceIntent -> SystemEvent (backward compat layer)
   // let systemEvent: SystemEvent | undefined = input.systemEvent
   // if (!systemEvent && input.forceIntent) { ... }
   ```
   Just use `input.systemEvent` directly:
   ```typescript
   const systemEvent: SystemEvent | undefined = input.systemEvent
   ```
   Also remove the `else if (input.forceIntent)` block (lines 82-90) that handled legacy forceIntent as synthetic analysis.

2. In `somnio-v3-agent.ts`, remove `forceIntent` from the function's destructured input if it reads it.

3. In `engine-v3.ts` (V3EngineInput): Remove `forceIntent?: string` field.
   Remove `forceIntent: input.forceIntent` from the processMessage call.

4. In `route.ts`: Remove `forceIntent` from body destructuring for the v3 path.
   Keep it for v1 path (UnifiedEngine still uses it).

5. In `types.ts` (V3AgentInput): Remove `forceIntent?: string` field.

6. Verify no remaining references to forceIntent in v3 code path:
   ```bash
   grep -r "forceIntent" src/lib/agents/somnio-v3/ --include="*.ts"
   ```
   Should return 0 results.
  </action>
  <verify>
1. `npx tsc --noEmit` passes
2. `npm run build` succeeds
3. `grep -r "forceIntent" src/lib/agents/somnio-v3/ --include="*.ts"` returns nothing
4. Quick manual test in sandbox: timer expires -> pipeline processes -> messages appear
  </verify>
  <done>
- forceIntent removed from v3 pipeline entirely
- systemEvent is the only way to communicate timer/system events
- Clean separation: sandbox = countdown only, pipeline = all decisions
- Build passes, no forceIntent references in v3 code
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — successful
3. No `forceIntent` in v3 agent code: `grep -r "forceIntent" src/lib/agents/somnio-v3/`
4. No `TIMER_LEVELS` in sandbox code: `grep -r "TIMER_LEVELS" src/app/`
5. No `buildAction` in timer code: `grep -r "buildAction" src/lib/sandbox/`
6. No hardcoded retake messages in sandbox-layout: `grep -r "SILENCE_RETAKE" src/app/`
7. Sandbox timer countdown works end-to-end (manual test)
</verification>

<success_criteria>
- IngestTimerSimulator is ~100 lines of pure countdown (no evaluate, no buildAction)
- Timer expiry in sandbox sends systemEvent to pipeline (not forceIntent)
- Pipeline (sales track + response track) handles all timer-driven decisions
- Silence retake unified with main countdown timer (no separate system)
- TimerAction, TimerEvalContext, TimerLevelConfig, SilenceTimerState types removed
- forceIntent removed from v3 agent pipeline
- Zero type errors, successful build
</success_criteria>

<output>
After completion, create `.planning/quick/013-refactor-sandbox-timer-countdown-only/013-SUMMARY.md`
</output>
