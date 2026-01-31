'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type { Product } from '@/lib/orders/types'

// ============================================================================
// Validation Schemas
// ============================================================================

const productSchema = z.object({
  sku: z.string().min(1, 'El SKU es requerido'),
  title: z.string().min(1, 'El titulo es requerido'),
  price: z.number().min(0, 'El precio debe ser mayor o igual a 0'),
  shopify_product_id: z.string().optional().or(z.literal('')),
  is_active: z.boolean().optional().default(true),
})

// ============================================================================
// Helper Types
// ============================================================================

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get all products for the current workspace
 * Ordered by title ASC
 */
export async function getProducts(): Promise<Product[]> {
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

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('title', { ascending: true })

  if (error) {
    console.error('Error fetching products:', error)
    return []
  }

  return products || []
}

/**
 * Get active products only (for order creation)
 * Ordered by title ASC
 */
export async function getActiveProducts(): Promise<Product[]> {
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

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('title', { ascending: true })

  if (error) {
    console.error('Error fetching active products:', error)
    return []
  }

  return products || []
}

/**
 * Get a single product by ID
 * Returns null if not found or not accessible
 */
export async function getProduct(id: string): Promise<Product | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !product) {
    return null
  }

  return product
}

// ============================================================================
// Create/Update Operations
// ============================================================================

/**
 * Create a new product
 */
export async function createProduct(formData: FormData): Promise<ActionResult<Product>> {
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

  // Parse and validate input
  const raw = {
    sku: formData.get('sku')?.toString() || '',
    title: formData.get('title')?.toString() || '',
    price: parseFloat(formData.get('price')?.toString() || '0'),
    shopify_product_id: formData.get('shopify_product_id')?.toString() || '',
    is_active: formData.get('is_active') === 'true',
  }

  const result = productSchema.safeParse(raw)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  // Insert product with workspace_id
  const { data, error } = await supabase
    .from('products')
    .insert({
      workspace_id: workspaceId,
      sku: result.data.sku,
      title: result.data.title,
      price: result.data.price,
      shopify_product_id: result.data.shopify_product_id || null,
      is_active: result.data.is_active,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating product:', error)
    // Handle unique constraint violation (duplicate SKU)
    if (error.code === '23505') {
      return { error: 'Ya existe un producto con este SKU', field: 'sku' }
    }
    return { error: 'Error al crear el producto' }
  }

  revalidatePath('/crm/productos')
  return { success: true, data }
}

/**
 * Update an existing product
 */
export async function updateProduct(id: string, formData: FormData): Promise<ActionResult<Product>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Parse and validate input
  const raw = {
    sku: formData.get('sku')?.toString() || '',
    title: formData.get('title')?.toString() || '',
    price: parseFloat(formData.get('price')?.toString() || '0'),
    shopify_product_id: formData.get('shopify_product_id')?.toString() || '',
    is_active: formData.get('is_active') === 'true',
  }

  const result = productSchema.safeParse(raw)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  // Update product
  const { data, error } = await supabase
    .from('products')
    .update({
      sku: result.data.sku,
      title: result.data.title,
      price: result.data.price,
      shopify_product_id: result.data.shopify_product_id || null,
      is_active: result.data.is_active,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating product:', error)
    if (error.code === '23505') {
      return { error: 'Ya existe un producto con este SKU', field: 'sku' }
    }
    return { error: 'Error al actualizar el producto' }
  }

  revalidatePath('/crm/productos')
  return { success: true, data }
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete a single product
 */
export async function deleteProduct(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting product:', error)
    return { error: 'Error al eliminar el producto' }
  }

  revalidatePath('/crm/productos')
  return { success: true, data: undefined }
}

// ============================================================================
// Toggle Operations
// ============================================================================

/**
 * Toggle product active status
 */
export async function toggleProductActive(id: string, is_active: boolean): Promise<ActionResult<Product>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { data, error } = await supabase
    .from('products')
    .update({ is_active })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error toggling product active:', error)
    return { error: 'Error al cambiar el estado del producto' }
  }

  revalidatePath('/crm/productos')
  return { success: true, data }
}
