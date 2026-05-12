---
phase: godentist-scraper-table-refresh-guard
plan: 01
subsystem: robot-godentist-adapter
tags: [scaffolding, fingerprint, error-class, robot, godentist, table-refresh-guard, wave-1]

# Dependency graph
requires: []
provides:
  - "Tipo `Fingerprint` interface module-level (phone, hora, rowCount) — consumido por Plan 02 (captureFingerprint return + parámetro de waitForSucursalRefresh)"
  - "Función pura module-level `fingerprintsEqual(a, b)` — consumida internamente por Plan 02 (waitForSucursalRefresh polling comparison)"
  - "Constantes `SUCURSAL_REFRESH_TIMEOUT_MS = 8000` y `SUCURSAL_REFRESH_POLL_MS = 250` — consumidas por Plan 02 (page.waitForFunction option-bag)"
  - "Clase Error custom exportada `SedeRefreshFailedError extends Error` — primera Error class custom del robot; consumida por Plan 02 (throw cuando 3 intentos agotados) y Plan 04 (server.ts instanceof check para mapear a HTTP 502)"
affects: [godentist-scraper-table-refresh-guard-02, godentist-scraper-table-refresh-guard-03, godentist-scraper-table-refresh-guard-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Custom Error class con campos públicos readonly — patrón Node estándar `class X extends Error { constructor(public readonly campo: T, ...) { super(msg); this.name = 'X' } }`. Primera ocurrencia en el robot — establece convención para discriminadores HTTP via instanceof"
    - "Función pura module-level (no método de clase) — `function fingerprintsEqual(...)` testable aisladamente sin instanciar GoDentistAdapter. Convención fresca dentro del archivo (el robot no tenía funciones puras module-level hasta hoy)"
    - "Bloque de scaffolding inerte: añadir símbolos sin call sites en commit dedicado para aislar blast radius del cambio antes de cablearlos en planes siguientes"

key-files:
  created: []
  modified:
    - "godentist/robot-godentist/src/adapters/godentist-adapter.ts (+56 líneas insertadas entre APPOINTMENTS_URL línea 12 e interface Sucursal línea 70; nuevos símbolos en líneas 21, 22, 29, 41, 56)"

key-decisions:
  - "Style verbatim del archivo respetado: indent 2, SIN punto y coma final, JSDoc /** */ para cada símbolo no-trivial — coherente con resto del adapter"
  - "Constantes en bloque top-of-file (no hardcoded inline) — coherente con APPOINTMENTS_URL/STORAGE_DIR/etc."
  - "SedeRefreshFailedError es la única exportación module-level (`export class`) — el caller `server.ts` (Plan 04) hará `import { SedeRefreshFailedError }` para instanceof check"
  - "Fingerprint interface NO exportada — uso interno + tipo de retorno de captureFingerprint (Plan 02) + campo `stuckFingerprint` de SedeRefreshFailedError"
  - "fingerprintsEqual NO exportada — pure fn module-level, testable en futuro pero no parte del contract público del módulo"
  - "El mensaje de SedeRefreshFailedError incluye el fingerprint stuck inline (`Sede X: tabla no se refrescó tras N intentos. Fingerprint stuck at {phone:...,hora:...,rowCount:...}`) para forensics post-incidente (consistente con T-grd-01-01 mitigation: el body 502 solo es consumido server-side por src/app/actions/godentist.ts:129, sin exposure a cliente)"

patterns-established:
  - "Wave 1 scaffolding pattern para robot: añadir tipos+contratos+constantes en un commit dedicado ANTES de cualquier wiring. Beneficio: code review aislado, blast radius cero (símbolos dormidos no afectan runtime), rollback granular si Plan 02+ revelara que el shape estaba mal"

requirements-completed: []
# REQ-01, REQ-02, REQ-03 listados en frontmatter del Plan 01 como "scaffolding necesario para",
# pero NINGUNO se cumple por completo en Plan 01 — son completados al ser cableados en Plans 02-04.
# Plan 01 deja los símbolos listos pero inertes.

# Metrics
duration: ~5min (lectura de plan + edit + tsc verify + commit + summary)
completed: 2026-05-12
---

# Plan 01: Scaffolding Table-Refresh Guard — Summary

**Añade al adapter `godentist/robot-godentist/src/adapters/godentist-adapter.ts` las 5 primitivas base (1 interface, 1 pure fn, 2 constantes, 1 export Error class) que los planes 02-04 consumirán, todas inertes en este plan — sin call sites todavía. El robot sigue funcionando idéntico (los nuevos símbolos están dormidos hasta Plan 02 wire captureFingerprint+waitForSucursalRefresh y Plan 04 wire el discriminador HTTP 502 en server.ts).**

## Performance

- **Duration:** ~5min total (lectura plan + 1 edit + tsc + commit + summary)
- **Completed:** 2026-05-12
- **Tasks:** 1/1 completed (Task 1 scaffolding insert)
- **Files modified:** 1 (`godentist/robot-godentist/src/adapters/godentist-adapter.ts`)
- **Files created:** 0
- **Lines added:** 56 (insertion entre línea 12 y línea 70, sin tocar nada existente)

## Accomplishments

- **5 símbolos añadidos al adapter en bloque dedicado top-of-file:**
  - `SUCURSAL_REFRESH_TIMEOUT_MS = 8000` (línea 21) — timeout máximo por intento de refresh (D-04).
  - `SUCURSAL_REFRESH_POLL_MS = 250` (línea 22) — polling rate del page.waitForFunction (D-05).
  - `interface Fingerprint { phone: string; hora: string; rowCount: number }` (línea 29) — shape del fingerprint que capturará captureFingerprint en Plan 02 (D-01).
  - `function fingerprintsEqual(a, b): boolean` (línea 41) — pure fn module-level con semantica null-aware (D-02; D-03 maneja edge cases en el caller, no aquí).
  - `export class SedeRefreshFailedError extends Error` (línea 56) — primera clase Error custom del robot, campos públicos readonly `sucursal, attempts, stuckFingerprint`, mensaje formatea el fingerprint stuck inline (D-08).
- **Style verbatim mantenido:** indent 2, sin `;` al final, JSDoc /** */ para cada símbolo no-trivial, backticks para template literals, prefijo de bloque `// ── Table-refresh guard primitives ──` consistente con otros bloques separadores del archivo (cf. `// ── Lifecycle ──` línea 31).
- **TypeScript compila clean:** `cd godentist/robot-godentist && npx tsc --noEmit` exit code 0, sin errores ni warnings.
- **No call sites nuevos:** los símbolos están dormidos. `grep -n "captureFingerprint\|waitForSucursalRefresh" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna 3 matches, pero todos son referencias en JSDoc comments (líneas 18, 38, 48) que apuntan a Plan 02 — NO son call sites de código ejecutable. Verificable: el archivo solo tiene los símbolos definidos, no consumidos.
- **Commit aislado:** un solo commit con un solo archivo modificado y +56 líneas — máxima granularidad para code review y rollback si Plan 02 revelara que el shape necesita ajuste.

## Task Commits

Cada task committeada atómicamente. Commit NO pusheado todavía (push a Railway/Vercel queda diferido al plan 05 según workflow del standalone — `git status` muestra otros archivos sin tocar pertenecientes a fases distintas):

1. **Task 1: Añadir constantes + tipo Fingerprint + función fingerprintsEqual + clase SedeRefreshFailedError al adapter** — `e7a2531` (feat)
   - 1 archivo modificado: `godentist/robot-godentist/src/adapters/godentist-adapter.ts` (+56 líneas, sin deletions).
   - Bloque insertado entre líneas existentes 12 (`const APPOINTMENTS_URL = ...`) y 14 (ahora 70: `interface Sucursal {`), preservando el resto del archivo sin cambios.

**Plan metadata:** este SUMMARY se commiteará junto con el final-commit del plan (o queda local si el flow del standalone unifica con el commit del Plan 05 — depende del wave wrap-up).

## Files Created/Modified

- **Modified:** `godentist/robot-godentist/src/adapters/godentist-adapter.ts`
  - Insertion point: entre línea 12 (`const APPOINTMENTS_URL = ...`) y línea 14 original (ahora línea 70: `interface Sucursal {`).
  - +56 líneas añadidas.
  - 0 líneas removidas.
  - 5 nuevos símbolos en líneas 21, 22, 29, 41, 56.

## Decisions Made

- **Style verbatim respetado:** seguí 1:1 las convenciones del archivo (no semicolons, indent 2, JSDoc /** */, backticks). Sin innovación estilística.
- **Bloque dedicado top-of-file** (no inline en métodos): coherente con APPOINTMENTS_URL/STORAGE_DIR/SESSIONS_DIR/ARTIFACTS_DIR ya existentes.
- **Únicamente `SedeRefreshFailedError` se exporta** (`export class`): el caller `server.ts` (Plan 04) necesitará el `instanceof` discriminator. `Fingerprint` y `fingerprintsEqual` quedan module-private (uso interno + testabilidad futura sin contract público).
- **Mensaje de SedeRefreshFailedError incluye el fingerprint stuck inline en el `.message`** (no en un campo separado solamente): permite forensics directo desde logs Railway con `grep "Table refresh FAILED"`. El campo `stuckFingerprint` también queda disponible como readonly para callers que prefieran consumirlo estructuradamente (server.ts puede embeberlo en el body 502 sin re-parsear).

## Deviations from Plan

Ninguna. Plan ejecutado verbatim:
- No se añadieron símbolos extra.
- No se modificó nada fuera del bloque insertado.
- No se cambió el style del archivo.
- No se introdujeron call sites (los símbolos quedan dormidos como manda el plan).
- No se tocó `interface Sucursal`, ni la clase `GoDentistAdapter`, ni imports, ni otros métodos.

## Threat Flags

Cero threats nuevos introducidos en Plan 01:
- T-grd-01-01 (Information disclosure via `SedeRefreshFailedError.message` con phone embebido): `mitigate` declarado en plan, **no aplica todavía** porque la clase está sin instanciar/throw en Plan 01. La mitigation se hace efectiva cuando Plan 02 cablea `throw` y Plan 04 controla el body 502 server-side — siguiendo el guidance del plan que confirma que `src/app/actions/godentist.ts:129` consume server-side sin exponer al cliente Vercel.
- T-grd-01-02 (DoS via constantes timeout/poll): `accept` — constantes inertes hasta Plan 02 las consuma. Sin loops nuevos en este plan.
- T-grd-01-03 (Tampering del Error class export): `accept` — `SedeRefreshFailedError` solo cruza boundaries Node intra-process (adapter ↔ server.ts). Sin path para tampering externo.

## No Call Sites Yet — Plan 02 Wires captureFingerprint + waitForSucursalRefresh

Nota explícita per el `<output>` del plan:

**Estado al cierre del Plan 01:**
- `Fingerprint`: definido pero ningún sitio del adapter retorna ni acepta este tipo todavía.
- `fingerprintsEqual`: definida pero no invocada por nadie (módulo + tests = 0 callers).
- `SUCURSAL_REFRESH_TIMEOUT_MS` y `SUCURSAL_REFRESH_POLL_MS`: definidos pero no consumidos por ningún `page.waitForFunction({ timeout: ... })`.
- `SedeRefreshFailedError`: clase exportada pero ningún `throw new SedeRefreshFailedError(...)` aún. `server.ts` tampoco importa la clase.

**Estado esperado tras Plan 02 (próximo):**
- Plan 02 añadirá los métodos privados `captureFingerprint(): Promise<Fingerprint | null>` y `waitForSucursalRefresh(prev, sucursalLabel): Promise<Fingerprint | null>` a la clase `GoDentistAdapter`.
- Plan 02 invocará `fingerprintsEqual` dentro de `page.waitForFunction` (serializado vía closure según D-04).
- Plan 02 hará `throw new SedeRefreshFailedError(sucursalLabel, 3, stuckFp)` cuando 3 intentos se agoten sin refresh.
- Plan 04 modificará `server.ts:catch` para hacer `if (err instanceof SedeRefreshFailedError) { res.status(502).json({ status: 'error', code: 'sede_refresh_failed', sucursal, attempts, message }) }`.

## Self-Check

**1. TypeScript compila:**
- `cd godentist/robot-godentist && npx tsc --noEmit` → exit code 0 → PASSED

**2. 5 símbolos en sus líneas correctas:**
- `^const SUCURSAL_REFRESH_TIMEOUT_MS` → línea 21 → FOUND
- `^const SUCURSAL_REFRESH_POLL_MS` → línea 22 → FOUND
- `^interface Fingerprint` → línea 29 → FOUND
- `^function fingerprintsEqual` → línea 41 → FOUND
- `^export class SedeRefreshFailedError` → línea 56 → FOUND

**3. Bloque insertado en el sitio correcto:**
- `APPOINTMENTS_URL` en línea 12 + `interface Sucursal` en línea 70 → gap = 58 líneas entre ellos → bloque inserto en medio confirmado.

**4. No hay call sites nuevos (símbolos dormidos):**
- `grep -n "captureFingerprint\|waitForSucursalRefresh"` retorna 3 matches, todos en JSDoc comments (líneas 18, 38, 48). Cero matches fuera de comments → no hay invocación ejecutable.

**5. Commit existe:**
- `e7a2531` (Task 1 scaffolding) → FOUND en `git log -1 --format="%H"`.

**6. Style verbatim:**
- No semicolons al final → verificado en lectura inline del bloque insertado.
- Indent 2 → verificado.
- JSDoc /** */ presentes para Fingerprint, fingerprintsEqual, SedeRefreshFailedError y comentario explicativo arriba de las constantes timeout/poll.

## Self-Check: PASSED
