'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

// ============================================================================
// Types
// ============================================================================

export interface QuickReply {
  id: string
  workspace_id: string
  shortcut: string
  content: string
  category: string | null
  media_url: string | null
  media_type: 'image' | 'video' | 'document' | 'audio' | null
  created_at: string
  updated_at: string
}

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get all quick replies for current workspace
 * Ordered by shortcut alphabetically
 */
export async function getQuickReplies(): Promise<QuickReply[]> {
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
    .from('quick_replies')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('shortcut')

  if (error) {
    console.error('Error fetching quick replies:', error)
    return []
  }

  return data || []
}

/**
 * Search quick replies by shortcut prefix (for autocomplete in chat input)
 * Returns up to 10 matches starting with the query
 */
export async function searchQuickReplies(query: string): Promise<QuickReply[]> {
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

  // Clean up query (remove leading slash if present)
  const cleanQuery = query.replace(/^\//, '').toLowerCase()

  if (!cleanQuery) {
    // Return all if no query
    const { data } = await supabase
      .from('quick_replies')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('shortcut')
      .limit(10)

    return data || []
  }

  const { data, error } = await supabase
    .from('quick_replies')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('shortcut', `${cleanQuery}%`)
    .order('shortcut')
    .limit(10)

  if (error) {
    console.error('Error searching quick replies:', error)
    return []
  }

  return data || []
}

/**
 * Get quick replies grouped by category
 * Used when categories feature is enabled
 */
export async function getQuickRepliesByCategory(): Promise<Record<string, QuickReply[]>> {
  const replies = await getQuickReplies()

  const grouped: Record<string, QuickReply[]> = {}

  for (const reply of replies) {
    const category = reply.category || 'Sin categoria'
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(reply)
  }

  return grouped
}

// ============================================================================
// Create/Update Operations
// ============================================================================

/**
 * Create a new quick reply
 */
export async function createQuickReply(params: {
  shortcut: string
  content: string
  category?: string | null
  media_url?: string | null
  media_type?: 'image' | 'video' | 'document' | 'audio' | null
}): Promise<ActionResult<QuickReply>> {
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

  // Validate input
  if (!params.shortcut.trim()) {
    return { error: 'El atajo es requerido', field: 'shortcut' }
  }
  if (!params.content.trim()) {
    return { error: 'El contenido es requerido', field: 'content' }
  }

  // Normalize shortcut (lowercase, no spaces, remove leading slash)
  const normalizedShortcut = params.shortcut
    .toLowerCase()
    .replace(/^\//, '')
    .replace(/\s+/g, '_')
    .trim()

  const { data, error } = await supabase
    .from('quick_replies')
    .insert({
      workspace_id: workspaceId,
      shortcut: normalizedShortcut,
      content: params.content.trim(),
      category: params.category?.trim() || null,
      media_url: params.media_url || null,
      media_type: params.media_type || null
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating quick reply:', error)
    if (error.code === '23505') {
      return { error: 'Ya existe una respuesta rapida con este atajo', field: 'shortcut' }
    }
    return { error: 'Error al crear la respuesta rapida' }
  }

  revalidatePath('/configuracion/whatsapp/quick-replies')
  revalidatePath('/whatsapp')
  return { success: true, data }
}

/**
 * Update an existing quick reply
 */
export async function updateQuickReply(
  id: string,
  params: {
    shortcut?: string
    content?: string
    category?: string | null
    media_url?: string | null
    media_type?: 'image' | 'video' | 'document' | 'audio' | null
  }
): Promise<ActionResult> {
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

  // Build update object
  const updates: {
    shortcut?: string
    content?: string
    category?: string | null
    media_url?: string | null
    media_type?: 'image' | 'video' | 'document' | 'audio' | null
    updated_at: string
  } = {
    updated_at: new Date().toISOString()
  }

  if (params.shortcut !== undefined) {
    if (!params.shortcut.trim()) {
      return { error: 'El atajo es requerido', field: 'shortcut' }
    }
    updates.shortcut = params.shortcut
      .toLowerCase()
      .replace(/^\//, '')
      .replace(/\s+/g, '_')
      .trim()
  }

  if (params.content !== undefined) {
    if (!params.content.trim()) {
      return { error: 'El contenido es requerido', field: 'content' }
    }
    updates.content = params.content.trim()
  }

  if (params.category !== undefined) {
    updates.category = params.category?.trim() || null
  }

  if (params.media_url !== undefined) {
    updates.media_url = params.media_url || null
  }

  if (params.media_type !== undefined) {
    updates.media_type = params.media_type || null
  }

  const { error } = await supabase
    .from('quick_replies')
    .update(updates)
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error updating quick reply:', error)
    if (error.code === '23505') {
      return { error: 'Ya existe una respuesta rapida con este atajo', field: 'shortcut' }
    }
    return { error: 'Error al actualizar la respuesta rapida' }
  }

  revalidatePath('/configuracion/whatsapp/quick-replies')
  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

/**
 * Delete a quick reply
 */
export async function deleteQuickReply(id: string): Promise<ActionResult> {
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

  const { error } = await supabase
    .from('quick_replies')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error deleting quick reply:', error)
    return { error: 'Error al eliminar la respuesta rapida' }
  }

  revalidatePath('/configuracion/whatsapp/quick-replies')
  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

// ============================================================================
// Media Operations
// ============================================================================

/**
 * Upload media file for quick reply
 * Returns the public URL of the uploaded file
 */
export async function uploadQuickReplyMedia(
  fileBase64: string,
  fileName: string,
  mimeType: string
): Promise<ActionResult<{ url: string; type: 'image' | 'video' | 'document' | 'audio' }>> {
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

  // Determine media type from mime
  let mediaType: 'image' | 'video' | 'document' | 'audio' = 'document'
  if (mimeType.startsWith('image/')) {
    mediaType = 'image'
  } else if (mimeType.startsWith('video/')) {
    mediaType = 'video'
  } else if (mimeType.startsWith('audio/')) {
    mediaType = 'audio'
  }

  // Convert base64 to buffer
  const base64Data = fileBase64.split(',')[1] || fileBase64
  const buffer = Buffer.from(base64Data, 'base64')

  // Generate unique file path
  const timestamp = Date.now()
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const filePath = `quick-replies/${workspaceId}/${timestamp}_${safeFileName}`

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('whatsapp-media')
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false
    })

  if (uploadError) {
    console.error('Error uploading quick reply media:', uploadError)
    return { error: 'Error al subir el archivo' }
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(filePath)

  return { success: true, data: { url: publicUrl, type: mediaType } }
}

/**
 * Delete media file from quick reply
 */
export async function deleteQuickReplyMedia(mediaUrl: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Extract file path from URL
  // URL format: https://xxx.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/...
  const urlParts = mediaUrl.split('/whatsapp-media/')
  if (urlParts.length !== 2) {
    return { error: 'URL de media invalida' }
  }

  const filePath = urlParts[1]

  const { error } = await supabase.storage
    .from('whatsapp-media')
    .remove([filePath])

  if (error) {
    console.error('Error deleting quick reply media:', error)
    return { error: 'Error al eliminar el archivo' }
  }

  return { success: true, data: undefined }
}
