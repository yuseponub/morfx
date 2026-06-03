import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const WORKSPACE_ID = '4b5d84dd-1b46-4e8c-8acf-3869c037198f'

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: msgs, error } = await sb
    .from('messages')
    .select('*')
    .eq('workspace_id', WORKSPACE_ID)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) console.error('MSG ERR:', error.message)
  console.log('=== RECENT MESSAGES (newest first) ===')
  for (const m of msgs || []) {
    console.log(JSON.stringify({
      dir: m.direction, type: m.type, status: m.status,
      wamid: m.wamid ? String(m.wamid).slice(0, 20) + '…' : null,
      content: typeof m.content === 'object' ? JSON.stringify(m.content).slice(0, 50) : m.content,
      err: m.error || m.error_message || m.failure_reason || m.status_detail || null,
      meta: m.metadata ? JSON.stringify(m.metadata).slice(0, 80) : null,
      at: m.created_at || m.timestamp,
    }))
  }
  if (msgs?.[0]) console.log('\n(all columns of newest msg:', Object.keys(msgs[0]).join(', '), ')')

  const { data: ws, error: wErr } = await sb
    .from('workspaces')
    .select('id, name, settings')
    .eq('id', WORKSPACE_ID)
    .single()
  if (wErr) console.error('WS ERR:', wErr.message)
  console.log('\n=== WORKSPACE settings JSONB ===')
  console.log('name:', ws?.name)
  const s = (ws?.settings || {}) as Record<string, unknown>
  // mask any api key
  const masked = Object.fromEntries(
    Object.entries(s).map(([k, v]) => [k, /key|token|secret/i.test(k) && v ? `***present(len ${String(v).length})` : v])
  )
  console.log(JSON.stringify(masked, null, 2))
}

main().catch((e) => { console.error('FATAL:', e.message || e); process.exit(1) })
