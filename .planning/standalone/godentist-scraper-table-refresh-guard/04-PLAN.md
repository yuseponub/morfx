---
phase: godentist-scraper-table-refresh-guard
plan: 04
type: execute
wave: 2
depends_on:
  - "01"
files_modified:
  - godentist/robot-godentist/src/api/server.ts
autonomous: true
requirements:
  - REQ-03

must_haves:
  truths:
    - "El Express handler POST /api/scrape-appointments tiene un import de SedeRefreshFailedError del adapter"
    - "El catch block del handler discrimina con `if (err instanceof SedeRefreshFailedError)` y retorna HTTP 502 con body { status:'error', code:'sede_refresh_failed', sucursal, attempts, error }"
    - "Otros errores siguen retornando HTTP 500 verbatim (sin cambio)"
    - "El finally block que cierra el adapter y limpia activeJob se preserva intacto"
    - "tsc --noEmit pasa"
  artifacts:
    - path: "godentist/robot-godentist/src/api/server.ts"
      provides: "HTTP 502 mapping para SedeRefreshFailedError"
      contains:
        - "import { GoDentistAdapter, SedeRefreshFailedError } from"
        - "if (err instanceof SedeRefreshFailedError)"
        - "res.status(502).json"
        - "code: 'sede_refresh_failed'"
  key_links:
    - from: "Express handler catch (Plan 04)"
      to: "SedeRefreshFailedError class (Plan 01)"
      via: "import + instanceof"
      pattern: "import { GoDentistAdapter, SedeRefreshFailedError }"
    - from: "Express handler 502 response"
      to: "src/app/actions/godentist.ts:129 (`!res.ok` branch)"
      via: "HTTP response status"
      pattern: "res.status(502)"
---

<objective>
Modificar el Express handler `POST /api/scrape-appointments` en `godentist/robot-godentist/src/api/server.ts` para mapear `SedeRefreshFailedError` (thrown desde Plan 02/03) a HTTP 502 con body discriminado, manteniendo el mapping HTTP 500 generico para otros errores.

Cambios:
1. Extender el `import` en linea 4: anadir `SedeRefreshFailedError` al import desde `'../adapters/godentist-adapter.js'`.
2. En el `catch (err)` block del handler `POST /api/scrape-appointments` (lineas 70-76), INSERTAR un branch `if (err instanceof SedeRefreshFailedError)` ANTES del `res.status(500)` fallback que retorna HTTP 502 con `{ success: false, status: 'error', code: 'sede_refresh_failed', sucursal: err.sucursal, attempts: err.attempts, error: err.message }`.
3. Preservar `finally { close + clear activeJob }` block (lineas 77-80) sin cambios.
4. No tocar otros handlers (`confirm-appointment`, `check-availability`, health check, screenshots) — el bug solo aplica al scrape multi-sucursal.

Purpose: Sin este plan, el throw de SedeRefreshFailedError de Plan 02/03 cae al `res.status(500)` generico y rompe la semantica HTTP (500 = "robot interno"; 502 = "portal upstream no respondio como esperado"). El downstream server-action `src/app/actions/godentist.ts:129` ya gatea con `if (!res.ok)` que captura cualquier 5xx — pero el codigo discriminador 502 + body estructurado permite forensics futura mas precisa.

Output: 2 ediciones a `src/api/server.ts`: extender import + extender catch block. `tsc --noEmit` pasa.
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
<!-- Plan 01 ya exporto del adapter: -->

```typescript
export class SedeRefreshFailedError extends Error {
  constructor(
    public readonly sucursal: string,
    public readonly attempts: number,
    public readonly stuckFingerprint: Fingerprint | null,
  ) {
    super(`Sede ${sucursal}: tabla no se refresco tras ${attempts} intentos. Fingerprint stuck at ${...}`)
    this.name = 'SedeRefreshFailedError'
  }
}
```

<!-- Estado actual de server.ts (lineas 1-81 — lo que se modifica): -->

```typescript
import express from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { GoDentistAdapter } from '../adapters/godentist-adapter.js'  // ← linea 4: extender con SedeRefreshFailedError
import type { ScrapeAppointmentsRequest, ScrapeAppointmentsResponse, HealthResponse, ConfirmAppointmentRequest, ConfirmAppointmentResponse, CheckAvailabilityRequest } from '../types/index.js'

// ...

  app.post('/api/scrape-appointments', async (req, res) => {
    // ... validations + activeJob check ...
    const adapter = new GoDentistAdapter(body.credentials, body.workspaceId)
    try {
      await adapter.init()
      const loginOk = await adapter.login()
      if (!loginOk) { res.status(401).json(...); return }
      const result = await adapter.scrapeAppointments(body.sucursales, body.targetDate)
      const response: ScrapeAppointmentsResponse = { ... }
      res.json(response)
    } catch (err) {
      console.error('[Server] Scrape error:', err)
      await adapter.takeScreenshot('server-error')
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      await adapter.close()
      activeJob = null
    }
  })
```

Style del archivo:
- 2 espacios indent.
- SIN punto y coma final (mismo style que adapter).
- Backticks para template strings.
- console.error con prefix `[Server] `.

PATRON CRITICO a preservar: `finally { await adapter.close(); activeJob = null }`. Aunque haya 502, el browser se cierra y el activeJob se libera.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extender import + anadir branch HTTP 502 en catch del POST /api/scrape-appointments</name>

  <read_first>
    - godentist/robot-godentist/src/api/server.ts (estado actual completo — el ejecutor debe ver el handler para localizar el catch exacto del scrape-appointments handler, NO de confirm-appointment o check-availability)
    - .planning/standalone/godentist-scraper-table-refresh-guard/PATTERNS.md (Analog 6 — codigo verbatim del handler + extension site con anotaciones)
    - .planning/standalone/godentist-scraper-table-refresh-guard/RESEARCH.md (Pattern 2 — `instanceof` discriminator + body shape; sub-recommendation: console.error + takeScreenshot deben correr antes o aparte del 502 branch — el patron en RESEARCH.md los mantiene ANTES del `if`)
    - .planning/standalone/godentist-scraper-table-refresh-guard/CONTEXT.md (D-08 — body shape exacto: `{ status: 'error', code: 'sede_refresh_failed', sucursal, attempts: 3, message }`)
  </read_first>

  <files>godentist/robot-godentist/src/api/server.ts</files>

  <action>
Aplicar 2 ediciones a `src/api/server.ts`:

**Edicion 1: Extender el import en linea 4**

Estado actual:
```typescript
import { GoDentistAdapter } from '../adapters/godentist-adapter.js'
```

Cambiar a:
```typescript
import { GoDentistAdapter, SedeRefreshFailedError } from '../adapters/godentist-adapter.js'
```

**Edicion 2: Extender el catch del POST /api/scrape-appointments con branch HTTP 502**

Localizar el catch block del PRIMER handler (`app.post('/api/scrape-appointments', ...)`). Estado actual lineas 70-76:

```typescript
    } catch (err) {
      console.error('[Server] Scrape error:', err)
      await adapter.takeScreenshot('server-error')
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
```

CRITICAL: hay 3 catch blocks identicos en el archivo (uno por cada handler — scrape, confirm-appointment, check-availability). SOLO modificar el primero (del scrape-appointments). Anchor preciso para identificacion: el `console.error('[Server] Scrape error:', err)` arriba — los otros dos handlers usan `'[Server] Confirm appointment error:'` y `'[Server] Check availability error:'`.

REEMPLAZAR el catch block del scrape-appointments handler por:

```typescript
    } catch (err) {
      console.error('[Server] Scrape error:', err)
      await adapter.takeScreenshot('server-error')

      // Per CONTEXT.md D-08: SedeRefreshFailedError (thrown by adapter when a sede exhausts
      // 3 refresh attempts) maps to HTTP 502 — semantically correct because the portal Dentos
      // (upstream of the robot) didn't respond as expected. Discriminator code allows
      // forensics distinction from other 5xx responses.
      if (err instanceof SedeRefreshFailedError) {
        res.status(502).json({
          success: false,
          status: 'error',
          code: 'sede_refresh_failed',
          sucursal: err.sucursal,
          attempts: err.attempts,
          error: err.message,
        })
        return
      }

      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
```

Verificaciones de style:
- SIN punto y coma final (style del archivo).
- Indent 4 espacios al inicio del `} catch (err) {` (mismo nivel que `try {`).
- Indent 6 espacios para `console.error`, `await adapter.takeScreenshot`, `if`, `res.status(500)` (cuerpo del catch).
- Indent 8 espacios para el cuerpo del `if`.
- EM DASH `—` en el comentario "(upstream of the robot) didn't respond as expected — Discriminator code allows" — verbatim. Si dudoso copiar verbatim del bloque action.
- El comentario JSDoc-style multi-linea (4 lineas con `//`) documenta la rationale para el lector futuro.
- El `return` dentro del `if` es CRITICO — sin el, el fall-through ejecuta tambien el `res.status(500)` y rompe el response (ya enviado 502, segundo `.json()` crashea).
- El `finally` block (lineas 77-80) NO se toca — debe quedar verbatim:
  ```typescript
      } finally {
        await adapter.close()
        activeJob = null
      }
  ```

**NO modificar:**
- Los otros 2 handlers (`POST /api/confirm-appointment`, `POST /api/check-availability`) — sus catch blocks tienen mismo shape pero no aplican (no llaman `scrapeAppointments`, no pueden throw `SedeRefreshFailedError`).
- Health check `GET /api/health` y screenshots routes.
- Las validaciones del body (workspaceId, credentials, activeJob check).
- El `await adapter.init()`, `adapter.login()`, `adapter.scrapeAppointments()` calls del try.
- La construccion del response success (`ScrapeAppointmentsResponse`).
  </action>

  <verify>
    <automated>cd godentist/robot-godentist; npx tsc --noEmit; grep -c "import { GoDentistAdapter, SedeRefreshFailedError } from" src/api/server.ts; grep -c "if (err instanceof SedeRefreshFailedError)" src/api/server.ts; grep -c "code: 'sede_refresh_failed'" src/api/server.ts; grep -c "res.status(502)" src/api/server.ts</automated>
  </verify>

  <acceptance_criteria>
    - `cd godentist/robot-godentist && npx tsc --noEmit` retorna exit code 0.
    - `grep -c "import { GoDentistAdapter, SedeRefreshFailedError } from" godentist/robot-godentist/src/api/server.ts` retorna exactamente 1.
    - `grep -c "if (err instanceof SedeRefreshFailedError)" godentist/robot-godentist/src/api/server.ts` retorna exactamente 1.
    - `grep -c "code: 'sede_refresh_failed'" godentist/robot-godentist/src/api/server.ts` retorna exactamente 1.
    - `grep -c "res.status(502)" godentist/robot-godentist/src/api/server.ts` retorna exactamente 1 (solo en el scrape handler — no proliferar a otros handlers).
    - El `res.status(500)` original sigue presente: `grep -c "res.status(500)" godentist/robot-godentist/src/api/server.ts` retorna 3 (uno por handler — scrape, confirm, availability — sin cambios en los 2 ultimos).
    - El `finally` block del scrape handler esta intacto: `grep -A3 "} catch (err) {" godentist/robot-godentist/src/api/server.ts | head -20` muestra que tras el catch sigue el finally con `adapter.close()` y `activeJob = null`.
    - Los otros 2 handlers NO mencionan `SedeRefreshFailedError`: `grep -A50 "/api/confirm-appointment" godentist/robot-godentist/src/api/server.ts | grep -c "SedeRefreshFailedError"` retorna 0; idem para `/api/check-availability`.
    - El campo `sucursal` del body 502 es `err.sucursal` (no `err.message.match(...)` u otro hack): `grep -B1 -A1 "sucursal: err.sucursal" godentist/robot-godentist/src/api/server.ts` retorna match.
    - El campo `attempts` del body 502 es `err.attempts`: `grep "attempts: err.attempts" godentist/robot-godentist/src/api/server.ts` retorna 1 match.
    - El `return` esta presente dentro del if: `grep -A8 "if (err instanceof SedeRefreshFailedError)" godentist/robot-godentist/src/api/server.ts | grep -c "return$"` retorna >=1.
  </acceptance_criteria>

  <done>
    Express handler scrape-appointments mapea SedeRefreshFailedError a HTTP 502 con body discriminado. Otros errores siguen siendo 500. Import extendido. `tsc --noEmit` pasa. Otros handlers intactos. Finally block preservado.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Express handler ↔ HTTP cliente (server-action `src/app/actions/godentist.ts`) | El handler retorna un body JSON estructurado. El cliente solo consume `!res.ok` (gating downstream) — no parsea fields detallados, asi que el body extendido es backward-compatible. |
| Express handler ↔ Adapter | `instanceof SedeRefreshFailedError` requiere que ambos esten en el mismo proceso Node (in-memory class identity). El robot Railway corre un solo proceso — invariante mantenido. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-grd-04-01 | Information disclosure | Body 502 incluye `err.message` que contiene fingerprint stuck (puede tener phone real de paciente) | mitigate | Body solo lo consume `src/app/actions/godentist.ts:129` server-side (no se reenvia al cliente Vercel sin transformacion). El server-action retorna `{ error: \`Robot error (502): ${text}\` }` que solo es visible al operador en consola. Mismos datos que ya circulan en logs Railway. Sin nueva superficie de exposicion. |
| T-grd-04-02 | Tampering | Branch 502 podria ejecutarse incorrectamente para errores no-SedeRefreshFailedError si `instanceof` falla | accept | TypeScript garantiza el typing del `err instanceof SedeRefreshFailedError` check. La unica forma de bypass es si dos copias diferentes del modulo del adapter coexisten en runtime (ESM bundling weirdness) — descartado: Railway corre Node directo, sin bundling. |
| T-grd-04-03 | Denial of service | Algun error puede saltar el `return` y ejecutar dos `res.status().json()` consecutivos | mitigate | El `return` esta presente como acceptance criteria. Verificable por grep. Sin el `return`, Express loggea `Cannot set headers after they are sent to the client` pero no crashea el proceso — solo cause un response corrupto. Mitigacion: acceptance criteria + verificacion visual del flujo. |
| T-grd-04-04 | Repudiation | Cliente downstream (server-action) no puede distinguir entre 502 sede-refresh vs 502 otra causa futura | mitigate | El body 502 incluye `code: 'sede_refresh_failed'`. Otros futuros 502 deberian usar otro `code:` value. Convention: `code` field es el discriminador, no el status. Documentado en `__SUMMARY.md`. |
| T-grd-04-05 | Information disclosure | Otros handlers (confirm-appointment, check-availability) accidentalmente reciben el cambio | accept | Acceptance criteria explicito que solo el scrape handler tiene el branch — verificable por grep on grep `SedeRefreshFailedError` en los otros 2 handler blocks. |
</threat_model>

<verification>
- TypeScript compila: `cd godentist/robot-godentist && npx tsc --noEmit`.
- Import + branch + body + return presentes (greps arriba).
- Otros 2 handlers sin cambios accidentales.
- Robot arranca: `cd godentist/robot-godentist && npm start` no falla por sintaxis/import (smoke local opcional).
</verification>

<success_criteria>
- [ ] Import extendido en linea 4 con `SedeRefreshFailedError`.
- [ ] Branch `if (err instanceof SedeRefreshFailedError)` insertado en el catch del scrape-appointments handler, ANTES del `res.status(500)` fallback.
- [ ] Body 502 contiene los 6 campos: `success`, `status`, `code`, `sucursal`, `attempts`, `error`.
- [ ] `return` dentro del if (no fall-through).
- [ ] `finally` block intacto.
- [ ] Otros handlers sin cambios.
- [ ] `tsc --noEmit` pasa.
- [ ] Commit atomico en espanol + Co-Authored-By Claude.
</success_criteria>

<output>
Tras completar este plan crear `.planning/standalone/godentist-scraper-table-refresh-guard/04-SUMMARY.md` con: 2 ediciones aplicadas, anchor para localizar el catch correcto (`'[Server] Scrape error:'` distintivo), greps de validacion ejecutados, y nota "el robot esta listo end-to-end — Plan 05 deploy a Railway + smoke E2E real cierra el standalone".
</output>
