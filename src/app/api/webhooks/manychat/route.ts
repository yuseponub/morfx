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
// Multi-workspace: resolve from query param > env var > DB fallback
// ============================================================================

async function resolveWorkspaceForManyChat(
  request: NextRequest,
  _payload: ManyChatWebhookPayload
): Promise<string | null> {
  // 1. Query param: ?workspace=UUID (multi-workspace support)
  const workspaceParam = request.nextUrl.searchParams.get('workspace')
  if (workspaceParam) return workspaceParam

  // 2. Env var fallback (backward compatible — Somnio uses this)
  const workspaceId = process.env.MANYCHAT_DEFAULT_WORKSPACE_ID || process.env.WHATSAPP_DEFAULT_WORKSPACE_ID
  if (workspaceId) return workspaceId

  // 3. DB fallback: find first workspace with manychat_api_key configured
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
// SECRET VALIDATION
// Validates against global env var OR per-workspace secret in settings
// ============================================================================

async function validateSecret(
  request: NextRequest,
  workspaceId: string
): Promise<boolean> {
  const secret = request.headers.get('x-manychat-secret')
    || request.nextUrl.searchParams.get('secret')

  const globalSecret = process.env.MANYCHAT_WEBHOOK_SECRET

  // If no secret mechanism configured at all, skip validation (dev mode)
  if (!globalSecret && !secret) return true

  // If secret provided, check against global env var first
  if (secret && globalSecret && secret === globalSecret) return true

  // Check against per-workspace secret in workspace settings
  if (secret) {
    try {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('workspaces')
        .select('settings')
        .eq('id', workspaceId)
        .single()

      const wsSecret = (data?.settings as Record<string, unknown>)?.manychat_webhook_secret as string | undefined
      if (wsSecret && secret === wsSecret) return true
    } catch {
      // DB error — fall through to rejection
    }
  }

  // No global secret configured and no secret provided — reject if workspace has one configured
  if (!secret && !globalSecret) {
    // No secret mechanism at all — dev mode, allow
    return true
  }

  return false
}

// ============================================================================
// WEBHOOK HANDLER (POST)
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // 1. Parse payload
  let payload: ManyChatWebhookPayload
  try {
    payload = await request.json()
  } catch {
    console.error('[manychat-webhook] Failed to parse JSON body')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 2. Validate required fields
  if (!payload.subscriber_id) {
    console.error('[manychat-webhook] Missing subscriber_id')
    return NextResponse.json({ error: 'Missing subscriber_id' }, { status: 400 })
  }

  if (!payload.message_text) {
    // Empty message (e.g. image-only from ManyChat) — acknowledge but don't process
    console.log('[manychat-webhook] No message_text, skipping')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 3. Resolve workspace (query param > env var > DB fallback)
  const workspaceId = await resolveWorkspaceForManyChat(request, payload)
  if (!workspaceId) {
    console.error('[manychat-webhook] No workspace configured for ManyChat')
    return NextResponse.json({ error: 'No workspace' }, { status: 500 })
  }

  // 4. Validate secret (global env var OR per-workspace settings)
  const isSecretValid = await validateSecret(request, workspaceId)
  if (!isSecretValid) {
    console.warn(`[manychat-webhook] Invalid or missing secret for workspace ${workspaceId}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 5. Process (synchronous, same pattern as WhatsApp webhook)
  try {
    const result = await processManyChatWebhook(payload, workspaceId)
    const duration = Date.now() - startTime
    console.log(`[manychat-webhook] Processed in ${duration}ms workspace=${workspaceId} (stored: ${result.stored})`)
    return NextResponse.json({ received: true, stored: result.stored }, { status: 200 })
  } catch (error) {
    console.error('[manychat-webhook] Processing failed:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
