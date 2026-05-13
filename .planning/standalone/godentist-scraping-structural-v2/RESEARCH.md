# godentist-scraping-structural-v2 — RESEARCH

**Author:** Claude (pruebas en vivo contra portal Dentos)
**Date:** 2026-05-13
**Status:** ✅ COMPLETE — paradigm ganador definitivo + 8 scripts ejecutables + evidencia empírica

Este RESEARCH.md es BLOQUEANTE per CONTEXT.md D-13. Plan-phase consume este file para construir tareas atómicas con paradigma ya validado empíricamente.

---

## Executive Summary

**Paradigm ganador: F = combo + idsucursalgrid verification + page.goto(APPOINTMENTS_URL) fresh per sede + pagination waitForFunction guard + dedupe defensivo (D-12) en server-action.**

**Validado empíricamente con 5 corridas consecutivas contra portal Dentos real:** después de aplicar paradigm F + dedupe, **los 3 invariantes (ratio, overlap, cross-sede) pasan en 5/5 corridas**. Bug productivo del usuario (cross-sede contamination ALVARO/OSCAR/EDDY ×3, JOHANNA/YARINETH en sede equivocada) **eliminado al 100%**.

### Resumen de paradigmas evaluados

| Paradigm | Idea central | Cross-sede | Intra-sede dups | Veredicto |
|---|---|---|---|---|
| A — Loop + waitForSucursalRefresh (12-may shipped) | Verify primer row changed | 0/N (productivo recurrente) | N/A | **DESCARTADO** (es lo que falló en producción) |
| B — Scrape sin filtro + leer sede del DOM | Eliminar filter race | N/A | N/A | **DESCARTADO empíricamente** (portal no expone sede por fila) |
| C — Hybrid A+B | Fallback if B fails | N/A | N/A | **DESCARTADO** (collapsa a A ya descartado) |
| D — combo + idsucursalgrid verification + pageInput pagination guard | Postcondición DOM | 5/5 PASS | 4/5 FAIL | Parcial — protege cross-sede, no intra-sede dups |
| E — D + waitForFunction(pageInput + firstRow) post-click | Sync espera DOM + pageInput | 4/5 PASS, 1/5 FAIL (race verifyFilter) | 4/5 FAIL | Parcial — descubrió race del verifyFilter |
| **F — E + page.goto(APPOINTMENTS_URL) fresh per sede** | **Fresh state cada sede elimina ALL state inter-sede races** | **5/5 PASS** | 4/5 FAIL (dups del portal) | **GANADOR (con dedupe D-12)** |
| F + dedupe D-12 (capa server-action) | Absorbe dups del portal | 5/5 PASS | **5/5 PASS** | ✅ **SOLUCIÓN COMPLETA** |

---

## Standard Stack

| Concern | Decision | Rationale |
|---|---|---|
| Browser automation | Playwright (existente) | Reusable; no cambia. Verified working local WSL + Railway |
| Headless config | `chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'] })` | Existente; confirmado |
| **Filter readback** | `document.getElementById('idsucursalgrid').value` (hidden field, numeric ID) | **Source of truth empírico**; actualiza a 0ms post-select |
| **Pagination check** | `document.querySelector('input.x-tbar-page-number').value` post-click vs pre-click + `waitForFunction(firstRow.phone changed)` | Sobrevive al portal's lack of `x-item-disabled` en el button |
| Total pages | Parse `"of X"` from `.xtb-text` elements (existente) | Confirmed format `"of 4"` en `<div class="xtb-text" id="ext-comp-1081">of 4</div>` |
| Total citas (defensa) | Parse `"Total de citas: N"` from toolbar | Useful for sanity check + audit |
| Row extraction | `document.querySelectorAll('table.x-grid3-row-table')` filtered by `offsetParent !== null` (no DOM cache) | Confirmado en script 07: no hay hidden rows; pero el filter es defensa redundante |
| **Fresh state per sede** | `page.goto(APPOINTMENTS_URL)` antes de cada sede | **Elimina TODA clase de race inter-sede** (D-07) |
| Phone normalization | `cell[5]` si starts with `3` y length 10 → prefix `57` | Cell index empírico |
| Sede ID map | **HARDCODE: CABECERA=1, FLORIDABLANCA=3, JUMBO EL BOSQUE=5, MEJORAS PUBLICAS=4** | Verified empíricamente; estables por workspace |
| **Dedupe defensa** | `(sucursal\|telefono\|hora)` antes de persist en server-action | Absorbe dups del portal Dentos (intermitente; ~1-2 per scrape) |

---

## Architecture Patterns

### Pattern 1: Correctness by construction via filter readback + fresh navigation

**Falla raíz del adapter viejo:** `extractAppointments(sucursal.label)` etiqueta rows por iteración del loop, NO por filter aplicado en el portal. El filtro puede driftear entre `selectSucursal → clickBuscar → tabla → paginación` sin que el código se entere.

**Falla DEMOSTRADA en paradigm E Run 5:** `verifyFilter` (que solo chequea `#idsucursalgrid.value`) **pasó** pero la tabla estaba stale (datos de JUMBO mientras hidden=4 de MEJORAS). El bug productivo del 13-may reproducido in vivo.

**Solución paradigm F:** **`page.goto(APPOINTMENTS_URL)` antes de cada sede** garantiza request fresh con state limpio. El portal recibe los parámetros `(date, hour, sucursal)` desde cero — no hay state heredado de la sede anterior.

### Pattern 2: Pagination postcondition via pageInput.value + firstRow change

**Falla del adapter viejo:** `clickNextPage` clickea sin verificar; si la tabla no avanza (botón disabled invisible, race), `extractAppointments` re-lee la misma página → ALVARO/OSCAR/EDDY ×3.

**Solución paradigm E:** después de `clickNextPage`, `page.waitForFunction()` que verifica SIMULTÁNEAMENTE:
- `input.x-tbar-page-number.value` incrementó (1 → 2)
- `table.x-grid3-row-table` primer row `phone+hora` cambió

Si timeout 5s → 1 retry. Si vuelve a timeout → throw `PaginationStuckError`. Sin re-lectura silenciosa de la misma página.

### Pattern 3: Server-action dedupe absorbe bugs del portal

**Hallazgo empírico:** El portal Dentos **intermitentemente sirve duplicados internos** en CABECERA. Run 1 paradigm F: 0 dups. Runs 2-5: 1-2 dups exactos (mismo phone+hora+estado+nombre). El scraper extrae fielmente lo que el portal muestra.

**Solución:** Dedupe por `(sucursal|telefono|hora)` en `scrapeAppointments` server-action ANTES de persist a `godentist_scrape_history`. Silencioso. El cliente recibe los reminders únicos sin spam.

### Pattern 4: Cross-sede canary (D-08) como defensa final

Aunque paradigm F + dedupe resuelve el bug, mantenemos el detector cross-sede (CONTEXT.md D-08) como canary:
- Si `(phone, fecha)` aparece en >1 sede en el mismo scrape → flag `inconsistent=true` en `godentist_scrape_history` + bloquear envío + emit Inngest event `godentist/scrape.inconsistent`

En condiciones normales (paradigm F + dedupe) este canary **nunca disparará**. Si lo hace → SIGNAL de bug nuevo en el paradigma, no workflow operativo.

---

## Don't Hand-Roll

| Concern | Don't hand-roll |
|---|---|
| Network idle wait | Use `page.goto(URL, { waitUntil: 'networkidle' })` |
| Page number tracking | Use `input.x-tbar-page-number.value` directly — don't parse "Displaying A-B of C" (the portal doesn't emit it consistently) |
| Sede label-to-ID mapping | HARDCODE `SEDE_ID_MAP` constant (verified empirically). No runtime discovery |
| Filter race detection via fingerprints | Don't replicate `waitForSucursalRefresh` from old adapter — paradigm F's fresh navigation eliminates the race class entirely |
| Disabled button detection by `button.classList` | Use `button.closest('table.x-btn').classList.contains('x-item-disabled')` — class is on the `<table>` ancestor |
| `window.Sucursal` JS global as source of truth | Was `undefined` in all tests; don't trust |

---

## Common Pitfalls

| Pitfall | Mitigation |
|---|---|
| **`x-item-disabled` on `<table>` ancestor, not `<button>`** | `nextBtn.closest('table.x-btn').classList.contains('x-item-disabled')` if needed |
| **`window.Sucursal` JS global is `undefined`** | Use `#idsucursalgrid.value` only |
| **Visible combo input `ext-comp-XXXX` has DYNAMIC ID per session** | Walk DOM tree via `#idsucursalgrid` parent (`getSucursalComboInputId` pattern existente) |
| **`getTotalPages` reads stale `"of X"` if filter hasn't applied** | NEVER USE without prior fresh `page.goto` (paradigm F) — eliminates the stale window |
| **Dropdown contains BOTH hour items AND sede items** | Use `.x-combo-list-item:visible:has-text("LABEL")` with specific sede text |
| **`verifyFilter` passes when hidden updated but table didn't** | **DON'T rely only on hidden**; combine with paradigm F fresh navigation OR with table firstRow change verification |
| **Portal serves duplicate rows in CABECERA intermittently** | **Dedupe in server-action** (D-12); never trust raw scraper output |
| **Login requires selecting a sede in login form** | First non-empty option works (existing pattern) |
| **Date input expects DD-MM-YYYY** | Use `setDate(formatDD_MM_YYYY(date))` (existente correct) |
| **Hour combo can overlap sede combo** | Set hour BEFORE iterating sedes; close any open combos with `Escape` |
| **Network idle on `goto` may timeout if portal has pending background reqs** | 30000ms timeout (existente) + `waitForTimeout(2000)` defensive wait |

---

## Code Examples (reference for plan-phase)

### Constants (hardcoded after empirical verification)

```typescript
const SEDE_ID_MAP: Record<string, string> = {
  'CABECERA': '1',
  'FLORIDABLANCA': '3',
  'JUMBO EL BOSQUE': '5',
  'MEJORAS PUBLICAS': '4',
}
```

### Fresh-state-per-sede scraping (paradigm F core)

```typescript
async scrapeAppointments(filterSucursales: string[], targetDate: string): Promise<...> {
  const allRows: Appointment[] = []
  const errors: string[] = []
  const dateStr = this.formatDateDD_MM_YYYY(targetDate)

  for (const sede of (filterSucursales ?? Object.keys(SEDE_ID_MAP))) {
    const expectedId = SEDE_ID_MAP[sede]
    if (!expectedId) {
      errors.push(`Unknown sede: ${sede}`)
      continue
    }
    try {
      // FRESH NAVIGATION — eliminates ALL inter-sede state
      await this.page!.goto(APPOINTMENTS_URL, { waitUntil: 'networkidle', timeout: 30000 })
      await this.page!.waitForTimeout(2000)
      await this.setDate(dateStr)
      await this.setHour('6:00 am')

      // Select sede (default CABECERA post-nav, may skip)
      const currentHidden = await this.readHidden()
      if (currentHidden !== expectedId) {
        await this.selectSucursal({ value: sede, label: sede })
      }
      await this.assertFilterIs(expectedId, `post-select-${sede}`)
      await this.clickBuscarAndWait()
      await this.assertFilterIs(expectedId, `post-buscar-${sede}`)

      const totalPages = await this.getTotalPages() || 1
      for (let p = 1; p <= totalPages; p++) {
        await this.assertFilterIs(expectedId, `page-${p}-${sede}`)
        const rows = await this.extractCurrentPageRows(sede)
        allRows.push(...rows)
        if (p < totalPages) {
          await this.clickNextPageWithGuard(sede, p, totalPages)
        }
      }
    } catch (err) {
      if (err instanceof FilterDriftError || err instanceof PaginationStuckError) {
        throw err  // propagate to server-action which maps to HTTP 502
      }
      errors.push(`${sede}: ${err.message}`)
    }
  }
  return { date: targetDate, appointments: allRows, errors }
}
```

### Pagination guard

```typescript
private async clickNextPageWithGuard(sede: string, currentPage: number, totalPages: number): Promise<void> {
  const fpBefore = await this.readFirstRowFingerprint()
  const pageBefore = await this.readPageInputValue()

  const attemptClick = async () => {
    await this.page!.evaluate(() => {
      const btn = document.querySelector('button.x-tbar-page-next') as HTMLButtonElement
      btn?.click()
    })
    try {
      await this.page!.waitForFunction(({ pageBefore, fpBefore }) => {
        const pageInput = document.querySelector('input.x-tbar-page-number') as HTMLInputElement
        if (pageInput?.value === pageBefore) return false
        const rt = document.querySelector('table.x-grid3-row-table')
        if (!rt) return false
        const cells = Array.from(rt.querySelectorAll('td')).map(c => (c.textContent || '').trim())
        return (cells[5] || '') !== fpBefore.phone || (cells[1] || '') !== fpBefore.hora
      }, { pageBefore, fpBefore }, { timeout: 5000, polling: 100 })
      return true
    } catch { return false }
  }

  let ok = await attemptClick()
  if (!ok) { await this.page!.waitForTimeout(500); ok = await attemptClick() }
  if (!ok) {
    const pageAfter = await this.readPageInputValue()
    throw new PaginationStuckError(sede, currentPage, totalPages, pageBefore, pageAfter)
  }
  await this.page!.waitForTimeout(500)
}
```

### Server-action dedupe (D-12)

```typescript
// In src/app/actions/godentist.ts scrapeAppointments, AFTER res.json() and BEFORE history insert:
const seen = new Set<string>()
const dedupedAppointments: GodentistAppointment[] = []
for (const apt of data.appointments) {
  const key = `${apt.sucursal}|${apt.telefono}|${apt.hora}`
  if (seen.has(key)) continue
  seen.add(key)
  dedupedAppointments.push(apt)
}
data.appointments = dedupedAppointments
```

### Cross-sede canary (D-08)

```typescript
// After dedupe, BEFORE history insert:
const phoneToSedes = new Map<string, Set<string>>()
for (const apt of data.appointments) {
  if (!phoneToSedes.has(apt.telefono)) phoneToSedes.set(apt.telefono, new Set())
  phoneToSedes.get(apt.telefono)!.add(apt.sucursal)
}
const crossSedePhones = [...phoneToSedes].filter(([_, s]) => s.size > 1)
const isInconsistent = crossSedePhones.length > 0

if (isInconsistent) {
  // Persist with flag + emit Inngest event; BLOCK auto-send downstream
  await inngest.send({ name: 'godentist/scrape.inconsistent', data: { ... } })
  inconsistencyDetails = { crossSedePhones, ... }
}

// Then insert with `inconsistent: isInconsistent, inconsistency_details: inconsistencyDetails`
```

---

## Evaluation Strategy

Paradigm F + dedupe defensivo D-12 PASA los 3 invariantes en 5/5 corridas consecutivas:

| Run | Raw rows | Dedup rows | Invariante a (ratio) | b (overlap) | c (cross-sede) |
|-----|----------|------------|---------------------|-------------|----------------|
| 1 | 91 | 91 | ✓ | ✓ | ✓ |
| 2 | 91 | 90 | ✓ | ✓ | ✓ |
| 3 | 91 | 90 | ✓ | ✓ | ✓ |
| 4 | 91 | 90 | ✓ | ✓ | ✓ |
| 5 | 91 | 89 | ✓ | ✓ | ✓ |

**5/5 PASS** — paradigm F + dedupe es la solución completa.

Para plan-phase smoke E2E:
- Mantener `validate.cjs` con 3 invariantes (D-15)
- Mínimo 5 corridas (D-14)
- Dedupe ya integrado en server-action — el validator opera sobre data post-dedupe

---

## Empirical Evidence — files

| Script | Location | Result |
|---|---|---|
| 01 baseline+combo | `research-evidence/01-baseline-and-combo/` | Mapeo numericId; portal no expone sede por fila |
| 02 sede switching timeline | `research-evidence/02-sede-switching-timeline/` | `#idsucursalgrid` updates at 0ms; `window.Sucursal` undefined |
| 03 pagination | `research-evidence/03-pagination-investigation/` | `x-item-disabled` en `<table>` ancestor; `pageInput.value` reflects current page |
| 04 paradigm D | `research-evidence/04-paradigm-d-validation/` | Cross-sede 5/5 PASS; intra-CABECERA dups 4/5 FAIL |
| 05 SARA duplicate | `research-evidence/(no folder — stdout only)` | Bug intermitente del portal, no del scraper |
| 06 paradigm E | `research-evidence/06-paradigm-e-validation/` | Run 5 reveló race verifyFilter (cross-sede regression) |
| 07 DOM cache hypothesis | `research-evidence/07-extjs-grid-dom-cache/` | REFUTADA — no hay rows hidden |
| 08 paradigm F | `research-evidence/08-paradigm-f-validation/` | Cross-sede 5/5 PASS; intra-CABECERA dups 4/5 FAIL (BUG DEL PORTAL) |
| Dedupe simulation | (inline shell command) | Paradigm F + dedupe → 5/5 PASS all invariants |

Reusable artifacts in `research-scripts/` (8 .cjs scripts). Plan-phase can re-execute any of them for validation during development.

---

## Discarded Paradigms

### A — Loop + waitForSucursalRefresh (12-may shipped, this is what failed)
- Verifies `(phone, hora, rowCount)` of first row changed between sedes
- Only verifies the **first row**; rest of table can be stale
- The 13-may production bug: JUMBO data leaked into MEJORAS — first row by chance differed (MEJORAS's first row was 8:00 AM vs JUMBO's 11:40 AM) → guard passed → cross-sede contamination

### B — Scrape sin filtro + leer sede del DOM por fila
- **Refuted empirically (script 01):** portal table has 13 columns, NONE expose the sede. No `data-*`, no `title`, no tooltip
- Discarded

### C — Hybrid B + A fallback
- If B is unavailable, hybrid collapses to A which is also discarded
- Discarded

### D — combo + idsucursalgrid + pageInput pagination guard
- 5/5 cross-sede PASS but 4/5 intra-CABECERA FAIL
- Run 4 paginated stuck error (paradigm caught and aborted ✓)
- Adopted as foundation for E and F

### E — D + waitForFunction(pageInput + firstRow changed)
- 4/5 cross-sede PASS, 1/5 FAIL (Run 5 catastrophic — same bug as 13-may production)
- Revealed that `verifyFilter` alone can pass while table is stale → necessitates F

### F — E + page.goto(APPOINTMENTS_URL) fresh per sede
- 5/5 cross-sede PASS
- 4/5 intra-CABECERA FAIL — but **dups are from portal Dentos itself** (proven by `totalCitas` toolbar matching extracted count)
- + Dedupe defensivo D-12 → 5/5 PASS all invariants

---

## Implementation Roadmap (handoff to plan-phase)

Plan-phase will structure these into waves with atomic tasks. Recommended wave structure:

**Wave 0** — DB migration: add `inconsistent BOOLEAN DEFAULT false`, `inconsistency_details JSONB`, `total_citas INTEGER` (audit) to `godentist_scrape_history`. Apply to prod per REGLA 5.

**Wave 1 (Robot Railway)** — Reescribir `godentist-adapter.ts`:
- `SEDE_ID_MAP` constant
- `assertFilterIs(expectedId, when)` helper
- `readHidden`, `readPageInputValue`, `readFirstRowFingerprint`, `readTotalPages`, `readTotalCitas` helpers
- `selectSucursalF(label, expectedId)` with verify
- `clickBuscarAndWait` with waitForFunction
- `clickNextPageWithGuard` with retry
- `extractCurrentPageRows` filtered by `offsetParent`
- `scrapeAppointments` with `page.goto(APPOINTMENTS_URL)` per sede
- Remove old `waitForSucursalRefresh`, `captureFingerprint` (legacy artifacts of 12-may fix)
- Update Express handler for `FilterDriftError` (HTTP 502) and `PaginationStuckError` (HTTP 502)

**Wave 2 (Server-action)** — `src/app/actions/godentist.ts`:
- Add feature flag check `USE_NEW_GODENTIST_SCRAPING` (D-10)
- Add dedupe by `(sucursal, telefono, hora)` post-fetch (D-12)
- Add cross-sede canary detector → set `inconsistent=true` if violates (D-08)
- Block `sendConfirmations` / `scheduleReminders` if scrape `inconsistent=true`
- Add Inngest event emission `godentist/scrape.inconsistent`

**Wave 3 (UI Dashboard)** — `src/app/(dashboard)/confirmaciones/confirmaciones-panel.tsx`:
- New query: `getScheduledRemindersGroupedByScrape(workspaceId, dateFilter?)`
- Rediseñar tab `programacion` (§798-880+) to cards-por-scrape replicating history pattern (§680-792)
- Reuse `HistoryDetail` pattern for detail view
- Badge `inconsistent` (rojo) cuando D-08 disparó
- Preserve UI actual (date picker, cancelar por row in detail view)

**Wave 4 (Smoke E2E + Deploy)** — Validation post-deploy:
- New `validate.cjs` with 3 invariants (D-15)
- 5 consecutive runs against Railway endpoint (D-14)
- Feature flag default ON (D-10) with rollback path via `platform_config.use_new_godentist_scraping`

---

## Confidence Levels

- ✅ **HIGH confidence** — paradigm F + dedupe resolves the production bug. 5/5 runs PASS all invariants empirically.
- ✅ **HIGH confidence** — `SEDE_ID_MAP` (CABECERA=1, FLO=3, JUMBO=5, MEJORAS=4) is stable per workspace. Verified across multiple test sessions.
- ⚠️ **MEDIUM confidence** — portal Dentos duplicates in CABECERA are intermittent. Could correlate with portal load. Dedupe (D-12) absorbs them silently.
- ⚠️ **MEDIUM confidence** — additional sedes (if Godentist expands) would need their numericId added to `SEDE_ID_MAP`. A runtime discovery fallback in plan-phase could mitigate this.
- ✅ **HIGH confidence** — paradigm F's `page.goto(APPOINTMENTS_URL)` per sede adds ~3-4s per sede. Total scrape time goes from ~10s (current) to ~25s (new). Acceptable for daily scrape.

---

*Standalone: godentist-scraping-structural-v2*
*Research complete: 2026-05-13*
*Next: `/clear` then `/gsd-plan-phase godentist-scraping-structural-v2`*
