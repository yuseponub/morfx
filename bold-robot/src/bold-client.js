const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { saveScreenshot } = require('./screenshots')
const codeWaiter = require('./code-waiter')

const BOLD_LOGIN_URL = 'https://panel.bold.co'
const BOLD_NUEVO_LINK_URL =
  'https://panel.bold.co/misventas/pagos-en-linea/link-de-pago/nuevo/agregar-monto'

const STATE_DIR = process.env.STATE_DIR || '/app/state'
const STATE_FILE = path.join(STATE_DIR, 'bold-session.json')

const DEFAULT_TIMEOUT = 120_000
const LOGIN_FIELD_TIMEOUT = 30_000
const STEP_TIMEOUT = 30_000

/**
 * Creates a BOLD payment link by automating the merchant panel with Playwright.
 *
 * @param {Object} input
 * @param {string} input.username  - BOLD panel email
 * @param {string} input.password  - BOLD panel password
 * @param {number} input.amount    - Amount in COP (integer)
 * @param {string} input.description - Link description (e.g. "1x ELIXIR DEL SUEÑO")
 * @returns {Promise<{url: string}>}
 */
async function createPaymentLink({ username, password, amount, description }) {
  // === Input validation ===
  if (!username || typeof username !== 'string') throw new Error('username requerido')
  if (!password || typeof password !== 'string') throw new Error('password requerido')
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new Error('amount debe ser un número > 0')
  }
  if (!description || typeof description !== 'string' || !description.trim()) {
    throw new Error('description requerida')
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  const contextOptions = {
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1366, height: 900 },
    locale: 'es-CO',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  }

  // If we have a saved session from a prior login, reuse it to skip login entirely
  // (and avoid triggering the verification code challenge every time)
  const hasSavedState = fs.existsSync(STATE_FILE)
  if (hasSavedState) {
    contextOptions.storageState = STATE_FILE
    console.log('[bold] using saved session state from prior login')
  } else {
    console.log('[bold] no saved state — will perform full login')
  }

  const context = await browser.newContext(contextOptions)

  // Inject clipboard interceptor BEFORE any page navigates,
  // so we can capture what gets copied when the user-facing "Copiar link" button is clicked.
  await context.addInitScript(() => {
    window.__clipboardValue = null
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        const original = navigator.clipboard.writeText.bind(navigator.clipboard)
        navigator.clipboard.writeText = (text) => {
          window.__clipboardValue = text
          return original(text)
        }
      }
      // Some apps use document.execCommand('copy') — intercept that too
      const originalExec = document.execCommand.bind(document)
      document.execCommand = function (cmd, ...rest) {
        if (cmd === 'copy') {
          const sel = window.getSelection()
          if (sel && sel.toString()) {
            window.__clipboardValue = sel.toString()
          }
        }
        return originalExec(cmd, ...rest)
      }
    } catch (_) {
      // No-op — we still have DOM/regex fallbacks
    }
  })

  const page = await context.newPage()
  page.setDefaultTimeout(DEFAULT_TIMEOUT)

  try {
    // ===== STEP 0: TRY SAVED SESSION FIRST =====
    // If we have a saved storage state, try to navigate directly to the new link URL.
    // If the session is still valid, we skip the whole login flow.
    let isLoggedIn = false
    if (hasSavedState) {
      console.log('[bold] attempting to use saved session — navigating to new link URL...')
      await page.goto(BOLD_NUEVO_LINK_URL, { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(1500)
      await saveScreenshot(page, '00-session-probe')
      const currentUrl = page.url()
      // If we're on the agregar-monto URL, session is valid
      if (currentUrl.includes('/link-de-pago/nuevo/agregar-monto')) {
        console.log('[bold] saved session is valid, skipping login')
        isLoggedIn = true
      } else {
        console.log(`[bold] saved session expired (landed on ${currentUrl}), falling back to full login`)
      }
    }

    if (!isLoggedIn) {
      // ===== STEP 1: LOGIN =====
      console.log('[bold] navigating to landing...')
      await page.goto(BOLD_LOGIN_URL, { waitUntil: 'networkidle' })
      await saveScreenshot(page, '01-landing-page')

      // panel.bold.co is a LANDING page with "Registrarme" + "Iniciar sesión" buttons,
      // not the login form directly. Click "Iniciar sesión" first.
      const iniciarSesionSelector =
        'a:has-text("Iniciar sesión"), button:has-text("Iniciar sesión"), a:has-text("Iniciar"), button:has-text("Iniciar")'
      await page.waitForSelector(iniciarSesionSelector, { timeout: LOGIN_FIELD_TIMEOUT })
      await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.click(iniciarSesionSelector),
      ])
      await page.waitForTimeout(1500)
      await saveScreenshot(page, '01b-login-form')

      // Bold uses a 2-step login: first email + "Ingresar", then password + "Ingresar"
      const emailSelector =
        'input[type="email"], input[name="email"], input[name="username"], input[id*="email" i], input[placeholder*="correo" i], input[placeholder*="email" i]'
      const passwordSelector = 'input[type="password"], input[name="password"], input[id*="password" i]'
      const ingresarSelector =
        'button[type="submit"], button:has-text("Ingresar"), button:has-text("Continuar"), button:has-text("Siguiente")'

      // Step 1a: fill email
      await page.waitForSelector(emailSelector, { timeout: LOGIN_FIELD_TIMEOUT })
      await page.fill(emailSelector, username)
      await saveScreenshot(page, '02a-email-filled')

      // Step 1b: click Ingresar to advance to password page
      await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.click(ingresarSelector),
      ])
      await page.waitForTimeout(1500)
      await saveScreenshot(page, '02b-password-page')

      // Step 2a: fill password
      await page.waitForSelector(passwordSelector, { timeout: LOGIN_FIELD_TIMEOUT })
      await page.fill(passwordSelector, password)
      await saveScreenshot(page, '02c-password-filled')

      // Step 2b: click Ingresar to actually log in
      await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.click(ingresarSelector),
      ])
      await page.waitForTimeout(2500) // extra time for post-login redirect
      await saveScreenshot(page, '03-post-login')

      // ===== STEP 1.5: HANDLE VERIFICATION CODE CHALLENGE =====
      // Bold sends a 6-digit code to SMS/email when logging in from a new IP.
      // Detect the challenge screen and wait for the user to submit the code via /api/submit-code.
      const codeInputSelector =
        'input[maxlength="6"], input[placeholder*="6 dígitos" i], input[placeholder*="código" i], input[placeholder*="codigo" i], input[name*="code" i], input[name*="codigo" i], input[aria-label*="código" i], input[aria-label*="codigo" i]'
      const codeInput = await page.$(codeInputSelector)
      if (codeInput && (await codeInput.isVisible().catch(() => false))) {
        console.log('[bold] verification code screen detected — waiting for /api/submit-code...')
        await saveScreenshot(page, '02d-code-screen')

        const code = await codeWaiter.startWaiting(10 * 60 * 1000)
        console.log(`[bold] code received (${code.length} digits), submitting...`)

        await page.fill(codeInputSelector, code)
        await saveScreenshot(page, '02e-code-filled')

        // Click "Continuar" on the code screen
        await Promise.all([
          page.waitForLoadState('networkidle').catch(() => {}),
          page.click('button:has-text("Continuar"), button[type="submit"], button:has-text("Ingresar")'),
        ])
        await page.waitForTimeout(2500)
        await saveScreenshot(page, '02f-post-code')
      }

      await dismissNpsPopup(page)

      // Sanity check: the password field should NOT still be visible
      const stillOnLogin = await page.$(passwordSelector)
      if (stillOnLogin) {
        const visible = await stillOnLogin.isVisible().catch(() => false)
        if (visible) {
          await saveScreenshot(page, 'error-still-on-login')
          throw new Error(
            'Login falló — la página sigue mostrando el campo de contraseña. Credenciales incorrectas o captcha.'
          )
        }
      }

      // Persist the session state so future requests skip login entirely
      try {
        if (!fs.existsSync(STATE_DIR)) {
          fs.mkdirSync(STATE_DIR, { recursive: true })
        }
        await context.storageState({ path: STATE_FILE })
        console.log(`[bold] session state saved to ${STATE_FILE}`)
      } catch (err) {
        console.warn(`[bold] could not save session state: ${err.message}`)
      }
    } // end if (!isLoggedIn)

    // ===== STEP 2: NAVIGATE TO "NUEVO LINK" =====
    // BOLD's SPA redirects deep links to the dashboard, so we navigate via menu clicks.
    // First try the direct URL — if we actually land on agregar-monto, great.
    // Otherwise, fall back to sidebar navigation.
    console.log('[bold] navigating to new link form...')
    await page.goto(BOLD_NUEVO_LINK_URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await dismissNpsPopup(page)

    // Check if we're on the right page by looking for the amount field
    const quickAmountCheck = await page.$('input[type="number"], input[inputmode="numeric"], input[placeholder*="$" i]')
    if (!quickAmountCheck) {
      console.log('[bold] deep link redirected to dashboard — navigating via sidebar...')
      await saveScreenshot(page, '04a-dashboard-redirect')

      // Click "Pagos en línea" in the sidebar
      const pagosEnLineaSelector = 'a:has-text("Pagos en línea"), a:has-text("Pagos en linea"), nav a:has-text("Links de pago")'
      await page.click(pagosEnLineaSelector).catch(async () => {
        // Try alternative: look for any sidebar item pointing to pagos
        console.log('[bold] primary sidebar click failed, trying alternatives...')
        await page.click('text=Pagos en línea').catch(() => {})
        await page.click('text=Links de pago').catch(() => {})
      })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(1500)
      await dismissNpsPopup(page)
      await saveScreenshot(page, '04b-pagos-en-linea')

      // Click "Links de pago" if we're on the pagos-en-linea page
      await page.click('a:has-text("Links de pago"), button:has-text("Links de pago"), a:has-text("Link de pago")').catch(() => {})
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(1000)
      await dismissNpsPopup(page)
      await saveScreenshot(page, '04c-links-de-pago')

      // Click "Crear nuevo link" or "Nuevo link" or similar
      await page.click('a:has-text("Crear nuevo"), button:has-text("Crear nuevo"), a:has-text("Nuevo link"), button:has-text("Nuevo link"), a:has-text("Crear link"), button:has-text("Crear link")').catch(() => {})
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(1000)
      await dismissNpsPopup(page)
    }
    await saveScreenshot(page, '04-agregar-monto')

    // ===== STEP 3: FILL AMOUNT =====
    const amountSelector =
      'input[type="number"], input[name*="monto" i], input[name*="amount" i], input[placeholder*="monto" i], input[inputmode="numeric"]'

    await page.waitForSelector(amountSelector, { timeout: STEP_TIMEOUT })
    // Clear first in case there's a default value
    await page.fill(amountSelector, '')
    await page.fill(amountSelector, String(Math.floor(amount)))
    await saveScreenshot(page, '05-monto-filled')

    // Debug: dump all elements containing "Continuar" text to understand the DOM
    const debugInfo = await page.evaluate(() => {
      const results = []
      const all = document.querySelectorAll('*')
      for (const el of all) {
        const text = (el.textContent || '').trim()
        if (text.toLowerCase().includes('continuar') && text.length < 50) {
          results.push({
            tag: el.tagName,
            text: text.slice(0, 40),
            id: el.id || '',
            cls: (el.className || '').toString().slice(0, 60),
            w: el.offsetWidth,
            h: el.offsetHeight,
            visible: el.offsetHeight > 0 && el.offsetWidth > 0,
            role: el.getAttribute('role') || '',
            type: el.getAttribute('type') || '',
          })
        }
      }
      return results
    })
    console.log('[bold] DOM elements with "Continuar":', JSON.stringify(debugInfo, null, 2))

    // Strategy 1: Playwright getByText (matches any element regardless of tag)
    try {
      await page.getByText('Continuar', { exact: true }).first().click({ force: true, timeout: 5000 })
      console.log('[bold] Continuar clicked via getByText')
    } catch (e1) {
      console.log(`[bold] getByText failed: ${e1.message.slice(0, 100)}`)
      // Strategy 2: getByRole
      try {
        await page.getByRole('button', { name: 'Continuar' }).click({ force: true, timeout: 5000 })
        console.log('[bold] Continuar clicked via getByRole')
      } catch (e2) {
        console.log(`[bold] getByRole failed: ${e2.message.slice(0, 100)}`)
        // Strategy 3: evaluateHandle with ALL elements (not just button/a)
        try {
          const handle = await page.evaluateHandle(() => {
            const all = document.querySelectorAll('*')
            for (const el of all) {
              if (el.children.length <= 2 && (el.textContent || '').trim() === 'Continuar' && el.offsetHeight > 20) {
                return el
              }
            }
            return null
          })
          const el = handle.asElement()
          if (el) {
            await el.click({ force: true })
            console.log('[bold] Continuar clicked via evaluateHandle wildcard')
          } else {
            await saveScreenshot(page, 'error-continuar-not-found')
            throw new Error('No se encontró el botón Continuar con ninguna estrategia')
          }
        } catch (e3) {
          await saveScreenshot(page, 'error-continuar-not-found')
          throw e3
        }
      }
    }
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1000)
    await dismissNpsPopup(page)
    await saveScreenshot(page, '06-personalizar')

    // ===== STEP 4: FILL DESCRIPTION =====
    const descriptionSelector =
      'input[name*="descripcion" i], input[name*="description" i], textarea[name*="descripcion" i], textarea[name*="description" i], input[placeholder*="descripci" i], textarea[placeholder*="descripci" i], input[placeholder*="ej:" i]'

    await page.waitForSelector(descriptionSelector, { timeout: STEP_TIMEOUT })
    await page.fill(descriptionSelector, description.trim())
    await saveScreenshot(page, '07-description-filled')

    // ===== STEP 5: CREATE LINK =====
    const crearLinkSelector =
      'button:has-text("Crear link de pago"), button:has-text("Crear link"), button:has-text("Crear"), button:has-text("Generar")'
    await page.click(crearLinkSelector)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2000)
    await dismissNpsPopup(page)
    await saveScreenshot(page, '08-compartir')

    // Wait until the share page is reached
    await page
      .waitForURL(/\/compartir/, { timeout: STEP_TIMEOUT })
      .catch(() => {
        console.warn('[bold] URL did not match /compartir — continuing anyway')
      })

    // ===== STEP 6: EXTRACT URL — 4 strategies in cascade =====
    const copiarSelector =
      'button:has-text("Copiar link"), button:has-text("Copiar"), [data-testid*="copy"], [aria-label*="copiar" i]'

    await page.waitForSelector(copiarSelector, { timeout: STEP_TIMEOUT }).catch(() => {})
    await page.click(copiarSelector).catch((err) => {
      console.warn(`[bold] could not click copiar button: ${err.message}`)
    })
    await page.waitForTimeout(800)
    await dismissNpsPopup(page)

    // Strategy A: intercepted clipboard.writeText
    let url = await page.evaluate(() => window.__clipboardValue).catch(() => null)
    console.log(`[bold] strategy A (interceptor): ${url || 'null'}`)

    // Strategy B: direct clipboard.readText (requires permission, granted above)
    if (!url || !url.includes('checkout.bold.co')) {
      url = await page
        .evaluate(async () => {
          try {
            return await navigator.clipboard.readText()
          } catch {
            return null
          }
        })
        .catch(() => null)
      console.log(`[bold] strategy B (readText): ${url || 'null'}`)
    }

    // Strategy C: scan all page text for checkout.bold.co
    if (!url || !url.includes('checkout.bold.co')) {
      url = await page
        .evaluate(() => {
          const text = document.body ? document.body.innerText : ''
          const match = text.match(/https:\/\/checkout\.bold\.co\/[A-Za-z0-9_-]+/)
          return match ? match[0] : null
        })
        .catch(() => null)
      console.log(`[bold] strategy C (body regex): ${url || 'null'}`)
    }

    // Strategy D: scan all inputs/textareas for a checkout.bold.co value
    if (!url || !url.includes('checkout.bold.co')) {
      url = await page
        .evaluate(() => {
          const fields = document.querySelectorAll('input, textarea')
          for (const el of fields) {
            if (el.value && el.value.includes('checkout.bold.co')) return el.value
          }
          return null
        })
        .catch(() => null)
      console.log(`[bold] strategy D (input scan): ${url || 'null'}`)
    }

    // Strategy E (bonus): anchor tags href
    if (!url || !url.includes('checkout.bold.co')) {
      url = await page
        .evaluate(() => {
          const anchors = document.querySelectorAll('a[href*="checkout.bold.co"]')
          return anchors.length > 0 ? anchors[0].href : null
        })
        .catch(() => null)
      console.log(`[bold] strategy E (anchors): ${url || 'null'}`)
    }

    await saveScreenshot(page, '09-url-extracted')

    if (!url || !url.includes('checkout.bold.co')) {
      throw new Error(
        'No se pudo extraer la URL del link generado. Revisa /api/screenshots para ver en qué paso falló.'
      )
    }

    console.log(`[bold] SUCCESS: ${url}`)
    return { url }
  } catch (err) {
    const shortMsg = err.message.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')
    await saveScreenshot(page, `error-${shortMsg}`).catch(() => {})
    throw err
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

/**
 * BOLD panel occasionally shows an NPS survey popup that blocks clicks.
 * Try to dismiss it using common close-button patterns. Silent on failure.
 */
async function dismissNpsPopup(page) {
  const closeSelectors = [
    'button[aria-label*="cerrar" i]',
    'button[aria-label*="close" i]',
    '[data-testid*="close"]',
    '[data-testid*="dismiss"]',
    '.nps-close',
    '.modal-close',
    'button:has-text("×")',
    'button:has-text("No, gracias")',
    'button:has-text("Cerrar")',
  ]
  for (const sel of closeSelectors) {
    try {
      const el = await page.$(sel)
      if (el) {
        const visible = await el.isVisible().catch(() => false)
        if (visible) {
          await el.click({ timeout: 1500 }).catch(() => {})
          await page.waitForTimeout(300)
          return
        }
      }
    } catch (_) {
      // keep trying
    }
  }
}

module.exports = { createPaymentLink }
