# Phase 11: Shopify Integration - LEARNINGS

## Resumen
Integracion completa de Shopify para sincronizar pedidos automaticamente con MorfX.

## Bugs Encontrados

### 1. SDK de Shopify no funcionaba (404 errors)
**Problema:** El SDK oficial `@shopify/shopify-api` devolvia errores 404 incluso con credenciales validas.
**Causa:** Incompatibilidad del SDK con el entorno de Next.js o configuracion incorrecta.
**Solucion:** Reemplazar el SDK por `fetch` directo. Curl funcionaba perfectamente, asi que el problema era el SDK.
**Prevencion:** Para integraciones simples (REST API), preferir fetch directo sobre SDKs complejos.

```typescript
// ANTES (no funcionaba)
const shopify = shopifyApi({ ... })
const client = new shopify.clients.Rest({ session })
await client.get({ path: 'shop' })

// DESPUES (funciona)
const response = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
  headers: { 'X-Shopify-Access-Token': accessToken }
})
```

### 2. API Secret vs Webhook Signing Secret
**Problema:** La verificacion HMAC fallaba con "Invalid HMAC".
**Causa:** El API Secret de la app es diferente del Webhook Signing Secret.
- **API Secret de la app:** Para autenticar llamadas a la API
- **Webhook Signing Secret:** Para verificar webhooks (en Settings > Notifications > Webhooks)

**Solucion:** Documentar claramente que el usuario debe copiar el Webhook Signing Secret de la pagina de Webhooks, no el API Secret de la app.

### 3. Scroll de pagina cortado
**Problema:** El formulario de configuracion era muy largo y el boton de guardar quedaba cortado.
**Solucion:** Agregar `max-h-[calc(100vh-300px)] overflow-y-auto` al CardContent.

## Decisiones Tecnicas

| Decision | Alternativas | Razon |
|----------|--------------|-------|
| Fetch directo vs SDK | @shopify/shopify-api | SDK tenia bugs, fetch es mas simple y confiable |
| HMAC con crypto.timingSafeEqual | Comparacion directa | Previene timing attacks |
| Fuzzy matching opcional | Siempre activo | Permite al usuario decidir si quiere matches aproximados |
| Productos sin match se crean con SKU SHOPIFY-{id} | Rechazar productos sin match | No perder informacion del pedido |

## Tips para Futuros Agentes

### Configuracion de Shopify
1. El usuario necesita crear una **Custom App** en Shopify Admin > Settings > Apps > Develop apps
2. Los scopes necesarios son: `read_orders`, `read_customers`, `read_products`
3. El **Access Token** se genera al instalar la app (solo se muestra una vez)
4. El **Webhook Signing Secret** esta en Settings > Notifications > Webhooks (al final de la pagina)

### Webhooks
1. Siempre responder 200 (incluso en errores) para evitar retries de Shopify
2. Verificar HMAC ANTES de parsear el JSON
3. Los test webhooks de Shopify tienen timestamps antiguos y datos ficticios - es normal

### Mapeo de Datos
- Contacto: nombre, telefono, email, ciudad, direccion
- Pedido: descripcion, direccion envio, productos
- Productos: match por SKU, nombre o precio segun configuracion

## Deuda Tecnica

1. **Encriptacion de credenciales:** Actualmente se guardan en texto plano en JSONB. Considerar encriptar access_token y api_secret.
2. **Retry de webhooks fallidos:** No hay mecanismo automatico para reintentar webhooks fallidos.
3. **Endpoint oauth/access_scopes:** No funciona para apps legacy, el codigo maneja este caso pero podria mejorarse.

## Metricas

- **Tiempo total fase:** ~3 horas (incluyendo debugging de SDK y HMAC)
- **Archivos creados:** 12
- **Migracion SQL:** 1 (integrations, webhook_events, orders.shopify_order_id)

## Archivos Clave

```
src/lib/shopify/
  connection-test.ts    # Test de conexion con fetch directo
  hmac.ts               # Verificacion HMAC
  phone-normalizer.ts   # Normalizacion de telefonos
  contact-matcher.ts    # Match de contactos (exacto + fuzzy)
  order-mapper.ts       # Mapeo Shopify -> MorfX
  webhook-handler.ts    # Procesamiento de webhooks
  types.ts              # Tipos TypeScript

src/app/api/webhooks/shopify/route.ts  # Endpoint webhook
src/app/actions/shopify.ts              # Server Actions
src/app/(dashboard)/configuracion/integraciones/  # UI de configuracion
```
