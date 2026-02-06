'use client'

/**
 * Intent Tab Component
 * Phase 15: Agent Sandbox
 *
 * Shows intent detected + confidence score per message.
 */

import { Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { DebugTurn } from '@/lib/sandbox/types'

interface IntentTabProps {
  debugTurns: DebugTurn[]
}

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

export function IntentTab({ debugTurns }: IntentTabProps) {
  // Filter turns that have intent info
  const turnsWithIntent = debugTurns.filter(turn => turn.intent)

  if (turnsWithIntent.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No hay detecciones de intent todavia
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {turnsWithIntent.map((turn, idx) => (
        <div key={idx} className="border rounded-lg p-3 space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Turno {turn.turnNumber}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {format(new Date(turn.intent!.timestamp), 'HH:mm:ss')}
            </span>
          </div>

          {/* Intent name */}
          <div className="flex items-center gap-2">
            <Badge variant={getConfidenceBadge(turn.intent!.confidence)}>
              {turn.intent!.intent}
            </Badge>
          </div>

          {/* Confidence bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Confianza</span>
              <span className={cn('font-medium', getConfidenceColor(turn.intent!.confidence))}>
                {turn.intent!.confidence}%
              </span>
            </div>
            <Progress value={turn.intent!.confidence} className="h-2" />
          </div>

          {/* Alternatives if present */}
          {turn.intent!.alternatives && turn.intent!.alternatives.length > 0 && (
            <div className="pt-2 border-t">
              <span className="text-xs text-muted-foreground">Alternativas:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {turn.intent!.alternatives.map((alt, altIdx) => (
                  <Badge key={altIdx} variant="outline" className="text-xs">
                    {alt.intent} ({alt.confidence}%)
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning if present */}
          {turn.intent!.reasoning && (
            <div className="pt-2 border-t">
              <span className="text-xs text-muted-foreground">Razonamiento:</span>
              <p className="text-xs mt-1">{turn.intent!.reasoning}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
