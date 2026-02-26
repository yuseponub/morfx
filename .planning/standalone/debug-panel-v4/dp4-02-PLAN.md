---
phase: standalone/debug-panel-v4
plan: 02
type: execute
wave: 2
depends_on: [dp4-01]
files_modified:
  - src/lib/agents/engine/unified-engine.ts
autonomous: true

must_haves:
  truths:
    - "Engine records classification data from agentOutput after processMessage returns"
    - "Engine records ofiInter, ingestDetails, templateSelection, transitionValidation, orchestration, disambiguationLog, timerSignals from agentOutput"
    - "Engine records blockComposition after composeBlock() in the block composition pipeline"
    - "Engine records noRepetition after noRepFilter.filterBlock() in the no-rep pipeline"
    - "Engine records preSendCheck after messaging.send() returns"
    - "All record calls are safe (guarded by undefined checks, no crashes on missing data)"
  artifacts:
    - path: "src/lib/agents/engine/unified-engine.ts"
      provides: "~11 new debug.recordX() calls at correct pipeline points"
      contains: "recordClassification"
  key_links:
    - from: "src/lib/agents/engine/unified-engine.ts"
      to: "src/lib/agents/engine-adapters/sandbox/debug.ts"
      via: "this.adapters.debug.recordX() calls"
      pattern: "this\\.adapters\\.debug\\.record"
---

<objective>
Add debug record calls at the correct points in UnifiedEngine's pipeline so all v4.0 agent data is captured by the SandboxDebugAdapter.

Purpose: Without engine instrumentation, the types and adapters from Plan 01 are empty shells. This plan wires the data flow from agent output and engine pipeline events into the debug adapter.
Output: unified-engine.ts has ~11 new record calls at precise pipeline points.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/debug-panel-v4/ARCHITECTURE.md
@.planning/standalone/debug-panel-v4/RESEARCH.md
@.planning/standalone/debug-panel-v4/dp4-01-SUMMARY.md
@src/lib/agents/engine/unified-engine.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add agent-output record calls after existing debug section</name>
  <files>src/lib/agents/engine/unified-engine.ts</files>
  <action>
  In `unified-engine.ts`, find the existing debug recording section (around line 464-490) where these calls exist:

  ```typescript
  // 4e. Debug: record all info
  this.adapters.debug.recordIntent(agentOutput.intentInfo)
  this.adapters.debug.recordTools(agentOutput.tools as unknown[])
  this.adapters.debug.recordTokens({...})
  ```

  **AFTER the existing recordTokens call**, add these new record calls for data that comes from the agent output:

  ```typescript
  // Debug Panel v4.0: record agent pipeline data
  if (agentOutput.classification) {
    this.adapters.debug.recordClassification(agentOutput.classification)
  }
  if (agentOutput.ofiInter) {
    this.adapters.debug.recordOfiInter(agentOutput.ofiInter)
  }
  if (agentOutput.ingestDetails) {
    this.adapters.debug.recordIngestDetails(agentOutput.ingestDetails)
  }
  if (agentOutput.templateSelection) {
    this.adapters.debug.recordTemplateSelection(agentOutput.templateSelection)
  }
  if (agentOutput.transitionValidation) {
    this.adapters.debug.recordTransitionValidation(agentOutput.transitionValidation)
  }
  if (agentOutput.orchestration) {
    this.adapters.debug.recordOrchestration(agentOutput.orchestration)
  }
  if (agentOutput.disambiguationLog) {
    this.adapters.debug.recordDisambiguationLog(agentOutput.disambiguationLog)
  }
  // Timer signals always present (may be empty array)
  this.adapters.debug.recordTimerSignals(agentOutput.timerSignals ?? [])
  ```

  **Guard every call with an `if` check** so production (where these fields are undefined) doesn't crash. Timer signals use `?? []` fallback since the adapter expects an array.
  </action>
  <verify>Search for `recordClassification` in unified-engine.ts — should find exactly 1 occurrence. Count total `this.adapters.debug.record` calls — should be ~12 after this task (4 existing + 8 new from agentOutput). Task 2 will add 3 more pipeline-event calls for a total of ~15.</verify>
  <done>8 new record calls for agent-sourced debug data are placed after existing debug section, all guarded by undefined checks.</done>
</task>

<task type="auto">
  <name>Task 2: Add pipeline-event record calls in block composition section</name>
  <files>src/lib/agents/engine/unified-engine.ts</files>
  <action>
  Three pieces of debug data come from the engine's own pipeline (NOT from agentOutput):
  - Block composition result (after composeBlock())
  - No-repetition filter result (after noRepFilter.filterBlock())
  - Pre-send check result (after messaging.send())

  **A. Record blockComposition** — After `composeBlock()` call (around line ~287 where `const composed = composeBlock(newByIntent, pending)`), add:

  ```typescript
  // Debug Panel v4.0: record block composition
  this.adapters.debug.recordBlockComposition({
    newTemplates: prioritizedNew.map(t => ({ id: t.templateId, intent: t.intent, priority: t.priority })),
    pendingFromPrev: pending.map(t => ({ id: t.templateId, priority: t.priority })),
    composedBlock: composed.block.map(t => ({ id: t.templateId, name: t.content?.substring(0, 50) ?? t.templateId, priority: t.priority, status: 'sent' as const })),
    overflow: { pending: composed.pending.length, dropped: composed.dropped.length },
  })
  ```

  Note: The `status` field will be updated to 'pending'/'dropped' for overflow items. For the initial recording, mark block items as 'sent' — the preSendCheck record will capture actual send status later. Alternatively, build a complete picture:

  ```typescript
  this.adapters.debug.recordBlockComposition({
    newTemplates: prioritizedNew.map(t => ({ id: t.templateId, intent: t.intent, priority: t.priority })),
    pendingFromPrev: pending.map(t => ({ id: t.templateId, priority: t.priority })),
    composedBlock: [
      ...composed.block.map(t => ({ id: t.templateId, name: t.content?.substring(0, 50) ?? t.templateId, priority: t.priority, status: 'sent' as const })),
      ...composed.pending.map(t => ({ id: t.templateId, name: t.content?.substring(0, 50) ?? t.templateId, priority: t.priority, status: 'pending' as const })),
      ...composed.dropped.map(t => ({ id: t.templateId, name: t.content?.substring(0, 50) ?? t.templateId, priority: t.priority, status: 'dropped' as const })),
    ],
    overflow: { pending: composed.pending.length, dropped: composed.dropped.length },
  })
  ```

  **B. Record noRepetition** — After `noRepFilter.filterBlock()` returns (inside the `if (process.env.USE_NO_REPETITION === 'true')` block, after `filterResult` is available), add:

  ```typescript
  // Debug Panel v4.0: record no-repetition filter
  this.adapters.debug.recordNoRepetition({
    enabled: true,
    perTemplate: filterResult.surviving.map(t => ({
      templateId: t.templateId,
      templateName: t.content?.substring(0, 50) ?? t.templateId,
      level1: 'pass' as const,
      level2: null,
      level3: null,
      result: 'sent' as const,
    })).concat(filterResult.filtered.map(f => ({
      templateId: f.templateId,
      templateName: f.templateId,
      level1: f.level === 1 ? 'filtered' as const : 'pass' as const,
      level2: f.level === 2 ? 'NO_ENVIAR' as const : (f.level === 3 ? 'PARCIAL' as const : null),
      level3: f.level === 3 ? 'NO_ENVIAR' as const : null,
      result: 'filtered' as const,
      filteredAtLevel: f.level as 1 | 2 | 3,
    }))),
    summary: { surviving: filterResult.surviving.length, filtered: filterResult.filtered.length },
  })
  ```

  Also, after the `if` block for USE_NO_REPETITION, if the feature is disabled, record:
  ```typescript
  else {
    // No-rep disabled — record that fact
    this.adapters.debug.recordNoRepetition({ enabled: false, perTemplate: [], summary: { surviving: 0, filtered: 0 } })
  }
  ```

  Wait — the else here needs care. The current code doesn't have an else. The no-rep record should go in both paths. Place the "disabled" recording inside an `else` block that wraps `// No-rep not enabled, filteredBlock stays as composed.block`. Actually, look at the existing code flow:

  After `if (process.env.USE_NO_REPETITION === 'true') { ... }` there's no explicit else. Add one:
  ```typescript
  } else {
    this.adapters.debug.recordNoRepetition({ enabled: false, perTemplate: [], summary: { surviving: 0, filtered: 0 } })
  }
  ```

  **C. Record preSendCheck** — After `this.adapters.messaging.send()` returns `sendResult`, add:

  ```typescript
  // Debug Panel v4.0: record pre-send check results
  this.adapters.debug.recordPreSendCheck({
    perTemplate: filteredBlock.map((_, idx) => ({
      index: idx,
      checkResult: (idx < sendResult.messagesSent) ? 'ok' as const : 'interrupted' as const,
      newMessageFound: (idx >= sendResult.messagesSent && sendResult.interrupted) ? true : undefined,
    })),
    interrupted: sendResult.interrupted ?? false,
    pendingSaved: sendResult.interrupted ? (filteredBlock.length - sendResult.messagesSent) : 0,
  })
  ```

  Place this after `messagesSent = sendResult.messagesSent` and before the sent-content tracking.

  **IMPORTANT:** All three recordings must be inside the `if (useBlockComposition)` block since they only apply to the block composition pipeline. When `useBlockComposition` is false (sandbox direct send, forceIntent), these fields remain undefined in the debug adapter — which is correct.
  </action>
  <verify>Run `npx tsc --noEmit`. Search for `recordBlockComposition` in unified-engine.ts — should find exactly 1 call. Search for `recordNoRepetition` — should find 2 calls (enabled path + disabled path). Search for `recordPreSendCheck` — should find 1 call.</verify>
  <done>3 pipeline-event record calls placed at correct points in the block composition pipeline. Block composition recorded after composeBlock(), no-rep recorded after filterBlock() (and when disabled), pre-send recorded after messaging.send(). All guarded by pipeline flow (useBlockComposition).</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` compiles without errors
2. Total `this.adapters.debug.record` calls in unified-engine.ts: ~15 (4 existing + 11 new)
3. Agent-sourced data (classification, ofiInter, etc.) recorded at line ~470+ after existing debug section
4. Pipeline-sourced data (blockComposition, noRepetition, preSendCheck) recorded inside useBlockComposition block
5. All record calls guarded by undefined checks or try/catch — no crashes on missing data
</verification>

<success_criteria>
The complete data pipeline is wired: agent produces debug data (Plan 01) -> engine records it via adapter (this plan) -> adapter stores it in DebugTurn (Plan 01). Frontend tabs (Plans 03-05) can now read all data from debugTurns.
</success_criteria>

<output>
After completion, create `.planning/standalone/debug-panel-v4/dp4-02-SUMMARY.md`
</output>
