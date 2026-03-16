// ============================================================================
// ManyChat Webhook Endpoint
// Receives messages from ManyChat External Request (Facebook/Instagram).
// ManyChat Flow Builder sends POST with subscriber info + message text.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processManyChatWebhook } from '@/lib/manychat/webhook-handler'
import type { ManyChatWebhookPayload } from '@/lib/manychat/webhook-handler'

// Extend function timeout for agent processing
export const maxDuration = 60

// ============================================================================
// WORKSPACE RESOLUTION
// Resolve workspace from ManyChat page_id or use env var fallback
// ============================================================================

async function resolveWorkspaceForManyChat(payload: ManyChatWebhookPayload): Promise<string | null> {
  // For now: use env var (single workspace: Somnio)
  // When GoDentist is added: lookup by page_id in workspace settings
  const workspaceId = process.env.MANYCHAT_DEFAULT_WORKSPACE_ID || process.env.WHATSAPP_DEFAULT_WORKSPACE_ID
  if (workspaceId) return workspaceId

  // Fallback: try to find workspace with manychat_api_key configured
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('workspaces')
      .select('id')
      .not('settings->>manychat_api_key', 'is', null)
      .limit(1)
      .single()
    return data?.id || null
  } catch {
    return null
  }
}

// ============================================================================
// WEBHOOK HANDLER (POST)
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // 1. Verify shared secret (simple auth for ManyChat External Request)
  const expectedSecret = process.env.MANYCHAT_WEBHOOK_SECRET
  if (expectedSecret) {
    const secret = request.headers.get('x-manychat-secret')
      || request.nextUrl.searchParams.get('secret')

    if (secret !== expectedSecret) {
      console.warn('[manychat-webhook] Invalid or missing secret')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // 2. Parse payload
  let payload: ManyChatWebhookPayload
  try {
    payload = await request.json()
  } catch {
    console.error('[manychat-webhook] Failed to parse JSON body')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 3. Validate required fields
  if (!payload.subscriber_id) {
    console.error('[manychat-webhook] Missing subscriber_id')
    return NextResponse.json({ error: 'Missing subscriber_id' }, { status: 400 })
  }

  if (!payload.message_text) {
    // Empty message (e.g. image-only from ManyChat) — acknowledge but don't process
    console.log('[manychat-webhook] No message_text, skipping')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 4. Resolve workspace
  const workspaceId = await resolveWorkspaceForManyChat(payload)
  if (!workspaceId) {
    console.error('[manychat-webhook] No workspace configured for ManyChat')
    return NextResponse.json({ error: 'No workspace' }, { status: 500 })
  }

  // 5. Process (synchronous, same pattern as WhatsApp webhook)
  try {
    const result = await processManyChatWebhook(payload, workspaceId)
    const duration = Date.now() - startTime
    console.log(`[manychat-webhook] Processed in ${duration}ms (stored: ${result.stored})`)
    return NextResponse.json({ received: true, stored: result.stored }, { status: 200 })
  } catch (error) {
    console.error('[manychat-webhook] Processing failed:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
