import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

// READ-ONLY: measures Supabase Realtime DELIVERY latency directly, the same path
// the browser uses. We subscribe (service-role token => RLS bypassed, so we see
// every event) to messages INSERT + conversations UPDATE, and for each event we
// compare the moment it ARRIVES here vs the row's created_at/updated_at.
//
//   delivery_latency = arrival_wallclock - row.(created_at|updated_at)
//
// If this is <2s -> Supabase realtime infra is fast; the user's 10-20s is their
//   browser socket (RLS/JWT 2a, silent-death 2d) or render.
// If this is ~10-20s -> the realtime infra / replication itself is the bottleneck.

const RUN_MS = 90_000

function nowIso() {
  return new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false })
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { realtime: { params: { eventsPerSecond: 20 } } }
  )

  console.log(`[${nowIso()}] suscribiendo a messages(INSERT) + conversations(UPDATE)... escucho ${RUN_MS / 1000}s`)
  console.log('Espera a que pase tráfico real (o manda un mensaje de prueba ahora).\n')
  console.log('evt            arrival      row_db_time            delivery_s   detalle')
  console.log('-------------  -----------  ---------------------  ----------   -------')

  const samples: number[] = []

  const channel = sb
    .channel('diag:delivery')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      const row = p.new as Record<string, unknown>
      const dbT = row.created_at ? new Date(row.created_at as string) : null
      const arr = new Date()
      const lat = dbT ? (arr.getTime() - dbT.getTime()) / 1000 : NaN
      if (!Number.isNaN(lat)) samples.push(lat)
      console.log(
        `msg.INSERT     ${nowIso()}     ${dbT ? dbT.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) : '—'}              ${String(lat.toFixed(1)).padStart(6)}     dir=${row.direction} ws=${String(row.workspace_id).slice(-6)}`
      )
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (p) => {
      const row = p.new as Record<string, unknown>
      const dbT = row.updated_at ? new Date(row.updated_at as string) : null
      const arr = new Date()
      const lat = dbT ? (arr.getTime() - dbT.getTime()) / 1000 : NaN
      if (!Number.isNaN(lat)) samples.push(lat)
      console.log(
        `conv.UPDATE    ${nowIso()}     ${dbT ? dbT.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) : '—'}              ${String(lat.toFixed(1)).padStart(6)}     unread=${row.unread_count} ws=${String(row.workspace_id).slice(-6)}`
      )
    })
    .subscribe((status, err) => {
      console.log(`[${nowIso()}] channel status: ${status}${err ? ' ERR=' + err.message : ''}`)
    })

  await new Promise(r => setTimeout(r, RUN_MS))

  console.log('\n=== RESUMEN delivery latency (arrival - db_time) ===')
  if (!samples.length) {
    console.log('No llegaron eventos en la ventana. (poco trafico, o realtime no entrego nada).')
  } else {
    const s = [...samples].sort((a, b) => a - b)
    const p50 = s[Math.floor(s.length * 0.5)]
    const p90 = s[Math.floor(s.length * 0.9)]
    console.log(`muestras: ${s.length}   p50: ${p50.toFixed(1)}s   p90: ${p90.toFixed(1)}s   min: ${s[0].toFixed(1)}s   max: ${s[s.length - 1].toFixed(1)}s`)
    if (p90 < 2) console.log('  -> Realtime infra RAPIDA. Los 10-20s del usuario son SU socket (RLS/JWT 2a, muerte silenciosa 2d) o render.')
    else if (p90 >= 10) console.log('  -> Realtime infra/replicacion LENTA. El cuello es de Supabase, no del cliente.')
    else console.log('  -> Realtime infra intermedia. Latencia notable pero no explica 20s sola.')
  }

  await sb.removeChannel(channel)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
