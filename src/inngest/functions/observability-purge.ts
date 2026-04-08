// ============================================================================
// Phase 42.1 Plan 08: Observability Partition Purge Cron
// Inngest scheduled function that runs nightly at 03:00 America/Bogota and
// (1) ensures next-month's partition exists for the agent_observability_*
// tables, and (2) drops any partitions older than 30 days. Delegates the
// actual schema work to two Postgres RPCs created in Plan 01:
//   - create_observability_partition(target_month date)
//   - drop_observability_partitions_older_than(cutoff date)
//
// Follows the close-stale-sessions.ts pattern (Phase 42 Plan 02).
// Scheduled 1 hour after close-stale-sessions to avoid overlap.
// ============================================================================

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('observability-purge')

/**
 * Observability partition purge (nightly).
 *
 * Runs daily at 03:00 America/Bogota (1 hour after close-stale-sessions).
 *
 * Step 1 — ensure-next-month-partition:
 *   Computes the first day of next month and calls
 *   create_observability_partition(target_month) so the partition exists
 *   BEFORE day 1 of the new month rolls in. The RPC is idempotent: if the
 *   partition already exists, it is a no-op.
 *
 * Step 2 — drop-old-partitions:
 *   Computes a cutoff = (today - 30 days), floored to the start of that
 *   month, and calls drop_observability_partitions_older_than(cutoff). The
 *   RPC drops any partition whose YYYYMM suffix is strictly older than the
 *   cutoff month and returns an array of dropped partition names. If no
 *   partitions qualify, returns an empty result.
 *
 * Cron string uses the inline `TZ=` prefix (Inngest v3.51.0 has no separate
 * timezone option — the prefix is the canonical way per Inngest docs).
 *
 * Errors from either RPC are thrown so Inngest retries once (retries: 1).
 *
 * Feature flag safety:
 *   This cron operates on the schema directly via RPC and does NOT depend on
 *   the observability collector. It is safe to leave active even when the
 *   feature flag is OFF — when no one is writing, the current-month partition
 *   simply has 0 rows and the drop step finds nothing to drop. Inofensivo.
 *
 *   It also runs OUTSIDE any collector AsyncLocalStorage turn context, so
 *   using createAdminClient() (which is instrumented elsewhere) is safe here:
 *   there is no active turn collector to recurse into.
 */
export const observabilityPurgeCron = inngest.createFunction(
  {
    id: 'observability-purge',
    name: 'Observability Partition Purge',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 3 * * *' },
  async ({ step }) => {
    // Step 1: ensure next-month partition exists
    const createdFor = await step.run('ensure-next-month-partition', async () => {
      const supabase = createAdminClient()
      const next = new Date()
      next.setMonth(next.getMonth() + 1)
      next.setDate(1)
      const targetMonth = next.toISOString().slice(0, 10) // 'YYYY-MM-01'
      const { error } = await supabase.rpc('create_observability_partition', {
        target_month: targetMonth,
      })
      if (error) {
        logger.error({ err: error, targetMonth }, 'failed to create next-month partition')
        throw error
      }
      logger.info({ targetMonth }, 'ensured next-month partition exists')
      return targetMonth
    })

    // Step 2: drop partitions older than 30 days
    const dropped = await step.run('drop-old-partitions', async () => {
      const supabase = createAdminClient()
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      cutoff.setDate(1) // floor to start of month 30+ days ago
      const cutoffIso = cutoff.toISOString().slice(0, 10)
      const { data, error } = await supabase.rpc('drop_observability_partitions_older_than', {
        cutoff: cutoffIso,
      })
      if (error) {
        logger.error({ err: error, cutoff: cutoffIso }, 'failed to drop old partitions')
        throw error
      }
      logger.info({ cutoff: cutoffIso, dropped: data }, 'dropped old partitions')
      return data
    })

    logger.info(
      { createdFor, dropped, cronRunAt: new Date().toISOString() },
      'observability-purge cron complete'
    )
    return { createdFor, dropped }
  }
)
