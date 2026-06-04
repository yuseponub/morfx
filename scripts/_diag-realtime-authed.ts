import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

// READ-ONLY: reproduces the BROWSER's authenticated Realtime socket (RLS enforced).
// 1) mints a session for a real user via admin generateLink + verifyOtp (no email sent)
// 2) subscribes to messages(INSERT) + conversations(UPDATE) WITH that user's JWT
//    (RLS scopes it to the user's workspaces — no manual workspace filter needed)
// 3) measures how long each event takes to ARRIVE vs the row's db time.
//
// This is the missing measurement: the earlier service-role probe BYPASSED RLS.
// If events arrive ~20-25s here too -> reproduced server-side (RLS realtime path).
// If events arrive <1s here but the browser shows 25s -> it's the browser (render).

const EMAIL = process.env.DIAG_EMAIL || 'joseromerorincon041100@gmail.com'
const LISTEN_MS = 120_000

function clk() { return new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // --- 1. mint a session for the real user (admin, no email sent) ---
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  console.log(`[${clk()}] generando link para ${EMAIL} ...`)
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
  if (linkErr) { console.error('generateLink ERR:', linkErr.message); process.exit(1) }
  const hashed = link?.properties?.hashed_token
  if (!hashed) { console.error('no hashed_token en el link'); process.exit(1) }

  const authClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  let session
  for (const t of ['email', 'magiclink'] as const) {
    const { data, error } = await authClient.auth.verifyOtp({ token_hash: hashed, type: t })
    if (!error && data?.session) { session = data.session; break }
    console.log(`[${clk()}] verifyOtp(type=${t}) -> ${error ? error.message : 'sin sesion'}`)
  }
  if (!session) { console.error('no pude obtener sesion'); process.exit(1) }
  console.log(`[${clk()}] sesion OK (user ${session.user.id.slice(0, 8)}). exp en ${Math.round((session.expires_at! * 1000 - Date.now()) / 1000)}s`)

  // --- 2. subscribe to realtime WITH the user's JWT (RLS enforced) ---
  const rt = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  await rt.realtime.setAuth(session.access_token)

  const samples: number[] = []
  console.log(`\n[${clk()}] suscribiendo con JWT autenticado (RLS activo). ventana ${LISTEN_MS / 1000}s.`)
  console.log('>>> AHORA: envia un mensaje desde tu celular al numero del workspace <<<\n')
  console.log('evt          arrival    row_db_time   lat_s   detalle')
  console.log('-----------  ---------  -----------   -----   -------')

  const ch = rt
    .channel('diag:authed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      const r = p.new as Record<string, unknown>
      const db = r.created_at ? new Date(r.created_at as string) : null
      const lat = db ? (Date.now() - db.getTime()) / 1000 : NaN
      if (!Number.isNaN(lat)) samples.push(lat)
      console.log(`msg.INSERT   ${clk()}   ${db ? db.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) : '—'}     ${String(lat.toFixed(1)).padStart(5)}   dir=${r.direction} ws=${String(r.workspace_id).slice(-6)}`)
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (p) => {
      const r = p.new as Record<string, unknown>
      const db = r.updated_at ? new Date(r.updated_at as string) : null
      const lat = db ? (Date.now() - db.getTime()) / 1000 : NaN
      if (!Number.isNaN(lat)) samples.push(lat)
      console.log(`conv.UPDATE  ${clk()}   ${db ? db.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) : '—'}     ${String(lat.toFixed(1)).padStart(5)}   unread=${r.unread_count} ws=${String(r.workspace_id).slice(-6)}`)
    })
    .subscribe((status, err) => console.log(`[${clk()}] channel: ${status}${err ? ' ERR=' + err.message : ''}`))

  await new Promise(r => setTimeout(r, LISTEN_MS))

  console.log('\n=== RESUMEN (socket AUTENTICADO, RLS activo) ===')
  if (!samples.length) {
    console.log('NO llego ningun evento en la ventana.')
    console.log('  -> Si enviaste un mensaje y aparecio en el navegador pero NO aqui:')
    console.log('     el socket autenticado NO esta recibiendo eventos (RLS los descarta) = causa raiz 2a/RLS.')
  } else {
    const s = [...samples].sort((a, b) => a - b)
    console.log(`muestras: ${s.length}   p50: ${s[Math.floor(s.length*0.5)].toFixed(1)}s   min: ${s[0].toFixed(1)}s   max: ${s[s.length-1].toFixed(1)}s`)
    const mx = s[s.length-1]
    if (mx >= 10) console.log('  -> REPRODUCIDO: el socket autenticado entrega tarde (>=10s). Causa raiz en el path RLS-realtime, no en el cliente.')
    else console.log('  -> El socket autenticado entrega rapido (<10s). Si tu navegador igual tarda 25s, el cuello es el navegador (render/estado), no la entrega.')
  }
  await rt.removeChannel(ch)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
