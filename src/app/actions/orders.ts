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
  RelatedOrder,
} from '@/lib/orders/types'
import {
  createOrder as domainCreateOrder,
  updateOrder as domainUpdateOrder,
  moveOrderToStage as domainMoveOrderToStage,
  deleteOrder as domainDeleteOrder,
  addOrderTag as domainAddOrderTag,
  removeOrderTag as domainRemoveOrderTag,
} from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'

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
// Auth Helper
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
// Pipeline Operations (read-only, unchanged)
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
// Order Read Operations (unchanged)
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
      contact:contacts(id, name, phone, address, city),
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
  const orders = (data || []).map(order => ({
    ...order,
    tags: order.tags?.map((t: { tag: { id: string; name: string; color: string } }) => t.tag) || [],
  }))

  // Detect which orders have derived orders (are referenced as source_order_id)
  const orderIds = orders.map(o => o.id)
  if (orderIds.length > 0) {
    const { data: derived } = await supabase
      .from('orders')
      .select('source_order_id')
      .in('source_order_id', orderIds)

    if (derived && derived.length > 0) {
      const sourceIds = new Set(derived.map(d => d.source_order_id))
      for (const order of orders) {
        if (sourceIds.has(order.id)) {
          order.has_derived_orders = true
        }
      }
    }
  }

  return orders
}

/**
 * Get orders by pipeline (for Kanban board)
 */
export async function getOrdersByPipeline(pipelineId: string): Promise<OrderWithDetails[]> {
  return getOrders({ pipeline_id: pipelineId })
}

/**
 * Get paginated orders for a specific pipeline stage.
 * Used by Kanban infinite scroll — loads `limit` orders at `offset`.
 */
export async function getOrdersForStage(
  stageId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ orders: OrderWithDetails[]; hasMore: boolean }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { orders: [], hasMore: false }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { orders: [], hasMore: false }

  // Fetch limit+1 to determine if there are more
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      contact:contacts(id, name, phone, address, city),
      stage:pipeline_stages(id, name, color, is_closed),
      pipeline:pipelines(id, name),
      products:order_products(*),
      tags:order_tags(tag:tags(*))
    `)
    .eq('workspace_id', workspaceId)
    .eq('stage_id', stageId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit)

  if (error) {
    console.error('Error fetching orders for stage:', error)
    return { orders: [], hasMore: false }
  }

  const hasMore = (data || []).length > limit
  const sliced = hasMore ? data!.slice(0, limit) : (data || [])

  // Transform tags
  const orders = sliced.map(order => ({
    ...order,
    tags: order.tags?.map((t: { tag: { id: string; name: string; color: string } }) => t.tag) || [],
  }))

  return { orders, hasMore }
}

/**
 * Get order counts per stage for a pipeline.
 * Used to show total count in column headers even when paginated.
 */
export async function getStageOrderCounts(
  pipelineId: string
): Promise<Record<string, number>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return {}

  const { data, error } = await supabase
    .from('orders')
    .select('stage_id')
    .eq('workspace_id', workspaceId)
    .eq('pipeline_id', pipelineId)

  if (error) {
    console.error('Error fetching stage counts:', error)
    return {}
  }

  const counts: Record<string, number> = {}
  for (const row of data || []) {
    counts[row.stage_id] = (counts[row.stage_id] || 0) + 1
  }
  return counts
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
// Order Create/Update Operations — via domain/orders
// ============================================================================

/**
 * Create a new order with products.
 * Delegates to domain/orders.createOrder for DB logic + trigger emission.
 */
export async function createOrder(formData: OrderFormData): Promise<ActionResult<OrderWithDetails>> {
  const validation = orderSchema.safeParse(formData)
  if (!validation.success) {
    const firstIssue = validation.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  const { products, ...orderData } = validation.data

  const result = await domainCreateOrder(ctx, {
    pipelineId: orderData.pipeline_id,
    stageId: orderData.stage_id,
    contactId: orderData.contact_id,
    closingDate: orderData.closing_date,
    description: orderData.description,
    carrier: orderData.carrier,
    trackingNumber: orderData.tracking_number,
    shippingAddress: orderData.shipping_address,
    shippingCity: orderData.shipping_city,
    customFields: orderData.custom_fields,
    products: products.map(p => ({
      productId: p.product_id,
      sku: p.sku,
      title: p.title,
      unitPrice: p.unit_price,
      quantity: p.quantity,
    })),
  })

  if (!result.success) {
    return { error: result.error || 'Error al crear el pedido' }
  }

  revalidatePath('/crm/pedidos')

  // Fetch the complete order with relations for the UI
  const completeOrder = await getOrder(result.data!.orderId)
  if (!completeOrder) {
    return { error: 'Pedido creado pero no se pudo cargar' }
  }

  return { success: true, data: completeOrder }
}

/**
 * Update an existing order.
 * Delegates to domain/orders.updateOrder for DB logic + trigger emission.
 * If stage_id changes, also calls domain/orders.moveOrderToStage.
 */
export async function updateOrder(id: string, formData: Partial<OrderFormData>): Promise<ActionResult<OrderWithDetails>> {
  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  const { products, ...orderData } = formData

  // Handle stage change separately via moveOrderToStage if stage_id changed
  if (orderData.stage_id !== undefined) {
    const moveResult = await domainMoveOrderToStage(ctx, {
      orderId: id,
      newStageId: orderData.stage_id,
    })
    if (!moveResult.success) {
      return { error: moveResult.error || 'Error al mover el pedido de etapa' }
    }
  }

  // Build domain update params from the remaining fields
  const hasFieldUpdates = Object.keys(orderData).some(k => k !== 'stage_id' && k !== 'pipeline_id') || products !== undefined
  if (hasFieldUpdates) {
    const result = await domainUpdateOrder(ctx, {
      orderId: id,
      contactId: orderData.contact_id,
      closingDate: orderData.closing_date,
      description: orderData.description,
      carrier: orderData.carrier,
      trackingNumber: orderData.tracking_number,
      shippingAddress: orderData.shipping_address,
      shippingCity: orderData.shipping_city,
      customFields: orderData.custom_fields,
      products: products?.map(p => ({
        productId: p.product_id,
        sku: p.sku,
        title: p.title,
        unitPrice: p.unit_price,
        quantity: p.quantity,
      })),
    })

    if (!result.success) {
      return { error: result.error || 'Error al actualizar el pedido' }
    }
  }

  revalidatePath('/crm/pedidos')

  // Fetch updated order for the UI
  const updatedOrder = await getOrder(id)
  if (!updatedOrder) {
    return { error: 'Pedido actualizado pero no se pudo cargar' }
  }

  return { success: true, data: updatedOrder }
}

/**
 * Move order to a different stage (for Kanban drag).
 * Delegates to domain/orders.moveOrderToStage for DB logic + trigger emission.
 * Keeps WIP limit warning check as adapter concern.
 */
export async function moveOrderToStage(orderId: string, newStageId: string): Promise<ActionResult<{ warning?: string }>> {
  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const supabase = await createClient()

  // Check WIP limit (adapter concern — not in domain)
  const { data: stage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id, name, wip_limit, pipeline_id')
    .eq('id', newStageId)
    .single()

  if (stageError || !stage) {
    return { error: 'Etapa no encontrada' }
  }

  let warning: string | undefined
  if (stage.wip_limit !== null) {
    const { count, error: countError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', newStageId)
      .neq('id', orderId)

    if (!countError && count !== null && count >= stage.wip_limit) {
      warning = `"${stage.name}" excede el limite WIP de ${stage.wip_limit} pedidos`
    }
  }

  // Delegate to domain
  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  const result = await domainMoveOrderToStage(ctx, { orderId, newStageId })

  if (!result.success) {
    return { error: result.error || 'Error al mover el pedido' }
  }

  revalidatePath('/crm/pedidos')

  return { success: true, data: { warning } }
}

// ============================================================================
// Order Delete Operations — via domain/orders
// ============================================================================

/**
 * Delete an order.
 * Delegates to domain/orders.deleteOrder.
 */
export async function deleteOrder(id: string): Promise<ActionResult> {
  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  const result = await domainDeleteOrder(ctx, { orderId: id })

  if (!result.success) {
    return { error: result.error || 'Error al eliminar el pedido' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: undefined }
}

/**
 * Delete multiple orders at once.
 * Loops over IDs calling domain deleteOrder per ID.
 */
export async function deleteOrders(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  if (ids.length === 0) {
    return { error: 'No hay pedidos para eliminar' }
  }

  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  let deleted = 0

  for (const id of ids) {
    const result = await domainDeleteOrder(ctx, { orderId: id })
    if (result.success) deleted++
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: { deleted } }
}

/**
 * Export orders to CSV format (read-only, unchanged)
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
// Related Orders (read-only, unchanged)
// ============================================================================

/**
 * Get related orders for an order (source, derived, siblings).
 * Used by the order detail page to show bidirectional connections.
 *
 * Relationships:
 * - source: the original order this one was derived from
 * - derived: orders created from this order (via automations)
 * - siblings: other orders derived from the same source (also marked 'derived')
 */
export async function getRelatedOrders(orderId: string): Promise<RelatedOrder[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Get current order to check source_order_id
  const { data: currentOrder } = await supabase
    .from('orders')
    .select('id, source_order_id')
    .eq('id', orderId)
    .single()

  if (!currentOrder) return []

  const relatedIds: { id: string; relationship: 'source' | 'derived' }[] = []

  // 1. If this order has a source, include the source order
  if (currentOrder.source_order_id) {
    relatedIds.push({ id: currentOrder.source_order_id, relationship: 'source' })
  }

  // 2. Find all orders derived FROM this order
  const { data: derivedOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('source_order_id', orderId)

  if (derivedOrders) {
    for (const d of derivedOrders) {
      relatedIds.push({ id: d.id, relationship: 'derived' })
    }
  }

  // 3. Find siblings (other orders derived from same source)
  if (currentOrder.source_order_id) {
    const { data: siblings } = await supabase
      .from('orders')
      .select('id')
      .eq('source_order_id', currentOrder.source_order_id)
      .neq('id', orderId)

    if (siblings) {
      for (const s of siblings) {
        // Avoid duplicates (if sibling was already added as derived)
        if (!relatedIds.some(r => r.id === s.id)) {
          relatedIds.push({ id: s.id, relationship: 'derived' })
        }
      }
    }
  }

  if (relatedIds.length === 0) return []

  // Fetch full details for all related orders
  const ids = relatedIds.map(r => r.id)
  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id,
      total_value,
      created_at,
      contact:contacts(name),
      stage:pipeline_stages(name, color),
      pipeline:pipelines(name)
    `)
    .in('id', ids)

  if (!orders) return []

  // Map to RelatedOrder type with relationship info
  return orders.map((order: any) => {
    const rel = relatedIds.find(r => r.id === order.id)
    return {
      id: order.id,
      pipeline_name: order.pipeline?.name || 'Sin pipeline',
      stage_name: order.stage?.name || 'Sin etapa',
      stage_color: order.stage?.color || '#6b7280',
      contact_name: order.contact?.name || null,
      total_value: order.total_value ?? 0,
      created_at: order.created_at,
      relationship: rel?.relationship || 'derived',
    }
  })
}

// ============================================================================
// Order Tag Operations — via domain/orders
// ============================================================================

/**
 * Add a tag to an order.
 * Server action receives tagId (from UI), looks up tag name, then delegates to domain.
 */
export async function addOrderTag(orderId: string, tagId: string): Promise<ActionResult> {
  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  // Look up tag name from tagId (domain expects tagName, UI sends tagId)
  const supabase = await createClient()
  const { data: tag, error: tagError } = await supabase
    .from('tags')
    .select('name')
    .eq('id', tagId)
    .single()

  if (tagError || !tag) {
    return { error: 'Etiqueta no encontrada' }
  }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  const result = await domainAddOrderTag(ctx, { orderId, tagName: tag.name })

  if (!result.success) {
    return { error: result.error || 'Error al agregar la etiqueta' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: undefined }
}

/**
 * Remove a tag from an order.
 * Server action receives tagId (from UI), looks up tag name, then delegates to domain.
 */
export async function removeOrderTag(orderId: string, tagId: string): Promise<ActionResult> {
  const auth = await getAuthContext()
  if ('error' in auth) return { error: auth.error }

  // Look up tag name from tagId (domain expects tagName, UI sends tagId)
  const supabase = await createClient()
  const { data: tag, error: tagError } = await supabase
    .from('tags')
    .select('name')
    .eq('id', tagId)
    .single()

  if (tagError || !tag) {
    return { error: 'Etiqueta no encontrada' }
  }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }
  const result = await domainRemoveOrderTag(ctx, { orderId, tagName: tag.name })

  if (!result.success) {
    return { error: result.error || 'Error al quitar la etiqueta' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true, data: undefined }
}
