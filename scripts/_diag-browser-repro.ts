import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
// internal ssr helpers — exact cookie format the app reads
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url')

const EMAIL = process.env.DIAG_EMAIL || 'joseromerorincon041100@gmail.com'
const APP = (process.env.NEXT_PUBLIC_APP_URL || 'https://morfx-sandy.vercel.app').replace(/['"]/g, '').trim()
const REF = 'expslvzsszymljafhppi'
const WS = process.env.DIAG_WS || 'a3843b3f-c337-4836-92b5-89c58bb98490' // Somnio
const PATH = process.env.DIAG_PATH || '/whatsapp'
const WINDOW_MS = 120_000

function clk() { return new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0') }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // ---- 1. mint session ----
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
  if (lerr || !link?.properties?.hashed_token) { console.error('generateLink ERR', lerr?.message); process.exit(1) }
  const authc = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  let session: any = null
  for (const t of ['email', 'magiclink'] as const) {
    const { data, error } = await authc.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: t })
    if (!error && data?.session) { session = data.session; break }
  }
  if (!session) { console.error('no session'); process.exit(1) }
  console.log(`[${clk()}] sesion lista (user ${session.user.id.slice(0, 8)}) ws=${WS.slice(-6)} app=${APP}`)

  // ---- 2. build the exact auth cookies the app reads ----
  const storageKey = `sb-${REF}-auth-token`
  const cookieVal = 'base64-' + stringToBase64URL(JSON.stringify(session))
  const chunks: { name: string; value: string }[] = createChunks(storageKey, cookieVal)
  const domain = new URL(APP).hostname
  const cookies = [
    ...chunks.map(c => ({ name: c.name, value: c.value, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' as const })),
    { name: 'morfx_workspace', value: WS, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' as const },
  ]
  console.log(`[${clk()}] ${chunks.length} cookie(s) de auth + morfx_workspace preparadas`)

  // ---- 3. GROUND TRUTH socket (service-role, RLS bypass) — hora exacta de insert ----
  const gt = createClient(url, service, { realtime: { params: { eventsPerSecond: 20 } } })
  gt.channel('gt').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `workspace_id=eq.${WS}` }, (p) => {
    const r = p.new as any
    console.log(`[${clk()}] ── GROUND TRUTH: messages INSERT id=${String(r.id).slice(0, 8)} dir=${r.direction} (ya en DB) ──`)
  }).subscribe()

  // ---- 4. real browser with the injected session ----
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const ctx = await browser.newContext()
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    const t = m.text()
    if (/realtime|inbox|message|SUBSCRIB|CHANNEL|socket|unread/i.test(t)) {
      console.log(`[${clk()}] BROWSER ${m.type()}: ${t.slice(0, 160)}`)
    }
  })
  page.on('pageerror', (e) => console.log(`[${clk()}] BROWSER pageerror: ${e.message.slice(0, 120)}`))

  console.log(`[${clk()}] abriendo ${APP}${PATH} ...`)
  await page.goto(APP + PATH, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('goto warn:', e.message))
  await page.waitForTimeout(3000)
  console.log(`[${clk()}] landed: ${page.url()}  title="${(await page.title().catch(() => '?'))}"`)
  if (/login/i.test(page.url())) {
    console.log('!! redirigido a login — la sesion no fue aceptada. Abortando.')
    await browser.close(); process.exit(1)
  }

  console.log(`\n[${clk()}] >>> ESCUCHANDO ${WINDOW_MS / 1000}s. ENVIA UN MENSAJE DESDE TU CEL AL NUMERO DE SOMNIO AHORA <<<`)
  console.log('   (compara: "GROUND TRUTH" = entro a DB  vs  "BROWSER [realtime:inbox]" = lo proceso tu navegador)\n')
  await page.waitForTimeout(WINDOW_MS)

  console.log(`\n[${clk()}] fin. Si BROWSER [realtime:inbox] aparece ~1s tras GROUND TRUTH -> socket OK, lag es render.`)
  console.log('Si aparece ~20s tarde o NO aparece -> el socket del navegador es el problema.')
  await browser.close()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
