---
phase: standalone-debounce-v2-sandbox-integration
plan: 03
type: execute
wave: 3
depends_on: [02]
files_modified:
  - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
autonomous: true
requirements:
  - D-01  # Scope: changes only affect sandbox v4 testbed (no production impact)
  - D-08  # Interruption tab in /sandbox shows real events for current session (sandboxSessionId → InterruptionTab.conversationId)
  - D-15  # Out of scope — InterruptionTab component itself untouched (already shipped by parent standalone Plan 06)

must_haves:
  truths:
    - "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx passes `sandboxSessionId={sandboxLockSessionId}` prop into the existing `<DebugTabs ...>` JSX call (locate via grep — line number will be Plan-02-shifted)."
    - "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx adds `sandboxSessionId?: string | null` to `DebugTabsProps` interface and threads the prop through to the existing `<PanelContainer ...>` JSX call (locate via grep — exact line depends on file shape)."
    - "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx adds `sandboxSessionId?: string | null` to `PanelContainerProps` interface."
    - "Inside `panel-container.tsx`, the `case 'interruption':` branch (currently `return <InterruptionTab conversationId={null} sessionId={null} />`) is changed to `return <InterruptionTab conversationId={props.sandboxSessionId ?? null} sessionId={null} />`."
    - "sessionId stays null (sandbox does not create `agent_sessions` rows — D-11 from DISCUSSION-LOG decided option (c)). The events route at `/api/observability/events` resolves directly via `conversation_id` when session_id is absent (verified in RESEARCH §Pitfall 4)."
    - "InterruptionTab component file itself is NOT touched (D-15 — already shipped by parent standalone Plan 06). Verifiable: `git diff --stat main -- src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx | wc -l` returns 0."
    - "Regla 6: changes ONLY affect the prop-threading chain sandbox-layout → debug-tabs → panel-container → InterruptionTab. The pre-existing `case 'pipeline'`, `case 'classify'`, `case 'bloques'`, `case 'tools'`, `case 'state'`, `case 'tokens'`, `case 'ingest'`, `case 'config'`, `case 'subloop'` branches are byte-identical (do not consume sandboxSessionId)."
  artifacts:
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx"
      provides: "sandboxSessionId prop threaded into the 'interruption' case; InterruptionTab now receives real conversationId for current sandbox session"
      contains: "props.sandboxSessionId"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx"
      provides: "Pass-through threading of sandboxSessionId from sandbox-layout to panel-container"
      contains: "sandboxSessionId"
    - path: "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx"
      provides: "Reads existing sandboxLockSessionId state (added by Plan 02 Task 2.3) and passes it as a prop to DebugTabs"
      contains: "sandboxSessionId={sandboxLockSessionId}"
  key_links:
    - from: "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx (DebugTabs render)"
      to: "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx (DebugTabsProps)"
      via: "sandboxSessionId={sandboxLockSessionId} prop"
      pattern: "sandboxSessionId=\\{sandboxLockSessionId\\}"
    - from: "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx (PanelContainer render)"
      to: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx (PanelContainerProps)"
      via: "sandboxSessionId prop pass-through"
      pattern: "sandboxSessionId=\\{sandboxSessionId\\}"
    - from: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx ('interruption' case)"
      to: "src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx (InterruptionTab — UNCHANGED)"
      via: "conversationId={props.sandboxSessionId ?? null}"
      pattern: "conversationId=\\{props.sandboxSessionId"
---

<objective>
Wave 3 — Wire the existing Interruption debug-panel tab (shipped by parent standalone `debounce-interruption-system-v2` Plan 06) to receive the real `sandboxLockSessionId` from the current sandbox session. Three small prop-threading edits across the chain `sandbox-layout.tsx → debug-tabs.tsx → panel-container.tsx → InterruptionTab`. InterruptionTab itself is untouched (D-15 — parent shipped it).

Purpose: when the user toggles the Interruption tab in `/sandbox` debug panel after sending a v4 message, the tab queries `/api/observability/events?conversation_id={sandboxLockSessionId}` and shows the actual `lock_acquired`, `lock_released_normal`, `msg_aborted_path_a_combined`, etc. events that Plan 02's collector-wrapped route emitted to `agent_observability_events`. This is the visual smoke output for D-04 (CKPTs firing) and D-08 (real data in tab).

Output: 3 files edited, ~+5 LOC each. No new files. Plan 04 tests this via integration scenarios; manual smoke happens in Plan 05.

This plan runs in PARALLEL with Plan 04 (different file set; no overlap).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/standalone/debounce-v2-sandbox-integration/DISCUSSION-LOG.md
@.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md
@.planning/standalone/debounce-v2-sandbox-integration/02-PLAN.md
@.planning/standalone/debounce-v2-sandbox-integration/02-SUMMARY.md

<interfaces>
<!-- InterruptionTab signature (UNCHANGED — D-15 forbids touching) -->
From `src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx`:
```typescript
export interface InterruptionTabProps {
  conversationId: string | null
  sessionId: string | null
}
export function InterruptionTab({ conversationId, sessionId }: InterruptionTabProps): JSX.Element
// Behavior: if both null → render placeholder; if conversationId non-null → fetch /api/observability/events?conversation_id=...
```

<!-- Current panel-container.tsx props (read full file 113 LOC before editing) -->
```typescript
interface PanelContainerProps {
  visiblePanels: DebugPanelTabId[]
  debugTurns: DebugTurn[]
  state: SandboxState
  onStateEdit: (newState: SandboxState) => void
  totalTokens: number
  agentName: string
  responseDelayMs: number
  onResponseDelayChange: (delayMs: number) => void
  timerState: TimerState
  timerEnabled: boolean
  timerConfig: TimerConfig
  onTimerToggle: (enabled: boolean) => void
  onTimerConfigChange: (config: TimerConfig) => void
  onTimerPause: () => void
}
```

<!-- Current debug-tabs.tsx props (read full file 122 LOC before editing) -->
```typescript
interface DebugTabsProps {
  debugTurns: DebugTurn[]
  state: SandboxState
  onStateEdit: (newState: SandboxState) => void
  totalTokens: number
  agentName: string
  responseDelayMs: number
  onResponseDelayChange: (delayMs: number) => void
  timerState: TimerState
  timerEnabled: boolean
  timerConfig: TimerConfig
  onTimerToggle: (enabled: boolean) => void
  onTimerConfigChange: (config: TimerConfig) => void
  onTimerPause: () => void
}
```

<!-- sandbox-layout.tsx already has sandboxLockSessionId from Plan 02 Task 2.3 -->
```typescript
const [sandboxLockSessionId] = useState(() => generateSessionId())
// ... down at the existing <DebugTabs ...> JSX call (line number Plan-02-shifted; locate via grep):
<DebugTabs
  debugTurns={debugTurns}
  state={state}
  // ... other props ...
/>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 3.1: Add sandboxSessionId prop to PanelContainerProps + wire to InterruptionTab case</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx FULL FILE (113 lines)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx (READ ONLY — confirm props shape; do NOT modify per D-15)
  </read_first>
  <action>
    1. Open `src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx`.

    2. Add `sandboxSessionId?: string | null` to the `PanelContainerProps` interface (currently lines 24-40). Place it AFTER `onTimerPause: () => void`:

       ```typescript
       interface PanelContainerProps {
         visiblePanels: DebugPanelTabId[]
         debugTurns: DebugTurn[]
         state: SandboxState
         onStateEdit: (newState: SandboxState) => void
         totalTokens: number
         agentName: string
         responseDelayMs: number
         onResponseDelayChange: (delayMs: number) => void
         // Timer props (Phase 15.7)
         timerState: TimerState
         timerEnabled: boolean
         timerConfig: TimerConfig
         onTimerToggle: (enabled: boolean) => void
         onTimerConfigChange: (config: TimerConfig) => void
         onTimerPause: () => void
         // Standalone: debounce-v2-sandbox-integration / Plan 03 (D-08).
         // Threaded from sandbox-layout via DebugTabs. Used by the 'interruption'
         // case below to populate InterruptionTab.conversationId so the tab
         // queries /api/observability/events?conversation_id={sandboxSessionId}.
         // null when caller does not supply (preserves InterruptionTab placeholder UX).
         sandboxSessionId?: string | null
       }
       ```

    3. Change the `case 'interruption':` branch (currently around line 79-84 — locate via grep `grep -n "case 'interruption'" panel-container.tsx` since line may shift between sessions):

       BEFORE:
       ```typescript
       case 'interruption':
         // Standalone: debounce-interruption-system-v2 / Plan 06 (D-11 + LOCK-08).
         // Sandbox has no real session/conversation id (local-only) so the tab
         // renders the neutral placeholder. In a future plan a dashboard-side
         // session inspector will mount this same component with real IDs.
         return <InterruptionTab conversationId={null} sessionId={null} />
       ```

       AFTER:
       ```typescript
       case 'interruption':
         // Standalone: debounce-v2-sandbox-integration / Plan 03 (D-08).
         // sandboxSessionId is the per-tab runtime lock id (Pitfall 6 — NOT from
         // localStorage). When non-null, InterruptionTab queries /api/observability/events
         // for the lock + checkpoint events that the v4 sandbox engine + route emit.
         // sessionId stays null because sandbox does NOT create agent_sessions rows
         // (D-11 option c in DISCUSSION-LOG); the events route resolves via
         // conversation_id directly when session_id is absent (Pitfall 4 RESOLVED
         // 2026-05-27 — agent_observability_turns.conversation_id is UUID NOT NULL without FK).
         return <InterruptionTab conversationId={props.sandboxSessionId ?? null} sessionId={null} />
       ```

    4. **Do NOT modify** any of the other `case` branches (`pipeline`, `classify`, `bloques`, `tools`, `state`, `tokens`, `ingest`, `config`, `subloop`) — they are byte-identical (Regla 6 spirit).

    5. **Sanity check:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       npx tsc --noEmit -p tsconfig.json 2>&1 | grep "panel-container" | head -10
       ```
       MUST report zero new errors.

    6. **D-15 InterruptionTab untouched:**
       ```bash
       git diff --stat main -- src/app/\(dashboard\)/sandbox/components/debug-panel/interruption-tab.tsx | wc -l   # MUST be 0
       ```
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && grep -c "sandboxSessionId?: string | null" "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx" && grep -c "props.sandboxSessionId" "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx" && grep -c "conversationId=\\{null\\} sessionId=\\{null\\}" "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx" && (git diff --stat main -- "src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx" | wc -l) && (npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "panel-container")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "sandboxSessionId?: string | null" src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` ≥ 1 (prop added).
    - `grep -c "props.sandboxSessionId" src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` ≥ 1 (consumed in interruption case).
    - `grep -c "conversationId={null} sessionId={null}" src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` == 0 (old prop wiring removed).
    - `grep -c "conversationId={props.sandboxSessionId ?? null}" src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` ≥ 1 (new prop wiring).
    - `git diff --stat main -- src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx | wc -l` returns 0 (D-15).
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "panel-container"` reports ZERO new errors.
  </acceptance_criteria>
  <done>PanelContainer accepts sandboxSessionId prop; interruption case passes it as conversationId; InterruptionTab untouched.</done>
  <atomic_commit>feat(sandbox-debug-panel): wire sandboxSessionId to InterruptionTab via PanelContainer (D-08)</atomic_commit>
</task>

<task type="auto" tdd="false">
  <name>Task 3.2: Add sandboxSessionId prop to DebugTabsProps + thread to PanelContainer + accept from sandbox-layout</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx FULL FILE (122 lines)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/sandbox-layout.tsx — locate the existing `<DebugTabs ...>` JSX call (use `grep -n "<DebugTabs" sandbox-layout.tsx` — line will be Plan-02-shifted) to know what other props are already passed
  </read_first>
  <action>
    1. Open `src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx`.

    2. Add `sandboxSessionId?: string | null` to `DebugTabsProps` (currently lines 31-46). Place at end before the closing `}`:

       ```typescript
       interface DebugTabsProps {
         debugTurns: DebugTurn[]
         state: SandboxState
         onStateEdit: (newState: SandboxState) => void
         totalTokens: number
         agentName: string
         responseDelayMs: number
         onResponseDelayChange: (delayMs: number) => void
         // Timer props (Phase 15.7)
         timerState: TimerState
         timerEnabled: boolean
         timerConfig: TimerConfig
         onTimerToggle: (enabled: boolean) => void
         onTimerConfigChange: (config: TimerConfig) => void
         onTimerPause: () => void
         // Standalone: debounce-v2-sandbox-integration / Plan 03 (D-08).
         // Runtime sandbox lock session id, threaded from sandbox-layout to
         // PanelContainer's interruption case for InterruptionTab conversationId.
         sandboxSessionId?: string | null
       }
       ```

    3. Destructure `sandboxSessionId` in the `DebugTabs` function signature (line 48-62) and pass to `<PanelContainer ...>` (line 103-118):

       ```typescript
       export function DebugTabs({
         debugTurns,
         state,
         onStateEdit,
         totalTokens,
         agentName,
         responseDelayMs,
         onResponseDelayChange,
         timerState,
         timerEnabled,
         timerConfig,
         onTimerToggle,
         onTimerConfigChange,
         onTimerPause,
         sandboxSessionId,  // NEW
       }: DebugTabsProps) {
         // ... existing useState + handlers unchanged ...

         return (
           <div className="h-full flex flex-col bg-background">
             <div className="px-3 py-2 border-b">
               <h3 className="text-sm font-medium">Debug Panel</h3>
             </div>

             <TabBar
               tabs={tabs}
               onReorder={handleReorder}
               onToggleTab={handleToggleTab}
               maxVisible={MAX_VISIBLE}
             />

             <div className="flex-1 min-h-0 overflow-hidden">
               <PanelContainer
                 visiblePanels={visiblePanels}
                 debugTurns={debugTurns}
                 state={state}
                 onStateEdit={onStateEdit}
                 totalTokens={totalTokens}
                 agentName={agentName}
                 responseDelayMs={responseDelayMs}
                 onResponseDelayChange={onResponseDelayChange}
                 timerState={timerState}
                 timerEnabled={timerEnabled}
                 timerConfig={timerConfig}
                 onTimerToggle={onTimerToggle}
                 onTimerConfigChange={onTimerConfigChange}
                 onTimerPause={onTimerPause}
                 sandboxSessionId={sandboxSessionId}  // NEW
               />
             </div>
           </div>
         )
       }
       ```

    4. Open `src/app/(dashboard)/sandbox/components/sandbox-layout.tsx`. Locate the existing `<DebugTabs ...>` JSX call via grep (`grep -n "<DebugTabs" sandbox-layout.tsx` — line number depends on Plan 02's deferred-response handler shape). Add `sandboxSessionId={sandboxLockSessionId}` to its props. Example shape (locate the JSX block and append the prop in alphabetical/logical order with the other props):

       ```typescript
       <DebugTabs
         debugTurns={debugTurns}
         state={state}
         onStateEdit={handleStateEdit}
         totalTokens={totalTokens}
         agentName={agentName}
         responseDelayMs={responseDelayMs}
         onResponseDelayChange={setResponseDelayMs}
         timerState={timerState}
         timerEnabled={timerEnabled}
         timerConfig={timerConfig}
         onTimerToggle={setTimerEnabled}
         onTimerConfigChange={setTimerConfig}
         onTimerPause={handleTimerPause}
         sandboxSessionId={sandboxLockSessionId}  // NEW — Plan 03 (D-08)
       />
       ```

       (The exact other prop names depend on what's already in the file; preserve them all; ONLY add the new line.)

    5. **Sanity check:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "debug-tabs\.tsx|sandbox-layout\.tsx" | head -20
       ```
       MUST report zero new errors.

    6. **Regla 6 / D-15 zero-diff checks:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       git diff --stat main -- "src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx" | wc -l                    # MUST be 0
       git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l                                                      # MUST be 0
       # Verify ZERO non-prop changes to debug-tabs.tsx (only DebugTabsProps + destructure + PanelContainer JSX line):
       git diff main -- "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx" | grep -E "^[+-]" | grep -v "^[+-]{3}"
       # Expected: only lines mentioning sandboxSessionId; no edits to DEFAULT_TABS, handlers, etc.
       ```
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && grep -c "sandboxSessionId?: string | null" "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx" && grep -c "sandboxSessionId," "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx" && grep -c "sandboxSessionId={sandboxSessionId}" "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx" && grep -c "sandboxSessionId={sandboxLockSessionId}" "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx" && (git diff --stat main -- "src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx" | wc -l) && (git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l) && (npx tsc --noEmit -p tsconfig.json 2>&1 | grep -cE "debug-tabs\.tsx|sandbox-layout\.tsx")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "sandboxSessionId?: string | null" src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx` ≥ 1 (prop in interface).
    - `grep -c "sandboxSessionId," src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx` ≥ 1 (destructured in function signature).
    - `grep -c "sandboxSessionId={sandboxSessionId}" src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx` ≥ 1 (passed to PanelContainer).
    - `grep -c "sandboxSessionId={sandboxLockSessionId}" src/app/(dashboard)/sandbox/components/sandbox-layout.tsx` ≥ 1 (sandbox-layout passes the runtime state into DebugTabs).
    - `git diff --stat main -- src/app/(dashboard)/sandbox/components/debug-panel/interruption-tab.tsx | wc -l` returns 0 (D-15).
    - `git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l` returns 0 (D-15).
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -cE "debug-tabs\.tsx|sandbox-layout\.tsx"` reports ZERO new errors.
    - **Regla 6 spot-check (no behavior change in unrelated cases):** `git diff main -- src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx | grep -E "^[+-]" | grep -v "^[+-]{3}" | grep -vE "sandboxSessionId" | grep -cE "^[+-][^+-]"` returns 0 (every edit references sandboxSessionId; nothing unrelated touched).
  </acceptance_criteria>
  <done>sandbox-layout → debug-tabs → panel-container chain threads sandboxSessionId; InterruptionTab consumes via panel-container interruption case.</done>
  <atomic_commit>feat(sandbox-debug-panel): thread sandboxSessionId from sandbox-layout to InterruptionTab (D-08)</atomic_commit>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p tsconfig.json` clean for all 3 modified files.
2. **D-15 InterruptionTab + module untouched:**
   ```bash
   git diff --stat main -- src/app/\(dashboard\)/sandbox/components/debug-panel/interruption-tab.tsx | wc -l   # MUST be 0
   git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l                                    # MUST be 0
   ```
3. **Regla 6 spot-check on other tabs:**
   ```bash
   # The other case branches in panel-container.tsx must NOT mention sandboxSessionId — only 'interruption' case uses it.
   grep -A 1 "case 'pipeline':\|case 'classify':\|case 'bloques':\|case 'tools':\|case 'state':\|case 'tokens':\|case 'ingest':\|case 'config':\|case 'subloop':" src/app/\(dashboard\)/sandbox/components/debug-panel/panel-container.tsx | grep -c "sandboxSessionId"
   # MUST be 0 (only 'interruption' case consumes the new prop).
   ```
4. **D-12 sin migración + D-13 sin feature flag:** N/A (UI plan).
</verification>

<success_criteria>
- 3 files edited (~+5 LOC each); pure prop-threading.
- InterruptionTab component file byte-identical (D-15).
- Module interruption-system-v2/ byte-identical (D-15).
- TypeScript compiles cleanly.
- When user opens /sandbox with v4 selected + Interruption tab toggled on, the tab now queries with the runtime sandboxLockSessionId as conversation_id.
</success_criteria>

<push_to_vercel>
After both atomic commits land, push (Regla 1):
```bash
git push origin HEAD:main
```
Pure UI / prop-threading plan. Zero production code touched. Safe.
</push_to_vercel>

<output>
After completion, create `.planning/standalone/debounce-v2-sandbox-integration/03-SUMMARY.md` documenting:
- Exact line number of `<DebugTabs ...>` JSX in sandbox-layout.tsx (post-Plan-02 shifted) and the prop addition.
- Exact line number of the `case 'interruption':` branch in panel-container.tsx.
- Confirmation that no other `case` branches in panel-container.tsx were touched.
- Confirmation that interruption-tab.tsx + module are unchanged.
- Cross-reference to Plan 04 (tests assert that the wired-up Interruption tab path receives real events on a turn that exercises a CKPT) + Plan 05 (manual smoke verifying the tab populates in browser).
</output>
</content>
