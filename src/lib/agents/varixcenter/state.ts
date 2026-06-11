// Clonado de src/lib/agents/godentist-fb-ig/state.ts (Standalone agent-varixcenter Wave 2 Plan 04 Task 2).
// Cambios vs godentist-fb-ig (diseño §2/§4):
//   - Merge: nombre, telefono, cedula, ciudad, tipo_venas, fecha_preferida, preferencia_jornada,
//     horario_seleccionado. ELIMINADO el merge de sede y de servicio dental.
//   - Rechazo domingo/festivo (D-09) vía isNonWorkingDay (verbatim).
//   - Gates: triageCompleto (ciudad+tipo_venas) + datosCriticos + fechaElegida + horarioElegido + datosCompletos.
//   - es_foraneo derivado (isForaneo) — NO bloquea (D-15).
//   - camposFaltantes usa cedula (no sede), FIELD_LABELS legibles.
//   - buildResumenContext sin sede.
/**
 * Varixcenter Appointment Agent — State Management
 *
 * Capa 3: mergeAnalysis — merge comprehension data into state
 * Capa 5: computeGates — compute triageCompleto/datosCriticos/fechaElegida/horarioElegido (never stored)
 *
 * Uses normalizePhone from somnio normalizers (reuse, not duplicate).
 */

import { normalizePhone } from '@/lib/agents/somnio/normalizers'
import { CRITICAL_FIELDS, FIELD_LABELS, VARIX_META_PREFIX, isNonWorkingDay, isForaneo } from './constants'
import type { AccionRegistrada, AgentState, DatosCliente, Gates, TipoAccion } from './types'
import type { MessageAnalysis } from './comprehension-schema'

// ============================================================================
// State Changes (output of mergeAnalysis)
// ============================================================================

export interface StateChanges {
  newFields: string[]
  /** number of new fields filled this turn */
  filled: number
  hasNewData: boolean
  datosCriticosJustCompleted: boolean
  fechaJustSet: boolean // fecha_preferida went from null to value this turn
}

// ============================================================================
// Factory
// ============================================================================

export function createInitialState(): AgentState {
  return {
    datos: {
      nombre: null,
      telefono: null,
      cedula: null,
      ciudad: null,
      tipo_venas: null,
      fecha_preferida: null,
      fecha_vaga: null,
      preferencia_jornada: null,
      horario_seleccionado: null,
    },
    intentsVistos: [],
    accionesEjecutadas: [],
    templatesMostrados: [],
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
export function mergeAnalysis(
  state: AgentState,
  analysis: MessageAnalysis,
): { state: AgentState; changes: StateChanges } {
  const updated: AgentState = {
    ...state,
    datos: { ...state.datos },
    intentsVistos: [...state.intentsVistos],
    accionesEjecutadas: [...state.accionesEjecutadas],
    templatesMostrados: [...state.templatesMostrados],
  }

  // Capture pre-merge gate state for "just completed" detection
  const criticosBefore = datosCriticosOk(state)
  const fechaBefore = state.datos.fecha_preferida !== null && state.datos.fecha_preferida.trim() !== ''

  // 1. Merge extracted data fields
  const fields = analysis.extracted_fields
  const newFields: string[] = []

  // Simple string fields: merge if non-null, non-empty
  const stringKeys: (keyof DatosCliente)[] = ['nombre', 'telefono', 'cedula', 'ciudad']
  for (const key of stringKeys) {
    const value = fields[key]
    if (value !== null && value !== undefined && (value as string).trim() !== '') {
      const prev = updated.datos[key]
      if (prev === null || !(prev as string).trim()) {
        newFields.push(key)
      }
      ;(updated.datos as unknown as Record<string, string | null>)[key] = value
    }
  }

  // tipo_venas: merge directly (already normalized to enum by comprehension)
  if (fields.tipo_venas !== null && fields.tipo_venas !== undefined) {
    if (updated.datos.tipo_venas === null) newFields.push('tipo_venas')
    updated.datos.tipo_venas = fields.tipo_venas
  }

  // fecha_preferida: merge directly (mutually exclusive with fecha_vaga)
  // Reject Sundays and Colombian holidays — store as fecha_vaga instead (D-09)
  if (fields.fecha_preferida !== null && fields.fecha_preferida !== undefined && fields.fecha_preferida.trim() !== '') {
    const nonWorking = isNonWorkingDay(fields.fecha_preferida)
    if (nonWorking) {
      // Convert to fecha_vaga so the bot can suggest an alternative
      updated.datos.fecha_vaga = nonWorking === 'domingo'
        ? `domingo ${fields.fecha_preferida}`
        : `festivo ${fields.fecha_preferida}`
      updated.datos.fecha_preferida = null
      newFields.push('fecha_vaga')
    } else {
      if (updated.datos.fecha_preferida === null || !updated.datos.fecha_preferida.trim()) {
        newFields.push('fecha_preferida')
      }
      updated.datos.fecha_preferida = fields.fecha_preferida
      // Clear fecha_vaga — they are mutually exclusive
      updated.datos.fecha_vaga = null
    }
  }

  // fecha_vaga: merge directly (mutually exclusive with fecha_preferida)
  if (fields.fecha_vaga !== null && fields.fecha_vaga !== undefined && (fields.fecha_vaga as string).trim() !== '') {
    if (updated.datos.fecha_vaga === null || !updated.datos.fecha_vaga.trim()) {
      newFields.push('fecha_vaga')
    }
    updated.datos.fecha_vaga = fields.fecha_vaga as string
    // Clear fecha_preferida — they are mutually exclusive
    updated.datos.fecha_preferida = null
  }

  // preferencia_jornada: merge directly
  if (fields.preferencia_jornada !== null && fields.preferencia_jornada !== undefined) {
    if (updated.datos.preferencia_jornada === null) newFields.push('preferencia_jornada')
    updated.datos.preferencia_jornada = fields.preferencia_jornada
  }

  // horario_seleccionado: merge directly
  if (fields.horario_seleccionado !== null && fields.horario_seleccionado !== undefined && fields.horario_seleccionado.trim() !== '') {
    if (updated.datos.horario_seleccionado === null || !updated.datos.horario_seleccionado.trim()) {
      newFields.push('horario_seleccionado')
    }
    updated.datos.horario_seleccionado = fields.horario_seleccionado
  }

  // 2. Normalize telefono
  if (updated.datos.telefono) {
    updated.datos.telefono = normalizePhone(updated.datos.telefono)
  }

  // 3. Update intent history
  updated.intentsVistos.push(analysis.intent.primary)
  if (analysis.intent.secondary !== 'ninguno') {
    updated.intentsVistos.push(analysis.intent.secondary)
  }

  // 4. Increment turn
  updated.turnCount++

  // 5. Compute state changes
  const criticosAfter = datosCriticosOk(updated)
  const fechaAfter = updated.datos.fecha_preferida !== null && updated.datos.fecha_preferida.trim() !== ''

  return {
    state: updated,
    changes: {
      newFields,
      filled: newFields.length,
      hasNewData: newFields.length > 0,
      datosCriticosJustCompleted: !criticosBefore && criticosAfter,
      fechaJustSet: !fechaBefore && fechaAfter,
    },
  }
}

// ============================================================================
// Compute Gates (Capa 5 — diseño §4)
// ============================================================================

/**
 * Compute gates from raw state. Always recalculated, never stored.
 */
export function computeGates(state: AgentState): Gates {
  const triageCompleto = state.datos.ciudad !== null && state.datos.ciudad.trim() !== ''
    && state.datos.tipo_venas !== null
  const datosCriticos = datosCriticosOk(state)
  const fechaElegida = state.datos.fecha_preferida !== null && state.datos.fecha_preferida.trim() !== ''
  const horarioElegido = state.datos.horario_seleccionado !== null && state.datos.horario_seleccionado.trim() !== ''
  return {
    triageCompleto,
    datosCriticos,
    fechaElegida,
    horarioElegido,
    datosCompletos: datosCriticos && fechaElegida && horarioElegido,
  }
}

/**
 * All critical fields filled? (nombre + telefono + cedula — D-05)
 */
function datosCriticosOk(state: AgentState): boolean {
  return CRITICAL_FIELDS.every(f => {
    const val = state.datos[f as keyof DatosCliente]
    return val !== null && typeof val === 'string' && val.trim() !== ''
  })
}

/**
 * es_foraneo derived gate (diseño §2). True when the patient's city is outside the
 * Bucaramanga metro area. Does NOT block scheduling (D-15) — response-track adds the
 * `fuera_de_ciudad` template as COMP.
 */
export function esForaneo(state: AgentState): boolean {
  return isForaneo(state.datos.ciudad)
}

// ============================================================================
// Missing Fields
// ============================================================================

/**
 * List of critical field names that are still null/empty (nombre + cedula + telefono).
 * Also includes fecha_preferida when datosCriticos is met but fecha is missing.
 */
export function camposFaltantes(state: AgentState): string[] {
  const fieldsToCheck = ['nombre', 'cedula', 'telefono'] as const
  const missing: string[] = fieldsToCheck.filter(f => {
    const val = state.datos[f as keyof DatosCliente]
    return val === null || typeof val !== 'string' || val.trim() === ''
  })

  // When all critical fields are complete, also report fecha if missing
  if (missing.length === 0) {
    if (!state.datos.fecha_preferida || state.datos.fecha_preferida.trim() === '') {
      missing.push('fecha_preferida')
    }
  }

  return missing
}

/** Human-readable labels for camposFaltantes (used in retoma/pedir_datos templates). */
export function camposFaltantesLabels(state: AgentState): string[] {
  return camposFaltantes(state).map(f => FIELD_LABELS[f] ?? f)
}

// ============================================================================
// Resumen Context Builder (template confirmar_cita — SIN sede)
// ============================================================================

/**
 * Format YYYY-MM-DD to "Miércoles 26 de marzo" (Colombian Spanish).
 */
function formatFechaConDia(fecha: string | null): string {
  if (!fecha) return ''
  try {
    const [y, m, d] = fecha.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    const dia = date.toLocaleDateString('es-CO', { weekday: 'long', timeZone: 'UTC' })
    const mes = date.toLocaleDateString('es-CO', { month: 'long', timeZone: 'UTC' })
    const diaCapitalized = dia.charAt(0).toUpperCase() + dia.slice(1)
    return `${diaCapitalized} ${d} de ${mes}`
  } catch {
    return fecha
  }
}

/**
 * Build context record for template variable substitution.
 * Maps all datos to string values for resumen templates (confirmar_cita — sin sede).
 */
export function buildResumenContext(state: AgentState): Record<string, string> {
  return {
    nombre: state.datos.nombre ?? '',
    cedula: state.datos.cedula ?? '',
    telefono: state.datos.telefono ?? '',
    ciudad: state.datos.ciudad ?? '',
    tipo_venas: state.datos.tipo_venas ?? '',
    fecha: formatFechaConDia(state.datos.fecha_preferida),
    fecha_preferida: formatFechaConDia(state.datos.fecha_preferida),
    fecha_vaga: state.datos.fecha_vaga ?? '',
    preferencia_jornada: state.datos.preferencia_jornada ?? '',
    horario_seleccionado: state.datos.horario_seleccionado ?? '',
  }
}

// ============================================================================
// Serialization (state <-> session_state flat format)
// ============================================================================

/**
 * Serialize AgentState to flat datosCapturados for session_state.
 * Stores Varixcenter-specific fields with _vx: prefix.
 */
export function serializeState(state: AgentState): {
  datosCapturados: Record<string, string>
  intentsVistos: string[]
  templatesEnviados: string[]
  accionesEjecutadas: AccionRegistrada[]
} {
  const datosCapturados: Record<string, string> = {}

  // Flatten datos
  for (const [key, value] of Object.entries(state.datos)) {
    if (value !== null) datosCapturados[key] = String(value)
  }

  // Store vx metadata
  datosCapturados[`${VARIX_META_PREFIX}turnCount`] = String(state.turnCount)

  return {
    datosCapturados,
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
  intentsVistos: string[],
  templatesEnviados: string[],
  accionesEjecutadas: AccionRegistrada[] = [],
): AgentState {
  const state = createInitialState()

  // Restore datos (filter out metadata keys)
  for (const [key, value] of Object.entries(datosCapturados)) {
    if (key.startsWith(VARIX_META_PREFIX)) continue
    if (key in state.datos) {
      ;(state.datos as unknown as Record<string, string | null>)[key] = value || null
    }
  }

  // Restore preferencia_jornada as enum value
  if (state.datos.preferencia_jornada !== null) {
    const jornada = state.datos.preferencia_jornada as string
    if (jornada !== 'manana' && jornada !== 'tarde') {
      state.datos.preferencia_jornada = null
    }
  }

  // Restore tipo_venas as enum value
  if (state.datos.tipo_venas !== null) {
    const tv = state.datos.tipo_venas as string
    if (tv !== 'grandes' && tv !== 'vasitos' && tv !== 'ambas') {
      state.datos.tipo_venas = null
    }
  }

  // Restore intents and templates
  state.intentsVistos = intentsVistos
  state.templatesMostrados = templatesEnviados

  // Restore vx metadata
  state.turnCount = parseInt(datosCapturados[`${VARIX_META_PREFIX}turnCount`] || '0', 10)

  // Restore acciones ejecutadas
  if (accionesEjecutadas.length > 0) {
    state.accionesEjecutadas = accionesEjecutadas
  } else {
    // Backward compat: parse from datosCapturados if field not passed
    try {
      const raw = datosCapturados[`${VARIX_META_PREFIX}accionesEjecutadas`]
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

  return state
}

// ============================================================================
// Action Helpers
// ============================================================================

/** Check if an action type has been executed */
export function hasAction(acciones: AccionRegistrada[], tipo: TipoAccion): boolean {
  return acciones.some(a => a.tipo === tipo)
}
