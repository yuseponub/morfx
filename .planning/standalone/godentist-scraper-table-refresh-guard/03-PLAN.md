---
phase: godentist-scraper-table-refresh-guard
plan: 03
type: execute
wave: 3
depends_on:
  - "01"
  - "02"
files_modified:
  - godentist/robot-godentist/src/adapters/godentist-adapter.ts
autonomous: true
requirements:
  - REQ-01
  - REQ-02
  - REQ-03

must_haves:
  truths:
    - "scrapeAppointments captura prevFingerprint baseline tras setHour/takeScreenshot (D-07)"
    - "El for loop sobre sucursales invoca waitForSucursalRefresh entre clickBuscar y extractAllPages, reasignando prevFingerprint con el return"
    - "El waitForTimeout(3000) ciego en el for loop fue REMOVIDO (reemplazado por waitForSucursalRefresh)"
    - "El catch block del loop hace re-throw selectivo: SedeRefreshFailedError se propaga, otros errores se acumulan en errors[] como hoy (Pitfall 2)"
    - "tsc --noEmit pasa"
  artifacts:
    - path: "godentist/robot-godentist/src/adapters/godentist-adapter.ts"
      provides: "Loop scrapeAppointments wired con guard table-refresh + abort total en SedeRefreshFailedError"
      contains:
        - "let prevFingerprint = await this.captureFingerprint()"
        - "prevFingerprint = await this.waitForSucursalRefresh"
        - "if (err instanceof SedeRefreshFailedError) throw err"
  key_links:
    - from: "scrapeAppointments loop (post-Plan 03)"
      to: "waitForSucursalRefresh (Plan 02)"
      via: "method call"
      pattern: "await this.waitForSucursalRefresh"
    - from: "scrapeAppointments catch block"
      to: "Express handler (Plan 04)"
      via: "throw propagation (no try/catch interno swallows SedeRefreshFailedError)"
      pattern: "if (err instanceof SedeRefreshFailedError) throw err"
---

<objective>
Wire los helpers de Plan 02 en el loop `scrapeAppointments`:

1. **Tras `takeScreenshot('after-set-hour')`:** capturar baseline `let prevFingerprint = await this.captureFingerprint()` (D-07).
2. **Dentro del `for (const sucursal of sucursales)` loop:**
   - REEMPLAZAR `await this.page.waitForTimeout(3000)` por `prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal)`. El return alimenta el `prevFingerprint` de la siguiente iteracion.
   - MODIFICAR el `catch (err)` block: anadir como PRIMERA linea `if (err instanceof SedeRefreshFailedError) throw err` (Pitfall 2 — CRITICO; sin esto el abort no funciona y el JSON 200 con datos parciales rompe Acceptance #4).
3. **Importar `SedeRefreshFailedError`:** ya esta disponible en el mismo archivo (Plan 01 lo anadio como `export class`). No requiere import adicional dentro del adapter (mismo modulo).

Purpose: Hacer que el guard de Plan 02 efectivamente proteja el scrape. Sin este wiring, los helpers estan dormidos y el bug del 11-may sigue siendo reproducible.

Output: 3 modificaciones puntuales al metodo `scrapeAppointments` del adapter. Sin tocar nada mas. Cambio minimo invasivo.
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
@.planning/standalone/godentist-scraper-table-refresh-guard/02-SUMMARY.md

<interfaces>
<!-- Estado actual del loop (lineas 195-234 antes de Plan 01/02). El ejecutor debe encontrar las lineas equivalentes en estado post-Plan-01/02 (con offset por las lineas anadidas en Plan 01/02): -->

Anchor 1: linea con `await this.takeScreenshot('after-set-hour')` — insertar `let prevFingerprint = ...` INMEDIATAMENTE DESPUES.

Anchor 2: linea con `await this.page.waitForTimeout(3000)` DENTRO del `for (const sucursal of sucursales)` — REEMPLAZAR.

Anchor 3: linea `} catch (err) {` que cierra el body del for loop — anadir re-throw selectivo COMO PRIMERA linea dentro del catch.

**Importante: hay multiples `waitForTimeout(3000)` en el archivo (otras operaciones de login, navegacion, etc.). SOLO modificar el que esta dentro del `for (const sucursal of sucursales)` body. Los anchors arriba/abajo son `await this.clickBuscar()` y `await this.takeScreenshot(\`citas-${sucursal.label...`. Confirmar visualmente antes de modificar.**
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Wire baseline + waitForSucursalRefresh + re-throw selectivo en catch</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts (estado tras Plan 01+02 — confirmar `captureFingerprint`, `waitForSucursalRefresh`, `SedeRefreshFailedError` presentes; encontrar el bloque `for (const sucursal of sucursales)` por contenido)
    - .planning/standalone/godentist-scraper-table-refresh-guard/PATTERNS.md (Analog 4 — insertion site exacto con anotaciones D-06/D-07/D-08)
    - .planning/standalone/godentist-scraper-table-refresh-guard/RESEARCH.md (Pitfall 2 — re-throw selectivo CRITICO; Risk 4 — confirmacion de que sin re-throw el scrape continua con 200 parcial)
    - .planning/standalone/godentist-scraper-table-refresh-guard/CONTEXT.md (D-06, D-07, D-08)
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
Aplicar 3 ediciones al metodo `scrapeAppointments` del adapter. Localizar por contenido (no por numero de linea, ya que Plan 01/02 introdujeron offset).

**Edicion 1: Capturar baseline post-setHour (D-07)**

Localizar la linea EXACTA:

    await this.takeScreenshot('after-set-hour')

Insertar INMEDIATAMENTE DESPUES (con una linea en blanco antes) las dos lineas:

    // Baseline fingerprint for table-refresh guard (CONTEXT.md D-07)
    let prevFingerprint = await this.captureFingerprint()

**Edicion 2: Reemplazar waitForTimeout(3000) por waitForSucursalRefresh (D-06)**

Localizar dentro del `for (const sucursal of sucursales)` la SECUENCIA:

        await this.selectSucursal(sucursal)
        await this.clickBuscar()
        await this.page.waitForTimeout(3000)
        await this.takeScreenshot(...)

REEMPLAZAR la linea `await this.page.waitForTimeout(3000)` por:

        prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal)

NOTA: hay otros `waitForTimeout(3000)` en el archivo (login, navegacion). SOLO el que esta dentro del for loop. Anchors:
- ARRIBA: `await this.clickBuscar()`.
- ABAJO: `await this.takeScreenshot(\`citas-${sucursal.label...`.

**Edicion 3: Re-throw selectivo en el catch (D-08, Pitfall 2 — CRITICO)**

Localizar el `} catch (err) {` que cierra el try del for-body. El cuerpo actual tiene como primera linea `const msg = ...`. INSERTAR ANTES un bloque de comentario + el if-throw:

      } catch (err) {
        // Per CONTEXT.md D-08: SedeRefreshFailedError aborts the entire scrape — must propagate
        // up to scrapeAppointments caller (Express handler in server.ts maps to HTTP 502).
        // Without this re-throw, the catch swallows the abort signal and scrape returns 200
        // with partial data, breaking SPEC Acceptance #4 (Pitfall 2 in RESEARCH.md).
        if (err instanceof SedeRefreshFailedError) throw err

        const msg = `Error en ${sucursal.label}: ${err instanceof Error ? err.message : String(err)}`
        console.error(`[GoDentist] ${msg}`)
        errors.push(msg)
      }

Style:
- Indent 6 espacios para el if (mismo nivel que `const msg`).
- Sin punto y coma final (style del archivo).
- EM DASH `—` (U+2014) en el comentario "scrape — must propagate" — verbatim. Si dudoso, copiar del cuerpo de este action verbatim.

**NO modificar nada mas del metodo** (la firma, la logica de `discoverSucursales`, los returns, el manejo de `sucursales.length === 0`, etc. — todo intacto).
  </action>

  <verify>
    <automated>cd godentist/robot-godentist; npx tsc --noEmit; grep -c "let prevFingerprint = await this.captureFingerprint()" src/adapters/godentist-adapter.ts; grep -c "prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal)" src/adapters/godentist-adapter.ts; grep -c "if (err instanceof SedeRefreshFailedError) throw err" src/adapters/godentist-adapter.ts</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0 (no errores TypeScript).
    - `grep -c "let prevFingerprint = await this.captureFingerprint()" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 1.
    - `grep -c "prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal)" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 1.
    - `grep -c "if (err instanceof SedeRefreshFailedError) throw err" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 1.
    - El `waitForTimeout(3000)` del for loop fue removido (no eliminar otros `waitForTimeout(3000)` del archivo): verificable via `grep -nB1 "waitForTimeout(3000)" godentist/robot-godentist/src/adapters/godentist-adapter.ts` — ninguna de las restantes (si hay) debe tener `await this.clickBuscar()` en la linea inmediata arriba.
    - El catch block conserva la logica original: `grep -A6 "if (err instanceof SedeRefreshFailedError) throw err" godentist/robot-godentist/src/adapters/godentist-adapter.ts` muestra siguiente las lineas `const msg = ...`, `console.error(...)`, `errors.push(msg)`.
    - Posicion del catch correcta: el `if (err instanceof SedeRefreshFailedError) throw err` debe aparecer ANTES del `const msg =` en el mismo catch block.
    - Si `tsc` reporta `Variable 'prevFingerprint' is assigned but never read` u otros warnings — investigar; el `let` debe estar usado en la asignacion dentro del for loop. Si el sucursales.length === 0 early-return existe (linea ~213), el `let prevFingerprint` antes podria considerarse unused en ese path — solucion aceptable: dejar el `let` (TypeScript no es estricto con esto por defecto) o reasignar dentro del check vacio (no recomendado, ensucia).
  </acceptance_criteria>

  <done>
    Loop scrapeAppointments wired con guard table-refresh. `tsc --noEmit` pasa. El waitForTimeout(3000) ciego del loop fue reemplazado. El catch re-throws SedeRefreshFailedError verbatim. Cambio aislado al metodo scrapeAppointments — resto del adapter intacto.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| scrapeAppointments orchestrator ↔ waitForSucursalRefresh helper | Helper throws SedeRefreshFailedError; orchestrator catch re-throws; propaga a Express handler (Plan 04). |
| Loop catch block | Discrimina entre SedeRefreshFailedError (abort) y otros errores (acumular en errors[]). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-grd-03-01 | Tampering | catch block silenciando abort | mitigate | El `if (err instanceof SedeRefreshFailedError) throw err` como PRIMERA linea del catch garantiza propagacion. Verificable por grep + acceptance criteria. Sin esta linea, el sintoma seria: scrape multi-sucursal con sede fallida retorna 200 con `errors: ["Error en X: Sede X: tabla no se refresco..."]` en lugar de HTTP 502 — exactamente la pitfall #2 documentada. |
| T-grd-03-02 | Denial of service | Cambio del 3s timeout fijo por hasta 24s (3 × 8s) por sede | accept | Worst case: 4 sedes × 24s = 96s overhead. Vercel timeout 5min, suficiente buffer. Caso comun: 1-2 attempts × 3-4s = poco overhead. Logs Railway dejan trace para forensics si overhead crece anormalmente. |
| T-grd-03-03 | Information disclosure | `prevFingerprint` capturado en baseline post-login puede contener phone+hora de un cliente real (estado inicial CABECERA) | accept | Misma exposicion que `extractAppointments` ya existente (logs el primer row raw cells). El baseline solo se usa como input al `waitForFunction` callback (browser-context-internal); no se loguea explicitamente salvo en el log success del Plan 02 que ya estaba aprobado. Sin nueva superficie. |
| T-grd-03-04 | Repudiation | El abort signal puede confundirse con otros errores en post-mortem | mitigate | El log `Table refresh FAILED for X after 3 attempts` es distintivo + el HTTP 502 con body `code: 'sede_refresh_failed'` lo discrimina downstream. Operador puede correlacionar: error 502 en server-action <=> log "FAILED" en Railway con timestamp matching. |
</threat_model>

<verification>
- TypeScript compila: `cd godentist/robot-godentist && npx tsc --noEmit`.
- 3 patrones especificos presentes en el archivo (greps arriba).
- Solo 1 ocurrencia de cada patron (no duplicado por error).
- El metodo `scrapeAppointments` mantiene su signature y comportamiento exterior — solo cambia el comportamiento interno del loop.
</verification>

<success_criteria>
- [ ] 3 ediciones aplicadas al metodo `scrapeAppointments`.
- [ ] El `waitForTimeout(3000)` del loop fue reemplazado por `waitForSucursalRefresh`.
- [ ] El `catch (err)` tiene re-throw selectivo COMO PRIMERA LINEA (no al final).
- [ ] `tsc --noEmit` pasa.
- [ ] Commit atomico en espanol + Co-Authored-By Claude.
</success_criteria>

<output>
Tras completar este plan crear `.planning/standalone/godentist-scraper-table-refresh-guard/03-SUMMARY.md` con: 3 ediciones aplicadas, anchors usados para localizar cada sitio, greps de validacion ejecutados, y nota "el adapter ahora aborta en sede fallida pero el HTTP 502 mapping aun no esta — Plan 04 (Express handler) lo cierra".
</output>
