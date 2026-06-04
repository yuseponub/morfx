import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

// Confirms the ROOT CAUSE + the exact fix requirement for "SUBSCRIBED but silent".
// Phase A: subscribe with ANON token (no setAuth) -> expect ~0 (RLS drops anon)
// Phase B: setAuth(userToken) on the SAME already-subscribed channel -> does it revive?
// Phase C: removeChannel + re-subscribe AFTER setAuth -> should deliver (the fix)

const EMAIL = process.env.DIAG_EMAIL || 'joseromerorincon041100@gmail.com'
const PHASE_MS = 22_000
function clk() { return new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // mint user session (for phases B/C)
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
  const authc = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  let session: any = null
  for (const t of ['email', 'magiclink'] as const) {
    const { data, error } = await authc.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: t })
    if (!error && data?.session) { session = data.session; break }
  }
  if (!session) { console.error('no session'); process.exit(1) }

  // ground truth: how many conv.UPDATE events the SERVER emits for the user's workspaces during the run
  // (service-role, so we know there IS traffic to receive)
  let gt = 0
  const gtc = createClient(url, service, { realtime: { params: { eventsPerSecond: 30 } } })
  gtc.channel('gt').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => { gt++ }).subscribe()

  // the client under test: anon, NO setAuth yet (mimics the browser subscribing before JWT applied)
  const c = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  let phase = 'A'
  const got = { A: 0, B: 0, C: 0 }
  const mkHandler = () => (() => { (got as any)[phase]++ })

  // ---- Phase A: subscribe with ANON ----
  console.log(`[${clk()}] FASE A: suscribo canal con token ANONIMO (sin setAuth). ${PHASE_MS/1000}s...`)
  let ch = c.channel('uat-order')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, mkHandler())
    .subscribe((s) => console.log(`[${clk()}]   canal status: ${s}`))
  const gtA0 = gt
  await new Promise(r => setTimeout(r, PHASE_MS))
  const gtA = gt - gtA0

  // ---- Phase B: setAuth on the SAME subscribed channel ----
  phase = 'B'
  console.log(`[${clk()}] FASE B: llamo setAuth(JWT) con el canal YA suscrito. ${PHASE_MS/1000}s...`)
  await c.realtime.setAuth(session.access_token)
  const gtB0 = gt
  await new Promise(r => setTimeout(r, PHASE_MS))
  const gtB = gt - gtB0

  // ---- Phase C: remove + re-subscribe AFTER setAuth ----
  phase = 'C'
  console.log(`[${clk()}] FASE C: removeChannel + re-suscribo (ya con JWT). ${PHASE_MS/1000}s...`)
  await c.removeChannel(ch)
  ch = c.channel('uat-order-2')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, mkHandler())
    .subscribe((s) => console.log(`[${clk()}]   canal-2 status: ${s}`))
  const gtC0 = gt
  await new Promise(r => setTimeout(r, PHASE_MS))
  const gtC = gt - gtC0

  console.log(`\n=== RESULTADO (recibidos por el canal de prueba / emitidos por el servidor) ===`)
  console.log(`FASE A (anon, sin setAuth):              ${got.A} / ${gtA}`)
  console.log(`FASE B (setAuth con canal ya suscrito):  ${got.B} / ${gtB}`)
  console.log(`FASE C (re-suscrito tras setAuth):       ${got.C} / ${gtC}`)
  console.log('')
  if (got.A === 0 && gtA > 0) console.log('✔ A=0 con tráfico: CONFIRMADO — suscribir sin JWT => RLS descarta todo (SUBSCRIBED-pero-mudo).')
  if (got.B === 0 && gtB > 0) console.log('✔ B=0: setAuth NO revive un canal ya suscrito. => hay que RE-SUSCRIBIR (o tener el token antes de suscribir).')
  if (got.B > 0) console.log('• B>0: setAuth SÍ revive el canal existente (entonces basta llamar setAuth a tiempo).')
  if (got.C > 0) console.log('✔ C>0: re-suscribir tras setAuth ENTREGA. Ese es el fix.')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
