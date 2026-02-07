'use client'

/**
 * Debug Panel Container
 * Phase 15.6: Sandbox Evolution
 *
 * Renders 1-3 visible debug panels in a responsive CSS grid.
 * Each panel renders the corresponding tab component.
 */

import { cn } from '@/lib/utils'
import { ToolsTab } from './tools-tab'
import { StateTab } from './state-tab'
import { IntentTab } from './intent-tab'
import { TokensTab } from './tokens-tab'
import type { DebugPanelTabId, DebugTurn, SandboxState } from '@/lib/sandbox/types'

interface PanelContainerProps {
  visiblePanels: DebugPanelTabId[]
  debugTurns: DebugTurn[]
  state: SandboxState
  onStateEdit: (newState: SandboxState) => void
  totalTokens: number
}

function PanelContent({ id, ...props }: { id: DebugPanelTabId } & Omit<PanelContainerProps, 'visiblePanels'>) {
  switch (id) {
    case 'tools':
      return <ToolsTab debugTurns={props.debugTurns} />
    case 'state':
      return <StateTab state={props.state} onStateEdit={props.onStateEdit} />
    case 'intent':
      return <IntentTab debugTurns={props.debugTurns} />
    case 'tokens':
      return <TokensTab debugTurns={props.debugTurns} totalTokens={props.totalTokens} />
    case 'ingest':
      // IngestTab will be created in Plan 04. Show placeholder for now.
      return (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Tab Ingest (disponible pronto)
        </div>
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
