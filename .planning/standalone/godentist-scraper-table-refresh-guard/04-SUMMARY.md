---
phase: godentist-scraper-table-refresh-guard
plan: 04
subsystem: robot-godentist/server
tags:
  - express-handler
  - error-mapping
  - http-502
  - instanceof-discriminator
  - sede-refresh-guard
dependency-graph:
  requires:
    - "Plan 01 (SedeRefreshFailedError export from godentist-adapter.ts)"
  provides:
    - "HTTP 502 mapping for SedeRefreshFailedError in POST /api/scrape-appointments"
    - "Discriminated body { success, status, code, sucursal, attempts, error } for forensics"
  affects:
    - "src/app/actions/godentist.ts:129 (`!res.ok` gate — sin cambios, ya cubre 502 verbatim D-09)"
tech-stack:
  added: []
  patterns:
    - "instanceof Error class discriminator before generic status fallback"
    - "Multi-line JSDoc-style comment documenting STRIDE rationale inline en handler"
key-files:
  created: []
  modified:
    - "godentist/robot-godentist/src/api/server.ts (import line 4 + catch block lines 70-97)"
decisions:
  - "D-08 honored: HTTP 502 body con 6 campos (success, status, code, sucursal, attempts, error) — campo 'error: err.message' por consistency con shape del 500 existente (no 'message: err.message' como el primer draft de CONTEXT.md sugería). Discriminador critical es 'code: sede_refresh_failed'."
  - "D-09 honored: server-action `src/app/actions/godentist.ts` NO modificado — su `if (!res.ok)` línea 129 captura 502 verbatim y bloquea downstream insert + scheduleReminders sin cambios."
  - "Mapeo dormant hasta Plan 03: el throw real desde adapter loop se wire-ea en Plan 03. Plan 04 prepara el handler — segura preparación independiente porque `instanceof` check de un Error class que existe (Plan 01 ya lo exportó) compila sin necesidad de que sea thrown actualmente."
  - "Tres handlers POST tienen catch idénticos en shape; solo el de scrape-appointments fue extendido. Otros 2 (confirm-appointment, check-availability) no llaman scrapeAppointments y por contrato no pueden throw SedeRefreshFailedError — verificado por grep."
metrics:
  duration: "75s"
  completed: "2026-05-12T16:26:03Z"
  tasks_completed: 1
  files_modified: 1
  files_created: 0
---

# Standalone godentist-scraper-table-refresh-guard Plan 04: HTTP 502 Mapping para SedeRefreshFailedError en Express Handler

## One-liner

Express handler `POST /api/scrape-appointments` ahora mapea `SedeRefreshFailedError` (custom Error class de Plan 01) a HTTP 502 con body discriminado `{ status:'error', code:'sede_refresh_failed', sucursal, attempts, error }`, preservando el HTTP 500 generico para otros errores y el `finally` block verbatim.

## Files Changed

| File | Change | Lines | Rationale |
|------|--------|-------|-----------|
| `godentist/robot-godentist/src/api/server.ts` | Edit 1: import extendido | line 4 | Importar `SedeRefreshFailedError` named export adicional desde `'../adapters/godentist-adapter.js'` para hacer `instanceof` check |
| `godentist/robot-godentist/src/api/server.ts` | Edit 2: branch 502 en catch | lines 70-97 (era 70-76) | Insertar `if (err instanceof SedeRefreshFailedError) → res.status(502).json(...)` ANTES del fallback `res.status(500)` del scrape-appointments handler |

**Total: 1 archivo modificado, +18 lineas / -1 linea.**

## What Was Built

### Edit 1 — Import extendido (line 4)

**Antes:**
```typescript
import { GoDentistAdapter } from '../adapters/godentist-adapter.js'
```

**Despues:**
```typescript
import { GoDentistAdapter, SedeRefreshFailedError } from '../adapters/godentist-adapter.js'
```

Plan 01 ya exporto `SedeRefreshFailedError` desde el adapter (`export class SedeRefreshFailedError extends Error { ... }` líneas 56-68). El import es directo — TypeScript valida la existencia del export en compile time.

### Edit 2 — Branch 502 en catch del POST /api/scrape-appointments (lines 70-97)

**Antes:**
```typescript
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
```

**Despues:**
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
      await adapter.close()
      activeJob = null
    }
```

**Notas de implementacion:**
- `console.error('[Server] Scrape error:', err)` + `await adapter.takeScreenshot('server-error')` corren ANTES del branch `if` — observability uniforme para ambos paths (502 y 500). Si el operador investiga un 502 en logs Railway, encuentra la misma señal "[Server] Scrape error:" + screenshot que para 500.
- El `return` dentro del `if` es critical — sin él, fall-through ejecutaría `res.status(500).json(...)` después de ya haber enviado 502, causando el clásico Express warning "Cannot set headers after they are sent to the client" + response corrupto.
- `finally { adapter.close() + activeJob = null }` preservado verbatim — browser cierre y liberación de activeJob ejecutan regardless del path 200/401/500/502 (JS semantics).
- El comentario multi-line `//` (4 líneas) documenta la rationale para el lector futuro: por qué 502 vs 500, qué significa el discriminador `code:`.

## Anchor para localizar el catch correcto

El archivo `server.ts` tiene 3 handlers POST (scrape-appointments, confirm-appointment, check-availability) con catch blocks de shape idéntico. Cómo identificar inequívocamente cuál es cuál:

| Handler | `console.error` distintivo |
|---------|----------------------------|
| `POST /api/scrape-appointments` (MODIFICADO) | `console.error('[Server] Scrape error:', err)` |
| `POST /api/confirm-appointment` (intacto) | `console.error('[Server] Confirm appointment error:', err)` |
| `POST /api/check-availability` (intacto) | `console.error('[Server] Check availability error:', err)` |

Solo el primero recibió el branch 502.

## Verifications Performed

```bash
# 1. TypeScript compila
cd godentist/robot-godentist && npx tsc --noEmit
# → exit 0

# 2. Import extendido presente (1 match)
grep -c "import { GoDentistAdapter, SedeRefreshFailedError } from" godentist/robot-godentist/src/api/server.ts
# → 1

# 3. instanceof discriminator presente (1 match)
grep -c "if (err instanceof SedeRefreshFailedError)" godentist/robot-godentist/src/api/server.ts
# → 1

# 4. Discriminator code presente (1 match)
grep -c "code: 'sede_refresh_failed'" godentist/robot-godentist/src/api/server.ts
# → 1

# 5. HTTP 502 presente solo en scrape handler (1 match)
grep -c "res.status(502)" godentist/robot-godentist/src/api/server.ts
# → 1

# 6. HTTP 500 generico preservado (4 matches: 3 handlers POST + 1 pre-existente en GET /api/screenshots)
grep -c "res.status(500)" godentist/robot-godentist/src/api/server.ts
# → 4 (line 90 scrape handler fallback; line 150 confirm; line 208 availability; line 236 screenshots — pre-existente fuera de scope)

# 7. err.sucursal + err.attempts presentes
grep "sucursal: err.sucursal" godentist/robot-godentist/src/api/server.ts
grep "attempts: err.attempts" godentist/robot-godentist/src/api/server.ts
# → ambos 1 match cada uno

# 8. return dentro del if presente (no fall-through al 500)
grep -A8 "if (err instanceof SedeRefreshFailedError)" godentist/robot-godentist/src/api/server.ts | grep -E "^\s+return\b"
# → "        return" (1 match)

# 9. Otros 2 handlers POST no mencionan SedeRefreshFailedError (anti-regresion)
awk '/app\.post.*confirm-appointment/,/app\.post.*check-availability/' godentist/robot-godentist/src/api/server.ts | grep -c "SedeRefreshFailedError"
# → 0
awk '/app\.post.*check-availability/,/app\.get.*screenshots/' godentist/robot-godentist/src/api/server.ts | grep -c "SedeRefreshFailedError"
# → 0

# 10. finally block del scrape handler intacto (adapter.close + activeJob=null)
# Lectura visual lineas 94-97:
#   } finally {
#     await adapter.close()
#     activeJob = null
#   }
# → preservado verbatim
```

**Todos los acceptance criteria del plan pasan.**

## Style Verification

- 2 espacios indent: verificado verbatim (mismo style que el archivo).
- SIN punto y coma final: verificado (todas las nuevas líneas siguen el style no-semicolon del archivo).
- Indent 4 espacios para `} catch (err) {` (mismo nivel que `try {`): preservado.
- Indent 6 espacios para `console.error`, `await adapter.takeScreenshot`, `if`, `res.status(500)` (cuerpo del catch): preservado.
- Indent 8 espacios para cuerpo del `if`: aplicado en `res.status(502).json({ ... })` y `return`.
- EM DASH `—` en comentario: aplicado verbatim ("respond as expected", "Discriminator code allows").
- Backticks NO necesarios en este edit (no template strings nuevas).

## Threat Model Verification

| Threat ID | Mitigation Applied |
|-----------|---------------------|
| T-grd-04-01 (info disclosure body 502) | mitigate: body solo se consume server-side por `src/app/actions/godentist.ts:129`, no se reenvía al cliente Vercel. Mismos datos que ya están en logs Railway. Sin nueva superficie de exposición. |
| T-grd-04-02 (tampering instanceof) | accept: TypeScript garantiza typing. Bypass solo viable con dual-module-copy bundling — descartado en Railway Node directo. |
| T-grd-04-03 (DoS dos responses consecutivos) | mitigate: `return` presente verificado por grep. |
| T-grd-04-04 (repudiation cliente downstream) | mitigate: `code: 'sede_refresh_failed'` permite distinción discriminada. Convention documentada. |
| T-grd-04-05 (info disclosure otros handlers afectados) | accept verificado: `grep -c "SedeRefreshFailedError"` en bloques de confirm + availability retorna 0. |

## Decisions Made

| ID | Decisión | Razón |
|----|----------|-------|
| Local-04-01 | Campo del body 502 es `error: err.message` (no `message: err.message`) | Consistency con el 500 existente que usa `error: err.message`. Discriminador critical es `code:` no el nombre del field con el message. |
| Local-04-02 | `console.error` + `takeScreenshot` corren ANTES del branch `if` | Observability uniforme — un 502 sin screenshot en logs sería peor para forensics. El takeScreenshot side-effect es idempotente (sólo escribe a `storage/artifacts/`). |
| Local-04-03 | Comentario JSDoc-style multi-línea (4 líneas `//`) en el handler | Rationale inline para lector futuro: por qué 502 vs 500, qué significa `code: sede_refresh_failed`. Más visible que un link a CONTEXT.md. |

## Deviations from Plan

**None** — plan ejecutado exactamente como escrito. Las 2 ediciones aplicadas verbatim. Todos los acceptance criteria pasan.

## Deferred Issues

**None** — el plan estaba acotado a 2 ediciones mecánicas. Sin issues encontrados durante ejecución.

## What's Next

El robot está listo end-to-end **a nivel código**:

- Plan 01 ✅ (shipped commits `e7a2531` + `5637a87`): export de `SedeRefreshFailedError`, `Fingerprint`, `fingerprintsEqual`, constantes `SUCURSAL_REFRESH_TIMEOUT_MS`/`SUCURSAL_REFRESH_POLL_MS`.
- Plan 02 (paralelo con este, otra waveline): adapter implementa `captureFingerprint()` + `waitForSucursalRefresh()` helpers + integra en loop de scrapeAppointments + re-throw selectivo del try/catch existente.
- Plan 03: wire el throw real de `SedeRefreshFailedError` desde el loop del adapter cuando 3 intentos se agotan.
- Plan 04 ✅ (este SUMMARY): handler Express mapea el error a HTTP 502 con body discriminado.

**Próximo paso pendiente:** Plan 05 deploy a Railway + smoke E2E real (3 corridas consecutivas, validación `ratio=1.0` + `overlap=0`) cierra el standalone. Sin push hasta entonces (`code-changes.md` Regla 1 push diferido por instrucción del orquestador).

## Self-Check: PASSED

**Files verified to exist:**
- `godentist/robot-godentist/src/api/server.ts` — FOUND (modified)

**Commits verified to exist:**
- `2f577a8` — FOUND (feat(godentist-scraper-table-refresh-guard-04): mapear SedeRefreshFailedError a HTTP 502 en Express handler)

**Greps verified:**
- All 10 acceptance grep checks pass (documented above under "Verifications Performed").

**Hooks verified:**
- TypeScript `tsc --noEmit` exits 0.
- Pre-commit hooks (si los hay) corrieron sin errores en el commit `2f577a8`.

**No deletions:**
- `git diff --diff-filter=D HEAD~1 HEAD` retorna sin output → cero archivos borrados.
