# Phase 9: CRM-WhatsApp Sync - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Sincronizacion bidireccional de tags entre CRM y WhatsApp, mas visibilidad del estado de pedidos en la interfaz de WhatsApp. Este es el **core value** del producto: gestionar ventas por WhatsApp y CRM en un solo lugar con datos sincronizados.

**Removido del alcance:** Integracion Shopify (sera fase separada)

</domain>

<decisions>
## Implementation Decisions

### Modelo de tags (3 tipos)

1. **Tags de contacto** - Estado del cliente (Recompra, VIP, Cliente, Moroso)
   - Se aplican al contacto directamente
   - Se muestran en WhatsApp y pedidos como "heredados"
   - Representan comportamiento/estado del cliente

2. **Tags de conversacion** - Estado del chat (Interesado, Cotizando, Queja)
   - Se aplican a la conversacion especifica
   - NO se propagan al contacto
   - Nueva tabla: `conversation_tags`

3. **Tags de pedido** - Estado del pedido (Urgente, Cambio, Devolucion)
   - Ya existe: `order_tags`
   - Independiente de contacto y conversacion

### Configuracion de tags a nivel workspace

- Cada tag se puede marcar como aplicable a: WhatsApp, Pedidos, o Ambos
- Nuevo campo en tabla `tags`: `applies_to: 'whatsapp' | 'orders' | 'both'`
- Tags de contacto siempre visibles en ambos contextos

### Indicadores de pedido en WhatsApp

**Lista de conversaciones (badge):**
- Emoji agrupado por fase del pedido:
  - Pendiente info (Falta info, Falta confirmar): icono de edicion/espera
  - Confirmado (Confirmado, Por despachar): check
  - En transito (Despachado, En reparto, Novedad): camion
  - Perdido (Perdido, Devuelto): X roja
  - Ganado: se quita indicador, contacto se marca como "Cliente"
- Multiples pedidos: emojis apilados, max 2-3, luego "+N"

**Panel lateral (ContactPanel):**
- Stage exacto del pedido con color del stage
- Debajo de "Pedidos recientes" o "Ultimo pedido activo"

### Notificaciones automaticas

- NO se envian mensajes automaticos al cambiar stage (eso es automatizacion futura)
- Solo se actualiza la UI

### Consistencia de datos

- **Merge automatico** en conflictos de tags (agregar de ambos lados)
- **Realtime sync** via Supabase Realtime para cambios instantaneos
- Contacto muestra historial/resumen de tags de sus conversaciones y pedidos

### Claude's Discretion

- Emojis exactos para cada fase de pedido
- Implementacion tecnica del merge automatico
- Optimizacion de queries para realtime

</decisions>

<specifics>
## Specific Ideas

- Cuando pedido llega a "Ganado", el contacto debe recibir tag "Cliente" automaticamente
- El indicador de pedido en lista de conversaciones debe ser lo mas pequeno/sutil posible
- El sistema de automatizaciones para notificaciones es un modulo futuro separado

</specifics>

<deferred>
## Deferred Ideas

- **Integracion Shopify** - Sera fase separada (Phase 11+) con configuracion completa de eventos, mapeo de campos, pipeline destino
- **Modulo de automatizaciones** - Para notificaciones automaticas por cambio de stage, robots de respuesta, etc.

</deferred>

---

*Phase: 09-crm-whatsapp-sync*
*Context gathered: 2026-02-03*
