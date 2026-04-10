// ============================================================================
// Envia Status Polling Cron
// Inngest scheduled function that polls Envia's status API for active guides
// and records state changes in order_carrier_events.
//
// Cron: Every 2h from 5am-7pm Colombia, 7 days/week.
// Pattern follows close-stale-sessions.ts (TZ= prefix, step.run boundaries).
// ============================================================================

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import { fetchEnviaStatus } from '@/lib/carriers/envia-api'
import { insertCarrierEvent, getLastCarrierEvent } from '@/lib/domain/carrier-events'
import type { DomainContext } from '@/lib/domain/types'

const logger = createModuleLogger('envia-status-polling')

interface ActiveGuide {
  orderId: string
  workspaceId: string
  trackingNumber: string
}

interface PollResult {
  orderId: string
  workspaceId: string
  trackingNumber: string
  estado: string
  codEstado: number
  novedades: unknown
  rawResponse: unknown
}

/**
 * Envia status polling cron.
 *
 * Runs every 2 hours from 5am to 7pm Colombia time, 7 days/week.
 * Polls Envia's public status API for all active guides and records
 * state changes in order_carrier_events for future tracking/automation.
 *
 * Three-step pipeline:
 * 1. get-active-guides — find all orders with Envia tracking numbers
 * 2. poll-batch-N — fetch status from Envia API in batches of 20
 * 3. process-changes — detect state changes and insert events
 */
export const enviaStatusPollingCron = inngest.createFunction(
  {
    id: 'envia-status-polling',
    name: 'Envia Status Polling',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 5,7,9,11,13,15,17,19 * * *' },
  async ({ step }) => {
    // ----------------------------------------------------------------
    // Step 1: Get active guides across all workspaces
    // ----------------------------------------------------------------
    const activeGuides = await step.run('get-active-guides', async () => {
      const supabase = createAdminClient()

      // Check if any workspace has polling configured
      const { data: configs } = await supabase
        .from('carrier_configs')
        .select('workspace_id, status_polling_pipeline_id, status_polling_stage_ids')
        .ilike('carrier', '%envia%')
        .not('status_polling_pipeline_id', 'is', null)

      const configuredWorkspaces = (configs ?? []).filter(
        (c) => c.status_polling_pipeline_id && c.status_polling_stage_ids?.length
      )

      let guides: ActiveGuide[] = []

      if (configuredWorkspaces.length > 0) {
        // Filter by configured stages per workspace
        for (const cfg of configuredWorkspaces) {
          const { data: orders } = await supabase
            .from('orders')
            .select('id, workspace_id, tracking_number')
            .eq('workspace_id', cfg.workspace_id)
            .not('tracking_number', 'is', null)
            .ilike('carrier', '%envia%')
            .in('stage_id', cfg.status_polling_stage_ids!)

          if (orders) {
            guides.push(
              ...orders.map((o) => ({
                orderId: o.id,
                workspaceId: o.workspace_id,
                trackingNumber: o.tracking_number!,
              }))
            )
          }
        }
      } else {
        // Observation mode: poll ALL envia orders with tracking numbers
        const { data: orders } = await supabase
          .from('orders')
          .select('id, workspace_id, tracking_number')
          .not('tracking_number', 'is', null)
          .ilike('carrier', '%envia%')

        if (orders) {
          guides = orders.map((o) => ({
            orderId: o.id,
            workspaceId: o.workspace_id,
            trackingNumber: o.tracking_number!,
          }))
        }
      }

      logger.info({ count: guides.length, configured: configuredWorkspaces.length }, 'active guides found')
      return guides
    })

    if (activeGuides.length === 0) {
      logger.info('no active envia guides to poll')
      return { totalGuides: 0, polled: 0, changed: 0, errors: 0 }
    }

    // ----------------------------------------------------------------
    // Step 2: Poll Envia API in batches of 20
    // ----------------------------------------------------------------
    const BATCH_SIZE = 20
    const allResults: PollResult[] = []

    for (let i = 0; i < activeGuides.length; i += BATCH_SIZE) {
      const batchIndex = Math.floor(i / BATCH_SIZE)
      const batch = activeGuides.slice(i, i + BATCH_SIZE)

      const batchResults = await step.run(`poll-batch-${batchIndex}`, async () => {
        const results: PollResult[] = []

        for (const guide of batch) {
          const response = await fetchEnviaStatus(guide.trackingNumber)
          if (response) {
            results.push({
              orderId: guide.orderId,
              workspaceId: guide.workspaceId,
              trackingNumber: guide.trackingNumber,
              estado: response.estado,
              codEstado: response.cod_estadog,
              novedades: response.novedades,
              rawResponse: response,
            })
          }
        }

        return results
      })

      allResults.push(...batchResults)
    }

    // ----------------------------------------------------------------
    // Step 3: Process changes — detect state transitions and insert events
    // ----------------------------------------------------------------
    const summary = await step.run('process-changes', async () => {
      let changed = 0
      let errors = 0

      for (const result of allResults) {
        const ctx: DomainContext = {
          workspaceId: result.workspaceId,
          source: 'cron',
        }

        try {
          const lastEventResult = await getLastCarrierEvent(ctx, result.orderId)

          if (!lastEventResult.success) {
            logger.error({ orderId: result.orderId, error: lastEventResult.error }, 'failed to get last event')
            errors++
            continue
          }

          const lastEvent = lastEventResult.data
          const isNew = !lastEvent
          const stateChanged = lastEvent && lastEvent.cod_estado !== result.codEstado

          if (isNew || stateChanged) {
            const insertResult = await insertCarrierEvent(ctx, {
              orderId: result.orderId,
              guia: result.trackingNumber,
              carrier: 'envia',
              estado: result.estado,
              codEstado: result.codEstado,
              novedades: result.novedades,
              rawResponse: result.rawResponse,
            })

            if (insertResult.success) {
              changed++
              logger.info(
                {
                  orderId: result.orderId,
                  guia: result.trackingNumber,
                  prevCodEstado: lastEvent?.cod_estado ?? null,
                  newCodEstado: result.codEstado,
                  newEstado: result.estado,
                },
                'carrier event recorded'
              )
            } else {
              logger.error({ orderId: result.orderId, error: insertResult.error }, 'failed to insert event')
              errors++
            }

            // Feature flag for auto stage moves (OFF by default)
            const autoStageMove = process.env.ENVIA_AUTO_STAGE_MOVE === 'true'
            if (autoStageMove && stateChanged) {
              logger.info({ orderId: result.orderId, codEstado: result.codEstado }, 'auto-stage-move would fire here')
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.error({ orderId: result.orderId, error: message }, 'unexpected error processing guide')
          errors++
        }
      }

      return { changed, errors }
    })

    const finalSummary = {
      totalGuides: activeGuides.length,
      polled: allResults.length,
      changed: summary.changed,
      errors: summary.errors,
    }

    logger.info(finalSummary, 'envia-status-polling cron complete')
    return finalSummary
  }
)
