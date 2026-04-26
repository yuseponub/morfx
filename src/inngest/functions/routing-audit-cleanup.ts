// ============================================================================
// agent-lifecycle-router — Plan 01 Task 4 (W-7 fix)
// Inngest scheduled function that runs nightly at 03:00 America/Bogota and
// deletes routing_audit_log rows older than 30 days WHERE reason='matched'.
//
// Other reasons (human_handoff, no_rule_matched, fallback_legacy) are
// preserved indefinitely for audit/forensics.
//
// Follows the observability-purge.ts pattern (Phase 42.1 Plan 08).
// Scheduled at the same hour as observability-purge (03:00 Bogota); both
// run nightly and target different tables, so no contention expected.
// ============================================================================

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('routing-audit-cleanup')

const RETENTION_DAYS = 30
const RETENTION_REASON = 'matched'

/**
 * routing_audit_log retention cleanup (nightly).
 *
 * Runs daily at 03:00 America/Bogota. Deletes only `reason='matched'` rows
 * older than RETENTION_DAYS. Preserves human_handoff / no_rule_matched /
 * fallback_legacy indefinitely as forensic signal of router coverage gaps.
 *
 * Cron string uses the inline `TZ=` prefix (Inngest v3 has no separate
 * timezone option — the prefix is canonical per docs).
 *
 * Errors are thrown so Inngest retries once (retries: 1).
 *
 * Feature flag safety:
 *   The cron operates directly on routing_audit_log via supabase-js. It is
 *   safe to leave active even when no router decisions are being written
 *   (lifecycle_routing_enabled=false everywhere) — the DELETE simply finds
 *   nothing to delete (count=0).
 */
export const routingAuditCleanup = inngest.createFunction(
  {
    id: 'routing-audit-cleanup',
    name: 'Routing audit log retention (30d for matched)',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 3 * * *' },
  async ({ step }) => {
    const result = await step.run('delete-old-matched-rows', async () => {
      const supabase = createAdminClient()
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()

      const { count, error } = await supabase
        .from('routing_audit_log')
        .delete({ count: 'exact' })
        .eq('reason', RETENTION_REASON)
        .lt('created_at', cutoff)

      if (error) {
        logger.error({ err: error, cutoff }, 'failed to delete old matched rows')
        throw error
      }

      const deleted = count ?? 0
      logger.info({ deleted, cutoff }, 'routing-audit-cleanup complete')

      return { deleted, cutoff }
    })

    return {
      deleted: result.deleted,
      cutoff: result.cutoff,
      retentionPolicyDays: RETENTION_DAYS,
      scope: `reason='${RETENTION_REASON}'`,
    }
  },
)
