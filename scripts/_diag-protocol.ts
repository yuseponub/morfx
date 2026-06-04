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
const WS = process.env.DIAG_WS || 'a3843b3f-c337-4836-92b5-89c58bb98490'
const WINDOW_MS = Number(process.env.DIAG_WINDOW_MS || 360_000) // 6 min
function clk() { return new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) }
function body(content: any): string { try { return (typeof content === 'string' ? JSON.parse(content) : content)?.body?.slice(0, 24) ?? '' } catch { return '' } }

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

  // GROUND TRUTH: exact time + body of each inbound message hitting the DB
  const gt = createClient(url, service, { realtime: { params: { eventsPerSecond: 30 } } })
  gt.channel('gtp')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `workspace_id=eq.${WS}` }, (p) => {
      const r = p.new as any
      if (r.direction === 'inbound') console.log(`[${clk()}] 🟢 GT msg "${body(r.content)}" entro a DB (dir=inbound)`)
    })
    .subscribe()

  // ssr cookies + headless browser on the same workspace
  const cookieVal = 'base64-' + stringToBase64URL(JSON.stringify(session))
  const chunks: { name: string; value: string }[] = createChunks(`sb-${REF}-auth-token`, cookieVal)
  const domain = new URL(APP).hostname
  const cookies = [
    ...chunks.map(c => ({ name: c.name, value: c.value, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' as const })),
    { name: 'morfx_workspace', value: WS, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' as const },
  ]
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const ctx = await browser.newContext()
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    const t = m.text()
    if (/\[realtime:inbox\]/i.test(t)) console.log(`[${clk()}] 🌐 NAVEGADOR ${t.slice(0, 110)}`)
    else if (/status: (SUBSCRIBED|CHANNEL_ERROR|TIMED_OUT|CLOSED)/i.test(t)) console.log(`[${clk()}] 🌐 NAVEGADOR ${t.match(/status: \w+/)?.[0]}`)
  })
  page.on('pageerror', (e) => console.log(`[${clk()}] ❌ NAVEGADOR error: ${e.message.slice(0, 90)}`))
  await page.goto(APP + '/whatsapp', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const vis = await page.evaluate(() => document.visibilityState).catch(() => '?')
  console.log(`[${clk()}] navegador en ${page.url()} (visibility=${vis})`)
  if (/login/i.test(page.url())) { console.log('!! login redirect'); await browser.close(); process.exit(1) }

  console.log(`\n[${clk()}] ====== PROTOCOLO ACTIVO ${WINDOW_MS/1000/60} min — EMPIEZA EL CRONOMETRO Y ENVIA p1 AHORA ======`)
  console.log(`   0:00 p1 | 0:20 p2 | 0:40 p3 | 1:40 p4 | 3:40 p5 | 4:00 p6`)
  console.log(`   (🟢 GT = entro a DB ; 🌐 NAVEGADOR = realtime lo proceso. Compara los tiempos.)\n`)
  await page.waitForTimeout(WINDOW_MS)
  console.log(`\n[${clk()}] fin protocolo.`)
  await browser.close(); process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
