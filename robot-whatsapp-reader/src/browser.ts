// src/browser.ts — live-session layer for the read-only WhatsApp history reader.
//
// DEVIATION from robot-godentist (PATTERNS §browser.ts): this robot logs in by QR ONCE
// per number and the linked-device session MUST survive resumable batches (D-13/D-14).
// So we open a persistent context (see openSession below) — NOT `launch()+newContext()`.
// There is no separate `browser` handle; the persistent context IS the session.
//
// ABSOLUTE CONSTRAINT (D-15): this file contains NO send path whatsoever — none of the wa-js
// message-emitting or phone-number-requesting APIs are imported or invoked here. On logout/QR-expiry
// we raise a clean NOT_AUTHENTICATED fail-safe so the orchestrator (Plan 05) pauses + alerts — it
// NEVER emits anything to "wake" the session. This robot is strictly READ-ONLY.
import { createRequire } from 'node:module'
import { chromium, type BrowserContext, type Page } from 'playwright'

const require = createRequire(import.meta.url)

/**
 * Pattern 1 (RESEARCH lines 190-210, VERBATIM): open a PERSISTENT real-Chrome context so the
 * QR login + linked-device state survives between runs (resumable batches, D-13/D-14).
 */
export async function openSession(
  userDataDir: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  console.log(`[wa-reader] Opening persistent Chrome context (userDataDir=${userDataDir})...`)
  // Base launch opts shared by both the real-Chrome attempt and the bundled-Chromium fallback.
  const baseOpts = {
    headless: false, // QR scan needs a visible window; also headed = lower detection
    viewport: { width: 1280, height: 900 },
    locale: 'es-CO',
    timezoneId: 'America/Bogota', // align browser tz with Regla 2 / residential reality
    args: ['--disable-blink-features=AutomationControlled'], // hides the obvious CDP automation flag
  }
  // Prefer real Chrome (channel:'chrome') for fewer fingerprint deltas. If it isn't installed,
  // fall back to Playwright's bundled Chromium — exactly the fallback the README documents
  // ("Si no hay Chrome del sistema, el Chromium instalado es el fallback"). Read-only either way.
  let ctx: BrowserContext
  try {
    ctx = await chromium.launchPersistentContext(userDataDir, { ...baseOpts, channel: 'chrome' })
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err)
    console.warn(`[wa-reader] Real Chrome (channel:'chrome') unavailable → bundled Chromium fallback. (${msg})`)
    ctx = await chromium.launchPersistentContext(userDataDir, baseOpts)
  }
  // single proportionate stealth patch — WA has no Cloudflare/DataDome, webdriver is the only real tell
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded' })
  console.log('[wa-reader] web.whatsapp.com loaded.')
  return { ctx, page }
}

/**
 * Pattern 2 (RESEARCH lines 218-220, VERBATIM): inject the wa-js bundle as a script tag, then
 * wait until the Store (window.WPP) reports ready. Must run AFTER login is confirmed, BEFORE
 * any enumeration.
 */
export async function injectWaJs(page: Page): Promise<void> {
  // The package only exposes the '.' export (→ dist/wppconnect-wa.js); the explicit
  // './dist/...' subpath is NOT in the exports map and throws ERR_PACKAGE_PATH_NOT_EXPORTED.
  const WPP_PATH = require.resolve('@wppconnect/wa-js')
  console.log('[wa-reader] Injecting wa-js Store bundle...')
  await page.addScriptTag({ path: WPP_PATH })
  await page.waitForFunction(() => (window as any).WPP?.isReady === true, { timeout: 60_000 })
  console.log('[wa-reader] window.WPP ready.')
}

/**
 * D-15 fail-safe (Pitfall 4): block until the session is authenticated; if it never authenticates
 * (QR never scanned, logout mid-run, device unlinked), raise a clean NOT_AUTHENTICATED error.
 * The caller (Plan 05 orchestrator) catches this, pauses cleanly, leaves the in-flight chat
 * `pending`, and alerts the operator to re-scan — it NEVER attempts any send to wake the session.
 */
export async function assertAuthenticated(page: Page): Promise<void> {
  await page
    .waitForFunction(() => (window as any).WPP?.conn?.isAuthenticated?.() === true, { timeout: 0 })
    .catch(() => {
      throw new Error('NOT_AUTHENTICATED')
    })
  console.log('[wa-reader] Session authenticated.')
}

/**
 * Lightweight liveness probe for use mid-run between chats: returns true if the session has dropped
 * (QR `<canvas>` reappeared OR isAuthenticated()===false). On true, the orchestrator pauses clean
 * and alerts — it NEVER sends anything. This is the read-only D-15 contract surfaced as a check.
 */
export async function isLoggedOut(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const WPP = (window as any).WPP
    const authed = WPP?.conn?.isAuthenticated?.() === true
    const qrPresent = !!document.querySelector('canvas[aria-label], canvas')
    return !authed || qrPresent
  })
}

/**
 * D-08 — capture the business's own number identity once at session start. This is the "who is me"
 * the migrated business number, used to disambiguate fromMe messages downstream.
 * (RESEARCH lines 345-351, VERBATIM.)
 */
export async function captureBusinessIdentity(
  page: Page,
): Promise<{ number: string; name: string | null }> {
  const me = await page.evaluate(async () => {
    const WPP = (window as any).WPP
    const wid = WPP.whatsapp.UserPrefs?.getMaybeMeUser?.() ?? WPP.conn?.me
    return {
      number: String(wid?.user ?? wid?._serialized ?? '').replace(/\D/g, ''),
      name: WPP.conn?.pushname ?? null,
    }
  })
  console.log(`[wa-reader] Business identity captured: number=${me.number || '(unknown)'}`)
  return me
}

/**
 * Close the persistent context. Guarded by try/finally + [wa-reader] logging (mirrors the
 * robot-godentist close() discipline). The context IS the session, so this is the only handle.
 */
export async function closeSession(ctx: BrowserContext): Promise<void> {
  try {
    await ctx.close()
  } catch (err) {
    console.error('[wa-reader] Error closing session:', err)
  } finally {
    console.log('[wa-reader] Session closed.')
  }
}
