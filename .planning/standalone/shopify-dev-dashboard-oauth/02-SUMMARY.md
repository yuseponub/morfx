---
phase: shopify-dev-dashboard-oauth
plan: 02
title: Domain layer integrations + getShopifyOAuthConfig fail-CLOSED helper
subsystem: shopify-oauth
tags: [domain-layer, regla-3, oauth, platform-config, shopify, integrations]
dependency_graph:
  requires:
    - "src/lib/domain/types.ts → DomainContext + DomainResult (Phase 16+)"
    - "src/lib/supabase/admin.ts → createAdminClient (Phase 0)"
    - "src/lib/domain/platform-config.ts → getPlatformConfig (Phase 44.1)"
    - "src/lib/shopify/types.ts → ShopifyConfig + ShopifyIntegration (Phase 11)"
    - "Migration 20260512000000_shopify_oauth_credentials.sql aplicada en prod (Plan 01 D-15)"
  provides:
    - "src/lib/domain/integrations.ts (3 funciones: upsert/get/delete) — single source of truth para mutaciones de tabla integrations type='shopify' (Regla 3, D-10)"
    - "src/lib/shopify/oauth-config.ts (getShopifyOAuthConfig + ShopifyOAuthConfig) — wrapper fail-CLOSED sobre platform_config para credenciales OAuth (D-15)"
    - "ShopifyConfig.granted_scope?: string opcional — drift detection futura (RESEARCH Open Question 8)"
    - "Barrel src/lib/domain/index.ts re-exporta el modulo nuevo (1 linea)"
  affects:
    - "Plan 03 (oauth.ts primitives) — consumira getShopifyOAuthConfig() para state JWT signing y exchangeCodeForToken"
    - "Plan 04 (server action startShopifyOauth) — consumira getShopifyOAuthConfig() para construir authorize URL con clientId"
    - "Plan 05 (callback route) — consumira getShopifyOAuthConfig() (HMAC + token exchange + state JWT verify) y upsertShopifyIntegration() para persistir el offline access token"
    - "Plan 06 (refactor delete path en src/app/actions/shopify.ts) — consumira deleteShopifyIntegration() en vez de adminSupabase.from('integrations').delete() directo"
tech-stack:
  added: []
  patterns:
    - "Regla 3 (Domain Layer): src/lib/domain/<entity>.ts es el unico modulo que muta la tabla; callers nunca tocan adminSupabase directo"
    - "Fail-CLOSED override sobre fail-OPEN default de getPlatformConfig: helpers de credenciales criticas THROW si la config esta incompleta"
    - "Cache reuse: aprovecha PLATFORM_CONFIG_TTL_MS (30s) sin doble capa (un solo runbook tras UPDATE en Supabase Studio)"
key-files:
  created:
    - "src/lib/domain/integrations.ts (229 lineas)"
    - "src/lib/shopify/oauth-config.ts (183 lineas)"
  modified:
    - "src/lib/shopify/types.ts (+6 lineas — granted_scope?: string)"
    - "src/lib/domain/index.ts (+1 linea — barrel re-export)"
decisions:
  - "D-10 (Regla 3) materializada: src/lib/domain/integrations.ts es el unico archivo del repo que tiene permiso de hacer .insert/.update/.delete sobre la tabla integrations type='shopify'"
  - "D-15 (credenciales en platform_config) materializada: getShopifyOAuthConfig wrappea getPlatformConfig con fail-CLOSED — cero process.env.SHOPIFY_* en oauth-config.ts"
  - "RESEARCH Open Question 8 acepted: granted_scope?: string es campo opcional del JSONB (NO migracion, NO breaking change para legacy shpat_)"
  - "preserve-on-update extendido: upsertShopifyIntegration preserva no solo los campos del plan original (default_pipeline_id, default_stage_id, enable_fuzzy_matching, product_matching, auto_sync_orders) sino tambien field_mappings y granted_scope (este ultimo cuando params.grantedScope === undefined)"
metrics:
  duration_minutes: ~25
  completed_date: 2026-05-11
  tasks_completed: 3
  commits: 3
  files_changed: 4
---

# Plan 02: Domain layer integrations + getShopifyOAuthConfig — Summary

Establece el aislamiento BD requerido por Regla 3 (D-10) y el lector fail-CLOSED de credenciales OAuth de Shopify desde `platform_config` (D-15). Sin estos dos modulos, Plan 05 (callback OAuth) tendria que importar `createAdminClient` directo y leer secrets desde env vars — ambas violaciones de constraints lockeadas.

## What Was Built

| Archivo                                 | Tipo     | Lineas | Proposito                                                                                                                          |
| --------------------------------------- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/domain/integrations.ts`        | NEW      | 229    | 3 funciones (`upsertShopifyIntegration`, `getShopifyIntegration`, `deleteShopifyIntegration`) — single source of truth (Regla 3)   |
| `src/lib/shopify/oauth-config.ts`       | NEW      | 183    | `getShopifyOAuthConfig()` lee `platform_config` con politica fail-CLOSED — THROWS si cualquier credencial falta                    |
| `src/lib/shopify/types.ts`              | MODIFIED | +6     | `ShopifyConfig.granted_scope?: string` opcional para drift detection futura                                                        |
| `src/lib/domain/index.ts`               | MODIFIED | +1     | Barrel re-exporta el modulo nuevo                                                                                                  |

## Tasks Completed

### Task A — `granted_scope?: string` en ShopifyConfig (commit `e11918f`)

- Campo opcional agregado al final de la interface (despues de `auto_sync_orders`).
- JSDoc explica el rol (drift detection RESEARCH Q8) y la compatibilidad con legacy `shpat_` (D-11 — undefined es valido).
- Cero impacto en consumers: `webhook-handler.ts`, `connection-test.ts`, `order-mapper.ts`, etc., compilan sin tocar (campo opcional).
- Sin migracion (JSONB acepta nuevos campos sin schema change).

### Task B — `src/lib/domain/integrations.ts` + barrel (commit `9215578`)

3 funciones publicas:

```typescript
export async function upsertShopifyIntegration(
  ctx: DomainContext,
  params: UpsertShopifyIntegrationParams
): Promise<DomainResult<ShopifyIntegration>>

export async function getShopifyIntegration(
  ctx: DomainContext
): Promise<DomainResult<ShopifyIntegration | null>>

export async function deleteShopifyIntegration(
  ctx: DomainContext
): Promise<DomainResult<void>>
```

Tambien exportada: `interface UpsertShopifyIntegrationParams { shopDomain, accessToken, apiSecret, shopName, grantedScope? }`.

**preserve-on-update logic (Task B clave):**

`upsertShopifyIntegration` lee la row existente (si la hay) y preserva los siguientes campos del config previo:

| Campo                   | Razon                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| `default_pipeline_id`   | Lo configura el operador en UI post-OAuth; OAuth no debe pisarlo        |
| `default_stage_id`      | Igual                                                                   |
| `enable_fuzzy_matching` | Toggle del operador                                                     |
| `product_matching`      | Toggle del operador (`'sku' \| 'name' \| 'value'`)                      |
| `auto_sync_orders`      | Toggle (presente solo si el operador lo escogio explicitamente alguna vez) |
| `field_mappings`        | Mapeo opcional Shopify → MorfX, configurado por operador                |
| `granted_scope`         | Solo cuando params.grantedScope === undefined (caller no lo trae)       |

Solo los campos OAuth (`shop_domain`, `access_token`, `api_secret`) y `name` overwritean siempre.

**Compliance:**

- 9 referencias a `ctx.workspaceId` (cada query filtra) — gate >=3 PASA.
- 5 referencias a `createAdminClient` (3 funciones + comentario header + import) — gate >=1 PASA.
- 9 referencias a `DomainContext`/`DomainResult` (imports + signatures + types) — PASA.
- NUNCA throws: cada funcion tiene try/catch externo que convierte cualquier exception a `{ success: false, error }`.
- NUNCA loguea `access_token` ni `api_secret` (T-shopify-oauth-06).
- Type-only imports de `DomainContext`/`DomainResult` (estilo del modulo).
- Barrel actualizado: `export * from './integrations'` con comentario `// Standalone shopify-dev-dashboard-oauth (D-10)`.

### Task C — `src/lib/shopify/oauth-config.ts` (commit `57e0fb4`)

```typescript
export interface ShopifyOAuthConfig {
  clientId: string
  clientSecret: string
  stateSecret: string
}

export const SHOPIFY_OAUTH_STATE_SECRET_MIN_LENGTH = 32

export async function getShopifyOAuthConfig(): Promise<ShopifyOAuthConfig>
```

**Politica fail-CLOSED — THROWS en estos casos:**

| Caso                                                            | Error                                                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Cualquier key null/undefined                                    | `[shopify-oauth] platform_config["KEY"] is missing. Apply migration ... and update ...`        |
| Cualquier key es no-string (number/boolean/object por miscast)  | `[shopify-oauth] platform_config["KEY"] has wrong JSONB type (expected string, got NUMBER)`    |
| Cualquier key es string vacio o solo whitespace                 | `[shopify-oauth] platform_config["KEY"] is empty.`                                             |
| `state_secret` con menos de 32 chars                            | `[shopify-oauth] platform_config["KEY"] is too short (N chars; min 32). Generate with openssl` |
| Cualquier key empieza con `<REPLACE_` (placeholder migracion)   | `[shopify-oauth] platform_config["KEY"] still holds the migration placeholder.`                |

**Implementacion:**

- Lecturas en paralelo (Promise.all de 3 `getPlatformConfig`).
- Reusa cache 30s built-in de `getPlatformConfig` — NO se anade segunda capa.
- Helper interno `ensureNonEmptyString(key, value)` centraliza checks 1-3.
- Mensajes de error incluyen el nombre de la key y la accion remediadora — sin exponer valores secretos.

**Gates verificados (post-commit):**

```bash
grep -E "process\.env\.SHOPIFY_(CLIENT|OAUTH)" src/lib/shopify/oauth-config.ts | wc -l  # → 0 ✓
grep -E "shopify_oauth_(client_id|client_secret|state_secret)" src/lib/shopify/oauth-config.ts | wc -l  # → 6 ✓
grep -c "getPlatformConfig" src/lib/shopify/oauth-config.ts  # → 8 ✓
grep -c "throw new Error" src/lib/shopify/oauth-config.ts  # → 5 ✓
```

## Commits

```
57e0fb4 feat(shopify-oauth-02): getShopifyOAuthConfig fail-CLOSED helper (D-15)
9215578 feat(shopify-oauth-02): domain layer para integrations table (Regla 3, D-10)
e11918f feat(shopify-oauth-02): add granted_scope optional field to ShopifyConfig
cb86e6e docs(shopify-dev-dashboard-oauth): D-15 credentials a platform_config (no env vars)  ← base
```

3 commits atomicos en orden Task A → B → C, todos con mensaje en espanol y `Co-Authored-By: Claude`.

## Regla 3 — Estado del Repo

`grep -rEn "from\('integrations'\)\.(insert|update|upsert|delete)" src/ --include='*.ts' --include='*.tsx' | grep -v 'src/lib/domain/integrations.ts'`:

| Archivo                      | Linea | Operacion                              | Sera refactorizado en |
| ---------------------------- | ----- | -------------------------------------- | --------------------- |
| `src/app/actions/shopify.ts` | 267   | `.update({...})` (saveShopifyIntegration) | Plan 06 (o eliminado por D-03) |
| `src/app/actions/shopify.ts` | 285   | `.insert({...})` (saveShopifyIntegration) | Plan 06 (o eliminado por D-03) |
| `src/app/actions/shopify.ts` | 342   | `.update({ is_active })` (toggleShopifyIntegration) | NO scope de Plan 06 — read+toggle, deferred a futuro standalone |
| `src/app/actions/shopify.ts` | 392   | `.delete()` (legacy deleteShopifyIntegration) | **Plan 06 lo migra a `domainDeleteShopifyIntegration`** |

**Estado esperado tras Plan 06:** linea 392 (delete) reemplazada por call al domain. Lineas 267 + 285 dependen de la decision UX final (D-03 manda eliminar el form viejo entero — si se elimina, las funciones desaparecen; si se preserva como fallback, Plan 06 las refactoriza). La linea 342 (toggle) queda fuera del scope porque no es path de mutacion configurada por OAuth.

**Conclusion:** Regla 3 NO esta completa en main aun, pero el unico archivo nuevo con permiso de mutar la tabla es `src/lib/domain/integrations.ts`. Plan 05 (callback) ya nace puro — usa solo el domain layer.

## Hand-off para Wave 2 (Plans 03 + 04 + 05)

### Plan 03 — `src/lib/shopify/oauth.ts` primitives

```typescript
import { getShopifyOAuthConfig } from './oauth-config'

export async function buildAuthorizeUrl(opts: { shop: string; statePayload: ... }): Promise<string> {
  const { clientId, stateSecret } = await getShopifyOAuthConfig()
  // ... usar clientId en `?client_id=...`, stateSecret para SignJWT
}

export async function exchangeCodeForToken(opts: { shop: string; code: string }): Promise<{ accessToken: string; scope: string }> {
  const { clientId, clientSecret } = await getShopifyOAuthConfig()
  // ... POST a https://{shop}/admin/oauth/access_token
}

export function verifyOauthCallbackHmac(query: URLSearchParams, hmacReceived: string, clientSecret: string): boolean {
  // ... HEX digest sobre query params sorted (RESEARCH Pitfall 1 — different from webhook hmac)
}
```

**Importante:** `verifyOauthCallbackHmac` recibe `clientSecret` como parametro (no llama a `getShopifyOAuthConfig` internamente) — eso lo hace pure y testeable. El caller de Plan 05 lee la config una vez al top del handler y pasa los pedazos relevantes.

### Plan 04 — `src/app/actions/shopify-oauth.ts` startShopifyOauth

```typescript
'use server'

import { buildAuthorizeUrl } from '@/lib/shopify/oauth'

export async function startShopifyOauth({ shopDomain }: { shopDomain: string }): Promise<{ success: true; redirectUrl: string } | { success: false; error: string }> {
  // 1. Auth gate (cookie + workspace_members.role === 'owner') — copy literal de src/app/actions/shopify.ts:184-210
  // 2. Validar + normalizar shopDomain
  // 3. const url = await buildAuthorizeUrl({ shop, statePayload: { workspaceId, userId, nonce, exp } })
  //    ← internamente llama a getShopifyOAuthConfig() — Plan 04 NO lo llama directo
  // 4. return { success: true, redirectUrl: url }
}
```

**Source taxonomy:** `'server-action'`. NO se llama a `upsertShopifyIntegration` aqui — solo construye la URL.

### Plan 05 — `src/app/api/integrations/shopify/oauth/callback/route.ts`

```typescript
import { upsertShopifyIntegration, type UpsertShopifyIntegrationParams } from '@/lib/domain/integrations'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth-config'
import { verifyOauthCallbackHmac, exchangeCodeForToken } from '@/lib/shopify/oauth'
import { jwtVerify } from 'jose'

export async function GET(request: Request) {
  // 1. parse query params (Zod)
  // 2. const { clientSecret, stateSecret } = await getShopifyOAuthConfig()  ← UNA SOLA llamada al top
  // 3. verifyOauthCallbackHmac(query, hmac, clientSecret)
  // 4. jwtVerify(state, new TextEncoder().encode(stateSecret))   → workspaceId, userId
  // 5. exchangeCodeForToken({ shop, code })   → { accessToken, scope }
  // 6. scope drift check (granted scope ⊇ requested scope)
  // 7. testShopifyConnection(shop, accessToken, clientSecret)   ← reusa connection-test.ts
  // 8. createWebhooksAfterOauth(shop, accessToken)              ← Promise.allSettled
  // 9. await upsertShopifyIntegration(
  //      { workspaceId, source: 'oauth-callback', actorId: userId, actorLabel: `user:${userId.slice(0,8)}` },
  //      { shopDomain: shop, accessToken, apiSecret: clientSecret, shopName, grantedScope: scope }
  //    )
  // 10. NextResponse.redirect('.../integraciones?success=oauth_connected')
}
```

**Source taxonomy:** `'oauth-callback'` — string nuevo, no esta en el comentario de `src/lib/domain/types.ts:17` (que lista `server-action | tool-handler | automation | webhook | adapter | mobile-api | robot`). Plan 05 puede agregarlo al comentario o usar `'webhook'` (estiramiento semantico, no recomendado). **Recomendacion:** usar `'oauth-callback'` literal y actualizar el JSDoc de `DomainContext.source` en Plan 05 mismo (cambio de comentario, no breaking).

**Importante apiSecret:** el callback escribe `apiSecret: clientSecret` porque la BD reusa ese campo del config para el HMAC del webhook handler de inbound webhooks (`src/app/api/webhooks/shopify/route.ts:71`). Es el mismo Client Secret de Dev Dashboard — Shopify usa el mismo secret para HMAC de OAuth callback Y para HMAC de webhooks.

### Plan 06 — refactor `src/app/actions/shopify.ts:392` (delete path)

```typescript
import { deleteShopifyIntegration as domainDeleteShopifyIntegration } from '@/lib/domain/integrations'

// dentro de la server action existente (linea ~359):
const result = await domainDeleteShopifyIntegration({
  workspaceId,
  source: 'server-action',
  actorId: user.id,
  actorLabel: `user:${user.id.slice(0, 8)}`,
})
if (!result.success) {
  console.error('Error deleting integration:', result.error)
  return { success: false, error: 'Error al eliminar integracion' }
}
```

Notar el alias en el import: la server action SE LLAMA `deleteShopifyIntegration` y el domain TAMBIEN — colision de nombres a resolver con `as domainDeleteShopifyIntegration` (PATTERNS.md ya documenta esto).

## Decisions / Deviations

**Cero deviations** vs el plan original. Todas las modificaciones siguen las instrucciones literalmente con las siguientes anotaciones que afinan (no contradicen) el plan:

1. **Shape real de `ShopifyConfig` en repo:** El plan asumia `enable_fuzzy_matching?: boolean` y `product_matching: 'sku' | 'title'`. La interface real (verificada en lectura de Task A) es `enable_fuzzy_matching: boolean` (NO opcional) y `product_matching: 'sku' | 'name' | 'value'`. El `upsertShopifyIntegration` se ajusto para tipar correctamente: como ambos son required, se les asigna SIEMPRE un valor concreto (preserve-or-default). Documenta el delta en el JSDoc del modulo.

2. **`field_mappings` agregado al preserve-list:** El plan listaba 5 campos a preservar. El interface real tiene un sexto campo opcional `field_mappings?: Record<string, string>` (configurable por operador). Se preserva tambien — si quedaba el plan literal lo borraria al re-conectar, aunque no esta en uso productivo hoy. Decision conservadora alineada con D-10 ("OAuth no debe pisar config del operador").

3. **`grantedScope` precedence explicita:** El plan decia "preserva el del existente si no viene en params". El codigo lo hace literal con un ternario que distingue 3 casos: explicit param > existing config > undefined (omit). Esto facilita test unitario y deja claro el contract.

4. **`getShopifyOAuthConfig` rechaza placeholders `<REPLACE_*>`:** No estaba explicito en las instrucciones, pero la migracion (`20260512000000_shopify_oauth_credentials.sql:19-21`) inserta literalmente esos strings como seed. Si el helper aceptara `"<REPLACE_WITH_DEV_DASHBOARD_CLIENT_SECRET>"` como valido, el OAuth se intentaria con un secret de basura y daria 401 confuso. El helper ahora throws con mensaje claro: "still holds the migration placeholder. Run the UPDATE in Supabase Studio with the real value." Defensa en profundidad alineada con la politica fail-CLOSED de D-15.

5. **`getShopifyIntegration` tambien envuelto en try/catch:** El plan exigia "nunca throws" para `upsertShopifyIntegration`. Por consistencia y por no asumir que `.maybeSingle()` es libre de excepciones (network drops mid-query, etc.), las 3 funciones tienen el mismo patron try/catch externo. PATTERNS A y la referencia tags.ts confirman que es el idioma canonico.

## Self-Check: PASSED

```bash
# files exist
test -f src/lib/domain/integrations.ts          → FOUND
test -f src/lib/shopify/oauth-config.ts         → FOUND
test -f src/lib/domain/index.ts                 → FOUND (modificado)
test -f src/lib/shopify/types.ts                → FOUND (modificado)

# functional gates
grep -E "granted_scope\?:" src/lib/shopify/types.ts                       → 1 match ✓
grep "export \* from './integrations'" src/lib/domain/index.ts            → 1 match ✓
grep -E "^export (async )?function" src/lib/domain/integrations.ts        → 3 funciones ✓
grep -c "ctx\.workspaceId" src/lib/domain/integrations.ts                 → 9 (>=3) ✓
grep -c "createAdminClient" src/lib/domain/integrations.ts                → 5 (>=1) ✓
grep -c "DomainContext\|DomainResult" src/lib/domain/integrations.ts      → 9 ✓
grep -c "process\.env\.SHOPIFY_" src/lib/shopify/oauth-config.ts          → 0 ✓ (gate D-15)
grep -c "throw new Error" src/lib/shopify/oauth-config.ts                 → 5 ✓ (fail-CLOSED)
grep -c "getPlatformConfig" src/lib/shopify/oauth-config.ts               → 8 ✓ (wrapper de existente)

# typecheck (no nuevos errores en archivos tocados)
npx tsc --noEmit 2>&1 | grep -E "src/lib/(domain/integrations|shopify/(types|oauth-config))\.ts|src/lib/domain/index\.ts"
                                                                          → 0 lineas ✓

# commits
git log --oneline -3 → e11918f, 9215578, 57e0fb4 (3 atomic, en orden Task A→B→C) ✓

# regla 3 audit (mutaciones a tabla integrations fuera del nuevo domain file)
grep -rEn "from\('integrations'\)\.(insert|update|upsert|delete)" src/ --include='*.ts' --include='*.tsx' | grep -v 'src/lib/domain/integrations.ts'
                                                                          → 4 matches en src/app/actions/shopify.ts (esperado pre-Plan 06)

# worktree base + cleanliness
git rev-parse HEAD → 57e0fb4 (3 commits sobre cb86e6e correcto) ✓
git status --short → "" (clean) ✓
git diff --stat HEAD~3 HEAD → 4 files, +419 lineas ✓
```

Todos los checks pasan. Plan 02 listo.
