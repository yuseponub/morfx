import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

// Bisects WHY the browser's inbox channel is SUBSCRIBED-but-silent.
// Mounts 3 channels with the SAME authenticated user JWT (RLS enforced):
//   A) conversations UPDATE, NO filter            (my known-good baseline)
//   B) conversations UPDATE, WITH workspace filter (browser uses a filter)
//   C) EXACT browser channel: 4 bindings + filters (conversations, contact_tags, contacts, orders)
// Whichever stays silent when a real message arrives = the culprit pattern.

const EMAIL = process.env.DIAG_EMAIL || 'joseromerorincon041100@gmail.com'
const WS = process.env.DIAG_WS || 'a3843b3f-c337-4836-92b5-89c58bb98490' // Somnio
const WINDOW_MS = 120_000
function clk() { return new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // mint authed session
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
  const authc = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  let session: any = null
  for (const t of ['email', 'magiclink'] as const) {
    const { data, error } = await authc.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: t })
    if (!error && data?.session) { session = data.session; break }
  }
  if (!session) { console.error('no session'); process.exit(1) }
  const rt = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  await rt.realtime.setAuth(session.access_token)
  console.log(`[${clk()}] JWT autenticado listo. ws=${WS.slice(-6)}`)

  const hit = { A: 0, B: 0, C: 0 }

  // A) no filter
  rt.channel('bisectA')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (p) => {
      hit.A++; console.log(`[${clk()}] ✅ A (sin filtro)        conv.UPDATE unread=${(p.new as any).unread_count} ws=${String((p.new as any).workspace_id).slice(-6)}`)
    })
    .subscribe((s) => console.log(`[${clk()}] A status: ${s}`))

  // B) with workspace filter
  rt.channel('bisectB')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `workspace_id=eq.${WS}` }, (p) => {
      hit.B++; console.log(`[${clk()}] ✅ B (con filtro)        conv.UPDATE unread=${(p.new as any).unread_count}`)
    })
    .subscribe((s) => console.log(`[${clk()}] B status: ${s}`))

  // C) exact browser channel: 4 bindings + filters, single channel
  rt.channel(`inbox:${WS}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `workspace_id=eq.${WS}` }, (p) => {
      hit.C++; console.log(`[${clk()}] ✅ C (canal navegador)   conv.${(p as any).eventType} unread=${(p.new as any)?.unread_count}`)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_tags' }, () => { /* no filter, like browser */ })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts', filter: `workspace_id=eq.${WS}` }, () => {})
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `workspace_id=eq.${WS}` }, () => {})
    .subscribe((s) => console.log(`[${clk()}] C status: ${s}`))

  console.log(`\n[${clk()}] >>> ESCUCHANDO ${WINDOW_MS / 1000}s — ENVIA UN MENSAJE A SOMNIO AHORA <<<\n`)
  await new Promise(r => setTimeout(r, WINDOW_MS))

  console.log(`\n=== RESULTADO BISECCION (eventos recibidos) ===`)
  console.log(`A (sin filtro):        ${hit.A}`)
  console.log(`B (con filtro ws):     ${hit.B}`)
  console.log(`C (canal navegador):   ${hit.C}`)
  if (hit.A > 0 && hit.B === 0) console.log('-> CULPABLE: el FILTRO workspace_id=eq. rompe la entrega.')
  else if (hit.A > 0 && hit.B > 0 && hit.C === 0) console.log('-> CULPABLE: el canal MULTI-BINDING (4 bindings juntos) — clase Problema 1.')
  else if (hit.C > 0) console.log('-> El canal del navegador SI entrega aqui. El problema esta en el navegador (render/hydration #418), no en la suscripcion.')
  else console.log('-> Ninguno recibio (poco trafico o no enviaste). Reintenta enviando durante la ventana.')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
