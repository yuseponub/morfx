/**
 * Ingest Timer Simulator
 * Phase 15.7: Ingest Timer Pluggable - Plan 01
 *
 * Pure-logic timer simulation engine for the 5-level ingest timer system.
 * No React dependencies - designed to be consumed by a React hook or component.
 *
 * Timer Levels:
 * 0 - Sin datos: collecting_data, 0 fields, 600s default
 * 1 - Datos parciales: collecting_data, has fields but not all 6 minimum, 360s default
 * 2 - Datos minimos: collecting_data, has all 6 minimum fields, 120s default
 * 3 - Promos sin respuesta: ofrecer_promos, no pack selected, 600s default
 * 4 - Pack sin confirmar: ofrecer_promos, has pack selected, 600s default
 *
 * @example
 * const simulator = new IngestTimerSimulator(
 *   (remainingMs, level) => setTimerState({ remainingMs, level }),
 *   (level, action) => handleTimerAction(level, action)
 * )
 * simulator.start(0, 600000)
 * // ... later when data arrives:
 * simulator.reevaluateLevel(context, config)
 */

import type {
  TimerConfig,
  TimerState,
  TimerAction,
  TimerEvalContext,
  TimerLevelConfig,
  TimerPreset,
} from './types'

// ============================================================================
// Timer Field Definitions (separate from data-extractor CRITICAL_FIELDS)
// ============================================================================

/**
 * Minimum fields required for timer level 2 (datos minimos).
 * 6 fields: 5 from CRITICAL_FIELDS + 'apellido' from ADDITIONAL_FIELDS.
 *
 * These MUST match the keys used in datosCapturados exactly.
 */
export const TIMER_MINIMUM_FIELDS = [
  'nombre',
  'apellido',
  'telefono',
  'direccion',
  'ciudad',
  'departamento',
] as const

/**
 * All fields tracked by the timer system.
 * 8 fields = TIMER_MINIMUM_FIELDS + barrio, correo.
 */
export const TIMER_ALL_FIELDS = [
  ...TIMER_MINIMUM_FIELDS,
  'barrio',
  'correo',
] as const

/**
 * Human-readable labels for field names in Spanish.
 * Used by Level 1 action to build the missing fields list.
 */
export const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre completo',
  apellido: 'Apellido',
  telefono: 'Numero de telefono',
  direccion: 'Direccion completa',
  ciudad: 'Ciudad o municipio',
  departamento: 'Departamento',
  barrio: 'Barrio',
  correo: 'Correo electronico',
}

// ============================================================================
// Timer Level Definitions (5 levels)
// ============================================================================

/**
 * 5 timer levels evaluated in order 0-4. First match wins.
 *
 * Levels 0-2 apply only in 'collecting_data' mode.
 * Levels 3-4 apply only in 'ofrecer_promos' mode.
 */
export const TIMER_LEVELS: TimerLevelConfig[] = [
  {
    id: 0,
    name: 'Sin datos',
    defaultDurationS: 600, // 10 min
    evaluate: (ctx: TimerEvalContext): boolean =>
      ctx.currentMode === 'collecting_data' && ctx.totalFields === 0,
    buildAction: (): TimerAction => ({
      type: 'send_message',
      message:
        'Quedamos pendientes a tus datos, o si tienes alguna pregunta acerca del producto no dudes en hacerla',
    }),
  },
  {
    id: 1,
    name: 'Datos parciales',
    defaultDurationS: 360, // 6 min
    evaluate: (ctx: TimerEvalContext): boolean => {
      if (ctx.currentMode !== 'collecting_data') return false
      if (ctx.totalFields === 0) return false
      const hasAllMinimum = TIMER_MINIMUM_FIELDS.every((f) =>
        ctx.fieldsCollected.includes(f)
      )
      return !hasAllMinimum
    },
    buildAction: (ctx: TimerEvalContext): TimerAction => {
      const missing = TIMER_MINIMUM_FIELDS.filter(
        (f) => !ctx.fieldsCollected.includes(f)
      ).map((f) => `- ${FIELD_LABELS[f]}`)
      return {
        type: 'send_message',
        message: `Para poder despachar tu producto nos faltaria:\n${missing.join('\n')}\nQuedamos pendientes`,
      }
    },
  },
  {
    id: 2,
    name: 'Datos minimos',
    defaultDurationS: 120, // 2 min
    evaluate: (ctx: TimerEvalContext): boolean => {
      if (ctx.currentMode !== 'collecting_data') return false
      return TIMER_MINIMUM_FIELDS.every((f) =>
        ctx.fieldsCollected.includes(f)
      )
    },
    buildAction: (): TimerAction => ({
      type: 'transition_mode',
      targetMode: 'ofrecer_promos',
      // Silent - no message
    }),
  },
  {
    id: 3,
    name: 'Promos sin respuesta',
    defaultDurationS: 600, // 10 min
    evaluate: (ctx: TimerEvalContext): boolean =>
      ctx.currentMode === 'ofrecer_promos' && !ctx.packSeleccionado,
    buildAction: (): TimerAction => ({
      type: 'create_order',
      message:
        'Quedamos pendientes a la promocion que desees para poder despachar tu orden',
      orderConfig: { valor: 0 },
    }),
  },
  {
    id: 4,
    name: 'Pack sin confirmar',
    defaultDurationS: 600, // 10 min
    evaluate: (ctx: TimerEvalContext): boolean =>
      ctx.currentMode === 'ofrecer_promos' && !!ctx.packSeleccionado,
    buildAction: (ctx: TimerEvalContext): TimerAction => ({
      type: 'create_order',
      message:
        'Quedamos pendientes a la confirmacion de tu compra para poder despachar tu orden',
      orderConfig: { valor: 0, pack: ctx.packSeleccionado ?? undefined },
    }),
  },
]

// ============================================================================
// Timer Presets
// ============================================================================

/**
 * Default timer configuration (same as 'real' preset).
 */
export const TIMER_DEFAULTS: TimerConfig = {
  levels: { 0: 600, 1: 360, 2: 120, 3: 600, 4: 600 },
}

/**
 * 3 presets with 5 level durations each (in seconds).
 *
 * - real: Production-like timings
 * - rapido: Scaled down for faster testing
 * - instantaneo: Near-instant (1-2s minimum, not actual 0)
 */
export const TIMER_PRESETS: Record<TimerPreset, TimerConfig> = {
  real: { levels: { 0: 600, 1: 360, 2: 120, 3: 600, 4: 600 } },
  rapido: { levels: { 0: 60, 1: 30, 2: 10, 3: 60, 4: 60 } },
  instantaneo: { levels: { 0: 2, 1: 2, 2: 1, 3: 2, 4: 2 } },
}

// ============================================================================
// IngestTimerSimulator Class
// ============================================================================

/**
 * Pure-logic timer simulation engine.
 *
 * Uses setTimeout for expiration and setInterval for tick updates.
 * No React dependencies - designed to be consumed by a React hook.
 *
 * Key design decisions:
 * - State stored in instance properties (NOT in setTimeout closures) to avoid stale data
 * - reevaluateLevel adjusts timer when level changes, continues when same level
 * - Pause/resume stores remaining time and resumes from that point
 * - destroy() cleans up all intervals/timeouts for component unmount
 */
export class IngestTimerSimulator {
  // Timer state (instance properties, not closure-captured)
  private currentLevel: number | null = null
  private startedAt: number | null = null
  private durationMs: number = 0
  private paused: boolean = false
  private pausedRemainingMs: number = 0

  // Timer IDs for cleanup
  private expireTimeoutId: ReturnType<typeof setTimeout> | null = null
  private tickIntervalId: ReturnType<typeof setInterval> | null = null

  // Callbacks
  private onTick: (remainingMs: number, level: number) => void
  private onExpire: (level: number, action: TimerAction) => void

  // Context provider for accurate buildAction at expiration time (Phase 15.7 fix)
  private contextProvider: (() => TimerEvalContext) | null = null

  constructor(
    onTick: (remainingMs: number, level: number) => void,
    onExpire: (level: number, action: TimerAction) => void
  ) {
    this.onTick = onTick
    this.onExpire = onExpire
  }

  /**
   * Set a callback that provides the current TimerEvalContext at expiration time.
   * This ensures buildAction receives real data (e.g., actual fieldsCollected)
   * instead of a hardcoded empty context.
   */
  setContextProvider(provider: () => TimerEvalContext): void {
    this.contextProvider = provider
  }

  /**
   * Start a timer at the given level with the given duration.
   * Clears any existing timer before starting.
   */
  start(level: number, durationMs: number): void {
    // Clear existing timers
    this.clearTimers()

    // Set state
    this.currentLevel = level
    this.startedAt = Date.now()
    this.durationMs = durationMs
    this.paused = false
    this.pausedRemainingMs = 0

    // Start the countdown
    this.startCountdown(durationMs)
  }

  /**
   * Stop the timer completely. Resets all state.
   */
  stop(): void {
    this.clearTimers()
    this.currentLevel = null
    this.startedAt = null
    this.durationMs = 0
    this.paused = false
    this.pausedRemainingMs = 0
  }

  /**
   * Pause the timer. Stores remaining time for resume.
   */
  pause(): void {
    if (!this.startedAt || this.paused || this.currentLevel === null) return

    const elapsed = Date.now() - this.startedAt
    this.pausedRemainingMs = Math.max(0, this.durationMs - elapsed)
    this.paused = true

    // Clear active timers
    this.clearTimers()
  }

  /**
   * Resume the timer from the stored remaining time.
   */
  resume(): void {
    if (!this.paused || this.currentLevel === null) return

    this.paused = false
    this.startedAt = Date.now()
    this.durationMs = this.pausedRemainingMs
    this.pausedRemainingMs = 0

    // Restart countdown with remaining time
    this.startCountdown(this.durationMs)
  }

  /**
   * Re-evaluate which level applies given the current context.
   *
   * If level changed: restart timer with new level's duration minus elapsed time.
   * If same level: continue counting (no restart).
   * If no level matches: stop timer.
   */
  reevaluateLevel(context: TimerEvalContext, config: TimerConfig): void {
    const newLevel = this.evaluateLevel(context)

    if (newLevel === null) {
      // No level matches - stop timer
      this.stop()
      return
    }

    if (this.currentLevel === newLevel) {
      // Same level - continue counting, don't restart
      return
    }

    // Level changed - calculate elapsed and start new timer
    const elapsed = this.getElapsedMs()
    const newDurationS = config.levels[newLevel] ?? TIMER_LEVELS[newLevel]?.defaultDurationS ?? 60
    const newDurationMs = newDurationS * 1000
    const adjustedDuration = Math.max(0, newDurationMs - elapsed)

    if (adjustedDuration <= 0) {
      // New duration already exceeded by elapsed time - fire immediately
      const levelConfig = TIMER_LEVELS.find((l) => l.id === newLevel)
      if (levelConfig) {
        this.currentLevel = newLevel
        this.stop()
        this.onExpire(newLevel, levelConfig.buildAction(context))
      }
      return
    }

    // Start new timer with adjusted duration
    this.start(newLevel, adjustedDuration)
  }

  /**
   * Evaluate which level applies given the context.
   * Iterates TIMER_LEVELS in order (0-4), returns first match.
   *
   * @returns Level id (0-4) or null if no level matches
   */
  evaluateLevel(context: TimerEvalContext): number | null {
    for (const level of TIMER_LEVELS) {
      if (level.evaluate(context)) {
        return level.id
      }
    }
    return null
  }

  /**
   * Get current timer state snapshot.
   */
  getState(): TimerState {
    const active = this.currentLevel !== null && (this.paused || this.startedAt !== null)
    let remainingMs = 0

    if (this.paused) {
      remainingMs = this.pausedRemainingMs
    } else if (this.startedAt !== null) {
      remainingMs = Math.max(0, this.durationMs - (Date.now() - this.startedAt))
    }

    const levelConfig = this.currentLevel !== null
      ? TIMER_LEVELS.find((l) => l.id === this.currentLevel)
      : null

    return {
      active,
      level: this.currentLevel,
      levelName: levelConfig?.name ?? '',
      remainingMs,
      paused: this.paused,
    }
  }

  /**
   * Clean up all intervals/timeouts. Call on component unmount.
   */
  destroy(): void {
    this.stop()
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Start the countdown with the given duration.
   * Sets up both the expiration timeout and the tick interval.
   */
  private startCountdown(durationMs: number): void {
    // Set up expiration timeout
    this.expireTimeoutId = setTimeout(() => {
      // Read current level from instance property (not closure)
      const level = this.currentLevel
      if (level === null) return

      const levelConfig = TIMER_LEVELS.find((l) => l.id === level)
      if (!levelConfig) return

      // Build action with real context from provider (Phase 15.7 fix)
      // Falls back to minimal context if no provider is set
      this.clearTimers()
      this.currentLevel = null
      this.startedAt = null
      this.durationMs = 0

      const context: TimerEvalContext = this.contextProvider
        ? this.contextProvider()
        : {
            fieldsCollected: [],
            totalFields: 0,
            currentMode: '',
            packSeleccionado: null,
            promosOffered: false,
          }

      this.onExpire(level, levelConfig.buildAction(context))
    }, durationMs)

    // Set up tick interval (every 1000ms)
    this.tickIntervalId = setInterval(() => {
      if (this.currentLevel === null || this.startedAt === null) return

      const elapsed = Date.now() - this.startedAt
      const remaining = Math.max(0, this.durationMs - elapsed)

      this.onTick(remaining, this.currentLevel)
    }, 1000)

    // Fire initial tick immediately
    if (this.currentLevel !== null) {
      this.onTick(durationMs, this.currentLevel)
    }
  }

  /**
   * Clear all active timers (timeout + interval).
   */
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

  /**
   * Get elapsed time in milliseconds since timer started.
   */
  private getElapsedMs(): number {
    if (this.paused) {
      return this.durationMs - this.pausedRemainingMs
    }
    if (this.startedAt === null) return 0
    return Date.now() - this.startedAt
  }
}
