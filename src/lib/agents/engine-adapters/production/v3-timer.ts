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
import { GD_TIMER_DURATIONS } from '../../godentist/constants'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('v3-production-timer')

/** Timer duration tables by agent module */
const TIMER_TABLES: Record<string, Record<string, Record<number, number>>> = {
  'somnio-sales-v3': V3_TIMER_DURATIONS,
  'godentist': GD_TIMER_DURATIONS,
}

export class V3ProductionTimerAdapter implements TimerAdapter {
  private presetCache: string | null = null
  private agentId: string

  private _sessionId: string = ''

  constructor(
    private workspaceId: string,
    private conversationId: string,
    private phoneNumber: string,
    private contactId: string,
    agentId?: string,
  ) {
    this.agentId = agentId ?? 'somnio-sales-v3'
  }

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
   * No-op — kept for TimerAdapter interface compliance.
   * V3ProductionRunner uses emitSignals() instead.
   */
  signal(_signal: SandboxTimerSignal): void {
    // No-op: V3 runner calls emitSignals() directly
  }

  /**
   * Emit V3 timer signals to Inngest — properly awaited.
   *
   * Called directly by V3ProductionRunner (not through the generic interface).
   * For each 'start' signal, emits agent/v3.timer.started with duration
   * computed from workspace preset.
   */
  async emitSignals(signals: V3TimerSignal[]): Promise<void> {
    for (const signal of signals) {
      if (signal.type === 'cancel') {
        logger.debug({ signal, conversationId: this.conversationId }, 'V3 timer cancel signal (handled via customer.message)')
        continue
      }
      if (signal.type === 'reevaluate') {
        logger.debug({ signal, conversationId: this.conversationId }, 'V3 timer reevaluate signal (no-op in production)')
        continue
      }
      if (signal.type !== 'start' || !signal.level) continue

      const levelNum = parseInt(signal.level.replace('L', ''), 10)
      if (isNaN(levelNum) || levelNum < 0 || levelNum > 8) {
        logger.warn({ signal }, 'Invalid timer signal level')
        continue
      }

      const preset = await this.getPreset()
      const durations = TIMER_TABLES[this.agentId] ?? V3_TIMER_DURATIONS
      const durationSeconds = durations[preset]?.[levelNum]
        ?? durations.real?.[levelNum]
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
