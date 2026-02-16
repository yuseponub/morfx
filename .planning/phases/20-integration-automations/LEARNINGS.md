# Phase 20: Integration Automations — LEARNINGS

## Resumen
- **Planes ejecutados:** 5 (20-01 a 20-05)
- **Hotfixes durante verificacion:** 5 commits
- **Bugs encontrados en verificacion:** 5

## Bugs Criticos Encontrados

### 1. Fire-and-forget unreliable en Vercel serverless
- **Sintoma:** Trigger emitido segun logs pero automatizacion nunca ejecutada
- **Causa:** `fireAndForget` crea promesa de `inngest.send` sin await. Vercel termina la funcion serverless antes de que el HTTP request a Inngest complete.
- **Fix:** `await (inngest.send as any)({...})` directo en webhook handler
- **Leccion:** En contexto de webhooks/API routes en Vercel, NUNCA usar fire-and-forget para calls criticos. Siempre await. El patron fire-and-forget solo es seguro en server actions donde el response no termina la funcion inmediatamente.

### 2. contactId no disponible en trigger-only mode
- **Sintoma:** "No contactId available in trigger context"
- **Causa:** Shopify trigger-only mode solo emite datos del pedido (phone, name, email) sin resolver contacto
- **Fix:** resolveOrCreateContact() en action executor — busca por phone/email, crea si no existe
- **Leccion:** Triggers externos (Shopify, Twilio, etc.) no siempre tienen IDs internos del CRM. El action executor debe resolver/crear entidades faltantes.

### 3. Ordenes creadas vacias (sin productos ni direccion)
- **Sintoma:** Orden creada por automatizacion tenia $0, sin productos ni direccion
- **Causa:** `executeCreateOrder` solo pasaba pipelineId, stageId, contactId al domain. No usaba datos del trigger context.
- **Fix:** Enriquecer con products, shippingAddress, shippingCity, description desde trigger context
- **Leccion:** Cuando una accion puede ser disparada por triggers ricos en datos (Shopify), pasar los datos disponibles al domain layer.

### 4. Variables {{shopify.phone}} no resolvian
- **Sintoma:** SMS enviado con literal "{{shopify.pho..." como numero destino
- **Causa:** Action executor usaba TriggerContext plano para resolver variables, pero las variables necesitan contexto anidado ({shopify: {phone: ...}})
- **Fix:** Pasar variableContext pre-construido desde el runner a executeAction
- **Leccion:** Variable resolution necesita contexto anidado (buildTriggerContext), no el TriggerContext plano. Son dos estructuras diferentes con propositos diferentes.

### 5. auto_sync_orders se perdia al guardar config
- **Sintoma:** Toggle de auto-sync se reseteaba despues de guardar y recargar
- **Causa:** saveShopifyIntegration construia config sin incluir auto_sync_orders
- **Fix:** Preservar el campo al construir el nuevo config object

## Patrones Clave

### Webhook → Inngest (await obligatorio)
```typescript
// INCORRECTO (unreliable en Vercel):
emitShopifyOrderCreated({...}) // fire-and-forget

// CORRECTO:
await (inngest.send as any)({ name: 'automation/shopify.order_created', data: {...} })
```

### Contact resolution para triggers externos
```typescript
// En executeAction, antes de despachar:
if (!context.contactId && (context.contactPhone || context.contactEmail)) {
  const resolved = await resolveOrCreateContact(workspaceId, ...)
  if (resolved) context = { ...context, contactId: resolved }
}
```

### Dos contextos en automations
- `TriggerContext` (plano): para logica de acciones (contactId, orderId, etc.)
- `variableContext` (anidado): para resolver {{shopify.phone}}, {{contacto.nombre}}
- NUNCA mezclarlos — pasar ambos donde se necesiten

## Commits de Verificacion
- `6e300b2` — scroll wrapper en integraciones page
- `979fd73` — preservar auto_sync_orders
- `aec89cd` — resolve contactId from phone/email
- `1cbd9ce` — enrich create_order with Shopify data
- `05dc198` — await inngest.send (critical)
- `f821849` — auto-create contact
- `ae60d3f` — pass variableContext for variable resolution
