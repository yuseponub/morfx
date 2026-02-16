// ============================================================================
// Phase 11 + Phase 20: Shopify Webhook Endpoint
// Receives webhook events from Shopify:
//   - orders/create: New order (auto-sync or trigger-only)
//   - orders/updated: Order status/fulfillment changes
//   - draft_orders/create: New draft order (trigger-only)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyShopifyHmac } from '@/lib/shopify/hmac'
import { processShopifyWebhook, processShopifyOrderUpdated, processShopifyDraftOrder } from '@/lib/shopify/webhook-handler'
import type { ShopifyOrderWebhook, ShopifyDraftOrderWebhook, ShopifyIntegration } from '@/lib/shopify/types'

// ============================================================================
// WEBHOOK EVENTS (POST)
// Receives order events from Shopify
// CRITICAL: Must verify HMAC BEFORE processing
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Step 1: Get raw body as TEXT (critical for HMAC verification)
  // DO NOT use request.json() before HMAC verification
  const rawBody = await request.text()

  // Step 2: Get required headers
  const hmacHeader = request.headers.get('X-Shopify-Hmac-SHA256')
  const webhookId = request.headers.get('X-Shopify-Webhook-Id')
  const shopDomain = request.headers.get('X-Shopify-Shop-Domain')
  const topic = request.headers.get('X-Shopify-Topic')

  // Validate required headers
  if (!hmacHeader) {
    console.warn('Shopify webhook missing HMAC header')
    return NextResponse.json({ error: 'Missing HMAC' }, { status: 401 })
  }

  if (!webhookId) {
    console.warn('Shopify webhook missing webhook ID')
    return NextResponse.json({ error: 'Missing Webhook ID' }, { status: 400 })
  }

  if (!shopDomain) {
    console.warn('Shopify webhook missing shop domain')
    return NextResponse.json({ error: 'Missing Shop Domain' }, { status: 400 })
  }

  // Step 3: Find integration by shop domain
  const supabase = createAdminClient()

  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('type', 'shopify')
    .eq('is_active', true)

  // Find integration matching this shop domain
  const integration = (integrations || []).find((int) => {
    const config = int.config as { shop_domain?: string }
    return config.shop_domain?.toLowerCase() === shopDomain.toLowerCase()
  }) as ShopifyIntegration | undefined

  if (!integration) {
    console.warn(`No active Shopify integration for shop: ${shopDomain}`)
    // Return 200 to prevent Shopify from retrying for unknown shops
    return NextResponse.json({ received: true, ignored: 'unknown_shop' }, { status: 200 })
  }

  // Step 4: Verify HMAC
  const apiSecret = integration.config.api_secret
  const isValid = verifyShopifyHmac(rawBody, hmacHeader, apiSecret)

  if (!isValid) {
    console.warn(`Invalid HMAC for shop: ${shopDomain}`)
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 })
  }

  // Step 5: Parse payload (safe now after HMAC verification)
  // Generic parse — type cast happens in topic-specific dispatch
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.error('Failed to parse Shopify webhook payload')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Step 6: Dispatch by topic
  const supportedTopics = ['orders/create', 'orders/updated', 'draft_orders/create']
  if (!supportedTopics.includes(topic || '')) {
    console.log(`Ignoring Shopify webhook topic: ${topic}`)
    return NextResponse.json({ received: true, ignored: topic }, { status: 200 })
  }

  // Step 7: Process by topic
  // Shopify requires 200 response within 5 seconds, but processing should be fast
  try {
    let result: { success: boolean; error?: string; orderId?: string; contactId?: string; contactCreated?: boolean; needsVerification?: boolean }

    switch (topic) {
      case 'orders/create':
        result = await processShopifyWebhook(payload as ShopifyOrderWebhook, integration, webhookId)
        break
      case 'orders/updated':
        result = await processShopifyOrderUpdated(payload as ShopifyOrderWebhook, integration, webhookId)
        break
      case 'draft_orders/create':
        result = await processShopifyDraftOrder(payload as ShopifyDraftOrderWebhook, integration, webhookId)
        break
      default:
        result = { success: true }
    }

    const duration = Date.now() - startTime
    console.log(`Shopify webhook [${topic}] processed in ${duration}ms: ${result.success ? 'success' : 'failed'}`)

    if (result.success) {
      return NextResponse.json({
        received: true,
        topic,
        orderId: result.orderId,
        contactId: result.contactId,
        contactCreated: result.contactCreated,
        needsVerification: result.needsVerification,
      }, { status: 200 })
    } else {
      // Log error but return 200 to prevent immediate retry
      // Failed webhooks are logged and can be retried manually
      console.error(`Shopify webhook [${topic}] processing failed:`, result.error)
      return NextResponse.json({
        received: true,
        error: result.error,
      }, { status: 200 })
    }
  } catch (error) {
    console.error(`Shopify webhook [${topic}] processing error:`, error)
    // Still return 200 to prevent Shopify from hammering us with retries
    // The error is logged in webhook_events table
    return NextResponse.json({
      received: true,
      error: 'Processing failed',
    }, { status: 200 })
  }
}

// ============================================================================
// HEALTH CHECK (GET)
// Can be used to verify endpoint is reachable
// ============================================================================

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'shopify-webhook',
    timestamp: new Date().toISOString(),
  })
}
