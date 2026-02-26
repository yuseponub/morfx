# Debug Panel v4.0 (Standalone) - Research

**Researched:** 2026-02-25
**Domain:** React debug panel UI + adapter data pipeline (no external libraries, internal tooling)
**Confidence:** HIGH

## Summary

This phase is entirely internal tooling — no new external libraries, no new patterns to discover. The work is extending an existing system (SandboxDebugAdapter + DebugTurn type + frontend tabs) with data that already exists in the agent pipeline but is not currently captured or displayed.

The research focused on: (1) understanding the exact data flow from agent to debug panel, (2) mapping every insertion point in the UnifiedEngine where new record calls must be placed, (3) cataloging the existing UI patterns to ensure consistency, and (4) identifying the breaking changes (tab ID rename, default tabs, timer controls relocation).

**Primary recommendation:** Work in three layers bottom-up: types + adapter first (data pipeline), then engine instrumentation (record calls), then frontend tabs. Each layer is independently testable. The DebugAdapter interface in `engine/types.ts` must be extended, and the ProductionDebugAdapter must add no-op stubs for every new method.

## Standard Stack

No new libraries needed. This phase uses only what's already installed.

### Core (Already in Project)
| Library | Purpose | Used In |
|---------|---------|---------|
| React 19 | Tab components | All debug panel tabs |
| Tailwind CSS | Styling | All components |
| shadcn/ui (Badge, Progress, Switch, Slider, ToggleGroup, Table, ScrollArea) | UI primitives | Existing tabs |
| lucide-react | Icons | All tabs |
| @dnd-kit/core + @dnd-kit/sortable | Tab bar drag/reorder | tab-bar.tsx |
| @uiw/react-json-view | JSON editor | state-tab.tsx |
| date-fns | Timestamp formatting | intent-tab.tsx, ingest-tab.tsx, tokens-tab.tsx |
| next/dynamic | SSR-safe split panel | sandbox-layout.tsx |

### No New Dependencies Required

The scroll-area component (`src/components/ui/scroll-area.tsx`) already exists and can be used for the horizontal chip scroll in Pipeline tab. All other UI needs are covered by existing components.

## Architecture Patterns

### Pattern 1: Data Pipeline (Bottom-Up)

**What:** Data flows through 4 layers:
```
SomnioAgent.processMessage() → produces agentOutput with raw data
                ↓
UnifiedEngine.processMessage() → calls adapter.debug.recordX() methods
                ↓
SandboxDebugAdapter → accumulates fields into internal state
                ↓
getDebugTurn(n) → returns DebugTurn object consumed by frontend
```

**Why it matters:** Every new piece of debug data must flow through ALL 4 layers. Missing any layer means data either isn't captured or isn't displayed.

**Current state (4 record methods):**
```typescript
// UnifiedEngine lines 464-491
this.adapters.debug.recordIntent(agentOutput.intentInfo)
this.adapters.debug.recordTools(agentOutput.tools)
this.adapters.debug.recordTokens({...})
this.adapters.debug.recordState(newState)
```

**Target state (~15 record methods):** Add ~11 new record calls at precise points in the engine's pipeline.

### Pattern 2: Adapter Interface Extension

**What:** The DebugAdapter interface in `src/lib/agents/engine/types.ts` uses `any` types for all methods. New methods must follow the same pattern.

**Current interface (lines 370-390):**
```typescript
export interface DebugAdapter {
  recordIntent(info: any): void
  recordTools(tools: any[]): void
  recordTokens(tokens: any): void
  recordState(state: any): void
  getDebugTurn(turnNumber: number): any | undefined
}
```

**CRITICAL:** Adding methods to the interface is a **breaking change** — both SandboxDebugAdapter AND ProductionDebugAdapter must implement them. ProductionDebugAdapter must add no-op stubs.

**Recommended approach:** Use optional methods (`recordClassification?(...)`) in the interface to avoid breaking the production adapter. OR add no-op stubs immediately to ProductionDebugAdapter. The second approach is cleaner — add no-op stubs simultaneously.

### Pattern 3: Tab Registration System

**What:** Tabs are defined in two places:

1. **Type:** `DebugPanelTabId` union type in `src/lib/sandbox/types.ts` (line 204)
   ```typescript
   export type DebugPanelTabId = 'tools' | 'state' | 'intent' | 'tokens' | 'ingest' | 'config'
   ```

2. **Config:** `DEFAULT_TABS` array in `debug-tabs.tsx` (lines 16-23)
   ```typescript
   const DEFAULT_TABS: DebugPanelTab[] = [
     { id: 'tools', label: 'Tools', visible: true },
     { id: 'state', label: 'Estado', visible: true },
     { id: 'intent', label: 'Intent', visible: false },
     { id: 'tokens', label: 'Tokens', visible: false },
     { id: 'ingest', label: 'Ingest', visible: true },
     { id: 'config', label: 'Config', visible: false },
   ]
   ```

3. **Icons:** `TAB_ICONS` map in `tab-bar.tsx` (lines 21-28)

4. **Routing:** `PanelContent` switch in `panel-container.tsx` (lines 38-65)

**All four locations must be updated** when adding/removing/renaming tabs.

**Changes needed:**
- Remove: `'intent'` from DebugPanelTabId
- Add: `'pipeline' | 'classify' | 'bloques'`
- Update DEFAULT_TABS: Pipeline, Classify, Bloques visible by default; Ingest, Estado, Tools, Tokens, Config hidden
- Update TAB_ICONS with new icons
- Update PanelContent with new case statements

### Pattern 4: Props Threading

**What:** All tab data flows through props from `sandbox-layout.tsx` → `DebugTabs` → `PanelContainer` → individual tabs.

The `DebugTabs` component receives `debugTurns: DebugTurn[]` which contains ALL debug data. Individual tabs read from this array.

**For new tabs:** No new props needed at the layout level — the new fields are inside `DebugTurn` which is already passed down. The tabs just need to destructure the new fields from `debugTurns[n]`.

**Exception:** Timer controls moving from Ingest to Config require no new props threading — the timer props are already passed to PanelContainer and just need routing to ConfigTab instead of IngestTab.

### Pattern 5: Expandable Sections (for Pipeline tab)

**What:** The tools-tab.tsx already implements an expand/collapse pattern:
```tsx
function ToolExecutionItem({ tool }: { tool: ToolExecution }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown/> : <ChevronRight/>}
        {/* summary line */}
      </button>
      {expanded && <div>{/* detail content */}</div>}
    </div>
  )
}
```

This pattern should be reused for the Pipeline tab's 11 expandable steps.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Horizontal scroll for turn chips | Custom scroll with buttons | `<ScrollArea orientation="horizontal">` from shadcn | Already in project, handles overflow correctly |
| Confidence color mapping | New function | Existing `getConfidenceColor()` from `intent-tab.tsx` | Shared utility, extract to shared module |
| JSON tree view | Custom component | Existing `@uiw/react-json-view` | Already used in state-tab.tsx |
| Table layouts | Custom divs | `<Table>` from `src/components/ui/table.tsx` | Already in project, consistent styling |
| Expand/collapse sections | Custom state | Reuse pattern from tools-tab.tsx | Consistency |

## Common Pitfalls

### Pitfall 1: DebugAdapter Interface Breaking Change
**What goes wrong:** Adding required methods to `DebugAdapter` breaks `ProductionDebugAdapter` compilation.
**Why it happens:** Both sandbox and production implement the same interface.
**How to avoid:** Add every new method to BOTH adapters simultaneously. ProductionDebugAdapter gets no-op stubs. Do this FIRST before anything else.
**Warning signs:** TypeScript compilation errors in production adapter file.

### Pitfall 2: Recording Data at Wrong Pipeline Point
**What goes wrong:** Debug data captures state BEFORE the engine modifies it, or AFTER it's been consumed.
**Why it happens:** The UnifiedEngine pipeline has a specific order. Recording classification after the handoff early-return means it's never recorded.
**How to avoid:** Map each record call to the exact line in `unified-engine.ts` where the data first becomes available. See "Insertion Points Map" below.
**Warning signs:** Debug panel shows no data for certain scenarios (e.g., HANDOFF turns show no classification).

### Pitfall 3: SomnioAgent Early Returns Lose Data
**What goes wrong:** When SomnioAgent returns early (SILENCIOSO, HANDOFF, ofi-inter Route 1), the engine's `recordX` calls at line 464+ never execute because they're after the agent call but the early return happens INSIDE the agent.
**Why it happens:** The current architecture records debug info AFTER `processMessage()` returns, but all pipeline data is inside the agentOutput.
**How to avoid:** The agentOutput already includes `intentInfo`, `timerSignals`, etc. The new data (classification, ofiInter, ingestDetails) must also be RETURNED from `SomnioAgent.processMessage()` in the `SomnioAgentOutput` type. The engine then passes it to the debug adapter. This is the critical architectural insight — debug data flows through the agent output, not via separate channels.
**Recommendation:** Extend `SomnioAgentOutput` with new optional fields for all the debug data (classification, ofiInter, ingestDetails, etc.), and have the engine pass them to the debug adapter after `processMessage()` returns.

### Pitfall 4: Tab ID Type Mismatch
**What goes wrong:** Changing `DebugPanelTabId` union type but forgetting one of the 4 locations that uses it.
**Why it happens:** Tab IDs are referenced in: types.ts, debug-tabs.tsx, tab-bar.tsx, panel-container.tsx.
**How to avoid:** Change all 4 files in the same task/commit. TypeScript will catch most mismatches but the `TAB_ICONS` map uses `Record<DebugPanelTabId, ...>` which will error on missing keys.
**Warning signs:** TypeScript errors about missing keys in Record types.

### Pitfall 5: Block Composition Data Not Available in Sandbox
**What goes wrong:** Block composition runs in the engine (unified-engine.ts lines 257-419), not in the agent. The debug adapter needs data from both the agent AND the engine.
**Why it happens:** Block composition, no-repetition filter, and pre-send check all happen AFTER `SomnioAgent.processMessage()` returns, inside the engine's messaging pipeline.
**How to avoid:** Record block composition and no-rep data in the engine, right after they execute, using the debug adapter's new methods. The engine already has access to the adapter.
**Concrete insertion points:**
- `composeBlock()` result at line ~287: record blockComposition
- `noRepFilter.filterBlock()` result at line ~313: record noRepetition
- `sendResult` at line ~353: record preSendCheck

### Pitfall 6: Timer Controls Migration Breaking Ingest Tab
**What goes wrong:** Removing timer controls from Ingest tab breaks the component's props or leaves orphan imports.
**Why it happens:** Timer props are deeply threaded from sandbox-layout → DebugTabs → PanelContainer → IngestTab.
**How to avoid:** Keep all timer props in PanelContainer but route them to ConfigTab instead of IngestTab. Remove timer-specific props from IngestTab's interface. Keep the timer state DISPLAY (countdown badge) in Ingest — only move the CONTROLS (sliders, presets, toggle).

### Pitfall 7: Default Visible Tabs Change
**What goes wrong:** Existing sessions loaded from localStorage have the old DEFAULT_TABS and display wrong tabs.
**Why it happens:** DEFAULT_TABS is only used for initial state; loaded sessions use saved tab configuration.
**How to avoid:** Handle gracefully: if loaded session has tab IDs that don't exist (e.g., 'intent'), filter them out. If new tab IDs aren't in the saved config, add them. This is a minor UX issue, not a crash risk.

## Insertion Points Map

This maps every new debug record call to the exact location in the codebase where the data becomes available.

### Data from SomnioAgent (extend SomnioAgentOutput)

| Debug Field | Source in SomnioAgent | When Available |
|-------------|----------------------|----------------|
| `classification` | `classifyMessage()` return at somnio-agent.ts ~364 | After intent detection, every turn |
| `ofiInter.route1` | `detectOfiInterMention()` at somnio-agent.ts ~261 | Before intent detection |
| `ofiInter.route3` | City regex match at somnio-agent.ts ~287 | Before intent detection |
| `ingestDetails` | `handleIngestMode()` return at somnio-agent.ts ~222 | Only in collecting_data modes |
| `ingestDetails.implicitYes` | `checkImplicitYes()` return at somnio-agent.ts ~241 | Only outside collecting_data |
| `transitionValidation` | Inside orchestrator (TransitionValidator) | During orchestration |
| `orchestration` | `orchestrator.orchestrate()` result at somnio-agent.ts ~502 | After orchestration |
| `templateSelection` | Inside orchestrator (TemplateManager) | During orchestration |
| `disambiguationLog` | `logDisambiguation()` params at somnio-agent.ts ~401 | Only on low-confidence HANDOFF |
| `timerSignals` | Already in agentOutput | Already available |

### Data from UnifiedEngine (record in engine after agent returns)

| Debug Field | Source in UnifiedEngine | Line |
|-------------|------------------------|------|
| `blockComposition` | `composeBlock()` result | ~287 |
| `noRepetition` | `noRepFilter.filterBlock()` result | ~313 |
| `preSendCheck` | `sendResult` from messaging adapter | ~353 |
| `paraphrasing` | Need to capture from template-paraphraser | Inside no-rep pipeline (engine ~296-331) |

### Data Recording Points in UnifiedEngine

The engine's debug recording section is at lines 464-492. New record calls should be placed:

```
Line ~287: after composeBlock() → debug.recordBlockComposition()
Line ~313: after noRepFilter.filterBlock() → debug.recordNoRepetition()
Line ~353: after messaging.send() → debug.recordPreSendCheck()
Line ~464: existing recordIntent (keep)
Line ~465: existing recordTools (keep)
Line ~466: existing recordTokens (keep)
Line ~490: existing recordState (keep)

// NEW: after line 464 (alongside existing records)
debug.recordClassification(agentOutput.classification)
debug.recordOfiInter(agentOutput.ofiInter)
debug.recordIngestDetails(agentOutput.ingestDetails)
debug.recordTemplateSelection(agentOutput.templateSelection)
debug.recordTransitionValidation(agentOutput.transitionValidation)
debug.recordOrchestration(agentOutput.orchestration)
debug.recordTimerSignals(agentOutput.timerSignals)
debug.recordDisambiguationLog(agentOutput.disambiguationLog)
```

## Code Examples

### Example 1: Extending SomnioAgentOutput

```typescript
// In src/lib/agents/somnio/somnio-agent.ts
export interface SomnioAgentOutput {
  // ... existing fields ...

  // NEW: Debug-only data (captured by SandboxDebugAdapter, ignored by production)
  classification?: {
    category: 'RESPONDIBLE' | 'SILENCIOSO' | 'HANDOFF'
    reason: string
    rulesChecked: { rule1: boolean; rule1_5: boolean; rule2: boolean; rule3: boolean }
    confidenceThreshold?: number
  }
  ofiInter?: {
    route1: { detected: boolean; pattern?: string }
    route2: { detected: boolean; city?: string }
    route3: { detected: boolean; city?: string; isRemote?: boolean }
  }
  ingestDetails?: {
    classification?: 'datos' | 'pregunta' | 'mixto' | 'irrelevante'
    classificationConfidence?: number
    extractedFields?: { field: string; value: string }[]
    action?: 'silent' | 'respond' | 'complete' | 'ask_ofi_inter'
    implicitYes?: { triggered: boolean; dataFound: boolean; modeTransition?: string }
  }
  // ... etc per ARCHITECTURE.md section 8
}
```

### Example 2: Adding Record Methods to SandboxDebugAdapter

```typescript
// In src/lib/agents/engine-adapters/sandbox/debug.ts
export class SandboxDebugAdapter implements DebugAdapter {
  // ... existing fields ...
  private classificationInfo: any = undefined
  private blockCompositionInfo: any = undefined
  // ... etc ...

  recordClassification(info: any): void {
    this.classificationInfo = info
  }

  recordBlockComposition(info: any): void {
    this.blockCompositionInfo = info
  }

  // In getDebugTurn():
  getDebugTurn(turnNumber: number): any | undefined {
    return {
      turnNumber,
      // existing
      intent: this.intentInfo,
      tools: this.tools,
      tokens: this.tokenInfo ?? { turnNumber, tokensUsed: 0, models: [], timestamp: new Date().toISOString() },
      stateAfter: this.stateSnapshot,
      // NEW
      classification: this.classificationInfo,
      blockComposition: this.blockCompositionInfo,
      // ... etc ...
    }
  }

  reset(): void {
    // Reset ALL fields including new ones
    this.classificationInfo = undefined
    this.blockCompositionInfo = undefined
    // ... etc ...
  }
}
```

### Example 3: Pipeline Step Component Pattern

```tsx
// Reusable expandable step for Pipeline tab
interface PipelineStepProps {
  stepNumber: number
  name: string
  active: boolean // true = ran, false = skipped
  summary: string // one-line summary
  children?: React.ReactNode // expanded detail content
}

function PipelineStep({ stepNumber, name, active, summary, children }: PipelineStepProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden",
      !active && "opacity-40"
    )}>
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50"
        onClick={() => active && children && setExpanded(!expanded)}
        disabled={!active || !children}
      >
        <span className="text-xs text-muted-foreground w-6">{stepNumber}.</span>
        {active ? (
          <div className="h-2 w-2 rounded-full bg-green-500" />
        ) : (
          <span className="text-xs text-muted-foreground">░░</span>
        )}
        <span className="text-sm font-medium flex-1">{name}</span>
        <span className="text-xs text-muted-foreground truncate max-w-[50%]">{summary}</span>
        {active && children && (
          expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {expanded && children && (
        <div className="px-3 pb-3 border-t bg-muted/30">{children}</div>
      )}
    </div>
  )
}
```

### Example 4: Turn Chip Component

```tsx
// Horizontal chip for Pipeline tab navigation
function TurnChip({ turn, selected, onClick }: {
  turn: DebugTurn
  selected: boolean
  onClick: () => void
}) {
  const category = turn.classification?.category ?? 'RESPONDIBLE'
  const colorClass = category === 'RESPONDIBLE' ? 'border-green-500 bg-green-50'
    : category === 'SILENCIOSO' ? 'border-yellow-500 bg-yellow-50'
    : 'border-red-500 bg-red-50'

  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 px-2 py-1 text-xs rounded-full border-2 whitespace-nowrap",
        colorClass,
        selected && "ring-2 ring-primary"
      )}
    >
      T{turn.turnNumber}
      {turn.intent && ` ${turn.intent.intent}`}
      {turn.intent && ` ${turn.intent.confidence}%`}
    </button>
  )
}
```

## File Modification Inventory

### Files to CREATE (3 new tab components)
| File | Purpose |
|------|---------|
| `src/app/(dashboard)/sandbox/components/debug-panel/pipeline-tab.tsx` | Pipeline tab (turn navigation + 11 steps) |
| `src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx` | Classify tab (intent + category + ofi-inter + disambiguation) |
| `src/app/(dashboard)/sandbox/components/debug-panel/bloques-tab.tsx` | Bloques tab (templates + block + no-rep + send + paraphrase) |

### Files to MODIFY (existing)
| File | Changes |
|------|---------|
| `src/lib/sandbox/types.ts` | Extend DebugTurn with ~12 fields, update DebugPanelTabId, add new debug types |
| `src/lib/agents/engine/types.ts` | Extend DebugAdapter interface with ~11 new methods |
| `src/lib/agents/engine-adapters/sandbox/debug.ts` | Implement ~11 new record methods + extend getDebugTurn + reset |
| `src/lib/agents/engine-adapters/production/debug.ts` | Add ~11 no-op stubs |
| `src/lib/agents/somnio/somnio-agent.ts` | Extend SomnioAgentOutput with debug fields, populate them at each gate |
| `src/lib/agents/engine/unified-engine.ts` | Add ~11 new debug.recordX() calls at correct pipeline points |
| `src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx` | Update DEFAULT_TABS (new IDs, new defaults visible) |
| `src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx` | Update TAB_ICONS with new icons |
| `src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` | Add case statements for pipeline/classify/bloques, update prop routing for timer controls |
| `src/app/(dashboard)/sandbox/components/debug-panel/ingest-tab.tsx` | Remove timer controls (keep timer display), add extraction details + implicit yes + ofi-inter R2 |
| `src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx` | Add legible templates_enviados, intents_vistos timeline, pending_templates |
| `src/app/(dashboard)/sandbox/components/debug-panel/config-tab.tsx` | Add timer controls migrated from Ingest |

### Files to DELETE (1)
| File | Reason |
|------|--------|
| `src/app/(dashboard)/sandbox/components/debug-panel/intent-tab.tsx` | Replaced by classify-tab.tsx |

### Files UNCHANGED
| File | Why |
|------|-----|
| `src/app/(dashboard)/sandbox/components/debug-panel/tools-tab.tsx` | No changes per CONTEXT.md |
| `src/app/(dashboard)/sandbox/components/debug-panel/tokens-tab.tsx` | No changes per CONTEXT.md |
| `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` | No new props needed (timer props already exist, debugTurns already passed) |
| `src/lib/sandbox/ingest-timer.ts` | Timer logic unchanged, only UI location moves |

## Task Ordering Recommendation

Based on dependency analysis, the recommended task order:

1. **Types layer** (types.ts) — DebugTurn extension + DebugPanelTabId update + new debug types
2. **Adapter interface** (engine/types.ts) — Extend DebugAdapter with new methods
3. **Sandbox adapter** (sandbox/debug.ts) — Implement new record methods
4. **Production adapter** (production/debug.ts) — Add no-op stubs
5. **Agent output** (somnio-agent.ts) — Extend SomnioAgentOutput, populate debug fields
6. **Engine instrumentation** (unified-engine.ts) — Add record calls at correct points
7. **Tab infrastructure** (debug-tabs, tab-bar, panel-container) — New tab IDs + routing
8. **Pipeline tab** (new file) — Most complex new tab
9. **Classify tab** (new file) — Replaces Intent
10. **Bloques tab** (new file) — Template/block visibility
11. **Ingest tab update** — Remove timers, add extraction details
12. **Estado tab update** — Add legible state views
13. **Config tab update** — Add timer controls from Ingest
14. **Delete intent-tab.tsx** — After Classify is working
15. **Verify** — Test all scenarios in sandbox

Tasks 1-6 are "data pipeline" (backend). Tasks 7-14 are "frontend." The pipeline must be complete before frontend can display real data.

## Open Questions

### 1. SomnioAgentOutput Extension vs Separate Channel
**What we know:** Debug data from the agent currently flows through SomnioAgentOutput fields (intentInfo, timerSignals). New data (classification, ofiInter, etc.) should follow the same pattern.
**What's unclear:** For data produced inside the orchestrator (templateSelection, transitionValidation), should we extend the orchestrator's output type too, or reconstruct the data in SomnioAgent from the orchestrator result?
**Recommendation:** Extend `SomnioOrchestratorResult` to include `templateSelection` and `transitionValidation` data, then thread them through SomnioAgentOutput. This is cleaner than reconstructing from the result.

### 2. Paraphrasing Data Capture
**What we know:** Paraphrasing happens inside the engine's no-rep pipeline (unified-engine.ts ~296-331). Currently the paraphrased content replaces the original in-place and is not tracked.
**What's unclear:** How to capture original vs paraphrased without modifying the template-paraphraser module itself.
**Recommendation:** The paraphraser is called inside the engine during template processing. Add tracking in the engine code that saves {templateId, original, paraphrased} for each paraphrased template, then pass to debug adapter. Low priority — paraphrasing only fires for repeated intents with USE_NO_REPETITION=true.

### 3. SavedSandboxSession Backward Compatibility
**What we know:** `SavedSandboxSession` stores `debugTurns: DebugTurn[]` in localStorage. New DebugTurn fields will be `undefined` in old saved sessions.
**What's unclear:** Whether old sessions will crash the new tabs.
**Recommendation:** All new DebugTurn fields are optional (`?:`). New tabs must handle undefined gracefully with "No data" empty states. This is already the pattern in intent-tab.tsx (filters turns that have intent info).

## Sources

### Primary (HIGH confidence)
- Codebase inspection: All 20+ files read directly, line-by-line analysis
- ARCHITECTURE.md: 673-line reference document specific to this phase
- CONTEXT.md: User decisions from discuss phase

### Secondary (MEDIUM confidence)
- None needed — this is internal tooling with no external dependencies

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all existing
- Architecture: HIGH — code read line-by-line, exact insertion points mapped
- Pitfalls: HIGH — identified from actual code analysis (early returns, breaking interface, 4-location tab registration)

**Research date:** 2026-02-25
**Valid until:** Indefinite (internal architecture, no external dependency versioning)
