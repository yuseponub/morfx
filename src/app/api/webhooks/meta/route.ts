// ============================================================================
// Phase 38: Meta Direct Inbound Webhook Endpoint
// Receives WhatsApp webhook events from Meta directly (not via 360dialog).
//
// 3-change clone of the 360dialog route (src/app/api/webhooks/whatsapp/route.ts, D-09):
//   (a) Signature is ALWAYS required, verified with META_APP_SECRET (no optional bypass).
//   (b) Workspace resolution via resolveByPhoneNumberId (NO env fallback — ack-and-drop unknown).
//   (c) GET handshake verifies against META_WEBHOOK_VERIFY_TOKEN.
// Everything else (raw-body-first, processWebhook reuse, sync processing, wamid dedup)
// is structurally identical so Somnio (360dialog) stays byte-identical (Regla 6).
// ============================================================================

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { resolveByPhoneNumberId, resolveByWabaId, resolveByPageId } from '@/lib/meta/credentials' // CHANGE (b) + WA-09 + Phase 40 (FB-01)
import { processWebhook } from '@/lib/whatsapp/webhook-handler' // SAME — reuse verbatim (D-09)
import { processMessengerWebhook } from '@/lib/messenger/webhook-handler' // Phase 40 — Messenger inbound (FB-01/03/04)
import { applyTemplateStatusUpdate } from '@/lib/domain/whatsapp-templates' // WA-09 (Regla 3)
import type { WebhookPayload } from '@/lib/whatsapp/types'

// Extend function timeout for agent processing (multiple Claude API calls)
export const maxDuration = 60
// crypto + raw body need the Node runtime (Pitfall 3)
export const runtime = 'nodejs'

// ============================================================================
// HMAC VERIFICATION (Security #2 / T-38-06)
// Verifies X-Hub-Signature-256 over the RAW body with META_APP_SECRET.
// Exported so Plan 01 hmac.test.ts imports the real verifier (not a reference copy).
// ============================================================================

/**
 * Verify HMAC-SHA256 signature from the Meta webhook.
 * Supports both 'sha256=xxx' prefix format and raw hex format.
 * Returns false (NO throw) on length mismatch (Pitfall 2 — no 500 retry storm).
 */
export function verifyMetaHmac(body: string, signature: string, secret: string): boolean {
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
// WEBHOOK VERIFICATION (GET) — CHANGE (c)
// Meta sends a challenge to verify the webhook URL.
// ============================================================================

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // Get verification parameters
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // CHANGE (c): expected token from META_WEBHOOK_VERIFY_TOKEN
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('[meta-webhook] verified successfully')
    // Return the challenge as plain text
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  // Verification failed
  console.warn('[meta-webhook] verification failed:', { mode })
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

// ============================================================================
// WEBHOOK EVENTS (POST)
// Receives message and status events from Meta directly.
// Processing is synchronous to ensure completion before Vercel kills the function
// (HOOK-03 / Pitfall 7 — mirror 360dialog parity; wamid dedup makes retries harmless).
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Security #2: Read raw body FIRST for HMAC verification (before JSON parsing — Pitfall 1)
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    console.error('[meta-webhook] failed to read body')
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // CHANGE (a): signature ALWAYS required, verified with META_APP_SECRET (no optional bypass)
  const signature = request.headers.get('X-Hub-Signature-256') || ''
  if (!verifyMetaHmac(rawBody, signature, process.env.META_APP_SECRET!)) {
    console.warn('[meta-webhook] invalid or missing signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Parse payload from raw body (after HMAC verification)
  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    console.error('[meta-webhook] failed to parse payload')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ==========================================================================
  // Phase 40 (FB-01/03/04): Facebook Messenger inbound (`object === 'page'`).
  // ADDITIVE branch — runs AFTER the SAME `verifyMetaHmac` over the RAW body
  // (page events are HMAC-signed too — T-40-05-01) and BEFORE the
  // `whatsapp_business_account` reject (so WhatsApp + template-status stay
  // byte-identical — D-06). Tenant routing is ONLY via `resolveByPageId(entry.id)`
  // — never payload-supplied (T-40-05-02). Unknown page → ack 200 & drop.
  // ==========================================================================
  if ((payload.object as string) === 'page') {
    const pageEntries = (payload as unknown as {
      entry?: Array<{
        id?: string
        messaging?: Array<{
          sender?: { id?: string }
          recipient?: { id?: string }
          timestamp?: number
          message?: {
            mid?: string
            text?: string
            is_echo?: boolean
            attachments?: Array<{ type?: string; payload?: { url?: string } }>
          }
        }>
      }>
    }).entry ?? []

    for (const entry of pageEntries) {
      const pageId = entry.id
      if (!pageId) continue

      const creds = await resolveByPageId(pageId)
      if (!creds) {
        // Unknown page → ack & drop (no cross-tenant leak — T-40-05-02).
        console.warn('[meta-webhook] unknown page_id, ack & drop:', pageId)
        continue
      }

      for (const ev of entry.messaging ?? []) {
        // SKIP our own echoes (Pitfall 6 — T-40-05-03).
        if (ev.message && !ev.message.is_echo) {
          await processMessengerWebhook(ev, creds.workspaceId, pageId, creds.accessToken)
        }
        // ignore ev.delivery / ev.read / ev.postback for inbox-only V1 (D-12).
      }
    }

    return NextResponse.json({ received: true }, { status: 200 })
  }

  // Validate it's a WhatsApp webhook
  if (payload.object !== 'whatsapp_business_account') {
    console.warn('[meta-webhook] non-WhatsApp webhook:', payload.object)
    return NextResponse.json({ error: 'Invalid webhook type' }, { status: 400 })
  }

  // ==========================================================================
  // WA-09: message_template_status_update field handling (push, not polling).
  // Runs AFTER HMAC verify (forged/unsigned already rejected 401 above — T-39-04)
  // and is ADDITIVE on the existing Meta webhook (D-09 — inbound messages path
  // below stays unchanged). Template-status payloads carry the WABA id at
  // `entry[].id` and have NO phone_number_id, so this must branch before the
  // phone_number_id extraction.
  // ==========================================================================
  const change = (payload as unknown as {
    entry?: Array<{
      id?: string
      changes?: Array<{ field?: string; value?: Record<string, unknown> }>
    }>
  }).entry?.[0]?.changes?.[0]

  if (change?.field === 'message_template_status_update') {
    const value = (change.value ?? {}) as {
      event?: string
      message_template_name?: string
      message_template_language?: string
      reason?: string | null
    }
    const wabaId = (payload as unknown as { entry?: Array<{ id?: string }> })
      .entry?.[0]?.id

    // Resolve workspace from the WABA id (T-39-02 — never from arbitrary payload
    // fields). Best-effort: an unknown WABA still acks 200 (no retry storm).
    let workspaceId: string | null = null
    if (wabaId) {
      try {
        const creds = await resolveByWabaId(wabaId)
        workspaceId = creds?.workspaceId ?? null
      } catch (err) {
        console.warn('[meta-webhook] WABA resolution failed for template-status:', err)
      }
    }

    const name = value.message_template_name
    if (name && value.event && !workspaceId) {
      // CR-01: unknown/unregistered WABA → ack-and-drop. NEVER call the domain
      // with a null workspaceId (would run an unscoped cross-tenant UPDATE).
      console.warn(
        `[meta-webhook] unknown WABA, skipping template-status update: waba=${wabaId ?? 'none'} name=${name}`
      )
    } else if (name && value.event) {
      try {
        await applyTemplateStatusUpdate({
          workspaceId,
          name,
          language: value.message_template_language,
          event: value.event,
          reason: value.reason ?? null,
        })
        console.log(
          `[meta-webhook] template-status ${value.event} applied name=${name} ws=${workspaceId ?? 'unknown'}`
        )
      } catch (err) {
        console.error('[meta-webhook] template-status update failed:', err)
        // Ack anyway — a 500 would trigger a Meta retry storm for a non-critical sync.
      }
    } else {
      console.warn('[meta-webhook] template-status missing name/event, ack & drop')
    }

    return NextResponse.json({ received: true }, { status: 200 })
  }

  // Get phone_number_id from the first entry
  const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
  if (!phoneNumberId) {
    console.error('[meta-webhook] no phone_number_id in payload')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // CHANGE (b): resolve workspace via resolveByPhoneNumberId — NO env fallback.
  // Unknown number → ack-and-drop 200 (D-06 / T-38-08 — no cross-workspace leakage).
  const creds = await resolveByPhoneNumberId(phoneNumberId)
  if (!creds) {
    console.warn('[meta-webhook] unknown phone_number_id, ack & drop:', phoneNumberId)
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // Process webhook SYNCHRONOUSLY (reuse verbatim — D-09) to ensure it completes
  // before Vercel kills the function.
  try {
    const result = await processWebhook(payload, creds.workspaceId, phoneNumberId)
    const duration = Date.now() - startTime
    console.log(
      `[meta-webhook] processed in ${duration}ms ws=${creds.workspaceId} (stored: ${result.stored})`
    )
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    // processWebhook only throws when payload was NOT stored AND processing failed.
    // Return 500 → Meta retries; wamid dedup makes the retry safe.
    console.error('[meta-webhook] NOT stored, returning 500 for retry:', error)
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 })
  }
}
