/**
 * Somnio Sales Agent v3 — Main Agent Pipeline
 *
 * Orchestrates the complete 11-layer pipeline (minus interruption):
 * C2: Comprehension (Claude Haiku)
 * C3: State Merge
 * C4: Ingest Logic
 * C5: Compute Gates
 * C6: Decision Engine
 * C7: Response Composition
 *
 * Layers C0, C0.5, C8-C11 are handled by the engine/adapters.
 */

import { comprehend } from './comprehension'
import { mergeAnalysis, computeGates, serializeState, deserializeState } from './state'
import { evaluateIngest } from './ingest'
import { decide } from './decision'
import { composeResponse } from './response'
import type { AgentState, V3AgentInput, V3AgentOutput, TimerSignal } from './types'

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process a customer message through the v3 pipeline.
 *
 * @param input - Message + session state from engine
 * @returns V3AgentOutput with response, state updates, signals
 */
export async function processMessage(input: V3AgentInput): Promise<V3AgentOutput> {
  const timerSignals: TimerSignal[] = []

  try {
    // ------------------------------------------------------------------
    // Restore state from session
    // ------------------------------------------------------------------
    const state = deserializeState(
      input.datosCapturados,
      input.packSeleccionado,
      input.intentsVistos,
      input.templatesEnviados,
    )
    const prevState = { ...state, datos: { ...state.datos } }

    // ------------------------------------------------------------------
    // C2: Comprehension
    // ------------------------------------------------------------------
    const recentBotMessages = input.history
      .filter(h => h.role === 'assistant')
      .slice(-2)
      .map(h => h.content)

    const { analysis, tokensUsed } = await comprehend(
      input.message,
      input.history,
      input.datosCapturados,
      recentBotMessages,
    )

    // ------------------------------------------------------------------
    // C3: State Merge
    // ------------------------------------------------------------------
    const mergedState = mergeAnalysis(state, analysis)

    // ------------------------------------------------------------------
    // C5: Compute Gates (before ingest, needed for auto-triggers)
    // ------------------------------------------------------------------
    const gates = computeGates(mergedState)

    // ------------------------------------------------------------------
    // C4: Ingest Logic
    // ------------------------------------------------------------------
    const ingestResult = evaluateIngest(analysis, mergedState, gates, prevState)

    if (ingestResult.timerSignal) {
      timerSignals.push(ingestResult.timerSignal)
    }

    // If ingest says silent → return without responding
    if (ingestResult.action === 'silent') {
      const serialized = serializeState(mergedState)
      return {
        success: true,
        messages: [],
        newMode: computeMode(mergedState),
        intentsVistos: serialized.intentsVistos,
        templatesEnviados: serialized.templatesEnviados,
        datosCapturados: serialized.datosCapturados,
        packSeleccionado: serialized.packSeleccionado,
        intentInfo: {
          intent: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
        totalTokens: tokensUsed,
        silenceDetected: false,
        shouldCreateOrder: false,
        timerSignals,
        classificationInfo: {
          category: analysis.classification.category,
          sentiment: analysis.classification.sentiment,
          is_acknowledgment: analysis.classification.is_acknowledgment,
        },
        ingestInfo: {
          action: 'silent',
        },
      }
    }

    // ------------------------------------------------------------------
    // C6: Decision Engine
    // ------------------------------------------------------------------
    const decision = decide(analysis, mergedState, gates, ingestResult)

    if (decision.timerSignal) {
      timerSignals.push(decision.timerSignal)
    }

    // Update captura mode based on decision
    if (decision.enterCaptura === true) {
      mergedState.enCapturaSilenciosa = true
    } else if (decision.enterCaptura === false) {
      mergedState.enCapturaSilenciosa = false
    }

    // Track action
    if (decision.action === 'respond' && decision.templateIntents) {
      for (const ti of decision.templateIntents) {
        if (ti === 'promociones' || ti === 'quiero_comprar') {
          mergedState.accionesEjecutadas.push('ofrecer_promos')
        }
        if (ti.startsWith('resumen')) {
          mergedState.accionesEjecutadas.push('mostrar_confirmacion')
        }
      }
    }

    // Handle silence decision
    if (decision.action === 'silence') {
      const serialized = serializeState(mergedState)
      return {
        success: true,
        messages: [],
        newMode: computeMode(mergedState),
        intentsVistos: serialized.intentsVistos,
        templatesEnviados: serialized.templatesEnviados,
        datosCapturados: serialized.datosCapturados,
        packSeleccionado: serialized.packSeleccionado,
        intentInfo: {
          intent: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
        totalTokens: tokensUsed,
        silenceDetected: true,
        shouldCreateOrder: false,
        timerSignals,
        decisionInfo: {
          action: decision.action,
          reason: decision.reason,
          gates,
        },
        classificationInfo: {
          category: analysis.classification.category,
          sentiment: analysis.classification.sentiment,
          is_acknowledgment: analysis.classification.is_acknowledgment,
        },
      }
    }

    // Handle handoff decision
    if (decision.action === 'handoff') {
      const serialized = serializeState(mergedState)
      return {
        success: true,
        messages: [],
        newMode: 'handoff',
        intentsVistos: serialized.intentsVistos,
        templatesEnviados: serialized.templatesEnviados,
        datosCapturados: serialized.datosCapturados,
        packSeleccionado: serialized.packSeleccionado,
        intentInfo: {
          intent: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
        totalTokens: tokensUsed,
        silenceDetected: false,
        shouldCreateOrder: false,
        timerSignals,
        decisionInfo: {
          action: 'handoff',
          reason: decision.reason,
          gates,
        },
      }
    }

    // ------------------------------------------------------------------
    // C7: Response Composition
    // ------------------------------------------------------------------
    const responseResult = await composeResponse(decision, mergedState, input.workspaceId)

    // Update templates mostrados
    for (const tid of responseResult.templateIdsSent) {
      if (!mergedState.templatesMostrados.includes(tid)) {
        mergedState.templatesMostrados.push(tid)
      }
    }
    for (const action of responseResult.mostradoUpdates) {
      if (!mergedState.accionesEjecutadas.includes(action)) {
        mergedState.accionesEjecutadas.push(action)
      }
    }

    // ------------------------------------------------------------------
    // Build output
    // ------------------------------------------------------------------
    const serialized = serializeState(mergedState)
    const shouldCreateOrder = decision.action === 'create_order'

    return {
      success: true,
      messages: responseResult.messages.map(m => m.content),
      templates: responseResult.messages,
      newMode: computeMode(mergedState),
      intentsVistos: serialized.intentsVistos,
      templatesEnviados: serialized.templatesEnviados,
      datosCapturados: serialized.datosCapturados,
      packSeleccionado: serialized.packSeleccionado,
      intentInfo: {
        intent: analysis.intent.primary,
        confidence: analysis.intent.confidence,
        secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
        reasoning: analysis.intent.reasoning,
        timestamp: new Date().toISOString(),
      },
      totalTokens: tokensUsed,
      silenceDetected: false,
      shouldCreateOrder,
      orderData: shouldCreateOrder
        ? {
            datosCapturados: serialized.datosCapturados,
            packSeleccionado: serialized.packSeleccionado,
          }
        : undefined,
      timerSignals,
      decisionInfo: {
        action: decision.action,
        reason: decision.reason,
        templateIntents: decision.templateIntents,
        gates,
      },
      classificationInfo: {
        category: analysis.classification.category,
        sentiment: analysis.classification.sentiment,
        is_acknowledgment: analysis.classification.is_acknowledgment,
      },
      ingestInfo: {
        action: ingestResult.action,
        autoTrigger: ingestResult.autoTrigger,
      },
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[SomnioV3] Error processing message:', errMsg)
    return {
      success: false,
      messages: [],
      intentsVistos: input.intentsVistos,
      templatesEnviados: input.templatesEnviados,
      datosCapturados: input.datosCapturados,
      packSeleccionado: input.packSeleccionado,
      intentInfo: {
        intent: 'otro',
        confidence: 0,
        timestamp: new Date().toISOString(),
      },
      totalTokens: 0,
      silenceDetected: false,
      shouldCreateOrder: false,
      timerSignals: [],
    }
  }
}

// ============================================================================
// Mode Computation
// ============================================================================

/**
 * Compute the current mode from state (for session persistence).
 * Maps v3 internal state to engine-compatible mode names.
 */
function computeMode(state: AgentState): string {
  if (state.accionesEjecutadas.includes('crear_orden')) return 'orden_creada'
  if (state.accionesEjecutadas.includes('mostrar_confirmacion')) return 'confirmacion'
  if (state.accionesEjecutadas.includes('ofrecer_promos')) return 'promos'
  if (state.enCapturaSilenciosa) {
    return state.ofiInter ? 'captura_inter' : 'captura'
  }
  if (state.turnCount === 0) return 'nuevo'
  return 'conversacion'
}
