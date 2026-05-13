---
phase: godentist-scraping-structural-v2
plan: 05
type: execute
wave: 2
depends_on: [03, 04]
files_modified:
  - godentist/robot-godentist/src/adapters/godentist-adapter.ts
  - godentist/robot-godentist/src/api/server.ts
autonomous: true
requirements:
  - D-01
  - D-03
  - D-05
  - D-07
  - D-11

must_haves:
  truths:
    - "El metodo scrapeAppointments de GoDentistAdapter usa page.goto(APPOINTMENTS_URL) fresh per sede + selectSucursalF + clickBuscarAndWait + assertFilterIs + clickNextPageWithGuard + extractCurrentPageRows"
    - "El metodo scrapeAppointments propaga FilterDriftError y PaginationStuckError sin try/catch (re-throw inside the catch block when instanceof matches)"
    - "Los metodos legacy paradigm A (waitForSucursalRefresh, captureFingerprint, discoverSucursales, extractAllPages, clickNextPage, extractAppointments) estan eliminados del adapter (LEGACY-DELETE list)"
    - "Las constantes legacy SUCURSAL_REFRESH_TIMEOUT_MS, SUCURSAL_REFRESH_POLL_MS y la interface Fingerprint + funcion fingerprintsEqual estan eliminadas"
    - "El Express handler en server.ts mapea FilterDriftError a HTTP 502 con code='filter_drift' y PaginationStuckError a HTTP 502 con code='pagination_stuck', ambos ANTES del catch-all 500"
    - "server.ts importa FilterDriftError y PaginationStuckError desde el adapter"
    - "El TypeScript del robot compila sin errores (tsc --noEmit pasa)"
  artifacts:
    - path: "godentist/robot-godentist/src/adapters/godentist-adapter.ts"
      provides: "Paradigm F implementation of scrapeAppointments + cleanup of legacy paradigm A code"
      contains:
        - "page.goto(APPOINTMENTS_URL"
        - "await this.selectSucursalF"
        - "await this.clickBuscarAndWait"
        - "await this.assertFilterIs"
        - "await this.clickNextPageWithGuard"
        - "await this.extractCurrentPageRows"
        - "SEDE_ID_MAP"
    - path: "godentist/robot-godentist/src/api/server.ts"
      provides: "Discriminated HTTP 502 responses for FilterDriftError and PaginationStuckError"
      contains:
        - "FilterDriftError"
        - "PaginationStuckError"
        - "code: 'filter_drift'"
        - "code: 'pagination_stuck'"
        - "res.status(502)"
  key_links:
    - from: "godentist-adapter.ts:scrapeAppointments (paradigm F)"
      to: "selectSucursalF + clickBuscarAndWait + clickNextPageWithGuard + extractCurrentPageRows (Plan 04 helpers)"
      via: "method calls + assertFilterIs postconditions"
      pattern: "this\\.(selectSucursalF|clickBuscarAndWait|clickNextPageWithGuard|extractCurrentPageRows|assertFilterIs)"
    - from: "server.ts handler"
      to: "FilterDriftError + PaginationStuckError classes (Plan 03)"
      via: "instanceof discriminator + HTTP 502 response"
      pattern: "instanceof (FilterDriftError|PaginationStuckError)"
---

<objective>
Switch al paradigm F: reescribir scrapeAppointments, eliminar paradigm A legacy, mapear los 2 nuevos errores a HTTP 502 en el Express handler.

1. **Rewrite `scrapeAppointments`** (current ~lines 240-301): el loop nuevo hace `page.goto(APPOINTMENTS_URL)` antes de cada sede (D-07 fresh state), llama selectSucursalF + clickBuscarAndWait, ejecuta assertFilterIs en 3 momentos (post-select, post-buscar, pre-page), pagina con clickNextPageWithGuard, extrae rows via extractCurrentPageRows. Propaga FilterDriftError y PaginationStuckError verbatim.
2. **DELETE legacy paradigm A code**:
   - Methods: `waitForSucursalRefresh`, `captureFingerprint`, `discoverSucursales`, `extractAllPages`, `clickNextPage`, `extractAppointments`, `getTotalPages` (wait — `getTotalPages` se mantiene como helper, ya que paradigm F lo usa; verificar antes de borrar).
   - Module-level: `SUCURSAL_REFRESH_TIMEOUT_MS`, `SUCURSAL_REFRESH_POLL_MS`, `interface Fingerprint`, `function fingerprintsEqual`.
   - `SedeRefreshFailedError` class se mantiene (exportada) — no es invocada en paradigm F pero por safety si algun otro consumer la importa. (PATTERNS §1 LEGACY-DELETE list says: "keep file present if anything else imports, but scrape flow no longer throws it; safe to delete if no consumer". Plan 05 hace `grep` para confirmar.)
3. **Express handler mapping** in `server.ts`: agregar `instanceof FilterDriftError` y `instanceof PaginationStuckError` blocks BEFORE el catch-all 500. Importar las 2 clases.

Purpose: Este es el switch. Despues de este plan + push a Railway, el robot ejecuta paradigm F. CLAUDE.md REGLA 1 mandata push a Vercel/Railway tras cambios; el push a Railway sucede en el commit que cierra este plan (el commit unificado al final del standalone — Plan 11 — incluye este).

Output: ~80 lineas nuevas en scrapeAppointments + ~300 lineas borradas de legacy + ~20 lineas en server.ts. Sin commit todavia (commit unificado en Plan 11).
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
<!-- Current scrapeAppointments (LEGACY paradigm A — lines 240-301) — to be REPLACED entirely -->
```typescript
async scrapeAppointments(filterSucursales?: string[], targetDate?: string): Promise<{ date: string; appointments: Appointment[]; errors: string[] }> {
  // ... existing body: for (sucursal of sucursales) { selectSucursal + waitForSucursalRefresh + extractAllPages }
}
```

<!-- Helpers from Plans 03+04 to consume -->
- SEDE_ID_MAP module-level constant
- this.readHidden, this.readPageInputValue, this.readFirstRowFingerprint, this.readTotalCitas, this.assertFilterIs
- this.selectSucursalF, this.clickBuscarAndWait, this.clickNextPageWithGuard, this.extractCurrentPageRows
- this.formatDateDD_MM_YYYY (existing)
- this.setDate (existing)
- this.setHour (existing)
- this.getTotalPages (existing, returns number | null — paradigm F uses this; verify it does NOT depend on paradigm A code)
- APPOINTMENTS_URL module-level constant
- FilterDriftError, PaginationStuckError classes (Plan 03)

<!-- Server.ts existing pattern (lines 4 + 74-88) — to extend -->
```typescript
import { GoDentistAdapter, SedeRefreshFailedError } from '../adapters/godentist-adapter.js'

// In catch block of POST /api/scrape-appointments:
if (err instanceof SedeRefreshFailedError) {
  res.status(502).json({ success: false, status: 'error', code: 'sede_refresh_failed', ... })
  return
}
// catch-all 500 at line 90:
res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Reescribir el cuerpo de scrapeAppointments con paradigm F (in-place replacement)</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts lineas 240-310 (scrapeAppointments viejo, body completo)
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts lineas 1539-1575 (getTotalPages existing — confirmar que es reusable en paradigm F sin tocar)
    - .planning/standalone/godentist-scraping-structural-v2/RESEARCH.md §"Fresh-state-per-sede scraping" (snippet completo verbatim)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §1 "Core pattern (paradigm F)" (snippet verbatim)
    - .planning/standalone/godentist-scraping-structural-v2/research-scripts/08-paradigm-f-validation.cjs (verified flow)
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
**Localizar el metodo `scrapeAppointments` (alrededor de la linea 240 — buscar `async scrapeAppointments(filterSucursales`). Reemplazar el cuerpo COMPLETO (incluyendo signature) con la siguiente implementacion paradigm F:**

```typescript
  async scrapeAppointments(filterSucursales?: string[], targetDate?: string): Promise<{ date: string; appointments: Appointment[]; errors: string[]; totalCitas: number | null }> {
    const allRows: Appointment[] = []
    const errors: string[] = []
    const date = targetDate || new Date().toISOString().slice(0, 10)
    const dateStr = this.formatDateDD_MM_YYYY(date)

    // Per CONTEXT.md D-07: correctness by construction via fresh state per sede.
    // Per RESEARCH.md Paradigm F: page.goto(APPOINTMENTS_URL) before each sede eliminates
    // ALL inter-sede state contamination (verified 5/5 PASS in 8-paradigm-f-validation.cjs).

    const sedesToScrape = filterSucursales ?? Object.keys(SEDE_ID_MAP)
    let lastTotalCitas: number | null = null

    console.log(`[GoDentist] scrapeAppointments (paradigm F): sedes=${JSON.stringify(sedesToScrape)} date=${date}`)

    for (const sede of sedesToScrape) {
      const expectedId = SEDE_ID_MAP[sede]
      if (!expectedId) {
        const msg = `Unknown sede: ${sede} (not in SEDE_ID_MAP)`
        console.warn(`[GoDentist] ${msg}`)
        errors.push(msg)
        continue
      }

      try {
        // FRESH NAVIGATION — eliminates ALL inter-sede state.
        console.log(`[GoDentist] scrapeAppointments: fresh-nav for sede=${sede}`)
        await this.page!.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
        await this.page!.waitForTimeout(2000)

        // Form setup.
        await this.setDate(dateStr)
        await this.setHour('6:00 am')

        // Selector sede only if NOT already at expectedId post-nav.
        // (Default post-nav is CABECERA=1; skip select for sede=CABECERA to save 500ms.)
        const currentHidden = await this.readHidden()
        if (currentHidden !== expectedId) {
          await this.selectSucursalF(sede, expectedId)
        } else {
          console.log(`[GoDentist] scrapeAppointments: ${sede} already active (skipping selectSucursalF)`)
        }
        await this.assertFilterIs(expectedId, `post-select-${sede}`)

        // Search.
        await this.clickBuscarAndWait()
        await this.assertFilterIs(expectedId, `post-buscar-${sede}`)

        // Audit total citas (D-15 sanity check).
        const sedeTotalCitas = await this.readTotalCitas()
        if (sedeTotalCitas !== null) {
          lastTotalCitas = (lastTotalCitas ?? 0) + sedeTotalCitas
          console.log(`[GoDentist] ${sede}: total citas (toolbar) = ${sedeTotalCitas}`)
        }

        // Paginate.
        const totalPages = (await this.getTotalPages()) ?? 1
        console.log(`[GoDentist] ${sede}: totalPages=${totalPages}`)
        for (let p = 1; p <= totalPages; p++) {
          await this.assertFilterIs(expectedId, `page-${p}-${sede}`)
          const rows = await this.extractCurrentPageRows(sede)
          allRows.push(...rows)
          if (p < totalPages) {
            await this.clickNextPageWithGuard(sede, p, totalPages)
          }
        }
      } catch (err) {
        // Propagate paradigm F errors verbatim to Express handler for HTTP 502 mapping.
        if (err instanceof FilterDriftError || err instanceof PaginationStuckError) {
          console.error(`[GoDentist] scrapeAppointments: propagating ${err.name}`, err.message)
          throw err
        }
        const msg = `${sede}: ${err instanceof Error ? err.message : String(err)}`
        console.error(`[GoDentist] ${msg}`)
        errors.push(msg)
      }
    }

    console.log(`[GoDentist] scrapeAppointments done: ${allRows.length} appointments, ${errors.length} errors, totalCitas=${lastTotalCitas}`)
    return { date, appointments: allRows, errors, totalCitas: lastTotalCitas }
  }
```

**IMPORTANTE — Cambios en el retorno:**
- El tipo de retorno tiene un campo nuevo `totalCitas: number | null` (D-15 audit). Esto cambia el contrato con server.ts. Plan 05 Task 3 (server.ts) lee este campo y lo expone en `ScrapeAppointmentsResponse`. Plan 06 (server-action) lo persiste en `godentist_scrape_history.total_citas`.

**Style notes:**
- 2-espacios indent (4 en cuerpo de metodo de clase).
- SIN punto y coma final.
- `[GoDentist]` log prefix obligatorio.
- Comentarios en ingles para CONTEXT.md y RESEARCH.md refs (consistente con resto del archivo en ingles aunque comentarios SQL/CONTEXT en espanol).
- Backticks para template strings.

**NO modificar en este Task:**
- Los metodos privados (selectSucursalF, clickBuscarAndWait, clickNextPageWithGuard, extractCurrentPageRows, helpers) — Task 2 borra los legacy.
- Express handler — Task 3.
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit 2>&1 | tee /tmp/tsc-05-1.log | head -20; STATUS=$?; grep -c "page.goto(APPOINTMENTS_URL" src/adapters/godentist-adapter.ts; grep -c "await this.selectSucursalF" src/adapters/godentist-adapter.ts; grep -c "await this.clickBuscarAndWait" src/adapters/godentist-adapter.ts; grep -c "await this.clickNextPageWithGuard" src/adapters/godentist-adapter.ts; grep -c "await this.extractCurrentPageRows" src/adapters/godentist-adapter.ts; grep -c "instanceof FilterDriftError || err instanceof PaginationStuckError" src/adapters/godentist-adapter.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0.
    - `grep -c "this.page!.goto(APPOINTMENTS_URL" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1` (paradigm F fresh-nav).
    - `grep -c "await this.selectSucursalF" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "await this.clickBuscarAndWait" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "await this.clickNextPageWithGuard" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "await this.extractCurrentPageRows" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - assertFilterIs invocado en 3 momentos: `grep -c "post-select-\|post-buscar-\|page-\${p}-" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna al menos `3`.
    - Propagacion de errores paradigm F: `grep -c "instanceof FilterDriftError || err instanceof PaginationStuckError" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - El metodo retorna `totalCitas`: `grep -c "totalCitas: number | null" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna al menos `1`.
    - El metodo viejo NO esta duplicado: `grep -c "async scrapeAppointments(filterSucursales" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
  </acceptance_criteria>

  <done>
    scrapeAppointments reescrito con paradigm F. tsc pasa. Tipo de retorno extendido con totalCitas. FilterDriftError + PaginationStuckError propagados.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Eliminar codigo legacy paradigm A del adapter (LEGACY-DELETE)</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts COMPLETO con foco en lineas 1440-1900 (los metodos a borrar)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §1 "LEGACY-DELETE list" (lista exacta a borrar)
    - .planning/standalone/godentist-scraping-structural-v2/RESEARCH.md §"Implementation Roadmap" Wave 1 (confirmacion de removal)
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
**Eliminar los siguientes simbolos del adapter. PRECAUCION: NO borrar nada que aun se use por otros metodos. Tras borrar, ejecutar `tsc --noEmit` despues de cada eliminacion para detectar deps inadvertidas.**

**Estrategia incremental:**

1. **Borrar `extractAppointments(sucursal: string)`** (la version legacy que tomaba sucursal como label del loop, ~linea 1840+). Es reemplazado por `extractCurrentPageRows`.

2. **Borrar `clickNextPage()`** (~lineas 1818-1836). Reemplazado por `clickNextPageWithGuard`.

3. **Borrar `extractAllPages()`** (~lineas 1749-1777). Reemplazado por el loop inline `for p = 1..totalPages` en scrapeAppointments.

4. **Borrar `waitForSucursalRefresh()`** (~lineas 1640-1740). Reemplazado por `assertFilterIs` + page.goto fresh-nav.

5. **Borrar `captureFingerprint()`** (~lineas 1576-1620). Reemplazado por `readFirstRowFingerprint` (Plan 03 — diferente shape, mas simple).

6. **Borrar `discoverSucursales()`** (~lineas 1463-1511). Reemplazado por iteracion sobre keys de SEDE_ID_MAP.

7. **Borrar `selectSucursal(sucursal: Sucursal)` viejo** (lineas ~1448-1470). Reemplazado por `selectSucursalF(label, expectedId)`. CUIDADO: si algun otro metodo lo usa (revisar `confirmAppointment` u otros endpoints), NO borrar — preservar y dejar TODO comment. Verificar con: `grep -n "this.selectSucursal(" godentist/robot-godentist/src/adapters/godentist-adapter.ts` ANTES de borrar.

8. **Borrar `clickBuscar()` viejo** (si existe — buscar con grep). Reemplazado por `clickBuscarAndWait`. Mismo cuidado de paso 7.

9. **Borrar module-level legacy**:
   - `const SUCURSAL_REFRESH_TIMEOUT_MS = 8000` (linea ~21)
   - `const SUCURSAL_REFRESH_POLL_MS = 250` (linea ~22)
   - `interface Fingerprint { ... }` (lineas ~29-33)
   - `function fingerprintsEqual(a, b)` (lineas ~38-42)

10. **NO BORRAR** (verificar que siguen presentes):
    - `getTotalPages()` — usado por scrapeAppointments paradigm F.
    - `formatDateDD_MM_YYYY()` — usado por scrapeAppointments paradigm F + login.
    - `setDate()`, `setHour()` — usados por scrapeAppointments paradigm F.
    - `login()`, `init()`, `close()`, `takeScreenshot()` — usados por server.ts.
    - `SedeRefreshFailedError` class — verificar si algun consumer la importa con `grep -rn "SedeRefreshFailedError" godentist/robot-godentist/src/ src/ 2>/dev/null`. Si solo aparece en adapter+server.ts, eliminar del adapter Y del server.ts catch block (paradigm F no la usa). Si aparece en otros lugares, MANTENER en el adapter (export inerte) y QUITAR su catch block del server.ts (Task 3 lo cubre).

**Workflow recomendado:**
```bash
# Before deletes — capture file size for sanity
wc -l godentist/robot-godentist/src/adapters/godentist-adapter.ts

# Delete each symbol one at a time, then run tsc
# Use sed or manual edits with the Edit tool

# After each delete:
cd godentist/robot-godentist && npx tsc --noEmit
# If errors mention a deleted symbol, INVESTIGATE — may be consumer elsewhere

# Final check
wc -l godentist/robot-godentist/src/adapters/godentist-adapter.ts
# Expected: ~1500-1700 lines (down from 1988)
```

**Style notes:**
- Despues de borrar metodos, dejar 1 linea en blanco entre los metodos restantes (consistente con resto del file).
- SIN punto y coma final.
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit 2>&1 | tee /tmp/tsc-05-2.log | head -30; STATUS=$?; echo "--- Verifying deletions ---"; grep -c "private async waitForSucursalRefresh\|private async captureFingerprint\|private async discoverSucursales\|private async extractAllPages\|private async clickNextPage(\|private async extractAppointments(" src/adapters/godentist-adapter.ts; echo "--- Verifying preservations ---"; grep -c "private async getTotalPages\|formatDateDD_MM_YYYY\|private async setDate\|private async setHour\|async login()\|async init()" src/adapters/godentist-adapter.ts; echo "--- Module-level legacy gone ---"; grep -c "SUCURSAL_REFRESH_TIMEOUT_MS\|SUCURSAL_REFRESH_POLL_MS\|interface Fingerprint\|function fingerprintsEqual" src/adapters/godentist-adapter.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0.
    - LEGACY ELIMINADOS — los siguientes greps deben retornar `0`:
      - `grep -c "private async waitForSucursalRefresh" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 0
      - `grep -c "private async captureFingerprint" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 0
      - `grep -c "private async discoverSucursales" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 0
      - `grep -c "private async extractAllPages" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 0
      - `grep -c "private async clickNextPage(" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 0 (clickNextPageWithGuard si esta presente; clickNextPage solo NO)
      - `grep -c "private async extractAppointments(" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 0 (extractCurrentPageRows si presente; extractAppointments solo NO)
      - `grep -c "SUCURSAL_REFRESH_TIMEOUT_MS\|SUCURSAL_REFRESH_POLL_MS" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 0
      - `grep -c "interface Fingerprint {" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 0
      - `grep -c "function fingerprintsEqual" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 0
    - PRESERVADOS — los siguientes greps deben retornar al menos `1`:
      - `grep -c "private async getTotalPages\|getTotalPages()" godentist/robot-godentist/src/adapters/godentist-adapter.ts` >= 1
      - `grep -c "formatDateDD_MM_YYYY" godentist/robot-godentist/src/adapters/godentist-adapter.ts` >= 1
      - `grep -c "async setDate\|async setHour" godentist/robot-godentist/src/adapters/godentist-adapter.ts` >= 2
      - `grep -c "async login()\|async init()\|async close()" godentist/robot-godentist/src/adapters/godentist-adapter.ts` >= 3
    - Line count: `wc -l godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna entre 1500-1850 (down from 1988).
  </acceptance_criteria>

  <done>
    Codigo legacy paradigm A eliminado. tsc pasa. Robot esta limpio: solo paradigm F. Adapter va de ~1988 lineas a ~1500-1850.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Actualizar server.ts para mapear FilterDriftError + PaginationStuckError a HTTP 502</name>

  <read_first>
    - godentist/robot-godentist/src/api/server.ts COMPLETO (254 lineas)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §2 "Express handler error mapping" (snippet completo verbatim)
    - .planning/standalone/godentist-scraping-structural-v2/RESEARCH.md §"Implementation Roadmap" Wave 1
  </read_first>

  <files>godentist/robot-godentist/src/api/server.ts</files>

  <action>
**Cambio 1 — Imports (linea 4):**

Reemplazar:
```typescript
import { GoDentistAdapter, SedeRefreshFailedError } from '../adapters/godentist-adapter.js'
```

Con:
```typescript
import { GoDentistAdapter, SedeRefreshFailedError, FilterDriftError, PaginationStuckError } from '../adapters/godentist-adapter.js'
```

**Cambio 2 — Response shape (lineas 61-67):**

Localizar el bloque que arma `ScrapeAppointmentsResponse` (lineas ~61-67):
```typescript
const response: ScrapeAppointmentsResponse = {
  success: true,
  date: result.date,
  totalAppointments: result.appointments.length,
  appointments: result.appointments,
  errors: result.errors.length > 0 ? result.errors : undefined,
}
```

Agregar `totalCitas` al objeto (de D-15 audit que paradigm F retorna):
```typescript
const response: ScrapeAppointmentsResponse = {
  success: true,
  date: result.date,
  totalAppointments: result.appointments.length,
  appointments: result.appointments,
  errors: result.errors.length > 0 ? result.errors : undefined,
  totalCitas: result.totalCitas ?? undefined,
}
```

**NOTA SOBRE EL TIPO:** Si `ScrapeAppointmentsResponse` no tiene `totalCitas`, hay que agregarlo en `godentist/robot-godentist/src/types/index.ts`. Verificar con:
```bash
grep -n "totalCitas\|interface ScrapeAppointmentsResponse" godentist/robot-godentist/src/types/index.ts
```
Si no existe, agregar `totalCitas?: number | null` al type. Si el tipo TS lo rechaza, este Task incluye la modificacion al types file. tsc --noEmit es el gate definitivo.

**Cambio 3 — Catch block error mapping (lineas 74-93):**

Localizar el bloque catch del handler `POST /api/scrape-appointments`:
```typescript
} catch (err) {
  console.error('[Server] Scrape error:', err)
  await adapter.takeScreenshot('server-error')

  if (err instanceof SedeRefreshFailedError) { ... }

  res.status(500).json({ ... })
}
```

Reemplazar con:
```typescript
} catch (err) {
  console.error('[Server] Scrape error:', err)
  await adapter.takeScreenshot('server-error')

  // Per CONTEXT.md D-07 + RESEARCH.md Paradigm F: FilterDriftError thrown by
  // assertFilterIs when #idsucursalgrid.value !== expectedId. Maps to HTTP 502 —
  // semantically correct because the portal Dentos (upstream) didn't apply our filter.
  if (err instanceof FilterDriftError) {
    res.status(502).json({
      success: false,
      status: 'error',
      code: 'filter_drift',
      sede: err.sede,
      expectedId: err.expectedId,
      actualId: err.actualId,
      when: err.when,
      error: err.message,
    })
    return
  }

  // Per CONTEXT.md D-11 + RESEARCH.md Paradigm F: PaginationStuckError thrown by
  // clickNextPageWithGuard after retry. Maps to HTTP 502.
  if (err instanceof PaginationStuckError) {
    res.status(502).json({
      success: false,
      status: 'error',
      code: 'pagination_stuck',
      sede: err.sede,
      currentPage: err.currentPage,
      totalPages: err.totalPages,
      pageInputBefore: err.pageInputBefore,
      pageInputAfter: err.pageInputAfter,
      error: err.message,
    })
    return
  }

  // Legacy paradigm A error class — kept for backward compatibility with any
  // external consumers. Paradigm F does NOT throw this anymore (no callers in adapter).
  if (err instanceof SedeRefreshFailedError) {
    res.status(502).json({
      success: false,
      status: 'error',
      code: 'sede_refresh_failed',
      sucursal: err.sucursal,
      attempts: err.attempts,
      error: err.message,
    })
    return
  }

  res.status(500).json({
    success: false,
    error: err instanceof Error ? err.message : 'Unknown error',
  })
}
```

**ORDEN CRITICAL:** los `instanceof` checks deben ir ANTES del catch-all `res.status(500)`. PATTERNS.md §2 Risks: "Order matters: instanceof checks must come BEFORE the generic res.status(500) catch-all".

**Style notes:**
- Indent del archivo (verificar con `head -20 godentist/robot-godentist/src/api/server.ts`).
- Punto y coma final si el resto del archivo lo usa (verificar; server.ts probablemente SI usa `;` — distinto del adapter).
- Backticks o single-quotes consistente con el archivo.
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit 2>&1 | tee /tmp/tsc-05-3.log | head -20; STATUS=$?; grep -c "FilterDriftError, PaginationStuckError" src/api/server.ts; grep -c "instanceof FilterDriftError" src/api/server.ts; grep -c "instanceof PaginationStuckError" src/api/server.ts; grep -c "code: 'filter_drift'" src/api/server.ts; grep -c "code: 'pagination_stuck'" src/api/server.ts; grep -c "totalCitas" src/api/server.ts; exit $STATUS</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0.
    - Import actualizado: `grep -c "import { GoDentistAdapter, SedeRefreshFailedError, FilterDriftError, PaginationStuckError }" godentist/robot-godentist/src/api/server.ts` retorna `1`.
    - FilterDriftError handler presente: `grep -c "if (err instanceof FilterDriftError)" godentist/robot-godentist/src/api/server.ts` retorna `1`.
    - PaginationStuckError handler presente: `grep -c "if (err instanceof PaginationStuckError)" godentist/robot-godentist/src/api/server.ts` retorna `1`.
    - Codes discriminator: `grep -c "code: 'filter_drift'" godentist/robot-godentist/src/api/server.ts` = 1 AND `grep -c "code: 'pagination_stuck'" godentist/robot-godentist/src/api/server.ts` = 1.
    - HTTP 502 status para los 2 nuevos errores: `grep -c "res.status(502)" godentist/robot-godentist/src/api/server.ts` retorna al menos `3` (FilterDrift + PaginationStuck + SedeRefreshFailed).
    - ORDEN: en el handler, FilterDriftError y PaginationStuckError aparecen ANTES de `res.status(500)`. Verificable con: `awk '/instanceof FilterDriftError/{a=NR} /instanceof PaginationStuckError/{b=NR} /res.status\(500\)/{c=NR; print a, b, c; exit}' godentist/robot-godentist/src/api/server.ts` muestra a<c, b<c.
    - totalCitas en response: `grep -c "totalCitas" godentist/robot-godentist/src/api/server.ts` retorna al menos `1`.
  </acceptance_criteria>

  <done>
    server.ts importa los 2 nuevos errores, los mapea a HTTP 502 ANTES del catch-all 500, y expone totalCitas en la response. tsc pasa.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Robot adapter <-> Portal Dentos | page.goto fresh per sede — multiplica requests x4 (1 per sede). Aceptable (verified RESEARCH.md). |
| Express handler <-> Server-action morfx | Nuevas response shapes (FilterDrift / PaginationStuck) con HTTP 502 + JSON body. Server-action lo lee como text (linea 130-131 actions/godentist.ts). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-05-01 | Information disclosure | Error response body incluye expectedId, actualId, sede | accept | IDs internos del portal (1, 3, 4, 5). Sin PII. Sede names son public (sucursales del cliente). |
| T-v2-05-02 | Denial of service | page.goto x4 sedes => ~4-5s adicional per scrape (RESEARCH.md) | mitigate | Scrape es daily (cron). 25s total vs 10s legacy es aceptable. Sin riesgo DoS. |
| T-v2-05-03 | Tampering | LEGACY-DELETE de 6 metodos privados | accept | Bajo control de versiones. tsc gate detecta consumer-stranded references. |
| T-v2-05-04 | Repudiation | Logs con `[GoDentist]` prefix incluyen sedes y page numbers | accept | Forensics trail en Railway logs. Sin nueva superficie. |
</threat_model>

<verification>
- tsc --noEmit pasa sin errores en adapter + server.
- scrapeAppointments usa paradigm F (greps arriba).
- Codigo legacy paradigm A eliminado (greps arriba).
- server.ts mapea los 2 errores a HTTP 502 antes del catch-all.
- totalCitas en response shape.
- adapter line count entre 1500-1850.
</verification>

<success_criteria>
- [ ] Task 1: scrapeAppointments reescrito con paradigm F.
- [ ] Task 2: Codigo legacy paradigm A eliminado (6 metodos + 4 module-level symbols).
- [ ] Task 3: server.ts mapea FilterDriftError + PaginationStuckError a HTTP 502.
- [ ] tsc --noEmit pasa sin errores.
- [ ] Robot Railway puede arrancar (smoke local opcional: cd godentist/robot-godentist && npm start).
- [ ] Sin push a Railway todavia (push unificado en Plan 11 tras smoke E2E).
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/05-SUMMARY.md` con:
- Lista de simbolos eliminados (LEGACY-DELETE).
- Lista de cambios en scrapeAppointments (paradigm F flow).
- Lista de cambios en server.ts (3 instanceof handlers + totalCitas response field).
- Line count del adapter antes y despues.
- Output tsc --noEmit.
- Nota: "Robot esta en paradigm F. Plan 06 puede ahora reescribir el server-action morfx para consumir las nuevas response shapes + flag/dedupe/canary."
</output>
</content>
</invoke>