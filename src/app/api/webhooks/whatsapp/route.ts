// ============================================================================
// Phase 7: WhatsApp Webhook Endpoint
// Receives webhook events from 360dialog
// ============================================================================

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { processWebhook } from '@/lib/whatsapp/webhook-handler'
import type { WebhookPayload } from '@/lib/whatsapp/types'

// Extend function timeout for agent processing (multiple Claude API calls)
export const maxDuration = 60

// ============================================================================
// HMAC VERIFICATION (Security #2)
// Verifies webhook signatures from 360dialog / WhatsApp Cloud API
// ============================================================================

/**
 * Verify HMAC-SHA256 signature from WhatsApp webhook.
 * Supports both 'sha256=xxx' prefix format and raw hex format.
 */
function verifyWhatsAppHmac(body: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(body)
  const expectedSignature = hmac.digest('hex')
  // Handle both 'sha256=xxx' prefix format and raw hex format
  const actualSignature = signature.startsWith('sha256=') ? signature.slice(7) : signature
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(actualSignature)
    )
  } catch {
    return false // Length mismatch
  }
}

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

  // Security #2: Read raw body FIRST for HMAC verification (before JSON parsing)
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    console.error('Failed to read webhook body')
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // Security #2: Verify HMAC signature when WHATSAPP_WEBHOOK_SECRET is set (production)
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET
  if (webhookSecret) {
    const signature = request.headers.get('X-Hub-Signature-256') || request.headers.get('X-360Dialog-Signature') || ''
    if (!signature) {
      console.warn('WhatsApp webhook: missing signature header')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }
    const isValid = verifyWhatsAppHmac(rawBody, signature, webhookSecret)
    if (!isValid) {
      console.warn('WhatsApp webhook: invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  // Parse payload from raw body (after HMAC verification)
  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody)
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
