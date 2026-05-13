/**
 * Somnio v4 Engine - Minimal Sandbox Runner
 *
 * Thin engine for sandbox-only v4 agent testing.
 * Handles bidirectional mapping: SandboxState <-> V4AgentInput
 * via `_v3:` prefixed keys in datosCapturados (preservados por compatibilidad
 * con sessions productivas — D-19 mantiene namespace; sessions v3 que se
 * cierren al flip pasan a v4 sin re-mapear keys legacy).
 *
 * Standalone: somnio-sales-v4-runtime-wiring / Plan 03.
 * Cloned mecánicamente desde somnio-v3/engine-v3.ts (D-13 — duplicado 100%).
 *
 * Diferencias intencionales con engine-v3:
 * - import processMessage desde './somnio-v4-agent' (NO somnio-v3)
 * - V4EngineInput / V4EngineOutput types
 * - DebugTurn extendido con campos opcionales subLoopReason / kbHits /
 *   nuncaDecirMatches / threshold (D-20). El sub-loop expone esa metadata
 *   solo via observability events; cuando V4AgentOutput la suba al top-level
 *   (Plan 06+), el wrapper los mapea aquí. Mientras tanto los campos quedan
 *   undefined y la UI renderiza condicional.
 * - KB real (D-22) — workspaceId propagado al agent que internamente queries
 *   Supabase prod (workspace Somnio).
 * - Retomas simuladas (D-21) — systemEvent propagado igual que v3.
 * - debugTurn.tokens.models[].model = 'gemini-2.5-flash-lite' (B-2 fix +
 *   D-30 — swap at clone time; refleja el provider real que Plan 05 wirea
 *   para comprehension donde nace `output.totalTokens`). Cero TODO comments.
 */

import { processMessage } from './somnio-v4-agent'
import type { SandboxState, DebugTurn } from '@/lib/sandbox/types'
import type { PackSelection } from '@/lib/agents/types'
import type { SystemEvent } from './types'

export interface V4EngineInput {
  message: string
  state: SandboxState
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
}

export interface V4EngineOutput {
  success: boolean
  messages: string[]
  newState: SandboxState
  debugTurn: DebugTurn
  error?: { code: string; message: string }
  timerSignal?: unknown
}

export class SomnioV4Engine {
  async processMessage(input: V4EngineInput): Promise<V4EngineOutput> {
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
        systemEvent: input.systemEvent,
      })

      const newState: SandboxState = {
        currentMode: output.newMode ?? input.state.currentMode,
        intentsVistos: output.intentsVistos,
        templatesEnviados: output.templatesEnviados,
        datosCapturados: output.datosCapturados,
        packSeleccionado: output.packSeleccionado as PackSelection | null,
        accionesEjecutadas: output.accionesEjecutadas,
      }

      // Clean stale `_v3:` keys from datosCapturados (now flow as own fields).
      // El namespace `_v3:` se preserva para DB compat (sessions productivas);
      // estas keys específicas se reconstruyen desde first-class fields.
      delete newState.datosCapturados['_v3:accionesEjecutadas']
      delete newState.datosCapturados['_v3:templatesMostrados']

      // Pick the last timer signal (most relevant)
      const lastTimerSignal = output.timerSignals.length > 0
        ? output.timerSignals[output.timerSignals.length - 1]
        : undefined

      // TODO Plan 06: surface subLoopReason / kbHits / nuncaDecirMatches /
      //               threshold from V4AgentOutput cuando el agent los exponga
      //               en top-level (actualmente surge sólo en observability events).
      //               Por ahora mapeamos undefined — la UI renderiza condicional
      //               y los gates de Plan 02 (validateLoopOutcomeInvariants) ya
      //               funcionan sin requerir surface explícito en debugTurn.

      return {
        success: output.success,
        messages: output.messages,
        newState,
        timerSignal: lastTimerSignal,
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: output.intentInfo ? {
            intent: output.intentInfo.intent,
            confidence: output.intentInfo.confidence,
            intent_confidence: output.intentInfo.intent_confidence,
            reasoning: output.intentInfo.reasoning,
            timestamp: output.intentInfo.timestamp,
          } : output.errorMessage ? {
            // Standalone: somnio-sales-v4-runtime-wiring / Plan 07 debug.
            // Surface real catch-block errors instead of the misleading
            // "Timer event - no comprehension" fallback.
            intent: 'error',
            confidence: 0,
            reasoning: `ERROR: ${output.errorMessage}`,
            timestamp,
          } : {
            intent: 'system_event',
            confidence: 0,
            reasoning: 'Timer event - no comprehension',
            timestamp,
          },
          tools: [],
          tokens: {
            turnNumber: input.turnNumber,
            tokensUsed: output.totalTokens,
            models: [{
              model: 'gemini-2.5-flash-lite' as const,
              inputTokens: Math.round(output.totalTokens * 0.7),
              outputTokens: Math.round(output.totalTokens * 0.3),
            }],
            timestamp,
          },
          stateAfter: newState,
          classification: output.decisionInfo ? {
            category: output.timerSignals.some(s => s.level === 'L5') ? 'SILENCIOSO'
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
          // V4 escalation visibility (Plan 03 D-20 TODO honored in Plan 07 debug):
          // subLoopReason populated when sub-loop fired (otherwise null/undefined).
          // threshold = platform_config.somnio_v4_low_confidence_threshold value used.
          subLoopReason: output.subLoopReason ?? undefined,
          threshold: output.threshold,
          // Standalone: v4-subloop-debug-view / Plan 03 (D-02).
          // Sub-loop debug payload propagated when sub-loop fired (otherwise undefined).
          subLoopDebug: output.subLoopDebug,
          timerSignals: output.timerSignals.map(s => ({
            type: s.type,
            level: s.level,
            reason: s.reason,
          })),
        },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[SomnioV4Engine] Error:', error)

      return {
        success: true,
        messages: [`[Error v4] ${errorMsg}`],
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
          code: 'V4_ENGINE_ERROR',
          message: errorMsg,
        },
      }
    }
  }
}
