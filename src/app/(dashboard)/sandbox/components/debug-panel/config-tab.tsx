'use client'

/**
 * Config Tab Component
 * Sandbox bot configuration: response delay slider + timer controls.
 *
 * The slider controls the average response delay for bot messages.
 * Delay is proportional to message length via calculateCharDelay().
 *
 * Timer controls migrated from Ingest tab (Debug Panel v4.0, dp4-05).
 */

import { Zap, Clock, Timer } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { TIMER_PRESETS, TIMER_DEFAULTS } from '@/lib/sandbox/ingest-timer'
import { calculateCharDelay } from '@/lib/agents/somnio/char-delay'
import type { TimerConfig, TimerPreset } from '@/lib/sandbox/types'

// ============================================================================
// Response Delay Constants
// ============================================================================

/** Average template length in characters (based on somnio templates analysis) */
export const AVG_TEMPLATE_CHARS = 85

/** Default delay = calculateCharDelay for average template (~8000ms) */
export const DEFAULT_DELAY_MS = calculateCharDelay(AVG_TEMPLATE_CHARS)

/** Quick-set button presets */
const DELAY_SHORTCUTS = [
  { label: 'Instantaneo', icon: Zap, delayMs: 0 },
  { label: 'Rapido', icon: Timer, delayMs: 3000 },
  { label: 'Real', icon: Clock, delayMs: DEFAULT_DELAY_MS },
] as const

// ============================================================================
// Timer Controls Helpers (migrated from ingest-tab.tsx)
// ============================================================================

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '0s'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (secs === 0) return `${mins}min`
  return `${mins}min ${secs}s`
}

/** Timer level display info (name only, no evaluate/buildAction) */
const TIMER_LEVEL_INFO = [
  { id: 0, name: 'Sin datos' },
  { id: 1, name: 'Datos parciales' },
  { id: 2, name: 'Datos minimos' },
  { id: 3, name: 'Promos sin respuesta' },
  { id: 4, name: 'Pack sin confirmar' },
]

/** Slider range config per level: min/max/step in seconds */
const SLIDER_CONFIG: Record<number, { min: number; max: number; step: number }> = {
  0: { min: 0, max: 900, step: 10 },
  1: { min: 0, max: 600, step: 10 },
  2: { min: 0, max: 300, step: 5 },
  3: { min: 0, max: 900, step: 10 },
  4: { min: 0, max: 900, step: 10 },
}

// ============================================================================
// Timer Controls Component (migrated from ingest-tab.tsx)
// ============================================================================

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
            {TIMER_LEVEL_INFO.map((level) => {
              const sliderConf = SLIDER_CONFIG[level.id]
              const currentValue = timerConfig.levels[level.id] ?? TIMER_DEFAULTS.levels[level.id] ?? 60
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
// Main Component
// ============================================================================

interface ConfigTabProps {
  agentName: string
  responseDelayMs: number
  onResponseDelayChange: (delayMs: number) => void
  // Timer controls (migrated from Ingest, dp4-05)
  timerEnabled: boolean
  timerConfig: TimerConfig
  onTimerToggle: (enabled: boolean) => void
  onTimerConfigChange: (config: TimerConfig) => void
}

export function ConfigTab({
  agentName,
  responseDelayMs,
  onResponseDelayChange,
  timerEnabled,
  timerConfig,
  onTimerToggle,
  onTimerConfigChange,
}: ConfigTabProps) {
  const displaySeconds = (responseDelayMs / 1000).toFixed(1)

  // Detect which shortcut is active (tolerance 50ms)
  const activeShortcut = DELAY_SHORTCUTS.find(
    s => Math.abs(s.delayMs - responseDelayMs) < 50
  )

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Bot Config
        </h4>
        <p className="text-sm font-medium">{agentName}</p>
      </div>

      {/* Response Delay Slider */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Velocidad de respuesta
        </label>

        {/* Quick-set buttons */}
        <div className="flex gap-1">
          {DELAY_SHORTCUTS.map((shortcut) => {
            const Icon = shortcut.icon
            const isActive = activeShortcut?.label === shortcut.label
            return (
              <button
                key={shortcut.label}
                onClick={() => onResponseDelayChange(shortcut.delayMs)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {shortcut.label}
              </button>
            )
          })}
        </div>

        {/* Slider */}
        <Slider
          value={[responseDelayMs]}
          onValueChange={(val) => onResponseDelayChange(val[0])}
          min={0}
          max={15000}
          step={500}
        />

        {/* Labels */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">0s</span>
          <span className="text-xs font-mono font-medium">{displaySeconds}s</span>
          <span className="text-[11px] text-muted-foreground">15s</span>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Plantilla promedio: ~{AVG_TEMPLATE_CHARS} chars
        </p>
      </div>

      {/* Timer Controls (migrated from Ingest tab) */}
      <TimerControlsV2
        timerEnabled={timerEnabled}
        timerConfig={timerConfig}
        onTimerToggle={onTimerToggle}
        onTimerConfigChange={onTimerConfigChange}
      />

    </div>
  )
}
