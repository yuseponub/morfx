# Phase 11: Shopify Integration - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Sincronización automática de pedidos desde Shopify a MorfX. Cuando se crea un pedido en Shopify, el sistema recibe el webhook, identifica/crea el contacto, y crea el pedido en MorfX con los productos mapeados.

**Fuera de alcance:** Notificaciones automáticas al cliente por WhatsApp (será módulo de automatizaciones CRM->WhatsApp en fase futura).

</domain>

<decisions>
## Implementation Decisions

### Configuración de conexión
- **Método:** API Key manual (admin copia credenciales desde Shopify)
- **Ubicación:** Nueva sección `/settings/integraciones`
- **Permisos:** Solo Owner puede configurar/desconectar
- **Validación:** Test de conexión obligatorio al guardar (llamada de prueba a Shopify API)

### Mapeo de datos
- **Pipeline destino:** Configurable por el admin (elige pipeline y etapa inicial)
- **Identificación de contacto:**
  1. Primero buscar por teléfono (normalizado E.164)
  2. Si no encuentra, matching inteligente por nombre + ciudad (fonético, similitud)
  3. Si encuentra posible match por nombre+ciudad, alertar a agentes para verificación manual
  4. Esta lógica de matching inteligente es toggle on/off configurable
- **Campos del pedido:** Mapeo configurable - mostrar campos disponibles de Shopify API y permitir al admin elegir cuáles importar
- **Productos:** Matching configurable - puede ser por SKU, nombre, o valor (no solo SKU)

### Manejo de duplicados
- **Webhook duplicado:** Ignorar silenciosamente si Shopify Order ID ya existe en MorfX
- **Referencia Shopify:** Guardar shopify_order_id internamente para deduplicación, con opción de mostrarlo en UI si se desea

### Notificaciones y feedback
- **Estado de sync:** Visible en página de integraciones (último sync, pedidos importados hoy, errores recientes)
- **Manejo de errores:**
  1. Reintentar automáticamente si falla
  2. Notificar al Owner si el error persiste
  3. Si falla definitivamente, alertas adicionales para revisión de fondo
- **Notificación al cliente:** Diferido a fase de automatizaciones CRM->WhatsApp

### Claude's Discretion
- Diseño exacto de la UI de configuración
- Algoritmo específico de matching fonético (Soundex, Metaphone, etc.)
- Intervalo de reintentos para webhooks fallidos
- Formato del log de sincronización

</decisions>

<specifics>
## Specific Ideas

- El matching inteligente de contactos debe ser "super inteligente" - manejo fonético, similitudes, etc.
- Si encuentra match por nombre+ciudad, no auto-asignar sino alertar a humanos para confirmar
- Todo debe ser muy configurable: campos a importar, criterio de matching de productos, toggle de matching inteligente

</specifics>

<deferred>
## Deferred Ideas

- **Notificaciones automáticas al cliente por WhatsApp** cuando llega pedido - será módulo de automatizaciones CRM->WhatsApp
- **Sync bidireccional** (cambios en MorfX → Shopify) - fase futura
- **Importar productos desde Shopify** - puede agregarse después

</deferred>

---

*Phase: 11-shopify-integration*
*Context gathered: 2026-02-04*
