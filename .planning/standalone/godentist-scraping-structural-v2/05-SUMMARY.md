---
phase: godentist-scraping-structural-v2
plan: 05
status: complete
completed: 2026-05-13
wave: 2
depends_on: [03, 04]
requirements: [D-01, D-03, D-05, D-07, D-11]
files_modified:
  - godentist/robot-godentist/src/adapters/godentist-adapter.ts
  - godentist/robot-godentist/src/api/server.ts
  - godentist/robot-godentist/src/types/index.ts
commits:
  - 0d4f623 feat(godentist-scraping-structural-v2 05): rewrite scrapeAppointments with paradigm F
  - 3eca85a refactor(godentist-scraping-structural-v2 05): delete paradigm-A legacy from adapter
  - 68c9f5b feat(godentist-scraping-structural-v2 05): map FilterDriftError + PaginationStuckError to HTTP 502
provides:
  - GoDentistAdapter.scrapeAppointments (paradigm F implementation — fresh-nav per sede + assertFilterIs + clickNextPageWithGuard)
  - ScrapeAppointmentsResponse.totalCitas optional field (D-15 audit)
  - HTTP 502 mapping for FilterDriftError + PaginationStuckError in Express handler
metrics:
  insertions: ~146
  deletions: ~460
  legacy_methods_deleted: 6 (waitForSucursalRefresh, captureFingerprint, discoverSucursales, extractAllPages, clickNextPage, extractAppointments)
  module_level_symbols_deleted: 4 (SUCURSAL_REFRESH_TIMEOUT_MS, SUCURSAL_REFRESH_POLL_MS, interface Fingerprint, function fingerprintsEqual)
  adapter_line_count_before: 2389
  adapter_line_count_after: 2034
  net_lines_removed: 355
  duration_minutes: ~30
  deviations: 1 (Rule 1 fix — clickNextPage consumer in findPatientRow required inline preservation)
---

# Plan 05 — Summary

## One-liner

Switch al paradigm F: reescritura completa de `scrapeAppointments` con `page.goto(APPOINTMENTS_URL)` fresh per sede + assertFilterIs postconditions + clickNextPageWithGuard, eliminación de 6 metodos paradigm A legacy + 4 module-level symbols, y mapeo HTTP 502 discriminado para `FilterDriftError` + `PaginationStuckError` en Express handler. El robot ahora ejecuta paradigm F al arrancar (smoke local opcional, push unificado en Plan 11).

## Deliverable

- `godentist/robot-godentist/src/adapters/godentist-adapter.ts`: reescritura de `scrapeAppointments` (~93 lineas nuevas) + eliminación de ~355 lineas de paradigm A legacy. File de 2389 → 2034 lineas.
- `godentist/robot-godentist/src/api/server.ts`: importa `FilterDriftError` + `PaginationStuckError`, agrega 2 bloques `instanceof` con HTTP 502 ANTES del catch-all 500 (orden: 78 < 94 < 127), expone `totalCitas` en response.
- `godentist/robot-godentist/src/types/index.ts`: extiende `ScrapeAppointmentsResponse` con `totalCitas?: number | null` (D-15 audit).

## Paradigm F Flow (scrapeAppointments)

Para cada sede en `filterSucursales ?? Object.keys(SEDE_ID_MAP)`:

1. **FRESH NAVIGATION** — `page.goto(APPOINTMENTS_URL, networkidle, 30s)` + `waitForTimeout(2000)`. Elimina TODO state inter-sede (D-07 correctness by construction).
2. **Form setup** — `setDate(dateStr)` + `setHour('6:00 am')`.
3. **Skip-or-select sede** — `readHidden()` → si distinto de `expectedId`, `selectSucursalF(sede, expectedId)`. Si igual (default post-nav = CABECERA=1), skip ahorra ~500ms.
4. **Postcondition 1** — `assertFilterIs(expectedId, 'post-select-${sede}')`. Lanza `FilterDriftError` si el portal driftea.
5. **Search** — `clickBuscarAndWait()`.
6. **Postcondition 2** — `assertFilterIs(expectedId, 'post-buscar-${sede}')`.
7. **Audit** — `readTotalCitas()` acumula en `lastTotalCitas` para response.
8. **Pagination** — `getTotalPages() || 1` → loop `for p = 1..totalPages`:
   - **Postcondition 3** — `assertFilterIs(expectedId, 'page-${p}-${sede}')` (pre-extract).
   - **Extract** — `extractCurrentPageRows(sede)` (sede arg explicit del caller's verified state).
   - **Advance** — `clickNextPageWithGuard(sede, p, totalPages)` (D-11 + retry + PaginationStuckError).
9. **Error propagation** — `catch` re-lanza `FilterDriftError`/`PaginationStuckError` verbatim; otros errores se acumulan en `errors[]`.

Retorna `{ date, appointments, errors, totalCitas: number | null }`.

## Server.ts Handler Mapping

```
catch (err) {
  ...
  if (err instanceof FilterDriftError) → 502 + { code: 'filter_drift', sede, expectedId, actualId, when }   [line 78]
  if (err instanceof PaginationStuckError) → 502 + { code: 'pagination_stuck', sede, currentPage, totalPages, pageInputBefore, pageInputAfter }   [line 94]
  if (err instanceof SedeRefreshFailedError) → 502 + { code: 'sede_refresh_failed', ... }   [defensive — paradigm F no throws this]
  res.status(500) catch-all   [line 127]
}
```

Orden verificado: 78 < 94 < 127. PATTERNS.md §2 Risks honored ("Order matters: instanceof checks must come BEFORE the generic res.status(500) catch-all").

## Decisions Honored

- **D-01 (rediseño desde 0):** Paradigm A code path eliminado del scrape flow. `scrapeAppointments` reescrito 100% con paradigm F primitives de Plans 03+04. Adapter va de 2389 → 2034 lineas.
- **D-03 (paginación + cambio de sede ambos focos):** Paginación cubierta por `clickNextPageWithGuard` (D-11 disabled-check + retry + PaginationStuckError). Cambio de sede cubierto por `page.goto fresh-nav` + `selectSucursalF` + `assertFilterIs` (3 momentos: post-select, post-buscar, page-N).
- **D-05 (ambos flujos):** `scrapeAppointments` es el único entrypoint para BOTH `sendConfirmations` y `scheduleReminders` (consumidores de Plan 06). El rediseño cubre ambos por diseño.
- **D-07 (correctness by construction):** `page.goto(APPOINTMENTS_URL)` antes de cada sede elimina TODA contaminación de estado inter-sede. RESEARCH.md valida 5/5 invariantes PASS para paradigm F (script `08-paradigm-f-validation.cjs`). `assertFilterIs` en 3 momentos lanza `FilterDriftError` antes de extraer rows si el filter driftea — no hay ventana donde una cita se asigna a sede equivocada.
- **D-11 (x-item-disabled defensa):** `clickNextPageWithGuard` (Plan 04) ya implementaba la defensa (`btn.closest('table.x-btn').classList.contains('x-item-disabled')`). Plan 05 lo consume desde scrapeAppointments.
- **D-10 Issue 3 fix Option A:** Paradigm A REMOVED — no `/api/scrape-appointments-legacy` endpoint, no fallback path. Kill-switch (Plan 06) lee `getPlatformConfig` y aborta con error explicito si false, NO cae a paradigm A. Revival = `git revert` 3 commits de Plan 05 si surge crisis.

## LEGACY-DELETE Symbols

### Methods deleted from adapter (paradigm A scrape flow only)

| Symbol | Old line range | Replacement |
|---|---|---|
| `waitForSucursalRefresh(prev, sucursal)` | 1923-2023 | `assertFilterIs(expectedId, when)` + `page.goto(APPOINTMENTS_URL)` fresh-nav |
| `captureFingerprint()` | 1651-1695 | `readFirstRowFingerprint()` (Plan 03, scope-limited to clickNextPageWithGuard) |
| `discoverSucursales()` | 1538-1586 | `Object.keys(SEDE_ID_MAP)` driver |
| `extractAllPages(sucursal)` | 2150-2178 | inline `for p = 1..totalPages` loop in scrapeAppointments |
| `clickNextPage()` | 2219-2237 | `clickNextPageWithGuard(sede, p, totalPages)` for scrape; INLINED 6-line eval in `findPatientRow` (confirmAppointment scope) — see Deviations |
| `extractAppointments(sucursal)` | 2241-2315 | `extractCurrentPageRows(sede)` (Plan 04, sede arg explicit from caller's verified state) |

### Module-level symbols deleted

| Symbol | Old line range | Reason |
|---|---|---|
| `SUCURSAL_REFRESH_TIMEOUT_MS = 8000` | 21 | only used by waitForSucursalRefresh |
| `SUCURSAL_REFRESH_POLL_MS = 250` | 22 | only used by waitForSucursalRefresh |
| `interface Fingerprint { phone, hora, rowCount }` | 29-33 | shape inlined in `SedeRefreshFailedError.stuckFingerprint` constructor param type |
| `function fingerprintsEqual(a, b)` | 41-45 | zero call sites (verified via grep) |

### Preserved deliberately (consumer-stranded if deleted)

| Symbol | Why kept |
|---|---|
| `selectSucursal(sucursal: Sucursal)` | confirmAppointment line 403 uses it |
| `clickBuscar()` | confirmAppointment line 406 uses it |
| `interface Sucursal { value, label }` | confirmAppointment + selectSucursal use it |
| `SedeRefreshFailedError class` | server.ts imports it; mapping block kept defensively (PATTERNS.md §2 Risks) |
| `getTotalPages()` | scrapeAppointments paradigm F + findPatientRow use it |

## Verification

### Acceptance criteria (Task 1: scrapeAppointments paradigm F rewrite)

- ✓ tsc --noEmit exit 0
- ✓ `grep -c "this.page.goto(APPOINTMENTS_URL"` (in src/adapters/godentist-adapter.ts) returns 3 (1 in scrapeAppointments, 1 in confirmAppointment, 1 in checkAvailability — last two preexisting).
- ✓ `await this.selectSucursalF` count = 1.
- ✓ `await this.clickBuscarAndWait` count = 1.
- ✓ `await this.clickNextPageWithGuard` count = 1.
- ✓ `await this.extractCurrentPageRows` count = 1.
- ✓ assertFilterIs invocado en 3 momentos: post-select (line 349), post-buscar (line 353), page-${p} (line 367).
- ✓ Propagacion errores paradigm F: `instanceof FilterDriftError || err instanceof PaginationStuckError` count = 1.
- ✓ Tipo retorno extendido: `totalCitas: number | null` count = 1 (en scrapeAppointments signature).
- ✓ `async scrapeAppointments(filterSucursales` count = 1 (no duplicado).

### Acceptance criteria (Task 2: LEGACY-DELETE)

- ✓ tsc --noEmit exit 0
- ✓ LEGACY ELIMINATED counts (each must be 0):
  - waitForSucursalRefresh: 0 ✓
  - captureFingerprint: 0 ✓
  - discoverSucursales: 0 ✓
  - extractAllPages: 0 ✓
  - clickNextPage (legacy method definition): 0 ✓
  - extractAppointments (legacy method definition): 0 ✓
  - SUCURSAL_REFRESH_TIMEOUT_MS, SUCURSAL_REFRESH_POLL_MS: 0 ✓
  - interface Fingerprint {: 0 ✓
  - function fingerprintsEqual: 0 ✓
- ✓ PRESERVED counts (each >=1):
  - getTotalPages: 1 ✓
  - formatDateDD_MM_YYYY: 2 ✓ (definition + 2 call sites — counts 2)
  - async setDate / setHour: 2 ✓
  - async login / init / close: 3 ✓
- ✗ Line count: 2034 (target 1500-1850). Higher than predicted — see Deviations.

### Acceptance criteria (Task 3: server.ts handler)

- ✓ tsc --noEmit exit 0
- ✓ Import updated: `import { GoDentistAdapter, SedeRefreshFailedError, FilterDriftError, PaginationStuckError }` count = 1.
- ✓ `if (err instanceof FilterDriftError)` count = 1.
- ✓ `if (err instanceof PaginationStuckError)` count = 1.
- ✓ `code: 'filter_drift'` count = 1.
- ✓ `code: 'pagination_stuck'` count = 1.
- ✓ `res.status(502)` count = 3 (FilterDrift + PaginationStuck + SedeRefreshFailed).
- ✓ ORDER: FilterDrift (line 78) < PaginationStuck (line 94) < catch-all 500 (line 127).
- ✓ `totalCitas` in response: count = 1.

## Deviations from Plan

### Deviation 1 — Rule 1 fix: clickNextPage consumer in findPatientRow

**Found during:** Task 2, third tsc check after first delete attempt
**Issue:** Plan 05 PATTERNS.md §1 LEGACY-DELETE list said to delete `clickNextPage()`. The plan's
Task 2 step 8 instructed to verify with `grep` ANY consumer before deleting. The grep DID
catch it (line 1112 in the original file), but the plan still listed it as a delete target.
After deleting, tsc reported:

```
src/adapters/godentist-adapter.ts(1112,20): error TS2339: Property 'clickNextPage' does not exist on type 'GoDentistAdapter'.
```

The consumer is `findPatientRow` (called from `confirmAppointment`), which paginates through
the citas grid looking for a patient row by name. This is **scope-confined to the confirm flow**
(not scrape) and does NOT need the paradigm F pagination guard contract — it walks pages
forward only, and pagination drift just means the patient isn't in the grid for that date.

**Fix:** Inlined the click logic (6-line `page.evaluate` calling `document.querySelector('button.x-tbar-page-next')`) directly in `findPatientRow` line 1110-1129. Added explanatory comment about why scope-confined and why does NOT need paradigm F's PaginationStuckError contract.

**Files modified:** `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (Task 2 commit `3eca85a`)

**Permission required:** No (Rule 1 — bug fix, no architectural change). The fix preserves confirmAppointment's existing behavior exactly.

### Deviation 2 — Adapter line count over plan target

**Found during:** Task 2 final verification
**Issue:** Plan 05 acceptance criterion target was 1500-1850 lines (down from 1988). Actual final is 2034 lines (down from 2389). The plan computed 1988 baseline, but the file at Plan 04 commit `541d79e` was already 2389 lines (Plan 04 inserted 227+174 = 401 lines on top of 1988 baseline).

**Root cause:** The Plan 05 target (1500-1850) was computed against the wrong baseline. Plans 03+04 inserted ~401 lines of paradigm F scaffolding. After Plan 05 deletes ~460 lines and inserts ~146, the net file size is 2389 − 460 + 146 ≈ 2075 (close to actual 2034 after final counts).

**Resolution:** Acceptance criterion target was based on faulty math, not a real defect in the implementation. The plan's INTENT (delete paradigm A code) is fully honored:
- All 6 legacy methods deleted (verified by greps)
- All 4 module-level legacy symbols deleted
- tsc passes
- 355 lines net removed from adapter

Reporting as a deviation for forensics but the deliverable matches the plan's intent.

**Files modified:** N/A (this is a reporting deviation).

**Permission required:** No.

## Threat Model Status

Per Plan 05 threat register T-v2-05-01..T-v2-05-04:

- T-v2-05-01 (Info disclosure error response body): accepted. FilterDriftError + PaginationStuckError bodies expose internal portal IDs (1, 3, 4, 5) and sede names (public). No PII.
- T-v2-05-02 (DoS page.goto x4 sedes): accepted. Daily cron scrape; ~25s total vs ~10s legacy. No DoS risk.
- T-v2-05-03 (Tampering LEGACY-DELETE): accepted. Under VCS; tsc gate caught the one consumer-stranded reference (clickNextPage in findPatientRow) — see Deviation 1.
- T-v2-05-04 (Repudiation logs): accepted. `[GoDentist]` prefix preserved on all new code.

## Comportamiento del robot

**Antes de Plan 05:** ejecuta paradigm A (`selectSucursal` legacy + `clickBuscar` + `waitForSucursalRefresh` + `clickNextPage` + `extractAppointments(sucursal.label)`).

**Después de Plan 05:** ejecuta paradigm F. `scrapeAppointments`:
- Hace `page.goto(APPOINTMENTS_URL)` antes de cada sede (fresh state).
- Llama `selectSucursalF(sede, expectedId)` solo si `readHidden() !== expectedId`.
- Verifica filter en 3 momentos (`assertFilterIs`).
- Pagina con `clickNextPageWithGuard` (D-11 + retry + PaginationStuckError).
- Extrae con `extractCurrentPageRows(sede)` (sede arg explicit del caller).
- Retorna `totalCitas: number | null` adicional.

Server.ts mapea los 2 nuevos errores a HTTP 502 con discriminator `code` distintivo (`filter_drift`, `pagination_stuck`).

**Push:** NO push a Railway en este plan — el plan dice "commit unificado en Plan 11 tras smoke E2E".

## Downstream unblocked

- **Plan 06** (server-action morfx) puede ahora:
  - Consumir `response.totalCitas` y persistirlo en `godentist_scrape_history.total_citas`.
  - Manejar HTTP 502 con `code: 'filter_drift'` y `code: 'pagination_stuck'` distintamente.
  - Implementar el kill-switch (D-10 Issue 3 Option A): si `getPlatformConfig('use_new_godentist_scraping', false)` retorna false, abortar con error explicito SIN fallback a paradigm A (no legacy endpoint).
  - Implementar dedupe (D-12) + canary cross-sede (D-08) en server-action.
- **Plan 11** (smoke E2E + push unificado) puede ahora correr smoke contra el robot paradigm F.

## Self-Check

Created files exist:
- ✓ `.planning/standalone/godentist-scraping-structural-v2/05-SUMMARY.md` (this file)

Commits exist:
- ✓ `0d4f623` (Task 1) → verified via `git log --oneline -5`
- ✓ `3eca85a` (Task 2) → verified via `git log --oneline -5`
- ✓ `68c9f5b` (Task 3) → verified via `git log --oneline -5`

tsc --noEmit:
- ✓ exit code 0 (verified post-all-3-commits)

Files modified at HEAD:
- ✓ `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (Tasks 1+2)
- ✓ `godentist/robot-godentist/src/api/server.ts` (Task 3)
- ✓ `godentist/robot-godentist/src/types/index.ts` (Task 3)

## Self-Check: PASSED

**Robot está en paradigm F. Plan 06 puede ahora reescribir el server-action morfx para consumir las nuevas response shapes + flag/dedupe/canary.**
