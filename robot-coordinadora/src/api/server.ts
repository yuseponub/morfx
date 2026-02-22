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
  GuideLookupRequest,
  GuideLookupResult,
  GuideLookupItem,
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
 * Forwards the callback secret header for authentication when provided.
 * Swallows errors -- callback failure should NOT stop batch processing.
 * Accepts BatchItemResult or GuideLookupResult (both share the same base shape).
 */
async function reportResult(
  callbackUrl: string,
  result: BatchItemResult | GuideLookupResult,
  callbackSecret?: string
): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (callbackSecret) {
      headers['X-Callback-Secret'] = callbackSecret
    }

    await fetch(callbackUrl, {
      method: 'POST',
      headers,
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
const completedGuideLookups = new Map<string, { success: boolean; jobId: string }>()

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

    const { workspaceId, credentials, callbackUrl, callbackSecret, jobId, orders } = body as BatchRequest

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
        }, callbackSecret).catch(() => {})
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

    processBatch(workspaceId, credentials, callbackUrl, callbackSecret, validOrders).catch(err => {
      console.error('[Server] Unhandled batch processing error:', err)
    })
  })

  // =========================================================================
  // POST /api/buscar-guias -- Guide lookup endpoint (Phase 26)
  // =========================================================================

  app.post('/api/buscar-guias', (req: Request, res: Response) => {
    const body = req.body as Partial<GuideLookupRequest>

    // ------------------------------------------------------------------
    // a) Validate required fields
    // ------------------------------------------------------------------

    if (!body.workspaceId) {
      res.status(400).json({ success: false, error: 'Campo requerido: workspaceId' })
      return
    }
    if (!body.credentials || !body.credentials.username || !body.credentials.password) {
      res.status(400).json({ success: false, error: 'Campo requerido: credentials' })
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
    if (!body.pedidoNumbers || !Array.isArray(body.pedidoNumbers) || body.pedidoNumbers.length === 0) {
      res.status(400).json({ success: false, error: 'Campo requerido: pedidoNumbers (array no vacío)' })
      return
    }

    const { workspaceId, credentials, callbackUrl, callbackSecret, jobId, pedidoNumbers } = body as GuideLookupRequest

    // ------------------------------------------------------------------
    // b) Check jobId idempotency cache
    // ------------------------------------------------------------------

    const cached = completedGuideLookups.get(jobId)
    if (cached) {
      res.status(200).json(cached)
      return
    }

    // ------------------------------------------------------------------
    // c) Check workspace lock (concurrent operations)
    // ------------------------------------------------------------------

    if (isWorkspaceLocked(workspaceId)) {
      res.status(409).json({ success: false, error: 'Ya hay una operación en proceso para este workspace' })
      return
    }

    // ------------------------------------------------------------------
    // d) Acknowledge immediately
    // ------------------------------------------------------------------

    const response = { success: true, jobId }
    completedGuideLookups.set(jobId, response)
    res.status(200).json(response)

    // ------------------------------------------------------------------
    // e) Process in background
    // ------------------------------------------------------------------

    processGuideLookup(workspaceId, credentials, callbackUrl, callbackSecret, jobId, pedidoNumbers)
      .catch(err => console.error('[Server] Guide lookup fatal error:', err))
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
  callbackSecret: string | undefined,
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
          }, callbackSecret)
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
          }, callbackSecret)
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

          await reportResult(callbackUrl, callbackPayload, callbackSecret)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[Server] Error processing order ${order.orderId}:`, err)
          await reportResult(callbackUrl, {
            itemId: order.itemId,
            status: 'error',
            errorType: 'unknown',
            errorMessage: message,
          }, callbackSecret)
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
        }, callbackSecret).catch(() => {})
      }
    } finally {
      // ALWAYS close adapter to prevent zombie Chromium processes
      await adapter.close()
    }
  })
}

// ---------------------------------------------------------------------------
// Background Guide Lookup Processing (Phase 26)
// ---------------------------------------------------------------------------

async function processGuideLookup(
  workspaceId: string,
  credentials: { username: string; password: string },
  callbackUrl: string,
  callbackSecret: string | undefined,
  jobId: string,
  pedidoNumbers: GuideLookupItem[],
): Promise<void> {
  await withWorkspaceLock(workspaceId, async () => {
    const adapter = new CoordinadoraAdapter(credentials, workspaceId)

    try {
      await adapter.init()

      const loginSuccess = await adapter.login()
      if (!loginSuccess) {
        console.error(`[Server] Login failed for guide lookup, workspace ${workspaceId}`)
        for (const item of pedidoNumbers) {
          await reportResult(callbackUrl, {
            itemId: item.itemId,
            status: 'error',
            errorType: 'portal',
            errorMessage: 'Login fallido en el portal de Coordinadora',
          }, callbackSecret)
        }
        return
      }

      // Read the pedidos table once (batch optimized)
      const pedidoNumberStrings = pedidoNumbers.map(p => p.pedidoNumber)
      const guiaMap = await adapter.buscarGuiasPorPedidos(pedidoNumberStrings)

      // Report result for each pedido
      for (const item of pedidoNumbers) {
        const guia = guiaMap.get(item.pedidoNumber)

        const result: GuideLookupResult = {
          itemId: item.itemId,
          status: 'success',  // Always success -- pendiente is not an error
          trackingNumber: guia || undefined,  // Reuse trackingNumber field for the guide
          guideFound: !!guia,
        }

        await reportResult(callbackUrl, result, callbackSecret)
      }

      console.log(`[Server] Guide lookup complete: ${guiaMap.size}/${pedidoNumbers.length} guides found`)
    } catch (err) {
      console.error(`[Server] Fatal guide lookup error for workspace ${workspaceId}:`, err)
      for (const item of pedidoNumbers) {
        await reportResult(callbackUrl, {
          itemId: item.itemId,
          status: 'error',
          errorType: 'unknown',
          errorMessage: 'Error fatal en la búsqueda de guías',
        }, callbackSecret).catch(() => {})
      }
    } finally {
      await adapter.close()
    }
  })
}
