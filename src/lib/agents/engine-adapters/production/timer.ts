/**
 * Production Timer Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Emits Inngest events for real timer workflows in production.
 * Reads timer_preset from workspace_agent_config to determine durations.
 *
 * Timer presets (from sandbox/ingest-timer.ts):
 * - real: L0=600s, L1=360s, L2=120s, L3=600s, L4=600s
 * - rapido: L0=60s, L1=30s, L2=10s, L3=60s, L4=60s
 * - instantaneo: L0=2s, L1=2s, L2=1s, L3=2s, L4=2s
 *
 * Event emission points:
 * 1. onCustomerMessage: agent/customer.message (timer cancellation)
 * 2. onModeTransition: agent/collecting_data.started, agent/promos.offered
 * 3. onIngestStarted: agent/ingest.started (data collection timer)
 * 4. onIngestCompleted: agent/ingest.completed (cancel timer)
 */

import type { TimerAdapter, AgentSessionLike } from '../../engine/types'
import type { TimerSignal } from '@/lib/sandbox/types'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('production-timer-adapter')

/**
 * Timer durations per preset (in milliseconds).
 * Matches TIMER_PRESETS from sandbox/ingest-timer.ts.
 * Levels: 0=sin datos, 1=datos parciales, 2=datos minimos, 3=promos, 4=pack
 */
const PRESET_DURATIONS: Record<string, Record<number, number>> = {
  real:         { 0: 600_000, 1: 360_000, 2: 120_000, 3: 600_000, 4: 600_000 },
  rapido:       { 0:  60_000, 1:  30_000, 2:  10_000, 3:  60_000, 4:  60_000 },
  instantaneo:  { 0:   2_000, 1:   2_000, 2:   1_000, 3:   2_000, 4:   2_000 },
}

export class ProductionTimerAdapter implements TimerAdapter {
  private presetCache: string | null = null

  constructor(private workspaceId: string) {}

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
   * Get duration for a specific timer level based on workspace preset.
   */
  private async getDuration(level: number): Promise<number> {
    const preset = await this.getPreset()
    return PRESET_DURATIONS[preset]?.[level] ?? PRESET_DURATIONS.real[level]
  }

  /**
   * No-op in production. Timer signals are a sandbox concept.
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
   * Includes timerDurationMs from workspace preset.
   */
  async onModeTransition(sessionId: string, previousMode: string, newMode: string, conversationId?: string): Promise<void> {
    if (previousMode === newMode) return

    const preset = await this.getPreset()
    logger.info({ sessionId, preset, newMode }, 'Mode transition with timer preset')

    try {
      const { inngest } = await import('@/inngest/client')

      if (newMode === 'collecting_data' && previousMode !== 'collecting_data') {
        const durationMs = await this.getDuration(0) // L0: sin datos
        await inngest.send({
          name: 'agent/collecting_data.started',
          data: {
            sessionId,
            conversationId: conversationId ?? '',
            workspaceId: this.workspaceId,
            timerDurationMs: durationMs,
          },
        })
        logger.info({ sessionId, conversationId, durationMs, preset }, 'Emitted agent/collecting_data.started')
      }

      if (newMode === 'ofrecer_promos' && previousMode !== 'ofrecer_promos') {
        const durationMs = await this.getDuration(3) // L3: promos sin respuesta
        await inngest.send({
          name: 'agent/promos.offered',
          data: {
            sessionId,
            conversationId: conversationId ?? '',
            workspaceId: this.workspaceId,
            packOptions: ['1x', '2x', '3x'],
            timerDurationMs: durationMs,
          },
        })
        logger.info({ sessionId, conversationId, durationMs, preset }, 'Emitted agent/promos.offered')
      }
    } catch (error) {
      logger.warn({ error, sessionId, newMode }, 'Failed to emit mode transition event')
    }
  }

  /**
   * Emit agent/ingest.started event with duration from workspace preset.
   * L1 (partial data) or L0 (no data).
   */
  async onIngestStarted(session: AgentSessionLike, hasPartialData: boolean): Promise<void> {
    const level = hasPartialData ? 1 : 0
    const timerDurationMs = await this.getDuration(level)

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
        { sessionId: session.id, timerDurationMs, hasPartialData, level },
        'Emitted agent/ingest.started event'
      )
    } catch (error) {
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
      logger.warn({ error, sessionId }, 'Failed to emit ingest.completed event')
    }
  }
}
