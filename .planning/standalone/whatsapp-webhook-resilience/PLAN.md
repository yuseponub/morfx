# Plan: Resiliencia Webhook WhatsApp (Store-Before-Process)

## Decisión de Diseño

**Opción A: Nueva tabla `whatsapp_webhook_events`** — tabla independiente, zero impacto en Shopify/existente.

Ver `RESEARCH.md` sección 5 para análisis completo de opciones.

## Principios

1. **El payload se persiste ANTES de cualquier procesamiento**
2. **El status se actualiza DESPUÉS del procesamiento**
3. **Cero impacto en el flujo existente** — si el INSERT del evento falla, se continúa procesando normalmente (degradación graceful)
4. **Replay safe** — la deduplicación por `wamid` en `messages` previene duplicados al re-procesar

---

## Tareas

### Tarea 1: Migración SQL — Crear tabla `whatsapp_webhook_events`

**Archivo**: `supabase/migrations/YYYYMMDD_whatsapp_webhook_events.sql`

```sql
-- Tabla para persistir webhooks WhatsApp antes de procesar
-- Permite recovery/replay si el procesamiento falla

CREATE TABLE whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Clasificación del evento
  event_type TEXT NOT NULL CHECK (event_type IN ('message', 'status', 'mixed')),

  -- Identificadores WhatsApp para correlación
  phone_number_id TEXT NOT NULL,
  wa_message_ids TEXT[],           -- Array de wamids contenidos en el payload

  -- Payload completo para replay
  payload JSONB NOT NULL,

  -- Estado de procesamiento
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Índices
CREATE INDEX idx_wa_webhook_events_workspace ON whatsapp_webhook_events(workspace_id);
CREATE INDEX idx_wa_webhook_events_status ON whatsapp_webhook_events(status);
CREATE INDEX idx_wa_webhook_events_created ON whatsapp_webhook_events(created_at DESC);
CREATE INDEX idx_wa_webhook_events_failed ON whatsapp_webhook_events(status, created_at DESC)
  WHERE status = 'failed';

-- RLS
ALTER TABLE whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Solo lectura para miembros del workspace (debugging UI futuro)
CREATE POLICY "wa_webhook_events_member_select"
  ON whatsapp_webhook_events FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT/UPDATE via service role (admin client desde webhook handler)

COMMENT ON TABLE whatsapp_webhook_events IS 'Raw WhatsApp webhook payloads stored before processing for resilience and replay';
```

**Decisiones de schema:**
- `wa_message_ids TEXT[]`: Array porque un payload puede traer múltiples mensajes. Útil para correlación/búsqueda.
- `event_type`: 'message' si solo tiene messages, 'status' si solo statuses, 'mixed' si ambos.
- Sin `retry_count`: El replay es manual por ahora. Si se automatiza en el futuro, se agrega.
- Sin UNIQUE constraint en wamids: Un mismo wamid puede aparecer como duplicado de WhatsApp, y la dedup real está en la tabla `messages`.

### Tarea 2: Helpers de logging en webhook-handler.ts

**Archivo**: `src/lib/whatsapp/webhook-handler.ts` — Agregar al final, antes de los helpers existentes.

```typescript
// ============================================================================
// WEBHOOK EVENT LOGGING (Store-Before-Process)
// ============================================================================

/**
 * Persist raw webhook payload BEFORE processing.
 * Returns event ID for later status update.
 * Returns null if insert fails (degradation — processing continues anyway).
 */
async function logWhatsAppWebhookEvent(
  workspaceId: string,
  phoneNumberId: string,
  payload: WebhookPayload,
): Promise<string | null> {
  try {
    const supabase = createAdminClient()

    // Classify event type and extract wamids
    const allMessages = payload.entry.flatMap(e =>
      e.changes.flatMap(c => c.value.messages ?? [])
    )
    const allStatuses = payload.entry.flatMap(e =>
      e.changes.flatMap(c => c.value.statuses ?? [])
    )

    const hasMessages = allMessages.length > 0
    const hasStatuses = allStatuses.length > 0
    const eventType = hasMessages && hasStatuses ? 'mixed'
      : hasMessages ? 'message'
      : 'status'

    const waMessageIds = [
      ...allMessages.map(m => m.id),
      ...allStatuses.map(s => s.id),
    ].filter(Boolean)

    const { data, error } = await supabase
      .from('whatsapp_webhook_events')
      .insert({
        workspace_id: workspaceId,
        event_type: eventType,
        phone_number_id: phoneNumberId,
        wa_message_ids: waMessageIds,
        payload: payload as unknown as Record<string, unknown>,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[webhook] Failed to log webhook event:', error.message)
      return null
    }

    return data.id
  } catch (error) {
    console.error('[webhook] Failed to log webhook event:', error)
    return null
  }
}

/**
 * Update webhook event status after processing completes.
 */
async function updateWhatsAppWebhookEvent(
  eventId: string,
  status: 'processed' | 'failed',
  errorMessage?: string,
): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase
      .from('whatsapp_webhook_events')
      .update({
        status,
        error_message: errorMessage,
        processed_at: status === 'processed' ? new Date().toISOString() : null,
      })
      .eq('id', eventId)
  } catch (error) {
    // Non-blocking: if we can't update the event status, processing still happened
    console.error('[webhook] Failed to update webhook event status:', error)
  }
}
```

**Nota**: Estas funciones NO usan domain layer (consistente con el precedente de Shopify que escribe directo).

### Tarea 3: Integrar store-before-process en `processWebhook()`

**Archivo**: `src/lib/whatsapp/webhook-handler.ts`

**Cambio en `processWebhook()` (L45-83):**

```typescript
export async function processWebhook(
  payload: WebhookPayload,
  workspaceId: string,
  phoneNumberId: string
): Promise<void> {
  // *** NUEVO: Store raw payload BEFORE processing ***
  const eventId = await logWhatsAppWebhookEvent(workspaceId, phoneNumberId, payload)

  try {
    // Process each entry (código existente sin cambios)
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const { value } = change

        if (value.metadata.phone_number_id !== phoneNumberId) {
          console.warn(`Webhook for different phone: ${value.metadata.phone_number_id}`)
          continue
        }

        if (value.messages && value.messages.length > 0) {
          for (const msg of value.messages) {
            await processIncomingMessage(msg, value, workspaceId, phoneNumberId)
          }
        }

        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            await processStatusUpdate(status, workspaceId)
          }
        }
      }
    }

    // *** NUEVO: Mark as processed ***
    if (eventId) {
      await updateWhatsAppWebhookEvent(eventId, 'processed')
    }
  } catch (error) {
    // *** NUEVO: Mark as failed with error details ***
    if (eventId) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      await updateWhatsAppWebhookEvent(eventId, 'failed', errorMsg)
    }
    throw error  // Re-throw para que route.ts lo capture en su catch
  }
}
```

**Impacto en flujo existente**: CERO. El `try/catch` en `route.ts` (L133-140) sigue funcionando igual. La única diferencia es que ahora el payload está guardado en DB antes de que falle.

### Tarea 4: NO cambiar route.ts

El route handler actual NO necesita cambios:
- Ya retorna 200 siempre (correcto)
- Ya tiene el try/catch para processWebhook
- El store-before-process ocurre DENTRO de processWebhook (como hace Shopify)

---

## Estrategia de Retry/Replay

### Fase actual: Recovery manual

Los eventos `failed` se pueden consultar y re-procesar manualmente:

```sql
-- Ver eventos fallidos
SELECT id, event_type, wa_message_ids, error_message, created_at
FROM whatsapp_webhook_events
WHERE workspace_id = 'xxx' AND status = 'failed'
ORDER BY created_at DESC;

-- Ver payload completo de un evento específico
SELECT payload FROM whatsapp_webhook_events WHERE id = 'xxx';
```

Para re-procesar, se puede:
1. Copiar el payload
2. Enviar un POST al webhook endpoint (con HMAC correcto) — o
3. Llamar `processWebhook()` directamente desde un script

### Fase futura (no implementar ahora)

Si se necesita retry automático:
1. Agregar columna `retry_count` a la tabla
2. Crear un Inngest cron job que busque `status = 'failed' AND retry_count < 3`
3. Re-llamar `processWebhook()` con exponential backoff
4. El sistema de deduplicación por `wamid` garantiza que es safe

---

## Impacto Assessment

| Componente | Impacto |
|-----------|---------|
| `webhook-handler.ts` | MODIFICADO: +2 helpers, +5 líneas en processWebhook |
| `route.ts` | SIN CAMBIOS |
| `domain/messages.ts` | SIN CAMBIOS |
| `webhook-processor.ts` (agentes) | SIN CAMBIOS |
| Shopify webhook handler | SIN CAMBIOS |
| `webhook_events` tabla | SIN CAMBIOS |
| Performance | +~10ms por webhook (1 INSERT) |
| Deduplicación mensajes | Intacta (wamid UNIQUE en messages) |
| Agent routing | Intacto (non-blocking try/catch) |
| Automation triggers | Intactos (emitidos por domain/messages) |

## Criterios de Éxito

1. Todo webhook WhatsApp (message + status) queda persistido en `whatsapp_webhook_events` ANTES de procesarse
2. Eventos procesados correctamente → status 'processed'
3. Eventos que fallan → status 'failed' con error_message
4. Si el INSERT del evento falla → el webhook se procesa normalmente (degradación graceful, no falla por el logging)
5. Zero regresiones en flujo existente (mensajes, agentes, automatizaciones, status updates)
6. Re-procesar un evento guardado no crea duplicados (gracias a wamid UNIQUE)

## Archivos a Modificar

1. `supabase/migrations/YYYYMMDD_whatsapp_webhook_events.sql` — NUEVO
2. `src/lib/whatsapp/webhook-handler.ts` — MODIFICADO (helpers + processWebhook wrapper)

## Archivos NO Modificados

- `src/app/api/webhooks/whatsapp/route.ts`
- `src/lib/domain/messages.ts`
- `src/lib/agents/production/webhook-processor.ts`
- `src/lib/shopify/webhook-handler.ts`
- `supabase/migrations/20260204000004_shopify_integration.sql`
