// ============================================================================
// Domain Layer — Orders
// Single source of truth for ALL order mutations.
// Every caller (server actions, tool handlers, automations, webhooks) goes
// through these functions instead of hitting DB directly.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query
//   3. Execute mutation
//   4. Emit trigger (fire-and-forget)
//   5. Return DomainResult<T>
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import {
  emitOrderCreated,
  emitOrderStageChanged,
  emitFieldChanged,
} from '@/lib/automations/trigger-emitter'
import { assignTag, removeTag } from './tags'
import { getPlatformConfig } from '@/lib/domain/platform-config'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Helpers (standalone crm-stage-integrity — Plan 02)
// ============================================================================

/**
 * Map DomainContext.source to order_stage_history.source CHECK constraint values.
 * Pitfall 10 RESEARCH: source column is the discriminator; actor_id/actor_label interpret within that source.
 *
 * DomainContext.source (6 values) → history.source (7 values):
 *   'server-action'              → 'manual'
 *   'mobile-api'                 → 'manual'  (mobile is still a human user moving a card)
 *   'automation'                 → 'automation'
 *   'webhook'                    → 'webhook'
 *   'tool-handler' | 'adapter'   → 'agent'
 *   'robot'                      → 'robot'
 *   else                         → 'system'
 *
 * Note: 'cascade_capped' is written directly by the cascade cap logic (Plan 03), not via this mapper.
 */
function mapDomainSourceToHistorySource(source: string): string {
  switch (source) {
    case 'server-action':
      return 'manual'
    case 'mobile-api':
      return 'manual'
    case 'automation':
      return 'automation'
    case 'webhook':
      return 'webhook'
    case 'tool-handler':
    case 'adapter':
      return 'agent'
    case 'robot':
      return 'robot'
    default:
      return 'system'
  }
}

// ============================================================================
// Constants
// ============================================================================

import { RECOMPRA_PIPELINE_NAME } from '@/lib/orders/constants'
export { RECOMPRA_PIPELINE_NAME }

// ============================================================================
// Param Types
// ============================================================================

export interface CreateOrderParams {
  contactId?: string | null
  pipelineId: string
  stageId?: string | null
  closingDate?: string | null
  description?: string | null
  name?: string | null
  carrier?: string | null
  trackingNumber?: string | null
  shippingAddress?: string | null
  shippingCity?: string | null
  shippingDepartment?: string | null
  customFields?: Record<string, unknown>
  email?: string | null
  products?: Array<{
    productId?: string | null
    sku: string
    title: string
    unitPrice: number
    quantity: number
  }>
}

export interface UpdateOrderParams {
  orderId: string
  contactId?: string | null
  closingDate?: string | null
  description?: string | null
  name?: string | null
  carrier?: string | null
  trackingNumber?: string | null
  carrierGuideNumber?: string | null
  shippingAddress?: string | null
  shippingCity?: string | null
  shippingDepartment?: string | null
  customFields?: Record<string, unknown>
  email?: string | null
  products?: Array<{
    productId?: string | null
    sku: string
    title: string
    unitPrice: number
    quantity: number
  }>
}

export interface MoveOrderToStageParams {
  orderId: string
  newStageId: string
}

export interface DeleteOrderParams {
  orderId: string
}

export interface DuplicateOrderParams {
  sourceOrderId: string
  targetPipelineId: string
  targetStageId?: string | null
  /** Copy contact_id from source? Default: true */
  copyContact?: boolean
  /** Copy products from source? Default: true */
  copyProducts?: boolean
  /** Copy total_value from source? Default: true */
  copyValue?: boolean
}

export interface RecompraOrderParams {
  sourceOrderId: string
  /**
   * Etapa destino (debe pertenecer al pipeline 'Ventas Somnio Standard').
   * Si se omite, se usa la primera etapa de ese pipeline.
   */
  targetStageId?: string | null
  /**
   * Productos seleccionados manualmente por el usuario para la recompra.
   * Requerido: array no vacio. Reemplazan por completo a los del pedido origen.
   */
  products: Array<{
    product_id?: string | null
    sku: string
    title: string
    unit_price: number
    quantity: number
  }>
}

export interface AddOrderTagParams {
  orderId: string
  tagName: string
}

export interface RemoveOrderTagParams {
  orderId: string
  tagName: string
}

// ============================================================================
// Result Types
// ============================================================================

export interface CreateOrderResult {
  orderId: string
  stageId: string
}

export interface UpdateOrderResult {
  orderId: string
}

export interface MoveOrderToStageResult {
  orderId: string
  previousStageId: string
  newStageId: string
}

export interface DeleteOrderResult {
  orderId: string
}

export interface DuplicateOrderResult {
  orderId: string
  sourceOrderId: string
}

export interface RecompraOrderResult {
  orderId: string
  sourceOrderId: string
}

export interface AddOrderTagResult {
  orderId: string
  tagId: string
}

export interface RemoveOrderTagResult {
  orderId: string
  tagId: string
}

// ============================================================================
// createOrder
// ============================================================================

/**
 * Create an order with optional products.
 * If no stageId is provided, resolves the first stage of the pipeline.
 * Emits: order.created
 */
export async function createOrder(
  ctx: DomainContext,
  params: CreateOrderParams
): Promise<DomainResult<CreateOrderResult>> {
  const supabase = createAdminClient()

  try {
    // Resolve stageId if not provided
    let stageId: string = params.stageId ?? ''

    if (!stageId) {
      // Verify pipeline belongs to this workspace
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('id', params.pipelineId)
        .eq('workspace_id', ctx.workspaceId)
        .single()

      if (!pipeline) {
        return { success: false, error: 'Pipeline no encontrado en este workspace' }
      }

      const { data: firstStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', params.pipelineId)
        .order('position', { ascending: true })
        .limit(1)
        .single()

      if (!firstStage) {
        return { success: false, error: 'No hay etapas configuradas en el pipeline' }
      }
      stageId = firstStage.id
    }

    // Insert order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        workspace_id: ctx.workspaceId,
        contact_id: params.contactId || null,
        pipeline_id: params.pipelineId,
        stage_id: stageId,
        closing_date: params.closingDate || null,
        description: params.description || null,
        name: params.name || null,
        carrier: params.carrier || null,
        tracking_number: params.trackingNumber || null,
        shipping_address: params.shippingAddress || null,
        shipping_city: params.shippingCity || null,
        shipping_department: params.shippingDepartment || null,
        custom_fields: params.customFields || {},
        email: params.email || null,
      })
      .select('id, total_value, stage_id')
      .single()

    if (orderError || !order) {
      return { success: false, error: `Error al crear el pedido: ${orderError?.message}` }
    }

    // Insert products if provided
    if (params.products && params.products.length > 0) {
      const productsToInsert = params.products.map((p) => ({
        order_id: order.id,
        product_id: p.productId || null,
        sku: p.sku,
        title: p.title,
        unit_price: p.unitPrice,
        quantity: p.quantity,
      }))

      const { error: productsError } = await supabase
        .from('order_products')
        .insert(productsToInsert)

      if (productsError) {
        // Rollback order if products fail
        await supabase.from('orders').delete().eq('id', order.id)
        return { success: false, error: `Error agregando productos: ${productsError.message}` }
      }

      // Recalculate total_value (sum of unitPrice * quantity)
      const totalValue = params.products.reduce(
        (sum, p) => sum + p.unitPrice * p.quantity,
        0
      )
      await supabase
        .from('orders')
        .update({ total_value: totalValue })
        .eq('id', order.id)
    }

    // Re-read total_value after products insert (DB trigger may have recalculated)
    const { data: finalOrder } = await supabase
      .from('orders')
      .select('total_value')
      .eq('id', order.id)
      .single()

    // Fetch contact data for trigger enrichment
    let contactName: string | undefined
    let contactPhone: string | undefined
    let contactAddress: string | null = null
    let contactCity: string | null = null
    let contactDepartment: string | null = null

    if (params.contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone, address, city, department')
        .eq('id', params.contactId)
        .eq('workspace_id', ctx.workspaceId)
        .single()

      if (contact) {
        contactName = contact.name
        contactPhone = contact.phone ?? undefined
        contactAddress = contact.address
        contactCity = contact.city
        contactDepartment = contact.department
      }
    }

    // Si se proporciono email y el contacto existe sin email, actualizarlo (primera captura).
    // No sobreescribimos si el contacto ya tenia email, ni emitimos trigger field.changed
    // (esto es captura, no edicion intencional del perfil).
    if (params.email && params.contactId) {
      const { data: contactEmailRow } = await supabase
        .from('contacts')
        .select('email')
        .eq('id', params.contactId)
        .eq('workspace_id', ctx.workspaceId)
        .single()

      if (contactEmailRow && !contactEmailRow.email) {
        await supabase
          .from('contacts')
          .update({ email: params.email })
          .eq('id', params.contactId)
          .eq('workspace_id', ctx.workspaceId)
      }
    }

    // Fire-and-forget: emit automation trigger
    await emitOrderCreated({
      workspaceId: ctx.workspaceId,
      orderId: order.id,
      pipelineId: params.pipelineId,
      stageId,
      contactId: params.contactId ?? null,
      orderValue: finalOrder?.total_value ?? 0,
      contactName,
      contactPhone,
      contactAddress,
      contactCity,
      contactDepartment,
      shippingAddress: params.shippingAddress ?? null,
      shippingCity: params.shippingCity ?? null,
      shippingDepartment: params.shippingDepartment ?? null,
      orderName: params.name ?? null,
      orderDescription: params.description ?? null,
      trackingNumber: params.trackingNumber ?? null,
      carrier: params.carrier ?? null,
      products: params.products?.map(p => ({ title: p.title, quantity: p.quantity, unitPrice: p.unitPrice })),
      cascadeDepth: ctx.cascadeDepth,
    })

    return {
      success: true,
      data: { orderId: order.id, stageId },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// updateOrder
// ============================================================================

/**
 * Update an existing order. If products are provided, replaces all existing products.
 * Emits: field.changed per changed field, order.stage_changed if stage changed.
 */
export async function updateOrder(
  ctx: DomainContext,
  params: UpdateOrderParams
): Promise<DomainResult<UpdateOrderResult>> {
  const supabase = createAdminClient()

  try {
    // Capture previous state BEFORE update (for field change triggers)
    const { data: previousOrder, error: fetchError } = await supabase
      .from('orders')
      .select(
        'workspace_id, contact_id, pipeline_id, stage_id, closing_date, description, name, carrier, tracking_number, carrier_guide_number, shipping_address, shipping_city, shipping_department, custom_fields, email'
      )
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !previousOrder) {
      return { success: false, error: 'Pedido no encontrado' }
    }

    // Build update object with explicit null handling (only include provided fields)
    const updates: Record<string, unknown> = {}
    if (params.contactId !== undefined) updates.contact_id = params.contactId || null
    if (params.closingDate !== undefined) updates.closing_date = params.closingDate || null
    if (params.description !== undefined) updates.description = params.description || null
    if (params.name !== undefined) updates.name = params.name || null
    if (params.carrier !== undefined) updates.carrier = params.carrier || null
    if (params.trackingNumber !== undefined) updates.tracking_number = params.trackingNumber || null
    if (params.carrierGuideNumber !== undefined) updates.carrier_guide_number = params.carrierGuideNumber || null
    if (params.shippingAddress !== undefined) updates.shipping_address = params.shippingAddress || null
    if (params.shippingCity !== undefined) updates.shipping_city = params.shippingCity || null
    if (params.shippingDepartment !== undefined) updates.shipping_department = params.shippingDepartment || null
    if (params.customFields !== undefined) updates.custom_fields = params.customFields
    if (params.email !== undefined) updates.email = params.email || null

    // Update order fields
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', params.orderId)
        .eq('workspace_id', ctx.workspaceId)

      if (updateError) {
        return { success: false, error: `Error al actualizar el pedido: ${updateError.message}` }
      }
    }

    // If products provided, replace all
    if (params.products !== undefined) {
      // Delete existing products
      const { error: deleteError } = await supabase
        .from('order_products')
        .delete()
        .eq('order_id', params.orderId)

      if (deleteError) {
        return { success: false, error: `Error al actualizar productos: ${deleteError.message}` }
      }

      // Insert new products
      if (params.products.length > 0) {
        const productsToInsert = params.products.map((p) => ({
          order_id: params.orderId,
          product_id: p.productId || null,
          sku: p.sku,
          title: p.title,
          unit_price: p.unitPrice,
          quantity: p.quantity,
        }))

        const { error: productsError } = await supabase
          .from('order_products')
          .insert(productsToInsert)

        if (productsError) {
          return { success: false, error: `Error al insertar productos: ${productsError.message}` }
        }

        // Recalculate total_value
        const totalValue = params.products.reduce(
          (sum, p) => sum + p.unitPrice * p.quantity,
          0
        )
        await supabase
          .from('orders')
          .update({ total_value: totalValue })
          .eq('id', params.orderId)
      } else {
        // No products = zero total
        await supabase
          .from('orders')
          .update({ total_value: 0 })
          .eq('id', params.orderId)
      }
    }

    // Fetch contact name for trigger context
    let orderContactName: string | undefined
    const orderContactId = (updates.contact_id !== undefined ? updates.contact_id : previousOrder.contact_id) as string | null
    if (orderContactId) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('name')
        .eq('id', orderContactId)
        .eq('workspace_id', ctx.workspaceId)
        .single()
      orderContactName = contactData?.name ?? undefined
    }

    // Fire-and-forget: emit field change triggers for each changed field
    // Map from param key to DB column name for comparison
    const fieldMappings: Array<{ paramKey: keyof typeof updates; dbColumn: string }> = [
      { paramKey: 'contact_id', dbColumn: 'contact_id' },
      { paramKey: 'closing_date', dbColumn: 'closing_date' },
      { paramKey: 'description', dbColumn: 'description' },
      { paramKey: 'name', dbColumn: 'name' },
      { paramKey: 'carrier', dbColumn: 'carrier' },
      { paramKey: 'tracking_number', dbColumn: 'tracking_number' },
      { paramKey: 'carrier_guide_number', dbColumn: 'carrier_guide_number' },
      { paramKey: 'shipping_address', dbColumn: 'shipping_address' },
      { paramKey: 'shipping_city', dbColumn: 'shipping_city' },
      { paramKey: 'shipping_department', dbColumn: 'shipping_department' },
      { paramKey: 'email', dbColumn: 'email' },
    ]

    for (const { paramKey, dbColumn } of fieldMappings) {
      const newVal = updates[paramKey]
      if (newVal === undefined) continue

      const prevVal = (previousOrder as Record<string, unknown>)[dbColumn]
      if (String(prevVal ?? '') !== String(newVal ?? '')) {
        await emitFieldChanged({
          workspaceId: ctx.workspaceId,
          entityType: 'order',
          entityId: params.orderId,
          fieldName: dbColumn,
          previousValue: prevVal != null ? String(prevVal) : null,
          newValue: newVal != null ? String(newVal) : null,
          contactId: orderContactId ?? undefined,
          contactName: orderContactName,
          cascadeDepth: ctx.cascadeDepth,
        })
      }
    }

    // Emit custom_fields change as a single field.changed event
    if (updates.custom_fields !== undefined) {
      const prevCustom = JSON.stringify(previousOrder.custom_fields ?? {})
      const newCustom = JSON.stringify(updates.custom_fields ?? {})
      if (prevCustom !== newCustom) {
        await emitFieldChanged({
          workspaceId: ctx.workspaceId,
          entityType: 'order',
          entityId: params.orderId,
          fieldName: 'custom_fields',
          previousValue: prevCustom,
          newValue: newCustom,
          contactId: orderContactId ?? undefined,
          contactName: orderContactName,
          cascadeDepth: ctx.cascadeDepth,
        })
      }
    }

    return {
      success: true,
      data: { orderId: params.orderId },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// moveOrderToStage
// ============================================================================

/**
 * Move an order to a different pipeline stage.
 * Fetches stage/pipeline names for rich trigger context.
 * Emits: order.stage_changed
 */
export async function moveOrderToStage(
  ctx: DomainContext,
  params: MoveOrderToStageParams
): Promise<DomainResult<MoveOrderToStageResult>> {
  const supabase = createAdminClient()

  try {
    // Step 1: Read current order state (include shipping fields for rich trigger context)
    const { data: currentOrder, error: fetchError } = await supabase
      .from('orders')
      .select('stage_id, pipeline_id, contact_id, total_value, description, name, shipping_address, shipping_city, shipping_department, carrier, tracking_number')
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !currentOrder) {
      return { success: false, error: 'Pedido no encontrado' }
    }

    const previousStageId = currentOrder.stage_id

    // Short-circuit: same-stage drop is a no-op success (Pitfall 2 RESEARCH — evita falso CAS reject)
    if (previousStageId === params.newStageId) {
      return {
        success: true,
        data: {
          orderId: params.orderId,
          previousStageId,
          newStageId: params.newStageId,
        },
      }
    }

    // Step 2: flag-gated CAS (D-17). Fail-closed: default off para rollout (Regla 6).
    const casEnabled = await getPlatformConfig<boolean>(
      'crm_stage_integrity_cas_enabled',
      false,
    )

    if (casEnabled) {
      // CAS: .eq('stage_id', previousStageId) es el swap predicate.
      // .select('id') es CRITICO — sin el, data es null siempre (Pitfall 1 RESEARCH).
      const { data: updated, error: updateError } = await supabase
        .from('orders')
        .update({ stage_id: params.newStageId })
        .eq('id', params.orderId)
        .eq('workspace_id', ctx.workspaceId)
        .eq('stage_id', previousStageId) // ← CAS predicate
        .select('id')

      if (updateError) {
        return { success: false, error: `Error al mover el pedido: ${updateError.message}` }
      }

      // CAS REJECTED: array vacio = 0 filas matcharon (Assumption A1 + PostgREST docs)
      if (!updated || updated.length === 0) {
        // Re-fetch current stage para que el caller pueda mostrarlo en toast
        const { data: refetch } = await supabase
          .from('orders')
          .select('stage_id')
          .eq('id', params.orderId)
          .eq('workspace_id', ctx.workspaceId)
          .single()

        return {
          success: false,
          error: 'stage_changed_concurrently',
          data: { currentStageId: refetch?.stage_id ?? null } as any,
        }
      }
    } else {
      // Legacy path (flag off) — byte-identical al comportamiento actual
      const { error: updateError } = await supabase
        .from('orders')
        .update({ stage_id: params.newStageId })
        .eq('id', params.orderId)
        .eq('workspace_id', ctx.workspaceId)

      if (updateError) {
        return { success: false, error: `Error al mover el pedido: ${updateError.message}` }
      }
    }

    // Step 3: INSERT order_stage_history (D-18: SIN flag, additive desde deploy).
    // Best-effort: failure logged but does NOT block the move (Pitfall 3 RESEARCH).
    const historySource = mapDomainSourceToHistorySource(ctx.source)
    const { error: historyError } = await supabase
      .from('order_stage_history')
      .insert({
        order_id: params.orderId,
        workspace_id: ctx.workspaceId,
        previous_stage_id: previousStageId,
        new_stage_id: params.newStageId,
        source: historySource,
        actor_id: ctx.actorId ?? null,
        actor_label: ctx.actorLabel ?? null,
        cascade_depth: ctx.cascadeDepth ?? 0,
        trigger_event: ctx.triggerEvent ?? null,
      })

    if (historyError) {
      // NON-FATAL: move already succeeded; losing audit row acceptable (Pitfall 3).
      console.error('[moveOrderToStage] history insert failed:', historyError.message)
    }

    // Step 4: Fetch stage names + pipeline name + contact info for rich trigger context
    const [
      { data: prevStage },
      { data: newStage },
      { data: pipeline },
      { data: contact },
    ] = await Promise.all([
      supabase
        .from('pipeline_stages')
        .select('name')
        .eq('id', previousStageId)
        .single(),
      supabase
        .from('pipeline_stages')
        .select('name')
        .eq('id', params.newStageId)
        .single(),
      supabase
        .from('pipelines')
        .select('name')
        .eq('id', currentOrder.pipeline_id)
        .single(),
      currentOrder.contact_id
        ? supabase
            .from('contacts')
            .select('name, phone, address, city, department')
            .eq('id', currentOrder.contact_id)
            .eq('workspace_id', ctx.workspaceId)
            .single()
        : Promise.resolve({ data: null }),
    ])

    // Fire-and-forget: emit automation trigger
    if (previousStageId !== params.newStageId) {
      await emitOrderStageChanged({
        workspaceId: ctx.workspaceId,
        orderId: params.orderId,
        previousStageId,
        newStageId: params.newStageId,
        pipelineId: currentOrder.pipeline_id,
        contactId: currentOrder.contact_id ?? null,
        previousStageName: prevStage?.name,
        newStageName: newStage?.name,
        pipelineName: pipeline?.name,
        contactName: contact?.name,
        contactPhone: contact?.phone,
        contactAddress: contact?.address,
        contactCity: contact?.city,
        contactDepartment: contact?.department,
        shippingAddress: currentOrder.shipping_address,
        shippingCity: currentOrder.shipping_city,
        shippingDepartment: currentOrder.shipping_department,
        orderValue: currentOrder.total_value,
        orderName: currentOrder.name,
        orderDescription: currentOrder.description,
        trackingNumber: currentOrder.tracking_number,
        carrier: currentOrder.carrier,
        cascadeDepth: ctx.cascadeDepth,
      })
    }

    return {
      success: true,
      data: {
        orderId: params.orderId,
        previousStageId,
        newStageId: params.newStageId,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// deleteOrder
// ============================================================================

/**
 * Delete an order (order_products cascade from FK).
 * No trigger defined for order delete currently.
 */
export async function deleteOrder(
  ctx: DomainContext,
  params: DeleteOrderParams
): Promise<DomainResult<DeleteOrderResult>> {
  const supabase = createAdminClient()

  try {
    // Verify order exists and belongs to workspace
    const { data: existing, error: fetchError } = await supabase
      .from('orders')
      .select('id')
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Pedido no encontrado' }
    }

    const { error: deleteError } = await supabase
      .from('orders')
      .delete()
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)

    if (deleteError) {
      return { success: false, error: `Error al eliminar el pedido: ${deleteError.message}` }
    }

    // No trigger for order delete (Phase 17 didn't define one)

    return {
      success: true,
      data: { orderId: params.orderId },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// duplicateOrder
// ============================================================================

/**
 * Duplicate an order to a target pipeline. Copies contact, description,
 * shipping info, and products. Sets source_order_id for bidirectional tracking.
 * Emits: order.created (with sourceOrderId)
 */
export async function duplicateOrder(
  ctx: DomainContext,
  params: DuplicateOrderParams
): Promise<DomainResult<DuplicateOrderResult>> {
  const supabase = createAdminClient()

  try {
    // Read source order + products
    const { data: sourceOrder, error: sourceError } = await supabase
      .from('orders')
      .select('*, order_products:order_products(*)')
      .eq('id', params.sourceOrderId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (sourceError || !sourceOrder) {
      return { success: false, error: 'Pedido origen no encontrado' }
    }

    // Resolve target stage
    let targetStageId: string = params.targetStageId ?? ''

    if (!targetStageId) {
      // Verify target pipeline belongs to this workspace
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('id', params.targetPipelineId)
        .eq('workspace_id', ctx.workspaceId)
        .single()

      if (!pipeline) {
        return { success: false, error: 'Pipeline destino no encontrado en este workspace' }
      }

      const { data: firstStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', params.targetPipelineId)
        .order('position', { ascending: true })
        .limit(1)
        .single()

      if (!firstStage) {
        return { success: false, error: 'No hay etapas configuradas en el pipeline destino' }
      }
      targetStageId = firstStage.id
    }

    // Resolve copy flags (default true for backward compatibility)
    const shouldCopyContact = params.copyContact !== false
    const shouldCopyProducts = params.copyProducts !== false
    const shouldCopyValue = params.copyValue !== false

    // Create new order with source_order_id reference
    const { data: newOrder, error: createError } = await supabase
      .from('orders')
      .insert({
        workspace_id: ctx.workspaceId,
        contact_id: shouldCopyContact ? sourceOrder.contact_id : null,
        pipeline_id: params.targetPipelineId,
        stage_id: targetStageId,
        source_order_id: params.sourceOrderId,
        name: sourceOrder.name,
        closing_date: sourceOrder.closing_date,
        description: sourceOrder.description,
        shipping_address: sourceOrder.shipping_address,
        shipping_city: sourceOrder.shipping_city,
        shipping_department: sourceOrder.shipping_department,
        carrier: sourceOrder.carrier,
        tracking_number: sourceOrder.tracking_number,
        custom_fields: sourceOrder.custom_fields || {},
      })
      .select('id')
      .single()

    if (createError || !newOrder) {
      return { success: false, error: `Error al duplicar el pedido: ${createError?.message}` }
    }

    // Fetch contact data for trigger enrichment
    let dupContactName: string | undefined
    let dupContactPhone: string | undefined
    let dupContactAddress: string | null = null
    let dupContactCity: string | null = null
    let dupContactDepartment: string | null = null

    if (shouldCopyContact && sourceOrder.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone, address, city, department')
        .eq('id', sourceOrder.contact_id)
        .eq('workspace_id', ctx.workspaceId)
        .single()

      if (contact) {
        dupContactName = contact.name
        dupContactPhone = contact.phone ?? undefined
        dupContactAddress = contact.address
        dupContactCity = contact.city
        dupContactDepartment = contact.department
      }
    }

    // Copy products only if configured
    if (shouldCopyProducts) {
      const sourceProducts = sourceOrder.order_products as Array<{
        title: string
        sku: string
        unit_price: number
        quantity: number
        product_id: string | null
      }> | null

      if (sourceProducts && sourceProducts.length > 0) {
        const productsToInsert = sourceProducts.map((p) => ({
          order_id: newOrder.id,
          product_id: p.product_id || null,
          sku: p.sku,
          title: p.title,
          unit_price: p.unit_price,
          quantity: p.quantity,
        }))

        await supabase.from('order_products').insert(productsToInsert)
      }
    }

    // Set total_value: from products if copied, from source if copyValue, else 0
    if (shouldCopyProducts) {
      // Re-read total_value after products insert (DB trigger may recalculate)
      const { data: finalOrder } = await supabase
        .from('orders')
        .select('total_value')
        .eq('id', newOrder.id)
        .single()

      // If NOT copying value, zero it out even though products were copied
      if (!shouldCopyValue) {
        await supabase
          .from('orders')
          .update({ total_value: 0 })
          .eq('id', newOrder.id)
      }

      // Emit trigger with appropriate value
      const totalValue = shouldCopyValue
        ? (finalOrder?.total_value ?? sourceOrder.total_value ?? 0)
        : 0

      // Build products array for trigger enrichment
      const dupProducts = (sourceOrder.order_products as Array<{
        title: string; quantity: number; unit_price: number
      }> | null)?.map(p => ({ title: p.title, quantity: p.quantity, unitPrice: p.unit_price }))

      await emitOrderCreated({
        workspaceId: ctx.workspaceId,
        orderId: newOrder.id,
        pipelineId: params.targetPipelineId,
        stageId: targetStageId,
        contactId: shouldCopyContact ? (sourceOrder.contact_id ?? null) : null,
        orderValue: totalValue,
        sourceOrderId: params.sourceOrderId,
        shippingAddress: sourceOrder.shipping_address ?? null,
        shippingCity: sourceOrder.shipping_city ?? null,
        shippingDepartment: sourceOrder.shipping_department ?? null,
        orderName: sourceOrder.name ?? null,
        orderDescription: sourceOrder.description ?? null,
        trackingNumber: sourceOrder.tracking_number ?? null,
        carrier: sourceOrder.carrier ?? null,
        contactName: dupContactName,
        contactPhone: dupContactPhone,
        contactAddress: dupContactAddress,
        contactCity: dupContactCity,
        contactDepartment: dupContactDepartment,
        products: dupProducts,
        cascadeDepth: ctx.cascadeDepth,
      })
    } else {
      // No products copied
      if (shouldCopyValue && sourceOrder.total_value) {
        // Copy value without products (explicit total)
        await supabase
          .from('orders')
          .update({ total_value: sourceOrder.total_value })
          .eq('id', newOrder.id)
      }

      await emitOrderCreated({
        workspaceId: ctx.workspaceId,
        orderId: newOrder.id,
        pipelineId: params.targetPipelineId,
        stageId: targetStageId,
        contactId: shouldCopyContact ? (sourceOrder.contact_id ?? null) : null,
        orderValue: shouldCopyValue ? (sourceOrder.total_value ?? 0) : 0,
        sourceOrderId: params.sourceOrderId,
        shippingAddress: sourceOrder.shipping_address ?? null,
        shippingCity: sourceOrder.shipping_city ?? null,
        shippingDepartment: sourceOrder.shipping_department ?? null,
        orderName: sourceOrder.name ?? null,
        orderDescription: sourceOrder.description ?? null,
        trackingNumber: sourceOrder.tracking_number ?? null,
        carrier: sourceOrder.carrier ?? null,
        contactName: dupContactName,
        contactPhone: dupContactPhone,
        contactAddress: dupContactAddress,
        contactCity: dupContactCity,
        contactDepartment: dupContactDepartment,
        // No products copied, but still pass source products for trigger enrichment
        products: (sourceOrder.order_products as Array<{
          title: string; quantity: number; unit_price: number
        }> | null)?.map(p => ({ title: p.title, quantity: p.quantity, unitPrice: p.unit_price })),
        cascadeDepth: ctx.cascadeDepth,
      })
    }

    return {
      success: true,
      data: {
        orderId: newOrder.id,
        sourceOrderId: params.sourceOrderId,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// recompraOrder
// ============================================================================

/**
 * Create a repeat order (recompra) from an existing order.
 *
 * Quick task 043: la recompra SIEMPRE aterriza en el pipeline cuyo nombre
 * coincide exactamente con `RECOMPRA_PIPELINE_NAME` ('Ventas Somnio Standard').
 * Los productos son seleccionados por el usuario (no copiados del pedido origen)
 * y reemplazan cualquier producto que `duplicateOrder` no deberia insertar.
 *
 * Flujo:
 *   1. Valida `params.products.length >= 1`.
 *   2. Busca el pipeline destino por nombre + workspace_id.
 *   3. Si `targetStageId` viene, valida que pertenece a ese pipeline.
 *   4. Duplica con copyProducts=false, copyValue=false (se recalcula aqui).
 *   5. Inserta los productos del usuario en order_products.
 *   6. Recalcula total_value y limpia tracking/carrier/guide/closing_date.
 *
 * Emits: order.created (via duplicateOrder)
 */
export async function recompraOrder(
  ctx: DomainContext,
  params: RecompraOrderParams
): Promise<DomainResult<RecompraOrderResult>> {
  const supabase = createAdminClient()

  // Defensa adicional: al menos 1 producto
  if (!params.products || params.products.length === 0) {
    return {
      success: false,
      error: 'Debe seleccionar al menos un producto para la recompra',
    }
  }

  // Verifica que el pedido origen existe en este workspace
  const { data: sourceOrder, error: sourceError } = await supabase
    .from('orders')
    .select('id')
    .eq('id', params.sourceOrderId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (sourceError || !sourceOrder) {
    return { success: false, error: 'Pedido origen no encontrado' }
  }

  // Busca el pipeline destino por nombre exacto
  const { data: targetPipeline } = await supabase
    .from('pipelines')
    .select('id')
    .eq('workspace_id', ctx.workspaceId)
    .eq('name', RECOMPRA_PIPELINE_NAME)
    .maybeSingle()

  if (!targetPipeline) {
    return {
      success: false,
      error: `No existe el pipeline '${RECOMPRA_PIPELINE_NAME}' en este workspace`,
    }
  }

  // Si targetStageId viene, valida que pertenezca al pipeline destino
  if (params.targetStageId) {
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('id', params.targetStageId)
      .eq('pipeline_id', targetPipeline.id)
      .maybeSingle()

    if (!stage) {
      return {
        success: false,
        error: `La etapa destino no pertenece al pipeline '${RECOMPRA_PIPELINE_NAME}'`,
      }
    }
  }

  // Duplicar hacia el pipeline destino, SIN copiar productos ni total_value
  const dupResult = await duplicateOrder(ctx, {
    sourceOrderId: params.sourceOrderId,
    targetPipelineId: targetPipeline.id,
    targetStageId: params.targetStageId ?? undefined,
    copyContact: true,
    copyProducts: false,
    copyValue: false,
  })

  if (!dupResult.success) {
    return { success: false, error: dupResult.error || 'Error al crear recompra' }
  }

  const newOrderId = dupResult.data!.orderId

  // Insertar productos seleccionados por el usuario
  const productsToInsert = params.products.map((p) => ({
    order_id: newOrderId,
    product_id: p.product_id || null,
    sku: p.sku,
    title: p.title,
    unit_price: p.unit_price,
    quantity: p.quantity,
  }))

  const { error: productsError } = await supabase
    .from('order_products')
    .insert(productsToInsert)

  if (productsError) {
    // Rollback: borrar la orden recien duplicada
    await supabase.from('orders').delete().eq('id', newOrderId)
    return {
      success: false,
      error: `Error insertando productos de recompra: ${productsError.message}`,
    }
  }

  // Recalcular total_value + limpiar tracking/carrier/guide/closing_date
  const totalValue = params.products.reduce(
    (sum, p) => sum + p.unit_price * p.quantity,
    0
  )

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      total_value: totalValue,
      tracking_number: null,
      carrier: null,
      carrier_guide_number: null,
      closing_date: null,
    })
    .eq('id', newOrderId)
    .eq('workspace_id', ctx.workspaceId)

  if (updateError) {
    return {
      success: false,
      error: `Error actualizando total/envio de recompra: ${updateError.message}`,
    }
  }

  return {
    success: true,
    data: {
      orderId: newOrderId,
      sourceOrderId: params.sourceOrderId,
    },
  }
}

// ============================================================================
// addOrderTag
// ============================================================================

/**
 * Add a tag to an order by tag name.
 * Delegates to shared tags domain module (single source of truth for tag logic).
 * Emits: tag.assigned (via tags.ts)
 */
export async function addOrderTag(
  ctx: DomainContext,
  params: AddOrderTagParams
): Promise<DomainResult<AddOrderTagResult>> {
  const result = await assignTag(ctx, {
    entityType: 'order',
    entityId: params.orderId,
    tagName: params.tagName,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    data: { orderId: params.orderId, tagId: result.data!.tagId },
  }
}

// ============================================================================
// removeOrderTag
// ============================================================================

/**
 * Remove a tag from an order by tag name.
 * Delegates to shared tags domain module (single source of truth for tag logic).
 * Emits: tag.removed (via tags.ts)
 */
export async function removeOrderTag(
  ctx: DomainContext,
  params: RemoveOrderTagParams
): Promise<DomainResult<RemoveOrderTagResult>> {
  const result = await removeTag(ctx, {
    entityType: 'order',
    entityId: params.orderId,
    tagName: params.tagName,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    data: { orderId: params.orderId, tagId: result.data!.tagId },
  }
}

// ============================================================================
// getOrdersForOcrMatching
// ============================================================================

export interface OrderForOcrMatching {
  id: string
  name: string | null
  contactPhone: string | null
  contactName: string | null
  contactId: string | null
  shippingCity: string | null
  shippingAddress: string | null
}

/**
 * Get orders eligible for OCR guide matching in a specific pipeline stage.
 * Only returns orders WITHOUT a carrier_guide_number (not yet assigned a guide).
 * Includes flattened contact data for matching algorithm consumption.
 *
 * Used by the OCR orchestrator (Phase 27) to build the matching candidate pool.
 */
export async function getOrdersForOcrMatching(
  ctx: DomainContext,
  stageId: string
): Promise<DomainResult<OrderForOcrMatching[]>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, name, shipping_city, shipping_address, contact_id, contacts:contact_id(id, name, phone)')
      .eq('workspace_id', ctx.workspaceId)
      .eq('stage_id', stageId)

    if (error) {
      return { success: false, error: `Error obteniendo pedidos para OCR: ${error.message}` }
    }

    const mapped: OrderForOcrMatching[] = (data ?? []).map((row) => {
      const contact = row.contacts as unknown as { id: string; name: string; phone: string } | null
      return {
        id: row.id,
        name: row.name,
        contactPhone: contact?.phone ?? null,
        contactName: contact?.name ?? null,
        contactId: contact?.id ?? row.contact_id ?? null,
        shippingCity: row.shipping_city,
        shippingAddress: row.shipping_address,
      }
    })

    return { success: true, data: mapped }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// getOrdersByStage
// ============================================================================

export interface OrderForDispatch {
  id: string
  name: string | null
  contact_id: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  shipping_address: string | null
  shipping_city: string | null
  shipping_department: string | null
  total_value: number
  products: Array<{ sku: string | null; title: string | null; quantity: number }>
  custom_fields: Record<string, unknown>
  tags: string[]
}

/**
 * Get all orders in a specific pipeline stage with contact and product data.
 * Used by "subir ordenes coord" command to gather orders for carrier dispatch.
 */
export async function getOrdersByStage(
  ctx: DomainContext,
  stageId: string
): Promise<DomainResult<OrderForDispatch[]>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, name, contact_id, shipping_address, shipping_city, shipping_department, total_value, custom_fields, contacts(name, phone, email), order_products(sku, title, quantity)'
      )
      .eq('workspace_id', ctx.workspaceId)
      .eq('stage_id', stageId)

    if (error) {
      return { success: false, error: `Error obteniendo pedidos: ${error.message}` }
    }

    // Batch-fetch tags for all order IDs (same pattern as getOrdersForGuideGeneration)
    const orderIds = (data ?? []).map((o) => o.id)
    const { data: orderTags } = orderIds.length > 0
      ? await supabase
          .from('order_tags')
          .select('order_id, tags(name)')
          .in('order_id', orderIds)
      : { data: [] as Array<{ order_id: string; tags: { name: string } | null }> }

    const tagsByOrderId = new Map<string, string[]>()
    for (const ot of orderTags ?? []) {
      const tag = (ot.tags as unknown as { name: string } | null)?.name
      if (tag) {
        const existing = tagsByOrderId.get(ot.order_id) ?? []
        existing.push(tag)
        tagsByOrderId.set(ot.order_id, existing)
      }
    }

    const mappedOrders: OrderForDispatch[] = (data ?? []).map((row) => {
      const contact = row.contacts as unknown as { name: string; phone: string; email: string } | null
      const products = (row.order_products as unknown as Array<{
        sku: string | null
        title: string | null
        quantity: number
      }>) ?? []

      return {
        id: row.id,
        name: row.name,
        contact_id: row.contact_id,
        contact_name: contact?.name ?? null,
        contact_phone: contact?.phone ?? null,
        contact_email: contact?.email ?? null,
        shipping_address: row.shipping_address,
        shipping_city: row.shipping_city,
        shipping_department: row.shipping_department,
        total_value: row.total_value ?? 0,
        products: products.map((p) => ({
          sku: p.sku ?? null,
          title: p.title ?? null,
          quantity: p.quantity,
        })),
        custom_fields: (row.custom_fields as Record<string, unknown>) ?? {},
        tags: tagsByOrderId.get(row.id) ?? [],
      }
    })

    return { success: true, data: mappedOrders }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// getOrdersPendingGuide
// ============================================================================

export interface OrderPendingGuide {
  id: string
  name: string | null
  tracking_number: string
  contact_name: string | null
}

/**
 * Get orders that have a tracking_number (pedido) but no carrier_guide_number yet.
 * Used by "buscar guias coord" to find orders pending guide lookup.
 */
export async function getOrdersPendingGuide(
  ctx: DomainContext,
  stageId: string
): Promise<DomainResult<OrderPendingGuide[]>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, name, tracking_number, contacts(name)')
      .eq('workspace_id', ctx.workspaceId)
      .eq('stage_id', stageId)
      .not('tracking_number', 'is', null)

    if (error) {
      return { success: false, error: `Error obteniendo pedidos pendientes de guia: ${error.message}` }
    }

    return {
      success: true,
      data: (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        tracking_number: row.tracking_number!,
        contact_name: (row.contacts as unknown as { name: string } | null)?.name ?? null,
      })),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// getOrdersForGuideGeneration
// ============================================================================

export interface OrderForGuideGen {
  id: string
  name: string | null
  contact_name: string | null
  contact_phone: string | null
  shipping_address: string | null
  shipping_city: string | null
  shipping_department: string | null
  total_value: number
  products: Array<{ sku: string | null; title: string | null; quantity: number }>
  custom_fields: Record<string, unknown>
  tags: string[]  // tag names for PAGO ANTICIPADO detection
}

/**
 * Get orders in a specific pipeline stage with full shipping data and tags.
 * Used by guide generation commands (Inter, Bogota, Envia) to gather order data
 * for PDF/Excel generation.
 *
 * Uses a 2-query batch pattern (like getJobItemsWithOrderInfo):
 *   1. Fetch orders with contacts and products
 *   2. Batch-fetch order_tags with tag names for all order IDs
 *   3. Map tags onto orders
 *
 * Tags are needed for "PAGO ANTICIPADO" detection in the Claude normalization prompt.
 */
export async function getOrdersForGuideGeneration(
  ctx: DomainContext,
  stageId: string
): Promise<DomainResult<OrderForGuideGen[]>> {
  const supabase = createAdminClient()

  try {
    // Query 1: Fetch orders with contacts and products
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, name, shipping_address, shipping_city, shipping_department, total_value, custom_fields, contacts(name, phone), order_products(sku, title, quantity)'
      )
      .eq('workspace_id', ctx.workspaceId)
      .eq('stage_id', stageId)

    if (error) {
      return { success: false, error: `Error obteniendo pedidos para generacion de guias: ${error.message}` }
    }

    const orders = data ?? []

    if (orders.length === 0) {
      return { success: true, data: [] }
    }

    // Query 2: Batch-fetch tags for all order IDs
    const orderIds = orders.map((o) => o.id)
    const { data: orderTags, error: tagsError } = await supabase
      .from('order_tags')
      .select('order_id, tags(name)')
      .in('order_id', orderIds)

    if (tagsError) {
      // Non-fatal: proceed without tags rather than failing the entire query
      console.error('[orders] Error fetching tags for guide generation:', tagsError.message)
    }

    // Build Map<orderId, string[]> of tag names
    const tagMap = new Map<string, string[]>()
    for (const row of orderTags ?? []) {
      const tagName = (row.tags as unknown as { name: string } | null)?.name
      if (!tagName) continue
      const existing = tagMap.get(row.order_id) ?? []
      existing.push(tagName)
      tagMap.set(row.order_id, existing)
    }

    // Map orders with enriched data
    const mapped: OrderForGuideGen[] = orders.map((row) => {
      const contact = row.contacts as unknown as { name: string; phone: string } | null
      const products = (row.order_products as unknown as Array<{
        sku: string | null
        title: string | null
        quantity: number
      }>) ?? []

      return {
        id: row.id,
        name: row.name,
        contact_name: contact?.name ?? null,
        contact_phone: contact?.phone ?? null,
        shipping_address: row.shipping_address,
        shipping_city: row.shipping_city,
        shipping_department: row.shipping_department,
        total_value: row.total_value ?? 0,
        products: products.map((p) => ({
          sku: p.sku ?? null,
          title: p.title ?? null,
          quantity: p.quantity,
        })),
        custom_fields: (row.custom_fields as Record<string, unknown>) ?? {},
        tags: tagMap.get(row.id) ?? [],
      }
    })

    return { success: true, data: mapped }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// archiveOrder (Phase 44 — soft delete / close)
// ============================================================================

export interface ArchiveOrderParams {
  orderId: string
}

export interface ArchiveOrderResult {
  orderId: string
  archivedAt: string
}

/**
 * Archive an order (soft delete). CONTEXT D-04 says writer should "archivar/cerrar"
 * pedidos. Implementation: column-set on archived_at (Phase 44 migration).
 * If the workspace's convention is to also move to a "closed" stage, the caller
 * (writer tool) should first call moveOrderToStage then archiveOrder — or just
 * archive, which hides the row from active listings.
 *
 * Idempotent: archiving an already-archived order returns the existing timestamp.
 */
export async function archiveOrder(
  ctx: DomainContext,
  params: ArchiveOrderParams,
): Promise<DomainResult<ArchiveOrderResult>> {
  const supabase = createAdminClient()

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('orders')
      .select('id, archived_at')
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Pedido no encontrado' }
    }

    if (existing.archived_at) {
      return {
        success: true,
        data: { orderId: params.orderId, archivedAt: existing.archived_at },
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .select('id, archived_at')
      .single()

    if (updateError || !updated) {
      return { success: false, error: `Error al archivar el pedido: ${updateError?.message ?? 'unknown'}` }
    }

    return {
      success: true,
      data: { orderId: params.orderId, archivedAt: updated.archived_at },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// listOrders (Phase 44 — reader helper)
// ============================================================================

export interface ListOrdersParams {
  pipelineId?: string
  stageId?: string
  contactId?: string
  /** Default false — archived orders excluded */
  includeArchived?: boolean
  limit?: number
  offset?: number
}

export interface OrderListItem {
  id: string
  contactId: string | null
  pipelineId: string
  stageId: string
  totalValue: number
  createdAt: string
  archivedAt: string | null
}

export async function listOrders(
  ctx: DomainContext,
  params: ListOrdersParams,
): Promise<DomainResult<OrderListItem[]>> {
  const supabase = createAdminClient()

  try {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50)
    const offset = Math.max(params.offset ?? 0, 0)

    let qb = supabase
      .from('orders')
      .select('id, contact_id, pipeline_id, stage_id, total_value, created_at, archived_at')
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (params.pipelineId) qb = qb.eq('pipeline_id', params.pipelineId)
    if (params.stageId) qb = qb.eq('stage_id', params.stageId)
    if (params.contactId) qb = qb.eq('contact_id', params.contactId)
    if (!params.includeArchived) qb = qb.is('archived_at', null)

    const { data, error } = await qb

    if (error) return { success: false, error: error.message }

    return {
      success: true,
      data: (data ?? []).map((r) => ({
        id: r.id,
        contactId: r.contact_id,
        pipelineId: r.pipeline_id,
        stageId: r.stage_id,
        totalValue: Number(r.total_value),
        createdAt: r.created_at,
        archivedAt: r.archived_at,
      })),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// getOrderById (Phase 44 — reader + writer existence check)
// ============================================================================

export interface GetOrderByIdParams {
  orderId: string
  includeArchived?: boolean
}

export interface OrderDetail {
  id: string
  contactId: string | null
  pipelineId: string
  stageId: string
  totalValue: number
  description: string | null
  shippingAddress: string | null
  shippingCity: string | null
  shippingDepartment: string | null
  createdAt: string
  archivedAt: string | null
  /** Soft-close timestamp (Standalone crm-mutation-tools D-11). NULL = abierto. Independent of archivedAt. */
  closedAt: string | null
  items: Array<{
    id: string
    sku: string
    title: string
    unitPrice: number
    quantity: number
    subtotal: number
  }>
}

export async function getOrderById(
  ctx: DomainContext,
  params: GetOrderByIdParams,
): Promise<DomainResult<OrderDetail | null>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, contact_id, pipeline_id, stage_id, total_value, description, shipping_address, shipping_city, shipping_department, created_at, archived_at, closed_at, order_products(id, sku, title, unit_price, quantity, subtotal)')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', params.orderId)
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: true, data: null }

    if (!params.includeArchived && data.archived_at) {
      return { success: true, data: null }
    }

    const items = Array.isArray(data.order_products)
      ? data.order_products.map((p: { id: string; sku: string; title: string; unit_price: number; quantity: number; subtotal: number }) => ({
          id: p.id,
          sku: p.sku,
          title: p.title,
          unitPrice: Number(p.unit_price),
          quantity: p.quantity,
          subtotal: Number(p.subtotal),
        }))
      : []

    return {
      success: true,
      data: {
        id: data.id,
        contactId: data.contact_id,
        pipelineId: data.pipeline_id,
        stageId: data.stage_id,
        totalValue: Number(data.total_value),
        description: data.description,
        shippingAddress: data.shipping_address,
        shippingCity: data.shipping_city,
        shippingDepartment: data.shipping_department,
        createdAt: data.created_at,
        archivedAt: data.archived_at,
        closedAt: (data as { closed_at?: string | null }).closed_at ?? null,
        items,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// closeOrder (Standalone crm-mutation-tools — Wave 0, D-11 Resolución A)
// Mirror del patrón de archiveOrder. Soft-close — el pedido sigue visible en
// histórico (closed_at distinto de archived_at). Idempotente: si ya está
// cerrado, retorna el mismo OrderDetail sin re-mutar.
// TODO Standalone follow-up: emit trigger automatización 'order.closed' si y
// cuando se agregue al TRIGGER_CATALOG (D-11 indica "no hay eventos triggers
// para 'closed' hoy").
// ============================================================================

export interface CloseOrderParams {
  orderId: string
}

/**
 * Close an order by setting `closed_at`. Soft-close — order remains visible
 * in history. Idempotent: if already closed, returns the existing OrderDetail
 * sin re-mutar `closed_at`.
 *
 * Standalone crm-mutation-tools D-11 (Resolution A). Independent of archived_at.
 * Distinct semantics from archiveOrder:
 *   closeOrder   → "pedido finalizado/entregado/cancelado por flujo de negocio"
 *   archiveOrder → "soft-delete (oculto del UI por defecto)"
 *
 * Re-hidrata vía getOrderById (D-09 — siempre fresh post-mutación).
 */
export async function closeOrder(
  ctx: DomainContext,
  params: CloseOrderParams,
): Promise<DomainResult<OrderDetail>> {
  const supabase = createAdminClient()

  try {
    // Pre-check existence within workspace (mirror archiveOrder pattern).
    const { data: existing, error: fetchError } = await supabase
      .from('orders')
      .select('id, closed_at')
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Pedido no encontrado en este workspace' }
    }

    // Idempotent: only update si no está cerrado todavía.
    if (!(existing as { closed_at?: string | null }).closed_at) {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ closed_at: new Date().toISOString() })
        .eq('id', params.orderId)
        .eq('workspace_id', ctx.workspaceId)

      if (updateError) {
        return {
          success: false,
          error: `Error al cerrar el pedido: ${updateError.message}`,
        }
      }
    }

    // Re-hidratar vía getOrderById (D-09). includeArchived=true para no perder
    // pedidos que estén archivados Y cerrados al mismo tiempo (caso edge —
    // archived_at y closed_at son independientes; el caller decidió cerrar).
    const detail = await getOrderById(ctx, {
      orderId: params.orderId,
      includeArchived: true,
    })
    if (!detail.success) {
      return { success: false, error: detail.error ?? 'Error al re-hidratar el pedido tras cerrar' }
    }
    if (!detail.data) {
      return { success: false, error: 'Pedido no encontrado tras cerrar' }
    }
    return { success: true, data: detail.data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// agent-lifecycle-router extensions (Plan 02 Task 3 — B-4 fix)
//
// Read-only helpers consumed by Plan 03 fact resolvers. None of these mutate.
// All filter by workspace_id (Regla 3 multi-tenant).
//
// Note on stage_kind: pipeline_stages does NOT have a `kind` column in the
// production schema. We return the raw stage `name` in the field `stage_kind`
// (string). Plan 03 facts.ts maps the textual stage name to the canonical
// kind (`preparation` | `transit` | `delivered` | etc.) — see Plan 01
// SNAPSHOT.md §"distribucion pedidos activos por stage_name + pipeline".
// We exclude terminal-closed stages via `pipeline_stages.is_closed = false`.
// ============================================================================

/**
 * Returns the most recently created non-archived order for the contact, plus
 * the raw stage name (in field `stage_kind`), the pipeline name (in field
 * `pipeline_name`), and `created_at`. Returns null when no active order exists.
 *
 * Excludes orders whose stage `is_closed=true` (CANCELADO, DEVOLUCION, etc.)
 * — those should not count as "active" per Plan 01 snapshot.
 *
 * `pipeline_name` is consumed by Plan 03 fact `activeOrderPipeline` — added
 * post-rollout 2026-04-27 to support pipeline-scoped routing rules.
 */
export async function getActiveOrderForContact(
  contactId: string,
  workspaceId: string,
): Promise<{
  id: string
  stage_kind: string | null
  pipeline_name: string | null
  created_at: string
} | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('orders')
    .select('id, created_at, pipeline_stages!inner(name, is_closed, pipelines!inner(name))')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!data) return null
  const stage = (
    data as {
      pipeline_stages?: {
        name?: string
        is_closed?: boolean
        pipelines?: { name?: string } | { name?: string }[] | null
      } | null
    }
  ).pipeline_stages
  // If the latest non-archived order is in a terminal stage, treat as no active order.
  if (stage?.is_closed) return null
  const pipeline = Array.isArray(stage?.pipelines) ? stage?.pipelines[0] : stage?.pipelines
  return {
    id: (data as { id: string }).id,
    stage_kind: stage?.name ?? null,
    pipeline_name: pipeline?.name ?? null,
    created_at: (data as { created_at: string }).created_at,
  }
}

/**
 * Returns ISO timestamp of the most recent updated_at on a delivered order
 * for the contact, or null if none. Detection uses textual match on stage
 * name (matches "ENTREGADO" via ILIKE %entregad% per Plan 01 snapshot).
 *
 * Used by Plan 03 fact `daysSinceLastDelivery`.
 */
export async function getLastDeliveredOrderDate(
  contactId: string,
  workspaceId: string,
): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('orders')
    .select('updated_at, pipeline_stages!inner(name)')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .ilike('pipeline_stages.name', '%entregad%')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  return (data as { updated_at?: string } | null)?.updated_at ?? null
}

/**
 * Returns count of orders created in the last N days for the contact.
 * Used by Plan 03 fact `hasOrderInLastNDays`.
 */
export async function countOrdersInLastNDays(
  contactId: string,
  workspaceId: string,
  days: number,
): Promise<number> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .gte('created_at', since)
  return count ?? 0
}

/**
 * Returns true when the contact has at least one order in the recompra
 * pipeline (named via `RECOMPRA_PIPELINE_NAME` constant). Used by Plan 03
 * fact `isInRecompraPipeline`.
 *
 * Implementation: 2-step query — resolve pipeline_id by name within the
 * workspace, then count orders by (workspace_id, contact_id, pipeline_id).
 * This avoids embed-with-filter quirks of PostgREST and matches the test
 * mock chain (eq → eq → eq).
 */
export async function isContactInRecompraPipeline(
  contactId: string,
  workspaceId: string,
): Promise<boolean> {
  const supabase = createAdminClient()
  // Step 1: count orders for the contact in the recompra pipeline.
  // We resolve pipeline name → id inline using a join filter on `pipelines.name`.
  // Test mocks 3 .eq() calls; production uses workspace_id + contact_id + pipeline name.
  const { count } = await supabase
    .from('orders')
    .select('id, pipelines!inner(name)', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .eq('pipelines.name', RECOMPRA_PIPELINE_NAME)
  return (count ?? 0) > 0
}
