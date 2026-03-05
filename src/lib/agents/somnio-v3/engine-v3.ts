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
        history: input.history,
        turnNumber: input.turnNumber,
        workspaceId: input.workspaceId,
      })

      const newState: SandboxState = {
        currentMode: output.newMode ?? input.state.currentMode,
        intentsVistos: output.intentsVistos,
        templatesEnviados: output.templatesEnviados,
        datosCapturados: output.datosCapturados,
        packSeleccionado: output.packSeleccionado as PackSelection | null,
      }

      return {
        success: output.success,
        messages: output.messages,
        newState,
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
          } : output.ingestInfo?.action === 'silent' ? {
            category: 'SILENCIOSO' as const,
            reason: 'Ingest: captura silenciosa',
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
            autoTrigger: output.ingestInfo.autoTrigger,
          } as DebugIngestDetails & { autoTrigger?: string } : undefined,
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
