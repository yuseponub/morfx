import { createAdminClient } from '@/lib/supabase/admin'
import { matchContact } from './contact-matcher'
import { mapShopifyOrder, MappedOrder } from './order-mapper'
import { extractPhoneFromOrder } from './phone-normalizer'
import type { ShopifyOrderWebhook, ShopifyDraftOrderWebhook, ShopifyIntegration } from './types'
import { createOrder as domainCreateOrder } from '@/lib/domain/orders'
import { createContact as domainCreateContact } from '@/lib/domain/contacts'
import type { DomainContext } from '@/lib/domain/types'
import { inngest } from '@/inngest/client'

/**
 * Result of processing a Shopify webhook.
 */
export interface ProcessResult {
  success: boolean
  orderId?: string
  contactId?: string
  contactCreated?: boolean
  needsVerification?: boolean  // Contact match needs human verification
  error?: string
}

/**
 * Processes a Shopify orders/create webhook.
 * Dual-behavior based on auto_sync_orders config:
 *   - auto_sync=true (default): Creates CRM contact+order AND emits trigger
 *   - auto_sync=false: Only emits trigger for automations to handle
 *
 * @param order - Shopify order webhook payload
 * @param integration - Shopify integration config
 * @param webhookId - X-Shopify-Webhook-Id for idempotency
 * @returns Processing result
 */
export async function processShopifyWebhook(
  order: ShopifyOrderWebhook,
  integration: ShopifyIntegration,
  webhookId: string
): Promise<ProcessResult> {
  const supabase = createAdminClient()
  const workspaceId = integration.workspace_id
  const config = integration.config

  try {
    // Step 1: Check for duplicate webhook
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id, status')
      .eq('integration_id', integration.id)
      .eq('external_id', webhookId)
      .single()

    if (existingEvent) {
      console.log(`Duplicate webhook ignored: ${webhookId}`)
      return { success: true, error: 'Duplicate webhook' }
    }

    // Read auto_sync setting (defaults to true for backward compatibility)
    const autoSync = config.auto_sync_orders !== false

    if (autoSync) {
      // ================================================================
      // AUTO-SYNC MODE: Create CRM records + emit trigger (existing behavior)
      // ================================================================

      // Check for duplicate order by shopify_order_id
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('shopify_order_id', order.id)
        .single()

      if (existingOrder) {
        console.log(`Duplicate Shopify order ignored: ${order.id}`)
        await logWebhookEvent(supabase, integration.id, webhookId, 'orders/create', order, 'processed')
        return { success: true, orderId: existingOrder.id, error: 'Order already exists' }
      }

      // Log webhook event as pending
      await logWebhookEvent(supabase, integration.id, webhookId, 'orders/create', order, 'pending')

      // Match or create contact
      const { contactId, contactCreated, needsVerification } = await resolveContact(
        supabase,
        order,
        workspaceId,
        config.enable_fuzzy_matching
      )

      // Map Shopify order to MorfX format
      const mapped = await mapShopifyOrder(order, config, workspaceId, contactId)

      // Create order with products
      const orderId = await createOrderWithProducts(supabase, workspaceId, mapped)

      // Update webhook event to processed
      await updateWebhookEvent(supabase, integration.id, webhookId, 'processed')

      // Update integration last_sync_at
      await supabase
        .from('integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', integration.id)

      // Emit trigger for automations (awaited — fire-and-forget is unreliable on Vercel serverless)
      const phone = extractPhoneFromOrder(order)
      const contactName = buildContactName(order) || undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (inngest.send as any)({
        name: 'automation/shopify.order_created',
        data: {
          workspaceId,
          shopifyOrderId: order.id,
          shopifyOrderNumber: order.name,
          total: order.total_price,
          financialStatus: order.financial_status,
          email: order.email,
          phone,
          note: order.note,
          products: order.line_items.map(li => ({ sku: li.sku, title: li.title, quantity: li.quantity, price: li.price })),
          shippingAddress: buildShippingAddressString(order),
          shippingCity: order.shipping_address?.city || null,
          shippingDepartment: order.shipping_address?.province || null,
          tags: null,
          contactId: contactId ?? undefined,
          contactName,
          contactPhone: phone || undefined,
          orderId,
          cascadeDepth: 0,
        },
      })

      console.log(`Processed Shopify order ${order.name} -> MorfX order ${orderId} (auto-sync)`)

      return {
        success: true,
        orderId,
        contactId: contactId ?? undefined,
        contactCreated,
        needsVerification,
      }
    } else {
      // ================================================================
      // TRIGGER-ONLY MODE: Only emit trigger, no CRM creation
      // ================================================================

      // Log webhook event
      await logWebhookEvent(supabase, integration.id, webhookId, 'orders/create', order, 'processed')

      // Emit trigger for automations (awaited — fire-and-forget is unreliable on Vercel serverless)
      const phone = extractPhoneFromOrder(order)
      const contactName = buildContactName(order) || undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (inngest.send as any)({
        name: 'automation/shopify.order_created',
        data: {
          workspaceId,
          shopifyOrderId: order.id,
          shopifyOrderNumber: order.name,
          total: order.total_price,
          financialStatus: order.financial_status,
          email: order.email,
          phone,
          note: order.note,
          products: order.line_items.map(li => ({ sku: li.sku, title: li.title, quantity: li.quantity, price: li.price })),
          shippingAddress: buildShippingAddressString(order),
          shippingCity: order.shipping_address?.city || null,
          shippingDepartment: order.shipping_address?.province || null,
          tags: null,
          contactName,
          contactPhone: phone || undefined,
          cascadeDepth: 0,
        },
      })

      console.log(`Shopify order ${order.name} trigger emitted (trigger-only mode)`)

      return { success: true }
    }
  } catch (error) {
    console.error('Error processing Shopify webhook:', error)

    // Update webhook event to failed
    await updateWebhookEvent(
      supabase,
      integration.id,
      webhookId,
      'failed',
      error instanceof Error ? error.message : 'Unknown error'
    )

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Processes a Shopify orders/updated webhook.
 * Emits shopify.order_updated trigger with full payload data.
 * Looks up existing MorfX order by shopify_order_id for context enrichment.
 *
 * @param order - Shopify order webhook payload (updated order)
 * @param integration - Shopify integration config
 * @param webhookId - X-Shopify-Webhook-Id for idempotency
 * @returns Processing result
 */
export async function processShopifyOrderUpdated(
  order: ShopifyOrderWebhook,
  integration: ShopifyIntegration,
  webhookId: string
): Promise<ProcessResult> {
  const supabase = createAdminClient()
  const workspaceId = integration.workspace_id

  try {
    // Check for duplicate webhook
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('integration_id', integration.id)
      .eq('external_id', webhookId)
      .single()

    if (existingEvent) {
      return { success: true, error: 'Duplicate webhook' }
    }

    // Log webhook event
    await logWebhookEvent(supabase, integration.id, webhookId, 'orders/updated', order, 'processed')

    // Look up existing MorfX order by shopify_order_id to get contactId
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, contact_id')
      .eq('workspace_id', workspaceId)
      .eq('shopify_order_id', order.id)
      .single()

    // Look up contact name/phone if we have a contact
    let contactName: string | undefined
    let contactPhone: string | undefined
    if (existingOrder?.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone')
        .eq('id', existingOrder.contact_id)
        .single()
      contactName = contact?.name || undefined
      contactPhone = contact?.phone || undefined
    }

    // Emit trigger for automations (awaited — fire-and-forget is unreliable on Vercel serverless)
    const phone = extractPhoneFromOrder(order)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (inngest.send as any)({
      name: 'automation/shopify.order_updated',
      data: {
        workspaceId,
        shopifyOrderId: order.id,
        shopifyOrderNumber: order.name,
        total: order.total_price,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        email: order.email,
        phone,
        note: order.note,
        products: order.line_items.map(li => ({ sku: li.sku, title: li.title, quantity: li.quantity, price: li.price })),
        shippingAddress: buildShippingAddressString(order),
        shippingCity: order.shipping_address?.city || null,
        shippingDepartment: order.shipping_address?.province || null,
        tags: null,
        contactId: existingOrder?.contact_id || undefined,
        contactName,
        contactPhone,
        orderId: existingOrder?.id || undefined,
        cascadeDepth: 0,
      },
    })

    console.log(`Shopify order updated: ${order.name} (${order.financial_status}/${order.fulfillment_status || 'unfulfilled'})`)

    return { success: true, orderId: existingOrder?.id }
  } catch (error) {
    console.error('Error processing Shopify order updated:', error)
    await updateWebhookEvent(supabase, integration.id, webhookId, 'failed', error instanceof Error ? error.message : 'Unknown error')
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Processes a Shopify draft_orders/create webhook.
 * Draft orders ALWAYS go through automations only (no auto-sync CRM creation).
 * Emits shopify.draft_order_created trigger with draft-specific fields.
 *
 * @param draftOrder - Shopify draft order webhook payload
 * @param integration - Shopify integration config
 * @param webhookId - X-Shopify-Webhook-Id for idempotency
 * @returns Processing result
 */
export async function processShopifyDraftOrder(
  draftOrder: ShopifyDraftOrderWebhook,
  integration: ShopifyIntegration,
  webhookId: string
): Promise<ProcessResult> {
  const supabase = createAdminClient()
  const workspaceId = integration.workspace_id

  try {
    // Check for duplicate webhook
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('integration_id', integration.id)
      .eq('external_id', webhookId)
      .single()

    if (existingEvent) {
      return { success: true, error: 'Duplicate webhook' }
    }

    // Log webhook event
    await logWebhookEvent(supabase, integration.id, webhookId, 'draft_orders/create', draftOrder, 'processed')

    // Extract contact info from draft order
    // Use type cast since extractPhoneFromOrder expects ShopifyOrderWebhook
    // but the phone fields (customer.phone, shipping_address.phone, phone) are shared
    const phone = extractPhoneFromOrder(draftOrder as unknown as ShopifyOrderWebhook)
    const customerName = draftOrder.customer
      ? [draftOrder.customer.first_name, draftOrder.customer.last_name].filter(Boolean).join(' ') || undefined
      : undefined

    // Emit trigger for automations (awaited — fire-and-forget is unreliable on Vercel serverless)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (inngest.send as any)({
      name: 'automation/shopify.draft_order_created',
      data: {
        workspaceId,
        shopifyDraftOrderId: draftOrder.id,
        shopifyOrderNumber: draftOrder.name,
        total: draftOrder.total_price,
        status: draftOrder.status || 'open',
        email: draftOrder.email,
        phone,
        note: draftOrder.note,
        products: draftOrder.line_items.map(li => ({ sku: li.sku, title: li.title, quantity: li.quantity, price: li.price })),
        shippingAddress: draftOrder.shipping_address
          ? [draftOrder.shipping_address.address1, draftOrder.shipping_address.address2].filter(Boolean).join(', ') || null
          : null,
        contactName: customerName,
        contactPhone: phone || undefined,
        cascadeDepth: 0,
      },
    })

    console.log(`Shopify draft order created: ${draftOrder.name} (${draftOrder.status || 'open'})`)

    return { success: true }
  } catch (error) {
    console.error('Error processing Shopify draft order:', error)
    await updateWebhookEvent(supabase, integration.id, webhookId, 'failed', error instanceof Error ? error.message : 'Unknown error')
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Resolves contact: match existing or create new.
 */
async function resolveContact(
  supabase: ReturnType<typeof createAdminClient>,
  order: ShopifyOrderWebhook,
  workspaceId: string,
  enableFuzzyMatching: boolean
): Promise<{
  contactId: string | null
  contactCreated: boolean
  needsVerification: boolean
}> {
  // Try to match existing contact
  const match = await matchContact(order, workspaceId, { enableFuzzyMatching })

  if (match.contact) {
    return {
      contactId: match.contact.id,
      contactCreated: false,
      needsVerification: match.needsVerification,
    }
  }

  // No match - create new contact via domain
  const phone = extractPhoneFromOrder(order)
  const email = order.email || order.customer?.email
  const name = buildContactName(order)

  if (!name) {
    // Cannot create contact without a name
    return { contactId: null, contactCreated: false, needsVerification: false }
  }

  const ctx: DomainContext = { workspaceId, source: 'webhook' }
  const domainResult = await domainCreateContact(ctx, {
    name,
    phone: phone || undefined,
    email: email || undefined,
    address: buildShippingAddressString(order) || undefined,
    city: order.shipping_address?.city || order.billing_address?.city || undefined,
    department: order.shipping_address?.province || order.billing_address?.province || undefined,
  })

  if (!domainResult.success) {
    // Handle duplicate phone (race condition or existing contact)
    if (domainResult.error?.includes('telefono') && phone) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('phone', phone)
        .single()

      if (existing) {
        return { contactId: existing.id, contactCreated: false, needsVerification: false }
      }
    }
    console.error('Error creating contact via domain:', domainResult.error)
    return { contactId: null, contactCreated: false, needsVerification: false }
  }

  return { contactId: domainResult.data!.contactId, contactCreated: true, needsVerification: false }
}

/**
 * Creates order with products via domain layer.
 * Shopify-specific fields (shopify_order_id) are set via direct DB update after domain create.
 */
async function createOrderWithProducts(
  supabase: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  mapped: MappedOrder
): Promise<string> {
  const ctx: DomainContext = { workspaceId, source: 'webhook' }

  const result = await domainCreateOrder(ctx, {
    pipelineId: mapped.order.pipeline_id,
    stageId: mapped.order.stage_id,
    contactId: mapped.order.contact_id,
    description: mapped.order.description,
    shippingAddress: mapped.order.shipping_address,
    shippingCity: mapped.order.shipping_city,
    products: mapped.products.map(p => ({
      productId: p.product_id,
      sku: p.sku,
      title: p.title,
      unitPrice: p.unit_price,
      quantity: p.quantity,
    })),
  })

  if (!result.success) {
    throw new Error(`Failed to create order: ${result.error}`)
  }

  // Set shopify_order_id (domain doesn't know about Shopify-specific fields)
  await supabase
    .from('orders')
    .update({ shopify_order_id: mapped.shopifyOrderId })
    .eq('id', result.data!.orderId)

  return result.data!.orderId
}

/**
 * Builds contact name from Shopify order data.
 */
function buildContactName(order: ShopifyOrderWebhook): string | null {
  // Try customer name first
  if (order.customer?.first_name || order.customer?.last_name) {
    return [order.customer.first_name, order.customer.last_name]
      .filter(Boolean)
      .join(' ')
  }

  // Try shipping address name
  if (order.shipping_address?.first_name || order.shipping_address?.last_name) {
    return [order.shipping_address.first_name, order.shipping_address.last_name]
      .filter(Boolean)
      .join(' ')
  }

  // Try billing address name
  if (order.billing_address?.first_name || order.billing_address?.last_name) {
    return [order.billing_address.first_name, order.billing_address.last_name]
      .filter(Boolean)
      .join(' ')
  }

  return null
}

/**
 * Builds address string from shipping address.
 */
function buildShippingAddressString(order: ShopifyOrderWebhook): string | null {
  const addr = order.shipping_address
  if (!addr) return null

  return [addr.address1, addr.address2].filter(Boolean).join(', ') || null
}

// Webhook event logging helpers
async function logWebhookEvent(
  supabase: ReturnType<typeof createAdminClient>,
  integrationId: string,
  externalId: string,
  topic: string,
  payload: unknown,
  status: string
): Promise<void> {
  await supabase.from('webhook_events').insert({
    integration_id: integrationId,
    external_id: externalId,
    topic,
    payload,
    status,
  })
}

async function updateWebhookEvent(
  supabase: ReturnType<typeof createAdminClient>,
  integrationId: string,
  externalId: string,
  status: string,
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('webhook_events')
    .update({
      status,
      error_message: errorMessage,
      processed_at: status === 'processed' ? new Date().toISOString() : null,
    })
    .eq('integration_id', integrationId)
    .eq('external_id', externalId)
}
