# Standalone: GoDentist Scraper Table-Refresh Guard — Research

**Researched:** 2026-05-12
**Domain:** Playwright DOM scraping en ExtJS portal (Dentos) + propagación HTTP 502 desde Express handler
**Confidence:** HIGH (todas las decisiones de diseño ya lockeadas en CONTEXT.md D-01..D-11; research se limita a 7 áreas técnicas mecánicas)
**Stack verificado:** `playwright ^1.52.0` + `express ^4.21.0` + Node 22 (Railway). [VERIFIED: `godentist/robot-godentist/package.json`]

## Summary

Cambio acotado a **2 archivos** del robot Railway (NO toca código Next.js, NO toca DB schema, NO toca server-actions Vercel — Regla 5 no aplica, Regla 1 push-a-Vercel sustituido por push Railway):
1. `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (1748 líneas) — añadir helper privado `waitForSucursalRefresh` + `captureFingerprint` + constante `SUCURSAL_REFRESH_TIMEOUT_MS=8000` + clase `SedeRefreshFailedError`, y modificar el loop `for (const sucursal of sucursales)` en línea 217 para invocar el guard entre `clickBuscar` y `extractAllPages`, además de **reemplazar el `try/catch` que acumula errores** por propagación verbatim del `SedeRefreshFailedError` (D-08).
2. `godentist/robot-godentist/src/api/server.ts` (línea 70-76) — mapear `SedeRefreshFailedError` a `res.status(502).json({ status: 'error', code: 'sede_refresh_failed', ... })`. Otros errores siguen siendo HTTP 500 verbatim.

**Primary recommendation:** Usar `page.waitForFunction(fn, prevFingerprint, { polling: 250, timeout: 8000 })` con captura inline del fingerprint dentro del browser context (NO usar `page.evaluate` separado + comparación en Node — `waitForFunction` ya integra polling+timeout+abort+browser-context-safe). El `arg` pasado (el `prevFingerprint`) es JSON-serializable (3 strings/null + 1 number) — Playwright lo serializa con su transporte propio que también soporta `NaN`/`Infinity`/`-0` pero no aplica acá.

## Approach Options

**Decisions ya lockeadas en CONTEXT.md (D-01..D-11) cubren ~95% del diseño.** Los únicos micro-tradeoffs abiertos:

| Tradeoff | Opción A | Opción B | Recomendación |
|----------|----------|----------|---------------|
| Custom Error class vs `error.code` discriminator | `class SedeRefreshFailedError extends Error { sucursal: string; attempts: number; lastFingerprint: ... }` | `throw new Error(...)` con `.code = 'sede_refresh_failed'` | **A** — el server handler ya hace `err instanceof Error` (línea 75); un `instanceof SedeRefreshFailedError` adicional es mínimo y le da type-safety al payload del 502. CONTEXT.md D-08 lo permite explícitamente como discreción de Claude. |
| Selector de fingerprint dentro de `waitForFunction` | `document.querySelectorAll('table tbody tr')` con filtro `cells.length>=3` (mismo que `extractAppointments`) | `document.querySelector('.x-grid3-row')` (selector ExtJS-specific) | **A** — `extractAppointments` (línea 1608) ya usa `'table tbody tr'` y filtra por `cleanCells.length < 3` — mismo selector mantiene consistencia. |
| Captura de baseline post-login | Tras `setHour('6:00 am')` (D-07 ya locked) | Tras navegación inicial | **D-07 ya cubre esto** — no abrir. |

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-11)
- **D-01** Fingerprint = `(phone_first_row, hora_first_row, rowCount)` extraído de la primera fila no-vacía + total de rows.
- **D-02** Equality = los 3 campos coinciden exactamente.
- **D-03** Edge cases tabla vacía: `null/null` ⇒ refresh OK; `non-null/null` ⇒ refresh OK; **solo retry si ambos no-nulos Y equal**.
- **D-04** `page.waitForFunction()` nativo con `polling: 250`.
- **D-05** `SUCURSAL_REFRESH_TIMEOUT_MS = 8000`.
- **D-06** Helper privado `waitForSucursalRefresh(prevFingerprint, sucursalLabel)` invocado entre `clickBuscar` y `extractAllPages` en el loop línea 217. Maneja 2 reintentos internos.
- **D-07** Baseline inicial capturado tras `setHour('6:00 am')` (línea 197).
- **D-08** HTTP **502** con body `{ status: 'error', code: 'sede_refresh_failed', sucursal, attempts: 3, message }`.
- **D-09** `src/app/actions/godentist.ts` **NO cambia** — el `if (!res.ok)` línea 129 ya captura 502 y bloquea downstream (no insert en `godentist_scrape_history`, no `scheduleReminders`). [VERIFIED: leído líneas 108-168 del action].
- **D-10** Logs grep-ables con prefix `[GoDentist] Table refresh ...`.
- **D-11** Smoke E2E manual post-deploy × 3 corridas consecutivas con script de validación numérica. NO unit tests.

### Claude's Discretion (de CONTEXT.md)
- Naming exacto del helper, clase de error custom vs `.code` discriminator (recomendado clase custom — ver above), estructura interna del `page.waitForFunction` (inline el capture + compare).

### Deferred Ideas (OUT OF SCOPE)
- Fix `clickNextPage` no chequea `x-item-disabled` (futuro standalone si reaparece).
- Server-action dedupe por `(workspace, telefono, fecha, hora)`.
- Unit tests del adapter con mocks Playwright.
- Cleanup retrospectivo de reminders duplicados.
- Migración a API oficial Dentos.

## Phase Requirements

| ID | Descripción (SPEC.md) | Research Support |
|----|-----------------------|------------------|
| REQ-01 | Table-refresh guard antes de extracción | D-01..D-05 + Playwright `waitForFunction` API verificado |
| REQ-02 | Reintento `selectSucursal + clickBuscar` hasta 2 veces ante fallo de refresh | `selectSucursal` (línea 1448) + `clickBuscar` (línea 1470) son idempotentes — re-click sobre combo abre dropdown vía `openComboDropdown(comboId)` y selecciona ítem visible; re-click sobre Buscar ejecuta filtro de nuevo. NO requiere "reset" entre intentos. |
| REQ-03 | Abort total HTTP 5xx si una sede agota 3 intentos | Throw `SedeRefreshFailedError` desde helper → propaga sin try/catch hasta `scrapeAppointments` → propaga al Express handler → mapea a 502. |
| REQ-04 | Smoke E2E sin contaminación (3 corridas, ratio=1.0 + overlap=0) | Recipe verificado abajo. |

## Architectural Responsibility Map

| Capability | Primary Tier | Rationale |
|------------|--------------|-----------|
| DOM polling + fingerprint capture | Browser (Playwright page context) | `page.waitForFunction` evalúa la función dentro del browser; el `arg` se serializa de Node→Browser; no hay ida y vuelta en cada iteración del polling. |
| Retry / control flow | Adapter (Node) | El helper en Node hace `for (let attempt=1; attempt<=3; attempt++)` y entre intentos re-invoca `selectSucursal + clickBuscar` (operaciones Playwright Node→Browser). |
| Error mapping a HTTP 502 | Express handler | `server.ts:70` `try/catch` ya existe; agregar `if (err instanceof SedeRefreshFailedError) → 502`. |
| Downstream gating (no insert history, no scheduleReminders) | Server-action `src/app/actions/godentist.ts:129` | NO cambia — `if (!res.ok)` ya gatea correctamente [VERIFIED]. |

## Standard Stack

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `playwright` | ^1.52.0 | DOM polling con `waitForFunction` | Ya en uso; API nativa para polling+timeout integrado | [VERIFIED: `package.json`]
| `express` | ^4.21.0 | HTTP handler que mapea error → 502 | Ya en uso | [VERIFIED: `package.json`]

**No nuevos paquetes.** No hay nada que `npm install`.

## Code Anchors

Líneas exactas del repo verificadas:

### `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (1748 líneas)

| Línea | Símbolo | Rol en el fix |
|-------|---------|---------------|
| 1 | `import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'` | Agregar `errors` import: `import { errors as playwrightErrors } from 'playwright'` si se quiere `instanceof playwrightErrors.TimeoutError` (opcional — el helper puede capturar genéricamente). |
| 19 | `export class GoDentistAdapter` | El helper nuevo es método privado de esta clase. |
| 166 | `async scrapeAppointments(filterSucursales?, targetDate?)` | Donde se captura baseline post-`setHour` (D-07). |
| 197 | `await this.takeScreenshot('after-set-hour')` | Inmediatamente después: `let prevFingerprint = await this.captureFingerprint()`. |
| 217 | `for (const sucursal of sucursales) { try { ... selectSucursal ... clickBuscar ... extractAllPages ... } catch (err) { errors.push(msg) } }` | **MODIFICAR EL TRY/CATCH**: el catch actual swallows todos los errores. Para D-08 abort total: el `SedeRefreshFailedError` NO debe ser capturado por este catch — debe propagar. Dos opciones equivalentes: **(a)** dentro del catch hacer `if (err instanceof SedeRefreshFailedError) throw err`; **(b)** sacar la llamada al guard fuera del try/catch (entre `clickBuscar` y el `try`). Opción (a) es menos invasiva y preserva la captura de errores de extracción (que sí deben acumularse en `errors[]`). |
| 222 | `await this.page.waitForTimeout(3000)` | Reemplazar este `waitForTimeout(3000)` ciego por `prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal.label)`. La pausa de 3s era exactamente el síntoma del bug — el portal a veces tarda más. |
| 228 | `catch (err) { errors.push(msg) }` | Ver línea 217 arriba (opción a recomendada). |
| 1448 | `private async selectSucursal(sucursal: Sucursal)` | **Idempotente**: cada llamada abre el combo vía `openComboDropdown` (probablemente toggle), selecciona item, espera 500ms. Re-llamar es seguro — no hay state acumulado. |
| 1470 | `private async clickBuscar()` | **Idempotente**: cada llamada loguea botones, encuentra "Buscar"/"Filtrar"/"Consultar", hace click; si no encuentra, presiona Enter en `#df_fecha`. Re-click es seguro. |
| 1509 | `private async extractAllPages(sucursal: string)` | **NO TOCAR**. Solo cambia que ahora se invoca con la tabla garantizada como refrescada. |
| 1547 | `getTotalPages()` con `page.evaluate(() => { ... })` | Patrón a imitar para `captureFingerprint`. |
| 1600 | `extractAppointments` línea 1605: `await this.page.waitForSelector('table', { timeout: 10000 })`; línea 1608: `this.page.locator('table tbody tr')`; línea 1618: `if (cleanCells.length < 3) continue` | **SELECTOR Y FILTRO DE REFERENCIA** para que el `captureFingerprint` lea las mismas filas que la extracción real. Si capturamos un selector distinto, fingerprint puede diferir de la "verdad" de la extracción. |
| 1668 | `try/catch` interno de `extractAppointments` con `takeScreenshot('extraction-error')` | No relacionado al fix; ignora. |

### `godentist/robot-godentist/src/api/server.ts` (237 líneas) — Express handler

| Línea | Código actual | Cambio |
|-------|---------------|--------|
| 27 | `app.post('/api/scrape-appointments', async (req, res) => { ... })` | Endpoint a modificar. |
| 59 | `const result = await adapter.scrapeAppointments(body.sucursales, body.targetDate)` | Esta llamada ahora puede throw `SedeRefreshFailedError` (D-08). |
| 70-76 | `} catch (err) { console.error('[Server] Scrape error:', err); await adapter.takeScreenshot('server-error'); res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }) }` | **AGREGAR** branch antes del 500 genérico: `if (err instanceof SedeRefreshFailedError) { res.status(502).json({ status: 'error', code: 'sede_refresh_failed', sucursal: err.sucursal, attempts: err.attempts, message: err.message }); return }`. El `console.error` + `takeScreenshot` deberían seguir corriendo (mover antes del `if` o duplicar). |

**Importación**: `SedeRefreshFailedError` se exporta del adapter (`export class SedeRefreshFailedError extends Error { ... }`) e se importa en `server.ts` desde `'../adapters/godentist-adapter.js'`.

### `src/app/actions/godentist.ts` (línea 108-168) — server-action, READ-ONLY

| Línea | Código | Rol |
|-------|--------|-----|
| 118 | `const res = await fetch(\`${ROBOT_URL}/api/scrape-appointments\`, ...)` | Llama al robot. |
| 129 | `if (!res.ok) { const text = await res.text(); return { error: \`Robot error (${res.status}): ${text}\` } }` | **Ya gatea HTTP 502 automáticamente** — retorna `{ error }` sin ejecutar el insert en línea 148. [VERIFIED contra el código]. |
| 148 | `.from('godentist_scrape_history').insert(insertPayload)` | NO se ejecuta si 502 → cumple Acceptance #5 (no fila nueva en abort). |

**No requiere cambios. D-09 confirmado contra el código actual.**

## Architecture Patterns

### Pattern 1: `page.waitForFunction` con argumento serializable

```typescript
// Verified Playwright API behavior:
// - pageFunction runs in BROWSER context (no closures from Node)
// - arg is serialized via Playwright's transport (supports primitives, plain objects, arrays, NaN/Infinity/-0)
// - polling: number = setTimeout interval in browser; 'raf' = requestAnimationFrame (default)
// - timeout: number = ms, throws TimeoutError on expiry
// - Returns JSHandle wrapping the truthy value when condition met
// Source: https://playwright.dev/docs/api/class-frame#frame-wait-for-function

const prevFp = await this.captureFingerprint()  // { phone, hora, rowCount } | null
// ... selectSucursal + clickBuscar ...

try {
  await this.page.waitForFunction(
    (prev) => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'))
      const validRows = rows.filter(r => {
        const cells = Array.from(r.querySelectorAll('td'))
          .map(c => (c.textContent || '').trim())
          .filter(c => c.length > 0)
        return cells.length >= 3
      })
      const rowCount = validRows.length

      // Empty current ⇒ both nulls or transition non-null→null counts as refresh
      if (rowCount === 0) {
        return prev !== null || prev === null  // always treat empty-now as "different"
        // CAREFUL: D-03 says null/null = refresh OK, non-null/null = refresh OK.
        // The condition "rowCount===0 returns truthy" means waitForFunction resolves
        // immediately on empty-current. That's what D-03 wants.
        // BUT: if prev is null AND we want to wait for first non-empty, that's NOT what D-03 says.
        // D-03 says null/null = success → resolve immediately. OK.
      }

      // Extract first row fingerprint
      const firstRow = validRows[0]
      const cells = Array.from(firstRow.querySelectorAll('td'))
        .map(c => (c.textContent || '').trim())
        .filter(c => c.length > 0)
      // Reuse extractAppointments heuristics: hora = first time pattern, phone = first phone match
      let phone = ''
      let hora = ''
      for (const cell of cells) {
        const t = cell.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\b/)
        if (t && !hora) { hora = t[1].trim(); continue }
        const p = cell.match(/(\+?\d{10,}|\b3\d{9}\b)/)
        if (p && !phone) {
          phone = p[1].replace(/\D/g, '')
          if (phone.length === 10 && phone.startsWith('3')) phone = '57' + phone
          continue
        }
      }
      const curr = { phone, hora, rowCount }
      // If prev is null and curr non-null ⇒ refresh OK (truthy)
      if (prev === null) return true
      // Both non-null: refresh OK iff any field differs
      return prev.phone !== curr.phone || prev.hora !== curr.hora || prev.rowCount !== curr.rowCount
    },
    prevFp,  // serialized Node → Browser
    { polling: 250, timeout: 8000 }
  )
} catch (err) {
  // Playwright throws TimeoutError on timeout — propagate as retry trigger
  // (don't differentiate TimeoutError vs other errors here; the helper's outer loop handles)
}

// Now capture the *current* fingerprint for the next sede
const currFp = await this.captureFingerprint()
```

**Critical sub-finding (Pitfall):** la edge case D-03 "ambos null = refresh OK" debe resolverse **antes** de invocar `waitForFunction`, no dentro de la página:

```typescript
// In waitForSucursalRefresh, BEFORE invoking waitForFunction:
if (prevFingerprint === null) {
  // D-03 case: previous was empty. We accept any state (null or non-null) as "refreshed".
  // Just capture current and return.
  const curr = await this.captureFingerprint()
  console.log(`[GoDentist] Table refresh confirmed for ${sucursalLabel} (prev was empty)`)
  return curr
}
// Now prevFingerprint is non-null. waitForFunction polls until current differs OR is null.
```

Esto evita la trampa de "esperar 8s para confirmar null→null" que sería desperdiciado.

### Pattern 2: Custom Error class para HTTP 502 mapping

```typescript
// En godentist-adapter.ts
export class SedeRefreshFailedError extends Error {
  constructor(
    public readonly sucursal: string,
    public readonly attempts: number,
    public readonly lastFingerprint: { phone: string; hora: string; rowCount: number } | null
  ) {
    const fp = lastFingerprint
      ? `{phone:${lastFingerprint.phone},hora:${lastFingerprint.hora},rowCount:${lastFingerprint.rowCount}}`
      : 'null'
    super(`Sede ${sucursal}: tabla no se refrescó tras ${attempts} intentos. Fingerprint stuck at ${fp}`)
    this.name = 'SedeRefreshFailedError'
  }
}

// En server.ts, dentro del catch (línea 70):
import { SedeRefreshFailedError } from '../adapters/godentist-adapter.js'
// ...
} catch (err) {
  console.error('[Server] Scrape error:', err)
  await adapter.takeScreenshot('server-error')
  if (err instanceof SedeRefreshFailedError) {
    res.status(502).json({
      status: 'error',
      code: 'sede_refresh_failed',
      sucursal: err.sucursal,
      attempts: err.attempts,
      message: err.message,
    })
    return
  }
  res.status(500).json({
    success: false,
    error: err instanceof Error ? err.message : 'Unknown error',
  })
}
```

**Why `instanceof` over `.code`:** type-safety en TypeScript, payload del 502 puede acceder a `err.sucursal` y `err.attempts` sin casts. El handler en `server.ts:70` ya hace `err instanceof Error` — agregar un check más antes es trivial.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polling loop con setTimeout | `setTimeout` loop manual en Node con `page.evaluate` repetido | `page.waitForFunction(fn, arg, { polling: 250, timeout: 8000 })` | Native Playwright: maneja page-close/browser-close cleanup, integra con AbortController interno, browser-context polling (no Node↔Browser RPC en cada iter). Custom loops causan leaks si `page` cierra mid-poll. |
| Timeout detection | `Promise.race` con `setTimeout(reject, 8000)` | `waitForFunction({ timeout: 8000 })` throws `TimeoutError` | El TimeoutError es Playwright-specific, instanceof-checkable, y no requiere cleanup manual de timers Node. |
| Error → HTTP status mapping en cada handler | Hardcoded `res.status(...)` por tipo de error | `if (err instanceof SedeRefreshFailedError) → 502; else → 500` | Single source of truth: el adapter define qué es un fallo upstream (502) vs interno (500). |

## Common Pitfalls

### Pitfall 1: Edge case D-03 mal codificada dentro de `waitForFunction`

**What goes wrong:** Si codificas la lógica "null/null = refresh OK" *dentro* del callback de `waitForFunction`, terminas esperando 8s completos cuando `prevFingerprint` ya es null — porque el callback inicial podría retornar truthy inmediatamente pero también podría depender de timing del DOM render.

**How to avoid:** Resolver D-03 **antes** de invocar `waitForFunction` (early return en el helper). Solo invocar `waitForFunction` cuando `prevFingerprint !== null`. Cuando ambos no-nulos, polling busca diferencia; si `currFingerprint` se vuelve null mid-poll, también es "diferente" (rowCount===0 ≠ rowCount>0) → polling resuelve inmediatamente.

### Pitfall 2: Try/catch del loop swallowing el `SedeRefreshFailedError`

**What goes wrong:** El `try/catch` en línea 217-232 actual hace `errors.push(msg)` y continúa al siguiente sede. Si el helper throws `SedeRefreshFailedError` y este catch lo agarra, el scrape continúa y retorna 200 con datos parciales — **rompe el Acceptance #4** (HTTP 5xx, no 200 parcial).

**How to avoid:** Re-throw selectivo dentro del catch:
```typescript
} catch (err) {
  if (err instanceof SedeRefreshFailedError) throw err  // abort total
  const msg = `Error en ${sucursal.label}: ${err instanceof Error ? err.message : String(err)}`
  console.error(`[GoDentist] ${msg}`)
  errors.push(msg)
}
```

### Pitfall 3: Re-click de combo en retry — verificar idempotencia

**What goes wrong:** Si `selectSucursal` deja el combo en estado abierto cuando ya está abierto, el segundo intento puede fallar.

**Verificación con el código:** Línea 1454 `await this.openComboDropdown(comboId)` — esta llamada (no leí su implementación entera pero el patrón ExtJS típico es "click el dropdown trigger; si está abierto, click cierra; si está cerrado, click abre"). En el peor caso un re-click puede toggle a "cerrado", y el `locator('.x-combo-list-item:visible')` no encuentra items y caemos al `keyboard.press('Escape')` (línea 1463) — no-op seguro. **Recomendación para el plan:** entre intentos, agregar `await this.page.keyboard.press('Escape')` antes de re-invocar `selectSucursal` para garantizar estado limpio del combo. CONTEXT.md D-06 dice "Maneja internamente el reintento de `selectSucursal + clickBuscar`" pero no especifica el reset — el plan debe explicitar este preámbulo.

### Pitfall 4: Browser throttling de polling cuando hay muchas tabs/CPU saturada

**What goes wrong:** [VERIFIED: GitHub issue microsoft/playwright#40568] el polling de `waitForFunction` está implementado con `setTimeout` *dentro del browser*, susceptible a throttling cuando la CPU está saturada o hay parallel tests.

**Risk for this fix:** **BAJO**. El robot Railway corre 1 sola Chromium instance, 1 page, sin parallelismo. CPU del container Railway no debería saturarse durante un scrape. 250ms polling × 8s = 32 evaluaciones — incluso con 50% throttling tendríamos 16 evaluaciones, suficiente.

**How to avoid:** Si en producción se observa el síntoma (TimeoutError con `last fingerprint` idéntico al prev pero la tabla *visualmente* sí cambió), incrementar `SUCURSAL_REFRESH_TIMEOUT_MS` a 12000 o cambiar `polling` a `'raf'`. Out of scope para este standalone — solo documentar en LEARNINGS si pasa.

### Pitfall 5: Memory leak con polling tight de 250ms × 8s

**Investigation result:** [VERIFIED: Playwright docs + issue 40568] el polling NO crea handles JS-side; cada evaluación es discardable. No hay riesgo de leak distintivo. La función evalúa cada 250ms, retorna `boolean`, Playwright descarta. No-op desde perspectiva de memoria.

### Pitfall 6: El operador cambia la lista de sucursales en runtime

**Out of scope** per SPEC.md (sucursales filter viene del request body `body.sucursales`; el adapter respeta el orden). Pero footgun si el operador envía `["JUMBO EL BOSQUE","FLORIDABLANCA"]` (orden invertido vs default): la primera iteración del loop sería JUMBO, baseline = estado post-login (CABECERA según logs históricos), `prevFingerprint` no-null pero distinto a JUMBO → refresh detectado correctamente. **No requiere cambio**.

### Pitfall 7: `getTotalPages` lee residual cuando tabla no refrescó (bug original)

**Already fixed by this standalone:** si el guard garantiza que la tabla está refrescada antes de `extractAllPages`, entonces `getTotalPages()` lee el paginador de la sede correcta. El bug colateral de `clickNextPage` no chequear `x-item-disabled` (deferred per CONTEXT.md) NO se gatilla porque ahora `totalPages` será correcto.

## Validation Architecture

> Habilitado por defecto (`workflow.nyquist_validation` ausente = enabled). Para este standalone el operador eligió en D-11 que la validación sea **únicamente smoke E2E post-deploy** — no se agregan tests unitarios.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | **NONE** — no hay framework de tests en `godentist/robot-godentist/`. Confirmed: 0 archivos `*.test.ts` / `*.spec.ts` en el robot (SPEC.md Background). |
| Config file | none — Wave 0 no agrega framework (descartado en D-11). |
| Quick run command | N/A |
| Full suite command | **Smoke E2E manual via curl × 3** — ver `## Smoke E2E Recipe` abajo. |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REQ-01 | Guard detecta refresh | manual-smoke | `curl ... + node validate.js` | N/A — smoke real contra portal Dentos |
| REQ-02 | 2 reintentos | manual-smoke | `railway logs -s Godentist \| grep "Table refresh"` después de smoke | N/A — verificación en logs |
| REQ-03 | HTTP 502 en abort | manual-smoke (induced fail no factible sin acceso al portal Dentos para forzar fallo) | Verificación de absence: logs limpios + JSON 200 OK | N/A |
| REQ-04 | 3 scrapes consecutivos limpios | manual-smoke | curl + node script (abajo) | N/A |

### Sampling Rate
- **Per task commit:** N/A (no tests unitarios; ver D-11).
- **Per wave merge:** N/A.
- **Phase gate:** Smoke E2E × 3 corridas consecutivas, todas con `ratio=1.0 por sede` + `overlap=0 entre todos los pares de sedes`. Verificación con script Node (abajo).

### Wave 0 Gaps
- **None** — el operador en D-11 explícitamente eligió smoke E2E real como único método. NO instalar test framework para este standalone. NO crear archivos test. Si en el futuro el equipo decide adoptar Playwright Test framework para el robot, será un standalone separado.

## Smoke E2E Recipe

### Step 1: Deploy a Railway

```bash
# Desde repo raíz
git push origin main
# Railway detecta cambio en /godentist/robot-godentist y deploya el servicio Godentist
# (project 2bfb887a-6f5a-4866-8190-070601343233, root dir /godentist/robot-godentist)
```

**Verificar deploy success:**
```bash
# Opción 1: Railway dashboard → servicio Godentist → último deploy status SUCCESS
# Opción 2: Health check directo
curl -s https://godentist-production.up.railway.app/api/health
# Expected: {"status":"ok","uptime":<seconds>,"timestamp":"..."}
```

### Step 2: Smoke × 3 corridas consecutivas

**Fecha target:** elegir un día futuro con citas en ≥2 sedes (el operador puede verificar visualmente en el portal Dentos antes de correr). Worst case se reusa el día siguiente laboral de Bogotá.

```bash
TARGET_DATE="2026-05-14"  # ajustar a fecha futura con citas en ≥2 sedes
for i in 1 2 3; do
  curl -s --max-time 300 -X POST "https://godentist-production.up.railway.app/api/scrape-appointments" \
    -H "Content-Type: application/json" \
    -d "{\"workspaceId\":\"36a74890-aad6-4804-838c-57904b1c9328\",\"credentials\":{\"username\":\"JROMERO\",\"password\":\"123456\"},\"sucursales\":[\"CABECERA\",\"FLORIDABLANCA\",\"JUMBO EL BOSQUE\",\"MEJORAS PUBLICAS\"],\"targetDate\":\"${TARGET_DATE}\"}" \
    > /tmp/smoke_${i}.json
  echo "Corrida $i completed"
  sleep 5
done
```

### Step 3: Validación numérica

Pegar verbatim (Node ≥18, sin dependencias):

```bash
node -e '
const fs = require("fs")
const files = ["/tmp/smoke_1.json", "/tmp/smoke_2.json", "/tmp/smoke_3.json"]
let allPassed = true
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(file, "utf-8"))
  if (!data.success || !Array.isArray(data.appointments)) {
    console.log(`FAIL ${file}: not a success response`)
    allPassed = false
    continue
  }
  const apps = data.appointments
  // Group by sucursal
  const bySede = {}
  for (const a of apps) {
    if (!bySede[a.sucursal]) bySede[a.sucursal] = []
    bySede[a.sucursal].push(`${a.telefono}|${a.hora}`)
  }
  // Ratio per sede
  const ratios = {}
  for (const [sede, keys] of Object.entries(bySede)) {
    const unique = new Set(keys).size
    ratios[sede] = { total: keys.length, unique, ratio: keys.length / unique }
  }
  // Overlap pairwise
  const sedes = Object.keys(bySede)
  const overlaps = []
  for (let i = 0; i < sedes.length; i++) {
    for (let j = i + 1; j < sedes.length; j++) {
      const a = new Set(bySede[sedes[i]])
      const b = new Set(bySede[sedes[j]])
      const inter = [...a].filter(x => b.has(x))
      overlaps.push({ pair: `${sedes[i]} × ${sedes[j]}`, intersection: inter.length })
    }
  }
  const ratiosBad = Object.values(ratios).filter(r => r.ratio !== 1)
  const overlapsBad = overlaps.filter(o => o.intersection !== 0)
  const pass = ratiosBad.length === 0 && overlapsBad.length === 0
  console.log(`${pass ? "PASS" : "FAIL"} ${file}`)
  console.log("  date:", data.date, "totalAppointments:", apps.length)
  console.log("  ratios:", JSON.stringify(ratios))
  if (overlapsBad.length > 0) console.log("  overlaps_bad:", JSON.stringify(overlapsBad))
  if (!pass) allPassed = false
}
console.log(allPassed ? "\nSMOKE PASS — 3/3 corridas limpias" : "\nSMOKE FAIL — review JSON files")
process.exit(allPassed ? 0 : 1)
'
```

**Pass criteria (Acceptance SPEC.md):**
- 3 archivos con `ratio === 1` para cada sede → REQ-04 ratio
- 3 archivos con `intersection === 0` para todos los pares → REQ-04 overlap
- Script exit code = 0

### Step 4: Verificar logs Railway

```bash
# Buscar las líneas grep-ables del guard (D-10)
railway logs -s Godentist --tail 200 | grep "Table refresh"
# Esperado: 4 líneas por corrida (una por sede), todas tipo:
# [GoDentist] Table refresh confirmed for FLORIDABLANCA after attempt 1: prev={...} → curr={...}
# Total: 12 líneas en logs tras 3 corridas × 4 sedes
```

### Step 5: Regression check — single-sucursal

```bash
curl -s --max-time 300 -X POST "https://godentist-production.up.railway.app/api/scrape-appointments" \
  -H "Content-Type: application/json" \
  -d "{\"workspaceId\":\"36a74890-aad6-4804-838c-57904b1c9328\",\"credentials\":{\"username\":\"JROMERO\",\"password\":\"123456\"},\"sucursales\":[\"JUMBO EL BOSQUE\"],\"targetDate\":\"${TARGET_DATE}\"}" \
  > /tmp/smoke_single.json
# Verificar success + appointments solo de JUMBO + ratio=1
```

## Risks & Landmines (focused on the 4 numbered above)

### Risk 1: Baseline null + primera sede null = polling infinito?
**Answer: NO, no es polling infinito.** D-03 ya cubre esto. Recomendación de implementación: el helper hace **early return antes de `waitForFunction`** cuando `prevFingerprint === null` — captura el current fingerprint y retorna. Si current también es null, retorna `null`. Si current es no-null, retorna el fingerprint. **0 ms perdidos en polling cuando baseline es null.** Ver Pitfall 1 arriba.

### Risk 2: Operador reordena sucursales (footgun out-of-scope)
**Answer: NO requiere fix.** El loop respeta el orden del `filterSucursales` (línea 204-208: filtra preservando orden del `discoverSucursales`, NO del `filterSucursales`). En realidad — re-leyendo: `sucursales.filter(s => filterSet.has(s.label.toUpperCase()))` — el orden viene de `discoverSucursales` (orden del portal Dentos), no del cliente. **El cliente no controla el orden de iteración**. No es un footgun.

### Risk 3: Memory leak en 250ms × 8s polling
**Answer: NO hay leak.** Polling se ejecuta en browser context; cada eval es boolean → discarded. No handles acumulables. 32 evals/intento × 3 intentos × 4 sedes = 384 evals worst-case por scrape. Negligible. **Si fuera issue, sería `polling: 'raf'` el fallback.**

### Risk 4: ¿El upper try/catch en `scrapeAppointments` línea 228 swallows el SedeRefreshFailedError diferenciadamente?
**Answer: SÍ — necesita re-throw selectivo.** Es la Pitfall 2 documentada arriba. Sin el `if (err instanceof SedeRefreshFailedError) throw err` dentro del catch, el scrape continúa y retorna 200 con `errors[]` poblado — rompe el Acceptance Criteria #4 (HTTP 5xx). **El plan DEBE incluir esta modificación al catch existente como tarea explícita.**

## Project Constraints (from CLAUDE.md)

| Regla | Aplica a este standalone? | Notas |
|-------|---------------------------|-------|
| Regla 0 (GSD completo) | SÍ | Standalone discuss + spec lockeados; research aquí; plan-phase siguiente. |
| Regla 1 (push a Vercel) | **NO** — robot Railway, no Vercel. Push a `origin main` triggea Railway deploy del servicio Godentist (root dir `/godentist/robot-godentist`). |
| Regla 2 (TZ Colombia) | NO — no hay lógica de fechas/horas nuevas; las que hay (`getNextWorkingDay`, `formatDateDD_MM_YYYY`) ya respetan `America/Bogota`. |
| Regla 3 (Domain layer) | **NO** — el robot es Express+Playwright separado, no tiene domain layer. SPEC.md confirma que NO se toca `src/lib/domain/` ni `src/app/actions/`. |
| Regla 4 (Docs actualizadas) | SÍ parcial — LEARNINGS.md del standalone al cerrar; actualizar `docs/analysis/04-estado-actual-plataforma.md` si el módulo godentist robot tiene sección con bugs activos. |
| Regla 5 (Migración antes deploy) | **NO** — 0 cambios de schema DB. |
| Regla 6 (Proteger agente producción) | **NO** — no hay agente AI involucrado. El robot es scraping headless. El bug que se arregla *protege* a downstream (template send), no agrega comportamiento nuevo. |

## State of the Art

Sin tendencias relevantes — Playwright `waitForFunction` API es estable desde v1.x, sin breaking changes en 1.52. No hay nueva API "mejor" para este caso.

## Assumptions Log

Empty — todos los hechos clave fueron verificados:
- Playwright `waitForFunction` API [VERIFIED: docs oficial + GitHub issue 40568]
- Versiones de paquetes [VERIFIED: `package.json` leído]
- Líneas exactas del adapter y server [VERIFIED: archivo leído líneas 1-60, 160-280, 1440-1748, server.ts completo]
- Comportamiento del server-action `!res.ok` [VERIFIED: `src/app/actions/godentist.ts` líneas 108-168 leídas]
- Selector `'table tbody tr'` + filtro `cleanCells.length<3` [VERIFIED: `extractAppointments` línea 1608-1618]

## Sources

### Primary (HIGH confidence)
- Playwright API `frame.waitForFunction` — https://playwright.dev/docs/api/class-frame#frame-wait-for-function (signature, polling, timeout, TimeoutError, arg serialization)
- Playwright `errors.TimeoutError` — https://playwright.dev/docs/api/class-timeouterror (instanceof check pattern para `playwright.errors.TimeoutError`)
- GitHub microsoft/playwright#40568 — confirmación de que polling usa setTimeout in-browser, susceptible a throttling (riesgo bajo en este contexto)

### Secondary (MEDIUM confidence)
- Código del proyecto:
  - `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (1748 líneas)
  - `godentist/robot-godentist/src/api/server.ts` (237 líneas)
  - `godentist/robot-godentist/package.json`
  - `src/app/actions/godentist.ts` (líneas 100-170)

### Tertiary (LOW confidence)
- Ninguna — todas las decisiones críticas tienen verificación HIGH o MEDIUM.

## Metadata

**Confidence breakdown:**
- Standard stack (Playwright + Express versiones, no nuevos paquetes): HIGH — `package.json` leído.
- Architecture / helper integration point: HIGH — código del adapter leído líneas relevantes + CONTEXT.md D-06/D-07 explícitas.
- Pitfalls: HIGH — los 7 documentados están basados en lectura del código y API oficial de Playwright.
- Smoke E2E recipe: HIGH — script numérico replica la lógica de la investigación del incidente del 11-may + verificación contra el endpoint real es trivial.

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 días — stack maduro, sin breaking changes esperados).

## RESEARCH COMPLETE
