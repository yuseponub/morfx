// Adapted from src/lib/agents/godentist-fb-ig/response-track.ts (Standalone: agent-varixcenter, Wave 3 Plan 06 Task 1).
// CRITICAL anti-Pitfall 1 (regresion cdc06d9): TEMPLATE_LOOKUP_AGENT_ID MUST be
// VARIXCENTER_AGENT_ID, never the constant of another agent. Otherwise el agente
// lee templates del catalogo equivocado y su catalogo propio nunca renderiza.
//
// Cambios vs el analog godentist-fb-ig (diseño §9/§10):
//   - QUITADO el display-map y el campo sucursal (1 sola sede — varix-clinic).
//   - QUITADO SERVICE_TEMPLATE_MAP (no hay servicios dentales).
//   - FIELD_LABELS sin sede: nombre/cedula/telefono.
//   - Triage por tipo_venas (§9): precio_tratamiento/info_tratamiento con tipo_venas ->
//     info_vasitos/info_grandes/info_ambas (+ _comp como COMP); sin tipo_venas -> triage.
//   - es_foraneo (D-15): ciudad fuera del area metro -> fuera_de_ciudad como COMP (NO bloquea).
//   - Casos especiales (§10): sintomas_descripcion -> no_diagnostico; notas de voz -> pedir_texto.
//   - mostrar_disponibilidad: slots de getVarixAvailability (domain), sin sede.

/**
 * Varixcenter Appointment Agent — Response Track
 *
 * Template engine that determines WHAT TO SAY.
 * Combines two independent template sources:
 *   1. Sales action templates (from sales track accion)
 *   2. Informational intent templates (from INFORMATIONAL_INTENTS set)
 *
 * Triage por tipo_venas: precio/info de tratamiento se mapea al template específico
 * (info_vasitos/info_grandes/info_ambas) cuando ya se conoce el tipo de venas; si no,
 * se manda el template `triage` (pregunta grandes/vasitos + ciudad).
 *
 * English detection returns english_response template immediately.
 *
 * Uses TemplateManager and composeBlock from somnio shared code.
 */

import { getCollector } from '@/lib/observability'
import { TemplateManager } from '@/lib/agents/somnio/template-manager'
import { composeBlock, type PrioritizedTemplate } from '@/lib/agents/somnio/block-composer'
import type { IntentRecord } from '@/lib/agents/types'
import {
  INFORMATIONAL_INTENTS,
  ACTION_TEMPLATE_MAP,
} from './constants'
import { VARIXCENTER_AGENT_ID } from './config'
import { buildResumenContext, camposFaltantes, esForaneo } from './state'
import type { AgentState, ProcessedMessage, ResponseTrackOutput, TipoAccion } from './types'

// ============================================================================
// Field Labels (sin sede — Varixcenter)
// ============================================================================

const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre completo',
  cedula: 'Número de cédula',
  telefono: 'Número de teléfono',
  fecha_preferida: 'Fecha preferida',
}

// ============================================================================
// Triage por tipo_venas (diseño §9)
// ============================================================================

/**
 * Mapea el enum tipo_venas a su template informacional específico.
 * Devuelve el CORE + su _comp (COMP). Si tipo_venas es null/desconocido -> [].
 */
const TIPO_VENAS_TEMPLATE_MAP: Record<string, { core: string; comp: string }> = {
  vasitos: { core: 'info_vasitos', comp: 'info_vasitos_comp' },
  grandes: { core: 'info_grandes', comp: 'info_grandes_comp' },
  ambas: { core: 'info_ambas', comp: 'info_ambas_comp' },
}

/** Intents informacionales de tratamiento que disparan el triage por tipo_venas. */
const TRIAGE_INTENTS: ReadonlySet<string> = new Set([
  'precio_tratamiento',
  'info_tratamiento',
])

/**
 * Resuelve un intent de tratamiento/precio a los templates según tipo_venas (§9).
 * - tipo_venas conocido -> [info_<tipo>, info_<tipo>_comp]
 * - tipo_venas null -> ['triage'] (response track pregunta grandes/vasitos + ciudad)
 */
function resolveTriageTemplates(tipoVenas: string | null): string[] {
  if (!tipoVenas) return ['triage']
  const mapped = TIPO_VENAS_TEMPLATE_MAP[tipoVenas]
  if (!mapped) return ['triage']
  return [mapped.core, mapped.comp]
}

// ============================================================================
// Casos especiales (diseño §10)
// ============================================================================

/** Intents informacionales con template propio directo (mismo nombre que el intent). */
const SPECIAL_CASE_DIRECT: ReadonlySet<string> = new Set([
  'sintomas_descripcion', // -> no_diagnostico (mapeado abajo)
  'info_laser',
  'info_examen_doppler',
  'info_medias',
  'ubicacion',
  'horarios',
  'financiacion',
  'seguros_eps',
  'precio_valoracion',
])

/** Mapea un intent informacional a su template (cuando difieren del nombre del intent). */
const INTENT_TEMPLATE_OVERRIDE: Record<string, string> = {
  sintomas_descripcion: 'no_diagnostico', // §10 — fotos/síntomas -> no diagnóstico, invitar valoración
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
  /** Real availability slots from getVarixAvailability (domain) */
  availabilitySlots?: { manana: string[]; tarde: string[] }
  /** True when domain returned 0 slots or lookup failed — show sin_disponibilidad */
  availabilityFallback?: boolean
}): Promise<ResponseTrackOutput> {
  const {
    salesAction,
    intent,
    secondaryIntent,
    state,
    workspaceId,
    idioma,
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
    const resolved = resolveSalesActionTemplates(salesAction, state, input.availabilitySlots, input.availabilityFallback)
    salesTemplateIntents.push(...resolved.intents)
    extraContext = resolved.extraContext
  }

  // ------------------------------------------------------------------
  // 1b. Force saludo on first turn (turnCount <= 1) even if client didn't greet
  // ------------------------------------------------------------------
  const isFirstTurn = state.turnCount <= 1 && !state.intentsVistos.includes('saludo')

  // ------------------------------------------------------------------
  // 2. Informational intent templates
  // ------------------------------------------------------------------
  const infoTemplateIntents: string[] = []

  // Inject saludo on first turn
  if (isFirstTurn && intent !== 'saludo') {
    infoTemplateIntents.push('saludo')
  }

  pushInfoIntent(intent, state, infoTemplateIntents)
  if (secondaryIntent && secondaryIntent !== intent) {
    pushInfoIntent(secondaryIntent, state, infoTemplateIntents)
  }

  // ------------------------------------------------------------------
  // 2b. es_foraneo (D-15) — fuera_de_ciudad como COMP (NO bloquea)
  // ------------------------------------------------------------------
  if (esForaneo(state) && !infoTemplateIntents.includes('fuera_de_ciudad') && !salesTemplateIntents.includes('fuera_de_ciudad')) {
    infoTemplateIntents.push('fuera_de_ciudad')
  }

  // ------------------------------------------------------------------
  // 3. Combine both sources
  // ------------------------------------------------------------------
  const allIntents = [...salesTemplateIntents, ...infoTemplateIntents]
  const hasSaludoCombined = infoTemplateIntents.includes('saludo') && (allIntents.length > 1 || salesTemplateIntents.length > 0)

  if (allIntents.length === 0) {
    getCollector()?.recordEvent('template_selection', 'empty_result', {
      agent: 'varixcenter',
      salesAction: salesAction ?? 'none',
      intent: intent ?? 'none',
      reason: 'no_matching_intents',
    })
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
    VARIXCENTER_AGENT_ID,
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

  getCollector()?.recordEvent('template_selection', 'block_composed', {
    agent: 'varixcenter',
    salesTemplateCount: salesTemplateIntents.length,
    infoTemplateCount: infoTemplateIntents.length,
    allIntents,
    finalBlockSize: finalBlock.length,
    hasSaludoCombined,
  })

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
// Informational Intent -> Template push (triage por tipo_venas + casos especiales)
// ============================================================================

/**
 * Agrega los templates correspondientes a un intent informacional al array.
 * - Intents de tratamiento (precio_tratamiento/info_tratamiento) -> triage por tipo_venas.
 * - sintomas_descripcion -> no_diagnostico (override).
 * - resto de INFORMATIONAL_INTENTS -> template homónimo.
 */
function pushInfoIntent(intent: string | undefined, state: AgentState, target: string[]): void {
  if (!intent) return
  if (!INFORMATIONAL_INTENTS.has(intent)) return

  // Triage por tipo_venas (§9)
  if (TRIAGE_INTENTS.has(intent)) {
    for (const t of resolveTriageTemplates(state.datos.tipo_venas)) {
      if (!target.includes(t)) target.push(t)
    }
    return
  }

  // Casos especiales con override de template (sintomas_descripcion -> no_diagnostico)
  const override = INTENT_TEMPLATE_OVERRIDE[intent]
  if (override) {
    if (!target.includes(override)) target.push(override)
    return
  }

  // Resto (info_laser, ubicacion, horarios, financiacion, etc.): template homónimo.
  void SPECIAL_CASE_DIRECT // documenta el set de intents directos (consumido implícitamente)
  if (!target.includes(intent)) target.push(intent)
}

// ============================================================================
// Sales Action -> Template Resolution
// ============================================================================

function resolveSalesActionTemplates(
  action: TipoAccion,
  state: AgentState,
  availabilitySlots?: { manana: string[]; tarde: string[] },
  availabilityFallback?: boolean,
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
      // 0-slot / lookup-failed fallback (D-15-ish): emitir sin_disponibilidad.
      if (availabilityFallback || (!availabilitySlots?.manana?.length && !availabilitySlots?.tarde?.length)) {
        return {
          intents: ['sin_disponibilidad'],
          extraContext: { fecha: state.datos.fecha_preferida ?? '' },
        }
      }

      const slotsManana = availabilitySlots?.manana?.length ? availabilitySlots.manana.join('\n') : 'No hay disponibilidad'
      const slotsTarde = availabilitySlots?.tarde?.length ? availabilitySlots.tarde.join('\n') : 'No hay disponibilidad'

      return {
        intents: ['mostrar_disponibilidad'],
        extraContext: {
          fecha: state.datos.fecha_preferida ?? '',
          slots_manana: slotsManana,
          slots_tarde: slotsTarde,
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
    VARIXCENTER_AGENT_ID,
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
