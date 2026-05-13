---
phase: godentist-scraping-structural-v2
plan: 04
type: execute
wave: 2
depends_on: [03]
files_modified:
  - godentist/robot-godentist/src/adapters/godentist-adapter.ts
autonomous: true
requirements:
  - D-01
  - D-03
  - D-07
  - D-11

must_haves:
  truths:
    - "El adapter define 4 nuevos metodos privados en GoDentistAdapter: selectSucursalF, clickBuscarAndWait, clickNextPageWithGuard, extractCurrentPageRows"
    - "clickNextPageWithGuard incluye check defensivo de x-item-disabled en el ancestor table.x-btn antes del click (D-11)"
    - "clickNextPageWithGuard implementa el retry pattern (1 retry tras 500ms) y throw PaginationStuckError si el retry tambien falla"
    - "extractCurrentPageRows toma el sede como argumento explicito y filtra rows por offsetParent !== null"
    - "El TypeScript del robot compila sin errores"
    - "Los metodos estan dormidos (no se invocan desde scrapeAppointments todavia, eso es Plan 05)"
  artifacts:
    - path: "godentist/robot-godentist/src/adapters/godentist-adapter.ts"
      provides: "selectSucursalF, clickBuscarAndWait, clickNextPageWithGuard, extractCurrentPageRows"
      contains:
        - "private async selectSucursalF"
        - "private async clickBuscarAndWait"
        - "private async clickNextPageWithGuard"
        - "private async extractCurrentPageRows"
        - "x-item-disabled"
        - "table.x-btn"
        - "throw new PaginationStuckError"
        - "waitForFunction"
  key_links:
    - from: "godentist-adapter.ts:clickNextPageWithGuard"
      to: "PaginationStuckError class (Plan 03) + page.waitForFunction Playwright API"
      via: "throw + Playwright native polling"
      pattern: "throw new PaginationStuckError"
    - from: "godentist-adapter.ts:selectSucursalF + clickBuscarAndWait"
      to: "assertFilterIs helper (Plan 03)"
      via: "method call"
      pattern: "await this.assertFilterIs"
---

<objective>
Agregar 4 metodos privados que constituyen el core algoritmico de paradigm F:

1. **selectSucursalF(label, expectedId)** — replace de la logica vieja de selectSucursal. Clickea el item del combo y verifica via assertFilterIs que #idsucursalgrid.value === expectedId.
2. **clickBuscarAndWait()** — clickea Buscar y espera que la tabla se renderice via waitForFunction.
3. **clickNextPageWithGuard(sede, currentPage, totalPages)** — paginacion con postcondicion: pageInput.value cambio Y firstRow phone+hora cambio, con 1 retry y PaginationStuckError si falla 2 veces. Defensa redundante: x-item-disabled check en ancestor table.x-btn (D-11).
4. **extractCurrentPageRows(sede: string)** — replace de extractAppointments(sucursal). Recibe sede como argumento explicito desde el caller verified-filter (NO del label del loop). Filtra rows por offsetParent !== null.

Purpose: Estos 4 metodos son las primitivas de paradigm F. Plan 05 los wirea en una nueva implementacion de scrapeAppointments. Mantenerlos en un commit aislado permite revisar el algoritmo de pagination+selection separadamente del orchestration y reduce blast radius.

Output: ~200 lineas agregadas al adapter, dormidas. El robot sigue funcionando identico hasta Plan 05.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-scraping-structural-v2/CONTEXT.md
@.planning/standalone/godentist-scraping-structural-v2/RESEARCH.md
@.planning/standalone/godentist-scraping-structural-v2/PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- Existing analogs in godentist-adapter.ts that the new methods replace/reference -->

<!-- Helpers from Plan 03 - REQUIRED prerequisites -->
- `this.readHidden(): Promise<string>` — returns `#idsucursalgrid.value`
- `this.readPageInputValue(): Promise<string>` — returns `input.x-tbar-page-number.value`
- `this.readFirstRowFingerprint(): Promise<{phone:string;hora:string}>` — fingerprint of first row
- `this.assertFilterIs(expectedId, when): Promise<void>` — throws FilterDriftError if mismatch
- `SEDE_ID_MAP: Record<string, string>` — module-level constant
- `PaginationStuckError` class — exported from same file

<!-- Phone normalization heuristic (existing in extractAppointments — preserve in extractCurrentPageRows) -->
- cell[5] is the phone column
- If cell[5].startsWith('3') and cell[5].length === 10, prefix '57' (Colombia)
- cell[1] is hora
- cell[3] is nombre (existing convention)
- cell[7] is doctor name
- DOCTOR_PRIORITY constant exists for doctor tiebreaks (imported at top)

<!-- Combo selection DOM contract (research-scripts/01-baseline-and-combo.cjs) -->
- Click visible combo input opens dropdown
- Dropdown shows .x-combo-list-item elements
- Filter visible items by :has-text(label)
- After click, #idsucursalgrid.value updates to numeric id within 0ms
- DON'T select combo input by id (dynamic ext-comp-XXXX per session)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Agregar selectSucursalF + clickBuscarAndWait metodos al adapter</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts lineas 1440-1530 (existing selectSucursal + clickBuscar para DOM contract + log convention)
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts lineas 1576-1740 (captureFingerprint + waitForSucursalRefresh para [GoDentist] log prefix + this.page!.evaluate pattern)
    - .planning/standalone/godentist-scraping-structural-v2/research-scripts/01-baseline-and-combo.cjs (combo opening + item-click DOM contract)
    - .planning/standalone/godentist-scraping-structural-v2/research-scripts/08-paradigm-f-validation.cjs (verified paradigm F flow)
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
**Localizar la closing brace `}` del metodo `assertFilterIs` (agregado en Plan 03 Task 2). Insertar los 2 nuevos metodos INMEDIATAMENTE DESPUES, dentro de la clase GoDentistAdapter:**

```typescript

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
```

**Style notes:**
- 2-espacios indent en file, 4 espacios en cuerpo de metodo de clase.
- SIN punto y coma final (verbatim del resto del archivo).
- `[GoDentist]` log prefix obligatorio en console.log.
- `this.page!.evaluate` + non-null assertion.
- Backticks para template strings.

**NO modificar:**
- Metodos existentes (selectSucursal viejo, clickBuscar viejo se mantienen, Plan 05 los marca LEGACY-DELETE).
- Otros metodos.
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit 2>&1 | tee /tmp/tsc-04-1.log | head -20; STATUS=$?; grep -c "private async selectSucursalF" src/adapters/godentist-adapter.ts; grep -c "private async clickBuscarAndWait" src/adapters/godentist-adapter.ts; grep -c "post-select-" src/adapters/godentist-adapter.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0.
    - `grep -c "private async selectSucursalF" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "private async clickBuscarAndWait" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - selectSucursalF llama a assertFilterIs: `grep -A 30 "private async selectSucursalF" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep -c "await this.assertFilterIs(expectedId,"` retorna `1`.
    - selectSucursalF usa el selector `.x-combo-list-item:visible:has-text`: `grep -c '.x-combo-list-item:visible:has-text' godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - clickBuscarAndWait usa waitForFunction (no waitForLoadState): `grep -A 10 "private async clickBuscarAndWait" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep -c "waitForFunction"` retorna `1`.
    - `[GoDentist]` log prefix presente en ambos metodos: `grep -c "\[GoDentist\] selectSucursalF\|\[GoDentist\] clickBuscarAndWait" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna al menos `4` (entrada + salida en cada metodo).
    - Los metodos viejos no fueron tocados: `grep -c "private async selectSucursal(" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna al menos `1` (legacy aun presente).
  </acceptance_criteria>

  <done>
    selectSucursalF + clickBuscarAndWait agregados a GoDentistAdapter. tsc pasa. assertFilterIs invocado en selectSucursalF post-select. Metodos viejos intactos.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Agregar clickNextPageWithGuard metodo con D-11 x-item-disabled defensa + retry pattern + PaginationStuckError</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts lineas 1818-1836 (clickNextPage viejo, para entender DOM del boton)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §1 "Pagination guard" (snippet completo verbatim)
    - .planning/standalone/godentist-scraping-structural-v2/RESEARCH.md §"Pagination guard" + §Common Pitfalls (x-item-disabled en table.x-btn ancestor)
    - .planning/standalone/godentist-scraping-structural-v2/research-scripts/08-paradigm-f-validation.cjs (verified pagination flow)
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
**Localizar la closing brace `}` del metodo `clickBuscarAndWait` (agregado en Task 1). Insertar INMEDIATAMENTE DESPUES, dentro de la clase GoDentistAdapter:**

```typescript

  /**
   * Per RESEARCH.md Paradigm F + CONTEXT.md D-11: clicks the next-page button
   * and verifies via waitForFunction that BOTH pageInput.value changed AND first
   * row phone+hora changed. 1 retry tras 500ms si la primera attempt timeout.
   * Si la retry tambien falla, throw PaginationStuckError.
   *
   * D-11 defense: x-item-disabled lives on the <table> ancestor of the button
   * (verified research-scripts/03-pagination-investigation.cjs). Check ancestor
   * BEFORE clicking to avoid burning a retry attempt on a known-disabled button.
   *
   * The new paradigm F should never enter this method if the previous page already
   * was the last (the outer loop checks `p < totalPages` before invoking). But the
   * defensive x-item-disabled check is mandated by D-11 regardless.
   */
  private async clickNextPageWithGuard(sede: string, currentPage: number, totalPages: number): Promise<void> {
    const fpBefore = await this.readFirstRowFingerprint()
    const pageBefore = await this.readPageInputValue()

    console.log(`[GoDentist] clickNextPageWithGuard ${sede}: page ${currentPage}/${totalPages}, pageBefore=${pageBefore}, fpBefore=${JSON.stringify(fpBefore)}`)

    const attemptClick = async (): Promise<boolean> => {
      const clicked = await this.page!.evaluate(() => {
        const btn = document.querySelector('button.x-tbar-page-next') as HTMLButtonElement | null
        if (!btn) return { clicked: false, reason: 'button-missing' }
        // D-11 defensive: x-item-disabled lives on <table> ancestor, not button.
        const ancestor = btn.closest('table.x-btn')
        if (ancestor?.classList.contains('x-item-disabled')) return { clicked: false, reason: 'disabled' }
        btn.click()
        return { clicked: true, reason: 'ok' }
      })

      if (!clicked.clicked) {
        console.warn(`[GoDentist] clickNextPageWithGuard ${sede}: cannot click (reason=${clicked.reason})`)
        return false
      }

      try {
        await this.page!.waitForFunction(({ pageBefore, fpBefore }: { pageBefore: string; fpBefore: { phone: string; hora: string } }) => {
          const pageInput = document.querySelector('input.x-tbar-page-number') as HTMLInputElement | null
          if (!pageInput) return false
          if (pageInput.value === pageBefore) return false
          const rt = document.querySelector('table.x-grid3-row-table')
          if (!rt) return false
          const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
          return (cells[5] || '') !== fpBefore.phone || (cells[1] || '') !== fpBefore.hora
        }, { pageBefore, fpBefore }, { timeout: 5000, polling: 100 })
        return true
      } catch {
        return false
      }
    }

    let ok = await attemptClick()
    if (!ok) {
      console.warn(`[GoDentist] clickNextPageWithGuard ${sede}: first attempt failed, retrying after 500ms`)
      await this.page!.waitForTimeout(500)
      ok = await attemptClick()
    }
    if (!ok) {
      const pageAfter = await this.readPageInputValue()
      console.error(`[GoDentist] clickNextPageWithGuard ${sede}: PaginationStuckError pageBefore=${pageBefore} pageAfter=${pageAfter}`)
      throw new PaginationStuckError(sede, currentPage, totalPages, pageBefore, pageAfter)
    }
    // Defensive settle for ExtJS row painting.
    await this.page!.waitForTimeout(500)

    console.log(`[GoDentist] clickNextPageWithGuard ${sede}: advanced page ${currentPage} -> ${currentPage + 1}`)
  }
```

**Style notes:**
- 2-espacios indent en file (4 para cuerpos de metodo).
- SIN punto y coma final.
- `[GoDentist]` log prefix obligatorio. console.warn para casos non-fatal, console.error para fatal.
- waitForFunction recibe segundo arg como objeto serializable (NO closures con `this`).
- `as HTMLButtonElement | null` (type-safe queryselectors).
- Backticks para template strings.

**NO modificar:**
- clickNextPage viejo (lines 1818-1836) — Plan 05 lo borra.
- Otros metodos.
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit 2>&1 | tee /tmp/tsc-04-2.log | head -20; STATUS=$?; grep -c "private async clickNextPageWithGuard" src/adapters/godentist-adapter.ts; grep -c "x-item-disabled" src/adapters/godentist-adapter.ts; grep -c "closest('table.x-btn')" src/adapters/godentist-adapter.ts; grep -c "throw new PaginationStuckError" src/adapters/godentist-adapter.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0.
    - `grep -c "private async clickNextPageWithGuard" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - D-11 check presente: `grep -c "closest('table.x-btn')" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - x-item-disabled check presente: `grep -A 30 "private async clickNextPageWithGuard" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep -c "x-item-disabled"` retorna `1`.
    - waitForFunction con timeout 5000: `grep -A 50 "private async clickNextPageWithGuard" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep -c "timeout: 5000"` retorna `1`.
    - Retry pattern: `grep -A 60 "private async clickNextPageWithGuard" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep -c "let ok = await attemptClick()"` retorna `1`.
    - PaginationStuckError throw: `grep -c "throw new PaginationStuckError(sede, currentPage, totalPages, pageBefore, pageAfter)" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - clickNextPage viejo aun presente (Plan 05 lo borra): `grep -c "private async clickNextPage(" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna al menos `1`.
  </acceptance_criteria>

  <done>
    clickNextPageWithGuard agregado con D-11 defensa + 1 retry + PaginationStuckError. tsc pasa. clickNextPage viejo intacto.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Agregar extractCurrentPageRows metodo (replace de extractAppointments con sede como argumento explicito)</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts linea 1840+ (extractAppointments viejo, body completo, para entender DOM cell parsing + phone normalization + doctor priority)
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts lineas 1-10 (DOCTOR_PRIORITY import, para confirmar que esta disponible)
    - .planning/standalone/godentist-scraping-structural-v2/research-scripts/07-extjs-grid-dom-cache.cjs (DOM cache hypothesis REFUTED, pero filter offsetParent es defensa redundante)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §1 (LEGACY-DELETE list y rename rationale)
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
**Localizar la closing brace `}` del metodo `clickNextPageWithGuard` (agregado en Task 2). Insertar INMEDIATAMENTE DESPUES, dentro de la clase GoDentistAdapter:**

**Estrategia:** copiar la BODY del metodo viejo `extractAppointments(sucursal: string)` (lineas ~1840+) preservando la logica de cell heuristic, phone normalization y doctor priority. Cambiar solo:
1. Nombre: `extractCurrentPageRows` (en vez de `extractAppointments` — el nuevo nombre clarifica que opera sobre la pagina actual, no todas las paginas).
2. Parametro: `sede: string` (en vez de `sucursal: string` — la sede viene del caller verified-filter, no del loop).
3. Filtro adicional: solo extraer rows donde `offsetParent !== null` (defensa redundante contra DOM cache).
4. Etiqueta cada Appointment con `sucursal: sede` (preserved — pero ahora "sede" viene del filter state, no del loop iteration).

**Bloque a insertar:**

```typescript

  /**
   * Per RESEARCH.md Paradigm F: extracts rows from the CURRENT page of the citas
   * table, tagging each with the `sede` argument (which the caller has verified
   * via assertFilterIs matches the active filter).
   *
   * Replaces extractAppointments(sucursal) for paradigm F. Same DOM contract
   * (cell heuristic: hora=cells[1], nombre=cells[3], phone=cells[5], doctor=cells[7])
   * + same phone normalization (3xxxxxxxxx -> 57xxxxxxxxxx) + same DOCTOR_PRIORITY
   * tiebreak.
   *
   * Defensive filter: `tr.offsetParent !== null` excludes hidden rows that some
   * ExtJS configurations cache off-screen (research-scripts/07-extjs-grid-dom-cache.cjs
   * REFUTED the hypothesis that hidden rows exist in this portal, but the filter
   * stays as cheap defense-in-depth).
   */
  private async extractCurrentPageRows(sede: string): Promise<Appointment[]> {
    console.log(`[GoDentist] extractCurrentPageRows: sede=${sede}`)

    const rawRows = await this.page!.evaluate(() => {
      const rt = document.querySelector('table.x-grid3-row-table')
      if (!rt) return [] as Array<{ cells: string[] }>
      const trs = Array.from(rt.querySelectorAll('tr')) as HTMLElement[]
      // Defensive: only visible rows.
      const visible = trs.filter(tr => tr.offsetParent !== null)
      return visible.map(tr => ({
        cells: Array.from(tr.querySelectorAll('td')).map(c => (c.textContent || '').trim()),
      }))
    })

    const appointments: Appointment[] = []
    for (const row of rawRows) {
      const cells = row.cells
      const hora = cells[1] || ''
      const nombre = cells[3] || ''
      let telefono = cells[5] || ''
      const doctorRaw = cells[7] || ''
      const estado = cells[9] || ''

      // Skip rows with missing core fields (header rows, separator rows).
      if (!hora || !nombre || !telefono) continue

      // Phone normalization (preserved from legacy extractAppointments).
      if (telefono.startsWith('3') && telefono.length === 10) {
        telefono = `57${telefono}`
      }

      // Doctor name (preserved tiebreak heuristic — pick first DOCTOR_PRIORITY match if multiple).
      let doctor = doctorRaw
      for (const priority of DOCTOR_PRIORITY) {
        if (doctorRaw.toUpperCase().includes(priority.toUpperCase())) {
          doctor = priority
          break
        }
      }

      appointments.push({
        nombre,
        telefono,
        hora,
        sucursal: sede,
        doctor,
        estado,
      })
    }

    console.log(`[GoDentist] extractCurrentPageRows: extracted ${appointments.length} rows for sede=${sede}`)
    return appointments
  }
```

**Style notes:**
- 2-espacios indent (4 para cuerpo de metodo de clase).
- SIN punto y coma final.
- `[GoDentist]` log prefix obligatorio.
- `as HTMLElement[]` cast cuando es necesario.
- Backticks para template strings.

**NO modificar:**
- extractAppointments viejo (Plan 05 lo borra). Verificar que sigue ahi tras este Task.
- Otros metodos.
- Tipos `Appointment` (importado desde ../types/index.js — la shape `{ nombre, telefono, hora, sucursal, doctor, estado }` es la existente).
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit 2>&1 | tee /tmp/tsc-04-3.log | head -20; STATUS=$?; grep -c "private async extractCurrentPageRows(sede: string): Promise<Appointment\[\]>" src/adapters/godentist-adapter.ts; grep -c "offsetParent !== null" src/adapters/godentist-adapter.ts; grep -c "private async extractAppointments(" src/adapters/godentist-adapter.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0.
    - `grep -c "private async extractCurrentPageRows(sede: string): Promise<Appointment\[\]>" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - Filter offsetParent presente: `grep -A 30 "private async extractCurrentPageRows" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep -c "offsetParent !== null"` retorna `1`.
    - Phone normalization preservada: `grep -A 40 "private async extractCurrentPageRows" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep -c "telefono.startsWith('3') && telefono.length === 10"` retorna `1`.
    - DOCTOR_PRIORITY usado: `grep -A 50 "private async extractCurrentPageRows" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep -c "for (const priority of DOCTOR_PRIORITY)"` retorna `1`.
    - sucursal tagged from `sede` argument (no loop label): `grep -A 60 "private async extractCurrentPageRows" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep -c "sucursal: sede"` retorna `1`.
    - extractAppointments viejo aun presente (Plan 05 lo borra): `grep -c "private async extractAppointments(" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna al menos `1`.
    - `[GoDentist] extractCurrentPageRows` log presente: `grep -c "\[GoDentist\] extractCurrentPageRows" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna al menos `2`.
  </acceptance_criteria>

  <done>
    extractCurrentPageRows agregado con `sede` argument explicito + offsetParent filter + phone normalization + DOCTOR_PRIORITY. tsc pasa. extractAppointments viejo intacto.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Robot adapter <-> Portal Dentos | Nuevos selectors CSS (.x-combo-list-item:visible:has-text, button.x-tbar-page-next, table.x-grid3-row-table). Sin nuevas requests HTTP. |
| GoDentistAdapter clase <-> consumer (server.ts) | Nuevos metodos privados; sin nuevos exports. Sin cambio de superficie. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-04-01 | Tampering | DOM selector strings hardcoded | accept | Selectors derivados de research empirico verificado (8 scripts). Si Dentos cambia HTML, FilterDriftError/PaginationStuckError dispararan (canary). |
| T-v2-04-02 | Denial of service | Multiple waitForFunction calls per scrape | mitigate | Cada waitForFunction tiene timeout explicito (5-8s) + polling 100ms. Total overhead esperado: ~3-4s adicionales por sede (verified en RESEARCH.md). Aceptable para scrape diario. |
| T-v2-04-03 | Information disclosure | PaginationStuckError.message incluye pageInputBefore/pageInputAfter (sin PII) | accept | Solo strings numericos. Sin PII en el message. |
| T-v2-04-04 | Information disclosure | Console logs incluyen `fpBefore` (phone+hora del primer row) | mitigate | Logs van a Railway, accesibles solo al developer (CLI). No expuestos al cliente. Mismo nivel de exposicion que logs existentes. |
</threat_model>

<verification>
- tsc --noEmit pasa sin errores.
- 4 metodos nuevos presentes (greps arriba).
- D-11 x-item-disabled check en el ancestor table.x-btn.
- PaginationStuckError throw tras retry fallido.
- extractCurrentPageRows recibe sede como argumento explicito (no del loop).
- Style verbatim del archivo (indent, sin `;`, JSDoc, `[GoDentist]` log prefix).
- Metodos viejos (selectSucursal, clickBuscar, clickNextPage, extractAppointments) intactos.
</verification>

<success_criteria>
- [ ] Task 1: selectSucursalF + clickBuscarAndWait agregados con assertFilterIs invocado.
- [ ] Task 2: clickNextPageWithGuard agregado con D-11 + retry + PaginationStuckError.
- [ ] Task 3: extractCurrentPageRows agregado con offsetParent filter + sede arg explicito.
- [ ] tsc --noEmit pasa sin errores.
- [ ] No call sites externos a estos metodos todavia (Plan 05 los wirea).
- [ ] Robot Railway sigue funcionando con paradigm A (legacy intacto).
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/04-SUMMARY.md` con:
- Lista de los 4 metodos agregados con line numbers exactos.
- Output de `tsc --noEmit` (debe ser empty/no errors).
- Confirmacion que metodos viejos (selectSucursal, clickBuscar, clickNextPage, extractAppointments) siguen intactos.
- Nota: "Plan 05 puede ahora reescribir scrapeAppointments para usar paradigm F + borrar metodos legacy."
</output>
</content>
</invoke>