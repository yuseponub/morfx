/**
 * Somnio v3 Engine - Minimal Sandbox Runner
 *
 * Thin engine for sandbox-only v3 agent testing.
 * Handles bidirectional mapping: SandboxState <-> AgentState
 * via _v3: prefixed keys in datosCapturados.
 */

import { processMessage } from './somnio-v3-agent'
import type { SandboxState, DebugTurn, DebugIngestDetails } from '@/lib/sandbox/types'
import type { PackSelection } from '@/lib/agents/types'

export interface V3EngineInput {
  message: string
  state: SandboxState
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
  forceIntent?: string
}

export interface V3EngineOutput {
  success: boolean
  messages: string[]
  newState: SandboxState
  debugTurn: DebugTurn
  error?: { code: string; message: string }
  timerSignal?: unknown
  silenceDetected?: boolean
}

export class SomnioV3Engine {
  async processMessage(input: V3EngineInput): Promise<V3EngineOutput> {
    const timestamp = new Date().toISOString()

    try {
      const output = await processMessage({
        message: input.message,
        currentMode: input.state.currentMode,
        intentsVistos: input.state.intentsVistos ?? [],
        templatesEnviados: input.state.templatesEnviados ?? [],
        datosCapturados: input.state.datosCapturados ?? {},
        packSeleccionado: input.state.packSeleccionado ?? null,
        accionesEjecutadas: input.state.accionesEjecutadas ?? [],
        history: input.history,
        turnNumber: input.turnNumber,
        workspaceId: input.workspaceId,
        forceIntent: input.forceIntent,
      })

      const newState: SandboxState = {
        currentMode: output.newMode ?? input.state.currentMode,
        intentsVistos: output.intentsVistos,
        templatesEnviados: output.templatesEnviados,
        datosCapturados: output.datosCapturados,
        packSeleccionado: output.packSeleccionado as PackSelection | null,
        accionesEjecutadas: output.accionesEjecutadas,
      }

      // Clean stale _v3: keys from datosCapturados (now flow as own fields)
      delete newState.datosCapturados['_v3:accionesEjecutadas']
      delete newState.datosCapturados['_v3:templatesMostrados']

      // Pick the last timer signal (most relevant — decision overrides ingest)
      const lastTimerSignal = output.timerSignals.length > 0
        ? output.timerSignals[output.timerSignals.length - 1]
        : undefined

      return {
        success: output.success,
        messages: output.messages,
        newState,
        timerSignal: lastTimerSignal,
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: {
            intent: output.intentInfo.intent,
            confidence: output.intentInfo.confidence,
            reasoning: output.intentInfo.reasoning,
            timestamp: output.intentInfo.timestamp,
          },
          tools: [],
          tokens: {
            turnNumber: input.turnNumber,
            tokensUsed: output.totalTokens,
            models: [{
              model: 'claude-haiku-4-5' as const,
              inputTokens: Math.round(output.totalTokens * 0.7),
              outputTokens: Math.round(output.totalTokens * 0.3),
            }],
            timestamp,
          },
          stateAfter: newState,
          classification: output.decisionInfo ? {
            category: output.silenceDetected ? 'SILENCIOSO'
              : output.newMode === 'handoff' ? 'HANDOFF'
              : 'RESPONDIBLE',
            reason: output.decisionInfo.reason,
            rulesChecked: { rule1: false, rule1_5: false, rule2: false, rule3: false },
          } : undefined,
          orchestration: output.decisionInfo ? {
            nextMode: output.newMode ?? input.state.currentMode,
            previousMode: input.state.currentMode,
            modeChanged: !!output.newMode && output.newMode !== input.state.currentMode,
            shouldCreateOrder: output.shouldCreateOrder,
            templatesCount: output.messages.length,
          } : undefined,
          ingestDetails: output.ingestInfo ? {
            action: output.ingestInfo.action as DebugIngestDetails['action'],
            systemEvent: output.ingestInfo.systemEvent,
          } satisfies DebugIngestDetails : undefined,
          salesTrack: output.salesTrackInfo ? {
            accion: output.salesTrackInfo.accion,
            reason: output.salesTrackInfo.reason,
            enterCaptura: output.salesTrackInfo.enterCaptura,
          } : undefined,
          responseTrack: output.responseTrackInfo ? {
            salesIntents: output.responseTrackInfo.salesTemplateIntents,
            infoIntents: output.responseTrackInfo.infoTemplateIntents,
            totalMessages: output.responseTrackInfo.totalMessages,
          } : undefined,
          timerSignals: output.timerSignals.map(s => ({
            type: s.type,
            level: s.level,
            reason: s.reason,
          })),
        },
        silenceDetected: output.silenceDetected,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[SomnioV3Engine] Error:', error)

      return {
        success: true,
        messages: [`[Error v3] ${errorMsg}`],
        newState: input.state,
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: {
            intent: 'error',
            confidence: 0,
            reasoning: errorMsg,
            timestamp,
          },
          tools: [],
          tokens: {
            turnNumber: input.turnNumber,
            tokensUsed: 0,
            models: [],
            timestamp,
          },
          stateAfter: input.state,
        },
        error: {
          code: 'V3_ENGINE_ERROR',
          message: errorMsg,
        },
      }
    }
  }
}
