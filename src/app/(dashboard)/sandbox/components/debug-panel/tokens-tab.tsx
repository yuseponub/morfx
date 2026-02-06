'use client'

/**
 * Tokens Tab Component
 * Phase 15: Agent Sandbox
 *
 * Shows token count per turn and cumulative total.
 */

import { Coins, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import type { DebugTurn } from '@/lib/sandbox/types'

interface TokensTabProps {
  debugTurns: DebugTurn[]
  totalTokens: number
}

export function TokensTab({ debugTurns, totalTokens }: TokensTabProps) {
  if (debugTurns.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No hay datos de tokens todavia
      </div>
    )
  }

  // Calculate running total for each turn
  let runningTotal = 0
  const turnsWithRunningTotal = debugTurns.map(turn => {
    runningTotal += turn.tokens.tokensUsed
    return {
      ...turn,
      runningTotal,
    }
  })

  // Calculate averages
  const avgPerTurn = totalTokens / debugTurns.length

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="border rounded-lg p-4 bg-muted/30">
        <div className="flex items-center gap-2 mb-3">
          <Coins className="h-5 w-5 text-primary" />
          <span className="font-medium">Resumen de tokens</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-2xl font-bold">{totalTokens.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total acumulado</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{Math.round(avgPerTurn).toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Promedio por turno</div>
          </div>
        </div>

        {/* Budget warning */}
        {totalTokens > 40000 && (
          <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs text-yellow-700 dark:text-yellow-300">
            Aproximandose al limite de 50K tokens por conversacion
          </div>
        )}
      </div>

      {/* Per-turn breakdown */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground font-medium">Por turno</div>

        {turnsWithRunningTotal.map((turn, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-2 border rounded-lg text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-8">
                #{turn.turnNumber}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(turn.tokens.timestamp), 'HH:mm:ss')}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className="font-mono">
                +{turn.tokens.tokensUsed.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {turn.runningTotal.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
