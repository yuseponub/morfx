'use client'

/**
 * Classify Tab Component
 * Debug Panel v4.0: standalone/debug-panel-v4
 *
 * Replaces Intent tab. Shows:
 * 1. Intent detection (migrated from intent-tab.tsx)
 * 2. Message category classification (RESPONDIBLE/SILENCIOSO/HANDOFF)
 * 3. Ofi Inter detection (routes 1 and 3)
 * 4. Disambiguation log (when HANDOFF by low confidence)
 */

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

// ============================================================================
// Helpers (confidence logic migrated from intent-tab.tsx)
// ============================================================================

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

function getCategoryColor(category: string): string {
  switch (category) {
    case 'RESPONDIBLE':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300'
    case 'SILENCIOSO':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-300'
    case 'HANDOFF':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
  }
}

const RULE_LABELS: Record<string, string> = {
  rule1: 'HANDOFF_INTENTS',
  rule1_5: 'confidence<80%',
  rule2: 'acknowledgment',
  rule3: 'default',
}

// ============================================================================
// Sub-components
// ============================================================================

/** Section 1: Intent detection (migrated from intent-tab.tsx) */
function IntentSection({ turn }: { turn: DebugTurn }) {
  if (!turn.intent) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Target className="h-3.5 w-3.5" />
        Intent
      </div>

      {/* Intent name badge */}
      <div className="flex items-center gap-2">
        <Badge variant={getConfidenceBadge(turn.intent.confidence)}>
          {turn.intent.intent}
        </Badge>
      </div>

      {/* Confidence bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Confianza</span>
          <span className={cn('font-medium', getConfidenceColor(turn.intent.confidence))}>
            {turn.intent.confidence}%
          </span>
        </div>
        <Progress value={turn.intent.confidence} className="h-2" />
      </div>

      {/* Alternatives */}
      {turn.intent.alternatives && turn.intent.alternatives.length > 0 && (
        <div className="pt-1">
          <span className="text-xs text-muted-foreground">Alternativas:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {turn.intent.alternatives.map((alt, altIdx) => (
              <Badge key={altIdx} variant="outline" className="text-xs">
                {alt.intent} ({alt.confidence}%)
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Reasoning */}
      {turn.intent.reasoning && (
        <div className="pt-1">
          <span className="text-xs text-muted-foreground">Razonamiento:</span>
          <p className="text-xs mt-0.5 text-muted-foreground/80">{turn.intent.reasoning}</p>
        </div>
      )}
    </div>
  )
}

/** Section 2: Message category classification */
function CategorySection({ turn }: { turn: DebugTurn }) {
  if (!turn.classification) return null

  const { category, reason, rulesChecked } = turn.classification

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Shield className="h-3.5 w-3.5" />
        Categoria
      </div>

      {/* Category badge */}
      <div>
        <span className={cn(
          'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border',
          getCategoryColor(category)
        )}>
          {category === 'RESPONDIBLE' && '🟢'}
          {category === 'SILENCIOSO' && '🟡'}
          {category === 'HANDOFF' && '🔴'}
          {' '}{category}
        </span>
      </div>

      {/* Reason */}
      <p className="text-xs text-muted-foreground">{reason}</p>

      {/* Rules checked — 2x2 grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {Object.entries(rulesChecked).map(([ruleKey, matched]) => (
          <div
            key={ruleKey}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs',
              matched
                ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                : 'bg-muted/40 text-muted-foreground'
            )}
          >
            {matched ? (
              <XIcon className="h-3 w-3 text-red-500 shrink-0" />
            ) : (
              <Check className="h-3 w-3 text-green-500 shrink-0" />
            )}
            <span className="truncate">{RULE_LABELS[ruleKey] ?? ruleKey}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Section 3: Ofi Inter detection (routes 1 and 3) */
function OfiInterSection({ turn }: { turn: DebugTurn }) {
  if (!turn.ofiInter) return null

  const { route1, route3 } = turn.ofiInter

  // Only show if at least one route has detection data
  const hasData = route1.detected || route3.detected || route1.pattern || route3.city
  if (!hasData) return null

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        Ofi Inter
      </div>

      {/* Route 1: Mencion directa */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground min-w-[80px]">Ruta 1:</span>
        {route1.detected ? (
          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check className="h-3 w-3" />
            Mencion directa
            {route1.pattern && (
              <Badge variant="outline" className="text-xs ml-1">{route1.pattern}</Badge>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground/60">No detectada</span>
        )}
      </div>

      {/* Route 3: Municipio remoto */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground min-w-[80px]">Ruta 3:</span>
        {route3.detected ? (
          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check className="h-3 w-3" />
            Municipio remoto
            {route3.city && (
              <Badge variant="outline" className="text-xs ml-1">{route3.city}</Badge>
            )}
            {route3.isRemote !== undefined && (
              <span className={cn(
                'text-xs',
                route3.isRemote ? 'text-orange-500' : 'text-muted-foreground/60'
              )}>
                {route3.isRemote ? '(remoto)' : '(local)'}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground/60">No detectado</span>
        )}
      </div>
    </div>
  )
}

/** Section 4: Disambiguation log (only shown when logged=true) */
function DisambiguationSection({ turn }: { turn: DebugTurn }) {
  const [expanded, setExpanded] = useState(false)

  if (!turn.disambiguationLog || !turn.disambiguationLog.logged) return null

  const log = turn.disambiguationLog

  return (
    <div className="space-y-2 pt-2 border-t">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
        Disambiguation Log
      </button>

      {expanded && (
        <div className="space-y-2 pl-5">
          {/* Top intents table */}
          {log.topIntents && log.topIntents.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Top intents:</span>
              <div className="mt-1 space-y-0.5">
                {log.topIntents.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span>{item.intent}</span>
                    <span className={cn('font-mono', getConfidenceColor(item.confidence))}>
                      {item.confidence}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            {log.templatesSent !== undefined && (
              <div>
                <span className="text-muted-foreground block">Templates</span>
                <span className="font-medium">{log.templatesSent}</span>
              </div>
            )}
            {log.pendingCount !== undefined && (
              <div>
                <span className="text-muted-foreground block">Pending</span>
                <span className="font-medium">{log.pendingCount}</span>
              </div>
            )}
            {log.historyTurns !== undefined && (
              <div>
                <span className="text-muted-foreground block">Turnos</span>
                <span className="font-medium">{log.historyTurns}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main component
// ============================================================================

export function ClassifyTab({ debugTurns }: ClassifyTabProps) {
  // Filter turns that have intent data (same pattern as old intent-tab.tsx)
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
        <div key={idx} className="border rounded-lg p-3 space-y-3">
          {/* Turn header */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Turno {turn.turnNumber}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(turn.intent!.timestamp), 'HH:mm:ss')}
            </span>
          </div>

          {/* 1. Intent section (migrated from intent-tab.tsx) */}
          <IntentSection turn={turn} />

          {/* 2. Category section (new — only if classification data exists) */}
          <CategorySection turn={turn} />

          {/* 3. Ofi Inter section (new — only if ofiInter data exists) */}
          <OfiInterSection turn={turn} />

          {/* 4. Disambiguation log (new — only if logged=true) */}
          <DisambiguationSection turn={turn} />
        </div>
      ))}
    </div>
  )
}
