/**
 * Replay failed WhatsApp webhook events.
 *
 * Reads events with status='failed' from whatsapp_webhook_events,
 * reprocesses them through the same pipeline as live webhooks,
 * and tracks retry state.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/replay-failed-webhooks.ts
 *
 * Prerequisites:
 * - .env.local must exist with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * - OR set these env vars before running
 */

// Load env vars FIRST — before any app imports that read process.env
import 'dotenv/config'

import { createClient } from '@supabase/supabase-js'
import { replayWebhookPayload } from '@/lib/whatsapp/webhook-handler'
import type { WebhookPayload } from '@/lib/whatsapp/types'

const MAX_RETRIES = 3
const DELAY_MS = 2000

// Validate required env vars
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  console.error('Ensure .env.local exists or set env vars before running.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  console.log('Fetching failed webhook events (retry_count < ' + MAX_RETRIES + ')...\n')

  const { data: events, error } = await supabase
    .from('whatsapp_webhook_events')
    .select('*')
    .eq('status', 'failed')
    .lt('retry_count', MAX_RETRIES)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch events:', error.message)
    process.exit(1)
  }

  if (!events || events.length === 0) {
    console.log('No failed events to replay.')
    return
  }

  console.log(`Found ${events.length} failed event(s) to replay.\n`)

  let reprocessed = 0
  let stillFailed = 0
  let deadLettered = 0

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const newRetryCount = event.retry_count + 1

    console.log(
      `[${i + 1}/${events.length}] Event ${event.id} ` +
      `(type: ${event.event_type}, attempt ${newRetryCount}/${MAX_RETRIES})...`
    )

    try {
      const payload = event.payload as unknown as WebhookPayload
      await replayWebhookPayload(payload, event.workspace_id, event.phone_number_id)

      // Success — mark as reprocessed
      await supabase
        .from('whatsapp_webhook_events')
        .update({
          status: 'reprocessed',
          retry_count: newRetryCount,
          reprocessed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', event.id)

      console.log(`  -> REPROCESSED`)
      reprocessed++
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const newStatus = newRetryCount >= MAX_RETRIES ? 'dead_letter' : 'failed'

      await supabase
        .from('whatsapp_webhook_events')
        .update({
          status: newStatus,
          retry_count: newRetryCount,
          error_message: errorMsg,
        })
        .eq('id', event.id)

      if (newStatus === 'dead_letter') {
        console.log(`  -> DEAD LETTER (${MAX_RETRIES} retries exhausted): ${errorMsg}`)
        deadLettered++
      } else {
        console.log(`  -> FAILED (retry ${newRetryCount}/${MAX_RETRIES}): ${errorMsg}`)
        stillFailed++
      }
    }

    // Rate limit between events (skip delay after last event)
    if (i < events.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS))
    }
  }

  console.log(`\n--- Replay Summary ---`)
  console.log(`Reprocessed: ${reprocessed}`)
  console.log(`Still failed: ${stillFailed}`)
  console.log(`Dead-lettered: ${deadLettered}`)
  console.log(`Total: ${events.length}`)
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
