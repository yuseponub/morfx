/**
 * Somnio Sales Agent v3 — State Management (Capa 3 + Capa 5)
 *
 * Capa 3: mergeAnalysis — merge comprehension data into state
 * Capa 5: computeGates — compute datosOk/packElegido (never stored)
 *
 * Uses normalizers from v1 (imported, not copied).
 */

import {
  normalizePhone,
  normalizeCity,
  inferDepartamento,
} from '@/lib/agents/somnio/normalizers'
import {
  CRITICAL_FIELDS_NORMAL,
  CRITICAL_FIELDS_OFI_INTER,
  PACK_PRICES,
  V3_META_PREFIX,
} from './constants'
import type { AccionRegistrada, AgentState, DatosCliente, Gates, TipoAccion } from './types'
import type { MessageAnalysis } from './comprehension-schema'

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
    },
    intentsVistos: [],
    accionesEjecutadas: [],
    templatesMostrados: [],
    enCapturaSilenciosa: false,
    turnCount: 0,
  }
}

// ============================================================================
// Merge Analysis (Capa 3)
// ============================================================================

/**
 * Deterministically merge Claude analysis into agent state.
 * Never overwrites existing non-null data with null.
 * Returns a new state object (immutable).
 */
export function mergeAnalysis(state: AgentState, analysis: MessageAnalysis): AgentState {
  const updated: AgentState = {
    ...state,
    datos: { ...state.datos },
    negaciones: { ...state.negaciones },
    intentsVistos: [...state.intentsVistos],
    accionesEjecutadas: [...state.accionesEjecutadas],
    templatesMostrados: [...state.templatesMostrados],
  }

  // 1. Merge extracted data fields
  const fields = analysis.extracted_fields
  const dataKeys: (keyof DatosCliente)[] = [
    'nombre', 'apellido', 'telefono', 'ciudad', 'departamento',
    'direccion', 'barrio', 'correo', 'indicaciones_extra', 'cedula_recoge',
  ]

  for (const key of dataKeys) {
    const value = fields[key]
    if (value !== null && value !== undefined && value.trim() !== '') {
      updated.datos[key] = value
    }
  }

  // 2. Pack selection — only apply when intent shows purchase intent
  const packIntents = new Set(['seleccion_pack', 'quiero_comprar'])
  if (fields.pack && (packIntents.has(analysis.intent.primary) || packIntents.has(analysis.intent.secondary))) {
    updated.pack = fields.pack
  }

  // 3. Ofi Inter
  if (fields.ofi_inter === true) {
    updated.ofiInter = true
  }

  // 4. Negations
  if (analysis.negations.correo) updated.negaciones.correo = true
  if (analysis.negations.telefono) updated.negaciones.telefono = true
  if (analysis.negations.barrio) updated.negaciones.barrio = true

  // 5. Normalize data
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

  // 6. Update intent history
  updated.intentsVistos.push(analysis.intent.primary)
  if (analysis.intent.secondary !== 'ninguno') {
    updated.intentsVistos.push(analysis.intent.secondary)
  }

  // 7. Increment turn
  updated.turnCount++

  return updated
}

// ============================================================================
// Compute Gates (Capa 5)
// ============================================================================

/**
 * Compute gates from raw state. Always recalculated, never stored.
 */
export function computeGates(state: AgentState): Gates {
  return {
    datosOk: datosCriticosOk(state),
    datosCompletos: datosCriticosOk(state) && datosExtrasOk(state),
    packElegido: state.pack !== null,
  }
}

/**
 * All critical fields filled? Mode-aware (normal vs ofi inter).
 */
export function datosCriticosOk(state: AgentState): boolean {
  const fields = state.ofiInter ? CRITICAL_FIELDS_OFI_INTER : CRITICAL_FIELDS_NORMAL
  return fields.every(f => {
    const val = state.datos[f as keyof DatosCliente]
    return val !== null && val.trim() !== ''
  })
}

/**
 * Extra fields (barrio) present or negated?
 * In ofiInter mode, barrio is irrelevant → always true.
 */
export function datosExtrasOk(state: AgentState): boolean {
  if (state.ofiInter) return true
  const barrioPresent = state.datos.barrio !== null && state.datos.barrio.trim() !== ''
  return barrioPresent || state.negaciones.barrio
}

/**
 * At least one data field present?
 */
export function tieneDatosParciales(state: AgentState): boolean {
  return Object.values(state.datos).some(v => v !== null && v.trim() !== '')
}

/**
 * List of critical fields still missing.
 */
export function camposFaltantes(state: AgentState): string[] {
  const fields = state.ofiInter ? CRITICAL_FIELDS_OFI_INTER : CRITICAL_FIELDS_NORMAL
  return fields.filter(f => {
    const val = state.datos[f as keyof DatosCliente]
    return !val || val.trim() === ''
  })
}

/**
 * Count of critical fields filled.
 */
export function camposLlenos(state: AgentState): number {
  const fields = state.ofiInter ? CRITICAL_FIELDS_OFI_INTER : CRITICAL_FIELDS_NORMAL
  return fields.filter(f => {
    const val = state.datos[f as keyof DatosCliente]
    return val !== null && val.trim() !== ''
  }).length
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
  datosCapturados[`${V3_META_PREFIX}enCaptura`] = String(state.enCapturaSilenciosa)
  datosCapturados[`${V3_META_PREFIX}turnCount`] = String(state.turnCount)
  // NOTE: accionesEjecutadas now flows as its own field (quick-009), not inside datosCapturados
  // NOTE: templatesMostrados already flows via templatesEnviados

  // Negations
  if (state.negaciones.correo) datosCapturados[`${V3_META_PREFIX}neg_correo`] = 'true'
  if (state.negaciones.telefono) datosCapturados[`${V3_META_PREFIX}neg_telefono`] = 'true'
  if (state.negaciones.barrio) datosCapturados[`${V3_META_PREFIX}neg_barrio`] = 'true'

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
  state.enCapturaSilenciosa = datosCapturados[`${V3_META_PREFIX}enCaptura`] === 'true'
  state.turnCount = parseInt(datosCapturados[`${V3_META_PREFIX}turnCount`] || '0', 10)

  // Restore acciones ejecutadas: prefer first-class parameter, fallback to datosCapturados (backward compat)
  if (accionesEjecutadas.length > 0) {
    state.accionesEjecutadas = accionesEjecutadas
  } else {
    // Backward compat: parse from datosCapturados if field not passed (production sessions with old format)
    try {
      const raw = datosCapturados[`${V3_META_PREFIX}accionesEjecutadas`]
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) {
            state.accionesEjecutadas = []
          } else if (typeof parsed[0] === 'string') {
            // OLD FORMAT: string[] -> convert to AccionRegistrada[]
            state.accionesEjecutadas = parsed.map((tipo: string) => ({
              tipo: tipo as TipoAccion,
              turno: 0,
              origen: 'bot' as const,
            }))
          } else {
            // NEW FORMAT: AccionRegistrada[]
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

  return state
}

// ============================================================================
// Action Helpers
// ============================================================================

/** Check if an action type has been executed */
export function hasAction(acciones: AccionRegistrada[], tipo: TipoAccion): boolean {
  return acciones.some(a => a.tipo === tipo)
}
