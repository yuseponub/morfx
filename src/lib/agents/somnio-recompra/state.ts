/**
 * Somnio Recompra Agent — State Management
 *
 * Capa 3: mergeAnalysis — merge comprehension data into state
 * Capa 5: computeGates — compute datosCriticos/datosCompletos/packElegido (never stored)
 *
 * Fork of somnio-v3/state.ts — simplified for returning clients.
 * Removed: ofi inter logic (ofiInterJustSet, mencionaInter, CRITICAL_FIELDS_OFI_INTER)
 * Removed: enCapturaSilenciosa
 * Added: createPreloadedState() for pre-populating from last order
 * Added: direccionConfirmada serialization
 *
 * Uses normalizers from somnio/ (shared utility, not from somnio-v3).
 */

import {
  normalizePhone,
  normalizeCity,
  inferDepartamento,
} from '@/lib/agents/somnio/normalizers'
import {
  CRITICAL_FIELDS_NORMAL,
  PACK_PRICES,
  V3_META_PREFIX,
} from './constants'
import type { AccionRegistrada, AgentState, DatosCliente, Gates, TipoAccion } from './types'
import type { MessageAnalysis } from './comprehension-schema'

// ============================================================================
// State Changes (output of mergeAnalysis)
// ============================================================================

export interface StateChanges {
  newFields: string[]
  filled: number
  hasNewData: boolean
  datosCriticosJustCompleted: boolean
  datosCompletosJustCompleted: boolean
}

// ============================================================================
// Factory
// ============================================================================

export function createInitialState(): AgentState {
  return {
    datos: {
      nombre: null,
      apellido: null,
      telefono: null,
      ciudad: null,
      departamento: null,
      direccion: null,
      barrio: null,
      correo: null,
      indicaciones_extra: null,
      cedula_recoge: null,
    },
    pack: null,
    ofiInter: false,
    negaciones: {
      correo: false,
      telefono: false,
      barrio: false,
      cedula_recoge: false,
    },
    intentsVistos: [],
    accionesEjecutadas: [],
    templatesMostrados: [],
    direccionConfirmada: false,
    turnCount: 0,
  }
}

/**
 * Create state pre-populated from the client's last delivered order.
 * Sets the 6 critical fields from order data. Other fields remain null.
 * Since datos come preloaded, gates.datosCriticos will typically be true from the start.
 */
export function createPreloadedState(lastOrderData: Partial<DatosCliente>): AgentState {
  const state = createInitialState()

  // Pre-populate from last order
  if (lastOrderData.nombre) state.datos.nombre = lastOrderData.nombre
  if (lastOrderData.apellido) state.datos.apellido = lastOrderData.apellido
  if (lastOrderData.telefono) state.datos.telefono = lastOrderData.telefono
  if (lastOrderData.direccion) state.datos.direccion = lastOrderData.direccion
  if (lastOrderData.ciudad) state.datos.ciudad = lastOrderData.ciudad
  if (lastOrderData.departamento) state.datos.departamento = lastOrderData.departamento

  return state
}

// ============================================================================
// Merge Analysis (Capa 3)
// ============================================================================

/**
 * Deterministically merge Claude analysis into agent state.
 * Never overwrites existing non-null data with null.
 * Returns a new state object (immutable).
 *
 * Simplified from v3: no ofi inter detection logic.
 */
export function mergeAnalysis(state: AgentState, analysis: MessageAnalysis): { state: AgentState; changes: StateChanges } {
  const updated: AgentState = {
    ...state,
    datos: { ...state.datos },
    negaciones: { ...state.negaciones },
    intentsVistos: [...state.intentsVistos],
    accionesEjecutadas: [...state.accionesEjecutadas],
    templatesMostrados: [...state.templatesMostrados],
  }

  // Capture pre-merge gate state for "just completed" detection
  const criticosBefore = datosCriticosOk(state)
  const completosBefore = datosCriticosOk(state) && extrasOk(state)

  // 1. Merge extracted data fields
  const fields = analysis.extracted_fields
  const dataKeys: (keyof DatosCliente)[] = [
    'nombre', 'apellido', 'telefono', 'ciudad', 'departamento',
    'direccion', 'barrio', 'correo', 'indicaciones_extra', 'cedula_recoge',
  ]

  const newFields: string[] = []
  for (const key of dataKeys) {
    const value = fields[key]
    if (value !== null && value !== undefined && value.trim() !== '') {
      // Track if this is a NEW field (was null/empty, now has value)
      const prev = updated.datos[key]
      if (prev === null || !prev?.trim()) {
        newFields.push(key)
      }
      updated.datos[key] = value
    }
  }

  // 2. Pack selection — only apply when intent shows purchase intent
  const packIntents = new Set(['seleccion_pack', 'quiero_comprar'])
  if (fields.pack && (packIntents.has(analysis.intent.primary) || packIntents.has(analysis.intent.secondary))) {
    updated.pack = fields.pack
  }

  // 3. Negations
  if (analysis.negations.correo) updated.negaciones.correo = true
  if (analysis.negations.telefono) updated.negaciones.telefono = true
  if (analysis.negations.barrio) updated.negaciones.barrio = true
  if (analysis.negations.cedula_recoge) updated.negaciones.cedula_recoge = true

  // 4. Normalize data
  if (updated.datos.telefono) {
    updated.datos.telefono = normalizePhone(updated.datos.telefono)
  }
  if (updated.datos.ciudad) {
    updated.datos.ciudad = normalizeCity(updated.datos.ciudad)
    if (!updated.datos.departamento) {
      const dept = inferDepartamento(updated.datos.ciudad)
      if (dept) updated.datos.departamento = dept
    }
  }

  // 5. Update intent history
  updated.intentsVistos.push(analysis.intent.primary)
  if (analysis.intent.secondary !== 'ninguno') {
    updated.intentsVistos.push(analysis.intent.secondary)
  }

  // 6. Increment turn
  updated.turnCount++

  // 7. Compute state changes
  const filled = CRITICAL_FIELDS_NORMAL.filter(f => {
    const val = updated.datos[f as keyof DatosCliente]
    return val !== null && val.trim() !== ''
  }).length

  // Post-merge gate state for "just completed" detection
  const criticosAfter = datosCriticosOk(updated)
  const completosAfter = datosCriticosOk(updated) && extrasOk(updated)

  return {
    state: updated,
    changes: {
      newFields,
      filled,
      hasNewData: newFields.length > 0,
      datosCriticosJustCompleted: !criticosBefore && criticosAfter,
      datosCompletosJustCompleted: !completosBefore && completosAfter,
    },
  }
}

// ============================================================================
// Compute Gates (Capa 5)
// ============================================================================

/**
 * Compute gates from raw state. Always recalculated, never stored.
 */
export function computeGates(state: AgentState): Gates {
  return {
    datosCriticos: datosCriticosOk(state),
    datosCompletos: datosCriticosOk(state) && extrasOk(state),
    packElegido: state.pack !== null,
  }
}

/**
 * All critical fields filled? Only normal mode (no ofi inter in recompra).
 */
export function datosCriticosOk(state: AgentState): boolean {
  return CRITICAL_FIELDS_NORMAL.every(f => {
    const val = state.datos[f as keyof DatosCliente]
    return val !== null && val.trim() !== ''
  })
}

/**
 * Extra fields present or negated? Normal mode only.
 * barrio + correo (both can be negated)
 */
function extrasOk(state: AgentState): boolean {
  const correoOk = (state.datos.correo !== null && state.datos.correo.trim() !== '') || state.negaciones.correo
  const barrioOk = (state.datos.barrio !== null && state.datos.barrio.trim() !== '') || state.negaciones.barrio
  return correoOk && barrioOk
}

/**
 * List of critical + extra fields still missing. Normal mode only.
 */
export function camposFaltantes(state: AgentState): string[] {
  const missing: string[] = CRITICAL_FIELDS_NORMAL.filter(f => {
    const val = state.datos[f as keyof DatosCliente]
    return !val || val.trim() === ''
  })

  // Check extras
  const extras = ['barrio', 'correo'] as const
  for (const extra of extras) {
    const val = state.datos[extra as keyof DatosCliente]
    const present = val !== null && val.trim() !== ''
    if (present) continue
    const negated = state.negaciones[extra as keyof typeof state.negaciones]
    if (!negated) missing.push(extra)
  }

  return missing
}

// ============================================================================
// Resumen Context Builder
// ============================================================================

export function buildResumenContext(state: AgentState): Record<string, string> {
  return {
    nombre: state.datos.nombre ?? '',
    apellido: state.datos.apellido ?? '',
    ciudad: state.datos.ciudad ?? '',
    direccion: state.datos.direccion ?? '',
    departamento: state.datos.departamento ?? '',
    telefono: state.datos.telefono ?? '',
    pack: state.pack ?? '',
    precio: state.pack ? (PACK_PRICES[state.pack] ?? '') : '',
  }
}

// ============================================================================
// Serialization (state <-> session_state flat format)
// ============================================================================

/**
 * Serialize AgentState to flat datosCapturados for session_state.
 * Stores v3-specific fields with _v3: prefix.
 */
export function serializeState(state: AgentState): {
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  intentsVistos: string[]
  templatesEnviados: string[]
  accionesEjecutadas: AccionRegistrada[]
} {
  const datosCapturados: Record<string, string> = {}

  // Flatten datos
  for (const [key, value] of Object.entries(state.datos)) {
    if (value !== null) datosCapturados[key] = value
  }

  // Store v3 metadata
  datosCapturados[`${V3_META_PREFIX}ofiInter`] = String(state.ofiInter)
  datosCapturados[`${V3_META_PREFIX}direccionConfirmada`] = String(state.direccionConfirmada)
  datosCapturados[`${V3_META_PREFIX}turnCount`] = String(state.turnCount)

  // Negations
  if (state.negaciones.correo) datosCapturados[`${V3_META_PREFIX}neg_correo`] = 'true'
  if (state.negaciones.telefono) datosCapturados[`${V3_META_PREFIX}neg_telefono`] = 'true'
  if (state.negaciones.barrio) datosCapturados[`${V3_META_PREFIX}neg_barrio`] = 'true'
  if (state.negaciones.cedula_recoge) datosCapturados[`${V3_META_PREFIX}neg_cedula_recoge`] = 'true'

  return {
    datosCapturados,
    packSeleccionado: state.pack,
    intentsVistos: state.intentsVistos,
    templatesEnviados: state.templatesMostrados,
    accionesEjecutadas: state.accionesEjecutadas,
  }
}

/**
 * Deserialize flat session_state into AgentState.
 */
export function deserializeState(
  datosCapturados: Record<string, string>,
  packSeleccionado: string | null,
  intentsVistos: string[],
  templatesEnviados: string[],
  accionesEjecutadas: AccionRegistrada[] = [],
): AgentState {
  const state = createInitialState()

  // Restore datos (filter out metadata keys)
  for (const [key, value] of Object.entries(datosCapturados)) {
    if (key.startsWith(V3_META_PREFIX)) continue
    if (key in state.datos) {
      (state.datos as unknown as Record<string, string | null>)[key] = value || null
    }
  }

  // Restore pack
  if (packSeleccionado === '1x' || packSeleccionado === '2x' || packSeleccionado === '3x') {
    state.pack = packSeleccionado
  }

  // Restore intents and templates
  state.intentsVistos = intentsVistos
  state.templatesMostrados = templatesEnviados

  // Restore v3 metadata
  state.ofiInter = datosCapturados[`${V3_META_PREFIX}ofiInter`] === 'true'
  state.direccionConfirmada = datosCapturados[`${V3_META_PREFIX}direccionConfirmada`] === 'true'
  state.turnCount = parseInt(datosCapturados[`${V3_META_PREFIX}turnCount`] || '0', 10)

  // Restore acciones ejecutadas: prefer first-class parameter, fallback to datosCapturados (backward compat)
  if (accionesEjecutadas.length > 0) {
    state.accionesEjecutadas = accionesEjecutadas
  } else {
    try {
      const raw = datosCapturados[`${V3_META_PREFIX}accionesEjecutadas`]
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) {
            state.accionesEjecutadas = []
          } else if (typeof parsed[0] === 'string') {
            state.accionesEjecutadas = parsed.map((tipo: string) => ({
              tipo: tipo as TipoAccion,
              turno: 0,
              origen: 'bot' as const,
            }))
          } else {
            state.accionesEjecutadas = parsed
          }
        }
      }
    } catch { /* keep default */ }
  }

  // Restore negations
  state.negaciones.correo = datosCapturados[`${V3_META_PREFIX}neg_correo`] === 'true'
  state.negaciones.telefono = datosCapturados[`${V3_META_PREFIX}neg_telefono`] === 'true'
  state.negaciones.barrio = datosCapturados[`${V3_META_PREFIX}neg_barrio`] === 'true'
  state.negaciones.cedula_recoge = datosCapturados[`${V3_META_PREFIX}neg_cedula_recoge`] === 'true'

  return state
}

// ============================================================================
// Action Helpers
// ============================================================================

/** Check if an action type has been executed */
export function hasAction(acciones: AccionRegistrada[], tipo: TipoAccion): boolean {
  return acciones.some(a => a.tipo === tipo)
}
