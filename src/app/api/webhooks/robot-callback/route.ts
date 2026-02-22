// ============================================================================
// Phase 23: Inngest Orchestrator + Callback API -- Robot Callback Route
// Receives per-order results from robot-coordinadora service.
// Routes updates through domain layer, fires automation triggers,
// and signals batch completion to orchestrator via Inngest event.
//
// Auth: Shared secret via x-callback-secret header (timing-safe comparison)
// Pattern: Follows existing webhook patterns (Shopify, WhatsApp)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { updateJobItemResult } from '@/lib/domain/robot-jobs'
import { emitRobotCoordCompleted } from '@/lib/automations/trigger-emitter'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'

// ============================================================================
// Auth Helper
// ============================================================================

/**
 * Verify callback secret using timing-safe comparison.
 * Returns false if received is null/undefined or lengths don't match.
 */
function verifyCallbackSecret(received: string | null, expected: string): boolean {
  if (!received) return false
  try {
    return crypto.timingSafeEqual(
      Buffer.from(received),
      Buffer.from(expected)
    )
  } catch {
    // timingSafeEqual throws if buffer lengths differ
    return false
  }
}

// ============================================================================
// POST /api/webhooks/robot-callback
// Per-order result from robot-coordinadora service
// ============================================================================

export async function POST(request: NextRequest) {
  // ------------------------------------------------------------------
  // 1. Authenticate via shared secret header
  // ------------------------------------------------------------------
  const secret = request.headers.get('x-callback-secret')
  const expectedSecret = process.env.ROBOT_CALLBACK_SECRET

  if (!expectedSecret || !verifyCallbackSecret(secret, expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ------------------------------------------------------------------
  // 2. Parse and validate payload
  // ------------------------------------------------------------------
  let body: {
    itemId?: string
    status?: 'success' | 'error'
    trackingNumber?: string
    errorType?: 'validation' | 'portal' | 'timeout' | 'unknown'
    errorMessage?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { itemId, status, trackingNumber, errorType, errorMessage } = body

  if (!itemId || !status) {
    return NextResponse.json({ error: 'Missing itemId or status' }, { status: 400 })
  }

  if (status !== 'success' && status !== 'error') {
    return NextResponse.json({ error: 'Invalid status (must be success or error)' }, { status: 400 })
  }

  // ------------------------------------------------------------------
  // 3. Look up item to get workspace context
  // ------------------------------------------------------------------
  const supabase = createAdminClient()

  const { data: item, error: lookupError } = await supabase
    .from('robot_job_items')
    .select('id, job_id, order_id, robot_jobs!inner(workspace_id)')
    .eq('id', itemId)
    .single()

  if (lookupError || !item) {
    console.error(`[robot-callback] Item not found: ${itemId}`, lookupError?.message)
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const jobData = item.robot_jobs as unknown as { workspace_id: string }
  const workspaceId = jobData.workspace_id

  // Minimal lookup: only for the emitRobotCoordCompleted guard in section 5.
  // Field routing (tracking_number vs carrier_guide_number) is handled
  // entirely by the domain layer in updateJobItemResult.
  const { data: parentJob } = await supabase
    .from('robot_jobs')
    .select('job_type')
    .eq('id', item.job_id)
    .single()

  // ------------------------------------------------------------------
  // 4. Call domain layer: updateJobItemResult
  //    Handles idempotency guard, item update, order carrier/tracking,
  //    and counter aggregation with auto-completion.
  // ------------------------------------------------------------------
  const ctx = { workspaceId, source: 'robot-callback' as const }
  const result = await updateJobItemResult(ctx, {
    itemId,
    status,
    trackingNumber,
    errorType,
    errorMessage,
  })

  if (!result.success) {
    console.error(`[robot-callback] Domain update failed for item ${itemId}: ${result.error}`)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // ------------------------------------------------------------------
  // 5. On success: fire automation trigger (robot.coord.completed)
  //    Enrich with order + contact data for rich trigger context.
  //    Trigger failure is caught and logged -- never fails the callback.
  //    SKIP for guide_lookup jobs: field.changed fires from domain layer
  //    via updateOrder -> emitFieldChanged for carrier_guide_number.
  // ------------------------------------------------------------------
  if (status === 'success' && trackingNumber && parentJob?.job_type !== 'guide_lookup') {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select(`
          id, name, total_value, description,
          shipping_address, shipping_city, shipping_department,
          contacts:contact_id (id, name, phone, email)
        `)
        .eq('id', item.order_id)
        .eq('workspace_id', workspaceId)
        .single()

      if (order) {
        const contact = Array.isArray(order.contacts) ? order.contacts[0] : order.contacts
        await emitRobotCoordCompleted({
          workspaceId,
          orderId: order.id,
          orderName: order.name || order.description || undefined,
          trackingNumber,
          carrier: 'COORDINADORA',
          contactId: contact?.id ?? null,
          contactName: contact?.name ?? undefined,
          contactPhone: contact?.phone ?? undefined,
          contactEmail: contact?.email ?? undefined,
          orderValue: order.total_value ?? undefined,
          shippingCity: order.shipping_city ?? undefined,
          shippingAddress: order.shipping_address ?? undefined,
          shippingDepartment: order.shipping_department ?? undefined,
        })
      }
    } catch (err) {
      // Trigger emission failure should NOT fail the callback
      console.error(`[robot-callback] Trigger emission failed for item ${itemId}:`, err)
    }
  }

  // ------------------------------------------------------------------
  // 6. Check if batch completed -> emit robot/job.batch_completed
  //    Re-read job status AFTER domain update. The domain layer atomically
  //    sets status='completed' when success_count + error_count >= total_items,
  //    so we use that as the authoritative guard instead of doing counter
  //    arithmetic ourselves (avoids spurious duplicate events from concurrent
  //    final callbacks).
  // ------------------------------------------------------------------
  const { data: updatedJob } = await supabase
    .from('robot_jobs')
    .select('success_count, error_count, total_items, status')
    .eq('id', item.job_id)
    .single()

  if (updatedJob && updatedJob.status === 'completed') {
    try {
      // MUST await inngest.send in serverless (Vercel can terminate early)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (inngest.send as any)({
        name: 'robot/job.batch_completed',
        data: {
          jobId: item.job_id,
          workspaceId,
          successCount: updatedJob.success_count,
          errorCount: updatedJob.error_count,
        },
      })
      console.log(
        `[robot-callback] Batch completed: job ${item.job_id} (${updatedJob.success_count} success, ${updatedJob.error_count} error)`
      )
    } catch (err) {
      console.error(`[robot-callback] Failed to emit batch_completed:`, err)
    }
  }

  return NextResponse.json({ received: true })
}
