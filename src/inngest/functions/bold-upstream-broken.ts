// ============================================================================
// Inngest function — BOLD Robot Upstream Broken (D-07 alert receiver)
//
// Triggered by event `bold-robot/upstream-broken` (fired from
// src/lib/bold/client.ts recordFailureAndMaybeAlert when 3+ consecutive
// failures match REGRESSION_SIGNATURES).
//
// Writes a row to `agent_observability_events` (event_type =
// 'bold_robot_upstream_broken') so the operator can see the alert in the
// observability dashboard within minutes instead of getting a customer
// report 24h later.
//
// Single-flight via concurrency: [{ limit: 1 }] — only one alert at a time
// across all workspaces (the upstream regression is global, not per-tenant).
//
// TODO follow-up: send WhatsApp template `bold_robot_alert` to operator(s).
// Out of scope for initial fix — observability log is sufficient for now.
//
// Standalone: bold-auth0-migration / Plan 03 Task 3.
// ============================================================================

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('bold-upstream-broken')

export const boldUpstreamBroken = inngest.createFunction(
  {
    id: 'bold-upstream-broken',
    name: 'BOLD Robot Upstream Broken — Alert Operator',
    retries: 1,
    // Single-flight: only one alert at a time across all workspaces
    concurrency: [{ key: '"bold-upstream-broken"', limit: 1 }],
  },
  { event: 'bold-robot/upstream-broken' },
  async ({ event, step }) => {
    const { consecutiveFailures, lastErrorMessage, workspaceId, detectedAt } = event.data

    logger.warn(
      { consecutiveFailures, workspaceId, detectedAt, lastErrorMessage },
      'BOLD upstream broken — alerting operator',
    )

    // Look up the workspace owner's phone for WhatsApp notification.
    // For now, log to agent_observability_events; WhatsApp template wire-up can be a follow-up.
    const supabase = createAdminClient()
    await step.run('log-to-observability', async () => {
      await supabase.from('agent_observability_events').insert({
        workspace_id: workspaceId,
        event_type: 'bold_robot_upstream_broken',
        agent_id: 'bold-robot',
        payload: { consecutiveFailures, lastErrorMessage, detectedAt },
      })
    })

    // TODO follow-up: send WhatsApp template `bold_robot_alert` to operator(s).
    // Out of scope for initial fix — observability log is sufficient for now.

    return { alerted: true }
  },
)
