/**
 * GoDentist Appointment Agent — Response Track
 *
 * Template engine that determines WHAT TO SAY.
 * Combines two independent template sources:
 *   1. Sales action templates (from sales track accion)
 *   2. Informational intent templates (from INFORMATIONAL_INTENTS set)
 *
 * For precio_servicio: maps servicioDetectado to service-specific template.
 * English detection returns english_response template immediately.
 *
 * Uses TemplateManager and composeBlock from somnio shared code.
 */

import { TemplateManager } from '@/lib/agents/somnio/template-manager'
import { composeBlock, type PrioritizedTemplate } from '@/lib/agents/somnio/block-composer'
import type { IntentRecord } from '@/lib/agents/types'
import {
  INFORMATIONAL_INTENTS,
  ACTION_TEMPLATE_MAP,
} from './constants'
import { GODENTIST_AGENT_ID } from './config'
import { buildResumenContext, camposFaltantes } from './state'
import type { AgentState, ProcessedMessage, ResponseTrackOutput, TipoAccion } from './types'

// ============================================================================
// Display Names
// ============================================================================

const SEDE_DISPLAY_NAMES: Record<string, string> = {
  cabecera: 'Cabecera',
  mejoras_publicas: 'Mejoras Publicas',
  floridablanca: 'Floridablanca',
  canaveral: 'Canaveral (CC Jumbo El Bosque)',
}

const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre completo',
  cedula: 'Número de cédula',
  telefono: 'Celular',
  sede_preferida: 'Sede de tu preferencia: Cabecera, Mejoras Públicas, Floridablanca o Cañaveral',
}

// ============================================================================
// Service -> Template Intent Mapping
// ============================================================================

/**
 * Maps servicioDetectado enum values to their template intent names.
 * Pattern: precio_${service} for most, with special cases.
 */
const SERVICE_TEMPLATE_MAP: Record<string, string> = {
  corona: 'precio_corona',
  protesis: 'precio_protesis',
  alineadores: 'precio_alineadores',
  brackets_convencional: 'precio_brackets_conv',
  brackets_zafiro: 'precio_brackets_zafiro',
  autoligado_clasico: 'precio_autoligado_clasico',
  autoligado_pro: 'precio_autoligado_pro',
  autoligado_ceramico: 'precio_autoligado_ceramico',
  implante: 'precio_implante',
  blanqueamiento: 'precio_blanqueamiento',
  limpieza: 'precio_limpieza',
  extraccion_simple: 'precio_extraccion_simple',
  extraccion_juicio: 'precio_extraccion_juicio',
  diseno_sonrisa: 'precio_diseno_sonrisa',
  placa_ronquidos: 'precio_placa_ronquidos',
  calza_resina: 'precio_calza_resina',
  rehabilitacion: 'precio_rehabilitacion',
  radiografia: 'precio_radiografia',
  endodoncia: 'precio_endodoncia',
  carillas: 'precio_carillas',
  ortopedia_maxilar: 'precio_ortopedia',
  ortodoncia_general: 'precio_ortodoncia_general',
  // otro_servicio -> falls through to invitar_agendar
}

// ============================================================================
// Main Response Track Function
// ============================================================================

export async function resolveResponseTrack(input: {
  salesAction?: TipoAccion
  intent?: string
  secondaryIntent?: string
  state: AgentState
  workspaceId: string
  idioma?: string
  servicioDetectado?: string
  servicioSecundario?: string
}): Promise<ResponseTrackOutput> {
  const {
    salesAction,
    intent,
    secondaryIntent,
    state,
    workspaceId,
    idioma,
    servicioDetectado,
    servicioSecundario,
  } = input

  // ------------------------------------------------------------------
  // 0. English detection — immediate return
  // ------------------------------------------------------------------
  if (idioma === 'en') {
    return loadSingleTemplate('english_response', state, workspaceId)
  }

  // ------------------------------------------------------------------
  // 1. Sales action templates
  // ------------------------------------------------------------------
  const salesTemplateIntents: string[] = []
  let extraContext: Record<string, string> | undefined

  if (salesAction) {
    const resolved = resolveSalesActionTemplates(salesAction, state)
    salesTemplateIntents.push(...resolved.intents)
    extraContext = resolved.extraContext
  }

  // ------------------------------------------------------------------
  // 1b. Force saludo on first turn (turnCount === 0) even if client didn't greet
  // ------------------------------------------------------------------
  const isFirstTurn = state.turnCount <= 1 && !state.intentsVistos.includes('saludo')

  if (isFirstTurn && intent !== 'saludo') {
    // Inject saludo as informational so it renders first via combined path
    // (will be picked up by hasSaludoCombined logic below)
  }

  // ------------------------------------------------------------------
  // 2. Informational intent templates
  // ------------------------------------------------------------------
  const infoTemplateIntents: string[] = []

  // Inject saludo on first turn
  if (isFirstTurn && intent !== 'saludo') {
    infoTemplateIntents.push('saludo')
  }

  if (intent && INFORMATIONAL_INTENTS.has(intent)) {
    if (intent === 'precio_servicio') {
      const priceIntents = resolvePriceServiceTemplates(servicioDetectado)
      infoTemplateIntents.push(...priceIntents)
    } else {
      infoTemplateIntents.push(intent)
    }
  }

  if (secondaryIntent && INFORMATIONAL_INTENTS.has(secondaryIntent)) {
    if (secondaryIntent === 'precio_servicio') {
      // Use secondary service if different from primary
      const secondarySvc = servicioSecundario ?? servicioDetectado
      const priceIntents = resolvePriceServiceTemplates(secondarySvc)
      for (const pi of priceIntents) {
        if (!infoTemplateIntents.includes(pi)) {
          infoTemplateIntents.push(pi)
        }
      }
    } else if (!infoTemplateIntents.includes(secondaryIntent)) {
      infoTemplateIntents.push(secondaryIntent)
    }
  }

  // ------------------------------------------------------------------
  // 3. Combine both sources
  // ------------------------------------------------------------------
  const allIntents = [...salesTemplateIntents, ...infoTemplateIntents]
  const hasSaludoCombined = infoTemplateIntents.includes('saludo') && (allIntents.length > 1 || salesTemplateIntents.length > 0)

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
    GODENTIST_AGENT_ID,
    allIntents,
    intentsVistos,
    state.templatesMostrados,
  )

  // Build variable context from state datos + extraContext
  const variableContext: Record<string, string | undefined> = {
    ...Object.fromEntries(
      Object.entries(state.datos).map(([k, v]) => [k, v ?? undefined])
    ),
    ...extraContext,
  }

  // Map sede_preferida to display name for templates
  if (variableContext.sede_preferida) {
    variableContext.sede_preferida =
      SEDE_DISPLAY_NAMES[variableContext.sede_preferida] ?? variableContext.sede_preferida
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
    // Saludo combined path: saludo CORE first, then all templates from other intent(s)
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
    // Normal path: block composer with standard max 3
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
// Sales Action -> Template Resolution
// ============================================================================

function resolveSalesActionTemplates(
  action: TipoAccion,
  state: AgentState,
): { intents: string[]; extraContext?: Record<string, string> } {
  switch (action) {
    case 'pedir_datos':
      return { intents: ['pedir_datos'] }

    case 'pedir_datos_parcial': {
      const faltantes = camposFaltantes(state)
      const labels = faltantes.map(f => FIELD_LABELS[f] ?? f)
      return {
        intents: ['pedir_datos_parcial'],
        extraContext: { campos_faltantes: labels.map(l => `- ${l}`).join('\n') },
      }
    }

    case 'pedir_fecha':
      return {
        intents: ['pedir_fecha'],
        extraContext: { nombre: state.datos.nombre ?? '' },
      }

    case 'mostrar_disponibilidad': {
      // DEFERRED: Dentos API integration. Use placeholder slots.
      const sedeDisplay = state.datos.sede_preferida
        ? (SEDE_DISPLAY_NAMES[state.datos.sede_preferida] ?? state.datos.sede_preferida)
        : ''
      return {
        intents: ['mostrar_disponibilidad'],
        extraContext: {
          fecha: state.datos.fecha_preferida ?? '',
          sede_preferida: sedeDisplay,
          slots_manana: '(Disponibilidad pendiente)',
          slots_tarde: '(Disponibilidad pendiente)',
        },
      }
    }

    case 'mostrar_confirmacion':
      return {
        intents: ['confirmar_cita'],
        extraContext: buildResumenContext(state),
      }

    case 'agendar_cita':
      return {
        intents: ['cita_agendada'],
        extraContext: buildResumenContext(state),
      }

    case 'invitar_agendar':
      return { intents: ['invitar_agendar'] }

    case 'retoma_datos': {
      const faltantes = camposFaltantes(state)
      const labels = faltantes.map(f => FIELD_LABELS[f] ?? f)
      return {
        intents: ['retoma_datos'],
        extraContext: { campos_faltantes: labels.map(l => `- ${l}`).join('\n') },
      }
    }

    case 'retoma_fecha':
      return { intents: ['retoma_fecha'] }

    case 'retoma_horario':
      return { intents: ['retoma_horario'] }

    case 'retoma_confirmacion':
      return { intents: ['retoma_confirmacion'] }

    default: {
      // Static mapping from ACTION_TEMPLATE_MAP (handoff, no_interesa, silence)
      const mapped = ACTION_TEMPLATE_MAP[action]
      if (mapped) {
        return { intents: [...mapped] }
      }
      return { intents: [] }
    }
  }
}

// ============================================================================
// Price Service Resolution
// ============================================================================

/**
 * Resolve precio_servicio intent to service-specific template intent(s).
 * If service is unknown/null, returns empty (no fallback to invitar_agendar
 * to avoid redundant "want to schedule?" when a sales action is already active).
 */
function resolvePriceServiceTemplates(servicioDetectado?: string): string[] {
  if (!servicioDetectado || servicioDetectado === 'otro_servicio') {
    return []
  }

  const templateIntent = SERVICE_TEMPLATE_MAP[servicioDetectado]
  if (templateIntent) {
    return [templateIntent]
  }

  return []
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Load a single template by intent and return it as ResponseTrackOutput.
 * Used for special cases like English detection.
 */
async function loadSingleTemplate(
  templateIntent: string,
  state: AgentState,
  workspaceId: string,
): Promise<ResponseTrackOutput> {
  const templateManager = new TemplateManager(workspaceId)

  const intentsVistos: IntentRecord[] = state.intentsVistos.map((intentName, i) => ({
    intent: intentName,
    orden: i,
    timestamp: new Date().toISOString(),
  }))

  const selectionMap = await templateManager.getTemplatesForIntents(
    GODENTIST_AGENT_ID,
    [templateIntent],
    intentsVistos,
    state.templatesMostrados,
  )

  const messages: ProcessedMessage[] = []
  const templateIdsSent: string[] = []

  for (const [, selection] of selectionMap) {
    const processed = await templateManager.processTemplates(
      selection.templates,
      {},
      false,
    )

    for (const pt of processed) {
      messages.push({
        templateId: pt.id,
        content: pt.content,
        contentType: pt.contentType === 'imagen' ? 'imagen' : 'texto',
        delayMs: pt.delaySeconds * 1000,
        priority: pt.priority,
      })
      templateIdsSent.push(pt.id)
    }
  }

  return {
    messages,
    templateIdsSent,
    salesTemplateIntents: [],
    infoTemplateIntents: [templateIntent],
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
