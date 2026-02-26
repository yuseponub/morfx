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

  // ===========================================================================
  // Debug Panel v4.0 no-op stubs (standalone/debug-panel-v4)
  // ===========================================================================

  /**
   * No-op in production. Classification logged at the engine level.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordClassification(_info: any): void {
    // No-op
  }

  /**
   * No-op in production. Block composition not tracked.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordBlockComposition(_info: any): void {
    // No-op
  }

  /**
   * No-op in production. No-repetition filter not tracked.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordNoRepetition(_info: any): void {
    // No-op
  }

  /**
   * No-op in production. Ofi inter detection not tracked.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordOfiInter(_info: any): void {
    // No-op
  }

  /**
   * No-op in production. Pre-send check not tracked.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordPreSendCheck(_info: any): void {
    // No-op
  }

  /**
   * No-op in production. Timer signals not tracked in debug adapter.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTimerSignals(_signals: any[]): void {
    // No-op
  }

  /**
   * No-op in production. Template selection not tracked.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTemplateSelection(_info: any): void {
    // No-op
  }

  /**
   * No-op in production. Transition validation not tracked.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTransitionValidation(_info: any): void {
    // No-op
  }

  /**
   * No-op in production. Orchestration not tracked.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordOrchestration(_info: any): void {
    // No-op
  }

  /**
   * No-op in production. Ingest details not tracked.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordIngestDetails(_info: any): void {
    // No-op
  }

  /**
   * No-op in production. Disambiguation log not tracked.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordDisambiguationLog(_info: any): void {
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
