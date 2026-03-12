import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import type { Credentials, Appointment, ConfirmAppointmentResponse } from '../types/index.js'

const STORAGE_DIR = path.resolve('storage')
const SESSIONS_DIR = path.join(STORAGE_DIR, 'sessions')
const ARTIFACTS_DIR = path.join(STORAGE_DIR, 'artifacts')

const BASE_URL = 'https://godentist.dentos.co'
const APPOINTMENTS_URL = `${BASE_URL}/citas/index/listcitassimple`

interface Sucursal {
  value: string
  label: string
}

export class GoDentistAdapter {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private credentials: Credentials
  private workspaceId: string

  constructor(credentials: Credentials, workspaceId: string) {
    this.credentials = credentials
    this.workspaceId = workspaceId
  }

  // ── Lifecycle ──

  async init(): Promise<void> {
    console.log('[GoDentist] Launching browser...')
    this.browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
    })
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
    })
    this.page = await this.context.newPage()
    await this.loadCookies()
    console.log('[GoDentist] Browser ready')
  }

  async close(): Promise<void> {
    try {
      // Clear cookies before closing to avoid stale session on next run
      if (this.context) {
        await this.context.clearCookies().catch(() => {})
      }
      // Delete saved cookies file
      const cookiesPath = path.join(SESSIONS_DIR, `${this.workspaceId}-cookies.json`)
      if (fs.existsSync(cookiesPath)) {
        fs.unlinkSync(cookiesPath)
      }
      if (this.page) await this.page.close().catch(() => {})
      if (this.context) await this.context.close().catch(() => {})
      if (this.browser) await this.browser.close().catch(() => {})
    } catch (err) {
      console.error('[GoDentist] Error closing browser:', err)
    }
    this.page = null
    this.context = null
    this.browser = null
    console.log('[GoDentist] Browser closed')
  }

  // ── Login ──

  async login(): Promise<boolean> {
    if (!this.page) throw new Error('Browser not initialized')

    console.log('[GoDentist] Navigating to login...')
    await this.page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await this.page.waitForTimeout(2000)

    const currentUrl = this.page.url()
    if (currentUrl.includes('/dashboard') || currentUrl.includes('/inicio') || currentUrl.includes('/citas')) {
      console.log('[GoDentist] Already logged in')
      await this.saveCookies()
      return true
    }

    await this.takeScreenshot('login-page')

    try {
      await this.page.waitForSelector('#login-form, input.username, input[type="text"]', { timeout: 10000 })

      const usernameField = await this.page.$('input.username')
        || await this.page.$('#login-form input[type="text"]')
        || await this.page.$('input[type="text"]')

      const passwordField = await this.page.$('input.password')
        || await this.page.$('#login-form input[type="password"]')
        || await this.page.$('input[type="password"]')

      if (!usernameField || !passwordField) {
        console.error('[GoDentist] Could not find login form fields')
        await this.takeScreenshot('login-fields-missing')
        return false
      }

      await usernameField.click()
      await usernameField.fill(this.credentials.username)
      await passwordField.click()
      await passwordField.fill(this.credentials.password)

      // Select first sucursal (required by login validation)
      const sucursalSelect = await this.page.$('#login-form select') || await this.page.$('select')
      if (sucursalSelect) {
        const options = await sucursalSelect.$$('option')
        for (const opt of options) {
          const val = await opt.getAttribute('value')
          const text = (await opt.textContent())?.trim() || ''
          if (val && val !== '' && val !== '0' && !text.toLowerCase().includes('seleccione')) {
            await sucursalSelect.selectOption(val)
            console.log(`[GoDentist] Login sucursal: ${text}`)
            break
          }
        }
      }

      const submitBtn = await this.page.$('#login-form button[type="submit"]')
        || await this.page.$('button[type="submit"]')
        || await this.page.$('input[type="submit"]')
        || await this.page.$('#login-form button')
        || await this.page.$('button:has-text("Ingresar")')

      if (submitBtn) {
        await submitBtn.click()
      } else {
        await passwordField.press('Enter')
      }

      await this.page.waitForTimeout(5000)
      await this.takeScreenshot('after-login')

      const postLoginUrl = this.page.url()
      const pageContent = await this.page.content()
      const success = postLoginUrl !== currentUrl
        || postLoginUrl.includes('/dashboard')
        || postLoginUrl.includes('/inicio')
        || postLoginUrl.includes('/citas')
        || !pageContent.includes('login-form')

      if (success) {
        console.log(`[GoDentist] Login OK — URL: ${postLoginUrl}`)
        await this.saveCookies()
        return true
      }

      console.error('[GoDentist] Login failed')
      await this.takeScreenshot('login-failed')
      return false
    } catch (err) {
      console.error('[GoDentist] Login error:', err)
      await this.takeScreenshot('login-error')
      return false
    }
  }

  // ── Scrape All Sucursales ──

  async scrapeAppointments(filterSucursales?: string[]): Promise<{ date: string; appointments: Appointment[]; errors: string[] }> {
    if (!this.page) throw new Error('Browser not initialized')

    const targetDate = this.getNextWorkingDay()
    const dateStr = this.formatDateDD_MM_YYYY(targetDate)
    const dateLabel = this.formatDateYYYY_MM_DD(targetDate)

    console.log(`[GoDentist] Target date: ${dateLabel} (${dateStr})`)
    if (filterSucursales?.length) {
      console.log(`[GoDentist] Filtering sucursales: ${filterSucursales.join(', ')}`)
    }

    const allAppointments: Appointment[] = []
    const errors: string[] = []

    // Navigate to appointments page
    await this.page.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await this.page.waitForTimeout(2000)

    // Step 1: Set date filter (DD-MM-YYYY format for ExtJS)
    await this.setDate(dateStr)

    // Step 2: Set hour to 6:00 am (earliest)
    await this.setHour('6:00 am')
    await this.takeScreenshot('after-set-hour')

    // Step 3: Discover sucursales from the ExtJS combo
    let sucursales = await this.discoverSucursales()
    console.log(`[GoDentist] Found ${sucursales.length} sucursales: ${sucursales.map(s => s.label).join(', ')}`)

    // Apply sucursal filter if provided
    if (filterSucursales?.length && sucursales.length > 0) {
      const filterSet = new Set(filterSucursales.map(s => s.toUpperCase()))
      sucursales = sucursales.filter(s => filterSet.has(s.label.toUpperCase()))
      console.log(`[GoDentist] After filter: ${sucursales.length} sucursales: ${sucursales.map(s => s.label).join(', ')}`)
    }

    if (sucursales.length === 0) {
      console.log('[GoDentist] No sucursales to scrape')
      errors.push('No se encontraron sucursales para scrappear')
      return { date: dateLabel, appointments: allAppointments, errors }
    }

    // Step 4: Iterate each sucursal
    for (const sucursal of sucursales) {
      try {
        console.log(`[GoDentist] ── Sucursal: ${sucursal.label} ──`)
        await this.selectSucursal(sucursal)
        await this.clickBuscar()
        await this.page.waitForTimeout(3000)
        await this.takeScreenshot(`citas-${sucursal.label.replace(/\s+/g, '-').toLowerCase()}`)

        const appointments = await this.extractAllPages(sucursal.label)
        allAppointments.push(...appointments)
        console.log(`[GoDentist] ${sucursal.label}: ${appointments.length} citas (todas las páginas)`)
      } catch (err) {
        const msg = `Error en ${sucursal.label}: ${err instanceof Error ? err.message : String(err)}`
        console.error(`[GoDentist] ${msg}`)
        errors.push(msg)
      }
    }

    return { date: dateLabel, appointments: allAppointments, errors }
  }

  // ── Confirm Appointment ──

  async confirmAppointment(patientName: string, date: string, sucursal: string): Promise<ConfirmAppointmentResponse> {
    if (!this.page) throw new Error('Browser not initialized')

    const screenshots: string[] = []
    const takeAndTrack = async (name: string) => {
      await this.takeScreenshot(name)
      screenshots.push(name)
    }

    try {
      // Navigate to appointments page
      console.log(`[GoDentist] confirmAppointment: navigating to appointments page`)
      await this.page.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
      await this.page.waitForTimeout(2000)

      // Set date filter
      await this.setDate(date)

      // Set hour to earliest so all appointments are visible
      await this.setHour('6:00 am')

      // Select sucursal
      const sucursalObj: Sucursal = { value: sucursal, label: sucursal }
      await this.selectSucursal(sucursalObj)

      // Click search
      await this.clickBuscar()
      await this.page.waitForTimeout(3000)
      await takeAndTrack('confirm-grid-loaded')

      // Search for patient across all pages
      const result = await this.findPatientRow(patientName, screenshots)
      if (!result) {
        await takeAndTrack('confirm-patient-not-found')
        return {
          success: false,
          patientName,
          error: 'Paciente no encontrado en la tabla',
          screenshots,
        }
      }

      const { rowIndex, estadoText, estadoCellIndex } = result
      console.log(`[GoDentist] Found patient "${patientName}" at row ${rowIndex}, estado="${estadoText}", cell index=${estadoCellIndex}`)
      await takeAndTrack('confirm-row-found')

      // If already confirmed, no action needed
      if (estadoText.toLowerCase().includes('confirmada')) {
        console.log(`[GoDentist] Patient already confirmed`)
        return {
          success: true,
          patientName,
          previousEstado: estadoText,
          newEstado: estadoText,
          screenshots,
        }
      }

      // Try to change estado
      const changed = await this.tryChangeEstado(rowIndex, estadoCellIndex, screenshots)
      if (changed) {
        await takeAndTrack('confirm-success')
        return {
          success: true,
          patientName,
          previousEstado: estadoText,
          newEstado: 'Confirmada',
          screenshots,
        }
      }

      await takeAndTrack('confirm-estado-change-failed')
      return {
        success: false,
        patientName,
        previousEstado: estadoText,
        error: 'No se pudo encontrar mecanismo para cambiar estado',
        screenshots,
      }
    } catch (err) {
      console.error('[GoDentist] confirmAppointment error:', err)
      await takeAndTrack('confirm-error')
      return {
        success: false,
        patientName,
        error: err instanceof Error ? err.message : String(err),
        screenshots,
      }
    }
  }

  /**
   * Search all pages for a patient row by name.
   * Returns row index, estado text, and estado cell index, or null if not found.
   */
  private async findPatientRow(
    patientName: string,
    screenshots: string[]
  ): Promise<{ rowIndex: number; estadoText: string; estadoCellIndex: number } | null> {
    if (!this.page) return null

    const estadoKeywords = ['confirmada', 'cancelada', 'pendiente', 'no asistió', 'asistió', 'atendido', 'en espera', 'sin confirmar']
    const totalPages = await this.getTotalPages()
    const pagesToCheck = totalPages > 0 ? totalPages : 1

    for (let pageNum = 1; pageNum <= pagesToCheck; pageNum++) {
      console.log(`[GoDentist] Searching page ${pageNum}/${pagesToCheck} for "${patientName}"`)

      try {
        await this.page.waitForSelector('table', { timeout: 10000 })
      } catch {
        console.log('[GoDentist] No table found on page')
        break
      }

      const rows = this.page.locator('table tbody tr')
      const rowCount = await rows.count()

      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i)
        const cells = await row.locator('td').allTextContents()
        const rawCells = cells.map(c => c.trim())

        // Check if any cell matches the patient name (case-insensitive)
        const nameMatch = rawCells.some(cell =>
          cell.toLowerCase().includes(patientName.toLowerCase()) ||
          patientName.toLowerCase().includes(cell.toLowerCase()) && cell.length > 3
        )

        if (!nameMatch) continue

        // Find estado cell index
        let estadoText = ''
        let estadoCellIndex = -1
        for (let j = 0; j < rawCells.length; j++) {
          if (rawCells[j] && estadoKeywords.some(k => rawCells[j].toLowerCase().includes(k))) {
            estadoText = rawCells[j]
            estadoCellIndex = j
            break
          }
        }

        return { rowIndex: i, estadoText, estadoCellIndex }
      }

      // If not last page, go to next
      if (pageNum < pagesToCheck) {
        await this.clickNextPage()
        await this.page.waitForTimeout(2000)
      }
    }

    return null
  }

  /**
   * Try multiple strategies to change the Estado cell to "Confirmada".
   * Takes diagnostic screenshots at each step.
   */
  private async tryChangeEstado(
    rowIndex: number,
    estadoCellIndex: number,
    screenshots: string[]
  ): Promise<boolean> {
    if (!this.page) return false

    const takeAndTrack = async (name: string) => {
      await this.takeScreenshot(name)
      screenshots.push(name)
    }

    const row = this.page.locator('table tbody tr').nth(rowIndex)
    const estadoCell = row.locator('td').nth(estadoCellIndex)

    // Strategy 1: Click on the estado cell text
    console.log('[GoDentist] Strategy 1: Click estado cell')
    try {
      await estadoCell.click()
      await this.page.waitForTimeout(1500)
      await takeAndTrack('confirm-after-estado-click')

      if (await this.checkAndSelectConfirmada()) {
        return true
      }
    } catch (err) {
      console.log(`[GoDentist] Strategy 1 failed: ${err}`)
    }

    // Strategy 2: Look for dropdown trigger within/near the estado cell
    console.log('[GoDentist] Strategy 2: Look for dropdown trigger near estado cell')
    try {
      const trigger = estadoCell.locator('.x-form-trigger, img, .x-grid3-col-estado img')
      const triggerCount = await trigger.count()
      if (triggerCount > 0) {
        await trigger.first().click()
        await this.page.waitForTimeout(1500)
        await takeAndTrack('confirm-after-trigger-click')

        if (await this.checkAndSelectConfirmada()) {
          return true
        }
      } else {
        console.log('[GoDentist] No trigger found in estado cell')
      }
    } catch (err) {
      console.log(`[GoDentist] Strategy 2 failed: ${err}`)
    }

    // Strategy 3: Look for edit icon/button in the row
    console.log('[GoDentist] Strategy 3: Look for edit button in row')
    try {
      const editBtn = row.locator('button, a, .x-btn, [class*="edit"], [class*="pencil"], img[src*="edit"]')
      const editCount = await editBtn.count()
      if (editCount > 0) {
        for (let k = 0; k < editCount; k++) {
          console.log(`[GoDentist] Trying edit element ${k}`)
          await editBtn.nth(k).click()
          await this.page.waitForTimeout(1500)
          await takeAndTrack(`confirm-after-edit-click-${k}`)

          if (await this.checkAndSelectConfirmada()) {
            return true
          }

          // Escape any opened dialog/editor
          await this.page.keyboard.press('Escape')
          await this.page.waitForTimeout(500)
        }
      } else {
        console.log('[GoDentist] No edit elements found in row')
      }
    } catch (err) {
      console.log(`[GoDentist] Strategy 3 failed: ${err}`)
    }

    // Strategy 4: Double-click on the estado cell (ExtJS RowEditor pattern)
    console.log('[GoDentist] Strategy 4: Double-click estado cell')
    try {
      await estadoCell.dblclick()
      await this.page.waitForTimeout(1500)
      await takeAndTrack('confirm-after-dblclick')

      if (await this.checkAndSelectConfirmada()) {
        return true
      }

      // Check if a row editor appeared with form fields
      const editors = this.page.locator('.x-grid-editor input, .x-editor input, .x-form-field:visible')
      const editorCount = await editors.count()
      if (editorCount > 0) {
        console.log(`[GoDentist] Found ${editorCount} editor fields after double-click`)
        await takeAndTrack('confirm-editor-fields')
      }

      await this.page.keyboard.press('Escape')
      await this.page.waitForTimeout(500)
    } catch (err) {
      console.log(`[GoDentist] Strategy 4 failed: ${err}`)
    }

    // Strategy 5: Right-click context menu
    console.log('[GoDentist] Strategy 5: Right-click for context menu')
    try {
      await estadoCell.click({ button: 'right' })
      await this.page.waitForTimeout(1500)
      await takeAndTrack('confirm-after-rightclick')

      // Check for context menu with "Confirmada" option
      const menuItem = this.page.locator('.x-menu-item:visible, .x-menu-list-item:visible')
      const menuCount = await menuItem.count()
      if (menuCount > 0) {
        console.log(`[GoDentist] Context menu has ${menuCount} items`)
        const menuTexts = await menuItem.allTextContents()
        console.log(`[GoDentist] Menu items: ${JSON.stringify(menuTexts)}`)

        for (let m = 0; m < menuCount; m++) {
          const text = (await menuItem.nth(m).textContent())?.trim().toLowerCase() || ''
          if (text.includes('confirmada') || text.includes('confirmar')) {
            await menuItem.nth(m).click()
            await this.page.waitForTimeout(1500)
            await takeAndTrack('confirm-after-menu-select')
            return true
          }
        }
      }

      await this.page.keyboard.press('Escape')
      await this.page.waitForTimeout(500)
    } catch (err) {
      console.log(`[GoDentist] Strategy 5 failed: ${err}`)
    }

    // Strategy 6: Look for any combo/select visible on the page after clicking the row
    console.log('[GoDentist] Strategy 6: Click row then look for any visible combo')
    try {
      await row.click()
      await this.page.waitForTimeout(1000)

      // Check for any action buttons that appeared
      const actionBtns = this.page.locator('button:visible:has-text("Confirmar"), a:visible:has-text("Confirmar"), .x-btn:visible:has-text("Confirmar")')
      const actionCount = await actionBtns.count()
      if (actionCount > 0) {
        await actionBtns.first().click()
        await this.page.waitForTimeout(1500)
        await takeAndTrack('confirm-after-confirmar-btn')
        return true
      }
    } catch (err) {
      console.log(`[GoDentist] Strategy 6 failed: ${err}`)
    }

    // Log full DOM state of the row for debugging
    try {
      const rowHTML = await row.evaluate(el => el.innerHTML)
      console.log(`[GoDentist] Row HTML for debugging: ${rowHTML.substring(0, 2000)}`)
    } catch {
      // ignore
    }

    return false
  }

  /**
   * Check if a dropdown/combo or modal dialog appeared where we can select "Confirmada".
   * The Dentos portal opens a modal with a "Estado" combo + "Guardar" button.
   */
  private async checkAndSelectConfirmada(): Promise<boolean> {
    if (!this.page) return false

    // Pattern A: Modal dialog with Estado combo + Guardar button
    // The modal has a select/combo labeled "Estado:" and a "Guardar" button
    console.log('[GoDentist] Checking for modal dialog with Estado combo...')
    try {
      // Dump all visible form elements for debugging
      const formDiag = await this.page.evaluate(() => {
        const result: Record<string, unknown> = {}
        // All visible selects
        const selects = document.querySelectorAll('select')
        result.selects = Array.from(selects).map((s, i) => ({
          i,
          id: s.id,
          name: s.name,
          visible: s.offsetParent !== null,
          options: Array.from(s.options).map(o => o.text.trim()),
          value: s.value,
        }))
        // All visible buttons
        const buttons = document.querySelectorAll('button, input[type="button"]')
        result.buttons = Array.from(buttons).map(b => ({
          tag: b.tagName,
          text: (b as HTMLElement).textContent?.trim().substring(0, 30),
          value: (b as HTMLInputElement).value?.substring(0, 30),
          visible: (b as HTMLElement).offsetParent !== null,
        }))
        // Any window/dialog
        const windows = document.querySelectorAll('.x-window:visible, .x-window, [class*="modal"], [class*="dialog"]')
        result.windows = Array.from(windows).map(w => ({
          className: w.className.substring(0, 100),
          visible: (w as HTMLElement).offsetParent !== null,
          html: w.innerHTML.substring(0, 500),
        }))
        return result
      })
      console.log(`[GoDentist] Form diagnostics:`, JSON.stringify(formDiag, null, 2))

      // Look for a visible modal/window with "Guardar" button
      const guardarBtn = this.page.locator('button:visible:has-text("Guardar"), input[type="button"]:visible[value="Guardar"]')
      const guardarCount = await guardarBtn.count()

      if (guardarCount > 0) {
        console.log(`[GoDentist] Found "Guardar" button — modal dialog detected`)

        // Find the Estado select/combo in the modal
        // Try native <select> first
        const selects = this.page.locator('select:visible')
        const selectCount = await selects.count()
        console.log(`[GoDentist] Modal has ${selectCount} visible select elements`)

        for (let i = 0; i < selectCount; i++) {
          const options = await selects.nth(i).locator('option').allTextContents()
          console.log(`[GoDentist] Select ${i} options: ${JSON.stringify(options)}`)

          // Find the select that has estado-related options
          const hasConfirmada = options.some(o => o.trim().toLowerCase().includes('confirmada'))
          const hasSinConfirmar = options.some(o => o.trim().toLowerCase().includes('sin confirmar'))

          if (hasConfirmada || hasSinConfirmar) {
            // Find the "Confirmada" option text (exact label for selectOption)
            const confirmadaLabel = options.find(o => o.trim().toLowerCase() === 'confirmada')
              || options.find(o => o.trim().toLowerCase().includes('confirmada'))

            if (confirmadaLabel) {
              await selects.nth(i).selectOption({ label: confirmadaLabel.trim() })
              console.log(`[GoDentist] Selected "${confirmadaLabel.trim()}" in Estado combo`)
              await this.page.waitForTimeout(500)

              // Click Guardar
              await guardarBtn.first().click()
              console.log('[GoDentist] Clicked "Guardar"')
              await this.page.waitForTimeout(2000)
              return true
            }
          }
        }

        // Try ExtJS combo (hidden input + visible text input + trigger)
        const comboTriggers = this.page.locator('.x-form-trigger:visible')
        const triggerCount = await comboTriggers.count()
        console.log(`[GoDentist] Modal has ${triggerCount} visible combo triggers`)

        for (let i = 0; i < triggerCount; i++) {
          await comboTriggers.nth(i).click()
          await this.page.waitForTimeout(1000)

          const comboItems = this.page.locator('.x-combo-list-item:visible')
          const itemCount = await comboItems.count()
          if (itemCount > 0) {
            const texts = await comboItems.allTextContents()
            console.log(`[GoDentist] Trigger ${i} dropdown: ${JSON.stringify(texts)}`)

            for (let j = 0; j < itemCount; j++) {
              const text = (await comboItems.nth(j).textContent())?.trim().toLowerCase() || ''
              if (text.includes('confirmada') && !text.includes('sin confirmar')) {
                await comboItems.nth(j).click()
                console.log('[GoDentist] Selected "Confirmada" from ExtJS combo in modal')
                await this.page.waitForTimeout(500)

                // Click Guardar
                await guardarBtn.first().click()
                console.log('[GoDentist] Clicked "Guardar"')
                await this.page.waitForTimeout(2000)
                return true
              }
            }
          }

          // Close dropdown if nothing matched
          await this.page.keyboard.press('Escape')
          await this.page.waitForTimeout(300)
        }
      }
    } catch (err) {
      console.log(`[GoDentist] Modal pattern check failed: ${err}`)
    }

    // Pattern B: Inline combo list items (original approach)
    const comboItems = this.page.locator('.x-combo-list-item:visible')
    const comboCount = await comboItems.count()
    if (comboCount > 0) {
      const texts = await comboItems.allTextContents()
      console.log(`[GoDentist] Inline combo dropdown: ${JSON.stringify(texts)}`)

      for (let i = 0; i < comboCount; i++) {
        const text = (await comboItems.nth(i).textContent())?.trim().toLowerCase() || ''
        if (text.includes('confirmada') && !text.includes('sin confirmar')) {
          await comboItems.nth(i).click()
          await this.page.waitForTimeout(1500)
          console.log('[GoDentist] Selected "Confirmada" from inline dropdown')
          return true
        }
      }
    }

    return false
  }

  // ── ExtJS Form Controls ──

  private async setDate(dateStr: string): Promise<void> {
    if (!this.page) return
    // #df_fecha is a text input with DD-MM-YYYY format
    const dateInput = this.page.locator('#df_fecha')
    await dateInput.click({ clickCount: 3 }) // select all
    await dateInput.fill(dateStr)
    await dateInput.press('Tab') // trigger ExtJS change event
    console.log(`[GoDentist] Date set: ${dateStr}`)
  }

  private async setHour(hour: string): Promise<void> {
    if (!this.page) return

    // Diagnose the #idhoras element and surrounding DOM
    const diagnosis = await this.page.evaluate(() => {
      const el = document.getElementById('idhoras')
      if (!el) return { found: false }

      const info: Record<string, unknown> = {
        found: true,
        tagName: el.tagName,
        type: (el as HTMLInputElement).type,
        value: (el as HTMLInputElement).value,
        className: el.className,
        parentHTML: el.parentElement?.innerHTML?.substring(0, 500),
      }

      // Look for ALL inputs near #idhoras
      let parent = el.parentElement
      const nearbyInputs: string[] = []
      for (let i = 0; i < 8 && parent; i++) {
        const inputs = parent.querySelectorAll('input')
        inputs.forEach(inp => {
          nearbyInputs.push(`${inp.tagName}#${inp.id} type=${inp.type} value="${inp.value}"`)
        })
        if (nearbyInputs.length > 1) break
        parent = parent.parentElement
      }
      info.nearbyInputs = nearbyInputs

      // Look for the Hora label and its associated input
      const labels = document.querySelectorAll('label')
      for (const label of labels) {
        if (label.textContent?.includes('Hora')) {
          const forId = label.getAttribute('for')
          info.horaLabelFor = forId
          info.horaLabelHTML = label.outerHTML
        }
      }

      return info
    })

    console.log(`[GoDentist] Hour diagnosis:`, JSON.stringify(diagnosis, null, 2))

    // Strategy: find the visible hour combo by looking for the trigger button near #idhoras
    const comboId = await this.page.evaluate(() => {
      const hidden = document.getElementById('idhoras')
      if (!hidden) return null
      // Walk up to find a .x-form-field-wrap that contains both hidden + visible
      let parent = hidden.parentElement
      for (let i = 0; i < 8 && parent; i++) {
        const textInputs = parent.querySelectorAll('input[type="text"]')
        for (const inp of textInputs) {
          if (inp.id && inp.id !== 'idhoras') {
            return inp.id
          }
        }
        parent = parent.parentElement
      }
      return null
    })

    console.log(`[GoDentist] Hour combo input ID: ${comboId}`)

    if (comboId) {
      const hourInput = this.page.locator(`#${comboId}`)

      // Open the dropdown via the trigger arrow
      const trigger = hourInput.locator('..').locator('.x-form-trigger')
      const triggerCount = await trigger.count()
      if (triggerCount > 0) {
        await trigger.click()
        await this.page.waitForTimeout(1000)

        // Log available options
        const options = await this.page.locator('.x-combo-list-item:visible').allTextContents()
        console.log(`[GoDentist] Hour dropdown options (${options.length}):`, options.slice(0, 10))

        // Find and click the earliest hour option
        if (options.length > 0) {
          await this.page.locator('.x-combo-list-item:visible').first().click()
          console.log(`[GoDentist] Hour selected: first option "${options[0]}"`)
        }
      } else {
        // No trigger, try typing
        await hourInput.click({ clickCount: 3 })
        await hourInput.fill(hour)
        await hourInput.press('Tab')
        console.log(`[GoDentist] Hour typed: ${hour}`)
      }
    } else {
      // Last resort: just set the hidden field directly and hope it works
      console.warn('[GoDentist] No visible hour combo found, setting hidden field directly')
      await this.page.evaluate((h) => {
        const hidden = document.getElementById('idhoras') as HTMLInputElement
        if (hidden) {
          hidden.value = h
          hidden.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, hour)
    }
  }

  /**
   * Find the sucursal combo by locating the hidden #idsucursalgrid field
   * and finding the nearby visible text input (the ExtJS combo).
   * ExtJS ext-comp-XXXX IDs are dynamic and change between sessions.
   */
  private async getSucursalComboInputId(): Promise<string | null> {
    if (!this.page) return null

    const comboId = await this.page.evaluate(() => {
      const hidden = document.getElementById('idsucursalgrid')
      if (!hidden) return null
      // Walk up to find the container that holds both the hidden + visible input
      let parent = hidden.parentElement
      for (let i = 0; i < 5 && parent; i++) {
        const textInputs = parent.querySelectorAll('input[type="text"]')
        for (const inp of textInputs) {
          if (inp.id && inp.id !== 'idsucursalgrid') {
            return inp.id
          }
        }
        parent = parent.parentElement
      }
      return null
    })

    console.log(`[GoDentist] Sucursal combo input ID: ${comboId}`)
    return comboId
  }

  private async openComboDropdown(inputId: string): Promise<void> {
    if (!this.page) return
    const trigger = this.page.locator(`#${inputId}`).locator('..').locator('.x-form-trigger')
    const triggerExists = await trigger.count()
    if (triggerExists > 0) {
      await trigger.click()
    } else {
      await this.page.locator(`#${inputId}`).click()
    }
    await this.page.waitForTimeout(1000)
  }

  private async discoverSucursales(): Promise<Sucursal[]> {
    if (!this.page) return []

    try {
      const comboId = await this.getSucursalComboInputId()
      if (!comboId) {
        console.error('[GoDentist] Could not find sucursal combo input via #idsucursalgrid')
        return []
      }

      await this.openComboDropdown(comboId)
      await this.takeScreenshot('sucursal-dropdown-open')

      // .x-combo-list-item is correct (confirmed from logs), but multiple
      // combo dropdowns exist in DOM (hora, sucursal, etc). Use :visible.
      const items = this.page.locator('.x-combo-list-item:visible')
      const count = await items.count()
      console.log(`[GoDentist] Visible dropdown items: ${count}`)

      if (count === 0) {
        // Debug: log all items including hidden
        const allItems = this.page.locator('.x-combo-list-item')
        const allCount = await allItems.count()
        console.log(`[GoDentist] Total items (incl hidden): ${allCount}`)
        for (let i = 0; i < Math.min(allCount, 10); i++) {
          const text = (await allItems.nth(i).textContent())?.trim() || ''
          const visible = await allItems.nth(i).isVisible()
          console.log(`[GoDentist]   [${i}] "${text}" visible=${visible}`)
        }
        await this.page.keyboard.press('Escape')
        return []
      }

      const sucursales: Sucursal[] = []
      for (let i = 0; i < count; i++) {
        const text = (await items.nth(i).textContent())?.trim() || ''
        if (text) {
          sucursales.push({ value: text, label: text })
        }
      }

      await this.page.keyboard.press('Escape')
      await this.page.waitForTimeout(300)
      return sucursales
    } catch (err) {
      console.error('[GoDentist] Error discovering sucursales:', err)
      return []
    }
  }

  private async selectSucursal(sucursal: Sucursal): Promise<void> {
    if (!this.page) return

    const comboId = await this.getSucursalComboInputId()
    if (!comboId) return

    await this.openComboDropdown(comboId)

    // Click the visible matching item
    const item = this.page.locator(`.x-combo-list-item:visible:has-text("${sucursal.label}")`)
    const exists = await item.count()
    if (exists > 0) {
      await item.click()
      console.log(`[GoDentist] Sucursal selected: ${sucursal.label}`)
    } else {
      await this.page.keyboard.press('Escape')
      console.log(`[GoDentist] Sucursal item not found: ${sucursal.label}`)
    }

    await this.page.waitForTimeout(500)
  }

  private async clickBuscar(): Promise<void> {
    if (!this.page) return

    // Log all buttons for diagnosis
    const buttons = await this.page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, .x-btn, input[type="submit"]')).map(b => ({
        tag: b.tagName,
        text: b.textContent?.trim().substring(0, 50),
        className: b.className,
        id: b.id,
      }))
    })
    console.log(`[GoDentist] Buttons on page: ${JSON.stringify(buttons)}`)

    // Try various selectors
    const searchBtn = await this.page.$('button:has-text("Buscar")')
      || await this.page.$('button:has-text("Filtrar")')
      || await this.page.$('button:has-text("Consultar")')
      || await this.page.$('.x-btn:has-text("Buscar")')
      || await this.page.$('.x-btn:has-text("Filtrar")')
      || await this.page.$('button[type="submit"]')

    if (searchBtn) {
      await searchBtn.click()
      console.log('[GoDentist] Buscar clicked')
    } else {
      // Fallback: press Enter on date field to trigger reload
      console.log('[GoDentist] No Buscar button found, pressing Enter on date field')
      await this.page.locator('#df_fecha').press('Enter')
    }
  }

  // ── Pagination ──

  /**
   * Extract appointments from ALL pages for a sucursal.
   * Reads total page count from ExtJS PagingToolbar "of X" text,
   * then navigates exactly that many pages.
   */
  private async extractAllPages(sucursal: string): Promise<Appointment[]> {
    if (!this.page) return []

    const allAppointments: Appointment[] = []

    // Read total pages from the paging toolbar
    const totalPages = await this.getTotalPages()
    console.log(`[GoDentist] ${sucursal}: ${totalPages} total page(s)`)

    if (totalPages <= 0) {
      // No paging info found, just extract current page
      const pageAppointments = await this.extractAppointments(sucursal)
      return pageAppointments
    }

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageAppointments = await this.extractAppointments(sucursal)
      allAppointments.push(...pageAppointments)
      console.log(`[GoDentist] ${sucursal} page ${pageNum}/${totalPages}: ${pageAppointments.length} citas`)

      // If not last page, click next
      if (pageNum < totalPages) {
        await this.clickNextPage()
        await this.page.waitForTimeout(2000)
      }
    }

    return allAppointments
  }

  /**
   * Read total page count from the ExtJS PagingToolbar.
   * The toolbar has: [first] [prev] [input: pageNum] "of X" [next] [last] ... "Displaying A - B of C"
   * We look for the "of X" text next to the page input.
   */
  private async getTotalPages(): Promise<number> {
    if (!this.page) return 0

    return await this.page.evaluate(() => {
      // Strategy 1: Find all text nodes in the paging toolbar that say "of X"
      // The paging toolbar contains a <div class="x-toolbar-ct"> with items
      const allElements = document.querySelectorAll('.xtb-text, .x-toolbar-text, td')
      for (const el of allElements) {
        const text = (el.textContent || '').trim()
        // Match "of 5" or "de 5" pattern
        const match = text.match(/^(?:of|de)\s+(\d+)$/i)
        if (match) {
          return parseInt(match[1])
        }
      }

      // Strategy 2: Find the "Displaying X - Y of Z" text and calculate pages
      for (const el of allElements) {
        const text = (el.textContent || '').trim()
        const match = text.match(/(\d+)\s*-\s*(\d+)\s+(?:of|de)\s+(\d+)/i)
        if (match) {
          const perPage = parseInt(match[2]) - parseInt(match[1]) + 1
          const total = parseInt(match[3])
          if (perPage > 0) return Math.ceil(total / perPage)
        }
      }

      return 0
    })
  }

  /**
   * Click the "next page" button in the ExtJS PagingToolbar.
   */
  private async clickNextPage(): Promise<void> {
    if (!this.page) return

    const clicked = await this.page.evaluate(() => {
      // The next button has a <button> with class x-tbar-page-next inside a <table>
      const nextBtn = document.querySelector('button.x-tbar-page-next') as HTMLElement
      if (nextBtn) {
        nextBtn.click()
        return true
      }
      return false
    })

    if (clicked) {
      console.log('[GoDentist] Clicked next page')
    } else {
      console.warn('[GoDentist] Could not find next page button')
    }
  }

  // ── Data Extraction ──

  private async extractAppointments(sucursal: string): Promise<Appointment[]> {
    if (!this.page) return []
    const appointments: Appointment[] = []

    try {
      await this.page.waitForSelector('table', { timeout: 10000 })

      // Get all table rows
      const rows = this.page.locator('table tbody tr')
      const rowCount = await rows.count()
      console.log(`[GoDentist] Table rows: ${rowCount}`)

      for (let i = 0; i < rowCount; i++) {
        const row = rows.nth(i)
        const cells = await row.locator('td').allTextContents()
        const rawCells = cells.map(c => c.trim())
        const cleanCells = rawCells.filter(c => c.length > 0)

        if (cleanCells.length < 3) continue // Skip separator/empty rows

        // Log first row's raw cells to diagnose column positions
        if (i === 0) {
          console.log(`[GoDentist] Row 0 raw cells (${rawCells.length}):`, JSON.stringify(rawCells))
        }

        // Find estado: look for known estado values in rawCells
        let estado = ''
        const estadoKeywords = ['confirmada', 'cancelada', 'pendiente', 'no asistió', 'asistió', 'atendido', 'en espera']
        for (const cell of rawCells) {
          if (cell && estadoKeywords.some(k => cell.toLowerCase().includes(k))) {
            estado = cell
            break
          }
        }

        // Parse other fields with heuristics (existing logic)
        let hora = ''
        let nombre = ''
        let telefono = ''

        for (const cell of cleanCells) {
          // Time pattern: H:MM AM/PM or HH:MM
          const timeMatch = cell.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\b/)
          if (timeMatch && !hora) {
            hora = timeMatch[1].trim()
            continue
          }

          // Phone: 10+ digits or 3XX Colombian mobile
          const phoneMatch = cell.match(/(\+?\d{10,}|\b3\d{9}\b)/)
          if (phoneMatch && !telefono) {
            telefono = phoneMatch[1].replace(/\D/g, '')
            if (telefono.length === 10 && telefono.startsWith('3')) {
              telefono = '57' + telefono
            }
            continue
          }

          // Name: alphabetic, > 3 chars, has spaces (full names)
          if (!nombre && cell.length > 3 && /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(cell) && cell.includes(' ') && !/^\d+$/.test(cell)) {
            nombre = cell
          }
        }

        if (nombre && telefono) {
          appointments.push({ nombre, telefono, hora, sucursal, estado })
        }
      }
    } catch (err) {
      console.error(`[GoDentist] Extraction error (${sucursal}):`, err)
      await this.takeScreenshot(`extraction-error`)
    }

    return appointments
  }

  // ── Date Helpers ──

  private getNextWorkingDay(): Date {
    const now = new Date()
    const colombiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
    const next = new Date(colombiaTime)
    next.setDate(next.getDate() + 1)

    // Skip Sunday (0). If Saturday (6), skip to Monday
    if (next.getDay() === 0) {
      next.setDate(next.getDate() + 1)
    } else if (next.getDay() === 6) {
      next.setDate(next.getDate() + 2)
    }

    return next
  }

  /** DD-MM-YYYY format for the ExtJS date input */
  private formatDateDD_MM_YYYY(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}-${month}-${year}`
  }

  /** YYYY-MM-DD for the API response */
  private formatDateYYYY_MM_DD(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // ── Screenshot / Cookies ──

  async takeScreenshot(name: string): Promise<void> {
    if (!this.page) return
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filePath = path.join(ARTIFACTS_DIR, `${name}-${timestamp}.png`)
      await this.page.screenshot({ path: filePath, fullPage: true })
      console.log(`[GoDentist] Screenshot: ${filePath}`)
    } catch (err) {
      console.error(`[GoDentist] Screenshot error:`, err)
    }
  }

  private async saveCookies(): Promise<void> {
    if (!this.context) return
    try {
      const cookies = await this.context.cookies()
      const filePath = path.join(SESSIONS_DIR, `${this.workspaceId}-cookies.json`)
      fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2))
    } catch (err) {
      console.error('[GoDentist] Error saving cookies:', err)
    }
  }

  private async loadCookies(): Promise<void> {
    if (!this.context) return
    try {
      const filePath = path.join(SESSIONS_DIR, `${this.workspaceId}-cookies.json`)
      if (fs.existsSync(filePath)) {
        const cookies = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        await this.context.addCookies(cookies)
        console.log('[GoDentist] Cookies loaded')
      }
    } catch (err) {
      console.error('[GoDentist] Error loading cookies:', err)
    }
  }
}
