/**
 * Sandbox Timer Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * In-memory implementation of TimerAdapter for sandbox environment.
 * Accumulates TimerSignal objects in instance state for the engine to
 * include in EngineOutput.timerSignal.
 *
 * Supports the two-step signal pattern: cancel (ingest) + start (promo).
 * Each signal() call overwrites the previous, so sequential cancel+start
 * correctly results in 'start' being the last signal. See Research Pitfall #3.
 */

import type { TimerAdapter } from '../../engine/types'
import type { TimerSignal } from '@/lib/sandbox/types'

export class SandboxTimerAdapter implements TimerAdapter {
  private lastSignal: TimerSignal | null = null

  /**
   * Store as lastSignal (overwrites previous).
   * Supports sequential cancel+start pattern:
   *   1. signal({ type: 'cancel', reason: 'ingest_complete' })
   *   2. signal({ type: 'start' })  // overwrites cancel
   * Result: getLastSignal() returns { type: 'start' }
   */
  signal(signal: TimerSignal): void {
    this.lastSignal = signal
  }

  /**
   * Return the last accumulated timer signal, or undefined if none.
   */
  getLastSignal(): TimerSignal | undefined {
    return this.lastSignal ?? undefined
  }

  /**
   * Reset signal state (for reuse between turns).
   */
  reset(): void {
    this.lastSignal = null
  }
}
