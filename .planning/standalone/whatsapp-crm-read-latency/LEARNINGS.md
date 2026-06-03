# Phase whatsapp-crm-read-latency - Learnings

**Fecha:** 2026-06-03
**Duración:** ~1 sesión (7 plans, 5 olas, ejecución secuencial en main)
**Plans ejecutados:** 7 (01-07)
**Verificación:** VERIFICATION.md 8/8 PASS · 3 checkpoints human-verify APROBADOS en prod
**HEAD final:** `078598fd`

---

## Resumen

Fix de latencia de lecturas (inbox + ojito) del dashboard. Root cause: ~190 `auth.getUser()` redundantes (round-trip a GoTrue ~150-300ms c/u) + serialización de Server Actions + ausencia de caché. NO era Redis ni DB. Solución en 4 capas:
- **Capa 1 (auth):** `getRequestAuth()` — verify JWT local ES256 vía `supabase.auth.getClaims()`, cacheado por-request con React `cache()`. Reemplaza el round-trip a GoTrue en los 42 archivos de `src/app/actions/`.
- **Capa 2 (ojito 5→1):** `getOrderDetailBundle(orderId)` — 1 auth + `Promise.all` real server-side de las 5 lecturas (antes 5 Server Actions serializadas desde el cliente).
- **Capa 3 (cache):** `unstable_cache` (Next Data Cache) por workspace para products/tags/pipelines + invalidación por `updateTag('ref:...:'+ws)` en mutaciones.
- **Capa 4 (inbox):** `useMessages` migrado a React Query (stale-while-revalidate) con Realtime puenteado vía `setQueryData` (NO refetch).

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| 4 deploys Vercel fallidos con `ERR_PNPM_OUTDATED_LOCKFILE` | El executor del Plan 01 instaló `@tanstack/react-query` con **npm** (`--legacy-peer-deps`), actualizando `package.json` + `package-lock.json` pero NO `pnpm-lock.yaml`. Vercel CI usa **pnpm** con `--frozen-lockfile`. | `pnpm install` regeneró `pnpm-lock.yaml`; verificado con `pnpm install --frozen-lockfile`; commit `b2457077`. | **Este repo usa pnpm, NUNCA npm.** Cualquier instalación de dependencia debe ser `pnpm add`. El executor asumió que `--legacy-peer-deps` con npm "es como instala el repo" (falso — coexiste un `package-lock.json` legacy committeado que confunde). Ver patrón abajo. |
| Migración naïve de `getActiveWorkspaceId`/`acceptInvitation` habría roto first-login | `getRequestAuth()` devuelve `null` cuando falta la cookie `morfx_workspace` — que es EXACTAMENTE la precondición del bootstrap (usuario aún sin workspace seleccionado). | Helper local `getAuthUserId(supabase)` con `getClaims()` (mismo verify local, sin acoplar a la cookie). Plans 05 y 06 lo aplicaron a workspace.ts e invitations.ts. | Antes de reemplazar `auth.getUser()` por `getRequestAuth()`, verificar si la función corre ANTES de seleccionar workspace. Si sí → usar `getAuthUserId` local, no `getRequestAuth`. |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| `getClaims()` local (ES256) en vez de `getUser()` | `getUser()` (round-trip a GoTrue) | El JWT de Supabase ya es ES256 verificable localmente; elimina ~150-300ms por llamada × ~190 sitios. |
| Ejecución SECUENCIAL en main (no worktrees) | Worktrees paralelos (config `parallelization: true`) | El CLI `gsd-sdk` que automatiza el merge-back de worktrees NO está instalado (solo `gsd-tools.cjs` legacy). Secuencial en main = más seguro, coincide con el flujo "trabajo directo en main, push tras cada plan", y permite surfacing limpio de los 3 checkpoints `autonomous:false`. |
| Helper local `getAuthUserId` para contextos de bootstrap | Forzar `getRequestAuth` en todos lados para hitear grep=0 | Correctitud > métrica de grep. Forzar habría roto first-login/accept-invitation. |
| Pre-validar `pnpm build` local antes de cada push tras el incidente | Confiar en `tsc --noEmit` (lo que corren los executors) | `tsc --noEmit` NO detecta fallos de install/lockfile ni de `next build`. Tras 4 deploys rotos, correr `pnpm build` local (exit 0) antes de pushear evitó más fallos. |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| Executor (npm) | Vercel CI (pnpm `--frozen-lockfile`) | Lockfile desincronizado al agregar dependencia | Regenerar `pnpm-lock.yaml` con pnpm; commit dedicado |
| `getRequestAuth` (requiere cookie) | Rutas de bootstrap (sin cookie aún) | `null` espurio rompería first-login | Helper local `getAuthUserId` sin acoplar a cookie |
| Sesión paralela (Phase 38) | Esta fase | Commits `chore(38)`/`fix(38)` interleaved en main + meta-onboarding.ts/shopify-oauth.ts compartidos | Secuencial en main + fetch vs origin antes de push (fast-forward limpio cada vez); Read fresh de archivos compartidos antes de editar |

## Tips para Futuros Agentes

### Lo que funcionó bien
- **Pitfall 8 (caller verification)** en Plan 07: trazar el caller de cada `auth.getUser()` ANTES de migrar. Confirmó que las funciones de send (`sendMessage` etc.) que parecían tener callers de agente/inngest en realidad resuelven al **domain layer** (Regla 3), no a las Server Actions de UI — así ninguna migración tocó el runtime del agente (Regla 6 intacta).
- Pre-validar `pnpm build` local antes de push en olas grandes/sensibles.
- Spot-check del orquestador tras cada ola (grep counts + SUMMARY exists + sin `Self-Check: FAILED`) antes de pushear.

### Lo que NO hacer
- **NO usar npm** en este repo. Es pnpm. (`package-lock.json` legacy committeado es ruido — no significa que sea un repo npm.)
- **NO** hacer naive-swap de `auth.getUser()`→`getRequestAuth()` en funciones de bootstrap (corren sin cookie de workspace).
- **NO** confiar solo en `tsc --noEmit` para validar deployability — corre `pnpm build`.
- **NO** migrar funciones invocadas desde paths de agente/webhook/robot (no usan la cookie de UI).

### Patrones a seguir
- **Auth de request:** `getRequestAuth()` (UI con workspace seleccionado) vs `getAuthUserId(supabase)` local (contexto de bootstrap sin cookie).
- **Ojito/bundles:** colapsar N Server Actions serializadas del cliente en 1 action con `Promise.all` server-side + 1 auth.
- **Cache de referencia:** `unstable_cache` por workspace + `updateTag('ref:<entidad>:'+ws)` en cada mutación (Next 16: `revalidateTag` 1-arg deprecado → `updateTag`).
- **Realtime + React Query:** los handlers Realtime aplican deltas vía `queryClient.setQueryData`, NUNCA `refetch()` (Pitfall 7).

### Comandos útiles
```bash
# Verificar deuda de auth global
grep -rc "auth.getUser()" src/app/actions/

# Confirmar que getRequestAuth NO se filtró a paths no-UI (Regla 6)
grep -rl "getRequestAuth" src/lib/agents src/inngest src/app/api   # esperado: vacío

# Validar lockfile antes de push (este repo es pnpm)
pnpm install --frozen-lockfile && pnpm build   # exit 0 esperado

# fast-forward seguro vs sesión paralela
git fetch origin main && git rev-list --left-right --count origin/main...HEAD
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| `package-lock.json` legacy committeado coexiste con `pnpm-lock.yaml` (confunde a executors → causó el incidente npm) | Media | Eliminar `package-lock.json` del repo + `.gitignore` o documentar pnpm-only en CLAUDE.md |
| Warning pre-existente `MISSING_MESSAGE: DataDeletion (es)` en `next build` (ruta DataDeletion, no fatal) | Baja | i18n cleanup independiente |
| `middleware.ts` (`src/lib/supabase/middleware.ts`) sigue con `auth.getUser()` ×2 (gate D-04, intencionalmente byte-idéntico) | Baja | Solo si se necesita optimizar el middleware (fuera de scope D-04) |

## Notas para el Módulo

- El contrato de `getRequestAuth()` es `{ userId, email, workspaceId } | null`. `null` = no autenticado O sin cookie de workspace (preserva el comportamiento not-authed de los call sites: `[]` / `null` / `{ error }`).
- `getOrderDetailBundle(orderId)` es el único punto del ojito; su forma de retorno alimenta los mismos setState de `view-order-sheet.tsx`.
- Cualquier nueva mutación de products/tags/pipelines DEBE llamar `updateTag('ref:<entidad>:'+workspaceId)` o el cache quedará stale.
- Regla 6: este barrido tocó SOLO Server Actions de UI; el runtime de agente (somnio/godentist) y el robot Railway usan el domain layer directamente y quedaron intactos.

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentación.*
