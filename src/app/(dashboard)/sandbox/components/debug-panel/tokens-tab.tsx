'use client'

/**
 * Tokens Tab Component
 * Phase 15.6: Sandbox Evolution - Plan 04
 *
 * Shows token count per turn and cumulative total,
 * plus per-model breakdown table (Haiku vs Sonnet).
 */

import { Coins, TrendingUp, Cpu } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { DebugTurn } from '@/lib/sandbox/types'
import type { ModelTokenEntry, ClaudeModel } from '@/lib/agents/types'

// ============================================================================
// Model Display Names
// ============================================================================

const MODEL_DISPLAY_NAMES: Record<ClaudeModel, string> = {
  'claude-haiku-4-5': 'Haiku',
  'claude-sonnet-4-5': 'Sonnet',
}

function getModelDisplayName(model: string): string {
  return MODEL_DISPLAY_NAMES[model as ClaudeModel] ?? model
}

function getModelColor(model: string): string {
  switch (model) {
    case 'claude-haiku-4-5':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
    case 'claude-sonnet-4-5':
      return 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
  }
}

// ============================================================================
// Per-Model Aggregation
// ============================================================================

interface ModelAggregate {
  model: string
  displayName: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

function aggregateByModel(debugTurns: DebugTurn[]): ModelAggregate[] {
  const map = new Map<string, { input: number; output: number }>()

  for (const turn of debugTurns) {
    const models = turn.tokens?.models
    if (!models) continue

    for (const entry of models) {
      const existing = map.get(entry.model) ?? { input: 0, output: 0 }
      existing.input += entry.inputTokens
      existing.output += entry.outputTokens
      map.set(entry.model, existing)
    }
  }

  return Array.from(map.entries()).map(([model, tokens]) => ({
    model,
    displayName: getModelDisplayName(model),
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    totalTokens: tokens.input + tokens.output,
  }))
}

// ============================================================================
// Sub-components
// ============================================================================

function ModelSummaryTable({ aggregates }: { aggregates: ModelAggregate[] }) {
  if (aggregates.length === 0) return null

  const grandTotal = aggregates.reduce((sum, a) => sum + a.totalTokens, 0)

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Por modelo</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="text-left py-1.5 pr-2 font-medium">Modelo</th>
              <th className="text-right py-1.5 px-2 font-medium">Input</th>
              <th className="text-right py-1.5 px-2 font-medium">Output</th>
              <th className="text-right py-1.5 pl-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {aggregates.map((agg) => (
              <tr key={agg.model} className="border-b last:border-b-0">
                <td className="py-1.5 pr-2">
                  <Badge
                    variant="outline"
                    className={cn('text-xs', getModelColor(agg.model))}
                  >
                    {agg.displayName}
                  </Badge>
                </td>
                <td className="text-right py-1.5 px-2 font-mono text-xs">
                  {agg.inputTokens.toLocaleString()}
                </td>
                <td className="text-right py-1.5 px-2 font-mono text-xs">
                  {agg.outputTokens.toLocaleString()}
                </td>
                <td className="text-right py-1.5 pl-2 font-mono text-xs font-medium">
                  {agg.totalTokens.toLocaleString()}
                </td>
              </tr>
            ))}
            {/* Grand total row */}
            {aggregates.length > 1 && (
              <tr className="border-t">
                <td className="py-1.5 pr-2 text-xs text-muted-foreground font-medium">
                  Total
                </td>
                <td className="text-right py-1.5 px-2 font-mono text-xs text-muted-foreground">
                  {aggregates.reduce((s, a) => s + a.inputTokens, 0).toLocaleString()}
                </td>
                <td className="text-right py-1.5 px-2 font-mono text-xs text-muted-foreground">
                  {aggregates.reduce((s, a) => s + a.outputTokens, 0).toLocaleString()}
                </td>
                <td className="text-right py-1.5 pl-2 font-mono text-xs font-medium">
                  {grandTotal.toLocaleString()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TurnModelBadges({ models }: { models?: ModelTokenEntry[] }) {
  if (!models || models.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {models.map((entry, idx) => (
        <Badge
          key={idx}
          variant="outline"
          className={cn('text-[10px] py-0 px-1.5', getModelColor(entry.model))}
        >
          {getModelDisplayName(entry.model)}: {entry.inputTokens}in/{entry.outputTokens}out
        </Badge>
      ))}
    </div>
  )
}

// ============================================================================
// Main TokensTab Component
// ============================================================================

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

  // Aggregate by model across all turns
  const modelAggregates = aggregateByModel(debugTurns)

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

      {/* Per-model summary table */}
      <ModelSummaryTable aggregates={modelAggregates} />

      {/* Per-turn breakdown */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground font-medium">Por turno</div>

        {turnsWithRunningTotal.map((turn, idx) => (
          <div
            key={idx}
            className="p-2 border rounded-lg text-sm"
          >
            <div className="flex items-center justify-between">
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

            {/* Per-turn model badges */}
            <TurnModelBadges models={turn.tokens?.models} />
          </div>
        ))}
      </div>
    </div>
  )
}
