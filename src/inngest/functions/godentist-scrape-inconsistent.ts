import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('godentist-scrape-inconsistent')

/**
 * Per CONTEXT.md D-08 + RESEARCH.md Pattern 4 (cross-sede canary):
 * Receives the event emitted by src/app/actions/godentist.ts:scrapeAppointments
 * when a (phone) appears in >1 sede within the same scrape — indicates paradigm F
 * invariant violated (correctness by construction failed).
 *
 * V1 behavior: log + persist to agent_observability_events for forensics.
 * V1 does NOT send WhatsApp/email alert — mirrors bold-upstream-broken.ts which
 * also punts notification to TODO. The developer monitors via Inngest dashboard
 * + agent_observability_events query.
 *
 * Concurrency: single-flight per workspace to avoid spam if multiple scrapes
 * fire in flight (e.g., manual user-triggered scrape concurrent with cron).
 */
export const godentistScrapeInconsistent = inngest.createFunction(
  {
    id: 'godentist-scrape-inconsistent',
    name: 'GoDentist Scrape Inconsistent — Cross-Sede Canary Receiver',
    retries: 1,
    concurrency: [{ key: 'event.data.workspaceId', limit: 1 }],
  },
  { event: 'godentist/scrape.inconsistent' },
  async ({ event, step }) => {
    const { workspaceId, scrapedDate, crossSedePhones, detectedAt } = event.data

    logger.warn(
      {
        workspaceId,
        scrapedDate,
        crossSedePhonesCount: crossSedePhones.length,
        detectedAt,
      },
      'GoDentist scrape detected cross-sede contamination — D-07 invariant violated (paradigm F has a grieta)',
    )

    const supabase = createAdminClient()

    await step.run('log-to-observability', async () => {
      const { error } = await supabase.from('agent_observability_events').insert({
        workspace_id: workspaceId,
        event_type: 'godentist_scrape_inconsistent',
        agent_id: 'godentist-robot',
        payload: {
          scrapedDate,
          crossSedePhones,
          detectedAt,
          phonesAffected: crossSedePhones.length,
        },
      })
      if (error) {
        logger.error({ error: error.message, workspaceId, scrapedDate }, 'Failed to insert observability event')
      }
    })

    // TODO follow-up: notify developer via WhatsApp/email when notification path stabilizes.
    // Currently mirrors bold-upstream-broken.ts which also keeps notify as TODO.

    return {
      alerted: true,
      phonesAffected: crossSedePhones.length,
      workspaceId,
    }
  },
)
