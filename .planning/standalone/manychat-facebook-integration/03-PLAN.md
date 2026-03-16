# Plan 03: Inbox UI — Iconos de Canal + Agent Routing Fix

## Objetivo
Mostrar iconos de canal en el inbox y asegurar que el agente responde por el canal correcto.

## Pre-requisitos
- Plan 01 + 02 completados
- ManyChat configurado para Somnio

## Tareas

### T1: Icono de canal en conversation-item
- `src/app/(dashboard)/whatsapp/components/conversation-item.tsx`
- Agregar icono segun `conversation.channel`:
  - 'whatsapp' → icono WhatsApp (verde)
  - 'facebook' → icono Facebook (azul)
  - 'instagram' → icono Instagram (gradient rosa/morado)
- Posicion: al lado del nombre del contacto o como badge

**Validacion**: Conversaciones de WhatsApp muestran icono WA, las de FB/IG muestran su icono.

### T2: Icono de canal en chat-view header
- `src/app/(dashboard)/whatsapp/components/chat-view.tsx`
- Mostrar icono + label del canal en el header del chat activo
- "via WhatsApp" / "via Facebook" / "via Instagram"

**Validacion**: Al abrir una conversacion FB se ve "via Facebook" en el header.

### T3: Agent production routing — channel-aware response
- `src/inngest/functions/agent-production.ts`
- Cuando se procesa un mensaje, pasar `channel` al ProductionMessagingAdapter
- El adapter ya rutea por channel (Plan 01 T5)
- Verificar que NO intenta enviar por 360dialog cuando es FB/IG

**Validacion**: Agente recibe mensaje FB → procesa → responde via ManyChat API.

### T4: Server action sendMessage — channel-aware
- `src/app/actions/conversations.ts` o similar
- Cuando un humano escribe un mensaje desde el inbox, debe rutear por channel
- Si la conversacion es FB/IG → enviar via ManyChat, no 360dialog

**Validacion**: Agente humano escribe mensaje en chat FB → sale por ManyChat.

### T5: Realtime subscription — incluir nuevas conversaciones
- Verificar que Supabase realtime suscripcion incluye conversaciones de todos los channels
- Probablemente ya funciona (filtra por workspace_id, no por channel)

**Validacion**: Nuevo mensaje FB aparece en tiempo real en el inbox.

## Criterios de Exito
- [ ] Iconos de canal visibles en lista de conversaciones
- [ ] Header del chat muestra canal activo
- [ ] Agente AI responde por el canal correcto (FB/IG via ManyChat, WA via 360dialog)
- [ ] Humano puede responder por el canal correcto desde inbox
- [ ] Mensajes nuevos de FB/IG aparecen en tiempo real
- [ ] WhatsApp sigue funcionando exactamente igual

## Testing E2E
1. Enviar mensaje desde Facebook Messenger a Somnio
2. Verificar que aparece en inbox con icono FB
3. Verificar que agente responde automaticamente
4. Verificar que respuesta llega al cliente en Messenger
5. Enviar mensaje desde Instagram DM a Somnio
6. Verificar mismo flujo con icono IG
7. Enviar mensaje de WhatsApp → verificar que sigue igual
