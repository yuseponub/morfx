# Shopify Dev Dashboard OAuth — CONTEXT

**Gathered:** 2026-05-11
**Status:** Ready for research
**Standalone path:** `.planning/standalone/shopify-dev-dashboard-oauth/`

## Goal

Añadir a MorfX un flujo OAuth (Authorization Code Grant) que permita conectar tiendas Shopify creadas vía **Dev Dashboard** (el flujo nuevo post-1-enero-2026), obteniendo un **offline access token** sin que el usuario tenga que pegar manualmente un `shpat_...` (que ya no existe en el flujo nuevo de Shopify).

## Background / Problema

**Trigger del proyecto:** 2026-05-11, el usuario quiso cambiar la tienda Shopify conectada a MorfX (de la tienda anterior — Shopify plan $65 USD — a una nueva tienda con plan Basic).

**Hallazgo:** Shopify dejó de permitir crear "Legacy custom apps" desde el 1 de enero de 2026 (https://changelog.shopify.com/posts/legacy-custom-apps-can-t-be-created-after-january-1-2026). En su lugar, todas las apps nuevas se crean en el **Dev Dashboard**, que NO entrega `shpat_...` tokens directamente — solo `Client ID` + `Client Secret` que hay que intercambiar vía OAuth por un access token.

**Estado actual de MorfX (verificado en código `src/app/actions/shopify.ts`):**
- La UI (`/configuracion/integraciones`) tiene un form que pide pegar manualmente: `shop_domain`, `access_token` (`shpat_...`), `api_secret` (`shpss_...`)
- El access_token y api_secret se guardan en `integrations.config` (JSONB)
- `testShopifyConnection` (`src/lib/shopify/connection-test.ts`) hace GET a `/admin/api/2024-01/shop.json` con el token en header `X-Shopify-Access-Token`
- Webhook handler (`src/app/api/webhooks/shopify/route.ts`) identifica la tienda por `X-Shopify-Shop-Domain` y valida HMAC con `api_secret`
- Constraint: `UNIQUE(workspace_id, type='shopify')` — 1 tienda por workspace (migración `20260204000004_shopify_integration.sql:61`)

**Causa raíz del problema operativo:** Para conectar la tienda nueva, el usuario intentó crear una app en Shopify pero el flujo nuevo no le da el `shpat_` que el form pide. Bloqueado.

## Phase Boundary

**ENTREGA:**
1. Botón "Conectar con Shopify" en `/configuracion/integraciones` que inicia el OAuth Authorization Code Grant flow
2. Endpoint `/api/integrations/shopify/oauth/callback` que recibe el `code` de Shopify, valida HMAC + state nonce, y lo intercambia por offline access token
3. Auto-creación de los 3 webhooks vía Admin API al terminar el OAuth (scope `write_webhooks`)
4. Reemplazo total de la UI: el form de credenciales manuales (`access_token`, `api_secret`) se elimina
5. Coexistencia silenciosa con integraciones legacy en BD: integraciones existentes con `shpat_` siguen funcionando sin tocar
6. Domain layer nuevo `src/lib/domain/integrations.ts` (Regla 3 CLAUDE.md): toda mutación de la tabla `integrations` pasa por ahí

**FUERA DE SCOPE (deferred):**
- Soporte multi-tienda por workspace (>1 Shopify simultáneas) — standalone follow-up si se necesita
- Migración automática de integraciones legacy — el usuario hará disconnect+reconnect manual de la tienda actual al deployar (ver D-03b)
- UI avanzada de gestión de tokens (rotation manual, estado del token, etc.)
- Upgrade de API version de `2024-01` a versión más reciente — fuera de scope
- Webhook topics adicionales (e.g., `orders/paid`, `customers/create`) — solo los 3 actuales
- Soporte para que clientes externos de MorfX (multi-tenant SaaS) usen sus propias apps de Shopify

## Decisions

### App Model

- **D-01:** Crear UNA app llamada "MorfX" en el Dev Dashboard de Shopify (cuenta del usuario / Somnio Colombia). Credenciales (`Client ID`, `Client Secret`) se guardan en variables de entorno de Vercel (`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`). **Razón:** UX 1-click para conectar; aprovecha que MorfX es la plataforma central.

- **D-13 (Distribution model — REVISIÓN 2026-05-12):** La app MorfX se registra como **Custom distribution**, **scope inicial = solo tiendas de Somnio Colombia**. Razón: Shopify prohíbe explícitamente que apps Custom se instalen en tiendas de merchants no relacionados ("Custom apps are not intended to be used by multiple merchants. Installing it on unrelated merchants' stores violates the API terms" — [Shopify dev docs](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method) + [forum oficial](https://community.shopify.dev/t/self-serve-installation-for-custom-non-public-shopify-apps/28011/1)). Crear N apps Custom (una por cliente) también es violación de ToS ("private public apps"). **Implicaciones:**
  - El standalone shippea funcional **solo para Somnio** (resuelve el trigger original = cambiar la tienda $65 USD por la nueva Basic).
  - Workspaces no-Somnio que intenten conectar Shopify: el OAuth flow se inicia pero Shopify rechazará el install porque la tienda no está autorizada en Custom distribution. El error UX se cubre con D-12 (`reason=shopify_error`).
  - Multi-tenant SaaS (otros clientes MorfX con Shopify) queda **deferred** a un standalone futuro `shopify-public-app-distribution` que requerirá App Store review (semanas, branding, demo video, etc.).
  - **Decisión locked vía Shopify Settings:** "You can't change the distribution method after you select it." Si en el futuro se necesita Public app, será una NUEVA app del Dev Dashboard, no esta. **Razón:** ship rápido del problema operativo de Somnio HOY sin bloquearse meses por App Store review.
  - **Anula la promesa de D-01 original** ("todas las tiendas Shopify de cualquier workspace de MorfX instalan esa misma app"). D-01 quedó simplificada para reflejar el alcance real.

### Multi-store

- **D-02:** Mantener constraint actual `UNIQUE(workspace_id, type='shopify')` — UNA tienda Shopify por workspace. "Conectar nueva tienda" reemplaza la existente (con confirmación). **Razón:** ya es lo que el usuario pidió al inicio (cambiar tienda, no conectar 2); evita refactor de UI + dedupe de SKU/contactos entre tiendas; si en el futuro se necesita multi-store, será un standalone separado con su propio research de dedupe.

### UI Flow

- **D-03:** Reemplazo TOTAL del form de credenciales manuales. Cuando no hay integración: pantalla muestra **input solo para dominio** (`mitienda.myshopify.com`) + **botón "Conectar con Shopify"** que dispara el OAuth flow. Cuando ya hay integración: pantalla muestra info de la tienda conectada + selectors de pipeline/etapa/matching + botón "Eliminar" (igual que hoy). El form viejo de pegar `access_token` + `api_secret` se elimina.

- **D-03b:** Al shippear, el usuario **desconectará manualmente la integración Shopify actual** (la del $65 USD) desde `/configuracion/integraciones` (botón Eliminar) y **la reconectará vía OAuth** con el nuevo flujo. Ningún `shpat_` legacy queda en uso productivo después del ship. **Razón:** estado limpio post-ship, todas las tiendas activas viven en el flujo nuevo.

### Webhooks (decidido por Claude — área no seleccionada por usuario)

- **D-04:** Auto-crear los 3 webhooks vía Admin API al terminar el OAuth: `orders/create`, `orders/updated`, `draft_orders/create`. URL del callback: `${NEXT_PUBLIC_APP_URL}/api/webhooks/shopify`. API version: `2024-01`. Formato: JSON. Scope adicional requerido: `write_webhooks`. **Razón:** elimina paso manual error-prone del usuario (crear webhooks a mano es tedioso, fácil olvidar uno).

### Scopes Solicitados

- **D-05 (REVISIÓN 2026-05-12 — D-14 reemplaza este):** ~~`read_orders, read_customers, write_webhooks`~~ — **OBSOLETA.** Ver D-14.

- **D-14 (Scopes corregidos — descubierto durante Plan 01):** `read_orders, read_customers, read_draft_orders`. Razón:
  - **`write_webhooks` NO existe** como scope en Shopify (verificado en docs oficiales y community 2026-05-12). Era un error en el RESEARCH original. La creación de webhook subscriptions vía Admin API está siempre permitida si tenés el scope del resource — no hay scope "permission to create webhooks" separado.
  - **`draft_orders/create` webhook (D-04) requiere `read_draft_orders`** (verificado en [WebhookSubscriptionTopic GraphQL docs](https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic): "DRAFT_ORDERS_CREATE — Requires the read_draft_orders scope"). Sin este scope, el callback OAuth Plan 05 step 8 fallaría al crear el webhook número 3.
  - El codebase YA procesa `draft_orders/create` (`src/app/api/webhooks/shopify/route.ts:91`, `src/lib/shopify/webhook-handler.ts:340`) — sin el scope nuevo, el OAuth no replica la funcionalidad existente.
  - Lista final: `read_orders` (orders/* webhooks), `read_customers` (customer data), `read_draft_orders` (draft_orders/create webhook).

- **D-15 (Credentials storage — REVISIÓN 2026-05-12):** Las 3 credenciales OAuth (`client_id`, `client_secret`, `state_secret`) se almacenan en la tabla **`platform_config`** (Phase 44.1, ya construida) en vez de Vercel env vars. **Razón:** decisión del usuario para evitar saturar env vars y mantener config OAuth en un solo lugar accesible vía SQL (operacionalmente más simple para 1 tienda Somnio).
  - Keys nuevas: `shopify_oauth_client_id`, `shopify_oauth_client_secret`, `shopify_oauth_state_secret`. Tipo JSONB string en cada caso.
  - Migración necesaria: `INSERT INTO platform_config (key, value) VALUES (...)` aplicada a prod **ANTES del code push** (Regla 5 CLAUDE.md).
  - Lectura runtime via helper existente `getPlatformConfig(key, fallback)` (`src/lib/domain/platform-config.ts`) con cache 30s.
  - **Política fail-CLOSED:** A diferencia del default fail-open de `getPlatformConfig`, las credenciales OAuth se leen vía wrapper nuevo `getShopifyOAuthConfig()` que **THROWS** si cualquiera falta — no podemos hacer OAuth sin secret. Wrapper vive en `src/lib/shopify/oauth-config.ts` (creado en Plan 02 o Plan 03).
  - **Riesgo aceptado:** secret en plaintext en BD. Threat surface equivalente a Vercel env vars (ambos requieren team-level auth = service_role / Vercel team). No se encripta porque Supabase Vault añadiría complejidad y el threat model actual lo justifica.
  - **Anula instrucciones de env vars en Plan 01 originales.** Plan 01 Task 2 reemplazado por: generar migración + aplicarla en prod + verificar via SELECT. Plans 03/04/05 reemplazan `process.env.SHOPIFY_*` por `await getShopifyOAuthConfig()`.

### Technical Defaults

- **D-06 (API version):** `2024-01` para todas las llamadas Admin API y los webhooks. **No upgrade** en este standalone — mantener paridad con código existente para evitar incompatibilidades de schema en webhook payloads.

- **D-07 (HMAC validation):** Validación HMAC obligatoria del callback OAuth usando `SHOPIFY_CLIENT_SECRET` de env vars. Algoritmo: ordenar query params alfabéticamente (excluyendo `hmac`), generar HMAC-SHA256 con `client_secret`, comparar con header `hmac` recibido. Si no match → 401 + redirect con error.

- **D-08 (State nonce):** El parámetro `state` enviado al iniciar OAuth se construye como JWT firmado con secret server-side, payload `{ workspace_id, user_id, nonce, exp: now+10min }`. En el callback se valida: firma JWT, no expirado, nonce no reusado. **Razón:** anti-CSRF + identificación inequívoca del workspace que inició el flow (no se puede confiar en cookies por el redirect cross-origin).

- **D-09 (Storage del token):** Mismo lugar que hoy — `integrations.config.access_token` (JSONB). El offline access token de Shopify se manda en `X-Shopify-Access-Token` exactamente igual que el legacy `shpat_`. La lógica downstream (webhooks, test connection, sync de pedidos) **NO cambia**.

- **D-10 (Domain layer — Regla 3 CLAUDE.md):** Crear `src/lib/domain/integrations.ts` con funciones `upsertShopifyIntegration`, `deleteShopifyIntegration`, `getShopifyIntegration`. Toda mutación de `integrations` pasa por ahí. El callback OAuth y los server actions actuales se refactorizan para llamar al domain layer en vez de `adminSupabase.from('integrations')` directamente.

- **D-11 (Compatibilidad legacy en BD):** Las integraciones existentes en otros workspaces que tengan `shpat_` siguen funcionando — el formato del token NO se valida en código, solo se manda como header. Si por edge case alguien necesita pegar un token manual en el futuro, se hará vía SQL directo (no UI).

- **D-12 (Error UX en OAuth):** Si el callback falla (usuario deniega permisos / HMAC inválido / state expirado / Shopify devuelve error) → redirigir a `/configuracion/integraciones?error=oauth_failed&reason=<denied|hmac_mismatch|state_expired|shopify_error>` y mostrar toast con mensaje en español según el reason. Logs server-side con detalle completo para debugging.

### Claude's Discretion

- Implementación concreta del JWT signing (qué librería usar — probablemente `jose` que ya está en el proyecto o `jsonwebtoken`)
- Diseño visual del botón "Conectar con Shopify" (probablemente botón con logo Shopify + texto, estilo consistente con resto del dashboard)
- Loading states durante el redirect a Shopify y durante el intercambio code→token
- Exact wording de los mensajes de error en D-12

## Canonical References

**Downstream agents (researcher, planner, executor) DEBEN leer estos antes de implementar:**

### Shopify Official Docs
- https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant — Flujo exacto del Authorization Code Grant (URL de autorización, endpoint de intercambio, formato del request/response)
- https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens — Diferencia entre offline (no expira) vs online (24h) tokens; cómo solicitar offline (default, no incluir `expiring=1`)
- https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard — Cómo configurar la app MorfX en Dev Dashboard (redirect URLs, scopes, webhook API version)
- https://changelog.shopify.com/posts/legacy-custom-apps-can-t-be-created-after-january-1-2026 — Contexto del cambio que motivó este standalone

### Código existente MorfX (lectura obligatoria antes de planear)
- `supabase/migrations/20260204000004_shopify_integration.sql` — Schema actual de `integrations` y `webhook_events`; constraint UNIQUE a mantener
- `src/app/actions/shopify.ts` — Server actions actuales (`saveShopifyIntegration`, `testConnection`, `deleteShopifyIntegration`); modelo de auth (workspace cookie + Owner check); patrón a respetar
- `src/lib/shopify/connection-test.ts` — Cómo se valida hoy la conexión y se verifican scopes; el OAuth callback debe hacer el equivalente
- `src/lib/shopify/types.ts` — Tipos `ShopifyConfig`, `ShopifyIntegration`, `IntegrationFormData`; el flujo OAuth debe poblar `ShopifyConfig` igual que hoy
- `src/app/api/webhooks/shopify/route.ts` — Cómo se identifica la tienda y se valida HMAC en webhooks entrantes; NO se toca, pero hay que confirmar que sigue compatible
- `src/app/(dashboard)/configuracion/integraciones/page.tsx` + `shopify-form.tsx` — UI actual que se reemplaza (D-03)

### Reglas del proyecto (CLAUDE.md)
- **Regla 3 (Domain Layer)** — Toda mutación de DB pasa por `src/lib/domain/*`. Crear `src/lib/domain/integrations.ts` (D-10).
- **Regla 5 (Migración antes de Deploy)** — Si se añaden columnas/índices, aplicar migración en prod ANTES del push.
- **Regla 6 (Proteger Agente en Producción)** — No afecta agentes AI, pero sí afecta la operación productiva de Somnio (que recibe pedidos vía Shopify). El cambio de flujo no debe romper el ingreso de pedidos de la tienda vieja hasta que el usuario decida reconectar (D-03b).

## Code Context

### Reusable Assets
- **`src/lib/shopify/connection-test.ts`** — `testShopifyConnection()` se puede reusar para validar el token recién obtenido tras OAuth (post-intercambio code→token). El offline access token funciona idéntico al `shpat_` en el header.
- **`src/lib/shopify/types.ts`** — Tipos `ShopifyConfig`, `ShopifyIntegration` se mantienen sin cambios. El `IntegrationFormData` pierde campos `access_token` y `api_secret` (ya no se ingresan a mano).
- **Tabla `integrations` existente** — Schema sirve sin migración. El `config` JSONB ya admite el offline token sin cambios.
- **HMAC validation pattern** (`src/lib/shopify/hmac.ts`) — patrón ya implementado para webhooks, similar pero NO idéntico al HMAC del callback OAuth (este es sobre query params, no body). Referencia útil.
- **Server action pattern** (`src/app/actions/shopify.ts`) — autenticación (workspace cookie + Owner check) y respuesta tipo `{ success, error }` se reusan en el flow OAuth.

### Established Patterns
- **Workspace identification:** cookie `morfx_workspace` (read-only desde server actions). Para el OAuth callback (que no tiene cookies en el redirect-back), se usa state nonce JWT (D-08).
- **Owner-only mutations:** verificar `workspace_members.role === 'owner'` antes de cualquier mutación de integraciones. El callback debe re-verificar antes de guardar el token.
- **Test before save:** el código actual hace `testShopifyConnection` antes de guardar. Replicar el patrón en el callback OAuth: tras intercambiar code→token, hacer un GET a `/admin/api/2024-01/shop.json` para verificar antes de persistir.
- **Domain layer ausente:** NO existe `src/lib/domain/integrations.ts`. Este standalone lo crea (D-10).

### Integration Points
- **`/configuracion/integraciones` page** — punto de entrada de la UI; cambia el componente `shopify-form.tsx`
- **`/api/integrations/shopify/oauth/callback`** — endpoint NUEVO, archivo a crear: `src/app/api/integrations/shopify/oauth/callback/route.ts`
- **`/api/integrations/shopify/oauth/start`** — endpoint NUEVO (o server action), genera la authorize URL con state JWT y redirige al usuario a Shopify
- **`src/lib/shopify/oauth.ts`** — módulo NUEVO con: `buildAuthorizeUrl`, `exchangeCodeForToken`, `verifyHmac`, `signStateJwt`, `verifyStateJwt`, `createWebhooksAfterOauth`
- **`src/lib/domain/integrations.ts`** — módulo NUEVO con: `upsertShopifyIntegration({ workspaceId, accessToken, shopDomain, ... })`, `getShopifyIntegration`, `deleteShopifyIntegration`
- **Env vars NUEVAS en Vercel:** `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_OAUTH_STATE_SECRET` (para firmar JWT del state)

## Specifics

- **App de Shopify a crear:** "MorfX" en el Dev Dashboard, scopes `read_orders, read_customers, write_webhooks`, redirect URL `https://morfx-sandy.vercel.app/api/integrations/shopify/oauth/callback` (y `http://localhost:3020/...` para dev).
- **Tienda nueva en cuestión:** `6xvhnx-1v.myshopify.com` (plan Basic). El usuario ya creó la app `morfxconect` en esa tienda, pero **se descarta** — usaremos la app compartida MorfX en su lugar (D-01).
- **Tienda actual conectada (a desconectar al ship):** la tienda Shopify $65 USD plan, conectada vía legacy custom app con `shpat_` viejo. Se desconecta y reconecta vía OAuth (D-03b).
- **Flujo end-to-end deseado:**
  1. Usuario va a `/configuracion/integraciones`
  2. Ingresa `mitienda.myshopify.com` y click "Conectar con Shopify"
  3. Server action genera state JWT, redirige a `https://mitienda.myshopify.com/admin/oauth/authorize?client_id=...&scope=read_orders,read_customers,write_webhooks&redirect_uri=...&state=<jwt>`
  4. Usuario autoriza en Shopify
  5. Shopify redirige a `/api/integrations/shopify/oauth/callback?code=X&hmac=Y&shop=Z&state=<jwt>&timestamp=T`
  6. Callback valida HMAC + state JWT + hace POST a `https://mitienda.myshopify.com/admin/oauth/access_token` con `{client_id, client_secret, code}` → obtiene `{access_token, scope}`
  7. Callback valida con GET `/shop.json` que el token funciona
  8. Callback crea los 3 webhooks vía Admin API
  9. Callback llama a domain `upsertShopifyIntegration` que guarda en BD
  10. Redirect a `/configuracion/integraciones?success=oauth_connected` → muestra info de tienda conectada + selectors pipeline/etapa/matching

## Deferred Ideas

- **Multi-tienda por workspace** — si en futuro se quieren 2+ Shopifys en el mismo workspace, requiere: quitar UNIQUE, refactor UI a lista de tiendas, lógica de dedupe SKU/contactos, decidir qué tienda "ownéa" cada pedido. Standalone separado.
- **Token rotation UI** — botón "Renovar token" que dispare OAuth re-install. Útil si Shopify rota credenciales o el usuario revoca permisos. Standalone separado.
- **App pública en Shopify App Store** (PROMOVIDO 2026-05-12 a "futuro standalone obligatorio si llega cliente nuevo con Shopify"): convertir la app MorfX en una app pública listada en el App Store de Shopify. **Es la única vía que Shopify autoriza** para multi-merchant (D-13). Requiere app review (semanas/meses), branding, screenshots, demo video, security questionnaire. Cuando llegue el primer cliente MorfX no-Somnio que necesite Shopify, se abre el standalone `shopify-public-app-distribution`.
- **Soporte multi-tenant SaaS sin Public app** — DESCARTADO. Shopify prohíbe explícitamente "N apps Custom, una por cliente" como violación de ToS ("private public apps"). La única vía técnica + legal es Public app (ver punto anterior).
- **Upgrade API version** — pasar de `2024-01` a `2025-x` o más reciente. Requiere validar que los webhook payloads y los endpoints REST/GraphQL sigan compatibles con el código actual. Riesgoso, mejor en standalone aparte.

---

*Standalone: shopify-dev-dashboard-oauth*
*Context gathered: 2026-05-11*
