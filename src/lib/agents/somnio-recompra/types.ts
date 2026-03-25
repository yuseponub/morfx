/**
 * Somnio Recompra Agent — Type Definitions
 *
 * Fork of somnio-v3/types.ts — simplified for returning clients.
 * Removed: capturing_data phase, ofi inter actions, silent capture mode
 * Added: direccionConfirmada field, confirmar_direccion/preguntar_direccion actions
 * Simplified: only L3/L4/L5 timer levels, fewer TipoAccion variants
 */

import type { StateChanges } from './state'

// ============================================================================
// Agent State
// ============================================================================

export interface DatosCliente {
  nombre: string | null
  apellido: string | null
  telefono: string | null
  ciudad: string | null
  departamento: string | null
  direccion: string | null
  barrio: string | null
  correo: string | null
  indicaciones_extra: string | null
  cedula_recoge: string | null
}

export interface Negaciones {
  correo: boolean
  telefono: boolean
  barrio: boolean
  cedula_recoge: boolean
}

export interface AgentState {
  datos: DatosCliente
  pack: '1x' | '2x' | '3x' | null
  ofiInter: boolean
  negaciones: Negaciones

  /** History tracking */
  intentsVistos: string[]
  accionesEjecutadas: AccionRegistrada[]
  templatesMostrados: string[]

  /** Whether the client confirmed their preloaded address */
  direccionConfirmada: boolean
  turnCount: number
}

// ============================================================================
// Gates (computed every turn, never stored)
// ============================================================================

export interface Gates {
  datosCriticos: boolean
  datosCompletos: boolean
  packElegido: boolean
}

// ============================================================================
// Decision (output)
// ============================================================================

export type DecisionAction =
  | 'respond'
  | 'silence'
  | 'handoff'
  | 'create_order'

export interface Decision {
  action: DecisionAction
  /** Original TipoAccion from transition table */
  tipoAccion?: TipoAccion
  templateIntents?: string[]
  extraContext?: Record<string, string>
  timerSignal?: TimerSignal
  reason: string
}

// ============================================================================
// Timer Signals
// ============================================================================

export interface TimerSignal {
  type: 'start' | 'cancel' | 'reevaluate'
  level?: 'L3' | 'L4' | 'L5'
  reason?: string
}

// ============================================================================
// Response Result
// ============================================================================

export interface ProcessedMessage {
  templateId: string
  content: string
  contentType: 'texto' | 'imagen'
  delayMs: number
  priority: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'
}

export interface ResponseResult {
  messages: ProcessedMessage[]
  templateIdsSent: string[]
}

// ============================================================================
// Two-Track Decision Types
// ============================================================================

/** Sales track output — WHAT TO DO (pure state machine, no templates) */
export interface SalesTrackOutput {
  accion?: TipoAccion
  secondarySalesAction?: TipoAccion
  timerSignal?: TimerSignal
  reason: string
}

/** Response track output — WHAT TO SAY (template engine) */
export interface ResponseTrackOutput {
  messages: ProcessedMessage[]
  templateIdsSent: string[]
  salesTemplateIntents: string[]
  infoTemplateIntents: string[]
}

// ============================================================================
// V3 Agent Input/Output (interface with V3ProductionRunner)
// ============================================================================

export interface V3AgentInput {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  /** Serialized state from session_state */
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  /** Acciones ejecutadas as first-class field */
  accionesEjecutadas?: AccionRegistrada[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
}

export interface V3AgentOutput {
  success: boolean
  messages: string[]
  templates?: ProcessedMessage[]
  newMode?: string

  /** State updates for persistence */
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  /** Acciones ejecutadas as first-class field */
  accionesEjecutadas: AccionRegistrada[]

  intentInfo?: {
    intent: string
    confidence: number
    secondary?: string
    reasoning?: string
    timestamp: string
  }

  totalTokens: number
  shouldCreateOrder: boolean
  orderData?: {
    datosCapturados: Record<string, string>
    packSeleccionado: string | null
    valorOverride?: number
  }

  timerSignals: TimerSignal[]

  /** Debug info */
  decisionInfo?: {
    action: string
    reason: string
    templateIntents?: string[]
    gates?: Gates
  }
  /** Two-track debug: sales track output */
  salesTrackInfo?: {
    accion?: TipoAccion
    reason: string
  }
  /** Two-track debug: response track output */
  responseTrackInfo?: {
    salesTemplateIntents: string[]
    infoTemplateIntents: string[]
    totalMessages: number
  }
  classificationInfo?: {
    category: string
    sentiment: string
  }
}

// ============================================================================
// State Machine Types
// ============================================================================

export type TipoAccion =
  | 'ofrecer_promos'
  | 'mostrar_confirmacion'
  | 'crear_orden'
  | 'crear_orden_sin_promo'
  | 'crear_orden_sin_confirmar'
  | 'handoff'
  | 'silence'
  | 'rechazar'
  | 'no_interesa'
  | 'cambio'
  | 'retoma'
  | 'preguntar_direccion'

export interface AccionRegistrada {
  tipo: TipoAccion
  turno: number
  origen: 'bot' | 'timer' | 'auto_trigger'
  crmAction?: boolean
}

export type RecompraPhase =
  | 'initial'
  | 'promos_shown'
  | 'confirming'
  | 'order_created'
  | 'closed'

export type SystemEvent =
  | { type: 'timer_expired'; level: 3 | 4 | 5 }

/** Discriminated union for sales track events */
export type SalesEvent =
  | { type: 'user_message'; intent: string; category: string; changes: StateChanges }
  | { type: 'timer_expired'; level: 3 | 4 | 5 }

export type GuardResult =
  | { blocked: true; decision: Decision }
  | { blocked: false }
