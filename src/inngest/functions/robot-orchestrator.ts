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
import { updateJobStatus, updateJobItemResult } from '@/lib/domain/robot-jobs'
import { extractGuideData } from '@/lib/ocr/extract-guide-data'
import { matchGuideToOrder } from '@/lib/ocr/match-guide-to-order'
import { getOrdersForOcrMatching, getOrdersForGuideGeneration, moveOrderToStage, updateOrder } from '@/lib/domain/orders'
import { normalizeOrdersForGuide, normalizedToEnvia } from '@/lib/pdf/normalize-order-data'
import { generateGuidesPdf } from '@/lib/pdf/generate-guide-pdf'
import { generateEnviaExcel } from '@/lib/pdf/generate-envia-excel'
import { emitRobotOcrCompleted } from '@/lib/automations/trigger-emitter'
import type { OcrItemResult, OrderForMatching } from '@/lib/ocr/types'

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
// OCR Guide Orchestrator (Phase 27)
// ============================================================================

/**
 * OCR Guide Orchestrator
 *
 * Processes uploaded guide images/PDFs through Claude Vision,
 * matches extracted data against CRM orders, and updates guide numbers.
 *
 * Unlike robot-orchestrator (dispatches to external service), this runs
 * OCR and matching directly as Inngest steps within MorfX.
 *
 * retries: 0 — consistent with other robot orchestrators (fail-fast)
 * Per-image step.run: one failing image doesn't kill the batch
 */
const ocrGuideOrchestrator = inngest.createFunction(
  {
    id: 'ocr-guide-orchestrator',
    retries: 0,
    onFailure: async ({ event }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalEvent = (event as any).data?.event
      const jobId = originalEvent?.data?.jobId as string | undefined
      const workspaceId = originalEvent?.data?.workspaceId as string | undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMessage = (event as any).data?.error?.message ?? 'Unknown error'

      console.error(`[ocr-guide-orchestrator] Function failed for job ${jobId}:`, errorMessage)

      if (jobId && workspaceId) {
        await updateJobStatus(
          { workspaceId, source: 'inngest-orchestrator' },
          { jobId, status: 'failed' }
        )
        console.log(`[ocr-guide-orchestrator] Marked job ${jobId} as failed via onFailure`)
      }
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { event: 'robot/ocr-guide.submitted' as any },
  async ({ event, step }) => {
    const { jobId, workspaceId, items, matchStageId } = event.data

    console.log(`[ocr-guide-orchestrator] Starting job ${jobId} with ${items.length} images`)

    const ctx = { workspaceId, source: 'inngest-orchestrator' as const }

    // Step 1: Mark job as processing
    await step.run('mark-processing', async () => {
      const result = await updateJobStatus(ctx, { jobId, status: 'processing' })
      if (!result.success) {
        throw new Error(`Failed to mark job processing: ${result.error}`)
      }
    })

    // Step 2: Fetch eligible orders for matching (once, shared across all images)
    const eligibleOrders = await step.run('fetch-eligible-orders', async () => {
      const result = await getOrdersForOcrMatching(ctx, matchStageId)
      if (!result.success) {
        throw new Error(`Failed to fetch eligible orders: ${result.error}`)
      }
      return result.data!
    })

    // Convert to matching format
    const ordersForMatching: OrderForMatching[] = eligibleOrders.map(o => ({
      id: o.id,
      name: o.name,
      contactPhone: o.contactPhone,
      contactName: o.contactName,
      shippingCity: o.shippingCity,
      shippingAddress: o.shippingAddress,
      contactId: o.contactId,
    }))

    // Step 3: OCR each image individually (per-image step for durability)
    const results: OcrItemResult[] = []
    // Track which orders have already been matched (prevent double-assignment)
    const matchedOrderIds = new Set<string>()

    for (const item of items) {
      const result = await step.run(`ocr-${item.itemId}`, async () => {
        try {
          // 3a. Extract guide data via Claude Vision
          const ocrData = await extractGuideData(item.imageUrl, item.mimeType)

          if (ocrData.confianza === 0 && !ocrData.numeroGuia) {
            // OCR completely failed
            return {
              itemId: item.itemId,
              fileName: item.fileName,
              ocrData: null,
              match: null,
              autoAssigned: false,
              error: 'No se pudo leer la guia',
            } satisfies OcrItemResult
          }

          // 3b. Match against eligible orders (exclude already-matched)
          const availableOrders = ordersForMatching.filter(
            o => !matchedOrderIds.has(o.id)
          )
          const match = matchGuideToOrder(ocrData, availableOrders)

          const autoAssigned = match !== null && match.confidence >= 70

          return {
            itemId: item.itemId,
            fileName: item.fileName,
            ocrData,
            match,
            autoAssigned,
          } satisfies OcrItemResult
        } catch (err) {
          console.error(`[ocr-guide-orchestrator] OCR failed for ${item.fileName}:`, err)
          return {
            itemId: item.itemId,
            fileName: item.fileName,
            ocrData: null,
            match: null,
            autoAssigned: false,
            error: err instanceof Error ? err.message : 'Error de OCR',
          } satisfies OcrItemResult
        }
      })

      results.push(result)

      // Track matched order (prevent double-assignment in subsequent images)
      if (result.match && result.autoAssigned) {
        matchedOrderIds.add(result.match.orderId)
      }
    }

    // Step 4: Update orders for auto-assigned matches + mark items
    // IMPORTANT: Store structured OCR metadata in the `value_sent` JSONB column
    // of robot_job_items. This avoids fragile error_message string parsing in the UI.
    // The UI reads value_sent to render the categorized OCR result summary.
    await step.run('update-orders-and-items', async () => {
      for (const result of results) {
        if (result.autoAssigned && result.match && result.ocrData?.numeroGuia) {
          // Auto-assign: update order tracking_number + carrier via domain layer
          await updateOrder(ctx, {
            orderId: result.match.orderId,
            trackingNumber: result.ocrData.numeroGuia,
            carrier: result.ocrData.transportadora.toUpperCase(),
          })

          // Mark item as success in robot_job_items
          // Store structured OCR result in value_sent for UI rendering
          // NOTE: updateJobItemResult skips updateOrder for ocr_guide_read (guard in Task 1)
          await updateJobItemResult(ctx, {
            itemId: result.itemId,
            status: 'success',
            trackingNumber: result.ocrData.numeroGuia,
            valueSent: {
              ocrCategory: 'auto_assigned',
              guideNumber: result.ocrData.numeroGuia,
              orderName: result.match.orderName,
              orderId: result.match.orderId,
              carrier: result.ocrData.transportadora,
              confidence: result.match.confidence,
              matchedBy: result.match.matchedBy,
              fileName: result.fileName,
            },
          })

          // Emit automation trigger per auto-assigned order
          try {
            await emitRobotOcrCompleted({
              workspaceId,
              orderId: result.match.orderId,
              orderName: result.match.orderName ?? undefined,
              carrierGuideNumber: result.ocrData.numeroGuia,
              carrier: result.ocrData.transportadora.toUpperCase(),
              contactId: result.match.contactId,
              contactName: result.match.contactName ?? undefined,
              contactPhone: result.match.contactPhone ?? undefined,
              shippingCity: result.match.shippingCity ?? undefined,
            })
          } catch (err) {
            // Trigger emission failure should NOT fail the job
            console.error(`[ocr-guide-orchestrator] Trigger emission failed:`, err)
          }
        } else if (result.error || !result.ocrData) {
          // OCR failed entirely
          await updateJobItemResult(ctx, {
            itemId: result.itemId,
            status: 'error',
            errorType: 'unknown',
            errorMessage: result.error || 'OCR fallido',
            valueSent: {
              ocrCategory: 'ocr_failed',
              fileName: result.fileName,
            },
          })
        } else if (!result.match) {
          // OCR succeeded but no match found
          await updateJobItemResult(ctx, {
            itemId: result.itemId,
            status: 'error',
            errorType: 'validation',
            errorMessage: `Sin coincidencia: guia ${result.ocrData.numeroGuia || 'sin numero'} (${result.ocrData.transportadora})`,
            valueSent: {
              ocrCategory: 'no_match',
              guideNumber: result.ocrData.numeroGuia,
              carrier: result.ocrData.transportadora,
              fileName: result.fileName,
            },
          })
        } else {
          // Low confidence match (50-69%): mark as error with structured metadata
          await updateJobItemResult(ctx, {
            itemId: result.itemId,
            status: 'error',
            errorType: 'validation',
            errorMessage: `Baja confianza (${result.match.confidence}%): guia ${result.ocrData?.numeroGuia} -> ${result.match.orderName || result.match.orderId.slice(0, 8)}`,
            valueSent: {
              ocrCategory: 'low_confidence',
              guideNumber: result.ocrData?.numeroGuia,
              suggestedOrderName: result.match.orderName,
              suggestedOrderId: result.match.orderId,
              carrier: result.ocrData?.transportadora,
              confidence: result.match.confidence,
              matchedBy: result.match.matchedBy,
              fileName: result.fileName,
            },
          })
        }
      }
    })

    // Step 5: Job completion summary
    const autoAssigned = results.filter(r => r.autoAssigned).length
    const pendingConfirm = results.filter(r => r.match && !r.autoAssigned).length
    const noMatch = results.filter(r => r.ocrData && !r.match).length
    const ocrFailed = results.filter(r => !r.ocrData && !r.autoAssigned).length

    console.log(
      `[ocr-guide-orchestrator] Job ${jobId} done: ${autoAssigned} auto, ${pendingConfirm} pending, ${noMatch} no-match, ${ocrFailed} failed`
    )

    return {
      status: 'completed',
      jobId,
      autoAssigned,
      pendingConfirmation: pendingConfirm,
      noMatch,
      ocrFailed,
      results,
    }
  }
)

// ============================================================================
// PDF Guide Orchestrator (Phase 28)
// ============================================================================

/**
 * PDF Guide Orchestrator
 *
 * Generates multi-page 4x6" shipping label PDFs for Inter Rapidisimo / Bogota
 * carriers. Fetches orders from configured pipeline stage, normalizes data
 * via Claude AI, generates PDF with barcodes, uploads to Supabase Storage,
 * updates job items, and optionally moves orders to destination stage.
 *
 * Unlike robot-orchestrator (dispatches to external service), this runs
 * all processing directly as Inngest steps within MorfX — same pattern
 * as ocrGuideOrchestrator.
 *
 * retries: 0 — consistent with other robot orchestrators (fail-fast)
 * Generate + upload in SAME step to avoid Inngest 4MB step output limit.
 */
const pdfGuideOrchestrator = inngest.createFunction(
  {
    id: 'pdf-guide-orchestrator',
    retries: 0,
    onFailure: async ({ event }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalEvent = (event as any).data?.event
      const jobId = originalEvent?.data?.jobId as string | undefined
      const workspaceId = originalEvent?.data?.workspaceId as string | undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMessage = (event as any).data?.error?.message ?? 'Unknown error'

      console.error(`[pdf-guide-orchestrator] Function failed for job ${jobId}:`, errorMessage)

      if (jobId && workspaceId) {
        await updateJobStatus(
          { workspaceId, source: 'inngest-orchestrator' },
          { jobId, status: 'failed' }
        )
        console.log(`[pdf-guide-orchestrator] Marked job ${jobId} as failed via onFailure`)
      }
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { event: 'robot/pdf-guide.submitted' as any },
  async ({ event, step }) => {
    const { jobId, workspaceId, carrierType, sourceStageId, destStageId, items } = event.data
    const ctx = { workspaceId, source: 'inngest-orchestrator' as const }
    const carrierLabel = carrierType === 'inter' ? 'Inter Rapidisimo' : 'Bogota'

    console.log(`[pdf-guide-orchestrator] Starting job ${jobId} for ${carrierLabel} with ${items.length} orders`)

    // Step 1: Mark job as processing
    await step.run('mark-processing', async () => {
      const result = await updateJobStatus(ctx, { jobId, status: 'processing' })
      if (!result.success) {
        throw new Error(`Failed to mark job processing: ${result.error}`)
      }
    })

    // Step 2: Fetch orders from source stage
    const orders = await step.run('fetch-orders', async () => {
      const result = await getOrdersForGuideGeneration(ctx, sourceStageId)
      if (!result.success) throw new Error(`Failed to fetch orders: ${result.error}`)
      return result.data!
    })

    // Step 3: Normalize data via Claude AI
    const normalized = await step.run('normalize-data', async () => {
      // Map domain OrderForGuideGen to GuideGenOrder format for normalizer
      const guideOrders = orders.map((o) => ({
        id: o.id,
        name: o.name,
        contactName: o.contact_name,
        contactPhone: o.contact_phone,
        shippingAddress: o.shipping_address,
        shippingCity: o.shipping_city,
        shippingDepartment: o.shipping_department,
        totalValue: o.total_value,
        products: o.products,
        customFields: o.custom_fields,
        tags: o.tags,
      }))
      return normalizeOrdersForGuide(guideOrders)
    })

    // Step 4: Generate PDF + upload to Storage (WITHIN SAME STEP to avoid Inngest 4MB limit)
    const downloadUrl = await step.run('generate-and-upload', async () => {
      // Read SOMNIO logo from public/somnio-logo.jpg with graceful fallback
      let logoBuffer: Buffer | undefined
      try {
        const fs = await import('fs')
        const path = await import('path')
        const logoPath = path.join(process.cwd(), 'public', 'somnio-logo.jpg')
        logoBuffer = fs.readFileSync(logoPath)
      } catch (err) {
        console.warn('[pdf-guide-orchestrator] Could not read logo file, generating PDF without logo:', err)
        logoBuffer = undefined
      }

      const pdfBuffer = await generateGuidesPdf(normalized, logoBuffer)

      // Upload to Supabase Storage
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const supabase = createAdminClient()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `guias-${carrierType}-${timestamp}.pdf`
      const filePath = `guide-pdfs/${workspaceId}/${fileName}`

      const { error } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: false })

      if (error) throw new Error(`Storage upload failed: ${error.message}`)

      const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath)
      return data.publicUrl
    })

    // Step 5: Update job items with results
    await step.run('update-items', async () => {
      // Build orderId -> normalized lookup
      const normalizedMap = new Map(normalized.map((n) => [n.orderId, n]))

      for (const item of items) {
        const norm = normalizedMap.get(item.orderId)
        if (norm) {
          await updateJobItemResult(ctx, {
            itemId: item.itemId,
            status: 'success',
            valueSent: {
              documentUrl: downloadUrl,
              carrierType,
              orderName: norm.numero,
              valorCobrar: norm.valorCobrar,
            },
          })
        } else {
          await updateJobItemResult(ctx, {
            itemId: item.itemId,
            status: 'error',
            errorType: 'validation',
            errorMessage: 'Error normalizando datos del pedido',
          })
        }
      }
    })

    // Step 6: Move orders to destination stage (if configured)
    if (destStageId) {
      await step.run('move-orders', async () => {
        for (const item of items) {
          try {
            await moveOrderToStage(ctx, { orderId: item.orderId, newStageId: destStageId })
          } catch (err) {
            console.error(`[pdf-guide-orchestrator] Failed to move order ${item.orderId}:`, err)
            // Don't fail the job for stage move errors
          }
        }
      })
    }

    console.log(`[pdf-guide-orchestrator] Job ${jobId} completed: ${items.length} orders for ${carrierLabel}`)

    return { status: 'completed', jobId, downloadUrl, carrierType, totalOrders: items.length }
  }
)

// ============================================================================
// Excel Guide Orchestrator (Phase 28)
// ============================================================================

/**
 * Excel Guide Orchestrator
 *
 * Generates an Envia-format .xlsx spreadsheet from orders in configured
 * pipeline stage. Fetches orders, normalizes via Claude AI, converts to
 * Envia format, generates Excel, uploads to Supabase Storage, updates
 * job items, and optionally moves orders to destination stage.
 *
 * Same internal-processing pattern as pdfGuideOrchestrator.
 *
 * retries: 0 — consistent with other robot orchestrators (fail-fast)
 * Generate + upload in SAME step to avoid Inngest 4MB step output limit.
 */
const excelGuideOrchestrator = inngest.createFunction(
  {
    id: 'excel-guide-orchestrator',
    retries: 0,
    onFailure: async ({ event }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalEvent = (event as any).data?.event
      const jobId = originalEvent?.data?.jobId as string | undefined
      const workspaceId = originalEvent?.data?.workspaceId as string | undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMessage = (event as any).data?.error?.message ?? 'Unknown error'

      console.error(`[excel-guide-orchestrator] Function failed for job ${jobId}:`, errorMessage)

      if (jobId && workspaceId) {
        await updateJobStatus(
          { workspaceId, source: 'inngest-orchestrator' },
          { jobId, status: 'failed' }
        )
        console.log(`[excel-guide-orchestrator] Marked job ${jobId} as failed via onFailure`)
      }
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { event: 'robot/excel-guide.submitted' as any },
  async ({ event, step }) => {
    const { jobId, workspaceId, sourceStageId, destStageId, items } = event.data
    const ctx = { workspaceId, source: 'inngest-orchestrator' as const }

    console.log(`[excel-guide-orchestrator] Starting job ${jobId} with ${items.length} orders`)

    // Step 1: Mark job as processing
    await step.run('mark-processing', async () => {
      const result = await updateJobStatus(ctx, { jobId, status: 'processing' })
      if (!result.success) {
        throw new Error(`Failed to mark job processing: ${result.error}`)
      }
    })

    // Step 2: Fetch orders from source stage
    const orders = await step.run('fetch-orders', async () => {
      const result = await getOrdersForGuideGeneration(ctx, sourceStageId)
      if (!result.success) throw new Error(`Failed to fetch orders: ${result.error}`)
      return result.data!
    })

    // Step 3: Normalize data via Claude AI
    const normalized = await step.run('normalize-data', async () => {
      // Map domain OrderForGuideGen to GuideGenOrder format for normalizer
      const guideOrders = orders.map((o) => ({
        id: o.id,
        name: o.name,
        contactName: o.contact_name,
        contactPhone: o.contact_phone,
        shippingAddress: o.shipping_address,
        shippingCity: o.shipping_city,
        shippingDepartment: o.shipping_department,
        totalValue: o.total_value,
        products: o.products,
        customFields: o.custom_fields,
        tags: o.tags,
      }))
      return normalizeOrdersForGuide(guideOrders)
    })

    // Step 4: Generate Excel + upload to Storage (WITHIN SAME STEP to avoid Inngest 4MB limit)
    const downloadUrl = await step.run('generate-and-upload', async () => {
      // Convert NormalizedOrder[] to EnviaOrderData[] using helper
      const enviaData = normalized.map(normalizedToEnvia)

      const excelBuffer = await generateEnviaExcel(enviaData)

      // Upload to Supabase Storage
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const supabase = createAdminClient()
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `guias-envia-${timestamp}.xlsx`
      const filePath = `guide-pdfs/${workspaceId}/${fileName}`

      const { error } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, excelBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: false,
        })

      if (error) throw new Error(`Storage upload failed: ${error.message}`)

      const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(filePath)
      return data.publicUrl
    })

    // Step 5: Update job items with results
    await step.run('update-items', async () => {
      const normalizedMap = new Map(normalized.map((n) => [n.orderId, n]))

      for (const item of items) {
        const norm = normalizedMap.get(item.orderId)
        if (norm) {
          await updateJobItemResult(ctx, {
            itemId: item.itemId,
            status: 'success',
            valueSent: {
              documentUrl: downloadUrl,
              carrierType: 'envia',
              orderName: norm.numero,
              valorCobrar: norm.valorCobrar,
            },
          })
        } else {
          await updateJobItemResult(ctx, {
            itemId: item.itemId,
            status: 'error',
            errorType: 'validation',
            errorMessage: 'Error normalizando datos del pedido',
          })
        }
      }
    })

    // Step 6: Move orders to destination stage (if configured)
    if (destStageId) {
      await step.run('move-orders', async () => {
        for (const item of items) {
          try {
            await moveOrderToStage(ctx, { orderId: item.orderId, newStageId: destStageId })
          } catch (err) {
            console.error(`[excel-guide-orchestrator] Failed to move order ${item.orderId}:`, err)
            // Don't fail the job for stage move errors
          }
        }
      })
    }

    console.log(`[excel-guide-orchestrator] Job ${jobId} completed: ${items.length} orders for Envia`)

    return { status: 'completed', jobId, downloadUrl, carrierType: 'envia', totalOrders: items.length }
  }
)

// ============================================================================
// Exports
// ============================================================================

export const robotOrchestratorFunctions = [
  robotOrchestrator,
  guideLookupOrchestrator,
  ocrGuideOrchestrator,
  pdfGuideOrchestrator,
  excelGuideOrchestrator,
]
