'use client'

/**
 * Ingest Tab Component
 * Phase 15.7: Ingest Timer Pluggable - Plan 02
 *
 * Shows ingest status, classification timeline, and 5-level timer configuration.
 * Provides visibility into the silent data accumulation process during collecting_data mode.
 *
 * Timer controls:
 * - Toggle to enable/disable timer simulation
 * - 3 presets (Real / Rapido / Instantaneo) set all 5 levels simultaneously
 * - 5 independent sliders for fine-tuning each level
 * - Countdown display showing remaining time + level name
 * - Pause/Resume button for active timer
 */

import { Activity, Clock, Database, Pause, Play, Tag, Timer, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { TIMER_PRESETS, TIMER_LEVELS, TIMER_DEFAULTS } from '@/lib/sandbox/ingest-timer'
import type { SandboxState, IngestTimelineEntry, TimerState, TimerConfig, TimerPreset } from '@/lib/sandbox/types'

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
// Timer Display (replaces old TimerCountdown)
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
// Status Grid (updated with timer display)
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

        {/* Timer countdown (Phase 15.7) */}
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
// Timer Controls V2 (5-level configuration)
// ============================================================================

/** Slider range config per level: min/max/step in seconds */
const SLIDER_CONFIG: Record<number, { min: number; max: number; step: number }> = {
  0: { min: 0, max: 900, step: 10 },
  1: { min: 0, max: 600, step: 10 },
  2: { min: 0, max: 300, step: 5 },
  3: { min: 0, max: 900, step: 10 },
  4: { min: 0, max: 900, step: 10 },
}

function TimerControlsV2({
  timerEnabled,
  timerConfig,
  onTimerToggle,
  onTimerConfigChange,
}: {
  timerEnabled: boolean
  timerConfig: TimerConfig
  onTimerToggle: (enabled: boolean) => void
  onTimerConfigChange: (config: TimerConfig) => void
}) {
  // Detect current preset from config values
  const detectPreset = (config: TimerConfig): TimerPreset | null => {
    for (const [key, presetConfig] of Object.entries(TIMER_PRESETS)) {
      const matches = Object.keys(presetConfig.levels).every(
        k => presetConfig.levels[Number(k)] === config.levels[Number(k)]
      )
      if (matches) return key as TimerPreset
    }
    return null
  }

  const currentPreset = detectPreset(timerConfig)

  const handlePresetChange = (value: string) => {
    if (!value) return
    const preset = value as TimerPreset
    onTimerConfigChange(TIMER_PRESETS[preset])
  }

  const handleLevelChange = (levelId: number, seconds: number) => {
    onTimerConfigChange({
      levels: { ...timerConfig.levels, [levelId]: seconds },
    })
  }

  return (
    <div className="border rounded-lg p-3 space-y-3">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Timer Simulacion</span>
        </div>
        <Switch
          size="sm"
          checked={timerEnabled}
          onCheckedChange={onTimerToggle}
        />
      </div>

      {timerEnabled && (
        <>
          {/* Preset buttons */}
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Preset</div>
            <ToggleGroup
              type="single"
              value={currentPreset ?? ''}
              onValueChange={handlePresetChange}
              size="sm"
              className="gap-1"
            >
              {Object.entries(TIMER_PRESETS).map(([key]) => (
                <ToggleGroupItem
                  key={key}
                  value={key}
                  className="text-xs px-3"
                >
                  <span className="capitalize">{key}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* 5 sliders - one per timer level */}
          <div className="space-y-2.5">
            {TIMER_LEVELS.map((level) => {
              const sliderConf = SLIDER_CONFIG[level.id]
              const currentValue = timerConfig.levels[level.id] ?? level.defaultDurationS
              return (
                <div key={level.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      L{level.id}: {level.name}
                    </span>
                    <span className="text-xs font-mono font-medium">
                      {formatSeconds(currentValue)}
                    </span>
                  </div>
                  <Slider
                    value={[currentValue]}
                    onValueChange={(val) => handleLevelChange(level.id, val[0])}
                    min={sliderConf.min}
                    max={sliderConf.max}
                    step={sliderConf.step}
                  />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Main IngestTab Component
// ============================================================================

interface IngestTabProps {
  state: SandboxState
  timerState: TimerState
  timerEnabled: boolean
  timerConfig: TimerConfig
  onTimerToggle: (enabled: boolean) => void
  onTimerConfigChange: (config: TimerConfig) => void
  onTimerPause: () => void
}

export function IngestTab({
  state,
  timerState,
  timerEnabled,
  timerConfig,
  onTimerToggle,
  onTimerConfigChange,
  onTimerPause,
}: IngestTabProps) {
  const timeline = state.ingestStatus?.timeline ?? []

  return (
    <div className="space-y-4">
      {/* Section 1: Status grid with timer display */}
      <StatusGrid state={state} timerState={timerState} onTimerPause={onTimerPause} />

      {/* Section 2: Classification timeline */}
      <Timeline entries={timeline} />

      {/* Section 3: Timer controls (5 levels, 3 presets) */}
      <TimerControlsV2
        timerEnabled={timerEnabled}
        timerConfig={timerConfig}
        onTimerToggle={onTimerToggle}
        onTimerConfigChange={onTimerConfigChange}
      />
    </div>
  )
}
