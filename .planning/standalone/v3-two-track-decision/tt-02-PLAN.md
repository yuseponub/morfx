---
phase: standalone/v3-two-track-decision
plan: 02
type: execute
wave: 2
depends_on: ["tt-01"]
files_modified:
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - src/lib/agents/somnio-v3/engine-v3.ts
  - src/lib/agents/somnio-v3/constants.ts
  - src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
autonomous: false

must_haves:
  truths:
    - "Pipeline never cuts at ingest — all messages reach sales track + response track"
    - "'2' message in captura mode triggers seleccion_pack -> mostrar_confirmacion via sales track"
    - "'cuanto cuesta?' in captura mode gets price template via response track (informational intent)"
    - "'ok' in captura mode produces natural silence (no sales action + ack not informational)"
    - "Timer expired events still trigger order creation through sales track"
    - "Guards (R0, R1) still block before sales track runs"
    - "Debug panel shows sales track output and response track output as separate pipeline steps"
    - "V3AgentOutput interface unchanged — engine-v3.ts and engine-adapter.ts unaffected"
  artifacts:
    - path: "src/lib/agents/somnio-v3/somnio-v3-agent.ts"
      provides: "Rewired pipeline: C2 -> C3 -> C5 -> guards -> sales track -> response track"
      contains: "resolveSalesTrack|resolveResponseTrack"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx"
      provides: "Debug visibility for sales track + response track"
      contains: "salesTrack|responseTrack"
  key_links:
    - from: "src/lib/agents/somnio-v3/somnio-v3-agent.ts"
      to: "src/lib/agents/somnio-v3/sales-track.ts"
      via: "resolveSalesTrack import and call"
      pattern: "resolveSalesTrack"
    - from: "src/lib/agents/somnio-v3/somnio-v3-agent.ts"
      to: "src/lib/agents/somnio-v3/response-track.ts"
      via: "resolveResponseTrack import and call"
      pattern: "resolveResponseTrack"
---

<objective>
Rewire the main pipeline to use sales-track + response-track, remove the silent cut, update debug panel, and clean up deprecated code.

Purpose: Complete the two-track architecture by wiring the new modules into the actual pipeline, fixing the root cause bug (premature silence in captura mode), and giving sandbox users visibility into the new decision flow.

Output: Working two-track pipeline in sandbox, debug panel showing both tracks, deprecated code cleaned up.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-two-track-decision/CONTEXT.md
@.planning/standalone/v3-two-track-decision/tt-01-SUMMARY.md
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/engine-v3.ts
@src/lib/agents/somnio-v3/decision.ts
@src/lib/agents/somnio-v3/response.ts
@src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewire somnio-v3-agent.ts pipeline</name>
  <files>
    src/lib/agents/somnio-v3/somnio-v3-agent.ts
    src/lib/agents/somnio-v3/engine-v3.ts
    src/lib/agents/somnio-v3/constants.ts
  </files>
  <action>
**somnio-v3-agent.ts — Major rewrite of processMessage():**

Replace imports: Remove `decide`, `transitionToDecision` from `./decision` and `composeResponse` from `./response`. Add `resolveSalesTrack` from `./sales-track` and `resolveResponseTrack` from `./response-track`. Keep `checkGuards` from `./guards`.

**New pipeline flow (replacing lines 117-334):**

After C3 (state merge) and C5 (gates), the new flow is:

```
// C4: Ingest (simplified — only emits system events + timer signals)
const ingestResult = evaluateIngest(analysis, mergedState, gates, prevState)
if (ingestResult.timerSignal) timerSignals.push(ingestResult.timerSignal)

// GUARDS (R0, R1) — run BEFORE tracks
// Skip guards for system events (timers don't need confidence/escape checks)
if (!systemEvent && !ingestResult.systemEvent) {
  const guardResult = checkGuards(analysis)
  if (guardResult.blocked) {
    // Return handoff output (same shape as current handoff return)
    // Include timerSignal from guard decision
    if (guardResult.decision.timerSignal) timerSignals.push(guardResult.decision.timerSignal)
    const serialized = serializeState(mergedState)
    return { ... handoff output with timerSignals ... }
  }
}

// SALES TRACK
const phase = derivePhase(mergedState.accionesEjecutadas)
const salesResult = resolveSalesTrack({
  phase,
  intent: analysis.intent.primary,
  isAcknowledgment: analysis.classification.is_acknowledgment,
  sentiment: analysis.classification.sentiment,
  state: mergedState,
  gates,
  systemEvent,
  ingestSystemEvent: ingestResult.systemEvent,
})

if (salesResult.timerSignal) timerSignals.push(salesResult.timerSignal)

// Apply captura mode from sales track
if (salesResult.enterCaptura === true) mergedState.enCapturaSilenciosa = true
else if (salesResult.enterCaptura === false) mergedState.enCapturaSilenciosa = false

// Check for order creation or terminal actions
const isCreateOrder = salesResult.accion === 'crear_orden'

// RESPONSE TRACK
const responseResult = await resolveResponseTrack({
  salesAction: salesResult.accion,
  intent: analysis.intent.primary,
  secondaryIntent: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
  state: mergedState,
  workspaceId: input.workspaceId,
})

// NATURAL SILENCE: response track produced 0 messages
if (responseResult.messages.length === 0) {
  // Return silent output (same shape as current silence return)
  // BUT use silenceDetected: true only if we had no action at all
  // (if salesResult.accion exists but response track returned empty, that's a bug worth logging)
}

// Register action
if (salesResult.accion && salesResult.accion !== 'silence') {
  mergedState.accionesEjecutadas.push({
    tipo: salesResult.accion,
    turno: mergedState.turnCount,
    origen: systemEvent ? 'timer' : ingestResult.systemEvent ? 'ingest' : 'bot',
  })
}

// Update templatesMostrados
for (const tid of responseResult.templateIdsSent) {
  if (!mergedState.templatesMostrados.includes(tid)) {
    mergedState.templatesMostrados.push(tid)
  }
}

// Build output (same V3AgentOutput shape)
```

**CRITICAL: Remove the entire silent cut block** (current lines 129-160 where `ingestResult.action === 'silent'` returns early). This is THE bug fix.

**CRITICAL: Remove the decision.action === 'silence' block** (current lines 194-227). Silence is now natural (0 messages from response track).

**Keep the handoff return** for guards, but route it through the guard check BEFORE sales track (not through decision engine).

**V3AgentOutput additions for debug:**
Add to the output object:
```typescript
salesTrackInfo: {
  accion: salesResult.accion,
  reason: salesResult.reason,
  enterCaptura: salesResult.enterCaptura,
},
responseTrackInfo: {
  salesTemplateIntents: responseResult.salesTemplateIntents,
  infoTemplateIntents: responseResult.infoTemplateIntents,
  totalMessages: responseResult.messages.length,
},
```

Update `V3AgentOutput` type in types.ts to include optional `salesTrackInfo` and `responseTrackInfo` fields.

**decisionInfo field:** Still populate for backward compat with existing debug panel code. Derive from salesResult:
```typescript
decisionInfo: {
  action: responseResult.messages.length === 0 ? 'silence'
    : isCreateOrder ? 'create_order'
    : 'respond',
  reason: salesResult.reason,
  templateIntents: [...responseResult.salesTemplateIntents, ...responseResult.infoTemplateIntents],
  gates,
},
```

**constants.ts cleanup:**
Remove `NEVER_SILENCE_INTENTS` export entirely (Plan 01 deprecated it, now nothing imports it since decision.ts is no longer used by the pipeline).

**engine-v3.ts:**
Add `salesTrackInfo` and `responseTrackInfo` to the debugTurn if present in output. Map to existing debug structures. The DebugTurn type may need a small extension — add optional fields:
```typescript
salesTrack?: { accion?: string; reason: string; enterCaptura?: boolean }
responseTrack?: { salesIntents: string[]; infoIntents: string[]; totalMessages: number }
```
Check `src/lib/sandbox/types.ts` for the DebugTurn type and add these optional fields there.

**DO NOT modify engine-adapter.ts** (production). DO NOT modify comprehension.ts, state.ts, phase.ts, guards.ts, transitions.ts.
  </action>
  <verify>
1. `npx tsc --noEmit` passes
2. Run dev server: `npm run dev` — no build errors
3. Open sandbox at localhost:3020/sandbox, select Somnio v3 agent
4. Send "2" after promos are shown — should trigger mostrar_confirmacion (THE BUG FIX)
5. Send "cuanto cuesta?" during captura — should get price template
6. Send "ok" during captura — should produce silence (no response)
  </verify>
  <done>
- Pipeline uses resolveSalesTrack + resolveResponseTrack (not decide + composeResponse)
- No premature silent cut from ingest
- Guards run before sales track
- NEVER_SILENCE_INTENTS fully removed
- V3AgentOutput still backward compatible
- engine-v3.ts passes new debug info through
  </done>
</task>

<task type="auto">
  <name>Task 2: Update debug panel for two-track visibility</name>
  <files>
    src/app/(dashboard)/sandbox/components/debug-panel/debug-v3.tsx
  </files>
  <action>
Update the PipelineSection in debug-v3.tsx to show the new two-track flow.

**Pipeline steps update:**
Replace the current C4→C5→C6→C7 pipeline visualization with:
- C2: Comprehension (unchanged)
- C3: State Merge (unchanged)
- C5: Gates (unchanged)
- Guards: Show guard result (blocked/passed)
- C4: Ingest (show system event if any, always 'respond')
- Sales Track: Show `salesTrackInfo` — accion (or "sin accion"), reason, enterCaptura flag
- Response Track: Show `responseTrackInfo` — sales intents, info intents, total messages
- Result: Show final output (messages count, silence, order)

**For the Sales Track step:**
- If `accion` present: show green badge with accion name
- If no accion: show gray badge "sin accion"
- Show `reason` as subtitle text
- Show `enterCaptura` flag if true/false

**For the Response Track step:**
- Show sales template intents as CORE badges
- Show info template intents as COMP badges
- Show total message count
- If 0 messages: show "Silencio natural" label

**Access the data:**
Read from `debugTurn.salesTrack` and `debugTurn.responseTrack` (added by engine-v3.ts in Task 1). Gracefully handle undefined (older sessions won't have these fields).

**Keep existing sections working** — Estado, Config, Tokens tabs should remain unchanged. Only update Pipeline tab content.
  </action>
  <verify>
1. `npx tsc --noEmit` passes
2. Open sandbox, run a few test messages, verify debug panel shows:
   - Sales Track step with accion info
   - Response Track step with template sources
   - No broken UI when viewing older sessions (graceful undefined handling)
  </verify>
  <done>
- Debug panel Pipeline tab shows Sales Track + Response Track as distinct steps
- Sales track shows accion, reason, enterCaptura
- Response track shows sales intents, info intents, message count
- Backward compatible with older debug sessions (graceful undefined)
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Two-track decision engine replacing the linear pipeline with premature silent cut.
The core bug (message "2" in captura mode being silenced instead of triggering mostrar_confirmacion) should now be fixed.
  </what-built>
  <how-to-verify>
Test these scenarios in sandbox (localhost:3020/sandbox) with Somnio v3 agent:

1. **THE BUG FIX — "2" after promos in captura:**
   - Start a conversation, provide some data to enter captura mode
   - Once promos are shown, send "2"
   - EXPECTED: Bot shows pack 2x confirmation (resumen_2x template)
   - BEFORE: Bot was silent (premature ingest cut)

2. **Informational during captura — "cuanto cuesta?":**
   - While in captura mode (enCapturaSilenciosa=true), send "cuanto cuesta?"
   - EXPECTED: Bot responds with price template, captura continues
   - Check debug panel: Response Track should show infoIntents=['precio']

3. **Natural silence — "ok" in captura:**
   - While in captura mode, send "ok"
   - EXPECTED: No response (natural silence — no sales action + ack not informational)
   - Check debug panel: Sales Track shows "sin accion", Response Track shows 0 messages

4. **System event — timer expired:**
   - Use forceIntent to simulate timer_expired
   - EXPECTED: Appropriate transition fires (e.g., L3 -> crear_orden)

5. **Guards still work — escape intent:**
   - Send "quiero hablar con alguien" (asesor intent)
   - EXPECTED: Handoff triggers, same as before

6. **Debug panel:**
   - Verify Sales Track and Response Track are visible as pipeline steps
   - Verify older session turns (if any) don't break the panel
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues found</resume-signal>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. The "2" in captura mode bug is fixed — seleccion_pack reaches sales track
3. Informational intents work independently of sales flow
4. Natural silence replaces explicit silence decisions
5. Guards (R0, R1) still function correctly
6. Timer events still trigger correct transitions
7. V3AgentOutput interface backward compatible (engine-adapter.ts unchanged)
8. Debug panel shows two-track info without breaking existing tabs
</verification>

<success_criteria>
- The premature silence cut bug is fixed
- Pipeline flows: C2 -> C3 -> C5 -> Guards -> Ingest -> Sales Track -> Response Track
- NEVER_SILENCE_INTENTS is fully removed from codebase
- decision.ts and response.ts are no longer imported by the pipeline (can be deleted in future cleanup)
- Debug panel provides visibility into both tracks
- All 8 scenarios from CONTEXT.md produce correct behavior
</success_criteria>

<output>
After completion, create `.planning/standalone/v3-two-track-decision/tt-02-SUMMARY.md`
</output>
