/**
 * Production Debug Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * No-op implementation of DebugAdapter for production environment.
 * In production, debug info is handled by the module logger.
 * Does not accumulate or return DebugTurn objects.
 */

import type { DebugAdapter } from '../../engine/types'

export class ProductionDebugAdapter implements DebugAdapter {
  /**
   * No-op in production. Intent info logged at the engine level.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordIntent(_info: any): void {
    // No-op
  }

  /**
   * No-op in production. Tool calls tracked in agent_turns table.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTools(_tools: any[]): void {
    // No-op
  }

  /**
   * No-op in production. Token usage tracked in agent_turns table.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTokens(_tokens: any): void {
    // No-op
  }

  /**
   * No-op in production.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordState(_state: any): void {
    // No-op
  }

  /**
   * Always returns undefined in production. No debug turn accumulation.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDebugTurn(_turnNumber: number): any | undefined {
    return undefined
  }
}
