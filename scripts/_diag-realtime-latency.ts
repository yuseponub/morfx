import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

// READ-ONLY diagnostic for the "inbox tarda 10-20s en actualizar" report.
// Splits the latency into backend (WhatsApp send -> DB insert) so we can tell
// if the 10-20s is in the pipeline or purely in frontend realtime delivery.

function fmt(d: Date) {
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false })
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Last 30 inbound messages across all workspaces (newest first)
  const { data: msgs, error } = await sb
    .from('messages')
    .select('id, workspace_id, conversation_id, direction, type, timestamp, created_at')
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) { console.error('ERR:', error.message); process.exit(1) }
  if (!msgs?.length) { console.log('no inbound messages found'); return }

  console.log('=== INBOUND MESSAGES: WhatsApp send (timestamp) vs DB insert (created_at) ===')
  console.log('delta = created_at - timestamp  (segundos). Sano: < 2-3s. Sospechoso: >= 10s\n')
  console.log('ws      msg       type      wa_timestamp (send)      db_created_at (insert)   delta_s')
  console.log('------  --------  --------  -----------------------  -----------------------  -------')

  const deltas: number[] = []
  for (const m of msgs) {
    const ts = m.timestamp ? new Date(m.timestamp) : null
    const cr = m.created_at ? new Date(m.created_at) : null
    let delta = ''
    if (ts && cr) {
      const d = (cr.getTime() - ts.getTime()) / 1000
      deltas.push(d)
      delta = d.toFixed(1)
    }
    console.log(
      `${String(m.workspace_id).slice(-6)}  ${String(m.id).slice(0, 8)}  ${String(m.type).padEnd(8)}  ${ts ? fmt(ts).padEnd(23) : '—'.padEnd(23)}  ${cr ? fmt(cr).padEnd(23) : '—'.padEnd(23)}  ${delta.padStart(6)}`
    )
  }

  if (deltas.length) {
    const sorted = [...deltas].sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length * 0.5)]
    const p90 = sorted[Math.floor(sorted.length * 0.9)]
    const max = sorted[sorted.length - 1]
    const over10 = deltas.filter(d => d >= 10).length
    console.log('\n=== RESUMEN DELTA backend (WhatsApp -> DB insert) ===')
    console.log(`muestras: ${deltas.length}`)
    console.log(`p50: ${p50.toFixed(1)}s   p90: ${p90.toFixed(1)}s   max: ${max.toFixed(1)}s`)
    console.log(`mensajes con delta >= 10s: ${over10}/${deltas.length}`)
    console.log('\nLECTURA:')
    if (p90 >= 10) {
      console.log('  -> El retraso es BACKEND (pipeline webhook->DB lento). El fix de realtime NO lo arregla.')
      console.log('     Siguiente: revisar webhook-handler / Inngest / orden de inserts.')
    } else if (max >= 10) {
      console.log('  -> Backend mayormente sano pero con picos. Algunos mensajes tardan en insertarse.')
    } else {
      console.log('  -> Backend SANO (<10s). El mensaje entra a la DB rapido.')
      console.log('     => Los 10-20s que ves son de ENTREGA REALTIME al navegador o render (frontend).')
      console.log('        Ahi sirve la consola [realtime:*] o el watchdog de 45s del fix.')
    }
  }

  // Also show, for the very newest inbound, the conversation update timing (double-UPDATE D-3 noise check)
  const newest = msgs[0]
  if (newest?.conversation_id) {
    const { data: conv } = await sb
      .from('conversations')
      .select('id, last_message_at, last_customer_message_at, unread_count, is_read, updated_at')
      .eq('id', newest.conversation_id)
      .single()
    if (conv) {
      console.log('\n=== conversation del ultimo inbound ===')
      console.log(JSON.stringify({
        ...conv,
        msg_created_at: newest.created_at,
      }, null, 2))
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
