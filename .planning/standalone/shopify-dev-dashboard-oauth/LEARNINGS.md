# LEARNINGS — shopify-dev-dashboard-oauth

**Standalone shipped:** 2026-05-12
**Status:** SHIPPED. Smoke E2E verificado contra 2 tiendas distintas (`6xvhnx-1v.myshopify.com` + `2db6b1-ea.myshopify.com`) con 2 apps Custom distintas (`morfxconect` + `morfxconectfinal`). 3 webhooks creados y procesando órdenes en producción.

---

## D-13 — Custom distribution = 1 merchant (descubierto durante Plan 01)

**Lección:** El RESEARCH original (D-01) asumía "una app compartida MorfX para todos los workspaces". Eso es **inviable** con Custom distribution.

**Cita oficial Shopify:**
> "Custom apps are not intended to be used by multiple merchants. Installing it on unrelated merchants' stores violates the API terms. Custom apps cannot be installed by more than one Merchant." — [Shopify dev forum](https://community.shopify.dev/t/self-serve-installation-for-custom-non-public-shopify-apps/28011/1)

**Y crear N apps Custom (una por cliente)** también es violación: Shopify lo califica como "private public apps".

**La única vía técnica + legal para multi-tenant SaaS** es Public app (App Store, requiere review).

**Decisión:** Camino B locked — Custom distribution Somnio-only. Multi-tenant deferido a futuro standalone `shopify-public-app-distribution` (cuando llegue el primer cliente MorfX no-Somnio que necesite Shopify).

**Mitigación operacional:** D-15 SQL templates + `platform_config` permite swappear credenciales entre apps Custom de distintos workspaces de testing sin redeploy. Para PROD multi-tenant real → Public app obligatorio.

---

## D-14 — `write_webhooks` no existe; `draft_orders/create` requiere `read_draft_orders`

**Bug en RESEARCH:** El RESEARCH original (líneas 18, 19, 353, 357, 549, 563, 746, 813, 1093) listaba `write_webhooks` como scope necesario. **Ese scope no existe en Shopify.**

**Verdad:**
- Crear webhook subscriptions vía Admin API **no requiere ningún scope dedicado** — basta tener el `read_*` del resource al que te suscribís
- `orders/create` + `orders/updated` → `read_orders`
- `draft_orders/create` → `read_draft_orders` ([WebhookSubscriptionTopic GraphQL docs](https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic): "DRAFT_ORDERS_CREATE — Requires the read_draft_orders scope")

**Lección general:** validar EVERY scope contra docs oficiales antes de planear. Si un scope no aparece en la lista oficial, no existe — no es un bug del UI del Dev Dashboard.

---

## D-15 — Credentials en `platform_config` (no env vars)

**Decisión usuario** al ver lista propuesta de env vars Shopify (CLIENT_ID, CLIENT_SECRET, OAUTH_STATE_SECRET): "no quiero env vars y punto, lo hacemos con migracion y ya".

**Implementación:**
- 3 keys en tabla `platform_config` (Phase 44.1, ya construida): `shopify_oauth_client_id`, `shopify_oauth_client_secret`, `shopify_oauth_state_secret`
- Wrapper nuevo `getShopifyOAuthConfig()` en `src/lib/shopify/oauth-config.ts` envuelve `getPlatformConfig()` con política **fail-CLOSED** (throws si cualquier key falta o `state_secret <32` chars) — override del default fail-open del helper base
- Migración `supabase/migrations/20260512000000_shopify_oauth_credentials.sql` con placeholders `<REPLACE_*>`; usuario corre 3 UPDATE en Supabase Studio con valores reales (Regla 5: aplicar antes del code push)

**Riesgos aceptados:**
- Secret en plaintext en BD (threat surface equivalente a Vercel env vars; ambos requieren team-level auth = service_role o Vercel team)
- 30s cache TTL → tras rotar credenciales, hay ventana de hasta 30s donde lambdas distintas pueden ver valores distintos (documentado en `platform-config.ts`)

**Beneficio operacional descubierto en Plan 07:** swapear credenciales entre apps de testing (`morfxconect` → `morfxconectfinal`) requiere solo 2 UPDATE SQL + 30s wait. Sin redeploy. Sin tocar Vercel UI. Útil para testing multi-store.

---

## Plan 06 regression — `onSubmit` shipped como NO-OP

**Bug:** El executor de Plan 06 reemplazó `saveShopifyIntegration` (legacy) con un placeholder en `shopify-form.tsx`:
```ts
const onSubmit = (_data: ConnectedFormValues) => {
  toast.info('Para cambiar pipeline / etapa / matching: desconecta y reconecta via OAuth.')
}
```

**Reportado por usuario** durante smoke test Plan 07: "cambié los valores y me salió ese toast".

**Root cause:** el agente eliminó el server action viejo (`saveShopifyIntegration`) sin crear su reemplazo (`updateShopifyConfig`), pensando que la lógica preserve-on-OAuth era suficiente. **Pero el operador tiene que poder cambiar pipeline/stage/matching SIN hacer un re-OAuth completo.** Eso es deuda operacional inaceptable.

**Fix inline (commit `ab533c6`):**
- `src/lib/domain/integrations.ts` → nueva función `updateShopifyConfig(ctx, params)` que actualiza solo los 4 campos editables del operador (`default_pipeline_id`, `default_stage_id`, `enable_fuzzy_matching`, `product_matching`), preservando OAuth fields
- `src/app/actions/shopify.ts` → server action `updateShopifyConfig` con auth gate Owner + delega a domain
- `shopify-form.tsx` → `onSubmit` real con `startTransition` + `toast.success/error` + `router.refresh`

**Lección para futuros plans:** cuando se elimine código legacy, verificar TODOS los call paths en el UI y crear reemplazos antes de borrar. El executor debería haber detectado que `saveShopifyIntegration` se llamaba desde `onSubmit` del form y mantener funcionalidad equivalente.

**Mitigación de proceso:** futuros executors podrían agregar al Self-Check un grep de "callers del símbolo eliminado" antes de marcar PASSED.

---

## Custom distribution UX — autorizar stores explícitamente

**Lección:** Después de crear una Custom distribution app, **CADA store que vaya a instalarla debe autorizarse manualmente** en Partner Dashboard → App distribution → Stores → "Add stores".

**Sin esto:** Shopify devuelve `application cannot be found` en vez del install prompt — bug #1 reportado en foros.

**Documentado en Plan 01 Task 1** post-discovery 2026-05-12.

---

## Shopify Dev Dashboard secrets pueden tener prefijo `shpss_`

**Mi assumption original (incorrecta):** los Client Secrets de Dev Dashboard NO tienen prefijo (a diferencia de Legacy custom apps).

**Realidad observada:** ambas apps Dev Dashboard que el usuario creó (`morfxconect`, `morfxconectfinal`) tienen Client Secret con prefijo `shpss_*`. Empíricamente, Shopify Dev Dashboard usa este prefijo igual que las legacy apps.

**Lección:** no descartar credenciales como "wrong type" basándose solo en el prefijo. Validar contra la fuente real (URL del Dev Dashboard donde se ven), no contra heurísticas.

---

## Shopify webhook delivery — NO garantiza orden

**Pregunta usuario durante smoke:** "¿por qué `orders/updated` llegó antes que `orders/create`?"

**Verdad oficial:** ([Shopify dev docs](https://shopify.dev/docs/apps/build/webhooks))
> "Shopify doesn't guarantee ordering within a topic, or across different topics for the same resource."

Webhooks de la misma orden se disparan en paralelo (cuando se crea orden con cliente nuevo, dispara 4: `customers/create`, `customers/update`, `orders/create`, `orders/updated`). El primero en terminar la entrega gana.

**Lección para handlers MorfX:** TODOS los webhook handlers deben ser **idempotentes** + **tolerantes a out-of-order**. El handler actual ya lo es (verificado empíricamente: 3 procesados, 0 fallidos en smoke).

**Si en el futuro se necesita ordenar:** usar header `X-Shopify-Triggered-At` o campo `updated_at` del payload, NO orden de llegada.

---

## State JWT no incluye `shopDomain` — replay accepted risk

**Diseño locked** desde RESEARCH §Pitfall 6:
- `StatePayload = { workspaceId, userId, nonce }` — sin `shopDomain`
- Atacante con state JWT capturado dentro de los 10 min `exp` puede teóricamente OAuth-installar en otra tienda Y el token termina asociado al workspace A en MorfX

**Decisión:** accepted risk. El attack window es 10 min + requiere interceptar el redirect cross-origin en HTTPS. Practical risk muy bajo para una herramienta admin interna.

**Si en el futuro se quiere endurecer:** agregar `shopDomain` al payload del JWT y validar en callback que `state.shopDomain === query.shop`. Cambio menor en `oauth.ts` (3 líneas) + `shopify-oauth.ts` (3 líneas) + `callback/route.ts` (1 if).

---

## `morfx-sandy.vercel.app` ≠ `morfx.app`

**Confusión inicial:** los plans originales asumían `https://morfx.app/api/integrations/shopify/oauth/callback`. Pero `NEXT_PUBLIC_APP_URL` real en `.env.local` y Vercel production = `https://morfx-sandy.vercel.app`.

**Fix aplicado** en commit `df84830`: bulk replace en CONTEXT + plans 01/03/04/05/07/08.

**Lección:** verificar valores reales de env vars antes de hardcodear URLs en plans.

**Si en el futuro `morfx.app` migra como dominio principal:** registrar AMBAS redirect URLs en Dev Dashboard (no romper el legacy mientras se migra) y luego cambiar `NEXT_PUBLIC_APP_URL` en Vercel.

---

## Plan 08 (production cutover $65 USD) cancelado

**Decisión usuario** durante Plan 01: "OK TODO LISTO, SOLO ESTA `6xvhnx-1v.myshopify.com` la otra tienda no la usaremos".

**Interpretación:** la tienda Shopify Plan $65 USD legacy NO se migra al flow nuevo. La tienda productiva de Somnio going forward es `6xvhnx-1v.myshopify.com` (Basic plan, custom domain `www.somniocol.com`), que se conectó via OAuth en Plan 07 smoke.

**Implicaciones:**
- D-03b (cutover) queda obsoleto
- El standalone shippea **sin tocar la integración legacy `shpat_`** (D-11 ya lo permitía: legacy en BD sigue funcionando sin validación de formato)
- Plan 08 marcado como cancelado en task tracker

---

## Patrones reusables para futuros standalones

1. **Pivot pattern para CONTEXT/plans cuando se descubre constraint:** documentar la nueva decisión como D-N (no editar D-1...D-12 originales — preservar audit trail), agregar errata note al RESEARCH si aplica, y bulk-replace via sed en plans subsidiarios. Aplicado 3 veces en este standalone (D-13 distribution, D-14 scopes, D-15 storage).

2. **Wrapper fail-CLOSED sobre helper fail-open:** patrón reusable para credentials sensibles cuando el helper base es fail-open. `getShopifyOAuthConfig()` es plantilla — copiar para futuros providers (Stripe, Twilio v2, etc.) que muevan credenciales a `platform_config`.

3. **D-15 platform_config para credenciales OAuth de providers no-MorfX:** alternative a env vars. Beneficios: rotación operacional vía SQL sin redeploy, swap entre apps de testing sin tocar Vercel UI. Costo: encryption-at-rest no implementada (threat model = service_role access ya tiene blast radius equivalente).

4. **Self-Check de executors debe incluir grep de callers de símbolos eliminados.** Plan 06 regression hubiera sido detectada con `grep -rn "saveShopifyIntegration" src/` antes de borrar. Sugerencia para gsd-executor.md.

---

## Files shipped

| Archivo | Plan | Lines | Tipo |
|---------|------|-------|------|
| `supabase/migrations/20260512000000_shopify_oauth_credentials.sql` | 01 | 22 | Migration |
| `src/lib/domain/integrations.ts` | 02 + fix | 313 | Domain layer (Regla 3) |
| `src/lib/domain/index.ts` | 02 | +1 | Barrel |
| `src/lib/shopify/types.ts` | 02 | +6 | Type extension |
| `src/lib/shopify/oauth-config.ts` | 02 | 183 | Fail-CLOSED helper (D-15) |
| `src/lib/shopify/oauth.ts` | 03 | 441 | OAuth primitives (HMAC HEX, JWT, code exchange, scope drift, webhooks) |
| `src/app/actions/shopify-oauth.ts` | 04 | 170 | Server action `startShopifyOauth` |
| `src/app/api/integrations/shopify/oauth/callback/route.ts` | 05 | 251 | Callback handler (10-step pipeline) |
| `src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx` | 06 | refactor | UI 2-branch + toast |
| `src/app/actions/shopify.ts` | 06 + fix | refactor | delete via domain + updateShopifyConfig |
| `src/app/(dashboard)/configuracion/integraciones/page.tsx` | 06 | refactor | Cleanup legacy instructions |

## Smoke verifications

| Tienda | App | Workspace | Result |
|--------|-----|-----------|--------|
| `6xvhnx-1v.myshopify.com` (somniocol.com) | `morfxconect` | original | ✓ OAuth + 3 webhooks + orden recibida |
| `2db6b1-ea.myshopify.com` | `morfxconectfinal` | secondary | ✓ OAuth completo, integración aparece conectada |

## Operations playbook (para futuras tiendas Somnio o testing)

1. Crear app en `partners.shopify.com` → Dev Dashboard → Custom distribution
2. Authorize la tienda destino en App distribution → Stores
3. Configurar 3 scopes (`read_orders`, `read_customers`, `read_draft_orders`) + 2 redirect URLs (sin trailing slash)
4. Copiar Client ID + Client Secret
5. UPDATE 2 keys en `platform_config` (sin tocar `state_secret`):
   ```sql
   UPDATE platform_config SET value='"<CLIENT_ID>"'::jsonb, updated_at=timezone('America/Bogota', NOW()) WHERE key='shopify_oauth_client_id';
   UPDATE platform_config SET value='"<CLIENT_SECRET>"'::jsonb, updated_at=timezone('America/Bogota', NOW()) WHERE key='shopify_oauth_client_secret';
   ```
6. Esperar 30s (cache TTL `platform_config`)
7. UI MorfX `/configuracion/integraciones` → input dominio + Conectar con Shopify

---

*Standalone shipped 2026-05-12*
*HEAD commit final: TBD post-LEARNINGS commit*
