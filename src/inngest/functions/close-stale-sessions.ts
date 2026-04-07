// ============================================================================
// Phase 42 Plan 02: Close Stale Agent Sessions Cron
// Inngest scheduled function that runs nightly at 02:00 America/Bogota and
// invokes the close_stale_agent_sessions() RPC (created in 42-01) to close
// sessions with no activity today.
//
// Follows the task-overdue-cron.ts precedent (Phase 18 Plan 09).
// ============================================================================

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('close-stale-sessions')

/**
 * Close stale agent sessions (nightly cleanup).
 *
 * Runs daily at 02:00 America/Bogota. Delegates the actual close logic to the
 * `close_stale_agent_sessions()` Postgres RPC, which returns a single row with
 * a `closed_count` bigint. The RPC owns the "stale" definition (no activity
 * today in America/Bogota timezone), so this function stays thin.
 *
 * Cron string uses the inline `TZ=` prefix because Inngest v3.51.0 has no
 * separate timezone option — the prefix is the canonical way per Inngest docs.
 *
 * Errors from the RPC are thrown so Inngest retries once (retries: 1).
 */
export const closeStaleSessionsCron = inngest.createFunction(
  {
    id: 'close-stale-sessions',
    name: 'Close Stale Agent Sessions',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 2 * * *' },
  async ({ step }) => {
    const result = await step.run('close-stale', async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase.rpc('close_stale_agent_sessions')
      if (error) {
        logger.error({ error }, 'close_stale_agent_sessions RPC failed')
        throw error
      }
      const closedCount = data?.[0]?.closed_count ?? 0
      return { closedCount }
    })

    logger.info(
      { closedCount: result.closedCount, cronRunAt: new Date().toISOString() },
      'close-stale-sessions cron complete'
    )
    return result
  }
)
