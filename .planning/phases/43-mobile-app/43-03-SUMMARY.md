---
phase: 43-mobile-app
plan: 03
name: mobile-api-skeleton
subsystem: mobile-api
tags: [mobile, api, nextjs, supabase-auth, zod, contract]
requires: [43-01, 43-02]
provides:
  - src/app/api/mobile/_lib/auth.ts
  - src/app/api/mobile/_lib/errors.ts
  - src/app/api/mobile/_lib/rate-limit.ts
  - src/app/api/mobile/health/route.ts
  - src/app/api/mobile/me/route.ts
  - src/app/api/mobile/workspaces/route.ts
  - shared/mobile-api/schemas.ts
affects: [43-04, 43-06, 43-07, 43-08, 43-09, 43-10a, 43-10b, 43-11, 43-12, 43-13, 43-14, 43-15]
tech-stack:
  added: []
  patterns:
    - Bearer JWT + x-workspace-id header pair para auth mobile
    - Shared zod schemas como contrato tipado web <-> mobile (sin alias)
    - toMobileErrorResponse como funnel unico de errores tipados
key-files:
  created:
    - src/app/api/mobile/_lib/auth.ts
    - src/app/api/mobile/_lib/errors.ts
    - src/app/api/mobile/_lib/rate-limit.ts
    - src/app/api/mobile/health/route.ts
    - src/app/api/mobile/me/route.ts
    - src/app/api/mobile/workspaces/route.ts
    - shared/mobile-api/schemas.ts
  modified:
    - tsconfig.json
decisions:
  - Routing bajo src/app/api/mobile/ en lugar de un subdominio o repo separado (reusar middleware, env vars, deploy Vercel)
  - Autenticacion con Authorization Bearer + header x-workspace-id (no cookies, porque RN maneja tokens manualmente)
  - Shared schemas via relative path (sin alias @shared) para que apps/mobile pueda importarlos sin tsconfig paths compartido
  - rate-limit.ts es un stub no-op con la firma final para que los call sites ya paguen el await
metrics:
  duration: ~25min
  completed: 2026-04-09
---

# Phase 43 Plan 03: Mobile API Skeleton Summary

**One-liner:** Skeleton HTTP del mobile-API dentro de Next.js: helpers de auth/error/rate-limit, contrato Zod compartido y tres rutas read-only (health/me/workspaces).

## Routing Decision

Las rutas del mobile viven bajo `src/app/api/mobile/*` dentro del mismo proyecto Next.js que sirve la web. No hay subdominio, subproyecto ni repo aparte.

**Por que aqui y no en otro lado:**

- Reutiliza el middleware existente, env vars, CI/CD y deploy a Vercel (un solo push despliega web + mobile-API).
- Evita un segundo proyecto Supabase o CORS custom entre apps/mobile y un backend separado.
- Todas las mutaciones pueden seguir pasando por `src/lib/domain/` sin cruzar fronteras de paquete (Regla 3).
- `apps/mobile/` es puro cliente; todo el backend sigue en el monorepo Next.

**Consecuencia:** el mobile-API hereda el cold-start de Vercel serverless. Health check existe justamente para que la app mida esa latencia al arrancar y la muestre en el loading screen si es alta.

## Auth Header Format

Cada request autenticada al mobile-API DEBE incluir exactamente dos headers:

```
Authorization: Bearer <supabase-jwt>
x-workspace-id: <uuid-del-workspace-activo>
```

- **Authorization Bearer:** el JWT obtenido por la mobile desde `supabase.auth.getSession()`. El helper `requireMobileAuth` valida el token via `admin.auth.getUser(token)` (no via cookies — RN no guarda sesiones Supabase en cookies HTTP).
- **x-workspace-id:** el workspace activo seleccionado por el usuario en el workspace-switcher. Se valida que el user sea miembro de ese workspace con un query filtrado por `user_id` Y `workspace_id` (regla de seguridad multi-workspace anotada en MEMORY.md — `.single()` MUST filter by workspace_id).

En cualquier fallo (header ausente, malformado, JWT invalido, o user no es miembro), el helper lanza `MobileAuthError` y la ruta responde `401 { error: "unauthorized" }` via `toMobileErrorResponse`.

## Shared Zod Schemas: Como los importa Mobile

El archivo `shared/mobile-api/schemas.ts` vive en la raiz del repo y es **puro Zod** — su unico import es `import { z } from 'zod'`. No trae Next, Supabase, ni nada Node-only.

**Desde la web (src/app/api/mobile/...):**
```ts
import { HealthResponseSchema } from '../../../../../shared/mobile-api/schemas'
```
Relative path con 5 `..` porque no hay alias `@/shared`. Preferi no agregar alias para que el mobile lo pueda importar con la misma forma de path traversal (apps/mobile no comparte tsconfig paths con el web).

**Desde apps/mobile/** (planes siguientes):
```ts
import { HealthResponseSchema } from '../../shared/mobile-api/schemas'
```
Depth exacto depende de donde se importe dentro de apps/mobile/, pero el punto es que solo necesita un relative path — cero configuracion extra.

**Para que tsc tipee el archivo:** agregue `shared/**/*.ts` al `include` de `tsconfig.json`. Sin esa entrada, los route handlers no podrian importarlo porque la version incluida por el wildcard `**/*.ts` se resuelve relativa a `baseUrl`, que es el root, y el archivo queda dentro del proyecto pero tsc no lo tipeaba explicitamente. Lo explicite por si alguien mueve el baseUrl en el futuro.

## Endpoints Shipped

| Metodo | Ruta | Auth | Response (Zod) | Proposito |
|--------|------|------|----------------|-----------|
| GET | `/api/mobile/health` | No | `HealthResponseSchema` = `{ ok: true, ts: string }` | Connectivity probe en cold start |
| GET | `/api/mobile/me` | Si | `MeResponseSchema` = `{ user, memberships: Membership[] }` | Bootstrap inicial post-login |
| GET | `/api/mobile/workspaces` | Si | `WorkspacesResponseSchema` = `{ workspaces: Workspace[] }` | Workspace switcher refresh |

Las tres:
- Usan `export const dynamic = 'force-dynamic'` (nunca cacheadas por Next).
- Devuelven header `Cache-Control: no-store`.
- Pasan por `toMobileErrorResponse` en el catch para normalizar error envelope.
- Read-only — cero mutaciones, cero llamadas a `src/lib/domain/` en este plan.

## Deviations from Plan

### Rule 2 - Missing Critical: tsconfig.json no incluia `shared/`

- **Found during:** Task 2 (shared schemas)
- **Issue:** El archivo `tsconfig.json` tenia `include: ["**/*.ts", ...]` pero sin entrada explicita para `shared/`. Ese wildcard resolvia relativo al root del proyecto y funcionaba, pero era fragil: si alguien mueve `baseUrl` o agrega `rootDir` a futuro, los imports desde `shared/mobile-api/schemas` romperian silenciosamente.
- **Fix:** Agregar `"shared/**/*.ts"` explicitamente al array `include` de `tsconfig.json`. Cambio minimo (1 linea), sin impacto en nada mas.
- **Files modified:** `tsconfig.json`
- **Commit:** incluido en el commit `feat(43-03): add shared mobile api zod schemas`

### Otras notas

- Durante Task 2 hubo un lio de git (hice un commit que accidentalmente incluyo modificaciones pre-existentes de Phase 42.1 en `src/inngest/functions/agent-production.ts` y `src/lib/observability/collector.ts` porque ya estaban modificadas en el working tree al iniciar el plan). Lo detecte en `git show --stat` post-commit, hice `git reset --soft HEAD~1`, unstageei los archivos ajenos, y recommit solo con `shared/mobile-api/schemas.ts` y `tsconfig.json`. En paralelo un agente de 42.1 avanzo con sus propios commits; mi commit final de Task 2 aterriza limpio encima de lo mas reciente de main.
- **No aplique Rule 4 (architectural):** no hizo falta ningun cambio estructural, la decision de routing bajo `src/app/api/mobile/` estaba locked en el plan.

## Type-check Status

`npx tsc --noEmit` scoped a `src/app/api/mobile/*` y `shared/mobile-api/*` pasa limpio. El unico error que aparece en el proyecto completo es `apps/mobile/src/lib/db/outbox.ts` faltando `../api/client`, **pre-existente** del Plan 43-05 que corre en paralelo y que crea ese cliente en una tarea posterior. No es causado por este plan.

Full `npm run build` no se corrio — por STATE.md hay un outage de fonts Geist en WSL que bloquea el build local. Verificacion final via Vercel deploy cuando el orchestrator haga push de la wave.

## Next Phase Readiness

Lo que este plan habilita:

1. **Plan 43-04 (o siguientes Wave 3):** Puede agregar endpoints POST de conversations/messages reusando `requireMobileAuth` + `toMobileErrorResponse` sin reescribir auth.
2. **apps/mobile (Plan 43-06 en adelante):** Ya puede importar `shared/mobile-api/schemas` via relative path y llamar `/api/mobile/health` como smoke test de conectividad.
3. **Rate limiter real:** Cuando exista, swap directo del contenido de `_lib/rate-limit.ts` sin tocar call sites (la firma es estable).

**Concerns / deuda:**

- Ningun route llama a `rateLimitMobile` todavia — el stub existe pero no hay call sites. Lo hara el primer plan que introduzca un POST (escritura) y lo justifique. Razon: rate limiting en lecturas read-only sin tokens de escalado no vale el redondeo todavia.
- Validacion de formato UUID del `x-workspace-id` header es un length check superficial (`>= 10`). El query a `workspace_members` es el validador real — si el uuid es invalido, la DB devuelve fila vacia y termina en 401. Aceptable porque no hay riesgo de SQL injection (usa `.eq()` parametrizado).
