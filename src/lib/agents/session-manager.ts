/**
 * Session Manager
 * Phase 13: Agent Engine Core - Plan 02
 *
 * Handles session CRUD operations with optimistic locking.
 * All database operations use admin client to bypass RLS
 * (workspace isolation enforced via explicit workspace_id filters).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  AgentSession,
  AgentTurn,
  SessionState,
  TurnRole,
  ToolCallRecord,
  IntentRecord,
} from './types'
import {
  VersionConflictError,
  SessionError,
  SessionNotFoundError,
} from './errors'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('session-manager')

// ============================================================================
// Types for Session Manager Operations
// ============================================================================

/** Parameters for creating a new session */
export interface CreateSessionParams {
  agentId: string
  conversationId: string
  contactId: string
  workspaceId: string
  initialMode?: string
  initialState?: Partial<Omit<SessionState, 'session_id' | 'updated_at'>>
}

/** Parameters for adding a turn */
export interface AddTurnParams {
  sessionId: string
  turnNumber: number
  role: TurnRole
  content: string
  intentDetected?: string | null
  confidence?: number | null
  toolsCalled?: ToolCallRecord[]
  tokensUsed?: number
}

/** Parameters for updating session with version check */
export interface UpdateSessionParams {
  currentMode?: string
  status?: AgentSession['status']
  lastActivityAt?: string
}

/** Session with state combined */
export interface AgentSessionWithState extends AgentSession {
  state: SessionState
}

// ============================================================================
// Helper: Default Session State Factory
// ============================================================================

/**
 * Create a default SessionState with all fields initialized.
 * Single source of truth for session state construction.
 */
function createDefaultSessionState(sessionId: string): SessionState {
  return {
    session_id: sessionId,
    intents_vistos: [],
    templates_enviados: [],
    datos_capturados: {},
    pack_seleccionado: null,
    proactive_started_at: null,
    first_data_at: null,
    min_data_at: null,
    ofrecer_promos_at: null,
    updated_at: new Date().toISOString(),
  }
}

// ============================================================================
// Session Manager Class
// ============================================================================

/**
 * Manages agent sessions in the database.
 *
 * Uses optimistic locking via version column:
 * 1. Read session with current version
 * 2. Make changes in memory
 * 3. Write back with version check
 * 4. If version mismatch, throw VersionConflictError
 *
 * Caller should catch VersionConflictError and retry with fresh data.
 */
export class SessionManager {
  private supabase = createAdminClient()

  // ============================================================================
  // Session CRUD
  // ============================================================================

  /**
   * Create a new session for a conversation.
   * Also creates the associated session_state record.
   */
  async createSession(params: CreateSessionParams): Promise<AgentSessionWithState> {
    logger.info(
      { agentId: params.agentId, conversationId: params.conversationId },
      'Creating new session'
    )

    // Insert session
    const { data: session, error: sessionError } = await this.supabase
      .from('agent_sessions')
      .insert({
        agent_id: params.agentId,
        conversation_id: params.conversationId,
        contact_id: params.contactId,
        workspace_id: params.workspaceId,
        version: 1,
        status: 'active',
        current_mode: params.initialMode ?? 'conversacion',
      })
      .select()
      .single()

    if (sessionError) {
      logger.error({ error: sessionError }, 'Failed to create session')
      throw new SessionError('Failed to create session', sessionError)
    }

    // Initialize session state using factory helper
    const defaultState = createDefaultSessionState(session.id)
    const mergedState: SessionState = {
      ...defaultState,
      ...params.initialState,
      session_id: session.id,
      updated_at: defaultState.updated_at,
    }

    // Destructure to separate session_id and updated_at for DB insert
    const { session_id, updated_at, ...stateFields } = mergedState

    const { error: stateError } = await this.supabase
      .from('session_state')
      .insert({
        session_id,
        ...stateFields,
      })

    if (stateError) {
      // Rollback session if state creation fails
      await this.supabase.from('agent_sessions').delete().eq('id', session.id)
      logger.error({ error: stateError }, 'Failed to create session state')
      throw new SessionError('Failed to create session state', stateError, { sessionId: session.id })
    }

    logger.info({ sessionId: session.id }, 'Session created successfully')

    return {
      ...session,
      state: mergedState,
    }
  }

  /**
   * Get session by ID with state.
   * @throws SessionNotFoundError if session doesn't exist
   */
  async getSession(sessionId: string): Promise<AgentSessionWithState> {
    const { data: session, error } = await this.supabase
      .from('agent_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (error || !session) {
      throw new SessionNotFoundError(sessionId)
    }

    const state = await this.getState(sessionId)

    return {
      ...session,
      state,
    }
  }

  /**
   * Get session by conversation ID (if exists).
   * Returns null if no session exists for the conversation.
   */
  async getSessionByConversation(
    conversationId: string,
    agentId: string
  ): Promise<AgentSessionWithState | null> {
    const { data: session, error } = await this.supabase
      .from('agent_sessions')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('agent_id', agentId)
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      logger.error({ error, conversationId }, 'Error fetching session by conversation')
      throw new SessionError('Failed to fetch session', error)
    }

    if (!session) {
      return null
    }

    const state = await this.getState(session.id)

    return {
      ...session,
      state,
    }
  }

  /**
   * Update session with optimistic locking.
   * @throws VersionConflictError if version doesn't match
   */
  async updateSessionWithVersion(
    sessionId: string,
    expectedVersion: number,
    updates: UpdateSessionParams
  ): Promise<AgentSession> {
    const updateData: Record<string, unknown> = {
      version: expectedVersion + 1,
      updated_at: new Date().toISOString(),
    }

    if (updates.currentMode !== undefined) {
      updateData.current_mode = updates.currentMode
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status
    }
    if (updates.lastActivityAt !== undefined) {
      updateData.last_activity_at = updates.lastActivityAt
    }

    const { data, error } = await this.supabase
      .from('agent_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('version', expectedVersion)
      .select()
      .single()

    // PGRST116 = no rows returned (version mismatch)
    if (error?.code === 'PGRST116' || !data) {
      logger.warn(
        { sessionId, expectedVersion },
        'Version conflict detected - session was modified concurrently'
      )
      throw new VersionConflictError(sessionId, expectedVersion)
    }

    if (error) {
      throw new SessionError('Failed to update session', error, { sessionId })
    }

    logger.debug(
      { sessionId, newVersion: data.version },
      'Session updated successfully'
    )

    return data
  }

  /**
   * Close a session (set status to 'closed').
   */
  async closeSession(sessionId: string, expectedVersion: number): Promise<AgentSession> {
    return this.updateSessionWithVersion(sessionId, expectedVersion, {
      status: 'closed',
    })
  }

  /**
   * Hand off session to human.
   */
  async handoffSession(sessionId: string, expectedVersion: number): Promise<AgentSession> {
    return this.updateSessionWithVersion(sessionId, expectedVersion, {
      status: 'handed_off',
    })
  }

  // ============================================================================
  // State Operations
  // ============================================================================

  /**
   * Get session state.
   */
  async getState(sessionId: string): Promise<SessionState> {
    const { data, error } = await this.supabase
      .from('session_state')
      .select('*')
      .eq('session_id', sessionId)
      .single()

    if (error || !data) {
      // Return default state if not found (shouldn't happen normally)
      logger.warn({ sessionId }, 'Session state not found, returning default')
      return createDefaultSessionState(sessionId)
    }

    return data as SessionState
  }

  /**
   * Update session state.
   */
  async updateState(sessionId: string, updates: Partial<SessionState>): Promise<SessionState> {
    const { data, error } = await this.supabase
      .from('session_state')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId)
      .select()
      .single()

    if (error) {
      throw new SessionError('Failed to update session state', error, { sessionId })
    }

    return data as SessionState
  }

  /**
   * Add an intent to the intents_vistos array.
   */
  async addIntentSeen(sessionId: string, intent: string): Promise<void> {
    const state = await this.getState(sessionId)
    const orden = state.intents_vistos.length + 1
    const timestamp = new Date().toISOString()

    const newIntent: IntentRecord = { intent, orden, timestamp }

    await this.updateState(sessionId, {
      intents_vistos: [...state.intents_vistos, newIntent],
    })
  }

  /**
   * Add a template to the templates_enviados array.
   */
  async addTemplateSent(sessionId: string, templateName: string): Promise<void> {
    const state = await this.getState(sessionId)

    await this.updateState(sessionId, {
      templates_enviados: [...state.templates_enviados, templateName],
    })
  }

  /**
   * Update captured data fields.
   */
  async updateCapturedData(
    sessionId: string,
    newData: Record<string, string>
  ): Promise<void> {
    const state = await this.getState(sessionId)

    await this.updateState(sessionId, {
      datos_capturados: {
        ...state.datos_capturados,
        ...newData,
      },
    })
  }

  // ============================================================================
  // Turn Operations
  // ============================================================================

  /**
   * Add a turn to the session.
   */
  async addTurn(params: AddTurnParams): Promise<AgentTurn> {
    const { data, error } = await this.supabase
      .from('agent_turns')
      .insert({
        session_id: params.sessionId,
        turn_number: params.turnNumber,
        role: params.role,
        content: params.content,
        intent_detected: params.intentDetected ?? null,
        confidence: params.confidence ?? null,
        tools_called: params.toolsCalled ?? [],
        tokens_used: params.tokensUsed ?? 0,
      })
      .select()
      .single()

    if (error) {
      throw new SessionError('Failed to add turn', error, { sessionId: params.sessionId })
    }

    logger.debug(
      { sessionId: params.sessionId, turnNumber: params.turnNumber, role: params.role },
      'Turn added'
    )

    return data as AgentTurn
  }

  /**
   * Get all turns for a session, ordered by turn number.
   */
  async getTurns(sessionId: string): Promise<AgentTurn[]> {
    const { data, error } = await this.supabase
      .from('agent_turns')
      .select('*')
      .eq('session_id', sessionId)
      .order('turn_number', { ascending: true })

    if (error) {
      throw new SessionError('Failed to get turns', error, { sessionId })
    }

    return (data ?? []) as AgentTurn[]
  }

  /**
   * Get total tokens used in a session.
   */
  async getTotalTokensUsed(sessionId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('agent_turns')
      .select('tokens_used')
      .eq('session_id', sessionId)

    if (error) {
      throw new SessionError('Failed to get token count', error, { sessionId })
    }

    return data?.reduce((sum, turn) => sum + (turn.tokens_used ?? 0), 0) ?? 0
  }

  /**
   * Get turn count for a session.
   */
  async getTurnCount(sessionId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('agent_turns')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)

    if (error) {
      throw new SessionError('Failed to get turn count', error, { sessionId })
    }

    return count ?? 0
  }
}
