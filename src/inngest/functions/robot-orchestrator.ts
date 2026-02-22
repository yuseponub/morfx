// ============================================================================
// Phase 23: Inngest Orchestrator + Callback API -- Robot Orchestrator
// Durable function that dispatches robot jobs to the robot-coordinadora
// service and waits for batch completion with dynamic timeout.
//
// Flow:
//   1. Mark job as processing (domain layer)
//   2. Call robot service HTTP endpoint (dispatch)
//   3. Brief settle sleep (race condition prevention)
//   4. Wait for batch_completed event (with dynamic timeout)
//   5. On timeout: mark job as failed
//
// FAIL-FAST: retries: 0 -- never retry to prevent duplicate submissions
// ============================================================================

import { inngest } from '../client'
import { updateJobStatus } from '@/lib/domain/robot-jobs'

// ============================================================================
// Robot Orchestrator Inngest Function
// ============================================================================

/**
 * Robot Orchestrator
 *
 * Dispatches a robot batch job to the robot-coordinadora service via HTTP,
 * then waits for the batch_completed callback event with a dynamic timeout.
 *
 * retries: 0 is CRITICAL -- a retry would re-submit the same orders to the
 * Coordinadora portal, creating duplicate shipments.
 *
 * onFailure ensures the job is always marked as failed in the database,
 * regardless of which step caused the error.
 */
const robotOrchestrator = inngest.createFunction(
  {
    id: 'robot-orchestrator',
    retries: 0,
    onFailure: async ({ event }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalEvent = (event as any).data?.event
      const jobId = originalEvent?.data?.jobId as string | undefined
      const workspaceId = originalEvent?.data?.workspaceId as string | undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMessage = (event as any).data?.error?.message ?? 'Unknown error'

      console.error(`[robot-orchestrator] Function failed for job ${jobId}:`, errorMessage)

      if (jobId && workspaceId) {
        await updateJobStatus(
          { workspaceId, source: 'inngest-orchestrator' },
          { jobId, status: 'failed' }
        )
        console.log(`[robot-orchestrator] Marked job ${jobId} as failed via onFailure`)
      }
    },
  },
  { event: 'robot/job.submitted' as any },
  async ({ event, step }) => {
    const { jobId, workspaceId, credentials, orders } = event.data

    console.log(`[robot-orchestrator] Starting job ${jobId} with ${orders.length} orders`)

    // Step 1: Mark job as processing
    await step.run('mark-processing', async () => {
      const result = await updateJobStatus(
        { workspaceId, source: 'inngest-orchestrator' },
        { jobId, status: 'processing' }
      )
      if (!result.success) {
        throw new Error(`Failed to mark job processing: ${result.error}`)
      }
      console.log(`[robot-orchestrator] Job ${jobId} marked as processing`)
    })

    // Step 2: Dispatch to robot service via HTTP
    const dispatchResult = await step.run('dispatch-to-robot', async () => {
      const robotUrl = process.env.ROBOT_COORDINADORA_URL
      if (!robotUrl) throw new Error('ROBOT_COORDINADORA_URL env var not set')

      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/robot-callback`
      const callbackSecret = process.env.ROBOT_CALLBACK_SECRET
      if (!callbackSecret) throw new Error('ROBOT_CALLBACK_SECRET env var not set')

      console.log(`[robot-orchestrator] Dispatching job ${jobId} to ${robotUrl}/api/crear-pedidos-batch`)

      const response = await fetch(`${robotUrl}/api/crear-pedidos-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Callback-Secret': callbackSecret,
        },
        body: JSON.stringify({
          workspaceId,
          credentials,
          callbackUrl,
          callbackSecret,
          jobId,
          orders: orders.map((o: { itemId: string; orderId: string; pedidoInput: unknown }) => ({
            itemId: o.itemId,
            orderId: o.orderId,
            pedidoInput: o.pedidoInput,
          })),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new Error(`Robot service error ${response.status}: ${errorText}`)
      }

      const body = await response.json()
      console.log(`[robot-orchestrator] Robot service accepted job ${jobId}`)
      return body
    })

    // Step 3: Brief settle sleep (race condition prevention for tiny batches
    // where the callback might arrive before waitForEvent is registered)
    await step.sleep('settle', '2s')

    // Step 4: Wait for batch_completed event with dynamic timeout
    // Timeout: (N orders x 30s per order) + 5 min margin
    const timeoutMs = (orders.length * 30_000) + (5 * 60_000)

    console.log(`[robot-orchestrator] Waiting for batch completion (timeout: ${Math.round(timeoutMs / 1000)}s)`)

    const batchCompleted = await step.waitForEvent('wait-for-batch', {
      event: 'robot/job.batch_completed',
      timeout: `${timeoutMs}ms`,
      if: `async.data.jobId == "${jobId}"`,
    })

    // Step 5: Handle result
    if (!batchCompleted) {
      // Timeout: mark job as failed
      console.error(`[robot-orchestrator] Job ${jobId} timed out after ${Math.round(timeoutMs / 1000)}s`)
      await step.run('mark-timeout-failed', async () => {
        await updateJobStatus(
          { workspaceId, source: 'inngest-orchestrator' },
          { jobId, status: 'failed' }
        )
      })
      return { status: 'failed', reason: 'timeout', jobId }
    }

    console.log(
      `[robot-orchestrator] Job ${jobId} completed: ${batchCompleted.data.successCount} success, ${batchCompleted.data.errorCount} errors`
    )

    return {
      status: 'completed',
      jobId,
      dispatchResult,
      successCount: batchCompleted.data.successCount,
      errorCount: batchCompleted.data.errorCount,
    }
  }
)

// ============================================================================
// Guide Lookup Orchestrator (Phase 26)
// ============================================================================

/**
 * Guide Lookup Orchestrator
 *
 * Dispatches a guide lookup job to the robot-coordinadora service via HTTP,
 * then waits for the batch_completed callback event with a dynamic timeout.
 *
 * retries: 0 -- a retry would re-read the same portal data unnecessarily
 * and could cause duplicate callbacks. Consistent with robot-orchestrator.
 *
 * Timeout per pedido is shorter (10s vs 30s) since guide lookup reads one
 * page for all pedidos vs navigating per-order forms.
 */
const guideLookupOrchestrator = inngest.createFunction(
  {
    id: 'guide-lookup-orchestrator',
    retries: 0,
    onFailure: async ({ event }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalEvent = (event as any).data?.event
      const jobId = originalEvent?.data?.jobId as string | undefined
      const workspaceId = originalEvent?.data?.workspaceId as string | undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMessage = (event as any).data?.error?.message ?? 'Unknown error'

      console.error(`[guide-lookup-orchestrator] Function failed for job ${jobId}:`, errorMessage)

      if (jobId && workspaceId) {
        await updateJobStatus(
          { workspaceId, source: 'inngest-orchestrator' },
          { jobId, status: 'failed' }
        )
        console.log(`[guide-lookup-orchestrator] Marked job ${jobId} as failed via onFailure`)
      }
    },
  },
  { event: 'robot/guide-lookup.submitted' as any },
  async ({ event, step }) => {
    const { jobId, workspaceId, credentials, pedidoNumbers } = event.data

    console.log(`[guide-lookup-orchestrator] Starting job ${jobId} with ${pedidoNumbers.length} pedidos`)

    // Step 1: Mark job as processing
    await step.run('mark-processing', async () => {
      const result = await updateJobStatus(
        { workspaceId, source: 'inngest-orchestrator' },
        { jobId, status: 'processing' }
      )
      if (!result.success) {
        throw new Error(`Failed to mark job processing: ${result.error}`)
      }
    })

    // Step 2: Dispatch to robot service
    await step.run('dispatch-to-robot', async () => {
      const robotUrl = process.env.ROBOT_COORDINADORA_URL
      if (!robotUrl) throw new Error('ROBOT_COORDINADORA_URL env var not set')

      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/robot-callback`
      const callbackSecret = process.env.ROBOT_CALLBACK_SECRET
      if (!callbackSecret) throw new Error('ROBOT_CALLBACK_SECRET env var not set')

      console.log(`[guide-lookup-orchestrator] Dispatching job ${jobId} to ${robotUrl}/api/buscar-guias`)

      const response = await fetch(`${robotUrl}/api/buscar-guias`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Callback-Secret': callbackSecret,
        },
        body: JSON.stringify({
          workspaceId,
          credentials,
          callbackUrl,
          callbackSecret,
          jobId,
          pedidoNumbers: pedidoNumbers.map((p: { itemId: string; orderId: string; pedidoNumber: string }) => ({
            itemId: p.itemId,
            orderId: p.orderId,
            pedidoNumber: p.pedidoNumber,
          })),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new Error(`Robot service error ${response.status}: ${errorText}`)
      }

      return response.json()
    })

    // Step 3: Settle sleep
    await step.sleep('settle', '2s')

    // Step 4: Wait for batch completion
    // Timeout: shorter than shipment creation (10s per pedido + 3 min margin)
    // Guide lookup reads one page for all pedidos, so it's much faster.
    const timeoutMs = (pedidoNumbers.length * 10_000) + (3 * 60_000)

    console.log(`[guide-lookup-orchestrator] Waiting for batch completion (timeout: ${Math.round(timeoutMs / 1000)}s)`)

    const batchCompleted = await step.waitForEvent('wait-for-batch', {
      event: 'robot/job.batch_completed',
      timeout: `${timeoutMs}ms`,
      if: `async.data.jobId == "${jobId}"`,
    })

    if (!batchCompleted) {
      console.error(`[guide-lookup-orchestrator] Job ${jobId} timed out`)
      await step.run('mark-timeout-failed', async () => {
        await updateJobStatus(
          { workspaceId, source: 'inngest-orchestrator' },
          { jobId, status: 'failed' }
        )
      })
      return { status: 'failed', reason: 'timeout', jobId }
    }

    console.log(
      `[guide-lookup-orchestrator] Job ${jobId} completed: ${batchCompleted.data.successCount} success, ${batchCompleted.data.errorCount} errors`
    )

    return {
      status: 'completed',
      jobId,
      successCount: batchCompleted.data.successCount,
      errorCount: batchCompleted.data.errorCount,
    }
  }
)

// ============================================================================
// Exports
// ============================================================================

export const robotOrchestratorFunctions = [robotOrchestrator, guideLookupOrchestrator]
