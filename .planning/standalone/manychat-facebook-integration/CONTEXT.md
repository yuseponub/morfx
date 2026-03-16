# ManyChat Facebook/Instagram Integration - Somnio

## Objetivo
Integrar Facebook Messenger e Instagram DMs de Somnio en el inbox unificado de MorfX, usando ManyChat Pro ($15/mo) como puente temporal. El mismo agente AI que atiende WhatsApp atiende FB/IG.

## Decisiones del Usuario
- **Solo Somnio** por ahora (GoDentist despues)
- **ManyChat Pro** como puente temporal ($15/mo)
- **Mismo agente AI** atiende FB/IG — adaptar adapters de canal
- **Mismo inbox** — solo diferenciar con iconos (WA vs FB vs IG)
- **Sin automatizaciones** para FB/IG por ahora — solo atencion
- **Temporal** — cuando Meta apruebe API directa, se elimina ManyChat
- Volumen muy bajo en Somnio, plan minimo alcanza

## Flujo Completo
```
Cliente escribe por FB/IG
  → ManyChat recibe el mensaje
  → ManyChat Flow "External Request" → POST /api/webhooks/manychat
    { subscriber_id, name, message_text, channel, page_id }
  → MorfX: webhook handler parsea payload
  → findOrCreateConversation(phone=subscriber_id, channel='facebook'|'instagram')
  → receiveMessage() → guarda en DB
  → Inngest: agent/message.received (misma funcion, con channel)
  → Agent procesa (mismo agente somnio)
  → ProductionMessagingAdapter detecta channel de la conversacion
  → Si whatsapp: domainSendTextMessage → 360dialog
  → Si facebook/instagram: domainSendTextMessage → ManyChat API sendContent
  → Cliente recibe respuesta en FB/IG
```

## Arquitectura Actual (Puntos de Cambio)

### Domain: messages.ts
- `sendTextMessage()` llama directo a `send360Text()` — HARDCODED
- `sendMediaMessage()` llama directo a `send360Media()` — HARDCODED
- **Cambio**: Rutear por channel de la conversacion

### Domain: conversations.ts
- `findOrCreateConversation()` usa unique `(workspace_id, phone)` — sin channel
- **Cambio**: Agregar `channel` param, unique `(workspace_id, phone, channel)`

### Messaging Adapter: production/messaging.ts
- `getWhatsAppApiKey()` — obtiene API key de workspace settings
- `send()` — llama domain con apiKey
- **Cambio**: Obtener credenciales por channel (whatsapp_api_key o manychat_api_key)

### Agent Production: inngest/functions/agent-production.ts
- Trigger: `agent/whatsapp.message_received`
- **Cambio**: Tambien triggear en mensajes de FB/IG (o trigger generico)

### Webhook: api/webhooks/whatsapp/route.ts
- Solo procesa payloads de 360dialog
- **Nuevo**: `/api/webhooks/manychat/route.ts` para ManyChat External Request

## ManyChat API Reference

### Recibir mensajes (External Request en Flow)
ManyChat envia POST a nuestro endpoint con JSON configurable.
Configurar en Flow Builder: trigger "New Message" → External Request → POST a nuestra URL.
Payload configurable con custom fields + system fields.

### Enviar mensajes (sendContent API)
```
POST https://api.manychat.com/fb/sending/sendContent
Authorization: Bearer {MANYCHAT_API_KEY}
Content-Type: application/json

{
  "subscriber_id": 12345,
  "data": {
    "version": "v2",
    "content": {
      "messages": [{ "type": "text", "text": "Hola!" }],
      "actions": [],
      "quick_replies": []
    }
  }
}
```

### Enviar imagen
```json
{
  "subscriber_id": 12345,
  "data": {
    "version": "v2",
    "content": {
      "messages": [{ "type": "image", "url": "https://...", "buttons": [] }],
      "actions": [],
      "quick_replies": []
    }
  }
}
```

### Rate Limits
- sendContent: 25 req/s
- sendFlow: 20 req/s, 100/subscriber/hour
- getInfo: 10 req/s

## DB Migration Needed
```sql
-- 1. Add channel column
ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp'
  CHECK (channel IN ('whatsapp', 'facebook', 'instagram'));

-- 2. Update unique constraint
ALTER TABLE conversations DROP CONSTRAINT conversations_workspace_id_phone_key;
ALTER TABLE conversations ADD UNIQUE(workspace_id, phone, channel);

-- 3. Add external_subscriber_id for ManyChat subscriber tracking
ALTER TABLE conversations ADD COLUMN external_subscriber_id TEXT;
```

## Workspace Settings Extension
```json
{
  "whatsapp_api_key": "existing-360dialog-key",
  "manychat_api_key": "Bearer token from ManyChat Pro",
  "manychat_webhook_secret": "shared secret for webhook auth"
}
```

## Riesgos
1. ManyChat External Request payload no es tan customizable — mitigar con validation
2. subscriber_id es integer, no phone — necesitamos mapear subscriber_id como "phone" para FB/IG
3. ManyChat no tiene delivery status webhooks — no tracking de sent/delivered/read
4. Si ManyChat cae, FB/IG se desconecta — aceptable para temporal
