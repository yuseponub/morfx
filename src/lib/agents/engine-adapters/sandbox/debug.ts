/**
 * Sandbox Debug Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Accumulates debug information for each turn and builds a complete
 * DebugTurn object for the sandbox debug panel.
 *
 * Tracks: IntentInfo, ToolExecutions, TokenInfo (per-model breakdown),
 * and stateAfter snapshot.
 */

import type { DebugAdapter } from '../../engine/types'

export class SandboxDebugAdapter implements DebugAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private intentInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tools: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tokenInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stateSnapshot: any = undefined

  /**
   * Record intent detection result.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordIntent(info: any): void {
    this.intentInfo = info
  }

  /**
   * Record tool executions (appends to existing).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTools(tools: any[]): void {
    this.tools.push(...tools)
  }

  /**
   * Record token usage info.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTokens(tokens: any): void {
    this.tokenInfo = tokens
  }

  /**
   * Record state snapshot after processing.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordState(state: any): void {
    this.stateSnapshot = state
  }

  /**
   * Build and return a complete DebugTurn from accumulated data.
   * Returns the DebugTurn shape expected by the sandbox debug panel.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDebugTurn(turnNumber: number): any | undefined {
    return {
      turnNumber,
      intent: this.intentInfo,
      tools: this.tools,
      tokens: this.tokenInfo ?? {
        turnNumber,
        tokensUsed: 0,
        models: [],
        timestamp: new Date().toISOString(),
      },
      stateAfter: this.stateSnapshot,
    }
  }

  /**
   * Reset accumulated data (for reuse between turns).
   */
  reset(): void {
    this.intentInfo = undefined
    this.tools = []
    this.tokenInfo = undefined
    this.stateSnapshot = undefined
  }
}
