# Eliminar conversation_tags — Conversaciones reflejan tags del contacto

## Objetivo

Eliminar la tabla `conversation_tags` y hacer que las conversaciones de WhatsApp muestren los tags del **contacto** asociado. Cuando el usuario agrega un tag desde WhatsApp (botón "+"), se agrega al contacto, no a la conversación.

## Motivación

- Los tags estaban desincronizados entre contacto, pedido y conversación
- Se hizo limpieza manual: todos los conversation_tags de Somnio ya están reflejados en contact_tags (320/320)
- La automatización `assign_tag` nunca escribía a conversation_tags — solo contacto/pedido
- El bot CRM era el único que ponía WPP en conversation_tags (se va a cambiar a contacto en otro PR)
- Mantener 3 tablas de tags sincronizadas es innecesario — contacto es la fuente de verdad

## Cambios necesarios

### 1. UI: `conversation-tag-input.tsx`
- **Actualmente**: `addTagToConversation(conversationId, tagId)` / `removeTagFromConversation(conversationId, tagId)`
- **Cambiar a**: Operaciones sobre el contacto del conversation: `addTagToContact(contactId, tagId)` / `removeTagFromContact(contactId, tagId)`
- Necesita recibir `contactId` como prop (viene de `conversation.contact_id`)
- Si la conversación NO tiene contacto, deshabilitar el "+" o mostrar mensaje

### 2. UI: `contact-panel.tsx`
- **Actualmente**: Muestra 2 secciones separadas: "Etiquetas de chat" + "Etiquetas de contacto"
- **Cambiar a**: Una sola sección "Etiquetas" que muestra contact_tags
- Eliminar la distinción entre tags directos e inherited

### 3. UI: `conversation-item.tsx` (badge en inbox)
- **Actualmente**: Muestra `conversation.tags` (de conversation_tags)
- **Cambiar a**: Mostrar `conversation.contactTags` (de contact_tags via contacto)

### 4. UI: `chat-header.tsx`
- **Actualmente**: Pasa `conversation.tags` al ConversationTagInput
- **Cambiar a**: Pasar `conversation.contactTags` y `conversation.contact_id`

### 5. Server actions: `src/app/actions/conversations.ts`
- **`getConversations()`** (línea 53-57): Eliminar join a conversation_tags, solo traer contactTags via contact_id → contact_tags
- **`getConversation()`** (línea 145-148): Igual, eliminar conversation_tags join
- **`getConversationTags()`** (línea 699-723): Eliminar o reescribir para leer contact_tags
- **`addTagToConversation()`** (línea 622-665): Reescribir como `addTagToContact` o redirigir a domain/tags.assignTag con entityType 'contact'
- **`removeTagFromConversation()`** (línea 670-694): Igual, redirigir a contact

### 6. Hook realtime: `src/hooks/use-conversations.ts`
- **Actualmente**: Suscripción a tabla `conversation_tags` (línea 353-377)
- **Cambiar a**: Suscripción a `contact_tags` y mapear cambios a conversaciones via contact_id
- O suscribirse a ambos durante transición

### 7. Domain: `src/lib/domain/tags.ts`
- **`assignTag()`**: Eliminar case 'conversation' del junctionMap (línea 84)
- **`removeTag()`**: Eliminar case 'conversation' del junctionMap (línea 207)
- O dejarlo por backwards compat pero que no se use

### 8. Webhook processor: `src/lib/agents/production/webhook-processor.ts`
- **`conversationHasAnyTag()`** (línea 427-467): Simplificar — solo buscar en contact_tags via conversation.contact_id
- Ya busca en ambos (conversation_tags + contact_tags), solo eliminar la parte de conversation_tags

### 9. Types: `src/lib/whatsapp/types.ts`
- **`ConversationWithDetails`**: Eliminar `tags` (conversation tags), renombrar `contactTags` a `tags` o simplificar

### 10. Conversation list filter: `conversation-list.tsx`
- El filtro por tag debe buscar conversaciones cuyo **contacto** tenga el tag, no conversation_tags

## Archivos afectados (10)

| Archivo | Operación |
|---|---|
| `src/app/(dashboard)/whatsapp/components/conversation-tag-input.tsx` | Rewrite: opera sobre contacto |
| `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` | Simplificar: una sola sección de tags |
| `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` | Cambiar source de tags |
| `src/app/(dashboard)/whatsapp/components/chat-header.tsx` | Pasar contactTags + contactId |
| `src/app/(dashboard)/whatsapp/components/conversation-list.tsx` | Filtro por contact_tags |
| `src/app/actions/conversations.ts` | Eliminar conversation_tags queries, redirigir writes a contacto |
| `src/hooks/use-conversations.ts` | Cambiar realtime subscription |
| `src/lib/domain/tags.ts` | Eliminar entityType 'conversation' |
| `src/lib/agents/production/webhook-processor.ts` | Simplificar conversationHasAnyTag |
| `src/lib/whatsapp/types.ts` | Simplificar ConversationWithDetails |

## NO tocar

- `order_tags` — se queda igual
- `contact_tags` — se queda igual (es la fuente de verdad ahora)
- `src/lib/automations/action-executor.ts` — assign_tag ya opera sobre contact/order, no conversation
- La tabla `conversation_tags` en DB se deja por ahora (se puede dropear después de verificar)

## Pre-condiciones (YA COMPLETADAS)

- [x] Todos los conversation_tags de Somnio están reflejados en contact_tags (320/320)
- [x] 12 conversaciones sin contact_id fueron vinculadas a su contacto
- [x] 74 tags WPP solo-en-conversación migrados a contacto
- [x] 17 contactos con P/W en pedido pero no en contacto → arreglados
- [x] 0 pedidos P/W sin contacto

## Riesgo

- **GoDentist** tiene 43 conversation_tags propios. Verificar que también estén reflejados en contact_tags antes de eliminar la tabla.
- Conversaciones sin `contact_id` (52 en Somnio) no podrán tener tags — es correcto, primero deben tener contacto.

## Bot CRM (cambio separado, ya tiene contexto)

El bot en `webhook-processor.ts` línea 292-306 pone WPP en conversation. Hay que cambiarlo a contact. Ver `.planning/standalone/conversation-tags-to-contact/BOT-CHANGE-CONTEXT.md` (pendiente, se hace en otro PR o en la misma fase).
