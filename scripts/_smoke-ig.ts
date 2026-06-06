/**
 * READ-ONLY Phase 41 IG/FB smoke inspector.
 * Resolves the Varix workspace from the real page_id/ig_account_id (no hardcoded ws guess),
 * then dumps recent messages + conversations with their media so we can confirm each smoke
 * in the DB as the user sends real DMs. No sends, no writes.
 *
 * Usage:
 *   npx tsx scripts/_smoke-ig.ts            # default: last 12 msgs across resolved ws
 *   npx tsx scripts/_smoke-ig.ts <n>        # last <n> msgs
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const PAGE_ID = '528898033801678'
const IG_ACCOUNT_ID = '17841405433849344'
const LIMIT = parseInt(process.argv[2] || '12', 10)

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1) Resolve workspace from the real meta accounts (no assumptions)
  const { data: accts, error: aErr } = await sb
    .from('workspace_meta_accounts')
    .select('workspace_id, channel, page_id, ig_account_id, ig_username, is_active')
    .or(`page_id.eq.${PAGE_ID},ig_account_id.eq.${IG_ACCOUNT_ID}`)
  if (aErr) console.error('ACCT ERR:', aErr.message)
  console.log('=== workspace_meta_accounts (Varix page/IG) ===')
  for (const a of accts || []) console.log(JSON.stringify(a))

  const wsIds = [...new Set((accts || []).map((a) => a.workspace_id))]
  console.log('\nResolved workspace_id(s):', wsIds.join(', ') || '(none)')
  if (wsIds.length === 0) return

  for (const ws of wsIds) {
    const { data: w } = await sb.from('workspaces').select('id, name, instagram_provider, messenger_provider').eq('id', ws).single()
    console.log(`\n=== WS ${ws} — ${w?.name} (ig_provider=${w?.instagram_provider}, fb_provider=${w?.messenger_provider}) ===`)

    const { data: msgs, error: mErr } = await sb
      .from('messages')
      .select('id, direction, type, status, content, media_url, media_mime_type, media_filename, transcription, conversation_id, created_at, error_message, error_code')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    if (mErr) console.error('MSG ERR:', mErr.message)
    for (const m of msgs || []) {
      console.log(JSON.stringify({
        dir: m.direction, type: m.type, status: m.status,
        content: typeof m.content === 'string' ? m.content.slice(0, 60) : JSON.stringify(m.content)?.slice(0, 60),
        media_url: m.media_url ? String(m.media_url).slice(0, 70) + '…' : null,
        mime: m.media_mime_type,
        file: m.media_filename,
        transcription: m.transcription ? String(m.transcription).slice(0, 50) : null,
        err: m.error_code ? `${m.error_code}:${m.error_message}` : m.error_message,
        conv: m.conversation_id?.slice(0, 8),
        at: m.created_at,
      }))
    }
  }
}

main().catch((e) => { console.error('FATAL:', e?.message || e); process.exit(1) })
