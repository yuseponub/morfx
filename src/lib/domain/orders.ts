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
import type { DomainContext, DomainResult } from './types'

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
  shippingAddress?: string | null
  shippingCity?: string | null
  shippingDepartment?: string | null
  customFields?: Record<string, unknown>
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
        'workspace_id, contact_id, pipeline_id, stage_id, closing_date, description, name, carrier, tracking_number, shipping_address, shipping_city, shipping_department, custom_fields'
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
    if (params.shippingAddress !== undefined) updates.shipping_address = params.shippingAddress || null
    if (params.shippingCity !== undefined) updates.shipping_city = params.shippingCity || null
    if (params.shippingDepartment !== undefined) updates.shipping_department = params.shippingDepartment || null
    if (params.customFields !== undefined) updates.custom_fields = params.customFields

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

    // Fire-and-forget: emit field change triggers for each changed field
    // Map from param key to DB column name for comparison
    const fieldMappings: Array<{ paramKey: keyof typeof updates; dbColumn: string }> = [
      { paramKey: 'contact_id', dbColumn: 'contact_id' },
      { paramKey: 'closing_date', dbColumn: 'closing_date' },
      { paramKey: 'description', dbColumn: 'description' },
      { paramKey: 'name', dbColumn: 'name' },
      { paramKey: 'carrier', dbColumn: 'carrier' },
      { paramKey: 'tracking_number', dbColumn: 'tracking_number' },
      { paramKey: 'shipping_address', dbColumn: 'shipping_address' },
      { paramKey: 'shipping_city', dbColumn: 'shipping_city' },
      { paramKey: 'shipping_department', dbColumn: 'shipping_department' },
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
          contactId: (previousOrder.contact_id as string) ?? undefined,
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
          contactId: (previousOrder.contact_id as string) ?? undefined,
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
    // Read current order state (include shipping fields for rich trigger context)
    const { data: currentOrder, error: fetchError } = await supabase
      .from('orders')
      .select('stage_id, pipeline_id, contact_id, total_value, description, name, shipping_address, shipping_city, shipping_department')
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !currentOrder) {
      return { success: false, error: 'Pedido no encontrado' }
    }

    const previousStageId = currentOrder.stage_id

    // Update stage
    const { error: updateError } = await supabase
      .from('orders')
      .update({ stage_id: params.newStageId })
      .eq('id', params.orderId)
      .eq('workspace_id', ctx.workspaceId)

    if (updateError) {
      return { success: false, error: `Error al mover el pedido: ${updateError.message}` }
    }

    // Fetch stage names + pipeline name + contact info for rich trigger context
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
        contactName: dupContactName,
        contactPhone: dupContactPhone,
        contactAddress: dupContactAddress,
        contactCity: dupContactCity,
        contactDepartment: dupContactDepartment,
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
        contactName: dupContactName,
        contactPhone: dupContactPhone,
        contactAddress: dupContactAddress,
        contactCity: dupContactCity,
        contactDepartment: dupContactDepartment,
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
