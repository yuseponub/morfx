/**
 * V3 Production Timer Adapter
 * Quick-028: V3 Production Timer System - Fase 2
 *
 * Translates V3 sales-track timer SIGNALS into Inngest events.
 * Unlike V1's ProductionTimerAdapter which uses lifecycle hooks (onModeTransition,
 * onIngestStarted, etc.), the V3 adapter translates signals directly.
 *
 * V3 sales-track emits TimerSignal → this adapter → inngest.send(agent/v3.timer.started)
 * Customer messages cancel timers via agent/customer.message (shared with V1).
 */

import type { TimerAdapter } from '../../engine/types'
import type { TimerSignal as SandboxTimerSignal } from '@/lib/sandbox/types'
import type { TimerSignal as V3TimerSignal } from '@/lib/agents/somnio-v3/types'
import { V3_TIMER_DURATIONS } from '../../somnio-v3/constants'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('v3-production-timer')

export class V3ProductionTimerAdapter implements TimerAdapter {
  private presetCache: string | null = null

  private _sessionId: string = ''

  constructor(
    private workspaceId: string,
    private conversationId: string,
    private phoneNumber: string,
    private contactId: string,
  ) {}

  /**
   * Set the sessionId after session resolution.
   * Called by V3ProductionRunner after getSession/getOrCreateSession.
   */
  setSessionId(sessionId: string): void {
    this._sessionId = sessionId
  }

  /**
   * Get timer preset from workspace config. Cached per adapter instance.
   */
  private async getPreset(): Promise<string> {
    if (this.presetCache) return this.presetCache

    try {
      const { getWorkspaceAgentConfig } = await import('../../production/agent-config')
      const config = await getWorkspaceAgentConfig(this.workspaceId)
      this.presetCache = config?.timer_preset ?? 'real'
    } catch {
      this.presetCache = 'real'
    }
    return this.presetCache
  }

  /**
   * Translate V3 timer signals to Inngest events.
   *
   * This is the KEY method. V3 sales-track emits signals, the runner calls
   * adapter.timer.signal(). For 'start' signals, we emit agent/v3.timer.started.
   *
   * signal() is sync per interface. We use fire-and-forget pattern with .catch()
   * for the async inngest.send. This is safe because Inngest events are idempotent
   * and the runner does not depend on the result.
   */
  signal(signal: SandboxTimerSignal): void {
    // V3 runner sends V3TimerSignal (with level as 'L0'-'L8'), but the interface
    // types it as SandboxTimerSignal. Cast to access v3-specific fields.
    const v3Signal = signal as unknown as V3TimerSignal

    if (v3Signal.type === 'start' && v3Signal.level) {
      // Parse level string ('L0'-'L8') to number (0-8)
      const levelNum = parseInt(v3Signal.level.replace('L', ''), 10)
      if (isNaN(levelNum) || levelNum < 0 || levelNum > 8) {
        logger.warn({ signal: v3Signal }, 'Invalid timer signal level')
        return
      }

      // Fire-and-forget: async inngest.send inside sync signal()
      void (async () => {
        try {
          const preset = await this.getPreset()
          const durationSeconds = V3_TIMER_DURATIONS[preset]?.[levelNum]
            ?? V3_TIMER_DURATIONS.real[levelNum]
          const timerDurationMs = durationSeconds * 1000

          const { inngest } = await import('@/inngest/client')
          await inngest.send({
            name: 'agent/v3.timer.started',
            data: {
              sessionId: this._sessionId,
              conversationId: this.conversationId,
              workspaceId: this.workspaceId,
              level: levelNum,
              timerDurationMs,
              phoneNumber: this.phoneNumber,
              contactId: this.contactId,
            },
          })

          logger.info(
            { level: levelNum, preset, timerDurationMs, conversationId: this.conversationId },
            'Emitted agent/v3.timer.started'
          )
        } catch (error) {
          logger.error({ error, signal: v3Signal }, 'Failed to emit v3 timer started event')
        }
      })()
    } else if (v3Signal.type === 'cancel') {
      // Cancellation works via agent/customer.message waitForEvent match.
      // No need to emit agent/v3.timer.cancelled — just log for debugging.
      logger.debug({ signal: v3Signal, conversationId: this.conversationId }, 'V3 timer cancel signal (no-op, handled via customer.message)')
    } else if (v3Signal.type === 'reevaluate') {
      // No action needed in production. Log only.
      logger.debug({ signal: v3Signal, conversationId: this.conversationId }, 'V3 timer reevaluate signal (no-op in production)')
    }
  }

  /**
   * Always undefined in production. V3 does not accumulate signals.
   */
  getLastSignal(): SandboxTimerSignal | undefined {
    return undefined
  }

  /**
   * Emit agent/customer.message event for timer cancellation.
   * Reuses the SAME event as V1 — this event cancels ALL waitForEvent
   * (both v1 and v3) that match by sessionId.
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
      logger.debug({ sessionId }, 'Emitted agent/customer.message event (v3)')
    } catch (error) {
      // Non-blocking: log but don't fail processing
      logger.warn({ error, sessionId }, 'Failed to emit customer.message event (v3)')
    }
  }

  // V3 does NOT use lifecycle hooks — everything goes via timer signals.
  // onModeTransition, onIngestStarted, onIngestCompleted, onSilenceDetected
  // are left undefined (interface marks them optional with ?).
}
