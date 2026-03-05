/**
 * Somnio Sales Agent v3 — Decision Engine (Capa 6)
 *
 * Pure rules engine. No AI, no network calls.
 * Priority-ordered rules that produce a Decision from analysis + state + gates.
 *
 * Rules (R0-R9):
 * R0: Low confidence + otro → handoff
 * R1: Escape intents → handoff
 * R2: no_interesa → respond + close
 * R3: Acknowledgment → silence (with exceptions)
 * R4: rechazar → respond farewell
 * R5: confirmar + datosOk + packElegido → create_order
 * R6: seleccion_pack → confirmacion or pedir datos
 * R7: quiero_comprar → promos or pedir datos
 * R8: datosOk + packElegido + promos mostradas → auto confirmacion
 * R9: Default → templates for intent
 */

import type { MessageAnalysis } from './comprehension-schema'
import type { AgentState, Decision, Gates, IngestResult } from './types'
import {
  ESCAPE_INTENTS,
  NEVER_SILENCE_INTENTS,
  LOW_CONFIDENCE_THRESHOLD,
  PACK_PRICES,
} from './constants'
import { camposFaltantes, buildResumenContext } from './state'

// ============================================================================
// Main Decision Function
// ============================================================================

export function decide(
  analysis: MessageAnalysis,
  state: AgentState,
  gates: Gates,
  ingestResult: IngestResult,
): Decision {
  const intent = analysis.intent.primary
  const confidence = analysis.intent.confidence

  // ------------------------------------------------------------------
  // Ingest auto-triggers take priority (from Capa 4)
  // ------------------------------------------------------------------
  if (ingestResult.autoTrigger === 'ofrecer_promos') {
    return {
      action: 'respond',
      templateIntents: ['promociones'],
      timerSignal: { type: 'start', level: 'L3', reason: 'promos mostradas, esperando pack' },
      enterCaptura: false,
      reason: 'Auto-trigger: datosOk → ofrecer promos',
    }
  }

  if (ingestResult.autoTrigger === 'mostrar_confirmacion') {
    return {
      action: 'respond',
      templateIntents: [getResumenIntent(state.pack!)],
      extraContext: buildResumenContext(state),
      reason: 'Auto-trigger: datosOk + pack → confirmacion',
    }
  }

  // ------------------------------------------------------------------
  // Ingest ask_ofi_inter
  // ------------------------------------------------------------------
  if (ingestResult.action === 'ask_ofi_inter') {
    return {
      action: 'respond',
      templateIntents: ['ask_ofi_inter'],
      reason: 'Ciudad sin direccion → preguntar ofi inter',
    }
  }

  // ================================================================
  // R0: Low confidence + otro → handoff
  // ================================================================
  if (confidence < LOW_CONFIDENCE_THRESHOLD && intent === 'otro') {
    return {
      action: 'handoff',
      timerSignal: { type: 'cancel', reason: 'handoff por baja confianza' },
      reason: `Confidence ${confidence}% + intent=otro`,
    }
  }

  // ================================================================
  // R1: Escape intents → handoff
  // ================================================================
  if (ESCAPE_INTENTS.has(intent)) {
    return {
      action: 'handoff',
      timerSignal: { type: 'cancel', reason: `escape: ${intent}` },
      reason: `Escape intent: ${intent}`,
    }
  }

  // ================================================================
  // R2: no_interesa → respond + close
  // ================================================================
  if (intent === 'no_interesa') {
    return {
      action: 'respond',
      templateIntents: ['no_interesa'],
      timerSignal: { type: 'cancel', reason: 'no interesa' },
      reason: 'Cliente no interesado',
    }
  }

  // ================================================================
  // R3: Acknowledgment → silence (with exceptions)
  // ================================================================
  if (analysis.classification.is_acknowledgment && !NEVER_SILENCE_INTENTS.has(intent)) {
    // Exception: positive ack after promos → treat as interest (don't silence)
    if (hasShownPromos(state) && !gates.packElegido) {
      // Fall through to R9 — respond to keep conversation going
    }
    // Exception: after confirmacion shown → treat as confirmation
    else if (hasShownResumen(state) && isPositiveAck(analysis)) {
      return decideConfirmacion(state, gates)
    }
    else {
      return {
        action: 'silence',
        timerSignal: { type: 'start', level: 'silence', reason: 'ack sin contexto confirmatorio' },
        reason: 'Acknowledgment sin contexto confirmatorio',
      }
    }
  }

  // ================================================================
  // R4: rechazar → farewell
  // ================================================================
  if (intent === 'rechazar') {
    return {
      action: 'respond',
      templateIntents: ['rechazar'],
      timerSignal: { type: 'cancel', reason: 'rechazo' },
      reason: 'Cliente rechazo',
    }
  }

  // ================================================================
  // R5: confirmar + datosOk + packElegido → create order
  // ================================================================
  if (intent === 'confirmar') {
    return decideConfirmacion(state, gates)
  }

  // ================================================================
  // R6: seleccion_pack → confirmacion or pedir datos
  // ================================================================
  if (intent === 'seleccion_pack') {
    if (gates.datosOk) {
      return {
        action: 'respond',
        templateIntents: [getResumenIntent(state.pack!)],
        extraContext: buildResumenContext(state),
        timerSignal: { type: 'start', level: 'L4', reason: 'pack elegido, esperando confirmacion' },
        reason: `Pack=${state.pack} + datosOk → resumen`,
      }
    }
    return {
      action: 'respond',
      templateIntents: ['pedir_datos'],
      extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
      enterCaptura: true,
      timerSignal: { type: 'start', level: 'L0', reason: 'captura iniciada (tiene pack, faltan datos)' },
      reason: `Pack=${state.pack} pero faltan: ${camposFaltantes(state).join(', ')}`,
    }
  }

  // ================================================================
  // R7: quiero_comprar → promos or pedir datos
  // ================================================================
  if (intent === 'quiero_comprar') {
    if (gates.datosOk && !hasShownPromos(state)) {
      return {
        action: 'respond',
        templateIntents: ['promociones'],
        timerSignal: { type: 'start', level: 'L3', reason: 'promos mostradas' },
        reason: 'Quiere comprar + datosOk → promos',
      }
    }
    if (!gates.datosOk) {
      return {
        action: 'respond',
        templateIntents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
        enterCaptura: true,
        timerSignal: { type: 'start', level: 'L0', reason: 'captura iniciada por quiero_comprar' },
        reason: 'Quiere comprar, faltan datos',
      }
    }
    // datosOk + promos ya mostradas → fall through to R9
  }

  // ================================================================
  // R8: datosOk + packElegido + promos mostradas → auto confirmacion
  // ================================================================
  if (
    gates.datosOk &&
    gates.packElegido &&
    hasShownPromos(state) &&
    !hasShownResumen(state)
  ) {
    return {
      action: 'respond',
      templateIntents: [getResumenIntent(state.pack!)],
      extraContext: buildResumenContext(state),
      timerSignal: { type: 'start', level: 'L4', reason: 'auto-resumen' },
      reason: 'Auto-resumen: datos completos + pack + promos vistas',
    }
  }

  // ================================================================
  // R9: Default → respond with intent templates
  // ================================================================
  const intentsAResponder: string[] = [intent]
  if (analysis.intent.secondary !== 'ninguno') {
    intentsAResponder.push(analysis.intent.secondary)
  }

  return {
    action: 'respond',
    templateIntents: intentsAResponder,
    reason: `Responder a intent: ${intentsAResponder.join(' + ')}`,
  }
}

// ============================================================================
// Sub-decisions
// ============================================================================

function decideConfirmacion(state: AgentState, gates: Gates): Decision {
  if (!gates.datosOk) {
    return {
      action: 'respond',
      templateIntents: ['pedir_datos'],
      extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
      enterCaptura: true,
      reason: 'Confirmo pero faltan datos',
    }
  }
  if (!gates.packElegido) {
    return {
      action: 'respond',
      templateIntents: ['promociones'],
      timerSignal: { type: 'start', level: 'L3', reason: 'confirmo sin pack → promos' },
      reason: 'Confirmo pero no ha elegido pack',
    }
  }
  return {
    action: 'create_order',
    templateIntents: ['confirmacion_orden'],
    extraContext: buildResumenContext(state),
    timerSignal: { type: 'cancel', reason: 'orden creada' },
    reason: 'Confirmacion con datos completos + pack',
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getResumenIntent(pack: '1x' | '2x' | '3x'): string {
  return `resumen_${pack}`
}

function isPositiveAck(analysis: MessageAnalysis): boolean {
  return (
    analysis.classification.sentiment === 'positivo' ||
    analysis.intent.primary === 'confirmar'
  )
}

function hasShownPromos(state: AgentState): boolean {
  return state.accionesEjecutadas.includes('ofrecer_promos') ||
    state.intentsVistos.includes('promociones')
}

function hasShownResumen(state: AgentState): boolean {
  return state.accionesEjecutadas.includes('mostrar_confirmacion') ||
    state.templatesMostrados.some(t => t.includes('resumen'))
}
