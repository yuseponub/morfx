---
plan: 04
title: UI Tab — subloop-tab.tsx component + registration (4-file plumbing)
wave: 1
depends_on: [01]
files_modified:
  - src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/index.ts
autonomous: true
estimated_minutes: 55
locked_files_blocked:
  - src/lib/agents/somnio-v4/sub-loop/output-schema.ts
  - src/lib/agents/somnio-v4/sub-loop/prompt.ts
  - src/lib/agents/somnio-v4/sub-loop/tools.ts
must_haves:
  truths:
    - "New SubloopTab component renders the 5 sections per D-05 (banner, fired-false explainer, tool timeline, KB hits, outcome, violation banners)"
    - "Tab registered in DEFAULT_TABS (debug-tabs.tsx)"
    - "PanelContainer routes 'subloop' to SubloopTab"
    - "TabBar TAB_ICONS map includes 'subloop'"
    - "index.ts re-exports SubloopTab"
    - "Zero TypeScript errors; component handles undefined subLoopDebug + kbHits gracefully (Pitfall 5)"
  artifacts:
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx"
      provides: "Sub-Loop debug tab rendering SubLoopDebugPayload per turn"
      min_lines: 200
      contains: "export function SubloopTab"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx"
      provides: "DEFAULT_TABS includes subloop entry"
      contains: "id: 'subloop'"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx"
      provides: "SubloopTab routed for 'subloop' panel id"
      contains: "case 'subloop'"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx"
      provides: "TAB_ICONS map includes subloop -> Activity icon"
      contains: "subloop:"
    - path: "src/app/(dashboard)/sandbox/components/debug-panel/index.ts"
      provides: "SubloopTab re-exported"
      contains: "SubloopTab"
  key_links:
    - from: "src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx"
      to: "src/lib/sandbox/types.ts"
      via: "DebugTurn import + filter on subLoopDebug"
      pattern: "filter\\(t => t\\.subLoopDebug"
---

## Objective

Build the new "Sub-Loop" tab in the sandbox debug panel (D-04, D-05). The tab renders `DebugTurn.subLoopDebug` payloads per turn — one card per turn that has `subLoopDebug !== undefined`. Each card includes:

1. **Banner** — turn number + reason badge + fired indicator + finishReason + latencyMs
2. **Fired=false explainer** — fallback for turns where v4 ran but sub-loop did NOT fire (uses adjacent `intent_confidence ≥ threshold` data) — RESEARCH Example 7 pattern verbatim
3. **Tool calls timeline** — expandable cards per tool call (input + outputPreview) following `tools-tab.tsx` pattern
4. **KB Hits section** — topic + similarity bar (Progress) + content preview + nunca-decir indicator. Handles `kbHits === undefined` (Pitfall 5 — render "KB not consulted")
5. **Outcome section** — status badge + responseTemplate + canonicalText preview + sourceTopic + requiresHuman
6. **Violation banners** (red) — invariantViolation / nuncaDecirViolation / errorMessage

Then register the tab in 4 plumbing files: `debug-tabs.tsx` (DEFAULT_TABS), `panel-container.tsx` (switch case), `tab-bar.tsx` (TAB_ICONS map), `index.ts` (re-export).

**Parallel-safe with Plan 02:** depends only on Plan 01 (types). Wave 1 alongside Plan 02. No file overlap with Plan 02.

## Tasks

### Task 1: Create `subloop-tab.tsx` component

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/classify-tab.tsx (FULL FILE — pattern template; reuse normalizeConfidence + getConfidenceColor + getConfidenceBadge inline)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/tools-tab.tsx (lines 22-98 — ToolExecutionItem expand/collapse pattern)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/debug-payload.ts (Plan 01 — types we consume)
- /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/v4-subloop-debug-view/RESEARCH.md (sections "Debug Panel Anatomy", "classify-tab.tsx as Template", "tools-tab.tsx as Secondary Template", "Don't Hand-Roll", "Pitfall 5 kb_search may not be invoked")
</read_first>

<action>
Create NEW file `src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx`. Use this skeleton — adapt the visual details freely BUT respect all the structural rules called out in the comments:

```tsx
'use client'

/**
 * Sub-Loop Tab Component
 * Standalone: v4-subloop-debug-view / Plan 04 (D-04, D-05).
 *
 * Renders SubLoopDebugPayload per turn:
 *   - Banner (reason + fired + finishReason + latencyMs)
 *   - Fired=false explainer (turns where v4 ran but sub-loop didn't fire)
 *   - Tool calls timeline (expandable, AI SDK v6 input/output)
 *   - KB Hits section (similarity bar, nunca-decir flag) — Pitfall 5: handle undefined
 *   - Outcome (status badge + responseTemplate + canonicalText preview)
 *   - Violation banners (invariantViolation, nuncaDecirViolation, errorMessage)
 *
 * Mirrors classify-tab.tsx structure for visual consistency.
 */

import { useState } from 'react'
import {
  Activity,
  Database,
  AlertTriangle,
  Wrench,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { DebugTurn } from '@/lib/sandbox/types'
import type {
  SubLoopDebugPayload,
  SubLoopToolCallSnapshot,
  SubLoopKbHitSnapshot,
} from '@/lib/agents/somnio-v4/sub-loop/debug-payload'

interface SubloopTabProps {
  debugTurns: DebugTurn[]
}

// ============================================================================
// Helpers (mirror classify-tab.tsx — keep visual consistency)
// ============================================================================

function normalizeSimilarity(s: number): number {
  return s <= 1 ? Math.round(s * 100) : Math.round(s)
}

function getSimilarityColor(s: number): string {
  const n = normalizeSimilarity(s)
  if (n >= 85) return 'text-green-600 dark:text-green-400'
  if (n >= 60) return 'text-yellow-600 dark:text-yellow-400'
  if (n >= 40) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

function getOutcomeStatusBadge(status: string | undefined): 'default' | 'secondary' | 'destructive' {
  if (!status) return 'secondary'
  if (status === 'canonical' || status === 'template') return 'default'
  return 'destructive' // no_match
}

function getReasonBadgeColor(reason: string): string {
  switch (reason) {
    case 'low_confidence':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-300'
    case 'crm_mutation':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300'
    case 'cas_reject':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300'
    case 'razonamiento_libre':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border-purple-300'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300 border-gray-300'
  }
}

// ============================================================================
// Sub-components
// ============================================================================

function BannerSection({ payload }: { payload: SubLoopDebugPayload }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        Sub-Loop
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border',
            getReasonBadgeColor(payload.reason),
          )}
        >
          {payload.reason}
        </span>
        <Badge variant="default" className="text-[10px]">
          fired
        </Badge>
        {payload.finishReason && (
          <Badge variant="outline" className="text-[10px]">
            finish: {payload.finishReason}
          </Badge>
        )}
        {payload.stepCount !== undefined && (
          <Badge variant="outline" className="text-[10px]">
            steps: {payload.stepCount}
          </Badge>
        )}
        {payload.latencyMs !== undefined && (
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {Math.round(payload.latencyMs)}ms
          </span>
        )}
      </div>
    </div>
  )
}

function FiredFalseExplainer({ turn }: { turn: DebugTurn }) {
  // Render when sub-loop did NOT fire on this v4 turn. We have intent_confidence + threshold
  // available from classify surface (Plan 07 parent standalone analog).
  const conf = turn.intent?.intent_confidence
  const threshold = turn.threshold
  if (conf === undefined || threshold === undefined) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Sub-loop did not fire (no confidence data available for this turn).
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground italic">
        Sub-loop did not fire — confidence ≥ threshold.
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">intent_confidence</span>
        <span className="font-mono font-medium">{conf.toFixed(3)}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">threshold</span>
        <span className="font-mono">{threshold.toFixed(2)}</span>
      </div>
    </div>
  )
}

function ToolCallItem({
  call,
  result,
  index,
}: {
  call: SubLoopToolCallSnapshot
  result?: SubLoopToolCallSnapshot
  index: number
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">#{index + 1}</span>
        <span className="font-mono text-sm truncate flex-1">{call.toolName}</span>
        {result ? (
          <Badge variant="default" className="shrink-0 text-[10px]">
            ok
          </Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            pending
          </Badge>
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t bg-muted/30">
          <div className="pt-2">
            <span className="text-xs text-muted-foreground">Input:</span>
            <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>
          {result && (
            <div>
              <span className="text-xs text-muted-foreground">Output (preview, max 500ch):</span>
              <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">
                {result.outputPreview ?? JSON.stringify(result.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ToolCallsTimeline({ payload }: { payload: SubLoopDebugPayload }) {
  if (payload.toolCalls.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No tool calls (model emitted output directly).
      </div>
    )
  }
  // Match each call to its result by index (AI SDK v6 step order preserves pairing).
  // If toolResults has fewer entries than toolCalls, some pending — match by toolName fallback.
  const resultsByName = new Map<string, SubLoopToolCallSnapshot>()
  payload.toolResults.forEach((r) => {
    if (!resultsByName.has(r.toolName)) resultsByName.set(r.toolName, r)
  })
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Wrench className="h-3.5 w-3.5" />
        Tool calls ({payload.toolCalls.length})
      </div>
      {payload.toolCalls.map((call, idx) => (
        <ToolCallItem
          key={idx}
          call={call}
          result={payload.toolResults[idx] ?? resultsByName.get(call.toolName)}
          index={idx}
        />
      ))}
    </div>
  )
}

function KbHitsSection({ hits }: { hits: SubLoopKbHitSnapshot[] }) {
  if (hits.length === 0) {
    return (
      <div className="space-y-2 pt-2 border-t">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          KB Hits
        </div>
        <div className="text-xs text-muted-foreground/70 italic">
          kb_search returned 0 hits.
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        KB Hits ({hits.length})
      </div>
      {hits.map((hit, idx) => (
        <div key={idx} className="space-y-1.5 border rounded-lg p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs truncate flex-1">{hit.topic}</span>
            {hit.hasNuncaDecir && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                nunca-decir
              </Badge>
            )}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">similarity</span>
              <span className={cn('font-mono font-medium', getSimilarityColor(hit.similarity))}>
                {normalizeSimilarity(hit.similarity)}%
              </span>
            </div>
            <Progress value={normalizeSimilarity(hit.similarity)} className="h-1.5" />
          </div>
          {hit.contentPreview && (
            <p className="text-[11px] text-muted-foreground/80 line-clamp-2">
              {hit.contentPreview}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function KbNotConsulted() {
  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        KB Hits
      </div>
      <div className="text-xs text-muted-foreground/60 italic">
        KB not consulted in this turn.
      </div>
    </div>
  )
}

function OutcomeSection({ payload }: { payload: SubLoopDebugPayload }) {
  const outcome = payload.outcome
  if (!outcome) return null
  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {outcome.requiresHuman ? (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
        )}
        Outcome
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={getOutcomeStatusBadge(outcome.status)} className="text-[10px]">
          {outcome.status}
        </Badge>
        {outcome.responseTemplate && (
          <Badge variant="outline" className="text-[10px]">
            template: {outcome.responseTemplate}
          </Badge>
        )}
        {outcome.sourceTopic && (
          <Badge variant="outline" className="text-[10px]">
            topic: {outcome.sourceTopic}
          </Badge>
        )}
        {outcome.requiresHuman && (
          <Badge variant="destructive" className="text-[10px]">
            requires human
          </Badge>
        )}
      </div>
      {outcome.canonicalText && (
        <div>
          <span className="text-xs text-muted-foreground">canonical text:</span>
          <pre className="mt-1 p-2 bg-muted/40 rounded text-xs overflow-auto max-h-24 whitespace-pre-wrap">
            {outcome.canonicalText}
          </pre>
        </div>
      )}
      {outcome.reason && (
        <div className="text-xs">
          <span className="text-muted-foreground">reason:</span>{' '}
          <span className="text-muted-foreground/90">{outcome.reason}</span>
        </div>
      )}
    </div>
  )
}

function ViolationBanner({
  kind,
  message,
}: {
  kind: 'invariant' | 'nunca_decir' | 'error'
  message: string
}) {
  const label =
    kind === 'invariant'
      ? 'Invariant violation'
      : kind === 'nunca_decir'
        ? 'NUNCA-decir violation'
        : 'Error'
  return (
    <div className="flex items-start gap-2 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-red-700 dark:text-red-300">{label}</div>
        <div className="text-xs text-red-600 dark:text-red-400 break-words">{message}</div>
      </div>
    </div>
  )
}

// ============================================================================
// Main component
// ============================================================================

export function SubloopTab({ debugTurns }: SubloopTabProps) {
  // Render ALL v4 turns (so user can see fired=false explainer). A v4 turn is
  // detectable via the presence of intent.intent_confidence (Plan 07 parent
  // standalone — only v4 path populates this). For non-v4 turns we skip.
  const v4Turns = debugTurns.filter(
    (t) => t.intent?.intent_confidence !== undefined || t.subLoopDebug !== undefined,
  )

  if (v4Turns.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground text-center px-4">
        No v4 turns yet — send a message with agentId="somnio-sales-v4" in the
        sandbox to populate this tab.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {v4Turns.map((turn, idx) => {
        const payload = turn.subLoopDebug
        return (
          <div key={idx} className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Turno {turn.turnNumber}</span>
              {payload ? (
                <Badge variant="default" className="text-[10px]">
                  sub-loop fired
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  not fired
                </Badge>
              )}
            </div>

            {payload ? (
              <>
                <BannerSection payload={payload} />
                {payload.errorMessage && (
                  <ViolationBanner kind="error" message={payload.errorMessage} />
                )}
                {payload.invariantViolation && (
                  <ViolationBanner kind="invariant" message={payload.invariantViolation} />
                )}
                {payload.nuncaDecirViolation && (
                  <ViolationBanner kind="nunca_decir" message={payload.nuncaDecirViolation} />
                )}
                <ToolCallsTimeline payload={payload} />
                {/* Pitfall 5: undefined kbHits = kb_search not invoked OR shape mismatch. */}
                {payload.kbHits !== undefined ? (
                  <KbHitsSection hits={payload.kbHits} />
                ) : (
                  <KbNotConsulted />
                )}
                <OutcomeSection payload={payload} />
              </>
            ) : (
              <FiredFalseExplainer turn={turn} />
            )}
          </div>
        )
      })}
    </div>
  )
}
```

DO NOT use emojis other than what's already imported via lucide-react icons (D-10).
</action>

<acceptance_criteria>
- `test -f /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx` returns 0
- `grep -c "export function SubloopTab" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx` returns 1
- `grep -c "'use client'" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx` returns 1
- `grep -cE "filter\\(\\(t\\) => t\\.intent\\?\\.intent_confidence" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx` returns 1
- `grep -c "KB not consulted" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx` returns 1
- `grep -c "Sub-loop did not fire" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx` returns 1
- `grep -cE "\\bany\\b" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx` returns 0 (zero `any` per D-10; legitimate `Many` / etc don't match `\bany\b`)
- File is ≥ 200 lines
</acceptance_criteria>

### Task 2: Register tab in `debug-tabs.tsx`

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx (lines 16-25 = DEFAULT_TABS)
</read_first>

<action>
Edit `src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx`. Find the existing `DEFAULT_TABS` block at lines 16-25:

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

Add a new entry AFTER `config`:

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
  { id: 'subloop', label: 'Sub-Loop', visible: false },
]
```
</action>

<acceptance_criteria>
- `grep -c "id: 'subloop', label: 'Sub-Loop', visible: false" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx` returns 1
</acceptance_criteria>

### Task 3: Route `'subloop'` in `panel-container.tsx`

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx (lines 1-20 imports; lines 40-78 PanelContent switch)
</read_first>

<action>
Edit `src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx`:

**Step 1 — Import.** Find the import block at lines 12-19. After `import { ConfigTab } from './config-tab'`, add:

```typescript
import { SubloopTab } from './subloop-tab'
```

**Step 2 — Switch case.** Find the `PanelContent` function switch at lines 41-76. Add a new case BEFORE `default:`:

```typescript
    case 'subloop':
      return <SubloopTab debugTurns={props.debugTurns} />
```

Place this case after the existing `case 'config':` block (which spans lines 63-74).
</action>

<acceptance_criteria>
- `grep -c "import { SubloopTab } from './subloop-tab'" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` returns 1
- `grep -c "case 'subloop'" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` returns 1
- `grep -c "<SubloopTab debugTurns={props.debugTurns} />" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx` returns 1
</acceptance_criteria>

### Task 4: Add icon in `tab-bar.tsx` TAB_ICONS map

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx (lines 17-30 — imports + TAB_ICONS map)
</read_first>

<action>
Edit `src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx`:

**Step 1 — Import Activity icon.** Find the existing lucide-react import at line 17:

```typescript
import { Wrench, FileJson, Coins, Database, Settings, X, GitBranch, Target, Package } from 'lucide-react'
```

Add `Activity` to the import list (alphabetical placement):

```typescript
import { Activity, Wrench, FileJson, Coins, Database, Settings, X, GitBranch, Target, Package } from 'lucide-react'
```

**Step 2 — Extend TAB_ICONS map.** Find the existing map at lines 21-30:

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

Add `subloop: Activity,` after `config: Settings,`:

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
  subloop: Activity,
}
```
</action>

<acceptance_criteria>
- `grep -c "Activity" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx` returns >= 2 (import + map)
- `grep -c "subloop: Activity" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx` returns 1
</acceptance_criteria>

### Task 5: Re-export from `index.ts`

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/index.ts (lines 1-15)
</read_first>

<action>
Edit `src/app/(dashboard)/sandbox/components/debug-panel/index.ts`. Find the existing exports block:

```typescript
export { DebugTabs } from './debug-tabs'
export { DebugV3 } from './debug-v3'
export { ToolsTab } from './tools-tab'
export { StateTab } from './state-tab'
export { ClassifyTab } from './classify-tab'
export { TokensTab } from './tokens-tab'
export { IngestTab } from './ingest-tab'
export { ConfigTab } from './config-tab'
export { TabBar } from './tab-bar'
export { PanelContainer } from './panel-container'
```

Add a new export line AFTER `export { ConfigTab } from './config-tab'`:

```typescript
export { SubloopTab } from './subloop-tab'
```

Result: keeps existing alphabetical-ish placement before `TabBar` / `PanelContainer` which appear last in the file. Final block:

```typescript
export { DebugTabs } from './debug-tabs'
export { DebugV3 } from './debug-v3'
export { ToolsTab } from './tools-tab'
export { StateTab } from './state-tab'
export { ClassifyTab } from './classify-tab'
export { TokensTab } from './tokens-tab'
export { IngestTab } from './ingest-tab'
export { ConfigTab } from './config-tab'
export { SubloopTab } from './subloop-tab'
export { TabBar } from './tab-bar'
export { PanelContainer } from './panel-container'
```
</action>

<acceptance_criteria>
- `grep -c "export { SubloopTab } from './subloop-tab'" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/(dashboard)/sandbox/components/debug-panel/index.ts` returns 1
</acceptance_criteria>

### Task 6: Typecheck + commit

<read_first>
- /mnt/c/Users/Usuario/Proyectos/morfx-new/CLAUDE.md
</read_first>

<action>
Run `pnpm typecheck`. Must exit 0.

Likely failure modes:
- `Cannot find module '@/lib/agents/somnio-v4/sub-loop/debug-payload'` — confirm Plan 01 committed first; if so, the path is correct.
- `Property 'subLoopDebug' does not exist on type 'DebugTurn'` — confirm Plan 01 committed the sandbox/types.ts edit.
- `Type 'string' is not assignable to type '"default" | "secondary" | "destructive"'` — fix in `getOutcomeStatusBadge` return type if TypeScript narrowing trips up.

After typecheck passes:

```bash
git add src/app/\(dashboard\)/sandbox/components/debug-panel/subloop-tab.tsx \
        src/app/\(dashboard\)/sandbox/components/debug-panel/debug-tabs.tsx \
        src/app/\(dashboard\)/sandbox/components/debug-panel/panel-container.tsx \
        src/app/\(dashboard\)/sandbox/components/debug-panel/tab-bar.tsx \
        src/app/\(dashboard\)/sandbox/components/debug-panel/index.ts

git commit -m "$(cat <<'EOF'
feat(v4-subloop-debug-view): new Sub-Loop tab in sandbox debug panel

Standalone: v4-subloop-debug-view / Plan 04 (D-04, D-05).

- NEW subloop-tab.tsx renders SubLoopDebugPayload per turn:
  banner (reason + fired + finishReason + latencyMs), fired=false explainer
  for v4 turns where confidence >= threshold, tool calls timeline
  (expandable, AI SDK v6 input/output preview truncated 500ch), KB Hits
  section with similarity bars (handles undefined = "KB not consulted"
  per Pitfall 5), Outcome section (status + responseTemplate +
  canonicalText preview), red banners for invariantViolation /
  nuncaDecirViolation / errorMessage.
- Tab registered in DEFAULT_TABS (debug-tabs.tsx).
- PanelContainer switch routes 'subloop' to SubloopTab.
- TabBar TAB_ICONS map includes Activity icon for subloop.
- index.ts re-exports SubloopTab.

Mirrors classify-tab.tsx + tools-tab.tsx patterns for visual consistency.
Zero `any` per D-10. Pitfall 5 (kb_search may not be invoked) handled
via undefined kbHits guard.

LOCKED files untouched. Regla 6 cross-agent untouched.

Co-authored-by: Claude <noreply@anthropic.com>
EOF
)"
```

Do NOT push — Plan 05 batches push.
</action>

<acceptance_criteria>
- `pnpm typecheck` exits 0
- `git log --oneline -1` shows `feat(v4-subloop-debug-view): new Sub-Loop tab in sandbox debug panel`
- `git diff origin/main..HEAD --name-only` after Plan 04 (assuming Plan 01 also landed; Plan 02/03 may or may not land before Plan 04 since Plan 04 is parallel-safe with Plan 02) includes:
  - src/app/(dashboard)/sandbox/components/debug-panel/subloop-tab.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/debug-tabs.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/panel-container.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/tab-bar.tsx
  - src/app/(dashboard)/sandbox/components/debug-panel/index.ts
- `git diff origin/main -- 'src/lib/agents/somnio-v3/**' 'src/lib/agents/somnio-recompra/**' 'src/lib/agents/godentist/**' 'src/lib/agents/godentist-fb-ig/**' 'src/lib/agents/somnio-pw-confirmation/**'` is empty
</acceptance_criteria>

## Verification

After this plan:
- New tab visible in /sandbox debug panel (must be activated from tab bar via click — `visible: false` default)
- For non-v4 turns, the tab renders empty-state explainer
- For v4 turns without sub-loop fired, the tab renders the fired=false card per turn
- For v4 turns WITH sub-loop fired, the tab renders the full payload (visualization untested until Plan 05 smoke)
