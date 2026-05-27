'use client'

/**
 * Debug Panel Container
 * Phase 15.6: Sandbox Evolution
 *
 * Renders 1-3 visible debug panels in a responsive CSS grid.
 * Each panel renders the corresponding tab component.
 */

import { cn } from '@/lib/utils'
import { PipelineTab } from './pipeline-tab'
import { ToolsTab } from './tools-tab'
import { StateTab } from './state-tab'
import { ClassifyTab } from './classify-tab'
import { BloquesTab } from './bloques-tab'
import { TokensTab } from './tokens-tab'
import { IngestTab } from './ingest-tab'
import { ConfigTab } from './config-tab'
import { SubloopTab } from './subloop-tab'
import { InterruptionTab } from './interruption-tab'
import type { DebugPanelTabId, DebugTurn, SandboxState, TimerState, TimerConfig } from '@/lib/sandbox/types'

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
  // Post-smoke fix 2026-05-27: increments per new turn (debugTurns.length) so
  // InterruptionTab auto-refetches without requiring the user to toggle the tab.
  interruptionRefreshKey?: number
}

function PanelContent({ id, ...props }: { id: DebugPanelTabId } & Omit<PanelContainerProps, 'visiblePanels'>) {
  switch (id) {
    case 'pipeline':
      return <PipelineTab debugTurns={props.debugTurns} />
    case 'classify':
      return <ClassifyTab debugTurns={props.debugTurns} />
    case 'bloques':
      return <BloquesTab debugTurns={props.debugTurns} />
    case 'tools':
      return <ToolsTab debugTurns={props.debugTurns} />
    case 'state':
      return <StateTab state={props.state} onStateEdit={props.onStateEdit} />
    case 'tokens':
      return <TokensTab debugTurns={props.debugTurns} totalTokens={props.totalTokens} />
    case 'ingest':
      return (
        <IngestTab
          state={props.state}
          debugTurns={props.debugTurns}
          timerState={props.timerState}
          onTimerPause={props.onTimerPause}
        />
      )
    case 'config':
      return (
        <ConfigTab
          agentName={props.agentName}
          responseDelayMs={props.responseDelayMs}
          onResponseDelayChange={props.onResponseDelayChange}
          timerEnabled={props.timerEnabled}
          timerConfig={props.timerConfig}
          onTimerToggle={props.onTimerToggle}
          onTimerConfigChange={props.onTimerConfigChange}
        />
      )
    case 'subloop':
      return <SubloopTab debugTurns={props.debugTurns} />
    case 'interruption':
      // Standalone: debounce-v2-sandbox-integration / Plan 03 (D-08).
      // sandboxSessionId is the per-tab runtime lock id (Pitfall 6 — NOT from
      // localStorage). When non-null, InterruptionTab queries /api/observability/events
      // for the lock + checkpoint events that the v4 sandbox engine + route emit.
      // sessionId stays null because sandbox does NOT create agent_sessions rows
      // (D-11 option c in DISCUSSION-LOG); the events route resolves via
      // conversation_id directly when session_id is absent (Pitfall 4 RESOLVED
      // 2026-05-27 — agent_observability_turns.conversation_id is UUID NOT NULL without FK).
      return (
        <InterruptionTab
          conversationId={props.sandboxSessionId ?? null}
          sessionId={null}
          refreshKey={props.interruptionRefreshKey}
        />
      )
    default:
      return null
  }
}

export function PanelContainer({ visiblePanels, ...props }: PanelContainerProps) {
  if (visiblePanels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Selecciona un tab para ver el panel de debug
      </div>
    )
  }

  const gridCols =
    visiblePanels.length === 1 ? 'grid-cols-1'
    : visiblePanels.length === 2 ? 'grid-cols-2'
    : 'grid-cols-3'

  return (
    <div className={cn('grid gap-2 h-full p-2', gridCols)}>
      {visiblePanels.map(panelId => (
        <div key={panelId} className="overflow-auto border rounded-lg p-3 min-w-0">
          <PanelContent id={panelId} {...props} />
        </div>
      ))}
    </div>
  )
}
