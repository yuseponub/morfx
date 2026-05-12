---
phase: godentist-scraper-table-refresh-guard
plan: 03
subsystem: robot-godentist-adapter
tags: [table-refresh-guard, wiring, scrape-appointments, abort, robot, godentist, wave-3]

# Dependency graph
requires:
  - "godentist-scraper-table-refresh-guard-01 (provides: SedeRefreshFailedError class para el `instanceof` check del catch)"
  - "godentist-scraper-table-refresh-guard-02 (provides: métodos privados captureFingerprint + waitForSucursalRefresh)"
provides:
  - "scrapeAppointments con guard table-refresh activo: baseline post-setHour + wait-for-refresh entre clickBuscar y extractAllPages + re-throw selectivo en catch para abort total"
affects:
  - "godentist-scraper-table-refresh-guard-05 (smoke E2E ahora puede ejercitar todo el path end-to-end)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reasignación in-loop de fingerprint baseline: `prevFingerprint = await helper(prev, sucursal)` propaga el estado entre iteraciones del for-loop; el return value de una iteración alimenta el prev de la siguiente, formando una cadena lineal sede→sede que detecta divergencias del portal en cada transición"
    - "Re-throw selectivo en catch de loop con `instanceof` discriminator: patrón aplicable a otros loops que mezclan errores recuperables (acumular y continuar) vs errores fatales (abort total). El `if (err instanceof X) throw err` como PRIMERA línea del catch es la única posición que garantiza propagación verbatim sin contaminar el flujo de errors[]"

key-files:
  created:
    - ".planning/standalone/godentist-scraper-table-refresh-guard/03-SUMMARY.md (este archivo)"
  modified:
    - "godentist/robot-godentist/src/adapters/godentist-adapter.ts (+10 líneas, -1 línea netas; 3 ediciones puntuales al método scrapeAppointments)"

key-decisions:
  - "Plan ejecutado verbatim sin divergencias. Las 3 ediciones del action se aplicaron en una sola pasada y un solo commit atómico (no se subdividió en sub-commits porque las 3 forman una unidad lógica indivisible: el wiring del guard solo tiene sentido completo; un commit parcial dejaría el código en estado roto — ej. baseline sin uso o helper invocado sin re-throw)"
  - "Localización de anchors por contenido (no por número de línea): el archivo tras Plan 02 estaba en 1979 líneas; el bloque del for-loop arrancaba en línea 273 post-Plan-02. Usé `grep -n` para localizar todos los anchors críticos antes de tocar nada (takeScreenshot 'after-set-hour', for (const sucursal of sucursales), waitForTimeout(3000) dentro del loop, } catch (err) {)"
  - "Verificación de que el `waitForTimeout(3000)` removido era EL CORRECTO: hay 4 ocurrencias adicionales en el archivo (líneas 332, 446, 471, 482) en métodos confirmAppointment / scheduleAppointments / etc. — todos fuera del scope. Solo el que estaba inmediatamente arriba de `takeScreenshot(\`citas-${sucursal.label...\`)` y abajo de `clickBuscar()` dentro del for-loop fue reemplazado. Verificación visual con `sed -n '272,300p'` post-edit confirmó wiring correcto"

# Metrics
duration: ~5min (lectura plan/refs + 2 ediciones Edit tool + tsc verify + 4 greps + commit + SUMMARY)
completed: 2026-05-12
---

# Plan 03: Wire Guard en scrapeAppointments Loop — Summary

**Activa el table-refresh guard implementado en Plans 01+02. Tres ediciones puntuales al método `scrapeAppointments` del adapter `godentist/robot-godentist/src/adapters/godentist-adapter.ts`: (1) captura baseline `prevFingerprint` post-`setHour`, (2) reemplaza el `waitForTimeout(3000)` ciego del for-loop por `waitForSucursalRefresh` con reasignación in-place del prev, (3) inserta `if (err instanceof SedeRefreshFailedError) throw err` como PRIMERA línea del catch del loop para garantizar abort total en sede agotada. End-to-end ahora activo: helper Plan 02 → catch Plan 03 → server.ts 502 Plan 04 (shipped previamente).**

## Performance

- **Duration:** ~5min
- **Completed:** 2026-05-12
- **Tasks:** 1/1 completed (Task 1 — 3 ediciones agrupadas)
- **Files modified:** 1 (`godentist/robot-godentist/src/adapters/godentist-adapter.ts`)
- **Files created:** 1 (este SUMMARY.md)
- **Lines added/removed:** +10 / -1 (1 línea reemplazada + 9 nuevas para baseline comment + comentario del re-throw)
- **Adapter file size:** 1979 → 1988 líneas

## Accomplishments

### Edición 1: Baseline fingerprint post-setHour (D-07)

**Anchor:** `await this.takeScreenshot('after-set-hour')` (línea 253 del archivo).

**Inserción** inmediatamente después, con línea en blanco previa:

```typescript
    await this.takeScreenshot('after-set-hour')

    // Baseline fingerprint for table-refresh guard (CONTEXT.md D-07)
    let prevFingerprint = await this.captureFingerprint()
```

El `let` (no `const`) porque el valor se reasigna dentro del for-loop. Tipo inferido como `Fingerprint | null` (return de `captureFingerprint`).

### Edición 2: Wire helper inside loop (D-06)

**Anchor:** Línea 278 — la única `await this.page.waitForTimeout(3000)` que estaba ENTRE `clickBuscar()` (línea 277) y `takeScreenshot(\`citas-...\`)` (línea 279) dentro del cuerpo del `for (const sucursal of sucursales)` loop.

**Reemplazo:**

Antes:
```typescript
        await this.clickBuscar()
        await this.page.waitForTimeout(3000)
        await this.takeScreenshot(`citas-${sucursal.label.replace(/\s+/g, '-').toLowerCase()}`)
```

Después:
```typescript
        await this.clickBuscar()
        prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal)
        await this.takeScreenshot(`citas-${sucursal.label.replace(/\s+/g, '-').toLowerCase()}`)
```

La reasignación es clave — el return value (curr fingerprint post-refresh) se convierte en el prev de la siguiente iteración, formando una cadena lineal de detección. Confirma que en cada transición sede→sede la tabla realmente cambió (Pitfall 7 del incidente 11-may anulado).

### Edición 3: Re-throw selectivo en catch (D-08 + Pitfall 2 — CRÍTICO)

**Anchor:** `} catch (err) {` del cuerpo del for-loop (línea 284 del archivo).

**Inserción** como PRIMERA línea del catch block (antes de `const msg`):

```typescript
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
```

Esta es la línea de código más importante del Plan 03. Sin ella, el catch acumulaba `SedeRefreshFailedError` en `errors[]` y continuaba al siguiente sede, dejando el scrape con datos parciales pero status 200. El `instanceof` discriminator divide cleanly:

- **`SedeRefreshFailedError`** → propaga al caller (`scrapeAppointments` → Express handler → HTTP 502 mapeado en Plan 04).
- **Cualquier otro Error** → flujo original intacto (acumula msg en `errors[]` + log + continúa al siguiente sede).

EM DASH U+2014 verbatim en comentario "the entire scrape — must propagate" (consistencia con D-10 logs del Plan 02).

## Task Commits

Plan ejecutado en un único commit atómico (las 3 ediciones forman una unidad lógica indivisible: un commit parcial dejaría código en estado intermedio inutilizable o roto):

1. **Task 1: Wire baseline + waitForSucursalRefresh + re-throw selectivo en catch** — `c60c54b` (feat)
   - 1 archivo modificado: `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (+10 / -1 líneas).
   - 3 ediciones puntuales al método `scrapeAppointments`, todas dentro de las líneas 253-289 del archivo post-edit.
   - Sin push (push diferido a Plan 05).

## Anchors Used (post-Plan-02 file state)

Localización por contenido grep, no por número de línea (el archivo tenía 1979 líneas post-Plan-02 vs 1804 pre-Plan-02 — +175 líneas por los helpers):

| Edición | Anchor (texto buscado) | Línea encontrada |
|---------|------------------------|-------------------|
| 1 — baseline | `await this.takeScreenshot('after-set-hour')` | 253 |
| 2 — wire | `await this.page.waitForTimeout(3000)` dentro del for-loop sucursales (anchors arriba = `await this.clickBuscar()`, anchors abajo = `await this.takeScreenshot(\`citas-...\`)`) | 278 |
| 3 — re-throw | `} catch (err) {` que cierra el try del for-loop body (anchor abajo = `const msg = \`Error en ${sucursal.label}:...\``) | 284 |

Otras 4 ocurrencias de `waitForTimeout(3000)` en el archivo (líneas 332, 446, 471, 482) están en métodos `confirmAppointment` / `checkAvailability` / `scheduleAppointments` etc. — fuera del scope de este plan, NO modificadas.

## Validation Greps Executed

```
F=godentist/robot-godentist/src/adapters/godentist-adapter.ts

# Plan 03 acceptance criteria — todos PASS
tsc --noEmit: exit code 0

grep -c "let prevFingerprint = await this.captureFingerprint()" $F = 1  (Edit 1)
grep -c "prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal)" $F = 1  (Edit 2)
grep -c "if (err instanceof SedeRefreshFailedError) throw err" $F = 1  (Edit 3 — CRÍTICO)

# Verificación de remoción correcta del waitForTimeout(3000) del for-loop
grep -nB1 "waitForTimeout(3000)" $F:
  line 332-clickBuscar()      ← confirmAppointment (legítimo, fuera de scope)
  line 332-waitForTimeout
  line 445-}                  ← scheduleAppointments
  line 446-waitForTimeout
  line 470-}                  ← scheduleAppointments
  line 471-waitForTimeout
  line 481-empty              ← scheduleAppointments comment
  line 482-waitForTimeout
(El waitForTimeout(3000) del for-loop scrapeAppointments — antes en línea 278 — fue removido y reemplazado correctamente)

# Verificación de orden correcto en el catch
grep -A6 "if (err instanceof SedeRefreshFailedError) throw err" $F:
  if (err instanceof SedeRefreshFailedError) throw err
  (blank line)
  const msg = `Error en ${sucursal.label}: ${err instanceof Error ? err.message : String(err)}`
  console.error(`[GoDentist] ${msg}`)
  errors.push(msg)
  }
  }
(re-throw es la PRIMERA línea, errors.push preservado)

# Scope respetado
git diff --name-only HEAD~1 HEAD = godentist/robot-godentist/src/adapters/godentist-adapter.ts
(solo el adapter modificado, sin filtraciones a otros archivos)
```

## Decisions Made

- **Las 3 ediciones agrupadas en un único commit:** el plan describe 3 ediciones distintas pero todas forman una unidad lógica indivisible: el baseline (Edit 1) sin el wire (Edit 2) deja una variable sin usar; el wire (Edit 2) sin el baseline (Edit 1) no compila; el wire (Edit 2) sin el re-throw (Edit 3) hace que el guard sea inútil (catch swallow rompe abort). Un commit por edición habría dejado HEAD~2 / HEAD~1 en estados inutilizables; un commit atómico mantiene la propiedad "cada commit deja el repo en estado consistente".
- **Sin push del commit:** Plan 03 NO pushea — push diferido a Plan 05 (deploy/smoke) per workflow del standalone. Esto es coherente con que Plans 01+02 también no pushearon (commits `e7a2531`, `63814b5`, `40b88c3` están locales hasta Plan 05).
- **Anchors localizados por grep, no por número de línea:** el plan instruyó usar contenido como anchor porque Plan 02 introdujo offset (+175 líneas). Verifiqué con `grep -n` antes de cualquier Edit para asegurar precisión.

## Deviations from Plan

**None — plan ejecutado verbatim.**

Las 3 ediciones aplicadas exactamente como especificadas en `03-PLAN.md` `<action>`:

1. Baseline insertado verbatim con el comentario exacto del plan (`// Baseline fingerprint for table-refresh guard (CONTEXT.md D-07)`).
2. Reemplazo verbatim del `waitForTimeout(3000)` por `prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal)`.
3. Re-throw insertado verbatim con el comentario multi-línea del plan (incluyendo el EM DASH U+2014 en "scrape — must propagate"), como PRIMERA línea del catch, preservando el `const msg`/`console.error`/`errors.push(msg)` original tras él.

Sin Rule 1/2/3 deviations. TypeScript compiló clean al primer intento sin necesitar fixes.

## Threat Flags

Cero threats nuevos. Los previstos en `<threat_model>` del plan están mitigados:

- **T-grd-03-01 (catch silenciando abort):** `mitigate` declarado. La línea `if (err instanceof SedeRefreshFailedError) throw err` está en la PRIMERA posición del catch, garantizando propagación antes del `errors.push`. Verificable: `grep -A6 "if (err instanceof SedeRefreshFailedError) throw err" $F` muestra `const msg` después, confirmando posición correcta.
- **T-grd-03-02 (DoS via overhead 3×8s):** `accept` declarado. Worst case 4 sedes × 24s = 96s, dentro del límite Vercel 5min. Caso común: 1 attempt × 2-4s sin overhead notable.
- **T-grd-03-03 (Information disclosure phone+hora en baseline):** `accept` declarado. Misma superficie que `extractAppointments` ya existente.
- **T-grd-03-04 (Repudiation post-mortem):** `mitigate` declarado. Logs `Table refresh FAILED for X after 3 attempts` (Plan 02 D-10) son distintivos + HTTP 502 con `code: 'sede_refresh_failed'` (Plan 04) discriminable downstream.

## End-to-End Status — Guard Activo

Estado tras este Plan 03:

- **Plan 01 (scaffolding):** ✅ shipped — Fingerprint type, fingerprintsEqual, SUCURSAL_REFRESH_TIMEOUT_MS, SUCURSAL_REFRESH_POLL_MS, SedeRefreshFailedError class.
- **Plan 02 (helpers):** ✅ shipped — captureFingerprint() + waitForSucursalRefresh(prev, sucursal) dormant.
- **Plan 03 (este — wiring):** ✅ shipped — scrapeAppointments invoca el guard end-to-end con re-throw selectivo.
- **Plan 04 (server.ts → 502):** ✅ shipped previamente (commits `2f577a8` + `e4b30fe`) — handler Express mapea SedeRefreshFailedError a HTTP 502 con body discriminado.
- **Plan 05 (deploy + smoke E2E):** pendiente — push a Railway + 3 corridas consecutivas + validación numérica ratio=1.0 + overlap=0.

**El adapter ahora aborta en sede fallida pero el HTTP 502 mapping ya existe** — server.ts está listo desde Plan 04. Lo único que falta es deploy (Plan 05) + smoke E2E (Plan 05) para validar end-to-end contra portal Dentos real.

## Self-Check

**1. TypeScript compila:**
- `cd godentist/robot-godentist && npx tsc --noEmit` → exit code 0 → PASSED

**2. Commit existe:**
- `c60c54b` (Task 1 wire + re-throw) → FOUND via `git log --oneline -1`

**3. Greps acceptance criteria:**
- `grep -c "let prevFingerprint = await this.captureFingerprint()" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 1 → PASSED
- `grep -c "prevFingerprint = await this.waitForSucursalRefresh(prevFingerprint, sucursal)" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 1 → PASSED
- `grep -c "if (err instanceof SedeRefreshFailedError) throw err" godentist/robot-godentist/src/adapters/godentist-adapter.ts` = 1 → PASSED

**4. Orden correcto en catch:**
- `grep -A6 "if (err instanceof SedeRefreshFailedError) throw err"` muestra siguientes líneas `const msg`/`console.error`/`errors.push(msg)` → PASSED (re-throw es la PRIMERA línea, lógica original preservada)

**5. waitForTimeout(3000) del for-loop sucursales fue removido:**
- Las 4 ocurrencias restantes (líneas 332, 446, 471, 482) están todas en métodos diferentes (`confirmAppointment`, `scheduleAppointments`), ninguna inmediatamente bajo un `await this.clickBuscar()` del for-loop sucursales → PASSED

**6. Scope respetado:**
- `git diff --name-only HEAD~1 HEAD` = `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (solo 1 archivo) → PASSED
- Cero deleciones inesperadas (`git diff --diff-filter=D --name-only HEAD~1 HEAD` vacío) → PASSED
- Cero cambios fuera del robot godentist o del SUMMARY → PASSED

**7. No push:**
- `git status` muestra `Your branch is ahead of 'origin/main' by N commits` (commits locales no pusheados — diferido a Plan 05) → PASSED

## Self-Check: PASSED
