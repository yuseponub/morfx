/**
 * Somnio Sales Agent v3 — Main Agent Pipeline
 *
 * Two-track architecture:
 * C2: Comprehension (Claude Haiku)
 * C3: State Merge + StateChanges
 * C5: Compute Gates
 * Guards: R0 (low confidence), R1 (escape intents)
 * Sales Track: WHAT TO DO (pure state machine, absorbs ingest logic)
 * Response Track: WHAT TO SAY (template engine)
 * Catch-all: retoma timer when 0 messages + 0 timers
 *
 * Layers C0, C0.5, C8-C11 are handled by the engine/adapters.
 */

import { comprehend } from './comprehension'
import { mergeAnalysis, computeGates, serializeState, deserializeState, hasAction } from './state'
import { resolveSalesTrack } from './sales-track'
import { resolveResponseTrack } from './response-track'
import { checkGuards } from './guards'
import { derivePhase } from './phase'
import type { AgentState, V3AgentInput, V3AgentOutput, TimerSignal, SystemEvent, TipoAccion, AccionRegistrada } from './types'

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
      input.accionesEjecutadas ?? [],
    )
    // ------------------------------------------------------------------
    // C2: Comprehension (skip if systemEvent from timer)
    // ------------------------------------------------------------------
    let analysis: Awaited<ReturnType<typeof comprehend>>['analysis']
    let tokensUsed: number

    const systemEvent: SystemEvent | undefined = input.systemEvent

    // If we have a system event, skip comprehension
    if (systemEvent) {
      analysis = {
        intent: { primary: 'otro' as any, secondary: 'ninguno' as const, confidence: 100, reasoning: `systemEvent: ${systemEvent.type}` },
        extracted_fields: { nombre: null, apellido: null, telefono: null, ciudad: null, departamento: null, direccion: null, barrio: null, correo: null, indicaciones_extra: null, cedula_recoge: null, pack: null, ofi_inter: null },
        classification: { category: 'irrelevante' as const, sentiment: 'neutro' as const, is_acknowledgment: false },
        negations: { correo: false, telefono: false, barrio: false },
      }
      tokensUsed = 0
    } else {
      const recentBotMessages = input.history
        .filter(h => h.role === 'assistant')
        .slice(-2)
        .map(h => h.content)

      const result = await comprehend(
        input.message,
        input.history,
        input.datosCapturados,
        recentBotMessages,
      )
      analysis = result.analysis
      tokensUsed = result.tokensUsed
    }

    // ------------------------------------------------------------------
    // C3: State Merge
    // ------------------------------------------------------------------
    const { state: mergedState, changes } = mergeAnalysis(state, analysis)

    // ------------------------------------------------------------------
    // C5: Compute Gates
    // ------------------------------------------------------------------
    const gates = computeGates(mergedState)

    // ------------------------------------------------------------------
    // GUARDS (R0, R1) — run BEFORE tracks
    // Skip guards for system events (timers don't need confidence/escape checks)
    // ------------------------------------------------------------------
    if (!systemEvent) {
      const guardResult = checkGuards(analysis)
      if (guardResult.blocked) {
        if (guardResult.decision.timerSignal) {
          timerSignals.push(guardResult.decision.timerSignal)
        }
        const serialized = serializeState(mergedState)
        return {
          success: true,
          messages: [],
          newMode: 'handoff',
          intentsVistos: serialized.intentsVistos,
          templatesEnviados: serialized.templatesEnviados,
          datosCapturados: serialized.datosCapturados,
          packSeleccionado: serialized.packSeleccionado,
          accionesEjecutadas: serialized.accionesEjecutadas,
          intentInfo: {
            intent: analysis.intent.primary,
            confidence: analysis.intent.confidence,
            secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
            reasoning: analysis.intent.reasoning,
            timestamp: new Date().toISOString(),
          },
          totalTokens: tokensUsed,
          silenceDetected: timerSignals.some(s => s.level === 'silence'),
          shouldCreateOrder: false,
          timerSignals,
          decisionInfo: {
            action: 'handoff',
            reason: guardResult.decision.reason,
            gates,
          },
          classificationInfo: {
            category: analysis.classification.category,
            sentiment: analysis.classification.sentiment,
            is_acknowledgment: analysis.classification.is_acknowledgment,
          },
        }
      }
    }

    // ------------------------------------------------------------------
    // SALES TRACK — WHAT TO DO
    // ------------------------------------------------------------------
    const phase = derivePhase(mergedState.accionesEjecutadas)
    const salesResult = resolveSalesTrack({
      phase,
      intent: analysis.intent.primary,
      isAcknowledgment: analysis.classification.is_acknowledgment,
      sentiment: analysis.classification.sentiment,
      state: mergedState,
      gates,
      changes,
      category: analysis.classification.category,
      systemEvent,
    })

    if (salesResult.timerSignal) {
      timerSignals.push(salesResult.timerSignal)
    }

    // Apply captura mode from sales track
    if (salesResult.enterCaptura === true) mergedState.enCapturaSilenciosa = true
    else if (salesResult.enterCaptura === false) mergedState.enCapturaSilenciosa = false

    // Check for order creation
    const isCreateOrder = salesResult.accion === 'crear_orden'

    // ------------------------------------------------------------------
    // RESPONSE TRACK — WHAT TO SAY
    // ------------------------------------------------------------------
    const responseResult = await resolveResponseTrack({
      salesAction: salesResult.accion,
      intent: analysis.intent.primary,
      secondaryIntent: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
      state: mergedState,
      workspaceId: input.workspaceId,
    })

    // ------------------------------------------------------------------
    // Register action (SINGLE registration point — D3)
    // ------------------------------------------------------------------
    if (salesResult.accion && salesResult.accion !== 'silence') {
      mergedState.accionesEjecutadas.push({
        tipo: salesResult.accion,
        turno: mergedState.turnCount,
        origen: systemEvent ? 'timer' : 'bot',
      })
    }

    // Update templatesMostrados
    for (const tid of responseResult.templateIdsSent) {
      if (!mergedState.templatesMostrados.includes(tid)) {
        mergedState.templatesMostrados.push(tid)
      }
    }

    // ------------------------------------------------------------------
    // RETOMA CATCH-ALL: si 0 mensajes producidos y nadie vigila, activar retoma
    // ------------------------------------------------------------------
    if (responseResult.messages.length === 0 && timerSignals.length === 0) {
      timerSignals.push({ type: 'start', level: 'silence', reason: 'silencio sin timer activo' })
    }

    // ------------------------------------------------------------------
    // NATURAL SILENCE: response track produced 0 messages
    // ------------------------------------------------------------------
    if (responseResult.messages.length === 0) {
      const serialized = serializeState(mergedState)
      return {
        success: true,
        messages: [],
        newMode: computeMode(mergedState),
        intentsVistos: serialized.intentsVistos,
        templatesEnviados: serialized.templatesEnviados,
        datosCapturados: serialized.datosCapturados,
        packSeleccionado: serialized.packSeleccionado,
        accionesEjecutadas: serialized.accionesEjecutadas,
        intentInfo: {
          intent: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
          reasoning: analysis.intent.reasoning,
          timestamp: new Date().toISOString(),
        },
        totalTokens: tokensUsed,
        silenceDetected: timerSignals.some(s => s.level === 'silence'),
        shouldCreateOrder: false,
        timerSignals,
        decisionInfo: {
          action: 'silence',
          reason: salesResult.reason,
          templateIntents: [...responseResult.salesTemplateIntents, ...responseResult.infoTemplateIntents],
          gates,
        },
        salesTrackInfo: {
          accion: salesResult.accion,
          reason: salesResult.reason,
          enterCaptura: salesResult.enterCaptura,
        },
        responseTrackInfo: {
          salesTemplateIntents: responseResult.salesTemplateIntents,
          infoTemplateIntents: responseResult.infoTemplateIntents,
          totalMessages: 0,
        },
        classificationInfo: {
          category: analysis.classification.category,
          sentiment: analysis.classification.sentiment,
          is_acknowledgment: analysis.classification.is_acknowledgment,
        },
      }
    }

    // ------------------------------------------------------------------
    // Build output (has messages)
    // ------------------------------------------------------------------
    const serialized = serializeState(mergedState)

    return {
      success: true,
      messages: responseResult.messages.map(m => m.content),
      templates: responseResult.messages,
      newMode: computeMode(mergedState),
      intentsVistos: serialized.intentsVistos,
      templatesEnviados: serialized.templatesEnviados,
      datosCapturados: serialized.datosCapturados,
      packSeleccionado: serialized.packSeleccionado,
      accionesEjecutadas: serialized.accionesEjecutadas,
      intentInfo: {
        intent: analysis.intent.primary,
        confidence: analysis.intent.confidence,
        secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : undefined,
        reasoning: analysis.intent.reasoning,
        timestamp: new Date().toISOString(),
      },
      totalTokens: tokensUsed,
      silenceDetected: timerSignals.some(s => s.level === 'silence'),
      shouldCreateOrder: isCreateOrder,
      orderData: isCreateOrder
        ? {
            datosCapturados: serialized.datosCapturados,
            packSeleccionado: serialized.packSeleccionado,
          }
        : undefined,
      timerSignals,
      decisionInfo: {
        action: responseResult.messages.length === 0 ? 'silence'
          : isCreateOrder ? 'create_order'
          : 'respond',
        reason: salesResult.reason,
        templateIntents: [...responseResult.salesTemplateIntents, ...responseResult.infoTemplateIntents],
        gates,
      },
      salesTrackInfo: {
        accion: salesResult.accion,
        reason: salesResult.reason,
        enterCaptura: salesResult.enterCaptura,
      },
      responseTrackInfo: {
        salesTemplateIntents: responseResult.salesTemplateIntents,
        infoTemplateIntents: responseResult.infoTemplateIntents,
        totalMessages: responseResult.messages.length,
      },
      classificationInfo: {
        category: analysis.classification.category,
        sentiment: analysis.classification.sentiment,
        is_acknowledgment: analysis.classification.is_acknowledgment,
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
      accionesEjecutadas: input.accionesEjecutadas ?? [],
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
  if (hasAction(state.accionesEjecutadas, 'crear_orden')) return 'orden_creada'
  if (hasAction(state.accionesEjecutadas, 'mostrar_confirmacion')) return 'confirmacion'
  if (hasAction(state.accionesEjecutadas, 'ofrecer_promos')) return 'promos'
  if (state.enCapturaSilenciosa) {
    return state.ofiInter ? 'captura_inter' : 'captura'
  }
  if (state.turnCount === 0) return 'nuevo'
  return 'conversacion'
}
