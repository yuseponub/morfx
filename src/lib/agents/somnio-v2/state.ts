/**
 * Somnio Sales Agent v2 — State Model (Capa 2)
 *
 * Deterministic state management:
 * - createInitialState(): factory
 * - mergeAnalysis(): merge extracted data into state
 * - computarFase(): compute funnel position from state
 * - Completeness helpers
 *
 * Uses normalizers from v1 (imported, not copied).
 */

import {
  normalizePhone,
  normalizeCity,
  inferDepartamento,
} from '@/lib/agents/somnio/normalizers'
import { CRITICAL_FIELDS_V2, CRITICAL_FIELDS_INTER_V2, INTEREST_INTENTS_V2 } from './constants'
import type { AgentState, FunnelPhase } from './types'
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
    confirmado: false,
    negaciones: {
      correo: false,
      telefono: false,
      barrio: false,
    },
    mostrado: new Set(),
    templatesEnviados: [],
    intentsVistos: [],
    turnCount: 0,
  }
}

// ============================================================================
// Merge Analysis
// ============================================================================

/**
 * Deterministically merge Claude analysis into agent state.
 * Never overwrites existing non-null data with null.
 *
 * @param state - Current state (not mutated)
 * @param analysis - Claude structured output
 * @returns New state with merged data
 */
export function mergeAnalysis(state: AgentState, analysis: MessageAnalysis): AgentState {
  // Deep clone state (structuredClone handles everything except Set)
  const updated: AgentState = {
    ...state,
    datos: { ...state.datos },
    negaciones: { ...state.negaciones },
    mostrado: new Set(state.mostrado),
    templatesEnviados: [...state.templatesEnviados],
    intentsVistos: [...state.intentsVistos],
  }

  // 1. Merge extracted data fields (skip pack and ofi_inter — handled separately)
  const fields = analysis.extracted_fields
  const dataKeys = [
    'nombre', 'apellido', 'telefono', 'ciudad', 'departamento',
    'direccion', 'barrio', 'correo', 'indicaciones_extra', 'cedula_recoge',
  ] as const

  for (const key of dataKeys) {
    const value = fields[key]
    if (value !== null && value !== undefined && value.trim() !== '') {
      updated.datos[key] = value
    }
  }

  // 2. Pack selection
  if (fields.pack) {
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

  // 7. Metadata
  updated.turnCount++

  return updated
}

// ============================================================================
// Funnel Phase
// ============================================================================

/**
 * Compute current funnel position from state.
 * This is NEVER stored — always computed on the fly.
 */
export function computarFase(state: AgentState): FunnelPhase {
  if (state.confirmado) return 'confirmado'
  if (state.mostrado.has('resumen')) return 'resumen_mostrado'
  if (state.pack !== null) return 'pack_elegido'
  if (state.mostrado.has('promos')) return 'vio_promos'
  if (datosCompletos(state)) return 'datos_completos'
  if (tieneDatosParciales(state)) return 'datos_parciales'
  if (state.intentsVistos.some(i => INTEREST_INTENTS_V2.has(i as any))) return 'interesado'
  return 'nuevo'
}

// ============================================================================
// Completeness Helpers
// ============================================================================

/**
 * All critical fields filled?
 * Uses ofiInter-specific fields if applicable.
 */
export function datosCompletos(state: AgentState): boolean {
  const fields = state.ofiInter ? CRITICAL_FIELDS_INTER_V2 : CRITICAL_FIELDS_V2
  return fields.every(f => state.datos[f] !== null && state.datos[f]!.trim() !== '')
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
  const fields = state.ofiInter ? CRITICAL_FIELDS_INTER_V2 : CRITICAL_FIELDS_V2
  return fields.filter(f => !state.datos[f] || state.datos[f]!.trim() === '')
}
