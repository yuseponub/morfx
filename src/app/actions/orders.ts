'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type {
  Order,
  OrderWithDetails,
  OrderFilters,
  OrderProductFormData,
  Pipeline,
  PipelineWithStages,
  PipelineStage,
} from '@/lib/orders/types'

// ============================================================================
// Validation Schemas
// ============================================================================

const orderProductSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  sku: z.string().min(1, 'El SKU es requerido'),
  title: z.string().min(1, 'El titulo es requerido'),
  unit_price: z.number().min(0, 'El precio debe ser mayor o igual a 0'),
  quantity: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
})

const orderSchema = z.object({
  contact_id: z.string().uuid().optional().nullable(),
  pipeline_id: z.string().uuid('Pipeline requerido'),
  stage_id: z.string().uuid('Etapa requerida'),
  closing_date: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  tracking_number: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  shipping_city: z.string().optional().nullable(),
  custom_fields: z.record(z.string(), z.unknown()).optional().default({}),
  products: z.array(orderProductSchema).optional().default([]),
})

export type OrderFormData = z.infer<typeof orderSchema>

// ============================================================================
// Helper Types
// ============================================================================

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

// ============================================================================
// Pipeline Operations
// ============================================================================

/**
 * Get all pipelines for the current workspace with their stages
 * Ordered by name
 */
export async function getPipelines(): Promise<PipelineWithStages[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

  const { data: pipelines, error } = await supabase
    .from('pipelines')
    .select(`
      *,
      stages:pipeline_stages(*)
    `)
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching pipelines:', error)
    return []
  }

  // Sort stages by position within each pipeline
  return (pipelines || []).map(pipeline => ({
    ...pipeline,
    stages: (pipeline.stages || []).sort((a: PipelineStage, b: PipelineStage) => a.position - b.position),
  }))
}

/**
 * Get or create the default pipeline for the workspace
 * Creates "Ventas" pipeline with standard stages if none exists
 */
export async function getOrCreateDefaultPipeline(): Promise<PipelineWithStages | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return null
  }

  // Check for existing default pipeline
  const { data: existingDefault } = await supabase
    .from('pipelines')
    .select(`
      *,
      stages:pipeline_stages(*)
    `)
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .single()

  if (existingDefault) {
    return {
      ...existingDefault,
      stages: (existingDefault.stages || []).sort((a: PipelineStage, b: PipelineStage) => a.position - b.position),
    }
  }

  // Check for any pipeline
  const { data: anyPipeline } = await supabase
    .from('pipelines')
    .select(`
      *,
      stages:pipeline_stages(*)
    `)
    .eq('workspace_id', workspaceId)
    .limit(1)
    .single()

  if (anyPipeline) {
    return {
      ...anyPipeline,
      stages: (anyPipeline.stages || []).sort((a: PipelineStage, b: PipelineStage) => a.position - b.position),
    }
  }

  // Create default pipeline with stages
  const { data: newPipeline, error: pipelineError } = await supabase
    .from('pipelines')
    .insert({
      workspace_id: workspaceId,
      name: 'Ventas',
      description: 'Pipeline principal de ventas',
      is_default: true,
    })
    .select()
    .single()

  if (pipelineError || !newPipeline) {
    console.error('Error creating default pipeline:', pipelineError)
    return null
  }

  // Create default stages
  const defaultStages = [
    { name: 'Nuevo', color: '#6366f1', position: 0, is_closed: false },
    { name: 'En proceso', color: '#f59e0b', position: 1, is_closed: false },
    { name: 'Enviado', color: '#3b82f6', position: 2, is_closed: false },
    { name: 'Ganado', color: '#22c55e', position: 3, is_closed: true },
    { name: 'Perdido', color: '#ef4444', position: 4, is_closed: true },
  ]

  const { data: createdStages, error: stagesError } = await supabase
    .from('pipeline_stages')
    .insert(
      defaultStages.map(stage => ({
        ...stage,
        pipeline_id: newPipeline.id,
      }))
    )
    .select()

  if (stagesError) {
    console.error('Error creating default stages:', stagesError)
  }

  return {
    ...newPipeline,
    stages: (createdStages || []).sort((a, b) => a.position - b.position),
  }
}

// ============================================================================
// Order Read Operations
// ============================================================================

/**
 * Get orders with optional filters
 * Returns orders with contact, stage, pipeline, products, and tags
 */
export async function getOrders(filters?: OrderFilters): Promise<OrderWithDetails[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

  let query = supabase
    .from('orders')
    .select(`
      *,
      contact:contacts(id, name, phone, city),
      stage:pipeline_stages(id, name, color, is_closed),
      pipeline:pipelines(id, name),
      products:order_products(*),
      tags:order_tags(tag:tags(*))
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  // Apply filters
  if (filters?.pipeline_id) {
    query = query.eq('pipeline_id', filters.pipeline_id)
  }
  if (filters?.stage_id) {
    query = query.eq('stage_id', filters.stage_id)
  }
  if (filters?.contact_id) {
    query = query.eq('contact_id', filters.contact_id)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching orders:', error)
    return []
  }

  // Transform tags from nested structure
  return (data || []).map(order => ({
    ...order,
    tags: order.tags?.map((t: { tag: { id: string; name: string; color: string } }) => t.tag) || [],
  }))
}

/**
 * Get orders by pipeline (for Kanban board)
 */
export async function getOrdersByPipeline(pipelineId: string): Promise<OrderWithDetails[]> {
  return getOrders({ pipeline_id: pipelineId })
}

/**
 * Get a single order by ID with all relations
 */
export async function getOrder(id: string): Promise<OrderWithDetails | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      contact:contacts(id, name, phone, email, city, address),
      stage:pipeline_stages(id, name, color, position, wip_limit, is_closed),
      pipeline:pipelines(id, name),
      products:order_products(*),
      tags:order_tags(tag:tags(*))
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    console.error('Error fetching order:', error)
    return null
  }

  // Transform tags
  return {
    ...data,
    tags: data.tags?.map((t: { tag: { id: string; name: string; color: string } }) => t.tag) || [],
  }
}

// ============================================================================
// Order Create/Update Operations
// ============================================================================

/**
 * Create a new order with products
 * Order total is calculated automatically by database trigger
 */
export async function createOrder(formData: OrderFormData): Promise<ActionResult<OrderWithDetails>> {
  const validation = orderSchema.safeParse(formData)
  if (!validation.success) {
    const firstIssue = validation.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  const { products, ...orderData } = validation.data

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      ...orderData,
      workspace_id: workspaceId,
      contact_id: orderData.contact_id || null,
      closing_date: orderData.closing_date || null,
      description: orderData.description || null,
      carrier: orderData.carrier || null,
      tracking_number: orderData.tracking_number || null,
      shipping_address: orderData.shipping_address || null,
      shipping_city: orderData.shipping_city || null,
    })
    .select()
    .single()

  if (orderError || !order) {
    console.error('Error creating order:', orderError)
    return { error: 'Error al crear el pedido' }
  }

  // Add products if provided
  if (products && products.length > 0) {
    const productsToInsert = products.map(p => ({
      order_id: order.id,
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
      // Rollback order if products fail
      await supabase.from('orders').delete().eq('id', order.id)
      console.error('Error adding products:', productsError)
      return { error: 'Error agregando productos al pedido' }
    }
  }

  revalidatePath('/crm/pedidos')

  // Fetch the complete order with relations
  const completeOrder = await getOrder(order.id)
  if (!completeOrder) {
    return { error: 'Pedido creado pero no se pudo cargar' }
  }

  return { success: true, data: completeOrder }
}

/**
 * Update an existing order
 * If products are provided, replaces all existing products
 */
export async function updateOrder(id: string, formData: Partial<OrderFormData>): Promise<ActionResult<OrderWithDetails>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { products, ...orderData } = formData

  // Build update object with explicit null handling
  const updates: Record<string, unknown> = {}
  if (orderData.contact_id !== undefined) updates.contact_id = orderData.contact_id || null
  if (orderData.pipeline_id !== undefined) updates.pipeline_id = orderData.pipeline_id
  if (orderData.stage_id !== undefined) updates.stage_id = orderData.stage_id
  if (orderData.closing_date !== undefined) updates.closing_date = orderData.closing_date || null
  if (orderData.description !== undefined) updates.description = orderData.description || null
  if (orderData.carrier !== undefined) updates.carrier = orderData.carrier || null
  if (orderData.tracking_number !== undefined) updates.tracking_number = orderData.tracking_number || null
  if (orderData.shipping_address !== undefined) updates.shipping_address = orderData.shipping_address || null
  if (orderData.shipping_city !== undefined) updates.shipping_city = orderData.shipping_city || null
  if (orderData.custom_fields !== undefined) updates.custom_fields = orderData.custom_fields

  // Update order fields
  if (Object.keys(updates).length > 0) {
    const { error: orderError } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)

    if (orderError) {
      console.error('Error updating order:', orderError)
      return { error: 'Error al actualizar el pedido' }
    }
  }

  // If products provided, replace all
  if (products !== undefined) {
    // Delete existing products
    const { error: deleteError } = await supabase
      .from('order_products')
      .delete()
      .eq('order_id', id)

    if (deleteError) {
      console.error('Error deleting existing products:', deleteError)
      return { error: 'Error al actualizar productos' }
    }

    // Insert new products
    if (products.length > 0) {
      const productsToInsert = products.map(p => ({
        order_id: id,
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
        console.error('Error inserting products:', productsError)
        return { error: 'Error al actualizar productos' }
      }
    }
  }

  revalidatePath('/crm/pedidos')

  // Fetch updated order
  const updatedOrder = await getOrder(id)
  if (!updatedOrder) {
    return { error: 'Pedido actualizado pero no se pudo cargar' }
  }

  return { success: true, data: updatedOrder }
}

/**
 * Move order to a different stage (for Kanban drag)
 * Warns if WIP limit exceeded but allows move
 */
export async function moveOrderToStage(orderId: string, newStageId: string): Promise<ActionResult<{ warning?: string }>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Get stage to check WIP limit
  const { data: stage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id, name, wip_limit, pipeline_id')
    .eq('id', newStageId)
    .single()

  if (stageError || !stage) {
    return { error: 'Etapa no encontrada' }
  }

  // Check WIP limit if defined (for warning only)
  let warning: string | undefined
  if (stage.wip_limit !== null) {
    const { count, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', newStageId)
      .neq('id', orderId) // Exclude the order being moved

    if (!countError && count !== null && count >= stage.wip_limit) {
      warning = `"${stage.name}" excede el límite WIP de ${stage.wip_limit} pedidos`
    }
  }

  // Update order stage (always allow)
  const { error: updateError } = await supabase
    .from('orders')
    .update({ stage_id: newStageId })
    .eq('id', orderId)

  if (updateError) {
    console.error('Error moving order:', updateError)
    return { error: 'Error al mover el pedido' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: { warning } }
}

// ============================================================================
// Order Delete Operation
// ============================================================================

/**
 * Delete an order
 * Products and tags are deleted automatically via CASCADE
 */
export async function deleteOrder(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting order:', error)
    return { error: 'Error al eliminar el pedido' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: undefined }
}

/**
 * Delete multiple orders at once
 */
export async function deleteOrders(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  if (ids.length === 0) {
    return { error: 'No hay pedidos para eliminar' }
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error, count } = await supabase
    .from('orders')
    .delete()
    .in('id', ids)

  if (error) {
    console.error('Error deleting orders:', error)
    return { error: 'Error al eliminar los pedidos' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: { deleted: count || ids.length } }
}

/**
 * Export orders to CSV format
 */
export async function exportOrdersToCSV(orderIds?: string[]): Promise<ActionResult<string>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'Workspace no seleccionado' }
  }

  let query = supabase
    .from('orders')
    .select(`
      id,
      total_value,
      closing_date,
      carrier,
      tracking_number,
      description,
      created_at,
      contact:contacts(name, phone, email, city),
      stage:pipeline_stages(name),
      pipeline:pipelines(name),
      products:order_products(title, sku, quantity, unit_price)
    `)
    .eq('workspace_id', workspaceId)

  if (orderIds && orderIds.length > 0) {
    query = query.in('id', orderIds)
  }

  const { data: orders, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching orders for export:', error)
    return { error: 'Error al exportar pedidos' }
  }

  if (!orders || orders.length === 0) {
    return { error: 'No hay pedidos para exportar' }
  }

  // Build CSV
  const headers = [
    'ID',
    'Contacto',
    'Telefono',
    'Email',
    'Ciudad',
    'Pipeline',
    'Etapa',
    'Valor Total',
    'Productos',
    'Transportadora',
    'Guia',
    'Fecha Cierre',
    'Fecha Creacion',
    'Notas'
  ]

  const rows = orders.map((order: any) => [
    order.id,
    order.contact?.name || '',
    order.contact?.phone || '',
    order.contact?.email || '',
    order.contact?.city || '',
    order.pipeline?.name || '',
    order.stage?.name || '',
    order.total_value,
    order.products?.map((p: any) => `${p.title} x${p.quantity}`).join('; ') || '',
    order.carrier || '',
    order.tracking_number || '',
    order.closing_date || '',
    order.created_at,
    order.description || ''
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map((cell: any) =>
      typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
        ? `"${cell.replace(/"/g, '""')}"`
        : cell
    ).join(','))
  ].join('\n')

  return { success: true, data: csvContent }
}

// ============================================================================
// Order Tag Operations
// ============================================================================

/**
 * Add a tag to an order
 */
export async function addOrderTag(orderId: string, tagId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('order_tags')
    .insert({ order_id: orderId, tag_id: tagId })

  if (error) {
    // Ignore duplicate constraint violation (tag already added)
    if (error.code === '23505') {
      return { success: true, data: undefined }
    }
    console.error('Error adding tag to order:', error)
    return { error: 'Error al agregar la etiqueta' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: undefined }
}

/**
 * Remove a tag from an order
 */
export async function removeOrderTag(orderId: string, tagId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('order_tags')
    .delete()
    .eq('order_id', orderId)
    .eq('tag_id', tagId)

  if (error) {
    console.error('Error removing tag from order:', error)
    return { error: 'Error al quitar la etiqueta' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: undefined }
}
