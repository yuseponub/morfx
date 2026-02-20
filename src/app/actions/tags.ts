'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { DEFAULT_TAG_COLOR } from '@/lib/data/tag-colors'
import type { Tag } from '@/lib/types/database'

// ============================================================================
// Validation Schemas
// ============================================================================

const tagSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color invalido').optional(),
  applies_to: z.enum(['whatsapp', 'orders', 'both']).optional(),
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
 * Get all tags for the current workspace
 * Ordered by name ASC
 */
export async function getTags(): Promise<Tag[]> {
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

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching tags:', error)
    return []
  }

  return data || []
}

/**
 * Get a single tag by ID
 * Returns null if not found or not accessible
 */
export async function getTag(id: string): Promise<Tag | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return null
  }

  return data
}

// ============================================================================
// Create/Update Operations
// ============================================================================

/**
 * Create a new tag
 */
export async function createTag(formData: FormData): Promise<ActionResult<Tag>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Get workspace_id from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Parse and validate input
  const raw = {
    name: formData.get('name')?.toString() || '',
    color: formData.get('color')?.toString() || DEFAULT_TAG_COLOR,
    applies_to: (formData.get('applies_to')?.toString() || 'both') as 'whatsapp' | 'orders' | 'both',
  }

  const result = tagSchema.safeParse(raw)
  if (!result.success) {
    const firstError = result.error.issues[0]
    return { error: firstError.message, field: firstError.path[0]?.toString() }
  }

  // Insert tag with workspace_id
  const { data, error } = await supabase
    .from('tags')
    .insert({
      workspace_id: workspaceId,
      name: result.data.name,
      color: result.data.color || DEFAULT_TAG_COLOR,
      applies_to: result.data.applies_to || 'both',
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating tag:', error)
    // Handle unique constraint violation (duplicate name in workspace)
    if (error.code === '23505') {
      return { error: 'Ya existe una etiqueta con este nombre', field: 'name' }
    }
    return { error: 'Error al crear la etiqueta' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath('/whatsapp')
  revalidatePath('/settings/tags')
  return { success: true, data }
}

/**
 * Update an existing tag
 */
export async function updateTag(id: string, formData: FormData): Promise<ActionResult<Tag>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Parse and validate input
  const raw = {
    name: formData.get('name')?.toString() || '',
    color: formData.get('color')?.toString() || undefined,
    applies_to: formData.get('applies_to')?.toString() as 'whatsapp' | 'orders' | 'both' | undefined,
  }

  const result = tagSchema.safeParse(raw)
  if (!result.success) {
    const firstError = result.error.issues[0]
    return { error: firstError.message, field: firstError.path[0]?.toString() }
  }

  // Build update object (only include fields that are provided)
  const updates: { name?: string; color?: string; applies_to?: 'whatsapp' | 'orders' | 'both' } = {}
  if (result.data.name) updates.name = result.data.name
  if (result.data.color) updates.color = result.data.color
  if (result.data.applies_to) updates.applies_to = result.data.applies_to

  // Update tag
  const { data, error } = await supabase
    .from('tags')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating tag:', error)
    if (error.code === '23505') {
      return { error: 'Ya existe una etiqueta con este nombre', field: 'name' }
    }
    return { error: 'Error al actualizar la etiqueta' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath('/whatsapp')
  revalidatePath('/settings/tags')
  return { success: true, data }
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete a tag
 * This will also remove the tag from all contacts (CASCADE)
 */
export async function deleteTag(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting tag:', error)
    return { error: 'Error al eliminar la etiqueta' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath('/whatsapp')
  revalidatePath('/settings/tags')
  return { success: true, data: undefined }
}

// ============================================================================
// Scope-Filtered Queries
// ============================================================================

/**
 * Get tags filtered by scope.
 * @param scope - 'whatsapp' returns tags with applies_to 'whatsapp' or 'both'
 *                'orders' returns tags with applies_to 'orders' or 'both'
 *                undefined returns all tags
 */
export async function getTagsForScope(
  scope?: 'whatsapp' | 'orders'
): Promise<Tag[]> {
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
    .from('tags')
    .select('id, name, color, applies_to')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true })

  // Filter by scope
  if (scope === 'whatsapp') {
    query = query.in('applies_to', ['whatsapp', 'both'])
  } else if (scope === 'orders') {
    query = query.in('applies_to', ['orders', 'both'])
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching tags:', error)
    return []
  }

  return (data || []) as Tag[]
}
