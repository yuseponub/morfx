---
phase: godentist-scraping-structural-v2
plan: 04
status: complete
completed: 2026-05-13
wave: 2
depends_on: [03]
requirements: [D-01, D-03, D-07, D-11]
files_modified:
  - godentist/robot-godentist/src/adapters/godentist-adapter.ts
commits:
  - 65258bf feat(godentist-scraping-structural-v2 04): add selectSucursalF + clickBuscarAndWait paradigm-F methods
  - deb4010 feat(godentist-scraping-structural-v2 04): add clickNextPageWithGuard with D-11 + retry + PaginationStuckError
  - 541d79e feat(godentist-scraping-structural-v2 04): add extractCurrentPageRows with sede arg explicit + offsetParent filter
provides:
  - GoDentistAdapter.selectSucursalF (private async, postcondition assertFilterIs)
  - GoDentistAdapter.clickBuscarAndWait (private async, waitForFunction render guard)
  - GoDentistAdapter.clickNextPageWithGuard (private async, D-11 + retry + PaginationStuckError)
  - GoDentistAdapter.extractCurrentPageRows (private async, sede arg + offsetParent filter)
metrics:
  insertions: 227
  deletions: 0
  symbols_added: 4
  call_sites_added: 1 (this.assertFilterIs internal a selectSucursalF)
  call_sites_external: 0 (Plan 05 wireea)
  duration_seconds: 286
  duration_human: ~5min
  deviations: 1 (Rule 1 fix — Appointment type lacks doctor field + DOCTOR_PRIORITY is Record not flat)
---

# Plan 04 — Summary

## One-liner

Insertar 4 métodos privados paradigm-F dormidos (selectSucursalF + clickBuscarAndWait + clickNextPageWithGuard + extractCurrentPageRows) en `GoDentistAdapter`, encadenándose con los 5 helpers + 2 error classes de Plan 03. Robot mantiene paradigm A vivo hasta Plan 05 reescriba scrapeAppointments.

## Deliverable

Modificado `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (+227 líneas). Sin call sites externos = robot mantiene comportamiento paradigm A actual hasta Plan 05.

## 4 Métodos agregados (line numbers absolutos post-commits)

| # | Método | Tipo | Línea inicio | Líneas | Análogo |
|---|--------|------|--------------|--------|---------|
| 1 | `selectSucursalF` | `private async (label, expectedId): Promise<void>` | 1803 | ~50 | Plan 03 `assertFilterIs` + paradigm F snippet RESEARCH.md |
| 2 | `clickBuscarAndWait` | `private async (): Promise<void>` | 1852 | ~21 | nuevo (waitForFunction render guard) |
| 3 | `clickNextPageWithGuard` | `private async (sede, currentPage, totalPages): Promise<void>` | 1888 | ~55 | nuevo (D-11 + retry + PaginationStuckError) |
| 4 | `extractCurrentPageRows` | `private async (sede): Promise<Appointment[]>` | 1960 | ~80 | legacy `extractAppointments` con rename + sede arg explícito + offsetParent filter |

Métodos legacy intactos (Plan 05 los borrará en wave 2/3):

| Método | Línea | Status |
|--------|-------|--------|
| `selectSucursal(sucursal: Sucursal)` | 1588 | LEGACY (Plan 05 LEGACY-DELETE) |
| `clickBuscar()` | 1610 | LEGACY (Plan 05 LEGACY-DELETE) |
| `clickNextPage()` | 2219 | LEGACY (Plan 05 LEGACY-DELETE) |
| `extractAppointments(sucursal: string)` | 2241 | LEGACY (Plan 05 LEGACY-DELETE) |

## Decisions honored

- **D-01** (rediseño desde 0): scaffolding inerte. Preserva paradigm A 100% hasta Plan 05 — no break compatibility en Plan 04.
- **D-03** (paginación + cambio de sede ambos focos): `selectSucursalF` + `clickBuscarAndWait` cubren cambio de sede; `clickNextPageWithGuard` cubre paginación.
- **D-07** (correctness by construction): `selectSucursalF` llama a `assertFilterIs(expectedId, 'post-select-${label}')` antes de retornar. Si el portal driftea el filter, FilterDriftError dispara antes de extraer rows.
- **D-11** (x-item-disabled defensa redundante): `clickNextPageWithGuard.attemptClick()` revisa `btn.closest('table.x-btn').classList.contains('x-item-disabled')` ANTES del click. Si disabled, retorna `false` sin clickear y aborta el attempt. Retry (500ms) + PaginationStuckError si el retry también falla.

## Verification

### tsc --noEmit (final, tras los 3 commits)

```
=== exit=0 ===
```

Cero errores TypeScript en el robot tras los 3 commits.

### Acceptance criteria (Task 1: selectSucursalF + clickBuscarAndWait)

- ✓ `tsc --noEmit` exit 0
- ✓ `private async selectSucursalF` = 1
- ✓ `private async clickBuscarAndWait` = 1
- ✓ `selectSucursalF` llama a `await this.assertFilterIs(expectedId, ...)` = 1 (rango amplio)
- ✓ `.x-combo-list-item:visible:has-text` count = 2 (uno nuevo + uno legacy en selectSucursal viejo) — criterio >=1 satisfecho
- ✓ `clickBuscarAndWait` usa `waitForFunction` = 1
- ✓ `[GoDentist] selectSucursalF` + `[GoDentist] clickBuscarAndWait` log count = 4
- ✓ Legacy `private async selectSucursal(` aún presente = 1

### Acceptance criteria (Task 2: clickNextPageWithGuard)

- ✓ `tsc --noEmit` exit 0
- ✓ `private async clickNextPageWithGuard` = 1
- ✓ `closest('table.x-btn')` = 1 (D-11 defensa)
- ✓ `x-item-disabled` en clickNextPageWithGuard = 2 (JSDoc + código)
- ✓ `timeout: 5000` = 1
- ✓ Retry pattern `let ok = await attemptClick()` = 1
- ✓ `throw new PaginationStuckError(sede, currentPage, totalPages, pageBefore, pageAfter)` = 1
- ✓ Legacy `private async clickNextPage(` aún presente = 1

### Acceptance criteria (Task 3: extractCurrentPageRows)

- ✓ `tsc --noEmit` exit 0
- ✓ `private async extractCurrentPageRows(sede: string): Promise<Appointment[]>` = 1
- ✓ `offsetParent !== null` en extractCurrentPageRows = 1
- ✓ Phone normalization `telefono.startsWith('3') && telefono.length === 10` = 1
- ✓ `sucursal: sede` (sede tag from caller's verified-filter state) = 1
- ✓ `DOCTOR_PRIORITY[sede]` lookup-by-sede = 2 (JSDoc + código)
- ✓ Legacy `private async extractAppointments(` aún presente = 1
- ✓ `[GoDentist] extractCurrentPageRows` log count = 2

## Style verbatim

- 2 espacios indent (module-level), 4 espacios indent dentro del cuerpo de la clase ✓
- Sin punto y coma final ✓
- JSDoc en cada método ✓
- `[GoDentist]` prefix en console.log/warn/error (5 nuevos logs por método de promedio) ✓
- `this.page!` non-null assertion (consistente con métodos privados existentes) ✓
- Backticks para template strings ✓
- `as HTMLButtonElement | null` / `as HTMLInputElement | null` (type-safe queryselectors) ✓

## Threat model status

Threat register T-v2-04-01..T-v2-04-04 todos honored:
- T-v2-04-01 (Tampering DOM selectors): selectors derivados de research empírico verificado. FilterDriftError + PaginationStuckError capturan cambios de portal.
- T-v2-04-02 (DoS waitForFunction): cada waitForFunction tiene timeout explícito (5-8s) + polling 100ms. Total overhead ~3-4s adicionales por sede (consistente con RESEARCH.md).
- T-v2-04-03 (Info disclosure error.message): solo strings numéricos (page indices, ids); sin PII.
- T-v2-04-04 (Info disclosure logs fpBefore): logs van a Railway, accesibles solo al developer; mismo nivel de exposición que logs existentes.

## Deviations from Plan

### Rule 1 — Auto-fixed Bug en Task 3 (Appointment type + DOCTOR_PRIORITY shape)

**Found during:** Task 3, en la primera verificación tsc tras el primer Edit
**Issue:** El plan asumió dos hechos incorrectos sobre el codebase:
  1. El tipo `Appointment` (de `../types/index.js`) tiene un campo `doctor` — **FALSO**. El shape real es `{ nombre, telefono, hora, sucursal, estado }` (5 campos, sin `doctor`). El legacy `extractAppointments` tampoco persiste `doctor` en su push.
  2. `DOCTOR_PRIORITY` es iterable como una lista plana (`for (const priority of DOCTOR_PRIORITY)`) — **FALSO**. Es `Record<string, string[]>` indexado por sede (verificable en `src/constants/doctors.ts`).

**Errors TypeScript que tsc reportó:**
- `src/adapters/godentist-adapter.ts(1991,30): error TS2488: Type 'Record<string, string[]>' must have a '[Symbol.iterator]()' method that returns an iterator.`
- `src/adapters/godentist-adapter.ts(2003,9): error TS2353: Object literal may only specify known properties, and 'doctor' does not exist in type 'Appointment'.`

**Fix:**
1. Iteración cambiada a `DOCTOR_PRIORITY[sede] ?? []` (lookup-by-sede correcto). La constante pre-computada por sede `sedeDoctorPriority: string[]` se calcula una vez fuera del row loop.
2. Campo `doctor` removido del `appointments.push(...)` para honrar el tipo real `Appointment`. La lógica de tiebreak permanece como computación intermedia con `let _doctor` + `void _doctor` para no triggear "unused variable" warning — reservada para uso futuro si el tipo `Appointment` se extiende (Plan 05+).

**Files modified:** `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (Task 3 commit `541d79e`)

**Commit:** `541d79e` (incluye fix inline + JSDoc actualizado para reflejar la corrección)

**Permiso:** No requerido (Rule 1 auto-fix bug, no architectural change). El fix mantiene parity exacto con el legacy `extractAppointments` (que tampoco persiste `doctor`).

## Comportamiento del robot

**Sin cambio.** El robot sigue ejecutando paradigm A (`selectSucursal` legacy + `clickBuscar` + `waitForSucursalRefresh` + `clickNextPage` + `extractAppointments(sucursal.label)`) hasta Plan 05 reescriba `scrapeAppointments`. Los 4 métodos nuevos están **dormidos**:
- 0 call sites externos para `selectSucursalF`, `clickBuscarAndWait`, `clickNextPageWithGuard`, `extractCurrentPageRows`.
- 1 call site interno: `selectSucursalF` llama a `this.assertFilterIs(expectedId, 'post-select-${label}')` que ya estaba implementada en Plan 03.

## Downstream unblocked

- **Plan 05** puede reescribir `scrapeAppointments` consumiendo:
  - `SEDE_ID_MAP` para el loop driver (Plan 03)
  - `selectSucursalF(label, expectedId)` para selección verificada (Plan 04)
  - `clickBuscarAndWait()` + `assertFilterIs(expectedId, 'post-buscar-${sede}')` postcondition (Plan 03+04)
  - Inner page loop: `assertFilterIs(expectedId, 'page-${p}-${sede}')` + `extractCurrentPageRows(sede)` + `clickNextPageWithGuard(sede, p, totalPages)` (Plan 03+04)
- **Plan 05** también borra los 4 métodos legacy (selectSucursal viejo, clickBuscar viejo, clickNextPage viejo, extractAppointments viejo) + `waitForSucursalRefresh` + `captureFingerprint` + `discoverSucursales` + `extractAllPages` (LEGACY-DELETE list per PATTERNS.md §1).
- **Plan 05** actualiza `server.ts` con `instanceof FilterDriftError → HTTP 502` y `instanceof PaginationStuckError → HTTP 502` mappings (Plan 03 ya creó las clases exportadas).

## Self-Check

Created files exist:
- ✓ `.planning/standalone/godentist-scraping-structural-v2/04-SUMMARY.md` (this file)

Commits exist:
- ✓ `65258bf` (Task 1) → `git log --oneline | grep -q 65258bf`
- ✓ `deb4010` (Task 2) → `git log --oneline | grep -q deb4010`
- ✓ `541d79e` (Task 3) → `git log --oneline | grep -q 541d79e`

Methods exist at declared lines (post-commits absolute):
- ✓ selectSucursalF line 1803
- ✓ clickBuscarAndWait line 1852
- ✓ clickNextPageWithGuard line 1888
- ✓ extractCurrentPageRows line 1960

Legacy methods still present (Plan 05 will delete):
- ✓ selectSucursal( line 1588
- ✓ clickBuscar( line 1610
- ✓ clickNextPage( line 2219
- ✓ extractAppointments( line 2241

tsc --noEmit:
- ✓ exit code 0 (verified post-all-commits)

## Self-Check: PASSED
