// ============================================================================
// ROBOT DE NAVEGACIÓN + TIMING — Sidebar y módulo WhatsApp
// Diagnóstico estructural (standalone whatsapp-inbox-reliability).
//
// Patrón de sesión: clon de scripts/_diag-browser-repro-local.ts (mint session
// via admin.generateLink + verifyOtp, cookies SSR chunked, headless chromium).
//
// Fases (argv[2]):
//   sidebar — recorre links del sidebar, mide tiempo click→contenido estable
//   case1   — carga fresca /whatsapp: render de primeros items, #418, flashes
//   case2   — switching rápido entre conversaciones LEÍDAS: header vs mensajes
//   case3   — click inmediato en conversación 1/2 apenas carga (dead-click /
//             chat que nunca carga). Snapshot/restore de is_read.
//   case4   — scroll abajo en la lista + driver de UPDATE (noop y reorder con
//             restore) → detectar salto de scroll / shift de contenido
//   flow    — flujo completo: abrir conversación, panel info, pedidos. Timing.
//
// SEGURIDAD DE DATOS (prod DB detrás del dev server):
//   - case2/flow clickean SOLO conversaciones is_read=true & unread_count=0
//     (markAsRead = no-op semántico).
//   - case3 snapshotea is_read/unread_count de los items tocados y los RESTAURA
//     al final (solo si last_customer_message_at no cambió en el medio).
//   - case4 usa primero noop updates (cero cambio); el reorder real snapshotea
//     last_customer_message_at y lo restaura ~6s después.
//   - Nada pasa por el webhook ni invoca agentes (Regla 6 safe).
// ============================================================================
import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { chromium, type Page, type BrowserContext } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url')

const EMAIL = process.env.DIAG_EMAIL || 'joseromerorincon041100@gmail.com'
const APP = (process.env.ROBOT_APP_URL || 'http://localhost:3020').replace(/['"]/g, '').trim()
const REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
const WS = process.env.DIAG_WS || 'a3843b3f-c337-4836-92b5-89c58bb98490' // Somnio
const SECURE = APP.startsWith('https')
const HEADLESS = process.env.ROBOT_HEADED ? false : true
const OUT_DIR = path.resolve('.planning/standalone/whatsapp-inbox-reliability/robot')

function clk() {
  return new Date().toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0')
}
function log(msg: string) { console.log(`[${clk()}] ${msg}`) }

// ---------------------------------------------------------------------------
// Evidence collection
// ---------------------------------------------------------------------------
interface Ev { t: number; kind: string; data: unknown }
const evidence: Ev[] = []
let t0 = Date.now()
function ev(kind: string, data: unknown) { evidence.push({ t: Date.now() - t0, kind, data }) }

function saveReport(phase: string, extra: Record<string, unknown>) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${phase}.json`)
  fs.writeFileSync(file, JSON.stringify({ phase, app: APP, ws: WS, startedAt: new Date(t0).toISOString(), ...extra, evidence }, null, 2))
  log(`reporte → ${file}`)
}

// ---------------------------------------------------------------------------
// Session + browser
// ---------------------------------------------------------------------------
async function mintCookies(): Promise<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'Lax' }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
  const authc = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  let session: { access_token: string } | null = null
  for (const t of ['email', 'magiclink'] as const) {
    const { data, error } = await authc.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: t })
    if (!error && data?.session) { session = data.session as never; break }
  }
  if (!session) throw new Error('no session')
  const storageKey = `sb-${REF}-auth-token`
  const cookieVal = 'base64-' + stringToBase64URL(JSON.stringify(session))
  const chunks: { name: string; value: string }[] = createChunks(storageKey, cookieVal)
  const domain = new URL(APP).hostname
  return [
    ...chunks.map(c => ({ name: c.name, value: c.value, domain, path: '/', httpOnly: false, secure: SECURE, sameSite: 'Lax' as const })),
    { name: 'morfx_workspace', value: WS, domain, path: '/', httpOnly: false, secure: SECURE, sameSite: 'Lax' as const },
  ]
}

async function launch(): Promise<{ ctx: BrowserContext; page: Page; close: () => Promise<void> }> {
  const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 900 } })
  await ctx.addCookies(await mintCookies())
  const page = await ctx.newPage()
  page.on('console', (m) => {
    const text = m.text()
    if (m.type() === 'error' || /\[realtime|hydrat|Error|Warning: /i.test(text)) {
      ev('console', { type: m.type(), text: text.slice(0, 300) })
      if (m.type() === 'error' || /hydrat/i.test(text)) log(`🔴 console.${m.type()}: ${text.slice(0, 160)}`)
    }
  })
  page.on('pageerror', (e) => { ev('pageerror', { message: e.message.slice(0, 400) }); log(`❌ pageerror: ${e.message.slice(0, 160)}`) })
  page.on('requestfailed', (r) => ev('requestfailed', { url: r.url().slice(0, 200), err: r.failure()?.errorText }))
  // Server actions = POST a la misma ruta con header next-action → medir duración
  page.on('requestfinished', async (r) => {
    if (r.method() !== 'POST') return
    const h = await r.allHeaders().catch(() => ({} as Record<string, string>))
    if (!('next-action' in h)) return
    const timing = r.timing()
    ev('server-action', { url: r.url().replace(APP, ''), action: h['next-action']?.slice(0, 12), ms: Math.round(timing.responseEnd) })
  })
  return { ctx, page, close: () => browser.close() }
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const SEL_ITEM = '[role="listitem"]'
const SEL_LOG = '[role="log"]'

async function listState(page: Page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[role="listitem"]'))
    const busy = !!document.querySelector('[aria-busy="true"]')
    const skeletons = document.querySelectorAll('.mx-skeleton').length
    const spinners = document.querySelectorAll('.animate-spin').length
    return {
      count: items.length,
      busy, skeletons, spinners,
      first3: items.slice(0, 3).map(el => (el as HTMLElement).innerText.replace(/\n+/g, ' | ').slice(0, 120)),
    }
  }).catch(() => ({ count: -1, busy: false, skeletons: 0, spinners: 0, first3: [] as string[] }))
}

async function headerName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Editar nombre del contacto"]')
    if (btn) return (btn as HTMLElement).innerText.trim()
    // fallback v2/legacy <p> en el header (primer p.truncate dentro del header del hilo)
    const log = document.querySelector('[role="log"]')
    const root = log?.parentElement
    const p = root?.querySelector('p.truncate, .nm')
    return p ? (p as HTMLElement).innerText.trim() : null
  }).catch(() => null)
}

async function chatState(page: Page) {
  return page.evaluate(() => {
    const logEl = document.querySelector('[role="log"]')
    if (!logEl) return { hasLog: false, bubbles: 0, text: '', skeletons: 0, spinners: 0 }
    const bubbles = logEl.querySelectorAll('[data-index]').length
    return {
      hasLog: true,
      bubbles,
      text: (logEl as HTMLElement).innerText.replace(/\n+/g, ' ¶ ').slice(-600),
      skeletons: logEl.querySelectorAll('.mx-skeleton').length,
      spinners: logEl.querySelectorAll('.animate-spin').length,
    }
  }).catch(() => ({ hasLog: false, bubbles: 0, text: '', skeletons: 0, spinners: 0 }))
}

/** Encuentra el contenedor scrolleable de la lista de conversaciones. */
async function listScroll(page: Page): Promise<{ scrollTop: number; scrollHeight: number; clientHeight: number; topItem: string } | null> {
  return page.evaluate(() => {
    const item = document.querySelector('[role="listitem"]')
    if (!item) return null
    let el: HTMLElement | null = item.parentElement as HTMLElement
    while (el && el.scrollHeight <= el.clientHeight + 4) el = el.parentElement
    if (!el) return null
    // primer item visible (top >= contenedor top)
    const cTop = el.getBoundingClientRect().top
    const items = Array.from(document.querySelectorAll('[role="listitem"]'))
    const top = items.find(i => i.getBoundingClientRect().bottom > cTop + 4)
    return {
      scrollTop: Math.round(el.scrollTop),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      topItem: top ? (top as HTMLElement).innerText.split('\n')[0].slice(0, 40) : '',
    }
  }).catch(() => null)
}

async function setListScroll(page: Page, px: number) {
  await page.evaluate((target) => {
    const item = document.querySelector('[role="listitem"]')
    if (!item) return
    let el: HTMLElement | null = item.parentElement as HTMLElement
    while (el && el.scrollHeight <= el.clientHeight + 4) el = el.parentElement
    if (el) el.scrollTop = target
  }, px)
}

/** Espera a que el texto principal se estabilice (sin skeletons/spinners + texto quieto 600ms). */
async function waitContentStable(page: Page, timeoutMs = 30_000): Promise<{ ms: number; settledText: number }> {
  const start = Date.now()
  let lastLen = -1
  let stableSince = Date.now()
  while (Date.now() - start < timeoutMs) {
    const s = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body
      return {
        len: (main as HTMLElement).innerText.length,
        busy: !!document.querySelector('[aria-busy="true"]'),
        skel: document.querySelectorAll('.mx-skeleton').length,
        spin: document.querySelectorAll('.animate-spin').length,
      }
    }).catch(() => ({ len: 0, busy: true, skel: 0, spin: 0 }))
    if (s.len !== lastLen || s.busy || s.skel > 0 || s.spin > 0) { lastLen = s.len; stableSince = Date.now() }
    if (Date.now() - stableSince >= 600) return { ms: Date.now() - start - 600, settledText: lastLen }
    await page.waitForTimeout(100)
  }
  return { ms: timeoutMs, settledText: lastLen }
}

// ---------------------------------------------------------------------------
// Ground truth (service role)
// ---------------------------------------------------------------------------
function serviceDb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

interface ConvRow { id: string; is_read: boolean; unread_count: number; last_customer_message_at: string | null; last_message_at: string | null; updated_at: string; contact: { name: string | null } | null }

async function topConversations(db: SupabaseClient, limit = 30): Promise<ConvRow[]> {
  const { data, error } = await db
    .from('conversations')
    .select('id, is_read, unread_count, last_customer_message_at, last_message_at, updated_at, contact:contacts(name)')
    .eq('workspace_id', WS)
    .eq('status', 'active')
    .order('last_customer_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw new Error('topConversations: ' + error.message)
  return (data as never[]) ?? []
}

async function lastMessages(db: SupabaseClient, convId: string, n = 3): Promise<string[]> {
  const { data } = await db
    .from('messages')
    .select('content, type, direction, timestamp')
    .eq('conversation_id', convId)
    .order('timestamp', { ascending: false })
    .limit(n)
  return (data ?? [])
    .map((m: { content: { body?: string; caption?: string } | null; type: string }) =>
      (m.content?.body || m.content?.caption || `[${m.type}]`).slice(0, 80))
}

// ---------------------------------------------------------------------------
// FASE: sidebar
// ---------------------------------------------------------------------------
async function phaseSidebar() {
  const { page, close } = await launch()
  log('FASE sidebar — warmup + medición de navegación por módulos')
  await page.goto(APP + '/whatsapp', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitContentStable(page)

  const links: { href: string; label: string }[] = await page.evaluate(() => {
    const seen = new Set<string>()
    return Array.from(document.querySelectorAll('aside a[href^="/"], nav a[href^="/"]'))
      .map(a => ({ href: (a as HTMLAnchorElement).getAttribute('href')!, label: (a as HTMLElement).innerText.trim().slice(0, 30) || (a as HTMLAnchorElement).getAttribute('aria-label') || '' }))
      .filter(l => { if (seen.has(l.href) || l.href.startsWith('/login')) return false; seen.add(l.href); return true })
  })
  log(`links del sidebar: ${links.map(l => l.href).join(', ')}`)
  ev('sidebar-links', links)

  const rounds: Record<string, { spaMs: number[]; freshMs: number[] }> = {}
  // PASS 1 (warmup compila rutas en dev) + PASS 2/3 medición
  for (let round = 0; round < 3; round++) {
    for (const l of links) {
      try {
        const a = page.locator(`aside a[href="${l.href}"], nav a[href="${l.href}"]`).first()
        const tStart = Date.now()
        await a.click({ timeout: 5000 })
        await page.waitForFunction((href) => location.pathname === href || location.pathname.startsWith(href + '/') || location.pathname.startsWith(href + '?'), l.href, { timeout: 30_000 }).catch(() => null)
        const st = await waitContentStable(page)
        const total = Date.now() - tStart
        if (round > 0) {
          rounds[l.href] ??= { spaMs: [], freshMs: [] }
          rounds[l.href].spaMs.push(total)
        }
        log(`${round === 0 ? '(warmup) ' : ''}SPA ${l.href} → ${total}ms (texto ${st.settledText})`)
        ev('nav-spa', { round, href: l.href, ms: total })
      } catch (e) { ev('nav-error', { href: l.href, err: String(e).slice(0, 200) }); log(`⚠ nav ${l.href}: ${String(e).slice(0, 120)}`) }
    }
  }
  // Fresh full-loads (2 por ruta)
  for (let round = 0; round < 2; round++) {
    for (const l of links) {
      try {
        const tStart = Date.now()
        await page.goto(APP + l.href, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        const dcl = Date.now() - tStart
        const st = await waitContentStable(page)
        const total = Date.now() - tStart
        rounds[l.href] ??= { spaMs: [], freshMs: [] }
        rounds[l.href].freshMs.push(total)
        const navTiming = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
          return nav ? { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), htmlBytes: nav.transferSize || nav.encodedBodySize, decodedBytes: nav.decodedBodySize } : null
        })
        const domStats = await page.evaluate(() => ({ nodes: document.getElementsByTagName('*').length, htmlLen: document.documentElement.outerHTML.length }))
        log(`FRESH ${l.href} → dcl=${dcl}ms estable=${total}ms ttfb=${navTiming?.ttfb}ms html=${Math.round((navTiming?.decodedBytes || 0) / 1024)}KB nodos=${domStats.nodes}`)
        ev('nav-fresh', { round, href: l.href, dclMs: dcl, stableMs: total, navTiming, domStats })
      } catch (e) { ev('nav-error', { href: l.href, err: String(e).slice(0, 200) }) }
    }
  }
  saveReport('sidebar', { summary: rounds })
  await close()
}

// ---------------------------------------------------------------------------
// FASE: case1 — carga fresca, primeros items
// ---------------------------------------------------------------------------
async function phaseCase1() {
  const db = serviceDb()
  const truth = await topConversations(db, 5)
  log(`FASE case1 — ground truth top-5: ${truth.map(c => c.contact?.name || '?').join(' · ')}`)

  for (let iter = 1; iter <= 3; iter++) {
    const { page, close } = await launch()
    t0 = Date.now()
    log(`case1 iter ${iter} — goto /whatsapp`)
    const tStart = Date.now()
    await page.goto(APP + '/whatsapp', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(e => log('goto warn: ' + e.message))
    const dclMs = Date.now() - tStart
    log(`case1 iter ${iter}: domcontentloaded a ${dclMs}ms`)
    // muestreo denso de la lista por 12s POST-dcl (el primer goto en dev puede
    // tardar >12s compilando; el muestreo siempre corre completo)
    const samples: { ms: number; s: Awaited<ReturnType<typeof listState>> }[] = []
    const tSample = Date.now()
    while (Date.now() - tSample < 12_000) {
      samples.push({ ms: Date.now() - tStart, s: await listState(page) })
      await page.waitForTimeout(250)
    }
    // detectar flashes (count que baja) y primer momento con texto en first3
    let firstItems = -1
    let flashes = 0
    let prevCount = 0
    for (const smp of samples) {
      if (smp.s.count > 0 && firstItems === -1) firstItems = smp.ms
      if (smp.s.count < prevCount) flashes++
      prevCount = smp.s.count
    }
    const last = samples[samples.length - 1]
    log(`case1 iter ${iter}: primer item a ${firstItems}ms · flashes(count↓)=${flashes} · final count=${last.s.count}`)
    log(`  first3 finales: ${JSON.stringify(last.s.first3)}`)
    ev('case1-iter', { iter, firstItemsMs: firstItems, flashes, samples: samples.map(x => ({ ms: x.ms, count: x.s.count, skel: x.s.skeletons, busy: x.s.busy })) })
    ev('case1-first3-final', { iter, first3: last.s.first3, truthTop3: truth.slice(0, 3).map(c => c.contact?.name) })
    fs.mkdirSync(OUT_DIR, { recursive: true })
    await page.screenshot({ path: path.join(OUT_DIR, `case1-iter${iter}.png`) }).catch(() => null)
    await close()
  }
  saveReport('case1', {})
}

// ---------------------------------------------------------------------------
// FASE: case3 — click inmediato en conv 1/2 (dead click / nunca carga)
// ---------------------------------------------------------------------------
async function phaseCase3() {
  const db = serviceDb()
  const snapshot = await topConversations(db, 5)
  ev('case3-snapshot', snapshot.map(c => ({ id: c.id, is_read: c.is_read, unread: c.unread_count })))
  log('FASE case3 — snapshot is_read top-5 tomado (restore al final)')

  const results: Record<string, unknown>[] = []
  for (const idx of [0, 1, 0, 1]) { // 2 iteraciones por item
    const { page, close } = await launch()
    t0 = Date.now()
    const tStart = Date.now()
    await page.goto(APP + '/whatsapp', { waitUntil: 'commit', timeout: 60_000 }).catch(() => null)
    // click tan pronto exista el item idx — probablemente PRE-hidratación
    const item = page.locator(SEL_ITEM).nth(idx)
    await item.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => null)
    const tItemVisible = Date.now() - tStart
    let clickedAt = Date.now() - tStart
    await item.click({ timeout: 5000 }).catch(e => log('click1 warn: ' + String(e).slice(0, 100)))
    // ¿la selección ocurrió? (URL ?c= o aria-selected)
    let deadClickMs = -1
    let selected = false
    const tClick = Date.now()
    while (Date.now() - tClick < 4000) {
      selected = await page.evaluate((i) => {
        const items = document.querySelectorAll('[role="listitem"]')
        return location.search.includes('c=') || items[i]?.getAttribute('aria-selected') === 'true'
      }, idx).catch(() => false)
      if (selected) break
      await page.waitForTimeout(150)
    }
    if (!selected) {
      // dead click: reintentar hasta que pegue
      const tRetry = Date.now()
      for (let r = 0; r < 10 && !selected; r++) {
        await item.click({ timeout: 3000 }).catch(() => null)
        await page.waitForTimeout(400)
        selected = await page.evaluate(() => location.search.includes('c=')).catch(() => false)
      }
      deadClickMs = Date.now() - tClick
      clickedAt = Date.now() - tStart
      log(`case3 item${idx}: DEAD CLICK — selección pegó tras ${deadClickMs}ms de reintentos (${selected ? 'ok' : 'NUNCA'})`)
      void tRetry
    }
    // medir carga del chat hasta 20s
    const tSel = Date.now()
    let chatLoadedMs = -1
    let lastChat = await chatState(page)
    while (Date.now() - tSel < 20_000) {
      lastChat = await chatState(page)
      if (lastChat.bubbles > 0) { chatLoadedMs = Date.now() - tSel; break }
      await page.waitForTimeout(250)
    }
    const hdr = await headerName(page)
    const r = { idx, tItemVisible, clickedAt, deadClickMs, selected, chatLoadedMs, header: hdr, bubbles: lastChat.bubbles, chatSkeletons: lastChat.skeletons, chatSpinners: lastChat.spinners }
    results.push(r)
    log(`case3 item${idx}: itemVisible=${tItemVisible}ms deadClick=${deadClickMs === -1 ? 'no' : deadClickMs + 'ms'} chatLoaded=${chatLoadedMs === -1 ? 'NUNCA (>20s)' : chatLoadedMs + 'ms'} header=${hdr}`)
    if (chatLoadedMs === -1) await page.screenshot({ path: path.join(OUT_DIR, `case3-stuck-item${idx}-${Date.now()}.png`) }).catch(() => null)
    ev('case3-result', r)
    await close()
  }

  // RESTORE is_read/unread_count si no llegó mensaje nuevo en el medio
  const after = await topConversations(db, 10)
  for (const snap of snapshot) {
    const now = after.find(c => c.id === snap.id)
    if (!now) continue
    const changed = now.is_read !== snap.is_read || now.unread_count !== snap.unread_count
    const organic = now.last_customer_message_at !== snap.last_customer_message_at
    if (changed && !organic) {
      const { error } = await db.from('conversations').update({ is_read: snap.is_read, unread_count: snap.unread_count }).eq('id', snap.id)
      log(`restore conv ${snap.id.slice(0, 8)}: is_read=${snap.is_read} unread=${snap.unread_count} ${error ? 'ERR ' + error.message : 'ok'}`)
    } else if (changed && organic) {
      log(`skip restore ${snap.id.slice(0, 8)} (mensaje orgánico en el medio)`)
    }
  }
  saveReport('case3', { results })
}

// ---------------------------------------------------------------------------
// FASE: case2 — switching entre conversaciones leídas: header vs contenido
// ---------------------------------------------------------------------------
async function phaseCase2() {
  const db = serviceDb()
  const all = await topConversations(db, 60)
  const readConvs = all.filter(c => c.is_read && c.unread_count === 0 && c.contact?.name).slice(0, 4)
  if (readConvs.length < 2) { log('case2: no hay suficientes conversaciones leídas en el top-60'); return }
  const truth: Record<string, { name: string; msgs: string[] }> = {}
  for (const c of readConvs) truth[c.id] = { name: c.contact!.name!, msgs: await lastMessages(db, c.id) }
  log(`FASE case2 — convs: ${readConvs.map(c => truth[c.id].name).join(' · ')}`)
  ev('case2-truth', truth)

  for (const throttle of [false, true]) {
    const { page, ctx, close } = await launch()
    t0 = Date.now()
    await page.goto(APP + '/whatsapp', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitContentStable(page)
    if (throttle) {
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 })
      log('case2 — throttling ON (400ms RTT)')
    }
    const mismatches: Record<string, unknown>[] = []
    // secuencia A→B→C→D→A→B rápida
    const seq = [...readConvs, ...readConvs.slice(0, 2)]
    for (let i = 0; i < seq.length; i++) {
      const conv = seq[i]
      const name = truth[conv.id].name
      const item = page.locator(`${SEL_ITEM}:has-text("${name.slice(0, 18).replace(/"/g, '')}")`).first()
      const visible = await item.isVisible().catch(() => false)
      if (!visible) { log(`case2: "${name}" no visible en lista — skip`); continue }
      const tClick = Date.now()
      await item.click({ timeout: 4000 }).catch(() => null)
      // muestrear 4s: header vs contenido
      let consistentAt = -1
      for (let s = 0; s < 40; s++) {
        const hdr = await headerName(page)
        const chat = await chatState(page)
        const hdrIsTarget = hdr ? hdr.includes(name.slice(0, 12)) || name.includes((hdr || '').slice(0, 12)) : false
        // contenido pertenece a OTRA conversación de la secuencia?
        let foreign: string | null = null
        for (const other of readConvs) {
          if (other.id === conv.id) continue
          const om = truth[other.id].msgs.filter(m => m.length > 12)
          if (om.some(m => chat.text.includes(m.slice(0, 40)))) { foreign = truth[other.id].name; break }
        }
        const own = truth[conv.id].msgs.filter(m => m.length > 12).some(m => chat.text.includes(m.slice(0, 40)))
        if (hdrIsTarget && foreign && !own && chat.bubbles > 0) {
          mismatches.push({ throttle, target: name, header: hdr, foreignContentOf: foreign, atMs: Date.now() - tClick, bubbles: chat.bubbles })
          log(`🔴 case2 MISMATCH: header="${hdr}" pero contenido de "${foreign}" a +${Date.now() - tClick}ms`)
          await page.screenshot({ path: path.join(OUT_DIR, `case2-mismatch-${Date.now()}.png`) }).catch(() => null)
        }
        if (hdrIsTarget && own) { consistentAt = Date.now() - tClick; break }
        await page.waitForTimeout(100)
      }
      ev('case2-switch', { throttle, target: name, consistentAtMs: consistentAt })
      log(`case2 switch→"${name}" ${throttle ? '[3G]' : ''}: consistente a ${consistentAt === -1 ? 'NUNCA(4s)' : consistentAt + 'ms'}`)
    }
    ev('case2-mismatches', mismatches)
    await close()
  }
  saveReport('case2', {})
}

// ---------------------------------------------------------------------------
// FASE: case4 — scroll + updates → salto de scroll
// ---------------------------------------------------------------------------
async function phaseCase4() {
  const db = serviceDb()
  const { page, close } = await launch()
  t0 = Date.now()
  await page.goto(APP + '/whatsapp', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitContentStable(page)
  const init = await listScroll(page)
  if (!init) { log('case4: no encontré contenedor scrolleable'); await close(); return }
  log(`case4 — lista: scrollHeight=${init.scrollHeight} clientHeight=${init.clientHeight}`)

  // bajar a la mitad de la lista
  const target = Math.floor((init.scrollHeight - init.clientHeight) * 0.6)
  await setListScroll(page, target)
  await page.waitForTimeout(800)
  const before = await listScroll(page)
  log(`case4 — scrollTop fijado en ${before?.scrollTop} (topItem="${before?.topItem}")`)

  // monitor de scroll en background
  const track: { ms: number; scrollTop: number; topItem: string; count: number }[] = []
  const tMon = Date.now()
  let monitoring = true
  const monitor = (async () => {
    while (monitoring) {
      const s = await listScroll(page)
      const ls = await listState(page)
      if (s) track.push({ ms: Date.now() - tMon, scrollTop: s.scrollTop, topItem: s.topItem, count: ls.count })
      await page.waitForTimeout(200)
    }
  })()

  // SUB-CASO A: noop updates (cero cambio de datos, NO cambia el orden)
  log('case4-A — 4 noop conv.UPDATE (sin cambio de orden)')
  const olds = await db.from('conversations').select('id, updated_at').eq('workspace_id', WS).order('updated_at', { ascending: true }).limit(4)
  for (const row of olds.data ?? []) {
    await db.from('conversations').update({ updated_at: row.updated_at }).eq('id', row.id)
    await page.waitForTimeout(1500)
  }
  await page.waitForTimeout(12_000) // cubrir el safety refetch de 10s
  const afterNoop = await listScroll(page)
  log(`case4-A — scrollTop tras noops+safetyRefetch: ${afterNoop?.scrollTop} (antes ${before?.scrollTop})`)

  // SUB-CASO B: reorder real — snapshot + bump + restore
  await setListScroll(page, target)
  await page.waitForTimeout(800)
  const beforeB = await listScroll(page)
  const all = await topConversations(db, 30)
  const victim = all[Math.min(14, all.length - 1)]
  log(`case4-B — bump last_customer_message_at de "${victim.contact?.name}" (restore en 6s)`)
  const orig = victim.last_customer_message_at
  await db.from('conversations').update({ last_customer_message_at: new Date().toISOString() }).eq('id', victim.id)
  await page.waitForTimeout(6000)
  const afterBump = await listScroll(page)
  await db.from('conversations').update({ last_customer_message_at: orig }).eq('id', victim.id)
  log(`case4-B — restore hecho. scrollTop: antes=${beforeB?.scrollTop} después=${afterBump?.scrollTop} topItem antes="${beforeB?.topItem}" después="${afterBump?.topItem}"`)
  await page.waitForTimeout(12_000) // safety refetch del restore

  monitoring = false
  await monitor
  ev('case4-track', track)
  // detectar saltos: delta de scrollTop > 80px sin acción del robot, o cambio de topItem
  const jumps = track.filter((s, i) => i > 0 && Math.abs(s.scrollTop - track[i - 1].scrollTop) > 80)
  const shifts = track.filter((s, i) => i > 0 && s.topItem !== track[i - 1].topItem && Math.abs(s.scrollTop - track[i - 1].scrollTop) < 40)
  log(`case4 — saltos de scrollTop: ${jumps.length} · shifts de contenido bajo scroll fijo: ${shifts.length}`)
  saveReport('case4', { before, afterNoop, beforeB, afterBump, jumps, contentShifts: shifts.map(s => ({ ms: s.ms, topItem: s.topItem })) })
  await close()
}

// ---------------------------------------------------------------------------
// FASE: case4b — scroll robusto + sentinel por nombre + reorder con restore
// ---------------------------------------------------------------------------
async function phaseCase4b() {
  const db = serviceDb()
  const { page, close } = await launch()
  t0 = Date.now()
  await page.goto(APP + '/whatsapp', { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await waitContentStable(page)
  await page.waitForTimeout(3000) // dejar pasar mount refetch

  // contenedor de scroll determinista (v3 .conv-list, fallback radix viewport)
  const SCROLLER = '.conv-list, [data-radix-scroll-area-viewport]'
  const setScroll = async (px: number): Promise<number> => {
    return page.evaluate(({ sel, target }) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return -1
      el.scrollTop = target
      return el.scrollTop
    }, { sel: SCROLLER, target: px })
  }
  const readState = async () => page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) return null
    const cTop = el.getBoundingClientRect().top
    const items = Array.from(el.querySelectorAll('[role="listitem"]'))
    const idx = items.findIndex(i => i.getBoundingClientRect().bottom > cTop + 4)
    let topName = ''
    if (idx >= 0) {
      const nm = items[idx].querySelector('.nm') as HTMLElement | null
      const lines = (items[idx] as HTMLElement).innerText.split('\n')
      topName = (nm?.innerText?.split('\n')[0] || lines[1] || lines[0] || '').slice(0, 30)
    }
    return {
      scrollTop: Math.round(el.scrollTop),
      scrollHeight: el.scrollHeight,
      topIndex: idx,
      topName,
      count: items.length,
    }
  }, SCROLLER)

  const init = await readState()
  if (!init) { log('case4b: sin contenedor'); await close(); return }
  const target = Math.floor((init.scrollHeight - 665) * 0.6)
  const applied = await setScroll(target)
  await page.waitForTimeout(500)
  const before = await readState()
  log(`case4b — set=${target} applied=${applied} settled=${before?.scrollTop} topIndex=${before?.topIndex} topName="${before?.topName}"`)
  if (!before || before.scrollTop < 1000) { log('case4b: scroll no aplicó — abortando'); await close(); return }

  // monitor 50s con: 2 bumps (reorder real, restore) + tráfico orgánico
  const track: { ms: number; scrollTop: number; topIndex: number; topName: string }[] = []
  const tMon = Date.now()
  let monitoring = true
  const monitor = (async () => {
    while (monitoring) {
      const s = await readState()
      if (s) track.push({ ms: Date.now() - tMon, scrollTop: s.scrollTop, topIndex: s.topIndex, topName: s.topName })
      await page.waitForTimeout(200)
    }
  })()

  // víctimas DEBAJO del viewport (viewport ~índice 595): un reorder desde abajo
  // hacia el tope corre TODO el contenido visible una fila — el caso geométrico
  // que sí afecta al usuario. (Arriba del viewport no desplaza — probado.)
  const { data: deepRows } = await db
    .from('conversations')
    .select('id, last_customer_message_at, contact:contacts(name)')
    .eq('workspace_id', WS)
    .eq('status', 'active')
    .order('last_customer_message_at', { ascending: false, nullsFirst: false })
    .range(700, 760)
  const all = (deepRows as unknown as ConvRow[]) ?? await topConversations(db, 40)
  for (const vIdx of [0, 30]) {
    const victim = all[Math.min(vIdx, all.length - 1)]
    const orig = victim.last_customer_message_at
    log(`case4b — bump #${vIdx} "${victim.contact?.name}" → top (restore en 7s)`)
    await db.from('conversations').update({ last_customer_message_at: new Date().toISOString() }).eq('id', victim.id)
    await page.waitForTimeout(7000)
    await db.from('conversations').update({ last_customer_message_at: orig }).eq('id', victim.id)
    log(`case4b — restore #${vIdx} ok`)
    await page.waitForTimeout(7000)
  }
  await page.waitForTimeout(15_000) // safety refetches + tráfico orgánico

  monitoring = false
  await monitor
  // análisis: resets (scrollTop→<100), saltos (>80px), shifts de contenido (topIndex/topName cambian con scrollTop quieto)
  const resets = track.filter((s, i) => i > 0 && track[i - 1].scrollTop > 1000 && s.scrollTop < 100)
  const jumps = track.filter((s, i) => i > 0 && Math.abs(s.scrollTop - track[i - 1].scrollTop) > 80)
  const shifts = track.filter((s, i) => i > 0 && (s.topName !== track[i - 1].topName || s.topIndex !== track[i - 1].topIndex) && Math.abs(s.scrollTop - track[i - 1].scrollTop) < 40)
  log(`case4b — resets-a-tope:${resets.length} saltos:${jumps.length} shifts-de-contenido:${shifts.length}`)
  for (const s of shifts.slice(0, 10)) log(`  shift t=${s.ms}ms topIndex=${s.topIndex} topName="${s.topName}"`)
  ev('case4b-track', track)
  saveReport('case4b', { init, target, before, resets, jumps, shifts: shifts.map(s => ({ ms: s.ms, topIndex: s.topIndex, topName: s.topName })) })
  await close()
}

// ---------------------------------------------------------------------------
// FASE: flow — conversación → panel info → pedidos
// ---------------------------------------------------------------------------
async function phaseFlow() {
  const db = serviceDb()
  const all = await topConversations(db, 60)
  const conv = all.find(c => c.is_read && c.unread_count === 0 && c.contact?.name)
  if (!conv) { log('flow: sin conversación leída disponible'); return }
  const name = conv.contact!.name!
  const { page, close } = await launch()
  t0 = Date.now()
  const tNav = Date.now()
  await page.goto(APP + '/whatsapp', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const stList = await waitContentStable(page)
  log(`flow — lista estable en ${Date.now() - tNav}ms`)

  // abrir conversación
  const item = page.locator(`${SEL_ITEM}:has-text("${name.slice(0, 18).replace(/"/g, '')}")`).first()
  const tOpen = Date.now()
  await item.click({ timeout: 5000 })
  await page.waitForFunction(() => {
    const logEl = document.querySelector('[role="log"]')
    return !!logEl && logEl.querySelectorAll('[data-index]').length > 0
  }, undefined, { timeout: 20_000 }).catch(() => null)
  const msOpen = Date.now() - tOpen
  log(`flow — chat "${name}" con burbujas en ${msOpen}ms`)

  // abrir panel de info
  const toggle = page.locator('button[aria-label*="información del contacto"]').first()
  const tPanel = Date.now()
  let msPanel = -1, msOrders = -1, ordersCount = -1
  if (await toggle.isVisible().catch(() => false)) {
    await toggle.click()
    await page.waitForSelector('text=Pedidos recientes', { timeout: 15_000 }).catch(() => null)
    msPanel = Date.now() - tPanel
    // esperar a que la sección de pedidos termine de cargar (sin pulse)
    const tOrd = Date.now()
    await page.waitForFunction(() => {
      const h = Array.from(document.querySelectorAll('h3, h4, div')).find(e => e.textContent?.trim() === 'Pedidos recientes')
      if (!h) return false
      const sect = h.closest('div')?.parentElement
      return sect ? sect.querySelectorAll('.animate-pulse').length === 0 : false
    }, undefined, { timeout: 20_000 }).catch(() => null)
    msOrders = Date.now() - tOrd
    ordersCount = await page.evaluate(() => document.querySelectorAll('.ped-card, [class*="rounded-xl"][class*="border"]').length).catch(() => -1)
    log(`flow — panel info en ${msPanel}ms · pedidos cargados en ${msOrders}ms (cards≈${ordersCount})`)
  } else {
    log('flow — toggle de panel no visible')
  }
  await page.screenshot({ path: path.join(OUT_DIR, `flow-${Date.now()}.png`) }).catch(() => null)
  saveReport('flow', { conv: name, listStableMs: stList.ms, chatOpenMs: msOpen, panelMs: msPanel, ordersMs: msOrders, ordersCount })
  await close()
}

// ---------------------------------------------------------------------------
// FASE: probe418 — capturar el diff completo del error de hidratación
// ---------------------------------------------------------------------------
async function phaseProbe418() {
  const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 900 } })
  await ctx.addCookies(await mintCookies())
  const page = await ctx.newPage()
  const hydration: string[] = []
  page.on('console', (m) => {
    const t = m.text()
    if (/hydrat|didn't match|did not match|Text content|#418|#425|#423/i.test(t)) hydration.push(`[console.${m.type()}] ${t}`)
  })
  page.on('pageerror', (e) => {
    if (/hydrat|#418|#425|#423/i.test(e.message)) hydration.push(`[pageerror] ${e.message}\n${e.stack?.slice(0, 1500) || ''}`)
  })
  log('probe418 — goto /whatsapp y captura completa de errores de hidratación')
  await page.goto(APP + '/whatsapp', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null)
  await page.waitForTimeout(8000)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const out = path.join(OUT_DIR, `probe418-${Date.now()}.txt`)
  fs.writeFileSync(out, hydration.join('\n\n=====\n\n') || '(sin errores de hidratación capturados)')
  log(`probe418 — ${hydration.length} mensajes → ${out}`)
  await browser.close()
}

// ---------------------------------------------------------------------------
// FASE: ssrdiff — comparar texto SSR (sin JS) vs DOM hidratado, nodo a nodo
// ---------------------------------------------------------------------------
async function phaseSsrDiff() {
  const cookies = await mintCookies()
  const browser = await chromium.launch({ headless: HEADLESS, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

  async function captureTexts(js: boolean): Promise<{ topbar: string; items: string[] }> {
    const ctx = await browser.newContext({ viewport: { width: 1480, height: 900 }, javaScriptEnabled: js })
    await ctx.addCookies(cookies)
    const page = await ctx.newPage()
    await page.goto(APP + '/whatsapp', { waitUntil: js ? 'networkidle' : 'domcontentloaded', timeout: 90_000 }).catch(() => null)
    if (js) await page.waitForTimeout(2500)
    const out = await page.evaluate(() => {
      const topbar = (document.querySelector('header.topbar, header') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() || ''
      const items = Array.from(document.querySelectorAll('[role="listitem"]')).slice(0, 60)
        .map(el => (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
      return { topbar, items }
    }).catch(() => ({ topbar: '', items: [] as string[] }))
    await ctx.close()
    return out
  }

  log('ssrdiff — captura SSR (JS off)')
  const ssr = await captureTexts(false)
  log(`ssrdiff — SSR: ${ssr.items.length} items`)
  log('ssrdiff — captura hidratada (JS on)')
  const csr = await captureTexts(true)
  log(`ssrdiff — CSR: ${csr.items.length} items`)

  const diffs: string[] = []
  if (ssr.topbar !== csr.topbar) diffs.push(`TOPBAR:\n  SSR: ${ssr.topbar}\n  CSR: ${csr.topbar}`)
  const n = Math.min(ssr.items.length, csr.items.length)
  for (let i = 0; i < n; i++) {
    if (ssr.items[i] !== csr.items[i]) diffs.push(`ITEM ${i}:\n  SSR: ${ssr.items[i]}\n  CSR: ${csr.items[i]}`)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const out = path.join(OUT_DIR, `ssrdiff-${Date.now()}.txt`)
  fs.writeFileSync(out, diffs.length ? diffs.join('\n\n') : `(sin diferencias en topbar + primeros ${n} items — el mismatch está más abajo o en otro nodo)\n\nSSR topbar: ${ssr.topbar}\nCSR topbar: ${csr.topbar}`)
  log(`ssrdiff — ${diffs.length} diferencias → ${out}`)
  for (const d of diffs.slice(0, 5)) log(d)
  await browser.close()
}

// ---------------------------------------------------------------------------
async function main() {
  const phase = process.argv[2] || 'all'
  fs.mkdirSync(OUT_DIR, { recursive: true })
  log(`robot inbox — fase=${phase} app=${APP} ws=${WS.slice(0, 8)} headless=${HEADLESS}`)
  if (phase === 'probe418') await phaseProbe418()
  if (phase === 'ssrdiff') await phaseSsrDiff()
  if (phase === 'sidebar' || phase === 'all') await phaseSidebar()
  if (phase === 'case1' || phase === 'all') await phaseCase1()
  if (phase === 'case3' || phase === 'all') await phaseCase3()
  if (phase === 'case2' || phase === 'all') await phaseCase2()
  if (phase === 'case4' || phase === 'all') await phaseCase4()
  if (phase === 'case4b') await phaseCase4b()
  if (phase === 'flow' || phase === 'all') await phaseFlow()
  log('robot terminado')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
