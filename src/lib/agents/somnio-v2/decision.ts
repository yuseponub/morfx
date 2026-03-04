/**
 * Somnio Sales Agent v2 — Decision Engine (Capa 3)
 *
 * Pure rules engine. No AI, no network calls.
 * Priority-ordered rules that produce a Decision from analysis + state.
 *
 * Rules (R0-R9):
 * R0: Low confidence + otro → handoff
 * R1: Escape intents → handoff
 * R2: no_interesa → respond + close
 * R3: Acknowledgment → silence (with exceptions)
 * R4: rechazar → respond farewell
 * R5: confirmar + resumen shown → create_order
 * R6: seleccion_pack → resumen or pedir datos
 * R7: quiero_comprar → promos or pedir datos
 * R8: Auto-resumen (datos + pack + promos)
 * R9: Default → templates for intent
 */

import type { MessageAnalysis } from './comprehension-schema'
import type { AgentState, Decision } from './types'
import { ESCAPE_INTENTS_V2, LOW_CONFIDENCE_THRESHOLD, PACK_PRICES } from './constants'
import { computarFase, datosCompletos, camposFaltantes } from './state'

// ============================================================================
// Main Decision Function
// ============================================================================

export function decide(analysis: MessageAnalysis, state: AgentState): Decision {
  const fase = computarFase(state)
  const intent = analysis.intent.primary
  const confidence = analysis.intent.confidence

  // ================================================================
  // R0: Low confidence + otro → handoff
  // ================================================================
  if (confidence < LOW_CONFIDENCE_THRESHOLD && intent === 'otro') {
    return {
      action: 'handoff',
      reason: `Confidence ${confidence}% + intent=otro`,
    }
  }

  // ================================================================
  // R1: Escape intents → handoff
  // ================================================================
  if (ESCAPE_INTENTS_V2.has(intent)) {
    return {
      action: 'handoff',
      timerSignal: 'cancel',
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
      timerSignal: 'cancel',
      reason: 'Cliente no interesado',
    }
  }

  // ================================================================
  // R3: Acknowledgment → silence (with exceptions)
  // ================================================================
  if (analysis.classification.is_acknowledgment) {
    // Exception: positive ack after resumen → treat as confirmation (R5)
    if (fase === 'resumen_mostrado' && isPositiveAck(analysis)) {
      return decideConfirmacion(state)
    }
    // Exception: in promos/pack context, don't silence
    if (fase === 'vio_promos' || fase === 'pack_elegido') {
      // Let it fall through to R9
    } else {
      return {
        action: 'silence',
        timerSignal: 'start_silence',
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
      timerSignal: 'cancel',
      reason: 'Cliente rechazo',
    }
  }

  // ================================================================
  // R5: confirmar + resumen shown → create order
  // ================================================================
  if (intent === 'confirmar' && fase === 'resumen_mostrado') {
    return decideConfirmacion(state)
  }

  // ================================================================
  // R6: Pack selection or pack already chosen
  // ================================================================
  if (intent === 'seleccion_pack' || (state.pack !== null && intent !== 'otro')) {
    if (state.pack && datosCompletos(state) && !state.mostrado.has('resumen')) {
      return {
        action: 'respond',
        templateIntents: [getResumenIntent(state.pack)],
        extraContext: buildResumenContext(state),
        reason: `Pack=${state.pack} + datos completos → resumen`,
      }
    }
    if (state.pack && !datosCompletos(state)) {
      return {
        action: 'respond',
        templateIntents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
        reason: `Pack=${state.pack} pero faltan: ${camposFaltantes(state).join(', ')}`,
      }
    }
  }

  // ================================================================
  // R7: quiero_comprar → promos or pedir datos
  // ================================================================
  if (intent === 'quiero_comprar') {
    if (!state.mostrado.has('promos')) {
      return {
        action: 'respond',
        templateIntents: ['promociones'],
        reason: 'Quiere comprar, mostrar promos primero',
      }
    }
    if (!datosCompletos(state)) {
      return {
        action: 'respond',
        templateIntents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
        reason: 'Quiere comprar, faltan datos',
      }
    }
  }

  // ================================================================
  // R8: Auto-resumen (datos + pack + promos vistas)
  // ================================================================
  if (
    datosCompletos(state) &&
    state.pack &&
    state.mostrado.has('promos') &&
    !state.mostrado.has('resumen')
  ) {
    return {
      action: 'respond',
      templateIntents: [getResumenIntent(state.pack)],
      extraContext: buildResumenContext(state),
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

function decideConfirmacion(state: AgentState): Decision {
  if (!datosCompletos(state)) {
    return {
      action: 'respond',
      templateIntents: ['pedir_datos'],
      extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
      reason: 'Confirmo pero faltan datos',
    }
  }
  if (!state.pack) {
    return {
      action: 'respond',
      templateIntents: ['promociones'],
      reason: 'Confirmo pero no ha elegido pack',
    }
  }
  return {
    action: 'create_order',
    templateIntents: ['confirmacion_orden'],
    timerSignal: 'cancel',
    reason: 'Confirmacion con datos completos + pack',
  }
}

function isPositiveAck(analysis: MessageAnalysis): boolean {
  return (
    analysis.classification.sentiment === 'positivo' ||
    analysis.intent.primary === 'confirmar'
  )
}

// ============================================================================
// Helpers
// ============================================================================

function getResumenIntent(pack: '1x' | '2x' | '3x'): string {
  return `resumen_${pack}`
}

export function buildResumenContext(state: AgentState): Record<string, string> {
  return {
    nombre: state.datos.nombre ?? '',
    ciudad: state.datos.ciudad ?? '',
    direccion: state.datos.direccion ?? '',
    departamento: state.datos.departamento ?? '',
    telefono: state.datos.telefono ?? '',
    pack: state.pack ?? '',
    precio: state.pack ? PACK_PRICES[state.pack] : '',
  }
}
