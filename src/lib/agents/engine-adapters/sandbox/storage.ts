/**
 * Sandbox Storage Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * In-memory implementation of StorageAdapter for sandbox environment.
 * Builds mock AgentSessionLike from SandboxState without any DB operations.
 *
 * CRITICAL INVARIANT: getSession() builds intentsVistos from the current
 * snapshot (BEFORE the engine adds the current turn's intent). This ensures
 * TemplateManager correctly detects primera_vez vs siguientes.
 * See Research Pitfall #2.
 */

import type { StorageAdapter, AgentSessionLike } from '../../engine/types'
import type { SandboxState } from '@/lib/sandbox/types'
import type { IntentRecord } from '../../types'
import { somnioAgentConfig } from '../../somnio/config'

export class SandboxStorageAdapter implements StorageAdapter {
  private state: SandboxState
  private history: { role: 'user' | 'assistant'; content: string }[]
  private workspaceId: string

  constructor(
    initialState: SandboxState,
    history: { role: 'user' | 'assistant'; content: string }[],
    workspaceId?: string
  ) {
    this.state = { ...initialState }
    this.history = history
    this.workspaceId = workspaceId ?? 'sandbox-workspace'
  }

  /**
   * Build and return an AgentSessionLike from the in-memory state.
   *
   * IMPORTANT: Uses this.state.intentsVistos (the current snapshot BEFORE
   * the current intent is added) when building the session. This ensures
   * TemplateManager correctly detects primera_vez vs siguientes.
   */
  async getSession(_sessionId: string): Promise<AgentSessionLike> {
    const now = new Date().toISOString()

    // Map string[] intentsVistos to IntentRecord[] format
    const intentsVistos: IntentRecord[] = this.state.intentsVistos.map((intent, idx) => ({
      intent,
      orden: idx + 1,
      timestamp: now,
    }))

    return {
      id: 'sandbox-session',
      agent_id: somnioAgentConfig.id,
      conversation_id: 'sandbox-conversation',
      contact_id: 'sandbox-contact',
      workspace_id: this.workspaceId,
      version: 1,
      status: 'active',
      current_mode: this.state.currentMode,
      // Extra fields required by AgentSessionWithState consumers (orchestrator)
      created_at: now,
      updated_at: now,
      last_activity_at: now,
      state: {
        session_id: 'sandbox-session',
        intents_vistos: intentsVistos,
        templates_enviados: this.state.templatesEnviados,
        datos_capturados: this.state.datosCapturados,
        pack_seleccionado: this.state.packSeleccionado,
        proactive_started_at: null,
        first_data_at: null,
        min_data_at: null,
        ofrecer_promos_at: null,
        updated_at: now,
      },
    } as AgentSessionLike & Record<string, unknown>
  }

  /**
   * Same as getSession() for sandbox (no DB lookup needed).
   */
  async getOrCreateSession(_conversationId: string, _contactId: string): Promise<AgentSessionLike> {
    return this.getSession('sandbox-session')
  }

  /**
   * Return the in-memory conversation history.
   */
  async getHistory(_sessionId: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    return this.history
  }

  /**
   * Merge state updates into internal state.
   */
  async saveState(_sessionId: string, updates: Record<string, unknown>): Promise<void> {
    if (updates.datos_capturados) {
      this.state.datosCapturados = updates.datos_capturados as Record<string, string>
    }
    if (updates.templates_enviados) {
      this.state.templatesEnviados = updates.templates_enviados as string[]
    }
    if (updates.pack_seleccionado !== undefined) {
      this.state.packSeleccionado = updates.pack_seleccionado as SandboxState['packSeleccionado']
    }
    if (updates.first_data_at !== undefined) {
      // Track in ingestStatus if available
      if (this.state.ingestStatus) {
        this.state.ingestStatus.firstDataAt = updates.first_data_at as string | null
      }
    }
    if (updates.ingestStatus !== undefined) {
      this.state.ingestStatus = updates.ingestStatus as SandboxState['ingestStatus']
    }
  }

  /**
   * Update currentMode in internal state.
   */
  async updateMode(_sessionId: string, _version: number, newMode: string): Promise<void> {
    this.state.currentMode = newMode
  }

  /**
   * No-op for sandbox (debug adapter tracks turns).
   */
  async addTurn(_params: {
    sessionId: string
    turnNumber: number
    role: 'user' | 'assistant'
    content: string
    intentDetected?: string
    confidence?: number
    tokensUsed?: number
  }): Promise<void> {
    // No-op in sandbox
  }

  /**
   * No-op for sandbox (intents tracked in SandboxState.intentsVistos).
   */
  async addIntentSeen(_sessionId: string, _intent: string): Promise<void> {
    // No-op in sandbox
  }

  /**
   * No-op for sandbox.
   */
  async handoff(_sessionId: string, _version: number): Promise<void> {
    // No-op in sandbox
  }

  /**
   * Get the current internal SandboxState.
   */
  getState(): SandboxState {
    return this.state
  }
}
