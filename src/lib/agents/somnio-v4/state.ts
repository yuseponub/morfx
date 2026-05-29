/**
 * Somnio Sales Agent v4 — State Management (Capa 3 + Capa 5)
 *
 * Capa 3: mergeAnalysis — merge comprehension data into state
 * Capa 5: computeGates — compute datosCriticos/datosCompletos/packElegido (never stored)
 *
 * Uses normalizers from somnio/ shared (imported, not copied).
 *
 * Standalone: somnio-sales-v4
 * Cloned mecánicamente desde somnio-v3/state.ts (D-24).
 * Diferencia: usa V4_META_PREFIX ('_v4:') en lugar del prefijo legacy v3 (D-30 isolation).
 */

import {
  normalizePhone,
  normalizeCity,
  inferDepartamento,
} from '@/lib/agents/somnio/normalizers'
import {
  CRITICAL_FIELDS_NORMAL,
  CRITICAL_FIELDS_OFI_INTER,
  EXTRAS_NORMAL,
  EXTRAS_OFI_INTER,
  PACK_PRICES,
  V4_META_PREFIX,
} from './constants'
import type {
  AccionRegistrada,
  AgentState,
  Atendido,
  CrmActionRegistrada,
  DatosCliente,
  Gates,
  TipoAccion,
  TurnLedger,
  TurnLedgerDims,
} from './types'
import type { MessageAnalysis } from './comprehension-schema'

// ============================================================================
// State Changes (output of mergeAnalysis)
// ============================================================================

export interface StateChanges {
  newFields: string[]           // campos que pasaron de null/vacio a valor
  filled: number                // total campos criticos llenos
  hasNewData: boolean           // al menos 1 campo nuevo
  ofiInterJustSet: boolean      // ofiInter paso de false->true este turno (Senal 1)
  mencionaInter: boolean         // cliente menciono inter sin oficina (Senal 2)
  datosCriticosJustCompleted: boolean    // criticos: false->true this turn
  datosCompletosJustCompleted: boolean   // completos: false->true this turn
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

  // 3. Ofi Inter — read entrega_oficina (new bifurcated field)
  const prevOfiInter = updated.ofiInter
  if (fields.entrega_oficina === true) {
    updated.ofiInter = true
  }

  // 4. Negations
  if (analysis.negations.correo) updated.negaciones.correo = true
  if (analysis.negations.telefono) updated.negaciones.telefono = true
  if (analysis.negations.barrio) updated.negaciones.barrio = true
  if (analysis.negations.cedula_recoge) updated.negaciones.cedula_recoge = true

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

  // 8. Compute state changes
  const criticalFields = state.ofiInter ? CRITICAL_FIELDS_OFI_INTER : CRITICAL_FIELDS_NORMAL
  const filled = criticalFields.filter(f => {
    const val = updated.datos[f as keyof DatosCliente]
    return val !== null && val.trim() !== ''
  }).length

  // Post-merge gate state for "just completed" detection
  const criticosAfter = datosCriticosOk(updated)
  const completosAfter = datosCriticosOk(updated) && extrasOk(updated)

  // Compute ofi-inter signals
  const ofiInterJustSet = !prevOfiInter && updated.ofiInter  // false->true este turno
  const mencionaInter = fields.menciona_inter === true && !updated.ofiInter
    // Solo si NO se activo ofiInter (entrega_oficina tiene prioridad)

  // T8: Limpiar direccion/barrio cuando ofiInterJustSet + tenia direccion previa
  // La direccion anterior ya no aplica si el cliente elige oficina
  if (ofiInterJustSet && updated.datos.direccion) {
    updated.datos.direccion = null
    updated.datos.barrio = null
  }

  return {
    state: updated,
    changes: {
      newFields,
      filled,
      hasNewData: newFields.length > 0,
      ofiInterJustSet,
      mencionaInter,
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
 * Extra fields present or negated? Mode-aware.
 * Normal: barrio + correo (both can be negated)
 * Ofi Inter: cedula_recoge (required, no negation) + correo (can be negated)
 */
function extrasOk(state: AgentState): boolean {
  if (state.ofiInter) {
    const cedulaOk = (state.datos.cedula_recoge !== null && state.datos.cedula_recoge.trim() !== '') || state.negaciones.cedula_recoge
    const correoOk = (state.datos.correo !== null && state.datos.correo.trim() !== '') || state.negaciones.correo
    return cedulaOk && correoOk
  }
  const correoOk = (state.datos.correo !== null && state.datos.correo.trim() !== '') || state.negaciones.correo
  const barrioOk = (state.datos.barrio !== null && state.datos.barrio.trim() !== '') || state.negaciones.barrio
  return correoOk && barrioOk
}

/**
 * List of critical + extra fields still missing. Mode-aware.
 */
export function camposFaltantes(state: AgentState): string[] {
  const criticals = state.ofiInter ? CRITICAL_FIELDS_OFI_INTER : CRITICAL_FIELDS_NORMAL
  const extras = state.ofiInter ? EXTRAS_OFI_INTER : EXTRAS_NORMAL

  const missing: string[] = criticals.filter(f => {
    const val = state.datos[f as keyof DatosCliente]
    return !val || val.trim() === ''
  })

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
 * Stores v4-specific fields with _v4: prefix (D-30 isolation from v3).
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

  // Store v4 metadata
  datosCapturados[`${V4_META_PREFIX}ofiInter`] = String(state.ofiInter)
  datosCapturados[`${V4_META_PREFIX}enCaptura`] = String(state.enCapturaSilenciosa)
  datosCapturados[`${V4_META_PREFIX}turnCount`] = String(state.turnCount)
  // NOTE: accionesEjecutadas now flows as its own field (quick-009), not inside datosCapturados
  // NOTE: templatesMostrados already flows via templatesEnviados

  // Negations
  if (state.negaciones.correo) datosCapturados[`${V4_META_PREFIX}neg_correo`] = 'true'
  if (state.negaciones.telefono) datosCapturados[`${V4_META_PREFIX}neg_telefono`] = 'true'
  if (state.negaciones.barrio) datosCapturados[`${V4_META_PREFIX}neg_barrio`] = 'true'
  if (state.negaciones.cedula_recoge) datosCapturados[`${V4_META_PREFIX}neg_cedula_recoge`] = 'true'

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
  // D-16 (standalone somnio-v4-turn-ledger): dims persistidas del turno previo.
  // Param NUEVO al final con default graceful → sesiones legacy sin dims no rompen.
  // NO se devuelve dentro de AgentState (AgentState = working state); el runner v4
  // restaura las dims como input separado (V4AgentInput.turnLedgerDims — ver Plan 03).
  // Deserialize trivial (passthrough con default) — no hay formato legacy de dims.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _turnLedgerDims: TurnLedgerDims = { atendido: [], crmActions: [] },
): AgentState {
  const state = createInitialState()

  // Restore datos (filter out metadata keys)
  for (const [key, value] of Object.entries(datosCapturados)) {
    if (key.startsWith(V4_META_PREFIX)) continue
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

  // Restore v4 metadata
  state.ofiInter = datosCapturados[`${V4_META_PREFIX}ofiInter`] === 'true'
  state.enCapturaSilenciosa = datosCapturados[`${V4_META_PREFIX}enCaptura`] === 'true'
  state.turnCount = parseInt(datosCapturados[`${V4_META_PREFIX}turnCount`] || '0', 10)

  // Restore acciones ejecutadas: prefer first-class parameter, fallback to datosCapturados (backward compat)
  if (accionesEjecutadas.length > 0) {
    state.accionesEjecutadas = accionesEjecutadas
  } else {
    // Backward compat: parse from datosCapturados if field not passed (production sessions with old format)
    try {
      const raw = datosCapturados[`${V4_META_PREFIX}accionesEjecutadas`]
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
  state.negaciones.correo = datosCapturados[`${V4_META_PREFIX}neg_correo`] === 'true'
  state.negaciones.telefono = datosCapturados[`${V4_META_PREFIX}neg_telefono`] === 'true'
  state.negaciones.barrio = datosCapturados[`${V4_META_PREFIX}neg_barrio`] === 'true'
  state.negaciones.cedula_recoge = datosCapturados[`${V4_META_PREFIX}neg_cedula_recoge`] === 'true'

  return state
}

// ============================================================================
// Turn Ledger Commit (standalone somnio-v4-turn-ledger — D-11/D-12/D-17)
// ============================================================================

const LEDGER_TEXTO_MAX = 500

/** T-ledger-01: truncar texto generado por el modelo antes de persistir (no inflar jsonb). */
function truncateTexto(s: string, max = LEDGER_TEXTO_MAX): string {
  return s.length > max ? s.slice(0, max) : s
}

/** T-ledger-02: redacción mínima defensiva de phone (last-4) / email (local-part masked). */
function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    const k = key.toLowerCase()
    if (typeof value === 'string') {
      if (k === 'phone' || k === 'telefono' || k === 'celular') {
        out[key] = value.length > 4 ? `***${value.slice(-4)}` : value
        continue
      }
      if (k === 'email' || k === 'correo') {
        const at = value.indexOf('@')
        out[key] = at > 0 ? `***${value.slice(at)}` : value
        continue
      }
    }
    out[key] = value
  }
  return out
}

/** Aplica truncación de texto a las entradas kb_topic del atendido[]. */
function sanitizeAtendido(atendido: Atendido[]): Atendido[] {
  return atendido.map(a =>
    a.kind === 'kb_topic' ? { ...a, texto: truncateTexto(a.texto) } : a,
  )
}

/** Aplica redacción mínima de PII a los args de cada crmAction. */
function sanitizeCrmActions(crmActions: CrmActionRegistrada[]): CrmActionRegistrada[] {
  return crmActions.map(c => ({ ...c, args: redactArgs(c.args) }))
}

/**
 * D-11/D-12/D-17: ÚNICO punto que funde el working state final con los efectos
 * persistibles del turno. Envuelve serializeState (NO reimplementa) y añade SOLO
 * el subset persistido del ledger ({atendido, crmActions} = TurnLedgerDims).
 *
 * D-17: commitTurn persiste solo {atendido,crmActions}; el ledger COMPLETO
 * (incl. modeTransition/comprehension/messagesSent) va a observability en Plan 04.
 * Por eso modeTransition/comprehension/messagesSent del ledger NO entran en el retorno.
 *
 * Defensas: texto de kb_topic truncado a 500 chars (T-ledger-01); phone/email en
 * crmActions.args redactados (T-ledger-02). La observabilidad CRM completa se difiere
 * al standalone #2 (D-08) — aquí solo redacción mínima defensiva.
 */
export function commitTurn(
  workingState: AgentState,
  ledger: TurnLedger,
): {
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  intentsVistos: string[]
  templatesEnviados: string[]
  accionesEjecutadas: AccionRegistrada[]
  turnLedgerDims: TurnLedgerDims
} {
  const serialized = serializeState(workingState)
  return {
    ...serialized,
    turnLedgerDims: {
      atendido: sanitizeAtendido(ledger.atendido),
      crmActions: sanitizeCrmActions(ledger.crmActions),
    },
  }
}

// ============================================================================
// Action Helpers
// ============================================================================

/** Check if an action type has been executed */
export function hasAction(acciones: AccionRegistrada[], tipo: TipoAccion): boolean {
  return acciones.some(a => a.tipo === tipo)
}
