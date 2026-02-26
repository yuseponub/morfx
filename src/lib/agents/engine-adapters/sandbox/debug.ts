/**
 * Sandbox Debug Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Accumulates debug information for each turn and builds a complete
 * DebugTurn object for the sandbox debug panel.
 *
 * Tracks: IntentInfo, ToolExecutions, TokenInfo (per-model breakdown),
 * stateAfter snapshot, and all Debug Panel v4.0 fields.
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

  // Debug Panel v4.0 fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private classificationInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private blockCompositionInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private noRepetitionInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ofiInterInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private preSendCheckInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private timerSignalsInfo: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private templateSelectionInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transitionValidationInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private orchestrationInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ingestDetailsInfo: any = undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private disambiguationLogInfo: any = undefined

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

  // ===========================================================================
  // Debug Panel v4.0 record methods (standalone/debug-panel-v4)
  // ===========================================================================

  /**
   * Record message category classification (RESPONDIBLE/SILENCIOSO/HANDOFF).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordClassification(info: any): void {
    this.classificationInfo = info
  }

  /**
   * Record block composition result (new + pending, composed block, overflow).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordBlockComposition(info: any): void {
    this.blockCompositionInfo = info
  }

  /**
   * Record no-repetition filter result (per-template levels, summary).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordNoRepetition(info: any): void {
    this.noRepetitionInfo = info
  }

  /**
   * Record ofi inter detection result (routes 1-3).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordOfiInter(info: any): void {
    this.ofiInterInfo = info
  }

  /**
   * Record pre-send check result (per-template, interruption).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordPreSendCheck(info: any): void {
    this.preSendCheckInfo = info
  }

  /**
   * Record timer signals emitted during turn.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTimerSignals(signals: any[]): void {
    this.timerSignalsInfo = signals
  }

  /**
   * Record template selection info (intent, visit type, counts).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTemplateSelection(info: any): void {
    this.templateSelectionInfo = info
  }

  /**
   * Record transition validation result.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTransitionValidation(info: any): void {
    this.transitionValidationInfo = info
  }

  /**
   * Record orchestration result (mode transition, order, template count).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordOrchestration(info: any): void {
    this.orchestrationInfo = info
  }

  /**
   * Record ingest details (classification, extraction, implicit yes).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordIngestDetails(info: any): void {
    this.ingestDetailsInfo = info
  }

  /**
   * Record disambiguation log info.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordDisambiguationLog(info: any): void {
    this.disambiguationLogInfo = info
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
      // Debug Panel v4.0 fields
      classification: this.classificationInfo,
      blockComposition: this.blockCompositionInfo,
      noRepetition: this.noRepetitionInfo,
      ofiInter: this.ofiInterInfo,
      preSendCheck: this.preSendCheckInfo,
      timerSignals: this.timerSignalsInfo.length > 0 ? this.timerSignalsInfo : undefined,
      templateSelection: this.templateSelectionInfo,
      transitionValidation: this.transitionValidationInfo,
      orchestration: this.orchestrationInfo,
      ingestDetails: this.ingestDetailsInfo,
      disambiguationLog: this.disambiguationLogInfo,
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
    // Debug Panel v4.0 fields
    this.classificationInfo = undefined
    this.blockCompositionInfo = undefined
    this.noRepetitionInfo = undefined
    this.ofiInterInfo = undefined
    this.preSendCheckInfo = undefined
    this.timerSignalsInfo = []
    this.templateSelectionInfo = undefined
    this.transitionValidationInfo = undefined
    this.orchestrationInfo = undefined
    this.ingestDetailsInfo = undefined
    this.disambiguationLogInfo = undefined
  }
}
