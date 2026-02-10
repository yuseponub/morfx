/**
 * Unified Engine Type Definitions
 * Phase 16.1: Engine Unification - Plan 01
 *
 * Defines all adapter interfaces (5 ports), engine input/output,
 * config, and shared state shapes for the unified engine.
 *
 * The unified engine uses the Ports & Adapters (Hexagonal Architecture) pattern:
 * - Sandbox implements adapters with in-memory state
 * - Production implements adapters with DB (SessionManager) + Inngest + WhatsApp
 *
 * All business logic (intents, transitions, ingest, templates, orders) lives
 * in the agent (Somnio components). The engine is a thin I/O runner.
 */

import type {
  SessionState,
  PackSelection,
  IntentRecord,
  ModelTokenEntry,
  ClaudeModel,
  AgentSession,
  SessionStatus,
} from '../types'
import type { TimerSignal } from '../../sandbox/types'

// ============================================================================
// Shared State Shapes
// ============================================================================

/**
 * Shared session shape that both sandbox in-memory state and production DB session
 * can satisfy without casting.
 *
 * - **Production:** AgentSessionWithState from session-manager.ts satisfies this directly
 *   (it extends AgentSession which has all these fields, plus `.state`)
 * - **Sandbox:** The SandboxStorageAdapter builds a mock object matching this shape
 *   from SandboxState (in-memory).
 *
 * Key invariant: `state.intents_vistos` must contain intents BEFORE the current
 * turn's intent is added. This ensures TemplateManager correctly detects
 * primera_vez vs siguientes. See Research Pitfall #2.
 */
export interface AgentSessionLike {
  id: string
  agent_id: string
  conversation_id: string
  contact_id: string
  workspace_id: string
  version: number
  status: SessionStatus
  current_mode: string
  state: SessionState
}

// ============================================================================
// Engine Input / Output
// ============================================================================

/**
 * Input for UnifiedEngine.processMessage().
 *
 * Covers all fields needed by both SandboxEngine.processMessage() and
 * SomnioEngine.processMessage(). Environment-specific fields are optional.
 */
export interface EngineInput {
  /** Session ID (sandbox generates one; production comes from DB) */
  sessionId: string
  /** Conversation ID (for session lookup in production) */
  conversationId: string
  /** Contact ID */
  contactId: string
  /** Customer message content */
  message: string
  /** Workspace ID for isolation */
  workspaceId: string
  /** Conversation history (sandbox passes in-memory; production reads from DB via StorageAdapter) */
  history: { role: 'user' | 'assistant'; content: string }[]
  /** Force a specific intent (used by timer simulator in sandbox and Inngest workflows in production) */
  forceIntent?: string
  /** Current turn number (sandbox tracks this; production derives from DB) */
  turnNumber?: number
  /** Phone number for WhatsApp message sending (production only) */
  phoneNumber?: string
}

/**
 * Unified output from UnifiedEngine.processMessage().
 *
 * Covers all fields from both SandboxEngineResult and SomnioEngineResult.
 * Environment-specific fields use `any` to keep the engine types agnostic:
 * - `newState`: Sandbox returns SandboxState, production doesn't need it
 * - `debugTurn`: Sandbox returns DebugTurn, production doesn't need it
 */
export interface EngineOutput {
  success: boolean
  /** Response messages to send (sandbox collects strings; production sends via WhatsApp) */
  messages: string[]
  /** New state after processing (sandbox: SandboxState; production: unused) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newState?: any
  /** Debug info for this turn (sandbox: DebugTurn; production: unused) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debugTurn?: any
  /** Timer signal for frontend simulator (sandbox) or logging (production) */
  timerSignal?: TimerSignal
  /** Whether an order was created */
  orderCreated?: boolean
  /** Created order ID */
  orderId?: string
  /** Contact ID (new or existing, from order creation) */
  contactId?: string
  /** New session mode after processing */
  newMode?: string
  /** Total tokens used in this turn */
  tokensUsed?: number
  /** Session ID (echoed back for production callers) */
  sessionId?: string
  /** Number of messages sent (production: via WhatsApp) */
  messagesSent?: number
  /** Response text (production backward compat with SomnioEngineResult.response) */
  response?: string
  /** Error details if processing failed */
  error?: {
    code: string
    message: string
    retryable?: boolean
  }
}

// ============================================================================
// Engine Configuration
// ============================================================================

/**
 * Per-environment configuration injected by the caller.
 *
 * - **Sandbox:** Populated from frontend presets (sliders, toggles)
 * - **Production:** Populated from workspace_agent_config or hardcoded defaults
 *
 * The engine does NOT read config from DB -- the caller resolves config before
 * constructing the engine.
 */
export interface EngineConfig {
  /** Workspace ID for DB operations and isolation */
  workspaceId: string
  /** Timer durations per level (L0-L4) in seconds. Sandbox uses presets; production uses defaults. */
  timerDurations?: Record<number, number>
  /** Response speed multiplier (1.0 = normal). Sandbox uses presets; production is always 1.0. */
  responseSpeed?: number
  /** CRM agent modes (enable/disable + dry-run/live). Sandbox only for now. */
  crmModes?: Array<{ agentId: string; mode: 'dry-run' | 'live' }>
}

// ============================================================================
// Adapter Bundle
// ============================================================================

/**
 * Bundle of all 5 adapter interfaces.
 *
 * Constructed by environment-specific factory functions:
 * - `createSandboxAdapters()` for sandbox (in-memory state, returns debug)
 * - `createProductionAdapters()` for production (DB state, Inngest events, WhatsApp)
 *
 * The UnifiedEngine receives this bundle in its constructor.
 */
export interface EngineAdapters {
  storage: StorageAdapter
  timer: TimerAdapter
  messaging: MessagingAdapter
  orders: OrdersAdapter
  debug: DebugAdapter
}

// ============================================================================
// 1. Storage Adapter
// ============================================================================

/**
 * Reads and writes session state.
 *
 * - **Sandbox:** In-memory. State is passed in, returned as new state.
 *   The `getSession()` call returns a mock AgentSessionLike built from SandboxState.
 *   IMPORTANT: intentsVistos must be populated BEFORE the current intent (Pitfall #2).
 * - **Production:** DB via SessionManager. Reads/writes to agent_sessions + session_state.
 *   Turn recording persists to agent_turns table.
 */
export interface StorageAdapter {
  /** Get session by ID. Sandbox builds mock from in-memory state; production reads DB. */
  getSession(sessionId: string): Promise<AgentSessionLike>

  /** Get or create session for a conversation. Used by production to find/create session. */
  getOrCreateSession(conversationId: string, contactId: string): Promise<AgentSessionLike>

  /** Get conversation history. Sandbox returns in-memory array; production reads from agent_turns. */
  getHistory(sessionId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]>

  /** Save state updates. Sandbox mutates in-memory state; production writes to session_state. */
  saveState(sessionId: string, updates: Record<string, unknown>): Promise<void>

  /** Update session mode with optimistic locking. */
  updateMode(sessionId: string, version: number, newMode: string): Promise<void>

  /**
   * Record a conversation turn.
   * - Sandbox: no-op (debug adapter tracks this)
   * - Production: writes to agent_turns table
   */
  addTurn(params: {
    sessionId: string
    turnNumber: number
    role: 'user' | 'assistant'
    content: string
    intentDetected?: string
    confidence?: number
    tokensUsed?: number
  }): Promise<void>

  /** Add an intent to intents_vistos in state. */
  addIntentSeen(sessionId: string, intent: string): Promise<void>

  /** Hand off session to human agent. Sets status to 'handed_off'. */
  handoff(sessionId: string, version: number): Promise<void>
}

// ============================================================================
// 2. Timer Adapter
// ============================================================================

/**
 * Handles timer signals and events.
 *
 * - **Sandbox:** Accumulates TimerSignal objects in instance state.
 *   The engine reads the last signal via `getLastSignal()` and includes it in EngineOutput.
 *   Supports the two-step signal pattern: cancel (ingest) + start (promo). See Pitfall #3.
 * - **Production:** Emits Inngest events for real timer workflows.
 *   The optional lifecycle hooks (`onCustomerMessage`, `onModeTransition`, etc.)
 *   emit specific Inngest events at the right points in the flow.
 */
export interface TimerAdapter {
  /** Accumulate or emit a timer signal. Sandbox stores it; production may log it. */
  signal(signal: TimerSignal): void

  /** Emit customer message event (production: Inngest event for timer cancellation). */
  onCustomerMessage?(sessionId: string, conversationId: string, content: string): Promise<void>

  /** Emit mode transition event (production: Inngest event for timer workflows). */
  onModeTransition?(sessionId: string, previousMode: string, newMode: string): Promise<void>

  /** Emit ingest started event (production: Inngest event to start data collection timer). */
  onIngestStarted?(session: AgentSessionLike, hasPartialData: boolean): Promise<void>

  /** Emit ingest completed event (production: Inngest event to cancel data collection timer). */
  onIngestCompleted?(sessionId: string, reason: string): Promise<void>

  /** Get the last accumulated timer signal. Sandbox uses this for EngineOutput.timerSignal. */
  getLastSignal(): TimerSignal | undefined
}

// ============================================================================
// 3. Messaging Adapter
// ============================================================================

/**
 * Sends response messages to the customer.
 *
 * - **Sandbox:** Collects messages as strings. The frontend applies delays based on responseSpeed.
 *   Returns messagesSent = messages.length.
 * - **Production:** Uses MessageSequencer to calculate real delays, write to DB, and send via WhatsApp.
 *   Returns actual count of messages sent via 360dialog API.
 */
export interface MessagingAdapter {
  /** Send response messages. Returns count of messages actually sent. */
  send(params: {
    sessionId: string
    conversationId: string
    messages: string[]
    /** WhatsApp templates from orchestrator result */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    templates?: any[]
    /** Intent that triggered these messages (for pending message merging) */
    intent?: string
    /** Workspace ID for isolation */
    workspaceId: string
    /** Contact ID (production: for WhatsApp sending) */
    contactId?: string
    /** Phone number (production: for WhatsApp sending) */
    phoneNumber?: string
  }): Promise<{ messagesSent: number }>
}

// ============================================================================
// 4. Orders Adapter
// ============================================================================

/**
 * Creates contacts and orders when the customer confirms a purchase.
 *
 * - **Sandbox:** Routes through CrmOrchestrator with dry-run or live mode.
 *   Returns tool execution details with mode annotation for debug panel.
 * - **Production:** Uses OrderCreator for direct DB writes.
 *   Returns order ID and contact ID.
 */
export interface OrdersAdapter {
  /** Create a contact and order from captured data. */
  createOrder(
    data: {
      datosCapturados: Record<string, string>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      packSeleccionado: any
      workspaceId: string
      sessionId: string
    },
    mode?: 'dry-run' | 'live'
  ): Promise<{
    success: boolean
    orderId?: string
    contactId?: string
    /** Tool calls executed (sandbox: CRM agent tools with mode annotation) */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolCalls?: any[]
    /** Token usage from CRM agent calls */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokensUsed?: any[]
    error?: { message: string }
  }>
}

// ============================================================================
// 5. Debug Adapter
// ============================================================================

/**
 * Records debug information for each turn.
 *
 * - **Sandbox:** Builds a complete DebugTurn object with IntentInfo, ToolExecutions,
 *   TokenInfo (per-model breakdown), and stateAfter. Returned in EngineOutput.debugTurn.
 * - **Production:** Logs debug info via the module logger. Does not accumulate or return.
 *   `getDebugTurn()` returns undefined.
 */
export interface DebugAdapter {
  /** Record intent detection result. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordIntent(info: any): void

  /** Record tool executions. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTools(tools: any[]): void

  /** Record token usage. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordTokens(tokens: any): void

  /** Record state snapshot after processing. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recordState(state: any): void

  /** Get the accumulated debug turn. Sandbox returns DebugTurn; production returns undefined. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDebugTurn(turnNumber: number): any | undefined
}
