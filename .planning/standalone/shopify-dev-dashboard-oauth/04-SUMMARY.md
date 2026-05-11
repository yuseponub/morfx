---
phase: shopify-dev-dashboard-oauth
plan: 04
title: Server action startShopifyOauth (entry point del flow OAuth)
subsystem: shopify-oauth
tags: [shopify, oauth, server-action, auth-gate, regla-3, d-15, pitfall-3, pitfall-10]
dependency_graph:
  requires:
    - "src/lib/shopify/oauth.ts (Plan 03 — async signStateJwt + buildAuthorizeUrl + generateNonce)"
    - "src/lib/shopify/connection-test.ts (existente — normalizeShopDomain)"
    - "src/lib/supabase/server.ts (existente — createClient)"
    - "next/headers (cookies API)"
    - "process.env.NEXT_PUBLIC_APP_URL (UNICA env var leida en este archivo, no es secret)"
  provides:
    - "src/app/actions/shopify-oauth.ts (170 lineas, 1 export) — entry point del flow OAuth (UI Plan 06 lo llama)"
    - "startShopifyOauth({ shopDomain }) → { success: true, redirectUrl } | { success: false, error }"
  affects:
    - "Plan 06 (UI shopify-form.tsx) — la UI llamara startShopifyOauth en click 'Conectar' y hara window.location.href = result.redirectUrl"
    - "Plan 05 (callback route) — recibira el state JWT firmado aqui con payload { workspaceId, userId, nonce }"
tech-stack:
  added: []
  patterns:
    - "Auth gate triple copy de saveShopifyIntegration (auth.getUser + cookie morfx_workspace + workspace_members.role === 'owner')"
    - "Defense in depth domain validation: normalizeShopDomain + STRICT regex /^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$/ (Pitfall 3)"
    - "D-15 OVERRIDE: cero process.env.SHOPIFY_*; secrets accedidos implicitamente via async helpers de oauth.ts"
    - "Envelope { success, error } match convencion del proyecto (NO { ok }) — espejo de saveShopifyIntegration"
    - "Error handling: 3 try/catch (state JWT sign, NEXT_PUBLIC_APP_URL, buildAuthorizeUrl) con mismo mensaje generico para no leak qual env var falta (T-shopify-oauth-17)"
key-files:
  created:
    - "src/app/actions/shopify-oauth.ts (170 lineas)"
  modified: []
decisions:
  - "D-08 (state JWT 10min) materializada: signStateJwt({ workspaceId, userId, nonce: generateNonce() }) — payload self-contained para callback cross-origin"
  - "D-15 (credenciales en platform_config) materializada: el server action NO toca process.env.SHOPIFY_*; el clientId+stateSecret se leen via async helpers de oauth.ts que internamente await getShopifyOAuthConfig() (Plan 02 fail-CLOSED)"
  - "Pitfall 3 (shop injection) defendido con: normalizeShopDomain + STRICT regex anchored ^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$ aplicados ANTES de pasar 'shop' a buildAuthorizeUrl"
  - "Pitfall 10 (redirect_uri mismatch) defendido: const redirectUri = `${NEXT_PUBLIC_APP_URL}/api/integrations/shopify/oauth/callback` SIN trailing slash — debe matchear EXACTO el Dev Dashboard"
  - "T-shopify-oauth-15 (Owner gate) materializada: triple gate identico a saveShopifyIntegration (lines 184-210) — sin paths alternos"
  - "T-shopify-oauth-17 (info disclosure) defendida: 3 catch blocks retornan el mismo string generico 'Configuracion OAuth incompleta. Contacta al administrador.' + console.error con shop+message (server-side only)"
metrics:
  duration_minutes: 11
  completed_date: 2026-05-12
  tasks_completed: 2
  commits: 2
  files_changed: 1
---

# Plan 04: Server Action `startShopifyOauth` — Summary

Crea `src/app/actions/shopify-oauth.ts` (170 lineas, 1 export) — el server action que la UI llama al click "Conectar con Shopify". Valida auth + Owner + dominio, firma el state JWT, construye la authorize URL, y la retorna al cliente para que haga `window.location.href = redirectUrl` (cross-origin).

Este es el **lado confiable** del OAuth — donde verificamos identidad y workspace ANTES de mandar al usuario a Shopify. Single source of truth para el dominio inicial: todo lo que llegue al callback (Plan 05) se validara contra el state JWT firmado aqui.

## What Was Built

| Seccion del archivo                | Exports / Constantes                                        | Lineas (approx) | Decisiones materializadas |
| ---------------------------------- | ----------------------------------------------------------- | --------------- | ------------------------- |
| Header doc + imports               | (cookies, normalizeShopDomain, oauth.ts trio, createClient) | 1-37            | D-15, Pitfall 3, P10      |
| `SHOP_DOMAIN_REGEX` constant       | `SHOP_DOMAIN_REGEX` (privado)                               | 39-50           | Pitfall 3                 |
| `startShopifyOauth` action         | `startShopifyOauth` (default export del modulo)             | 52-170          | D-08, D-15, T-15, T-17    |

### Function signature (verbatim del archivo)

```typescript
export async function startShopifyOauth(input: { shopDomain: string }): Promise<
  | { success: true; redirectUrl: string }
  | { success: false; error: string }
>
```

### Flow del action (top → bottom)

1. **Auth gate triple** (copy verbatim de `saveShopifyIntegration` lines 184-210):
   - `await supabase.auth.getUser()` → si null retorna `{success:false, error:'No autenticado'}`
   - `cookieStore.get('morfx_workspace')?.value` → si missing retorna `{success:false, error:'No hay workspace seleccionado'}`
   - `workspace_members.role === 'owner'` para `workspace_id+user_id` → si no owner retorna `{success:false, error:'Solo el Owner puede conectar integraciones'}`

2. **Validacion del dominio** (defense in depth — Pitfall 3):
   - `normalizeShopDomain(input.shopDomain)` (existing helper) → retorna `'xxx.myshopify.com'` o null
   - Si null → `{success:false, error:'Dominio invalido. Debe ser tu-tienda.myshopify.com'}`
   - `SHOP_DOMAIN_REGEX.test(shop)` (anchored `^[a-z0-9][a-z0-9-]*\.myshopify\.com$`) → si fail mismo error

3. **State JWT signing** (D-08):
   - `await signStateJwt({ workspaceId, userId: user.id, nonce: generateNonce() })`
   - Try/catch: si throws (fail-CLOSED helper, Plan 02 throws si stateSecret <32 chars) → log con shop+message + retorna error generico

4. **Build redirect URI** (Pitfall 10):
   - `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/oauth/callback` (sin trailing slash)
   - Si NEXT_PUBLIC_APP_URL no esta seteado → log + error generico

5. **Build authorize URL** (Plan 03 helper):
   - `await buildAuthorizeUrl({ shop, state, redirectUri })`
   - Try/catch: si throws (clientId missing) → log + error generico

6. **Return success**: `{ success: true, redirectUrl }` — la UI hace `window.location.href = redirectUrl` (cross-origin → NO router.push).

## Tasks Completed

### Task A — Skeleton + auth gate + validacion del dominio (commit `d2f01f7`)

- File header doc completo (D-15 explicito + Pitfall 3 explicito + Regla 3 explicito).
- Imports: `cookies` from `next/headers`, `normalizeShopDomain` from connection-test, `buildAuthorizeUrl + generateNonce + signStateJwt` from oauth, `createClient` from supabase server.
- `SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/` privado al modulo + JSDoc completo (acepta dominios que empiezan con digito como `6xvhnx-1v.myshopify.com` per Assumption A5).
- Triple auth gate: copy literal de saveShopifyIntegration lines 184-210 (mismos error strings en espanol).
- Domain validation: `normalizeShopDomain` + STRICT regex; ambos errores con mismo mensaje user-facing para no leak detalle.
- Skeleton retornaba placeholder `{success:false, error:'OAuth start: state + authorize URL pending (Plan 04 Task B)'}` para mantener typecheck verde antes de Task B.

### Task B — State JWT + authorize URL construction (commit `8a1bf7f`)

- Sign state JWT con `await signStateJwt({ workspaceId, userId: user.id, nonce: generateNonce() })`.
  - Try/catch: catchea cualquier throw del helper (e.g. `getShopifyOAuthConfig()` throws si stateSecret missing/weak), loggea con `{ message, shop }` server-side, retorna error generico al cliente.
- Build redirect URI con `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/oauth/callback` (la UNICA env var leida en este archivo — publica, no es secret).
  - Defensiva: si `NEXT_PUBLIC_APP_URL` no esta seteado, loggea + retorna error generico.
- Build authorize URL con `await buildAuthorizeUrl({ shop, state, redirectUri })`.
  - Try/catch: idem; log + error generico al cliente.
- Return `{ success: true, redirectUrl }`.

**Diseno T-shopify-oauth-17 (info disclosure):** los 3 catch blocks retornan el mismo string `'Configuracion OAuth incompleta. Contacta al administrador.'` para que el atacante no pueda inferir cual env var/credencial falta del mensaje de error visible. El detalle queda solo en el server log (Vercel logs).

## Decisions / Deviations

**Cero deviations contradictorias** vs el plan/contexto. Notas que afinan (no contradicen):

1. **`signStateJwt` payload signature:** el critical_constraints #6 del prompt menciono `{ workspaceId, userId, shopDomain, nonce }`, pero el `StatePayload` real exportado por Plan 03 (verificado en `src/lib/shopify/oauth.ts:52-56`) tiene solo `{ workspaceId, userId, nonce }` — `shopDomain` NO esta en el payload. La implementacion sigue el contract real de Plan 03 (verbatim del 03-SUMMARY.md hand-off section). Si Plan 05 necesita el shop, lo recibe como query param de Shopify (que llega autenticado por el HMAC HEX, ver Plan 03 Task B).

2. **Plan tenia 1 task; commits son 2 (A + B).** El plan-level `<tasks>` block enumera 1 task (Task 1: crear el archivo). El prompt `<implementation_sequence>` pide 2 commits + 1 SUMMARY commit (skeleton+gate / state+url / summary). Seguimos el prompt — atomicidad mas fina, mismo resultado funcional. Los dos commits suman el contenido de Task 1 del plan.

3. **`auth.getUser` aparece 2x en grep.** El segundo match es el comentario del JSDoc del header (`'use server' action ... supabase.auth.getUser()`). La invocacion real ocurre 1 sola vez en linea 71. Documentado aqui para que self-check no genere falsa alarma.

## Hand-off

### Plan 05 — `src/app/api/integrations/shopify/oauth/callback/route.ts` (route handler)

Plan 04 firma el state JWT con payload `{ workspaceId, userId, nonce }`. Plan 05 lo verifica con `verifyStateJwt(state)` (Plan 03 export async) y obtiene la misma estructura. NO hay `shopDomain` en el state — el shop llega como query param de Shopify y se valida via HMAC HEX (Plan 03 `verifyOauthCallbackHmac`).

Ejemplo de uso del state payload en Plan 05:

```typescript
const statePayload = await verifyStateJwt(state) // throws → fail('state_expired')
// statePayload.workspaceId  ← usar para upsertShopifyIntegration({ workspaceId, ... })
// statePayload.userId       ← usar para re-verify Owner role en el callback (T-shopify-oauth-15 doble check)
// statePayload.nonce        ← future-proof para replay-blacklist (no implementado en V1)
```

### Plan 06 — UI `shopify-form.tsx`

```typescript
'use client'
import { startShopifyOauth } from '@/app/actions/shopify-oauth'

const handleConnect = async () => {
  const result = await startShopifyOauth({ shopDomain })
  if (!result.success) {
    toast.error(result.error)
    return
  }
  // CROSS-ORIGIN — usar window.location.href, NO router.push
  window.location.href = result.redirectUrl
}
```

**Importante para Plan 06:**
- El envelope es `{ success, error | redirectUrl }` (NO `{ ok }`) — match convencion del proyecto.
- En exito, `redirectUrl` apunta a `https://*.myshopify.com/admin/oauth/authorize?...` (cross-origin) — usar `window.location.href`, jamas `router.push` (que asume same-origin).
- Los mensajes de error retornados son ya traducidos al espanol; mostrarlos directo en toast.

### Para Vercel deployment

NO requiere migraciones. NO requiere seteo nuevo de env vars (`NEXT_PUBLIC_APP_URL` ya existe; los secrets Shopify viven en `platform_config`, no en env, per D-15).

## Self-Check: PASSED

```bash
# files exist
test -f src/app/actions/shopify-oauth.ts                              → EXISTS

# success_criteria gates from prompt:
[1] grep -cE "process\.env\.SHOPIFY_(CLIENT|OAUTH)" shopify-oauth.ts  → 0    OK (D-15 OVERRIDE)
[2] grep -c "process.env.NEXT_PUBLIC_APP_URL" shopify-oauth.ts        → 1    OK (unica env var permitida)
[3] grep -c "from '@/lib/shopify/oauth'" shopify-oauth.ts             → 1    OK
[4] grep -c "from '@/lib/shopify/connection-test'" shopify-oauth.ts   → 1    OK (normalizeShopDomain)
[5] grep -cF "/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/" shopify-oauth.ts → 1   OK (Pitfall 3 STRICT)
[6] head -1 shopify-oauth.ts                                          → 'use server'   OK
[7] grep "^export async function startShopifyOauth"                   → 1    OK (envelope per spec)
[8] grep "role !== 'owner'" shopify-oauth.ts                          → 1    OK (Owner gate)
[9] grep "'morfx_workspace'" shopify-oauth.ts                         → 1    OK (cookie)
[10] grep -c "auth.getUser()" shopify-oauth.ts                        → 2    OK (1 invocation + 1 JSDoc comment)
[11] grep -cE "success: (true|false)" shopify-oauth.ts                → 11   OK (envelope)
[12] grep -cE "\{ ok:" shopify-oauth.ts                               → 0    OK (no { ok } envelope)
[13] grep -c "/api/integrations/shopify/oauth/callback" shopify-oauth.ts → 1 OK (no trailing slash version)
[14] grep -c "callback/" shopify-oauth.ts                             → 0    OK (no trailing slash, Pitfall 10)
[15] grep -cE "from\('integrations'\)" shopify-oauth.ts               → 0    OK (Regla 3 — no DB writes here)

# typecheck (no errores nuevos en shopify-oauth.ts)
npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "src/app/actions/shopify-oauth\.ts"
                                                                       → 0    OK

# unrelated files NO modified
git diff --stat c695539..HEAD                                          → 1 file (only shopify-oauth.ts) OK
git status --short                                                     → clean OK

# commits — 2 atomic en orden A → B
git log --oneline c695539..HEAD
8a1bf7f feat(shopify-oauth-04): state JWT signing + authorize URL construction
d2f01f7 feat(shopify-oauth-04): startShopifyOauth server action skeleton + auth gate
```

Todos los gates pasan. Plan 04 listo para Plans 05 (callback route — Wave 2) y 06 (UI — Wave 3 si aplica).
