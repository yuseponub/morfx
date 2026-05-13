---
phase: godentist-scraping-structural-v2
plan: 03
status: complete
completed: 2026-05-13
wave: 1
depends_on: [01, 02]
requirements: [D-01, D-03, D-07, D-11]
files_modified:
  - godentist/robot-godentist/src/adapters/godentist-adapter.ts
commits:
  - 8121ed6 feat(godentist-scraping-structural-v2 03): add SEDE_ID_MAP + FilterDriftError + PaginationStuckError
  - d7b5f77 feat(godentist-scraping-structural-v2 03): add 5 private paradigm-F helpers to GoDentistAdapter
provides:
  - SEDE_ID_MAP (constant, module-level)
  - FilterDriftError (exported class)
  - PaginationStuckError (exported class)
  - GoDentistAdapter.readHidden (private async)
  - GoDentistAdapter.readPageInputValue (private async)
  - GoDentistAdapter.readFirstRowFingerprint (private async)
  - GoDentistAdapter.readTotalCitas (private async)
  - GoDentistAdapter.assertFilterIs (private async, throws FilterDriftError)
metrics:
  insertions: 174
  deletions: 0
  symbols_added: 8
  call_sites_added: 1 (this.readHidden() internal a assertFilterIs)
  call_sites_external: 0 (Plan 04 wireea)
---

# Plan 03 — Summary

## One-liner

Insertar 8 símbolos paradigm-F dormidos (constante SEDE_ID_MAP + 2 error classes exportadas + 5 helpers privados) en `godentist-adapter.ts` como scaffolding inerte que Plans 04-05 wirearán.

## Deliverable

Modificado `godentist/robot-godentist/src/adapters/godentist-adapter.ts`. Sin call sites externos = robot mantiene comportamiento paradigm A actual hasta Plan 05 reescriba `scrapeAppointments`.

## 8 Símbolos agregados (line numbers)

| # | Símbolo | Tipo | Línea | Análogo |
|---|---------|------|-------|---------|
| 1 | `SEDE_ID_MAP` | `const Record<string, string>` (module-level) | 89 | nuevo (hardcode empírico RESEARCH.md §Standard Stack) |
| 2 | `FilterDriftError` | `export class extends Error` | 108 | `SedeRefreshFailedError` líneas 56-67 |
| 3 | `PaginationStuckError` | `export class extends Error` | 132 | `SedeRefreshFailedError` líneas 56-67 |
| 4 | `readHidden` | `private async (): Promise<string>` | 1713 | nuevo (lee `#idsucursalgrid.value`) |
| 5 | `readPageInputValue` | `private async (): Promise<string>` | 1727 | nuevo (lee `input.x-tbar-page-number.value`) |
| 6 | `readFirstRowFingerprint` | `private async (): Promise<{ phone, hora }>` | 1745 | `captureFingerprint` analog (cells[5], cells[1]) |
| 7 | `readTotalCitas` | `private async (): Promise<number \| null>` | 1763 | nuevo (parsea "Total de citas: N" de `.xtb-text`) |
| 8 | `assertFilterIs` | `private async (expectedId, when): Promise<void>` | 1787 | nuevo (D-07 correctness-by-construction) |

## Decisions honored

- **D-01** (rediseño desde 0): scaffolding inerte preserva paradigm A hasta Plan 05 — no break compatibility en Plan 03.
- **D-03** (paginación + cambio de sede ambos focos): `readPageInputValue` + `readFirstRowFingerprint` para pagination postcondition; `readHidden` + `assertFilterIs` para filter postcondition.
- **D-07** (correctness by construction): `assertFilterIs` lanza `FilterDriftError` cuando `#idsucursalgrid.value !== expectedId`. Diseño rechaza la asignación stale-sede-on-row antes de extraer.
- **D-11** (x-item-disabled defensa): `PaginationStuckError` provee el discriminator que Plan 04 lanzará si `clickNextPageWithGuard` no avanza tras click+retry.

## Verification

### tsc --noEmit (final, tras ambos commits)

```
=== tsc final gate (post both edits) ===
=== exit=0 ===
```

Cero errores TypeScript en el robot.

### Acceptance criteria (Task 1)

- ✓ `tsc --noEmit` exit 0
- ✓ `grep -c "^const SEDE_ID_MAP: Record"` = 1
- ✓ Los 4 entries `'CABECERA': '1'`, `'FLORIDABLANCA': '3'`, `'JUMBO EL BOSQUE': '5'`, `'MEJORAS PUBLICAS': '4'` presentes en líneas 90-93 (`grep -nE "'(CABECERA|FLORIDABLANCA|JUMBO EL BOSQUE|MEJORAS PUBLICAS)':"`)
- ✓ `grep -c "export class FilterDriftError extends Error"` = 1
- ✓ `grep -c "export class PaginationStuckError extends Error"` = 1
- ✓ Orden: `SedeRefreshFailedError`(56) < `FilterDriftError`(108) < `PaginationStuckError`(132) < `interface Sucursal`(145) ✓ (ascending)
- ✓ `grep -c "throw new FilterDriftError\|throw new PaginationStuckError"` = 0 antes del cuerpo de `assertFilterIs` — solo `assertFilterIs` lanza `FilterDriftError` (en su body)

### Acceptance criteria (Task 2)

- ✓ `tsc --noEmit` exit 0
- ✓ `grep -c "private async readHidden(): Promise<string>"` = 1
- ✓ `grep -c "private async readPageInputValue(): Promise<string>"` = 1
- ✓ `grep -c "private async readFirstRowFingerprint(): Promise<{ phone: string; hora: string }>"` = 1
- ✓ `grep -c "private async readTotalCitas(): Promise<number | null>"` = 1
- ✓ `grep -c "private async assertFilterIs(expectedId: string, when: string): Promise<void>"` = 1
- ✓ `assertFilterIs` lanza `FilterDriftError` (`grep -A 6 "private async assertFilterIs" | grep -c "throw new FilterDriftError"` = 1)
- ✓ Log prefix `[GoDentist]` preservado (`grep -c "\[GoDentist\] FilterDriftError"` = 1)
- ✓ Call sites externos: `this.readPageInputValue() / this.readFirstRowFingerprint() / this.readTotalCitas() / this.assertFilterIs(` = 0 cada uno. `this.readHidden()` = 1 (uso interno dentro de `assertFilterIs` body — esperado).

## Style verbatim

- 2 espacios indent (module-level), 4 espacios indent dentro del cuerpo de la clase ✓
- Sin punto y coma final ✓
- JSDoc en cada símbolo ✓
- `[GoDentist]` prefix en `console.error` (assertFilterIs) ✓
- `public readonly` constructor params en error classes (analog SedeRefreshFailedError) ✓
- `this.page!` non-null assertion (consistente con otros métodos privados) ✓

## Threat model status

Threat register T-v2-03-01..T-v2-03-03 todos `accept` per CONTEXT.md threat_model. Sin nueva superficie de attack:
- T-v2-03-01 (info disclosure en error.message): solo IDs internos numéricos del portal, sin PII.
- T-v2-03-02 (tampering SEDE_ID_MAP): constante en código bajo VCS, no runtime surface.
- T-v2-03-03 (DoS por evaluate repeated): <50ms cada evaluate; total <1s por scrape — aceptable.

## Comportamiento del robot

**Sin cambio.** El robot sigue ejecutando paradigm A (loop + `waitForSucursalRefresh` + `extractAppointments(sucursal.label)`) hasta Plan 05 reescriba `scrapeAppointments`. Los símbolos nuevos están **dormidos** (cero call sites externos para los 4 helpers no-internos; SEDE_ID_MAP no leído por código actual; las 2 error classes nunca thrown por código actual).

## Downstream unblocked

- **Plan 04** puede ahora wirear `selectSucursalF` + `clickBuscarAndWait` + `clickNextPageWithGuard` contra estos helpers.
- **Plan 05** puede reescribir `scrapeAppointments` consumiendo `SEDE_ID_MAP` para el loop driver + `assertFilterIs` en 3 puntos del lifecycle (post-select, post-buscar, page-N) + `clickNextPageWithGuard` para pagination + `extractCurrentPageRows(sede)`.
- **Plan 05** también actualiza `server.ts` con `instanceof FilterDriftError → 502` y `instanceof PaginationStuckError → 502` mappings.

## Self-Check

Created files exist:
- ✓ `.planning/standalone/godentist-scraping-structural-v2/03-SUMMARY.md` (this file)

Commits exist:
- ✓ `8121ed6` (Task 1) → `git log --oneline | grep -q 8121ed6`
- ✓ `d7b5f77` (Task 2) → `git log --oneline | grep -q d7b5f77`

Symbols exist at declared lines:
- ✓ SEDE_ID_MAP line 89
- ✓ FilterDriftError line 108
- ✓ PaginationStuckError line 132
- ✓ readHidden line 1713
- ✓ readPageInputValue line 1727
- ✓ readFirstRowFingerprint line 1745
- ✓ readTotalCitas line 1763
- ✓ assertFilterIs line 1787

## Self-Check: PASSED
