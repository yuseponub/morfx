# GoDentist Scraper Table-Refresh Guard — Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Spec lock:** `.planning/standalone/godentist-scraper-table-refresh-guard/SPEC.md` (4 requirements locked, ambiguity 0.16)

<domain>
## Phase Boundary

Modificar `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (+ propagación HTTP en `src/api/server.ts`) para que cada batch por sede en el JSON de respuesta contenga exclusivamente filas de esa sede, sin contaminación cruzada ni duplicación interna. Implementa table-refresh guard con fingerprint+polling, 2 reintentos de `selectSucursal`, y abort total HTTP 5xx si una sede agota los 3 intentos. Cero cambios a server-actions, Inngest, UI o domain layer.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**4 requirements locked.** Ver `SPEC.md` para detalle:
1. Table-refresh guard antes de extracción (fingerprint + polling)
2. Reintento de `selectSucursal` hasta 2 veces ante fallo de refresh
3. Abort total del scrape (HTTP 5xx) si una sede agota los 3 intentos
4. Smoke E2E sin contaminación: 3 scrapes consecutivos, ratio=1.0 por sede + overlap=0 entre sedes

**In scope (de SPEC.md):**
- Cambios a `godentist/robot-godentist/src/adapters/godentist-adapter.ts`
- Cambios al endpoint Express `POST /api/scrape-appointments` en `src/api/server.ts` para propagar error como HTTP 5xx
- Logs grep-ables del guard
- Smoke E2E manual (3 scrapes consecutivos)
- Deploy a Railway

**Out of scope (de SPEC.md):**
- `src/app/actions/godentist.ts` (server-action dedupe descartado)
- `src/inngest/functions/godentist-reminders.ts`
- Cleanup retrospectivo de reminders
- Unit tests del adapter
- Fix secundario de `clickNextPage` no chequear `x-item-disabled`
- Cambios al portal Dentos

</spec_lock>

<decisions>
## Implementation Decisions

### Fingerprint de tabla (D-01..D-03)

- **D-01:** **Fingerprint = `(telefono_primer_row, hora_primer_row, row_count)`** extraído de las celdas de la primera fila no-vacía de la tabla del portal (`table tbody tr` filtrado por `cleanCells.length >= 3`), más el conteo total de filas no-vacías.
  - **Why:** El bug del 11-may produjo `row_count=54` idéntico en "page 1/2" y "page 2/2" de JUMBO + mismo primer row porque la tabla literalmente nunca cambió. Capturar solo row_count no detecta el caso "FLO page 2 vs JUMBO page 1" si tuvieran el mismo count. Capturar `(phone, hora)` del primer row sí lo detecta — son distintos entre sedes salvo el caso patológico de los 12 cross-sede (pero ahí la tabla SÍ cambió de FLO page 1 a FLO page 2, así que el primer row también cambió).
  - **How to apply:** Helper privado `captureFingerprint(): Promise<{phone, hora, rowCount} | null>` invocado vía `page.evaluate()`. Retorna `null` si tabla vacía (0 rows con datos).

- **D-02:** **Equality check**: dos fingerprints son "iguales" si los tres campos (`phone`, `hora`, `rowCount`) coinciden exactamente. Cualquier diferencia ⇒ tabla refrescada.
  - **Why:** Simple, determinístico, falsifiable. Tres campos cubren el espacio de cambios posibles (sede distinta, paginación, filas distintas).
  - **How to apply:** función pura `fingerprintsEqual(a, b): boolean` usable también desde tests si se agregaran después.

- **D-03:** **Edge case tabla vacía**: si `prevFingerprint === null` (sede anterior vacía o estado inicial sin datos) Y `currFingerprint === null` (sede target también vacía), se considera refresh exitoso. Si `prevFingerprint !== null` y `currFingerprint === null` también es refresh exitoso (la tabla cambió de "tenía filas" a "no tiene filas"). Solo retry si ambos no-nulos Y `fingerprintsEqual(prev, curr) === true`.
  - **Why:** Sedes vacías son comportamiento legítimo del portal (algunas sedes sin citas en el día). No deben gatillar retry infinito.
  - **How to apply:** lógica explícita en `waitForSucursalRefresh` antes del polling loop.

### Polling mechanism (D-04..D-05)

- **D-04:** **`page.waitForFunction()` de Playwright** con polling interno cada 250ms. La función inyectada compara el fingerprint capturado del DOM actual contra el `prevFingerprint` pasado como argumento serializado.
  - **Why:** Native de Playwright, maneja browser context correctamente, integra con el AbortController/timeout del adapter, evita reinventar el wheel. Alternativa custom `setTimeout` loop tiene riesgo de leaks si el page cierra mid-poll.
  - **How to apply:** `await this.page.waitForFunction((prev) => { /* inline capture + compare */ return !equal(prev, curr); }, prevFingerprint, { timeout: 8000, polling: 250 })`.

- **D-05:** **Timeout por intento: 8 segundos**, polling cada 250ms (≤32 evaluaciones por intento).
  - **Why:** Logs Railway del scrape limpio muestran que el portal tarda 2-4s entre `clickBuscar`/Enter y la tabla refrescada (CABECERA: 3.1s, FLORIDABLANCA: 2.6s, JUMBO: 3.1s, MEJORAS: 3.5s). 8s da ~2× margen sobre el peor caso medido + buffer para variabilidad de red Railway↔Dentos. 5s sería ajustado; 10s+ desperdicia tiempo en worst-case (sede × intentos = 4 × 3 × 10s = 120s overhead). 8s × 4 sedes × 3 intentos max = 96s overhead worst-case — dentro del límite Vercel 5min.
  - **How to apply:** constante `SUCURSAL_REFRESH_TIMEOUT_MS = 8000` al inicio del archivo del adapter.

### Reintentos + ubicación del guard (D-06..D-07)

- **D-06:** **Helper nuevo `waitForSucursalRefresh(prevFingerprint, sucursalLabel)`** invocado entre `clickBuscar` y `extractAllPages` en el loop `for (const sucursal of sucursales)` (línea 217 del adapter). Maneja internamente el reintento de `selectSucursal + clickBuscar` hasta 2 veces. Si tras los 3 intentos (1 inicial + 2 retries) el fingerprint sigue igual, throws `Error('Sede X: tabla no se refrescó tras 3 intentos')`.
  - **Why:** Encapsulación. `extractAllPages` queda intacto (no se ensucia con lógica de control de timing). `selectSucursal` queda intacto (sigue siendo una operación atómica). El helper es testable aisladamente. Patrón consistente con `getTotalPages`, `clickNextPage` (helpers privados pequeños del adapter).
  - **How to apply:** firma `private async waitForSucursalRefresh(prevFingerprint: Fingerprint | null, sucursalLabel: string): Promise<Fingerprint>`. Retorna el fingerprint post-refresh para que el caller lo use como `prevFingerprint` en la siguiente sede.

- **D-07:** **Captura del fingerprint inicial** (antes del primer `selectSucursal` del loop) se hace en `scrapeAppointments` después de `setHour('6:00 am')` y `takeScreenshot('after-set-hour')` (línea 197 actual). Ese fingerprint es el `prevFingerprint` para la primera sede.
  - **Why:** Da baseline real al estado post-login que ya está en pantalla. Después del login el portal muestra una sede default (CABECERA según logs); ese estado tiene fingerprint capturable.
  - **How to apply:** `let prevFingerprint = await this.captureFingerprint()` antes del loop. Dentro del loop: `prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal.label)`.

### Error propagation (D-08..D-09)

- **D-08:** **El throw del helper se propaga hasta `scrapeAppointments` (línea 166)** sin try/catch interno. La función `scrapeAppointments` lo deja propagar a `POST /api/scrape-appointments` (Express handler en `src/api/server.ts:27`), que ya tiene try/catch genérico — el handler retorna **HTTP 502** con body `{ status: 'error', code: 'sede_refresh_failed', sucursal: 'X', attempts: 3, message: '...' }`.
  - **Why:** 502 es semánticamente correcto — el portal Dentos (upstream del robot) no respondió como se esperaba. Diferencia del 500 (error interno del robot) y del 200 con error (que server-action `scrapeAppointments` actualmente acepta como contenido válido). Código discriminante `sede_refresh_failed` permite distinguir de otros 502 si se agregan más en el futuro.
  - **How to apply:** modificar el handler Express para mapear errores con tipo `SedeRefreshFailedError` (clase nueva) a `res.status(502).json(...)`. Errores genéricos siguen como 500.

- **D-09:** **El server-action `scrapeAppointments` en `src/app/actions/godentist.ts:108` NO necesita cambios** — su check `if (!res.ok)` (línea 129) ya captura 502 y retorna `{ error: 'Robot error (502): ...' }` al cliente sin ejecutar el insert en `godentist_scrape_history` (línea 148+ solo corre si `res.ok`).
  - **Why:** Verificado contra el código actual. El flow downstream (insert history → scheduleReminders) ya está naturalmente gated por el éxito del fetch. No tocar `actions/godentist.ts` mantiene el scope mínimo prometido en SPEC.md ("Solo capa robot").
  - **How to apply:** documentación únicamente. Plan no genera tareas para `src/app/actions/`.

### Logging (D-10)

- **D-10:** **Una línea grep-able por sede en éxito + una línea grep-able por intento en fallo.**
  - Éxito: `[GoDentist] Table refresh confirmed for ${sucursal} after attempt ${n}: prev={phone,hora,rowCount} → curr={phone,hora,rowCount}` (n = 1, 2, o 3).
  - Fallo intermedio (retry coming): `[GoDentist] Table refresh failed for ${sucursal} attempt ${n}/3 — retrying selectSucursal`.
  - Fallo final: `[GoDentist] Table refresh FAILED for ${sucursal} after 3 attempts — aborting scrape. Fingerprint stuck at {phone,hora,rowCount}`.
  - **Why:** Grep-able por palabra clave (`Table refresh`) + por sede. Logs Railway ya tienen este formato (`[GoDentist] ...`). Permite forensics igual que el incidente del 11-may (que se reconstruyó con logs de timing precisos).
  - **How to apply:** dentro de `waitForSucursalRefresh` directo con `console.log` (el adapter ya usa console.log en todo el archivo, no logger estructurado).

### Tests / validación (D-11)

- **D-11:** **Smoke E2E manual post-deploy** — 3 corridas consecutivas multi-sucursal contra portal Dentos real para una fecha futura con citas en ≥2 sedes distintas. El operador (o Claude vía `curl` al endpoint) ejecuta:
  ```bash
  for i in 1 2 3; do
    curl -s --max-time 300 -X POST "https://godentist-production.up.railway.app/api/scrape-appointments" \
      -H "Content-Type: application/json" \
      -d '{"workspaceId":"36a74890-aad6-4804-838c-57904b1c9328","credentials":{"username":"JROMERO","password":"123456"},"sucursales":["CABECERA","FLORIDABLANCA","JUMBO EL BOSQUE","MEJORAS PUBLICAS"],"targetDate":"YYYY-MM-DD"}' > /tmp/smoke_${i}.json
  done
  ```
  Validación numérica con node script (similar al usado en investigación) que verifica `ratio=1.0` por sede + `overlap=0` entre todos los pares de sedes para los 3 archivos. Pass = los 3 cumplen ambos criterios.
  - **Why:** SPEC.md descartó unit tests + mocks Playwright. Smoke E2E es el único método de validación acordado. Tres corridas dan evidencia estadística mínima (el bug del 11-may fue 1-de-6, así que 3-de-3 limpios da confianza razonable; corridas adicionales si hay sospecha).
  - **How to apply:** Plan final incluye una tarea explícita "smoke E2E post-deploy" con el script y los criterios de pass/fail.

### Claude's Discretion

- Naming exacto del helper (`waitForSucursalRefresh` vs `assertSucursalRefreshed` vs otro) — Claude elige al implementar.
- Estructura interna del polling loop dentro de `page.waitForFunction` (formato del `prevFingerprint` serializado, manejo de `null` dentro de la función inyectada) — detalle técnico de Playwright.
- Clase de error custom (`class SedeRefreshFailedError extends Error`) vs throw genérico con código en `.code` — Claude elige el patrón más limpio.
- Si se agregan defensive `// eslint-disable` u otras anotaciones requeridas por el codebase del robot.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SPEC.md (LOCKED)
- `.planning/standalone/godentist-scraper-table-refresh-guard/SPEC.md` — 4 requirements lockeados. Boundaries In/Out de scope. Acceptance criteria pass/fail.

### Archivos a modificar
- `godentist/robot-godentist/src/adapters/godentist-adapter.ts` §line 166 (`scrapeAppointments`), §line 217 (loop de sucursales), §line 1448 (`selectSucursal`), §line 1470 (`clickBuscar`), §line 1509 (`extractAllPages`), §line 1600 (`extractAppointments` — referencia, no se modifica).
- `godentist/robot-godentist/src/api/server.ts` §line 27 (handler `POST /api/scrape-appointments`).

### Archivos para referencia (NO modificar)
- `src/app/actions/godentist.ts` §line 108 (`scrapeAppointments` server-action) §line 129 (manejo de `!res.ok`) — confirmar que 502 propaga correctamente sin cambios.
- `src/inngest/functions/godentist-reminders.ts` — sin cambios; documentado para confirmar que no se toca.

### Investigación previa (forensics)
- Memory `.claude` (auto-memory): `godentist-jumbo-floridablanca-dup-scraping.md` — root cause confirmado, evidencia railway logs, 5 pacientes afectados.
- Logs Railway del deployment `51521b7c-a026-45f3-aa1e-90d3361aeb5e` (REMOVED 2026-05-11T16:54 UTC) — reconstrucción cronológica del incidente.
- Conversación de investigación (session 2026-05-11/12) — verificación visual del operador de 12/12 pacientes solo en FLO; cross-reference numérica `0 JUMBO únicos sin match en FLO`.

### Convenciones del proyecto
- `CLAUDE.md` REGLA 0 — GSD completo obligatorio.
- `CLAUDE.md` REGLA 1 — push a Vercel tras cambios (no aplica para robot Railway, pero sí para cualquier seguimiento en `src/`).
- `CLAUDE.md` REGLA 2 — zona horaria Colombia. No relevante para este cambio.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `page.waitForFunction()` de Playwright — ya usado indirectamente vía `page.waitForSelector` en el adapter. API nativa para polling con timeout.
- `console.log('[GoDentist] ...')` — patrón de logging consistente en todo el adapter. Mantener.
- `page.evaluate(() => {...})` — patrón ya usado en `getTotalPages` (línea 1547), `clickNextPage` (línea 1581), etc. Conoce el contexto del DOM ExtJS.

### Established Patterns
- Helpers privados con prefix `async`: `selectSucursal`, `clickBuscar`, `extractAllPages`, `getTotalPages`, `clickNextPage`. Nuevo helper sigue mismo formato.
- Manejo de errores hasta ahora: `try/catch` en `scrapeAppointments` (línea 228) acumula errors en `errors[]` y retorna parcial. **Este standalone rompe ese patrón** (D-08: abort total en sede fallida).
- Timeouts de Playwright: `waitForSelector('table', { timeout: 10000 })` (línea 1605). Convención de timeout 10s para waits genéricos. El SUCURSAL_REFRESH_TIMEOUT_MS=8000 es consistente.

### Integration Points
- El endpoint `POST /api/scrape-appointments` en `src/api/server.ts:27` es la única interfaz pública afectada. Cambio de comportamiento: ahora puede retornar 502 (antes solo 200/500).
- `src/app/actions/godentist.ts:129` (`if (!res.ok)`) es el primer consumidor downstream del cambio en HTTP status. Confirmado en D-09 que no requiere cambios.

</code_context>

<specifics>
## Specific Ideas

- **Patrón del incidente para forensics futuro**: los logs grep-ables permiten reconstruir incidentes con `railway logs -s Godentist <deployment-id> --since X --until Y | grep "Table refresh"`. Si el guard mismo falla por alguna razón no anticipada, la línea "FAILED for X after 3 attempts" + el último fingerprint stuck dan info de diagnóstico inmediata.

- **Comparación con investigación del 11-may**: en el scrape problemático, la línea `Table rows: 54` aparecía idéntica en page 1/2 y page 2/2 de JUMBO. Con el guard, esa secuencia sería: `Table refresh confirmed for FLORIDABLANCA after attempt 1: prev={573219266256,4:00 PM,54} → curr={573002789526,4:30 PM,58}` → cambio de sede a JUMBO → captura nuevo fingerprint → `Table refresh failed for JUMBO EL BOSQUE attempt 1/3 — retrying selectSucursal` (porque el primer row, hora y rowCount serían idénticos a FLO page 2 que ya extraímos). Tras 3 intentos sin éxito ⇒ abort.

- **Robot Railway**: project `2bfb887a-6f5a-4866-8190-070601343233`, service `Godentist`, env `production`. Deploy se hace push a `origin main` del repo morfx (root directory configurado en Railway = `/godentist/robot-godentist`). No requiere paso manual de deploy.

</specifics>

<deferred>
## Deferred Ideas

- **Fix de `clickNextPage` no chequea `x-item-disabled`**: identificado durante la investigación pero out-of-scope porque el table-refresh guard ya elimina la condición que lo gatilla (si la tabla refresca correctamente, `getTotalPages` lee el valor correcto). Si vuelve a manifestarse después del fix de table-refresh, abrir standalone follow-up.
- **Server-action dedupe por `(workspace, telefono, fecha, hora)`**: descartado en R1 de discuss. Si el bug reaparece tras este fix, retomar como standalone separado.
- **Unit tests del adapter con mocks Playwright**: descartado en R1. Si el equipo gana costumbre de Playwright Test framework en otros robots, retomar.
- **Cleanup retrospectivo de reminders duplicados**: verificado en SPEC.md que no hay pendientes para fechas futuras. No requiere acción.
- **Migración a API oficial de Dentos** (si existe): no se ha investigado. Si el portal scraping sigue siendo frágil, evaluar API directa.

</deferred>

---

*Standalone: godentist-scraper-table-refresh-guard*
*Context gathered: 2026-05-12*
*Next step: `/gsd-research-phase godentist-scraper-table-refresh-guard` (opcional dado lo acotado del scope) o directamente `/gsd-plan-phase godentist-scraper-table-refresh-guard`*
