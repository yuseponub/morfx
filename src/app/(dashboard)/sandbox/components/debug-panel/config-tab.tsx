'use client'

/**
 * Config Tab Component
 * Sandbox bot configuration: response speed presets + timer controls.
 *
 * Timer controls migrated from Ingest tab (Debug Panel v4.0, dp4-05).
 */

import { Zap, Clock, Timer } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { TIMER_PRESETS, TIMER_LEVELS } from '@/lib/sandbox/ingest-timer'
import type { ResponseSpeedPreset, TimerConfig, TimerPreset } from '@/lib/sandbox/types'

// ============================================================================
// Speed Presets
// ============================================================================

interface SpeedPresetConfig {
  label: string
  description: string
  icon: typeof Clock
  minMs: number
  maxMs: number
}

export const SPEED_PRESETS: Record<ResponseSpeedPreset, SpeedPresetConfig> = {
  real: {
    label: 'Real',
    description: '2-6s entre mensajes',
    icon: Clock,
    minMs: 2000,
    maxMs: 6000,
  },
  rapido: {
    label: 'Rapido',
    description: '0.5-1s entre mensajes',
    icon: Timer,
    minMs: 500,
    maxMs: 1000,
  },
  instantaneo: {
    label: 'Instantaneo',
    description: 'Sin delay',
    icon: Zap,
    minMs: 0,
    maxMs: 0,
  },
}

/** Calculate delay in ms based on preset */
export function getMessageDelay(preset: ResponseSpeedPreset): number {
  const config = SPEED_PRESETS[preset]
  if (config.maxMs === 0) return 0
  return config.minMs + Math.random() * (config.maxMs - config.minMs)
}

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
// Main Component
// ============================================================================

interface ConfigTabProps {
  agentName: string
  responseSpeed: ResponseSpeedPreset
  onResponseSpeedChange: (speed: ResponseSpeedPreset) => void
  // Timer controls (migrated from Ingest, dp4-05)
  timerEnabled: boolean
  timerConfig: TimerConfig
  onTimerToggle: (enabled: boolean) => void
  onTimerConfigChange: (config: TimerConfig) => void
}

export function ConfigTab({
  agentName,
  responseSpeed,
  onResponseSpeedChange,
  timerEnabled,
  timerConfig,
  onTimerToggle,
  onTimerConfigChange,
}: ConfigTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Bot Config
        </h4>
        <p className="text-sm font-medium">{agentName}</p>
      </div>

      {/* Response Speed */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Velocidad de respuesta
        </label>

        <ToggleGroup
          type="single"
          value={responseSpeed}
          onValueChange={(val) => {
            if (val) onResponseSpeedChange(val as ResponseSpeedPreset)
          }}
          className="justify-start gap-1"
        >
          {(Object.entries(SPEED_PRESETS) as [ResponseSpeedPreset, SpeedPresetConfig][]).map(
            ([key, config]) => {
              const Icon = config.icon
              return (
                <ToggleGroupItem
                  key={key}
                  value={key}
                  className={cn(
                    'text-xs px-3 py-1.5 h-auto gap-1.5',
                    responseSpeed === key && 'border-primary'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {config.label}
                </ToggleGroupItem>
              )
            }
          )}
        </ToggleGroup>

        <p className="text-[11px] text-muted-foreground">
          {SPEED_PRESETS[responseSpeed].description}
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
