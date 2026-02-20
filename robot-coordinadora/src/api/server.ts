// ============================================================================
// Robot Coordinadora - Express Server
// Health check + batch processing endpoint.
// Wires together types, locking middleware, and CoordinadoraAdapter.
// ============================================================================

import express, { Request, Response } from 'express'
import {
  BatchRequest,
  BatchResponse,
  BatchItemResult,
  OrderInput,
} from '../types/index.js'
import { CoordinadoraAdapter } from '../adapters/coordinadora-adapter.js'
import {
  withWorkspaceLock,
  isWorkspaceLocked,
  tryLockOrder,
  unlockOrder,
} from '../middleware/locks.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Report a single order result to the MorfX callback URL.
 * Swallows errors -- callback failure should NOT stop batch processing.
 */
async function reportResult(callbackUrl: string, result: BatchItemResult): Promise<void> {
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    })
  } catch (err) {
    console.error(`[Server] Error reporting result to callback:`, err)
    // Don't throw -- callback failure shouldn't stop batch processing
  }
}

// ---------------------------------------------------------------------------
// Idempotency Cache
// ---------------------------------------------------------------------------

// Prevents re-processing the same jobId on sequential re-submissions.
// Keyed by jobId, stores the immediate acknowledgement response.
// The workspace lock prevents CONCURRENT duplicates; this cache prevents
// SEQUENTIAL re-submissions (e.g. Inngest retries after response was sent).
const completedJobs = new Map<string, BatchResponse>()

// ---------------------------------------------------------------------------
// Server Factory
// ---------------------------------------------------------------------------

export function createServer(): express.Express {
  const app = express()

  // Body parsing with reasonable size limit
  app.use(express.json({ limit: '5mb' }))

  // Simple request logging
  app.use((req: Request, _res: Response, next) => {
    console.log(`[Server] ${req.method} ${req.path}`)
    next()
  })

  // =========================================================================
  // GET /api/health -- Railway health check
  // =========================================================================

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  })

  // =========================================================================
  // POST /api/crear-pedidos-batch -- Main batch processing endpoint
  // =========================================================================

  app.post('/api/crear-pedidos-batch', (req: Request, res: Response) => {
    const body = req.body as Partial<BatchRequest>

    // ------------------------------------------------------------------
    // a) Validate required fields
    // ------------------------------------------------------------------

    if (!body.workspaceId) {
      res.status(400).json({ success: false, error: 'Campo requerido: workspaceId' })
      return
    }
    if (!body.credentials || !body.credentials.username || !body.credentials.password) {
      res.status(400).json({ success: false, error: 'Campo requerido: credentials (username, password)' })
      return
    }
    if (!body.callbackUrl) {
      res.status(400).json({ success: false, error: 'Campo requerido: callbackUrl' })
      return
    }
    if (!body.jobId) {
      res.status(400).json({ success: false, error: 'Campo requerido: jobId' })
      return
    }
    if (!body.orders || !Array.isArray(body.orders) || body.orders.length === 0) {
      res.status(400).json({ success: false, error: 'Campo requerido: orders (array no vacío)' })
      return
    }

    const { workspaceId, credentials, callbackUrl, jobId, orders } = body as BatchRequest

    // ------------------------------------------------------------------
    // b) Check jobId idempotency cache (sequential re-submissions)
    // ------------------------------------------------------------------

    const cachedResponse = completedJobs.get(jobId)
    if (cachedResponse) {
      console.log(`[Server] Job ${jobId} already processed, returning cached response`)
      res.status(200).json(cachedResponse)
      return
    }

    // ------------------------------------------------------------------
    // c) Check workspace lock (concurrent duplicate batches)
    // ------------------------------------------------------------------

    if (isWorkspaceLocked(workspaceId)) {
      res.status(409).json({
        success: false,
        error: 'Ya hay un batch en proceso para este workspace',
      })
      return
    }

    // ------------------------------------------------------------------
    // d) Pre-validate orders: lightweight city check (ROBOT-02)
    // ------------------------------------------------------------------

    const validOrders: OrderInput[] = []

    for (const order of orders) {
      const ciudad = order.pedidoInput?.ciudad
      if (!ciudad || ciudad.trim() === '') {
        // Report this order as validation error immediately
        reportResult(callbackUrl, {
          itemId: order.itemId,
          status: 'error',
          errorType: 'validation',
          errorMessage: 'Ciudad vacía o no proporcionada',
        }).catch(() => {})
        console.log(`[Server] Order ${order.orderId} rejected: empty ciudad`)
      } else {
        validOrders.push(order)
      }
    }

    if (validOrders.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Todos los pedidos tienen ciudad inválida',
      })
      return
    }

    // ------------------------------------------------------------------
    // e) Acknowledge immediately
    // ------------------------------------------------------------------

    const response: BatchResponse = {
      success: true,
      jobId,
      message: 'Batch aceptado, procesando...',
    }

    // Store in idempotency cache BEFORE sending (prevents race with retries)
    completedJobs.set(jobId, response)

    res.status(200).json(response)

    // ------------------------------------------------------------------
    // f) Process batch in background (fire-and-forget with error handling)
    // ------------------------------------------------------------------

    processBatch(workspaceId, credentials, callbackUrl, validOrders).catch(err => {
      console.error('[Server] Unhandled batch processing error:', err)
    })
  })

  return app
}

// ---------------------------------------------------------------------------
// Background Batch Processing
// ---------------------------------------------------------------------------

async function processBatch(
  workspaceId: string,
  credentials: { username: string; password: string },
  callbackUrl: string,
  orders: OrderInput[],
): Promise<void> {
  await withWorkspaceLock(workspaceId, async () => {
    const adapter = new CoordinadoraAdapter(credentials, workspaceId)

    try {
      // Initialize browser
      await adapter.init()

      // Login -- if this fails, report ALL orders as error
      const loginSuccess = await adapter.login()
      if (!loginSuccess) {
        console.error(`[Server] Login failed for workspace ${workspaceId}`)
        for (const order of orders) {
          await reportResult(callbackUrl, {
            itemId: order.itemId,
            status: 'error',
            errorType: 'portal',
            errorMessage: 'Login fallido en el portal de Coordinadora',
          })
        }
        return
      }

      // Process each order sequentially
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i]

        // Per-order lock: skip if already being processed
        if (!tryLockOrder(order.orderId)) {
          console.log(`[Server] Order ${order.orderId} already locked, skipping`)
          await reportResult(callbackUrl, {
            itemId: order.itemId,
            status: 'error',
            errorType: 'validation',
            errorMessage: 'Pedido ya en proceso',
          })
          continue
        }

        try {
          // Create the shipment on the portal
          const result = await adapter.createGuia(order.pedidoInput)

          // Report result via callback
          // CRITICAL: Use result.numeroPedido (NOT result.numeroGuia) for trackingNumber
          const callbackPayload: BatchItemResult = {
            itemId: order.itemId,
            status: result.success ? 'success' : 'error',
            trackingNumber: result.numeroPedido,
            errorType: result.success ? undefined : 'portal',
            errorMessage: result.error,
          }

          await reportResult(callbackUrl, callbackPayload)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[Server] Error processing order ${order.orderId}:`, err)
          await reportResult(callbackUrl, {
            itemId: order.itemId,
            status: 'error',
            errorType: 'unknown',
            errorMessage: message,
          })
        } finally {
          unlockOrder(order.orderId)
        }

        // Wait between orders to prevent portal overload
        if (i < orders.length - 1) {
          await sleep(2000)
        }
      }
    } catch (err) {
      console.error(`[Server] Fatal batch error for workspace ${workspaceId}:`, err)
      // Report remaining orders as error (best-effort)
      for (const order of orders) {
        await reportResult(callbackUrl, {
          itemId: order.itemId,
          status: 'error',
          errorType: 'unknown',
          errorMessage: 'Error fatal en el procesamiento del batch',
        }).catch(() => {})
      }
    } finally {
      // ALWAYS close adapter to prevent zombie Chromium processes
      await adapter.close()
    }
  })
}
