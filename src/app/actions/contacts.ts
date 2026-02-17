'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type { Contact, ContactWithTags, Tag } from '@/lib/types/database'
import {
  createContact as domainCreateContact,
  updateContact as domainUpdateContact,
  deleteContact as domainDeleteContact,
  bulkCreateContacts as domainBulkCreateContacts,
} from '@/lib/domain/contacts'
import {
  assignTag as domainAssignTag,
  removeTag as domainRemoveTag,
} from '@/lib/domain/tags'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// Validation Schemas
// ============================================================================

const contactSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  phone: z.string().min(1, 'El telefono es requerido'),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
})

// ============================================================================
// Helper Types
// ============================================================================

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

// ============================================================================
// Auth Helper
// ============================================================================

async function getWorkspaceContext(): Promise<{ workspaceId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  return { workspaceId }
}

// ============================================================================
// Read Operations (unchanged — no mutations, no triggers)
// ============================================================================

/**
 * Get all contacts with their tags for the current workspace
 * Ordered by updated_at DESC (most recent first)
 */
export async function getContacts(): Promise<ContactWithTags[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  // Get contacts
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('*')
    .order('updated_at', { ascending: false })

  if (contactsError) {
    console.error('Error fetching contacts:', contactsError)
    return []
  }

  if (!contacts || contacts.length === 0) {
    return []
  }

  // Get contact_tags for all contacts
  const contactIds = contacts.map(c => c.id)
  const { data: contactTags } = await supabase
    .from('contact_tags')
    .select('contact_id, tag_id')
    .in('contact_id', contactIds)

  // Get all tags referenced
  const tagIds = [...new Set(contactTags?.map(ct => ct.tag_id) || [])]
  const { data: tags } = tagIds.length > 0
    ? await supabase.from('tags').select('*').in('id', tagIds)
    : { data: [] }

  // Build tag lookup map
  const tagMap = new Map<string, Tag>(tags?.map(t => [t.id, t]) || [])

  // Build contact -> tags lookup
  const contactTagsMap = new Map<string, Tag[]>()
  for (const ct of contactTags || []) {
    const tag = tagMap.get(ct.tag_id)
    if (tag) {
      const existing = contactTagsMap.get(ct.contact_id) || []
      existing.push(tag)
      contactTagsMap.set(ct.contact_id, existing)
    }
  }

  // Combine contacts with tags
  return contacts.map(contact => ({
    ...contact,
    tags: contactTagsMap.get(contact.id) || []
  }))
}

/**
 * Search contacts by name or phone
 * Returns basic contact info (id, name, phone) for quick lookups
 */
export async function searchContacts(params: {
  search: string
  limit?: number
}): Promise<Array<{ id: string; name: string; phone: string }>> {
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

  const searchTerm = params.search.trim()
  if (!searchTerm) {
    return []
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .eq('workspace_id', workspaceId)
    .or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
    .order('name')
    .limit(params.limit || 10)

  if (error) {
    console.error('Error searching contacts:', error)
    return []
  }

  return data || []
}

/**
 * Get a single contact by ID with tags
 * Returns null if not found or not accessible
 */
export async function getContact(id: string): Promise<ContactWithTags | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  // Get contact
  const { data: contact, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !contact) {
    return null
  }

  // Get tags for this contact
  const { data: contactTags } = await supabase
    .from('contact_tags')
    .select('tag_id')
    .eq('contact_id', id)

  const tagIds = contactTags?.map(ct => ct.tag_id) || []
  const { data: tags } = tagIds.length > 0
    ? await supabase.from('tags').select('*').in('id', tagIds)
    : { data: [] }

  return {
    ...contact,
    tags: tags || []
  }
}

// ============================================================================
// Create/Update Operations — Delegated to domain
// ============================================================================

/**
 * Simple contact data for programmatic creation
 */
export interface ContactInput {
  name: string
  phone: string
  email?: string
  address?: string
  city?: string
  department?: string
}

/**
 * Create a new contact from object data (for programmatic use).
 * Delegates to domain/contacts.createContact for DB + trigger emission.
 */
export async function createContact(data: ContactInput): Promise<ActionResult<Contact>> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  // Validate input
  const raw = {
    name: data.name || '',
    phone: data.phone || '',
    email: data.email || '',
    address: data.address || '',
    city: data.city || '',
    department: data.department || '',
  }

  const result = contactSchema.safeParse(raw)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }
  const domainResult = await domainCreateContact(domainCtx, {
    name: result.data.name,
    phone: result.data.phone,
    email: result.data.email || undefined,
    address: result.data.address || undefined,
    city: result.data.city || undefined,
    department: result.data.department || undefined,
  })

  if (!domainResult.success) {
    // Map domain error to ActionResult with field hint for phone duplicate
    if (domainResult.error?.includes('telefono')) {
      return { error: domainResult.error, field: 'phone' }
    }
    return { error: domainResult.error || 'Error al crear el contacto' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath('/crm/pedidos')

  // Re-read the full contact for the response (domain returns only contactId)
  const supabase = await createClient()
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', domainResult.data!.contactId)
    .single()

  return { success: true, data: contact! }
}

/**
 * Create a new contact from FormData (for form submissions).
 * Delegates to domain/contacts.createContact for DB + trigger emission.
 */
export async function createContactFromForm(formData: FormData): Promise<ActionResult<Contact>> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  // Parse and validate input
  const raw = {
    name: formData.get('name')?.toString() || '',
    phone: formData.get('phone')?.toString() || '',
    email: formData.get('email')?.toString() || '',
    address: formData.get('address')?.toString() || '',
    city: formData.get('city')?.toString() || '',
    department: formData.get('department')?.toString() || '',
  }

  const result = contactSchema.safeParse(raw)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }
  const domainResult = await domainCreateContact(domainCtx, {
    name: result.data.name,
    phone: result.data.phone,
    email: result.data.email || undefined,
    address: result.data.address || undefined,
    city: result.data.city || undefined,
    department: result.data.department || undefined,
  })

  if (!domainResult.success) {
    if (domainResult.error?.includes('telefono')) {
      return { error: domainResult.error, field: 'phone' }
    }
    return { error: domainResult.error || 'Error al crear el contacto' }
  }

  revalidatePath('/crm/contactos')

  // Re-read the full contact for the response
  const supabase = await createClient()
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', domainResult.data!.contactId)
    .single()

  return { success: true, data: contact! }
}

/**
 * Update an existing contact from FormData.
 * Delegates to domain/contacts.updateContact for DB + trigger emission.
 */
export async function updateContactFromForm(id: string, formData: FormData): Promise<ActionResult<Contact>> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  // Parse and validate input
  const raw = {
    name: formData.get('name')?.toString() || '',
    phone: formData.get('phone')?.toString() || '',
    email: formData.get('email')?.toString() || '',
    address: formData.get('address')?.toString() || '',
    city: formData.get('city')?.toString() || '',
    department: formData.get('department')?.toString() || '',
  }

  const result = contactSchema.safeParse(raw)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }
  const domainResult = await domainUpdateContact(domainCtx, {
    contactId: id,
    name: result.data.name,
    phone: result.data.phone,
    email: result.data.email || undefined,
    address: result.data.address || undefined,
    city: result.data.city || undefined,
    department: result.data.department || undefined,
  })

  if (!domainResult.success) {
    if (domainResult.error?.includes('telefono')) {
      return { error: domainResult.error, field: 'phone' }
    }
    return { error: domainResult.error || 'Error al actualizar el contacto' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath(`/crm/contactos/${id}`)

  // Re-read the full contact for the response
  const supabase = await createClient()
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()

  return { success: true, data: contact! }
}

// ============================================================================
// Delete Operations — Delegated to domain
// ============================================================================

/**
 * Delete a single contact.
 * Delegates to domain/contacts.deleteContact.
 */
export async function deleteContact(id: string): Promise<ActionResult> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }
  const domainResult = await domainDeleteContact(domainCtx, { contactId: id })

  if (!domainResult.success) {
    return { error: domainResult.error || 'Error al eliminar el contacto' }
  }

  revalidatePath('/crm/contactos')
  return { success: true, data: undefined }
}

/**
 * Delete multiple contacts.
 * Loops over domain/contacts.deleteContact per ID.
 */
export async function deleteContacts(ids: string[]): Promise<ActionResult> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  if (ids.length === 0) {
    return { error: 'No se seleccionaron contactos' }
  }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }

  for (const id of ids) {
    const domainResult = await domainDeleteContact(domainCtx, { contactId: id })
    if (!domainResult.success) {
      return { error: domainResult.error || 'Error al eliminar los contactos' }
    }
  }

  revalidatePath('/crm/contactos')
  return { success: true, data: undefined }
}

// ============================================================================
// Tag Operations — Delegated to domain/tags
// ============================================================================

/**
 * Add a tag to a contact.
 * UI sends tagId — adapter looks up tagName before calling domain.
 */
export async function addTagToContact(contactId: string, tagId: string): Promise<ActionResult> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  // Look up tag name from tagId (UI sends tagId, domain expects tagName)
  const supabase = await createClient()
  const { data: tag } = await supabase
    .from('tags')
    .select('name')
    .eq('id', tagId)
    .single()

  if (!tag) {
    return { error: 'Etiqueta no encontrada' }
  }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }
  const domainResult = await domainAssignTag(domainCtx, {
    entityType: 'contact',
    entityId: contactId,
    tagName: tag.name,
  })

  if (!domainResult.success) {
    return { error: domainResult.error || 'Error al agregar la etiqueta' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath(`/crm/contactos/${contactId}`)
  return { success: true, data: undefined }
}

/**
 * Remove a tag from a contact.
 * UI sends tagId — adapter looks up tagName before calling domain.
 */
export async function removeTagFromContact(contactId: string, tagId: string): Promise<ActionResult> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  // Look up tag name from tagId
  const supabase = await createClient()
  const { data: tag } = await supabase
    .from('tags')
    .select('name')
    .eq('id', tagId)
    .single()

  if (!tag) {
    return { error: 'Etiqueta no encontrada' }
  }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }
  const domainResult = await domainRemoveTag(domainCtx, {
    entityType: 'contact',
    entityId: contactId,
    tagName: tag.name,
  })

  if (!domainResult.success) {
    return { error: domainResult.error || 'Error al quitar la etiqueta' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath(`/crm/contactos/${contactId}`)
  return { success: true, data: undefined }
}

/**
 * Add a tag to multiple contacts.
 * Loops over domain/tags.assignTag per contact.
 */
export async function bulkAddTag(contactIds: string[], tagId: string): Promise<ActionResult> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  if (contactIds.length === 0) {
    return { error: 'No se seleccionaron contactos' }
  }

  // Look up tag name from tagId
  const supabase = await createClient()
  const { data: tag } = await supabase
    .from('tags')
    .select('name')
    .eq('id', tagId)
    .single()

  if (!tag) {
    return { error: 'Etiqueta no encontrada' }
  }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }

  for (const contactId of contactIds) {
    await domainAssignTag(domainCtx, {
      entityType: 'contact',
      entityId: contactId,
      tagName: tag.name,
    })
  }

  revalidatePath('/crm/contactos')
  return { success: true, data: undefined }
}

/**
 * Remove a tag from multiple contacts.
 * Loops over domain/tags.removeTag per contact.
 */
export async function bulkRemoveTag(contactIds: string[], tagId: string): Promise<ActionResult> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  if (contactIds.length === 0) {
    return { error: 'No se seleccionaron contactos' }
  }

  // Look up tag name from tagId
  const supabase = await createClient()
  const { data: tag } = await supabase
    .from('tags')
    .select('name')
    .eq('id', tagId)
    .single()

  if (!tag) {
    return { error: 'Etiqueta no encontrada' }
  }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }

  for (const contactId of contactIds) {
    await domainRemoveTag(domainCtx, {
      entityType: 'contact',
      entityId: contactId,
      tagName: tag.name,
    })
  }

  revalidatePath('/crm/contactos')
  return { success: true, data: undefined }
}

// ============================================================================
// CSV Import Operations — Delegated to domain
// ============================================================================

export interface BulkCreateContact {
  name: string
  phone: string
  email?: string
  city?: string
  address?: string
  custom_fields?: Record<string, unknown>
}

export interface BulkCreateResult {
  created: number
  errors: { row: number; error: string }[]
}

/**
 * Get all phone numbers in the current workspace
 * Used for duplicate detection during CSV import
 */
export async function getExistingPhones(): Promise<string[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('phone')

  if (error) {
    console.error('Error fetching existing phones:', error)
    return []
  }

  return data?.map(c => c.phone) || []
}

/**
 * Bulk create contacts from CSV import.
 * Delegates to domain/contacts.bulkCreateContacts for batch insert + triggers.
 * Falls back to per-item domain calls on batch failure.
 */
export async function bulkCreateContacts(
  contacts: BulkCreateContact[]
): Promise<ActionResult<BulkCreateResult>> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  if (contacts.length === 0) {
    return { success: true, data: { created: 0, errors: [] } }
  }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }
  const result: BulkCreateResult = { created: 0, errors: [] }

  // Try domain bulk create first
  const domainResult = await domainBulkCreateContacts(domainCtx, {
    contacts: contacts.map(c => ({
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      city: c.city,
    })),
  })

  if (domainResult.success) {
    result.created = domainResult.data!.created
  } else {
    // Batch failed — fall back to individual domain creates for per-row errors
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i]
      const rowNum = i + 1

      const singleResult = await domainCreateContact(domainCtx, {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        address: contact.address,
        city: contact.city,
      })

      if (singleResult.success) {
        result.created++
      } else {
        const errorMsg = singleResult.error?.includes('telefono')
          ? 'Telefono duplicado'
          : 'Error al crear contacto'
        result.errors.push({ row: rowNum, error: errorMsg })
      }
    }
  }

  revalidatePath('/crm/contactos')
  return { success: true, data: result }
}

/**
 * Update an existing contact by phone number.
 * Used for "update" option in duplicate resolution during CSV import.
 * Note: This is a thin convenience adapter — it finds the contact by phone,
 * then delegates to domain updateContact.
 */
export async function updateContactByPhone(
  phone: string,
  data: {
    name?: string
    email?: string
    city?: string
    address?: string
    custom_fields?: Record<string, unknown>
  }
): Promise<ActionResult<Contact>> {
  const ctx = await getWorkspaceContext()
  if ('error' in ctx) return { error: ctx.error }

  // Find contact by phone to get ID
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .single()

  if (!existing) {
    return { error: 'Contacto no encontrado' }
  }

  const domainCtx: DomainContext = { workspaceId: ctx.workspaceId, source: 'server-action' }
  const domainResult = await domainUpdateContact(domainCtx, {
    contactId: existing.id,
    name: data.name,
    email: data.email,
    city: data.city,
    address: data.address,
    customFields: data.custom_fields,
  })

  if (!domainResult.success) {
    return { error: domainResult.error || 'Error al actualizar el contacto' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath(`/crm/contactos/${existing.id}`)

  // Re-read the full contact for the response
  const { data: updated } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', existing.id)
    .single()

  return { success: true, data: updated! }
}

/**
 * Get a contact by phone number
 * Used to fetch existing contact details for duplicate resolution UI
 */
export async function getContactByPhone(phone: string): Promise<Contact | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('phone', phone)
    .single()

  if (error) {
    return null
  }

  return data
}

// ============================================================================
// WhatsApp Integration (read-only — unchanged)
// ============================================================================

/**
 * Conversation summary for display in CRM contact page.
 */
export interface ContactConversationSummary {
  id: string
  phone: string
  status: string
  last_message_at: string | null
  last_message_preview: string | null
  unread_count: number
  tags: Array<{ id: string; name: string; color: string }>
}

/**
 * Get WhatsApp conversations linked to a contact.
 * Returns conversations with their conversation-specific tags.
 */
export async function getContactConversations(
  contactId: string
): Promise<ContactConversationSummary[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      phone,
      status,
      last_message_at,
      last_message_preview,
      unread_count,
      conversation_tags:conversation_tags(tag:tags(id, name, color))
    `)
    .eq('contact_id', contactId)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('Error fetching contact conversations:', error)
    return []
  }

  // Transform to summary format
  return (data || []).map((conv) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conversationTags = conv.conversation_tags as any[] || []
    const tags = conversationTags
      .map((ct) => ct.tag)
      .filter((tag): tag is { id: string; name: string; color: string } =>
        tag !== null && typeof tag === 'object' && 'id' in tag
      )

    return {
      id: conv.id,
      phone: conv.phone,
      status: conv.status,
      last_message_at: conv.last_message_at,
      last_message_preview: conv.last_message_preview,
      unread_count: conv.unread_count,
      tags,
    }
  })
}
