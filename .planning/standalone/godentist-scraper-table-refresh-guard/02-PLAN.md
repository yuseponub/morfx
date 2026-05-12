---
phase: godentist-scraper-table-refresh-guard
plan: 02
type: execute
wave: 2
depends_on:
  - "01"
files_modified:
  - godentist/robot-godentist/src/adapters/godentist-adapter.ts
autonomous: true
requirements:
  - REQ-01
  - REQ-02

must_haves:
  truths:
    - "El adapter tiene un método privado captureFingerprint() que retorna Promise<Fingerprint | null>"
    - "El adapter tiene un método privado waitForSucursalRefresh(prev, label) que retorna Promise<Fingerprint | null>"
    - "Si prevFingerprint es null, waitForSucursalRefresh hace early return SIN llamar waitForFunction (evita esperar 8s desperdiciados — Pitfall 1)"
    - "Si prevFingerprint es non-null y curr no cambia tras 8s, waitForSucursalRefresh reintenta selectSucursal+clickBuscar (max 3 attempts total)"
    - "Si los 3 attempts agotan, waitForSucursalRefresh hace throw new SedeRefreshFailedError(label, 3, stuckFp)"
    - "Entre attempts, el método ejecuta page.keyboard.press('Escape') para garantizar combo cerrado (Pitfall 3)"
    - "Los logs grep-ables D-10 están presentes con el texto verbatim (confirmed / failed / FAILED)"
    - "El robot compila TypeScript sin errores"
  artifacts:
    - path: "godentist/robot-godentist/src/adapters/godentist-adapter.ts"
      provides: "Helpers privados captureFingerprint y waitForSucursalRefresh"
      contains:
        - "private async captureFingerprint(): Promise<Fingerprint | null>"
        - "private async waitForSucursalRefresh(prev: Fingerprint | null, sucursalLabel: string): Promise<Fingerprint | null>"
        - "throw new SedeRefreshFailedError"
        - "Table refresh confirmed for"
        - "Table refresh failed for"
        - "Table refresh FAILED for"
  key_links:
    - from: "waitForSucursalRefresh (Plan 02)"
      to: "scrapeAppointments loop (Plan 03)"
      via: "instance method invocation"
      pattern: "await this.waitForSucursalRefresh"
    - from: "waitForSucursalRefresh (Plan 02)"
      to: "SedeRefreshFailedError (Plan 01)"
      via: "throw"
      pattern: "throw new SedeRefreshFailedError"
---

<objective>
Añadir DOS métodos privados al adapter, ambos definidos pero aún SIN call sites en el loop (los wirea Plan 03):

1. **`private async captureFingerprint(): Promise<Fingerprint | null>`** — extrae fingerprint `(phone, hora, rowCount)` de la primera fila válida de la tabla actual del portal. Retorna `null` si tabla vacía (0 filas con `cleanCells.length >= 3`). Usa `page.evaluate(() => primitive)` (patrón del analog `getTotalPages`).

2. **`private async waitForSucursalRefresh(prev, label)`** — el guard core:
   - Edge case D-03: si `prev === null`, early-return ANTES de invocar `waitForFunction` (captura curr, log, return).
   - Loop `for (let attempt = 1; attempt <= 3; attempt++)`:
     - Si `attempt > 1`: ejecutar `await this.page.keyboard.press('Escape')` (defensive — Pitfall 3); luego re-invocar `selectSucursal` + `clickBuscar` con la sucursal correspondiente (NOTA: necesitamos el `Sucursal` completo, no solo el label — ver action para resolución).
     - Invocar `page.waitForFunction(fn, prev, { polling: 250, timeout: 8000 })` con la función inline que calcula fingerprint del DOM actual y retorna truthy cuando difiere de prev.
     - Tras success: capturar `curr = await this.captureFingerprint()`, log success verbatim D-10, return `curr`.
     - Tras timeout: log failure verbatim D-10 (intermediate o final).
   - Tras 3 attempts fallidos: log FAILED verbatim D-10, `throw new SedeRefreshFailedError(label, 3, stuckFp)`.

**Decisión de diseño que afecta firma:** D-06 dice "Maneja internamente el reintento de selectSucursal + clickBuscar hasta 2 veces". Esto requiere que el helper conozca cómo re-invocar esos métodos. Dos opciones:

- **Opción A (mantener firma D-06):** El helper recibe solo `(prevFingerprint, sucursalLabel)`. Para retry, el helper debe encontrar el objeto `Sucursal` original. Esto es feo (requiere acceso a `this.lastSucursales` cacheadas o pasar el objeto completo).
- **Opción B (extender firma D-06 — recomendada):** El helper recibe `(prevFingerprint, sucursal: Sucursal)` (objeto completo). El label se deriva de `sucursal.label`. Más limpio. **CONTEXT.md D-06 dice "firma `private async waitForSucursalRefresh(prevFingerprint: Fingerprint | null, sucursalLabel: string): Promise<Fingerprint>`" — pero también dice "Claude's Discretion: Naming exacto del helper" y "estructura interna del polling loop". Extender la firma a `(prev, sucursal: Sucursal)` está dentro del rango de discreción razonable. Documentar en SUMMARY como divergencia justificada.**

Esta plan implementa Opción B (firma extendida). Plan 03 (wire) usa la firma extendida.

Purpose: Implementar el guard core con todos sus edge cases (null/null, null→non-null, non-null/non-null igual, non-null/non-null diferente, timeout, retry, final fail). Los logs grep-ables son el mecanismo de forensics futuro (D-10).

Output: 2 nuevos métodos privados (~80 líneas total) añadidos al adapter. Sin call sites todavía. `tsc --noEmit` pasa.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/godentist-scraper-table-refresh-guard/SPEC.md
@.planning/standalone/godentist-scraper-table-refresh-guard/CONTEXT.md
@.planning/standalone/godentist-scraper-table-refresh-guard/RESEARCH.md
@.planning/standalone/godentist-scraper-table-refresh-guard/PATTERNS.md
@.planning/standalone/godentist-scraper-table-refresh-guard/01-SUMMARY.md

<interfaces>
<!-- Plan 01 ya añadió al adapter: -->

```typescript
const SUCURSAL_REFRESH_TIMEOUT_MS = 8000
const SUCURSAL_REFRESH_POLL_MS = 250

interface Fingerprint {
  phone: string
  hora: string
  rowCount: number
}

function fingerprintsEqual(a: Fingerprint | null, b: Fingerprint | null): boolean { /* ... */ }

export class SedeRefreshFailedError extends Error {
  constructor(
    public readonly sucursal: string,
    public readonly attempts: number,
    public readonly stuckFingerprint: Fingerprint | null,
  ) { /* ... */ }
}
```

<!-- Métodos existentes del adapter (de PATTERNS.md, lectura del archivo): -->

```typescript
interface Sucursal {
  value: string
  label: string
}

// líneas 1448-1468
private async selectSucursal(sucursal: Sucursal): Promise<void> {
  if (!this.page) return
  const comboId = await this.getSucursalComboInputId()
  if (!comboId) return
  await this.openComboDropdown(comboId)
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

// líneas 1470-1500
private async clickBuscar(): Promise<void> {
  if (!this.page) return
  // ... logs all buttons, finds Buscar/Filtrar/Consultar, clicks or falls back to Enter on #df_fecha
}

// líneas 1539-1573 — patrón analog para captureFingerprint (page.evaluate returning primitive/0/null)
private async getTotalPages(): Promise<number> {
  if (!this.page) return 0
  return await this.page.evaluate(() => { /* ... */ return 0 })
}

// líneas 1600-1623 (extractAppointments) — selector y filtro de filas que captureFingerprint debe imitar:
//   await this.page.waitForSelector('table', { timeout: 10000 })
//   const rows = this.page.locator('table tbody tr')
//   ... for each row: cells = locator('td').allTextContents(); cleanCells = cells.filter(c => c.length > 0); if (cleanCells.length < 3) continue
```

<!-- Logs verbatim D-10 (CONTEXT.md): -->

- Éxito: `[GoDentist] Table refresh confirmed for ${sucursal} after attempt ${n}: prev={phone,hora,rowCount} → curr={phone,hora,rowCount}`
- Fallo intermedio: `[GoDentist] Table refresh failed for ${sucursal} attempt ${n}/3 — retrying selectSucursal`
- Fallo final: `[GoDentist] Table refresh FAILED for ${sucursal} after 3 attempts — aborting scrape. Fingerprint stuck at {phone,hora,rowCount}`

NOTA: el guión en "retrying selectSucursal" es un EM DASH `—` (U+2014), NO un hyphen-minus. CONTEXT.md D-10 usa `—` consistentemente. Copiar verbatim.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Implementar captureFingerprint()</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts (líneas 1539-1573 — analog `getTotalPages`; líneas 1600-1625 — selectores+filtro de `extractAppointments`)
    - .planning/standalone/godentist-scraper-table-refresh-guard/PATTERNS.md (Analog 1 + Analog 7 — copy-paste base)
    - .planning/standalone/godentist-scraper-table-refresh-guard/RESEARCH.md (`Pattern 1: page.waitForFunction con argumento serializable` — heuristics de parsing phone+hora del row)
    - .planning/standalone/godentist-scraper-table-refresh-guard/CONTEXT.md (D-01 — fingerprint shape)
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
**Insertar el siguiente método privado DENTRO de la clase `GoDentistAdapter`, INMEDIATAMENTE DESPUÉS del cierre del método `clickBuscar()` (que termina en línea 1500). Esto coloca el nuevo helper agrupado con los otros helpers privados, manteniendo coherencia de organización.**

Si la línea exacta cambió por el insert del Plan 01 (que añadió ~50 líneas antes de `interface Sucursal`), buscar el cierre de `clickBuscar` por contenido: `grep -n "// Fallback: press Enter on date field to trigger reload" godentist/robot-godentist/src/adapters/godentist-adapter.ts` y localizar el `}` que cierra el método ~5 líneas abajo.

```typescript

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
```

**Verificar:** sin `;` al final, indent 2, JSDoc presente. `page.evaluate` retorna primitive (objeto plano) — serializable por Playwright RPC.
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit && grep -n "private async captureFingerprint(): Promise<Fingerprint | null>" src/adapters/godentist-adapter.ts | wc -l</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0.
    - `grep -n "private async captureFingerprint(): Promise<Fingerprint | null>" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 1 match.
    - El método está DENTRO de la clase `GoDentistAdapter` (verificable: el match aparece entre `export class GoDentistAdapter {` y el `}` de cierre de la clase).
    - El cuerpo usa `page.evaluate(() => { ... })` (no `page.locator`/`page.$$` — necesitamos lectura atómica del DOM en browser context per RESEARCH.md Pattern 1).
    - El filtro de filas usa `cleanCells.length >= 3` (consistente con `extractAppointments` línea 1618 que descarta `cleanCells.length < 3`).
    - El método retorna `null` si no hay filas válidas (verificable: `grep -A2 "if (rowCount === 0)" godentist/robot-godentist/src/adapters/godentist-adapter.ts` muestra `return null`).
  </acceptance_criteria>

  <done>
    `captureFingerprint()` está implementado como método privado de `GoDentistAdapter`. `tsc --noEmit` pasa. Aún sin call sites — el método está dormido hasta Task 2 (`waitForSucursalRefresh` lo usa) + Plan 03 (loop lo usa).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Implementar waitForSucursalRefresh(prev, sucursal)</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts (estado tras Task 1 — confirmar `captureFingerprint` presente; líneas 1448-1500 — `selectSucursal` + `clickBuscar` para entender contratos)
    - .planning/standalone/godentist-scraper-table-refresh-guard/PATTERNS.md (Analog 5 — patrón retry loop, sección "Shared Patterns" — logging convention)
    - .planning/standalone/godentist-scraper-table-refresh-guard/RESEARCH.md (Pattern 1 — `waitForFunction` con argumento serializable, Pitfall 1/2/3 — edge cases)
    - .planning/standalone/godentist-scraper-table-refresh-guard/CONTEXT.md (D-03 — edge case null/null, D-04/D-05 — polling + timeout, D-06 — internal retry, D-10 — log strings verbatim)
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
**Insertar el siguiente método privado DENTRO de la clase `GoDentistAdapter`, INMEDIATAMENTE DESPUÉS del cierre del método `captureFingerprint()` (añadido en Task 1):**

```typescript

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
```

**Notas críticas de implementación:**

1. **EM DASH `—` (U+2014)** en el log intermedio "Table refresh failed for ... — retrying selectSucursal". Verbatim CONTEXT.md D-10. NO hyphen `-`.

2. **`fingerprintsEqual` no se usa en este método.** La comparación se hace inline dentro del `waitForFunction` callback (necesario porque el callback corre en browser context, sin acceso a la función Node `fingerprintsEqual`). `fingerprintsEqual` se mantiene como helper module-level para tests futuros (Plan 01 lo añadió, queda dormido en este plan también — eso es intencional).

3. **`page.keyboard.press('Escape').catch(() => undefined)`** — la mitigación Pitfall 3 nunca debe fallar; si la página está en estado raro, swallowamos el error del Escape para no enmascarar el problema real (que el guard reporta vía SedeRefreshFailedError).

4. **`HTMLTableRowElement` cast en el callback de waitForFunction:** TypeScript en browser context. Si tsc se queja, usar `as HTMLElement` o `as Element` — el cast es solo para satisfacer types.

5. **No usar `fingerprintsEqual(prev, curr)` para decidir return:** waitForFunction ya garantiza que prev != curr (callback retorna truthy solo cuando diferente). El `curr = await this.captureFingerprint()` post-success solo es para el log y el return.

6. **No tocar el método existente `selectSucursal` ni `clickBuscar`** — el guard re-invoca los métodos públicos sin tocar su implementación.
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit && grep -nE "private async waitForSucursalRefresh\(" src/adapters/godentist-adapter.ts | wc -l && grep -n "throw new SedeRefreshFailedError" src/adapters/godentist-adapter.ts | wc -l</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0.
    - `grep -nE "private async waitForSucursalRefresh\(" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 1 match.
    - `grep -c "throw new SedeRefreshFailedError" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna >=2 (una vez en el final del for, una vez en el unreachable fallback — por defensa de TypeScript).
    - `grep -c "Table refresh confirmed for" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna >=2 (la del early-return null path + la del success en el for loop).
    - `grep -c "Table refresh failed for" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna >=1.
    - `grep -c "Table refresh FAILED for" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna >=1 (uppercase FAILED).
    - `grep -c "retrying selectSucursal" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna >=1.
    - El log de fallo intermedio usa EM DASH `—` (U+2014): `grep -P "attempt \d+/3 — retrying" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna >=1 match (perl regex para escape limpio). Si grep no soporta `-P`, alternativa: `grep "— retrying selectSucursal" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna >=1.
    - `grep -n "page.keyboard.press('Escape')" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna >=2 matches (uno preexistente en `selectSucursal` línea 1463, uno nuevo dentro de waitForSucursalRefresh).
    - El método aún NO tiene call site externo (Plan 03 hace wire): `grep -c "this.waitForSucursalRefresh" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 0.
    - `SUCURSAL_REFRESH_TIMEOUT_MS` y `SUCURSAL_REFRESH_POLL_MS` se usan exactamente 1 vez cada uno dentro del nuevo método: `grep -c "SUCURSAL_REFRESH_TIMEOUT_MS" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna 2 (declaración + uso); idem `SUCURSAL_REFRESH_POLL_MS`.
  </acceptance_criteria>

  <done>
    `waitForSucursalRefresh(prev, sucursal: Sucursal)` está implementado dentro de la clase. Maneja edge case D-03 con early return. Loop retry 3 attempts. Throws `SedeRefreshFailedError` tras 3 fallos. Logs verbatim D-10 con EM DASH correcto. `tsc --noEmit` pasa. Aún sin call site (Plan 03 lo wirea).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Adapter (Node) ↔ Browser context (Playwright page) | `waitForFunction` serializa `prev` Node→Browser y deserializa el truthy return. Sin código de usuario atravesando el boundary (callback es estatic per request). |
| Adapter ↔ Portal Dentos | El `selectSucursal + clickBuscar` re-invocados ya cruzan este boundary; el guard NO añade superficie nueva (mismas operaciones, solo conteo de retries). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-grd-02-01 | Denial of service | Loop retry × timeout | mitigate | Loop acotado a 3 attempts × 8s timeout = max 24s por sede × 4 sedes worst-case = 96s overhead. Bien dentro del límite Vercel 5min (CONTEXT.md D-05). No hay loop ilimitado. |
| T-grd-02-02 | Denial of service | `page.keyboard.press('Escape').catch(() => undefined)` swallowing | accept | Si el Escape falla porque la página está cerrada, el próximo `selectSucursal/clickBuscar` también fallará con error claro de Playwright y propagará al catch del loop → cuenta como attempt fallido → eventualmente `SedeRefreshFailedError`. No queda en estado limbo. |
| T-grd-02-03 | Information disclosure | Phone+hora se incluyen en logs Railway | mitigate | Los logs Railway son privados (acceso solo via Railway dashboard del operador). El phone aparece igual que en logs existentes (`getTotalPages`, `extractAppointments` ya loguean filas). Sin nueva superficie de exposición — los logs son confidenciales y temporales (rotación Railway). |
| T-grd-02-04 | Tampering | `waitForFunction` callback runs in browser context | accept | El callback es funcionalmente puro (lee DOM, no muta); browser context puede tener scripts del portal mutando DOM pero eso es exactamente lo que queremos detectar (refresh). No hay tampering de nuestro callback — Playwright lo inyecta atómicamente. |
| T-grd-02-05 | Repudiation | Logs ambiguos en caso de fail | accept | Los 3 logs verbatim (`confirmed/failed/FAILED`) son distintivos (capitalización de FAILED final, attempt N/3 explícito, fingerprint stuck completo). El operador puede reconstruir cualquier incidente con `railway logs | grep "Table refresh"`. Idéntico patrón forense que reconstruyó el incidente del 11-may. |
</threat_model>

<verification>
- TypeScript compila: `cd godentist/robot-godentist && npx tsc --noEmit`.
- Métodos presentes y solo presentes en el adapter (greps arriba).
- 3 strings de log verbatim D-10 (con EM DASH correcto en el "failed for ... — retrying").
- 0 call sites externos (Plan 03 los añade).
- Robot arranca sin crash: `cd godentist/robot-godentist && npm start` no falla en parse/import (opcional smoke).
</verification>

<success_criteria>
- [ ] 2 métodos privados nuevos en `GoDentistAdapter`.
- [ ] `tsc --noEmit` pasa.
- [ ] Logs verbatim D-10 con EM DASH `—` (no hyphen `-`).
- [ ] Edge case D-03 (prev null) maneja early return sin invocar waitForFunction.
- [ ] Defensive `page.keyboard.press('Escape')` entre attempts (Pitfall 3).
- [ ] Throw `SedeRefreshFailedError` tras 3 attempts agotados, con stuckFingerprint capturado para enriquecer el log.
- [ ] Commit atómico en español + Co-Authored-By Claude.
</success_criteria>

<output>
Tras completar este plan crear `.planning/standalone/godentist-scraper-table-refresh-guard/02-SUMMARY.md` con: métodos añadidos, ubicación en archivo, decisión de divergencia D-06 firma `(prev, sucursal: Sucursal)` en vez de `(prev, sucursalLabel: string)` con justificación (mínimo invasivo, mantiene contrato de re-invocar `selectSucursal`), greps de validación ejecutados, y nota "los símbolos están listos pero aún sin call sites — Plan 03 wirea waitForSucursalRefresh en scrapeAppointments loop".
</output>
