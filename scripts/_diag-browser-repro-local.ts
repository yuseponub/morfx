import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url')

const EMAIL = process.env.DIAG_EMAIL || 'joseromerorincon041100@gmail.com'
const APP = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3020').replace(/['"]/g, '').trim()
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
    ...chunks.map(c => ({ name: c.name, value: c.value, domain, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const })),
    { name: 'morfx_workspace', value: WS, domain, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const },
  ]

  // GROUND TRUTH: service-role watch of conversations UPDATE on Somnio (organic traffic)
  let gtCount = 0
  let firstGtAt: number | null = null
  const gt = createClient(url, service, { realtime: { params: { eventsPerSecond: 30 } } })
  gt.channel('gt2').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `workspace_id=eq.${WS}` }, () => {
    gtCount++
    if (firstGtAt === null) firstGtAt = Date.now()
    console.log(`[${clk()}] ── GT conv.UPDATE #${gtCount} (servidor SI emite) ──`)
  }).subscribe()

  // real browser
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const ctx = await browser.newContext()
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  let browserRtCount = 0
  let firstBrowserRtAt: number | null = null
  page.on('console', (m) => {
    const t = m.text()
    if (/\[realtime:inbox\]/i.test(t)) {
      // Only REAL delivered events count toward the PASS criterion — exclude the
      // `[realtime:inbox] status: SUBSCRIBED` lifecycle line (a SUBSCRIBED-but-mute
      // socket still logs it). RQ-4 PASS = the browser received an actual conversation
      // postgres_changes event, not merely that the channel reached SUBSCRIBED.
      const isStatusLine = /status:/i.test(t)
      if (!isStatusLine) {
        browserRtCount++
        if (firstBrowserRtAt === null) firstBrowserRtAt = Date.now()
      }
      console.log(`[${clk()}] 🌐 BROWSER ${t.slice(0, 120)}`)
    }
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
  if (firstGtAt !== null) console.log(`Primer GT conv.UPDATE:                              +${firstGtAt - firstGtAt}ms (t0)`)
  // RQ-4: first-browser-event latency relative to its matching GT event (target ≤2s)
  if (firstBrowserRtAt !== null && firstGtAt !== null) {
    const latencyMs = firstBrowserRtAt - firstGtAt
    console.log(`Latencia primer evento navegador vs GT:            ${latencyMs}ms (objetivo ≤2000ms)`)
  }
  if (gtCount > 0 && browserRtCount > 0) {
    console.log('-> PASS: el servidor emite Y el NAVEGADOR recibe en una carga fresca. Fix token-before-subscribe confirmado.')
    await browser.close(); process.exit(0)
  } else if (gtCount > 0 && browserRtCount === 0) {
    console.log('-> FAIL (still broken): el servidor emite pero el NAVEGADOR no recibe NADA. Token no está en el socket al primer join.')
    await browser.close(); process.exit(1)
  } else {
    console.log('-> INCONCLUSIVE: sin trafico Somnio (conv.UPDATE) en la ventana; reintentar o forzar trafico via scripts/_diag-protocol.ts.')
    await browser.close(); process.exit(2)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
