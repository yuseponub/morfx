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
  private lastPedidoNumber: number | null = null

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
      await this.page.goto('https://ff.coordinadora.com/', {
        waitUntil: 'networkidle',
        timeout: 30000,
      })

      // Wait for page to fully render
      await this.page.waitForTimeout(2000)

      // Check if already logged in (cookies loaded a valid session)
      if (this.page.url().includes('/panel')) {
        console.log(`${LOG_PREFIX} Already logged in (session cookies valid)`)
        return true
      }

      // Wait for login form fields to be visible before filling
      console.log(`${LOG_PREFIX} Waiting for login form fields`)
      await this.page.waitForSelector('input[name="usuario"]', { state: 'visible', timeout: 10000 })
      await this.page.waitForSelector('input[name="clave"]', { state: 'visible', timeout: 10000 })

      // Fill login form with exact selectors from working robot
      console.log(`${LOG_PREFIX} Filling login form`)
      await this.page.fill('input[name="usuario"]', '')
      await this.page.fill('input[name="usuario"]', this.credentials.username)
      await this.page.waitForTimeout(500)
      await this.page.fill('input[name="clave"]', '')
      await this.page.fill('input[name="clave"]', this.credentials.password)
      await this.page.waitForTimeout(500)

      // Screenshot before clicking for debugging
      await this.takeScreenshot('login-before-click')

      // Click login button (exact selector from working robot)
      console.log(`${LOG_PREFIX} Clicking Ingresar button`)
      await this.page.click('button:has-text("Ingresar")')

      // Wait for navigation (old robot waits 5 seconds)
      await this.page.waitForTimeout(5000)

      // Verify login succeeded
      const currentUrl = this.page.url()
      console.log(`${LOG_PREFIX} URL after login attempt: ${currentUrl}`)
      if (currentUrl.includes('/panel')) {
        console.log(`${LOG_PREFIX} Login successful`)
        await this.saveCookies()
        return true
      }

      // Take screenshot showing current state after failed login
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

    // Wait for the form to be ready (matching old robot: 3 seconds)
    await this.page.waitForTimeout(3000)

    // Verify key field is visible
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
      // --- Get pedido number (auto-increment from portal) ---
      if (this.lastPedidoNumber === null) {
        this.lastPedidoNumber = await this.getLastPedidoNumber()
      }
      const newPedidoNumber = this.lastPedidoNumber + 1
      console.log(`${LOG_PREFIX} Using pedido number: ${newPedidoNumber}`)

      // Navigate to a clean form
      await this.navigateToForm()

      // --- Personal data fields (exact selectors from working robot) ---
      // identificacion is type="number" — use celular as fallback when not numeric
      const identificacion = /^\d+$/.test(pedido.identificacion)
        ? pedido.identificacion
        : pedido.celular.replace(/\D/g, '').slice(-10)
      await this.fillField('identificacion_destinatario', identificacion)
      await this.fillField('nombres_destinatario', pedido.nombres)
      await this.fillField('apellidos_destinatario', pedido.apellidos)
      await this.fillField('direccion_destinatario', pedido.direccion)
      await this.fillField('telefono_celular_destinatario', pedido.celular)
      await this.fillField('email_destinatario', pedido.email)

      // --- City field (MUI Autocomplete -- CRITICAL PATTERN) ---
      await this.fillCityAutocomplete(pedido.ciudad)

      // --- Shipment data fields ---
      await this.fillField('numero_pedido', String(newPedidoNumber))
      await this.fillField('referencia', pedido.referencia)
      await this.fillField('unidades', String(pedido.unidades))
      await this.fillField('total_iva', '0')
      await this.fillField('total_coniva', String(pedido.totalConIva))
      await this.fillField('valor_declarado', String(pedido.valorDeclarado))
      await this.fillField('peso', String(pedido.peso))
      await this.fillField('alto', String(pedido.alto))
      await this.fillField('largo', String(pedido.largo))
      await this.fillField('ancho', String(pedido.ancho))

      // --- COD (recaudo contraentrega) via radio buttons ---
      await this.handleRecaudo(pedido.esRecaudoContraentrega)

      // Wait before submit (matching old robot timing)
      await this.page.waitForTimeout(1000)

      // Screenshot before submit for debugging
      await this.takeScreenshot('before-submit')

      // Check for any visible validation errors before submitting
      const errorTexts = await this.page.locator('.MuiFormHelperText-root.Mui-error, .error-message, [class*="error"]').allTextContents().catch(() => [])
      if (errorTexts.length > 0) {
        console.error(`${LOG_PREFIX} Form validation errors visible: ${errorTexts.join(', ')}`)
      }

      // --- Submit the form (exact selector from working robot) ---
      console.log(`${LOG_PREFIX} Submitting form`)
      const submitBtn = this.page.locator('button[type="submit"]:has-text("Enviar Pedido"), button:has-text("ENVIAR PEDIDO")')
      const submitCount = await submitBtn.count()
      console.log(`${LOG_PREFIX} Submit button matches: ${submitCount}`)
      await submitBtn.first().click()

      // Screenshot right after clicking submit
      await this.page.waitForTimeout(2000)
      await this.takeScreenshot('after-submit-2s')

      // Log page state after submit for debugging
      const pageUrl = this.page.url()
      console.log(`${LOG_PREFIX} Page URL after submit: ${pageUrl}`)

      // Check for any visible modals, alerts, or error messages
      const swalVisible = await this.page.locator('.swal2-popup, .swal-modal, [class*="swal"]').count().catch(() => 0)
      const muiDialogVisible = await this.page.locator('.MuiDialog-root, .MuiModal-root').count().catch(() => 0)
      const alertVisible = await this.page.locator('[role="alert"], .alert, .MuiAlert-root').count().catch(() => 0)
      console.log(`${LOG_PREFIX} After submit: swal=${swalVisible}, muiDialog=${muiDialogVisible}, alerts=${alertVisible}`)

      // Check if any helper text errors appeared after submit
      const postSubmitErrors = await this.page.locator('.MuiFormHelperText-root.Mui-error, .Mui-error').allTextContents().catch(() => [])
      if (postSubmitErrors.length > 0) {
        console.error(`${LOG_PREFIX} Post-submit validation errors: ${postSubmitErrors.join(' | ')}`)
      }

      // Wait more for portal response
      await this.page.waitForTimeout(5000)
      await this.takeScreenshot('after-submit-7s')

      // Check again for swal
      const swalVisibleLate = await this.page.locator('.swal2-popup, .swal-modal, [class*="swal"]').count().catch(() => 0)
      console.log(`${LOG_PREFIX} Late swal check: ${swalVisibleLate}`)

      // Detect SweetAlert2 result
      const swalResult = await this.detectSweetAlertResult()

      // On success, update the pedido counter and save to file
      if (swalResult.success) {
        this.lastPedidoNumber = newPedidoNumber
        this.saveLastPedido(newPedidoNumber)
        // Store the pedido number in the result if not already there
        if (!swalResult.numeroPedido) {
          swalResult.numeroPedido = String(newPedidoNumber)
        }
      }

      return swalResult
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`${LOG_PREFIX} createGuia error:`, err)
      await this.takeScreenshot('createGuia-error')
      return { success: false, error: message }
    }
  }

  // ---------------------------------------------------------------------------
  // Guide Lookup (Phase 26)
  // ---------------------------------------------------------------------------

  /**
   * Navigate to the Coordinadora pedidos page and read the pedido->guide table.
   * Returns a Map of pedidoNumber -> guideNumber.
   * Loads the page once and reads all rows (batch optimized).
   */
  async buscarGuiasPorPedidos(pedidoNumbers: string[]): Promise<Map<string, string>> {
    if (!this.page) {
      throw new Error(`${LOG_PREFIX} Cannot buscar guias: browser not initialized`)
    }

    console.log(`${LOG_PREFIX} Looking up guides for ${pedidoNumbers.length} pedidos`)

    const guiaMap = new Map<string, string>()

    try {
      // Navigate to the pedidos list page
      await this.page.goto('https://ff.coordinadora.com/panel/pedidos', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })

      // Wait for the table to render
      await this.page.waitForSelector('table tbody tr', {
        state: 'visible',
        timeout: 15000,
      })

      // Brief pause for full table population
      await this.page.waitForTimeout(2000)

      // Read all table rows
      const rows = await this.page.locator('table tbody tr').all()
      console.log(`${LOG_PREFIX} Found ${rows.length} rows in pedidos table`)

      // Build a Set of pedido numbers we're looking for (normalized)
      const targetPedidos = new Set(pedidoNumbers.map(p => p.trim()))

      for (const row of rows) {
        const cells = await row.locator('td').all()
        if (cells.length < 2) continue

        // Column 0 = pedido number, Column 1 = guide number
        const pedidoText = (await cells[0].textContent())?.trim() || ''
        const guiaText = (await cells[1].textContent())?.trim() || ''

        if (!pedidoText) continue

        // Check if this pedido is one we're looking for
        if (targetPedidos.has(pedidoText) && guiaText && guiaText !== '-' && guiaText !== 'N/A') {
          guiaMap.set(pedidoText, guiaText)
        }
      }

      console.log(`${LOG_PREFIX} Found guides for ${guiaMap.size}/${pedidoNumbers.length} pedidos`)
      return guiaMap
    } catch (err) {
      console.error(`${LOG_PREFIX} Error reading pedidos table:`, err)
      await this.takeScreenshot('buscar-guias-error')
      throw err
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
   * Handle recaudo (COD) via radio buttons.
   * Portal uses: pago_contra_entrega S/N + flete_contra_entrega S/N
   * Flete is always N.
   */
  private async handleRecaudo(esRecaudo: boolean): Promise<void> {
    if (!this.page) return

    console.log(`${LOG_PREFIX} Setting recaudo: ${esRecaudo ? 'SI' : 'NO'}`)

    try {
      // Pago contra entrega radio button
      const pagoValue = esRecaudo ? 'S' : 'N'
      const pagoRadio = this.page.locator(`input[name="pago_contra_entrega"][value="${pagoValue}"]`)
      const pagoChecked = await pagoRadio.isChecked().catch(() => false)
      if (!pagoChecked) {
        await pagoRadio.click({ timeout: 5000 })
        console.log(`${LOG_PREFIX} Clicked pago_contra_entrega=${pagoValue}`)
      } else {
        console.log(`${LOG_PREFIX} pago_contra_entrega=${pagoValue} already checked`)
      }
      await this.page.waitForTimeout(500)

      // Flete contra entrega: always NO (may be auto-checked + disabled)
      const fleteRadio = this.page.locator('input[name="flete_contra_entrega"][value="N"]')
      const fleteChecked = await fleteRadio.isChecked().catch(() => false)
      const fleteDisabled = await fleteRadio.isDisabled().catch(() => false)
      if (!fleteChecked && !fleteDisabled) {
        await fleteRadio.click({ timeout: 5000 })
        console.log(`${LOG_PREFIX} Clicked flete_contra_entrega=N`)
      } else {
        console.log(`${LOG_PREFIX} flete_contra_entrega=N already set (checked=${fleteChecked}, disabled=${fleteDisabled})`)
      }
      await this.page.waitForTimeout(300)

      console.log(`${LOG_PREFIX} Recaudo set: pago=${pagoValue}, flete=N`)
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to set recaudo:`, err)
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
  // Pedido Number Management
  // ---------------------------------------------------------------------------

  /**
   * Get the last pedido number by reading the Coordinadora pedidos table.
   * Navigates to /panel/pedidos, reads MuiDataGrid links, finds the max.
   * Falls back to file-based tracking if the table read fails.
   */
  async getLastPedidoNumber(): Promise<number> {
    if (!this.page) {
      return this.getLastKnownPedido()
    }

    console.log(`${LOG_PREFIX} Getting last pedido number from portal`)

    try {
      // Navigate to the pedidos page
      await this.page.goto('https://ff.coordinadora.com/panel/pedidos', {
        waitUntil: 'networkidle',
        timeout: 30000,
      })

      // Wait for MuiDataGrid to appear
      await this.page.waitForSelector('.MuiDataGrid-root', { timeout: 10000 })
      await this.page.waitForTimeout(2000)

      // Read all links in DataGrid cells (pedido numbers are links)
      const links = await this.page.$$('.MuiDataGrid-cell a')

      let maxNumber = 0

      // Check first 20 links for pedido numbers
      for (const link of links.slice(0, 20)) {
        const text = await link.textContent()
        const num = parseInt(text?.trim() || '', 10)
        if (!isNaN(num) && num > maxNumber && num > 1000) {
          maxNumber = num
        }
      }

      if (maxNumber > 0) {
        console.log(`${LOG_PREFIX} Last pedido number from portal: ${maxNumber}`)
        return maxNumber
      }

      // Fallback to file
      console.log(`${LOG_PREFIX} No pedido numbers found in portal, using file fallback`)
      return this.getLastKnownPedido()
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to read pedido numbers from portal:`, err)
      return this.getLastKnownPedido()
    }
  }

  /**
   * Read last known pedido number from file (fallback).
   */
  private getLastKnownPedido(): number {
    const filePath = path.join(process.cwd(), 'storage', '.ultimo-pedido.txt')
    try {
      if (fs.existsSync(filePath)) {
        const num = parseInt(fs.readFileSync(filePath, 'utf-8').trim(), 10)
        if (!isNaN(num) && num > 1000) {
          console.log(`${LOG_PREFIX} Last known pedido from file: ${num}`)
          return num
        }
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to read .ultimo-pedido.txt:`, err)
    }
    // Default fallback
    console.log(`${LOG_PREFIX} Using default fallback pedido number: 9640`)
    return 9640
  }

  /**
   * Save last pedido number to file for persistence across restarts.
   */
  private saveLastPedido(num: number): void {
    const filePath = path.join(process.cwd(), 'storage', '.ultimo-pedido.txt')
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, String(num))
      console.log(`${LOG_PREFIX} Saved last pedido number: ${num}`)
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to save .ultimo-pedido.txt:`, err)
    }
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
