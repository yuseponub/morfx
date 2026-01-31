# Phase 7: WhatsApp Core - Context

**Gathered:** 2026-01-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Receive and send WhatsApp messages through 360dialog. Users view an inbox of conversations, read message history, and send messages within the 24-hour window. Conversations link to contacts by phone number.

**Out of scope (Phase 8):** Templates management, conversation assignment rules, quick replies, usage/cost tracking.

</domain>

<decisions>
## Implementation Decisions

### Layout del Inbox
- Split-view: lista de conversaciones a la izquierda, chat en el centro, panel de info colapsable a la derecha
- Ordenamiento por defecto: último mensaje (más reciente arriba)
- Filtros completos: Todos, No leídos, Ventana cerrada, Por tags, Asignados a mí, Sin asignar
- Búsqueda fuzzy inteligente (como Fuse.js en CRM) que busca en:
  - Nombre/teléfono del contacto
  - Contenido de los mensajes
- Info en cada item de lista: nombre/teléfono, preview del último mensaje, hora, badge de no leídos, tags del contacto
- Acciones rápidas: Marcar leído, Archivar, Asignar, Agregar tag, Abrir contacto en CRM

### Indicador de Ventana 24h
- NO mostrar nada cuando la ventana está abierta (>2h restantes)
- Mostrar advertencia cuando falten <2h para cerrar
- Mostrar "Solo templates" cuando está cerrada
- Objetivo: no saturar la UI cuando todo está bien, solo alertar cuando hay que actuar

### Notificaciones
- Todas las opciones disponibles pero configurables por usuario en Settings:
  - Badge + contador en pestaña (siempre activo)
  - Sonido al recibir mensaje (toggle, default ON)
  - Push notifications del navegador (toggle, default OFF)

### Vista de Conversación
- Estilo visual moderno/limpio (no estilo WhatsApp clásico)
- Burbujas con colores del tema (primary para enviados, muted para recibidos)
- Fondo con patrón sutil de formas geométricas "morf" o fórmulas matemáticas (muy tenue, casi imperceptible)
- Media inline con preview: imágenes/videos se ven directo, click para ampliar. Documentos muestran nombre + icono
- Header estilo Callbell: limpio con botones para cada acción
  - Nombre del contacto + indicador de ventana 24h
  - Botones: asignar, tags, ver pedido (si tiene), abrir en CRM
- Panel derecho colapsable con:
  - Info del contacto (teléfono, dirección, ciudad, tags)
  - Historial de pedidos resumido (últimos 3-5 con estado, valor, fecha)
  - Botón "Crear pedido"

### Envío de Mensajes
- Campo de texto expandible + botón enviar + adjuntar + emojis + botón templates
- Enter envía mensaje, Shift+Enter para nueva línea
- Adjuntos: imágenes, videos, documentos, audio (completo desde Phase 7)
- Cuando ventana cerrada: deshabilitar input, mostrar "Ventana cerrada" y botón para seleccionar template

### Vinculación con Contactos
- Auto-vincular por teléfono si el número coincide con contacto existente
- Números nuevos: mostrar como desconocido (no crear contacto automático por default)
- Opción en settings: auto-crear contacto (OFF por default)
- Flujo normal: contacto se crea cuando se crea el pedido asociado
- Botón "Crear pedido" en panel que abre formulario con contacto pre-seleccionado (o lo crea si no existe)

### Claude's Discretion
- Implementación específica de la búsqueda fuzzy
- Diseño exacto del patrón de fondo
- Animaciones y transiciones
- Manejo de errores de red/API

</decisions>

<specifics>
## Specific Ideas

- Referencia visual: Callbell (ver screenshot) - layout de 3 columnas, header limpio con botones
- El patrón de fondo debe ser muy sutil con formas geométricas o fórmulas matemáticas (branding "morf")
- La búsqueda debe ser "super inteligente" como la del CRM (Fuse.js fuzzy)
- El contacto se crea cuando se crea el pedido, no antes (a menos que settings diga lo contrario)

</specifics>

<deferred>
## Deferred Ideas

- Templates management → Phase 8
- Conversation assignment rules → Phase 8
- Quick replies → Phase 8
- Usage tracking y dashboard de costos → Phase 8
- Múltiples números de WhatsApp por workspace → Future phase

</deferred>

---

*Phase: 07-whatsapp-core*
*Context gathered: 2026-01-30*
