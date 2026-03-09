/**
 * Somnio Sales Agent v3 — Type Definitions
 *
 * 3-concept architecture: Intents (client) / Actions (bot) / Signals (system)
 * Gates computed every turn, never stored.
 *
 * State machine types: TipoAccion, AccionRegistrada, Phase, SystemEvent
 */

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

  /** Timing */
  enCapturaSilenciosa: boolean
  turnCount: number
}

// ============================================================================
// Gates (computed every turn, never stored)
// ============================================================================

export interface Gates {
  datosOk: boolean
  datosCompletos: boolean
  packElegido: boolean
}

// ============================================================================
// Decision (Capa 6 output)
// ============================================================================

export type DecisionAction =
  | 'respond'
  | 'silence'
  | 'handoff'
  | 'create_order'

export interface Decision {
  action: DecisionAction
  /** Original TipoAccion from transition table (carried through, not reverse-engineered) */
  tipoAccion?: TipoAccion
  templateIntents?: string[]
  extraContext?: Record<string, string>
  timerSignal?: TimerSignal
  reason: string
  /** Enter silent capture mode after this decision */
  enterCaptura?: boolean
}

// ============================================================================
// Timer Signals
// ============================================================================

export interface TimerSignal {
  type: 'start' | 'cancel' | 'reevaluate'
  level?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'silence'
  reason?: string
}

// ============================================================================
// Response Result (Capa 7 output)
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
// Two-Track Decision Types (tt-01)
// ============================================================================

/** Sales track output — WHAT TO DO (pure state machine, no templates) */
export interface SalesTrackOutput {
  accion?: TipoAccion
  enterCaptura?: boolean
  timerSignal?: TimerSignal
  reason: string
}

/** Response track output — WHAT TO SAY (template engine) */
export interface ResponseTrackOutput {
  messages: ProcessedMessage[]
  templateIdsSent: string[]
  salesTemplateIntents: string[]   // templates from sales action
  infoTemplateIntents: string[]    // templates from informational intent
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
  packSeleccionado: string | null
  /** Acciones ejecutadas as first-class field (quick-009) */
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
  /** Acciones ejecutadas as first-class field (quick-009) */
  accionesEjecutadas: AccionRegistrada[]

  intentInfo: {
    intent: string
    confidence: number
    secondary?: string
    reasoning?: string
    timestamp: string
  }

  totalTokens: number
  silenceDetected: boolean
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
    enterCaptura?: boolean
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
    is_acknowledgment: boolean
  }
  ingestInfo?: {
    action: string
    systemEvent?: { type: string; [k: string]: unknown }
  }
}

// ============================================================================
// State Machine Types (sm-01)
// ============================================================================

export type TipoAccion =
  | 'ofrecer_promos'
  | 'mostrar_confirmacion'
  | 'pedir_datos'
  | 'crear_orden'
  | 'handoff'
  | 'ask_ofi_inter'
  | 'silence'
  | 'rechazar'
  | 'no_interesa'
  | 'cambio'

export interface AccionRegistrada {
  tipo: TipoAccion
  turno: number
  origen: 'bot' | 'timer' | 'auto_trigger' | 'ingest'
}

export type Phase =
  | 'initial'
  | 'capturing_data'
  | 'promos_shown'
  | 'confirming'
  | 'order_created'
  | 'closed'

export type SystemEvent =
  | { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 }
  | { type: 'ingest_complete'; result: 'datos_completos' | 'ciudad_sin_direccion' }
  | { type: 'readiness_check'; ready_for: 'promos' | 'confirmacion' }

export interface TransitionResult {
  action: TipoAccion
  templateIntents?: string[]
  extraContext?: Record<string, string>
  timerSignal?: TimerSignal
  enterCaptura?: boolean
  reason: string
}

export type GuardResult =
  | { blocked: true; decision: Decision }
  | { blocked: false }
