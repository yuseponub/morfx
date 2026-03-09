'use client'

/**
 * Ingest Tab Component
 * Debug Panel v4.0: standalone/debug-panel-v4 (dp4-05)
 *
 * Shows ingest status, classification timeline, and extraction details.
 * Timer DISPLAY stays here (countdown + pause), but timer CONTROLS
 * (toggle, presets, sliders) have been migrated to Config tab.
 *
 * New sections (v4.0):
 * - Extraction Details: per-turn classification + extracted fields
 * - Implicit Yes: detection status per turn
 * - Ofi Inter Ruta 2: city without address detection
 */

import { Activity, ChevronDown, ChevronRight, Clock, Code, Database, MapPin, Pause, Play, Search, Sparkles, Tag, Timer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { format } from 'date-fns'
import type { DebugTurn, SandboxState, IngestTimelineEntry, TimerState } from '@/lib/sandbox/types'

// ============================================================================
// Classification Colors
// ============================================================================

function getClassificationColor(classification: string): string {
  switch (classification) {
    case 'datos':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    case 'pregunta':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    case 'mixto':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
    case 'irrelevante':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
  }
}

function getClassificationBadgeVariant(classification: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (classification) {
    case 'datos':
      return 'default'
    case 'pregunta':
      return 'secondary'
    case 'mixto':
      return 'outline'
    case 'irrelevante':
      return 'destructive'
    default:
      return 'outline'
  }
}

function getActionColor(action: string): string {
  switch (action) {
    case 'silent':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    case 'respond':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    case 'complete':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
    case 'ask_ofi_inter':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
  }
}

// ============================================================================
// Timer Display (countdown badge + pause, stays in Ingest)
// ============================================================================

function TimerDisplay({ timerState, onPause }: { timerState: TimerState; onPause: () => void }) {
  if (!timerState.active || timerState.level === null) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  const totalSeconds = Math.ceil(timerState.remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <div className="flex items-center gap-1.5">
      <Timer className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm font-medium font-mono">{display}</span>
      <span className="text-xs text-muted-foreground">
        (L{timerState.level}: {timerState.levelName})
      </span>
      <button
        onClick={onPause}
        className="p-0.5 rounded hover:bg-muted"
        title={timerState.paused ? 'Reanudar' : 'Pausar'}
      >
        {timerState.paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
      </button>
    </div>
  )
}

// ============================================================================
// Status Grid (with timer display)
// ============================================================================

function StatusGrid({
  state,
  timerState,
  onTimerPause,
}: {
  state: SandboxState
  timerState: TimerState
  onTimerPause: () => void
}) {
  const ingest = state.ingestStatus
  const isActive = ingest?.active ?? false
  const fieldsCount = ingest?.fieldsAccumulated?.length ?? 0
  const lastClassification = ingest?.lastClassification ?? null

  return (
    <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Estado de Ingest</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Active status */}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Estado</div>
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'h-2 w-2 rounded-full',
              isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            )} />
            <span className="text-sm font-medium">
              {isActive ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>

        {/* Fields accumulated */}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Campos</div>
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">{fieldsCount} / 8</span>
          </div>
        </div>

        {/* Last classification */}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Ultima clasificacion</div>
          {lastClassification ? (
            <Badge variant={getClassificationBadgeVariant(lastClassification)} className="text-xs">
              {lastClassification}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>

        {/* Timer countdown */}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Timer</div>
          <TimerDisplay timerState={timerState} onPause={onTimerPause} />
        </div>
      </div>

      {/* Fields list */}
      {fieldsCount > 0 && ingest && (
        <div className="pt-2 border-t">
          <div className="text-xs text-muted-foreground mb-1.5">Campos acumulados:</div>
          <div className="flex flex-wrap gap-1">
            {ingest.fieldsAccumulated.map((field) => (
              <Badge key={field} variant="outline" className="text-xs">
                <Tag className="h-3 w-3 mr-1" />
                {field}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Timeline
// ============================================================================

function Timeline({ entries }: { entries: IngestTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
        No hay clasificaciones todavia
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        Timeline de clasificaciones ({entries.length})
      </div>

      <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
        {entries.map((entry, idx) => (
          <div
            key={idx}
            className="border rounded-lg p-2.5 space-y-1.5 text-sm"
          >
            {/* Header: timestamp + classification badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">
                {format(new Date(entry.timestamp), 'HH:mm:ss')}
              </span>
              <div className="flex items-center gap-2">
                <Badge
                  className={cn('text-xs', getClassificationColor(entry.classification))}
                  variant="outline"
                >
                  {entry.classification}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {entry.confidence}%
                </span>
              </div>
            </div>

            {/* Message (truncated) */}
            <p className="text-xs text-muted-foreground truncate">
              {entry.message}
            </p>

            {/* Fields extracted */}
            {entry.fieldsExtracted.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {entry.fieldsExtracted.map((field) => (
                  <Badge key={field} variant="secondary" className="text-xs py-0">
                    {field}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Ingest State JSON Viewer
// ============================================================================

function IngestStateViewer({ state }: { state: SandboxState }) {
  const [expanded, setExpanded] = useState(false)
  const ingest = state.ingestStatus

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Code className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Estado Ingest (JSON)</span>
        <Badge variant="outline" className="ml-auto text-xs">
          {state.currentMode}
        </Badge>
      </button>
      {expanded && (
        <pre className="p-3 border-t bg-muted/30 text-xs font-mono overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap">
          {JSON.stringify(
            {
              currentMode: state.currentMode,
              ingestStatus: ingest ?? null,
              datosCapturados: state.datosCapturados,
              packSeleccionado: state.packSeleccionado,
            },
            null,
            2
          )}
        </pre>
      )}
    </div>
  )
}

// ============================================================================
// NEW: Extraction Details Section (v4.0)
// ============================================================================

function ExtractionDetailsSection({ debugTurns }: { debugTurns: DebugTurn[] }) {
  const turnsWithIngest = debugTurns.filter(t => t.ingestDetails)

  if (turnsWithIngest.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" />
        Extraction Details ({turnsWithIngest.length} turnos)
      </div>

      <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
        {turnsWithIngest.map((turn) => {
          const d = turn.ingestDetails!
          return (
            <div key={turn.turnNumber} className="border rounded-lg p-2.5 space-y-1.5">
              {/* Header: turn number + classification badge + action */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">T{turn.turnNumber}</span>
                <div className="flex items-center gap-1.5">
                  {d.classification && (
                    <Badge
                      className={cn('text-xs', getClassificationColor(d.classification))}
                      variant="outline"
                    >
                      {d.classification}
                      {d.classificationConfidence !== undefined && (
                        <span className="ml-1 opacity-70">{d.classificationConfidence}%</span>
                      )}
                    </Badge>
                  )}
                  {d.action && (
                    <Badge
                      className={cn('text-xs', getActionColor(d.action))}
                      variant="outline"
                    >
                      {d.action}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Extracted fields as tags */}
              {d.extractedFields && d.extractedFields.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {d.extractedFields.map((f, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs py-0">
                      {f.field}: {f.value}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// NEW: Implicit Yes Section (v4.0)
// ============================================================================

function ImplicitYesSection({ debugTurns }: { debugTurns: DebugTurn[] }) {
  const turnsWithImplicitYes = debugTurns.filter(t => t.ingestDetails?.implicitYes)

  if (turnsWithImplicitYes.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" />
        Implicit Yes
      </div>

      <div className="space-y-1.5">
        {turnsWithImplicitYes.map((turn) => {
          const iy = turn.ingestDetails!.implicitYes!
          return (
            <div key={turn.turnNumber} className="border rounded-lg p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">T{turn.turnNumber}</span>
                <Badge
                  variant={iy.triggered ? 'default' : 'outline'}
                  className="text-xs"
                >
                  {iy.triggered ? 'Triggered' : 'Not triggered'}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Data found: {iy.dataFound ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">si</span>
                ) : (
                  <span>no</span>
                )}</span>
                {iy.modeTransition && (
                  <span>Transicion: <span className="font-medium">{iy.modeTransition}</span></span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// NEW: Ofi Inter Ruta 2 Section (v4.0)
// ============================================================================

function OfiInterRoute2Section({ debugTurns }: { debugTurns: DebugTurn[] }) {
  const turnsWithR2 = debugTurns.filter(t => t.ingestDetails?.action === 'ask_ofi_inter')

  if (turnsWithR2.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5" />
        Ofi Inter Ruta 2
      </div>

      <div className="space-y-1.5">
        {turnsWithR2.map((turn) => {
          const d = turn.ingestDetails!
          // Try to find city from extracted fields
          const cityField = d.extractedFields?.find(f => f.field === 'ciudad')
          return (
            <div key={turn.turnNumber} className="border rounded-lg p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">T{turn.turnNumber}</span>
                <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300">
                  Ciudad sin direccion detectada
                </Badge>
              </div>
              {cityField && (
                <div className="text-xs text-muted-foreground mt-1">
                  Ciudad: <span className="font-medium">{cityField.value}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Main IngestTab Component
// ============================================================================

interface IngestTabProps {
  state: SandboxState
  debugTurns: DebugTurn[]
  timerState: TimerState
  onTimerPause: () => void
}

export function IngestTab({
  state,
  debugTurns,
  timerState,
  onTimerPause,
}: IngestTabProps) {
  const timeline = state.ingestStatus?.timeline ?? []

  return (
    <div className="space-y-4">
      {/* Section 1: Status grid with timer display */}
      <StatusGrid state={state} timerState={timerState} onTimerPause={onTimerPause} />

      {/* Section 2: Ingest state JSON snapshot */}
      <IngestStateViewer state={state} />

      {/* Section 3: Classification timeline */}
      <Timeline entries={timeline} />

      {/* Section 4: Extraction Details (v4.0) */}
      <ExtractionDetailsSection debugTurns={debugTurns} />

      {/* Section 5: Implicit Yes (v4.0) */}
      <ImplicitYesSection debugTurns={debugTurns} />

      {/* Section 6: Ofi Inter Ruta 2 (v4.0) */}
      <OfiInterRoute2Section debugTurns={debugTurns} />
    </div>
  )
}
