/**
 * Discovery READ-ONLY: mapea el workspace Varixcenter antes del análisis
 * de conversaciones para el diseño del agente conversacional.
 * Run: npx tsx scripts/varix-conversations-discovery.ts
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE env vars'); process.exit(1)
}

const WORKSPACE_ID = 'c6621640-ba67-43de-9f05-905f09a6dc8f' // Varixcenter
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function main() {
  console.log('=== Varixcenter Conversations Discovery ===')
  console.log('Workspace:', WORKSPACE_ID, '\n')

  const { data: ws } = await supabase
    .from('workspaces').select('id,name,created_at').eq('id', WORKSPACE_ID).single()
  console.log('Workspace:', JSON.stringify(ws))

  // Conversations by channel
  const { count: convsTotal } = await supabase
    .from('conversations').select('id', { count: 'exact', head: true })
    .eq('workspace_id', WORKSPACE_ID)
  console.log('\nconversations total:', convsTotal)

  for (const ch of ['whatsapp', 'facebook', 'instagram', 'sms', 'web']) {
    const { count } = await supabase
      .from('conversations').select('id', { count: 'exact', head: true })
      .eq('workspace_id', WORKSPACE_ID).eq('channel', ch)
    if (count) console.log(`  channel=${ch}:`, count)
  }

  // Messages: total, direction, imported vs live
  const { count: msgsTotal } = await supabase
    .from('messages').select('id', { count: 'exact', head: true })
    .eq('workspace_id', WORKSPACE_ID)
  console.log('\nmessages total:', msgsTotal)

  const { count: msgsIn } = await supabase
    .from('messages').select('id', { count: 'exact', head: true })
    .eq('workspace_id', WORKSPACE_ID).eq('direction', 'inbound')
  console.log('  inbound:', msgsIn)

  const { count: msgsImported } = await supabase
    .from('messages').select('id', { count: 'exact', head: true })
    .eq('workspace_id', WORKSPACE_ID).like('wamid', 'import:%')
  console.log('  imported (wamid import:%):', msgsImported)

  // Date range
  const { data: oldest } = await supabase
    .from('messages').select('timestamp').eq('workspace_id', WORKSPACE_ID)
    .order('timestamp', { ascending: true }).limit(1)
  const { data: newest } = await supabase
    .from('messages').select('timestamp').eq('workspace_id', WORKSPACE_ID)
    .order('timestamp', { ascending: false }).limit(1)
  console.log('\ndate range:', oldest?.[0]?.timestamp, '→', newest?.[0]?.timestamp)

  // Contacts + tags
  const { count: contacts } = await supabase
    .from('contacts').select('id', { count: 'exact', head: true })
    .eq('workspace_id', WORKSPACE_ID)
  console.log('\ncontacts total:', contacts)

  const { data: tags } = await supabase
    .from('tags').select('id,name').eq('workspace_id', WORKSPACE_ID)
  console.log('tags:', tags?.map(t => t.name).join(', ') || '(none)')

  // Pipelines/stages
  const { data: pipelines } = await supabase
    .from('pipelines').select('id,name').eq('workspace_id', WORKSPACE_ID)
  for (const p of pipelines ?? []) {
    const { data: stages } = await supabase
      .from('stages').select('name,position').eq('pipeline_id', p.id).order('position')
    console.log(`pipeline "${p.name}":`, stages?.map(s => s.name).join(' → '))
  }

  // Message type distribution
  const { data: typeSample } = await supabase
    .from('messages').select('type').eq('workspace_id', WORKSPACE_ID).limit(5000)
  const typeCounts: Record<string, number> = {}
  for (const m of typeSample ?? []) typeCounts[m.type] = (typeCounts[m.type] ?? 0) + 1
  console.log('\nmessage types (sample 5000):', JSON.stringify(typeCounts))

  // Sample conversation columns
  const { data: convSample } = await supabase
    .from('conversations').select('*').eq('workspace_id', WORKSPACE_ID).limit(1)
  console.log('\nconversation columns:', convSample?.[0] ? Object.keys(convSample[0]).join(', ') : 'none')
}

main().catch(e => { console.error(e); process.exit(1) })
