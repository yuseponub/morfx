/**
 * Production Storage Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * DB-backed implementation of StorageAdapter using SessionManager.
 * All session state is persisted to Supabase via the SessionManager
 * (agent_sessions, session_state, agent_turns tables).
 */

import type { StorageAdapter, AgentSessionLike } from '../../engine/types'
import type { SessionManager } from '../../session-manager'
import { somnioAgentConfig } from '../../somnio/config'

export class ProductionStorageAdapter implements StorageAdapter {
  constructor(
    private sessionManager: SessionManager,
    private workspaceId: string
  ) {}

  /**
   * Get session by ID from database.
   */
  async getSession(sessionId: string): Promise<AgentSessionLike> {
    const session = await this.sessionManager.getSession(sessionId)
    return session as unknown as AgentSessionLike
  }

  /**
   * Get existing session or create new one for the conversation.
   */
  async getOrCreateSession(conversationId: string, contactId: string): Promise<AgentSessionLike> {
    // Try to find existing active session
    const existing = await this.sessionManager.getSessionByConversation(
      conversationId,
      somnioAgentConfig.id
    )

    if (existing) {
      return existing as unknown as AgentSessionLike
    }

    // Create new session
    const newSession = await this.sessionManager.createSession({
      agentId: somnioAgentConfig.id,
      conversationId,
      contactId,
      workspaceId: this.workspaceId,
      initialMode: somnioAgentConfig.initialState,
    })

    return newSession as unknown as AgentSessionLike
  }

  /**
   * Get conversation history from agent_turns table.
   * Filters out system turns and empty content.
   */
  async getHistory(sessionId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const turns = await this.sessionManager.getTurns(sessionId)

    return turns
      .filter((turn) => turn.role !== 'system')
      .filter((turn) => turn.content && turn.content.trim().length > 0)
      .map((turn) => ({
        role: turn.role as 'user' | 'assistant',
        content: turn.content,
      }))
  }

  /**
   * Save state updates to session_state table.
   */
  async saveState(sessionId: string, updates: Record<string, unknown>): Promise<void> {
    if (Object.keys(updates).length > 0) {
      await this.sessionManager.updateState(sessionId, updates as Record<string, never>)
    }
  }

  /**
   * Update session mode with optimistic locking.
   */
  async updateMode(sessionId: string, version: number, newMode: string): Promise<void> {
    await this.sessionManager.updateSessionWithVersion(sessionId, version, {
      currentMode: newMode,
      lastActivityAt: new Date().toISOString(),
    })
  }

  /**
   * Record a conversation turn to agent_turns table.
   */
  async addTurn(params: {
    sessionId: string
    turnNumber: number
    role: 'user' | 'assistant'
    content: string
    intentDetected?: string
    confidence?: number
    tokensUsed?: number
  }): Promise<void> {
    await this.sessionManager.addTurn({
      sessionId: params.sessionId,
      turnNumber: params.turnNumber,
      role: params.role,
      content: params.content,
      intentDetected: params.intentDetected ?? null,
      confidence: params.confidence ?? null,
      tokensUsed: params.tokensUsed ?? 0,
    })
  }

  /**
   * Add an intent to intents_vistos in session state.
   */
  async addIntentSeen(sessionId: string, intent: string): Promise<void> {
    await this.sessionManager.addIntentSeen(sessionId, intent)
  }

  /**
   * Hand off session to human agent. Sets status to 'handed_off'.
   */
  async handoff(sessionId: string, version: number): Promise<void> {
    await this.sessionManager.handoffSession(sessionId, version)
  }
}
