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
  // Core: createGuia -- Form fill, submit, result detection
  // ---------------------------------------------------------------------------

  /**
   * Create a shipment on the Coordinadora portal by filling the form.
   * Navigates to form, fills all fields, submits, and detects SweetAlert2 result.
   *
   * This is the CRITICAL method -- ported from the proven existing robot.
   * All selectors, interaction patterns, and timings are battle-tested.
   */
  async createGuia(pedido: PedidoInput): Promise<GuiaResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized. Call init() first.' }
    }

    console.log(`${LOG_PREFIX} Creating guia for ref: ${pedido.referencia}`)

    try {
      // Navigate to a clean form
      await this.navigateToForm()

      // --- Personal data fields ---
      await this.fillField('identificacion_destinatario', pedido.identificacion)
      await this.fillField('nombre_destinatario', pedido.nombres)
      await this.fillField('apellido_destinatario', pedido.apellidos)
      await this.fillField('direccion_destinatario', pedido.direccion)
      await this.fillField('celular_destinatario', pedido.celular)
      await this.fillField('email_destinatario', pedido.email)

      // --- City field (MUI Autocomplete -- CRITICAL PATTERN) ---
      // MUI Autocomplete requires keyboard interaction, not just value setting.
      // Proven pattern: type -> wait for dropdown -> ArrowDown -> Enter
      await this.fillCityAutocomplete(pedido.ciudad)

      // --- Shipment data fields ---
      await this.fillField('referencia', pedido.referencia)
      await this.fillField('unidades', String(pedido.unidades))
      await this.fillField('valor_declarado', String(pedido.valorDeclarado))
      await this.fillField('peso', String(pedido.peso))
      await this.fillField('alto', String(pedido.alto))
      await this.fillField('largo', String(pedido.largo))
      await this.fillField('ancho', String(pedido.ancho))

      // --- COD (recaudo contraentrega) ---
      if (pedido.esRecaudoContraentrega) {
        await this.enableCOD(pedido.totalConIva)
      }

      // --- Submit the form ---
      console.log(`${LOG_PREFIX} Submitting form`)
      await this.page.click('button[type="submit"]')

      // Wait for SweetAlert2 response (portal does server-side validation)
      // The portal takes variable time -- wait up to 10 seconds for the modal
      const swalResult = await this.detectSweetAlertResult()
      return swalResult
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`${LOG_PREFIX} createGuia error:`, err)
      await this.takeScreenshot('createGuia-error')
      return { success: false, error: message }
    }
  }

  // ---------------------------------------------------------------------------
  // Form Field Helpers
  // ---------------------------------------------------------------------------

  /**
   * Fill a named input field. Clears before filling to handle form reuse.
   * Wraps in try/catch -- some optional fields may not be present.
   */
  private async fillField(fieldName: string, value: string): Promise<void> {
    if (!this.page) return

    try {
      const selector = `input[name="${fieldName}"]`
      await this.page.waitForSelector(selector, { state: 'visible', timeout: 5000 })
      await this.page.fill(selector, '') // Clear previous value
      await this.page.fill(selector, value)
      await this.page.waitForTimeout(200) // Brief pause for React state sync
      console.log(`${LOG_PREFIX} Filled ${fieldName}`)
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to fill ${fieldName}:`, err)
    }
  }

  /**
   * Fill the city MUI Autocomplete field using the proven pattern.
   * CRITICAL: This uses type-wait-ArrowDown-Enter, NOT just .fill().
   *
   * MUI Autocomplete generates dynamic IDs (id^="mui-"), so we locate
   * by that prefix pattern. The dropdown requires keyboard interaction
   * to properly trigger React's onChange.
   */
  private async fillCityAutocomplete(city: string): Promise<void> {
    if (!this.page) return

    console.log(`${LOG_PREFIX} Filling city autocomplete: ${city}`)

    try {
      // Find the city input (MUI Autocomplete generates dynamic IDs)
      const cityInput = this.page.locator('input[id^="mui-"]').first()
      await cityInput.waitFor({ state: 'visible', timeout: 5000 })

      // Clear and type the city name
      await cityInput.click()
      await cityInput.fill('') // Clear first
      await cityInput.fill(city) // Type the city name

      // Wait for autocomplete dropdown to populate
      await this.page.waitForTimeout(1500)

      // Select first option from dropdown
      await this.page.keyboard.press('ArrowDown')
      await this.page.waitForTimeout(300)

      // Confirm selection
      await this.page.keyboard.press('Enter')
      await this.page.waitForTimeout(500)

      console.log(`${LOG_PREFIX} City autocomplete filled: ${city}`)
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to fill city autocomplete:`, err)
    }
  }

  /**
   * Enable COD (recaudo contraentrega) and set the amount.
   * Looks for the recaudo toggle/checkbox and the amount field.
   */
  private async enableCOD(amount: number): Promise<void> {
    if (!this.page) return

    console.log(`${LOG_PREFIX} Enabling COD with amount: ${amount}`)

    try {
      // Look for the recaudo checkbox/toggle
      // The portal may use a checkbox, switch, or select for COD
      const codCheckbox = this.page.locator(
        'input[name="recaudo_contraentrega"], input[name="es_recaudo"], input[type="checkbox"][name*="recaudo"]'
      ).first()

      const codCheckboxVisible = await codCheckbox.isVisible().catch(() => false)

      if (codCheckboxVisible) {
        const isChecked = await codCheckbox.isChecked().catch(() => false)
        if (!isChecked) {
          await codCheckbox.click()
          await this.page.waitForTimeout(500) // Wait for COD fields to appear
        }
      } else {
        // Fallback: Try clicking a label or button that toggles COD
        const codToggle = this.page.locator(
          'label:has-text("recaudo"), label:has-text("contraentrega"), label:has-text("COD")'
        ).first()
        const toggleVisible = await codToggle.isVisible().catch(() => false)
        if (toggleVisible) {
          await codToggle.click()
          await this.page.waitForTimeout(500)
        }
      }

      // Set the COD amount
      await this.fillField('valor_recaudo', String(amount))
      console.log(`${LOG_PREFIX} COD enabled with amount: ${amount}`)
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to enable COD:`, err)
    }
  }

  // ---------------------------------------------------------------------------
  // SweetAlert2 Result Detection
  // ---------------------------------------------------------------------------

  /**
   * Detect the SweetAlert2 success or error modal after form submission.
   * The portal uses SweetAlert2 for all server-side validation feedback.
   *
   * Returns GuiaResult with:
   *   - success: true + numeroPedido on success
   *   - success: false + error message on failure
   */
  private async detectSweetAlertResult(): Promise<GuiaResult> {
    if (!this.page) {
      return { success: false, error: 'Browser not initialized' }
    }

    console.log(`${LOG_PREFIX} Waiting for SweetAlert2 result`)

    try {
      // Wait for either success or error SweetAlert2 modal (up to 10 seconds)
      await this.page.waitForSelector('.swal2-popup', { timeout: 10000 })

      // Check for success modal
      const isSuccess = await this.page.locator('.swal2-success').isVisible().catch(() => false)

      if (isSuccess) {
        // Extract pedido number from the success modal text
        const modalText = await this.page
          .locator('.swal2-html-container, .swal2-content')
          .first()
          .textContent()
          .catch(() => null)

        // Close the modal
        await this.page.locator('.swal2-confirm').click().catch(() => {})
        await this.page.waitForTimeout(500)

        // Parse pedido number from modal text
        // Typical success text contains the number, e.g., "Pedido 123456 creado exitosamente"
        const numeroPedido = this.extractPedidoNumber(modalText)

        console.log(`${LOG_PREFIX} SUCCESS -- numeroPedido: ${numeroPedido || 'unknown'}`)
        return {
          success: true,
          numeroPedido: numeroPedido || undefined,
        }
      }

      // Check for error modal
      const isError = await this.page.locator('.swal2-error').isVisible().catch(() => false)

      if (isError) {
        const errorText = await this.page
          .locator('.swal2-html-container, .swal2-content')
          .first()
          .textContent()
          .catch(() => 'Error desconocido del portal')

        // Close the modal
        await this.page.locator('.swal2-confirm').click().catch(() => {})
        await this.page.waitForTimeout(500)

        console.error(`${LOG_PREFIX} PORTAL ERROR: ${errorText}`)
        return { success: false, error: errorText || 'Error desconocido del portal' }
      }

      // Neither success nor error icon detected -- try reading any popup text
      const popupText = await this.page
        .locator('.swal2-html-container, .swal2-content, .swal2-title')
        .first()
        .textContent()
        .catch(() => null)

      // Close the modal
      await this.page.locator('.swal2-confirm').click().catch(() => {})
      await this.page.waitForTimeout(500)

      // Try to determine if it was a success by looking for pedido number in the text
      const possibleNumber = this.extractPedidoNumber(popupText)
      if (possibleNumber) {
        console.log(`${LOG_PREFIX} Possible success -- numeroPedido: ${possibleNumber}`)
        return { success: true, numeroPedido: possibleNumber }
      }

      console.error(`${LOG_PREFIX} Unknown SweetAlert result: ${popupText}`)
      return { success: false, error: popupText || 'Respuesta desconocida del portal' }
    } catch {
      // SweetAlert2 modal didn't appear within timeout
      console.error(`${LOG_PREFIX} Timeout waiting for SweetAlert2 response`)
      await this.takeScreenshot('swal-timeout')
      return { success: false, error: 'Timeout esperando respuesta del portal' }
    }
  }

  /**
   * Extract pedido number from SweetAlert2 modal text.
   * Looks for numeric sequences that could be the pedido/tracking number.
   */
  private extractPedidoNumber(text: string | null): string | null {
    if (!text) return null

    // Look for patterns like "Pedido 123456", "No. 123456", or standalone numbers
    const patterns = [
      /[Pp]edido\s*[#:]?\s*(\d+)/,
      /[Nn]o\.?\s*(\d+)/,
      /[Nn][uú]mero\s*[#:]?\s*(\d+)/,
      /(\d{5,})/,  // Fallback: any number with 5+ digits
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match?.[1]) {
        return match[1]
      }
    }

    return null
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
