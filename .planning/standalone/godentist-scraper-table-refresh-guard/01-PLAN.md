---
phase: godentist-scraper-table-refresh-guard
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - godentist/robot-godentist/src/adapters/godentist-adapter.ts
autonomous: true
requirements:
  - REQ-01
  - REQ-02
  - REQ-03

must_haves:
  truths:
    - "El archivo del adapter exporta una clase Error custom llamada SedeRefreshFailedError"
    - "El archivo del adapter define el tipo Fingerprint con campos phone:string, hora:string, rowCount:number"
    - "El archivo del adapter define una función pura module-level fingerprintsEqual(a, b) que compara dos Fingerprint | null"
    - "El archivo del adapter define las constantes SUCURSAL_REFRESH_TIMEOUT_MS=8000 y SUCURSAL_REFRESH_POLL_MS=250"
    - "El robot compila TypeScript sin errores (tsc --noEmit)"
  artifacts:
    - path: "godentist/robot-godentist/src/adapters/godentist-adapter.ts"
      provides: "Tipo Fingerprint, clase SedeRefreshFailedError, función fingerprintsEqual, constantes de timing"
      contains:
        - "interface Fingerprint"
        - "export class SedeRefreshFailedError extends Error"
        - "function fingerprintsEqual"
        - "SUCURSAL_REFRESH_TIMEOUT_MS = 8000"
        - "SUCURSAL_REFRESH_POLL_MS = 250"
  key_links:
    - from: "godentist-adapter.ts (module-level export)"
      to: "godentist-adapter.ts (consumida luego en Plan 02 captureFingerprint/waitForSucursalRefresh) + server.ts (consumida en Plan 04 para instanceof check)"
      via: "ES module export"
      pattern: "export class SedeRefreshFailedError"
---

<objective>
Añadir al archivo `godentist/robot-godentist/src/adapters/godentist-adapter.ts` las primitivas base que los planes siguientes consumirán:

1. Tipo `Fingerprint` (interface module-level, no exportado).
2. Clase `SedeRefreshFailedError extends Error` (PRIMERA clase Error custom del robot — exportada para que `server.ts` haga `instanceof` check en Plan 04).
3. Función pura module-level `fingerprintsEqual(a, b)` (no exportada — uso interno + testable en futuro).
4. Constantes top-of-file `SUCURSAL_REFRESH_TIMEOUT_MS = 8000` y `SUCURSAL_REFRESH_POLL_MS = 250` (D-04, D-05).

Purpose: Crear el scaffolding de tipos+contratos sin cambiar todavía ningún comportamiento. Los planes 02-04 consumen estos símbolos. Mantener estos cambios aislados en un commit dedicado simplifica el code review y reduce el blast radius si algo sale mal.

Output: Una sola modificación al archivo `godentist-adapter.ts` que añade ~30 líneas de scaffolding, todas inertes (sin call sites). El robot sigue funcionando idéntico — los nuevos símbolos están dormidos hasta Plan 02/03/04.
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
@CLAUDE.md

<interfaces>
<!-- Estructura actual top-of-file del adapter (líneas 1-17). El ejecutor inserta los nuevos símbolos DESPUÉS de las constants existentes y ANTES de `interface Sucursal`. -->

From godentist/robot-godentist/src/adapters/godentist-adapter.ts (líneas 1-17):
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

interface Sucursal {
  value: string
  label: string
}
```

Style convention del archivo (de PATTERNS.md):
- 2 espacios de indentación
- SIN punto y coma final
- `interface` (no `type`) para records
- Constantes en bloque top-of-file
- JSDoc para símbolos no-triviales
- Error throws en otros sitios del archivo usan `throw new Error('mensaje')` plano (líneas 73, 167, 241, 334) — D-08 introduce la primera Error class custom, justificada por necesidad de discriminador HTTP en `server.ts`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Añadir constantes + tipo Fingerprint + función fingerprintsEqual + clase SedeRefreshFailedError al adapter</name>

  <read_first>
    - godentist/robot-godentist/src/adapters/godentist-adapter.ts (líneas 1-30 — confirmar estructura actual de imports y constants y posición de `interface Sucursal`)
    - .planning/standalone/godentist-scraper-table-refresh-guard/PATTERNS.md (sección "Code Excerpts" — analog de constants top-of-file, sección "Style Conventions Observed" — sin punto y coma final, indent 2)
    - .planning/standalone/godentist-scraper-table-refresh-guard/CONTEXT.md (decisiones D-01, D-02, D-04, D-05, D-08 — fingerprint shape, equality, timeout, polling, error class)
    - .planning/standalone/godentist-scraper-table-refresh-guard/RESEARCH.md (sección "Pattern 2: Custom Error class para HTTP 502 mapping")
  </read_first>

  <files>godentist/robot-godentist/src/adapters/godentist-adapter.ts</files>

  <action>
**Insertar el siguiente bloque DESPUÉS de la línea 12 (`const APPOINTMENTS_URL = ...`) y ANTES de la línea 14 (`interface Sucursal {`):**

```typescript

// ── Table-refresh guard primitives (standalone: godentist-scraper-table-refresh-guard) ──

/**
 * Per CONTEXT.md D-04/D-05: timeout máximo por intento de refresh de tabla y polling rate
 * usados por waitForSucursalRefresh (definido en Plan 02). 8s da ~2x margen sobre el peor caso
 * medido (~3.5s) en logs Railway históricos.
 */
const SUCURSAL_REFRESH_TIMEOUT_MS = 8000
const SUCURSAL_REFRESH_POLL_MS = 250

/**
 * Per CONTEXT.md D-01: fingerprint capturado de la tabla del portal Dentos para detectar
 * cambios DOM cross-sede. Tres campos cubren el espacio de mutaciones posibles
 * (sede distinta, paginación, filas distintas).
 */
interface Fingerprint {
  phone: string
  hora: string
  rowCount: number
}

/**
 * Pure equality check de dos Fingerprint per CONTEXT.md D-02.
 * Iguales si los tres campos (phone, hora, rowCount) coinciden exactamente.
 * `null` semantics se manejan en el caller (D-03 lógica en waitForSucursalRefresh, Plan 02).
 * Module-level + no exportada: testable en futuro pero no parte del contract público.
 */
function fingerprintsEqual(a: Fingerprint | null, b: Fingerprint | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.phone === b.phone && a.hora === b.hora && a.rowCount === b.rowCount
}

/**
 * Per CONTEXT.md D-08: error thrown por waitForSucursalRefresh (Plan 02) cuando una sede
 * agota 3 intentos sin refresh detectado. Propaga sin try/catch hasta el Express handler
 * en server.ts (Plan 04), que lo mapea a HTTP 502 con body discriminado
 * `{ status: 'error', code: 'sede_refresh_failed', sucursal, attempts, message }`.
 *
 * Primera clase Error custom del robot. Discriminador `instanceof` permite type-safety
 * en server.ts sin recurrir a `.code` string-matching.
 */
export class SedeRefreshFailedError extends Error {
  constructor(
    public readonly sucursal: string,
    public readonly attempts: number,
    public readonly stuckFingerprint: Fingerprint | null,
  ) {
    const fp = stuckFingerprint
      ? `{phone:${stuckFingerprint.phone},hora:${stuckFingerprint.hora},rowCount:${stuckFingerprint.rowCount}}`
      : 'null'
    super(`Sede ${sucursal}: tabla no se refrescó tras ${attempts} intentos. Fingerprint stuck at ${fp}`)
    this.name = 'SedeRefreshFailedError'
  }
}

```

**Verificar style verbatim:**
- NO añadir punto y coma final (el archivo no usa) — todas las líneas terminan sin `;`.
- Indent = 2 espacios.
- Backticks para template strings (consistente con resto del archivo).
- JSDoc con `/** ... */` antes de cada símbolo no-trivial (mismo formato que `getTotalPages` línea 1539, `clickNextPage` etc.).

**NO modificar nada más en el archivo.** No tocar `interface Sucursal`, no tocar la clase `GoDentistAdapter`, no tocar imports, no tocar otros métodos. Este plan es **solo scaffolding inerte** — los símbolos no se consumen aún (Plan 02/03/04 los wirean).
  </action>

  <verify>
    <automated>cd godentist/robot-godentist && npx tsc --noEmit && grep -nE "^(const SUCURSAL_REFRESH_TIMEOUT_MS|const SUCURSAL_REFRESH_POLL_MS|interface Fingerprint|function fingerprintsEqual|export class SedeRefreshFailedError)" src/adapters/godentist-adapter.ts | wc -l</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0 (no errores TypeScript).
    - `grep -n "SUCURSAL_REFRESH_TIMEOUT_MS = 8000" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 1 match.
    - `grep -n "SUCURSAL_REFRESH_POLL_MS = 250" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 1 match.
    - `grep -n "interface Fingerprint" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 1 match.
    - `grep -nE "^function fingerprintsEqual" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 1 match (module-level, NO `private` method).
    - `grep -n "export class SedeRefreshFailedError extends Error" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna exactamente 1 match.
    - El bloque insertado está ENTRE las líneas con `const APPOINTMENTS_URL` e `interface Sucursal {` (verificable: `awk '/const APPOINTMENTS_URL/{a=NR} /^interface Sucursal/{b=NR; print a, b}' godentist/robot-godentist/src/adapters/godentist-adapter.ts` muestra dos números no consecutivos, indicando bloque insertado entre ellos).
    - El archivo NO tiene `;` al final de las líneas nuevas insertadas (verificable: `grep -nE "(SUCURSAL_REFRESH|interface Fingerprint|fingerprintsEqual|SedeRefreshFailedError)" godentist/robot-godentist/src/adapters/godentist-adapter.ts | grep ";"` retorna 0 matches o solo matches dentro de strings).
    - No hay nuevos call sites (los símbolos están aún dormidos): `grep -n "captureFingerprint\|waitForSucursalRefresh" godentist/robot-godentist/src/adapters/godentist-adapter.ts` retorna 0 matches (esos llegan en Plan 02).
  </acceptance_criteria>

  <done>
    Los 5 símbolos (`SUCURSAL_REFRESH_TIMEOUT_MS`, `SUCURSAL_REFRESH_POLL_MS`, `Fingerprint`, `fingerprintsEqual`, `SedeRefreshFailedError`) están añadidos al adapter. `tsc --noEmit` pasa. El robot sigue funcionando idéntico (sin call sites = sin cambio de comportamiento). Cambio aislado a este archivo.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Express handler ↔ Robot adapter | Adapter throws Error subclasses; handler discrimina con `instanceof` (Plan 04). Plan 01 solo añade la clase. |
| Robot ↔ Portal Dentos | Sin nuevo cruce en este plan (no se toca lógica de navegación). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-grd-01-01 | Information disclosure | `SedeRefreshFailedError.message` (mensaje del error incluye `phone` del primer row de la tabla stuck) | mitigate | El `message` incluye `phone` solo si `stuckFingerprint !== null`. En el caso del 11-may el phone era `573219266256` (cliente de FLO). Si el 502 body fuese expuesto a consumidor externo sin sanitizar, el phone se filtraría. **Mitigación:** D-08 confirma que el 502 body solo lo consume `src/app/actions/godentist.ts:129` server-side (no se devuelve al cliente Vercel sin transformación). El server-action ya hace `return { error: \`Robot error (502): ${text}\` }` que el frontend lee solo en consola de operador. No hay nueva superficie de exposición vs el incidente original donde los mismos datos circulaban por el JSON limpio. |
| T-grd-01-02 | Denial of service | Nuevas constantes (`SUCURSAL_REFRESH_TIMEOUT_MS=8000`) | accept | Constantes inertes en Plan 01. No hay loops nuevos consumiéndolas hasta Plan 02. Sin riesgo DoS hasta wiring. |
| T-grd-01-03 | Tampering | Clase Error export | accept | `SedeRefreshFailedError` se exporta solo dentro del proceso Node (no atraviesa boundary cliente). El consumer `server.ts` hace `import` del mismo módulo Node. No hay path para tampering externo. |
</threat_model>

<verification>
- TypeScript compila sin errores: `cd godentist/robot-godentist && npx tsc --noEmit`.
- Build de producción funciona: `cd godentist/robot-godentist && npm run build` (si `package.json` tiene script `build`).
- 5 símbolos están presentes y solo presentes en el archivo modificado (greps arriba).
- El robot sigue arrancando correctamente: `cd godentist/robot-godentist && npm start` no crashea en imports/parse del adapter (smoke local opcional — no requerido si tsc pasa).
</verification>

<success_criteria>
- [ ] 5 símbolos añadidos al adapter en el bloque correcto (entre `APPOINTMENTS_URL` e `interface Sucursal`).
- [ ] `tsc --noEmit` pasa sin errores ni warnings.
- [ ] Style verbatim del resto del archivo: indent 2, sin `;` al final de las líneas.
- [ ] No hay call sites nuevos en este plan (símbolos dormidos).
- [ ] Commit atómico con mensaje en español + Co-Authored-By Claude.
</success_criteria>

<output>
Tras completar este plan crear `.planning/standalone/godentist-scraper-table-refresh-guard/01-SUMMARY.md` con: símbolos añadidos, ubicación exacta en el archivo (offset de línea), comprobaciones grep ejecutadas, y nota explícita "no call sites yet — Plan 02 wires captureFingerprint+waitForSucursalRefresh".
</output>
