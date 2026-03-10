/**
 * Somnio Sales Agent v3 — Response Track (Two-Track Decision)
 *
 * Template engine that determines WHAT TO SAY.
 * Combines two independent template sources:
 *   1. Sales action templates (from sales track accion)
 *   2. Informational intent templates (from INFORMATIONAL_INTENTS set)
 *
 * Sales templates are CORE priority, informational are COMPLEMENTARIA.
 * Empty output when no action AND non-informational intent = natural silence.
 */

import { TemplateManager } from '@/lib/agents/somnio/template-manager'
import { composeBlock, type PrioritizedTemplate } from '@/lib/agents/somnio/block-composer'
import type { IntentRecord } from '@/lib/agents/types'
import {
  V3_TO_V1_INTENT_MAP,
  INFORMATIONAL_INTENTS,
  ACTION_TEMPLATE_MAP,
} from './constants'
import { SOMNIO_V3_AGENT_ID } from './config'
import { buildResumenContext, camposFaltantes } from './state'
import type { AgentState, ProcessedMessage, ResponseTrackOutput, TipoAccion } from './types'

// ============================================================================
// Main Response Track Function
// ============================================================================

export async function resolveResponseTrack(input: {
  salesAction?: TipoAccion
  intent: string
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
    const resolved = resolveSalesActionTemplates(salesAction, state)
    salesTemplateIntents.push(...resolved.intents)
    extraContext = resolved.extraContext
  }

  // ------------------------------------------------------------------
  // 2. Informational intent templates
  // ------------------------------------------------------------------
  const infoTemplateIntents: string[] = []

  if (INFORMATIONAL_INTENTS.has(intent)) {
    infoTemplateIntents.push(intent)
  }
  if (secondaryIntent && INFORMATIONAL_INTENTS.has(secondaryIntent)) {
    // Avoid duplicate if secondary is the same as primary
    if (!infoTemplateIntents.includes(secondaryIntent)) {
      infoTemplateIntents.push(secondaryIntent)
    }
  }

  // ------------------------------------------------------------------
  // 3. Combine both sources
  // ------------------------------------------------------------------
  const allIntents = [...salesTemplateIntents, ...infoTemplateIntents]

  if (allIntents.length === 0) {
    // Natural silence: no sales action + non-informational intent
    return emptyResult()
  }

  // ------------------------------------------------------------------
  // 4. Load and process templates
  // ------------------------------------------------------------------
  // Map v3 intents to v1 DB names
  const v1Intents: string[] = []
  for (const v3Intent of allIntents) {
    const mapped = V3_TO_V1_INTENT_MAP[v3Intent]
    if (mapped) {
      v1Intents.push(...mapped)
    } else {
      v1Intents.push(v3Intent)
    }
  }

  const templateManager = new TemplateManager(workspaceId)

  const intentsVistos: IntentRecord[] = state.intentsVistos.map((intentName, i) => ({
    intent: intentName,
    orden: i,
    timestamp: new Date().toISOString(),
  }))

  // Try v3 templates first
  let selectionMap = await templateManager.getTemplatesForIntents(
    SOMNIO_V3_AGENT_ID,
    v1Intents,
    intentsVistos,
    state.templatesMostrados,
  )

  // Fallback to v1 templates if v3 has none
  const hasAnyTemplates = Array.from(selectionMap.values()).some(s => s.templates.length > 0)
  if (!hasAnyTemplates) {
    selectionMap = await templateManager.getTemplatesForIntents(
      'somnio-sales-v1',
      v1Intents,
      intentsVistos,
      state.templatesMostrados,
    )
  }

  // Process templates with variable substitution
  const variableContext: Record<string, string | undefined> = {
    ...Object.fromEntries(
      Object.entries(state.datos).map(([k, v]) => [k, v ?? undefined])
    ),
    ...extraContext,
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
      })
    }
  }

  // Compose block (max 3 templates)
  const byIntent = new Map<string, PrioritizedTemplate[]>()
  for (const t of allProcessed) {
    const existing = byIntent.get(t.intent) ?? []
    existing.push(t)
    byIntent.set(t.intent, existing)
  }

  const composed = composeBlock(byIntent, [])

  // ------------------------------------------------------------------
  // 5. Build response
  // ------------------------------------------------------------------
  const messages: ProcessedMessage[] = []
  const templateIdsSent: string[] = []

  for (const t of composed.block) {
    messages.push({
      templateId: t.templateId,
      content: t.content,
      contentType: t.contentType === 'imagen' ? 'imagen' : 'texto',
      delayMs: 0, // Computed by messaging adapter (char-delay)
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
  cedula_recoge: 'Cedula',
}

// ============================================================================
// Sales Action -> Template Resolution
// ============================================================================

function resolveSalesActionTemplates(
  action: TipoAccion,
  state: AgentState,
): { intents: string[]; extraContext?: Record<string, string> } {
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
      return {
        intents: ['confirmacion_orden'],
        extraContext: buildResumenContext(state),
      }
    }

    case 'pedir_datos': {
      return {
        intents: ['pedir_datos'],
        extraContext: { campos_faltantes: camposFaltantes(state).join(', ') },
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

function emptyResult(): ResponseTrackOutput {
  return {
    messages: [],
    templateIdsSent: [],
    salesTemplateIntents: [],
    infoTemplateIntents: [],
  }
}
