/**
 * Production Timer Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Emits Inngest events for real timer workflows in production.
 * Does NOT accumulate signals (that's sandbox behavior).
 *
 * Event emission points (from SomnioEngine + AgentEngine):
 * 1. onCustomerMessage: agent/customer.message (timer cancellation)
 * 2. onModeTransition: agent/collecting_data.started, agent/promos.offered
 * 3. onIngestStarted: agent/ingest.started (data collection timer)
 * 4. onIngestCompleted: agent/ingest.completed (cancel timer)
 *
 * All events use dynamic import to avoid circular deps.
 * All events are non-blocking (failures logged but don't stop processing).
 */

import type { TimerAdapter, AgentSessionLike } from '../../engine/types'
import type { TimerSignal } from '@/lib/sandbox/types'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('production-timer-adapter')

export class ProductionTimerAdapter implements TimerAdapter {
  constructor(private workspaceId: string) {}

  /**
   * No-op in production. Timer signals are a sandbox concept.
   * Production uses Inngest events instead.
   */
  signal(_signal: TimerSignal): void {
    // No-op: production does not accumulate timer signals
  }

  /**
   * Always undefined in production. Timer signals are sandbox-only.
   */
  getLastSignal(): TimerSignal | undefined {
    return undefined
  }

  /**
   * Emit agent/customer.message event for timer cancellation.
   * Called on every customer message to cancel pending timeouts
   * via Inngest step.waitForEvent().
   */
  async onCustomerMessage(sessionId: string, conversationId: string, content: string): Promise<void> {
    try {
      const { inngest } = await import('@/inngest/client')
      await inngest.send({
        name: 'agent/customer.message',
        data: {
          sessionId,
          conversationId,
          messageId: crypto.randomUUID(),
          content,
        },
      })
      logger.debug({ sessionId }, 'Emitted agent/customer.message event')
    } catch (error) {
      // Non-blocking: log but don't fail processing
      logger.warn({ error, sessionId }, 'Failed to emit customer.message event')
    }
  }

  /**
   * Emit mode transition events for timer workflows.
   * - collecting_data.started when entering collecting_data
   * - promos.offered when entering ofrecer_promos
   */
  async onModeTransition(sessionId: string, previousMode: string, newMode: string, conversationId?: string): Promise<void> {
    if (previousMode === newMode) return

    try {
      const { inngest } = await import('@/inngest/client')

      // Emit collecting_data.started when transitioning TO collecting_data
      if (newMode === 'collecting_data' && previousMode !== 'collecting_data') {
        await inngest.send({
          name: 'agent/collecting_data.started',
          data: {
            sessionId,
            conversationId: conversationId ?? '',
            workspaceId: this.workspaceId,
          },
        })
        logger.info({ sessionId, conversationId }, 'Emitted agent/collecting_data.started event')
      }

      // Emit promos.offered when transitioning TO ofrecer_promos
      if (newMode === 'ofrecer_promos' && previousMode !== 'ofrecer_promos') {
        await inngest.send({
          name: 'agent/promos.offered',
          data: {
            sessionId,
            conversationId: conversationId ?? '',
            workspaceId: this.workspaceId,
            packOptions: ['1x', '2x', '3x'],
          },
        })
        logger.info({ sessionId, conversationId }, 'Emitted agent/promos.offered event')
      }
    } catch (error) {
      // Non-blocking: log but don't fail processing
      logger.warn({ error, sessionId, newMode }, 'Failed to emit mode transition event')
    }
  }

  /**
   * Emit agent/ingest.started event to start the data collection timer.
   * Timer duration: 6 min for partial data, 10 min for no data.
   */
  async onIngestStarted(session: AgentSessionLike, hasPartialData: boolean): Promise<void> {
    const timerDurationMs = hasPartialData ? 360000 : 600000

    try {
      const { inngest } = await import('@/inngest/client')
      await inngest.send({
        name: 'agent/ingest.started',
        data: {
          sessionId: session.id,
          conversationId: session.conversation_id,
          workspaceId: this.workspaceId,
          hasPartialData,
          timerDurationMs,
        },
      })
      logger.info(
        { sessionId: session.id, timerDurationMs, hasPartialData },
        'Emitted agent/ingest.started event'
      )
    } catch (error) {
      // Non-blocking: log but don't fail processing
      logger.warn({ error, sessionId: session.id }, 'Failed to emit ingest.started event')
    }
  }

  /**
   * Emit agent/ingest.completed event to cancel the data collection timer.
   */
  async onIngestCompleted(sessionId: string, reason: string): Promise<void> {
    try {
      const { inngest } = await import('@/inngest/client')
      await inngest.send({
        name: 'agent/ingest.completed',
        data: {
          sessionId,
          reason: reason as 'all_fields' | 'timeout' | 'cancelled',
        },
      })
      logger.info({ sessionId, reason }, 'Emitted agent/ingest.completed event')
    } catch (error) {
      // Non-blocking: log but don't fail processing
      logger.warn({ error, sessionId }, 'Failed to emit ingest.completed event')
    }
  }
}
