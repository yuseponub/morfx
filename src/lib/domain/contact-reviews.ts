// ============================================================================
// Domain Layer — Contact Reviews
// Manages review records for Shopify orders where the phone is 1-2 digits
// different from an existing contact. The workspace host resolves each
// review as "merge" (update existing contact's phone, reassign order,
// delete temp contact) or "ignore" (keep the new contact as-is).
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query (except token lookups)
//   3. Execute mutation
//   4. Return DomainResult<T>
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { updateContact, deleteContact } from './contacts'
import { updateOrder, removeOrderTag } from './orders'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

export interface CreateContactReviewParams {
  contactNewId: string
  contactExistingId: string
  orderId: string
  shopifyPhone: string
  existingPhone: string
}

export interface PendingTemplate {
  templateName: string
  variables: Record<string, string>
  language: string
  headerMediaUrl?: string
}

// ============================================================================
// Result Types
// ============================================================================

export interface CreateContactReviewResult {
  reviewId: string
  token: string
}

export interface ContactReview {
  id: string
  workspaceId: string
  token: string
  contactNewId: string | null
  contactExistingId: string
  contactNewName: string | null
  contactExistingName: string | null
  orderId: string
  shopifyPhone: string
  existingPhone: string
  status: 'pending' | 'merged' | 'ignored'
  pendingTemplates: PendingTemplate[]
  resolvedAt: string | null
  createdAt: string
}

export interface ResolveResult {
  contactId: string
  phone: string
  sendTemplates: boolean
}

// ============================================================================
// createContactReview
// ============================================================================

/**
 * Create a new contact review record.
 * Returns the generated token for building action links.
 */
export async function createContactReview(
  ctx: DomainContext,
  params: CreateContactReviewParams
): Promise<DomainResult<CreateContactReviewResult>> {
  const supabase = createAdminClient()

  try {
    const { data: review, error: insertError } = await supabase
      .from('contact_reviews')
      .insert({
        workspace_id: ctx.workspaceId,
        contact_new_id: params.contactNewId,
        contact_existing_id: params.contactExistingId,
        order_id: params.orderId,
        shopify_phone: params.shopifyPhone,
        existing_phone: params.existingPhone,
      })
      .select('id, token')
      .single()

    if (insertError || !review) {
      return {
        success: false,
        error: `Error al crear la revision de contacto: ${insertError?.message}`,
      }
    }

    return {
      success: true,
      data: { reviewId: review.id, token: review.token },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// getContactReviewByToken
// ============================================================================

/**
 * Get a contact review by its unique token.
 * No workspace_id filter — token is globally unique (UUID).
 * Uses left join for contact_new because it may be NULL after merge.
 * Returns workspace_id for downstream operations.
 */
export async function getContactReviewByToken(
  token: string
): Promise<DomainResult<ContactReview>> {
  const supabase = createAdminClient()

  try {
    // Use a raw query-like approach: fetch review + join contact names
    const { data: review, error: fetchError } = await supabase
      .from('contact_reviews')
      .select(`
        id,
        workspace_id,
        token,
        contact_new_id,
        contact_existing_id,
        order_id,
        shopify_phone,
        existing_phone,
        status,
        pending_templates,
        resolved_at,
        created_at
      `)
      .eq('token', token)
      .single()

    if (fetchError || !review) {
      return { success: false, error: 'Revision de contacto no encontrada' }
    }

    // Fetch contact names separately (left join for contact_new which may be NULL)
    let contactNewName: string | null = null
    if (review.contact_new_id) {
      const { data: newContact } = await supabase
        .from('contacts')
        .select('name')
        .eq('id', review.contact_new_id)
        .single()
      contactNewName = newContact?.name ?? null
    }

    let contactExistingName: string | null = null
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('name')
      .eq('id', review.contact_existing_id)
      .single()
    contactExistingName = existingContact?.name ?? null

    return {
      success: true,
      data: {
        id: review.id,
        workspaceId: review.workspace_id,
        token: review.token,
        contactNewId: review.contact_new_id,
        contactExistingId: review.contact_existing_id,
        contactNewName,
        contactExistingName,
        orderId: review.order_id,
        shopifyPhone: review.shopify_phone,
        existingPhone: review.existing_phone,
        status: review.status as 'pending' | 'merged' | 'ignored',
        pendingTemplates: (review.pending_templates ?? []) as PendingTemplate[],
        resolvedAt: review.resolved_at,
        createdAt: review.created_at,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// resolveContactReview
// ============================================================================

/**
 * Resolve a contact review as "merge" or "ignore".
 *
 * MERGE path (critical order):
 *   1. Update review status to 'merged' + resolved_at FIRST
 *   2. Update existing contact's phone to shopify_phone
 *   3. Reassign order's contact_id to existing contact
 *   4. Delete new contact (triggers ON DELETE SET NULL on contact_new_id)
 *   5. Remove REVISAR-CONTACTO tag from order
 *
 * IGNORE path:
 *   1. Update review status to 'ignored' + resolved_at
 *   2. Keep new contact as-is
 *   3. Remove REVISAR-CONTACTO tag from order
 */
export async function resolveContactReview(
  token: string,
  action: 'merge' | 'ignore'
): Promise<DomainResult<ResolveResult>> {
  const supabase = createAdminClient()

  try {
    // Fetch review and validate status
    const { data: review, error: fetchError } = await supabase
      .from('contact_reviews')
      .select('id, workspace_id, contact_new_id, contact_existing_id, order_id, shopify_phone, status')
      .eq('token', token)
      .single()

    if (fetchError || !review) {
      return { success: false, error: 'Revision de contacto no encontrada' }
    }

    if (review.status !== 'pending') {
      return {
        success: false,
        error: `La revision ya fue resuelta como "${review.status}"`,
      }
    }

    const ctx: DomainContext = {
      workspaceId: review.workspace_id,
      source: 'server-action',
    }

    if (action === 'merge') {
      // Step 1: CRITICAL — Update review status BEFORE deleting contact
      // This preserves the audit trail (contact_new_id will become NULL via SET NULL)
      const { error: statusError } = await supabase
        .from('contact_reviews')
        .update({
          status: 'merged',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', review.id)

      if (statusError) {
        return {
          success: false,
          error: `Error al actualizar estado: ${statusError.message}`,
        }
      }

      // Step 2: Update existing contact's phone to the Shopify phone
      const updateResult = await updateContact(ctx, {
        contactId: review.contact_existing_id,
        phone: review.shopify_phone,
      })

      if (!updateResult.success) {
        return {
          success: false,
          error: `Error al actualizar telefono del contacto: ${updateResult.error}`,
        }
      }

      // Step 3: Reassign order's contact_id to the existing contact
      const orderResult = await updateOrder(ctx, {
        orderId: review.order_id,
        contactId: review.contact_existing_id,
      })

      if (!orderResult.success) {
        return {
          success: false,
          error: `Error al reasignar pedido: ${orderResult.error}`,
        }
      }

      // Step 4: Delete new contact (it was temporary)
      // ON DELETE SET NULL will set contact_new_id = NULL in the review record
      if (review.contact_new_id) {
        const deleteResult = await deleteContact(ctx, {
          contactId: review.contact_new_id,
        })

        if (!deleteResult.success) {
          // Non-fatal: contact may already be deleted or have other orders
          console.warn(
            `[contact-reviews] Could not delete new contact ${review.contact_new_id}: ${deleteResult.error}`
          )
        }
      }

      // Step 5: Remove REVISAR-CONTACTO tag from order
      await removeOrderTag(ctx, {
        orderId: review.order_id,
        tagName: 'REVISAR-CONTACTO',
      })

      return {
        success: true,
        data: {
          contactId: review.contact_existing_id,
          phone: review.shopify_phone,
          sendTemplates: true,
        },
      }
    } else {
      // IGNORE path: keep new contact, just resolve the review

      // Step 1: Update review status
      const { error: statusError } = await supabase
        .from('contact_reviews')
        .update({
          status: 'ignored',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', review.id)

      if (statusError) {
        return {
          success: false,
          error: `Error al actualizar estado: ${statusError.message}`,
        }
      }

      // Step 2: Remove REVISAR-CONTACTO tag from order
      await removeOrderTag(ctx, {
        orderId: review.order_id,
        tagName: 'REVISAR-CONTACTO',
      })

      return {
        success: true,
        data: {
          contactId: review.contact_new_id ?? review.contact_existing_id,
          phone: review.shopify_phone,
          sendTemplates: true,
        },
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// addPendingTemplate
// ============================================================================

/**
 * Append a template entry to the pending_templates JSONB array.
 * Used when automation template actions are skipped during review.
 */
// ============================================================================
// sendPendingTemplate
// ============================================================================

/**
 * Send a single blocked template to the resolved contact.
 * Uses the direct 360dialog API (no conversation needed).
 * Reads the contact's phone fresh from DB — after merge, the existing
 * contact's phone will have been updated to the Shopify phone.
 */
export async function sendPendingTemplate(
  workspaceId: string,
  contactId: string,
  template: PendingTemplate,
): Promise<void> {
  const supabase = createAdminClient()

  // 1. Get workspace API key
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('whatsapp_api_key')
    .eq('id', workspaceId)
    .single()

  if (!workspace?.whatsapp_api_key) {
    throw new Error('Workspace has no WhatsApp API key')
  }

  // 2. Get contact phone (fresh read — may have been updated during merge)
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone')
    .eq('id', contactId)
    .single()

  if (!contact?.phone) {
    throw new Error('Contact has no phone number')
  }

  // 3. Build components from stored variables
  const bodyParams = Object.values(template.variables).map(val => ({
    type: 'text' as const,
    text: val,
  }))

  const components: Array<{
    type: 'header' | 'body' | 'button'
    parameters?: Array<{
      type: 'text' | 'image' | 'document' | 'video'
      text?: string
      image?: { link: string }
      document?: { link: string }
      video?: { link: string }
    }>
  }> = []

  if (bodyParams.length > 0) {
    components.push({ type: 'body', parameters: bodyParams })
  }
  if (template.headerMediaUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: template.headerMediaUrl } }],
    })
  }

  // 4. Send via direct 360dialog API (no conversation needed)
  const { sendTemplateMessage: send360Template } = await import('@/lib/whatsapp/api')
  await send360Template(
    workspace.whatsapp_api_key,
    contact.phone,
    template.templateName,
    template.language,
    components.length > 0 ? components : undefined,
  )

  console.log(`[contact-reviews] Sent pending template ${template.templateName} to ${contact.phone}`)
}

// ============================================================================
// addPendingTemplate
// ============================================================================

export async function addPendingTemplate(
  token: string,
  templateData: PendingTemplate
): Promise<DomainResult<void>> {
  const supabase = createAdminClient()

  try {
    // Fetch current pending_templates
    const { data: review, error: fetchError } = await supabase
      .from('contact_reviews')
      .select('id, pending_templates')
      .eq('token', token)
      .single()

    if (fetchError || !review) {
      return { success: false, error: 'Revision de contacto no encontrada' }
    }

    const current = (review.pending_templates ?? []) as PendingTemplate[]
    const updated = [...current, templateData]

    const { error: updateError } = await supabase
      .from('contact_reviews')
      .update({ pending_templates: updated })
      .eq('id', review.id)

    if (updateError) {
      return {
        success: false,
        error: `Error al agregar template pendiente: ${updateError.message}`,
      }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
