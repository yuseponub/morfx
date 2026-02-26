---
phase: standalone/debug-panel-v4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/sandbox/types.ts
  - src/lib/agents/engine/types.ts
  - src/lib/agents/engine-adapters/sandbox/debug.ts
  - src/lib/agents/engine-adapters/production/debug.ts
  - src/lib/agents/somnio/somnio-agent.ts
autonomous: true

must_haves:
  truths:
    - "DebugTurn type has 11 new optional fields for all v4.0 agent features (paraphrasing deferred)"
    - "DebugAdapter interface has ~11 new record methods"
    - "SandboxDebugAdapter implements all new record methods and includes them in getDebugTurn()"
    - "ProductionDebugAdapter has no-op stubs for all new methods"
    - "SomnioAgentOutput has new optional debug fields populated from agent pipeline"
    - "TypeScript compilation succeeds with no errors"
  artifacts:
    - path: "src/lib/sandbox/types.ts"
      provides: "Extended DebugTurn with classification, blockComposition, noRepetition, ofiInter, preSendCheck, timerSignals, templateSelection, transitionValidation, orchestration, ingestDetails, disambiguationLog (paraphrasing deferred — no data pipeline yet)"
      contains: "DebugPanelTabId.*pipeline.*classify.*bloques"
    - path: "src/lib/agents/engine/types.ts"
      provides: "Extended DebugAdapter interface with 11 new record methods"
      contains: "recordClassification"
    - path: "src/lib/agents/engine-adapters/sandbox/debug.ts"
      provides: "Full implementation of all new record methods"
      contains: "recordBlockComposition"
    - path: "src/lib/agents/engine-adapters/production/debug.ts"
      provides: "No-op stubs for all new record methods"
      contains: "recordClassification"
    - path: "src/lib/agents/somnio/somnio-agent.ts"
      provides: "SomnioAgentOutput extended with debug-only fields, populated at each gate"
      contains: "classification.*category"
  key_links:
    - from: "src/lib/agents/engine/types.ts"
      to: "src/lib/agents/engine-adapters/sandbox/debug.ts"
      via: "implements DebugAdapter"
      pattern: "class SandboxDebugAdapter implements DebugAdapter"
    - from: "src/lib/agents/engine/types.ts"
      to: "src/lib/agents/engine-adapters/production/debug.ts"
      via: "implements DebugAdapter"
      pattern: "class ProductionDebugAdapter implements DebugAdapter"
    - from: "src/lib/sandbox/types.ts"
      to: "src/lib/agents/engine-adapters/sandbox/debug.ts"
      via: "DebugTurn fields match adapter return"
---

<objective>
Extend the complete data pipeline foundation for Debug Panel v4.0: DebugTurn type, DebugAdapter interface, both adapter implementations, DebugPanelTabId union, and SomnioAgentOutput debug fields.

Purpose: The data pipeline must exist before the engine can record data and before frontend tabs can display it. This is the foundation all other plans depend on.
Output: Extended types, both adapters updated, agent output extended with debug fields populated at each pipeline step.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/debug-panel-v4/ARCHITECTURE.md
@.planning/standalone/debug-panel-v4/RESEARCH.md
@src/lib/sandbox/types.ts
@src/lib/agents/engine/types.ts
@src/lib/agents/engine-adapters/sandbox/debug.ts
@src/lib/agents/engine-adapters/production/debug.ts
@src/lib/agents/somnio/somnio-agent.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend DebugTurn type + DebugPanelTabId + new debug sub-types</name>
  <files>src/lib/sandbox/types.ts</files>
  <action>
  In `src/lib/sandbox/types.ts`:

  1. **Update DebugPanelTabId** — Replace:
     ```typescript
     export type DebugPanelTabId = 'tools' | 'state' | 'intent' | 'tokens' | 'ingest' | 'config'
     ```
     With:
     ```typescript
     export type DebugPanelTabId = 'pipeline' | 'classify' | 'bloques' | 'tools' | 'state' | 'tokens' | 'ingest' | 'config'
     ```
     Note: 'intent' is REMOVED, 3 new IDs added. Order reflects visual tab order (defaults first).

  2. **Add new debug sub-types** BEFORE the DebugTurn interface. Add these types in a new section "Debug Panel v4.0 Types":

     ```typescript
     // ============================================================================
     // Debug Panel v4.0 Types (standalone/debug-panel-v4)
     // ============================================================================

     /** Message category classification result */
     export interface DebugClassification {
       category: 'RESPONDIBLE' | 'SILENCIOSO' | 'HANDOFF'
       reason: string
       rulesChecked: { rule1: boolean; rule1_5: boolean; rule2: boolean; rule3: boolean }
       confidenceThreshold?: number
     }

     /** Block composition debug info */
     export interface DebugBlockComposition {
       newTemplates: { id: string; intent: string; priority: string }[]
       pendingFromPrev: { id: string; priority: string }[]
       composedBlock: { id: string; name: string; priority: string; status: 'sent' | 'dropped' | 'pending' }[]
       overflow: { pending: number; dropped: number }
     }

     /** No-repetition filter debug info */
     export interface DebugNoRepetition {
       enabled: boolean
       perTemplate: {
         templateId: string
         templateName: string
         level1: 'pass' | 'filtered' | null
         level2: 'ENVIAR' | 'NO_ENVIAR' | 'PARCIAL' | null
         level3: 'ENVIAR' | 'NO_ENVIAR' | null
         result: 'sent' | 'filtered'
         filteredAtLevel?: 1 | 2 | 3
       }[]
       summary: { surviving: number; filtered: number }
     }

     /** Ofi Inter detection debug info */
     export interface DebugOfiInter {
       route1: { detected: boolean; pattern?: string }
       route2: { detected: boolean; city?: string }
       route3: { detected: boolean; city?: string; isRemote?: boolean }
     }

     /** Pre-send check debug info */
     export interface DebugPreSendCheck {
       perTemplate: { index: number; checkResult: 'ok' | 'interrupted'; newMessageFound?: boolean }[]
       interrupted: boolean
       pendingSaved: number
     }

     /** Template selection debug info */
     export interface DebugTemplateSelection {
       intent: string
       visitType: 'primera_vez' | 'siguientes'
       loadedCount: number
       alreadySentCount: number
       selectedCount: number
       isRepeated: boolean
       cappedByNoRep: boolean
     }

     /** Transition validation debug info */
     export interface DebugTransitionValidation {
       allowed: boolean
       reason?: string
       autoTrigger?: string
     }

     /** Orchestration debug info */
     export interface DebugOrchestration {
       nextMode: string
       previousMode: string
       modeChanged: boolean
       shouldCreateOrder: boolean
       templatesCount: number
     }

     /** Ingest details debug info */
     export interface DebugIngestDetails {
       classification?: 'datos' | 'pregunta' | 'mixto' | 'irrelevante'
       classificationConfidence?: number
       extractedFields?: { field: string; value: string }[]
       action?: 'silent' | 'respond' | 'complete' | 'ask_ofi_inter'
       implicitYes?: { triggered: boolean; dataFound: boolean; modeTransition?: string }
     }

     /** Disambiguation log debug info */
     export interface DebugDisambiguationLog {
       logged: boolean
       topIntents?: { intent: string; confidence: number }[]
       templatesSent?: number
       pendingCount?: number
       historyTurns?: number
     }

     // NOTE: DebugParaphrasing DEFERRED — no recordParaphrasing() method or
     // engine capture exists yet. Will be added when paraphrasing feature is
     // instrumented in the agent pipeline.
     ```

  3. **Extend DebugTurn** — Add 12 new optional fields to the existing interface:
     ```typescript
     export interface DebugTurn {
       turnNumber: number
       intent?: IntentInfo
       tools: ToolExecution[]
       tokens: TokenInfo
       stateAfter: SandboxState
       // Debug Panel v4.0 fields
       classification?: DebugClassification
       blockComposition?: DebugBlockComposition
       noRepetition?: DebugNoRepetition
       ofiInter?: DebugOfiInter
       preSendCheck?: DebugPreSendCheck
       timerSignals?: { type: 'start' | 'reevaluate' | 'cancel'; reason?: string }[]
       templateSelection?: DebugTemplateSelection
       transitionValidation?: DebugTransitionValidation
       orchestration?: DebugOrchestration
       ingestDetails?: DebugIngestDetails
       disambiguationLog?: DebugDisambiguationLog
       // paraphrasing?: DebugParaphrasing — DEFERRED (no data pipeline)
     }
     ```

  All new fields are optional (`?:`) so existing sessions load without crashing (backward compatible).
  </action>
  <verify>Run `npx tsc --noEmit` — should compile with no errors. The only expected issue may be from tab-bar.tsx or panel-container.tsx referencing old 'intent' tab ID — this is expected and will be fixed in Plan 03.</verify>
  <done>DebugTurn has 11 new optional fields (paraphrasing deferred). DebugPanelTabId includes pipeline, classify, bloques (no intent). 11 new debug sub-types exported.</done>
</task>

<task type="auto">
  <name>Task 2: Extend DebugAdapter interface + both adapter implementations</name>
  <files>src/lib/agents/engine/types.ts, src/lib/agents/engine-adapters/sandbox/debug.ts, src/lib/agents/engine-adapters/production/debug.ts</files>
  <action>
  **CRITICAL:** All three files MUST be updated together. Adding methods to the interface without implementing them in both adapters breaks TypeScript compilation.

  **A. Extend DebugAdapter interface** in `src/lib/agents/engine/types.ts` (after the existing 4 methods, before getDebugTurn):

  Add these 11 new methods. Follow the existing pattern (eslint-disable for `any`, JSDoc comment):

  ```typescript
  /** Record message category classification (RESPONDIBLE/SILENCIOSO/HANDOFF). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordClassification(info: any): void

  /** Record block composition result (new + pending, composed block, overflow). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordBlockComposition(info: any): void

  /** Record no-repetition filter result (per-template levels, summary). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordNoRepetition(info: any): void

  /** Record ofi inter detection result (routes 1-3). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordOfiInter(info: any): void

  /** Record pre-send check result (per-template, interruption). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordPreSendCheck(info: any): void

  /** Record timer signals emitted during turn. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTimerSignals(signals: any[]): void

  /** Record template selection info (intent, visit type, counts). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTemplateSelection(info: any): void

  /** Record transition validation result. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTransitionValidation(info: any): void

  /** Record orchestration result (mode transition, order, template count). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordOrchestration(info: any): void

  /** Record ingest details (classification, extraction, implicit yes). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordIngestDetails(info: any): void

  /** Record disambiguation log info. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordDisambiguationLog(info: any): void
  ```

  **B. Implement in SandboxDebugAdapter** (`src/lib/agents/engine-adapters/sandbox/debug.ts`):

  1. Add 11 new private fields (all initialized to `undefined`):
     ```typescript
     private classificationInfo: any = undefined
     private blockCompositionInfo: any = undefined
     private noRepetitionInfo: any = undefined
     private ofiInterInfo: any = undefined
     private preSendCheckInfo: any = undefined
     private timerSignalsInfo: any[] = []
     private templateSelectionInfo: any = undefined
     private transitionValidationInfo: any = undefined
     private orchestrationInfo: any = undefined
     private ingestDetailsInfo: any = undefined
     private disambiguationLogInfo: any = undefined
     ```

  2. Add 11 record methods (same pattern as existing `recordIntent`):
     Each method simply assigns the parameter to the corresponding private field.
     For `recordTimerSignals`, use `this.timerSignalsInfo = signals`.

  3. Update `getDebugTurn()` to include all 11 new fields in the return object:
     ```typescript
     classification: this.classificationInfo,
     blockComposition: this.blockCompositionInfo,
     noRepetition: this.noRepetitionInfo,
     ofiInter: this.ofiInterInfo,
     preSendCheck: this.preSendCheckInfo,
     timerSignals: this.timerSignalsInfo.length > 0 ? this.timerSignalsInfo : undefined,
     templateSelection: this.templateSelectionInfo,
     transitionValidation: this.transitionValidationInfo,
     orchestration: this.orchestrationInfo,
     ingestDetails: this.ingestDetailsInfo,
     disambiguationLog: this.disambiguationLogInfo,
     ```

  4. Update `reset()` to reset ALL new fields:
     Set all new private fields back to `undefined` (except `timerSignalsInfo` which resets to `[]`).

  **C. Add no-op stubs in ProductionDebugAdapter** (`src/lib/agents/engine-adapters/production/debug.ts`):

  Add 11 no-op methods matching the interface. Each one has:
  - A JSDoc comment matching the interface
  - eslint-disable for any
  - Underscore-prefixed parameter name
  - Empty body (just comment `// No-op`)

  Follow the exact pattern of the existing 4 methods.
  </action>
  <verify>Run `npx tsc --noEmit` — both adapters must compile. Run `grep -c 'record' src/lib/agents/engine-adapters/sandbox/debug.ts` — should be 15 (4 existing + 11 new).</verify>
  <done>DebugAdapter interface has 15 record methods. SandboxDebugAdapter accumulates 15 data fields and returns them all in getDebugTurn(). ProductionDebugAdapter has 15 no-op methods. TypeScript compiles.</done>
</task>

<task type="auto">
  <name>Task 3: Extend SomnioAgentOutput with debug fields and populate them</name>
  <files>src/lib/agents/somnio/somnio-agent.ts</files>
  <action>
  The agent must return debug data in its output so the engine can pass it to the debug adapter. This is the critical architectural insight from RESEARCH.md: debug data flows through agentOutput, not via separate channels.

  **A. Extend SomnioAgentOutput interface** — Add these optional debug fields at the end, before the closing brace. Group them under a comment:

  ```typescript
  // ====================================================================
  // Debug Panel v4.0 fields (captured by SandboxDebugAdapter, ignored by production)
  // ====================================================================
  /** Message category classification */
  classification?: {
    category: 'RESPONDIBLE' | 'SILENCIOSO' | 'HANDOFF'
    reason: string
    rulesChecked: { rule1: boolean; rule1_5: boolean; rule2: boolean; rule3: boolean }
    confidenceThreshold?: number
  }
  /** Ofi Inter detection result (routes 1-3) */
  ofiInter?: {
    route1: { detected: boolean; pattern?: string }
    route2: { detected: boolean; city?: string }
    route3: { detected: boolean; city?: string; isRemote?: boolean }
  }
  /** Ingest details (classification, extraction, implicit yes) */
  ingestDetails?: {
    classification?: 'datos' | 'pregunta' | 'mixto' | 'irrelevante'
    classificationConfidence?: number
    extractedFields?: { field: string; value: string }[]
    action?: 'silent' | 'respond' | 'complete' | 'ask_ofi_inter'
    implicitYes?: { triggered: boolean; dataFound: boolean; modeTransition?: string }
  }
  /** Template selection info */
  templateSelection?: {
    intent: string
    visitType: 'primera_vez' | 'siguientes'
    loadedCount: number
    alreadySentCount: number
    selectedCount: number
    isRepeated: boolean
    cappedByNoRep: boolean
  }
  /** Transition validation result */
  transitionValidation?: {
    allowed: boolean
    reason?: string
    autoTrigger?: string
  }
  /** Orchestration result */
  orchestration?: {
    nextMode: string
    previousMode: string
    modeChanged: boolean
    shouldCreateOrder: boolean
    templatesCount: number
  }
  /** Disambiguation log info */
  disambiguationLog?: {
    logged: boolean
    topIntents?: { intent: string; confidence: number }[]
    templatesSent?: number
    pendingCount?: number
    historyTurns?: number
  }
  ```

  **B. Populate debug fields in processMessage()** — At each relevant point in the agent pipeline:

  1. **Classification data** — After `classifyMessage()` (or equivalent Gate 4 logic) returns the message category, add the result to the output object. Find where `classifyMessage()` is called and capture its return (category + reason + rulesChecked). Set `output.classification = { category, reason, rulesChecked }`.

  2. **Ofi Inter data** — After Route 1 and Route 3 detection blocks, capture results. Initialize `output.ofiInter = { route1: { detected: false }, route2: { detected: false }, route3: { detected: false } }` at the start of processMessage, then update each route's `detected`/`pattern`/`city`/`isRemote` as the gates execute.
     **Route 2 specifically:** Route 2 comes from IngestManager (not from gate 3). If `ingestResult.action === 'ask_ofi_inter'`, set `output.ofiInter.route2 = { detected: true, city: ingestResult.mergedData?.ciudad }`. This happens inside `handleIngestMode()` result handling.

  3. **Ingest details** — After `handleIngestMode()` or `checkImplicitYes()` returns, capture classification + extractedFields + action. Set `output.ingestDetails = { ... }`.

  4. **Orchestration data** — After `orchestrator.orchestrate()` returns, capture nextMode, previousMode, modeChanged, shouldCreateOrder, templatesCount. Set `output.orchestration = { ... }`.

  5. **Template selection** — If the orchestrator exposes template selection info (intent, visitType, loadedCount, etc.) in its result, thread it through. Otherwise, reconstruct from the orchestrator result (intent from result.intent, templates count from result.templates.length, etc.).

  6. **Transition validation** — If the orchestrator returns validation info, thread it through. Otherwise, add the validation result after calling TransitionValidator.

  7. **Disambiguation log** — At the point where `logDisambiguation()` is called (low-confidence HANDOFF), capture the params and set `output.disambiguationLog = { logged: true, topIntents, templatesSent, ... }`.

  **IMPORTANT NOTES:**
  - Every field is optional. If a gate doesn't fire (e.g., ingest skipped because not in collecting_data), the field stays undefined.
  - For early returns (SILENCIOSO, HANDOFF), make sure the classification field IS populated BEFORE the early return statement, so the engine still records it.
  - Don't modify the agent's behavior — only add data capture to the existing flow.
  - Use the existing code structure to find the right insertion points. Read the processMessage method carefully to identify where each gate's result is available.
  </action>
  <verify>Run `npx tsc --noEmit` — must compile. Search for `output.classification` in somnio-agent.ts — should find at least one assignment.</verify>
  <done>SomnioAgentOutput has 7 new optional debug fields. processMessage() populates them at the correct pipeline points. Early returns (SILENCIOSO, HANDOFF) include classification data. TypeScript compiles.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` compiles (note: tab-bar.tsx and panel-container.tsx may have errors due to removed 'intent' tab ID — this is expected and fixed in Plan 03)
2. DebugTurn in types.ts has 11 new optional fields (paraphrasing deferred)
3. DebugAdapter interface has 15 methods total (4 existing + 11 new)
4. SandboxDebugAdapter has 15 record methods, all included in getDebugTurn(), all reset in reset()
5. ProductionDebugAdapter has 15 no-op methods
6. SomnioAgentOutput has 7 new optional debug fields
7. processMessage() populates debug fields at correct pipeline points
</verification>

<success_criteria>
The complete data pipeline foundation is in place: types defined, adapters ready, agent produces debug data. The engine (Plan 02) can now call record methods, and frontend tabs (Plans 03-05) can read from DebugTurn.
</success_criteria>

<output>
After completion, create `.planning/standalone/debug-panel-v4/dp4-01-SUMMARY.md`
</output>
