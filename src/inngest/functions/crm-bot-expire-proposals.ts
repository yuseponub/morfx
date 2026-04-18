// ============================================================================
// Phase 44 Plan 06: Expire CRM Bot Proposed Actions (TTL cron)
// Inngest scheduled function that runs every 1 minute in America/Bogota and
// marks crm_bot_actions rows with status='proposed' as 'expired' once their
// expires_at TTL has passed by more than 30 seconds (grace period mitigates
// Pitfall 7: confirm-mid-flight race).
//
// Follows the close-stale-sessions.ts pattern (Phase 42 Plan 02).
// ============================================================================

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('crm-bot-expire-proposals')

// Grace period past strict TTL. confirmAction uses strict TTL; this cron adds
// 30 seconds before sweeping to avoid racing with a confirm request mid-flight.
// Pitfall 7 from 44-RESEARCH.md: at t = expires_at the confirm endpoint already
// returns `expired`, so at t = expires_at + 30s the cron can sweep safely
// without overlapping with an in-flight confirm decision.
const GRACE_MS = 30 * 1000

/**
 * Expire stale CRM bot proposals (every 1 min).
 *
 * Runs every minute in America/Bogota. Finds crm_bot_actions rows where
 * status='proposed' and expires_at is older than (now - 30s), and flips them
 * to status='expired' in a single UPDATE. Returns { expiredCount, cutoff }.
 *
 * Predicate is intentionally restricted to status='proposed' — rows in
 * 'executed', 'failed', or 'expired' are immutable from this cron's view
 * (T-44-06-01 Tampering mitigation).
 *
 * The `.lt('expires_at', cutoff)` predicate also naturally excludes reader
 * rows where expires_at IS NULL (postgres NULL < anything is unknown/false).
 *
 * Cron string uses the inline `TZ=` prefix because Inngest v3.51.0 has no
 * separate timezone option (same pattern as close-stale-sessions.ts).
 *
 * Errors from the UPDATE are thrown so Inngest retries once (retries: 1).
 */
export const crmBotExpireProposalsCron = inngest.createFunction(
  {
    id: 'crm-bot-expire-proposals',
    name: 'Expire CRM Bot Proposals (TTL)',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota */1 * * * *' },
  async ({ step }) => {
    const result = await step.run('expire-proposed', async () => {
      const supabase = createAdminClient()
      const cutoff = new Date(Date.now() - GRACE_MS).toISOString()

      const { data, error } = await supabase
        .from('crm_bot_actions')
        .update({ status: 'expired' })
        .eq('status', 'proposed')
        .lt('expires_at', cutoff)
        .select('id')

      if (error) {
        logger.error({ error }, 'expire failed')
        throw error
      }
      return { expiredCount: data?.length ?? 0, cutoff }
    })

    logger.info(
      { ...result, cronRunAt: new Date().toISOString() },
      'crm-bot-expire-proposals cron complete',
    )
    return result
  },
)
