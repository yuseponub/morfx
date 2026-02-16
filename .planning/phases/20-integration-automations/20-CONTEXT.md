# Phase 20: Integration Automations (Twilio + Shopify) - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Expandir el motor de automatizaciones con Twilio SMS como action type y triggers directos de Shopify (order_created, draft_order_created, order_updated). Incluye configuracion de credenciales, usage tracking, y actualizacion del AI builder para conocer los nuevos triggers/acciones.

**Fuera de scope:** Llamadas telefónicas (make_call) diferidas a fase futura.

</domain>

<decisions>
## Implementation Decisions

### Acciones Twilio (SMS)
- Solo send_sms en esta fase (make_call diferido)
- SMS principal es texto plano, con opcion opcional de adjuntar media (MMS)
- Variables {{path}} reutilizan el sistema existente del action executor ({{contacto.nombre}}, {{orden.id}}, etc.)
- Vista previa en el wizard que muestre como queda el mensaje con datos de ejemplo
- Numero Twilio por workspace: cada workspace configura Account SID + Auth Token + Phone Number propios
- Sin limite de SMS por workspace — el usuario paga directo a Twilio y controla su gasto

### Usage / Costos Twilio
- Costo real consultado via API de Twilio (no precio estimado fijo)
- Dashboard de usage dentro de /configuracion/integraciones, en la seccion de Twilio
- Metricas: total SMS enviados, costo total, lista de ultimos mensajes con costo individual + grafica de costos por dia/semana/mes

### Triggers Shopify
- 3 triggers: shopify.order_created, shopify.draft_order_created, shopify.order_updated
- Comportamiento dual: webhook siempre activo + auto-sync pausable
  - Toggle "Crear ordenes automaticamente" en config de Shopify
  - Si toggle ON: auto-crea contacto+orden (como hoy) Y emite trigger
  - Si toggle OFF: solo emite trigger, automatizaciones deciden que hacer
  - Permite migracion gradual de sync automatico a automatizaciones personalizadas
- Draft orders emiten trigger y el usuario configura que hacer via automatizaciones (flexibilidad total)
- Variables completas del payload Shopify: total, nombre, email, telefono, numero de orden, estado de pago, productos (SKU, cantidad, precio), direccion de envio, tags de Shopify, notas

### Credenciales y Config
- Twilio: formulario simple (3 campos: Account SID, Auth Token, Phone Number) + boton "Probar conexion" que envia SMS de prueba
- Auth Token enmascarado despues de guardar (****XXXX)
- Config de Shopify se extiende (no se redisena): anadir toggle auto-sync + seccion webhooks activos
- Permisos: Owner + Admin pueden configurar integraciones (cambio de Owner-only actual)

### Categorias en Wizard/Builder
- Nueva categoria "Twilio" para acciones (color propio, separada de WhatsApp)
- Nueva categoria "Shopify" para triggers (color propio, separada de CRM)
- Categorias resultantes:
  - Triggers: CRM (azul), WhatsApp (verde), Tareas (amarillo), Shopify (nuevo color)
  - Acciones: CRM (azul), WhatsApp (verde), Tareas (amarillo), Twilio (nuevo color)

### AI Builder
- El meta-agente (AI builder) conoce send_sms y shopify triggers desde el dia 1
- System prompt y tools del builder actualizados para crear automatizaciones como "Cuando llega orden de Shopify, envia SMS al cliente"

### Validacion
- Wizard y builder validan que Twilio este configurado antes de permitir send_sms
- Si no hay credenciales Twilio: bloquear la accion con mensaje de configurar primero
- Misma validacion para triggers Shopify si no hay webhook activo

### Claude's Discretion
- Color especifico para categorias Twilio y Shopify en el wizard
- Diseno exacto del formulario de credenciales y dashboard de usage
- Estructura de la tabla de costos SMS
- Formato de la grafica de costos (bar chart, line chart, etc.)
- Manejo de errores de envio SMS (reintentos, logging)
- Mapeo exacto de campos del payload de Shopify a variables

</decisions>

<specifics>
## Specific Ideas

- Patron de credenciales por workspace igual que 360dialog (WhatsApp) — cada workspace es independiente
- Dashboard de usage de Twilio vive en /configuracion/integraciones, no en pagina separada
- Toggle de auto-sync permite que usuarios avanzados migren a automatizaciones sin perder funcionalidad para usuarios basicos
- Draft orders = flexibilidad total: el trigger emite y las automatizaciones deciden (crear orden, notificar, asignar tag, etc.)

</specifics>

<deferred>
## Deferred Ideas

- **make_call (llamadas automaticas)** — Twilio TTS o audio URL. Diferido a fase futura.
- **Limites de SMS por workspace** — Rate limiting o caps mensuales configurables. No necesario para MVP.
- **Pagina centralizada /costos** — Dashboard que unifique costos de WhatsApp + SMS + agentes. Futura fase.

</deferred>

---

*Phase: 20-integration-automations*
*Context gathered: 2026-02-16*
