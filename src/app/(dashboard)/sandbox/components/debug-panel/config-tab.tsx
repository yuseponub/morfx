'use client'

/**
 * Config Tab Component
 * Sandbox bot configuration: response speed presets.
 */

import { Zap, Clock, Timer } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { ResponseSpeedPreset } from '@/lib/sandbox/types'

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
// Component
// ============================================================================

interface ConfigTabProps {
  agentName: string
  responseSpeed: ResponseSpeedPreset
  onResponseSpeedChange: (speed: ResponseSpeedPreset) => void
}

export function ConfigTab({ agentName, responseSpeed, onResponseSpeedChange }: ConfigTabProps) {
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
    </div>
  )
}
