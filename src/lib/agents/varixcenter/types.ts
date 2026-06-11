// Varixcenter — clonado de godentist-fb-ig (Standalone agent-varixcenter Wave 1).
// Keep in sync with godentist via clone, not divergent edits.
// Cambios vs godentist-fb-ig: TipoAccion refleja las 14 acciones del diseño §5
// (sin pedir_datos_con_sucursal ni retoma_inicial — Varixcenter no maneja sucursales).
/**
 * Varixcenter Appointment Agent — Type Definitions
 *
 * 3-concept architecture: Intents (client) / Actions (bot) / Signals (system)
 * Gates computed every turn, never stored.
 *
 * State machine types: TipoAccion, AccionRegistrada, Phase, SystemEvent, SalesEvent
 */

// ============================================================================
// Agent State
// ============================================================================

export interface DatosCliente {
  nombre: string | null
  telefono: string | null
  cedula: string | null
  /** Triage (no bloquea) — diseño §2 */
  ciudad: string | null
  /** Triage enum (decide template info) — diseño §2 */
  tipo_venas: 'grandes' | 'vasitos' | 'ambas' | null
  fecha_preferida: string | null
  fecha_vaga: string | null
  preferencia_jornada: 'manana' | 'tarde' | null
  horario_seleccionado: string | null
}

export interface AgentState {
  datos: DatosCliente

  /** History tracking */
  intentsVistos: string[]
  accionesEjecutadas: AccionRegistrada[]
  templatesMostrados: string[]

  /** Timing */
  turnCount: number
}

// ============================================================================
// Gates (computed every turn, never stored)
// ============================================================================

export interface Gates {
  /** ciudad + tipo_venas non-null (diseño §4 — triage, no bloquea) */
  triageCompleto: boolean
  /** nombre + telefono + cedula all non-null (D-05) */
  datosCriticos: boolean
  /** fecha_preferida non-null */
  fechaElegida: boolean
  /** horario_seleccionado non-null */
  horarioElegido: boolean
  /** datosCriticos + fechaElegida + horarioElegido */
  datosCompletos: boolean
}

// ============================================================================
// Decision (output from sales track)
// ============================================================================

export type DecisionAction =
  | 'respond'
  | 'silence'
  | 'handoff'
  | 'schedule_appointment'

export interface Decision {
  action: DecisionAction
  /** Original TipoAccion from transition table (carried through, not reverse-engineered) */
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
  level?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6'
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
// V3 Agent Input/Output (interface with UnifiedEngine)
// ============================================================================

export interface V3AgentInput {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  /** Serialized state from session_state */
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
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
  shouldScheduleAppointment: boolean
  appointmentData?: {
    datosCapturados: Record<string, string>
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

/** 14 acciones del diseño §5 — sin pedir_datos_con_sucursal ni retoma_inicial. */
export type TipoAccion =
  | 'pedir_datos'
  | 'pedir_datos_parcial'
  | 'pedir_fecha'
  | 'mostrar_disponibilidad'
  | 'mostrar_confirmacion'
  | 'agendar_cita'
  | 'invitar_agendar'
  | 'handoff'
  | 'silence'
  | 'no_interesa'
  | 'retoma_datos'
  | 'retoma_fecha'
  | 'retoma_horario'
  | 'retoma_confirmacion'

export interface AccionRegistrada {
  tipo: TipoAccion
  turno: number
  origen: 'bot' | 'timer' | 'auto_trigger'
  crmAction?: boolean
}

export type Phase =
  | 'initial'
  | 'capturing_data'
  | 'capturing_fecha'
  | 'showing_availability'
  | 'confirming'
  | 'appointment_registered'
  | 'closed'

export type SystemEvent =
  | { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: 'auto'; result: 'datos_criticos' }

/** Discriminated union for sales track events — compiler-enforced separation */
export type SalesEvent =
  | { type: 'user_message'; intent: string; category: string }
  | { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 }

export type GuardResult =
  | { blocked: true; decision: Decision }
  | { blocked: false }
