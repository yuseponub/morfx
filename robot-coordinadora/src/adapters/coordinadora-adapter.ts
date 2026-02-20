// ============================================================================
// CoordinadoraAdapter -- Core Playwright automation for ff.coordinadora.com
// Ported from existing proven robot (yuseponub/AGENTES-IA-FUNCIONALES-v3)
// ============================================================================

import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { PedidoInput, Credentials, GuiaResult } from '../types/index.js'
import fs from 'fs'
import path from 'path'

const LOG_PREFIX = '[CoordinadoraAdapter]'

export class CoordinadoraAdapter {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private credentials: Credentials
  private workspaceId: string
  private cookiesPath: string

  constructor(credentials: Credentials, workspaceId: string) {
    this.credentials = credentials
    this.workspaceId = workspaceId
    // Cookies scoped per workspace to prevent cross-contamination
    this.cookiesPath = path.join(
      process.cwd(),
      'storage',
      'sessions',
      `${workspaceId}-cookies.json`
    )
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Launch Chromium headless, create context + page, load saved cookies.
   */
  async init(): Promise<void> {
    console.log(`${LOG_PREFIX} Initializing browser for workspace ${this.workspaceId}`)

    // Ensure storage directories exist
    const sessionsDir = path.join(process.cwd(), 'storage', 'sessions')
    const artifactsDir = path.join(process.cwd(), 'storage', 'artifacts')
    fs.mkdirSync(sessionsDir, { recursive: true })
    fs.mkdirSync(artifactsDir, { recursive: true })

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-dev-shm-usage', // Prevents Docker /dev/shm OOM
        '--no-sandbox',            // Required in Docker
        '--disable-gpu',
      ],
    })

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
    })

    this.page = await this.context.newPage()

    // Load saved cookies if they exist (per-workspace file)
    await this.loadCookies()

    console.log(`${LOG_PREFIX} Browser initialized`)
  }

  /**
   * Close browser, context, page. ALWAYS call this in a try/finally.
   */
  async close(): Promise<void> {
    console.log(`${LOG_PREFIX} Closing browser for workspace ${this.workspaceId}`)

    try {
      if (this.page) {
        await this.page.close().catch(() => {})
      }
      if (this.context) {
        await this.context.close().catch(() => {})
      }
      if (this.browser) {
        await this.browser.close().catch(() => {})
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Error during close:`, err)
    } finally {
      this.page = null
      this.context = null
      this.browser = null
      console.log(`${LOG_PREFIX} Browser closed`)
    }
  }

  // ---------------------------------------------------------------------------
  // Login & Session
  // ---------------------------------------------------------------------------

  /**
   * Log into ff.coordinadora.com. Reuses saved cookies if session is still valid.
   * Returns true on success, false on failure.
   */
  async login(): Promise<boolean> {
    if (!this.page || !this.context) {
      console.error(`${LOG_PREFIX} Cannot login: browser not initialized. Call init() first.`)
      return false
    }

    console.log(`${LOG_PREFIX} Attempting login for workspace ${this.workspaceId}`)

    try {
      await this.page.goto('https://ff.coordinadora.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })

      // Check if already logged in (cookies loaded a valid session)
      if (this.page.url().includes('/panel')) {
        console.log(`${LOG_PREFIX} Already logged in (session cookies valid)`)
        return true
      }

      // Fill login form
      console.log(`${LOG_PREFIX} Filling login form`)
      await this.page.fill('input[name="usuario"]', this.credentials.username)
      await this.page.fill('input[name="clave"]', this.credentials.password)

      // Submit login
      await this.page.click('button[type="submit"]')

      // Wait for navigation (max 15 seconds)
      await this.page.waitForURL('**/panel/**', { timeout: 15000 }).catch(() => {
        // URL might not change to /panel, check manually below
      })

      // Verify login succeeded
      const currentUrl = this.page.url()
      if (currentUrl.includes('/panel')) {
        console.log(`${LOG_PREFIX} Login successful`)
        await this.saveCookies()
        return true
      }

      console.error(`${LOG_PREFIX} Login failed -- URL after submit: ${currentUrl}`)
      await this.takeScreenshot('login-failed')
      return false
    } catch (err) {
      console.error(`${LOG_PREFIX} Login error:`, err)
      await this.takeScreenshot('login-error')
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /**
   * Navigate to the Coordinadora form and wait for it to be ready.
   */
  async navigateToForm(): Promise<void> {
    if (!this.page) {
      throw new Error(`${LOG_PREFIX} Cannot navigate: browser not initialized`)
    }

    console.log(`${LOG_PREFIX} Navigating to form`)

    await this.page.goto(
      'https://ff.coordinadora.com/panel/agregar_pedidos/coordinadora',
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    )

    // Wait for the form to be ready (key field visible)
    await this.page.waitForSelector('input[name="identificacion_destinatario"]', {
      state: 'visible',
      timeout: 15000,
    })

    console.log(`${LOG_PREFIX} Form ready`)
  }

  // ---------------------------------------------------------------------------
  // Core: createGuia (STUB -- implemented in Task 2)
  // ---------------------------------------------------------------------------

  /**
   * Create a shipment on the Coordinadora portal by filling the form.
   * STUB: Full implementation added in Task 2.
   */
  async createGuia(_pedido: PedidoInput): Promise<GuiaResult> {
    throw new Error('Not implemented -- see Task 2')
  }

  // ---------------------------------------------------------------------------
  // Cookie Persistence
  // ---------------------------------------------------------------------------

  /**
   * Save browser cookies to disk (per-workspace file).
   */
  private async saveCookies(): Promise<void> {
    if (!this.context) return

    try {
      const cookies = await this.context.cookies()
      const dir = path.dirname(this.cookiesPath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies, null, 2))
      console.log(`${LOG_PREFIX} Cookies saved to ${this.cookiesPath}`)
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to save cookies:`, err)
    }
  }

  /**
   * Load saved cookies from disk (per-workspace file).
   */
  private async loadCookies(): Promise<void> {
    if (!this.context) return

    try {
      if (fs.existsSync(this.cookiesPath)) {
        const raw = fs.readFileSync(this.cookiesPath, 'utf-8')
        const cookies = JSON.parse(raw)
        await this.context.addCookies(cookies)
        console.log(`${LOG_PREFIX} Cookies loaded from ${this.cookiesPath}`)
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to load cookies:`, err)
    }
  }

  // ---------------------------------------------------------------------------
  // Debugging
  // ---------------------------------------------------------------------------

  /**
   * Save a screenshot for debugging purposes.
   */
  private async takeScreenshot(name: string): Promise<void> {
    if (!this.page) return

    try {
      const artifactsDir = path.join(process.cwd(), 'storage', 'artifacts')
      fs.mkdirSync(artifactsDir, { recursive: true })
      const filePath = path.join(artifactsDir, `${name}-${Date.now()}.png`)
      await this.page.screenshot({ path: filePath, fullPage: true })
      console.log(`${LOG_PREFIX} Screenshot saved: ${filePath}`)
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to take screenshot:`, err)
    }
  }
}
