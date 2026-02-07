/**
 * Inngest Client
 * Phase 13: Agent Engine Core - Plan 06
 *
 * Durable workflow orchestration for agent timer workflows.
 * Replaces n8n's Proactive Timer with event-driven architecture.
 *
 * Key features:
 * - step.waitForEvent() for timeout-based customer engagement
 * - step.sleep() for delays between modes
 * - Persistent across restarts
 * - Automatic retry on failures
 *
 * Environment variables:
 * - INNGEST_EVENT_KEY: For sending events (required in production)
 * - INNGEST_SIGNING_KEY: For verifying webhook requests
 */

import { Inngest, EventSchemas } from 'inngest'
import type { AllAgentEvents } from './events'

/**
 * Inngest client for MorfX agent workflows.
 *
 * Used for:
 * - Data collection timeout (6 min)
 * - Promos offer timeout (10 min)
 * - Other time-based agent behaviors
 *
 * @example
 * // Send an event
 * await inngest.send({
 *   name: 'agent/collecting_data.started',
 *   data: {
 *     sessionId: 'session-123',
 *     conversationId: 'conv-456',
 *     workspaceId: 'ws-789'
 *   }
 * })
 */
export const inngest = new Inngest({
  id: 'morfx-agents',
  schemas: new EventSchemas().fromRecord<AllAgentEvents>(),
})
