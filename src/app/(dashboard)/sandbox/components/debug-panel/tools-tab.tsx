'use client'

/**
 * Tools Tab Component
 * Phase 15: Agent Sandbox
 *
 * Expandable list of tool executions with inputs/outputs.
 * Shows tool name + status badge + mode badge (DRY/LIVE), click to expand.
 * Phase 15.6: DRY/LIVE mode badges for CRM tool visibility.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DebugTurn, ToolExecution } from '@/lib/sandbox/types'

interface ToolsTabProps {
  debugTurns: DebugTurn[]
}

function ToolExecutionItem({ tool }: { tool: ToolExecution }) {
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

        <span className="font-mono text-sm truncate flex-1">{tool.name}</span>

        {/* Mode badge for CRM tools */}
        {tool.mode && (
          <Badge
            variant={tool.mode === 'live' ? 'destructive' : 'outline'}
            className="shrink-0 text-[10px] px-1.5 py-0"
          >
            {tool.mode === 'dry-run' ? 'DRY' : 'LIVE'}
          </Badge>
        )}

        {tool.result ? (
          <Badge variant={tool.result.success ? 'default' : 'destructive'} className="shrink-0">
            {tool.result.success ? (
              <>
                <Check className="h-3 w-3 mr-1" />
                OK
              </>
            ) : (
              <>
                <X className="h-3 w-3 mr-1" />
                Error
              </>
            )}
          </Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0">Pendiente</Badge>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t bg-muted/30">
          <div className="pt-2">
            <span className="text-xs text-muted-foreground">Input:</span>
            <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto max-h-32">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>

          {tool.result && (
            <div>
              <span className="text-xs text-muted-foreground">Output:</span>
              <pre className={cn(
                'mt-1 p-2 rounded text-xs overflow-auto max-h-32',
                tool.result.success ? 'bg-background' : 'bg-destructive/10'
              )}>
                {JSON.stringify(tool.result.success ? tool.result.data : tool.result.error, null, 2)}
              </pre>
            </div>
          )}

          {tool.durationMs && (
            <div className="text-xs text-muted-foreground">
              Duracion: {tool.durationMs}ms
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ToolsTab({ debugTurns }: ToolsTabProps) {
  // Collect all tool executions from all turns
  const allTools = debugTurns.flatMap((turn, turnIdx) =>
    turn.tools.map((tool, toolIdx) => ({
      ...tool,
      turnNumber: turn.turnNumber,
      key: `${turnIdx}-${toolIdx}`,
    }))
  )

  if (allTools.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No se han ejecutado tools todavia
      </div>
    )
  }

  // Count by mode for summary
  const dryRunCount = allTools.filter(t => t.mode === 'dry-run').length
  const liveCount = allTools.filter(t => t.mode === 'live').length
  const noModeCount = allTools.filter(t => !t.mode).length

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
        <span>
          {allTools.length} tool{allTools.length !== 1 ? 's' : ''} ejecutado{allTools.length !== 1 ? 's' : ''}
        </span>
        {dryRunCount > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {dryRunCount} DRY
          </Badge>
        )}
        {liveCount > 0 && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            {liveCount} LIVE
          </Badge>
        )}
      </div>

      {allTools.map(tool => (
        <ToolExecutionItem key={tool.key} tool={tool} />
      ))}
    </div>
  )
}
