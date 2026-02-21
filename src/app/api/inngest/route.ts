/**
 * Inngest Serve Route
 * Phase 13: Agent Engine Core - Plan 06
 * Updated Phase 16: WhatsApp Agent Integration - Plan 02
 * Updated Phase 17: CRM Automations Engine - Plan 06
 * Updated Phase 23: Inngest Orchestrator + Callback API - Plan 02
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
import { agentProductionFunctions } from '@/inngest/functions/agent-production'
import { automationFunctions } from '@/inngest/functions/automation-runner'
import { taskOverdueCron } from '@/inngest/functions/task-overdue-cron'
import { robotOrchestratorFunctions } from '@/inngest/functions/robot-orchestrator'

/**
 * Serve all Inngest functions.
 * Inngest will call this endpoint to execute functions.
 *
 * Functions served:
 * - data-collection-timer: 6-min timeout for data collection
 * - promos-timer: 10-min timeout for pack selection
 * - ingest-timer: Ingest data collection timeout
 * - whatsapp-agent-processor: Production agent message processing (Phase 16)
 * - automation-*: 10 automation runners for CRM trigger events (Phase 17)
 * - task-overdue-cron: 15-minute cron for overdue task detection (Phase 18)
 * - robot-orchestrator: Robot job dispatch + batch completion wait (Phase 23)
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...agentTimerFunctions,
    ...agentProductionFunctions,
    ...automationFunctions,
    ...robotOrchestratorFunctions,
    taskOverdueCron,
  ],
})
