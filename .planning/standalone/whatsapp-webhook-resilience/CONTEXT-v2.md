# WhatsApp Webhook Resilience v2 - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning
**Priority:** P0 — Production incident recovery

<domain>
## Phase Boundary

Hardening del pipeline de webhooks de WhatsApp para que nunca mas se pierdan mensajes entrantes. Tres entregables: (1) corregir HTTP response codes para permitir retries de 360dialog, (2) crear mecanismo de replay para eventos fallidos, (3) agregar regla de proceso para prevenir desync de migraciones.

NO incluye: cambios al procesamiento de mensajes, cambios a la UI de WhatsApp, ni cambios al agent routing.

</domain>

<decisions>
## Implementation Decisions

### HTTP Response Codes (route.ts)
- Si el payload se guardo exitosamente en whatsapp_webhook_events (store-before-process OK): retornar HTTP 200 SIEMPRE, incluso si processWebhook() falla. Razon: tenemos el payload para replay.
- Si el payload NO se pudo guardar (tabla no existe, error de conexion a DB, etc): retornar HTTP 500 para que 360dialog reintente el webhook.
- La logica es: "guardado = safe to ACK, no guardado = unsafe, pide retry"

### Replay de Webhooks Fallidos
- Script CLI: `npx tsx scripts/replay-failed-webhooks.ts`
- Solo ejecucion manual (no cron ni auto-replay)
- Filtra eventos con status='failed' de whatsapp_webhook_events
- Llama processWebhook() con el payload guardado
- Exito: marca como status='reprocessed' (nuevo status, distinto de 'processed')
- Fallo: incrementa retry_count, mantiene status='failed'
- Limite: 3 reintentos maximo por evento. Despues de 3 fallos marca como 'dead_letter'
- Necesita agregar columnas: retry_count INTEGER DEFAULT 0, reprocessed_at TIMESTAMPTZ

### Status Flow para whatsapp_webhook_events
- pending → processed (exito en primer intento)
- pending → failed (error en primer intento)
- failed → reprocessed (exito en replay)
- failed → failed (fallo en replay, retry_count++)
- failed → dead_letter (retry_count >= 3)

### Migracion de DB
- Agregar 'reprocessed' y 'dead_letter' al CHECK constraint de status
- Agregar retry_count INTEGER NOT NULL DEFAULT 0
- Agregar reprocessed_at TIMESTAMPTZ

### Regla 5 en CLAUDE.md
- Regla: migracion aplicada en produccion ANTES de pushear codigo que la usa
- Workflow: crear migracion → pausar → pedir al usuario que la aplique → esperar confirmacion → pushear codigo
- NUNCA pushear codigo que dependa de schema que no existe en produccion

### Claude's Discretion
- Formato exacto del output del script de replay (logs, colores, etc)
- Manejo de errores internos del script
- Orden de reprocesamiento (FIFO vs mas recientes primero)

</decisions>

<specifics>
## Specific Ideas

- El incidente real: 20h de mensajes perdidos porque commit 1fbbfe1 agrego processed_by_agent: false al INSERT pero la migracion no estaba aplicada en produccion
- El sistema store-before-process que se diseno para prevenir esto TAMPOCO funciono porque su tabla tampoco existia
- route.ts siempre retornaba HTTP 200, impidiendo que 360dialog reintentara

</specifics>

<deferred>
## Deferred Ideas

- Dashboard UI para ver/replay webhooks fallidos (futuro, por ahora CLI es suficiente)
- Alertas automaticas (email/slack) cuando hay webhooks fallidos
- Metricas de tasa de exito/fallo de webhooks

</deferred>

---

*Phase: standalone/whatsapp-webhook-resilience*
*Context gathered: 2026-02-25*
