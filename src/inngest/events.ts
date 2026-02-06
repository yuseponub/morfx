/**
 * Agent Events
 * Phase 13: Agent Engine Core - Plan 06
 *
 * Type definitions for Inngest events used in agent workflows.
 * These events drive timer-based proactive agent behaviors.
 */

/**
 * All agent-related events.
 *
 * Event naming convention: agent/{entity}.{action}
 * - session: Session lifecycle events
 * - customer: Customer interaction events
 * - collecting_data: Data collection mode events
 * - promos: Promos offer mode events
 * - proactive: Proactive messaging events
 */
export type AgentEvents = {
  /**
   * Emitted when an agent session starts.
   * Triggers initial session setup workflows.
   */
  'agent/session.started': {
    data: {
      sessionId: string
      workspaceId: string
      agentId: string
      conversationId: string
      contactId: string
      mode: string
    }
  }

  /**
   * Emitted when a customer sends a message.
   * Used to cancel pending timeouts via step.waitForEvent().
   */
  'agent/customer.message': {
    data: {
      sessionId: string
      conversationId: string
      messageId: string
      content: string
    }
  }

  /**
   * Emitted when data collection mode starts.
   * Triggers 6-minute timeout workflow.
   *
   * Flow (from CONTEXT.md):
   * - Wait for customer message (6 min timeout)
   * - If timeout without data: send "quedamos pendientes"
   * - If partial data: request missing fields
   * - If complete data: wait 2 min, then offer promos
   */
  'agent/collecting_data.started': {
    data: {
      sessionId: string
      conversationId: string
      workspaceId: string
    }
  }

  /**
   * Emitted when promos are offered to customer.
   * Triggers 10-minute timeout workflow.
   *
   * Flow (from CONTEXT.md):
   * - Wait for customer response (10 min timeout)
   * - If timeout: auto-create order with default pack (1x)
   * - If response: process pack selection
   */
  'agent/promos.offered': {
    data: {
      sessionId: string
      conversationId: string
      workspaceId: string
      packOptions: string[]
    }
  }

  /**
   * Emitted when session should be closed.
   */
  'agent/session.close': {
    data: {
      sessionId: string
      reason: 'timeout' | 'completed' | 'handoff' | 'cancelled'
    }
  }

  /**
   * Emitted to trigger a proactive message.
   * Used for reminders, follow-ups, and timeout warnings.
   */
  'agent/proactive.send': {
    data: {
      sessionId: string
      conversationId: string
      workspaceId: string
      messageType: 'reminder' | 'followup' | 'timeout_warning'
      content?: string
    }
  }
}

/**
 * Type helper for extracting event data by name
 */
export type AgentEventData<T extends keyof AgentEvents> = AgentEvents[T]['data']
