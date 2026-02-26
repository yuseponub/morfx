---
phase: standalone/debug-panel-v4
plan: 03
type: execute
wave: 2
depends_on: [dp4-01]
files_modified:
  - src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx
autonomous: true

must_haves:
  truths:
    - "Tab system recognizes 8 tab IDs: pipeline, classify, bloques, tools, state, tokens, ingest, config"
    - "Default visible tabs are: Pipeline, Classify, Bloques"
    - "Intent tab is removed from the system entirely (no import, no case, no icon)"
    - "Classify tab renders intent info + message category + ofi inter + disambiguation log"
    - "Tab icons map includes entries for all 8 tabs"
    - "PanelContent switch routes pipeline, classify, bloques to placeholder/real components"
  artifacts:
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx"
      provides: "Updated DEFAULT_TABS with 8 entries, Pipeline/Classify/Bloques visible by default"
      contains: "pipeline.*Classify.*Bloques"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx"
      provides: "TAB_ICONS with 8 entries including pipeline, classify, bloques"
      contains: "pipeline.*classify.*bloques"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx"
      provides: "PanelContent switch with 8 cases, Classify + Pipeline + Bloques routed"
      contains: "ClassifyTab"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx"
      provides: "Classify tab component showing intent + category + ofi inter + disambiguation"
  key_links:
    - from: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx"
      to: "src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx"
      via: "import + case 'classify'"
      pattern: "case 'classify'"
---

<objective>
Update the tab registration system (4 files) to support the new 8-tab structure, create the Classify tab (replacing Intent), and remove all references to the old Intent tab.

Purpose: The tab infrastructure must be updated before individual tabs can be created and routed. Classify replaces Intent and is the simplest new tab to build (reuses patterns from intent-tab.tsx with additions).
Output: Working 8-tab system with new defaults, Classify tab functional, Intent tab fully removed.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/debug-panel-v4/ARCHITECTURE.md
@.planning/standalone/debug-panel-v4/CONTEXT.md
@.planning/standalone/debug-panel-v4/dp4-01-SUMMARY.md
@src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx
@src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx
@src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
@src/app/(dashboard)/sandbox/components/debug-panel/intent-tab.tsx
@src/lib/sandbox/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Classify tab component</name>
  <files>src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx</files>
  <action>
  Create `classify-tab.tsx` in the debug-panel directory. This tab replaces Intent and adds: message category classification, ofi inter detection, and disambiguation log.

  **Structure:** The tab shows ONE section per turn (like intent-tab.tsx), iterating over debugTurns that have intent data. Within each turn entry, show 4 sections:

  **1. Intent Section** (migrated from intent-tab.tsx with same styling):
  - Intent name badge (colored by confidence level)
  - Confidence bar with percentage (reuse `getConfidenceColor` helper from intent-tab.tsx)
  - Alternatives list (if present)
  - Reasoning text (if present)

  **2. Category Section** (NEW):
  - Category badge with color: green for RESPONDIBLE, yellow for SILENCIOSO, red for HANDOFF
  - Reason text
  - Rules checked grid (4 items: Rule 1 HANDOFF_INTENTS, Rule 1.5 confidence<80%, Rule 2 acknowledgment, Rule 3 default) — each shows a check mark or X

  **3. Ofi Inter Section** (NEW, only shown if ofiInter data exists):
  - Route 1: "Mencion directa" — detected/no + pattern matched
  - Route 3: "Municipio remoto" — detected/no + city + isRemote flag
  - (Route 2 is shown in Ingest tab since it comes from IngestManager)

  **4. Disambiguation Log Section** (NEW, only shown if disambiguationLog exists and logged=true):
  - Expandable section (collapsed by default)
  - Top intents table with intent + confidence
  - Templates sent count
  - Pending count
  - History turns captured

  **Implementation pattern:**
  ```tsx
  'use client'

  import { useState } from 'react'
  import { Target, Shield, MapPin, AlertTriangle, ChevronDown, ChevronRight, Check, X as XIcon } from 'lucide-react'
  import { Badge } from '@/components/ui/badge'
  import { Progress } from '@/components/ui/progress'
  import { cn } from '@/lib/utils'
  import { format } from 'date-fns'
  import type { DebugTurn } from '@/lib/sandbox/types'

  interface ClassifyTabProps {
    debugTurns: DebugTurn[]
  }

  // Reuse confidence color logic from intent-tab.tsx
  function getConfidenceColor(confidence: number): string {
    if (confidence >= 85) return 'text-green-600 dark:text-green-400'
    if (confidence >= 60) return 'text-yellow-600 dark:text-yellow-400'
    if (confidence >= 40) return 'text-orange-600 dark:text-orange-400'
    return 'text-red-600 dark:text-red-400'
  }

  function getConfidenceBadge(confidence: number): 'default' | 'secondary' | 'destructive' {
    if (confidence >= 85) return 'default'
    if (confidence >= 60) return 'secondary'
    return 'destructive'
  }

  function getCategoryColor(category: string) {
    switch (category) {
      case 'RESPONDIBLE': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300'
      case 'SILENCIOSO': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-300'
      case 'HANDOFF': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  export function ClassifyTab({ debugTurns }: ClassifyTabProps) { ... }
  ```

  The component iterates `debugTurns.filter(t => t.intent)`, same as intent-tab.tsx. For each turn, render the 4 sections. Handle gracefully: if `turn.classification` is undefined (old sessions), skip the Category section. If `turn.ofiInter` is undefined, skip Ofi Inter section. If `turn.disambiguationLog` is undefined or `logged=false`, skip Disambiguation section.

  **Styling notes:**
  - Use consistent spacing: `space-y-3` between sections within a turn card
  - Category badge: larger than intent badge, prominent
  - Rules checked: 2x2 grid of small items, each with Check or X icon
  - Keep it compact — this tab needs to fit in 1/3 of the panel width
  </action>
  <verify>Run `npx tsc --noEmit` — classify-tab.tsx itself should compile (it only imports from types and shadcn). Verify the file exports ClassifyTab. It should handle turns without classification gracefully.</verify>
  <done>Classify tab created with 4 sections: Intent (migrated), Category (new), Ofi Inter (new), Disambiguation (new). Handles undefined debug fields gracefully. Exported as ClassifyTab.</done>
</task>

<task type="auto">
  <name>Task 2: Update tab infrastructure (debug-tabs, tab-bar, panel-container) + delete intent-tab</name>
  <files>src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx, src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx, src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx</files>
  <action>
  **IMPORTANT:** This task runs AFTER Task 1 (classify-tab.tsx must exist before panel-container.tsx can import it).

  All three files must be updated together to avoid type mismatches.

  **A. Update debug-tabs.tsx:**

  Replace the `DEFAULT_TABS` array with:
  ```typescript
  const DEFAULT_TABS: DebugPanelTab[] = [
    { id: 'pipeline', label: 'Pipeline', visible: true },
    { id: 'classify', label: 'Classify', visible: true },
    { id: 'bloques', label: 'Bloques', visible: true },
    { id: 'tools', label: 'Tools', visible: false },
    { id: 'state', label: 'Estado', visible: false },
    { id: 'tokens', label: 'Tokens', visible: false },
    { id: 'ingest', label: 'Ingest', visible: false },
    { id: 'config', label: 'Config', visible: false },
  ]
  ```

  This gives 8 tabs total: 3 visible by default (Pipeline, Classify, Bloques), 5 hidden. Max visible remains 3.

  **B. Update tab-bar.tsx:**

  1. Update icon imports — add new icons, remove Brain (was for Intent):
     ```typescript
     import { Wrench, FileJson, Coins, Database, Settings, X, GitBranch, Target, Package } from 'lucide-react'
     ```
     - `GitBranch` for Pipeline (flow/steps metaphor)
     - `Target` for Classify (detection/classification) — reuse from intent-tab.tsx
     - `Package` for Bloques (template blocks)
     - Remove `Brain` (was for Intent)

  2. Update TAB_ICONS map:
     ```typescript
     const TAB_ICONS: Record<DebugPanelTabId, React.ComponentType<{ className?: string }>> = {
       pipeline: GitBranch,
       classify: Target,
       bloques: Package,
       tools: Wrench,
       state: FileJson,
       tokens: Coins,
       ingest: Database,
       config: Settings,
     }
     ```
     This MUST have exactly the 8 keys matching DebugPanelTabId. Missing keys cause TypeScript errors.

  **C. Update panel-container.tsx:**

  1. Remove IntentTab import, add ClassifyTab import (Pipeline and Bloques will be placeholder for now, implemented in Plans 04-05):
     ```typescript
     // Remove: import { IntentTab } from './intent-tab'
     import { ClassifyTab } from './classify-tab'
     ```

  2. Update the PanelContent switch statement:
     - Remove `case 'intent'`
     - Add `case 'pipeline'`: Return a placeholder div:
       ```tsx
       case 'pipeline':
         return (
           <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
             Pipeline tab — coming in Plan 04
           </div>
         )
       ```
     - Add `case 'classify'`:
       ```tsx
       case 'classify':
         return <ClassifyTab debugTurns={props.debugTurns} />
       ```
     - Add `case 'bloques'`: Return a placeholder div:
       ```tsx
       case 'bloques':
         return (
           <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
             Bloques tab — coming in Plan 05
           </div>
         )
       ```

  **D. Delete intent-tab.tsx:**
  Delete the file `src/app/(dashboard)/sandbox/components/debug-panel/intent-tab.tsx`. It is fully replaced by classify-tab.tsx (created in Task 1).
  </action>
  <verify>Run `npx tsc --noEmit` — should compile (classify-tab.tsx exists from Task 1). Verify `intent-tab.tsx` is deleted. Verify TAB_ICONS has exactly 8 keys.</verify>
  <done>Tab system updated: 8 tabs registered, 3 visible by default (Pipeline/Classify/Bloques), Intent removed entirely, Pipeline and Bloques have placeholders.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` compiles without errors
2. `intent-tab.tsx` is deleted
3. `classify-tab.tsx` exists and exports ClassifyTab
4. DEFAULT_TABS has 8 entries with Pipeline/Classify/Bloques visible by default
5. TAB_ICONS has 8 entries matching DebugPanelTabId exactly
6. PanelContent switch has 8 cases (pipeline/classify/bloques/tools/state/tokens/ingest/config)
7. No remaining references to 'intent' tab ID in the codebase (except possibly in saved localStorage sessions, which is handled gracefully)
</verification>

<success_criteria>
Tab infrastructure supports all 8 tabs. Classify tab is fully functional, showing intent detection + message category + ofi inter + disambiguation. Intent tab is removed. Pipeline and Bloques have placeholders for Plans 04-05.
</success_criteria>

<output>
After completion, create `.planning/standalone/debug-panel-v4/dp4-03-SUMMARY.md`
</output>
