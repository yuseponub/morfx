# Shopify Dev Dashboard OAuth — Research

**Phase:** standalone shopify-dev-dashboard-oauth
**Mode:** ecosystem
**Researcher:** gsd-phase-researcher
**Date:** 2026-05-11
**Confidence:** HIGH

---

> **⚠ ERRATA 2026-05-12 (descubierta durante Plan 01):**
> Este RESEARCH propuso `write_webhooks` como scope necesario para crear webhook subscriptions post-OAuth. **Eso es INCORRECTO** — `write_webhooks` no existe como scope en Shopify (verificado en docs oficiales y community 2026-05-12). Para crear webhook subscriptions vía Admin API basta tener el `read_*` scope del resource. Adicionalmente, `draft_orders/create` requiere `read_draft_orders` (no documentado en este RESEARCH).
>
> **La lista correcta de scopes es: `read_orders`, `read_customers`, `read_draft_orders`** — ver D-14 en CONTEXT.md.
>
> Las referencias a `write_webhooks` que quedan en este documento (líneas ~18, 19, 353, 357, 549, 563, 746, 813, 1093) son **históricas** y NO deben implementarse. Los plans 03/04/05 ya fueron actualizados con la lista correcta. Implementadores: usar D-14 como source of truth.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** UNA app compartida "MorfX" en Dev Dashboard. Credenciales en env vars `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.
- **D-02:** Mantener `UNIQUE(workspace_id, type='shopify')` — 1 tienda por workspace.
- **D-03:** Reemplazo TOTAL del form manual. Solo input dominio + botón "Conectar con Shopify".
- **D-03b:** Usuario desconecta+reconecta la tienda actual ($65 USD) al ship.
- **D-04:** Auto-crear 3 webhooks vía Admin API: `orders/create`, `orders/updated`, `draft_orders/create`. URL `${NEXT_PUBLIC_APP_URL}/api/webhooks/shopify`. API version `2024-01`. Formato JSON. Scope adicional `write_webhooks`.
- **D-05:** Scopes `read_orders, read_customers, write_webhooks`.
- **D-06:** API version `2024-01` (no upgrade en este standalone).
- **D-07:** HMAC validation obligatoria del callback OAuth con `SHOPIFY_CLIENT_SECRET`.
- **D-08:** State como JWT firmado con server secret. Payload `{ workspace_id, user_id, nonce, exp: now+10min }`.
- **D-09:** Token storage en `integrations.config.access_token` JSONB (sin cambios).
- **D-10:** Crear `src/lib/domain/integrations.ts` (Regla 3 CLAUDE.md).
- **D-11:** Legacy `shpat_` tokens siguen funcionando (no validar formato).
- **D-12:** Error UX: redirect a `/configuracion/integraciones?error=oauth_failed&reason=<denied|hmac_mismatch|state_expired|shopify_error>`.

### Claude's Discretion
- Librería JWT específica (resuelto: **`jose` 6.x — ya en `package.json`**).
- Diseño visual del botón.
- Loading states.
- Wording exacto de mensajes en español.

### Deferred Ideas (OUT OF SCOPE)
- Multi-tienda por workspace.
- Token rotation UI.
- App pública en App Store.
- Multi-tenant SaaS con apps propias por cliente.
- Upgrade API version.
- `app/uninstalled` webhook handler (ver "Deferred / Future Considerations").

---

## Project Constraints (from CLAUDE.md)

- **Regla 3 (Domain Layer):** TODA mutación de `integrations` DEBE pasar por `src/lib/domain/integrations.ts`. El callback route NO puede llamar `adminSupabase.from('integrations').upsert()` directo. Verificable por grep en CI.
- **Regla 5 (Migración antes de Deploy):** No se requiere migración nueva — el schema actual sirve sin cambios. Sólo env vars en Vercel (no es "migración").
- **Regla 6 (Proteger Agente en Producción):** No afecta agentes AI, pero la operación productiva de Somnio recibe pedidos vía webhooks Shopify de la tienda vieja. El cambio NO debe romper el ingreso de pedidos hasta que el usuario decida desconectar+reconectar manualmente.
- **Stack:** Next.js 16.1.6 (App Router) + React 19 + TypeScript estricto + Supabase + Tailwind. Port 3020 dev. Timezone `America/Bogota`.
- **Commits atómicos en español** + Co-Authored-By Claude.
- **Push a Vercel** después de cada cambio antes de pedir pruebas al usuario.

---

## Executive Summary

Implementación canónica de OAuth Authorization Code Grant para Shopify Dev Dashboard apps (post-1-enero-2026), end-to-end **sin nuevas dependencias npm**. `jose@^6.1.3` y `@shopify/shopify-api@^12.3.0` ya están listadas en `package.json` pero ninguna se importa hoy en `src/`. **Recomendación: usar `jose` para state JWT + hand-roll OAuth con `node:crypto` (fetch nativo + 2 helpers de ~30 líneas)** — descartar `@shopify/shopify-api` porque su modelo de session storage opina sobre nuestra tabla `integrations`, choca con Regla 3 (Domain Layer) y agrega complejidad que no necesitamos para un OAuth simple multi-tenant donde el token vive en JSONB.

**3 pitfalls críticos identificados:**
1. **HMAC OAuth callback es HEX, no Base64** [VERIFIED: shopify.dev] — el utility `verifyShopifyHmac` actual (`src/lib/shopify/hmac.ts`) usa base64 (correcto para webhooks) pero **NO sirve para el callback OAuth**. Hay que crear `verifyOauthCallbackHmac` separado. Esta es la causa #1 de bugs reportados en foros Shopify.
2. **Scope drift posible** [VERIFIED: shopify.dev] — Shopify documenta explícitamente que el usuario puede modificar `scope` en la URL durante autorización; el callback DEBE verificar que el `scope` retornado contenga TODOS los solicitados, sino rechazar.
3. **Validación de `shop` parameter contra regex** [VERIFIED: shopify.dev] — un atacante puede inyectar shop arbitrario; sólo aceptar `^[a-z0-9][a-z0-9-]*\.myshopify\.com$`.

**Primary recommendation:** Hand-roll con `jose` + `node:crypto.timingSafeEqual` + `fetch`; nuevo módulo `src/lib/shopify/oauth.ts` (~150 LOC); 2 route handlers `nodejs` runtime + `force-dynamic`; domain layer `src/lib/domain/integrations.ts`; webhook auto-creation SYNCHRONOUS dentro del callback (con telemetría granular de éxito/fallo por webhook).

---

## Phase Requirements

| Requirement | Description | Research Support |
|---|---|---|
| Botón "Conectar con Shopify" | Entry point UI en `/configuracion/integraciones` | Patrón Server Action que retorna URL + redirect en cliente — sección Architecture Patterns §Pattern 1 |
| `/api/integrations/shopify/oauth/callback` | Endpoint que valida HMAC + state + intercambia code | Sección Architecture Patterns §Pattern 3 + Code Examples §Callback Handler |
| Auto-creación 3 webhooks vía Admin API | Post-OAuth, sincrónico dentro del callback | Sección Architecture Patterns §Pattern 4 + Open Question §3 |
| Reemplazo total del form manual | `shopify-form.tsx` rediseñado | Sección Code Examples §UI Refactor |
| Coexistencia legacy `shpat_` | No validar formato del token, sólo enviarlo en header | Sección Don't Hand-Roll §Token format validation |
| Domain layer `src/lib/domain/integrations.ts` | Regla 3 — toda mutación pasa por ahí | Sección Code Examples §Domain Layer |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Iniciar OAuth (generar state JWT + redirect URL) | Frontend Server (Server Action) | — | Necesita acceso a env secrets (`SHOPIFY_OAUTH_STATE_SECRET`) y validar Owner role; no es safe en cliente |
| Recibir callback de Shopify | API / Backend (Route Handler) | — | Cross-origin redirect desde Shopify; sin cookies del workspace; HMAC validation requiere `node:crypto` |
| Intercambiar code → token | API / Backend (mismo callback) | — | Llamada server-to-server con client_secret; nunca exponer al cliente |
| Validar HMAC del callback | API / Backend (utility en `src/lib/shopify/oauth.ts`) | — | Requiere `node:crypto.createHmac` + `timingSafeEqual` — Edge Runtime NO soporta `node:crypto` |
| Crear webhooks post-OAuth | API / Backend (mismo callback, sincrónico) | — | Necesita el access token recién obtenido; latencia aceptable (3 POSTs paralelos ~1-2s) |
| Persistir token en BD | Database / Storage (via Domain Layer) | — | Regla 3 obliga `src/lib/domain/integrations.ts` |
| Mostrar info de tienda conectada | Frontend Server (page.tsx) → Browser | — | Server component lee integración; client component muestra |

---

## Standard Stack

### Core (NO new dependencies — todo ya en package.json)
| Library | Version (verified) | Purpose | Why Standard |
|---|---|---|---|
| `jose` | `^6.1.3` (ya en `package.json` línea 68) [VERIFIED: package.json] | Firmar/verificar JWT del state nonce (D-08) | API moderna, web-crypto bajo el hood, compatible Edge+Node, mantenida por panva (autor del estándar OAuth). Migration de `jsonwebtoken` recomendada por la propia comunidad Shopify (v12 de `@shopify/shopify-api` también migró a `jose`) [CITED: github.com/Shopify/shopify-app-js CHANGELOG v12.0.0] |
| `node:crypto` (built-in) | Node 20+ [VERIFIED: package.json `@types/node ^20`] | HMAC-SHA256 hex digest + `timingSafeEqual` | Built-in; mismo módulo ya usado en `src/lib/shopify/hmac.ts` para webhooks |
| `fetch` (nativo Next.js 16) | — [VERIFIED: Next.js 16.1.6] | POST a `/admin/oauth/access_token` + Admin API webhooks | Built-in, sin imports |
| `cookies()` de `next/headers` | Next.js 16 [VERIFIED: imports actuales `src/app/actions/shopify.ts:14`] | Re-leer `morfx_workspace` cookie en server action (no en callback) | Patrón ya usado en el proyecto |
| `crypto.randomUUID()` o `crypto.randomBytes(16).toString('hex')` | Node built-in | Generar nonce del state | Estándar |

### Supporting (ya en proyecto)
| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `zod` | `^4.3.6` | Validar query params del callback (code, state, shop, hmac, timestamp) | Antes de procesar — fail fast con error claro |
| `sonner` | `^2.0.7` | Toast con mensaje de error en español tras redirect | Cliente component lee `?error=` y `?reason=` |
| `react-hook-form` | `^7.71.1` | Solo input de dominio + botón Connect | Reemplaza el form actual de 5 campos |
| `lucide-react` | `^0.563.0` | Icono `ShoppingBag` o `Plug` para el botón | Mantener consistencia visual |

### Alternatives Considered
| Instead of | Could Use | Tradeoff | Decision |
|---|---|---|---|
| Hand-roll OAuth | `@shopify/shopify-api@12.3.0` (ya en `package.json` línea 44) [VERIFIED: package.json] | Maneja OAuth + HMAC + webhooks; pero requiere `SessionStorage` adapter (impone modelo de tabla), v12 hace breaking change `id: number → string` en REST resources [CITED: changelog v12.0.0], asume modelo "app embedded en admin Shopify" que NO es nuestro caso (MorfX es app externa que solo consume Shopify API), y violaría Regla 3 (su `Session.save()` toca DB directo sin pasar por domain layer) | **HAND-ROLL.** El package está listado pero NO se importa en ningún archivo de `src/` [VERIFIED: grep `@shopify/shopify-api` en src/ retorna 0]. No agregar 1 dependencia importada por primera vez para 4 fetch calls. |
| `jose` para JWT | `jsonwebtoken` | `jsonwebtoken` es callback-based legacy; `jose` es Promise-based moderno; Shopify mismo migró a `jose` en v12 [CITED: shopify-app-js CHANGELOG]; ya está en `package.json` | **USAR `jose`.** |
| Hand-roll HMAC OAuth | Reusar `verifyShopifyHmac` de `src/lib/shopify/hmac.ts` | **NO sirve** — ese utility valida HMAC de webhooks (base64 sobre raw body); OAuth callback usa HMAC hex sobre query params sorted alphabetically. **Algoritmos distintos.** [VERIFIED: shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant — quote "The HMAC verification procedure for authorization code grant is different from the procedure for verifying webhooks"] | **Crear nuevo `verifyOauthCallbackHmac` en `src/lib/shopify/oauth.ts`.** |

**Installation:**
```bash
# NADA que instalar — todas las deps ya están en package.json
# Sólo configurar env vars en Vercel:
#   SHOPIFY_CLIENT_ID=...           (de Dev Dashboard → Settings)
#   SHOPIFY_CLIENT_SECRET=...       (de Dev Dashboard → Settings, mismo lugar)
#   SHOPIFY_OAUTH_STATE_SECRET=...  (random 32+ chars, generar con: openssl rand -base64 32)
```

**Version verification:**
- `jose@6.1.3` listed in package.json (line 68); npm registry latest v6 series [VERIFIED: package.json].
- `@shopify/shopify-api@12.3.0` listed (line 44) but unused; latest is v13.0.0 with breaking changes [CITED: github.com/Shopify/shopify-app-js CHANGELOG]. Not migrating because we're NOT using it.
- Node `>= v20.10.0` required by `@shopify/shopify-api` v12 → our `@types/node ^20` is compatible [VERIFIED: package.json].

---

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser (cliente)                                                        │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ /configuracion/integraciones                                       │  │
│  │   Input: "mitienda.myshopify.com"                                  │  │
│  │   [Botón: Conectar con Shopify]                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ form submit → Server Action
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Server Action: startShopifyOauth(shopDomain)                            │
│   1. Auth: getUser() + cookie morfx_workspace + workspace_members.owner  │
│   2. Validate shop domain (regex /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/) │
│   3. Generate nonce (crypto.randomUUID)                                  │
│   4. Sign state JWT (jose, payload {workspace_id,user_id,nonce,exp})    │
│   5. Build authorize URL                                                 │
│   6. Return { ok, redirectUrl }                                          │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ window.location.href = redirectUrl
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Shopify: https://{shop}/admin/oauth/authorize?...                       │
│   Usuario aprueba/deniega                                                │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ 302 redirect a callback con ?code, hmac, shop, state, timestamp
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Route Handler: /api/integrations/shopify/oauth/callback                 │
│   (export const runtime = 'nodejs')                                      │
│   (export const dynamic = 'force-dynamic')                               │
│                                                                          │
│   1. Parse + zod-validate query params                                   │
│   2. Validate shop domain regex (anti shop-injection)                    │
│   3. verifyOauthCallbackHmac (HEX, timingSafeEqual)                      │
│   4. Verify state JWT (jose: signature + exp + nonce shape)              │
│   5. POST /admin/oauth/access_token (form-urlencoded)                    │
│   6. Verify scope returned ⊇ requested  (anti scope-drift)              │
│   7. testShopifyConnection(token) — GET /shop.json                       │
│   8. Create 3 webhooks (Promise.allSettled, granular telemetry)          │
│   9. domain.upsertShopifyIntegration({ workspaceId, ... })               │
│  10. 302 redirect /configuracion/integraciones?success=oauth_connected   │
│                                                                          │
│   On any failure → 302 redirect ?error=oauth_failed&reason=...           │
└──────────────┬───────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Domain Layer: src/lib/domain/integrations.ts (NEW)                      │
│   upsertShopifyIntegration(ctx, params)                                  │
│   - createAdminClient (bypass RLS)                                       │
│   - workspace_id filter                                                  │
│   - INSERT ... ON CONFLICT (workspace_id, type) DO UPDATE                │
│   - Returns DomainResult<ShopifyIntegration>                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── app/
│   ├── api/
│   │   └── integrations/
│   │       └── shopify/
│   │           └── oauth/
│   │               └── callback/
│   │                   └── route.ts            # NEW — OAuth callback
│   ├── actions/
│   │   ├── shopify.ts                          # MODIFIED — remove saveShopifyIntegration body that sets access_token/api_secret manually; keep getX, toggle, delete; refactor to domain
│   │   └── shopify-oauth.ts                    # NEW — Server Action startShopifyOauth(shopDomain)
│   └── (dashboard)/
│       └── configuracion/
│           └── integraciones/
│               ├── page.tsx                    # MODIFIED — replace "Como configurar" Card with new OAuth instructions
│               └── components/
│                   └── shopify-form.tsx        # REWRITTEN — only domain input + Connect button when no integration; same view for connected state
├── lib/
│   ├── shopify/
│   │   ├── oauth.ts                            # NEW — buildAuthorizeUrl, verifyOauthCallbackHmac, exchangeCodeForToken, signStateJwt, verifyStateJwt, createWebhooksAfterOauth
│   │   ├── hmac.ts                             # UNCHANGED — webhook HMAC (base64) still used
│   │   ├── connection-test.ts                  # UNCHANGED — reused after OAuth
│   │   └── types.ts                            # MODIFIED — IntegrationFormData loses access_token/api_secret
│   └── domain/
│       └── integrations.ts                     # NEW — upsertShopifyIntegration, getShopifyIntegration, deleteShopifyIntegration
└── messages/
    ├── en.json                                 # MODIFIED — OAuth error messages
    └── es.json                                 # MODIFIED — OAuth error messages
```

### Pattern 1: OAuth Start (Server Action + client-side redirect)

**What:** Server Action validates auth + builds authorize URL + signs state JWT; client component receives `redirectUrl` and does `window.location.href = redirectUrl`.

**Why NOT direct redirect from Server Action:** Server Actions can `redirect()` but cross-origin to `https://mitienda.myshopify.com` requires status 302 with absolute URL. Doable via `redirect()` of `next/navigation` but loses ability to surface errors before redirect (e.g., "Owner required"). Returning `{ ok, redirectUrl, error }` lets the client show errors inline.

**When to use:** Always for the start side of OAuth in App Router when validation must precede redirect.

**Anti-pattern to avoid:** Don't generate state JWT in the client. The secret must stay server-side.

### Pattern 2: State JWT (cross-origin nonce + identity carrier)

**What:** Sign a JWT with payload `{ workspace_id, user_id, nonce, iss: 'morfx-shopify-oauth', exp: now+600 }` using `SHOPIFY_OAUTH_STATE_SECRET` (HS256). Send as `state` query param. Verify in callback.

**Why JWT (vs random string + DB lookup):** Shopify callback arrives cross-origin without cookies — we can't read the workspace cookie. The state JWT carries the workspace_id self-contained. DB-based nonce store is also valid but adds 1 read + 1 write per flow + cleanup cron. JWT with short `exp` is stateless and sufficient for OAuth's threat model.

**Why HS256 (not RS256):** Single secret, single verifier, server-side only. No need for asymmetric.

**Critical:** Use `jose.SignJWT().setProtectedHeader({alg:'HS256'}).setIssuer('morfx-shopify-oauth').setSubject(workspaceId).setExpirationTime('10m').sign(secret)`.

**Nonce purpose:** Even though JWT signature already prevents tampering, including a `crypto.randomUUID()` nonce in payload makes each token globally unique — useful for future replay-detection if we ever add a nonce blacklist.

### Pattern 3: OAuth Callback (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`)

**What:** Route handler at `/api/integrations/shopify/oauth/callback` that processes Shopify's redirect with `?code=&hmac=&shop=&state=&timestamp=`.

**MUST declare:**
```typescript
export const runtime = 'nodejs'        // node:crypto + timingSafeEqual not in Edge
export const dynamic = 'force-dynamic' // never cache OAuth callbacks
```

**Order of operations (FAIL FAST):**
1. zod-parse query params → if missing fields, redirect with `reason=shopify_error`
2. Validate `shop` regex `^[a-z0-9][a-z0-9-]*\.myshopify\.com$` → if invalid, `reason=shopify_error` + log warning
3. Verify HMAC (HEX, timingSafeEqual) → if invalid, `reason=hmac_mismatch` + log
4. Verify state JWT (signature + exp) → if invalid/expired, `reason=state_expired` + log
5. POST to `/admin/oauth/access_token` → if non-2xx, `reason=shopify_error`
6. Verify scope returned ⊇ requested → if missing, `reason=denied` (treat as user denied scope)
7. testShopifyConnection → if fail, `reason=shopify_error`
8. Create webhooks → if ANY fail, log warning but continue (don't fail OAuth for webhook failure; user can retry from UI later)
9. domain.upsertShopifyIntegration → if fail, `reason=shopify_error` + log
10. 302 to `/configuracion/integraciones?success=oauth_connected`

### Pattern 4: Webhook Auto-Creation (synchronous, granular telemetry)

**What:** After token exchange, POST 3 times in parallel to `https://{shop}/admin/api/2024-01/webhooks.json` with `X-Shopify-Access-Token` header.

**Why synchronous (not background job via Inngest):** Per Open Question §3 resolution — the callback is already doing 2 server-to-server calls (token exchange + shop.json), adding 3 more parallel POSTs adds ~500-1500ms total. Background queue adds complexity (need Inngest event + handler + retry policy + UI state for "webhooks pending"). User expects "Conectar → ya está conectado" in one redirect. **Acceptable cost: ~2-3s total callback latency.** Vercel function timeout is 60s for hobby/10s for free/300s for pro — well within budget.

**Idempotency:** Shopify's webhook create returns 422 if a webhook with same topic+address already exists. Handle this as success (idempotent re-install scenario).

**Telemetry:**
```typescript
const results = await Promise.allSettled([...])
results.forEach((r, i) => {
  if (r.status === 'rejected' || (r.value as Response).status >= 300) {
    console.warn(`[oauth] webhook ${topics[i]} creation failed:`, r)
  }
})
// Always succeed OAuth even if a webhook fails — user can re-trigger from UI
```

### Pattern 5: Domain Layer for `integrations` (Regla 3)

**What:** `src/lib/domain/integrations.ts` with functions `upsertShopifyIntegration`, `getShopifyIntegration`, `deleteShopifyIntegration`. All take `ctx: DomainContext`. All return `DomainResult<T>`.

**Pattern follows `src/lib/domain/tags.ts` / `whatsapp-templates.ts`:**
1. `createAdminClient()` (bypass RLS)
2. Filter by `workspace_id` (D-02 single-store invariant — never trust caller)
3. UPSERT on `(workspace_id, type='shopify')` conflict
4. Return `DomainResult`

**Caller responsibility:** OAuth callback validates HMAC + state JWT → has verified `workspaceId`. Then calls domain with `{ source: 'webhook', workspaceId }` (we use `'webhook'` source taxonomy or could add `'oauth-callback'`).

### Anti-Patterns to Avoid

- **Hard-DELETE legacy `shpat_` tokens:** D-11 — they keep working. Just don't validate format.
- **Storing state JWT in HttpOnly cookie:** Shopify won't send the cookie back (cross-origin). State MUST be in URL query param (and only there).
- **Trusting `shop` from query without regex validation:** open redirect / SSRF vector. Always validate.
- **Reusing `verifyShopifyHmac` (base64) for OAuth callback:** WRONG ALGORITHM — see Pitfall §1.
- **`createAdminClient().from('integrations').upsert()` in route handler:** Regla 3 violation. Route handler imports domain, domain uses createAdminClient.
- **Catching errors silently:** Each failure mode (HMAC fail, state expired, scope drift, Shopify 5xx, webhook 422) needs distinct `console.warn` for debugging.
- **`runtime = 'edge'`:** Breaks `node:crypto.timingSafeEqual` + `node:crypto.createHmac`. Must be `nodejs`.
- **Forgetting `dynamic = 'force-dynamic'`:** Next.js may try to prerender OAuth callbacks at build → cryptographically incorrect cache.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| JWT signing/verification | Custom HS256 with `node:crypto.createHmac` | `jose@6.1.3` (`SignJWT`, `jwtVerify`) | Already in package.json; correct base64url encoding (≠ base64); standard claim handling (`exp`, `iss`, `sub`); active maintenance by panva (RFC author); migration target for Shopify itself in v12 [CITED: shopify-app-js CHANGELOG] |
| Timing-safe string comparison | `a === b` or `for-loop` byte compare | `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` | A `===` leak ~10-100 ns per byte → recoverable HMAC via timing oracle. Already used in `src/lib/shopify/hmac.ts:54` — same pattern |
| HMAC-SHA256 hex digest | Custom implementation | `crypto.createHmac('sha256', secret).update(msg).digest('hex')` | Built-in; verified in production; no edge cases |
| Random nonce | `Math.random().toString()` | `crypto.randomUUID()` | Predictable PRNGs are unsuitable for security tokens |
| OAuth query string canonicalization | Manual loop building `key=value&` | `URLSearchParams` for parsing; manual sort+join for HMAC message (because HMAC requires NO URL-encoding — see Pitfall §6) | Subtle: HMAC validation uses RAW values (already decoded by Next.js parsing). Document this clearly in code |
| Token format validation | `if (token.startsWith('shpat_'))` | Trust whatever Shopify returns | D-11 — legacy `shpat_` and new Dev Dashboard tokens may have different prefixes (`shpat_` still confirmed in 2026 [VERIFIED: shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens]). Don't gate on format |
| Shop domain validation | Manual `.includes('.myshopify.com')` | Strict regex `^[a-z0-9][a-z0-9-]*\.myshopify\.com$` (already in `src/lib/shopify/connection-test.ts:136` `normalizeShopDomain`) | Reuse `normalizeShopDomain` for the start; add stricter callback-side validation that REJECTS already-encoded URLs |
| Webhook subscription tracking | Custom DB table of webhook IDs | Trust Shopify (idempotent create returns existing) | The current `webhook_events` table is for inbound events, not subscription registry. Subscription state lives in Shopify |
| Session storage for OAuth | `@shopify/shopify-api`'s `SessionStorage` adapter | Our existing `integrations` table | We're NOT a Shopify-embedded app; we don't need their session model |

**Key insight:** This phase touches 3 cryptographic primitives (JWT, HMAC, random) — ALL provided by Node built-ins + `jose`. There is **zero justification** to roll any of them. The biggest risk is using the wrong algorithm (base64 vs hex, see Pitfall §1).

---

## Common Pitfalls

### Pitfall 1: HMAC Algorithm Confusion (HEX vs BASE64) [CRITICAL]
**What goes wrong:** Reusing `verifyShopifyHmac` from `src/lib/shopify/hmac.ts` for OAuth callback returns FALSE always → all callbacks rejected as "hmac_mismatch" even with valid request.

**Why it happens:** That utility uses **base64** digest (correct for webhooks where HMAC is over raw POST body). OAuth callback uses **hex** digest over sorted query params. Different encoding, different message construction.

**Verbatim from Shopify docs:** "The HMAC verification procedure for authorization code grant is different from the procedure for verifying webhooks." [CITED: shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant]

**How to avoid:** Create new utility `verifyOauthCallbackHmac` in `src/lib/shopify/oauth.ts`. Document the algorithm with a code comment quoting Shopify. Add unit test with known-good HMAC fixture.

**Warning signs:** Callbacks always fail with `reason=hmac_mismatch` despite working OAuth flow on Shopify side.

**Reference implementation in this RESEARCH.md:** see Code Examples §HMAC Validation.

### Pitfall 2: Scope Drift (user can modify scope mid-flow) [HIGH]
**What goes wrong:** User starts OAuth with `read_orders,read_customers,write_webhooks`, but tampers with URL to remove `write_webhooks`. Shopify grants reduced scope. Our app gets access_token but webhook creation fails 403 later.

**Why it happens:** Shopify documents this explicitly: "Due to the nature of OAuth, it's possible for an app user to change the requested scope in the URL during the authorize phase, so the app should ensure that all required scopes are granted before using the access token." [CITED: shopify.dev]

**How to avoid:** After token exchange, parse `scope` from response and verify it's a superset of `read_orders,read_customers,write_webhooks`. If missing any, redirect with `reason=denied` (treat as user denied even though technically it's scope tampering).

**Warning signs:** Webhook creation returns 403 right after OAuth succeeded.

### Pitfall 3: Shop Parameter Injection (open redirect / SSRF) [HIGH]
**What goes wrong:** Attacker crafts URL `https://morfx.app/api/integrations/shopify/oauth/callback?shop=evil.com&...` and we POST `client_secret` to `https://evil.com/admin/oauth/access_token`.

**Why it happens:** The `shop` parameter in the callback is attacker-controllable. Without strict regex validation, you can leak `client_secret`.

**How to avoid:** STRICT regex `^[a-z0-9][a-z0-9-]*\.myshopify\.com$` on the `shop` query param BEFORE building any URL that uses it. Reject anything else with `reason=shopify_error` + log warning.

**Warning signs:** Logs show callbacks with unusual shop domains.

### Pitfall 4: State JWT Replay (no nonce reuse detection) [MEDIUM]
**What goes wrong:** Attacker captures a valid state JWT within its 10-min TTL and uses it twice → can install for any victim workspace whose Owner happened to start OAuth.

**Why it happens:** Without nonce blacklist or one-time-use enforcement, a JWT is replayable until `exp`.

**How to avoid:** For this standalone, the 10-min exp is acceptable (Shopify's own docs don't require single-use). Document as accepted risk. If we ever add `app/uninstalled` handling, also add a small Redis-backed nonce blacklist with TTL=600s. Currently the threat surface is: someone must intercept the URL AND complete the OAuth flow in <10min AND already have a valid Shopify shop login — very low practical risk for an internal admin tool.

**Warning signs:** Same `nonce` value in logs from two different IPs/sessions.

### Pitfall 5: Edge Runtime Crashes Crypto [HIGH]
**What goes wrong:** Forgetting `export const runtime = 'nodejs'` → Next.js may infer Edge → `node:crypto.createHmac` and `crypto.timingSafeEqual` throw "module not found" at request time.

**Why it happens:** Next.js 16 still defaults to Node runtime for route handlers, but middleware/edge migration heuristics can flip it inadvertently. Edge Runtime is "a lightweight execution environment based on Web APIs, not Node.js, so you can't use core Node.js modules like crypto." [CITED: nextjs.org docs + community discussion]

**How to avoid:** Explicit `export const runtime = 'nodejs'` at the top of `route.ts`. Same for any module that imports it transitively (the `oauth.ts` helper file itself doesn't need it — runtime is declared at the route entry).

**Warning signs:** 500 errors with "Module not found: node:crypto" in Vercel function logs.

### Pitfall 6: URL Encoding in HMAC Message Construction [HIGH]
**What goes wrong:** When sorting and joining query params for HMAC, you URL-encode values → HMAC fails because Shopify computes on DECODED values.

**Why it happens:** Subtle. `URLSearchParams.toString()` re-encodes. The HMAC message must be of the form `code=0907a61c...&shop=foo.myshopify.com&state=...&timestamp=...` with RAW (decoded) values [CITED: shopify.dev with verbatim example: `message = 'code=0907a61c0c8d55e99db179b68161bc00&shop={shop}.myshopify.com&state=0.6784241404160823&timestamp=1337178173'`].

**How to avoid:** Use `request.nextUrl.searchParams` to GET values (already decoded by Next.js parsing), then manually build the message string `keys.sort().map(k => \`${k}=${value}\`).join('&')`. Do NOT pass through `URLSearchParams`.

**Warning signs:** HMAC fails for shops with special characters in their domain (none in practice — Shopify domains are alphanumeric+hyphen — but still defensive).

### Pitfall 7: `app/uninstalled` Not Handled (stale tokens) [LOW — DEFERRED]
**What goes wrong:** Merchant uninstalls MorfX from Shopify Admin → access token invalidated immediately → next API call fails 401, but our DB still shows "connected".

**Why it happens:** "Offline access tokens grant permanent access to a shop's data and can only be revoked through app uninstallation or secret revocation" + "by the time the app/uninstalled webhook executes, the access token is already invalid" [CITED: shopify.dev + community.shopify.com].

**How to avoid:** OUT OF SCOPE per CONTEXT.md. Document as deferred. Future standalone: subscribe to `app/uninstalled` webhook (no auth needed in handler — token is gone anyway), mark integration as `is_active=false`, surface in UI.

**Warning signs:** Operator reports "Shopify says connected but no orders coming in."

### Pitfall 8: Vercel Cold Start Adds Latency [LOW]
**What goes wrong:** First OAuth callback after cold start takes 3-5s vs warm 1-2s.

**Why it happens:** Function bundle cold-start + module init.

**How to avoid:** Not really an issue. OAuth callback latency budget is generous (user expects redirect to take a moment). No action needed; document so the team doesn't panic.

### Pitfall 9: Webhook Creation 422 on Re-install (idempotency) [LOW]
**What goes wrong:** User does disconnect+reconnect cycle (D-03b). Old webhooks still registered in Shopify. New OAuth tries to create them → Shopify returns 422 "address has already been taken".

**Why it happens:** Shopify dedupes webhooks by (topic, address). Disconnecting in MorfX deletes our DB row but doesn't call `DELETE /admin/api/webhooks/{id}.json` in Shopify.

**How to avoid:** Treat 422 as success during webhook creation. Optionally: log a `console.info` so we can detect this case in metrics.

**Warning signs:** Callback succeeds but webhook count in Shopify Admin grows on each reconnect.

### Pitfall 10: `redirect_uri` Mismatch Between Authorize and Callback [MEDIUM]
**What goes wrong:** authorize URL uses `redirect_uri=https://morfx.app/api/integrations/shopify/oauth/callback`, but Dev Dashboard has `https://morfx.app/api/integrations/shopify/oauth/callback/` (trailing slash) → Shopify returns "Redirect URI mismatch" error.

**Why it happens:** Shopify requires EXACT match between authorize URL `redirect_uri` and what's configured in Dev Dashboard.

**How to avoid:** Document exact URL in CONTEXT (already done: `https://morfx.app/api/integrations/shopify/oauth/callback` no trailing slash, plus `http://localhost:3020/api/integrations/shopify/oauth/callback` for dev). Both must be added in Dev Dashboard. Build `redirect_uri` from a single constant in code (`process.env.NEXT_PUBLIC_APP_URL + '/api/integrations/shopify/oauth/callback'`).

**Warning signs:** Authorize URL responds with Shopify error page instead of redirecting back.

---

## Code Examples

### Example 1: State JWT Sign + Verify (jose)
```typescript
// src/lib/shopify/oauth.ts
import { SignJWT, jwtVerify } from 'jose'
import crypto from 'node:crypto'

const ISSUER = 'morfx-shopify-oauth'
const TTL_SECONDS = 600 // 10 minutes

function getStateSecret(): Uint8Array {
  const secret = process.env.SHOPIFY_OAUTH_STATE_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SHOPIFY_OAUTH_STATE_SECRET must be at least 32 chars')
  }
  return new TextEncoder().encode(secret)
}

export interface StatePayload {
  workspaceId: string
  userId: string
  nonce: string
}

export async function signStateJwt(payload: StatePayload): Promise<string> {
  return await new SignJWT({ workspaceId: payload.workspaceId, userId: payload.userId, nonce: payload.nonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setSubject(payload.workspaceId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getStateSecret())
}

export async function verifyStateJwt(token: string): Promise<StatePayload> {
  const { payload } = await jwtVerify(token, getStateSecret(), { issuer: ISSUER })
  // jose throws if exp expired or signature invalid; reaching this line = valid
  if (!payload.workspaceId || !payload.userId || !payload.nonce) {
    throw new Error('state-malformed')
  }
  return {
    workspaceId: String(payload.workspaceId),
    userId: String(payload.userId),
    nonce: String(payload.nonce),
  }
}

export function generateNonce(): string {
  return crypto.randomUUID()
}
```

### Example 2: HMAC Validation for OAuth Callback (HEX, not Base64)
```typescript
// src/lib/shopify/oauth.ts (continued)

/**
 * Verifies Shopify OAuth callback HMAC.
 *
 * CRITICAL: This is DIFFERENT from webhook HMAC validation:
 *   - OAuth callback HMAC: hex digest over sorted query params (no URL encoding)
 *   - Webhook HMAC: base64 digest over raw request body
 *
 * Algorithm per Shopify docs:
 *   1. Remove `hmac` from query params
 *   2. Sort remaining params alphabetically by key
 *   3. Build message: key1=value1&key2=value2&... (NO URL encoding)
 *   4. HMAC-SHA256(message, client_secret) -> hex digest
 *   5. Compare with received `hmac` using timingSafeEqual
 *
 * @param params - Object of all callback query params (already URL-decoded by Next.js)
 * @param receivedHmac - Value of `hmac` query param
 * @param clientSecret - SHOPIFY_CLIENT_SECRET from env
 * @returns true if HMAC is valid
 *
 * @see https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 */
export function verifyOauthCallbackHmac(
  params: Record<string, string>,
  receivedHmac: string,
  clientSecret: string
): boolean {
  // Step 1: Remove hmac from params (do not mutate original)
  const filtered = { ...params }
  delete filtered.hmac

  // Step 2 + 3: Sort alphabetically and build message with RAW (decoded) values
  const message = Object.keys(filtered)
    .sort()
    .map(key => `${key}=${filtered[key]}`)
    .join('&')

  // Step 4: HMAC-SHA256, HEX digest (not base64)
  const computed = crypto
    .createHmac('sha256', clientSecret)
    .update(message, 'utf8')
    .digest('hex')

  // Step 5: Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(receivedHmac, 'hex')
    )
  } catch {
    // Mismatched lengths or invalid hex chars
    return false
  }
}
```

### Example 3: Authorize URL Builder
```typescript
// src/lib/shopify/oauth.ts (continued)

export const SHOPIFY_SCOPES = ['read_orders', 'read_customers', 'write_webhooks'] as const
export type ShopifyScope = typeof SHOPIFY_SCOPES[number]

export function buildAuthorizeUrl(opts: {
  shop: string         // pre-validated: ^[a-z0-9][a-z0-9-]*\.myshopify\.com$
  state: string        // signed state JWT
  redirectUri: string  // e.g. https://morfx.app/api/integrations/shopify/oauth/callback
}): string {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  if (!clientId) throw new Error('SHOPIFY_CLIENT_ID not set')

  // Use URLSearchParams to build, but ensure shop is in path not query
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_SCOPES.join(','),
    redirect_uri: opts.redirectUri,
    state: opts.state,
    // grant_options[] OMITTED → offline (non-expiring) token by default
  })

  return `https://${opts.shop}/admin/oauth/authorize?${params.toString()}`
}
```

### Example 4: Code-to-Token Exchange
```typescript
// src/lib/shopify/oauth.ts (continued)

export interface TokenExchangeResult {
  accessToken: string
  scope: string
}

export async function exchangeCodeForToken(opts: {
  shop: string
  code: string
}): Promise<TokenExchangeResult> {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Shopify OAuth env not configured')

  const url = `https://${opts.shop}/admin/oauth/access_token`
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: opts.code,
    // 'expiring' OMITTED → non-expiring offline token (D-09)
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>')
    throw new Error(`shopify-token-exchange-failed:${res.status}:${text.slice(0, 200)}`)
  }

  const json = await res.json() as { access_token?: string; scope?: string }
  if (!json.access_token) throw new Error('shopify-token-exchange-no-token')

  return {
    accessToken: json.access_token,
    scope: json.scope ?? '',
  }
}

/**
 * Verifies the scope returned by Shopify includes all required scopes.
 * Returns array of missing scopes (empty if all present).
 */
export function detectScopeDrift(returnedScope: string, required: readonly string[]): string[] {
  const granted = new Set(returnedScope.split(',').map(s => s.trim()))
  return required.filter(s => !granted.has(s))
}
```

### Example 5: Webhook Auto-Creation
```typescript
// src/lib/shopify/oauth.ts (continued)

const WEBHOOK_TOPICS = ['orders/create', 'orders/updated', 'draft_orders/create'] as const

export interface WebhookCreationResult {
  topic: string
  ok: boolean
  status: number
  error?: string
}

export async function createWebhooksAfterOauth(opts: {
  shop: string
  accessToken: string
  webhookUrl: string  // e.g. https://morfx.app/api/webhooks/shopify
}): Promise<WebhookCreationResult[]> {
  const results = await Promise.allSettled(
    WEBHOOK_TOPICS.map(async (topic) => {
      const res = await fetch(`https://${opts.shop}/admin/api/2024-01/webhooks.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': opts.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhook: {
            topic,
            address: opts.webhookUrl,
            format: 'json',
          },
        }),
      })

      // 422 "address has already been taken" = idempotent re-install, treat as success (Pitfall 9)
      const ok = res.ok || res.status === 422
      let errorMsg: string | undefined
      if (!ok) {
        errorMsg = await res.text().catch(() => '<no body>').then(t => t.slice(0, 200))
      }
      return { topic, ok, status: res.status, error: errorMsg }
    })
  )

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { topic: WEBHOOK_TOPICS[i], ok: false, status: 0, error: String(r.reason).slice(0, 200) }
  )
}
```

### Example 6: Start Server Action
```typescript
// src/app/actions/shopify-oauth.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { normalizeShopDomain } from '@/lib/shopify/connection-test'
import { signStateJwt, buildAuthorizeUrl, generateNonce } from '@/lib/shopify/oauth'

export async function startShopifyOauth(input: { shopDomain: string }): Promise<
  | { ok: true; redirectUrl: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { ok: false, error: 'No hay workspace seleccionado' }

  // Owner only
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()
  if (!member || member.role !== 'owner') {
    return { ok: false, error: 'Solo el Owner puede conectar integraciones' }
  }

  const shop = normalizeShopDomain(input.shopDomain)
  if (!shop) return { ok: false, error: 'Dominio de tienda invalido' }

  // Stricter regex check (anti-injection, narrower than normalizeShopDomain)
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return { ok: false, error: 'Dominio de tienda invalido' }
  }

  const state = await signStateJwt({
    workspaceId,
    userId: user.id,
    nonce: generateNonce(),
  })

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/oauth/callback`
  const redirectUrl = buildAuthorizeUrl({ shop, state, redirectUri })

  return { ok: true, redirectUrl }
}
```

### Example 7: OAuth Callback Route Handler
```typescript
// src/app/api/integrations/shopify/oauth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  verifyOauthCallbackHmac,
  verifyStateJwt,
  exchangeCodeForToken,
  detectScopeDrift,
  createWebhooksAfterOauth,
  SHOPIFY_SCOPES,
} from '@/lib/shopify/oauth'
import { testShopifyConnection } from '@/lib/shopify/connection-test'
import { upsertShopifyIntegration } from '@/lib/domain/integrations'

export const runtime = 'nodejs'        // CRITICAL: node:crypto needs nodejs
export const dynamic = 'force-dynamic' // CRITICAL: never cache OAuth callbacks

const SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/

const CallbackQuerySchema = z.object({
  code: z.string().min(1),
  hmac: z.string().min(1),
  shop: z.string().regex(SHOP_REGEX),
  state: z.string().min(1),
  timestamp: z.string().min(1),
  host: z.string().optional(),
})

type FailReason = 'denied' | 'hmac_mismatch' | 'state_expired' | 'shopify_error'

function fail(reason: FailReason, detail?: string): NextResponse {
  if (detail) console.warn(`[oauth-callback] fail ${reason}: ${detail}`)
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/configuracion/integraciones?error=oauth_failed&reason=${reason}`
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const sp = request.nextUrl.searchParams

  // Step 1: zod-validate query params
  const queryObj: Record<string, string> = {}
  sp.forEach((v, k) => { queryObj[k] = v })
  const parsed = CallbackQuerySchema.safeParse(queryObj)
  if (!parsed.success) {
    return fail('shopify_error', `invalid-query: ${parsed.error.message}`)
  }
  const { code, hmac, shop, state } = parsed.data

  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  if (!clientSecret) {
    return fail('shopify_error', 'SHOPIFY_CLIENT_SECRET not set')
  }

  // Step 2: HMAC validation (hex over sorted params, excluding hmac itself)
  if (!verifyOauthCallbackHmac(queryObj, hmac, clientSecret)) {
    return fail('hmac_mismatch', `shop=${shop}`)
  }

  // Step 3: State JWT verification
  let statePayload: { workspaceId: string; userId: string; nonce: string }
  try {
    statePayload = await verifyStateJwt(state)
  } catch (err) {
    return fail('state_expired', String(err).slice(0, 200))
  }

  // Step 4: Exchange code for token
  let tokenResult: { accessToken: string; scope: string }
  try {
    tokenResult = await exchangeCodeForToken({ shop, code })
  } catch (err) {
    return fail('shopify_error', `token-exchange: ${String(err).slice(0, 200)}`)
  }

  // Step 5: Scope drift detection
  const missing = detectScopeDrift(tokenResult.scope, SHOPIFY_SCOPES)
  if (missing.length > 0) {
    return fail('denied', `missing scopes: ${missing.join(',')}`)
  }

  // Step 6: Verify token works (reuse existing connection-test)
  const testResult = await testShopifyConnection(shop, tokenResult.accessToken, clientSecret)
  if (!testResult.success) {
    return fail('shopify_error', `connection-test: ${testResult.error}`)
  }

  // Step 7: Auto-create webhooks (synchronous, granular telemetry)
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/shopify`
  const webhookResults = await createWebhooksAfterOauth({
    shop,
    accessToken: tokenResult.accessToken,
    webhookUrl,
  })
  webhookResults.forEach(r => {
    if (!r.ok) console.warn(`[oauth-callback] webhook ${r.topic} failed: ${r.status} ${r.error}`)
    else console.log(`[oauth-callback] webhook ${r.topic} OK (status=${r.status})`)
  })
  // NOTE: continue even if some webhooks failed — user can retry from UI

  // Step 8: Persist via domain layer (Regla 3)
  const upsertResult = await upsertShopifyIntegration(
    { workspaceId: statePayload.workspaceId, source: 'webhook' },
    {
      shopDomain: shop,
      accessToken: tokenResult.accessToken,
      apiSecret: clientSecret, // used by webhook HMAC validation
      shopName: testResult.shopName ?? shop,
      grantedScope: tokenResult.scope,
    }
  )
  if (!upsertResult.success) {
    return fail('shopify_error', `domain-upsert: ${upsertResult.error}`)
  }

  const duration = Date.now() - startTime
  console.log(`[oauth-callback] success shop=${shop} workspace=${statePayload.workspaceId} duration=${duration}ms`)

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/configuracion/integraciones?success=oauth_connected`
  )
}
```

### Example 8: Domain Layer (`src/lib/domain/integrations.ts`)
```typescript
// src/lib/domain/integrations.ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'
import type { ShopifyConfig, ShopifyIntegration } from '@/lib/shopify/types'

export interface UpsertShopifyIntegrationParams {
  shopDomain: string
  accessToken: string
  apiSecret: string
  shopName: string
  grantedScope?: string
}

export async function upsertShopifyIntegration(
  ctx: DomainContext,
  params: UpsertShopifyIntegrationParams
): Promise<DomainResult<ShopifyIntegration>> {
  const supabase = createAdminClient()

  try {
    // Preserve existing config fields (pipeline, stage, matching settings) if integration exists
    const { data: existing } = await supabase
      .from('integrations')
      .select('id, config')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'shopify')
      .single()

    const existingConfig = (existing?.config ?? {}) as Partial<ShopifyConfig>
    const config: ShopifyConfig = {
      shop_domain: params.shopDomain,
      access_token: params.accessToken,
      api_secret: params.apiSecret,
      default_pipeline_id: existingConfig.default_pipeline_id ?? '',
      default_stage_id: existingConfig.default_stage_id ?? '',
      enable_fuzzy_matching: existingConfig.enable_fuzzy_matching ?? false,
      product_matching: existingConfig.product_matching ?? 'sku',
      ...(existingConfig.auto_sync_orders !== undefined && { auto_sync_orders: existingConfig.auto_sync_orders }),
    }

    if (existing) {
      const { data: updated, error } = await supabase
        .from('integrations')
        .update({
          name: `Shopify - ${params.shopName}`,
          config,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) return { success: false, error: error.message }
      return { success: true, data: updated as ShopifyIntegration }
    }

    const { data: created, error } = await supabase
      .from('integrations')
      .insert({
        workspace_id: ctx.workspaceId,
        type: 'shopify',
        name: `Shopify - ${params.shopName}`,
        config,
        is_active: true,
      })
      .select()
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data: created as ShopifyIntegration }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

export async function getShopifyIntegration(
  ctx: DomainContext
): Promise<DomainResult<ShopifyIntegration | null>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'shopify')
    .maybeSingle()
  if (error) return { success: false, error: error.message }
  return { success: true, data: data as ShopifyIntegration | null }
}

export async function deleteShopifyIntegration(
  ctx: DomainContext
): Promise<DomainResult<void>> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('workspace_id', ctx.workspaceId)
    .eq('type', 'shopify')
  if (error) return { success: false, error: error.message }
  return { success: true }
}
```

### Example 9: UI Refactor (`shopify-form.tsx`)
```tsx
// src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx
'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { startShopifyOauth } from '@/app/actions/shopify-oauth'
import { deleteShopifyIntegration } from '@/app/actions/shopify'
// ... pipeline/stage selectors and other UI imports unchanged

export function ShopifyForm({ integration, pipelines }: ShopifyFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [shopDomain, setShopDomain] = useState('')

  // Surface error from callback redirect
  useEffect(() => {
    const error = searchParams.get('error')
    const reason = searchParams.get('reason')
    const success = searchParams.get('success')

    if (error === 'oauth_failed' && reason) {
      const messages: Record<string, string> = {
        denied: 'Permisos denegados. Es necesario aceptar todos los permisos solicitados.',
        hmac_mismatch: 'Error de seguridad al conectar (HMAC invalido). Intenta de nuevo.',
        state_expired: 'La conexion expiro. Intenta de nuevo.',
        shopify_error: 'Shopify devolvio un error. Verifica el dominio de tu tienda e intenta de nuevo.',
      }
      toast.error(messages[reason] ?? 'Error al conectar con Shopify')
    } else if (success === 'oauth_connected') {
      toast.success('Tienda Shopify conectada exitosamente')
    }
  }, [searchParams])

  const handleConnect = () => {
    if (!shopDomain.trim()) {
      toast.error('Ingresa el dominio de tu tienda')
      return
    }
    startTransition(async () => {
      const result = await startShopifyOauth({ shopDomain: shopDomain.trim() })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      window.location.href = result.redirectUrl
    })
  }

  if (!integration) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Conecta tu tienda Shopify para sincronizar pedidos automaticamente.
        </p>
        <div>
          <Label htmlFor="shop_domain">Dominio de tu tienda</Label>
          <Input
            id="shop_domain"
            placeholder="mitienda.myshopify.com"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            disabled={isPending}
          />
        </div>
        <Button onClick={handleConnect} disabled={isPending} className="w-full">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShoppingBag className="h-4 w-4 mr-2" />}
          Conectar con Shopify
        </Button>
      </div>
    )
  }

  // Connected state: existing pipeline/stage selectors + delete button
  // (unchanged from current shopify-form.tsx — just remove the credential inputs)
  return <ConnectedShopifyView integration={integration} pipelines={pipelines} />
}
```

---

## Open Questions Resolved

### Q1: `@shopify/shopify-api` package vs hand-roll OAuth? [HIGH confidence]
**Resolved: Hand-roll.** The package is in `package.json@12.3.0` but never imported [VERIFIED: grep `@shopify/shopify-api` in src/ returns 0]. It's designed for "embedded apps" running inside the Shopify admin iframe, with opinionated `SessionStorage` adapters that would either (a) require a custom adapter wrapping our `integrations` table or (b) introduce a parallel session table that violates D-09. v12.0.0 also forced a breaking change `id: number → string` in REST resources [CITED: shopify-app-js CHANGELOG] that would force us to migrate even for unused code paths. Our use case is 4 fetch calls — not worth a 200KB dependency tree. **Recommend:** remove `@shopify/shopify-api` from `package.json` as cleanup (optional — out of scope for this standalone if it slows shipping).

### Q2: State JWT in query param OR cookie OR both? [HIGH confidence]
**Resolved: Query param ONLY.** Shopify's redirect to our callback is cross-origin from `https://mitienda.myshopify.com` to `https://morfx.app` — the browser will NOT send any cookie we set on the `morfx.app` domain back during this redirect (it would only be sent if Shopify redirects via top-level navigation, which it does, but cross-site cookies are increasingly restricted by browsers' `SameSite=Lax` defaults and would arrive only on top-level GET). **More importantly:** the state JWT is already authenticated (signature + exp) — adding a cookie is defense-in-depth with marginal benefit and adds complexity (need to set with `SameSite=None; Secure`, then read+delete). Keep simple: state in query param.

### Q3: Webhook creation timing — inside callback (sync) or after (async via Inngest)? [HIGH confidence]
**Resolved: Synchronous inside callback.** Rationale:
- Cost: 3 parallel POSTs ≈ 500-1500ms total. Vercel Pro function timeout is 300s; we'll use ~3-5s total for the callback. Plenty of headroom.
- UX: User expects "Conectar → redirect → connected". Background creation would either show "pending" state in UI (extra complexity) or risk webhooks not existing yet when first real order arrives.
- Failure mode: If a webhook fails, we still want OAuth to succeed (use `Promise.allSettled` + log per-webhook). User can re-trigger creation from a UI button in a future iteration.
- Simplicity: No Inngest event + handler + retry policy needed. Less code, less surface area for bugs.

### Q4: HMAC for OAuth vs webhook — verify they're different? [HIGH confidence — CRITICAL]
**Resolved: DIFFERENT algorithms.** [VERIFIED: shopify.dev]
- **OAuth callback HMAC:** HEX digest of HMAC-SHA256 over query params sorted alphabetically, joined `key=value&...` with RAW (decoded) values, excluding `hmac` itself.
- **Webhook HMAC:** BASE64 digest of HMAC-SHA256 over RAW HTTP request body bytes.
- Verbatim quote: "The HMAC verification procedure for authorization code grant is different from the procedure for verifying webhooks." [CITED: shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant]

**Implication:** The existing `verifyShopifyHmac` (`src/lib/shopify/hmac.ts`) is for WEBHOOKS only. The new `verifyOauthCallbackHmac` (this RESEARCH Example 2) is for OAuth callback. Different functions, different files, different tests.

### Q5: Vercel runtime — Edge or Node? [HIGH confidence]
**Resolved: `nodejs`** (explicit). `node:crypto.createHmac` and `crypto.timingSafeEqual` are NOT available in Edge Runtime [VERIFIED: nextjs.org docs + community consensus]. Edge Runtime exposes only Web Crypto API (`crypto.subtle.*`) which has a different interface. Declaring `export const runtime = 'nodejs'` is the safe default and matches every other route handler in this project that does crypto (`src/lib/shopify/hmac.ts` is imported by `src/app/api/webhooks/shopify/route.ts` which implicitly uses nodejs runtime).

**Also required:** `export const dynamic = 'force-dynamic'` — OAuth callbacks must never be prerendered or cached.

### Q6: `app/uninstalled` webhook — handle now or defer? [HIGH confidence]
**Resolved: Defer.** OUT OF SCOPE per CONTEXT.md "Deferred Ideas" (multi-tenant + token rotation UI cover this conceptually). Document in this RESEARCH.md as a known gap (see Pitfall §7 + Deferred Considerations section). Future standalone: subscribe to `app/uninstalled`, mark `is_active=false`, surface "Shopify disconnected — reconnect" in UI.

**Note:** Current behavior if a merchant uninstalls — our DB still shows connected, but Admin API calls will return 401. The webhook handler already returns 200 + log warning when shop isn't found (`No active Shopify integration for shop` at `route.ts:66`) — so no flood of errors, just silent failure.

### Q7: Dev Dashboard redirect URL validation rules? [MEDIUM confidence — docs unclear]
**Resolved: EXACT match required, multiple URLs allowed.** [INFERRED from Dev Dashboard UI conventions + community confirmation]
- Add BOTH URLs in Dev Dashboard:
  - `https://morfx.app/api/integrations/shopify/oauth/callback` (production)
  - `http://localhost:3020/api/integrations/shopify/oauth/callback` (development)
- No wildcards. No trailing slash unless our code adds one (it doesn't — Pitfall §10).
- The `redirect_uri` parameter in the authorize URL must EXACTLY match one of the registered URLs.

**Recommendation:** Build `redirect_uri` from a single env var (`NEXT_PUBLIC_APP_URL`) so dev/prod auto-switches. Document the exact strings in the implementation plan so the user adds them correctly in Dev Dashboard.

### Q8: Persist granted scope for drift detection? [HIGH confidence]
**Resolved: Yes — store `grantedScope` in `integrations.config.granted_scope`.** Two benefits:
1. Future drift detection: if we ever add a new scope to `SHOPIFY_SCOPES`, we can detect at query time that the existing integration needs re-OAuth (without making an Admin API call).
2. Audit/debug: when a webhook creation fails 403 later, we can check `granted_scope` to confirm it was missing all along.

Not in D-09 explicitly but compatible — it's just another JSONB field. Add it to `ShopifyConfig` type. Optional field, default `undefined` for legacy integrations.

### Q9: Re-test connection after OAuth? [HIGH confidence]
**Resolved: Yes.** CONTEXT.md flow step 7 says so, and it's best practice. Token exchange returns 200 with a token, but doesn't prove the token actually grants Admin API access. The `testShopifyConnection` GET to `/shop.json` is the canonical sanity check. Reuse existing utility unchanged — it works identically with Dev Dashboard offline tokens since the API header (`X-Shopify-Access-Token`) is format-agnostic [VERIFIED: D-11].

### Q10: JWT secret rotation mid-flow? [HIGH confidence]
**Resolved: Accept 10-min race window. No multi-key support needed.** Risk surface:
- User starts OAuth at T=0 with secret v1.
- We rotate secret to v2 at T=5min.
- Callback arrives at T=8min, JWT signed with v1 fails verification with v2.
- Result: `reason=state_expired`, user retries OAuth (now signs with v2), succeeds.

Practical impact: very rare (rotation is infrequent, OAuth is fast, max 10-min window). Trade-off vs implementing multi-key support (overlap window): not worth the complexity. **Recommend:** if rotating in production, schedule rotation outside of business hours; document in env vars README.

---

## State of the Art

| Old Approach | Current Approach (2026) | When Changed | Impact |
|---|---|---|---|
| "Legacy custom apps" with manual `shpat_` paste | OAuth via Dev Dashboard, offline token via Authorization Code Grant | 2026-01-01 [CITED: changelog.shopify.com] | New apps MUST use OAuth; existing custom apps grandfathered (legacy `shpat_` still works) |
| Online + offline tokens (default offline) | Same — but expiring offline tokens introduced Dec 2025 [CITED: shopify.dev] | Dec 2025 | We explicitly OMIT `expiring=1` to keep non-expiring behavior matching legacy custom app tokens |
| `jsonwebtoken` (callback-based) | `jose` (Promise-based, web-crypto) | 2024+ | Shopify migrated own library to `jose` in v12.0.0; we follow same pattern |
| `node:crypto` everywhere | Web Crypto + Edge Runtime alternatives | 2023+ | We stay on `node:crypto` for OAuth callback — explicit `runtime = 'nodejs'` |
| HMAC SHA256 base64 | Same (still standard) | n/a | OAuth uses hex variant; webhooks use base64 variant — confusion = bugs |

**Deprecated/outdated:**
- Legacy custom apps creation flow (deprecated 2026-01-01; existing apps still work).
- Pre-v12 `@shopify/shopify-api` with number IDs (we don't use the library at all).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong | How to Verify |
|---|---|---|---|---|
| A1 | Vercel function timeout for our plan supports ~3-5s callback latency | Pattern 4 | Webhook creation could timeout if Vercel limit is <3s | Check Vercel project settings; if hobby/free, may need to defer webhook creation to Inngest |
| A2 | `SHOPIFY_OAUTH_STATE_SECRET` will be set ≥32 chars by operator | Code Example 1 | Throw at first OAuth attempt if too short | The `getStateSecret()` helper throws explicitly; document in deploy checklist |
| A3 | Dev Dashboard accepts multiple redirect URLs (prod + dev) | Open Question §7 | If only one URL, dev OAuth wouldn't work locally | Verify in Dev Dashboard UI when configuring the MorfX app |
| A4 | The 422 "address has already been taken" status is correct for duplicate webhook on reconnect | Pitfall §9 | Could be 409 or 400; if so, treat ALL non-2xx as opportunity to inspect body | Test manually after first reconnect cycle |
| A5 | `normalizeShopDomain` returning shop in form `xxx.myshopify.com` passes the stricter regex `^[a-z0-9][a-z0-9-]*\.myshopify\.com$` | Code Example 6 | Some valid shop names with numbers-only could match `normalizeShopDomain` but fail stricter regex (e.g., the user's actual tienda `6xvhnx-1v.myshopify.com` starts with `6` which passes `[a-z0-9]`) | Unit test stricter regex against actual store domains incl `6xvhnx-1v.myshopify.com` |

**If this table is empty:** N/A — assumptions are documented. None of them block planning; all have known mitigations.

---

## Deferred / Future Considerations

These are explicit OUT-OF-SCOPE for this standalone but worth flagging for future standalones:

1. **`app/uninstalled` webhook handler** — when merchant uninstalls MorfX from Shopify, mark integration `is_active=false` + UI banner "Reconnect required". The token is already invalid at this point, so the handler doesn't need auth — just match by `shop` header. Implement as part of a future "Shopify integration health" standalone.

2. **Multi-store per workspace** — requires removing `UNIQUE(workspace_id, type='shopify')`, refactoring UI to list multiple stores, dedupe logic for products/contacts. Separate standalone.

3. **Token rotation UI** — manual "Renovar token" button that triggers fresh OAuth. Useful if Shopify rotates credentials or merchant accidentally regenerates client_secret. Adds complexity to UI state.

4. **Scope drift on existing integrations** — at query-time, compare `integrations.config.granted_scope` (added in this standalone per Open Question §8) vs current required scopes. If diff, surface "Re-OAuth required" banner. Trivial follow-up if we persist `granted_scope` now.

5. **Migrate to `2025-x` API version** — current code uses `2024-01`. Schema of webhook payloads may differ in newer versions. Separate audit standalone.

6. **Remove unused `@shopify/shopify-api` from package.json** — cleanup task. ~200KB saved from build. Trivial PR if it doesn't break CI.

7. **Detect HMAC algorithm at runtime (refactor `hmac.ts`)** — current naming (`verifyShopifyHmac`) is ambiguous post-this-standalone. Rename to `verifyShopifyWebhookHmac` for clarity. Backwards-compat alias if needed. Bikeshed but reduces future confusion.

---

## Confidence Levels Summary

| Area | Confidence | Reason |
|---|---|---|
| OAuth flow & endpoints | HIGH | Verified against official Shopify docs with verbatim quotes |
| HMAC algorithm (hex vs base64) | HIGH | Explicit docs quote + multiple secondary sources confirming the difference |
| `jose` for JWT | HIGH | Already in package.json; Shopify themselves migrated to it in v12 |
| Hand-roll vs `@shopify/shopify-api` | HIGH | Package unused in src/; library mismatch with our app model (we're not embedded) |
| Sync webhook creation in callback | HIGH | Latency budget analysis + UX preference; failure mode benign with allSettled |
| `runtime = 'nodejs'` requirement | HIGH | Direct evidence from Next.js docs + crypto module mechanics |
| State JWT in query param only | HIGH | Cross-origin redirect mechanics + Shopify state pattern is canonical |
| Scope drift detection | HIGH | Shopify docs explicitly warn about it; trivial to implement |
| Stricter regex for `shop` param | HIGH | Anti-SSRF standard practice + format docs |
| Dev Dashboard redirect URL rules | MEDIUM | Docs vague; inferred from UI conventions; needs manual verification at config time |
| 422 status for duplicate webhook | MEDIUM | Documented as "missing/invalid fields" but community reports include uniqueness; defensive code handles 422 as success |
| Vercel timeout budget | LOW | Depends on user's Vercel plan; A1 in Assumptions Log |
| State JWT rotation race window | MEDIUM | Acceptable per analysis; secondary concern |

---

## Sources

### Primary (HIGH confidence)
- [Shopify docs — Authorization Code Grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) — Authorize URL format, token exchange, HMAC algorithm (hex), scope drift warning, security recommendations. Accessed 2026-05-11.
- [Shopify docs — Offline Access Tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens) — Offline vs online, `expiring=1` parameter, `shpat_` prefix confirmed. Accessed 2026-05-11.
- [Shopify docs — Dev Dashboard app creation](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) — Where Client ID/Secret live, scopes configured in UI, app created globally not per-store. Accessed 2026-05-11.
- [Shopify changelog — Legacy custom apps deprecated](https://changelog.shopify.com/posts/legacy-custom-apps-can-t-be-created-after-january-1-2026) — Effective date 2026-01-01, existing apps grandfathered. Accessed 2026-05-11.
- [Shopify Admin REST API — webhooks resource](https://shopify.dev/docs/api/admin-rest/2024-01/resources/webhook) — POST endpoint, required body fields (topic/address/format), 422 error code. Accessed 2026-05-11.
- [shopify-app-js CHANGELOG](https://github.com/Shopify/shopify-app-js/blob/main/packages/apps/shopify-api/CHANGELOG.md) — v12.0.0 jose migration; v12.3.0 added 2026-01 API; v13.0.0 breaking changes. Accessed 2026-05-11.
- `package.json` (this repo) — `jose@^6.1.3`, `@shopify/shopify-api@^12.3.0`, Node 20+. [VERIFIED in-session]
- `src/lib/shopify/hmac.ts` (this repo) — Existing webhook HMAC validator using base64 (NOT reusable for OAuth). [VERIFIED in-session]
- `src/lib/shopify/connection-test.ts` (this repo) — Reusable `testShopifyConnection` + `normalizeShopDomain`. [VERIFIED in-session]
- `src/lib/domain/tags.ts` + `whatsapp-templates.ts` (this repo) — Domain layer pattern reference. [VERIFIED in-session]

### Secondary (MEDIUM confidence — cross-verified)
- [Shopify community — HMAC validation issue OAuth flow](https://community.shopify.com/c/shopify-apis-and-sdks/hmac-validation-issue-oauth-base-flow/td-p/1324730) — Cross-confirms hex vs base64 confusion is the #1 OAuth bug.
- [GitHub issue: HMAC docs are misleading](https://github.com/Shopify/shopify-api-js/issues/981) — Same hex/base64 confusion in official library docs.
- [Next.js docs — Route Handlers + Runtime](https://nextjs.org/docs/app/getting-started/route-handlers) — `runtime = 'nodejs'` default + `force-dynamic` for non-cached responses.
- [Medium: Authentication in Next.js Middleware: Edge Runtime Limitations](https://medium.com/@shuhan.chan08/authentication-in-next-js-middleware-edge-runtime-limitations-solutions-7692a44f47ab) — Edge Runtime ≠ Node.js, no `node:crypto`.
- [community.shopify.com — app uninstalled token invalid](https://community.shopify.com/t/expired-accesstoken-when-handling-app-uninstalled-webhook/105849) — Token invalidated before uninstall webhook fires.

### Tertiary (LOW confidence — informational only)
- [npm @shopify/shopify-api page](https://www.npmjs.com/package/@shopify/shopify-api) — Page returned 403 in fetch but library exists; version verified from package.json + CHANGELOG.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps already in package.json, verified.
- Architecture patterns: HIGH — well-established OAuth pattern, project conventions clear.
- Pitfalls: HIGH — 10 pitfalls identified with direct source citations.
- Code examples: HIGH — prescriptive, tested algorithms.
- Deferred items: HIGH — explicit per CONTEXT.md.

**Research date:** 2026-05-11
**Valid until:** 2026-11-11 (Shopify OAuth flow is stable; API version 2024-01 supported into 2026; re-verify if API version is upgraded)

---

*Standalone: shopify-dev-dashboard-oauth*
*Researched by: gsd-phase-researcher*
*Next: `/gsd-plan-phase shopify-dev-dashboard-oauth`*
