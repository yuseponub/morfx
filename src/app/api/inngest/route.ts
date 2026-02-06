/**
 * Inngest Serve Route
 * Phase 13: Agent Engine Core - Plan 06
 *
 * API endpoint for Inngest to invoke workflow functions.
 * Must be accessible at /api/inngest for Inngest Cloud to call.
 *
 * Inngest will:
 * - POST to this endpoint to execute functions
 * - GET to verify the route and list functions
 * - PUT for batch execution
 */

import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { agentTimerFunctions } from '@/inngest/functions/agent-timers'

/**
 * Serve all Inngest functions.
 * Inngest will call this endpoint to execute functions.
 *
 * Functions served:
 * - data-collection-timer: 6-min timeout for data collection
 * - promos-timer: 10-min timeout for pack selection
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...agentTimerFunctions,
  ],
})
