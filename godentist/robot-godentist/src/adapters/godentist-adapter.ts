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

// ── Table-refresh guard primitives (standalone: godentist-scraper-table-refresh-guard) ──

/**
 * Per CONTEXT.md D-04/D-05: timeout máximo por intento de refresh de tabla y polling rate
 * usados por waitForSucursalRefresh (definido en Plan 02). 8s da ~2x margen sobre el peor caso
 * medido (~3.5s) en logs Railway históricos.
 */
const SUCURSAL_REFRESH_TIMEOUT_MS = 8000
const SUCURSAL_REFRESH_POLL_MS = 250

/**
 * Per CONTEXT.md D-01: fingerprint capturado de la tabla del portal Dentos para detectar
 * cambios DOM cross-sede. Tres campos cubren el espacio de mutaciones posibles
 * (sede distinta, paginación, filas distintas).
 */
interface Fingerprint {
  phone: string
  hora: string
  rowCount: number
}

/**
 * Pure equality check de dos Fingerprint per CONTEXT.md D-02.
 * Iguales si los tres campos (phone, hora, rowCount) coinciden exactamente.
 * `null` semantics se manejan en el caller (D-03 lógica en waitForSucursalRefresh, Plan 02).
 * Module-level + no exportada: testable en futuro pero no parte del contract público.
 */
function fingerprintsEqual(a: Fingerprint | null, b: Fingerprint | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.phone === b.phone && a.hora === b.hora && a.rowCount === b.rowCount
}

/**
 * Per CONTEXT.md D-08: error thrown por waitForSucursalRefresh (Plan 02) cuando una sede
 * agota 3 intentos sin refresh detectado. Propaga sin try/catch hasta el Express handler
 * en server.ts (Plan 04), que lo mapea a HTTP 502 con body discriminado
 * `{ status: 'error', code: 'sede_refresh_failed', sucursal, attempts, message }`.
 *
 * Primera clase Error custom del robot. Discriminador `instanceof` permite type-safety
 * en server.ts sin recurrir a `.code` string-matching.
 */
export class SedeRefreshFailedError extends Error {
  constructor(
    public readonly sucursal: string,
    public readonly attempts: number,
    public readonly stuckFingerprint: Fingerprint | null,
  ) {
    const fp = stuckFingerprint
      ? `{phone:${stuckFingerprint.phone},hora:${stuckFingerprint.hora},rowCount:${stuckFingerprint.rowCount}}`
      : 'null'
    super(`Sede ${sucursal}: tabla no se refrescó tras ${attempts} intentos. Fingerprint stuck at ${fp}`)
    this.name = 'SedeRefreshFailedError'
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Paradigm F primitives (standalone: godentist-scraping-structural-v2)
// Inert scaffolding — consumed by selectSucursalF/clickBuscarAndWait (Plan 04)
// and rewritten scrapeAppointments (Plan 05).
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Per RESEARCH.md §Standard Stack: hardcoded sede label → numeric id mapping,
 * empirically verified across 8 research scripts.
 *
 * The portal Dentos uses `#idsucursalgrid.value` (hidden input) as source of truth
 * for the active filter. Map below was captured by clicking each sede in the combo
 * and reading the hidden value (see research-scripts/01-baseline-and-combo.cjs).
 *
 * Stability: per RESEARCH.md "MEDIUM confidence" — if Godentist adds a sede,
 * its numericId must be added here. A runtime discovery fallback is NOT included
 * in V1 (over-engineering); if SEDE_ID_MAP[sede] is undefined, scrapeAppointments
 * pushes an error message and skips the sede (see Plan 05).
 */
const SEDE_ID_MAP: Record<string, string> = {
  'CABECERA': '1',
  'FLORIDABLANCA': '3',
  'JUMBO EL BOSQUE': '5',
  'MEJORAS PUBLICAS': '4',
}

/**
 * Per CONTEXT.md D-07 + RESEARCH.md Pattern 1: thrown by `assertFilterIs` helper
 * when `#idsucursalgrid.value !== expectedId` after selectSucursal, clickBuscar,
 * or pagination. Indicates the portal's filter drifted from the value we set —
 * any extracted rows would belong to a different sede than the loop iteration.
 *
 * Propagates without try/catch to Express handler in server.ts (Plan 05), which
 * maps to HTTP 502 with body `{ status: 'error', code: 'filter_drift', when, expected, actual }`.
 *
 * Discriminator `instanceof FilterDriftError` allows type-safe handling in server.ts
 * without `.code` string-matching (same pattern as existing SedeRefreshFailedError lines 56-67).
 */
export class FilterDriftError extends Error {
  constructor(
    public readonly sede: string,
    public readonly expectedId: string,
    public readonly actualId: string,
    public readonly when: string,
  ) {
    super(`Filter drift in ${sede} at ${when}: expected idsucursalgrid=${expectedId}, got ${actualId}`)
    this.name = 'FilterDriftError'
  }
}

/**
 * Per CONTEXT.md D-11 + RESEARCH.md Pattern 2: thrown by `clickNextPageWithGuard`
 * (Plan 04) when the pagination postcondition fails — `pageInput.value` did not
 * increment AND first row did not change after the click + 1 retry.
 *
 * Indicates either:
 *   (a) The portal served a disabled next-page button without us detecting it
 *       (D-11 redundant defensive check), OR
 *   (b) Network/ExtJS rendering stalled longer than the 5s waitForFunction.
 *
 * Maps to HTTP 502 in server.ts (Plan 05).
 */
export class PaginationStuckError extends Error {
  constructor(
    public readonly sede: string,
    public readonly currentPage: number,
    public readonly totalPages: number,
    public readonly pageInputBefore: string,
    public readonly pageInputAfter: string,
  ) {
    super(`Pagination stuck in ${sede} at page ${currentPage}/${totalPages}: pageInput ${pageInputBefore} → ${pageInputAfter}`)
    this.name = 'PaginationStuckError'
  }
}

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

    // Baseline fingerprint for table-refresh guard (CONTEXT.md D-07)
    let prevFingerprint = await this.captureFingerprint()

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
        prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal)
        await this.takeScreenshot(`citas-${sucursal.label.replace(/\s+/g, '-').toLowerCase()}`)

        const appointments = await this.extractAllPages(sucursal.label)
        allAppointments.push(...appointments)
        console.log(`[GoDentist] ${sucursal.label}: ${appointments.length} citas (todas las páginas)`)
      } catch (err) {
        // Per CONTEXT.md D-08: SedeRefreshFailedError aborts the entire scrape — must propagate
        // up to scrapeAppointments caller (Express handler in server.ts maps to HTTP 502).
        // Without this re-throw, the catch swallows the abort signal and scrape returns 200
        // with partial data, breaking SPEC Acceptance #4 (Pitfall 2 in RESEARCH.md).
        if (err instanceof SedeRefreshFailedError) throw err

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

      // Select sucursal in the Nueva cita form (required for correct agenda)
      const sucursalSelected = await this.selectSucursalInForm(sucursalUpper)
      if (!sucursalSelected) {
        console.warn(`[GoDentist] Could not select sucursal ${sucursalUpper} in form, continuing anyway...`)
      }
      await this.page.waitForTimeout(2000)
      await takeAndTrack('avail-sucursal-selected')

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
   * Select a sucursal in the "Nueva cita" form's sucursal combo.
   * The form has a "Sucursal" label with a combo/select. We need to select
   * the correct sucursal so the "Agenda Disponible" shows the right schedule.
   */
  private async selectSucursalInForm(sucursal: string): Promise<boolean> {
    if (!this.page) return false

    try {
      // The sucursal field in the Nueva cita form might be:
      // 1. A native <select> inside .x-window
      // 2. An ExtJS ComboBox with a hidden input

      // Strategy 1: Native <select> inside the modal
      const selects = this.page.locator('.x-window select')
      const selectCount = await selects.count()
      console.log(`[GoDentist] Form has ${selectCount} native <select> elements`)

      for (let i = 0; i < selectCount; i++) {
        const options = await selects.nth(i).locator('option').allTextContents()
        const cleanOptions = options.map(o => o.trim().toUpperCase())
        console.log(`[GoDentist] Select[${i}] options: ${cleanOptions.join(', ')}`)

        const matchIdx = cleanOptions.findIndex(o => o.includes(sucursal) || sucursal.includes(o))
        if (matchIdx >= 0) {
          const optionValues = await selects.nth(i).locator('option').evaluateAll(
            els => els.map(el => (el as HTMLOptionElement).value)
          )
          await selects.nth(i).selectOption(optionValues[matchIdx])
          console.log(`[GoDentist] Sucursal selected via native <select>: ${cleanOptions[matchIdx]}`)
          await this.page.waitForTimeout(1000)
          return true
        }
      }

      // Strategy 2: ExtJS combo — look for a trigger near a "Sucursal" label
      const clicked = await this.page.evaluate((targetSucursal) => {
        // Find all labels in the x-window
        const win = document.querySelector('.x-window')
        if (!win) return false

        const labels = win.querySelectorAll('label, .x-form-item-label')
        for (const label of labels) {
          const text = label.textContent?.trim().toLowerCase() || ''
          if (!text.includes('sucursal')) continue

          // Found sucursal label — find the associated combo
          const formItem = label.closest('.x-form-item') || label.parentElement
          if (!formItem) continue

          const trigger = formItem.querySelector('.x-form-trigger') as HTMLElement
          if (trigger) {
            trigger.click()
            return true
          }
        }
        return false
      }, sucursal)

      if (clicked) {
        await this.page.waitForTimeout(1500)
        // Look for dropdown items
        const items = await this.page.locator('.x-combo-list-item:visible, .x-combo-list-inner div:visible').allTextContents()
        const cleanItems = items.map(t => t.trim())
        console.log(`[GoDentist] Sucursal combo items: ${cleanItems.join(', ')}`)

        const targetIdx = cleanItems.findIndex(t => t.toUpperCase().includes(sucursal) || sucursal.includes(t.toUpperCase()))
        if (targetIdx >= 0) {
          await this.page.locator('.x-combo-list-inner div').nth(targetIdx).click()
          console.log(`[GoDentist] Sucursal selected via ExtJS combo: ${cleanItems[targetIdx]}`)
          await this.page.waitForTimeout(1000)
          return true
        }

        // Close dropdown if no match
        await this.page.keyboard.press('Escape')
      }

      console.warn(`[GoDentist] Could not find sucursal "${sucursal}" in form`)
      return false
    } catch (err) {
      console.error(`[GoDentist] Error selecting sucursal in form: ${err}`)
      return false
    }
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

    // Close any open dropdowns first (sucursal combo may still be open)
    await this.page.locator('.x-window .x-window-header').click().catch(() => {})
    await this.page.waitForTimeout(500)

    // Open the doctor dropdown using the hidden input ID (trigger is its sibling)
    console.log(`[GoDentist] Opening doctor combo via #iddoctor trigger...`)
    await this.openComboDropdown('iddoctor')
    await this.page.waitForTimeout(2000)
    await this.takeScreenshot('avail-doctor-dropdown')

    // The doctor dropdown uses custom "search-item" divs (NOT .x-combo-list-item).
    // The sucursal dropdown uses .x-combo-list-item. We must use the correct selector.
    // Strategy: find the x-combo-list-inner with >10 children (doctor has 26, sucursal has 4)
    const doctorItems = await this.page.evaluate(() => {
      const inners = document.querySelectorAll('.x-combo-list-inner')
      for (const inner of inners) {
        // Doctor dropdown has many items (>10), sucursal has only 4
        if (inner.children.length > 10) {
          return Array.from(inner.children).map(el => {
            // Extract text from span inside search-item divs
            const span = el.querySelector('span')
            return span?.textContent?.trim() || (el as HTMLElement).textContent?.trim() || ''
          }).filter(t => t.length > 0)
        }
      }
      return [] as string[]
    })

    console.log(`[GoDentist] Doctor dropdown items (${doctorItems.length}):`, doctorItems.slice(0, 10))

    if (doctorItems.length === 0) {
      console.warn(`[GoDentist] No doctor items found in dropdown`)
      await this.page.locator('.x-window .x-window-header').click().catch(() => {})
      await this.page.waitForTimeout(500)
      return false
    }

    // Find matching doctor (case-insensitive partial match)
    const targetIdx = doctorItems.findIndex(t =>
      t.toLowerCase().includes(doctorName.toLowerCase()) ||
      doctorName.toLowerCase().includes(t.toLowerCase())
    )

    if (targetIdx >= 0) {
      // Click the correct item in the doctor dropdown (the one with >10 children)
      const clicked = await this.page.evaluate((idx) => {
        const inners = document.querySelectorAll('.x-combo-list-inner')
        for (const inner of inners) {
          if (inner.children.length > 10) {
            const item = inner.children[idx] as HTMLElement
            if (item) {
              item.click()
              return true
            }
          }
        }
        return false
      }, targetIdx)

      if (clicked) {
        console.log(`[GoDentist] Doctor selected: ${doctorItems[targetIdx]}`)
        await this.page.waitForTimeout(1000)
        return true
      }
    }

    // Close dropdown by clicking header (NOT Escape — Escape closes the whole window)
    await this.page.locator('.x-window .x-window-header').click().catch(() => {})
    await this.page.waitForTimeout(500)
    console.warn(`[GoDentist] Doctor "${doctorName}" not found. Available: ${doctorItems.join(', ')}`)
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
      // The "Agenda Disponible" is a grid inside the x-window.
      // We need to find the specific grid, not form layout tables.
      // Strategy: dump all grids/tables in the modal and find the one with date/time data.
      const agendaData = await this.page.evaluate(() => {
        const win = document.querySelector('.x-window')
        if (!win) return { rows: [] as string[][] }

        // Find all grid rows (x-grid3) inside the window
        const gridRows = win.querySelectorAll('.x-grid3-row')
        if (gridRows.length > 0) {
          const rows = Array.from(gridRows).map(row => {
            const cells = row.querySelectorAll('.x-grid3-cell-inner, td')
            return Array.from(cells).map(c => (c as HTMLElement).textContent?.trim() || '')
          })
          return { rows, source: 'x-grid3-row' }
        }

        // Fallback: find the last table in the window (usually the agenda grid)
        const tables = win.querySelectorAll('table')
        // The "Agenda Disponible" table is typically the one with date columns
        for (let t = tables.length - 1; t >= 0; t--) {
          const trs = tables[t].querySelectorAll('tbody tr')
          if (trs.length === 0) continue

          // Check if this table has date-like content
          const firstRowCells = Array.from(trs[0].querySelectorAll('td')).map(c => (c as HTMLElement).textContent?.trim() || '')
          const hasDate = firstRowCells.some(c => /\d{4}-\d{2}-\d{2}/.test(c) || /\d{2}[/-]\d{2}[/-]\d{4}/.test(c))
          const hasTime = firstRowCells.some(c => /\d{1,2}:\d{2}\s*(AM|PM)/i.test(c))

          if (hasDate || hasTime) {
            const rows = Array.from(trs).map(row => {
              return Array.from(row.querySelectorAll('td')).map(c => (c as HTMLElement).textContent?.trim() || '')
            })
            return { rows, source: `table[${t}]` }
          }
        }

        return { rows: [] as string[][], source: 'none' }
      })

      console.log(`[GoDentist] Agenda source: ${(agendaData as any).source}, rows: ${agendaData.rows.length}`)
      const rowCount = agendaData.rows.length

      if (rowCount === 0) {
        console.log(`[GoDentist] No agenda rows found for ${doctorName}`)
        return []
      }

      // Parse rows from the evaluate result
      for (const rowCells of agendaData.rows) {
        const cleanCells = rowCells.filter(c => c.length > 0)
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

  // ── Table-refresh guard helpers (standalone: godentist-scraper-table-refresh-guard) ──

  /**
   * Per CONTEXT.md D-01: captura fingerprint de la tabla actual del portal Dentos.
   * Lee `table tbody tr` con el mismo filtro que extractAppointments (cleanCells.length >= 3)
   * para coherencia. Retorna null si no hay filas válidas (tabla vacía es comportamiento legítimo).
   *
   * Usado por waitForSucursalRefresh para comparar pre/post-cambio de sede.
   */
  private async captureFingerprint(): Promise<Fingerprint | null> {
    if (!this.page) return null

    return await this.page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'))
      const validRows: HTMLTableRowElement[] = []
      for (const r of rows) {
        const cells = Array.from(r.querySelectorAll('td'))
          .map(c => (c.textContent || '').trim())
          .filter(c => c.length > 0)
        if (cells.length >= 3) validRows.push(r as HTMLTableRowElement)
      }
      const rowCount = validRows.length
      if (rowCount === 0) return null

      // Extract phone + hora from first valid row (heuristics consistent with extractAppointments)
      const firstRow = validRows[0]
      const cells = Array.from(firstRow.querySelectorAll('td'))
        .map(c => (c.textContent || '').trim())
        .filter(c => c.length > 0)

      let phone = ''
      let hora = ''
      for (const cell of cells) {
        if (!hora) {
          const t = cell.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\b/)
          if (t) {
            hora = t[1].trim()
            continue
          }
        }
        if (!phone) {
          const p = cell.match(/(\+?\d{10,}|\b3\d{9}\b)/)
          if (p) {
            let raw = p[1].replace(/\D/g, '')
            if (raw.length === 10 && raw.startsWith('3')) raw = '57' + raw
            phone = raw
            continue
          }
        }
      }

      return { phone, hora, rowCount }
    })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Paradigm F helpers (standalone: godentist-scraping-structural-v2)
  // Consumed by selectSucursalF / clickBuscarAndWait / clickNextPageWithGuard
  // (added in Plan 04) and the rewritten scrapeAppointments (Plan 05).
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Reads the hidden input `#idsucursalgrid.value` — source of truth for the
   * currently active sede filter per RESEARCH.md §Standard Stack.
   *
   * Returns empty string '' if the input is missing (caller decides if that
   * is fatal). Never throws.
   *
   * NOTE: do NOT trust `window.Sucursal` JS global — verified `undefined` in
   * research-scripts/02-sede-switching-timeline.cjs.
   */
  private async readHidden(): Promise<string> {
    return await this.page!.evaluate(() => {
      const el = document.getElementById('idsucursalgrid') as HTMLInputElement | null
      return el?.value ?? ''
    })
  }

  /**
   * Reads `input.x-tbar-page-number.value` (the page number input in the
   * pagination toolbar). Used by clickNextPageWithGuard to verify the page
   * actually advanced post-click (D-11 + RESEARCH.md Pattern 2).
   *
   * Returns empty string '' if the input is missing.
   */
  private async readPageInputValue(): Promise<string> {
    return await this.page!.evaluate(() => {
      const input = document.querySelector('input.x-tbar-page-number') as HTMLInputElement | null
      return input?.value ?? ''
    })
  }

  /**
   * Reads a 2-field fingerprint of the first visible row in the citas table:
   * { phone: cells[5], hora: cells[1] }. Used by clickNextPageWithGuard's
   * postcondition (RESEARCH.md Pattern 2): a page-advance must change EITHER
   * pageInput.value OR firstRow phone/hora (typically both).
   *
   * Cell indices are empirical per the current Dentos HTML — same as the
   * legacy captureFingerprint (column 1 = hora, column 5 = phone).
   *
   * Returns { phone: '', hora: '' } if the table or first row is missing.
   */
  private async readFirstRowFingerprint(): Promise<{ phone: string; hora: string }> {
    return await this.page!.evaluate(() => {
      const rt = document.querySelector('table.x-grid3-row-table')
      if (!rt) return { phone: '', hora: '' }
      const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
      return { phone: cells[5] || '', hora: cells[1] || '' }
    })
  }

  /**
   * Per RESEARCH.md Wave 0 / D-15 audit: parses "Total de citas: N" from the
   * toolbar `.xtb-text` elements. Returns null if the toolbar text is missing
   * or N is not a number.
   *
   * Result is persisted on godentist_scrape_history.total_citas by the
   * server-action (Plan 06) and used for sanity comparison against
   * `appointments.length` post-extraction.
   */
  private async readTotalCitas(): Promise<number | null> {
    return await this.page!.evaluate(() => {
      const texts = Array.from(document.querySelectorAll('.xtb-text')).map(e => (e.textContent || '').trim())
      for (const t of texts) {
        const m = t.match(/Total de citas:\s*(\d+)/i)
        if (m) return Number.parseInt(m[1], 10)
      }
      return null
    })
  }

  /**
   * Per CONTEXT.md D-07: assert the active filter (`#idsucursalgrid.value`)
   * matches `expectedId`. If not, throw `FilterDriftError` with diagnostics.
   *
   * Called multiple times in the scrape lifecycle per paradigm F:
   *   1. post-select-{sede}    — after selectSucursalF
   *   2. post-buscar-{sede}    — after clickBuscarAndWait
   *   3. page-{p}-{sede}       — at the START of each page iteration
   *
   * Multiple call sites are intentional: RESEARCH.md Run 5 of paradigm E proved
   * that the hidden value can drift between pagination steps if the portal's
   * ExtJS reuses a stale request.
   */
  private async assertFilterIs(expectedId: string, when: string): Promise<void> {
    const actual = await this.readHidden()
    if (actual !== expectedId) {
      const sede = Object.entries(SEDE_ID_MAP).find(([, id]) => id === expectedId)?.[0] ?? expectedId
      console.error(`[GoDentist] FilterDriftError at ${when}: expected idsucursalgrid=${expectedId} (${sede}), got '${actual}'`)
      throw new FilterDriftError(sede, expectedId, actual, when)
    }
  }

  /**
   * Per RESEARCH.md Paradigm F: selects a sede in the combo, then verifies the
   * hidden #idsucursalgrid.value matches expectedId (via assertFilterIs).
   *
   * Replaces selectSucursal for paradigm F (does NOT delete the old; Plan 05 wires
   * the call sites).
   */
  private async selectSucursalF(label: string, expectedId: string): Promise<void> {
    console.log(`[GoDentist] selectSucursalF: ${label} (expectedId=${expectedId})`)

    // Step 1: find the visible combo input by walking from #idsucursalgrid parent.
    // The visible input has dynamic id (ext-comp-XXXX); the hidden input has stable id.
    const comboInputSelector = await this.page!.evaluate(() => {
      const hidden = document.getElementById('idsucursalgrid')
      if (!hidden) return null
      const parent = hidden.parentElement
      if (!parent) return null
      const inputs = parent.querySelectorAll('input')
      for (const inp of Array.from(inputs)) {
        if (inp !== hidden && (inp as HTMLElement).offsetParent !== null) return `#${inp.id}`
      }
      return null
    })

    if (!comboInputSelector) {
      throw new Error(`selectSucursalF(${label}): combo input not found in DOM`)
    }

    // Step 2: close any open combos defensively.
    await this.page!.keyboard.press('Escape').catch(() => {})
    await this.page!.waitForTimeout(200)

    // Step 3: click the visible combo to open the dropdown.
    await this.page!.click(comboInputSelector)
    await this.page!.waitForSelector('.x-combo-list-item:visible', { timeout: 2000 })

    // Step 4: click the matching item. Filter visible to avoid hour items (RESEARCH.md Common Pitfalls).
    const itemSelector = `.x-combo-list-item:visible:has-text("${label}")`
    await this.page!.click(itemSelector, { timeout: 2000 })

    // Step 5: wait for ExtJS to propagate to hidden input.
    await this.page!.waitForTimeout(500)

    // Step 6: verify postcondition.
    await this.assertFilterIs(expectedId, `post-select-${label}`)

    console.log(`[GoDentist] selectSucursalF: ${label} confirmed (hidden=${expectedId})`)
  }

  /**
   * Per RESEARCH.md Paradigm F: clicks the Buscar button and waits for the
   * citas table to render with the new filter applied.
   *
   * Does NOT throw FilterDriftError itself; the caller calls assertFilterIs immediately
   * after for the postcondition.
   */
  private async clickBuscarAndWait(): Promise<void> {
    console.log('[GoDentist] clickBuscarAndWait: clicking Buscar')

    // Step 1: click the button (text-based selector since button id is not stable).
    await this.page!.click('button:has-text("Buscar")', { timeout: 5000 })

    // Step 2: wait for the table to render with new content.
    await this.page!.waitForFunction(() => {
      const rt = document.querySelector('table.x-grid3-row-table')
      if (!rt) return false
      const firstRow = rt.querySelector('tr')
      if (!firstRow) return false
      const cells = Array.from(firstRow.querySelectorAll('td')).map(c => (c.textContent || '').trim())
      return (cells[1] || '').length > 0 && (cells[5] || '').length > 0
    }, undefined, { timeout: 8000, polling: 100 })

    // Defensive settle window for ExtJS toolbar updates.
    await this.page!.waitForTimeout(500)

    console.log('[GoDentist] clickBuscarAndWait: table rendered')
  }

  /**
   * Per CONTEXT.md D-04..D-08: guard de table-refresh entre cambios de sede.
   *
   * Estrategia:
   * - Si prev === null (D-03 edge case): no esperamos, capturamos curr y retornamos. Una sede
   *   con tabla vacía es legítima en el portal Dentos; no debe gatillar retry infinito.
   * - Si prev !== null: invocar page.waitForFunction polling 250ms con timeout 8000ms.
   *   La función inyectada calcula el fingerprint del DOM actual y retorna truthy cuando difiere
   *   de prev (rowCount/phone/hora cambiaron, o rowCount=0 mientras prev no-null).
   * - Tras success: log "Table refresh confirmed for ${label} after attempt ${n}", retornar
   *   captureFingerprint() (Fingerprint | null).
   * - Tras timeout: log "Table refresh failed for ${label} attempt ${n}/3 — retrying selectSucursal";
   *   antes de re-intentar, page.keyboard.press('Escape') para limpiar combo abierto (Pitfall 3);
   *   re-invocar selectSucursal + clickBuscar; loop al próximo attempt.
   * - Tras 3 attempts agotados: log "Table refresh FAILED for ${label} after 3 attempts — aborting
   *   scrape. Fingerprint stuck at {...}", throw SedeRefreshFailedError. El throw se propaga
   *   hasta scrapeAppointments (re-throw en catch — Plan 03) y de ahí al Express handler (Plan 04).
   */
  private async waitForSucursalRefresh(
    prev: Fingerprint | null,
    sucursal: Sucursal,
  ): Promise<Fingerprint | null> {
    if (!this.page) throw new Error('Browser not initialized')

    // D-03 edge case: prev null ⇒ no esperamos, sede anterior estaba vacía / estado inicial.
    if (prev === null) {
      const curr = await this.captureFingerprint()
      const fpStr = curr
        ? `{phone:${curr.phone},hora:${curr.hora},rowCount:${curr.rowCount}}`
        : 'null'
      console.log(`[GoDentist] Table refresh confirmed for ${sucursal.label} after attempt 1: prev=null → curr=${fpStr}`)
      return curr
    }

    let lastSeen: Fingerprint | null = prev

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.page.waitForFunction(
          (p) => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'))
            const validRows: HTMLTableRowElement[] = []
            for (const r of rows) {
              const cs = Array.from(r.querySelectorAll('td'))
                .map(c => (c.textContent || '').trim())
                .filter(c => c.length > 0)
              if (cs.length >= 3) validRows.push(r as HTMLTableRowElement)
            }
            const rowCount = validRows.length

            // rowCount 0 vs prev non-null ⇒ refreshed (transition non-null → null)
            if (rowCount === 0) return true

            // Compute phone+hora from first valid row using same heuristics as captureFingerprint
            const firstRow = validRows[0]
            const cells = Array.from(firstRow.querySelectorAll('td'))
              .map(c => (c.textContent || '').trim())
              .filter(c => c.length > 0)

            let phone = ''
            let hora = ''
            for (const cell of cells) {
              if (!hora) {
                const tm = cell.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\b/)
                if (tm) {
                  hora = tm[1].trim()
                  continue
                }
              }
              if (!phone) {
                const pm = cell.match(/(\+?\d{10,}|\b3\d{9}\b)/)
                if (pm) {
                  let raw = pm[1].replace(/\D/g, '')
                  if (raw.length === 10 && raw.startsWith('3')) raw = '57' + raw
                  phone = raw
                  continue
                }
              }
            }

            // Refresh iff any field differs from prev
            return p.phone !== phone || p.hora !== hora || p.rowCount !== rowCount
          },
          prev,
          { polling: SUCURSAL_REFRESH_POLL_MS, timeout: SUCURSAL_REFRESH_TIMEOUT_MS },
        )

        // Success — capture current fingerprint and log verbatim D-10 string
        const curr = await this.captureFingerprint()
        const prevStr = `{phone:${prev.phone},hora:${prev.hora},rowCount:${prev.rowCount}}`
        const currStr = curr
          ? `{phone:${curr.phone},hora:${curr.hora},rowCount:${curr.rowCount}}`
          : 'null'
        console.log(`[GoDentist] Table refresh confirmed for ${sucursal.label} after attempt ${attempt}: prev=${prevStr} → curr=${currStr}`)
        return curr
      } catch (err) {
        // Capture current fingerprint to enrich logs (still stuck)
        lastSeen = await this.captureFingerprint()

        if (attempt < 3) {
          console.log(`[GoDentist] Table refresh failed for ${sucursal.label} attempt ${attempt}/3 — retrying selectSucursal`)
          // Defensive Escape per Pitfall 3 — ensure combo dropdown not lingering open from previous attempt
          await this.page.keyboard.press('Escape').catch(() => undefined)
          await this.selectSucursal(sucursal)
          await this.clickBuscar()
          // continue to next iteration of for-loop
        } else {
          const stuckStr = lastSeen
            ? `{phone:${lastSeen.phone},hora:${lastSeen.hora},rowCount:${lastSeen.rowCount}}`
            : 'null'
          console.log(`[GoDentist] Table refresh FAILED for ${sucursal.label} after 3 attempts — aborting scrape. Fingerprint stuck at ${stuckStr}`)
          throw new SedeRefreshFailedError(sucursal.label, 3, lastSeen)
        }
      }
    }

    // Unreachable — loop body either returns or throws on every iteration
    throw new SedeRefreshFailedError(sucursal.label, 3, lastSeen)
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
