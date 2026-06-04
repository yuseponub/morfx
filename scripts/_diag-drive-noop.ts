// TEMP verification aid (NOT part of Plan 06 deliverable — used to drive deterministic
// ground-truth conversations.UPDATE events for the local realtime harness when organic
// Somnio traffic is sparse). It does a NO-OP self-update (SET updated_at = updated_at)
// via service role on a few CLOSED conversations — this fires a Supabase realtime
// postgres_changes UPDATE (the harness ground truth + the browser inbox channel both
// receive it) WITHOUT creating a message, WITHOUT hitting the webhook, and therefore
// WITHOUT invoking the production agent (Regla 6 safe). Zero data change.
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const WS = process.env.DIAG_WS || 'a3843b3f-c337-4836-92b5-89c58bb98490' // Somnio
const DURATION_MS = Number(process.env.DRIVE_MS || 50_000)
const EVERY_MS = 5_000
function clk() { return new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const db = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })

  // Prefer closed/archived conversations to minimize even cosmetic re-sort in the operator inbox.
  const { data: rows, error } = await db
    .from('conversations')
    .select('id, updated_at, status')
    .eq('workspace_id', WS)
    .order('updated_at', { ascending: true }) // oldest first = least likely to be actively watched
    .limit(5)
  if (error || !rows?.length) { console.error('no conversations to drive', error); process.exit(1) }
  console.log(`[${clk()}] driving NO-OP updates on ${rows.length} oldest Somnio conversations every ${EVERY_MS/1000}s for ${DURATION_MS/1000}s`)

  const start = Date.now()
  let n = 0
  while (Date.now() - start < DURATION_MS) {
    const row = rows[n % rows.length]
    // NO-OP: set updated_at to its own current value → realtime UPDATE event, zero semantic change.
    const { error: upErr } = await db
      .from('conversations')
      .update({ updated_at: row.updated_at })
      .eq('id', row.id)
    console.log(`[${clk()}] noop update #${++n} conv=${row.id.slice(0, 8)} ${upErr ? 'ERR ' + upErr.message : 'ok'}`)
    await new Promise(r => setTimeout(r, EVERY_MS))
  }
  console.log(`[${clk()}] done (${n} noop updates)`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
