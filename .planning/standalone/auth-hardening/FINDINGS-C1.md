# FINDINGS-C1 — Reproducción y bisección de C-1 (Wave 0, T0.2)

**Fecha:** 2026-06-10
**Método:** harness Playwright (`e2e/auth.spec.ts` + script temporal `scripts/_audit-c1-capture.mjs`) contra dev local (3020) + Supabase prod, con logging temporal revertible en `middleware.ts`, `(dashboard)/layout.tsx` y `app/actions/workspace.ts`.
**Veredicto:** C-1 reproducido **3/3**. Causa raíz **confirmada y refinada** — el error literal es **`AuthSessionMissingError: Auth session missing!`** desde un guard `getUser()` del árbol `(dashboard)`, **NO** `Invalid Refresh Token: Already Used` en `getClaims()` como hipotetizaba el RESEARCH.

---

## Reproducción (3/3)

Cada intento: usuario confirmado vía admin → login UI OK → `/create-workspace` → submit. Resultado idéntico las 3 veces:

| Señal | Valor observado |
|---|---|
| URL final | `/login` |
| Cookie `sb-*-auth-token` | **WIPED** |
| Workspace en DB (`owner_id`) | **0 filas** |
| Respuesta del submit | `303 POST` con `x-action-redirect=/login;push` + `x-action-revalidated=1` |

(El `303` de server-action de Next NO usa header `Location` estándar; el target viaja en `x-action-redirect`, y Next **descarta el query string** dejando solo el pathname — por eso el browser aterriza en `/login` "pelado".)

---

## Bisección — qué SÍ y qué NO falla

### `getClaims()` (identidad server-side) es ROBUSTO — refuta la hipótesis del RESEARCH
Logging fs en `getAuthUserId()` (`app/actions/workspace.ts`) durante los 3 intentos:

```
getClaims sub=2f0537b0 error=none   (×11 intento 1)
getClaims sub=c74991c1 error=none   (×11 intento 2)
getClaims sub=b836c0ed error=none   (×11 intento 3)
```

**33/33 llamadas a `getClaims()` exitosas, sub válido, `error=none`.** `getClaims()` hace verificación local del JWT (ES256 contra JWKS cacheado, sin red, sin refresh) y por eso **nunca** dispara el "Invalid Refresh Token: Already Used" que el RESEARCH §1 daba por causa. La identidad server-side vía `getClaims()` está sana.

### La acción `createWorkspace` NUNCA corre su cuerpo de mutación
En los 3 intentos del flujo browser **no aparece** la línea de trace `createWorkspace RPC ...` **ni** `'No autenticado'`. Combinado con `ws=0` en DB: el server action es interceptado/abortado **antes** de llegar al `rpc('create_workspace_with_owner')`. Por eso no se crea nada.

### El error literal: `AuthSessionMissingError: Auth session missing!`
Captura directa vía `curl` a una ruta protegida **sin sesión** (aísla el guard del árbol dashboard):

```
GET /crm/pedidos  (sin cookies)
→ 307  location: /login?c1src=layout&c1err=AuthSessionMissingError%3AAuth%20session%20missing!
```

`c1src=layout` ⇒ el redirect proviene de un guard `getUser()` del árbol `(dashboard)` (instrumentado en `layout.tsx`). `c1err` ⇒ el error literal de Supabase es **`AuthSessionMissingError: Auth session missing!`** (getUser no encuentra access token en el contexto de la request).

En el flujo C-1 real (server action) el `x-action-redirect=/login` es **plano** (sin `c1src`), lo que coincide con `create-workspace/page.tsx` — que tiene `if (!user) redirect('/login')` **sin instrumentar** — re-renderizándose durante la revalidación del action (`x-action-revalidated=1`). Mismo primitivo `getUser()`, mismo error.

---

## Mecanismo confirmado (causa raíz)

1. Submit del form → server action `createWorkspace` (POST a `/create-workspace`).
2. La identidad por `getClaims()` está disponible y es válida (verify local del JWT). **Pero** el ciclo del action dispara una **revalidación/re-render** del árbol `(dashboard)` (`x-action-revalidated=1`; el form además hace `router.refresh()`).
3. Durante ese re-render, un guard basado en **`getUser()`** (`create-workspace/page.tsx` y/o `(dashboard)/layout.tsx`) corre en un contexto donde **el access token NO está propagado en las cookies de la request** → `getUser()` lanza **`AuthSessionMissingError: Auth session missing!`** → `redirect('/login')`.
4. El redirect se emite como `x-action-redirect=/login` (query descartado por Next), el `setAll` de la sesión purgada **borra la cookie** `sb-*-auth-token`, y la mutación del workspace **nunca commitea** (`ws=0`).

**Raíz de diseño:** el código mezcla **dos primitivas de identidad**:
- `getClaims()` (local, sin red, sin refresh) en los server actions — **sano**.
- `getUser()` (red a GoTrue, refresca/rota token) en **3 guards de render**: `middleware.ts`, `(dashboard)/layout.tsx`, `create-workspace/page.tsx` — **es el que falla** con `AuthSessionMissingError` en el ciclo action→revalidate.

---

## Implicación para el fix (Wave 1)

Confirma y **refuerza** el "Fix canónico" del RESEARCH §1, con evidencia dura:
- **Eliminar `getUser()` del camino de render** (layout + create-workspace page + middleware) y resolver identidad **siempre con `getClaims()`** — probado robusto 33/33.
- **Middleware = único punto de refresh**, copiando TODAS las cookies de `supabaseResponse` en cualquier `NextResponse.redirect` (hoy el redirect a `/login` NO las copia → contribuye al wipe).
- `createWorkspace`: `revalidatePath('/', 'layout')` + asegurar que el re-render no contenga un guard `getUser()` que aborte el ciclo.
- `AuthProvider` cliente con `onAuthStateChange → router.refresh()` para sincronizar token ↔ Server Components.

**Gate de verificación (Regla 6):** el harness `e2e/auth.spec.ts` ya reproduce C-1 3/3 (rojo) y cubre el baseline verde (login, confirmación, recovery, invitaciones). Tras el fix, los 3 intentos de C-1 deben pasar a verde **sin** romper a los usuarios existentes.

---

## Logging temporal — REVERTIDO

Toda la instrumentación `[AUDIT-C1 temp]` (middleware, layout, workspace action) y el script `scripts/_audit-c1-capture.mjs` fueron **revertidos/eliminados** tras esta captura. El harness permanente es `e2e/auth.spec.ts`.
