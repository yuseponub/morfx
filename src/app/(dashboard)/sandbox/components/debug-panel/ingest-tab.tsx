'use client'

/**
 * Ingest Tab Component
 * Phase 15.6: Sandbox Evolution - Plan 04
 *
 * Shows ingest status, classification timeline, and configurable timer presets.
 * Provides visibility into the silent data accumulation process during collecting_data mode.
 */

import { useState, useEffect, useCallback } from 'react'
import { Activity, Clock, Database, Tag, Timer, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import type { SandboxState, IngestTimelineEntry } from '@/lib/sandbox/types'

// ============================================================================
// Timer Presets
// ============================================================================

type TimerPreset = 'real' | 'rapido' | 'instantaneo'

interface TimerPresetConfig {
  label: string
  description: string
  partialSeconds: number
  noDataSeconds: number
}

const TIMER_PRESETS: Record<TimerPreset, TimerPresetConfig> = {
  real: {
    label: 'Real',
    description: '6min / 10min',
    partialSeconds: 360,
    noDataSeconds: 600,
  },
  rapido: {
    label: 'Rapido',
    description: '30s / 60s',
    partialSeconds: 30,
    noDataSeconds: 60,
  },
  instantaneo: {
    label: 'Instantaneo',
    description: '0s / 0s',
    partialSeconds: 0,
    noDataSeconds: 0,
  },
}

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

// ============================================================================
// Helper: Format seconds to readable string
// ============================================================================

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '0s'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (secs === 0) return `${mins}min`
  return `${mins}min ${secs}s`
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusGrid({ state }: { state: SandboxState }) {
  const ingest = state.ingestStatus
  const isActive = ingest?.active ?? false
  const fieldsCount = ingest?.fieldsAccumulated?.length ?? 0
  const lastClassification = ingest?.lastClassification ?? null
  const timerType = ingest?.timerType ?? null

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
          <TimerCountdown ingestStatus={state.ingestStatus} />
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

function TimerCountdown({ ingestStatus }: { ingestStatus?: SandboxState['ingestStatus'] }) {
  const [remaining, setRemaining] = useState<string | null>(null)

  const calculateRemaining = useCallback(() => {
    if (!ingestStatus?.active || !ingestStatus.timerExpiresAt) {
      setRemaining(null)
      return
    }
    const expiresAt = new Date(ingestStatus.timerExpiresAt).getTime()
    const now = Date.now()
    const diff = expiresAt - now

    if (diff <= 0) {
      setRemaining('Expirado')
      return
    }

    const seconds = Math.ceil(diff / 1000)
    setRemaining(formatSeconds(seconds))
  }, [ingestStatus?.active, ingestStatus?.timerExpiresAt])

  useEffect(() => {
    calculateRemaining()
    const interval = setInterval(calculateRemaining, 1000)
    return () => clearInterval(interval)
  }, [calculateRemaining])

  if (!ingestStatus?.active || !ingestStatus.timerType) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  return (
    <div className="flex items-center gap-1.5">
      <Timer className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm font-medium font-mono">
        {remaining ?? '-'}
      </span>
      <span className="text-xs text-muted-foreground">
        ({ingestStatus.timerType === 'partial' ? 'parcial' : 'sin datos'})
      </span>
    </div>
  )
}

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

function TimerControls({
  onTimerChange,
}: {
  onTimerChange?: (partial: number, noData: number) => void
}) {
  const [preset, setPreset] = useState<TimerPreset>('real')
  const [partialSeconds, setPartialSeconds] = useState(360)
  const [noDataSeconds, setNoDataSeconds] = useState(600)

  const handlePresetChange = (value: string) => {
    if (!value) return
    const newPreset = value as TimerPreset
    setPreset(newPreset)
    const config = TIMER_PRESETS[newPreset]
    setPartialSeconds(config.partialSeconds)
    setNoDataSeconds(config.noDataSeconds)
    onTimerChange?.(config.partialSeconds, config.noDataSeconds)
  }

  const handlePartialChange = (value: number[]) => {
    const newVal = value[0]
    setPartialSeconds(newVal)
    // Detect if this matches a preset
    detectPreset(newVal, noDataSeconds)
    onTimerChange?.(newVal, noDataSeconds)
  }

  const handleNoDataChange = (value: number[]) => {
    const newVal = value[0]
    setNoDataSeconds(newVal)
    detectPreset(partialSeconds, newVal)
    onTimerChange?.(partialSeconds, newVal)
  }

  const detectPreset = (partial: number, noData: number) => {
    for (const [key, config] of Object.entries(TIMER_PRESETS)) {
      if (config.partialSeconds === partial && config.noDataSeconds === noData) {
        setPreset(key as TimerPreset)
        return
      }
    }
    // No preset matches - keep current selection visual but it's custom
  }

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Timers de Ingest</span>
      </div>

      {/* Preset buttons */}
      <div>
        <div className="text-xs text-muted-foreground mb-1.5">Preset</div>
        <ToggleGroup
          type="single"
          value={preset}
          onValueChange={handlePresetChange}
          size="sm"
          className="gap-1"
        >
          {Object.entries(TIMER_PRESETS).map(([key, config]) => (
            <ToggleGroupItem
              key={key}
              value={key}
              className="text-xs px-3"
            >
              <div className="flex flex-col items-center">
                <span>{config.label}</span>
                <span className="text-[10px] text-muted-foreground">{config.description}</span>
              </div>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Fine-tune sliders */}
      <div className="space-y-3">
        {/* Partial data timer */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Timer parcial (datos incompletos)</span>
            <span className="text-xs font-mono font-medium">{formatSeconds(partialSeconds)}</span>
          </div>
          <Slider
            value={[partialSeconds]}
            onValueChange={handlePartialChange}
            min={0}
            max={600}
            step={10}
          />
        </div>

        {/* No data timer */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Timer sin datos</span>
            <span className="text-xs font-mono font-medium">{formatSeconds(noDataSeconds)}</span>
          </div>
          <Slider
            value={[noDataSeconds]}
            onValueChange={handleNoDataChange}
            min={0}
            max={900}
            step={10}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main IngestTab Component
// ============================================================================

interface IngestTabProps {
  state: SandboxState
  onTimerChange?: (partial: number, noData: number) => void
}

export function IngestTab({ state, onTimerChange }: IngestTabProps) {
  const timeline = state.ingestStatus?.timeline ?? []

  return (
    <div className="space-y-4">
      {/* Section 1: Status grid */}
      <StatusGrid state={state} />

      {/* Section 2: Classification timeline */}
      <Timeline entries={timeline} />

      {/* Section 3: Timer controls */}
      <TimerControls onTimerChange={onTimerChange} />
    </div>
  )
}
