// ============================================================================
// Domain Layer -- Robot Jobs
// Single source of truth for ALL robot job mutations.
// Manages job creation, item result updates, status aggregation,
// and cross-module updates (order tracking_number on success).
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query
//   3. Execute mutation
//   4. Return DomainResult<T>
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { updateOrder } from './orders'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Entity Types
// ============================================================================

export interface RobotJob {
  id: string
  workspace_id: string
  carrier: string
  job_type: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_items: number
  success_count: number
  error_count: number
  idempotency_key: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface RobotJobItem {
  id: string
  job_id: string
  order_id: string
  status: 'pending' | 'processing' | 'success' | 'error'
  tracking_number: string | null
  validated_city: string | null
  value_sent: Record<string, unknown> | null
  error_type: 'validation' | 'portal' | 'timeout' | 'unknown' | null
  error_message: string | null
  retry_count: number
  last_retry_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// Param Types
// ============================================================================

export interface CreateRobotJobParams {
  /** Carrier name. Defaults to 'coordinadora'. */
  carrier?: string
  /** Job type discriminator. Defaults to 'create_shipment'. */
  jobType?: string
  /** Order IDs to include in the batch job. */
  orderIds: string[]
  /** Optional idempotency key to prevent duplicate jobs. */
  idempotencyKey?: string
}

export interface UpdateJobItemResultParams {
  itemId: string
  status: 'success' | 'error'
  /** Tracking number (pedido number) -- set on success. */
  trackingNumber?: string
  /** Coordinadora city string used for the shipment. */
  validatedCity?: string
  /** Snapshot of PedidoInput sent to robot. */
  valueSent?: Record<string, unknown>
  /** Error classification on failure. */
  errorType?: 'validation' | 'portal' | 'timeout' | 'unknown'
  /** Human-readable error message. */
  errorMessage?: string
}

export interface UpdateJobStatusParams {
  jobId: string
  status: 'processing' | 'completed' | 'failed'
}

export interface RetryFailedItemsParams {
  jobId: string
  /** If provided, retry only these specific items. If omitted, retry ALL failed items. */
  itemIds?: string[]
}

// ============================================================================
// Result Types
// ============================================================================

export interface CreateRobotJobResult {
  jobId: string
  itemCount: number
  items: Array<{ itemId: string; orderId: string }>
}

export interface UpdateJobItemResultResult {
  itemId: string
  orderId: string
}

export interface UpdateJobStatusResult {
  jobId: string
}

export interface GetJobWithItemsResult {
  job: RobotJob
  items: RobotJobItem[]
}

export interface RetryFailedItemsResult {
  retriedCount: number
  itemIds: string[]
}

// ============================================================================
// createRobotJob
// ============================================================================

/**
 * Create a robot batch job with one item per order.
 * Validates workspace ownership of all orders and idempotency key uniqueness.
 */
export async function createRobotJob(
  ctx: DomainContext,
  params: CreateRobotJobParams
): Promise<DomainResult<CreateRobotJobResult>> {
  const supabase = createAdminClient()
  const carrier = params.carrier ?? 'coordinadora'

  try {
    if (!params.orderIds.length) {
      return { success: false, error: 'Se requiere al menos un pedido' }
    }

    // Idempotency check: if key provided, reject if an active job already uses it
    if (params.idempotencyKey) {
      const { data: existingJob } = await supabase
        .from('robot_jobs')
        .select('id, status')
        .eq('workspace_id', ctx.workspaceId)
        .eq('idempotency_key', params.idempotencyKey)
        .in('status', ['pending', 'processing'])
        .limit(1)
        .maybeSingle()

      if (existingJob) {
        return {
          success: false,
          error: `Ya existe un job activo con esta clave de idempotencia: ${existingJob.id}`,
        }
      }
    }

    // Verify ALL orders belong to this workspace
    const { data: validOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .eq('workspace_id', ctx.workspaceId)
      .in('id', params.orderIds)

    if (ordersError) {
      return { success: false, error: `Error verificando pedidos: ${ordersError.message}` }
    }

    if (!validOrders || validOrders.length !== params.orderIds.length) {
      const validIds = new Set(validOrders?.map((o) => o.id) ?? [])
      const invalidIds = params.orderIds.filter((id) => !validIds.has(id))
      return {
        success: false,
        error: `Pedidos no encontrados en este workspace: ${invalidIds.join(', ')}`,
      }
    }

    // Insert robot_jobs row
    const { data: job, error: jobError } = await supabase
      .from('robot_jobs')
      .insert({
        workspace_id: ctx.workspaceId,
        carrier,
        job_type: params.jobType ?? 'create_shipment',
        total_items: params.orderIds.length,
        idempotency_key: params.idempotencyKey ?? null,
      })
      .select('id')
      .single()

    if (jobError || !job) {
      return { success: false, error: `Error creando job: ${jobError?.message}` }
    }

    // Insert robot_job_items (one per order)
    const itemsToInsert = params.orderIds.map((orderId) => ({
      job_id: job.id,
      order_id: orderId,
    }))

    const { data: items, error: itemsError } = await supabase
      .from('robot_job_items')
      .insert(itemsToInsert)
      .select('id, order_id')

    if (itemsError || !items) {
      // Manual rollback: delete the job since items failed
      await supabase.from('robot_jobs').delete().eq('id', job.id)
      return { success: false, error: `Error creando items del job: ${itemsError?.message}` }
    }

    return {
      success: true,
      data: {
        jobId: job.id,
        itemCount: items.length,
        items: items.map((item) => ({
          itemId: item.id,
          orderId: item.order_id,
        })),
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// updateJobItemResult
// ============================================================================

/**
 * Update a single job item with success or error result.
 * On success with tracking number, updates the CRM order via orders domain module.
 * Auto-completes the job when all items are done.
 */
export async function updateJobItemResult(
  ctx: DomainContext,
  params: UpdateJobItemResultParams
): Promise<DomainResult<UpdateJobItemResultResult>> {
  const supabase = createAdminClient()

  try {
    // Fetch item with parent job for workspace verification
    const { data: item, error: fetchError } = await supabase
      .from('robot_job_items')
      .select('id, job_id, order_id, status, robot_jobs!inner(workspace_id)')
      .eq('id', params.itemId)
      .single()

    if (fetchError || !item) {
      return { success: false, error: 'Item de job no encontrado' }
    }

    // Verify workspace ownership via parent job
    const jobData = item.robot_jobs as unknown as { workspace_id: string }
    if (jobData.workspace_id !== ctx.workspaceId) {
      return { success: false, error: 'Item no pertenece a este workspace' }
    }

    // Idempotency guard: skip if item is already in a terminal state
    if (item.status === 'success' || item.status === 'error') {
      console.log(`[robot-jobs] Item ${params.itemId} already in terminal state (${item.status}), skipping update`)
      return {
        success: true,
        data: { itemId: params.itemId, orderId: item.order_id },
      }
    }

    // Update item with result
    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('robot_job_items')
      .update({
        status: params.status,
        tracking_number: params.trackingNumber ?? null,
        validated_city: params.validatedCity ?? null,
        value_sent: params.valueSent ?? null,
        error_type: params.status === 'error' ? (params.errorType ?? 'unknown') : null,
        error_message: params.status === 'error' ? (params.errorMessage ?? null) : null,
        completed_at: now,
      })
      .eq('id', params.itemId)

    if (updateError) {
      return { success: false, error: `Error actualizando item: ${updateError.message}` }
    }

    // Fetch parent job type to determine which field to update on the order
    const { data: parentJob } = await supabase
      .from('robot_jobs')
      .select('job_type')
      .eq('id', item.job_id)
      .single()

    // On success: update order through domain module (triggers automation field.changed events)
    // For create_shipment jobs: write tracking_number (pedido number)
    // For guide_lookup jobs: write carrier_guide_number (guide number)
    // The callback reuses the trackingNumber field for both — domain routes to the correct column
    if (params.status === 'success' && params.trackingNumber) {
      if (parentJob?.job_type === 'guide_lookup') {
        await updateOrder(ctx, {
          orderId: item.order_id,
          carrierGuideNumber: params.trackingNumber,
        })
      } else {
        await updateOrder(ctx, {
          orderId: item.order_id,
          trackingNumber: params.trackingNumber,
          carrier: 'COORDINADORA',
        })
      }
    }

    // Update job counters (read-then-write since Supabase JS has no atomic increment)
    const { data: job, error: jobFetchError } = await supabase
      .from('robot_jobs')
      .select('success_count, error_count, total_items')
      .eq('id', item.job_id)
      .single()

    if (jobFetchError || !job) {
      return { success: false, error: 'Error leyendo contadores del job' }
    }

    const newSuccessCount = params.status === 'success'
      ? (job.success_count + 1)
      : job.success_count
    const newErrorCount = params.status === 'error'
      ? (job.error_count + 1)
      : job.error_count

    // Check if all items are now complete
    const allComplete = (newSuccessCount + newErrorCount) >= job.total_items
    const jobUpdate: Record<string, unknown> = {
      success_count: newSuccessCount,
      error_count: newErrorCount,
    }

    if (allComplete) {
      jobUpdate.status = 'completed'
      jobUpdate.completed_at = now
    }

    await supabase
      .from('robot_jobs')
      .update(jobUpdate)
      .eq('id', item.job_id)

    return {
      success: true,
      data: {
        itemId: params.itemId,
        orderId: item.order_id,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// updateJobStatus
// ============================================================================

/**
 * Explicitly update a job's status with appropriate timestamp.
 * Used by the orchestrator to mark jobs as processing, completed, or failed.
 */
export async function updateJobStatus(
  ctx: DomainContext,
  params: UpdateJobStatusParams
): Promise<DomainResult<UpdateJobStatusResult>> {
  const supabase = createAdminClient()

  try {
    // Verify job belongs to workspace
    const { data: job, error: fetchError } = await supabase
      .from('robot_jobs')
      .select('id, status')
      .eq('id', params.jobId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !job) {
      return { success: false, error: 'Job no encontrado en este workspace' }
    }

    // Build update with appropriate timestamp
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = { status: params.status }

    if (params.status === 'processing') {
      updates.started_at = now
    } else if (params.status === 'completed' || params.status === 'failed') {
      updates.completed_at = now
    }

    const { error: updateError } = await supabase
      .from('robot_jobs')
      .update(updates)
      .eq('id', params.jobId)
      .eq('workspace_id', ctx.workspaceId)

    if (updateError) {
      return { success: false, error: `Error actualizando status del job: ${updateError.message}` }
    }

    return {
      success: true,
      data: { jobId: params.jobId },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// getJobWithItems
// ============================================================================

/**
 * Read a job with all its items.
 * Used by Chat de Comandos UI and orchestrator for progress display.
 */
export async function getJobWithItems(
  ctx: DomainContext,
  jobId: string
): Promise<DomainResult<GetJobWithItemsResult>> {
  const supabase = createAdminClient()

  try {
    // Fetch job with workspace check
    const { data: job, error: jobError } = await supabase
      .from('robot_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (jobError || !job) {
      return { success: false, error: 'Job no encontrado en este workspace' }
    }

    // Fetch all items for this job
    const { data: items, error: itemsError } = await supabase
      .from('robot_job_items')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })

    if (itemsError) {
      return { success: false, error: `Error leyendo items del job: ${itemsError.message}` }
    }

    return {
      success: true,
      data: {
        job: job as RobotJob,
        items: (items ?? []) as RobotJobItem[],
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// retryFailedItems
// ============================================================================

/**
 * Reset failed items for retry. Can retry specific items or all failed items in a job.
 * Resets status to pending, increments retry_count, clears error fields.
 * If job was completed/failed, resets job to pending.
 */
export async function retryFailedItems(
  ctx: DomainContext,
  params: RetryFailedItemsParams
): Promise<DomainResult<RetryFailedItemsResult>> {
  const supabase = createAdminClient()

  try {
    // Verify job belongs to workspace
    const { data: job, error: jobError } = await supabase
      .from('robot_jobs')
      .select('id, status, error_count')
      .eq('id', params.jobId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (jobError || !job) {
      return { success: false, error: 'Job no encontrado en este workspace' }
    }

    // Fetch items to retry
    let query = supabase
      .from('robot_job_items')
      .select('id, retry_count')
      .eq('job_id', params.jobId)
      .eq('status', 'error')

    if (params.itemIds && params.itemIds.length > 0) {
      query = query.in('id', params.itemIds)
    }

    const { data: failedItems, error: fetchError } = await query

    if (fetchError) {
      return { success: false, error: `Error buscando items fallidos: ${fetchError.message}` }
    }

    if (!failedItems || failedItems.length === 0) {
      return { success: false, error: 'No se encontraron items fallidos para reintentar' }
    }

    // Reset each failed item
    const now = new Date().toISOString()
    const retriedIds: string[] = []

    for (const item of failedItems) {
      const { error: updateError } = await supabase
        .from('robot_job_items')
        .update({
          status: 'pending',
          retry_count: item.retry_count + 1,
          last_retry_at: now,
          error_type: null,
          error_message: null,
          completed_at: null,
        })
        .eq('id', item.id)

      if (!updateError) {
        retriedIds.push(item.id)
      }
    }

    if (retriedIds.length === 0) {
      return { success: false, error: 'Error reseteando items para reintento' }
    }

    // Update job: subtract retried items from error_count, reset status if needed
    const newErrorCount = Math.max(0, job.error_count - retriedIds.length)
    const jobUpdates: Record<string, unknown> = {
      error_count: newErrorCount,
    }

    // If job was completed or failed, reset to pending for reprocessing
    if (job.status === 'completed' || job.status === 'failed') {
      jobUpdates.status = 'pending'
      jobUpdates.completed_at = null
    }

    await supabase
      .from('robot_jobs')
      .update(jobUpdates)
      .eq('id', params.jobId)

    return {
      success: true,
      data: {
        retriedCount: retriedIds.length,
        itemIds: retriedIds,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// Additional Types (Chat de Comandos UI queries)
// ============================================================================

export interface JobItemWithOrderInfo extends RobotJobItem {
  order_name: string | null
  contact_name: string | null
}

// ============================================================================
// getActiveJob
// ============================================================================

/**
 * Get the currently active (pending or processing) job for a workspace.
 * Returns null if no active job exists.
 * Used by Chat de Comandos UI to detect and reconnect to a running job.
 *
 * @param jobType Optional filter by job_type. When provided, only jobs of that
 *   type are considered active. This allows 'guide_lookup' and 'create_shipment'
 *   jobs to run independently without blocking each other.
 */
export async function getActiveJob(
  ctx: DomainContext,
  jobType?: string
): Promise<DomainResult<GetJobWithItemsResult | null>> {
  const supabase = createAdminClient()

  try {
    let query = supabase
      .from('robot_jobs')
      .select('id')
      .eq('workspace_id', ctx.workspaceId)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (jobType) {
      query = query.eq('job_type', jobType)
    }

    const { data: activeJob, error } = await query.maybeSingle()

    if (error) {
      return { success: false, error: `Error buscando job activo: ${error.message}` }
    }

    if (!activeJob) {
      return { success: true, data: null }
    }

    // Delegate to getJobWithItems for full data
    return getJobWithItems(ctx, activeJob.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// getJobHistory
// ============================================================================

/**
 * Get recent jobs for a workspace, ordered by most recent first.
 * Returns just job rows (no items) -- history panel only shows summaries.
 */
export async function getJobHistory(
  ctx: DomainContext,
  limit: number = 20
): Promise<DomainResult<RobotJob[]>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('robot_jobs')
      .select('*')
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return { success: false, error: `Error leyendo historial de jobs: ${error.message}` }
    }

    return { success: true, data: (data ?? []) as RobotJob[] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// getJobItemsWithOrderInfo
// ============================================================================

/**
 * Get job items with order name and contact name for display.
 * Uses a 2-query approach: fetch items, then batch-fetch order+contact info.
 * Verifies job belongs to workspace before returning data.
 * Powers the "detalle" view when clicking a job in history.
 */
export async function getJobItemsWithOrderInfo(
  ctx: DomainContext,
  jobId: string
): Promise<DomainResult<JobItemWithOrderInfo[]>> {
  const supabase = createAdminClient()

  try {
    // Verify job belongs to workspace
    const { data: job, error: jobError } = await supabase
      .from('robot_jobs')
      .select('id')
      .eq('id', jobId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (jobError || !job) {
      return { success: false, error: 'Job no encontrado en este workspace' }
    }

    // Query 1: Fetch all items for this job
    const { data: items, error: itemsError } = await supabase
      .from('robot_job_items')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })

    if (itemsError) {
      return { success: false, error: `Error leyendo items del job: ${itemsError.message}` }
    }

    if (!items || items.length === 0) {
      return { success: true, data: [] }
    }

    // Query 2: Batch-fetch orders with contact names
    const uniqueOrderIds = [...new Set(items.map((item) => item.order_id))]

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, name, contacts(name)')
      .in('id', uniqueOrderIds)

    if (ordersError) {
      return { success: false, error: `Error leyendo pedidos: ${ordersError.message}` }
    }

    // Build lookup map: orderId -> { orderName, contactName }
    const orderMap = new Map<string, { orderName: string | null; contactName: string | null }>()
    for (const order of orders ?? []) {
      const contact = order.contacts as unknown as { name: string } | null
      orderMap.set(order.id, {
        orderName: order.name,
        contactName: contact?.name ?? null,
      })
    }

    // Map order info onto items
    const enrichedItems: JobItemWithOrderInfo[] = (items as RobotJobItem[]).map((item) => {
      const orderInfo = orderMap.get(item.order_id)
      return {
        ...item,
        order_name: orderInfo?.orderName ?? null,
        contact_name: orderInfo?.contactName ?? null,
      }
    })

    return { success: true, data: enrichedItems }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
