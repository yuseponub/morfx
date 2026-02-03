'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import type {
  ConversationWithDetails,
  ConversationFilters,
  ActionResult,
  Message,
} from '@/lib/whatsapp/types'

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get conversations with optional filters.
 * Returns conversations with contact details and tags.
 */
export async function getConversations(
  filters?: ConversationFilters
): Promise<ConversationWithDetails[]> {
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

  // Build query with contact join (tags come through contact)
  let query = supabase
    .from('conversations')
    .select(`
      *,
      contact:contacts(id, name, phone, address, city, tags:contact_tags(tag:tags(*)))
    `)
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  // Apply filters
  if (filters?.status) {
    query = query.eq('status', filters.status)
  }

  if (filters?.is_read !== undefined) {
    query = query.eq('is_read', filters.is_read)
  }

  if (filters?.assigned_to !== undefined) {
    if (filters.assigned_to === null) {
      query = query.is('assigned_to', null)
    } else {
      query = query.eq('assigned_to', filters.assigned_to)
    }
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching conversations:', error)
    return []
  }

  // Transform and apply client-side filters
  let conversations = (data || []).map((conv) => {
    // Get tags from linked contact
    const contactTags = conv.contact?.tags || []
    const tags = contactTags.map((t: { tag: { id: string; name: string; color: string } }) => t.tag) || []

    // Remove nested tags from contact object
    const contact = conv.contact ? { ...conv.contact, tags: undefined } : null

    return {
      ...conv,
      contact,
      tags,
      assigned_name: null, // TODO: fetch from profiles if needed
    }
  }) as ConversationWithDetails[]

  // Apply search filter (client-side for fuzzy matching)
  if (filters?.search && filters.search.trim()) {
    const searchLower = filters.search.toLowerCase().trim()
    conversations = conversations.filter((conv) => {
      const matchPhone = conv.phone.toLowerCase().includes(searchLower)
      const matchName = conv.contact?.name?.toLowerCase().includes(searchLower)
      return matchPhone || matchName
    })
  }

  // Apply tag filter (client-side)
  if (filters?.tag_ids && filters.tag_ids.length > 0) {
    conversations = conversations.filter((conv) =>
      filters.tag_ids!.some((tagId) =>
        conv.tags.some((tag) => tag.id === tagId)
      )
    )
  }

  return conversations
}

/**
 * Get a single conversation by ID with full details.
 */
export async function getConversation(
  id: string
): Promise<ConversationWithDetails | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      contact:contacts(id, name, phone, email, city, address, tags:contact_tags(tag:tags(*)))
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    console.error('Error fetching conversation:', error)
    return null
  }

  // Transform tags from contact
  const contactTags = data.contact?.tags || []
  const tags = contactTags.map((t: { tag: { id: string; name: string; color: string } }) => t.tag) || []

  // Remove nested tags from contact object
  const contact = data.contact ? { ...data.contact, tags: undefined } : null

  return {
    ...data,
    contact,
    tags,
    assigned_name: null,
  } as ConversationWithDetails
}

/**
 * Get messages for a conversation.
 * Returns messages ordered by timestamp (oldest first for chat display).
 */
export async function getConversationMessages(
  conversationId: string,
  limit: number = 50,
  before?: string
): Promise<Message[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(limit)

  // Pagination: get messages before a certain timestamp
  if (before) {
    query = query.lt('timestamp', before)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching messages:', error)
    return []
  }

  // Return in chronological order (oldest first for chat)
  return ((data || []) as Message[]).reverse()
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Mark a conversation as read.
 * Resets unread_count to 0 and sets is_read to true.
 */
export async function markAsRead(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('conversations')
    .update({
      is_read: true,
      unread_count: 0,
    })
    .eq('id', id)

  if (error) {
    console.error('Error marking conversation as read:', error)
    return { error: 'Error al marcar como leido' }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

/**
 * Archive a conversation.
 * Archived conversations are hidden from the default inbox view.
 */
export async function archiveConversation(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('conversations')
    .update({ status: 'archived' })
    .eq('id', id)

  if (error) {
    console.error('Error archiving conversation:', error)
    return { error: 'Error al archivar conversacion' }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

/**
 * Unarchive a conversation.
 * Returns conversation to active status.
 */
export async function unarchiveConversation(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('conversations')
    .update({ status: 'active' })
    .eq('id', id)

  if (error) {
    console.error('Error unarchiving conversation:', error)
    return { error: 'Error al desarchivar conversacion' }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

/**
 * Link a contact to a conversation.
 * Used when manually associating a contact with a conversation.
 */
export async function linkContactToConversation(
  conversationId: string,
  contactId: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Verify contact exists and belongs to same workspace
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!contact) {
    return { error: 'Contacto no encontrado' }
  }

  const { error } = await supabase
    .from('conversations')
    .update({ contact_id: contactId })
    .eq('id', conversationId)

  if (error) {
    console.error('Error linking contact:', error)
    return { error: 'Error al vincular contacto' }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

/**
 * Unlink a contact from a conversation.
 */
export async function unlinkContactFromConversation(
  conversationId: string
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('conversations')
    .update({ contact_id: null })
    .eq('id', conversationId)

  if (error) {
    console.error('Error unlinking contact:', error)
    return { error: 'Error al desvincular contacto' }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

/**
 * Update the profile name of a conversation.
 * Used to give a friendly name to conversations without linked contacts.
 */
export async function updateProfileName(
  conversationId: string,
  profileName: string | null
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('conversations')
    .update({ profile_name: profileName || null })
    .eq('id', conversationId)

  if (error) {
    console.error('Error updating profile name:', error)
    return { error: 'Error al actualizar nombre' }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

/**
 * Assign a conversation to a user.
 * Used for team assignment in Phase 8.
 */
export async function assignConversation(
  conversationId: string,
  userId: string | null
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('conversations')
    .update({ assigned_to: userId })
    .eq('id', conversationId)

  if (error) {
    console.error('Error assigning conversation:', error)
    return { error: 'Error al asignar conversacion' }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: undefined }
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get conversation statistics for the current workspace.
 */
export async function getConversationStats(): Promise<{
  total: number
  unread: number
  archived: number
  windowClosed: number
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { total: 0, unread: 0, archived: 0, windowClosed: 0 }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { total: 0, unread: 0, archived: 0, windowClosed: 0 }
  }

  // Total active conversations
  const { count: total } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')

  // Unread conversations
  const { count: unread } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .eq('is_read', false)

  // Archived conversations
  const { count: archived } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'archived')

  // Conversations with closed 24h window (last customer message > 24h ago)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: windowClosed } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .lt('last_customer_message_at', twentyFourHoursAgo)

  return {
    total: total || 0,
    unread: unread || 0,
    archived: archived || 0,
    windowClosed: windowClosed || 0,
  }
}

// ============================================================================
// START NEW CONVERSATION
// ============================================================================

/**
 * Start a new conversation by sending a template to a phone number.
 * Creates or finds existing conversation, sends template, returns conversation ID.
 */
export async function startNewConversation(params: {
  phone: string
  templateId: string
  variableValues: Record<string, string>
}): Promise<ActionResult<{ conversationId: string }>> {
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

  // Normalize phone number to E.164
  let normalizedPhone = params.phone.trim().replace(/\s+/g, '')
  if (!normalizedPhone.startsWith('+')) {
    // Assume Colombia if no country code
    normalizedPhone = normalizedPhone.startsWith('57')
      ? '+' + normalizedPhone
      : '+57' + normalizedPhone
  }

  // Validate phone format
  if (!/^\+\d{10,15}$/.test(normalizedPhone)) {
    return { error: 'Numero de telefono invalido' }
  }

  // Check if conversation already exists
  let { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('phone', normalizedPhone)
    .single()

  // Create new conversation if doesn't exist
  if (!conversation) {
    // Get workspace phone_number_id from settings or env
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single()

    const phoneNumberId = workspace?.settings?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || ''

    // Try to find existing contact by phone
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('phone', normalizedPhone)
      .single()

    const { data: newConv, error: createError } = await supabase
      .from('conversations')
      .insert({
        workspace_id: workspaceId,
        phone: normalizedPhone,
        phone_number_id: phoneNumberId,
        contact_id: contact?.id || null,
        status: 'active',
        is_read: true,
        unread_count: 0,
      })
      .select('id')
      .single()

    if (createError || !newConv) {
      console.error('Error creating conversation:', createError)
      return { error: 'Error al crear conversacion' }
    }

    conversation = newConv
  }

  // Now send the template using the existing sendTemplateMessage
  const { sendTemplateMessage } = await import('./messages')
  const result = await sendTemplateMessage({
    conversationId: conversation.id,
    templateId: params.templateId,
    variableValues: params.variableValues,
  })

  if ('error' in result) {
    return { error: result.error }
  }

  revalidatePath('/whatsapp')
  return { success: true, data: { conversationId: conversation.id } }
}
