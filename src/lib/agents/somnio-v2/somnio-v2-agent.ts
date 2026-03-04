/**
 * Somnio Sales Agent v2 — Main Agent
 *
 * Processes customer messages through the 4-layer pipeline:
 * 1. Comprehension (Claude AI) → structured analysis
 * 2. State (deterministic) → merge data, compute fase
 * 3. Decision (rules) → what to do next
 * 4. Response (templates) → what to say
 *
 * Only used in sandbox. V1 agent is untouched.
 */

import { comprehend } from './comprehension'
import { mergeAnalysis, computarFase } from './state'
import { decide } from './decision'
import { respondBasic } from './response'
import type { AgentState, V2AgentInput, V2AgentOutput } from './types'
import { V2_META_PREFIX } from './constants'

// ============================================================================
// State Serialization (datosCapturados ↔ AgentState)
// ============================================================================

/**
 * Reconstruct AgentState from flat datosCapturados.
 * v2 metadata stored with _v2: prefix.
 */
function inputToState(input: V2AgentInput): AgentState {
  const dc = input.datosCapturados

  // Extract real data fields (no _v2: prefix)
  const datos = {
    nombre: dc.nombre ?? null,
    apellido: dc.apellido ?? null,
    telefono: dc.telefono ?? null,
    ciudad: dc.ciudad ?? null,
    departamento: dc.departamento ?? null,
    direccion: dc.direccion ?? null,
    barrio: dc.barrio ?? null,
    correo: dc.correo ?? null,
    indicaciones_extra: dc.indicaciones_extra ?? null,
    cedula_recoge: dc.cedula_recoge ?? null,
  }

  // Extract v2 metadata
  const mostradoRaw = dc[`${V2_META_PREFIX}mostrado`] ?? ''
  const negacionesRaw = dc[`${V2_META_PREFIX}negaciones`]
  const ofiInter = dc[`${V2_META_PREFIX}ofiInter`] === 'true'
  const confirmado = dc[`${V2_META_PREFIX}confirmado`] === 'true'
  const turnCount = parseInt(dc[`${V2_META_PREFIX}turnCount`] ?? '0', 10)

  let negaciones = { correo: false, telefono: false, barrio: false }
  if (negacionesRaw) {
    try {
      negaciones = JSON.parse(negacionesRaw)
    } catch { /* use defaults */ }
  }

  return {
    datos,
    pack: (input.packSeleccionado as '1x' | '2x' | '3x') ?? null,
    ofiInter,
    confirmado,
    negaciones,
    mostrado: new Set(mostradoRaw ? mostradoRaw.split(',') : []),
    templatesEnviados: input.templatesEnviados,
    intentsVistos: input.intentsVistos,
    turnCount,
  }
}

/**
 * Serialize AgentState back to flat datosCapturados + packSeleccionado.
 */
function stateToOutput(state: AgentState): {
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
} {
  const dc: Record<string, string> = {}

  // Serialize real data fields
  for (const [key, value] of Object.entries(state.datos)) {
    if (value !== null && value.trim() !== '') {
      dc[key] = value
    }
  }

  // Serialize v2 metadata
  if (state.mostrado.size > 0) {
    dc[`${V2_META_PREFIX}mostrado`] = Array.from(state.mostrado).join(',')
  }
  dc[`${V2_META_PREFIX}negaciones`] = JSON.stringify(state.negaciones)
  dc[`${V2_META_PREFIX}ofiInter`] = String(state.ofiInter)
  dc[`${V2_META_PREFIX}confirmado`] = String(state.confirmado)
  dc[`${V2_META_PREFIX}turnCount`] = String(state.turnCount)

  return {
    datosCapturados: dc,
    packSeleccionado: state.pack,
  }
}

// ============================================================================
// Agent Class
// ============================================================================

export class SomnioV2Agent {
  /**
   * Process a customer message through the v2 pipeline.
   */
  async processMessage(input: V2AgentInput): Promise<V2AgentOutput> {
    // Reconstruct state from input
    const state = inputToState(input)

    // Filter out _v2: metadata keys from existingData passed to comprehension
    const existingData: Record<string, string> = {}
    for (const [k, v] of Object.entries(input.datosCapturados)) {
      if (!k.startsWith(V2_META_PREFIX)) {
        existingData[k] = v
      }
    }

    // ====== CAPA 1: Comprehension ======
    const { analysis, tokensUsed } = await comprehend(
      input.message,
      input.history,
      existingData,
    )

    // ====== CAPA 2: State ======
    const updatedState = mergeAnalysis(state, analysis)

    // ====== CAPA 3: Decision ======
    const decision = decide(analysis, updatedState)

    // ====== CAPA 4: Response ======
    let messages: string[] = []
    let silenceDetected = false
    let newMode: string | undefined

    if (decision.action === 'silence') {
      silenceDetected = true
      newMode = input.currentMode // keep current mode
    } else if (decision.action === 'handoff') {
      newMode = 'handed_off'
      messages = ['[Transferido a asesor humano]']
    } else if (decision.action === 'respond' || decision.action === 'create_order') {
      const responseResult = await respondBasic(
        decision,
        updatedState,
        input.workspaceId,
      )

      messages = responseResult.messages

      // Apply mostrado updates
      for (const update of responseResult.mostradoUpdates) {
        updatedState.mostrado.add(update)
      }

      // Track sent templates
      updatedState.templatesEnviados.push(...responseResult.sent)

      // Handle create_order
      if (decision.action === 'create_order') {
        updatedState.confirmado = true
        newMode = 'confirmado'
      }

      // Fallback if no templates found
      if (messages.length === 0) {
        messages = [buildFallbackMessage(analysis.intent.primary)]
      }
    }

    // Serialize state back
    const { datosCapturados, packSeleccionado } = stateToOutput(updatedState)

    return {
      success: true,
      messages,
      newMode,
      intentsVistos: updatedState.intentsVistos,
      templatesEnviados: updatedState.templatesEnviados,
      datosCapturados,
      packSeleccionado,
      intentInfo: {
        intent: analysis.intent.primary,
        confidence: analysis.intent.confidence,
        reasoning: analysis.intent.reasoning,
        timestamp: new Date().toISOString(),
      },
      totalTokens: tokensUsed,
      silenceDetected,
      decisionInfo: {
        action: decision.action,
        reason: decision.reason,
        templateIntents: decision.templateIntents,
      },
      classificationInfo: {
        category: analysis.classification.category,
        sentiment: analysis.classification.sentiment,
        is_acknowledgment: analysis.classification.is_acknowledgment,
      },
    }
  }
}

// ============================================================================
// Fallback
// ============================================================================

function buildFallbackMessage(intent: string): string {
  const fallbacks: Record<string, string> = {
    saludo: 'Hola! Bienvenido a Somnio. ¿En que te puedo ayudar?',
    precio: 'Nuestros precios son: 1 frasco $77,900 | 2 frascos $109,900 | 3 frascos $139,900. Envio gratis!',
    promociones: '¡Tenemos estas promociones!\n1 frasco (1x): $77,900\n2 frascos (2x): $109,900\n3 frascos (3x): $139,900\n¿Cual te interesa?',
    pedir_datos: 'Para procesar tu pedido necesito tus datos: nombre, telefono, ciudad, direccion.',
    confirmacion_orden: '¡Tu pedido ha sido creado! Te contactaremos pronto.',
  }
  return fallbacks[intent] ?? 'Gracias por tu mensaje. ¿En que te puedo ayudar?'
}
