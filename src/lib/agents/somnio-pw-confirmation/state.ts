/**
 * Somnio PW-Confirmation Agent — State Management
 *
 * State machine PURE (D-25):
 *   - createInitialState({activeOrder, contact, crmContextStatus}) — phase='awaiting_confirmation'
 *     cuando hay pedido pre-loaded del reader (D-26).
 *   - mergeAnalysis(state, analysis) — actualiza datos del cliente desde MessageAnalysis.datos_extraidos.
 *   - shippingComplete(state) — algoritmo VERBATIM RESEARCH §D.3.
 *   - extractActiveOrder(crmContext, activeOrderJson) — parsea Open Q3 JSON estructurado del reader.
 *   - serializeState/deserializeState — symmetric, prefijo `_v3:` para sesion_state.datos_capturados.
 *
 * IMPORTS: solo del propio modulo del agente (./constants, ./types, ./comprehension-schema).
 * Sin acoplamiento a otros modulos (clonado del patron recompra).
 *
 * Diferencias vs recompra/state.ts:
 *   - No hay pack selection / negaciones / direccionConfirmada (recompra-specific).
 *   - active_order es first-class (PW lee pedido existente, no crea).
 *   - cancelacion_intent_count tracker para D-11 flujo 1er/2do "no".
 *   - requires_human stub flag para D-21.
 *   - crm_context_status del reader para degradacion (D-05).
 */

import {
  SHIPPING_REQUIRED_FIELDS,
  type ShippingFieldName,
} from './constants'
import type { TipoAccion } from './types'
import type { MessageAnalysis } from './comprehension-schema'

// ============================================================================
// Types
// ============================================================================

export interface DatosCliente {
  nombre: string | null
  apellido: string | null
  telefono: string | null
  direccion: string | null // shippingAddress
  ciudad: string | null // shippingCity
  departamento: string | null // shippingDepartment
}

/**
 * Estructura del pedido activo extraido del reader (Open Q3 — JSON estructurado).
 * El Inngest function `pw-confirmation-preload-and-invoke` (Plan 09) extrae los
 * tool outputs del reader y persiste un objeto JSON en `_v3:active_order`.
 */
export interface ActiveOrderPayload {
  orderId: string
  stageId: string
  stageName: string
  pipelineId: string
  totalValue: number
  items: Array<{ titulo: string; cantidad: number; unitPrice: number }>
  shippingAddress: string | null
  shippingCity: string | null
  shippingDepartment: string | null
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  tags: string[]
}

/**
 * Subset de contact data preloaded del reader (fallback de shipping si el order
 * no trae shipping_*).
 */
export interface ContactPayload {
  name: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  department: string | null
}

export type CrmContextStatus = 'ok' | 'empty' | 'error' | 'missing'

export interface AgentState {
  /** Phase canonica del state machine (ver `./config.ts:states[]`). */
  phase: string
  /** Datos de envio (preloaded + merged from comprehension). */
  datos: DatosCliente
  /** Pedido activo del reader (D-04). NULL si reader fallo o sin pedido. */
  active_order: ActiveOrderPayload | null
  /** Last 6 intents (FIFO). */
  intent_history: string[]
  /** Acciones tomadas en orden cronologico (para derivePhase + observability). */
  acciones: TipoAccion[]
  /** Templates emitidos por intent → count (anti-loop). */
  templatesMostrados: Record<string, number>
  /** Counter de cancelaciones consecutivas (D-11): 0=ninguna, 1=1er "no", 2=post agendar_pregunta "no". */
  cancelacion_intent_count: number
  /** Flag handoff stub (D-21) — NO materializa CRM, solo telemetria. */
  requires_human: boolean
  /** Status del CRM reader preload (D-05). */
  crm_context_status: CrmContextStatus
}

// ============================================================================
// State Changes (output of mergeAnalysis)
// ============================================================================

export interface StateChanges {
  /** Nombres de campos que pasaron de null/empty a value. */
  newFields: string[]
  /** Cantidad de campos shipping completos post-merge. */
  filled: number
  hasNewData: boolean
  /** True si shippingComplete paso de false a true en este merge. */
  shippingJustCompleted: boolean
}

// ============================================================================
// Factory: createInitialState (D-26)
// ============================================================================

export interface CreateInitialStateInput {
  activeOrder: ActiveOrderPayload | null
  contact: ContactPayload | null
  crmContextStatus: CrmContextStatus
}

/**
 * Crea el estado inicial del agente.
 *
 * D-26: si hay activeOrder + crmContextStatus='ok' → phase='awaiting_confirmation'
 * (asumimos que los 3 templates pre-activacion ya se enviaron — pedido_recibido_v2,
 * direccion_entrega, confirmar_compra). El primer "si" del cliente es confirmacion.
 *
 * Si activeOrder es null o crm_context_status != 'ok' → phase='nuevo' (degradacion).
 *
 * `datos` se preloadea desde:
 *   - contact.name → split en nombre + apellido (si tiene espacio).
 *   - contact.phone → telefono.
 *   - activeOrder.shippingAddress / shippingCity / shippingDepartment (preferred).
 *   - Fallback contact.address / contact.city / contact.department si order no trae.
 */
export function createInitialState(input: CreateInitialStateInput): AgentState {
  const { activeOrder, contact, crmContextStatus } = input

  // D-26: phase inicial depende de si hay pedido + reader OK
  const phase = activeOrder !== null && crmContextStatus === 'ok'
    ? 'awaiting_confirmation'
    : 'nuevo'

  // Split nombre + apellido del contact.name (si tiene espacio)
  let nombre: string | null = null
  let apellido: string | null = null
  if (contact?.name) {
    const parts = contact.name.trim().split(/\s+/)
    nombre = parts[0] ?? null
    apellido = parts.length >= 2 ? parts.slice(1).join(' ') : null
  }
  // Fallback: customerName del activeOrder
  if (!nombre && activeOrder?.customerName) {
    const parts = activeOrder.customerName.trim().split(/\s+/)
    nombre = parts[0] ?? null
    apellido = apellido ?? (parts.length >= 2 ? parts.slice(1).join(' ') : null)
  }

  const telefono = contact?.phone ?? activeOrder?.customerPhone ?? null

  // Shipping preferred: order.shipping_*; fallback contact.*
  const direccion = activeOrder?.shippingAddress ?? contact?.address ?? null
  const ciudad = activeOrder?.shippingCity ?? contact?.city ?? null
  const departamento = activeOrder?.shippingDepartment ?? contact?.department ?? null

  return {
    phase,
    datos: {
      nombre,
      apellido,
      telefono,
      direccion,
      ciudad,
      departamento,
    },
    active_order: activeOrder,
    intent_history: [],
    acciones: [],
    templatesMostrados: {},
    cancelacion_intent_count: 0,
    requires_human: false,
    crm_context_status: crmContextStatus,
  }
}

// ============================================================================
// mergeAnalysis (Capa 3)
// ============================================================================

/**
 * Merge deterministic de la salida de comprehension en el state.
 * Nunca sobreescribe non-null con null.
 * Retorna nuevo state object (immutable) + StateChanges.
 *
 * - Para cada campo non-null en analysis.datos_extraidos → merge en state.datos.
 * - Push intent al intent_history (cap 6, FIFO).
 * - Recalcula StateChanges (newFields, filled, hasNewData, shippingJustCompleted).
 */
export function mergeAnalysis(
  state: AgentState,
  analysis: MessageAnalysis,
): { state: AgentState; changes: StateChanges } {
  const updated: AgentState = {
    ...state,
    datos: { ...state.datos },
    intent_history: [...state.intent_history],
    acciones: [...state.acciones],
    templatesMostrados: { ...state.templatesMostrados },
  }

  // Snapshot pre-merge para detectar `shippingJustCompleted`
  const completeBefore = shippingComplete(state).complete

  // 1. Merge extracted fields (nunca null → value)
  const extracted = analysis.datos_extraidos ?? null
  const newFields: string[] = []
  if (extracted) {
    const dataKeys: (keyof DatosCliente)[] = [
      'nombre',
      'apellido',
      'telefono',
      'direccion',
      'ciudad',
      'departamento',
    ]
    for (const key of dataKeys) {
      const value = extracted[key]
      if (value !== null && value !== undefined && value.trim() !== '') {
        const prev = updated.datos[key]
        if (prev === null || !prev.trim()) {
          newFields.push(key)
        }
        updated.datos[key] = value.trim()
      }
    }
  }

  // 2. Push intent al history (cap 6, FIFO)
  updated.intent_history.push(analysis.intent)
  if (updated.intent_history.length > 6) {
    updated.intent_history = updated.intent_history.slice(-6)
  }

  // 3. Compute changes
  const completeAfter = shippingComplete(updated).complete
  const filled = SHIPPING_REQUIRED_FIELDS.filter((f) => fieldFilled(updated, f)).length

  return {
    state: updated,
    changes: {
      newFields,
      filled,
      hasNewData: newFields.length > 0,
      shippingJustCompleted: !completeBefore && completeAfter,
    },
  }
}

// ============================================================================
// shippingComplete — RESEARCH §D.3 algoritmo VERBATIM
// ============================================================================

/**
 * Verifica si el state tiene los 6 SHIPPING_REQUIRED_FIELDS completos.
 *
 * Reglas (RESEARCH §D.3):
 *   - nombreOk: state.datos.nombre + state.datos.apellido ambos non-null,
 *     OR state.datos.nombre ya contiene 2+ palabras (split implicito).
 *   - phoneOk: state.datos.telefono matches /^57\d{10}$/.
 *   - addressOk: state.datos.direccion non-empty.
 *   - cityOk: state.datos.ciudad non-empty.
 *   - deptOk: state.datos.departamento non-empty.
 *
 * Retorna `missing` con los nombres de los campos faltantes (subset de
 * SHIPPING_REQUIRED_FIELDS). Si nombre tiene 2+ palabras, apellido NO se
 * considera faltante.
 */
export function shippingComplete(state: AgentState): {
  complete: boolean
  missing: ShippingFieldName[]
} {
  const missing: ShippingFieldName[] = []
  const datos = state.datos

  // nombreOk: ambos campos non-null, O nombre con 2+ palabras
  const nombreParts = datos.nombre?.trim().split(/\s+/) ?? []
  const nombreHasFullSplit = nombreParts.length >= 2
  const nombreOk = (
    !!datos.nombre?.trim() &&
    (nombreHasFullSplit || !!datos.apellido?.trim())
  )
  if (!datos.nombre?.trim()) missing.push('nombre')
  // apellido solo cuenta como missing si nombre NO tiene 2+ palabras
  if (!nombreHasFullSplit && !datos.apellido?.trim()) missing.push('apellido')

  // phoneOk: matches /^57\d{10}$/
  const phoneOk = !!datos.telefono && /^57\d{10}$/.test(datos.telefono)
  if (!phoneOk) missing.push('telefono')

  // address / city / dept: non-empty
  if (!datos.direccion?.trim()) missing.push('shippingAddress')
  if (!datos.ciudad?.trim()) missing.push('shippingCity')
  if (!datos.departamento?.trim()) missing.push('shippingDepartment')

  return {
    complete: nombreOk && phoneOk && missing.length === 0,
    missing,
  }
}

/**
 * Helper interno: ¿el campo `key` esta filled en el state? Mismo criterio
 * que shippingComplete para cada SHIPPING_REQUIRED_FIELD.
 */
function fieldFilled(state: AgentState, field: ShippingFieldName): boolean {
  const datos = state.datos
  switch (field) {
    case 'nombre':
      return !!datos.nombre?.trim()
    case 'apellido': {
      const parts = datos.nombre?.trim().split(/\s+/) ?? []
      return parts.length >= 2 || !!datos.apellido?.trim()
    }
    case 'telefono':
      return !!datos.telefono && /^57\d{10}$/.test(datos.telefono)
    case 'shippingAddress':
      return !!datos.direccion?.trim()
    case 'shippingCity':
      return !!datos.ciudad?.trim()
    case 'shippingDepartment':
      return !!datos.departamento?.trim()
    default:
      return false
  }
}

// ============================================================================
// extractActiveOrder — Open Q3 resuelto (text + JSON estructurado del reader)
// ============================================================================

/**
 * Parsea el `_v3:active_order` JSON estructurado del reader (Open Q3).
 *
 * Patron Inngest function (Plan 09): extrae tool outputs del reader y
 * persiste objeto estructurado en `session_state.datos_capturados['_v3:active_order']`
 * via JSON.stringify. Aqui hacemos JSON.parse + validacion shape.
 *
 * Si activeOrderJsonString es null/undefined/empty → return null (no order).
 * Si JSON.parse falla → log error + return null (NO throw — degradacion graceful).
 * Si shape no coincide → return null.
 *
 * El parametro `crmContextText` se acepta por futurabilidad (best-effort regex
 * fallback parsing del texto del reader si el JSON no estuviera disponible),
 * pero por ahora si JSON falla simplemente retornamos null.
 */
export function extractActiveOrder(
  _crmContextText: string | null | undefined,
  activeOrderJsonString: string | null | undefined,
): ActiveOrderPayload | null {
  if (!activeOrderJsonString || activeOrderJsonString.trim() === '') {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(activeOrderJsonString)
  } catch (err) {
    console.warn(
      '[somnio-pw-confirmation/state] extractActiveOrder JSON.parse failed:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }

  // Validate shape (defensive — if reader changes, agent doesn't crash)
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>

  // Required fields: orderId, stageId, pipelineId
  if (typeof obj.orderId !== 'string' || obj.orderId.trim() === '') return null
  if (typeof obj.stageId !== 'string' || obj.stageId.trim() === '') return null
  if (typeof obj.pipelineId !== 'string' || obj.pipelineId.trim() === '') return null

  return {
    orderId: obj.orderId,
    stageId: obj.stageId,
    stageName: typeof obj.stageName === 'string' ? obj.stageName : '',
    pipelineId: obj.pipelineId,
    totalValue: typeof obj.totalValue === 'number' ? obj.totalValue : 0,
    items: Array.isArray(obj.items)
      ? (obj.items as unknown[])
          .filter((it) => it !== null && typeof it === 'object')
          .map((it) => {
            const item = it as Record<string, unknown>
            return {
              titulo: typeof item.titulo === 'string' ? item.titulo : '',
              cantidad: typeof item.cantidad === 'number' ? item.cantidad : 0,
              unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : 0,
            }
          })
      : [],
    shippingAddress: typeof obj.shippingAddress === 'string' ? obj.shippingAddress : null,
    shippingCity: typeof obj.shippingCity === 'string' ? obj.shippingCity : null,
    shippingDepartment: typeof obj.shippingDepartment === 'string' ? obj.shippingDepartment : null,
    customerName: typeof obj.customerName === 'string' ? obj.customerName : null,
    customerPhone: typeof obj.customerPhone === 'string' ? obj.customerPhone : null,
    customerEmail: typeof obj.customerEmail === 'string' ? obj.customerEmail : null,
    tags: Array.isArray(obj.tags) ? (obj.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
  }
}

// ============================================================================
// Serialization (state <-> session_state.datos_capturados flat format)
// ============================================================================

const PREFIX = '_v3:'

/**
 * Serializa AgentState a Record<string,string> para `SessionManager.updateCapturedData`.
 * Usa prefijo `_v3:` para metadata + campos individuales para datos shipping.
 *
 * Symmetric con deserializeState.
 */
export function serializeState(state: AgentState): Record<string, string> {
  const out: Record<string, string> = {}

  // Phase
  out[`${PREFIX}phase`] = state.phase

  // Datos shipping individuales (cliente lee `nombre` directo en otros agentes,
  // mantenemos compatibilidad — sin prefijo para los datos del cliente).
  if (state.datos.nombre !== null) out['nombre'] = state.datos.nombre
  if (state.datos.apellido !== null) out['apellido'] = state.datos.apellido
  if (state.datos.telefono !== null) out['telefono'] = state.datos.telefono
  if (state.datos.direccion !== null) out['direccion'] = state.datos.direccion
  if (state.datos.ciudad !== null) out['ciudad'] = state.datos.ciudad
  if (state.datos.departamento !== null) out['departamento'] = state.datos.departamento

  // Active order JSON
  if (state.active_order !== null) {
    out[`${PREFIX}active_order`] = JSON.stringify(state.active_order)
  }

  // Intent history (JSON array)
  out[`${PREFIX}intent_history`] = JSON.stringify(state.intent_history)

  // Acciones (JSON array de strings)
  out[`${PREFIX}acciones`] = JSON.stringify(state.acciones)

  // Templates mostrados (JSON object)
  out[`${PREFIX}templates_mostrados`] = JSON.stringify(state.templatesMostrados)

  // Counters / flags
  out[`${PREFIX}cancelacion_intent_count`] = String(state.cancelacion_intent_count)
  out[`${PREFIX}requires_human`] = String(state.requires_human)
  out[`${PREFIX}crm_context_status`] = state.crm_context_status

  return out
}

/**
 * Deserializa session_state.datos_capturados a AgentState.
 * Si keys faltan → defaults (phase='nuevo', datos vacios, etc.).
 */
export function deserializeState(
  datosCapturados: Record<string, string> | null | undefined,
): AgentState {
  const dc = datosCapturados ?? {}

  // Phase
  const phase = dc[`${PREFIX}phase`] || 'nuevo'

  // Datos
  const datos: DatosCliente = {
    nombre: dc['nombre'] || null,
    apellido: dc['apellido'] || null,
    telefono: dc['telefono'] || null,
    direccion: dc['direccion'] || null,
    ciudad: dc['ciudad'] || null,
    departamento: dc['departamento'] || null,
  }

  // Active order
  let active_order: ActiveOrderPayload | null = null
  const aoRaw = dc[`${PREFIX}active_order`]
  if (aoRaw && aoRaw.trim() !== '') {
    active_order = extractActiveOrder(null, aoRaw)
  }

  // Intent history
  let intent_history: string[] = []
  try {
    const raw = dc[`${PREFIX}intent_history`]
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        intent_history = parsed.filter((v): v is string => typeof v === 'string')
      }
    }
  } catch {
    /* keep default */
  }

  // Acciones
  let acciones: TipoAccion[] = []
  try {
    const raw = dc[`${PREFIX}acciones`]
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        acciones = parsed.filter((v): v is TipoAccion => typeof v === 'string') as TipoAccion[]
      }
    }
  } catch {
    /* keep default */
  }

  // Templates mostrados
  let templatesMostrados: Record<string, number> = {}
  try {
    const raw = dc[`${PREFIX}templates_mostrados`]
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'number') templatesMostrados[k] = v
        }
      }
    }
  } catch {
    /* keep default */
  }

  // Counters / flags
  const cancelacion_intent_count = parseInt(dc[`${PREFIX}cancelacion_intent_count`] || '0', 10) || 0
  const requires_human = dc[`${PREFIX}requires_human`] === 'true'
  const crmStatusRaw = dc[`${PREFIX}crm_context_status`] || 'missing'
  const crm_context_status: CrmContextStatus =
    crmStatusRaw === 'ok' || crmStatusRaw === 'empty' || crmStatusRaw === 'error' || crmStatusRaw === 'missing'
      ? (crmStatusRaw as CrmContextStatus)
      : 'missing'

  return {
    phase,
    datos,
    active_order,
    intent_history,
    acciones,
    templatesMostrados,
    cancelacion_intent_count,
    requires_human,
    crm_context_status,
  }
}
