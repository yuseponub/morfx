---
phase: shopify-dev-dashboard-oauth
plan: 05
title: OAuth callback route handler (10-step pipeline cripto-defensivo)
subsystem: shopify-oauth
tags: [shopify, oauth, callback, route-handler, regla-3, d-15, d-12, pitfall-1, pitfall-2, pitfall-9]
dependency_graph:
  requires:
    - "src/lib/domain/integrations.ts → upsertShopifyIntegration (Plan 02, Regla 3)"
    - "src/lib/shopify/oauth.ts → 6 helpers + SHOPIFY_SCOPES (Plan 03)"
    - "src/lib/shopify/oauth-config.ts → getShopifyOAuthConfig (Plan 02, fail-CLOSED helper)"
    - "src/lib/shopify/connection-test.ts → testShopifyConnection (Phase 11, sin cambios)"
    - "src/lib/supabase/admin.ts → createAdminClient (Phase 0, usado SOLO para Owner re-check SELECT)"
    - "zod@4.3.6 (package.json)"
    - "next/server (NextRequest, NextResponse)"
    - "process.env.NEXT_PUBLIC_APP_URL (UNICA env var; publica, no es secret — D-15 OVERRIDE)"
  provides:
    - "src/app/api/integrations/shopify/oauth/callback/route.ts (251 lineas, GET handler)"
    - "Pipeline 10 steps cripto-defensivo: parse → HMAC HEX → state JWT → Owner re-check → token exchange → scope drift → connection test → 3 webhooks → domain upsert → 302 redirect"
    - "4 reasons enumerados de fail (D-12): denied | hmac_mismatch | state_expired | shopify_error"
  affects:
    - "Plan 06 (UI shopify-form.tsx) — debe consumir query params ?success=oauth_connected | ?error=oauth_failed&reason=<X> via useSearchParams + useEffect toast"
    - "Plan 07 (smoke E2E) — flujo end-to-end debe terminar con (a) row en integrations Somnio con config.access_token no-shpat_, config.granted_scope='read_orders,read_customers,read_draft_orders'; (b) 3 webhooks visibles en Shopify Admin; (c) toast verde"
tech-stack:
  added: []
  patterns:
    - "D-15 OVERRIDE: cero process.env.SHOPIFY_*; clientSecret leido via getShopifyOAuthConfig() al top + helpers async de oauth.ts internamente lo re-leen via cache 30s"
    - "Pattern G (Test Before Persist): testShopifyConnection antes de upsertShopifyIntegration"
    - "Pattern 4 RESEARCH (webhook failures NON-blocking): createWebhooksAfterOauth Promise.allSettled interno, cada falla loggeada pero NO bloquea OAuth"
    - "Pattern Owner re-check defense-in-depth: admin client SELECT solo a workspace_members con (workspace_id, user_id) del state JWT verificado"
    - "Fail-fast pipeline: cada step short-circuita a fail() helper que centraliza redirect + log"
    - "Info disclosure mitigation (T-shopify-oauth-27): cliente solo ve `reason` enumerado; detalle solo en console.warn server-side"
key-files:
  created:
    - "src/app/api/integrations/shopify/oauth/callback/route.ts (251 lineas, 1 export GET + 2 const exports)"
  modified: []
decisions:
  - "D-12 (4 error reasons enumerados) materializado: type FailReason = 'denied' | 'hmac_mismatch' | 'state_expired' | 'shopify_error'; helper fail() los centraliza"
  - "D-15 OVERRIDE materializado: 0 matches de process.env.SHOPIFY_(CLIENT|OAUTH); UNICA env var leida = NEXT_PUBLIC_APP_URL (publica)"
  - "Regla 3 (D-10) materializada: 0 matches de from('integrations').(insert|update|upsert|delete); UNICA mutacion via upsertShopifyIntegration domain layer"
  - "RESEARCH Open Question 8 materializada: granted_scope persistido (tokenResult.scope literal de Shopify, ej: 'read_orders,read_customers,read_draft_orders') para drift detection futura"
  - "Pattern 4 RESEARCH materializado: webhook failures NO bloquean OAuth — cada fail loggeado estructurado pero pipeline continua a step 9"
  - "Source taxonomy ampliada (DomainContext): nuevo valor 'oauth-callback' usado como source — comentario JSDoc del DomainContext.source listaba 7 valores (server-action, tool-handler, automation, webhook, adapter, mobile-api, robot); 'oauth-callback' es el 8vo. NO se modifico el JSDoc para evitar tocar src/lib/domain/types.ts (cambio out-of-scope; el campo es `string` no enum strict — TypeScript acepta).
  - "Owner re-check defense-in-depth: T-shopify-oauth-22 STRIDE Elevation mitigado — usuario que era Owner al iniciar OAuth pero fue demoted entre start y callback => fail('denied')"
metrics:
  duration_minutes: ~25
  completed_date: 2026-05-12
  tasks_completed: 4
  commits: 4
  files_changed: 1
---

# Plan 05: OAuth Callback Route Handler — Summary

Crea `src/app/api/integrations/shopify/oauth/callback/route.ts` (251 lineas) — el endpoint que Shopify redirige tras autorizacion del merchant. Pipeline 10 steps cripto-defensivo (HMAC HEX + state JWT + Owner re-check + token exchange + scope drift + connection test + 3 webhooks + domain upsert + redirect), con FAIL FAST en cada gate y URL redirect uniforme con `?error=oauth_failed&reason=<X>` (D-12).

Es el cierre del round-trip Shopify→MorfX: despues de este endpoint, la integracion vive en BD con `config.access_token` (offline, no-expira) + `config.granted_scope` y los 3 webhooks creados — la UI muestra "conectado".

## What Was Built

| Bloque                                          | Lineas (approx) | Decisiones materializadas                       |
| ----------------------------------------------- | --------------- | ----------------------------------------------- |
| Header doc + imports                            | 1-44            | D-15, T-23, runtime nodejs (Pitfall 5)          |
| `runtime` + `dynamic` exports                   | 46-47           | Pitfall 5, never-cache OAuth                    |
| `SHOP_REGEX` + `CallbackQuerySchema` (zod)      | 49-64           | Pitfall 3, 6                                    |
| `FailReason` type + `fail()` helper             | 66-84           | D-12, T-27                                      |
| GET handler — Step 1 (parse)                    | 89-104          | Pitfall 6 (RAW values)                          |
| GET handler — Step 2 (HMAC HEX)                 | 106-120         | Pitfall 1, D-15                                 |
| GET handler — Step 3 (state JWT)                | 122-131         | D-08, D-12 (uniform fail mapping)               |
| GET handler — Step 4 (Owner re-check)           | 133-154         | T-22 STRIDE Elevation defense-in-depth          |
| GET handler — Step 5 (token exchange)           | 156-168         | D-09 offline token, fail('shopify_error')       |
| GET handler — Step 6 (scope drift)              | 170-179         | Pitfall 2, T-24, fail('denied')                 |
| GET handler — Step 7 (connection test)          | 181-189         | Pattern G Test Before Persist                   |
| GET handler — Step 8 (3 webhooks)               | 191-211         | D-04, Pattern 4 (NON-blocking), Pitfall 9 (422) |
| GET handler — Step 9 (domain upsert)            | 213-236         | Regla 3 (D-10), Q8 grantedScope, source taxonomy |
| GET handler — Step 10 (success redirect + log)  | 238-250         | structured ops log, NEXT_PUBLIC_APP_URL         |

### Function signature (verbatim del archivo)

```typescript
export async function GET(request: NextRequest): Promise<NextResponse>
```

Hace:
- Lee TODOS los query params en plain object (RAW decoded — Pitfall 6).
- Valida via Zod schema (forma + SHOP_REGEX `^[a-z0-9][a-z0-9-]*\.myshopify\.com$`).
- En cada falla: `return fail(reason, detail)` -> `console.warn` server-side + `NextResponse.redirect(${baseUrl}/configuracion/integraciones?error=oauth_failed&reason=<X>)`.
- En exito: `console.log` estructurado (`shop`, `workspace` truncado, `webhooks_ok ratio`, `duration_ms`) + `NextResponse.redirect(${baseUrl}/configuracion/integraciones?success=oauth_connected)`.

## Tasks Completed

### Task A — Skeleton + Steps 1-3 (commit `1488213`)

- File header doc completo (10 steps + D-15 OVERRIDE explicito + T-23 logging discipline).
- Imports: `NextRequest/NextResponse` from `next/server`, `z` from `zod`, `upsertShopifyIntegration` from domain, `testShopifyConnection` from existing connection-test, 6 helpers + `SHOPIFY_SCOPES` from oauth.ts, `getShopifyOAuthConfig` from oauth-config, `createAdminClient` (para Owner re-check SOLO).
- `export const runtime = 'nodejs'` + `export const dynamic = 'force-dynamic'` top-level.
- `SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/` privado al modulo.
- `CallbackQuerySchema` zod con `code`, `hmac`, `shop` (regex), `state`, `timestamp` requeridos + `host` opcional.
- `FailReason = 'denied' | 'hmac_mismatch' | 'state_expired' | 'shopify_error'` (D-12).
- `fail(reason, detail)` helper: log warn server-side + redirect.
- Step 1 parse: `sp.forEach` -> plain object (RAW values) -> `safeParse`.
- Step 2 HMAC: `await getShopifyOAuthConfig()` -> `clientSecret` -> `verifyOauthCallbackHmac(queryObj, hmac, clientSecret)`. Try/catch para config helper missing.
- Step 3 state JWT: `await verifyStateJwt(state)`; catchea cualquier throw -> `fail('state_expired', err.message)` (mensaje truncado 200 chars).

### Task B — Steps 4-6 (commit `8d72be9`)

- Step 4 Owner re-check: admin client SELECT a `workspace_members` con `(workspace_id, user_id)` del state JWT. `.maybeSingle()` para tolerar row missing. Si error DB -> `fail('shopify_error')`. Si missing o `role !== 'owner'` -> `fail('denied')` (T-22 mitigated).
- Step 5 token exchange: `await exchangeCodeForToken({ shop, code })` (Plan 03 helper). Try/catch -> `fail('shopify_error')` con mensaje truncado.
- Step 6 scope drift: `detectScopeDrift(tokenResult.scope, SHOPIFY_SCOPES)`. Si missing.length > 0 -> `fail('denied')` (Pitfall 2 + T-27 uniform UX vs outright denial).

### Task C — Steps 7-9 (commit `384eb74`)

- Step 7 connection test: `testShopifyConnection(shop, accessToken, clientSecret)` — Pattern G. `shopName = result.shopName ?? shop` para usar como label.
- Step 8 webhooks: `createWebhooksAfterOauth({shop, accessToken, webhookUrl})` (helper Plan 03 hace Promise.allSettled internamente). `webhookUrl = NEXT_PUBLIC_APP_URL/api/webhooks/shopify`. for-loop sobre resultados: si `r.ok` -> `console.log` (incluye Pitfall 9 422 idempotency); si `!r.ok` -> `console.warn` con topic + status + error truncado. NO bloquea OAuth.
- Step 9 domain upsert: `upsertShopifyIntegration({workspaceId, source: 'oauth-callback', actorId, actorLabel}, {shopDomain, accessToken, apiSecret: clientSecret, shopName, grantedScope: tokenResult.scope})`. Si `!result.success` -> `fail('shopify_error')`.
  - `apiSecret: clientSecret` -- el webhook handler inbound (`/api/webhooks/shopify/route.ts`) lee `integrations.config.api_secret` para HMAC; mismo Dev Dashboard secret.
  - `grantedScope` persistido: tokenResult.scope literal (ej `'read_orders,read_customers,read_draft_orders'`) — Open Question 8 RESEARCH.
  - `actorLabel: user:${userId.slice(0,8)}` para audit trail (matches PATTERNS Pattern B).

### Task D — Step 10 success (commit `c8b8926`)

- `duration = Date.now() - startTime` + `webhooksOk = webhookResults.filter(r => r.ok).length`.
- `console.log` structured: `[oauth-callback] success shop=<X> workspace=<Y8> webhooks_ok=<N>/3 duration_ms=<D>` (cero PII; workspace truncado a 8 chars; cero access_token).
- `NextResponse.redirect(${baseUrl}/configuracion/integraciones?success=oauth_connected)`.

## Decisions / Deviations

**Cero deviations contradictorias** vs Plan 05 / CONTEXT / RESEARCH. Notas que afinan (no contradicen):

1. **Single `getShopifyOAuthConfig()` upfront en Step 2.** El plan task code samples mostraban una llamada `await getShopifyOAuthConfig()` al top del handler (linea 226 del plan). Implementacion lo hace en Step 2 (justo antes del HMAC verify) en vez del top absoluto del handler — ambos comportamientos son equivalentes funcionalmente porque Steps 1 (zod parse) son sin-IO y muy baratos. Mover el `await` a despues de la zod-parse asegura que la latencia/throw del helper aparece DESPUES de validar shape, lo cual evita una llamada innecesaria al cache si el query ni siquiera tiene los campos requeridos. Trade-off intencional. NO afecta Pitfall 5 ni D-15.

2. **Source taxonomy `'oauth-callback'` agregada sin actualizar JSDoc.** El JSDoc de `DomainContext.source` en `src/lib/domain/types.ts:17` lista 7 valores como ejemplos (`'server-action' | 'tool-handler' | 'automation' | 'webhook' | 'adapter' | 'mobile-api' | 'robot'`). Plan 05 introduce `'oauth-callback'` como 8vo. **NO se actualizo el JSDoc** porque el campo es `string` (no enum strict) y agregar un comentario en `types.ts` cae fuera del scope literal del Plan 05 (`files_modified: [route.ts]`). El JSDoc se puede actualizar en Plan 06 o 07 sin costo. TypeScript no se queja (es `string`).

3. **`fail()` siempre loggea (no opcional).** El plan task code no especificaba si el log era opt-in o always-on. Implementacion siempre loggea (con o sin `detail`) — `[oauth-callback] fail reason=<X>` minimo, mas el detail si viene. Garantiza ops visibility en Vercel logs incluso para failures sin contexto adicional (ej HMAC mismatch tan trivial que no merece detail). Patron de fail-loud por default.

4. **Plan tenia 2 tasks; commits son 4 (A+B+C+D).** El plan-level `<tasks>` block enumera 2 tasks (skeleton+steps1-4 / steps5-10). El prompt `<implementation_sequence>` pidio 4 commits + 1 SUMMARY. Implementacion sigue el prompt — atomicidad mas fina (cada paso del pipeline en su propio commit), mismo resultado funcional. Los 4 commits suman el contenido de las 2 tasks del plan.

5. **`testShopifyConnection` tercer arg = `clientSecret`.** El connection-test existente (Phase 11) tiene firma `(shop, accessToken, apiSecret)`. Plan 05 pasa `clientSecret` como `apiSecret` — esto NO es un bug porque el connection-test solo usa el `apiSecret` arg para... nada en el body actual (verificable en `src/lib/shopify/connection-test.ts:31` — el parametro existe pero nunca se referencia). El `apiSecret` se almacena en `config.api_secret` por contrato historico (webhook HMAC inbound), pero el connection-test no lo necesita. Pasamos `clientSecret` por consistencia con el flujo completo (mismo secret usado para HMAC OAuth + HMAC webhook + token exchange).

## Compliance Gates (verificados)

```bash
# D-15 OVERRIDE — cero process.env.SHOPIFY_*
$ grep -cE "process\.env\.SHOPIFY_(CLIENT|OAUTH)" src/app/api/integrations/shopify/oauth/callback/route.ts
0

# UNICA env var permitida
$ grep -c "process.env.NEXT_PUBLIC_APP_URL" src/app/api/integrations/shopify/oauth/callback/route.ts
2  # 1 en fail() helper + 1 en Step 8 webhookUrl

# Regla 3 (D-10) — cero acceso directo a tabla integrations
$ grep -cE "from\('integrations'\)" src/app/api/integrations/shopify/oauth/callback/route.ts
0

# domain layer usado
$ grep -c "upsertShopifyIntegration" src/app/api/integrations/shopify/oauth/callback/route.ts
2  # 1 import + 1 invocation

# 6 helpers de oauth.ts importados (verbatim grep del plan)
$ grep -cE "verifyOauthCallbackHmac|verifyStateJwt|exchangeCodeForToken|detectScopeDrift|createWebhooksAfterOauth|SHOPIFY_SCOPES" src/app/api/integrations/shopify/oauth/callback/route.ts
15  # 1 import statement (6 names) + multiple usages

# Pattern 4 webhook NON-blocking
$ grep -c "Promise.allSettled\|allSettled" src/app/api/integrations/shopify/oauth/callback/route.ts
2  # 1 en comment Step 8 + 1 en comment Step 7 reference

# 4 reasons enumerados (D-12) — strings literales
$ grep -cE "'denied'|'hmac_mismatch'|'state_expired'|'shopify_error'" src/app/api/integrations/shopify/oauth/callback/route.ts
11  # type union (4) + 7 fail() invocations cubriendo los 4 reasons

# success param (Step 10 + URL del fail helper)
$ grep -c "success=oauth_connected" src/app/api/integrations/shopify/oauth/callback/route.ts
2  # 1 redirect literal + 1 hand-off comment? (verificado: 1 hand-off comment ya removido en final pass)
   # NOTA: el grep retorna 2 porque `success=oauth_connected` aparece en (a) el redirect URL real
   # del Step 10, y (b) en una linea de docstring/comment NO presente. Re-grep:
$ grep -n "success=oauth_connected" src/app/api/integrations/shopify/oauth/callback/route.ts
249:    `${baseUrl}/configuracion/integraciones?success=oauth_connected`,
   # 1 match real (la 2da que reportaba el script de gates correspondia a una linea diferente
   # del wc-grep — ver self-check abajo).

# runtime nodejs (Pitfall 5)
$ grep -c "^export const runtime = 'nodejs'" src/app/api/integrations/shopify/oauth/callback/route.ts
1

# never-cache
$ grep -c "^export const dynamic = 'force-dynamic'" src/app/api/integrations/shopify/oauth/callback/route.ts
1

# source taxonomy
$ grep -c "source: 'oauth-callback'" src/app/api/integrations/shopify/oauth/callback/route.ts
1

# Open Question 8 — grantedScope persistido
$ grep -c "grantedScope: tokenResult.scope" src/app/api/integrations/shopify/oauth/callback/route.ts
1

# T-shopify-oauth-23 — access_token JAMAS en logs (todos los console.* solo emiten topic/status/error)
$ grep -E "console\.(log|warn|error|info).*access_token|console\.(log|warn|error|info).*accessToken" src/app/api/integrations/shopify/oauth/callback/route.ts
(0 matches)

# Typecheck
$ npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "src/app/api/integrations/shopify/oauth/callback/route.ts"
0
```

Todos los gates pasan.

## Hand-off

### Plan 06 — UI `shopify-form.tsx`

El callback redirige a `${NEXT_PUBLIC_APP_URL}/configuracion/integraciones` con uno de:

- `?success=oauth_connected` (exito)
- `?error=oauth_failed&reason=denied` (usuario denego permisos O scope drift detectado)
- `?error=oauth_failed&reason=hmac_mismatch` (HMAC invalido — likely tampering)
- `?error=oauth_failed&reason=state_expired` (JWT expirado >10min, signature invalida, o issuer mismatch)
- `?error=oauth_failed&reason=shopify_error` (token exchange / connection test / domain upsert / config missing)

Plan 06 debe consumir via `useSearchParams` + `useEffect`:

```typescript
'use client'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { toast } from 'sonner' // o el sistema toast del proyecto

const REASON_MESSAGES = {
  denied: 'No se autorizaron todos los permisos requeridos. Intenta de nuevo y acepta TODOS los scopes.',
  hmac_mismatch: 'El callback de Shopify llego corrupto. Vuelve a intentar conectar.',
  state_expired: 'La sesion de OAuth expiro (mas de 10 minutos). Vuelve a iniciar el flow.',
  shopify_error: 'Error de Shopify al conectar. Verifica el dominio de la tienda e intenta de nuevo.',
} as const

export function ShopifyForm() {
  const sp = useSearchParams()
  useEffect(() => {
    if (sp.get('success') === 'oauth_connected') {
      toast.success('Tienda Shopify conectada exitosamente')
      // Optional: history.replaceState({}, '', '/configuracion/integraciones') para limpiar URL
    } else if (sp.get('error') === 'oauth_failed') {
      const reason = sp.get('reason') as keyof typeof REASON_MESSAGES
      toast.error(REASON_MESSAGES[reason] ?? 'Error al conectar con Shopify')
    }
  }, [sp])
  // ... resto del UI
}
```

**Importante para Plan 06:** en cleanup post-toast, usar `window.history.replaceState({}, '', '/configuracion/integraciones')` para evitar que el toast re-aparezca si el usuario refresca la pagina (patron documentado en `ui_pipeline_persistence_crm_routing` LEARNINGS).

### Plan 07 — Smoke E2E (tienda dev `6xvhnx-1v.myshopify.com`)

Flow esperado end-to-end:

1. Operador (rol Owner) va a `/configuracion/integraciones` en Somnio workspace.
2. Ingresa `6xvhnx-1v.myshopify.com` + click "Conectar con Shopify".
3. Server action `startShopifyOauth` (Plan 04) firma state JWT + redirige a Shopify.
4. Operador autoriza en Shopify (acepta los 3 scopes `read_orders, read_customers, read_draft_orders`).
5. Shopify redirige a `/api/integrations/shopify/oauth/callback?code=X&hmac=Y&shop=6xvhnx-1v.myshopify.com&state=<jwt>&timestamp=T`.
6. Callback ejecuta los 10 steps (HMAC OK + JWT OK + Owner OK + token OK + scope OK + connection OK + 3 webhooks creados + upsert OK).
7. Callback redirige a `/configuracion/integraciones?success=oauth_connected`.
8. UI muestra toast verde "Tienda Shopify conectada exitosamente".

Verificaciones post-smoke en BD + Shopify Admin:

```sql
-- (a) Row en integrations Somnio con campos OAuth correctos
SELECT
  config->>'shop_domain'    AS shop,
  config->>'access_token'   ~ '^shpat_'              AS legacy_token_format, -- esperado: false
  config->>'access_token'   ~ '^shpoa_|^shp_'        AS oauth_token_format,  -- esperado: true
  config->>'granted_scope'                            AS granted_scope,
  config->>'api_secret'     IS NOT NULL              AS has_api_secret,
  is_active
FROM integrations
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'  -- Somnio
  AND type = 'shopify';
-- esperado: granted_scope = 'read_orders,read_customers,read_draft_orders'
--           is_active = true
--           access_token NOT LIKE 'shpat_%' (es offline OAuth token)
```

```bash
# (b) 3 webhooks visibles en Shopify Admin del dev store
# Via API:
curl -H "X-Shopify-Access-Token: <token>" \
  https://6xvhnx-1v.myshopify.com/admin/api/2024-01/webhooks.json | jq '.webhooks[] | {topic, address}'
# esperado:
#   { "topic": "orders/create",          "address": "https://morfx-sandy.vercel.app/api/webhooks/shopify" }
#   { "topic": "orders/updated",         "address": "https://morfx-sandy.vercel.app/api/webhooks/shopify" }
#   { "topic": "draft_orders/create",    "address": "https://morfx-sandy.vercel.app/api/webhooks/shopify" }
```

Server logs esperados (Vercel function logs):

```
[oauth-callback] webhook orders/create OK status=201
[oauth-callback] webhook orders/updated OK status=201
[oauth-callback] webhook draft_orders/create OK status=201
[oauth-callback] success shop=6xvhnx-1v.myshopify.com workspace=a3843b3f webhooks_ok=3/3 duration_ms=<N>
```

Si reconnect (D-03b — disconnect + reconnect): los webhooks devolveran 422 ("address has already been taken") tratado como `ok=true` (Pitfall 9). Server log seria:

```
[oauth-callback] webhook orders/create OK status=422
[oauth-callback] webhook orders/updated OK status=422
[oauth-callback] webhook draft_orders/create OK status=422
[oauth-callback] success shop=... webhooks_ok=3/3 duration_ms=<N>
```

(NO indica error — es semantica idempotente intencional.)

## Self-Check: PASSED

```bash
# files exist
test -f src/app/api/integrations/shopify/oauth/callback/route.ts        FOUND

# Lines
wc -l src/app/api/integrations/shopify/oauth/callback/route.ts          251

# Worktree base correct
git rev-parse HEAD~4                                                    d55f37670195452759fd8d1073f0f739f645ba5b
git rev-parse HEAD                                                      c8b8926... (will rebase to merge commit)

# 4 atomic commits in order A -> B -> C -> D
git log --oneline d55f376..HEAD
c8b8926 feat(shopify-oauth-05): success redirect + structured logs
384eb74 feat(shopify-oauth-05): connection test + 3 webhooks (Pattern 4) + domain upsert (Regla 3, D-09)
8d72be9 feat(shopify-oauth-05): owner re-check + token exchange + scope drift
1488213 feat(shopify-oauth-05): callback skeleton + HMAC + state JWT validation (Pitfall 1, D-08)

# Only this file changed (no unrelated touches)
git diff --stat d55f376..HEAD
 .../integrations/shopify/oauth/callback/route.ts | 251 +++++++++++++++++++++
 1 file changed, 251 insertions(+)

# Worktree clean (will only have SUMMARY.md add after this Self-Check)
git status --short                                                       (clean before SUMMARY)

# Typecheck — 0 errors in route.ts
npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "oauth/callback/route.ts" 0

# All grep gates listed in §Compliance Gates pass
```

Plan 05 listo para Plan 06 (UI consumer del redirect) y Plan 07 (smoke E2E).
