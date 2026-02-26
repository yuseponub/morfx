---
phase: standalone/debug-panel-v4
plan: 04
type: execute
wave: 3
depends_on: [dp4-02, dp4-03]
files_modified:
  - src/app/(dashboard)/sandbox/components/debug-panel/pipeline-tab.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
autonomous: true

must_haves:
  truths:
    - "Pipeline tab shows horizontal turn chips with color-coded categories"
    - "Each chip shows: turn number, category color, intent name, confidence %, and flags (interrupt, repeated, ofi-inter, order)"
    - "Clicking a chip selects that turn and shows its 11 pipeline steps below"
    - "Each pipeline step is expandable (click to toggle detail inline)"
    - "Steps that didn't execute show as skipped (dimmed, no expand)"
    - "Footer shows total Claude calls + tokens for the selected turn"
    - "Horizontal scroll works for many turns"
  artifacts:
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/pipeline-tab.tsx"
      provides: "Pipeline tab with turn navigation + 11 expandable pipeline steps"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx"
      provides: "Updated PanelContent routing pipeline to PipelineTab"
      contains: "PipelineTab"
  key_links:
    - from: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx"
      to: "src/app/(dashboard)/sandbox/components/debug-panel/pipeline-tab.tsx"
      via: "import + case 'pipeline'"
      pattern: "case 'pipeline'"
---

<objective>
Create the Pipeline tab — the most complex new tab — which provides a full overview of every turn's processing pipeline with turn-chip navigation and 11 expandable steps.

Purpose: Pipeline is the primary debug tab. It answers "what happened in this turn?" without needing to open other tabs. It's the developer's main tool for understanding agent behavior.
Output: Fully functional Pipeline tab with turn chip navigation and 11 expandable pipeline steps.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/debug-panel-v4/ARCHITECTURE.md
@.planning/standalone/debug-panel-v4/CONTEXT.md
@.planning/standalone/debug-panel-v4/RESEARCH.md
@.planning/standalone/debug-panel-v4/dp4-01-SUMMARY.md
@.planning/standalone/debug-panel-v4/dp4-03-SUMMARY.md
@src/lib/sandbox/types.ts
@src/app/(dashboard)/sandbox/components/debug-panel/tools-tab.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Pipeline tab component</name>
  <files>src/app/(dashboard)/sandbox/components/debug-panel/pipeline-tab.tsx</files>
  <action>
  Create `pipeline-tab.tsx` in the debug-panel directory. This is the most complex new tab.

  **Structure:**

  ```
  ┌────────────────────────────────────────────────┐
  │ [T1 saludo 96%] [T2 precio 94%] [T3 envio 89%]│  ← Turn chips (horizontal scroll)
  ├────────────────────────────────────────────────┤
  │ 1. ░░ Ingest (skipped)                         │  ← Pipeline steps
  │ 2. ░░ Implicit Yes (skipped)                   │
  │ 3. ░░ Ofi Inter (skipped)                      │
  │ 4. 🟢 Intent Detection — precio 94%       [▼]  │
  │ 5. 🟢 Message Category — RESPONDIBLE       [▼]  │
  │ 6. 🟢 Orchestrate — conversacion→ofertas   [▼]  │
  │ 7. ░░ Block Composition (skipped)              │
  │ 8. ░░ No-Repetition (skipped)                  │
  │ 9. ░░ Send Loop (skipped)                      │
  │ 10. 🟢 Timer Signals — start               [▼]  │
  │ 11. ░░ Order Creation (skipped)                │
  ├────────────────────────────────────────────────┤
  │ 1 Claude call · 523 tokens · ~500ms            │  ← Footer
  └────────────────────────────────────────────────┘
  ```

  **A. Turn Chip Navigation:**

  Use `ScrollArea` from `@/components/ui/scroll-area` with `orientation="horizontal"` for the chip row. Each chip is a button:

  ```tsx
  function TurnChip({ turn, selected, onClick }: {
    turn: DebugTurn; selected: boolean; onClick: () => void
  }) {
    const category = turn.classification?.category ?? 'RESPONDIBLE'
    const colorClass = {
      'RESPONDIBLE': 'border-green-500 bg-green-50 dark:bg-green-950/30',
      'SILENCIOSO': 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30',
      'HANDOFF': 'border-red-500 bg-red-50 dark:bg-red-950/30',
    }[category] ?? 'border-gray-300 bg-gray-50'

    // Flags
    const flags: string[] = []
    if (turn.preSendCheck?.interrupted) flags.push('⚡')
    if (turn.templateSelection?.isRepeated) flags.push('🔄')
    if (turn.ofiInter?.route1?.detected || turn.ofiInter?.route3?.detected) flags.push('🏢')
    if (turn.orchestration?.shouldCreateOrder) flags.push('💳')

    return (
      <button
        onClick={onClick}
        className={cn(
          'shrink-0 px-2 py-1 text-xs rounded-full border-2 whitespace-nowrap transition-all',
          colorClass,
          selected && 'ring-2 ring-primary ring-offset-1'
        )}
      >
        T{turn.turnNumber}
        {turn.intent && <span className="mx-0.5">·</span>}
        {turn.intent && <span>{turn.intent.intent}</span>}
        {turn.intent && <span className="ml-0.5 opacity-70">{turn.intent.confidence}%</span>}
        {flags.length > 0 && <span className="ml-1">{flags.join('')}</span>}
      </button>
    )
  }
  ```

  State: `const [selectedTurnIdx, setSelectedTurnIdx] = useState(debugTurns.length - 1)` — default to latest turn. Update when `debugTurns.length` changes (useEffect).

  **B. Pipeline Steps:**

  Create a reusable `PipelineStep` component:

  ```tsx
  function PipelineStep({ stepNumber, name, active, summary, children }: {
    stepNumber: number; name: string; active: boolean; summary: string; children?: React.ReactNode
  }) {
    const [expanded, setExpanded] = useState(false)
    return (
      <div className={cn('border rounded-lg overflow-hidden', !active && 'opacity-40')}>
        <button
          className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
          onClick={() => active && children && setExpanded(!expanded)}
          disabled={!active || !children}
        >
          <span className="text-xs text-muted-foreground w-5">{stepNumber}.</span>
          {active ? (
            <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
          ) : (
            <span className="text-xs text-muted-foreground shrink-0">░░</span>
          )}
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground truncate flex-1 text-right">{summary}</span>
          {active && children && (
            expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
          )}
        </button>
        {expanded && children && (
          <div className="px-3 pb-3 pt-2 border-t bg-muted/20 text-xs space-y-1">
            {children}
          </div>
        )}
      </div>
    )
  }
  ```

  **C. 11 Pipeline Steps for a given turn:**

  For each step, determine `active` and `summary` from the DebugTurn data:

  1. **Ingest** — active: `turn.ingestDetails != null`, summary: `turn.ingestDetails?.action ?? 'skipped'`, detail: classification + extracted fields
  2. **Implicit Yes** — active: `turn.ingestDetails?.implicitYes != null`, summary: triggered/not, detail: data found + mode transition
  3. **Ofi Inter** — active: `turn.ofiInter != null && (turn.ofiInter.route1.detected || turn.ofiInter.route3.detected)`, summary: which route detected, detail: pattern/city
  4. **Intent Detection** — active: `turn.intent != null`, summary: `${intent} ${confidence}%`, detail: alternatives + reasoning
  5. **Message Category** — active: `turn.classification != null`, summary: category name, detail: reason + rules grid
  6. **Orchestrate** — active: `turn.orchestration != null`, summary: mode transition or "no change", detail: nextMode, templatesCount, shouldCreateOrder
  7. **Block Composition** — active: `turn.blockComposition != null`, summary: `${block.length} templates`, detail: new/pending/composed/overflow
  8. **No-Repetition** — active: `turn.noRepetition != null && turn.noRepetition.enabled`, summary: `${surviving}/${total}`, detail: per-template levels
  9. **Send Loop** — active: `turn.preSendCheck != null`, summary: `${sent}/${total} sent` + interrupted flag, detail: per-template check results
  10. **Timer Signals** — active: `(turn.timerSignals?.length ?? 0) > 0`, summary: signal types, detail: each signal with reason
  11. **Order Creation** — active: `turn.orchestration?.shouldCreateOrder === true`, summary: "created" or "skipped", detail: (minimal, just the fact)

  For skipped steps (active=false), show name with ░░ prefix and "skipped" summary.

  **D. Footer:**

  Show summary stats for the selected turn:
  ```tsx
  <div className="flex items-center gap-3 px-3 py-2 border-t text-xs text-muted-foreground">
    <span>{claudeCalls} Claude calls</span>
    <span>·</span>
    <span>{turn.tokens.tokensUsed} tokens</span>
  </div>
  ```

  Estimate Claude calls from the data: 1 for intent (always), +1 if ingestDetails has classification, +1 if ingestDetails has extractedFields, etc. Or simply count non-null LLM-related fields.

  **E. Empty state:**

  If `debugTurns.length === 0`:
  ```tsx
  <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
    Envia un mensaje para ver el pipeline
  </div>
  ```

  **Props:** `{ debugTurns: DebugTurn[] }` — same as other tabs.

  **Imports needed:**
  - `useState, useEffect` from react
  - `ChevronDown, ChevronRight` from lucide-react
  - `ScrollArea, ScrollBar` from `@/components/ui/scroll-area`
  - `Badge` from `@/components/ui/badge`
  - `cn` from `@/lib/utils`
  - `DebugTurn` from `@/lib/sandbox/types`
  </action>
  <verify>Run `npx tsc --noEmit` — should compile. The file should export PipelineTab. It should handle empty debugTurns gracefully.</verify>
  <done>Pipeline tab created with: turn chip navigation (horizontal scroll, color-coded, flagged), 11 expandable pipeline steps per turn, footer with Claude calls + tokens, empty state. Handles undefined debug fields gracefully.</done>
</task>

<task type="auto">
  <name>Task 2: Wire Pipeline tab into PanelContainer</name>
  <files>src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx</files>
  <action>
  Update panel-container.tsx to import and route to the real Pipeline tab:

  1. Add import:
     ```typescript
     import { PipelineTab } from './pipeline-tab'
     ```

  2. Replace the pipeline placeholder in PanelContent switch:
     ```tsx
     case 'pipeline':
       return <PipelineTab debugTurns={props.debugTurns} />
     ```
  </action>
  <verify>Run `npx tsc --noEmit`. Verify PipelineTab is imported and routed.</verify>
  <done>Pipeline tab wired into PanelContainer. Selecting Pipeline tab renders PipelineTab component.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` compiles without errors
2. `pipeline-tab.tsx` exists and exports PipelineTab
3. PanelContainer imports PipelineTab and routes case 'pipeline' to it
4. Turn chips render with category colors and flags
5. 11 pipeline steps render, skipped steps are dimmed
6. Expandable steps show detail on click
7. Footer shows Claude calls and token count
8. Empty state shown when no turns exist
</verification>

<success_criteria>
The Pipeline tab is the primary debug view, showing a complete overview of each turn's processing pipeline. Developers can navigate between turns via chips and drill into any step by expanding it.
</success_criteria>

<output>
After completion, create `.planning/standalone/debug-panel-v4/dp4-04-SUMMARY.md`
</output>
