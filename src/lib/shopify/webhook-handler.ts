import { createAdminClient } from '@/lib/supabase/admin'
import { matchContact } from './contact-matcher'
import { mapShopifyOrder, MappedOrder } from './order-mapper'
import { extractPhoneFromOrder } from './phone-normalizer'
import type { ShopifyOrderWebhook, ShopifyIntegration } from './types'
import { createOrder as domainCreateOrder } from '@/lib/domain/orders'
import { createContact as domainCreateContact } from '@/lib/domain/contacts'
import type { DomainContext } from '@/lib/domain/types'

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
 * This is the main orchestration function that:
 * 1. Checks for duplicate (idempotency)
 * 2. Matches or creates contact
 * 3. Creates order with products
 * 4. Logs the webhook event
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

    // Step 1b: Check for duplicate order by shopify_order_id
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('shopify_order_id', order.id)
      .single()

    if (existingOrder) {
      console.log(`Duplicate Shopify order ignored: ${order.id}`)
      // Log event as processed (duplicate)
      await logWebhookEvent(supabase, integration.id, webhookId, 'orders/create', order, 'processed')
      return { success: true, orderId: existingOrder.id, error: 'Order already exists' }
    }

    // Step 2: Log webhook event as pending
    await logWebhookEvent(supabase, integration.id, webhookId, 'orders/create', order, 'pending')

    // Step 3: Match or create contact
    const { contactId, contactCreated, needsVerification } = await resolveContact(
      supabase,
      order,
      workspaceId,
      config.enable_fuzzy_matching
    )

    // Step 4: Map Shopify order to MorfX format
    const mapped = await mapShopifyOrder(order, config, workspaceId, contactId)

    // Step 5: Create order with products
    const orderId = await createOrderWithProducts(supabase, workspaceId, mapped)

    // Step 6: Update webhook event to processed
    await updateWebhookEvent(supabase, integration.id, webhookId, 'processed')

    // Step 7: Update integration last_sync_at
    await supabase
      .from('integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', integration.id)

    console.log(`Processed Shopify order ${order.name} -> MorfX order ${orderId}`)

    return {
      success: true,
      orderId,
      contactId: contactId ?? undefined,
      contactCreated,
      needsVerification,
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
