---
status: resolved
trigger: "Ingest timer has two bugs: (A) timer doesn't start on collecting_data transition, (B) timer expiration message lists ALL fields as missing"
created: 2026-02-09T00:00:00Z
updated: 2026-02-09T00:05:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED - Both bugs resolved with minimal surgical changes
test: TypeScript compilation passes, commits created
expecting: N/A - resolved
next_action: Archive to resolved

## Symptoms

expected: (A) Timer starts when agent transitions to collecting_data mode. (B) Level 1 timer expiration only lists truly missing fields.
actual: (A) Timer remains inactive. (B) Message always lists ALL 6 minimum fields as missing.
errors: No errors - both are logic bugs
reproduction: (A) Sandbox -> "hola" -> "si" -> agent asks for data -> timer doesn't start. (B) Provide partial data -> wait for Level 1 timer -> all fields listed.
started: Found during Phase 15.7 verification

## Eliminated

(none - prior diagnosis confirmed correct)

## Evidence

- timestamp: 2026-02-09T00:00:30Z
  checked: sandbox-engine.ts lines 270-358 (normal orchestration flow)
  found: After building newState with nextMode 'collecting_data' (line 272), no code checks for mode transition or sets this.lastTimerSignal. Line 357 returns this.lastTimerSignal which stays null.
  implication: Bug A confirmed - no timer signal emitted on conversacion -> collecting_data transition

- timestamp: 2026-02-09T00:00:45Z
  checked: ingest-timer.ts lines 389-413 (startCountdown expiration handler)
  found: Lines 406-412 call levelConfig.buildAction with hardcoded empty context: fieldsCollected=[], totalFields=0. Level 1 buildAction (lines 113-121) filters TIMER_MINIMUM_FIELDS against fieldsCollected, so all 6 fields appear as missing.
  implication: Bug B confirmed - hardcoded empty context causes all fields to appear missing

- timestamp: 2026-02-09T00:00:55Z
  checked: sandbox-layout.tsx lines 148-169 and 282-316 (timer signal processing)
  found: The React layer correctly builds TimerEvalContext from result.newState when processing 'start' and 'reevaluate' signals. The problem is upstream: engine never emits start signal for Bug A. For Bug B, the simulator needs a way to get current context at expiration time rather than using hardcoded empty context.
  implication: Fix B design: add getContext callback to IngestTimerSimulator, set from sandbox-layout.tsx using current state

## Resolution

root_cause: (A) sandbox-engine.ts normal orchestration flow (Steps 3-10) doesn't emit timerSignal when transitioning to collecting_data. handleIngestMode and checkImplicitYes handle their own timer signals, but the initial captura_datos_si_compra transition via orchestrator was missed. (B) ingest-timer.ts startCountdown passes hardcoded empty TimerEvalContext (fieldsCollected=[], totalFields=0) to buildAction at expiration time, causing Level 1 to list all 6 minimum fields as missing regardless of actual captured data.

fix: (A) Added 5-line check after newState construction in sandbox-engine.ts: if lastTimerSignal is null AND newState transitions to collecting_data from a different mode, emit { type: 'start' }. (B) Added setContextProvider() method to IngestTimerSimulator and contextProvider private property. startCountdown now calls contextProvider() at expiration time if available, falling back to empty context. sandbox-layout.tsx sets the provider using stateRef (avoids stale closure) to return real TimerEvalContext from current SandboxState.

verification: TypeScript compilation passes (0 errors in modified files). Changes are minimal and surgical - no surrounding code refactored.

files_changed:
  - src/lib/sandbox/sandbox-engine.ts (Bug A: +12 lines)
  - src/lib/sandbox/ingest-timer.ts (Bug B: +25 lines, modified startCountdown)
  - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx (Bug B: +22 lines, stateRef + setContextProvider)
