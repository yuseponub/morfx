# Plan 01: DB Migration + Channel Abstraction en Domain Layer

## Objetivo
Agregar soporte multi-canal a la base de datos y domain layer sin romper WhatsApp existente.

## Pre-requisitos
- CONTEXT.md revisado y aprobado

## Tareas

### T1: Migration — channel column en conversations
```sql
-- supabase/migrations/YYYYMMDD_add_channel_to_conversations.sql
ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp'
  CHECK (channel IN ('whatsapp', 'facebook', 'instagram'));

-- Recrear unique constraint con channel
ALTER TABLE conversations DROP CONSTRAINT conversations_workspace_id_phone_key;
ALTER TABLE conversations ADD CONSTRAINT conversations_workspace_id_phone_channel_key
  UNIQUE(workspace_id, phone, channel);

-- Subscriber ID para ManyChat (FB/IG no usan phone, usan subscriber_id)
ALTER TABLE conversations ADD COLUMN external_subscriber_id TEXT;
```

**Validacion**: Todas las conversaciones existentes quedan con channel='whatsapp'. Unique constraint sigue funcionando.

### T2: Update domain/conversations.ts — channel-aware findOrCreate
- Agregar `channel` param a `FindOrCreateConversationParams` (default: 'whatsapp')
- Filtrar por `channel` en query de busqueda
- Insertar `channel` al crear nueva conversacion
- Agregar `external_subscriber_id` param opcional

**Validacion**: Callers existentes (WhatsApp webhook) siguen funcionando sin pasar channel (default 'whatsapp').

### T3: Channel API abstraction — src/lib/channels/
Crear:
```
src/lib/channels/types.ts    — ChannelConfig, SendResult interfaces
src/lib/channels/registry.ts — getChannelSender(channel) dispatcher
```

**ChannelConfig interface:**
```typescript
interface ChannelSender {
  sendText(config: ChannelCredentials, to: string, text: string): Promise<SendResult>
  sendImage(config: ChannelCredentials, to: string, imageUrl: string, caption?: string): Promise<SendResult>
}

type ChannelCredentials = {
  channel: 'whatsapp' | 'facebook' | 'instagram'
  apiKey: string  // 360dialog key o ManyChat bearer token
}
```

**WhatsAppSender**: wrapper around existing `send360Text`/`send360Media`
**ManyChatSender**: calls ManyChat sendContent API

### T4: Update domain/messages.ts — channel-aware sending
- `sendTextMessage()`: lookup conversation.channel → dispatch to ChannelSender
- `sendMediaMessage()`: same pattern
- Params: remove `apiKey`, replace with conversation lookup (channel + credentials from workspace)
- OR: keep apiKey but add `channel` to params for routing

**Decision**: Agregar `channel` a params. El caller (messaging adapter) ya tiene la conversacion y puede pasar el channel. Mantener backward compat — si no se pasa channel, asume 'whatsapp' y usa apiKey directamente.

**Validacion**: Todos los tests existentes siguen pasando. WhatsApp sigue igual.

### T5: Update ProductionMessagingAdapter — channel-aware credentials
- `getWhatsAppApiKey()` → `getChannelCredentials(workspaceId, channel)`
- Lookup conversation para obtener channel
- Si whatsapp: retorna whatsapp_api_key
- Si facebook/instagram: retorna manychat_api_key

**Validacion**: WhatsApp messages siguen enviandose identicamente.

## Criterios de Exito
- [ ] Migration aplicada sin errores
- [ ] Todas las conversaciones existentes tienen channel='whatsapp'
- [ ] WhatsApp webhook sigue creando conversaciones correctamente
- [ ] Domain sendTextMessage sigue funcionando para WhatsApp sin cambios en callers
- [ ] Channel sender abstraction existe y WhatsApp sender funciona

## Notas
- IMPORTANTE: Esta migration debe aplicarse en produccion ANTES de pushear el codigo
- Default 'whatsapp' asegura backward compat total
- No se toca el inbox UI en este plan
