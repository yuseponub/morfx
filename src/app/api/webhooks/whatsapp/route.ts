// ============================================================================
// Phase 7: WhatsApp Webhook Endpoint
// Receives webhook events from 360dialog
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { processWebhook } from '@/lib/whatsapp/webhook-handler'
import type { WebhookPayload } from '@/lib/whatsapp/types'

// ============================================================================
// WEBHOOK VERIFICATION (GET)
// 360dialog sends a challenge to verify the webhook URL
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // Get verification parameters
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Get expected token from environment
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  // Verify mode and token
  if (mode === 'subscribe' && token === expectedToken) {
    console.log('Webhook verified successfully')
    // Return the challenge as plain text
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  // Verification failed
  console.warn('Webhook verification failed:', { mode, token })
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// ============================================================================
// WEBHOOK EVENTS (POST)
// Receives message and status events from 360dialog
// CRITICAL: Must return 200 within 5 seconds
// ============================================================================

export async function POST(request: NextRequest) {
  // Parse payload
  let payload: WebhookPayload
  try {
    payload = await request.json()
  } catch {
    console.error('Failed to parse webhook payload')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate it's a WhatsApp webhook
  if (payload.object !== 'whatsapp_business_account') {
    console.warn('Received non-WhatsApp webhook:', payload.object)
    return NextResponse.json({ error: 'Invalid webhook type' }, { status: 400 })
  }

  // Get phone_number_id from the first entry to look up workspace
  const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
  if (!phoneNumberId) {
    console.error('No phone_number_id in webhook payload')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // Return 200 immediately - CRITICAL for 360dialog
  // 360dialog has a 5-second timeout and will retry if we don't respond
  const responsePromise = NextResponse.json({ received: true }, { status: 200 })

  // Process webhook asynchronously
  // In a production system, this would go to a queue
  // For MVP, we process inline but after returning the response
  processWebhookAsync(payload, phoneNumberId).catch((error) => {
    console.error('Async webhook processing error:', error)
  })

  return responsePromise
}

// ============================================================================
// ASYNC WEBHOOK PROCESSING
// ============================================================================

/**
 * Process webhook asynchronously after returning 200.
 * Uses WHATSAPP_DEFAULT_WORKSPACE_ID for MVP single-workspace setup.
 */
async function processWebhookAsync(
  payload: WebhookPayload,
  phoneNumberId: string
): Promise<void> {
  try {
    // MVP: Use environment variable for workspace ID
    // Future: Look up workspace by phone_number_id in a mapping table
    const workspaceId = process.env.WHATSAPP_DEFAULT_WORKSPACE_ID

    if (!workspaceId) {
      console.error('WHATSAPP_DEFAULT_WORKSPACE_ID not configured')
      return
    }

    // Verify phone_number_id matches (optional security check)
    const expectedPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    if (expectedPhoneNumberId && phoneNumberId !== expectedPhoneNumberId) {
      console.warn(`Webhook for unexpected phone: ${phoneNumberId}, expected: ${expectedPhoneNumberId}`)
      // Still process - might be valid for multi-number setups
    }

    // Process the webhook
    await processWebhook(payload, workspaceId, phoneNumberId)

    console.log(`Webhook processed for workspace ${workspaceId}`)
  } catch (error) {
    console.error('Error in async webhook processing:', error)
    throw error
  }
}
