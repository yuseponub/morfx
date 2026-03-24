import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import type { Credentials, Appointment, ConfirmAppointmentResponse, CheckAvailabilityResponse, AvailabilitySlot } from '../types/index.js'
import { DOCTOR_PRIORITY } from '../constants/doctors.js'

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

  async scrapeAppointments(filterSucursales?: string[], targetDate?: string): Promise<{ date: string; appointments: Appointment[]; errors: string[] }> {
    if (!this.page) throw new Error('Browser not initialized')

    let target: Date
    if (targetDate) {
      // Parse YYYY-MM-DD into Date object
      const [y, m, d] = targetDate.split('-').map(Number)
      target = new Date(y, m - 1, d)
    } else {
      target = this.getNextWorkingDay()
    }
    const dateStr = this.formatDateDD_MM_YYYY(target)
    const dateLabel = this.formatDateYYYY_MM_DD(target)

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

  // ── Check Availability ──

  async checkAvailability(date: string, sucursal: string): Promise<CheckAvailabilityResponse> {
    if (!this.page) throw new Error('Browser not initialized')

    const screenshots: string[] = []
    const takeAndTrack = async (name: string) => {
      await this.takeScreenshot(name)
      screenshots.push(name)
    }

    const slots: AvailabilitySlot[] = []
    const errors: string[] = []

    // Get doctors for this sucursal
    const sucursalUpper = sucursal.toUpperCase()
    const doctors = DOCTOR_PRIORITY[sucursalUpper]
    if (!doctors || doctors.length === 0) {
      return {
        success: false,
        date,
        sucursal,
        slots: [],
        summary: { manana: [], tarde: [] },
        errors: [`No hay doctores configurados para la sucursal: ${sucursal}`],
        screenshots,
      }
    }

    console.log(`[GoDentist] checkAvailability: date=${date}, sucursal=${sucursal}, doctors=${doctors.length}`)

    try {
      // Navigate to appointments page
      await this.page.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
      await this.page.waitForTimeout(2000)
      await takeAndTrack('avail-appointments-page')

      // Click "Nueva cita" button
      const nuevaCitaClicked = await this.clickNuevaCita()
      if (!nuevaCitaClicked) {
        return {
          success: false,
          date,
          sucursal,
          slots: [],
          summary: { manana: [], tarde: [] },
          errors: ['No se pudo abrir el formulario de Nueva cita'],
          screenshots,
        }
      }
      await this.page.waitForTimeout(3000)
      await takeAndTrack('avail-nueva-cita-form')

      // Iterate through each doctor
      for (const doctorName of doctors) {
        try {
          console.log(`[GoDentist] Checking availability for: ${doctorName}`)

          // Ensure the Nueva cita form is still open
          const formOpen = await this.page.locator('.x-window:visible').count()
          if (formOpen === 0) {
            console.log(`[GoDentist] Form closed, re-opening...`)
            const reopened = await this.clickNuevaCita()
            if (!reopened) {
              errors.push('No se pudo re-abrir el formulario de Nueva cita')
              break
            }
            await this.page.waitForTimeout(3000)
          }

          // Select doctor in combo
          const selected = await this.selectDoctorCombo(doctorName)
          if (!selected) {
            console.warn(`[GoDentist] Could not find doctor: ${doctorName}`)
            errors.push(`Doctor no encontrado en combo: ${doctorName}`)
            continue
          }

          await this.page.waitForTimeout(3000) // Wait for agenda table to load
          await takeAndTrack(`avail-doctor-${doctorName.replace(/\s+/g, '-').toLowerCase()}`)

          // Read "Agenda Disponible" table
          const doctorSlots = await this.readAgendaDisponible(doctorName, date, sucursalUpper)
          // Deduplicate slots (ExtJS grid renders 2 <tr> per row)
          const unique = doctorSlots.filter((slot, i) =>
            i === 0 || JSON.stringify(slot) !== JSON.stringify(doctorSlots[i - 1])
          )
          slots.push(...unique)
          console.log(`[GoDentist] ${doctorName}: ${unique.length} slots (${doctorSlots.length} raw)`)

        } catch (err) {
          const msg = `Error consultando ${doctorName}: ${err instanceof Error ? err.message : String(err)}`
          console.error(`[GoDentist] ${msg}`)
          errors.push(msg)
          await takeAndTrack(`avail-error-${doctorName.replace(/\s+/g, '-').toLowerCase()}`)
        }
      }

      // Close the form without saving
      await this.closeNuevaCitaForm()
      await takeAndTrack('avail-form-closed')

    } catch (err) {
      console.error('[GoDentist] checkAvailability error:', err)
      await takeAndTrack('avail-error')
      errors.push(err instanceof Error ? err.message : String(err))
    }

    // Build summary
    const summary = this.buildAvailabilitySummary(slots)

    return {
      success: true,
      date,
      sucursal,
      slots,
      summary,
      errors: errors.length > 0 ? errors : undefined,
      screenshots,
    }
  }

  /**
   * Click the "Nueva cita" button on the appointments page.
   */
  private async clickNuevaCita(): Promise<boolean> {
    if (!this.page) return false

    // Try various selectors for the "Nueva cita" button
    const btn = await this.page.$('button:has-text("Nueva cita")')
      || await this.page.$('button:has-text("Nueva Cita")')
      || await this.page.$('.x-btn:has-text("Nueva cita")')
      || await this.page.$('.x-btn:has-text("Nueva Cita")')
      || await this.page.$('a:has-text("Nueva cita")')
      || await this.page.$('a:has-text("Nueva Cita")')

    if (btn) {
      await btn.click()
      console.log('[GoDentist] Clicked "Nueva cita" button')
      return true
    }

    // Fallback: evaluate to find any element with "Nueva cita" text
    const clicked = await this.page.evaluate(() => {
      const allElements = document.querySelectorAll('button, a, .x-btn, span, td')
      for (const el of allElements) {
        const text = (el as HTMLElement).textContent?.trim() || ''
        if (text.toLowerCase().includes('nueva cita')) {
          (el as HTMLElement).click()
          return true
        }
      }
      return false
    })

    if (clicked) {
      console.log('[GoDentist] Clicked "Nueva cita" via evaluate')
      return true
    }

    console.error('[GoDentist] Could not find "Nueva cita" button')
    await this.takeScreenshot('avail-no-nueva-cita-btn')
    return false
  }

  /**
   * Select a doctor in the "Doctor(a)" ExtJS ComboBox.
   * The label "Doctor(a)" has a `for` attribute pointing to the HIDDEN input.
   * We need to find the visible text input (sibling) and its trigger arrow.
   * Same pattern as getSucursalComboInputId: hidden → walk up → find visible text input.
   */
  private async selectDoctorCombo(doctorName: string): Promise<boolean> {
    if (!this.page) return false

    // The Doctor combo in Dentos has:
    // - Hidden input: #iddoctor (holds the value)
    // - Visible text input: #ext-comp-XXXX (shows the name, dynamic ID)
    // - Trigger arrow: inside the same wrapper as #iddoctor
    // The trigger is a sibling of #iddoctor, so we use #iddoctor with openComboDropdown

    // Verify the x-window is open
    const windowExists = await this.page.locator('.x-window:visible').count()
    if (windowExists === 0) {
      console.warn('[GoDentist] No x-window visible for doctor combo')
      return false
    }

    // Open the doctor dropdown using the hidden input ID (trigger is its sibling)
    console.log(`[GoDentist] Opening doctor combo via #iddoctor trigger...`)
    await this.openComboDropdown('iddoctor')
    await this.page.waitForTimeout(2000)
    await this.takeScreenshot('avail-doctor-dropdown')

    // Dump all floating overlays to find the correct selector for dropdown items
    const dropdownDiag = await this.page.evaluate(() => {
      // Check multiple possible selectors for ExtJS dropdown items
      const selectors: Record<string, number> = {}
      const candidates = [
        '.x-combo-list-item',
        '.x-combo-list-item:not([style*="display: none"])',
        '.x-boundlist-item',
        '.x-list-plain div',
        '.x-combo-list .x-combo-list-inner div',
        '.x-layer div',
        '.x-combo-list-inner div',
      ]
      for (const sel of candidates) {
        try { selectors[sel] = document.querySelectorAll(sel).length } catch { selectors[sel] = -1 }
      }

      // Find all visible floating/overlay elements that appeared (x-layer, x-combo-list)
      const layers = Array.from(document.querySelectorAll('.x-layer, .x-combo-list, .x-combo-list-inner')).map(el => ({
        tag: el.tagName,
        cls: el.className.substring(0, 100),
        visible: (el as HTMLElement).offsetParent !== null || getComputedStyle(el).display !== 'none',
        childCount: el.children.length,
        innerHTML: (el as HTMLElement).innerHTML?.substring(0, 500),
      }))

      return { selectors, layers }
    })
    console.log(`[GoDentist] Dropdown diagnostic:`, JSON.stringify(dropdownDiag, null, 2))

    // Try multiple selectors to find doctor items
    let items: string[] = []
    let itemSelector = ''

    // Try .x-combo-list-item first (standard ExtJS 3.x)
    items = await this.page.locator('.x-combo-list-item:visible').allTextContents()
    if (items.length > 0) { itemSelector = '.x-combo-list-item:visible' }

    // Try without :visible
    if (items.length === 0) {
      items = await this.page.locator('.x-combo-list-item').allTextContents()
      if (items.length > 0) { itemSelector = '.x-combo-list-item' }
    }

    // Try .x-combo-list-inner div (some ExtJS combos render items as plain divs)
    if (items.length === 0) {
      items = await this.page.locator('.x-combo-list-inner div').allTextContents()
      if (items.length > 0) { itemSelector = '.x-combo-list-inner div' }
    }

    // Try .x-boundlist-item (ExtJS 4.x+)
    if (items.length === 0) {
      items = await this.page.locator('.x-boundlist-item').allTextContents()
      if (items.length > 0) { itemSelector = '.x-boundlist-item' }
    }

    console.log(`[GoDentist] Doctor dropdown items (${items.length}):`, items.slice(0, 20))

    if (items.length === 0) {
      console.warn(`[GoDentist] No doctor items found in dropdown`)
      // Do NOT press Escape here — it closes the x-window
      // Just click somewhere neutral in the form to close any open dropdown
      await this.page.locator('.x-window .x-window-header').click().catch(() => {})
      await this.page.waitForTimeout(500)
      return false
    }

    // Find matching doctor (case-insensitive partial match)
    const targetIdx = items.findIndex(t =>
      t.trim().toLowerCase().includes(doctorName.toLowerCase()) ||
      doctorName.toLowerCase().includes(t.trim().toLowerCase())
    )

    if (targetIdx >= 0) {
      console.log(`[GoDentist] Clicking item[${targetIdx}] with selector "${itemSelector}"`)
      await this.page.locator(itemSelector).nth(targetIdx).click()
      console.log(`[GoDentist] Doctor selected: ${items[targetIdx].trim()}`)
      await this.page.waitForTimeout(1000)
      return true
    }

    // Close dropdown by clicking header (NOT Escape — Escape closes the whole window)
    await this.page.locator('.x-window .x-window-header').click().catch(() => {})
    await this.page.waitForTimeout(500)
    console.warn(`[GoDentist] Doctor "${doctorName}" not found. Available: ${items.map(i => i.trim()).join(', ')}`)
    return false
  }

  /**
   * Read the "Agenda Disponible" table that appears after selecting a doctor.
   * Filters rows by date and sucursal.
   */
  private async readAgendaDisponible(
    doctorName: string,
    targetDate: string,
    targetSucursal: string
  ): Promise<AvailabilitySlot[]> {
    if (!this.page) return []

    const slots: AvailabilitySlot[] = []

    try {
      // Look for "Agenda Disponible" table — it may be inside the modal/form
      // Try to find a table/grid that appeared after selecting the doctor
      const tables = this.page.locator('.x-window table tbody tr, .x-grid3-body .x-grid3-row')
      const rowCount = await tables.count()
      console.log(`[GoDentist] Agenda table rows: ${rowCount}`)

      if (rowCount === 0) {
        // Try alternative: look for any grid within the form
        const altTables = this.page.locator('.x-window .x-grid3-row')
        const altCount = await altTables.count()
        console.log(`[GoDentist] Alt grid rows: ${altCount}`)

        if (altCount === 0) {
          // Dump visible content for debugging
          const formContent = await this.page.evaluate(() => {
            const win = document.querySelector('.x-window')
            if (!win) return 'No x-window found'
            // Find tables or grids
            const tables = win.querySelectorAll('table')
            const grids = win.querySelectorAll('.x-grid3, .x-grid-panel')
            return {
              tables: tables.length,
              grids: grids.length,
              bodyText: (win as HTMLElement).innerText?.substring(0, 2000),
            }
          })
          console.log(`[GoDentist] Form content debug:`, JSON.stringify(formContent, null, 2))
          return []
        }

        // Read alt grid rows
        for (let i = 0; i < altCount; i++) {
          const cells = await altTables.nth(i).locator('td, .x-grid3-cell-inner').allTextContents()
          const cleanCells = cells.map(c => c.trim()).filter(c => c.length > 0)
          const slot = this.parseAgendaRow(cleanCells, doctorName, targetDate, targetSucursal)
          if (slot) slots.push(slot)
        }
        return slots
      }

      // Read main table rows
      for (let i = 0; i < rowCount; i++) {
        const cells = await tables.nth(i).locator('td, .x-grid3-cell-inner').allTextContents()
        const cleanCells = cells.map(c => c.trim()).filter(c => c.length > 0)
        const slot = this.parseAgendaRow(cleanCells, doctorName, targetDate, targetSucursal)
        if (slot) slots.push(slot)
      }
    } catch (err) {
      console.error(`[GoDentist] Error reading agenda for ${doctorName}:`, err)
    }

    return slots
  }

  /**
   * Parse a single row from the Agenda Disponible table.
   * Expected columns: Día | Fecha | Hora Inicio | Hora Fin | Sucursal
   * Returns a slot if the row matches the target date and sucursal, null otherwise.
   */
  private parseAgendaRow(
    cells: string[],
    doctorName: string,
    targetDate: string,
    targetSucursal: string
  ): AvailabilitySlot | null {
    if (cells.length < 4) return null

    // Dentos ExtJS grid duplicates each cell (visible + hidden column).
    // Deduplicate by removing consecutive identical values.
    const deduped: string[] = []
    for (let i = 0; i < cells.length; i++) {
      if (i === 0 || cells[i] !== cells[i - 1]) {
        deduped.push(cells[i])
      }
    }

    // Log deduped row for debugging
    console.log(`[GoDentist] Agenda row cells: ${JSON.stringify(deduped)}`)

    // After dedup, expected columns: Día(0), Fecha(1), HoraInicio(2), HoraFin(3), Sucursal(4)
    // Use pattern matching on deduped cells
    let rowDate = ''
    let horaInicio = ''
    let horaFin = ''
    let rowSucursal = ''

    for (const cell of deduped) {
      // Date: YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) {
        rowDate = cell
        continue
      }
      // Date: DD/MM/YYYY or DD-MM-YYYY
      const dateMatch = cell.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
      if (dateMatch) {
        rowDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
        continue
      }
      // Time: H:MM AM/PM
      const timeMatch = cell.match(/^\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?$/)
      if (timeMatch) {
        if (!horaInicio) {
          horaInicio = cell.trim()
        } else if (!horaFin) {
          horaFin = cell.trim()
        }
        continue
      }
      // Sucursal: known names
      if (['CABECERA', 'FLORIDABLANCA', 'JUMBO EL BOSQUE', 'MEJORAS PUBLICAS'].some(s =>
        cell.toUpperCase().includes(s)
      )) {
        rowSucursal = cell.toUpperCase().trim()
      }
    }

    // Filter by date
    if (rowDate && rowDate !== targetDate) return null

    // Filter by sucursal (if present in the row)
    if (rowSucursal && !rowSucursal.includes(targetSucursal) && !targetSucursal.includes(rowSucursal)) return null

    // Must have at least hora inicio
    if (!horaInicio) return null

    // Determine jornada
    const jornada = this.isBeforeNoon(horaInicio) ? 'manana' : 'tarde'

    // Extract short doctor name for summary
    const doctorParts = doctorName.split(' ')
    const shortDoctor = doctorParts.length >= 2
      ? `${doctorParts[0]} ${doctorParts[doctorParts.length - 2]} ${doctorParts[doctorParts.length - 1]}`
      : doctorName

    return {
      doctor: shortDoctor,
      horaInicio,
      horaFin: horaFin || '',
      jornada,
    }
  }

  /**
   * Check if a time string (e.g. "8:00 AM", "2:00 PM") is before noon.
   */
  private isBeforeNoon(time: string): boolean {
    const upper = time.toUpperCase().trim()
    if (upper.includes('PM')) {
      const hourMatch = upper.match(/^(\d{1,2}):/)
      if (hourMatch) {
        const hour = parseInt(hourMatch[1])
        return hour === 12 // 12:xx PM is noon, but treat as tarde
      }
      return false
    }
    if (upper.includes('AM')) {
      return true
    }
    // 24h format fallback
    const hourMatch = upper.match(/^(\d{1,2}):/)
    if (hourMatch) {
      return parseInt(hourMatch[1]) < 12
    }
    return true
  }

  /**
   * Build a summary grouping slots by jornada.
   */
  private buildAvailabilitySummary(slots: AvailabilitySlot[]): { manana: string[]; tarde: string[] } {
    const manana: string[] = []
    const tarde: string[] = []

    for (const slot of slots) {
      const label = slot.horaFin
        ? `${slot.horaInicio} - ${slot.horaFin} (${slot.doctor})`
        : `${slot.horaInicio} (${slot.doctor})`

      if (slot.jornada === 'manana') {
        manana.push(label)
      } else {
        tarde.push(label)
      }
    }

    return { manana, tarde }
  }

  /**
   * Close the "Nueva cita" form/modal without saving.
   */
  private async closeNuevaCitaForm(): Promise<void> {
    if (!this.page) return

    try {
      // Try clicking the X close button on the x-window
      const closeBtn = this.page.locator('.x-window .x-tool-close:visible')
      if (await closeBtn.count() > 0) {
        await closeBtn.first().click()
        console.log('[GoDentist] Closed form via X button')
        await this.page.waitForTimeout(1000)
        return
      }

      // Fallback: press Escape
      await this.page.keyboard.press('Escape')
      console.log('[GoDentist] Closed form via Escape')
      await this.page.waitForTimeout(1000)

      // Check if a confirmation dialog appeared ("Desea cerrar sin guardar?")
      const confirmBtn = await this.page.$('button:has-text("Si")') || await this.page.$('button:has-text("Sí")')
      if (confirmBtn) {
        await confirmBtn.click()
        console.log('[GoDentist] Confirmed close dialog')
        await this.page.waitForTimeout(1000)
      }
    } catch (err) {
      console.warn(`[GoDentist] Error closing form: ${err}`)
      // Force close by navigating away
      await this.page.keyboard.press('Escape')
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
  /**
   * Try to change the Estado to "Confirmada" by opening the modal dialog.
   * The Dentos portal uses onclick="mostrarVentanaEstadosCita(ID)" which opens
   * an ExtJS x-window modal. The modal may use native <select> or ExtJS ComboBox
   * (hidden input + visible text input + dropdown list items).
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

    // Step 1: Click the estado cell to open the modal via mostrarVentanaEstadosCita()
    console.log('[GoDentist] Clicking estado cell to open modal...')
    try {
      await estadoCell.click({ timeout: 5000 })
      await this.page.waitForTimeout(2000)
      await takeAndTrack('confirm-after-estado-click')
    } catch (err) {
      console.log(`[GoDentist] Click estado cell failed: ${err}`)
      return false
    }

    // Step 2: Detect the x-window modal
    const modal = this.page.locator('.x-window:visible')
    const modalCount = await modal.count()
    console.log(`[GoDentist] Visible x-window modals: ${modalCount}`)

    if (modalCount === 0) {
      console.log('[GoDentist] No modal opened after clicking estado cell')
      return false
    }

    // Step 3: Dump full modal diagnostics
    try {
      const modalDiag = await this.page.evaluate(() => {
        const win = document.querySelector('.x-window') as HTMLElement
        if (!win || win.offsetParent === null) return null

        // Get ALL inputs (text, hidden, etc.)
        const inputs = Array.from(win.querySelectorAll('input')).map(inp => ({
          id: inp.id,
          type: inp.type,
          name: inp.name,
          value: inp.value,
          className: inp.className.substring(0, 100),
          visible: inp.offsetParent !== null,
        }))

        // Get native selects
        const selects = Array.from(win.querySelectorAll('select')).map(s => ({
          id: s.id,
          name: s.name,
          value: s.value,
          options: Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() })),
        }))

        // Get buttons
        const buttons = Array.from(win.querySelectorAll('button, input[type="button"], .x-btn')).map(b => ({
          tag: b.tagName,
          text: (b as HTMLElement).textContent?.trim().substring(0, 50),
          value: (b as HTMLInputElement).value?.substring(0, 50),
          id: b.id,
          className: b.className.substring(0, 80),
        }))

        // Get labels
        const labels = Array.from(win.querySelectorAll('label, .x-form-item-label')).map(l => ({
          text: l.textContent?.trim().substring(0, 50),
          forId: (l as HTMLLabelElement).htmlFor,
        }))

        // Get form trigger arrows (ExtJS combo indicators)
        const triggers = Array.from(win.querySelectorAll('.x-form-trigger')).map(t => ({
          className: t.className,
          parentId: t.parentElement?.id,
          siblingInputId: t.parentElement?.querySelector('input')?.id,
        }))

        // Get inner HTML (truncated for logs)
        const bodyHTML = win.querySelector('.x-window-body')?.innerHTML?.substring(0, 2000) || ''

        return { inputs, selects, buttons, labels, triggers, bodyHTML }
      })

      console.log(`[GoDentist] Modal diagnostics:`, JSON.stringify(modalDiag, null, 2))

      if (!modalDiag) {
        console.log('[GoDentist] Could not read modal contents')
        return false
      }

      // Strategy A: Native <select> with "Confirmada" option
      for (const sel of modalDiag.selects) {
        const confirmadaOpt = sel.options.find(o => o.text.toLowerCase() === 'confirmada')
        if (!confirmadaOpt) continue

        console.log(`[GoDentist] Found native select #${sel.id} with Confirmada option`)
        await this.page.evaluate(({ selId, val }) => {
          const s = document.getElementById(selId) as HTMLSelectElement
          if (s) {
            s.value = val
            s.dispatchEvent(new Event('change', { bubbles: true }))
          }
        }, { selId: sel.id, val: confirmadaOpt.value })
        await this.page.waitForTimeout(500)
        return await this.clickGuardar(modal, screenshots)
      }

      // Strategy B: ExtJS ComboBox — look for trigger arrows in modal
      if (modalDiag.triggers.length > 0) {
        console.log(`[GoDentist] Found ${modalDiag.triggers.length} ExtJS combo trigger(s) in modal`)

        for (const trigger of modalDiag.triggers) {
          const inputId = trigger.siblingInputId
          if (!inputId) continue

          console.log(`[GoDentist] Trying ExtJS combo with input #${inputId}`)

          // Click the trigger to open dropdown
          const triggerEl = this.page.locator(`#${inputId}`).locator('..').locator('.x-form-trigger')
          if (await triggerEl.count() > 0) {
            await triggerEl.click()
            await this.page.waitForTimeout(1000)

            // Look for visible dropdown items
            const items = await this.page.locator('.x-combo-list-item:visible').allTextContents()
            console.log(`[GoDentist] Combo dropdown items:`, items)

            // Find "Confirmada" in dropdown
            const confirmadaIdx = items.findIndex(t => t.trim().toLowerCase() === 'confirmada')
            if (confirmadaIdx >= 0) {
              console.log(`[GoDentist] Found "Confirmada" at index ${confirmadaIdx}, clicking...`)
              await this.page.locator('.x-combo-list-item:visible').nth(confirmadaIdx).click()
              await this.page.waitForTimeout(500)
              await takeAndTrack('confirm-estado-selected')
              return await this.clickGuardar(modal, screenshots)
            } else {
              console.log('[GoDentist] "Confirmada" not in dropdown, closing...')
              await this.page.keyboard.press('Escape')
              await this.page.waitForTimeout(300)
            }
          }
        }
      }

      // Strategy C: Look for hidden inputs that might be the estado field
      // Some ExtJS forms use a hidden input + visible text input combo
      const hiddenInputs = modalDiag.inputs.filter(i => i.type === 'hidden')
      const textInputs = modalDiag.inputs.filter(i => i.type === 'text' && i.visible)
      console.log(`[GoDentist] Hidden inputs: ${hiddenInputs.map(i => `${i.id}=${i.value}`).join(', ')}`)
      console.log(`[GoDentist] Visible text inputs: ${textInputs.map(i => `${i.id}=${i.value}`).join(', ')}`)

      // Try clicking each visible text input to see if it opens a dropdown
      for (const txtInput of textInputs) {
        if (!txtInput.id) continue
        console.log(`[GoDentist] Trying to open dropdown for text input #${txtInput.id}...`)

        await this.page.locator(`#${txtInput.id}`).click()
        await this.page.waitForTimeout(1000)

        const dropdownItems = await this.page.locator('.x-combo-list-item:visible').allTextContents()
        if (dropdownItems.length > 0) {
          console.log(`[GoDentist] Dropdown opened for #${txtInput.id}:`, dropdownItems)
          const confirmadaIdx = dropdownItems.findIndex(t => t.trim().toLowerCase() === 'confirmada')
          if (confirmadaIdx >= 0) {
            await this.page.locator('.x-combo-list-item:visible').nth(confirmadaIdx).click()
            await this.page.waitForTimeout(500)
            await takeAndTrack('confirm-estado-selected')
            return await this.clickGuardar(modal, screenshots)
          }
          await this.page.keyboard.press('Escape')
          await this.page.waitForTimeout(300)
        }
      }

      console.log('[GoDentist] No mechanism found to change estado')
      await takeAndTrack('confirm-no-mechanism')
      return false
    } catch (err) {
      console.error(`[GoDentist] Modal interaction failed: ${err}`)
      await takeAndTrack('confirm-modal-error')
      return false
    }
  }

  /**
   * Click the Guardar button in the modal to save changes.
   */
  private async clickGuardar(
    modal: ReturnType<Page['locator']>,
    screenshots: string[]
  ): Promise<boolean> {
    if (!this.page) return false

    const takeAndTrack = async (name: string) => {
      await this.takeScreenshot(name)
      screenshots.push(name)
    }

    // Try locator-based approach
    const guardarBtn = modal.locator('button:has-text("Guardar"), input[value="Guardar"]')
    if (await guardarBtn.count() > 0) {
      await guardarBtn.first().click()
      console.log('[GoDentist] Clicked Guardar')
      await this.page.waitForTimeout(2000)
      await takeAndTrack('confirm-after-guardar')
      return true
    }

    // Fallback: evaluate click
    const clicked = await this.page.evaluate(() => {
      const btns = document.querySelectorAll('.x-window button, .x-window input[type="button"], .x-window .x-btn')
      for (const btn of btns) {
        const text = (btn as HTMLElement).textContent?.trim() || (btn as HTMLInputElement).value?.trim() || ''
        if (text.toLowerCase().includes('guardar') || text.toLowerCase().includes('save')) {
          (btn as HTMLElement).click()
          return true
        }
      }
      return false
    })

    if (clicked) {
      console.log('[GoDentist] Clicked Guardar via evaluate')
      await this.page.waitForTimeout(2000)
      await takeAndTrack('confirm-after-guardar')
      return true
    }

    console.log('[GoDentist] Could not find Guardar button')
    await takeAndTrack('confirm-no-guardar')
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
