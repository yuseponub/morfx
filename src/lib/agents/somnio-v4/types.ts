/**
 * Somnio Sales Agent v4 — Type Definitions
 *
 * 3-concept architecture: Intents (client) / Actions (bot) / Signals (system)
 * Gates computed every turn, never stored.
 *
 * State machine types: TipoAccion, AccionRegistrada, Phase, SystemEvent, SalesEvent
 *
 * Standalone: somnio-sales-v4
 * Cloned mecánicamente desde somnio-v3/types.ts (D-24).
 * V3AgentInput/V3AgentOutput → V4AgentInput/V4AgentOutput.
 * NUEVO: Invocation discriminated union (D-15) — usado por orquestador en Plan 07.
 */

import type { StateChanges } from './state'
import type { SubLoopDebugPayload } from './sub-loop/debug-payload'

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

  /** Timing */
  enCapturaSilenciosa: boolean
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
  level?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8'
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
  secondarySalesAction?: TipoAccion
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
// V4 Agent Input/Output (interface with UnifiedEngine)
// ============================================================================

export interface V4AgentInput {
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
  /**
   * D-16/D-17 (standalone somnio-v4-turn-ledger): dims persistidas del turno previo,
   * restauradas al inicio para coherencia (atendido[] + crmActions[]). Opcional para
   * backward-compat con sandbox/tests que construyen V4AgentInput a mano + sesiones legacy.
   */
  turnLedgerDims?: TurnLedgerDims
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
  /**
   * Session id (agent_sessions row id).
   * Useful for orchestrator's idempotency keys (Pitfall 5) and crm-mutation-tools
   * invocations in Plan 07.
   * Optional for backward compat with sandbox / tests that build V4AgentInput by hand.
   */
  sessionId?: string
  /**
   * Standalone: debounce-interruption-system-v2 (D-03 + RESEARCH line 866).
   * Populated by V4ProductionRunner when v4 path is detected; null on:
   * (a) sandbox / test fixtures that build V4AgentInput by hand,
   * (b) Redis-unavailable fail-open path (RESEARCH Open Question 5).
   *
   * Type-only import avoids runtime circular imports.
   */
  lockHandle?: import('@/lib/agents/interruption-system-v2/lock').LockHandle | null
  /**
   * Standalone: debounce-interruption-system-v2 (D-16 — RPUSH self ALWAYS).
   * The exact JSON string the webhook RPUSHed into pending for this turn's own message.
   * Threaded from runner → sub-loop → V4MessagingAdapter.onFirstSendCompleted for LREM-self.
   */
  ownPendingEntryJson?: string | null
  /**
   * REVISION W3 — channel sourced from webhook event.data → EngineInput → V4AgentInput.
   * Plan 05 will use this in sub-loop's readAndClearPending call at acquire-time (combine D-16).
   */
  lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
  /**
   * REVISION W3 — identifier (phone for WhatsApp, external_subscriber_id for FB/IG).
   * Same source + nullability semantics as lockChannel.
   */
  lockIdentifier?: string | null
}

export interface V4AgentOutput {
  success: boolean
  messages: string[]
  templates?: ProcessedMessage[]
  newMode?: string

  /**
   * Error message surfaced when processUserMessage's catch block fires.
   * Standalone: somnio-sales-v4-runtime-wiring / debug Plan 07.
   * Engine-v4 lo usa para reemplazar el fallback engañoso "Timer event - no comprehension"
   * con el error real en debugTurn (visible en sandbox UI inspector).
   */
  errorMessage?: string

  /**
   * D-60: cuando outcome=no_match en el sub-loop, el agente flagga la sesión
   * con `requiresHuman=true` para que el inbox UI filtre/destaque y un operador
   * tome la conversación. El runner persiste esta flag (Plan 12 wires up
   * webhook-processor + storage adapter para que session_state.requires_human
   * refleje este valor).
   *
   * También se setea en handoff por timer-error (Plan 07 mapErrorOutputForTimer).
   */
  requiresHuman?: boolean

  /** State updates for persistence */
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  /** Acciones ejecutadas as first-class field (quick-009) */
  accionesEjecutadas: AccionRegistrada[]
  /**
   * D-17 (standalone somnio-v4-turn-ledger): subset persistible del ledger del turno
   * ({atendido, crmActions}). El runner v4 lo persiste en session_state.turn_ledger_dims
   * (Plan 03). Requerido en el output — commitTurn siempre lo produce (default vacío).
   */
  turnLedgerDims: TurnLedgerDims

  intentInfo?: {
    intent: string
    confidence: number
    /**
     * 0..1 scale (D-10) — Plan 12.1 calibration value used by `decideSubLoopReason`.
     * Different field from `confidence` (legacy 0-100). Surfaced in debug panel
     * to diagnose escalation decisions. Standalone: somnio-sales-v4-runtime-wiring / Plan 07.
     */
    intent_confidence?: number
    secondary?: string
    reasoning?: string
    timestamp: string
  }

  /**
   * Sub-loop diagnostic surface (Plan 03 D-20 TODO honored Plan 07 debug).
   * Populated by somnio-v4-agent.ts; consumed by engine-v4.ts debugTurn mapping.
   */
  subLoopReason?: 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre' | null
  /** platform_config.somnio_v4_low_confidence_threshold value used in this turn (D-11). */
  threshold?: number

  /**
   * Sub-loop debug payload (D-02 v4-subloop-debug-view standalone).
   * Populated by somnio-v4-agent.ts via onDebug callback passed to runSubLoop.
   * Undefined when sub-loop did not fire OR when caller did not wire onDebug.
   * Runtime-only — never persisted (D-07).
   */
  subLoopDebug?: SubLoopDebugPayload

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
  | 'crear_orden_sin_promo'
  | 'crear_orden_sin_confirmar'
  | 'handoff'
  | 'ask_ofi_inter'
  | 'confirmar_ofi_inter'
  | 'confirmar_cambio_ofi_inter'
  | 'silence'
  | 'rechazar'
  | 'no_interesa'
  | 'cambio'
  | 'retoma'
  | 'retoma_datos'
  | 'retoma_datos_parciales'
  | 'retoma_ofi_inter'
  | 'pedir_datos_quiero_comprar_implicito'
  | 'retoma_datos_implicito'

export interface AccionRegistrada {
  tipo: TipoAccion
  turno: number
  origen: 'bot' | 'timer' | 'auto_trigger'
  crmAction?: boolean
}

// ============================================================================
// Turn Ledger (standalone: somnio-v4-turn-ledger — D-03/D-04/D-11/D-15/D-17)
// ============================================================================

/**
 * D-03/D-15: discriminated union por `kind` de TODO lo que el turno "atendió".
 * 5 variantes. Precedente: Invocation / SystemEvent (discriminated union por `kind`/`type`).
 * D-15: `silence` SÍ se registra — un silencio deliberado es información del turno.
 * `silence` es SOLO un Atendido — NO un AccionRegistrada (no se mezcla con accionesEjecutadas).
 */
export type Atendido =
  | { kind: 'template_intent'; intent: string; templateIds: string[] }
  | { kind: 'sales_action'; accion: TipoAccion; templateIds: string[] }
  | { kind: 'kb_topic'; topic: string; confidence: number; texto: string; turno: number }
  | { kind: 'handoff'; reason: string }
  | { kind: 'silence' }

/**
 * D-04: shape EXACTO de una acción CRM registrada por el turno.
 * Diseñado para recibir el sub-loop orquestador del standalone #2 (no solo el
 * camino determinista de hoy). NO simplificar — `args`/`result`/`origen` anticipan
 * el orquestador grounded; hoy solo el camino determinista lo llena.
 */
export interface CrmActionRegistrada {
  tool: string
  args: Record<string, unknown>
  result: 'success' | 'failed' | 'cas_reject'
  code?: string
  origen: 'determinista' | 'rag' | 'timer'
  stageAtTime?: string
}

/**
 * D-17: subset PERSISTIDO en session_state.turn_ledger_dims. Distinto de TurnLedger
 * (registro completo): modeTransition/confidence/messagesSent NO se persisten —
 * se emiten a observability (Plan 04). El turno siguiente solo necesita
 * atendido+crmActions para coherencia.
 */
export interface TurnLedgerDims {
  atendido: Atendido[]
  crmActions: CrmActionRegistrada[]
}

/**
 * D-17: registro COMPLETO en memoria del turno. commitTurn persiste SOLO
 * {atendido,crmActions} (TurnLedgerDims) y emite el ledger COMPLETO (incl.
 * modeTransition/confidence/messagesSent) a observability en Plan 04. Ningún
 * campo es fantasma. Modelo conceptual: StateChanges (delta plano de efectos
 * del turno). NO confundir con SubLoopDebugPayload (runtime-only, nunca persiste).
 */
export interface TurnLedger {
  comprehension: { intent: string; secondary?: string; confidence: number }
  atendido: Atendido[]
  crmActions: CrmActionRegistrada[]
  modeTransition?: { from: string; to: string }
  messagesSent: number
}

export type Phase =
  | 'initial'
  | 'capturing_data'
  | 'promos_shown'
  | 'confirming'
  | 'order_created'
  | 'closed'

export type SystemEvent =
  | { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }
  | { type: 'auto'; result: 'datos_completos' }

/** Discriminated union for sales track events — compiler-enforced separation */
export type SalesEvent =
  | { type: 'user_message'; intent: string; category: string; changes: StateChanges }
  | { type: 'timer_expired'; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }

export type GuardResult =
  | { blocked: true; decision: Decision }
  | { blocked: false }

// ============================================================================
// V4 — net new (D-15 Invocation contract — RESEARCH §Pattern 3 / W-04 fix)
// ============================================================================

/**
 * Generic tool error shape for Invocation onError handlers.
 * Domain-specific errors (e.g., crm-mutation-tools' MutationResult) get
 * normalized to this shape by the orchestrator (Plan 07).
 */
export interface ToolError {
  code: string
  message: string
  retryable?: boolean
}

/**
 * Generic state-change payload that an Invocation handler can return to the
 * orchestrator. Plan 07 will refine this shape; the placeholder type keeps
 * Invocation usable from transitions.ts in Plan 06 + Plan 07.
 */
export type InvocationStateChanges = Partial<{
  datos: Partial<DatosCliente>
  pack: '1x' | '2x' | '3x' | null
  ofiInter: boolean
  accion: TipoAccion
  reason: string
  /** Free-form metadata (e.g., orderId, idempotencyKey result, etc.) */
  meta: Record<string, unknown>
}>

/**
 * Invocation = side-effect descriptor produced by the state machine when a
 * transition needs to call out (CRM mutation, knowledge fetch, sub-loop, etc.).
 *
 * D-15: 'execute' = fire-and-forget, idempotency-protected
 *       'come_back' = blocking, result merged back into state
 *
 * Plan 06 only declares the type. Plan 07 implements the orchestrator that
 * resolves invocations inline (W-04 fix — no separate dispatch layer).
 */
export type Invocation =
  | {
      kind: 'come_back'
      tool: string
      input: unknown
      onSuccess: (result: unknown) => InvocationStateChanges
      onError: (err: ToolError) => InvocationStateChanges
      timeoutMs: number
    }
  | {
      kind: 'execute'
      tool: string
      input: unknown
      idempotencyKey: string
      onError: 'log' | 'observability' | 'silent'
    }

/**
 * Sub-loop reason discriminator — D-02 triggers.
 * Re-exported also from sub-loop/output-schema.ts for consumer convenience.
 */
export type SubLoopReason = 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre'
