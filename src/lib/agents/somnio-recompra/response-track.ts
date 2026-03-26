/**
 * Somnio Recompra Agent — Response Track (Two-Track Decision)
 *
 * Template engine that determines WHAT TO SAY.
 * Fork of somnio-v3/response-track.ts — simplified for returning clients.
 *
 * Key differences:
 * - preguntar_direccion action: shows preloaded address + asks confirmation
 * - ofrecer_promos in initial: prepends time-of-day greeting
 * - precio intent: sends promos + modo_pago, excludes tiempo_efecto_1
 * - getGreeting() helper: Buenos dias/tardes/noches based on Colombia timezone
 * - No ofi inter template resolution
 * - No retoma_datos/retoma_datos_parciales/retoma_datos_implicito
 */

import { TemplateManager } from '@/lib/agents/somnio/template-manager'
import { composeBlock, type PrioritizedTemplate } from '@/lib/agents/somnio/block-composer'
import type { IntentRecord } from '@/lib/agents/types'
import {
  INFORMATIONAL_INTENTS,
  ACTION_TEMPLATE_MAP,
} from './constants'
import { buildResumenContext, camposFaltantes } from './state'
import { lookupDeliveryZone, formatDeliveryTime } from '@/lib/agents/somnio-v3/delivery-zones'
import type { AgentState, ProcessedMessage, ResponseTrackOutput, TipoAccion } from './types'

// ============================================================================
// Agent ID (recompra uses same templates as v3 for now)
// ============================================================================

const SOMNIO_RECOMPRA_AGENT_ID = 'somnio-recompra-v1'

// ============================================================================
// Main Response Track Function
// ============================================================================

export async function resolveResponseTrack(input: {
  salesAction?: TipoAccion
  intent?: string
  secondaryIntent?: string
  state: AgentState
  workspaceId: string
}): Promise<ResponseTrackOutput> {
  const { salesAction, intent, secondaryIntent, state, workspaceId } = input

  // ------------------------------------------------------------------
  // 1. Sales action templates
  // ------------------------------------------------------------------
  const salesTemplateIntents: string[] = []
  let extraContext: Record<string, string> | undefined

  if (salesAction) {
    const resolved = await resolveSalesActionTemplates(salesAction, state)
    salesTemplateIntents.push(...resolved.intents)
    extraContext = resolved.extraContext
  }

  // ------------------------------------------------------------------
  // 2. Informational intent templates
  // ------------------------------------------------------------------
  const infoTemplateIntents: string[] = []
  let infoExtraContext: Record<string, string> | undefined

  if (intent && INFORMATIONAL_INTENTS.has(intent)) {
    if (intent === 'precio') {
      // Recompra: precio sends promos (sin "cual deseas?") + modo_pago
      // No tiempo_efecto_1 (client already knows the product)
      infoTemplateIntents.push('promociones', 'pago')
    } else if (intent === 'tiempo_entrega') {
      const resolved = await resolveDeliveryTimeTemplates(state)
      infoTemplateIntents.push(resolved.templateIntent)
      infoExtraContext = resolved.extraContext
    } else {
      infoTemplateIntents.push(intent)
    }
  }
  if (secondaryIntent && INFORMATIONAL_INTENTS.has(secondaryIntent)) {
    if (secondaryIntent === 'tiempo_entrega' && !infoTemplateIntents.some(i => i.startsWith('tiempo_entrega'))) {
      const resolved = await resolveDeliveryTimeTemplates(state)
      infoTemplateIntents.push(resolved.templateIntent)
      infoExtraContext = { ...infoExtraContext, ...resolved.extraContext }
    } else if (secondaryIntent !== 'tiempo_entrega' && !infoTemplateIntents.includes(secondaryIntent)) {
      infoTemplateIntents.push(secondaryIntent)
    }
  }

  // ------------------------------------------------------------------
  // 3. Combine both sources
  // ------------------------------------------------------------------
  const allIntents = [...salesTemplateIntents, ...infoTemplateIntents]
  const hasSaludoCombined = infoTemplateIntents.includes('saludo') && allIntents.length > 1

  if (allIntents.length === 0) {
    return emptyResult()
  }

  // ------------------------------------------------------------------
  // 4. Load and process templates
  // ------------------------------------------------------------------
  const templateManager = new TemplateManager(workspaceId)

  const intentsVistos: IntentRecord[] = state.intentsVistos.map((intentName, i) => ({
    intent: intentName,
    orden: i,
    timestamp: new Date().toISOString(),
  }))

  const selectionMap = await templateManager.getTemplatesForIntents(
    SOMNIO_RECOMPRA_AGENT_ID,
    allIntents,
    intentsVistos,
    state.templatesMostrados,
  )

  // Process templates with variable substitution
  const variableContext: Record<string, string | undefined> = {
    ...Object.fromEntries(
      Object.entries(state.datos).map(([k, v]) => [k, v ?? undefined])
    ),
    ...extraContext,
    ...infoExtraContext,
    pack: state.pack ?? undefined,
  }

  const allProcessed: PrioritizedTemplate[] = []

  for (const [intentName, selection] of selectionMap) {
    if (selection.templates.length === 0) continue

    const processed = await templateManager.processTemplates(
      selection.templates,
      variableContext,
      false,
    )

    for (const pt of processed) {
      allProcessed.push({
        templateId: pt.id,
        content: pt.content,
        contentType: pt.contentType,
        priority: pt.priority,
        intent: intentName,
        orden: pt.orden,
        isNew: true,
        delaySeconds: pt.delaySeconds,
      })
    }
  }

  // Compose block
  const byIntent = new Map<string, PrioritizedTemplate[]>()
  for (const t of allProcessed) {
    const existing = byIntent.get(t.intent) ?? []
    existing.push(t)
    byIntent.set(t.intent, existing)
  }

  let finalBlock: PrioritizedTemplate[]

  if (hasSaludoCombined) {
    const saludoTemplates = byIntent.get('saludo') ?? []
    const saludoCORE = saludoTemplates
      .filter(t => t.priority === 'CORE')
      .sort((a, b) => a.orden - b.orden)[0]

    const nonSaludoByIntent = new Map<string, PrioritizedTemplate[]>()
    for (const [k, v] of byIntent) {
      if (k !== 'saludo') nonSaludoByIntent.set(k, v)
    }

    const composed = composeBlock(nonSaludoByIntent, [], 10)
    finalBlock = saludoCORE ? [saludoCORE, ...composed.block] : composed.block
  } else {
    const composed = composeBlock(byIntent, [])
    finalBlock = composed.block
  }

  // ------------------------------------------------------------------
  // 5. Build response
  // ------------------------------------------------------------------
  const messages: ProcessedMessage[] = []
  const templateIdsSent: string[] = []

  for (const t of finalBlock) {
    messages.push({
      templateId: t.templateId,
      content: t.content,
      contentType: t.contentType === 'imagen' ? 'imagen' : 'texto',
      delayMs: t.delaySeconds * 1000,
      priority: t.priority,
    })
    templateIdsSent.push(t.templateId)
  }

  return {
    messages,
    templateIdsSent,
    salesTemplateIntents,
    infoTemplateIntents,
  }
}

// ============================================================================
// Greeting Helper
// ============================================================================

/**
 * Compute time-of-day greeting based on Colombia timezone (America/Bogota).
 * Uses only the first name from the full name.
 */
export function getGreeting(nombre: string): string {
  const firstName = nombre.split(' ')[0] || nombre

  const now = new Date()
  const colombiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  const hour = colombiaTime.getHours()

  let greeting: string
  if (hour < 12) {
    greeting = 'Buenos dias'
  } else if (hour < 18) {
    greeting = 'Buenas tardes'
  } else {
    greeting = 'Buenas noches'
  }

  return `${greeting} ${firstName}`
}

// ============================================================================
// Field Labels (human-readable for preguntar_direccion missing fields)
// ============================================================================

const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre',
  apellido: 'Apellido',
  telefono: 'Telefono',
  ciudad: 'Ciudad',
  departamento: 'Departamento',
  direccion: 'Direccion completa',
  barrio: 'Barrio',
  correo: 'Correo electronico',
}

// ============================================================================
// Sales Action -> Template Resolution
// ============================================================================

async function resolveSalesActionTemplates(
  action: TipoAccion,
  state: AgentState,
): Promise<{ intents: string[]; extraContext?: Record<string, string> }> {
  switch (action) {
    case 'mostrar_confirmacion':
    case 'cambio': {
      if (!state.pack) {
        return { intents: [] }
      }
      return {
        intents: [`resumen_${state.pack}`],
        extraContext: buildResumenContext(state),
      }
    }

    case 'crear_orden': {
      const ciudad = state.datos.ciudad
      if (ciudad) {
        const zoneResult = await lookupDeliveryZone(ciudad)
        const tiempoEstimado = formatDeliveryTime(zoneResult)
        const templateIntent = zoneResult.zone === 'same_day'
          ? 'confirmacion_orden_same_day'
          : 'confirmacion_orden_transportadora'
        return {
          intents: [templateIntent],
          extraContext: {
            ...buildResumenContext(state),
            tiempo_estimado: tiempoEstimado,
          },
        }
      }
      return {
        intents: ['confirmacion_orden_transportadora'],
        extraContext: {
          ...buildResumenContext(state),
          tiempo_estimado: 'en 2-4 dias habiles',
        },
      }
    }

    case 'crear_orden_sin_promo': {
      return {
        intents: ['pendiente_promo'],
      }
    }

    case 'crear_orden_sin_confirmar': {
      return {
        intents: ['pendiente_confirmacion'],
      }
    }

    case 'preguntar_direccion': {
      const faltantes = camposFaltantes(state)
      const direccion = state.datos.direccion ?? ''
      const ciudad = state.datos.ciudad ?? ''

      if (faltantes.length === 0 || (direccion && ciudad)) {
        // All critical data present — ask for address confirmation
        return {
          intents: ['preguntar_direccion_recompra'],
          extraContext: {
            direccion_completa: [direccion, ciudad].filter(Boolean).join(', '),
            nombre_saludo: state.datos.nombre ? getGreeting(state.datos.nombre) : '',
          },
        }
      }

      // Missing critical data — ask for what's missing
      const labels = faltantes.map(f => FIELD_LABELS[f] ?? f)
      return {
        intents: ['preguntar_direccion_recompra'],
        extraContext: {
          campos_faltantes: labels.map(l => `- ${l}`).join('\n'),
          nombre_saludo: state.datos.nombre ? getGreeting(state.datos.nombre) : '',
        },
      }
    }

    case 'ofrecer_promos': {
      // In recompra, prepend greeting context for initial phase
      const greetingContext: Record<string, string> = state.datos.nombre
        ? { nombre_saludo: getGreeting(state.datos.nombre) }
        : {}

      return {
        intents: ['promociones'],
        extraContext: Object.keys(greetingContext).length > 0 ? greetingContext : undefined,
      }
    }

    default: {
      const mapped = ACTION_TEMPLATE_MAP[action]
      if (mapped) {
        return { intents: [...mapped] }
      }
      return { intents: [] }
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function resolveDeliveryTimeTemplates(state: AgentState): Promise<{
  templateIntent: string
  extraContext?: Record<string, string>
}> {
  const ciudad = state.datos.ciudad
  if (!ciudad) {
    return { templateIntent: 'tiempo_entrega_sin_ciudad' }
  }

  const zoneResult = await lookupDeliveryZone(ciudad)
  const tiempoEstimado = formatDeliveryTime(zoneResult)

  return {
    templateIntent: `tiempo_entrega_${zoneResult.zone}`,
    extraContext: { ciudad, tiempo_estimado: tiempoEstimado },
  }
}

function emptyResult(): ResponseTrackOutput {
  return {
    messages: [],
    templateIdsSent: [],
    salesTemplateIntents: [],
    infoTemplateIntents: [],
  }
}
