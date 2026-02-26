---
phase: standalone/debug-panel-v4
plan: 05
type: execute
wave: 3
depends_on: [dp4-02, dp4-03]
files_modified:
  - src/app/(dashboard)/sandbox/components/debug-panel/bloques-tab.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/ingest-tab.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/config-tab.tsx
autonomous: true

must_haves:
  truths:
    - "Bloques tab shows template selection, block composition, no-rep filter, send loop, and paraphrasing"
    - "Ingest tab no longer has timer controls (sliders, presets, toggle)"
    - "Ingest tab shows extraction details per turn, implicit yes detection, and ofi inter Route 2"
    - "Config tab has timer controls (toggle, presets, 5 sliders) migrated from Ingest"
    - "Estado tab shows legible templates_enviados, intents_vistos timeline, and pending_templates"
    - "All tabs handle undefined/empty data gracefully"
  artifacts:
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/bloques-tab.tsx"
      provides: "Bloques tab with 5 sections: template selection, block composition, no-rep, send loop, paraphrasing"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/ingest-tab.tsx"
      provides: "Updated Ingest tab without timer controls, with extraction details + implicit yes + ofi inter R2"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/config-tab.tsx"
      provides: "Updated Config tab with timer controls from Ingest"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx"
      provides: "Updated Estado tab with legible lists + timeline"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx"
      provides: "Updated routing: Bloques to BloquesTab, timer props to Config instead of Ingest"
  key_links:
    - from: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx"
      to: "src/app/(dashboard)/sandbox/components/debug-panel/bloques-tab.tsx"
      via: "import + case 'bloques'"
      pattern: "case 'bloques'"
    - from: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx"
      to: "src/app/(dashboard)/sandbox/components/debug-panel/config-tab.tsx"
      via: "timer props routing"
      pattern: "timerState.*timerEnabled.*timerConfig"
---

<objective>
Create the Bloques tab and update the three existing tabs (Ingest, Estado, Config) with their v4.0 improvements: timer controls migration, extraction details, legible state views.

Purpose: Complete all remaining frontend work — every tab in the debug panel now has full v4.0 functionality.
Output: Bloques tab functional, Ingest simplified, Config gains timer controls, Estado gets legible views.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/debug-panel-v4/ARCHITECTURE.md
@.planning/standalone/debug-panel-v4/CONTEXT.md
@.planning/standalone/debug-panel-v4/dp4-01-SUMMARY.md
@.planning/standalone/debug-panel-v4/dp4-03-SUMMARY.md
@src/app/(dashboard)/sandbox/components/debug-panel/ingest-tab.tsx
@src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx
@src/app/(dashboard)/sandbox/components/debug-panel/config-tab.tsx
@src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
@src/lib/sandbox/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Bloques tab + wire into PanelContainer</name>
  <files>src/app/(dashboard)/sandbox/components/debug-panel/bloques-tab.tsx, src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx</files>
  <action>
  **A. Create `bloques-tab.tsx`:**

  This tab shows everything about "what gets sent and how" for the latest turn (or selected turn — use last turn with block data).

  **Props:** `{ debugTurns: DebugTurn[] }`

  **5 Sections:**

  1. **Template Selection** — from `turn.templateSelection`:
     ```
     Intent: precio | Visit: primera_vez
     Loaded: 5 | Already sent: 2 | Selected: 3
     Repeated: No | Capped by no-rep: No
     ```
     Show as a compact grid. If undefined, show "No template selection data".

  2. **Block Composition** — from `turn.blockComposition`:
     Table with columns: Template (name/id truncated), Priority (CORE/COMP/OPC badge), Status (sent/pending/dropped badge with colors).
     Above the table: "New: {n} + Pending: {n} = Block: {n}" summary.
     Overflow: "{n} pending, {n} dropped" below table.
     If undefined, show "No block composition data".

  3. **No-Repetition** — from `turn.noRepetition`:
     If `!enabled`: show badge "OFF" with muted text.
     If enabled: table per-template with columns:
     - Template (name/id)
     - L1 (pass/filtered badge)
     - L2 (ENVIAR/NO_ENVIAR/PARCIAL/- badge)
     - L3 (ENVIAR/NO_ENVIAR/- badge)
     - Result (sent green / filtered red badge)
     Summary: "X surviving, Y filtered"
     If undefined, show "No no-rep data".

  4. **Send Loop** — from `turn.preSendCheck`:
     Per template: index, check result (ok/interrupted badge), new message found flag.
     Summary: "Interrupted: yes/no, {n} pending saved".
     If undefined, show "No send data".

  5. **Paraphrasing** — from `turn.paraphrasing`:
     Only shown if data exists. For each template: side-by-side original vs paraphrased text (truncated).
     If undefined, skip section entirely (don't show empty state for this).

  **Implementation notes:**
  - Find the latest turn that has blockComposition or templateSelection data: `const relevantTurns = debugTurns.filter(t => t.blockComposition || t.templateSelection)`
  - Show the latest relevant turn by default
  - If no relevant turns, show: "Envia un mensaje con templates para ver el sistema de bloques"
  - Each section uses a small heading with icon
  - Use `Badge` for priority/status labels, `Table` from shadcn for tabular data (or simple divs if table is too heavy for the space)
  - Colors: CORE=blue, COMPLEMENTARIA=purple, OPCIONAL=gray; sent=green, filtered=red, pending=yellow, dropped=gray

  **B. Wire into PanelContainer:**

  1. Add import: `import { BloquesTab } from './bloques-tab'`
  2. Replace placeholder:
     ```tsx
     case 'bloques':
       return <BloquesTab debugTurns={props.debugTurns} />
     ```
  </action>
  <verify>Run `npx tsc --noEmit`. Verify bloques-tab.tsx exports BloquesTab. Verify PanelContainer imports and routes to it.</verify>
  <done>Bloques tab created with 5 sections (template selection, block composition, no-rep filter, send loop, paraphrasing). Wired into PanelContainer. Handles missing data gracefully.</done>
</task>

<task type="auto">
  <name>Task 2: Migrate timer controls from Ingest to Config, update Ingest with new sections</name>
  <files>src/app/(dashboard)/sandbox/components/debug-panel/ingest-tab.tsx, src/app/(dashboard)/sandbox/components/debug-panel/config-tab.tsx, src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx</files>
  <action>
  **A. Update Config tab** — Add timer controls:

  In `config-tab.tsx`:
  1. Add imports from ingest-tab.tsx: `TIMER_PRESETS`, `TIMER_LEVELS`, `TIMER_DEFAULTS` from `@/lib/sandbox/ingest-timer`, plus `Switch`, `Slider`, `ToggleGroup`, `ToggleGroupItem` from shadcn, `Zap` from lucide.
  2. Add timer-related imports to the component's type imports: `TimerState`, `TimerConfig`, `TimerPreset` from `@/lib/sandbox/types`.
  3. Expand ConfigTabProps:
     ```typescript
     interface ConfigTabProps {
       agentName: string
       responseSpeed: ResponseSpeedPreset
       onResponseSpeedChange: (speed: ResponseSpeedPreset) => void
       // Timer controls (migrated from Ingest)
       timerEnabled: boolean
       timerConfig: TimerConfig
       onTimerToggle: (enabled: boolean) => void
       onTimerConfigChange: (config: TimerConfig) => void
     }
     ```
  4. Copy the `TimerControlsV2` component from ingest-tab.tsx into config-tab.tsx (or import it — but since it uses local helpers like `formatSeconds` and `SLIDER_CONFIG`, it's cleaner to move the whole thing).
  5. Copy the `formatSeconds` helper and `SLIDER_CONFIG` constant.
  6. Render `<TimerControlsV2 ... />` after the response speed section in ConfigTab.

  **B. Update Ingest tab** — Remove timer controls, add new sections:

  In `ingest-tab.tsx`:
  1. **Remove** the `TimerControlsV2` component, `SLIDER_CONFIG` constant, and `formatSeconds` helper from the file.
  2. **Remove** timer control props from `IngestTabProps`: `timerEnabled`, `timerConfig`, `onTimerToggle`, `onTimerConfigChange`. Keep `timerState` and `onTimerPause` (for the timer display badge which stays).
  3. **Remove** the `<TimerControlsV2 ... />` render call from the IngestTab return.
  4. **Add new section: Extraction Details** — After the timeline section, add a new section that shows data from `debugTurns`:
     - Accept `debugTurns: DebugTurn[]` as a new prop
     - Filter turns with `ingestDetails`:
       ```typescript
       const turnsWithIngest = debugTurns.filter(t => t.ingestDetails)
       ```
     - For each, show: classification type, extracted fields list, action taken
     - Simple card per turn with classification badge + fields as tags
  5. **Add new section: Implicit Yes** — Show if any turn had `ingestDetails.implicitYes`:
     - triggered, dataFound, modeTransition
     - Small card with status indicators
  6. **Add new section: Ofi Inter Ruta 2** — Show if any turn had `ingestDetails.action === 'ask_ofi_inter'`:
     - "Ruta 2: Ciudad sin direccion detectada" badge
     - City name if available

  Updated IngestTabProps:
  ```typescript
  interface IngestTabProps {
    state: SandboxState
    debugTurns: DebugTurn[]  // NEW
    timerState: TimerState
    onTimerPause: () => void
    // REMOVED: timerEnabled, timerConfig, onTimerToggle, onTimerConfigChange
  }
  ```

  **C. Update PanelContainer** — Re-route timer props:

  In `panel-container.tsx`:
  1. Update `case 'ingest'` to pass `debugTurns` and remove timer control props:
     ```tsx
     case 'ingest':
       return (
         <IngestTab
           state={props.state}
           debugTurns={props.debugTurns}
           timerState={props.timerState}
           onTimerPause={props.onTimerPause}
         />
       )
     ```
  2. Update `case 'config'` to pass timer props:
     ```tsx
     case 'config':
       return (
         <ConfigTab
           agentName={props.agentName}
           responseSpeed={props.responseSpeed}
           onResponseSpeedChange={props.onResponseSpeedChange}
           timerEnabled={props.timerEnabled}
           timerConfig={props.timerConfig}
           onTimerToggle={props.onTimerToggle}
           onTimerConfigChange={props.onTimerConfigChange}
         />
       )
     ```

  **IMPORTANT:** The timer display (countdown badge, pause button) stays in IngestTab via `timerState` and `onTimerPause`. Only the CONTROLS (toggle, presets, sliders) move to Config.
  </action>
  <verify>Run `npx tsc --noEmit`. Verify IngestTab no longer accepts timerEnabled/timerConfig/onTimerToggle/onTimerConfigChange. Verify ConfigTab accepts those props. Verify PanelContainer routes correctly.</verify>
  <done>Timer controls migrated from Ingest to Config. Ingest simplified to show only timer display (not controls), plus new extraction details, implicit yes, and ofi inter R2 sections. Config now has speed + timer controls.</done>
</task>

<task type="auto">
  <name>Task 3: Update Estado tab with legible views</name>
  <files>src/app/(dashboard)/sandbox/components/debug-panel/state-tab.tsx</files>
  <action>
  Add three new legible views ABOVE the JSON editor in `state-tab.tsx`:

  1. **templates_enviados legible list:**
     - Show `state.templatesEnviados` as a numbered list of template IDs (or names if we have them)
     - Since we only have IDs in the state, display them as truncated strings with copy button
     - Badge showing count: "{n} templates enviados"
     - Collapsible section (expanded by default if < 10 items, collapsed if >= 10)

  2. **intents_vistos timeline:**
     - Show `state.intentsVistos` as a horizontal flow: `saludo → precio → envio → ...`
     - Use small badges connected by arrows (→)
     - If empty: "No intents vistos"

  3. **pending_templates display:**
     - This requires checking the state for pending templates data
     - State type SandboxState doesn't currently have pending_templates, but it can be stored there
     - If the state doesn't have this field, skip this section (show nothing)
     - If present: list pending templates with priority badges

  **Implementation:**

  Add a `LegibleState` component above the JsonViewEditor:

  ```tsx
  function LegibleState({ state }: { state: SandboxState }) {
    return (
      <div className="space-y-3">
        {/* Intents vistos timeline */}
        <div className="border rounded-lg p-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Intents Vistos
          </h4>
          {state.intentsVistos.length === 0 ? (
            <span className="text-xs text-muted-foreground">Ningun intent detectado</span>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {state.intentsVistos.map((intent, idx) => (
                <Fragment key={idx}>
                  {idx > 0 && <span className="text-muted-foreground text-xs">→</span>}
                  <Badge variant="outline" className="text-xs">{intent}</Badge>
                </Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Templates enviados */}
        <div className="border rounded-lg p-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Templates Enviados
            <Badge variant="secondary" className="ml-2 text-xs">{state.templatesEnviados.length}</Badge>
          </h4>
          {state.templatesEnviados.length === 0 ? (
            <span className="text-xs text-muted-foreground">Ningun template enviado</span>
          ) : (
            <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
              {state.templatesEnviados.map((id, idx) => (
                <Badge key={idx} variant="outline" className="text-xs font-mono">
                  {id.length > 20 ? `${id.substring(0, 20)}...` : id}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  ```

  Add `<LegibleState state={state} />` before the JSON editor section.

  Import `Fragment` from React, `Badge` from shadcn.
  </action>
  <verify>Run `npx tsc --noEmit`. Verify StateTab renders legible views above the JSON editor. Verify intents_vistos shows as timeline. Verify templates_enviados shows as list with count badge.</verify>
  <done>Estado tab now shows legible intents_vistos timeline and templates_enviados list above the JSON editor. Both handle empty states gracefully.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` compiles without errors
2. bloques-tab.tsx exists and exports BloquesTab
3. PanelContainer routes 'bloques' to BloquesTab
4. IngestTab no longer accepts timer control props (only timerState + onTimerPause)
5. ConfigTab now accepts timer control props and renders timer controls
6. StateTab shows legible views (intents timeline, templates list) above JSON editor
7. PanelContainer routes timer props to Config instead of Ingest
8. All tabs handle undefined/empty data gracefully
</verification>

<success_criteria>
All 8 tabs are complete with v4.0 functionality. The debug panel provides full visibility into every v4.0 agent feature: classification, block composition, no-repetition, ofi inter detection, pre-send checks, timer signals, template selection, transition validation, orchestration, ingest details, and disambiguation logging.
</success_criteria>

<output>
After completion, create `.planning/standalone/debug-panel-v4/dp4-05-SUMMARY.md`
</output>
