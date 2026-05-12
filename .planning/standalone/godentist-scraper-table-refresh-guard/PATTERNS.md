# PATTERNS.md — godentist-scraper-table-refresh-guard

**Mapped:** 2026-05-12
**Files analyzed:** 2 (`godentist-adapter.ts`, `server.ts`)
**Analogs found:** 6 / 6 (todos los new symbols tienen analog claro en el mismo robot)

## File Classification

| New file/modified symbol | Role | Data flow | Closest analog | Match quality |
|---|---|---|---|---|
| `captureFingerprint()` — new private helper in `godentist-adapter.ts` | adapter helper (DOM read) | `page.evaluate` → primitive return | `getTotalPages()` (adapter:1544) | exact (same shape: private async, `page.evaluate(() => {...})`, returns primitive/null) |
| `fingerprintsEqual(a, b)` — pure function | utility (no I/O) | comparison | — (no pure utility convention in robot) | fresh — write standalone module-level `function` (not class method) per D-02 testability |
| `waitForSucursalRefresh(prev, label)` — new private helper | adapter control helper (loop-aware) | timing + retry orchestration | `selectSucursal()` (adapter:1448) + `clickBuscar()` (adapter:1470) | role-match (same class, same private async style, same logging prefix) |
| `SedeRefreshFailedError` — custom Error class | error type (HTTP discriminator) | thrown by adapter, caught by Express handler | — (no custom Error classes exist in robot — current convention is `throw new Error(...)`) | fresh — define module-level `export class X extends Error` per D-08 (HTTP 502 mapping needs discriminator) |
| `scrapeAppointments` loop modification | adapter orchestrator | sequential loop over sucursales | `scrapeAppointments` lines 217-233 (insert site) | exact (modify in place) |
| `POST /api/scrape-appointments` 502 mapping | Express handler | try/catch → HTTP response | server.ts:50-81 (current 500 mapping) | exact (extend `catch` with `instanceof` discriminator) |

## File → Closest Analog Mapping

| New file/symbol | Analog file:line | Why analogous |
|---|---|---|
| `captureFingerprint()` adapter method | `getTotalPages()` — `godentist-adapter.ts:1544` | Same private async shape, single `page.evaluate(() => primitive)` body, returns scalar or 0/null on miss, doc-comment-first convention |
| `waitForSucursalRefresh()` adapter method | `selectSucursal()` — `godentist-adapter.ts:1448` | Same private async, same `if (!this.page) return` early-exit, same `console.log('[GoDentist] ...')` logging convention |
| Retry loop body inside `waitForSucursalRefresh()` | `extractAllPages()` — `godentist-adapter.ts:1509` | Internal counted loop (1..N), `console.log` per iteration, logs the iteration number explicitly |
| `SedeRefreshFailedError` | — none in robot | First custom Error class; pattern set in this standalone. Reference for shape: Node stdlib convention (`class X extends Error { constructor(msg, public field) { super(msg); this.name = 'X' } }`) |
| Insertion point inside `scrapeAppointments` loop | `godentist-adapter.ts:217-233` (existing `for (const sucursal of sucursales)`) | The single insertion site, between `clickBuscar` (line 221) and `extractAllPages` (line 225) |
| Express handler 502 mapping | `server.ts:70-76` (current 500 `catch` block) | Extend with `if (err instanceof SedeRefreshFailedError) { 502 } else { 500 }` |
| `page.waitForFunction` usage (D-04) | — robot uses `page.evaluate` + manual polls but no `waitForFunction` in this file currently | Native Playwright API; pattern set per D-04. Closest existing pattern is `page.waitForSelector('table', { timeout: 10000 })` (adapter:1605, 947) — same option-bag shape |

## Code Excerpts

### Analog 1: `getTotalPages` (godentist-adapter.ts:1539-1573)

> **Why:** Pattern más limpio para `captureFingerprint`. Privado, async, `page.evaluate(() => primitive)`, retorna 0/null en miss, doc-comment delante. Copia esta estructura para `captureFingerprint` (cambia el query + return shape).

```typescript
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
```

### Analog 2: `selectSucursal` (godentist-adapter.ts:1448-1468)

> **Why:** Modelo del shape para `waitForSucursalRefresh`. Privado, async, `if (!this.page) return` early-exit, `console.log('[GoDentist] Sucursal ...')` con sufijo del label. Mismo estilo de signatura.

```typescript
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
```

### Analog 3: `clickBuscar` (godentist-adapter.ts:1470-1500)

> **Why:** Segundo helper a re-invocar dentro del retry loop. Misma shape (private async no-args, void return, logs `[GoDentist] Buscar clicked`). El nuevo helper llama `selectSucursal + clickBuscar` en cada retry attempt.

```typescript
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
```

### Analog 4: `scrapeAppointments` loop body — INSERTION SITE (godentist-adapter.ts:185-235)

> **Why:** Sitio exacto donde se inserta la captura inicial del fingerprint (después de `setHour`/`takeScreenshot`, antes del loop — D-07) y la llamada `waitForSucursalRefresh` (dentro del loop, entre `clickBuscar` y `extractAllPages` — D-06).

```typescript
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
    // ↑↑↑  D-07: INSERTAR AQUÍ
    //       let prevFingerprint = await this.captureFingerprint()

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
        // ↑↑↑  D-06: REEMPLAZAR `waitForTimeout(3000)` por:
        //       prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal.label)
        //       (el helper internamente reintenta selectSucursal + clickBuscar hasta 2 veces;
        //        si agota 3 intentos, throws SedeRefreshFailedError que se propaga hasta el handler Express)
        await this.takeScreenshot(`citas-${sucursal.label.replace(/\s+/g, '-').toLowerCase()}`)

        const appointments = await this.extractAllPages(sucursal.label)
        allAppointments.push(...appointments)
        console.log(`[GoDentist] ${sucursal.label}: ${appointments.length} citas (todas las páginas)`)
      } catch (err) {
        // ↑↑↑  D-08: AJUSTAR — si err instanceof SedeRefreshFailedError, RE-THROW para abortar el scrape.
        //       Si es otro Error, acumular en errors[] como hoy.
        const msg = `Error en ${sucursal.label}: ${err instanceof Error ? err.message : String(err)}`
        console.error(`[GoDentist] ${msg}`)
        errors.push(msg)
      }
    }

    return { date: dateLabel, appointments: allAppointments, errors }
  }
```

### Analog 5: Internal retry loop with `console.log` per iteration — from `extractAllPages` (godentist-adapter.ts:1509-1537)

> **Why:** Pattern del contador `for (let pageNum = 1; pageNum <= totalPages; pageNum++)` con log iteration-aware. El `waitForSucursalRefresh` retry loop usa el mismo estilo (`for (let attempt = 1; attempt <= 3; attempt++)`).

```typescript
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
```

### Analog 6: Express handler 500-mapping (server.ts:27-81) — EXTENSION SITE

> **Why:** Sitio exacto del cambio en `server.ts`. El `catch (err)` actual mapea genéricamente a 500. D-08 pide extender con `if (err instanceof SedeRefreshFailedError)` → 502 + body discriminado.

```typescript
  // ── Scrape Appointments ──
  app.post('/api/scrape-appointments', async (req, res) => {
    const body = req.body as ScrapeAppointmentsRequest

    // Validate request
    if (!body.workspaceId) {
      res.status(400).json({ success: false, error: 'workspaceId is required' })
      return
    }
    if (!body.credentials?.username || !body.credentials?.password) {
      res.status(400).json({ success: false, error: 'credentials (username, password) are required' })
      return
    }

    // Prevent concurrent scraping
    if (activeJob) {
      res.status(409).json({ success: false, error: 'Another scraping job is in progress' })
      return
    }

    activeJob = body.workspaceId

    const adapter = new GoDentistAdapter(body.credentials, body.workspaceId)

    try {
      await adapter.init()

      const loginOk = await adapter.login()
      if (!loginOk) {
        res.status(401).json({ success: false, error: 'Login failed. Check credentials.' })
        return
      }

      const result = await adapter.scrapeAppointments(body.sucursales, body.targetDate)

      const response: ScrapeAppointmentsResponse = {
        success: true,
        date: result.date,
        totalAppointments: result.appointments.length,
        appointments: result.appointments,
        errors: result.errors.length > 0 ? result.errors : undefined,
      }

      res.json(response)
    } catch (err) {
      console.error('[Server] Scrape error:', err)
      await adapter.takeScreenshot('server-error')
      // ↑↑↑  D-08: INSERTAR DISCRIMINADOR ANTES DEL res.status(500):
      //
      //       if (err instanceof SedeRefreshFailedError) {
      //         res.status(502).json({
      //           success: false,
      //           status: 'error',
      //           code: 'sede_refresh_failed',
      //           sucursal: err.sucursal,
      //           attempts: err.attempts,
      //           error: err.message,
      //         })
      //         return  // dentro del try/catch, salir antes del fallback 500
      //       }
      //
      //       (El import de SedeRefreshFailedError viene de '../adapters/godentist-adapter.js')
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      await adapter.close()
      activeJob = null
    }
  })
```

### Analog 7: `extractAppointments` opening — table-row extraction context (godentist-adapter.ts:1600-1623)

> **Why:** El `captureFingerprint` lee de la misma tabla DOM que `extractAppointments`. Usa los mismos selectores (`table tbody tr`, `td`) y mismo filtro de filas (`cleanCells.length < 3`) para coherencia. Esto garantiza que el fingerprint se calcula sobre el mismo set de filas que después extractor consumirá.

```typescript
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
        // [...continúa con extracción de hora/telefono/nombre...]
```

> **Implicación para `captureFingerprint`:** debe filtrar igualmente filas con `cleanCells.length < 3`, e iterar hasta encontrar la primera fila válida (no necesariamente `rows[0]`) para extraer `(phone, hora)`. El `rowCount` del fingerprint = número de filas que pasarían el filtro `cleanCells.length >= 3`.

## Shared Patterns

### Logging convention `[GoDentist] ...`

**Source:** `godentist-adapter.ts` (uso consistente, 50+ ocurrencias)
**Apply to:** Todas las líneas nuevas dentro de `waitForSucursalRefresh`, `captureFingerprint`.

Ejemplos verbatim del adapter (líneas 161-230 y 1461-1494):

```typescript
console.log(`[GoDentist] Target date: ${dateLabel} (${dateStr})`)
console.log(`[GoDentist] Filtering sucursales: ${filterSucursales.join(', ')}`)
console.log(`[GoDentist] Found ${sucursales.length} sucursales: ${sucursales.map(s => s.label).join(', ')}`)
console.log(`[GoDentist] After filter: ${sucursales.length} sucursales: ${sucursales.map(s => s.label).join(', ')}`)
console.log(`[GoDentist] ── Sucursal: ${sucursal.label} ──`)
console.log(`[GoDentist] Sucursal selected: ${sucursal.label}`)
console.log(`[GoDentist] Buscar clicked`)
console.log(`[GoDentist] ${sucursal.label}: ${appointments.length} citas (todas las páginas)`)
```

**Líneas grep-ables a producir por `waitForSucursalRefresh` (D-10 verbatim):**

```typescript
// Success path:
console.log(`[GoDentist] Table refresh confirmed for ${sucursal} after attempt ${attempt}: prev=${JSON.stringify(prev)} → curr=${JSON.stringify(curr)}`)

// Intermediate failure (attempt 1 or 2 of 3 — retry coming):
console.log(`[GoDentist] Table refresh failed for ${sucursal} attempt ${attempt}/3 — retrying selectSucursal`)

// Final failure (attempt 3 exhausted):
console.log(`[GoDentist] Table refresh FAILED for ${sucursal} after 3 attempts — aborting scrape. Fingerprint stuck at ${JSON.stringify(stuckFp)}`)
```

### Error throwing convention

**Source:** `godentist-adapter.ts:73, 167, 241, 334`
**Apply to:** Sitios actuales del adapter usan `throw new Error('Browser not initialized')` — convención plain `Error`. Para este standalone D-08 requiere discriminador HTTP, así que se introduce **una clase Error custom** (primera en el robot — convención nueva, justificada por necesidad de `instanceof` check en Express handler).

**Shape recomendado** (no hay analog interno, pero es shape Node estándar):

```typescript
// Module-level export en godentist-adapter.ts (cerca del top del archivo,
// después de los imports y antes de `interface Sucursal`):
export class SedeRefreshFailedError extends Error {
  constructor(
    public readonly sucursal: string,
    public readonly attempts: number,
    public readonly stuckFingerprint: Fingerprint | null,
  ) {
    super(`Sede ${sucursal}: tabla no se refrescó tras ${attempts} intentos`)
    this.name = 'SedeRefreshFailedError'
  }
}
```

> **Por qué module-level export (no nested):** el `server.ts` necesita `import { SedeRefreshFailedError }` para hacer `instanceof` check en el `catch`. Las clases internas/anidadas no se importan limpiamente.

### Constants placement

**Source:** `godentist-adapter.ts:7-12` (top-of-file constants)

```typescript
const STORAGE_DIR = path.resolve('storage')
const SESSIONS_DIR = path.join(STORAGE_DIR, 'sessions')
const ARTIFACTS_DIR = path.join(STORAGE_DIR, 'artifacts')

const BASE_URL = 'https://godentist.dentos.co'
const APPOINTMENTS_URL = `${BASE_URL}/citas/index/listcitassimple`
```

**Apply to:** `SUCURSAL_REFRESH_TIMEOUT_MS = 8000` y `SUCURSAL_REFRESH_POLL_MS = 250` (D-04, D-05) — agregar como `const` en el mismo bloque top-of-file. NO hardcoded inline dentro del helper.

### Playwright timeout option-bag

**Source:** `godentist-adapter.ts:1605, 947, 89` — convención `{ timeout: 10000 }`

```typescript
await this.page.waitForSelector('table', { timeout: 10000 })
await this.page.waitForSelector('#login-form, input.username, input[type="text"]', { timeout: 10000 })
await this.page.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
```

**Apply to:** `waitForFunction` dentro de `waitForSucursalRefresh`:

```typescript
await this.page.waitForFunction(
  (prev) => { /* inline capture + compare */ },
  prevFingerprint,
  { timeout: SUCURSAL_REFRESH_TIMEOUT_MS, polling: SUCURSAL_REFRESH_POLL_MS }
)
```

### `if (!this.page) return` early-exit

**Source:** `godentist-adapter.ts:1449, 1471, 1510, 1545, 1579, 1601` (ubicuo en todos los private async methods)

**Apply to:** `waitForSucursalRefresh` y `captureFingerprint` deben empezar con esta guarda. Excepto que `waitForSucursalRefresh` debe THROW (no return silencioso) si `!this.page`, porque su contrato exige retornar Fingerprint (no `void`/`null`).

```typescript
private async waitForSucursalRefresh(prev: Fingerprint | null, sucursalLabel: string): Promise<Fingerprint | null> {
  if (!this.page) throw new Error('Browser not initialized')  // ← consistent con líneas 73, 167, 241, 334
  // ...
}
```

## Style Conventions Observed

- **Indentación:** 2 espacios. Sin punto y coma final (style del archivo es no-semicolon).
- **Async pattern:** `private async methodName(...): Promise<T>` — siempre con tipo explícito de Promise.
- **Logging prefix:** `[GoDentist] ` (con espacio tras el bracket cierre). Lleno-de-template-strings con backticks.
- **Error throw style actual:** `throw new Error('mensaje')` plano (módulo no tiene Error classes custom). Standalone introduce primera Error class custom, justificada por necesidad de discriminador HTTP en `server.ts`.
- **Early-exit pattern:** `if (!this.page) return` (void methods) o `throw new Error('Browser not initialized')` (methods públicos con contrato fuerte).
- **DOM query convention:** `page.evaluate(() => { ... })` para selectores complejos. `page.locator(...)` para selectores simples con click/textContent. Ambos coexisten.
- **Doc-comment para helpers no triviales:** `/** ... */` JSDoc antes del método (ver `getTotalPages`, `clickNextPage`, `extractAllPages`). `waitForSucursalRefresh` y `captureFingerprint` deben tener JSDoc explicando fingerprint + retry contract.
- **Constants top-of-file:** `const NAME = value` en bloque al inicio del archivo, después de imports.
- **Screenshot side-effect:** `await this.takeScreenshot(name)` es opt-in en cada sitio, no hay convención implícita en helpers. NO agregar screenshots dentro de `waitForSucursalRefresh` (cada call ya está enmarcado por los screenshots del loop padre).
- **Express handler `try/catch/finally`:** todos los handlers en `server.ts` siguen mismo shape — validate args → `try { adapter.init() + adapter.method() + res.json }` `catch { console.error + takeScreenshot('server-error') + res.status(500) }` `finally { adapter.close() + activeJob = null }`. **El finally es importante** — `adapter.close()` debe correr aunque haya 502.

## No Analog Found

| New artifact | Role | Reason |
|---|---|---|
| Pure utility `fingerprintsEqual(a, b)` | helper puro | El robot no tiene convención de funciones puras module-level (todo es métodos de la clase). D-02 dice "función pura usable desde tests si se agregaran después". Recomendación: definir como `function fingerprintsEqual(...)` module-level (no `private` method de la clase) — vive en el mismo archivo `godentist-adapter.ts`, exportada para tests futuros pero no exportada al consumidor del módulo (no `export`). |
| Custom Error class `SedeRefreshFailedError` | error discriminator | Primera clase Error custom en el robot. Convención fresca: `export class X extends Error { constructor(public readonly campo: T, ...) { super(msg); this.name = 'X' } }`. Module-level + export para importarse desde `server.ts`. |
| Smoke E2E validation script (D-11) | test harness | No hay tests existentes en `godentist/robot-godentist/` (verificado: `find . -name '*.test.ts' -o -name '*.spec.ts'` retorna 0 matches). Script de validación numérica vive en `.planning/standalone/godentist-scraper-table-refresh-guard/smoke-e2e/` o equivalente — escribir fresh per D-11. Patrón sugerido: Node script CommonJS standalone que parsea los 3 JSON outputs, calcula `ratio` por sede + `overlap` entre pares, exit 0 si pass / 1 si fail. NO Vitest, NO Jest — solo Node + `process.exit`. |
| `Fingerprint` TypeScript type | type alias | No existe analog. Definir module-level en `godentist-adapter.ts` cerca de `interface Sucursal` (línea 14-17): `interface Fingerprint { phone: string; hora: string; rowCount: number }`. NO exportar (uso interno + en `SedeRefreshFailedError.stuckFingerprint`). |

## Metadata

**Analog search scope:** `godentist/robot-godentist/src/**` (5 archivos `.ts` totales: `index.ts`, `adapters/godentist-adapter.ts`, `api/server.ts`, `constants/doctors.ts`, `types/index.ts`).
**Files scanned:** 5/5 (todo el robot).
**Custom Error classes found in robot:** 0 — convención hasta hoy es `throw new Error(...)` plano.
**`*.test.ts` / `*.spec.ts` found:** 0 — sin convención de test framework en el robot.
**Pattern extraction date:** 2026-05-12.

---

## PATTERN MAPPING COMPLETE

**Phase:** godentist-scraper-table-refresh-guard
**Files classified:** 2 (`godentist-adapter.ts` modify, `server.ts` modify)
**New symbols mapped:** 5 (`captureFingerprint`, `fingerprintsEqual`, `waitForSucursalRefresh`, `SedeRefreshFailedError`, `Fingerprint` type)
**Analogs found:** 6 con match exact/role-match + 2 fresh (Error class + smoke script — sin precedente en robot)

### Coverage
- Files with exact analog: 4 (`captureFingerprint`→`getTotalPages`, `waitForSucursalRefresh`→`selectSucursal`+`clickBuscar`+`extractAllPages` loop, insertion site, server.ts catch block)
- Files with role-match analog: 0
- Files with no analog (fresh-convention): 3 (`SedeRefreshFailedError`, `fingerprintsEqual` pure fn, smoke E2E script)

### Key Patterns Identified
- Helpers privados siguen shape uniforme: `private async name(...): Promise<T> { if (!this.page) return ... }`
- Logging es `console.log('[GoDentist] ...')` con template strings — sin logger estructurado
- Playwright timeout convention: `{ timeout: 10000 }` o `{ timeout: 30000 }` para network ops
- `page.evaluate(() => primitive)` es la forma idiomática para extraer datos del DOM ExtJS
- Express handlers en `server.ts` tienen shape uniforme `try / catch (500) / finally (close + clear activeJob)` — extender preservando `finally`
- No hay Error classes custom en el robot — standalone introduce la primera, justificada por discriminador HTTP

### File Created
`/mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/godentist-scraper-table-refresh-guard/PATTERNS.md`

### Ready for Planning
Pattern mapping completo. El planner puede referenciar:
- 7 code excerpts verbatim para copy-paste
- Insertion sites exactos (líneas 197, 222, 73 del server.ts catch)
- Style conventions consolidadas para no inventar shape nuevo
- 3 artefactos fresh con shape recomendado (no analog interno)
