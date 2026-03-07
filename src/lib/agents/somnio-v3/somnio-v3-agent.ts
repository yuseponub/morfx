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
import { mergeAnalysis, computeGates, serializeState, deserializeState, hasAction } from './state'
import { evaluateIngest } from './ingest'
import { decide, transitionToDecision } from './decision'
import { composeResponse } from './response'
import { derivePhase } from './phase'
import { resolveTransition, systemEventToKey } from './transitions'
import type { AgentState, Decision, V3AgentInput, V3AgentOutput, TimerSignal, SystemEvent, TipoAccion, AccionRegistrada } from './types'

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
    // C2: Comprehension (skip if forceIntent from timer)
    // ------------------------------------------------------------------
    let analysis: Awaited<ReturnType<typeof comprehend>>['analysis']
    let tokensUsed: number

    // Translate forceIntent -> SystemEvent (backward compat layer)
    let systemEvent: SystemEvent | undefined = input.systemEvent
    if (!systemEvent && input.forceIntent) {
      switch (input.forceIntent) {
        case 'ofrecer_promos':
          systemEvent = { type: 'timer_expired', level: 2 }
          break
        case 'timer_sinpack':
          systemEvent = { type: 'timer_expired', level: 3 }
          break
        case 'timer_pendiente':
          systemEvent = { type: 'timer_expired', level: 4 }
          break
        default:
          // Unknown forceIntent — treat as synthetic analysis for backward compat
          break
      }
    }

    // If we have a system event, skip comprehension
    if (systemEvent) {
      analysis = {
        intent: { primary: 'otro' as any, secondary: 'ninguno' as const, confidence: 100, reasoning: `systemEvent: ${systemEvent.type}` },
        extracted_fields: { nombre: null, apellido: null, telefono: null, ciudad: null, departamento: null, direccion: null, barrio: null, correo: null, indicaciones_extra: null, cedula_recoge: null, pack: null, ofi_inter: null },
        classification: { category: 'irrelevante' as const, sentiment: 'neutro' as const, is_acknowledgment: false },
        negations: { correo: false, telefono: false, barrio: false },
      }
      tokensUsed = 0
    } else if (input.forceIntent) {
      // Legacy forceIntent that didn't map to a system event — synthetic analysis with intent
      analysis = {
        intent: { primary: input.forceIntent as any, secondary: 'ninguno' as const, confidence: 100, reasoning: `forceIntent: ${input.forceIntent}` },
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
        accionesEjecutadas: mergedState.accionesEjecutadas,
      }
    }

    // ------------------------------------------------------------------
    // C6: Decision Engine (with SystemEvent routing)
    // ------------------------------------------------------------------
    let decision: Decision
    if (systemEvent) {
      // Input-level system event (timer expired) -> transition table lookup
      const phase = derivePhase(mergedState.accionesEjecutadas)
      const eventKey = systemEventToKey(systemEvent)
      const result = resolveTransition(phase, eventKey, mergedState, gates)
      if (result) {
        decision = transitionToDecision(result.action, result.output)
      } else {
        // Fallback: unknown system event
        decision = { action: 'respond', templateIntents: ['otro'], reason: `Unknown system event: ${eventKey}` }
      }
    } else {
      // Normal flow: C6 Decision Engine (which internally handles ingest systemEvent)
      decision = decide(analysis, mergedState, gates, ingestResult)
    }

    if (decision.timerSignal) {
      timerSignals.push(decision.timerSignal)
    }

    // Update captura mode based on decision
    if (decision.enterCaptura === true) {
      mergedState.enCapturaSilenciosa = true
    } else if (decision.enterCaptura === false) {
      mergedState.enCapturaSilenciosa = false
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
        accionesEjecutadas: mergedState.accionesEjecutadas,
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
        accionesEjecutadas: mergedState.accionesEjecutadas,
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

    // Register action (SINGLE registration point — D3)
    const actionToRegister = determineAction(decision, systemEvent, ingestResult)
    if (actionToRegister) {
      mergedState.accionesEjecutadas.push({
        tipo: actionToRegister,
        turno: mergedState.turnCount,
        origen: systemEvent ? 'timer'
              : ingestResult.systemEvent ? 'ingest'
              : 'bot',
      })
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
        systemEvent: ingestResult.systemEvent
          ? { ...ingestResult.systemEvent }
          : undefined,
      },
      accionesEjecutadas: mergedState.accionesEjecutadas,
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
      accionesEjecutadas: [],
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

// ============================================================================
// Action Determination
// ============================================================================

/**
 * Determine which action to register based on the decision.
 * Returns null if no meaningful action to register (e.g., generic responses).
 */
function determineAction(
  decision: Decision,
  systemEvent: SystemEvent | undefined,
  ingestResult: { systemEvent?: SystemEvent },
): TipoAccion | null {
  if (decision.action === 'create_order') return 'crear_orden'
  if (decision.action === 'handoff') return 'handoff'
  if (decision.action === 'silence') return 'silence'

  // For 'respond' decisions, determine from templateIntents
  const ti = decision.templateIntents ?? []
  if (ti.includes('promociones') || ti.includes('quiero_comprar')) return 'ofrecer_promos'
  if (ti.some(t => t.startsWith('resumen'))) return 'mostrar_confirmacion'
  if (ti.includes('pedir_datos') || ti.includes('captura_datos_si_compra')) return 'pedir_datos'
  if (ti.includes('ask_ofi_inter')) return 'ask_ofi_inter'
  if (ti.includes('no_interesa')) return 'no_interesa'
  if (ti.includes('rechazar') || ti.includes('no_confirmado')) return 'rechazar'
  if (ti.includes('confirmacion_orden')) return 'crear_orden'

  // R9 fallback (saludo, precio, etc.) — no action to register
  return null
}
