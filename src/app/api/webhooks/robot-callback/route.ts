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
  let body: Record<string, unknown>

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { itemId, status, trackingNumber, errorType, errorMessage } = body as {
    itemId?: unknown
    status?: unknown
    trackingNumber?: unknown
    errorType?: unknown
    errorMessage?: unknown
  }

  // Required fields
  if (!itemId || typeof itemId !== 'string') {
    return NextResponse.json({ error: 'Invalid itemId: must be a non-empty string' }, { status: 400 })
  }

  if (status !== 'success' && status !== 'error') {
    return NextResponse.json({ error: 'Invalid status: must be "success" or "error"' }, { status: 400 })
  }

  // UUID format validation
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(itemId)) {
    return NextResponse.json({ error: 'Invalid itemId: not a valid UUID' }, { status: 400 })
  }

  // Validate tracking number format on success
  const validatedTrackingNumber = typeof trackingNumber === 'string' ? trackingNumber : undefined
  if (status === 'success' && validatedTrackingNumber) {
    if (validatedTrackingNumber.length < 3 || validatedTrackingNumber.length > 50) {
      return NextResponse.json({ error: 'Invalid trackingNumber: length must be between 3 and 50' }, { status: 400 })
    }
  }

  // Validate errorType enum
  const validErrorTypes = ['validation', 'portal', 'timeout', 'unknown'] as const
  type ValidErrorType = typeof validErrorTypes[number]
  let validatedErrorType: ValidErrorType | undefined
  if (status === 'error' && errorType) {
    if (typeof errorType !== 'string' || !validErrorTypes.includes(errorType as ValidErrorType)) {
      return NextResponse.json({ error: `Invalid errorType: must be one of ${validErrorTypes.join(', ')}` }, { status: 400 })
    }
    validatedErrorType = errorType as ValidErrorType
  }

  const validatedErrorMessage = typeof errorMessage === 'string' ? errorMessage.slice(0, 500) : undefined

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
    status: status as 'success' | 'error',
    trackingNumber: validatedTrackingNumber,
    errorType: validatedErrorType,
    errorMessage: validatedErrorMessage,
  })

  if (!result.success) {
    console.error(`[robot-callback] Domain update failed for item ${itemId}: ${result.error}`)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // ------------------------------------------------------------------
  // 5. On success: fire automation trigger (robot.coord.completed)
  //    Enrich with order + contact data for rich trigger context.
  //    Trigger failure is caught and logged -- never fails the callback.
  //    ONLY for create_shipment jobs: guide_lookup uses field.changed from
  //    domain updateOrder, ocr_guide_read emits its own trigger from orchestrator.
  // ------------------------------------------------------------------
  if (status === 'success' && validatedTrackingNumber && parentJob?.job_type === 'create_shipment') {
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
          trackingNumber: validatedTrackingNumber,
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
  //    Uses atomic batch_completed_emitted flag to prevent duplicate events.
  //    Only the first callback to flip the flag from false to true emits.
  //    This replaces the old read-after-update pattern which was race-prone:
  //    two concurrent final callbacks could both read status='completed' and
  //    both emit batch_completed, causing duplicate orchestrator completions.
  // ------------------------------------------------------------------
  const { data: emitGuard } = await supabase
    .from('robot_jobs')
    .update({ batch_completed_emitted: true })
    .eq('id', item.job_id)
    .eq('status', 'completed')
    .eq('batch_completed_emitted', false)
    .select('id, success_count, error_count')
    .maybeSingle()

  if (emitGuard) {
    // This callback won the race -- emit the batch_completed event
    try {
      // MUST await inngest.send in serverless (Vercel can terminate early)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (inngest.send as any)({
        name: 'robot/job.batch_completed',
        data: {
          jobId: item.job_id,
          workspaceId,
          successCount: emitGuard.success_count,
          errorCount: emitGuard.error_count,
        },
      })
      console.log(
        `[robot-callback] Batch completed: job ${item.job_id} (${emitGuard.success_count} success, ${emitGuard.error_count} error)`
      )
    } catch (err) {
      console.error(`[robot-callback] Failed to emit batch_completed for job ${item.job_id}:`, err)
      // Reset the flag so a retry can re-emit
      await supabase
        .from('robot_jobs')
        .update({ batch_completed_emitted: false })
        .eq('id', item.job_id)
      // Return 500 so the robot service retries this callback
      return NextResponse.json(
        { error: 'Failed to notify orchestrator. Please retry.' },
        { status: 500 }
      )
    }
  }
  // If emitGuard is null: either job is not completed yet, or another callback already emitted

  return NextResponse.json({ received: true })
}
