# Plan 02: ManyChat Webhook + API Client

## Objetivo
Crear el endpoint webhook para recibir mensajes de ManyChat y el cliente API para enviar respuestas.

## Pre-requisitos
- Plan 01 completado (channel en DB + domain layer)

## Tareas

### T1: ManyChat API client — src/lib/manychat/api.ts
```typescript
// Funciones:
sendText(apiKey: string, subscriberId: string, text: string): Promise<ManyChatResponse>
sendImage(apiKey: string, subscriberId: string, imageUrl: string): Promise<ManyChatResponse>
getSubscriberInfo(apiKey: string, subscriberId: string): Promise<SubscriberInfo>
```

Usa ManyChat sendContent API:
- POST https://api.manychat.com/fb/sending/sendContent
- Header: Authorization: Bearer {apiKey}
- Body: dynamic block v2 format

**Validacion**: Unit test con mock HTTP que verifica formato correcto del payload.

### T2: ManyChat webhook handler — src/lib/manychat/webhook-handler.ts
```typescript
processManyChatWebhook(payload: ManyChatWebhookPayload, workspaceId: string): Promise<{ stored: boolean }>
```

Flujo:
1. Parsear payload (subscriber_id, name, message_text, channel_type)
2. Determinar channel: 'facebook' o 'instagram' basado en payload
3. `findOrCreateConversation(ctx, { phone: subscriberId, channel, profileName: name, externalSubscriberId: subscriberId })`
4. Link contact si existe (por nombre o custom field de ManyChat)
5. `receiveMessage(ctx, { ... })` via domain
6. Emitir evento para agente via Inngest

**Validacion**: Mensaje de ManyChat crea conversacion con channel='facebook' y mensaje en DB.

### T3: Webhook route — src/app/api/webhooks/manychat/route.ts
- POST handler
- Auth: verificar header `X-Manychat-Secret` o query param `?secret=`
- Resolver workspace (hardcoded para Somnio por ahora, o por page_id en payload)
- Delegar a `processManyChatWebhook()`
- Retornar 200 inmediatamente (proceso async)

**Validacion**: POST con payload valido retorna 200 y crea conversacion+mensaje.

### T4: Registrar ManyChatSender en channel registry
- Implementar `ManyChatSender` que usa `api.ts`
- Registrar en `getChannelSender('facebook')` y `getChannelSender('instagram')`

**Validacion**: `getChannelSender('facebook').sendText(...)` llama ManyChat API correctamente.

### T5: Inngest event para agent processing
- El webhook handler emite `agent/message.received` (generico) o `agent/facebook.message_received`
- El agent-production Inngest function debe escuchar este nuevo evento
- Pasar `channel` en el event data para que el agent sepa por donde responder

**Decision**: Usar evento generico `agent/channel.message_received` con `channel` en data. O mas simple: reusar `agent/whatsapp.message_received` con campo `channel` extra (backward compat).

**Validacion**: Mensaje de FB/IG trigger el agent-production function.

## Criterios de Exito
- [ ] ManyChat API client envia texto e imagen correctamente
- [ ] Webhook endpoint recibe payload de ManyChat y lo procesa
- [ ] Conversacion se crea con channel='facebook' o 'instagram'
- [ ] Mensaje se guarda en DB con contenido correcto
- [ ] Evento Inngest se emite y agent lo procesa
- [ ] Agent responde y respuesta sale por ManyChat API (no 360dialog)

## Config ManyChat (manual, fuera del codigo)
1. Crear cuenta ManyChat Pro para Somnio
2. Conectar Facebook Page de Somnio
3. Conectar Instagram de Somnio
4. Generar API Key: Settings → API
5. Crear Flow: trigger "New Message" → External Request → POST a /api/webhooks/manychat
6. Guardar manychat_api_key en workspace settings de Somnio
