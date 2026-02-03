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
// Processing is synchronous to ensure completion before Vercel kills the function
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

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

  // Get phone_number_id from the first entry
  const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
  if (!phoneNumberId) {
    console.error('No phone_number_id in webhook payload')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // Get workspace ID from environment
  const workspaceId = process.env.WHATSAPP_DEFAULT_WORKSPACE_ID
  if (!workspaceId) {
    console.error('WHATSAPP_DEFAULT_WORKSPACE_ID not configured')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // Process webhook SYNCHRONOUSLY to ensure it completes before Vercel kills the function
  try {
    await processWebhook(payload, workspaceId, phoneNumberId)
    const duration = Date.now() - startTime
    console.log(`Webhook processed in ${duration}ms for workspace ${workspaceId}`)
  } catch (error) {
    console.error('Webhook processing error:', error)
    // Still return 200 to prevent 360dialog retries
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
