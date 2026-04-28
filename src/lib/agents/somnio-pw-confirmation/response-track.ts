/**
 * Somnio PW-Confirmation Agent — Response Track (Two-Track Decision)
 *
 * Template engine that determines WHAT TO SAY for the post-purchase agent
 * (`somnio-sales-v3-pw-confirmation`). Selector that maps `(salesAction, intent, state)`
 * to a set of templates to emit, with `extraContext` (variables substituted at runtime).
 *
 * Pattern cloned VERBATIM from `somnio-recompra/response-track.ts` (which itself was
 * cloned from `somnio-v3/response-track.ts`) — same shape, different `agent_id` for
 * TemplateManager lookup, different post-purchase sales actions.
 *
 * Key differences vs recompra:
 *   - TEMPLATE_LOOKUP_AGENT_ID = 'somnio-sales-v3-pw-confirmation' (D-15 — own catalog).
 *   - Sales actions are POST-PURCHASE (confirmar_compra, pedir_datos_envio,
 *     actualizar_direccion, cancelar_*, mover_a_falta_confirmar, handoff, editar_items)
 *     — NOT prospect actions (mostrar_confirmacion / crear_orden / preguntar_direccion
 *     are recompra/v3-only).
 *   - `confirmar_compra` branch invokes `lookupDeliveryZone(state.datos.ciudad)` to
 *     dynamically pick `confirmacion_orden_same_day` vs `confirmacion_orden_transportadora`
 *     (D-10 + D-16 — REUSE delivery-zones, NO duplication).
 *   - `actualizar_direccion` branch emits `confirmar_direccion_post_compra` with
 *     `direccion_completa = [direccion, ciudad, departamento].filter(Boolean).join(', ')`
 *     (D-12 — departamento is included).
 *   - `editar_items` & `handoff` & `cancelar_definitivo` map to `cancelado_handoff`
 *     (V1 D-13 + D-21 silent handoff).
 *   - No `pack` selection / `intentsVistos` lifecycle (PW state machine has its own
 *     `intent_history` + `templatesMostrados` shape — see state.ts).
 *
 * REUSE per RESEARCH §A.2: `lookupDeliveryZone` and `formatDeliveryTime` are
 * agent-agnostic (already reused by recompra). PW does the same — does NOT duplicate
 * delivery-zones logic. Same for `composeBlock`, `processTemplates`, and the greeting
 * computation pattern.
 *
 * D-25 boundary note: this module is PURE (no DB writes, no LLM, no HTTP) except for
 * the indirect DB reads via TemplateManager (which itself uses the admin client to
 * fetch agent_templates) and via `lookupDeliveryZone` (which reads `delivery_zones`).
 * These are read-only template/zone lookups — no mutations.
 */

import { getCollector } from '@/lib/observability'
import { TemplateManager } from '@/lib/agents/somnio/template-manager'
import { composeBlock, type PrioritizedTemplate } from '@/lib/agents/somnio/block-composer'
import { lookupDeliveryZone, formatDeliveryTime } from '@/lib/agents/somnio-v3/delivery-zones'
import type { IntentRecord } from '@/lib/agents/types'
import {
  INFORMATIONAL_INTENTS,
  TEMPLATE_LOOKUP_AGENT_ID,
} from './constants'
import { shippingComplete, type AgentState, type ActiveOrderPayload } from './state'
import type { TipoAccion } from './types'

// ============================================================================
// Output Types (local — types.ts is intentionally minimal Wave 1 stub)
// ============================================================================

export interface ResponseMessage {
  templateId: string
  content: string
  contentType: 'texto' | 'imagen'
  delayMs: number
  priority: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'
}

export interface ResponseTrackOutput {
  messages: ResponseMessage[]
  templateIdsSent: string[]
  intent_emitted: string | null
  /** Reason for empty result (observability). Only set when messages.length === 0. */
  emptyReason?: string
}

// ============================================================================
// Field labels (human-readable) for `pedir_datos_post_compra` template
// ============================================================================

/**
 * Maps `shippingComplete().missing` field names to human-readable Spanish labels
 * for the bullet list interpolated into `{{campos_faltantes}}` of the
 * `pedir_datos_post_compra` template.
 *
 * Aligned with `SHIPPING_REQUIRED_FIELDS` (constants.ts) — covers all 6 fields.
 */
const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre',
  apellido: 'Apellido',
  telefono: 'Telefono',
  shippingAddress: 'Direccion completa',
  shippingCity: 'Ciudad',
  shippingDepartment: 'Departamento',
}

// ============================================================================
// Main Response Track Function
// ============================================================================

/**
 * Resolve the response track for a given (salesAction, intent, state) tuple.
 *
 * Order of evaluation:
 *   1. Resolve sales-action templates (if `salesAction` provided).
 *   2. Resolve informational-intent templates (if `intent` ∈ INFORMATIONAL_INTENTS).
 *   3. Combine, fetch templates from DB via TemplateManager, substitute variables,
 *      compose block, return final messages.
 *
 * Returns `{ messages: [], emptyReason: '...' }` for silent-handoff actions
 * (`handoff`, `cancelar_definitivo`, `editar_items` → silent per D-21 / D-13 V1).
 *
 * @param input.salesAction TipoAccion from sales-track (Plan 08).
 * @param input.intent      Primary intent from comprehension (Plan 05).
 * @param input.state       Current AgentState (Plan 06).
 * @param input.workspaceId Workspace UUID (Somnio = a3843b3f-... per D-19).
 */
export async function resolveResponseTrack(input: {
  salesAction?: TipoAccion
  intent?: string
  state: AgentState
  workspaceId: string
}): Promise<ResponseTrackOutput> {
  const { salesAction, intent, state, workspaceId } = input

  // --------------------------------------------------------------------------
  // 1. Sales action → template intents
  // --------------------------------------------------------------------------
  const salesTemplateIntents: string[] = []
  let extraContext: Record<string, string> | undefined
  let intentEmittedFromSales: string | null = null

  if (salesAction) {
    const resolved = await resolveSalesActionTemplates(salesAction, state)
    salesTemplateIntents.push(...resolved.intents)
    extraContext = resolved.extraContext
    intentEmittedFromSales = resolved.intents[0] ?? null
  }

  // --------------------------------------------------------------------------
  // 2. Informational intent → template intents
  // --------------------------------------------------------------------------
  const infoTemplateIntents: string[] = []
  let infoExtraContext: Record<string, string> | undefined

  if (intent && INFORMATIONAL_INTENTS.has(intent)) {
    if (intent === 'tiempo_entrega') {
      // D-16: zone-specific resolution via delivery-zones REUSE
      const resolved = await resolveDeliveryTimeTemplates(state)
      infoTemplateIntents.push(resolved.templateIntent)
      infoExtraContext = resolved.extraContext
    } else {
      // Direct mapping: intent name → template intent name
      infoTemplateIntents.push(intent)
    }
  }

  // --------------------------------------------------------------------------
  // 3. Combine and short-circuit on empty
  // --------------------------------------------------------------------------
  const allIntents = [...salesTemplateIntents, ...infoTemplateIntents]

  if (allIntents.length === 0) {
    // Silent handoff actions (handoff / cancelar_definitivo / editar_items)
    // map to empty intents arrays per ACTION_TEMPLATE_MAP — return empty result
    // with observability reason.
    const reason = salesAction
      ? `silent_action_${salesAction}`
      : (intent ? `non_informational_intent_${intent}` : 'no_action_no_intent')
    getCollector()?.recordEvent('template_selection', 'empty_result', {
      agent: 'pw-confirmation',
      salesAction: salesAction ?? 'none',
      intent: intent ?? 'none',
      reason,
    })
    return emptyResult(reason, intentEmittedFromSales)
  }

  // --------------------------------------------------------------------------
  // 4. Fetch templates from DB (TemplateManager + agent-scoped catalog)
  // --------------------------------------------------------------------------
  const templateManager = new TemplateManager(workspaceId)

  // intent_history → IntentRecord[] (TemplateManager's first-visit / repeated logic)
  const intentsVistos: IntentRecord[] = state.intent_history.map((intentName, i) => ({
    intent: intentName,
    orden: i,
    timestamp: new Date().toISOString(),
  }))

  // templatesMostrados is Record<intent, count> on PW (vs recompra string[]).
  // TemplateManager only needs already-sent template IDs to avoid duplicates.
  // Since PW tracks counts per-intent (not per-template-id), pass an empty array —
  // anti-loop is enforced upstream by sales-track (Plan 08) via intent_history.
  const templatesAlreadySent: string[] = []

  const selectionMap = await templateManager.getTemplatesForIntents(
    TEMPLATE_LOOKUP_AGENT_ID,
    allIntents,
    intentsVistos,
    templatesAlreadySent,
  )

  // --------------------------------------------------------------------------
  // 5. Variable substitution context
  // --------------------------------------------------------------------------
  // Flatten state.datos to string-or-undefined entries for the substitutor,
  // then layer extraContext (sales) + infoExtraContext (delivery zone) on top.
  const variableContext: Record<string, string | undefined> = {
    ...Object.fromEntries(
      Object.entries(state.datos).map(([k, v]) => [k, v ?? undefined])
    ),
    ...extraContext,
    ...infoExtraContext,
  }

  // --------------------------------------------------------------------------
  // 6. Process templates (variable substitution) → PrioritizedTemplate[]
  // --------------------------------------------------------------------------
  const allProcessed: PrioritizedTemplate[] = []

  for (const [intentName, selection] of selectionMap) {
    if (selection.templates.length === 0) continue

    const processed = await templateManager.processTemplates(
      selection.templates,
      variableContext,
      false, // PW does NOT use paraphrase (no anti-repetition feature flag for this agent)
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

  // --------------------------------------------------------------------------
  // 7. Block composition (group by intent → composeBlock)
  // --------------------------------------------------------------------------
  const byIntent = new Map<string, PrioritizedTemplate[]>()
  for (const t of allProcessed) {
    const existing = byIntent.get(t.intent) ?? []
    existing.push(t)
    byIntent.set(t.intent, existing)
  }

  const composed = composeBlock(byIntent, [])
  const finalBlock = composed.block

  getCollector()?.recordEvent('template_selection', 'block_composed', {
    agent: 'pw-confirmation',
    salesTemplateCount: salesTemplateIntents.length,
    infoTemplateCount: infoTemplateIntents.length,
    allIntents,
    finalBlockSize: finalBlock.length,
  })

  // --------------------------------------------------------------------------
  // 8. Build output
  // --------------------------------------------------------------------------
  const messages: ResponseMessage[] = []
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

  // intent_emitted: prefer sales action's first emitted intent (more semantic),
  // fallback to informational intent (or whatever was actually included).
  const intentEmitted =
    intentEmittedFromSales ??
    infoTemplateIntents[0] ??
    (allIntents[0] ?? null)

  if (messages.length === 0) {
    // Templates were requested but none came back from DB (e.g. catalog gap —
    // confirmar_direccion_post_compra is referenced but not in catalog yet).
    // This is graceful degradation — engine (Plan 11) decides whether to
    // escalate or silently continue.
    return emptyResult('templates_not_found_in_catalog', intentEmitted)
  }

  return {
    messages,
    templateIdsSent,
    intent_emitted: intentEmitted,
  }
}

// ============================================================================
// Sales Action → Template Resolution (export for Plan 12 tests)
// ============================================================================

/**
 * Map a `TipoAccion` to the template intents to emit + extraContext (variable values).
 *
 * Switch covers all 9 TipoAccion union values:
 *   - `confirmar_compra`             → `confirmacion_orden_same_day` | `_transportadora` (D-10, zone-based)
 *   - `pedir_datos_envio`            → `pedir_datos_post_compra` (D-12, with `campos_faltantes`)
 *   - `actualizar_direccion`         → `confirmar_direccion_post_compra` (D-12, `direccion_completa`)
 *   - `cancelar_con_agendar_pregunta` → `agendar_pregunta` (D-11 paso 1)
 *   - `cancelar_definitivo`          → `cancelado_handoff` (D-11 paso 2)
 *   - `editar_items`                 → `cancelado_handoff` (V1 D-13 — handoff)
 *   - `mover_a_falta_confirmar`      → `claro_que_si_esperamos` (D-14)
 *   - `handoff`                      → `cancelado_handoff` (D-21 stub)
 *   - `noop`                         → `[]` (engine handles informational fallthrough)
 *
 * Exported for Plan 12 unit tests (test fixture inputs, no I/O required).
 */
export async function resolveSalesActionTemplates(
  action: TipoAccion,
  state: AgentState,
): Promise<{ intents: string[]; extraContext?: Record<string, string> }> {
  switch (action) {
    case 'confirmar_compra': {
      // D-10 + D-16: zone-based template selection via delivery-zones REUSE
      const ciudad = state.datos.ciudad
      const items = formatItemsList(state.active_order)
      const total = state.active_order
        ? formatPrice(state.active_order.totalValue)
        : ''

      if (ciudad) {
        const zoneResult = await lookupDeliveryZone(ciudad)
        const tiempoEstimado = formatDeliveryTime(zoneResult)
        const templateIntent = zoneResult.zone === 'same_day'
          ? 'confirmacion_orden_same_day'
          : 'confirmacion_orden_transportadora'
        return {
          intents: [templateIntent],
          extraContext: {
            tiempo_estimado: tiempoEstimado,
            items,
            total,
          },
        }
      }
      // No ciudad → default to transportadora variant (safe fallback)
      return {
        intents: ['confirmacion_orden_transportadora'],
        extraContext: {
          tiempo_estimado: 'en 2-4 dias habiles',
          items,
          total,
        },
      }
    }

    case 'pedir_datos_envio': {
      // D-12: pedir_datos_post_compra with bullet-list of missing fields
      return {
        intents: ['pedir_datos_post_compra'],
        extraContext: {
          campos_faltantes: formatMissingFields(state),
        },
      }
    }

    case 'actualizar_direccion': {
      // D-12: confirmar_direccion_post_compra. direccion_completa MUST include
      // departamento (departamento was the missing field in recompra catalog gap
      // — leccion 2026-04-23, here we ship it correct from day 1).
      const direccion = state.datos.direccion ?? ''
      const ciudad = state.datos.ciudad ?? ''
      const departamento = state.datos.departamento ?? ''
      return {
        intents: ['confirmar_direccion_post_compra'],
        extraContext: {
          direccion_completa: [direccion, ciudad, departamento]
            .filter(Boolean)
            .join(', '),
        },
      }
    }

    case 'cancelar_con_agendar_pregunta': {
      // D-11 paso 1: 1er "no" → preguntar agendar fecha futura
      return { intents: ['agendar_pregunta'] }
    }

    case 'cancelar_definitivo': {
      // D-11 paso 2: 2do "no" → handoff template (silent or polite acknowledge)
      return { intents: ['cancelado_handoff'] }
    }

    case 'editar_items': {
      // D-13 V1: editar items → handoff (V1.1 implementaria edicion real)
      // Same template as handoff/cancelar_definitivo per V1 contract.
      return { intents: ['cancelado_handoff'] }
    }

    case 'mover_a_falta_confirmar': {
      // D-14: "espera lo pienso" → mover stage + acuse
      return { intents: ['claro_que_si_esperamos'] }
    }

    case 'handoff': {
      // D-21 stub: cancelado_handoff polite acknowledge before human takes over
      return { intents: ['cancelado_handoff'] }
    }

    case 'noop': {
      // Engine handles informational fallthrough (intent in INFORMATIONAL_INTENTS).
      // If no informational intent either → engine emits `fallback` template.
      return { intents: [] }
    }

    default: {
      // Defense-in-depth: TypeScript exhaustiveness should prevent reaching here.
      // If a new TipoAccion is added without updating this switch, fall through
      // to empty (engine treats as noop).
      const _exhaustive: never = action
      void _exhaustive
      return { intents: [] }
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve the zone-specific `tiempo_entrega_*` template for the customer's city.
 *
 * Uses delivery-zones (REUSE per D-16, RESEARCH §A.2) — NO duplication of zone
 * lookup logic. If `state.datos.ciudad` is missing, returns `tiempo_entrega_sin_ciudad`
 * (which prompts the customer for their city).
 *
 * @returns `{ templateIntent, extraContext: { ciudad, tiempo_estimado } }`
 */
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

/**
 * Format `shippingComplete(state).missing` as a bullet-list for the
 * `{{campos_faltantes}}` template variable.
 *
 * Each missing field maps to a human-readable Spanish label from FIELD_LABELS.
 * If no fields are missing (defensive), returns empty string (template fallback
 * should handle gracefully).
 *
 * Example output:
 *   "- Nombre\n- Telefono\n- Direccion completa"
 */
function formatMissingFields(state: AgentState): string {
  const { missing } = shippingComplete(state)
  if (missing.length === 0) return ''
  return missing
    .map((field) => `- ${FIELD_LABELS[field] ?? field}`)
    .join('\n')
}

/**
 * Format `activeOrder.items` as a bullet-list for the `{{items}}` template
 * variable in confirmacion_orden_* templates.
 *
 * Example output:
 *   "- 2 × ELIXIR DEL SUEÑO"
 *
 * If activeOrder is null → empty string (defensive — engine should have already
 * blocked confirmar_compra when there's no order, but we degrade gracefully).
 */
function formatItemsList(activeOrder: ActiveOrderPayload | null): string {
  if (!activeOrder || activeOrder.items.length === 0) return ''
  return activeOrder.items
    .map((item) => `- ${item.cantidad} × ${item.titulo}`.trim())
    .join('\n')
}

/**
 * Format an integer COP value as a Colombian-locale price string ("$77,900").
 *
 * Uses comma as thousands separator (matches sales-v3 convention — see
 * recompra constants.ts PACK_PRICES). Strips decimals (orders are whole COP).
 */
function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value === 0) return ''
  const rounded = Math.round(value)
  // Manual thousands separator (avoid Intl.NumberFormat locale quirks).
  return '$' + rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function emptyResult(reason: string, intentEmitted: string | null = null): ResponseTrackOutput {
  return {
    messages: [],
    templateIdsSent: [],
    intent_emitted: intentEmitted,
    emptyReason: reason,
  }
}
