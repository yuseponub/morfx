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
      /** Timer duration from workspace preset (ms). Defaults to 360000 (6 min). */
      timerDurationMs?: number
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
      /** Timer duration from workspace preset (ms). Defaults to 600000 (10 min). */
      timerDurationMs?: number
    }
  }

  /**
   * Emitted when customer selects a pack and enters resumen mode.
   * Triggers L4 timeout workflow (pack sin confirmar).
   */
  'agent/resumen.started': {
    data: {
      sessionId: string
      conversationId: string
      workspaceId: string
      /** Timer duration from workspace preset (ms). Defaults to 600000 (10 min). */
      timerDurationMs?: number
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

  /**
   * Emitted when a WhatsApp text message is received and should be
   * processed by the production agent (Phase 16).
   *
   * Fired from webhook-handler.ts AFTER the message is stored in DB.
   * The Inngest function checks agent-config before processing.
   */
  'agent/whatsapp.message_received': {
    data: {
      conversationId: string
      contactId: string | null
      messageContent: string
      workspaceId: string
      phone: string
      /** wamid for deduplication */
      messageId: string
    }
  }
}

// ============================================================================
// Ingest Events (Phase 15.5: Somnio Ingest System)
// ============================================================================

/**
 * Ingest-related events for silent data accumulation workflow.
 *
 * Timer logic from CONTEXT.md:
 * - 6 min timeout if customer sent partial data
 * - 10 min timeout if no data was received
 * - Timer starts with FIRST data, NOT on each message
 * - Timer cancelled when all 8 fields complete
 */
export type IngestEvents = {
  /**
   * Emitted when ingest timer should start (first data received).
   * Triggers the ingest timer workflow with conditional timeout.
   */
  'agent/ingest.started': {
    data: {
      sessionId: string
      conversationId: string
      workspaceId: string
      /** Whether customer has sent any partial data */
      hasPartialData: boolean
      /** Timer duration: 360000 (6 min partial) or 600000 (10 min no data) */
      timerDurationMs: number
    }
  }

  /**
   * Emitted when ingest completes (all 8 fields collected, or cancelled).
   * Cancels the running ingest timer via step.waitForEvent().
   */
  'agent/ingest.completed': {
    data: {
      sessionId: string
      /** Why ingest completed */
      reason: 'all_fields' | 'timeout' | 'cancelled'
    }
  }

  /**
   * Emitted when new data is extracted during ingest.
   * For tracking/debugging purposes (not for timer control).
   */
  'agent/ingest.data_received': {
    data: {
      sessionId: string
      /** Fields extracted in this message */
      fieldsExtracted: string[]
      /** Total fields collected so far */
      totalFields: number
    }
  }
}

// ============================================================================
// Automation Events (Phase 17: CRM Automations Engine)
// ============================================================================

/**
 * Automation trigger events. Emitted by trigger-emitter.ts when CRM/WhatsApp/Task
 * changes occur. Consumed by automation-runner.ts Inngest functions.
 *
 * Event naming convention: automation/{trigger_type}
 * All events carry cascadeDepth for cascade loop prevention (MAX_CASCADE_DEPTH=3).
 */
export type AutomationEvents = {
  'automation/order.stage_changed': {
    data: {
      workspaceId: string
      orderId: string
      previousStageId: string
      newStageId: string
      pipelineId: string
      contactId: string | null
      previousStageName?: string
      newStageName?: string
      pipelineName?: string
      contactName?: string
      contactPhone?: string
      cascadeDepth: number
    }
  }
  'automation/tag.assigned': {
    data: {
      workspaceId: string
      entityType: 'contact' | 'order' | 'conversation'
      entityId: string
      tagId: string
      tagName: string
      contactId?: string
      contactName?: string
      cascadeDepth: number
    }
  }
  'automation/tag.removed': {
    data: {
      workspaceId: string
      entityType: 'contact' | 'order' | 'conversation'
      entityId: string
      tagId: string
      tagName: string
      contactId?: string
      cascadeDepth: number
    }
  }
  'automation/contact.created': {
    data: {
      workspaceId: string
      contactId: string
      contactName: string
      contactPhone: string
      contactEmail?: string
      contactCity?: string
      cascadeDepth: number
    }
  }
  'automation/order.created': {
    data: {
      workspaceId: string
      orderId: string
      pipelineId: string
      stageId: string
      contactId: string | null
      totalValue: number
      sourceOrderId?: string
      cascadeDepth: number
    }
  }
  'automation/field.changed': {
    data: {
      workspaceId: string
      entityType: 'contact' | 'order'
      entityId: string
      fieldName: string
      previousValue: unknown
      newValue: unknown
      cascadeDepth: number
    }
  }
  'automation/whatsapp.message_received': {
    data: {
      workspaceId: string
      conversationId: string
      contactId: string | null
      messageContent: string
      phone: string
      cascadeDepth: number
    }
  }
  'automation/whatsapp.keyword_match': {
    data: {
      workspaceId: string
      conversationId: string
      contactId: string | null
      messageContent: string
      phone: string
      keywordMatched: string
      cascadeDepth: number
    }
  }
  'automation/task.completed': {
    data: {
      workspaceId: string
      taskId: string
      taskTitle: string
      contactId: string | null
      orderId: string | null
      cascadeDepth: number
    }
  }
  'automation/task.overdue': {
    data: {
      workspaceId: string
      taskId: string
      taskTitle: string
      dueDate: string
      contactId: string | null
      orderId: string | null
      cascadeDepth: number
    }
  }
  // Shopify triggers (Phase 20: Integration Automations)
  'automation/shopify.order_created': {
    data: {
      workspaceId: string
      shopifyOrderId: number
      shopifyOrderNumber: string
      total: string
      financialStatus: string
      email: string | null
      phone: string | null
      note: string | null
      products: Array<{ sku: string; title: string; quantity: number; price: string }>
      shippingAddress: string | null
      shippingCity: string | null
      tags: string | null
      contactId?: string
      contactName?: string
      contactPhone?: string
      orderId?: string
      cascadeDepth: number
    }
  }
  'automation/shopify.draft_order_created': {
    data: {
      workspaceId: string
      shopifyDraftOrderId: number
      shopifyOrderNumber: string
      total: string
      status: string
      email: string | null
      phone: string | null
      note: string | null
      products: Array<{ sku: string; title: string; quantity: number; price: string }>
      shippingAddress: string | null
      contactName?: string
      contactPhone?: string
      cascadeDepth: number
    }
  }
  'automation/shopify.order_updated': {
    data: {
      workspaceId: string
      shopifyOrderId: number
      shopifyOrderNumber: string
      total: string
      financialStatus: string
      fulfillmentStatus: string | null
      email: string | null
      phone: string | null
      note: string | null
      products: Array<{ sku: string; title: string; quantity: number; price: string }>
      shippingAddress: string | null
      shippingCity: string | null
      tags: string | null
      contactId?: string
      contactName?: string
      contactPhone?: string
      orderId?: string
      cascadeDepth: number
    }
  }
}

/**
 * All agent-related events (base + ingest + automation).
 */
export type AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents

/**
 * Type helper for extracting event data by name
 */
export type AgentEventData<T extends keyof AllAgentEvents> = AllAgentEvents[T]['data']
