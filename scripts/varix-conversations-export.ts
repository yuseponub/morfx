/**
 * Export READ-ONLY: vuelca todas las conversaciones de Varixcenter con sus
 * mensajes a JSON local para análisis del agente conversacional.
 * Run: npx tsx scripts/varix-conversations-export.ts
 * Output: scripts/varix-data/conversations.json
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WORKSPACE_ID = 'c6621640-ba67-43de-9f05-905f09a6dc8f' // Varixcenter
const OUT_DIR = path.resolve(process.cwd(), 'scripts/varix-data')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function fetchAll<T>(table: string, select: string, page = 1000): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table).select(select)
      .eq('workspace_id', WORKSPACE_ID)
      .range(from, from + page - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (!data || data.length < page) break
    from += page
  }
  return rows
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log('Fetching conversations...')
  const conversations = await fetchAll<any>(
    'conversations',
    'id,contact_id,phone,profile_name,channel,status,created_at,last_customer_message_at,last_message_at'
  )
  console.log('  ', conversations.length)

  console.log('Fetching messages...')
  const messages = await fetchAll<any>(
    'messages',
    'id,conversation_id,direction,type,content,timestamp,wamid,sent_by_agent'
  )
  console.log('  ', messages.length)

  console.log('Fetching contacts...')
  const contacts = await fetchAll<any>('contacts', 'id,name,phone')
  console.log('  ', contacts.length)

  const contactById = new Map(contacts.map(c => [c.id, c]))
  const msgsByConv = new Map<string, any[]>()
  for (const m of messages) {
    const arr = msgsByConv.get(m.conversation_id) ?? []
    arr.push(m)
    msgsByConv.set(m.conversation_id, arr)
  }
  for (const arr of msgsByConv.values()) {
    arr.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
  }

  const out = conversations.map(c => ({
    id: c.id,
    channel: c.channel,
    phone: c.phone,
    name: contactById.get(c.contact_id)?.name ?? c.profile_name ?? null,
    created_at: c.created_at,
    messages: (msgsByConv.get(c.id) ?? []).map(m => ({
      dir: m.direction,
      type: m.type,
      text: typeof m.content === 'string' ? m.content : (m.content?.text ?? m.content?.body ?? JSON.stringify(m.content)),
      ts: m.timestamp,
      imported: typeof m.wamid === 'string' && m.wamid.startsWith('import:'),
    })),
  })).filter(c => c.messages.length > 0)

  const file = path.join(OUT_DIR, 'conversations.json')
  fs.writeFileSync(file, JSON.stringify(out, null, 1))
  console.log('Wrote', file, '—', out.length, 'conversations with messages')

  // Quick stats
  const withInbound = out.filter(c => c.messages.some(m => m.dir === 'inbound'))
  console.log('conversations with >=1 inbound:', withInbound.length)
  const multiTurn = out.filter(c => c.messages.filter(m => m.dir === 'inbound').length >= 2)
  console.log('conversations with >=2 inbound:', multiTurn.length)
}

main().catch(e => { console.error(e); process.exit(1) })
