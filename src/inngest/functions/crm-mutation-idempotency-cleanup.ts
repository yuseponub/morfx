// ============================================================================
// Standalone crm-mutation-tools — Wave 0 (D-03)
// Sweeps crm_mutation_idempotency_keys older than 30 days.
// Cron: TZ=America/Bogota 0 3 * * *  (daily 03:00 Bogota — off-peak).
//
// Pattern source: src/inngest/functions/crm-bot-expire-proposals.ts
// (existing TTL sweep cron). Inline `TZ=` prefix since Inngest v3 has no
// separate timezone option.
// ============================================================================

import { inngest } from '@/inngest/client'
import { pruneIdempotencyRows } from '@/lib/domain/crm-mutation-idempotency'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('crm-mutation-idempotency-cleanup')

/**
 * Daily 03:00 Bogota cron — deletes idempotency rows older than 30 days.
 *
 * Uses pruneIdempotencyRows domain helper (sole writer of the table per
 * D-pre-02). Returns { success, data: { deleted } } shape from
 * DomainResult — encoded in step.run return value so Inngest replay
 * boundaries serialize the captured result (Inngest step.run pattern).
 */
export const crmMutationIdempotencyCleanupCron = inngest.createFunction(
  {
    id: 'crm-mutation-idempotency-cleanup',
    name: 'CRM Mutation: Idempotency Cleanup',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 3 * * *' },
  async ({ step }) => {
    const result = await step.run('prune-old-keys', () =>
      pruneIdempotencyRows(30),
    )
    logger.info(
      { result, cronRunAt: new Date().toISOString() },
      'crm-mutation-idempotency-cleanup complete',
    )
    return result
  },
)
