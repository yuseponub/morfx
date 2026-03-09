/**
 * Ingest Timer Simulator — Pure Countdown
 *
 * Simplified to countdown-only (quick-013). No evaluate, no buildAction,
 * no hardcoded messages. On expiration, calls onExpire(level) and the
 * sandbox-layout sends a systemEvent to the pipeline for processing.
 *
 * Timer Levels (for reference — decisions are made by the pipeline):
 * 0 - Sin datos: 600s default
 * 1 - Datos parciales: 360s default
 * 2 - Datos minimos: 120s default
 * 3 - Promos sin respuesta: 600s default
 * 4 - Pack sin confirmar: 600s default
 * 5 - Silencio: uses L0 duration
 */

import type { TimerConfig, TimerState, TimerPreset } from './types'

// ============================================================================
// Level Names (display only)
// ============================================================================

const LEVEL_NAMES: Record<number, string> = {
  0: 'Sin datos',
  1: 'Datos parciales',
  2: 'Datos minimos',
  3: 'Promos sin respuesta',
  4: 'Pack sin confirmar',
  5: 'Silencio',
}

// ============================================================================
// Timer Presets & Defaults
// ============================================================================

export const TIMER_DEFAULTS: TimerConfig = {
  levels: { 0: 600, 1: 360, 2: 120, 3: 600, 4: 600 },
}

export const TIMER_PRESETS: Record<TimerPreset, TimerConfig> = {
  real: { levels: { 0: 600, 1: 360, 2: 120, 3: 600, 4: 600 } },
  rapido: { levels: { 0: 60, 1: 30, 2: 10, 3: 60, 4: 60 } },
  instantaneo: { levels: { 0: 2, 1: 2, 2: 1, 3: 2, 4: 2 } },
}

// ============================================================================
// IngestTimerSimulator — Pure Countdown
// ============================================================================

export class IngestTimerSimulator {
  private currentLevel: number | null = null
  private startedAt: number | null = null
  private durationMs: number = 0
  private paused: boolean = false
  private pausedRemainingMs: number = 0

  private expireTimeoutId: ReturnType<typeof setTimeout> | null = null
  private tickIntervalId: ReturnType<typeof setInterval> | null = null

  private onTick: (remainingMs: number, level: number) => void
  private onExpire: (level: number) => void

  constructor(
    onTick: (remainingMs: number, level: number) => void,
    onExpire: (level: number) => void,
  ) {
    this.onTick = onTick
    this.onExpire = onExpire
  }

  start(level: number, durationMs: number): void {
    this.clearTimers()
    this.currentLevel = level
    this.startedAt = Date.now()
    this.durationMs = durationMs
    this.paused = false
    this.pausedRemainingMs = 0
    this.startCountdown(durationMs)
  }

  stop(): void {
    this.clearTimers()
    this.currentLevel = null
    this.startedAt = null
    this.durationMs = 0
    this.paused = false
    this.pausedRemainingMs = 0
  }

  pause(): void {
    if (!this.startedAt || this.paused || this.currentLevel === null) return
    const elapsed = Date.now() - this.startedAt
    this.pausedRemainingMs = Math.max(0, this.durationMs - elapsed)
    this.paused = true
    this.clearTimers()
  }

  resume(): void {
    if (!this.paused || this.currentLevel === null) return
    this.paused = false
    this.startedAt = Date.now()
    this.durationMs = this.pausedRemainingMs
    this.pausedRemainingMs = 0
    this.startCountdown(this.durationMs)
  }

  getState(): TimerState {
    const active = this.currentLevel !== null && (this.paused || this.startedAt !== null)
    let remainingMs = 0
    if (this.paused) {
      remainingMs = this.pausedRemainingMs
    } else if (this.startedAt !== null) {
      remainingMs = Math.max(0, this.durationMs - (Date.now() - this.startedAt))
    }
    return {
      active,
      level: this.currentLevel,
      levelName: LEVEL_NAMES[this.currentLevel ?? -1] ?? '',
      remainingMs,
      paused: this.paused,
    }
  }

  destroy(): void {
    this.stop()
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private startCountdown(durationMs: number): void {
    this.expireTimeoutId = setTimeout(() => {
      const level = this.currentLevel
      if (level === null) return
      this.clearTimers()
      this.currentLevel = null
      this.startedAt = null
      this.durationMs = 0
      this.onExpire(level)
    }, durationMs)

    this.tickIntervalId = setInterval(() => {
      if (this.currentLevel === null || this.startedAt === null) return
      const elapsed = Date.now() - this.startedAt
      const remaining = Math.max(0, this.durationMs - elapsed)
      this.onTick(remaining, this.currentLevel)
    }, 1000)

    if (this.currentLevel !== null) {
      this.onTick(durationMs, this.currentLevel)
    }
  }

  private clearTimers(): void {
    if (this.expireTimeoutId !== null) {
      clearTimeout(this.expireTimeoutId)
      this.expireTimeoutId = null
    }
    if (this.tickIntervalId !== null) {
      clearInterval(this.tickIntervalId)
      this.tickIntervalId = null
    }
  }
}
