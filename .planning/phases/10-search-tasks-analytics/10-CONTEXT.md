# Phase 10: Search, Tasks & Analytics - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega tres capacidades para completar el MVP:
1. **Búsqueda global** — Encontrar contactos, pedidos y conversaciones desde un solo lugar
2. **Sistema de tareas** — Crear, asignar y dar seguimiento a tareas vinculadas a entidades
3. **Dashboard de métricas** — Visualizar KPIs de ventas (solo admin)

</domain>

<decisions>
## Implementation Decisions

### Búsqueda global
- Ubicación: **Debajo del selector de workspace** en el sidebar
- Atajo de teclado: Cmd+K / Ctrl+K para abrir
- Resultados muestran: **Preview compacto** (icono + nombre + dato clave)
  - Contactos: nombre, teléfono
  - Pedidos: número, cliente, monto
  - Conversaciones: nombre, último mensaje
- Filtros: **Tabs por tipo** (Todos | Contactos | Pedidos | Chats)
- Navegación con teclado entre resultados

### Sistema de tareas
- Creación: **Botón contextual** desde contacto, pedido o chat → abre modal
- Campos de tarea (extendido):
  - Título (obligatorio)
  - Descripción (opcional)
  - Fecha límite (configurable si es obligatoria)
  - Prioridad (configurable si se muestra)
  - Asignado a (configurable si es obligatorio)
  - Entidad vinculada (contacto/pedido/chat)
  - Estado: pendiente/completada
- Subtareas: **Opción configurable**, deshabilitado por default
- Notificaciones: **Badge en sidebar** (icono campana) con contador de tareas próximas/vencidas
- Vista principal: **Página /tareas** con lista filtrable por estado, fecha, entidad, asignado
- Configuración en: **/settings/tareas**
  - Definir qué campos son obligatorios
  - Crear tipos de tarea personalizados (Llamada, Seguimiento, Cobro, etc.)
  - Configurar recordatorios (1h antes, 1 día antes, etc.)
  - Habilitar/deshabilitar subtareas

### Dashboard de métricas
- Acceso: Solo **admin/owner** del workspace
- Ubicación: **Página /analytics** (sección principal en sidebar)
- Métricas de ventas:
  - Total de pedidos
  - Valor total
  - Tasa de conversión
  - Ticket promedio
- Visualización: **Cards con números grandes arriba + gráficos de tendencia abajo**
- Períodos: **Presets comunes** (Hoy, 7 días, 30 días, Este mes, Personalizado)

### Navegación y experiencia
- Orden del sidebar: **CRM > WhatsApp > Tareas > Analytics > Settings**
- Búsqueda global: Debajo del workspace selector, siempre visible
- Badge de tareas: En el ítem "Tareas" del sidebar
- Analytics: Oculto para agentes (solo admin/owner ve la opción)
- Home del agente: **Redirige a /crm/pedidos** al entrar
- Home del admin: También /crm/pedidos (consistente)

### Claude's Discretion
- Diseño exacto del modal de búsqueda
- Animaciones y transiciones
- Colores y estilos de los gráficos
- Skeleton loaders durante carga
- Manejo de estados vacíos

</decisions>

<specifics>
## Specific Ideas

- Búsqueda tipo Linear/Notion con Cmd+K pero ubicada en sidebar, no header
- Badge de notificación de tareas similar al contador de mensajes no leídos
- Dashboard inspirado en analytics de e-commerce: foco en métricas de conversión y valor

</specifics>

<deferred>
## Deferred Ideas

- Métricas de WhatsApp (tiempo de respuesta, mensajes enviados) — fase futura
- Notificaciones por email de tareas — fase futura
- Dashboard para agentes con sus propias métricas — fase futura
- Exportar métricas a CSV/PDF — fase futura

</deferred>

---

*Phase: 10-search-tasks-analytics*
*Context gathered: 2026-02-03*
