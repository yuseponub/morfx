'use server'

// ============================================================================
// Server Actions — Comandos (Chat de Comandos UI)
// Powers the command execution flow for carrier dispatch and live job monitoring.
//
// Actions:
//   executeSubirOrdenesCoord  — Full flow: credentials -> orders -> validate -> job -> Inngest
//   executeBuscarGuiasCoord   — Full flow: credentials -> pending-guide orders -> job -> Inngest
//   executeLeerGuias          — Full flow: upload images -> OCR job -> Inngest
//   executeGenerarGuiasInter  — Full flow: stage config -> orders -> pdf job -> Inngest
//   executeGenerarGuiasBogota — Full flow: stage config -> orders -> pdf job -> Inngest
//   executeGenerarExcelEnvia  — Full flow: stage config -> orders -> excel job -> Inngest
//   getJobStatus              — Get active job with items (for reconnect)
//   getCommandHistory         — Recent jobs for workspace (history panel)
//   getJobItemsForHistory     — Items for a specific job (expandable detail)
// ============================================================================

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getCarrierCredentials, getDispatchStage, getOcrStage, getGuideGenStage } from '@/lib/domain/carrier-configs'
import { validateCities, type CityValidationItem } from '@/lib/domain/carrier-coverage'
import {
  createRobotJob,
  createOcrRobotJob,
  updateJobStatus,
  getActiveJob,
  getJobHistory,
  getJobWithItems,
  type RobotJob,
  type RobotJobItem,
  type GetJobWithItemsResult,
} from '@/lib/domain/robot-jobs'
import { getOrdersByStage, getOrdersPendingGuide, getOrdersForGuideGeneration, type OrderForDispatch, type OrderPendingGuide } from '@/lib/domain/orders'
import type { PedidoInput } from '@/lib/logistics/constants'
import type { DomainContext } from '@/lib/domain/types'
import { inngest } from '@/inngest/client'

// ============================================================================
// Types
// ============================================================================

interface CommandResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

interface LeerGuiasInput {
  files: Array<{
    fileName: string
    mimeType: string
    base64Data: string
  }>
}

interface LeerGuiasResult {
  jobId: string
  totalFiles: number
}

interface BuscarGuiasResult {
  jobId: string
  totalOrders: number
}

interface GuideGenResult {
  jobId: string
  totalOrders: number
}

interface SubirOrdenesResult {
  jobId: string
  totalOrders: number
  validCount: number
  invalidCount: number
  invalidOrders: Array<{ orderId: string; orderName: string | null; reason: string }>
}

// ============================================================================
// Auth Helper (same pattern as orders.ts)
// ============================================================================

async function getAuthContext(): Promise<{ workspaceId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  return { workspaceId }
}

// ============================================================================
// buildPedidoInputFromOrder (private helper)
// ============================================================================

/**
 * Assemble a PedidoInput from an order and its city validation result.
 * Uses sensible defaults for missing fields.
 */
function buildPedidoInputFromOrder(
  order: OrderForDispatch,
  cityValidation: CityValidationItem
): PedidoInput {
  // Split contact_name into nombres/apellidos
  let nombres = 'Cliente'
  let apellidos = ''
  if (order.contact_name) {
    const parts = order.contact_name.trim().split(/\s+/)
    nombres = parts[0] || 'Cliente'
    apellidos = parts.slice(1).join(' ')
  }

  // Sum product quantities, minimum 1
  const unidades = order.products.reduce((sum, p) => sum + (p.quantity || 0), 0) || 1

  return {
    // Identificacion: use custom field, or phone (10 digits without 57) as fallback
    identificacion: (order.custom_fields?.identificacion as string)
      || (order.contact_phone || '').replace(/\D/g, '').slice(-10)
      || '0000000000',
    nombres,
    apellidos,
    direccion: order.shipping_address || 'Sin direccion',
    ciudad: cityValidation.coordinadoraCity!,
    departamento: cityValidation.departmentAbbrev!,
    celular: (order.contact_phone || '0000000000').replace(/\D/g, '').slice(-10),
    email: order.contact_email || 'sin@email.com',
    referencia: order.name || order.id.slice(0, 8),
    unidades,
    totalConIva: order.total_value || 0,
    valorDeclarado: 55000,
    esRecaudoContraentrega: (order.total_value || 0) > 0,
    peso: 0.08,
    alto: 5,
    largo: 5,
    ancho: 10,
  }
}

// ============================================================================
// executeSubirOrdenesCoord
// ============================================================================

/**
 * Full flow for "subir ordenes coord" command:
 * 1. Validate credentials
 * 2. Get dispatch stage config
 * 3. Check for active jobs
 * 4. Fetch orders from dispatch stage
 * 5. Validate cities
 * 6. Create robot job
 * 7. Build PedidoInput per order
 * 8. Dispatch to Inngest
 */
export async function executeSubirOrdenesCoord(): Promise<CommandResult<SubirOrdenesResult>> {
  try {
    // 1. Auth
    const auth = await getAuthContext()
    if ('error' in auth) return { success: false, error: auth.error }

    const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }

    // 2. Carrier credentials
    const creds = await getCarrierCredentials(ctx)
    if (!creds.success || !creds.data) {
      return { success: false, error: creds.error || 'Credenciales de transportadora no configuradas' }
    }

    // 3. Dispatch stage config
    const dispatchStageResult = await getDispatchStage(ctx)
    if (!dispatchStageResult.success) {
      return { success: false, error: dispatchStageResult.error! }
    }
    if (!dispatchStageResult.data) {
      return {
        success: false,
        error: 'Etapa de despacho no configurada. Configure la etapa en Configuracion > Logistica.',
      }
    }
    const dispatchStage = dispatchStageResult.data

    // 4. Check for existing active create_shipment job (scoped by type — doesn't block guide_lookup jobs)
    const activeJobResult = await getActiveJob(ctx, 'create_shipment')
    if (!activeJobResult.success) {
      return { success: false, error: activeJobResult.error! }
    }
    if (activeJobResult.data) {
      return { success: false, error: 'Ya hay un job activo en progreso' }
    }

    // 5. Fetch orders from dispatch stage
    const ordersResult = await getOrdersByStage(ctx, dispatchStage.stageId)
    if (!ordersResult.success) return { success: false, error: ordersResult.error! }
    const orders = ordersResult.data!

    if (orders.length === 0) {
      return { success: false, error: 'No hay pedidos en la etapa de despacho' }
    }

    // 6. Validate cities
    const validationResult = await validateCities(ctx, {
      cities: orders.map((o) => ({
        city: o.shipping_city || '',
        department: o.shipping_department || '',
        orderId: o.id,
      })),
    })
    if (!validationResult.success) {
      return { success: false, error: validationResult.error! }
    }

    const { results: cityResults } = validationResult.data!

    // Separate valid and invalid orders
    const validCityResults = cityResults.filter((r) => r.isValid)
    const invalidCityResults = cityResults.filter((r) => !r.isValid)

    // Build invalid orders report
    const invalidOrders = invalidCityResults.map((r) => {
      const order = orders.find((o) => o.id === r.orderId)
      return {
        orderId: r.orderId || '',
        orderName: order?.name ?? null,
        reason: !r.city && !r.department
          ? 'Ciudad y departamento vacios'
          : !r.departmentAbbrev
            ? `Departamento no reconocido: "${r.department}"`
            : `Ciudad no encontrada en cobertura: "${r.city}" (${r.department})`,
      }
    })

    if (validCityResults.length === 0) {
      return {
        success: false,
        error: 'Todas las ordenes tienen ciudades invalidas',
        data: {
          jobId: '',
          totalOrders: orders.length,
          validCount: 0,
          invalidCount: invalidCityResults.length,
          invalidOrders,
        },
      }
    }

    // 7. Create robot job (only for valid orders)
    const validOrderIds = validCityResults.map((r) => r.orderId!).filter(Boolean)
    const jobResult = await createRobotJob(ctx, { orderIds: validOrderIds })
    if (!jobResult.success || !jobResult.data) {
      return { success: false, error: jobResult.error || 'Error creando job' }
    }

    // 8. Build PedidoInput for each valid order
    // Map city results by orderId for quick lookup
    const cityResultMap = new Map<string, CityValidationItem>()
    for (const r of validCityResults) {
      if (r.orderId) cityResultMap.set(r.orderId, r)
    }

    const pedidoInputs: PedidoInput[] = jobResult.data.items.map((item) => {
      const order = orders.find((o) => o.id === item.orderId)!
      const cityResult = cityResultMap.get(item.orderId)!
      return buildPedidoInputFromOrder(order, cityResult)
    })

    // 9. Dispatch to Inngest
    // CRITICAL: ALWAYS await inngest.send in serverless (Vercel terminates early otherwise)
    try {
      await (inngest.send as any)({
        name: 'robot/job.submitted',
        data: {
          jobId: jobResult.data.jobId,
          workspaceId: ctx.workspaceId,
          carrier: 'coordinadora',
          credentials: creds.data,
          orders: jobResult.data.items.map((item, idx) => ({
            itemId: item.itemId,
            orderId: item.orderId,
            pedidoInput: pedidoInputs[idx],
          })),
        },
      })
    } catch (sendError) {
      console.error(`[comandos] Inngest send failed for job ${jobResult.data.jobId}:`, sendError)
      try {
        await updateJobStatus(ctx, { jobId: jobResult.data.jobId, status: 'failed' })
      } catch (cleanupError) {
        console.error(`[comandos] Job cleanup also failed:`, cleanupError)
      }
      return {
        success: false,
        error: 'Error iniciando el procesamiento. El job fue cancelado. Intente nuevamente.',
      }
    }

    // 10. Return result
    return {
      success: true,
      data: {
        jobId: jobResult.data.jobId,
        totalOrders: orders.length,
        validCount: validCityResults.length,
        invalidCount: invalidCityResults.length,
        invalidOrders,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[comandos] executeSubirOrdenesCoord error:', message)
    return { success: false, error: message }
  }
}

// ============================================================================
// executeBuscarGuiasCoord
// ============================================================================

/**
 * Full flow for "buscar guias coord" command:
 * 1. Validate credentials
 * 2. Get dispatch stage config
 * 3. Check for active guide_lookup job
 * 4. Get orders with tracking_number but no carrier_guide_number
 * 5. Create robot job (job_type: 'guide_lookup')
 * 6. Dispatch to Inngest
 */
export async function executeBuscarGuiasCoord(): Promise<CommandResult<BuscarGuiasResult>> {
  try {
    // 1. Auth
    const auth = await getAuthContext()
    if ('error' in auth) return { success: false, error: auth.error }

    const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }

    // 2. Carrier credentials (same portal credentials)
    const creds = await getCarrierCredentials(ctx)
    if (!creds.success || !creds.data) {
      return { success: false, error: creds.error || 'Credenciales de transportadora no configuradas' }
    }

    // 3. Dispatch stage config
    const dispatchStageResult = await getDispatchStage(ctx)
    if (!dispatchStageResult.success) {
      return { success: false, error: dispatchStageResult.error! }
    }
    if (!dispatchStageResult.data) {
      return {
        success: false,
        error: 'Etapa de despacho no configurada. Configure la etapa en Configuracion > Logistica.',
      }
    }

    // 4. Check for active guide_lookup job (scoped by type — doesn't block shipment jobs)
    const activeJobResult = await getActiveJob(ctx, 'guide_lookup')
    if (!activeJobResult.success) {
      return { success: false, error: activeJobResult.error! }
    }
    if (activeJobResult.data) {
      return { success: false, error: 'Ya hay una busqueda de guias en progreso' }
    }

    // 5. Get orders pending guide (tracking_number NOT NULL, carrier_guide_number IS NULL)
    const ordersResult = await getOrdersPendingGuide(ctx, dispatchStageResult.data.stageId)
    if (!ordersResult.success) return { success: false, error: ordersResult.error! }
    const orders = ordersResult.data!

    if (orders.length === 0) {
      return { success: false, error: 'No hay ordenes pendientes de guia en la etapa de despacho' }
    }

    // 6. Create robot job (job_type: 'guide_lookup')
    const jobResult = await createRobotJob(ctx, {
      orderIds: orders.map(o => o.id),
      carrier: 'coordinadora',
      jobType: 'guide_lookup',
    })
    if (!jobResult.success || !jobResult.data) {
      return { success: false, error: jobResult.error || 'Error creando job' }
    }

    // 7. Build pedidoNumbers with safe access (Bug #7: no crash on null tracking/item match)
    const pedidoNumbers = orders
      .map(order => {
        const item = jobResult.data?.items.find(i => i.orderId === order.id)
        if (!item || !order.tracking_number) return null
        return {
          itemId: item.itemId,
          orderId: order.id,
          pedidoNumber: order.tracking_number,
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    if (pedidoNumbers.length === 0) {
      return { success: false, error: 'Ninguna orden tiene numero de pedido asignado' }
    }

    // Bug #18: Basic tracking number format validation (soft -- warn, don't block)
    const invalidTrackingOrders = pedidoNumbers.filter(
      p => p.pedidoNumber.length < 3 || p.pedidoNumber.length > 50
    )
    if (invalidTrackingOrders.length > 0) {
      console.warn(`[comandos] ${invalidTrackingOrders.length} orders with suspicious tracking numbers, proceeding anyway`)
    }

    // 8. Dispatch to Inngest
    // CRITICAL: ALWAYS await inngest.send in serverless (Vercel terminates early otherwise)
    try {
      await (inngest.send as any)({
        name: 'robot/guide-lookup.submitted',
        data: {
          jobId: jobResult.data.jobId,
          workspaceId: ctx.workspaceId,
          credentials: creds.data,
          pedidoNumbers,
        },
      })
    } catch (sendError) {
      console.error(`[comandos] Inngest send failed for job ${jobResult.data.jobId}:`, sendError)
      try {
        await updateJobStatus(ctx, { jobId: jobResult.data.jobId, status: 'failed' })
      } catch (cleanupError) {
        console.error(`[comandos] Job cleanup also failed:`, cleanupError)
      }
      return {
        success: false,
        error: 'Error iniciando el procesamiento. El job fue cancelado. Intente nuevamente.',
      }
    }

    return {
      success: true,
      data: {
        jobId: jobResult.data.jobId,
        totalOrders: orders.length,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[comandos] executeBuscarGuiasCoord error:', message)
    return { success: false, error: message }
  }
}

// ============================================================================
// executeLeerGuias
// ============================================================================

/**
 * Full flow for "leer guias" command:
 * 1. Validate auth
 * 2. Upload files to Supabase Storage
 * 3. Check for active OCR job
 * 4. Get dispatch stage config (for matching stage)
 * 5. Create robot job (job_type: 'ocr_guide_read')
 * 6. Dispatch to Inngest with image URLs
 */
export async function executeLeerGuias(
  input: LeerGuiasInput
): Promise<CommandResult<LeerGuiasResult>> {
  try {
    // 1. Auth
    const auth = await getAuthContext()
    if ('error' in auth) return { success: false, error: auth.error }

    const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }

    if (!input.files || input.files.length === 0) {
      return { success: false, error: 'No se adjuntaron archivos. Arrastra o selecciona fotos de guias.' }
    }

    // Validate file types
    const ALLOWED_TYPES = new Set([
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
    ])
    for (const file of input.files) {
      if (!ALLOWED_TYPES.has(file.mimeType)) {
        return {
          success: false,
          error: `Formato no soportado: ${file.fileName}. Solo se aceptan JPG, PNG, WebP y PDF.`,
        }
      }
    }

    // 2. Upload files to Supabase Storage
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    const uploadedItems: Array<{
      fileName: string
      mimeType: string
      imageUrl: string
    }> = []

    for (const file of input.files) {
      const buffer = Buffer.from(file.base64Data, 'base64')
      const filePath = `ocr-guides/${auth.workspaceId}/${Date.now()}-${file.fileName}`

      const { error: uploadError } = await supabase
        .storage
        .from('whatsapp-media')
        .upload(filePath, buffer, {
          contentType: file.mimeType,
          upsert: false,
        })

      if (uploadError) {
        console.error(`[comandos] Storage upload failed for ${file.fileName}:`, uploadError.message)
        return { success: false, error: `Error subiendo ${file.fileName}: ${uploadError.message}` }
      }

      const { data: publicUrlData } = supabase
        .storage
        .from('whatsapp-media')
        .getPublicUrl(filePath)

      uploadedItems.push({
        fileName: file.fileName,
        mimeType: file.mimeType,
        imageUrl: publicUrlData.publicUrl,
      })
    }

    // 3. Check for active OCR job
    const activeJobResult = await getActiveJob(ctx, 'ocr_guide_read')
    if (!activeJobResult.success) {
      return { success: false, error: activeJobResult.error! }
    }
    if (activeJobResult.data) {
      return { success: false, error: 'Ya hay una lectura OCR en progreso' }
    }

    // 4. Get OCR stage config (separate from dispatch stage — for orders awaiting external guides)
    const ocrStageResult = await getOcrStage(ctx)
    if (!ocrStageResult.success) {
      return { success: false, error: ocrStageResult.error! }
    }
    if (!ocrStageResult.data) {
      return {
        success: false,
        error: 'Etapa de lectura OCR no configurada. Configure la etapa en Configuracion > Logistica.',
      }
    }

    // 5. Create robot job + items via domain layer (Bug #10: no raw Supabase inserts)
    const ocrResult = await createOcrRobotJob(ctx, { fileCount: uploadedItems.length })
    if (!ocrResult.success || !ocrResult.data) {
      return { success: false, error: ocrResult.error || 'Error creando job de OCR' }
    }

    // 6. Dispatch to Inngest
    // CRITICAL: ALWAYS await inngest.send in serverless (Vercel terminates early otherwise)
    try {
      await (inngest.send as any)({
        name: 'robot/ocr-guide.submitted',
        data: {
          jobId: ocrResult.data.jobId,
          workspaceId: ctx.workspaceId,
          items: uploadedItems.map((item, idx) => ({
            itemId: ocrResult.data!.itemIds[idx],
            imageUrl: item.imageUrl,
            mimeType: item.mimeType,
            fileName: item.fileName,
          })),
          matchStageId: ocrStageResult.data.stageId,
        },
      })
    } catch (sendError) {
      console.error(`[comandos] Inngest send failed for job ${ocrResult.data.jobId}:`, sendError)
      try {
        await updateJobStatus(ctx, { jobId: ocrResult.data.jobId, status: 'failed' })
      } catch (cleanupError) {
        console.error(`[comandos] Job cleanup also failed:`, cleanupError)
      }
      return {
        success: false,
        error: 'Error iniciando el procesamiento. El job fue cancelado. Intente nuevamente.',
      }
    }

    return {
      success: true,
      data: {
        jobId: ocrResult.data.jobId,
        totalFiles: uploadedItems.length,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[comandos] executeLeerGuias error:', message)
    return { success: false, error: message }
  }
}

// ============================================================================
// executeGenerarGuiasInter
// ============================================================================

/**
 * Full flow for "generar guias inter" command:
 * 1. Validate auth
 * 2. Get guide gen stage config for Inter
 * 3. Check for active pdf_guide_inter job
 * 4. Fetch orders from source stage
 * 5. Create robot job (job_type: 'pdf_guide_inter')
 * 6. Dispatch to Inngest (robot/pdf-guide.submitted)
 */
export async function executeGenerarGuiasInter(): Promise<CommandResult<GuideGenResult>> {
  try {
    // 1. Auth
    const auth = await getAuthContext()
    if ('error' in auth) return { success: false, error: auth.error }

    const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }

    // 2. Guide gen stage config
    const stageResult = await getGuideGenStage(ctx, 'inter')
    if (!stageResult.success) {
      return { success: false, error: stageResult.error! }
    }
    if (!stageResult.data) {
      return {
        success: false,
        error: 'Etapa de generacion Inter no configurada. Configure la etapa en Configuracion > Logistica.',
      }
    }
    const stageConfig = stageResult.data

    // 3. Check for active pdf_guide_inter job
    const activeJobResult = await getActiveJob(ctx, 'pdf_guide_inter')
    if (!activeJobResult.success) {
      return { success: false, error: activeJobResult.error! }
    }
    if (activeJobResult.data) {
      return { success: false, error: 'Ya hay una generacion de guias Inter en progreso' }
    }

    // 4. Fetch orders from source stage
    const ordersResult = await getOrdersForGuideGeneration(ctx, stageConfig.stageId)
    if (!ordersResult.success) return { success: false, error: ordersResult.error! }
    const orders = ordersResult.data!

    if (orders.length === 0) {
      return { success: false, error: 'No hay pedidos en la etapa de generacion Inter' }
    }

    // 5. Create robot job
    const orderIds = orders.map(o => o.id)
    const jobResult = await createRobotJob(ctx, { orderIds, carrier: 'inter', jobType: 'pdf_guide_inter' })
    if (!jobResult.success || !jobResult.data) {
      return { success: false, error: jobResult.error || 'Error creando job' }
    }

    // 6. Dispatch to Inngest
    // CRITICAL: ALWAYS await inngest.send in serverless (Vercel terminates early otherwise)
    try {
      await (inngest.send as any)({
        name: 'robot/pdf-guide.submitted',
        data: {
          jobId: jobResult.data.jobId,
          workspaceId: ctx.workspaceId,
          carrierType: 'inter',
          sourceStageId: stageConfig.stageId,
          destStageId: stageConfig.destStageId,
          orderIds: orderIds,
          items: jobResult.data.items,
        },
      })
    } catch (sendError) {
      console.error(`[comandos] Inngest send failed for job ${jobResult.data.jobId}:`, sendError)
      try {
        await updateJobStatus(ctx, { jobId: jobResult.data.jobId, status: 'failed' })
      } catch (cleanupError) {
        console.error(`[comandos] Job cleanup also failed:`, cleanupError)
      }
      return {
        success: false,
        error: 'Error iniciando el procesamiento. El job fue cancelado. Intente nuevamente.',
      }
    }

    return {
      success: true,
      data: {
        jobId: jobResult.data.jobId,
        totalOrders: orders.length,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[comandos] executeGenerarGuiasInter error:', message)
    return { success: false, error: message }
  }
}

// ============================================================================
// executeGenerarGuiasBogota
// ============================================================================

/**
 * Full flow for "generar guias bogota" command:
 * 1. Validate auth
 * 2. Get guide gen stage config for Bogota
 * 3. Check for active pdf_guide_bogota job
 * 4. Fetch orders from source stage
 * 5. Create robot job (job_type: 'pdf_guide_bogota')
 * 6. Dispatch to Inngest (robot/pdf-guide.submitted)
 */
export async function executeGenerarGuiasBogota(): Promise<CommandResult<GuideGenResult>> {
  try {
    // 1. Auth
    const auth = await getAuthContext()
    if ('error' in auth) return { success: false, error: auth.error }

    const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }

    // 2. Guide gen stage config
    const stageResult = await getGuideGenStage(ctx, 'bogota')
    if (!stageResult.success) {
      return { success: false, error: stageResult.error! }
    }
    if (!stageResult.data) {
      return {
        success: false,
        error: 'Etapa de generacion Bogota no configurada. Configure la etapa en Configuracion > Logistica.',
      }
    }
    const stageConfig = stageResult.data

    // 3. Check for active pdf_guide_bogota job
    const activeJobResult = await getActiveJob(ctx, 'pdf_guide_bogota')
    if (!activeJobResult.success) {
      return { success: false, error: activeJobResult.error! }
    }
    if (activeJobResult.data) {
      return { success: false, error: 'Ya hay una generacion de guias Bogota en progreso' }
    }

    // 4. Fetch orders from source stage
    const ordersResult = await getOrdersForGuideGeneration(ctx, stageConfig.stageId)
    if (!ordersResult.success) return { success: false, error: ordersResult.error! }
    const orders = ordersResult.data!

    if (orders.length === 0) {
      return { success: false, error: 'No hay pedidos en la etapa de generacion Bogota' }
    }

    // 5. Create robot job
    const orderIds = orders.map(o => o.id)
    const jobResult = await createRobotJob(ctx, { orderIds, carrier: 'bogota', jobType: 'pdf_guide_bogota' })
    if (!jobResult.success || !jobResult.data) {
      return { success: false, error: jobResult.error || 'Error creando job' }
    }

    // 6. Dispatch to Inngest
    // CRITICAL: ALWAYS await inngest.send in serverless (Vercel terminates early otherwise)
    try {
      await (inngest.send as any)({
        name: 'robot/pdf-guide.submitted',
        data: {
          jobId: jobResult.data.jobId,
          workspaceId: ctx.workspaceId,
          carrierType: 'bogota',
          sourceStageId: stageConfig.stageId,
          destStageId: stageConfig.destStageId,
          orderIds: orderIds,
          items: jobResult.data.items,
        },
      })
    } catch (sendError) {
      console.error(`[comandos] Inngest send failed for job ${jobResult.data.jobId}:`, sendError)
      try {
        await updateJobStatus(ctx, { jobId: jobResult.data.jobId, status: 'failed' })
      } catch (cleanupError) {
        console.error(`[comandos] Job cleanup also failed:`, cleanupError)
      }
      return {
        success: false,
        error: 'Error iniciando el procesamiento. El job fue cancelado. Intente nuevamente.',
      }
    }

    return {
      success: true,
      data: {
        jobId: jobResult.data.jobId,
        totalOrders: orders.length,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[comandos] executeGenerarGuiasBogota error:', message)
    return { success: false, error: message }
  }
}

// ============================================================================
// executeGenerarExcelEnvia
// ============================================================================

/**
 * Full flow for "generar excel envia" command:
 * 1. Validate auth
 * 2. Get guide gen stage config for Envia
 * 3. Check for active excel_guide_envia job
 * 4. Fetch orders from source stage
 * 5. Create robot job (job_type: 'excel_guide_envia')
 * 6. Dispatch to Inngest (robot/excel-guide.submitted)
 */
export async function executeGenerarExcelEnvia(): Promise<CommandResult<GuideGenResult>> {
  try {
    // 1. Auth
    const auth = await getAuthContext()
    if ('error' in auth) return { success: false, error: auth.error }

    const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }

    // 2. Guide gen stage config
    const stageResult = await getGuideGenStage(ctx, 'envia')
    if (!stageResult.success) {
      return { success: false, error: stageResult.error! }
    }
    if (!stageResult.data) {
      return {
        success: false,
        error: 'Etapa de generacion Envia no configurada. Configure la etapa en Configuracion > Logistica.',
      }
    }
    const stageConfig = stageResult.data

    // 3. Check for active excel_guide_envia job
    const activeJobResult = await getActiveJob(ctx, 'excel_guide_envia')
    if (!activeJobResult.success) {
      return { success: false, error: activeJobResult.error! }
    }
    if (activeJobResult.data) {
      return { success: false, error: 'Ya hay una generacion de Excel Envia en progreso' }
    }

    // 4. Fetch orders from source stage
    const ordersResult = await getOrdersForGuideGeneration(ctx, stageConfig.stageId)
    if (!ordersResult.success) return { success: false, error: ordersResult.error! }
    const orders = ordersResult.data!

    if (orders.length === 0) {
      return { success: false, error: 'No hay pedidos en la etapa de generacion Envia' }
    }

    // 5. Create robot job
    const orderIds = orders.map(o => o.id)
    const jobResult = await createRobotJob(ctx, { orderIds, carrier: 'envia', jobType: 'excel_guide_envia' })
    if (!jobResult.success || !jobResult.data) {
      return { success: false, error: jobResult.error || 'Error creando job' }
    }

    // 6. Dispatch to Inngest
    // CRITICAL: ALWAYS await inngest.send in serverless (Vercel terminates early otherwise)
    try {
      await (inngest.send as any)({
        name: 'robot/excel-guide.submitted',
        data: {
          jobId: jobResult.data.jobId,
          workspaceId: ctx.workspaceId,
          sourceStageId: stageConfig.stageId,
          destStageId: stageConfig.destStageId,
          orderIds: orderIds,
          items: jobResult.data.items,
        },
      })
    } catch (sendError) {
      console.error(`[comandos] Inngest send failed for job ${jobResult.data.jobId}:`, sendError)
      try {
        await updateJobStatus(ctx, { jobId: jobResult.data.jobId, status: 'failed' })
      } catch (cleanupError) {
        console.error(`[comandos] Job cleanup also failed:`, cleanupError)
      }
      return {
        success: false,
        error: 'Error iniciando el procesamiento. El job fue cancelado. Intente nuevamente.',
      }
    }

    return {
      success: true,
      data: {
        jobId: jobResult.data.jobId,
        totalOrders: orders.length,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[comandos] executeGenerarExcelEnvia error:', message)
    return { success: false, error: message }
  }
}

// ============================================================================
// getJobStatus
// ============================================================================

/**
 * Get the currently active job with its items.
 * Returns null if no active job exists.
 * Used by the Realtime hook for initial data fetch on reconnect.
 *
 * @param jobType Optional filter by job_type. When omitted, returns any active job.
 */
export async function getJobStatus(jobType?: string): Promise<CommandResult<GetJobWithItemsResult | null>> {
  try {
    const auth = await getAuthContext()
    if ('error' in auth) return { success: false, error: auth.error }

    const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
    const result = await getActiveJob(ctx, jobType)

    if (!result.success) return { success: false, error: result.error! }
    return { success: true, data: result.data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// getCommandHistory
// ============================================================================

/**
 * Get recent jobs for the workspace (history panel).
 * Returns job summaries without items.
 */
export async function getCommandHistory(): Promise<CommandResult<RobotJob[]>> {
  try {
    const auth = await getAuthContext()
    if ('error' in auth) return { success: false, error: auth.error }

    const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
    const result = await getJobHistory(ctx, 20)

    if (!result.success) return { success: false, error: result.error! }
    return { success: true, data: result.data! }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// getJobItemsForHistory
// ============================================================================

/**
 * Get items for a specific job (expandable detail rows in history panel).
 * Returns just the items array, not the full job.
 */
export async function getJobItemsForHistory(
  jobId: string
): Promise<CommandResult<RobotJobItem[]>> {
  try {
    const auth = await getAuthContext()
    if ('error' in auth) return { success: false, error: auth.error }

    const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
    const result = await getJobWithItems(ctx, jobId)

    if (!result.success) return { success: false, error: result.error! }
    return { success: true, data: result.data!.items }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
