/**
 * Sandbox Type Definitions
 * Phase 15: Agent Sandbox
 *
 * Types for the sandbox testing UI that simulates agent conversations
 * without affecting real data.
 */

import type { IntentResult, SessionState, ToolCallRecord, PackSelection, ModelTokenEntry } from '@/lib/agents/types'
import type { MessageClassification } from '@/lib/agents/somnio/message-classifier'
import type { AccionRegistrada } from '@/lib/agents/somnio-v3/types'
import type { SubLoopDebugPayload } from '@/lib/agents/somnio-v4/sub-loop/debug-payload'
import type { TurnLedgerDims } from '@/lib/agents/somnio-v4/types'

/**
 * Message in sandbox conversation
 */
export interface SandboxMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string // ISO string, always show HH:MM:SS
}

/**
 * Tool execution with full details for debugging
 */
export interface ToolExecution {
  name: string
  input: Record<string, unknown>
  result?: {
    success: boolean
    data?: unknown
    error?: { code: string; message: string }
  }
  durationMs?: number
  timestamp: string
  /** Execution mode for CRM tools: dry-run (mock) or live (real DB) */
  mode?: 'dry-run' | 'live'
}

/**
 * Intent detection info for debugging
 */
export interface IntentInfo {
  intent: string
  confidence: number
  /**
   * 0..1 scale confidence (D-10) — Plan 12.1 calibration uses this for sub-loop trigger.
   * Populated only by somnio-v4 path; v3/godentist/recompra omit. Surfaced in debug panel
   * separately from legacy `confidence` (0-100) — useful for diagnosing escalation behavior.
   * Standalone: somnio-sales-v4-runtime-wiring / Plan 07 debug surface.
   */
  intent_confidence?: number
  alternatives?: { intent: string; confidence: number }[]
  reasoning?: string
  timestamp: string
}

/**
 * Token usage info for debugging
 */
export interface TokenInfo {
  turnNumber: number
  tokensUsed: number // Total (backward compatible)
  /** Per-model breakdown (Phase 15.6) */
  models: ModelTokenEntry[]
  timestamp: string
}

// ============================================================================
// Debug Panel v4.0 Types (standalone/debug-panel-v4)
// ============================================================================

/** Message category classification result */
export interface DebugClassification {
  category: 'RESPONDIBLE' | 'SILENCIOSO' | 'HANDOFF'
  reason: string
  rulesChecked: { rule1: boolean; rule1_5: boolean; rule2: boolean; rule3: boolean }
  confidenceThreshold?: number
}

/** Block composition debug info */
export interface DebugBlockComposition {
  newTemplates: { id: string; intent: string; priority: string }[]
  pendingFromPrev: { id: string; priority: string }[]
  composedBlock: { id: string; name: string; priority: string; status: 'sent' | 'dropped' | 'pending' }[]
  overflow: { pending: number; dropped: number }
}

/** No-repetition filter debug info */
export interface DebugNoRepetition {
  enabled: boolean
  perTemplate: {
    templateId: string
    templateName: string
    level1: 'pass' | 'filtered' | null
    level2: 'ENVIAR' | 'NO_ENVIAR' | 'PARCIAL' | null
    level3: 'ENVIAR' | 'NO_ENVIAR' | null
    result: 'sent' | 'filtered'
    filteredAtLevel?: 1 | 2 | 3
  }[]
  summary: { surviving: number; filtered: number }
}

/** Ofi Inter detection debug info */
export interface DebugOfiInter {
  route1: { detected: boolean; pattern?: string }
  route2: { detected: boolean; city?: string }
  route3: { detected: boolean; city?: string; isRemote?: boolean }
}

/** Pre-send check debug info */
export interface DebugPreSendCheck {
  perTemplate: { index: number; checkResult: 'ok' | 'interrupted'; newMessageFound?: boolean }[]
  interrupted: boolean
  pendingSaved: number
}

/** Template selection debug info */
export interface DebugTemplateSelection {
  intent: string
  visitType: 'primera_vez' | 'siguientes'
  loadedCount: number
  alreadySentCount: number
  selectedCount: number
  isRepeated: boolean
  cappedByNoRep: boolean
}

/** Transition validation debug info */
export interface DebugTransitionValidation {
  allowed: boolean
  reason?: string
  autoTrigger?: string
}

/** Orchestration debug info */
export interface DebugOrchestration {
  nextMode: string
  previousMode: string
  modeChanged: boolean
  shouldCreateOrder: boolean
  templatesCount: number
  /**
   * D-22 (standalone somnio-v4-crm-subloop Plan 06): paridad sandbox del gate CRM.
   * El sandbox v4 corre el sub-loop CRM con mutation-tools SIMULADAS (no DB write) y
   * expone aquí cuántas crmActions derivó + si la mutación simulada "tuvo éxito".
   * OPCIONALES — solo el engine v4 los puebla; los siblings (v2/v3/recompra) los
   * dejan undefined (campos aditivos, Regla-6-safe).
   */
  crmActionsCount?: number
  orderCreated?: boolean
}

/** Ingest details debug info */
export interface DebugIngestDetails {
  classification?: 'datos' | 'pregunta' | 'mixto' | 'irrelevante'
  classificationConfidence?: number
  extractedFields?: { field: string; value: string }[]
  action?: 'silent' | 'respond' | 'complete' | 'ask_ofi_inter'
  implicitYes?: { triggered: boolean; dataFound: boolean; modeTransition?: string }
  systemEvent?: { type: string; [k: string]: unknown }
}

/** Disambiguation log debug info */
export interface DebugDisambiguationLog {
  logged: boolean
  topIntents?: { intent: string; confidence: number }[]
  templatesSent?: number
  pendingCount?: number
  historyTurns?: number
}

// NOTE: DebugParaphrasing DEFERRED — no recordParaphrasing() method or
// engine capture exists yet. Will be added when paraphrasing feature is
// instrumented in the agent pipeline.

/**
 * Debug information for a single turn
 */
export interface DebugTurn {
  turnNumber: number
  intent?: IntentInfo
  tools: ToolExecution[]
  tokens: TokenInfo
  stateAfter: SandboxState
  // Debug Panel v4.0 fields
  classification?: DebugClassification
  blockComposition?: DebugBlockComposition
  noRepetition?: DebugNoRepetition
  ofiInter?: DebugOfiInter
  preSendCheck?: DebugPreSendCheck
  timerSignals?: { type: 'start' | 'reevaluate' | 'cancel'; level?: string; reason?: string }[]
  templateSelection?: DebugTemplateSelection
  transitionValidation?: DebugTransitionValidation
  orchestration?: DebugOrchestration
  ingestDetails?: DebugIngestDetails
  disambiguationLog?: DebugDisambiguationLog
  // paraphrasing?: DebugParaphrasing — DEFERRED (no data pipeline)
  /** Two-track decision debug (tt-02) */
  salesTrack?: { accion?: string; reason: string; enterCaptura?: boolean }
  responseTrack?: { salesIntents: string[]; infoIntents: string[]; totalMessages: number }
  // ============================================================================
  // V4 extensions (standalone: somnio-sales-v4-runtime-wiring / Plan 03 / D-20)
  // Opcionales — solo populados cuando v4 path activo. NO crear tab nueva en UI;
  // la UI debug renderiza condicional si campos existen.
  // Mapping efectivo lo wirea Plan 06 cuando V4AgentOutput suba esta metadata
  // del observability event al top-level del agent output.
  // ============================================================================
  /** Sub-loop trigger reason (D-02) — undefined si no se invocó sub-loop */
  subLoopReason?: 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre'
  /** KB pgvector retrieval results del sub-loop (topic + similarity score) */
  kbHits?: Array<{ topic: string; score: number }>
  /** NUNCA-decir rule matches sobre el output del sub-loop */
  nuncaDecirMatches?: string[]
  /** Confidence threshold actual (platform_config.somnio_v4_low_confidence_threshold — D-11) */
  threshold?: number
  /**
   * Sub-loop debug payload (D-02 v4-subloop-debug-view standalone).
   * Populated by engine-v4.ts when V4AgentOutput.subLoopDebug is set.
   * Undefined when sub-loop did not fire OR for non-v4 agents.
   */
  subLoopDebug?: SubLoopDebugPayload
  /**
   * 2026-05-25: tiempo TOTAL desde click "enviar" en el browser hasta que llegó la
   * respuesta JSON (incluye red, cold start Vercel, server-side completo). Wired en
   * sandbox-layout.tsx.handleSendMessage. Único campo agregado client-side post-fetch.
   */
  clientLatencyMs?: number
}

/**
 * Ingest status for sandbox visibility (Phase 15.5)
 *
 * Tracks the state of silent data accumulation during collecting_data mode.
 */
export interface IngestStatus {
  /** Whether ingest is currently active */
  active: boolean
  /** When ingest mode started (ISO string) */
  startedAt: string | null
  /** When first data message was received (ISO string) */
  firstDataAt: string | null
  /** List of fields that have been accumulated */
  fieldsAccumulated: string[]
  /** Timer type based on data status: 'partial' (6min) or 'no_data' (10min) */
  timerType: 'partial' | 'no_data' | null
  /** When timer expires (ISO string) - for display only, not enforced in sandbox */
  timerExpiresAt: string | null
  /** Last classification result for debug visibility */
  lastClassification?: MessageClassification
  /** Timeline of all classifications (Phase 15.6) */
  timeline: IngestTimelineEntry[]
}

/**
 * Sandbox session state (in-memory, not persisted to DB)
 */
export interface SandboxState {
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: PackSelection | null
  /** Acciones ejecutadas as first-class field (quick-009) */
  accionesEjecutadas: AccionRegistrada[]
  /**
   * somnio-v4-turn-ledger Plan 04 (Task 2 / W-3): subset persistido del ledger del
   * turno ({atendido, crmActions}), tipado FUERTE con TurnLedgerDims para que el
   * state-tab del Plan 05 pueda narrowing por `a.kind === 'kb_topic'` sin unknown.
   * Opcional — sesiones sandbox pre-ledger lo dejan undefined.
   */
  turnLedgerDims?: TurnLedgerDims
  /** Ingest tracking for debug visibility (Phase 15.5) */
  ingestStatus?: IngestStatus
}

/**
 * Saved sandbox session for localStorage
 */
export interface SavedSandboxSession {
  id: string
  name: string
  agentId: string
  messages: SandboxMessage[]
  state: SandboxState
  debugTurns: DebugTurn[]
  totalTokens: number
  createdAt: string
  updatedAt: string
}

/**
 * Active sandbox session (in-memory during testing)
 */
export interface ActiveSandboxSession {
  agentId: string
  messages: SandboxMessage[]
  state: SandboxState
  debugTurns: DebugTurn[]
  totalTokens: number
  isTyping: boolean
}

/**
 * Result from SandboxEngine.processMessage()
 */
export interface SandboxEngineResult {
  success: boolean
  /** Response messages (may be multiple for sequences) */
  messages: string[]
  /** Debug info for this turn */
  debugTurn: DebugTurn
  /** New state after processing */
  newState: SandboxState
  /** Error if failed */
  error?: { code: string; message: string }
  /** Timer control signal from SandboxEngine (Phase 15.7) */
  timerSignal?: TimerSignal
}

// ============================================================================
// CRM Agent Types (Phase 15.6)
// ============================================================================

/** Execution mode for CRM agents in sandbox */
export type CrmExecutionMode = 'dry-run' | 'live'

/** State of a CRM agent in the sandbox */
export interface CrmAgentState {
  agentId: string
  name: string
  description: string
  enabled: boolean
  mode: CrmExecutionMode
}

/** Result from a CRM agent command execution */
export interface CrmCommandResult {
  success: boolean
  agentId: string
  commandType: string
  data?: Record<string, unknown>
  toolCalls: ToolExecution[]
  tokensUsed: ModelTokenEntry[]
  mode: CrmExecutionMode
  timestamp: string
}

// ============================================================================
// Ingest Timeline Types (Phase 15.6)
// ============================================================================

/** A single entry in the ingest timeline */
export interface IngestTimelineEntry {
  /** Message content (truncated for display) */
  message: string
  /** Classification result */
  classification: 'datos' | 'pregunta' | 'mixto' | 'irrelevante'
  /** Classification confidence */
  confidence: number
  /** Fields extracted in this message (if any) */
  fieldsExtracted: string[]
  /** Timestamp of classification */
  timestamp: string
}

// ============================================================================
// Multi-Panel Debug Types (Phase 15.6)
// ============================================================================

/** Available debug panel tab IDs */
export type DebugPanelTabId =
  | 'pipeline'
  | 'classify'
  | 'bloques'
  | 'tools'
  | 'state'
  | 'tokens'
  | 'ingest'
  | 'config'
  | 'subloop'
  /**
   * Standalone: debounce-interruption-system-v2 / Plan 06 (D-11 + LOCK-08).
   * Renders the 14 D-17-extended lock-lifecycle events for the selected
   * session+turn (lock_acquired → checkpoints → lock_released / msg_aborted /
   * lock_orphan_swept_by_cron). Post-turn fetch (RESEARCH Open Question 3 —
   * NO live SSE).
   */
  | 'interruption'

/** Response delay in ms for sandbox message delays (slider-based, replaces presets) */

/** Configuration for a debug panel tab */
export interface DebugPanelTab {
  id: DebugPanelTabId
  label: string
  visible: boolean
}

// ============================================================================
// Timer Types (Phase 15.7)
// ============================================================================

/**
 * Timer control signal emitted by SandboxEngine.
 * Tells the frontend timer simulator what to do.
 */
export interface TimerSignal {
  type: 'start' | 'reevaluate' | 'cancel'
  /** Suggested timer level (from IngestManager analysis) */
  suggestedLevel?: number
  /** Reason for cancel signal */
  reason?: string
}

/**
 * Current state of the timer simulator (for UI consumption).
 */
export interface TimerState {
  active: boolean
  level: number | null
  levelName: string
  remainingMs: number
  paused: boolean
}

/**
 * Timer configuration: duration in seconds per level.
 */
export interface TimerConfig {
  levels: Record<number, number> // levelId -> seconds
}

/**
 * Timer speed preset name.
 */
export type TimerPreset = 'real' | 'rapido' | 'instantaneo'

// ============================================================================
// Legacy Timer Types (used by production agent-timers.ts only)
// Sandbox no longer uses these — sandbox timer is pure countdown (quick-013)
// ============================================================================

/** @deprecated Production only — sandbox uses systemEvent pipeline */
export interface TimerAction {
  type: 'send_message' | 'transition_mode' | 'create_order'
  message?: string
  targetMode?: string
  orderConfig?: { valor: number; pack?: string }
}

/** @deprecated Production only — sandbox uses systemEvent pipeline */
export interface TimerEvalContext {
  fieldsCollected: string[]
  totalFields: number
  currentMode: string
  packSeleccionado: string | null
  promosOffered: boolean
}

/** @deprecated Production only — sandbox uses systemEvent pipeline */
export interface TimerLevelConfig {
  id: number
  name: string
  defaultDurationS: number
  evaluate: (ctx: TimerEvalContext) => boolean
  buildAction: (ctx: TimerEvalContext) => TimerAction
}
