---
phase: godentist-scraping-structural-v2
plan: 03
type: execute
wave: 1
depends_on: [01, 02]
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
    - "El adapter define el módulo-level constant SEDE_ID_MAP con exactamente 4 entries: CABECERA=1, FLORIDABLANCA=3, JUMBO EL BOSQUE=5, MEJORAS PUBLICAS=4"
    - "El adapter exporta dos clases Error custom nuevas: FilterDriftError y PaginationStuckError"
    - "El adapter define 5 helper methods nuevos (módulo-level o privados): readHidden, readPageInputValue, readFirstRowFingerprint, readTotalCitas, assertFilterIs"
    - "El TypeScript del robot compila sin errores (tsc --noEmit pasa)"
    - "No se elimina nada del adapter aún (paradigm F core rewrite es Plan 05); este plan solo agrega scaffolding inerte"
  artifacts:
    - path: "godentist/robot-godentist/src/adapters/godentist-adapter.ts"
      provides: "SEDE_ID_MAP, FilterDriftError, PaginationStuckError, helpers readHidden/readPageInputValue/readFirstRowFingerprint/readTotalCitas/assertFilterIs"
      contains:
        - "const SEDE_ID_MAP"
        - "'CABECERA': '1'"
        - "'FLORIDABLANCA': '3'"
        - "'JUMBO EL BOSQUE': '5'"
        - "'MEJORAS PUBLICAS': '4'"
        - "export class FilterDriftError extends Error"
        - "export class PaginationStuckError extends Error"
        - "readHidden"
        - "readPageInputValue"
        - "readFirstRowFingerprint"
        - "readTotalCitas"
        - "assertFilterIs"
  key_links:
    - from: "godentist-adapter.ts (new exported error classes)"
      to: "godentist-adapter.ts scrapeAppointments (Plan 05) + server.ts (Plan 05 — instanceof mapping to HTTP 502)"
      via: "ES module export"
      pattern: "export class (FilterDriftError|PaginationStuckError)"
---

<objective>
Agregar al adapter las primitivas inertes que el paradigm F (Plans 04-05) consumirá:

1. Constante módulo-level `SEDE_ID_MAP` con los 4 valores empíricamente verificados en RESEARCH.md.
2. Dos clases Error custom: `FilterDriftError` y `PaginationStuckError` (replican el patrón de `SedeRefreshFailedError` existente en líneas 47-68 — primera clase Error custom del robot).
3. 5 helpers privados/módulo-level que la rewrite consumirá: `readHidden`, `readPageInputValue`, `readFirstRowFingerprint`, `readTotalCitas`, `assertFilterIs`.

Purpose: Interface-first task ordering — Plan 04 (selectSucursalF + clickBuscarAndWait + clickNextPageWithGuard) y Plan 05 (rewrite scrapeAppointments) consumen estos símbolos. Mantenerlos en un commit aislado:
- Simplifica el code review.
- Reduce blast radius si algo sale mal (los símbolos están dormidos = sin call sites todavía).
- Permite tsc --noEmit gate inmediato sin depender del wiring completo.

Output: ~120 líneas agregadas al adapter, todas inertes. El robot sigue funcionando idéntico (CONFIRMACIÓN: el comportamiento de paradigm A actual — loop+waitForSucursalRefresh — no cambia hasta Plan 05). Sin commit todavía.
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
<!-- Existing structure top-of-file (godentist-adapter.ts lines 1-30) — paradigm A scaffolding still in place -->

```typescript
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

// ── Table-refresh guard primitives (LEGACY paradigm A — shipped 12-may) ──
const SUCURSAL_REFRESH_TIMEOUT_MS = 8000
const SUCURSAL_REFRESH_POLL_MS = 250

interface Fingerprint {
  phone: string
  hora: string
  rowCount: number
}

function fingerprintsEqual(a: Fingerprint | null, b: Fingerprint | null): boolean {
  // ...
}

export class SedeRefreshFailedError extends Error {
  // ...
}

interface Sucursal {
  value: string
  label: string
}
```

<!-- New paradigm F primitives are inserted AFTER SedeRefreshFailedError, BEFORE `interface Sucursal`. -->

<!-- Style verbatim of the existing adapter -->
- 2 espacios de indent
- SIN punto y coma final
- `interface` (no `type`) para records
- JSDoc para símbolos no-triviales
- Logs prefijados `[GoDentist]`
- Error classes con `public readonly` constructor params (analog: SedeRefreshFailedError lines 56-67)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Agregar SEDE_ID_MAP + FilterDriftError + PaginationStuckError al top-of-file del adapter</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts líneas 1-70 (confirmar estructura actual + analog SedeRefreshFailedError lines 47-68)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §1 (snippet completo de las 2 error classes — líneas 64-92 del PATTERNS)
    - .planning/standalone/godentist-scraping-structural-v2/RESEARCH.md §Standard Stack (SEDE_ID_MAP verbatim)
    - .planning/standalone/godentist-scraping-structural-v2/CONTEXT.md D-07 (correctness by construction) + D-11 (x-item-disabled)
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
**Insertar el siguiente bloque INMEDIATAMENTE DESPUÉS de la closing brace `}` de la clase `SedeRefreshFailedError` (línea ~68) y ANTES de `interface Sucursal {` (línea ~70):**

```typescript

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

```

**Style notes:**
- NO añadir punto y coma final (consistente con resto del archivo).
- Indent 2 espacios.
- Backticks para template strings.
- `public readonly` constructor params (analog SedeRefreshFailedError).
- JSDoc obligatorio en cada símbolo.
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit 2>&1 | head -20 && grep -c "const SEDE_ID_MAP" src/adapters/godentist-adapter.ts && grep -c "export class FilterDriftError extends Error" src/adapters/godentist-adapter.ts && grep -c "export class PaginationStuckError extends Error" src/adapters/godentist-adapter.ts && grep -c "'CABECERA': '1'" src/adapters/godentist-adapter.ts && grep -c "'FLORIDABLANCA': '3'" src/adapters/godentist-adapter.ts && grep -c "'JUMBO EL BOSQUE': '5'" src/adapters/godentist-adapter.ts && grep -c "'MEJORAS PUBLICAS': '4'" src/adapters/godentist-adapter.ts</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0 (sin errores TypeScript).
    - `grep -c "^const SEDE_ID_MAP: Record" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "'CABECERA': '1'" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "'FLORIDABLANCA': '3'" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "'JUMBO EL BOSQUE': '5'" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "'MEJORAS PUBLICAS': '4'" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "export class FilterDriftError extends Error" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "export class PaginationStuckError extends Error" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - Las clases se ubican ENTRE `SedeRefreshFailedError` e `interface Sucursal {`: `awk '/class SedeRefreshFailedError/{a=NR} /class FilterDriftError/{b=NR} /class PaginationStuckError/{c=NR} /^interface Sucursal/{d=NR; print a,b,c,d}' godentist/robot-godentist/src/adapters/godentist-adapter.ts` muestra orden ascendente a < b < c < d.
    - No hay nuevos call sites todavía: `grep -c "throw new FilterDriftError\|throw new PaginationStuckError" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `0` (esos llegan en Plan 04+05).
  </acceptance_criteria>

  <done>
    SEDE_ID_MAP + 2 error classes agregadas al top-of-file. tsc pasa. Style verbatim. Sin call sites = sin cambio de comportamiento.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Agregar 5 helper methods privados a la clase GoDentistAdapter (readHidden, readPageInputValue, readFirstRowFingerprint, readTotalCitas, assertFilterIs)</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts líneas 1576-1740 (analog para private methods: captureFingerprint, waitForSucursalRefresh — pattern de `this.page!.evaluate` + `[GoDentist]` log prefix)
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts líneas 1448-1470 (analog selectSucursal — uso de `this.page!`)
    - .planning/standalone/godentist-scraping-structural-v2/RESEARCH.md §Code Examples (helpers están referenciados pero las bodies se construyen aquí desde primer principios + research-scripts/06-paradigm-e-validation.cjs y 08-paradigm-f-validation.cjs)
    - .planning/standalone/godentist-scraping-structural-v2/PATTERNS.md §1 "Pagination guard" (snippet de clickNextPageWithGuard que muestra firma de readFirstRowFingerprint + readPageInputValue)
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
**Localizar la clase `GoDentistAdapter` y agregar los siguientes 5 helpers privados.**

**Ubicación:** Insertar INMEDIATAMENTE DESPUÉS del método existente `private async captureFingerprint(): Promise<Fingerprint | null>` (línea ~1620 aproximadamente — buscar la closing brace `}` de ese método). Insertar ANTES de cualquier otro método (e.g., `waitForSucursalRefresh` línea ~1640).

**Bloque a insertar:**

```typescript

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

```

**Style notes:**
- NO añadir punto y coma final (consistente con resto del archivo).
- Indent 2 espacios (estos son métodos de clase → indent del cuerpo es 4 espacios).
- `[GoDentist]` log prefix obligatorio en `console.error`.
- `this.page!` (non-null assertion) consistent con otros métodos.

**NO modificar:**
- Ningún método existente.
- Ninguna importación.
- La firma de la clase.
- Los símbolos del Task 1.
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit 2>&1 | head -20 && grep -c "private async readHidden" src/adapters/godentist-adapter.ts && grep -c "private async readPageInputValue" src/adapters/godentist-adapter.ts && grep -c "private async readFirstRowFingerprint" src/adapters/godentist-adapter.ts && grep -c "private async readTotalCitas" src/adapters/godentist-adapter.ts && grep -c "private async assertFilterIs" src/adapters/godentist-adapter.ts</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0.
    - `grep -c "private async readHidden(): Promise<string>" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "private async readPageInputValue(): Promise<string>" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "private async readFirstRowFingerprint(): Promise<{ phone: string; hora: string }>" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "private async readTotalCitas(): Promise<number | null>" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `grep -c "private async assertFilterIs(expectedId: string, when: string): Promise<void>" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - `assertFilterIs` lanza `FilterDriftError`: `grep -A 2 "private async assertFilterIs" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep -c "throw new FilterDriftError"` retorna `1`.
    - Logging prefix preservado: `grep -c "\[GoDentist\] FilterDriftError" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `1`.
    - No hay call sites externos a estos helpers todavía (Plan 04 los wireea): `grep -c "this\.readHidden()\|this\.readPageInputValue()\|this\.readFirstRowFingerprint()\|this\.readTotalCitas()\|this\.assertFilterIs(" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna `0` (las firmas SON los matches pero sólo declaraciones; no hay invocaciones externas todavía).
  </acceptance_criteria>

  <done>
    5 helpers privados agregados a GoDentistAdapter. tsc pasa. Logs con `[GoDentist]` prefix. Helpers dormidos (no call sites externos) — Plan 04 los wireea.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Robot adapter ↔ Portal Dentos | Sin nuevo cruce en este plan (sólo scaffolding; no hay nuevas peticiones HTTP). |
| Robot adapter ↔ Express handler | Nuevas error classes exportadas — server.ts (Plan 05) consumirá vía instanceof. Sin nueva superficie aún. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v2-03-01 | Information disclosure | `FilterDriftError.message` incluye `expectedId` y `actualId` numéricos (sin PII) | accept | Solo IDs internos del portal. Sin PII en el message. |
| T-v2-03-02 | Tampering | SEDE_ID_MAP hardcoded | accept | Constante en código fuente bajo control de versiones. Si Godentist agrega una sede nueva, requiere code review + new commit. Sin runtime tampering surface. |
| T-v2-03-03 | Denial of service | `readHidden`/`readPageInputValue` corren `page.evaluate` repetidamente (multiple call sites) | accept | Cada evaluate <50ms. assertFilterIs se llama 3-N veces por sede (post-select + post-buscar + per-page). Overhead total <1s por scrape. Aceptable. |
</threat_model>

<verification>
- `tsc --noEmit` pasa.
- Los 8 nuevos símbolos (SEDE_ID_MAP + 2 error classes + 5 helpers) presentes (greps arriba).
- Style verbatim: indent, sin `;` final, JSDoc, `[GoDentist]` log prefix.
- Sin call sites externos = sin cambio de comportamiento del robot.
</verification>

<success_criteria>
- [ ] SEDE_ID_MAP + FilterDriftError + PaginationStuckError agregados (Task 1).
- [ ] 5 helpers privados agregados a GoDentistAdapter (Task 2).
- [ ] `tsc --noEmit` pasa sin errores.
- [ ] Style verbatim del resto del archivo.
- [ ] No hay nuevos call sites — robot funciona idéntico hasta Plan 05.
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/godentist-scraping-structural-v2/03-SUMMARY.md` con:
- Lista de los 8 símbolos agregados con line numbers exactos.
- Output de `tsc --noEmit` (debe ser empty/no errors).
- Nota: "Plan 04 puede ahora wirear selectSucursalF + clickBuscarAndWait + clickNextPageWithGuard contra estos helpers."
</output>
</content>
</invoke>