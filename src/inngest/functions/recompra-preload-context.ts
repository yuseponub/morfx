/**
 * Recompra: Preload CRM Context via Reader
 *
 * Phase: somnio-recompra-crm-reader (standalone)
 * Trigger: event 'recompra/preload-context' dispatched by webhook-processor
 *          after V3ProductionRunner creates a new recompra session.
 *
 * Responsibility:
 * - Call crm-reader agent with fixed D-08 prompt template.
 * - Merge result.text into session_state.datos_capturados under `_v3:crm_context`.
 * - Write marker `_v3:crm_context_status` = 'ok' | 'empty' | 'error' for poll consumer.
 *
 * Idempotent: early-return if status marker already present (D-15).
 * Feature flag: platform_config['somnio_recompra_crm_reader_enabled'] (default false, Regla 6).
 * Timeout: 12s inner AbortController (Pitfall 5).
 * Observability: follows step.run __obs merge pattern (Phase 42.1 Plan 07 canon).
 */

import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'
import {
  isObservabilityEnabled,
  ObservabilityCollector,
  runWithCollector,
} from '@/lib/observability'

const logger = createModuleLogger('recompra-preload-context')

const READER_TIMEOUT_MS = 12_000
const FEATURE_FLAG_KEY = 'somnio_recompra_crm_reader_enabled'

/**
 * Fixed prompt template (CONTEXT.md D-08 — verbatim, do NOT modify).
 * The reader's system prompt is locked internally; this is the only user-turn message.
 */
function buildReaderPrompt(contactId: string): string {
  return `Prepara contexto de recompra para el contacto ${contactId} del workspace actual.
Devuelve un parrafo coherente en espanol con:
1) Ultimo pedido entregado: items comprados (nombre + cantidad) y fecha de entrega.
2) Tags activos del contacto.
3) Numero total de pedidos del contacto.
4) Direccion y ciudad mas recientes confirmadas.
Si algun dato no existe, indicalo literalmente (no inventes).
Formato plano, sin listas markdown — va a ser inyectado en otro prompt de bot.`
}

export const recompraPreloadContext = inngest.createFunction(
  {
    id: 'recompra-preload-context',
    name: 'Recompra: Preload CRM Context via Reader',
    retries: 1,
    concurrency: [{ key: 'event.data.sessionId', limit: 1 }],
  },
  { event: 'recompra/preload-context' },
  async ({ event, step }) => {
    const { sessionId, contactId, workspaceId, invoker } = event.data

    // ---- Feature flag (defense-in-depth; webhook-processor also checks, Plan 04) ----
    const { getPlatformConfig } = await import('@/lib/domain/platform-config')
    const enabled = await getPlatformConfig<boolean>(FEATURE_FLAG_KEY, false)
    if (!enabled) {
      logger.info(
        { sessionId, contactId, workspaceId },
        'feature flag off, skipping reader preload',
      )
      return { status: 'skipped' as const, reason: 'feature_flag_off' as const }
    }

    // ---- Idempotency (D-15, Open Q 6) — short-circuit if already processed ----
    const { SessionManager } = await import('@/lib/agents/session-manager')
    const sm = new SessionManager()
    try {
      const existingState = await sm.getState(sessionId)
      const existingStatus = existingState.datos_capturados?.['_v3:crm_context_status']
      if (
        existingStatus === 'ok' ||
        existingStatus === 'empty' ||
        existingStatus === 'error'
      ) {
        logger.info(
          { sessionId, existingStatus },
          'crm_context_status already present, short-circuit (idempotent)',
        )
        return {
          status: 'skipped' as const,
          reason: 'already_processed' as const,
          existingStatus,
        }
      }
    } catch (getStateErr) {
      // If session not found (race with session create), proceed — the reader will attempt write
      // which may or may not persist. Log and continue (fail-open to not block preload).
      logger.warn(
        { sessionId, err: getStateErr instanceof Error ? getStateErr.message : String(getStateErr) },
        'could not pre-fetch session state, proceeding to call reader',
      )
    }

    // ---- Observability setup (outer collector for cross-step aggregation) ----
    const collector = isObservabilityEnabled()
      ? new ObservabilityCollector({
          conversationId: `recompra-preload-${sessionId}`,
          workspaceId,
          agentId: 'crm-reader',
          turnStartedAt: new Date(),
          triggerKind: 'system_event',
        })
      : null

    // ---- Call reader + persist (wrapped in step.run for replay safety) ----
    const stepResult = await step.run('call-reader-and-persist', async () => {
      const stepCollector = collector
        ? new ObservabilityCollector({
            conversationId: collector.conversationId,
            workspaceId,
            agentId: 'crm-reader',
            turnStartedAt: collector.turnStartedAt,
            triggerKind: 'system_event',
          })
        : null

      const run = async () => {
        const startedAt = Date.now()
        const { processReaderMessage } = await import('@/lib/agents/crm-reader')

        // Inner 12s timeout via AbortController (Pitfall 5)
        const abortController = new AbortController()
        const timeoutHandle = setTimeout(() => abortController.abort(), READER_TIMEOUT_MS)

        try {
          const reader = await processReaderMessage({
            workspaceId,
            invoker,
            messages: [{ role: 'user', content: buildReaderPrompt(contactId) }],
            abortSignal: abortController.signal,
          })
          const durationMs = Date.now() - startedAt
          const text = reader.text?.trim() ?? ''
          const status: 'ok' | 'empty' = text.length > 0 ? 'ok' : 'empty'

          // Merge-safe write (Pitfall 2) — SessionManager.updateCapturedData does get-then-merge.
          const smInner = new SessionManager()
          await smInner.updateCapturedData(sessionId, {
            '_v3:crm_context': text,
            '_v3:crm_context_status': status,
          })

          return {
            status,
            durationMs,
            textLength: text.length,
            toolCallCount: reader.toolCalls?.length ?? 0,
            steps: reader.steps,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const durationMs = Date.now() - startedAt
          logger.error(
            { err: msg, sessionId, contactId, durationMs },
            'reader call failed, writing error marker',
          )

          // Pitfall 4 — ALWAYS write error marker before returning/throwing,
          // so the poll consumer can stop waiting immediately.
          try {
            const smInner = new SessionManager()
            await smInner.updateCapturedData(sessionId, {
              '_v3:crm_context': '',
              '_v3:crm_context_status': 'error',
            })
          } catch (writeErr) {
            logger.error(
              {
                sessionId,
                err: writeErr instanceof Error ? writeErr.message : String(writeErr),
              },
              'failed to write error marker (last-resort swallow)',
            )
          }

          return {
            status: 'error' as const,
            durationMs,
            error: msg.slice(0, 500),
          }
        } finally {
          clearTimeout(timeoutHandle)
        }
      }

      const result = stepCollector
        ? await runWithCollector(stepCollector, run)
        : await run()

      return {
        readerResult: result,
        __obs: stepCollector
          ? {
              events: stepCollector.events,
              queries: stepCollector.queries,
              aiCalls: stepCollector.aiCalls,
            }
          : null,
      }
    })

    const result = stepResult.readerResult

    // ---- Observability merge (__obs survives step.run replays) ----
    if (collector && stepResult.__obs) {
      collector.mergeFrom(stepResult.__obs)
    }

    // ---- D-16 observability events (emitted in outer scope, NOT inside step.run) ----
    if (result.status === 'ok' || result.status === 'empty') {
      collector?.recordEvent('pipeline_decision', 'crm_reader_completed', {
        agent: 'somnio-recompra-v1',
        sessionId,
        contactId,
        durationMs: result.durationMs,
        toolCallCount: 'toolCallCount' in result ? result.toolCallCount : 0,
        steps: 'steps' in result ? result.steps : 0,
        textLength: 'textLength' in result ? result.textLength : 0,
        status: result.status,
      })
    } else {
      collector?.recordEvent('pipeline_decision', 'crm_reader_failed', {
        agent: 'somnio-recompra-v1',
        sessionId,
        contactId,
        durationMs: result.durationMs,
        error: 'error' in result ? result.error : 'unknown',
      })
    }

    // ---- Flush collector as last step (Phase 42.1 Plan 07 pattern) ----
    if (collector) {
      await step.run('observability-flush', async () => {
        await collector.flush()
      })
    }

    return result
  },
)

/**
 * Array export — mirrors agentProductionFunctions, godentistReminderFunctions, etc.
 * Allows route.ts to spread without care for single-vs-multi function shape.
 */
export const recompraPreloadContextFunctions = [recompraPreloadContext]
