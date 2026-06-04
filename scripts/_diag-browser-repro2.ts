import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url')

const EMAIL = process.env.DIAG_EMAIL || 'joseromerorincon041100@gmail.com'
const APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://morfx-sandy.vercel.app').replace(/['"]/g, '').trim()
const REF = 'expslvzsszymljafhppi'
const WS = process.env.DIAG_WS || 'a3843b3f-c337-4836-92b5-89c58bb98490' // Somnio (alto trafico)
const PATH = '/whatsapp'
const WINDOW_MS = 50_000
function clk() { return new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0') }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // mint session
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
  const authc = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  let session: any = null
  for (const t of ['email', 'magiclink'] as const) {
    const { data, error } = await authc.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: t })
    if (!error && data?.session) { session = data.session; break }
  }
  if (!session) { console.error('no session'); process.exit(1) }

  // build ssr cookies
  const storageKey = `sb-${REF}-auth-token`
  const cookieVal = 'base64-' + stringToBase64URL(JSON.stringify(session))
  const chunks: { name: string; value: string }[] = createChunks(storageKey, cookieVal)
  const domain = new URL(APP).hostname
  const cookies = [
    ...chunks.map(c => ({ name: c.name, value: c.value, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' as const })),
    { name: 'morfx_workspace', value: WS, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' as const },
  ]

  // GROUND TRUTH: service-role watch of conversations UPDATE on Somnio (organic traffic)
  let gtCount = 0
  const gt = createClient(url, service, { realtime: { params: { eventsPerSecond: 30 } } })
  gt.channel('gt2').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `workspace_id=eq.${WS}` }, () => {
    gtCount++; console.log(`[${clk()}] ── GT conv.UPDATE #${gtCount} (servidor SI emite) ──`)
  }).subscribe()

  // real browser
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const ctx = await browser.newContext()
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  let browserRtCount = 0
  page.on('console', (m) => {
    const t = m.text()
    if (/\[realtime:inbox\]/i.test(t)) { browserRtCount++; console.log(`[${clk()}] 🌐 BROWSER ${t.slice(0, 120)}`) }
    else if (/SUBSCRIB|CHANNEL_ERROR|TIMED_OUT|CLOSED/i.test(t)) console.log(`[${clk()}] 🌐 BROWSER ${t.slice(0, 120)}`)
  })
  page.on('pageerror', (e) => console.log(`[${clk()}] ❌ BROWSER pageerror: ${e.message.slice(0, 200)}`))

  await page.goto(APP + PATH, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('goto warn', e.message))
  await page.waitForTimeout(2500)
  // is the tab considered visible? (affects our watchdog gating)
  const vis = await page.evaluate(() => ({ hidden: document.hidden, state: document.visibilityState })).catch(() => null)
  console.log(`[${clk()}] landed: ${page.url()}  document.visibility=${JSON.stringify(vis)}`)
  if (/login/i.test(page.url())) { console.log('!! login redirect'); await browser.close(); process.exit(1) }

  console.log(`[${clk()}] === escuchando ${WINDOW_MS/1000}s (Somnio tiene trafico continuo; NO necesitas hacer nada) ===\n`)
  await page.waitForTimeout(WINDOW_MS)

  console.log(`\n=== RESULTADO ===`)
  console.log(`Ground truth (servidor emitió conv.UPDATE Somnio): ${gtCount}`)
  console.log(`Navegador recibió [realtime:inbox]:                ${browserRtCount}`)
  if (gtCount > 0 && browserRtCount === 0) console.log('-> CONFIRMADO: el servidor emite pero el NAVEGADOR no recibe NADA. Realtime roto en el cliente (no idle).')
  else if (browserRtCount > 0) console.log('-> El navegador SI recibe. Entonces no es "realtime muerto"; revisar render.')
  else console.log('-> Sin trafico Somnio en la ventana; reintentar.')
  await browser.close(); process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
