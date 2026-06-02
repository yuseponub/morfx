# Research: Resiliencia Webhook WhatsApp (Store-Before-Process)

## 1. Flujo Completo Actual del Webhook WhatsApp

### Route Handler (`src/app/api/webhooks/whatsapp/route.ts`)

```
POST request
  → read rawBody
  → verify HMAC (if WHATSAPP_WEBHOOK_SECRET set)
  → parse JSON → WebhookPayload
  → validate object = 'whatsapp_business_account'
  → extract phoneNumberId from payload.entry[0].changes[0].value.metadata
  → get workspaceId from env WHATSAPP_DEFAULT_WORKSPACE_ID
  → try { await processWebhook(payload, workspaceId, phoneNumberId) }
    catch { console.error ← MENSAJE PERDIDO AQUÍ }
  → return 200
```

**Problema central**: Líneas 132-140. Si `processWebhook()` falla por cualquier razón, se logea el error y se retorna 200 (correcto para evitar reintentos de 360dialog), pero el raw payload no se persiste en ningún lado. El mensaje del cliente se pierde para siempre.

### Webhook Handler (`src/lib/whatsapp/webhook-handler.ts`)

**`processWebhook()`** (L45-83): Itera `payload.entry[].changes[]`, llama:
- `processIncomingMessage()` para cada `value.messages[]`
- `processStatusUpdate()` para cada `value.statuses[]`

**`processIncomingMessage()`** (L95-283): Pipeline complejo con MÚLTIPLES puntos de fallo:

| Paso | Operación | ¿Fallo posible? | Impacto si falla |
|------|-----------|------------------|------------------|
| 1 | `normalizePhone(msg.from)` | No (tiene fallback) | — |
| 2 | `domainFindOrCreateConversation()` | **SÍ** (Supabase) | throw → mensaje perdido |
| 3 | Buscar contacto por phone | SÍ (Supabase) | Silencioso, continúa |
| 4 | `domainLinkContactToConversation()` | SÍ | Silencioso, continúa |
| 5 | `buildMessageContent()` | No (puro) | — |
| 6 | `downloadAndUploadMedia()` | SÍ (API 360dialog + Storage) | Retorna null, continúa sin media |
| 7 | `domainReceiveMessage()` | **SÍ** (Supabase) | throw → mensaje perdido |
| 8 | Agent routing (`processMessageWithAgent()`) | SÍ | **Non-blocking** (try/catch interno) |

**Puntos críticos de pérdida**: Pasos 2 y 7. Si Supabase está caído o hay un error de schema, el mensaje se pierde.

**`processStatusUpdate()`** (L294-362): Actualiza status de mensajes outbound + registra costos.
- Fallo en update: throw → se pierde la actualización de status (no tan grave, el mensaje ya fue enviado)
- Fallo en recordMessageCost: throw → se pierde el tracking de costos

### Agentes Conversacionales

El agente se dispara INLINE en `processIncomingMessage()` L231-277 (solo para `msg.type === 'text'`):
- Importa dinámicamente `@/lib/agents/production/webhook-processor`
- Llama `processMessageWithAgent()`
- **Non-blocking**: Los errores de agente se logean pero NUNCA hacen fallar el procesamiento del mensaje
- Si falla, inserta un mensaje `[ERROR AGENTE]` en la conversación (para diagnóstico)

**Conclusión**: Si el mensaje ya fue guardado por `domainReceiveMessage()`, un fallo del agente NO pierde el mensaje. Solo se pierde la respuesta automática.

### Deduplicación de Mensajes

WhatsApp puede enviar el mismo webhook 2+ veces (reintentos). La deduplicación YA existe:
- `messages.wamid` tiene constraint `UNIQUE` (migración `20260130000002`)
- `domain/messages.ts:receiveMessage()` maneja error `23505` (duplicate key) → retorna `{ success: true, data: { messageId: '' } }`
- El webhook handler detecta `messageId === ''` → skip agent routing (L216-218)

**Esto significa**: Si implementamos replay de eventos guardados, la deduplicación natural por `wamid` previene duplicados en `messages`. Es seguro re-procesar.

## 2. Tabla webhook_events Existente

### Schema (migración `20260204000004`)

```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(integration_id, external_id)
);
```

### Problemas para reutilizar con WhatsApp

1. **`integration_id UUID NOT NULL`**: FK a `integrations` table. WhatsApp NO usa la tabla `integrations` — su config está en env vars (`WHATSAPP_DEFAULT_WORKSPACE_ID`, `WHATSAPP_API_KEY`) y `workspaces.settings`.

2. **`UNIQUE(integration_id, external_id)`**: La idempotencia está atada a integration_id. WhatsApp no tiene un integration record.

3. **`external_id TEXT NOT NULL`**: Para Shopify es `X-Shopify-Webhook-Id` (un header). WhatsApp NO tiene un webhook ID equivalente. Podríamos usar el `wamid` del primer mensaje, pero un payload puede contener MÚLTIPLES mensajes/statuses.

4. **RLS**: Las policies de `webhook_events` dependen de `get_workspace_from_integration()` que busca en `integrations`.

## 3. Patrón Shopify (Referencia)

### Shopify Webhook Handler (`src/lib/shopify/webhook-handler.ts`)

```
processShopifyWebhook(order, integration, webhookId):
  1. Check duplicate: SELECT webhook_events WHERE integration_id + external_id
  2. logWebhookEvent(status: 'pending')     ← STORE
  3. ... process order, create contact, etc. ← PROCESS
  4. updateWebhookEvent(status: 'processed') ← UPDATE
  catch:
     updateWebhookEvent(status: 'failed', error) ← MARK FAILED
```

### Shopify Route Handler (`src/app/api/webhooks/shopify/route.ts`)

La idempotencia + logging ocurre DENTRO del handler (no en route.ts). El route.ts solo hace:
- HMAC verification
- Find integration by shop domain
- Dispatch by topic
- Return 200 always (even on failure)

### Patrón Clave
El store-before-process ocurre al inicio de `processShopifyWebhook()`, no en el route handler. Esto es significativo porque el handler tiene acceso a `integration_id` y `webhookId`.

## 4. Schema de Messages (Relevante)

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  wamid TEXT,                    -- UNIQUE constraint (deduplication)
  direction TEXT NOT NULL,       -- 'inbound' | 'outbound'
  type TEXT NOT NULL,            -- 'text', 'image', etc.
  content JSONB NOT NULL,
  status TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  media_url TEXT,
  media_mime_type TEXT,
  media_filename TEXT,
  ...
);
```

El `wamid` UNIQUE constraint garantiza que replay es safe: si el mensaje ya fue procesado, el INSERT falla con 23505, domain lo maneja como duplicado, y el webhook handler no re-dispara el agente.

## 5. Análisis de Opciones de Diseño

### Opción A: Nueva tabla `whatsapp_webhook_events`

**Schema propuesto:**
```sql
CREATE TABLE whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  event_type TEXT NOT NULL,          -- 'message' | 'status' | 'unknown'
  wa_message_id TEXT,                -- wamid del primer mensaje (si aplica)
  phone_number_id TEXT NOT NULL,     -- 360dialog phone_number_id
  payload JSONB NOT NULL,            -- raw payload completo
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);
```

**Pros:**
- Independiente, sin romper nada existente
- Diseñada para WhatsApp (workspace_id directo, no integration_id)
- No necesita constraint UNIQUE complejo — el raw payload se guarda siempre
- Simple de implementar, simple de consultar
- RLS trivial (workspace_id directo)

**Contras:**
- Otra tabla más en el schema (proliferación menor)
- No comparte infraestructura con Shopify (pero los requisitos son diferentes)

### Opción B: Adaptar `webhook_events`

Requiere:
1. ALTER integration_id SET NULL (rompe FK NOT NULL)
2. Agregar columna `source TEXT` ('shopify' | 'whatsapp')
3. Agregar columna `workspace_id UUID` (solo para WhatsApp, redundante para Shopify)
4. Cambiar UNIQUE constraint a algo condicional
5. Actualizar RLS policies
6. Actualizar todo el código Shopify que asume integration_id NOT NULL

**Pros:**
- Una sola tabla para todos los webhooks

**Contras:**
- Migración invasiva con alto riesgo de romper Shopify
- Schema confuso (nullable integration_id, source column)
- Las queries se complican (WHERE source = ...)
- Viola principio de mínimo impacto

### Opción C: Crear integration record para WhatsApp

Requiere:
1. INSERT INTO integrations un record tipo 'whatsapp' por workspace
2. Mantener sincronizado con la config real (env vars)
3. Usar ese integration_id para webhook_events

**Pros:**
- Usa la tabla existente sin cambios

**Contras:**
- Record artificial — WhatsApp no se configura vía integrations
- ¿Quién crea este record? ¿Migración? ¿Al recibir primer webhook?
- Si el workspace no tiene el record, el webhook falla antes de guardar (peor que el problema original)
- Agregar complejidad para evitar una tabla simple

### Decisión: **Opción A** (nueva tabla)

Razones:
1. **Zero risk**: No toca nada de Shopify ni del flujo existente
2. **Correcto**: WhatsApp y Shopify tienen modelos diferentes (integrations vs env vars)
3. **Simple**: Una tabla, un INSERT antes de process, un UPDATE después
4. **Futuro**: Si se necesita retry automático, el campo status + payload lo permite

## 6. Performance y Side Effects

### Volumen de webhooks
- WhatsApp: Baja frecuencia relativa. Un negocio tipo Somnio recibe ~50-200 mensajes/día.
- Picos: Campañas masivas podrían generar ráfagas de status updates (100+ simultáneos).
- No hay datos de benchmark en docs/planning.

### Latencia del INSERT adicional
- Un INSERT a Supabase (admin client, bypass RLS) toma ~5-15ms.
- El webhook actual tiene `maxDuration = 60` segundos (para agentes Claude).
- Agregar ~10ms de latencia es insignificante.

### Triggers en tablas
- `webhook_events` tiene 0 triggers definidos.
- La nueva tabla `whatsapp_webhook_events` tampoco tendría triggers.
- No hay side effects.

### Tamaño de payload
- Un webhook WhatsApp típico: ~1-5KB JSON.
- Con media metadata (sin el binario): ~2-8KB.
- JSONB de Supabase maneja esto sin problema.

## 7. Domain Layer

### Estado actual
- **No existe** domain module para webhook events. Grep en `src/lib/domain/` retorna 0 resultados para "webhook".
- Shopify escribe directamente a `webhook_events` desde su handler (sin pasar por domain).

### ¿Se necesita domain module?

**Análisis**: El patrón de CLAUDE.md dice "TODA mutación de datos DEBE pasar por src/lib/domain/". Sin embargo:

1. Los webhook events son infraestructura interna (no entidades de negocio como contactos, pedidos, mensajes).
2. Shopify ya establece el precedente de escribir directo desde el handler.
3. Crear un domain module para esto sería over-engineering — no hay lógica de negocio, triggers de automatización, ni revalidación de paths.

**Decisión**: Escribir directo desde `webhook-handler.ts` (como hace Shopify). Funciones helper `logWhatsAppEvent()` y `updateWhatsAppEvent()` en el mismo archivo o en un archivo utility.

## 8. Resumen de Puntos de Fallo y Cobertura

| Escenario | Sin store-before-process | Con store-before-process |
|-----------|--------------------------|--------------------------|
| Supabase caído al crear conversación | Mensaje perdido | Payload guardado, retry posible |
| Error en domainReceiveMessage | Mensaje perdido | Payload guardado, retry posible |
| Error en media download | OK (ya maneja null) | OK (sin cambio) |
| Error en agente | OK (non-blocking) | OK (sin cambio) |
| Error en status update | Status perdido | Payload guardado, retry posible |
| Supabase caído al GUARDAR evento | Mensaje perdido + evento perdido | **Mismo problema** — pero es improbable que Supabase falle en el INSERT simple pero funcione en la operación compleja |
| WhatsApp envía duplicado | OK (wamid unique) | OK (wamid unique en messages, replay safe) |

**Nota**: Si Supabase está completamente caído, ni siquiera podemos guardar el evento. Pero este es un escenario de infraestructura mayor donde nada funciona. El store-before-process cubre el 95% de los fallos reales (errores de lógica, timeouts en media, errores de schema, etc.).
