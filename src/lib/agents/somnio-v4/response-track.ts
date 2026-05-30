/**
 * Somnio Sales Agent v4 — Response Track (Two-Track Decision)
 *
 * Template engine that determines WHAT TO SAY.
 * Combines two independent template sources:
 *   1. Sales action templates (from sales track accion)
 *   2. Informational intent templates (from INFORMATIONAL_INTENTS set)
 *
 * Sales templates are CORE priority, informational are COMPLEMENTARIA.
 * Empty output when no action AND non-informational intent = natural silence.
 *
 * Standalone: somnio-sales-v4
 * Cloned mecánicamente desde somnio-v3/response-track.ts (D-24).
 *
 * Diferencia clave (D-26):
 *   SOMNIO_V4_AGENT_ID filtra el catálogo propio de templates v4.
 *   El TemplateManager hace el WHERE agent_id='somnio-sales-v4', así que la
 *   sustitución de la constante es lo que aísla v4 del catálogo de v3 (Lección
 *   post-revert commit cdc06d9 — recompra-template-catalog 2026-04-23).
 *
 * Imports preservados (D-24 NO los prohíbe — utilities compartidas en somnio/):
 *   - @/lib/agents/somnio/template-manager
 *   - @/lib/agents/somnio/block-composer
 */

import { TemplateManager } from '@/lib/agents/somnio/template-manager'
import { composeBlock, type PrioritizedTemplate } from '@/lib/agents/somnio/block-composer'
import type { IntentRecord } from '@/lib/agents/types'
import { getCollector } from '@/lib/observability'
import {
  INFORMATIONAL_INTENTS,
  ACTION_TEMPLATE_MAP,
} from './constants'
import { SOMNIO_V4_AGENT_ID } from './config'
import { buildResumenContext, camposFaltantes } from './state'
import { lookupDeliveryZone, formatDeliveryTime } from './delivery-zones'
import type { AgentState, ProcessedMessage, ResponseTrackOutput, TipoAccion } from './types'

// ============================================================================
// Main Response Track Function
// ============================================================================

export async function resolveResponseTrack(input: {
  salesAction?: TipoAccion
  secondarySalesAction?: TipoAccion
  intent?: string
  secondaryIntent?: string
  /** T-8: per-intent coverage from the slot plan. 'low' → intent escalates to RAG — do NOT emit its template. Default-undefined = 'covered' (back-compat). */
  intentCoverage?: 'covered' | 'low'
  /** T-8: coverage for the secondary intent. 'low' → secondary escalates to RAG — do NOT emit its template (fixes the L90-96 bug). Default-undefined = 'covered' (back-compat). */
  secondaryCoverage?: 'covered' | 'low'
  state: AgentState
  workspaceId: string
}): Promise<ResponseTrackOutput> {
  const { salesAction, secondarySalesAction, intent, secondaryIntent, state, workspaceId } = input

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

  // Secondary sales action (e.g., ask_ofi_inter alongside main action)
  if (secondarySalesAction) {
    const secondaryResolved = await resolveSalesActionTemplates(secondarySalesAction, state)
    salesTemplateIntents.push(...secondaryResolved.intents)
    if (secondaryResolved.extraContext) {
      extraContext = { ...extraContext, ...secondaryResolved.extraContext }
    }
  }

  // ------------------------------------------------------------------
  // 2. Informational intent templates
  // ------------------------------------------------------------------
  const infoTemplateIntents: string[] = []
  let infoExtraContext: Record<string, string> | undefined

  // T-8: gate by coverage. intentCoverage==='low' means the intent escalates to RAG; skip its template.
  // Default-undefined is treated as 'covered' for back-compat with callers that don't pass coverage.
  if (intent && INFORMATIONAL_INTENTS.has(intent) && input.intentCoverage !== 'low') {
    if (intent === 'tiempo_entrega') {
      // Dynamic: resolve to zone-specific template
      const resolved = await resolveDeliveryTimeTemplates(state)
      infoTemplateIntents.push(resolved.templateIntent)
      infoExtraContext = resolved.extraContext
    } else {
      infoTemplateIntents.push(intent)
    }
  }
  // T-8: same gate for the secondary intent. Fixes the L90-96 bug: before this guard the secondary
  // template was stacked WITHOUT measuring coverage, causing both a template AND RAG to answer the
  // same intent (D-03 violation: a low intent must ONLY go to RAG, never also get a template).
  if (secondaryIntent && INFORMATIONAL_INTENTS.has(secondaryIntent) && input.secondaryCoverage !== 'low') {
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
    getCollector()?.recordEvent('template_selection', 'empty_result', {
      agent: 'somnio-sales-v4',
      salesAction: salesAction ?? 'none',
      intent: intent ?? 'none',
      reason: 'no_matching_intents',
    })
    // Natural silence: no sales action + non-informational intent
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
    SOMNIO_V4_AGENT_ID,
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
    // Saludo combined path: saludo CORE first, then all templates from other intent(s)
    const saludoTemplates = byIntent.get('saludo') ?? []
    const saludoCORE = saludoTemplates
      .filter(t => t.priority === 'CORE')
      .sort((a, b) => a.orden - b.orden)[0]

    const nonSaludoByIntent = new Map<string, PrioritizedTemplate[]>()
    for (const [k, v] of byIntent) {
      if (k !== 'saludo') nonSaludoByIntent.set(k, v)
    }

    // Pass non-saludo intents through block composer (uncapped for combined saludo)
    const composed = composeBlock(nonSaludoByIntent, [], 10)
    finalBlock = saludoCORE ? [saludoCORE, ...composed.block] : composed.block
  } else {
    // Normal path: block composer with standard max 3
    const composed = composeBlock(byIntent, [])
    finalBlock = composed.block
  }

  getCollector()?.recordEvent('template_selection', 'block_composed', {
    agent: 'somnio-sales-v4',
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
      delayMs: t.delaySeconds * 1000, // Convert seconds to ms (0 for CORE, 3000 for COMPLEMENTARIA)
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
// Field Labels (human-readable for retoma_datos_parciales)
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
  cedula_recoge: 'Cedula de quien recoge en oficina',
}

// ============================================================================
// Sales Action -> Template Resolution
// ============================================================================

async function resolveSalesActionTemplates(
  action: TipoAccion,
  state: AgentState,
): Promise<{ intents: string[]; extraContext?: Record<string, string> }> {
  // Phase 42.1: surface retake template selection on the timeline.
  if (typeof action === 'string' && action.startsWith('retoma')) {
    getCollector()?.recordEvent('retake', 'template_selected', {
      action,
      hasOfiInter: state.ofiInter ?? false,
    })
  }
  // Phase 42.1: surface ofi_inter template-level routing.
  if (action === 'ask_ofi_inter') {
    getCollector()?.recordEvent('ofi_inter', 'template_selected', {
      action,
      kind: 'ask',
    })
  } else if (action === 'confirmar_cambio_ofi_inter' || action === 'retoma_ofi_inter') {
    getCollector()?.recordEvent('ofi_inter', 'template_selected', {
      action,
      kind: action === 'retoma_ofi_inter' ? 'retoma' : 'confirmar_cambio',
    })
  }
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

    // D-18/SUP-6: confirmar_orden re-apunta al mismo template confirmacion_orden_* (antes ligado a crear_orden).
    // La conversacion de cara al cliente NO cambia: resumen -> (confirma) -> confirmacion_orden.
    case 'confirmar_orden': {
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
      // Fallback if no city (shouldn't happen for confirmar_orden, but defensive)
      return {
        intents: ['confirmacion_orden_transportadora'],
        extraContext: {
          ...buildResumenContext(state),
          tiempo_estimado: 'en 2-4 dias habiles',
        },
      }
    }

    // D-19: recordar_* re-apuntan a los mismos templates recordatorio (antes ligados a crear_orden_sin_*).
    case 'recordar_promo': {
      return {
        intents: ['pendiente_promo'],
      }
    }

    case 'recordar_confirmacion': {
      return {
        intents: ['pendiente_confirmacion'],
      }
    }

    case 'retoma_ofi_inter': {
      const faltantes = camposFaltantes(state)
      const labels = faltantes.map(f => FIELD_LABELS[f] ?? f)
      return {
        intents: ['confirmar_ofi_inter'],
        extraContext: {
          ciudad: state.datos.ciudad ?? '',
          campos_faltantes: labels.map(l => `- ${l}`).join('\n'),
        },
      }
    }

    case 'confirmar_cambio_ofi_inter': {
      const faltantes = camposFaltantes(state)
      const labels = faltantes.map(f => FIELD_LABELS[f] ?? f)
      return {
        intents: ['confirmar_cambio_ofi_inter'],
        extraContext: {
          campos_faltantes: labels.map(l => `- ${l}`).join('\n'),
        },
      }
    }

    case 'pedir_datos': {
      return {
        intents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
      }
    }

    case 'pedir_datos_quiero_comprar_implicito': {
      const faltantes = camposFaltantes(state)
      const labels = faltantes.map(f => FIELD_LABELS[f] ?? f)
      return {
        intents: ['pedir_datos_quiero_comprar_implicito'],
        extraContext: { campos_faltantes: labels.map(l => `- ${l}`).join('\n') },
      }
    }

    case 'retoma_datos_parciales': {
      const faltantes = camposFaltantes(state)
      const labels = faltantes.map(f => FIELD_LABELS[f] ?? f)
      return {
        intents: ['retoma_datos_parciales'],
        extraContext: { campos_faltantes: labels.map(l => `- ${l}`).join('\n') },
      }
    }

    default: {
      // Static mapping from ACTION_TEMPLATE_MAP
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
